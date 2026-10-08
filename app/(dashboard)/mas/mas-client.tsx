'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  // Guard de salida del panel: si la pantalla actual tiene cambios sin guardar, cada fila de acá
  // pregunta antes de navegar en vez de descartarlos en silencio. Sin provider devuelve siempre
  // false ⇒ nunca bloquea. Ver components/dashboard/unsaved-changes-guard.tsx.
  const requestNavigation = useNavigationGuard()

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
            {/* Eyebrow verbatim del sidebar, con UN solo cambio: el `id`. Sigue siendo `<p>` y no
                un encabezado — así Más y el sidebar se ven y se leen igual, y la agrupación se
                expresa por `aria-labelledby` en vez de por nivel de heading.
                ⚠ La expresión del `id` se escribe inline en los DOS extremos del vínculo (acá y en
                el `aria-labelledby` de arriba) y eso es contrato, no estilo: con el prefijo
                centralizado en un helper, el único modo de falla que importa —el `id` puesto en un
                extremo y no en el otro— se vuelve invisible para cualquier barrido estático. */}
            <p
              id={`mas-grupo-${slugDeGrupo(group.section)}`}
              className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground"
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
      </nav>
    </div>
  )
}
