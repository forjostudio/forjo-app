'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { TagChip } from '@/components/crm/tag-chip'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { STAGES, stageTotals, pipelineSummary, type StageKey } from '@/lib/crm-pipeline'
import { filterByTags } from '@/lib/crm-tags'
import { createDeal, moveStage, markLost } from '@/app/(crm)/admin/_pipeline-actions'

/**
 * Tablero de pipeline (client) — PIPE-01/02/04. Reproduce el mock 02-pipeline.png:
 *   - Header: resumen "$X abiertos · $Y ganados · arrastrá las tarjetas…" + CTA "+ Nuevo deal".
 *   - Fila de chips de tags (toggle) que filtra las tarjetas con semántica OR (filterByTags, D-09).
 *   - 5 columnas derivadas de STAGES, con el total $ de cada columna (stageTotals) y sus tarjetas.
 *   - Tarjeta: contacto + valor ARS + tags + "Marcar perdido" (ConfirmDialog → markLost).
 *   - DnD NATIVO HTML5 (cero deps): drag de la tarjeta + drop en la columna → moveStage optimista;
 *     si la action falla, se REVIERTE el estado local + toast (Pitfall 6: no mentir).
 */

export type PipelineDeal = {
  id: string
  leadId: string
  contactName: string
  contactEmail: string | null
  valueArs: number
  stage: string
  status: string
  businessId: string | null
  expectedCloseDate: string | null
  tagIds: string[]
}

