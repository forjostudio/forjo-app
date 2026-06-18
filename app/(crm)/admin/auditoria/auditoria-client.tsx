'use client'

import { useMemo, useState } from 'react'
import { Search, Download, ScrollText, User, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RiskBadge, type RiskLevel } from '@/components/crm/risk-badge'

// Fila de audit_log tal cual viene de Supabase (snake_case, sin renombrar — convención del proyecto).
export type AuditRow = {
  id: string
  actor_id: string | null
  action: string
  target_type: string
  target_id: string | null
  business_id: string | null
  risk: RiskLevel
  reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ── Helpers de presentación ─────────────────────────────────────────────────

// Zona fija de Argentina (UTC-3, sin DST) — misma constante que lib/google-calendar.ts.
const AR_TZ = 'America/Argentina/Buenos_Aires'

// Formatea created_at como "Hoy · 13:22" / "Ayer · 17:05" / "14 jun · 09:12" en hora AR.
function formatWhen(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('es-AR', {
    timeZone: AR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  // Comparar el día calendario en zona AR (no UTC) para decidir Hoy/Ayer.
  const dayKey = (x: Date) =>
    x.toLocaleDateString('es-AR', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  if (dayKey(d) === dayKey(now)) return `Hoy · ${time}`
  if (dayKey(d) === dayKey(yesterday)) return `Ayer · ${time}`

  const date = d.toLocaleDateString('es-AR', { timeZone: AR_TZ, day: '2-digit', month: 'short' })
  return `${date} · ${time}`
}

// Label legible de la acción. El `action` es un código snake/dot ('business.suspend');
// si no está mapeado, se muestra el código crudo (no se inventa copy).
const ACTION_LABEL: Record<string, string> = {
  'business.suspend': 'Suspendió negocio',
  'business.reactivate': 'Reactivó negocio',
  'plan.change': 'Cambió plan',
  'plan.price_edit': 'Editó precio',
  'user.impersonate': 'Impersonó negocio',
  'trial.extend': 'Extendió trial',
  'addon.toggle': 'Cambió add-on',
}

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action
}

// Actor: en Phase 1 no se resuelve el nombre del actor (no se hace join a auth.users en lectura).
// Se distingue Operador (hay actor_id) vs Sistema (sin actor) por el icono + label.
function ActorCell({ actorId }: { actorId: string | null }) {
  const isSystem = !actorId
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
        aria-hidden="true"
      >
        {isSystem ? <Cpu className="size-3.5" /> : <User className="size-3.5" />}
      </span>
      <span className="text-foreground">{isSystem ? 'Sistema' : 'Operador'}</span>
    </span>
  )
}

const FILTERS = [
  { value: 'todos', label: 'Todos', risk: null },
  { value: 'altos', label: 'Altos', risk: 'alto' as RiskLevel },
  { value: 'medios', label: 'Medios', risk: 'medio' as RiskLevel },
  { value: 'bajos', label: 'Bajos', risk: 'bajo' as RiskLevel },
] as const

type FilterValue = (typeof FILTERS)[number]['value']

// ── Componente ──────────────────────────────────────────────────────────────

export function AuditoriaClient({ rows, loadError }: { rows: AuditRow[]; loadError: boolean }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterValue>('todos')

  const activeRisk = FILTERS.find((f) => f.value === filter)?.risk ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (activeRisk && r.risk !== activeRisk) return false
      if (!q) return true
      // Búsqueda client-side sobre acción (cruda + label), target y motivo.
      const haystack = [
        r.action,
        actionLabel(r.action),
        r.target_type,
        r.target_id ?? '',
        r.reason ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, query, activeRisk])

  function clearFilters() {
    setQuery('')
    setFilter('todos')
  }

  return (
    <div className="space-y-4">
      {/* Controles: búsqueda + filter tabs + exportar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar acción, negocio…"
            aria-label="Buscar en el log de auditoría"
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
            <TabsList aria-label="Filtrar por riesgo">
              {FILTERS.map((f) => (
                <TabsTrigger
                  key={f.value}
                  value={f.value}
                  className="data-active:text-primary"
                >
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Exportar log — placeholder en Phase 1 */}
          <Button variant="outline" size="sm" disabled className="gap-1.5">
            <Download className="size-3.5" />
            Exportar log
          </Button>
        </div>
      </div>

      {/* Tabla / estados */}
      {loadError ? (
        <EmptyState
          heading="No se pudo cargar la auditoría"
          body="Probá de nuevo o revisá tu conexión. Si el problema sigue, puede ser un permiso de lectura."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          heading="Todavía no hay acciones registradas"
          body="Cuando ejecutes una acción sensible (cambiar plan, suspender, impersonar) va a aparecer acá con quién, qué, cuándo y motivo."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          heading="Ninguna acción coincide con este filtro."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {['QUIÉN', 'ACCIÓN', 'NEGOCIO', 'DETALLE', 'MOTIVO', 'CUÁNDO'].map((h) => (
                  <TableHead
                    key={h}
                    className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground"
                  >
                    {h}
                  </TableHead>
                ))}
                <TableHead className="text-right font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
                  RIESGO
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <ActorCell actorId={r.actor_id} />
                  </TableCell>
                  <TableCell className="font-bold text-foreground">{actionLabel(r.action)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.business_id ? (
                      <span className="font-[family-name:var(--font-geist-mono)] text-xs">
                        {r.business_id.slice(0, 8)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-[family-name:var(--font-geist-mono)] text-xs text-muted-foreground">
                    {r.target_type}
                    {r.target_id ? ` · ${r.target_id}` : ''}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {r.reason || '—'}
                  </TableCell>
                  <TableCell className="font-[family-name:var(--font-geist-mono)] text-xs text-muted-foreground">
                    {formatWhen(r.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <RiskBadge risk={r.risk} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function EmptyState({
  heading,
  body,
  action,
}: {
  heading: string
  body?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
      <div
        className="flex size-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
        aria-hidden="true"
      >
        <ScrollText className="size-5" />
      </div>
      <h2 className="text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">
        {heading}
      </h2>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
