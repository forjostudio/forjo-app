// ── Tipos y filtros del timeline unificado (TL-01, D-11/D-13) ────────────────────────────────────
// Módulo PURO (sin DB ni React ni 'use server'): el RSC lee la VIEW crm_timeline (Plan 03) y el render
// usa estos tipos/helpers. La VIEW (migración 034) hace UNION ALL de audit_log + notes + tasks con un
// shape común; TimelineRow matchea ese shape exacto.

// kind del evento. 'cambio'|'nota'|'tarea' salen HOY de la VIEW (audit_log/notes/tasks).
// 'mensaje'|'llamada' son kinds FUTUROS (llegan con la Bandeja, D-13): se modelan acá para que los
// filtros del timeline existan desde ya, pero hoy muestran empty state.
export type TimelineKind = 'cambio' | 'nota' | 'tarea' | 'mensaje' | 'llamada'

// Fila del timeline: shape idéntico al de la VIEW crm_timeline en 034.
export type TimelineRow = {
  kind: TimelineKind
  actor_type: string // 'operador' | 'sistema'
  title: string
  body: string | null
  occurred_at: string // ISO; el consumidor ordena por occurred_at desc
  metadata: Record<string, unknown>
  business_id: string | null
}

// Filtros del timeline (UI). 'todo' no filtra; el resto acota por uno o más kinds.
export type TimelineFilter = 'todo' | 'mensajes' | 'llamadas' | 'notas' | 'tareas' | 'cambios'

// Orden y copy de los tabs del filtro (el render los itera tal cual).
export const TIMELINE_FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'mensajes', label: 'Mensajes' },
  { key: 'llamadas', label: 'Llamadas' },
  { key: 'notas', label: 'Notas' },
  { key: 'tareas', label: 'Tareas' },
  { key: 'cambios', label: 'Cambios' },
]

// Mapa kind → filtro al que pertenece (cada evento cae en exactamente un filtro temático).
const KIND_TO_FILTER: Record<TimelineKind, TimelineFilter> = {
  mensaje: 'mensajes',
  llamada: 'llamadas',
  nota: 'notas',
  tarea: 'tareas',
  cambio: 'cambios',
}

/**
 * rowMatchesFilter — true si la fila pertenece al filtro activo. 'todo' acepta cualquier kind.
 */
export function rowMatchesFilter(row: TimelineRow, filter: TimelineFilter): boolean {
  if (filter === 'todo') return true
  return KIND_TO_FILTER[row.kind] === filter
}

// Filtros que en ESTA fase muestran empty state SIEMPRE: Mensajes y Llamadas todavía no tienen fuente
// (llegan con la Bandeja, D-13). El render usa esto para mostrar el placeholder "Próximamente" en vez
// de una lista vacía ambigua.
const EMPTY_STATE_FILTERS: ReadonlySet<TimelineFilter> = new Set<TimelineFilter>(['mensajes', 'llamadas'])

/**
 * filterShowsEmptyState — true si el filtro aún no tiene fuente de datos en esta fase (D-13).
 */
export function filterShowsEmptyState(filter: TimelineFilter): boolean {
  return EMPTY_STATE_FILTERS.has(filter)
}

// Mapa central de etiquetas de acción para la rama 'cambio' del timeline (action codes → copy legible).
// Calca ACTION_LABEL de auditoria-client.tsx + suma los códigos nuevos de Phase 4 (D-12). El render del
// timeline (Plan 03) consume este mapa para no duplicar copy; Plan 03 también lo registra en el visor.
export const ACTION_LABEL: Record<string, string> = {
  // Phase 2/3 (auditoría existente)
  'business.suspend': 'Suspendió negocio',
  'business.reactivate': 'Reactivó negocio',
  'business.activate': 'Activó negocio (pago)',
  'plan.change': 'Cambió plan',
  'plan.price_edit': 'Editó precio',
  'user.impersonate': 'Impersonó negocio',
  'user.impersonate.view': 'Vio ficha (impersonación)',
  'trial.extend': 'Extendió trial',
  'trial.grant': 'Activó trial',
  'addon.toggle': 'Cambió add-on',
  // Phase 4 (pipeline / tags / contenido)
  'deal.create': 'Creó negociación',
  'deal.stage_change': 'Movió de etapa',
  'deal.mark_lost': 'Marcó perdido',
  'deal.won': 'Marcó ganado',
  'lead.convert': 'Convirtió lead',
  'tag.create': 'Creó tag',
  'tag.assign': 'Asignó tag',
  'tag.remove': 'Quitó tag',
  'note.create': 'Creó nota',
  'note.edit': 'Editó nota',
  'note.delete': 'Borró nota',
  'task.create': 'Creó tarea',
  'task.complete': 'Completó tarea',
  // Phase 6 (bandeja / takeover)
  'conversation.takeover': 'Tomó conversación',
  'conversation.release': 'Liberó conversación',
}

/**
 * actionLabel — copy legible de un action code; si no está mapeado, devuelve el code crudo (no inventa).
 */
export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}
