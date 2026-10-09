'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, HelpCircle, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Business } from '@/lib/types'
import { getPlanLimits } from '@/lib/plans'
import { buildNavGroups } from '@/components/dashboard/nav-groups'
import { useNavigationGuard } from '@/components/dashboard/unsaved-changes-guard'
import { consumeOwnedPanelEntry, panelNavMode } from '@/lib/panel-history'

// ── La pantalla Más (MOB-03) ────────────────────────────────────────────────────
// Es el quinto destino de la barra inferior y guarda TODO el resto del menú del rubro: lo que no
// entra en los cuatro destinos fijos, más las tres filas de cuenta que hoy sólo viven en el drawer
// hamburguesa que el plan siguiente elimina. Es una RUTA de verdad del route group `(dashboard)` —
// pantalla completa, no panel deslizante— así que hereda el header, el `p-4` y la reserva de alto
// inferior del `<main>`: acá NO se agrega ningún padding inferior propio.
//
// ── Por qué el inventario se DERIVA y no se escribe ─────────────────────────────
// `buildNavGroups(business)` es la misma función que alimenta el sidebar de desktop. Reimplementar
// el filtro por rubro contra `resolveVertical(business).menu` sería la falla real: el gateo se
// preserva POR CONSTRUCCIÓN o no se preserva, y dos copias divergen en silencio — un negocio de
// canchas terminaría viendo "Equipo", una sección que su rubro no tiene. El síntoma aparecería en un
// solo rubro, justo el que nadie prueba.
//
// ── Por qué la resta de la barra es por HREF y no por key ───────────────────────
// Son CINCO keys que colapsan a CUATRO destinos: `clients` y `patients` apuntan al MISMO `/clients`
// (ver el comentario de `nav-groups.ts`). Restando por key hacen falta cinco strings y el que escribe
// "los cuatro destinos" deja `Pacientes` duplicado — 9 filas en vez de 8 — y SOLAMENTE en `salud`,
// el único vertical que usa esa key. Restando por href el bug es estructuralmente imposible.
//
// ── Por qué el título va oculto ─────────────────────────────────────────────────
// El header superior del panel ya nombra la pantalla EN PANTALLA, así que un título visible sería el
// mismo texto dos veces a 56px de distancia. Pero la página necesita su encabezado de nivel 1 igual,
// porque es la única entrada de la jerarquía: va visualmente oculto con `sr-only`, patrón ya
// establecido en el repo (cinco pantallas del CRM lo usan por este mismo motivo). Y Más NO introduce
// encabezados de nivel 2 ni 3: los eyebrows de grupo siguen siendo `<p>`, verbatim del sidebar.
//
// ── Por qué los grupos son role="group" y no <section> ──────────────────────────
// Un `<section>` con nombre accesible se vuelve LANDMARK, y cinco landmarks nuevos en una pantalla
// son ruido para quien navega por landmarks. `role="group"` es justamente "conjunto de objetos que no
// va en el resumen de la página". El nombre del grupo sale del eyebrow por `aria-labelledby` ⇒ el
// `<p>` TIENE que llevar el `id` al que apunta: un `aria-labelledby` roto no tira error de consola,
// no rompe el build y no se ve en la UAT visual — deja el grupo sin nombre, en silencio.
//
// ── Por qué los dos landmarks de navegación necesitan nombres distintos ─────────
// Estando en `/mas` coexisten la barra inferior (`Navegación principal`) y esta lista (`Secciones`).
// Con el mismo nombre el lector de pantalla anuncia "navegación" dos veces y no se sabe cuál es cuál.
//
// ⚠ Cero mutaciones crudas de historial en este archivo: toda escritura en la pila pasa por los
// helpers de `lib/panel-history.ts`, que esta fase NO toca.

// ── Los cuatro hrefs que ya están en la barra ───────────────────────────────────
// Se declara UNA sola vez. Son CUATRO HREFS y no cinco keys a propósito (ver la cabecera): los dos
// items `clients` / `patients` colapsan al mismo destino, así que restar por href deduplica por
// construcción.
const EN_LA_BARRA = new Set(['/dashboard', '/appointments', '/agenda', '/clients'])

