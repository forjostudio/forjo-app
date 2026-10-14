'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Calendar, CalendarClock, Users, MoreHorizontal, LucideIcon } from 'lucide-react'
import { useTerminology } from '@/lib/use-terminology'
import { useNavigationGuard } from '@/components/dashboard/unsaved-changes-guard'
import { consumeOwnedPanelEntry, panelNavMode } from '@/lib/panel-history'
import { usePanelBranch } from '@/lib/panel-branch'

// ── La barra inferior del panel (MOB-01 / MOB-02 / MOB-07) ──────────────────────
// En mobile el panel no tiene mapa: el dueño tiene que abrir la hamburguesa para saber dónde está y
// a dónde puede ir. Esta barra es ese mapa, siempre a la vista, con los 5 destinos que cubren el
// 90% de lo que hace en el teléfono.
//
// ── Por qué el breakpoint es `lg` y NO el de 768px ──────────────────────────────
// Hoy el sidebar de desktop entra en `lg` (1024px) y abajo de eso hay hamburguesa. La banda
// 768-1023px, entonces, NO tiene sidebar: tiene hamburguesa. Y la hamburguesa se va en el plan
// 02-03. Con un prefijo de 768px esa banda entera se quedaría sin NINGÚN menú — sin forma de
// navegar el panel. `lg:hidden` es exactamente el simétrico del `hidden lg:flex` del sidebar.
//
// ── Por qué el activo no se pinta con el acento de marca ────────────────────────
// Es un número, no un gusto: `--primary` lo elige el negocio y el panel puede renderizar 40
// combinaciones de tema × paleta. En 8 de esas 40 `--primary` NO llega a 3:1 contra `--card` (el
// mínimo absoluto es 2.15:1, modern claro con paleta amber) ⇒ el indicador de "dónde estoy"
// desaparecería justo en los negocios que eligieron ese acento. `--foreground` mide ≥8.94:1 en las
// 40. Es un cambio de token, no de sistema: el activo se comunica por CUATRO canales, tres de ellos
// no-cromáticos (indicador, peso 600, aria-current) para que no dependa de ver un color.
//
// ── Por qué el anillo de foco diverge del patrón del repo ───────────────────────
// El repo usa `focus-visible:ring-ring/50`, pero `--ring` ES `--primary` en los 20 bloques de
// paleta ⇒ el anillo heredaría el mismo problema de contraste de arriba y sería invisible en 8 de
// las 40. Y el `ring-inset` es obligatorio: sin él, el anillo del primer y del último ítem queda
// recortado por el borde de la barra.
//
// ── Por qué el orden del onNavigate es contrato ─────────────────────────────────
// Está abajo, en el único lugar donde importa. En una línea: si el guard de cambios sin guardar no
// se evalúa PRIMERO, el dueño pierde lo que estaba escribiendo sin que nada se lo diga.
//
// ⚠ Cero mutaciones crudas de historial en este archivo: toda escritura en la pila pasa por los
// helpers de `lib/panel-history.ts`, que esta fase NO toca. Son tres módulos los que ya escriben
// ahí y conviven sólo porque cada uno re-verifica su propia marca antes de retroceder; un cuarto
// escritor sin esa disciplina saca al dueño del panel con un gesto que él cree inofensivo.
//
// ── Por qué el toqueteo de la pila de la rama de Más NO vive acá ────────────────
// Por lo de arriba, y no por gusto: `lib/panel-branch.ts` es un hook de `lib/` justamente porque
// este archivo no puede tener ni una escritura directa en la pila —hay un candado estático que lo
// mide en cero—. La barra consume ese hook, le pasa el pathname y una navegación armada con el
// router, y él decide. Y la razón de fondo es la de arriba: son TRES los módulos que ya escriben en
// la misma pila (`panel-history`, `overlay-history`, `dirty-history`) y conviven sólo porque cada
// uno re-verifica su propia marca antes de retroceder. El cuarto escritor entra con esa misma
// disciplina o no entra.
//
// ── Por qué nada cambia visualmente (D-04) ──────────────────────────────────────
// Más NO se ilumina al estar dentro de su rama, no hay un volver-a-Más en el header y no hay
// breadcrumb. El activo se sigue decidiendo por igualdad literal de pathname, en los mismos tres
// lugares de siempre. El riesgo queda declarado, no negado: dos pantallas que se ven igual se
// comportan distinto (en Turnos el atrás cae en Inicio; en Finanzas cae en Más) y nada en pantalla
// lo dice — es un ítem explícito de la UAT, y si el dueño se pierde se agrega después sabiendo que
// hacía falta.

