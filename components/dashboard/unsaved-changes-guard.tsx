'use client'

// ── Guard de salida compartido del panel: la mitad que /web dejó explícitamente afuera ───────────
//
// El editor CMS (`app/(dashboard)/web/web-client.tsx`) ya tiene su `beforeunload` y su cabecera
// documenta que la navegación INTERNA del panel NO queda interceptada — un click en "Turnos" con el
// borrador sucio lo descarta sin preguntar — porque interceptar la nav del App Router "es no-trivial".
// Este archivo resuelve esa mitad y la deja compartida. Lo pidió el uso real: el dueño cambió la
// duración del turno en Agenda, se fue del panel y perdió el cambio.
//
// CÓMO se intercepta (verificado contra la versión instalada, Next 16.2.7, no de memoria): con la
// prop `onNavigate` del `<Link>` del App Router — `node_modules/next/dist/client/app-dir/link.d.ts:170`,
// cuyo evento es `{ preventDefault: () => void }` y NADA más (no es un evento de React: no trae
// `currentTarget` ni `href`, por eso el destino se pasa a mano). Cancelar con `preventDefault()`
// cancela la navegación.
//
// Lo que `onNavigate` NO dispara, y está BIEN que no dispare: Ctrl/Cmd+click (abre pestaña nueva ⇒
// la página con cambios no se pierde), URLs externas, y links con `download`. Un `onClick` a mano
// dispararía en los tres casos y habría que filtrarlos.
//
// EL BOTÓN ATRÁS **SÍ** ESTÁ CUBIERTO desde el quick 261006-flm (NAV-10), y la mitad de este
// docblock que decía lo contrario era mitad verdadera y mitad caduca:
//   · VERDADERO y medido: no hay ninguna API para CANCELAR el atrás. Next 16.2.7 no expone bloqueo
//     de navegación para `popstate`, el evento llega `cancelable: false`, y la Navigation API tampoco
//     sirve (el atrás del usuario llega `cancelable: false, userInitiated: true`).
//   · CADUCO: que el truco de la entrada falsa "desincronice el historial del router" es FALSO en
//     este repo. Next PRESERVA a propósito el custom history state en el back/forward
//     (`preserveCustomHistoryState: true` en su camino de traverse) y su `pushState` parcheado
//     despacha la sincronización del router. Y `lib/overlay-history.ts` corre exactamente ese truco
//     en producción sobre 39 overlays, verificado en celular real.
// ⇒ El atrás no se cancela: SE ABSORBE con una entrada propia. La mecánica vive en
// `lib/dirty-history.ts`, se engancha abajo en `useUnsavedChanges`, y su docblock tiene el detalle.
//
// ⚠ POR QUÉ EL DIÁLOGO DE ACÁ NO USA EL WRAPPER `Dialog` DE `components/ui/dialog.tsx` Y ES EL ÚNICO
// DEL PANEL QUE NO LO USA. Ese wrapper engancha `useOverlayHistory`, o sea que cada diálogo del panel
// EMPUJA SU PROPIA ENTRADA de historial para que el atrás lo cierre. Este diálogo es el que existe
// PRECISAMENTE porque el atrás ya fue absorbido por el sentinel de cambios sin guardar: si además
// empujara una entrada, habría DOS absorbentes apilados y los dos competirían por escribir y
// consumir el mismo lugar —su `back()` de limpieza y nuestro re-empuje corren en el MISMO commit— y
// la continuación de "Salir sin guardar" tendría que contar entradas que no controla. Con el sentinel
// como único absorbente, el atrás apretado con este diálogo abierto se absorbe otra vez y el diálogo
// SIGUE preguntando, que es lo correcto cuando hay cambios para perder. Cero diferencia visual: el
// `Root` de Base UI no renderiza ningún nodo, y el contenido, las clases y la copy son los mismos.
//
// MOBILE: el drawer del sidebar se cierra en el `onClick` del link, o sea ANTES de que este guard
// cancele la navegación. El diálogo aparece con el drawer ya cerrado. Aceptado.
//
// ALCANCE: el guard sólo se arma cuando una página llama `useUnsavedChanges`, y hoy lo hacen DOS:
// Agenda (`app/(dashboard)/agenda/agenda-client.tsx`) y el editor de la web
// (`app/(dashboard)/web/web-client.tsx`). O sea que el atrás frena en `/agenda` **y** en `/web` —
// deseable y declarado: las dos pantallas pierden trabajo real si se sale sin guardar, y las dos
// derivan su bandera de una comparación contra lo guardado. Extenderlo a /servicios, /negocio o
// /settings sigue siendo una línea por pantalla y una decisión aparte.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { decideNavigation, leaveNavigationPlan, type LeaveNavMode } from '@/lib/unsaved-changes'
import { isDirtyOwnedEntry, useDirtyHistory } from '@/lib/dirty-history'
import {
  PANEL_MORE,
  isExitSentinelOwnedEntry,
  panelBranchPlan,
  panelNavMode,
  panelUnderRoute,
  type PanelBranchPlan,
} from '@/lib/panel-history'
import { runBranchNavigation, type BranchNavigate } from '@/lib/panel-branch'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// `href: null` = "sin destino conocido": es el atrás del navegador, que no lo trae (NAV-10). Esa
// variante SIEMPRE viaja con `proceed`, porque el único que sabe completar el gesto es quien absorbió
// la entrada del historial.
type PendingNavigation = { href: string | null; proceed?: () => void }

