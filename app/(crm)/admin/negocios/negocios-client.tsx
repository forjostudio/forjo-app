'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Download, Store, Mail, MessageCircle, ChevronRight } from 'lucide-react'
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
import { StatusBadge } from '@/components/crm/status-badge'
import { filterBusinesses, type DirectoryRow, type DirectoryTab } from '@/lib/crm-directory'
import type { PlanPrices, PlanKey } from '@/lib/plan-prices'

/**
 * Directorio de negocios (client) — ADM-01. Calca la mecánica del visor de auditoría
 * (auditoria-client.tsx): FILTERS const, useState query/tab, useMemo, tabla @/components/ui/table,
 * EmptyState, export CSV client-side (rowsToCsv + Blob, sin libs).
 *
 * El filtrado en memoria delega en `filterBusinesses` (lib/crm-directory) — NO se reimplementa.
 * Tab 'Todos' es el DEFAULT e INCLUYE suspendidos (Pitfall 4); el StatusBadge rojo los marca.
 * Cada fila navega a /admin/negocios/{id} y es focusable por teclado (≥44px, focus ring amarillo).
 */

// Fila no sensible que llega del RSC (email del dueño ya resuelto; nunca tokens/secrets).
export type NegocioRow = {
  id: string
  name: string
  slug: string
  ownerEmail: string | null
  whatsapp: string | null
  plan: string
  plan_status: string
  trial_ends_at: string | null
  has_web_custom: boolean
  has_whatsapp: boolean
  created_at: string
}

// Display name de los 3 planes reales (basic/studio/pro → Básico/Estudio/Pro).
const PLAN_LABEL: Record<string, string> = {
  basic: 'Básico',
  studio: 'Estudio',
  pro: 'Pro',
}

function planLabel(plan: string): string {
  return PLAN_LABEL[plan] ?? plan
}

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// Iniciales del negocio para el avatar (primeras 2 palabras).
function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Count de add-ons activos: "2 activos" / "1 activo" / "–".
function addonsLabel(row: NegocioRow): string {
  const n = (row.has_web_custom ? 1 : 0) + (row.has_whatsapp ? 1 : 0)
  if (n === 0) return '–'
  return n === 1 ? '1 activo' : `${n} activos`
}

// MRR de la fila: precio del plan si está active; trial/churn aportan 0 → "–".
function mrrCell(row: NegocioRow, prices: PlanPrices): string {
  if (row.plan_status !== 'active') return '–'
  const price = prices[row.plan as PlanKey]
  return typeof price === 'number' ? arsFormatter.format(price) : '–'
}

// Mapea NegocioRow → DirectoryRow (lo que espera filterBusinesses; email = ownerEmail).
function toDirectoryRow(row: NegocioRow): DirectoryRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    email: row.ownerEmail,
    plan: row.plan,
    plan_status: row.plan_status,
    trial_ends_at: row.trial_ends_at,
  }
}

// Tabs del directorio (UI-SPEC). 'todos' default e INCLUYE suspendidos.
const TABS: { value: DirectoryTab; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'trial', label: 'Trial' },
  { value: 'suspendidos', label: 'Suspendidos' },
  { value: 'churn', label: 'Churn' },
]

// Conteo por tab (live) — se calcula sobre TODAS las filas, no las filtradas.
function tabCount(rows: NegocioRow[], tab: DirectoryTab): number {
  return filterBusinesses(rows.map(toDirectoryRow), { query: '', tab }).length
}

// Exporta las filas YA filtradas a CSV (client-side, RFC-4180 + BOM UTF-8), mismas columnas visibles.
function rowsToCsv(rows: NegocioRow[], prices: PlanPrices): string {
  const headers = ['Negocio', 'Dueño', 'Slug', 'Plan', 'Estado', 'WhatsApp', 'Add-ons', 'MRR']
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const body = rows.map((r) =>
    [
      r.name,
      r.ownerEmail ?? '',
      r.slug,
      planLabel(r.plan),
      r.plan_status,
      r.whatsapp ?? '',
      addonsLabel(r),
      mrrCell(r, prices),
    ]
      .map((c) => esc(String(c)))
      .join(',')
  )
  return [headers.map(esc).join(','), ...body].join('\r\n')
}

