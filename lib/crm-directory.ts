// ── Tipos de dominio ──────────────────────────────────────────────────────────────────────
// Helper PURO de filtro/búsqueda del directorio de negocios (ADM-01). Sin DB ni React: el RSC trae
// todas las filas y el cliente filtra en memoria (bajo volumen, un operador). Los suspendidos NUNCA
// se ocultan en 'todos' (Pitfall 4).
export type DirectoryRow = {
  id: string
  name: string
  slug: string
  email: string | null
  plan: string
  plan_status: string
  trial_ends_at: string | null
}

// Tabs del directorio (UI-SPEC): 'todos' incluye TODO (suspendidos visibles); el resto acota por estado.
export type DirectoryTab = 'todos' | 'activos' | 'trial' | 'suspendidos' | 'churn'

export type DirectoryFilter = {
  query: string
  tab: DirectoryTab
}

// Estados que cuentan como churn (pago fallido derivado de plan_status, D-10).
function esChurn(planStatus: string): boolean {
  return planStatus === 'cancelled' || planStatus === 'expired'
}

function matchesTab(row: DirectoryRow, tab: DirectoryTab): boolean {
  switch (tab) {
    case 'todos':
      return true // incluye suspendidos — nunca un default que los esconda
    case 'activos':
      return row.plan_status === 'active'
    case 'trial':
      return row.plan_status === 'trial'
    case 'suspendidos':
      return row.plan_status === 'suspended'
    case 'churn':
      return esChurn(row.plan_status)
    default:
      return true
  }
}

// Búsqueda case-insensitive sobre nombre, email y slug.
function matchesQuery(row: DirectoryRow, q: string): boolean {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const haystack = [row.name, row.email ?? '', row.slug].join(' ').toLowerCase()
  return haystack.includes(needle)
}

/**
 * Filtra el directorio por tab + búsqueda. Ambos filtros se combinan (la búsqueda se aplica
 * dentro del tab). 'todos' incluye suspendidos (ADM-01).
 */
export function filterBusinesses(rows: DirectoryRow[], filter: DirectoryFilter): DirectoryRow[] {
  return rows.filter((row) => matchesTab(row, filter.tab) && matchesQuery(row, filter.query))
}