type GuardApi = {
  // La llama la PÁGINA (vía useUnsavedChanges) para sincronizar su bandera sucia.
  setDirty: (dirty: boolean) => void
  // La llama el NAV, y también el sentinel del atrás con `href: null`. Devuelve true si BLOQUEÓ (el
  // call-site tiene que cancelar su navegación).
  requestNavigation: (href: string | null, proceed?: () => void) => boolean
  // "Hay una salida confirmada EN CURSO". Lo lee `useUnsavedChanges` para apagarle la bandera al
  // sentinel y que sea ÉL quien consuma su entrada — el primer paso de la continuación de NAV-11.
  leaving: boolean
}

// Default no-op: fuera del provider el guard NUNCA bloquea. Mismo criterio que el DEFAULT de
// `lib/use-terminology.tsx` — un consumidor sin provider sigue funcionando, sólo que sin guard.
const DEFAULT: GuardApi = { setDirty: () => {}, requestNavigation: () => false, leaving: false }

const UnsavedChangesContext = createContext<GuardApi>(DEFAULT)

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  // La bandera sucia va en un REF, no en estado. Este provider envuelve al sidebar Y a la página
  // entera: si fuera estado, cada encendido/apagado re-renderizaría el panel completo para nada. El
  // ref se lee en el momento del click, así que siempre está fresco.
  const dirtyRef = useRef(false)
  // Esto SÍ es estado: es lo que abre el diálogo.
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  // ── La salida en curso (NAV-11, segunda vuelta) ───────────────────────────────────────────────
  // `leaving` es ESTADO y no un ref porque lo tiene que VER el sentinel (abajo, en
  // `useUnsavedChanges`): apagarle su bandera sucia es lo que hace que `lib/dirty-history.ts` consuma
  // su PROPIA entrada, con su propia guarda de marca. Este archivo no toca el historial por su
  // cuenta: hacerlo sería un segundo `back()` sin guarda, que es la cicatriz 2 del repo.
  // Se enciende en `confirmLeave` y se apaga en `setDirty(false)`. Su ÚNICO trabajo es disparar el
  // consumo, que ocurre en el commit inmediato: de la navegación que viene después no participa.
  const [leaving, setLeaving] = useState(false)
  // El destino de esa salida, con la pantalla DESDE la que se pidió. Ref y no estado: lo lee el
  // listener del `popstate` del consumo, que necesita el valor fresco y no re-suscribirse por él.
  //
  // ⚠ **YA NO GUARDA EL MODO, Y ESO ES EL CAMBIO MEDIDO DE ESTE PLAN.** El plan de la rama **no se
  // puede decidir en el momento del click** cuando hay un sentinel de cambios sin guardar arriba:
  // su entrada lleva sólo `{ frjDirty }`, así que la marca de la rama —que sigue viva en la entrada
  // de la sección de abajo— **no es legible**. Medido en el escenario **E-8** de
  // `.planning/debug/pila-de-dos-niveles-medida.md`: `null` con el sentinel arriba y `/mas` después
  // de consumirlo. Así que lo que se guarda es **el destino**, y el plan se **re-deriva** en el
  // `popstate` del consumo, con la entrada de la sección a la vista. No es un mecanismo nuevo: es la
  // forma que `branchSecondStep` (`lib/panel-branch.ts`) ya tiene por el mismo motivo.
  const leaveTargetRef = useRef<{ href: string; to: string; from: string } | null>(null)
  // Y la navegación ya PEDIDA por el `popstate` del consumo, esperando un commit para ejecutarse (el
  // por qué está en `completarSalida`).
  const [leaveNow, setLeaveNow] = useState<{ href: string; mode: LeaveNavMode } | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  const setDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
    // Acá se apaga la bandera de "salida en curso": una pantalla avisa `false` cuando se desmonta
    // (su cleanup) o cuando ya no tiene nada que perder, y en los dos casos el consumo del sentinel
    // —lo único que esa bandera dispara— ya ocurrió en el commit del click.
    //
    // ⚠ LO QUE ACÁ **NO** SE TOCA, Y ES LA LECCIÓN MEDIDA: el destino de la salida. El `back()` del
    // consumo es una navegación same-route, y MEDIDO contra la app real eso puede hacer que la
    // pantalla reporte `dirty: false` (vuelve a montar contra los datos del servidor) ANTES de que
    // llegue el `popstate`. Borrar el destino acá dejaba la salida a medio camino: el sentinel
    // consumido y la navegación nunca disparada — el dueño se quedaba en Agenda.
    if (!dirty) setLeaving(false)
  }, [])

  const requestNavigation = useCallback(
    (href: string | null, proceed?: () => void) => {
      // El "qué decidir" NO se reimplementa acá: vive en el helper puro y testeado, incluida la regla
      // del destino desconocido (`href: null` = el atrás del navegador).
      if (decideNavigation({ dirty: dirtyRef.current, href, currentPath: pathname }) === 'allow') return false
      // Un pedido nuevo PISA al anterior, y es lo correcto: si el dueño tocó "Finanzas" en el menú y
      // después apretó atrás, el gesto vigente es el atrás. Las dos lecturas coinciden en lo único
      // que importa — la navegación del link queda cancelada igual.
      setPending({ href, proceed })
      return true
    },
    [pathname],
  )

  // ── Las dos navegaciones, y por qué son DOS ───────────────────────────────────────────────────
  // La inmediata se usa cuando no hay sentinel: el destino se navega en el acto, desde el click, que
  // es lo que este archivo ya hacía y está verificado. La DIFERIDA deja la navegación pedida en
  // estado para que la ejecute el efecto de abajo, y es obligatoria adentro del `popstate`: ahí el
  // router de Next está procesando SU traverse y un `router.replace` pedido en ese momento se llama,
  // no escribe nada y el dueño se queda donde estaba (medido contra la app real).
  const navegarYa = useCallback<BranchNavigate>(
    (href, mode) => {
      if (mode === 'replace') router.replace(href)
      else router.push(href)
    },
    [router],
  )
  // ⚠ La diferida **no** se extrae a un callback con nombre a propósito: se arma **inline en
  // `completarSalida`**, porque la auditoría de fuente de `test/dirty-history.test.ts` (caso `(i)`)
  // recorta ese handler y exige ver ahí el pedido en estado y **ninguna** llamada al router. Un
  // `setLeaveNow` escondido detrás de un callback declarado arriba cumple la intención pero deja el
  // candado midiendo nada — y ese candado es el que impide que alguien "simplifique" esto navegando
  // desde adentro del evento, que está medido como roto.

  // El plan de la RAMA, con los dos hechos leídos del estado que se le pasa.
  //
  // ⚠ El hecho de la rama se computa comparando la marca **contra la ruta de Más**, y no preguntando
  // "¿hay marca?": es lo que hace que escritorio no se entere **por construcción** (criterio 6). En
  // escritorio nada navega a Más ⇒ la marca nunca dice Más ⇒ el hecho es falso ⇒ la decisión cae en
  // las ramas de siempre, sin ningún chequeo de viewport en el medio. Es el mismo cómputo que hace
  // `usePanelBranch` en la barra, con una sola diferencia deliberada: el sentinel de salida se
  // pregunta por **dueño** y no por id, porque este archivo **no es** su dueño — sólo necesita saber
  // si la entrada de arriba es una absorbente de salida.
  const calcularPlanDeRama = useCallback(
    (estado: unknown, from: string, to: string): PanelBranchPlan =>
      panelBranchPlan({
        from,
        to,
        masDebajo: panelUnderRoute(estado) === PANEL_MORE,
        holdsExitSentinel: isExitSentinelOwnedEntry(estado),
      }),
    [],
  )

  // ── El ejecutor del plan de la rama: UN solo lugar, y exhaustivo sobre el tipo ─────────────────
  // ⚠ Los tres planes que toquetean la pila se **delegan al mismo ejecutor que usa la barra**
  // (`runBranchNavigation`) y no se reimplementan acá: una sola forma, no un segundo dialecto. Y es
  // también lo que mantiene la disciplina de este archivo — **ningún** retroceso propio: el consumo
  // lo hace cada dueño sobre SU marca, con su propia guarda.
  const ejecutarPlanDeRama = useCallback(
    ({
      plan,
      href,
      from,
      to,
      navegar,
    }: {
      plan: PanelBranchPlan
      href: string
      from: string
      to: string
      navegar: BranchNavigate
    }) => {
      switch (plan) {
        // Los dos modos de siempre. Van con el href COMPLETO: si el link traía query o hash, es lo
        // que el dueño pidió.
        case 'push':
        case 'replace':
          navegar(href, plan)
          return
        // Subir, colapsar y no hacer nada. Van con la RUTA y no con el href, porque el segundo paso
        // del colapso compara el destino contra la marca de la entrada de abajo, que es una ruta —
        // es el mismo valor que la barra le pasa al ejecutor.
        case 'up':
        case 'collapse-then-replace':
        case 'none':
          if (runBranchNavigation({ plan, to, navigate: navegar })) return
          // Se negó (marca perdida, o entrada de otro dueño): la degradación segura es navegar con
          // la regla de rutas. Quedarse sin hacer nada dejaría el gesto del dueño MUERTO después de
          // que ya aceptó descartar su trabajo, que es el peor resultado de todo este archivo.
          navegar(href, panelNavMode({ from, to }))
          return
        default: {
          // Un plan nuevo en la rama sin decidir qué hace acá NO COMPILA. Es el mismo molde de
          // `panelHistoryAction` con sus causas, y es el candado contra que la salida caiga por un
          // camino por defecto que nadie eligió.
          const _exhaustivo: never = plan
          return _exhaustivo
        }
      }
    },
    [],
  )

  // POR QUÉ `proceed` y no sólo el href: el logout no es un push. Es desloguear y DESPUÉS navegar.
  // Un guard que al confirmar empujara `/login` sin haber llamado a signOut() dejaría la sesión viva
  // y el proxy rebotaría al dashboard — falsa impresión de haber cerrado sesión. Con la continuación,
  // cada call-site declara qué significa "seguir" para él. El atrás del navegador usa ese mismo
  // mecanismo por otro motivo: su `popstate` no trae destino, así que no hay href que empujar y la
  // continuación la aporta quien absorbió la entrada (`lib/dirty-history.ts`).
  //
  // Sin `proceed` el destino se navega acá, y CÓMO entra en el historial no se decide en este
  // archivo: lo decide `leaveNavigationPlan` sobre la **política de la rama de Más**
  // (`panelBranchPlan`, la MISMA que consume la barra inferior) más la pregunta de si hay un sentinel
  // arriba del stack. Las TRES mitades están justificadas en el docblock de `leaveNavigationPlan`;
  // acá alcanza con no re-decidir nada.
  //
  // ⚠ **Por qué ya no es `panelNavMode` a secas, que es el cambio del criterio 4:** con Más en el
  // medio, la regla de rutas sola deja "Salir sin guardar" aterrizando con la política de **un**
  // nivel. El caso está **vivo**: las dos únicas pantallas con guarda son `/agenda` —destino de la
  // barra— y **`/web`, que es sección de la rama de Más**. `panelNavMode` sigue usándose, pero
  // **sólo como la degradación segura** de arriba, cuando un retroceso guardado se niega.
  //
  // NUNCA `redirect()`: lanza NEXT_REDIRECT y dispara un toast espurio (precedente del CRM).
  function confirmLeave() {
    const nav = pending
    if (!nav) return
    // Apagar la bandera ANTES de ejecutar la continuación: si no, la navegación volvería a pasar por
    // acá.
    dirtyRef.current = false
    setPending(null)
    if (nav.proceed) { nav.proceed(); return }
    // Defensa de forma: la variante sin destino siempre trae `proceed`, así que esto no debería
    // ocurrir — y si ocurriera, no hay nada honesto que navegar.
    if (nav.href === null) return
    const destino = nav.href.split(/[?#]/)[0]
    // Los hechos se re-verifican EN EL MOMENTO del click y no al abrir el diálogo: entre las dos
    // cosas pudo haber una escritura ajena (el `replace` del sidebar, el `replaceState` crudo de
    // Agenda) que se llevó el sentinel o borró la marca. Es la misma guarda que
    // `lib/overlay-history.ts` pone antes de cada `back()`, por la misma razón: operar sobre una
    // entrada que ya no es nuestra expulsa al dueño.
    const estado: unknown = window.history.state
    const planDeRama = calcularPlanDeRama(estado, pathname, destino)
    const plan = leaveNavigationPlan({
      holdsSentinel: isDirtyOwnedEntry(estado),
      sectionMode: planDeRama,
    })
    // ⚠ "¿Hay que consumir primero?" se LEE del contrato, no se re-decide acá: sin sentinel el plan
    // vuelve TAL CUAL, y con sentinel vuelve con el prefijo de consumo. Comparar contra el plan de la
    // rama es la forma de preguntárselo sin parsear la cadena — y si mañana el contrato cambia su
    // regla, este archivo la sigue sin tocarse.
    if (plan === planDeRama) {
      // Sin sentinel el plan se ejecuta EN EL ACTO, con la navegación inmediata.
      ejecutarPlanDeRama({ plan: planDeRama, href: nav.href, from: pathname, to: destino, navegar: navegarYa })
      return
    }
    // Con sentinel hay que consumirlo PRIMERO (si no, el reemplazo cae sobre el sentinel y la entrada
    // de la sección queda abajo: el atrás vuelve a la sección que el dueño acaba de dejar, que es el
    // fallo que reportó en la UAT). Y el consumo NO se hace acá: se APAGA la bandera del sentinel y
    // lo consume su propio módulo, con su guarda de marca. **El RESTO del plan** —no sólo la
    // navegación— se encadena desde el `popstate` de ese consumo, NUNCA en este mismo tick:
    // `history.back()` es asíncrono y encadenarlo a mano está medido como roto (la navegación se
    // pierde). Y el plan se **re-deriva** ahí, que es el único momento en que la marca de la rama
    // vuelve a ser legible (E-8).
    leaveTargetRef.current = { href: nav.href, to: destino, from: pathname }
    // ⚠ EL LISTENER SE ENGANCHA ACÁ, EN EL CLICK, Y NO EN UN EFECTO. MEDIDO contra la app real: el
    // `back()` del consumo es una navegación same-route y puede hacer que la pantalla vuelva a
    // montar limpia, lo que re-renderiza al provider en el medio. Un listener que dependa de un
    // efecto (y de que la bandera siga encendida cuando ese efecto corre) se pierde el `popstate` y
    // la salida queda a medias: sentinel consumido y el dueño todavía en Agenda. Enganchado en el
    // gesto, el segundo paso no depende de ningún orden de renders.
    window.addEventListener('popstate', completarSalida, { once: true })
    setLeaving(true)
  }

  // ── Segundo paso de la continuación: navegar cuando el sentinel YA se consumió ────────────────
  // One-shot (`{ once: true }`), así que no hace falta desengancharlo: se consume solo.
  function completarSalida() {
    const target = leaveTargetRef.current
    leaveTargetRef.current = null
    // Sin destino no hay nada que completar: el pop no es nuestro, o ya navegamos.
    if (!target) return
    // Y sólo se completa si seguimos en la pantalla que se estaba dejando. Si el dueño ya salió por
    // otro camino, este `popstate` no es el del consumo y navegar lo mandaría a un destino viejo.
    if (window.location.pathname !== target.from) return
    // ⚠ ACÁ SE RE-DERIVA EL PLAN DE LA RAMA, Y ES EL ÚNICO MOMENTO EN QUE SE PUEDE (medido, E-8).
    // El sentinel de cambios sin guardar ya se consumió, así que estamos parados sobre la entrada de
    // la SECCIÓN y su marca volvió a ser legible. Decidirlo en el click habría dado `masDebajo:
    // false` ⇒ la regla 0 ⇒ la política de UN nivel: "Salir sin guardar" desde `/web` hacia Más
    // aterrizaría en Más-encima-de-`/web` y el atrás volvería a `/web`, que es exactamente el defecto
    // que el criterio 4 prohíbe y que el quick `261006-iey` ya tuvo que arreglar una vez.
    const plan = calcularPlanDeRama(window.history.state, target.from, target.to)
    // ⚠ NO SE NAVEGA ACÁ DENTRO, Y ESTO ESTÁ MEDIDO CONTRA LA APP REAL. Dentro del `popstate` el
    // router de Next está procesando SU traverse (su listener corre antes que el nuestro y escribe el
    // `replaceState` de la entrada a la que volvimos): un `router.replace` pedido ahí mismo se llama,
    // no escribe NADA y el dueño se queda en Agenda. Por eso la navegación va **diferida** y la
    // ejecuta el efecto de abajo, o sea desde un commit de React y no desde el medio del evento.
    // Diferirla no reintroduce la trampa del encadenamiento: el `back()` ya ocurrió —estamos en su
    // `popstate`—, así que no hay ninguna navegación asíncrona pendiente que pueda perderse.
    //
    // Y los RETROCESOS del resto del plan (subir, colapsar) SÍ se piden desde acá adentro: un
    // retroceso no es una navegación del router. Es el precedente de `dirtyLeavePlan`
    // (`lib/dirty-history.ts:253-270`) y está medido en E-5 y en E-8.
    ejecutarPlanDeRama({
      plan,
      href: target.href,
      from: target.from,
      to: target.to,
      navegar: (href, mode) => setLeaveNow({ href, mode }),
    })
  }

  // El segundo paso, ejecutado desde un commit. No hace falta limpiar `leaveNow`: con las mismas
  // deps el efecto no vuelve a correr, y una salida nueva trae un objeto nuevo.
  useEffect(() => {
    if (!leaveNow) return
    if (leaveNow.mode === 'replace') router.replace(leaveNow.href)
    else router.push(leaveNow.href)
  }, [leaveNow, router])

  return (
    <UnsavedChangesContext.Provider value={{ setDirty, requestNavigation, leaving }}>
      {children}

      {/* El diálogo lo renderiza el PROVIDER, no cada página: es lo que permite que el sidebar
          (hermano de la página, no descendiente) dispare el aviso sin conocer nada del editor de
          horarios. Molde, copy y foco espejan el diálogo de descartar de /web (web-client.tsx:658).
          `onOpenChange(false)` — Escape, click afuera y el botón × — CANCELA la navegación, o sea
          equivale a "Seguir editando". Que la salida por descarte del modal sea la opción SEGURA y
          nunca la destructiva es una decisión, no una casualidad. */}
      <DialogPrimitive.Root open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Salir sin guardar?</DialogTitle>
            <DialogDescription>
              Tenés cambios en los horarios que todavía no guardaste. Si salís ahora, se pierden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" autoFocus className="min-h-11" onClick={() => setPending(null)}>
              Seguir editando
            </Button>
            <Button variant="destructive" className="min-h-11" onClick={confirmLeave}>
              Salir sin guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </DialogPrimitive.Root>
    </UnsavedChangesContext.Provider>
  )
}

// Lo llama la PÁGINA. Hace DOS cosas con la misma bandera:
//
//   1) La sincroniza con el provider y la APAGA al desmontarse. Ese cleanup no es un detalle: es lo
//      que garantiza que al salir de la pantalla el panel entero vuelva a navegar sin fricción y que
//      ninguna bandera quede prendida para siempre.
//   2) Engancha el sentinel de historial que absorbe el botón ATRÁS (NAV-10). Va acá y no en cada
//      pantalla por el mismo criterio que el punto 1: las pantallas ya declaran su bandera en un solo
//      lugar, así que las TRES vías de pérdida (navegación interna, recarga, atrás) se cubren desde
//      la misma línea y no puede quedar una pantalla con dos de las tres.
//
// ⚠ EL EMPUJE OCURRE EN LA TRANSICIÓN LIMPIO→SUCIO, y con `dirty` derivado de una COMPARACIÓN contra
// lo guardado (NAV-09) eso pasa UNA vez y por un cambio real. Con el latch por gesto que había antes
// —ocho mutadores prendiéndolo, uno de ellos abrir o cerrar un día— cada gesto reflejo habría pedido
// confirmación: ahí el arreglo era peor que el bug, y por eso NAV-09 fue primero.
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty, requestNavigation, leaving } = useContext(UnsavedChangesContext)
  useEffect(() => {
    setDirty(dirty)
    return () => setDirty(false)
  }, [dirty, setDirty])
  // `requestNavigation` devuelve si BLOQUEÓ; el sentinel lo usa para saber si alguien va a mostrar el
  // aviso (fuera del provider nadie lo hace, y ahí el atrás tiene que completarse en vez de quedar
  // muerto). `null` como destino es la variante del atrás: no hay href que ofrecer.
  //
  // ⚠ LO QUE SE LE PASA ES `dirty && !leaving`, Y ES EL PRIMER PASO DE LA CONTINUACIÓN DE NAV-11.
  // Cuando el dueño ya confirmó salir hacia un destino conocido, el sentinel tiene que sacarse de
  // encima ANTES de que se navegue (si no, el reemplazo cae sobre él y la sección que se deja queda
  // debajo del destino: el atrás vuelve ahí en vez del dashboard). Apagarle la bandera es lo que
  // dispara su propio consumo —`dirtyHistoryAction` devuelve `'consume'`— con su guarda de marca y su
  // listener ya desenganchado en el mismo commit, así que ese `popstate` no se puede leer como un
  // atrás nuevo ni pedir el aviso en bucle. Este archivo nunca llama a `history.back()`: el único
  // dueño de la entrada sigue siendo quien la empujó.
  useDirtyHistory({
    dirty: dirty && !leaving,
    confirm: (leave) => requestNavigation(null, leave),
  })
}

// Lo llama el NAV. Devuelve `requestNavigation(href, proceed?)` → true si bloqueó.
export function useNavigationGuard() {
  return useContext(UnsavedChangesContext).requestNavigation
}
