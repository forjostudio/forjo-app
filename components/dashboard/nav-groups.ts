// ── Por qué existe este módulo ──────────────────────────────────────────────────
// Es la fuente ÚNICA del inventario de menú del panel: qué filas existen, en qué orden, bajo qué
// header de sección, y cuáles de ellas expone el rubro del negocio.
//
// `buildNavGroups` nació privada dentro de `components/dashboard/sidebar.tsx` (sin `export`, y en un
// archivo con la directiva de cliente). Mientras el sidebar era el ÚNICO lugar que renderizaba el
// menú eso alcanzaba. Con la barra inferior y la pantalla Más hay TRES consumidores del mismo
// inventario, y con la función privada el segundo y el tercero no tienen más opción que
// REIMPLEMENTAR el filtro por rubro. Ahí está el modo de falla real: el gateo por vertical
// (`canchas` no tiene 'equipo' en su menu ⇒ la fila no aparece bajo GESTIÓN) se preserva POR
// CONSTRUCCIÓN o no se preserva. Dos copias del filtro divergen en silencio, y el síntoma aparece en
// un solo rubro — justo el que nadie prueba.
//
// ── Por qué NO lleva la directiva de componente de cliente ──────────────────────
// Es lógica pura: entra un `Business`, sale un array. La directiva la tienen sus consumidores, que sí
// son de cliente. Sin ella el módulo es importable desde un test de `environment: 'node'` —que es
// como corre Vitest en este repo, sin jsdom— y entonces el inventario de los 4 verticales queda
// afirmable sin montar un árbol de React.
//
// ── Qué NO cambió al mover ──────────────────────────────────────────────────────
// Es un movimiento mecánico: misma lógica, mismos comentarios, y la firma `(business: Business)`
// intacta a propósito. Pasarla a recibir el vertical ya resuelto tocaría el call site del sidebar de
// desktop, que esta fase no toca (MOB-07).

import { Business } from '@/lib/types'
import { resolveVertical } from '@/lib/verticals'
import {
  LayoutDashboard,
  Calendar,
  CalendarClock,
  Users,
  UserCog,
  Store,
  Globe,
  Tag,
  Repeat,
  MapPin,
  BarChart3,
  Settings,
  LucideIcon,
} from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

// ── El agrupado LOCKED ──────────────────────────────────────────────────────────
// Grupos LOCKED del sidebar agrupado (D-02 / UI-SPEC §A). Cada grupo declara las keys de menú
// que le pertenecen, en este orden. El grupo de mensajería del brief queda EXCLUIDO (depende del
// add-on, fuera del milestone). El agrupado se hace acá y NO en lib/verticals.ts: cada key se filtra contra
// resolveVertical(business).menu, así el gating por rubro se preserva automáticamente (ej. canchas no
// tiene 'equipo' en su menu → la fila no aparece bajo GESTIÓN) sin tocar verticals.ts. Un grupo sin
// items sobrevivientes no renderiza nada, ni su header.
export const NAV_GROUPS: { section: string; keys: string[] }[] = [
  { section: 'PANEL', keys: ['dashboard'] },
  { section: 'AGENDA', keys: ['appointments', 'agenda', 'abonos', 'clients', 'patients'] },
  { section: 'GESTIÓN', keys: ['servicios', 'equipo', 'consultorios', 'negocio', 'web'] },
  { section: 'REPORTES', keys: ['finances'] },
  { section: 'AJUSTES', keys: ['settings'] },
]

// ── La resolución por rubro ─────────────────────────────────────────────────────
// Maps each menu key (from the vertical config) to its route + icon. Labels for
// client/patient items come from the vertical terminology so they read correctly
// per rubro ("Pacientes" en salud, "Clientes" en belleza/general).
// Construye el mapa key→item y agrupa contra v.menu: por cada grupo, resuelve sus keys a items
// y descarta las que el vertical no expone (mismo .filter(Boolean) que la lista plana original,
// aplicado por grupo). Devuelve solo los grupos con al menos un item sobreviviente.
export function buildNavGroups(business: Business): { section: string; items: NavItem[] }[] {
  const v = resolveVertical(business)
  const t = v.terminology
  const ITEMS: Record<string, NavItem> = {
    dashboard: { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    appointments: { href: '/appointments', label: t.appointments, icon: Calendar },
    agenda: { href: '/agenda', label: 'Agenda', icon: CalendarClock },
    abonos: { href: '/abonos', label: 'Abonos', icon: Repeat },
    negocio: { href: '/negocio', label: 'Negocio', icon: Store },
    // "Mi web" (→ editor /web, gate has_web_custom decide editor vs upsell). Visible a TODOS los
    // verticales a propósito: es superficie de venta del add-on (D-01), NO se gatea por has_web_custom.
    // Distinto del link flotante "Ver mi página" (ese va al público /[slug] en pestaña nueva).
    web: { href: '/web', label: 'Mi web', icon: Globe },
    servicios: { href: '/servicios', label: t.services, icon: Tag },
    equipo: { href: '/equipo', label: 'Equipo', icon: UserCog },
    consultorios: { href: '/consultorios', label: t.locations, icon: MapPin },
    // ⚠ `clients` y `patients` son DOS keys al MISMO href, y así se quedan: no se deduplican ni se
    // fusionan. Ningún vertical expone las dos a la vez (salud trae 'patients', el resto 'clients'),
    // y cualquier consumidor que quiera restar esta fila del inventario tiene que restar por HREF
    // (4 valores) y no por key (5) — restando por key, "Pacientes" queda duplicado en salud y
    // solamente en salud.
    clients: { href: '/clients', label: t.clients, icon: Users },
    patients: { href: '/clients', label: t.clients, icon: Users },
    finances: { href: '/finances', label: 'Finanzas', icon: BarChart3 },
    settings: { href: '/settings', label: 'Configuración', icon: Settings },
  }
  const menu = new Set(v.menu)
  return NAV_GROUPS
    .map(g => ({
      section: g.section,
      // Solo las keys presentes en el menu del vertical (gating por rubro) y con item definido.
      items: g.keys.filter(k => menu.has(k)).map(k => ITEMS[k]).filter(Boolean),
    }))
    .filter(g => g.items.length > 0)
}