export function NegociosClient({
  rows,
  prices,
  loadError,
}: {
  rows: NegocioRow[]
  prices: PlanPrices
  loadError: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<DirectoryTab>('todos')

  const filtered = useMemo(() => {
    const directoryRows = rows.map(toDirectoryRow)
    const matchedIds = new Set(filterBusinesses(directoryRows, { query, tab }).map((r) => r.id))
    return rows.filter((r) => matchedIds.has(r.id))
  }, [rows, query, tab])

  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.value, tabCount(rows, t.value)])) as Record<DirectoryTab, number>,
    [rows]
  )

  function clearFilters() {
    setQuery('')
    setTab('todos')
  }

  function exportCsv() {
    const blob = new Blob(['﻿' + rowsToCsv(filtered, prices)], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `negocios-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Navega a la ficha al activar la fila con teclado (Enter/Space) sin pisar los botones de contacto.
  function onRowKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      router.push(`/admin/negocios/${id}`)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Negocios</h1>

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
            placeholder="Buscar negocio, dueño…"
            aria-label="Buscar negocio, dueño o slug"
            className="pl-8"
          />
        </div>

        <div className="flex items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as DirectoryTab)}>
            <TabsList aria-label="Filtrar por estado">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="data-active:text-primary">
                  {t.label}{' '}
                  <span className="font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                    {counts[t.value]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="gap-1.5"
          >
            <Download className="size-3.5" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Tabla / estados */}
      {loadError ? (
        <EmptyState
          heading="No se pudieron cargar los negocios"
          body="Probá de nuevo o revisá tu conexión. Si el problema sigue, puede ser un permiso de lectura."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          heading="Todavía no hay negocios"
          body="Cuando se registre el primer negocio va a aparecer acá con su plan, estado y contacto."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          heading="Ningún negocio coincide con este filtro."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {['NEGOCIO', 'PLAN', 'ESTADO', 'CONTACTO', 'ADD-ONS', 'MRR'].map((h) => (
                  <TableHead
                    key={h}
                    className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground"
                  >
                    {h}
                  </TableHead>
                ))}
                <TableHead className="w-10" aria-label="Abrir ficha" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  tabIndex={0}
                  onClick={() => router.push(`/admin/negocios/${r.id}`)}
                  onKeyDown={(e) => onRowKeyDown(e, r.id)}
                  aria-label={`Abrir ficha de ${r.name}`}
                  className="h-12 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset hover:bg-muted/50"
                >
                  {/* NEGOCIO: avatar iniciales + nombre (link) + sub-caption mono Dueño · slug */}
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary font-[family-name:var(--font-heading)] text-xs text-foreground"
                        aria-hidden="true"
                      >
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={`/admin/negocios/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
                        >
                          {r.name}
                        </Link>
                        <span className="block truncate font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                          {r.ownerEmail ?? 'Sin dato'} · {r.slug}
                        </span>
                      </span>
                    </span>
                  </TableCell>

                  {/* PLAN */}
                  <TableCell className="text-sm text-foreground">{planLabel(r.plan)}</TableCell>

                  {/* ESTADO */}
                  <TableCell>
                    <StatusBadge planStatus={r.plan_status} />
                  </TableCell>

                  {/* CONTACTO: email (mailto) + WhatsApp (wa.me); ≥44px touch; no propagar el click de fila */}
                  <TableCell>
                    <span className="flex items-center gap-1">
                      {r.ownerEmail ? (
                        <a
                          href={`mailto:${r.ownerEmail}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Enviar email a ${r.name}`}
                          className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        >
                          <Mail className="size-4" />
                        </a>
                      ) : null}
                      {r.whatsapp ? (
                        <a
                          href={`https://wa.me/${r.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Abrir WhatsApp de ${r.name}`}
                          className="inline-flex size-11 items-center justify-center rounded-md transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          style={{ color: 'var(--crm-info)' }}
                        >
                          <MessageCircle className="size-4" />
                        </a>
                      ) : null}
                      {!r.ownerEmail && !r.whatsapp && (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </span>
                  </TableCell>

                  {/* ADD-ONS */}
                  <TableCell className="font-[family-name:var(--font-geist-mono)] text-xs text-muted-foreground">
                    {addonsLabel(r)}
                  </TableCell>

                  {/* MRR */}
                  <TableCell className="text-sm tabular-nums text-foreground">
                    {mrrCell(r, prices)}
                  </TableCell>

                  {/* Chevron → ficha (affordance visible) */}
                  <TableCell className="text-right">
                    <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
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
        <Store className="size-5" />
      </div>
      <h2 className="text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">
        {heading}
      </h2>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