// ── La anatomía de la fila ──────────────────────────────────────────────────────
// 48px de alto mínimo (≥44 del mínimo táctil), icono de 20px —el sidebar usa 16px, que en una
// pantalla completa de 375px con filas de 48px queda chico; 20px es ≠ de los 24px de la barra a
// propósito: barra y lista son dos jerarquías distintas— y label a 14px/500 en `--foreground`.
// Sin separador entre filas (la jerarquía la dan los eyebrows) y sin chevron: todas las filas
// navegan, diez chevrons idénticos no informan nada.
// Estados: el hover va envuelto en la media query porque en touch un `:hover` queda pegajoso y deja
// la fila resaltada después del toque; el feedback táctil real es el `active:`. El anillo de foco va
// SIN `ring-inset` (las filas no tocan el borde) y con `--foreground`, que es el único token que
// mide ≥8.94:1 en las 40 combinaciones de tema × paleta que el panel puede renderizar.
// No hay estado activo: una fila de Más nunca es la ruta actual (estás en `/mas`), el activo lo
// muestra la barra.
const FILA =
  'flex items-center gap-3 min-h-12 px-3 py-3 rounded-lg text-sm font-medium text-foreground transition-colors duration-150 [-webkit-tap-highlight-color:transparent] [@media(hover:hover)]:hover:bg-secondary active:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground'

// ── El eyebrow de grupo ─────────────────────────────────────────────────────────
// Se declara UNA sola vez porque la pantalla lo usa en sus DOS extremos (los grupos derivados de
// `NAV_GROUPS` y el grupo `CUENTA` escrito a mano): con el string duplicado literal, un arreglo a
// medias —uno de los dos extremos con el color viejo— es posible y no se ve en ningún diff.
// El color es `--panel-nav-muted` y NO `--muted-foreground`: el eyebrow se lee sobre `--background`
// (vive en la página, no en la barra) y ese par mide 3.02:1 en spa claro y 4.15:1 en modern claro
// ⇒ falla AA en 10 de las 40 combinaciones de tema × modo × paleta que el panel puede renderizar.
// El token nuevo lo sube a 5.02:1 en el peor caso de las 40, que es justo el número que la tabla de
// contraste del contrato publica para este elemento. El sidebar de desktop NO se toca: su defecto
// es deuda preexistente declarada aparte.
// ⚠ En el valor arbitrario no puede haber NI UN espacio: con un espacio adentro la clase no se
// genera, Tailwind no avisa y el color simplemente no se aplica.
const EYEBROW =
  'px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-[var(--panel-nav-muted)]'

