// Set FIJO de widgets que existen en el dashboard. La IA recomienda un subconjunto
// de esta lista (elige de acá, no inventa). El negocio puede persistir su selección
// en businesses.dashboard_widgets; si es null/vacío, se muestran todos.
export interface DashboardWidget {
  id: string
  label: string
  description: string
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'today_appointments', label: 'Turnos de hoy', description: 'Contador de turnos agendados para hoy' },
  { id: 'week_appointments', label: 'Turnos de la semana', description: 'Turnos de los últimos 7 días' },
  { id: 'month_revenue', label: 'Ingresos del mes', description: 'Facturación acumulada del mes' },
  { id: 'total_clients', label: 'Total de clientes', description: 'Cantidad total de clientes / pacientes' },
  { id: 'today_schedule', label: 'Agenda de hoy', description: 'Lista detallada de los turnos del día' },
  { id: 'upcoming_appointments', label: 'Próximos turnos', description: 'Turnos de los próximos 7 días, con navegación por semana' },
]

export const DASHBOARD_WIDGET_IDS = DASHBOARD_WIDGETS.map(w => w.id)

// Filtra a ids válidos del catálogo, sin duplicados. Devuelve null si la entrada no
// es un array utilizable, para que el caller use el default (mostrar todo).
export function sanitizeWidgetIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null
  const valid = ids.filter((id): id is string => typeof id === 'string' && DASHBOARD_WIDGET_IDS.includes(id))
  const unique = [...new Set(valid)]
  return unique.length > 0 ? unique : null
}