export type PipelineTag = { id: string; label: string; color: string }

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function PipelineClient({
  deals: initialDeals,
  tags,
  loadError,
}: {
  deals: PipelineDeal[]
  tags: PipelineTag[]
  loadError: boolean
}) {
  // Estado local de los deals: el DnD lo muta OPTIMISTAMENTE y lo revierte si la action falla.
  const [deals, setDeals] = useState<PipelineDeal[]>(initialDeals)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null)

  // Diálogo "Nuevo deal".
  const [newDealOpen, setNewDealOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ leadName: string; leadEmail: string; valueArs: string; stage: StageKey }>(
    { leadName: '', leadEmail: '', valueArs: '0', stage: 'lead' },
  )

  // "Marcar perdido": deal seleccionado para el ConfirmDialog (con motivo obligatorio).
  const [lostDeal, setLostDeal] = useState<PipelineDeal | null>(null)

  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  // Filtro de tags OR (D-09): espejar negocios-client (useMemo + matchedIds).
  const filtered = useMemo(() => {
    const matchedIds = new Set(filterByTags(deals.map((d) => ({ id: d.id, tagIds: d.tagIds })), selectedTagIds).map((r) => r.id))
    return deals.filter((d) => matchedIds.has(d.id))
  }, [deals, selectedTagIds])

  const summary = useMemo(
    () => pipelineSummary(deals.map((d) => ({ stage: d.stage as StageKey, value_ars: d.valueArs, status: d.status as 'open' | 'won' | 'lost' }))),
    [deals],
  )

  const totals = useMemo(
    () => stageTotals(filtered.map((d) => ({ stage: d.stage as StageKey, value_ars: d.valueArs, status: d.status as 'open' | 'won' | 'lost' }))),
    [filtered],
  )

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]))
  }

  // ── DnD nativo ──────────────────────────────────────────────────────────────────────────────
  async function handleDrop(targetStage: StageKey) {
    const dealId = draggingId
    setDraggingId(null)
    setDragOverStage(null)
    if (!dealId) return

    const moved = deals.find((d) => d.id === dealId)
    if (!moved || moved.stage === targetStage) return

    const prevStage = moved.stage
    // Optimista: mover ya en el estado local.
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: targetStage } : d)))

    try {
      await moveStage({ dealId, stage: targetStage })
    } catch {
      // Revertir (no mentir, Pitfall 6) + toast.
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: prevStage } : d)))
      toast.error('No se pudo mover la tarjeta. Probá de nuevo.')
    }
  }

  // ── Nuevo deal ────────────────────────────────────────────────────────────────────────────────
  async function handleCreateDeal() {
    if (!form.leadName.trim()) return
    setCreating(true)
    try {
      await createDeal({
        leadName: form.leadName.trim(),
        leadEmail: form.leadEmail.trim() || undefined,
        valueArs: Number.parseInt(form.valueArs || '0', 10) || 0,
        stage: form.stage,
      })
      toast.success('Deal creado.')
      setNewDealOpen(false)
      setForm({ leadName: '', leadEmail: '', valueArs: '0', stage: 'lead' })
      // revalidatePath del server refresca los datos en el próximo render del RSC.
    } catch {
      toast.error('No se pudo crear el deal. Revisá los datos e intentá de nuevo.')
    } finally {
      setCreating(false)
    }
  }

  if (loadError) {
    return (
      <EmptyState
        heading="No se pudo cargar el pipeline"
        body="Probá de nuevo o revisá tu conexión. Si el problema sigue, puede ser un permiso de lectura."
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Pipeline</h1>

      {/* Header: resumen $ + CTA nuevo deal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground tabular-nums">{arsFormatter.format(summary.openTotal)}</span> abiertos
          {' · '}
          <span style={{ color: 'var(--crm-success)' }} className="tabular-nums">
            {arsFormatter.format(summary.wonTotal)}
          </span>{' '}
          ganados
          <span className="hidden sm:inline"> · arrastrá las tarjetas para cambiar de etapa</span>
        </p>
        <Button size="sm" className="gap-1.5 self-start sm:self-auto" onClick={() => setNewDealOpen(true)}>
          <Plus className="size-4" />
          Nuevo deal
        </Button>
      </div>

      {/* Fila de chips de tags (filtro OR) */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
            Tags
          </span>
          {tags.map((t) => (
            <TagChip
              key={t.id}
              label={t.label}
              color={t.color}
              selected={selectedTagIds.includes(t.id)}
              onToggle={() => toggleTag(t.id)}
            />
          ))}
        </div>
      )}

      {/* Tablero: 5 columnas desde STAGES, scroll horizontal */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const stageDeals = filtered.filter((d) => d.stage === stage.key)
            const isOver = dragOverStage === stage.key
            return (
              <div
                key={stage.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverStage(stage.key)
                }}
                onDragLeave={(e) => {
                  // Solo limpiar si salimos de la columna (no al pasar sobre un hijo).
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(null)
                }}
                onDrop={() => handleDrop(stage.key)}
                className={`flex w-72 shrink-0 flex-col rounded-xl border bg-card/40 transition-colors ${
                  isOver ? 'border-primary bg-secondary/40' : 'border-border'
                }`}
              >
                {/* Header de columna: dot de color + label + count + total $ */}
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm text-foreground">{stage.label}</span>
                    <span className="font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                      {stageDeals.length}
                    </span>
                  </span>
                  <span className="font-[family-name:var(--font-geist-mono)] text-[11px] tabular-nums text-muted-foreground">
                    {arsFormatter.format(totals[stage.key])}
                  </span>
                </div>

                {/* Tarjetas */}
                <div className="flex min-h-24 flex-col gap-2 p-2">
                  {stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      tagById={tagById}
                      dragging={draggingId === deal.id}
                      onDragStart={() => setDraggingId(deal.id)}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setDragOverStage(null)
                      }}
                      onMarkLost={() => setLostDeal(deal)}
                    />
                  ))}
                  {stageDeals.length === 0 && (
                    <p className="px-1 py-3 text-center text-xs text-muted-foreground/60">Sin deals</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Empty global: no hay deals, o ninguno coincide con el filtro */}
      {deals.length === 0 ? (
        <EmptyState
          heading="Todavía no hay deals"
          body="Creá tu primer deal con “+ Nuevo deal” o esperá a que un signup convierta automáticamente desde el onboarding."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          heading="Ningún deal coincide con estos tags."
          action={
            <Button variant="outline" size="sm" onClick={() => setSelectedTagIds([])}>
              Limpiar tags
            </Button>
          }
        />
      ) : null}

      {/* Diálogo Nuevo deal */}
      <Dialog open={newDealOpen} onOpenChange={(o) => !creating && setNewDealOpen(o)}>
        <DialogContent showCloseButton={!creating}>
          <DialogHeader>
            <DialogTitle>Nuevo deal</DialogTitle>
            <DialogDescription>Creá un prospecto en el pipeline. El email es opcional.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-name">Nombre del contacto</Label>
              <Input
                id="deal-name"
                value={form.leadName}
                onChange={(e) => setForm((f) => ({ ...f, leadName: e.target.value }))}
                placeholder="Ej: Peluquería Estilo Norte"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deal-email">Email (opcional)</Label>
              <Input
                id="deal-email"
                type="email"
                value={form.leadEmail}
                onChange={(e) => setForm((f) => ({ ...f, leadEmail: e.target.value }))}
                placeholder="contacto@negocio.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deal-value">Valor (ARS)</Label>
                <Input
                  id="deal-value"
                  type="number"
                  min={0}
                  step={1000}
                  value={form.valueArs}
                  onChange={(e) => setForm((f) => ({ ...f, valueArs: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deal-stage">Etapa</Label>
                <select
                  id="deal-stage"
                  value={form.stage}
                  onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as StageKey }))}
                  className="h-9 rounded-md border border-border bg-secondary/50 px-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={creating} onClick={() => setNewDealOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={creating || !form.leadName.trim()} onClick={handleCreateDeal}>
              {creating ? 'Creando…' : 'Crear deal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Marcar perdido (motivo obligatorio) */}
      <ConfirmDialog
        open={lostDeal !== null}
        onOpenChange={(o) => !o && setLostDeal(null)}
        title="Marcar deal como perdido"
        description={lostDeal ? `“${lostDeal.contactName}” saldrá del tablero. Indicá el motivo.` : undefined}
        requireReason
        risk="medio"
        confirmLabel="Marcar perdido"
        destructive
        onConfirm={async (reason) => {
          if (!lostDeal) return
          await markLost({ dealId: lostDeal.id, reason: reason ?? '' })
          // Optimista: sacar la tarjeta del tablero (status != open).
          setDeals((prev) => prev.filter((d) => d.id !== lostDeal.id))
          setLostDeal(null)
        }}
      />
    </div>
  )
}