// ── Los 5 destinos ──────────────────────────────────────────────────────────────
// El orden es LITERAL acá y a propósito NO se deriva de `buildNavGroups`: la barra es fija e igual
// en los 4 rubros (los 4 primeros destinos existen en `salud`, `belleza`, `general` y `canchas`), y
// derivarla del menú del vertical la volvería reordenable al tocar un vertical.
// ⚠ La ruta del quinto es `/mas` SIN TILDE: con tilde viajaría percent-encoded (`/m%C3%A1s`) en el
// historial y en `usePathname()`, y el activo se decide por igualdad literal de pathname. La tilde
// vive en el label, no en la URL.
// `label: null` significa "el label sale de la terminología del vertical" (ver LABELS abajo).
type Destino = { href: string; icon: LucideIcon; label: string | null }

const DESTINOS: Destino[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/appointments', icon: Calendar, label: null },
  { href: '/agenda', icon: CalendarClock, label: 'Agenda' },
  { href: '/clients', icon: Users, label: null },
  { href: '/mas', icon: MoreHorizontal, label: 'Más' },
]

export function PanelBottomNav() {
  const pathname = usePathname()
  const t = useTerminology()
  // Guard de salida del panel: si la pantalla actual tiene cambios sin guardar, cada destino de acá
  // pregunta antes de navegar en vez de descartarlos en silencio. Sin provider devuelve siempre
  // false ⇒ nunca bloquea. Ver components/dashboard/unsaved-changes-guard.tsx.
  const requestNavigation = useNavigationGuard()
  const router = useRouter()
  // La rama de Más (D-03 / criterio 2): lo que la política de rutas sola NO puede decidir, porque
  // depende de qué quedó debajo en la pila. El hook se consume UNA sola vez acá —es la única
  // instancia, y eso es lo que impide que haya dos dueños por entrada—. El router se le pasa como
  // callback: el módulo no lo importa, así que puede vivir en `lib/` sin arrastrarlo a su grafo.
  const { handleNavigate } = usePanelBranch({
    pathname,
    navigate: (href, mode) => {
      if (mode === 'replace') router.replace(href)
      else router.push(href)
    },
  })

  // Los labels de las posiciones 2 y 4 salen de la terminología del vertical, no de literales:
  // un negocio de canchas lee "Reservas" y uno de salud lee "Pacientes". Se consume del provider ya
  // montado en (dashboard)/layout.tsx — el vertical NO se re-resuelve en el cliente.
  const LABELS: Record<string, string> = {
    '/appointments': t.appointments,
    '/clients': t.clients,
  }

  return (
    <nav
      aria-label="Navegación principal"
      // Zona segura en los TRES ejes. El inset inferior va como padding del elemento fijo y por
      // DEBAJO de la caja de 56px, para que el `bg-card` PINTE la franja de gestos en vez de dejar
      // un hueco del color del fondo. El lateral es por el landscape con notch, donde el inset vale
      // 44px y sin él el primer y el último ítem quedarían debajo del notch.
      // ⚠ Los tres `env()` llevan el fallback `0px` explícito: en Android el inset vale 0 y sin
      // fallback la expresión no resuelve.
      // z-30 = exactamente la del header de hoy: los overlays (z-40) y los drawers (z-50) la tapan,
      // y así tiene que ser — el atrás cierra el overlay antes de navegar.
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
    >
      <div className="flex h-[var(--panel-nav-h)]">
        {DESTINOS.map(destino => {
          const Icon = destino.icon
          const label = destino.label ?? LABELS[destino.href] ?? ''
          const active = pathname === destino.href
          return (
            <Link
              key={destino.href}
              href={destino.href}
              // La política de historial del panel (NAV-05/NAV-07): el atrás desde cualquier
              // sección cae en el DASHBOARD, nunca en otra sección abierta antes. La barra no
              // decide nada, CONSUME la regla pura de lib/panel-history.ts. Ojo: NO es `replace` a
              // secas, que reemplazaría también la entrada del dashboard y el primer atrás sacaría
              // del panel.
              replace={panelNavMode({ from: pathname, to: destino.href }) === 'replace'}
              // EL ORDEN ES CONTRATO (T-5), y es el mismo del sidebar:
              // 1º el guard de cambios sin guardar. Si bloquea, él se hace cargo del diálogo y acá
              //    no pasa nada más — por eso corta con `return`.
              // 2º NAV-08: tocar la sección en la que YA estás cierra la subsección en vez de
              //    apilarla encima. `history.back()` es ASÍNCRONO: hay que PREVENIR la navegación,
              //    no encadenarla — si dejáramos navegar, el router empujaría su entrada antes de
              //    que el browser procese el pop y volveríamos a enterrar la ficha.
              // 3º la rama de Más: si el paso 2 no se hizo cargo, decide el hook. NUNCA compite con
              //    el 2 — el 2 pide que el destino sea el activo y el 3 que no lo sea (con
              //    `from === to` la política devuelve reemplazar, así que el hook no se hace cargo).
              onNavigate={(e) => {
                if (requestNavigation(destino.href)) { e.preventDefault(); return }
                if (active && consumeOwnedPanelEntry()) e.preventDefault()
                else if (handleNavigate(destino.href)) e.preventDefault()
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // Sin padding vertical: el justify-center centra los 40px de contenido en los 56px
                // de la barra, y así el área táctil es de 75×56 a 375px y 64×56 a 320px (ambas
                // ≥44×44). El tap-highlight del navegador se apaga para que no compita con el
                // active:bg-secondary, que es el feedback táctil real.
                'relative flex flex-1 min-w-0 flex-col items-center justify-center gap-1 px-1',
                'transition-[color,background-color] duration-150 ease-out',
                '[-webkit-tap-highlight-color:transparent]',
                // El hover va envuelto en la media query: en touch un :hover queda pegajoso y deja
                // el ítem resaltado después del toque, como si siguiera siendo el activo.
                '[@media(hover:hover)]:hover:bg-secondary active:bg-secondary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground',
                active ? 'text-foreground' : 'text-[var(--panel-nav-muted)]'
              )}
            >
              {/* El indicador del activo. No se anima entre ítems: aparece y desaparece con el
                  cambio de ruta (animarlo pediría medir posiciones y no agrega información). */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-6 rounded-b-full bg-foreground"
                />
              )}
              <Icon className="w-6 h-6 flex-shrink-0" />
              {/* 11px es una excepción declarada a la regla de no bajar de 16px en mobile: no es
                  texto de cuerpo, es chrome de navegación de una palabra con el icono de 24px como
                  portador primario del significado, y ya hay precedente en el sidebar. Es también el
                  tamaño más grande que NO rompe: a 12px el peor label del sistema ("Pacientes") mide
                  hasta 56.9px según la familia y a 320px el espacio disponible es 56.0px.
                  No se declara familia a propósito: hereda --font-sans, que el negocio elige entre 5
                  familias. Clavarla pondría dos sans distintas a 3px de distancia en la misma
                  pantalla. El truncate se queda aunque hoy nunca se dispare: `business.font` es un
                  string sin tipar, así que un valor nuevo puede entrar sin error de compilación. */}
              <span
                className={cn(
                  'max-w-full truncate text-[11px] leading-[1.1]',
                  active ? 'font-semibold' : 'font-medium'
                )}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