// El `id` del grupo se DERIVA del `section` de `NAV_GROUPS` (minúsculas, sin tilde: `GESTIÓN` →
// `gestion`), nunca se inventa ni se numera: así un grupo nuevo en el inventario trae su `id` solo.
function slugDeGrupo(section: string): string {
  return section
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function MasClient({ business }: { business: Business }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  // Guard de salida del panel: si la pantalla actual tiene cambios sin guardar, cada fila de acá
  // pregunta antes de navegar en vez de descartarlos en silencio. Sin provider devuelve siempre
  // false ⇒ nunca bloquea. Ver components/dashboard/unsaved-changes-guard.tsx.
  const requestNavigation = useNavigationGuard()

  // El cierre de sesión espeja el del sidebar y le SUMA la rama que el análogo no tiene: si falla, se
  // avisa. En el sidebar el silencio es tolerable porque hay otras salidas; acá, en mobile, esta es
  // la ÚNICA forma de salir, y un fallo mudo deja al dueño creyendo que cerró sesión mientras la
  // sesión sigue viva — en un teléfono que puede estar compartido. Si falla NO se navega: mandar a
  // /login sin haber cerrado la sesión haría que el proxy rebote al dashboard.
  async function handleLogout() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch {
      toast.error('No pudimos cerrar la sesión. Probá de nuevo.')
      return
    }
    router.push('/login')
    router.refresh()
  }

  // El inventario del rubro MENOS lo que ya está en la barra. El `.filter` final mantiene la
  // invariante después de restar; el que ya trae `buildNavGroups` es el que hace desaparecer el
  // grupo `PANEL` ENTERO —su único item es el dashboard, que está en la barra— sin una línea nueva:
  // ningún grupo vacío renderiza su header.
  const grupos = buildNavGroups(business)
    .map(g => ({ ...g, items: g.items.filter(i => !EN_LA_BARRA.has(i.href)) }))
    .filter(g => g.items.length > 0)

  return (
    <div>
      <h1 className="sr-only">Más</h1>

      {/* ── El bloque de identidad ────────────────────────────────────────────────
          Espeja el header del sidebar, con cuatro divergencias DELIBERADAS del markup original:
          40×40 en vez de 36 (acá es el elemento dominante de la pantalla), `rounded-lg` también en
          el fallback (el sidebar le pone un radio distinto que al logo), nombre a 16px/600 y
          segunda línea a 14px/400. El contenedor cambia de header a TARJETA (`bg-card` + borde +
          radio) porque en Más no encabeza nada: es una tarjeta más.
          El fallback CONSERVA el acento de marca y la fuente de títulos: es el único uso del acento
          de toda la superficie y tiene que verse idéntico al de desktop.
          Va FUERA del `<nav>` (no es un destino) y NO es clickeable (no lo es en el sidebar
          tampoco; convertirlo en acceso a Configuración sería una decisión de producto nueva).
          Es el único lugar de la app en mobile donde se ve el PLAN del negocio. */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary text-primary-foreground font-[family-name:var(--font-heading)] font-black text-base flex-shrink-0">
              {business.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* El `min-w-0` es lo que habilita el `truncate` de los hijos dentro del flex: sin él el
              nombre largo empuja el layout en vez de cortarse. */}
          <div className="min-w-0">
            <p className="text-base font-semibold truncate">{business.name}</p>
            <p className="text-sm text-muted-foreground truncate">
              {business.plan_status === 'active'
                ? `Plan ${getPlanLimits(business.plan || 'basic').name}`
                : (business.type || '')}
            </p>
          </div>
        </div>
      </div>

      {/* El nombre del landmark es DISTINTO del de la barra a propósito (ver la cabecera).
          El `space-y-2` completa los 24px que el contrato pide entre grupos: el eyebrow se copia
          verbatim del sidebar —cero clase, cero píxel— y ya trae 16px de `pt-4`, así que los 8px de
          acá son el resto, no un valor suelto. */}
      <nav aria-label="Secciones" className="mt-4 space-y-2">
        {grupos.map(group => (
          <div key={group.section} role="group" aria-labelledby={`mas-grupo-${slugDeGrupo(group.section)}`}>
            {/* Eyebrow del sidebar con DOS cambios: el `id` y el token de color (ver `EYEBROW`, que
                explica por qué acá no puede ser `--muted-foreground`). Sigue siendo `<p>` y no
                un encabezado — así Más y el sidebar se ven y se leen igual, y la agrupación se
                expresa por `aria-labelledby` en vez de por nivel de heading.
                ⚠ La expresión del `id` se escribe inline en los DOS extremos del vínculo (acá y en
                el `aria-labelledby` de arriba) y eso es contrato, no estilo: con el prefijo
                centralizado en un helper, el único modo de falla que importa —el `id` puesto en un
                extremo y no en el otro— se vuelve invisible para cualquier barrido estático. */}
            <p
              id={`mas-grupo-${slugDeGrupo(group.section)}`}
              className={EYEBROW}
            >
              {group.section}
            </p>
            <div>
              {group.items.map(item => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    // El MISMO cableado de historial que los ítems de la barra y que los links del
                    // sidebar: es el dialecto único del panel, no una opción. Si una fila no
                    // compartiera la política, salir de Clientes por ella dejaría Clientes debajo y
                    // el atrás caería ahí en vez de en el dashboard.
                    // Ojo: NO es `replace` a secas, que reemplazaría también la entrada del
                    // dashboard y el primer atrás sacaría del panel.
                    replace={panelNavMode({ from: pathname, to: item.href }) === 'replace'}
                    // EL ORDEN ES CONTRATO:
                    // 1º el guard de cambios sin guardar. Si bloquea, él se hace cargo del diálogo
                    //    y acá no pasa nada más — por eso corta con `return`.
                    // 2º tocar la sección en la que YA estás cierra la subsección en vez de
                    //    apilarla encima. `history.back()` es ASÍNCRONO: hay que PREVENIR la
                    //    navegación, no encadenarla.
                    onNavigate={(e) => {
                      if (requestNavigation(item.href)) { e.preventDefault(); return }
                      if (pathname === item.href && consumeOwnedPanelEntry()) e.preventDefault()
                    }}
                    className={FILA}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {/* ── "Ver mi página", suelta y pegada a AJUSTES ───────────────────────────
            ESPEJA el sidebar de desktop, donde es un `<a>` suelto después del `.map()` y dentro del
            `<nav>` (`sidebar.tsx:123-131`). Como AJUSTES es el último grupo del menú, queda
            visualmente debajo de Configuración, que es exactamente como se lee en desktop.
            ⚠ REVISIÓN DE DISEÑO DE LA UAT (2026-10-09). Antes las tres filas de abajo vivían juntas
            en un grupo `CUENTA` inventado por el UI-SPEC (T-6), que resolvía "no perder ninguna
            fila" agrupando —porque en el sidebar viven en DOS lugares y quien copia sólo el footer
            se olvida de ésta—. El dueño vio en el teléfono que ese remedio costó CONSISTENCIA:
            mobile no se leía igual que desktop. Se conserva el motivo original (la fila sigue
            presente, no se pierde) y se adopta el orden del sidebar.
            Dos cosas la separan del resto: es la ÚNICA fila sin cableado de historial (no navega
            dentro del panel), y es la ÚNICA excepción a la regla de "sin chevron" — lleva un icono
            de 16px a la derecha porque abrir una pestaña nueva es información que el usuario no
            puede inferir. La variable de la URL pública ya existe y ya es pública. */}
        <a
          href={`${process.env.NEXT_PUBLIC_APP_URL}/${business.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className={FILA}
        >
          <ExternalLink className="w-5 h-5 flex-shrink-0" />
          <span className="truncate">Ver mi página</span>
          <ExternalLink className="w-4 h-4 flex-shrink-0 ml-auto text-muted-foreground" aria-hidden="true" />
        </a>

        {/* ── El par de cuenta, detrás de la línea divisoria ───────────────────────
            Misma separación que el footer del sidebar (`sidebar.tsx:135`, `border-t border-border`).
            ⚠ `aria-label` y NO `aria-labelledby`: el grupo ya no tiene eyebrow visible que lo
            nombre, pero SÍ conserva nombre accesible. Desktop deja este par en un `<div>` pelado,
            sin nombre; acá se decidió explícitamente NO copiar esa parte (UAT 2026-10-09): la
            paridad visual que pidió el dueño no exige empeorar lo que un lector de pantalla
            anuncia. Es el único lugar donde mobile se aparta de desktop, y es a favor.
            Las dos filas son obligatorias: el drawer hamburguesa que las tenía ya no existe ⇒ sin
            ellas el dueño se queda sin manera de cerrar sesión desde el celular. */}
        <div role="group" aria-label="Cuenta" className="mt-2 pt-2 border-t border-border">
          {/* La Ayuda es una ruta más del panel y entra por el MISMO menú, así que se rige por la
              misma regla que las filas de arriba: si no compartiera la política, salir de Clientes
              por Ayuda dejaría Clientes debajo y el atrás caería ahí en vez de en el dashboard.
              El consumo de la entrada propia hoy es un no-op acá (Ayuda no tiene subsecciones) y
              se deja igual para que no haya DOS formas de escribir esta fila. */}
          <Link
            href="/ayuda"
            replace={panelNavMode({ from: pathname, to: '/ayuda' }) === 'replace'}
            onNavigate={(e) => {
              if (requestNavigation('/ayuda')) { e.preventDefault(); return }
              if (pathname === '/ayuda' && consumeOwnedPanelEntry()) e.preventDefault()
            }}
            className={FILA}
          >
            <HelpCircle className="w-5 h-5 flex-shrink-0" />
            <span className="truncate">Ayuda</span>
          </Link>

          {/* El cierre de sesión pasa por el guard con su PROPIA continuación: acá "seguir"
              significa desloguear y DESPUÉS navegar. Si el guard empujara /login sin haber cerrado
              la sesión, la sesión quedaría viva y el proxy rebotaría al dashboard. Si el guard
              bloquea, el diálogo se encarga; si no bloquea, se ejecuta el handler.
              Sin rojo y sin confirmación propia: el sidebar no lo pinta de rojo, el token de
              peligro del sistema no se usa en ninguna parte de esta superficie, y lo que
              diferencia a esta fila es su posición última detrás de la divisoria, no el color. */}
          <button
            onClick={() => { if (!requestNavigation('/login', () => void handleLogout())) void handleLogout() }}
            className={`${FILA} w-full text-left`}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="truncate">Cerrar sesión</span>
          </button>
        </div>
      </nav>

      {/* La firma, reusada verbatim del footer del sidebar, SVG incluido: la marca F de cuatro
          formas, con el primer trazo en `currentColor` para adaptarse a claro/oscuro.
          Va FUERA del `<nav>` por la misma razón que el bloque de identidad: no es un destino.
          Queda alcanzable al final del scroll gracias a la reserva de alto del `<main>`, que ya
          existe: esta pantalla NO agrega padding inferior propio. */}
      <div className="flex items-center gap-2 px-3 pt-4 text-xs text-muted-foreground">
        <svg viewBox="0 0 64 80" className="w-3 h-[0.95rem]" aria-hidden="true">
          <rect x="6" y="6" width="14" height="68" fill="currentColor" />
          <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
          <path d="M20 34 L50 34 L36 48 L20 48 Z" fill="#2a5fa5" />
          <circle cx="56" cy="13" r="6" fill="#f4c543" />
        </svg>
        <span>
          hecho con{' '}
          <a
            href="https://www.forjo.studio"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            <span className="font-semibold text-foreground font-[family-name:var(--font-heading)]">Forjo</span> Studio
          </a>
        </span>
      </div>
    </div>
  )
}