// ── Tarjeta de deal (draggable) ──────────────────────────────────────────────────────────────────
function DealCard({
  deal,
  tagById,
  dragging,
  onDragStart,
  onDragEnd,
  onMarkLost,
}: {
  deal: PipelineDeal
  tagById: Map<string, PipelineTag>
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onMarkLost: () => void
}) {
  const cardTags = deal.tagIds.map((id) => tagById.get(id)).filter((t): t is PipelineTag => Boolean(t))
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', deal.id)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={`group/card cursor-grab rounded-lg border border-border bg-card p-3 active:cursor-grabbing ${
        dragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-foreground">{deal.contactName}</p>
        <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/40" />
      </div>

      {cardTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {cardTags.map((t) => (
            <TagChip key={t.id} label={t.label} color={t.color} />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded bg-secondary font-[family-name:var(--font-heading)] text-[10px] text-foreground"
        >
          {initials(deal.contactName)}
        </span>
        {deal.contactEmail && (
          <span className="min-w-0 truncate font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
            {deal.contactEmail}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm tabular-nums text-foreground">{arsFormatter.format(deal.valueArs)}</span>
        <button
          type="button"
          onClick={onMarkLost}
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Marcar perdido
        </button>
      </div>
    </article>
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
      <h2 className="text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">{heading}</h2>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
