'use client'

// Ficha de negocio (client) — ADM-02..06. Consumidor de las server actions del CRM vía los
// componentes de acción (ConfirmDialog / ExtendTrialDialog / AddonToggle). El client NUNCA autoriza:
// la garantía es requireAdmin server-side en cada action (T-02-13); estos diálogos son refuerzo.
//
// Layout (UI-SPEC §"Ficha de negocio"): hero (back + nombre h1 único + StatusBadge + meta mono) +
// tabs Resumen (activo) / Timeline (PRONTO, disabled) + dos columnas:
//   - Izquierda: Contacto (WhatsApp / Email del dueño) + Suscripción·MercadoPago (estado de cobro,
//     plan actual con precio ARS, ID suscripción).
//   - Derecha: Acciones (Cambiar plan → ConfirmDialog simple; Extender trial → ExtendTrialDialog;
//     ZONA SENSIBLE → Suspender/Reactivar) + Add-ons (EXACTAMENTE 2: Web a medida / Recordatorios
//     WhatsApp, NUNCA SMS).
// Copy de los ConfirmDialog verbatim del UI-SPEC (LOCKED).

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, MessageCircle, Mail, Inbox, Plus, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/crm/status-badge'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { ExtendTrialDialog } from '@/components/crm/extend-trial-dialog'
import { AddonToggle } from '@/components/crm/addon-toggle'
import { TagChip } from '@/components/crm/tag-chip'
import { TimelineEntry } from '@/components/crm/timeline-entry'
import { changePlan, suspendBusiness, reactivateBusiness, startImpersonation } from '@/app/(crm)/admin/_actions'
import { createNote, createTask, completeTask, deleteNote } from '@/app/(crm)/admin/_content-actions'
import { removeTag } from '@/app/(crm)/admin/_tag-actions'
import { TagManagerDialog } from '@/components/crm/tag-manager-dialog'
import {
  TIMELINE_FILTERS,
  rowMatchesFilter,
  filterShowsEmptyState,
  type TimelineFilter,
  type TimelineRow,
} from '@/lib/crm-timeline'

export type PlanKey = 'basic' | 'studio' | 'pro'

// Tag mínima que cruza al cliente (catálogo / asignada). Solo id+label+color, nada sensible (T-04-13).
export type FichaTag = {
  id: string
  label: string
  color: string
}

// Nota con id (para la lista borrable; el timeline VIEW no expone el id, por eso se lee aparte).
export type FichaNote = {
  id: string
  body: string
  created_at: string
}

// Tarea con id (para la lista completable; el timeline VIEW no expone el id, por eso se lee aparte).
export type FichaTask = {
  id: string
  title: string
  done: boolean
  completed_at: string | null
  created_at: string
}

export type FichaData = {
  id: string
  name: string
  slug: string
  ownerEmail: string | null
  whatsapp: string | null
  plan: PlanKey
  plan_status: string
  trial_ends_at: string | null
  subscription_ends_at: string | null
  mp_subscription_id: string | null
  has_web_custom: boolean
  has_whatsapp: boolean
  created_at: string
  planPriceArs: number
}

const PLAN_LABEL: Record<PlanKey, string> = { basic: 'Básico', studio: 'Estudio', pro: 'Pro' }
const PLAN_KEYS: PlanKey[] = ['basic', 'studio', 'pro']
// Default del selector de "Cambiar plan": el primer plan distinto del actual (el operador elige
// el destino explícito; changePlan recibe ese plan, no un ciclo). UAT 02 Test 4.
const DEFAULT_TARGET: Record<PlanKey, PlanKey> = { basic: 'studio', studio: 'basic', pro: 'studio' }

const AR_TZ = 'America/Argentina/Buenos_Aires'
const dateFmt = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: AR_TZ })
const arsFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

function initials(name: string): string {
  return name.split(' ').map((p) => p.charAt(0)).slice(0, 2).join('').toUpperCase()
}

// Estado de cobro derivado de plan_status (+ subscription_ends_at para "vencido").
function billingState(planStatus: string, subEndsAt: string | null): { label: string; color: string } {
  if (planStatus === 'active') return { label: 'Al día', color: 'var(--crm-success)' }
  if (planStatus === 'suspended') return { label: 'Suspendido', color: 'var(--crm-danger)' }
  if (planStatus === 'cancelled' || planStatus === 'expired') return { label: 'Vencido', color: 'var(--crm-danger)' }
  // trial u otros: si la suscripción ya venció, marcar vencido; si no, sin cobro activo.
  if (subEndsAt && new Date(subEndsAt).getTime() < Date.now()) return { label: 'Vencido', color: 'var(--crm-danger)' }
  return { label: '—', color: 'var(--muted-foreground)' }
}

export function FichaClient({
  data,
  timelineRows,
  tags,
  catalogTags,
  notes,
  tasks,
}: {
  data: FichaData
  timelineRows: TimelineRow[]
  tags: FichaTag[]
  catalogTags: FichaTag[]
  notes: FichaNote[]
  tasks: FichaTask[]
}) {
  const router = useRouter()
  const [changePlanOpen, setChangePlanOpen] = React.useState(false)
  const [suspendOpen, setSuspendOpen] = React.useState(false)
  const [reactivateOpen, setReactivateOpen] = React.useState(false)
  const [extendOpen, setExtendOpen] = React.useState(false)
  const [grantOpen, setGrantOpen] = React.useState(false)
  const [verOpen, setVerOpen] = React.useState(false)
  const [selectedPlan, setSelectedPlan] = React.useState<PlanKey>(DEFAULT_TARGET[data.plan])

  // ── Tab Resumen / Timeline (ahora real, ya no PRONTO) ──
  const [tab, setTab] = React.useState<'resumen' | 'timeline'>('resumen')

  // ── Estado del timeline: filtro activo + input de nota + alta de tarea ──
  const [timelineFilter, setTimelineFilter] = React.useState<TimelineFilter>('todo')
  const [noteBody, setNoteBody] = React.useState('')
  const [taskTitle, setTaskTitle] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [addTagOpen, setAddTagOpen] = React.useState(false)
  const [removeTagOpen, setRemoveTagOpen] = React.useState<FichaTag | null>(null)
  const [deleteNoteTarget, setDeleteNoteTarget] = React.useState<FichaNote | null>(null)

  // Tareas vivas (rama 'tarea' del timeline). Las notas viven en el timeline; las tareas se listan
  // aparte para poder marcarse como completas (no las re-derivamos del timeline para no perder el id).
  // Sin id en la VIEW: el checkbox de completar opera sobre las tareas que el operador crea en sesión.
  const filteredTimeline = React.useMemo(
    () => timelineRows.filter((r) => rowMatchesFilter(r, timelineFilter)),
    [timelineRows, timelineFilter],
  )

  async function submitNote() {
    const body = noteBody.trim()
    if (!body || pending) return
    setPending(true)
    try {
      await createNote({ businessId: data.id, body })
      setNoteBody('')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function submitTask() {
    const title = taskTitle.trim()
    if (!title || pending) return
    setPending(true)
    try {
      await createTask({ businessId: data.id, title })
      setTaskTitle('')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  // Marca/desmarca una tarea como completa. completeTask revalida requireAdmin()+completeTaskSchema
  // server-side; taskId es uuid validado (la UI es refuerzo, no autoriza).
  async function handleCompleteTask(task: FichaTask, done: boolean) {
    if (pending) return
    setPending(true)
    try {
      await completeTask({ taskId: task.id, done })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  const isSuspended = data.plan_status === 'suspended'
  const billing = billingState(data.plan_status, data.subscription_ends_at)
  // Vencimiento mostrado en la card de Suscripción (UAT 02 Test 4): en trial mostramos cuándo
  // vence el trial; con suscripción activa, la fecha de próximo cobro / fin de período.
  const isTrial = data.plan_status === 'trial'
  const venceLabel = isTrial ? 'Trial vence' : 'Próximo cobro / vence'
  const venceDate = isTrial ? data.trial_ends_at : data.subscription_ends_at
  // Display del vencimiento: fecha si existe; si es activo sin fin de período de MP, la suscripción
  // recurrente no tiene fecha de fin → "Renovación automática"; en otros estados sin fecha, "—".
  const venceDisplay = venceDate
    ? dateFmt.format(new Date(venceDate))
    : data.plan_status === 'active'
      ? 'Renovación automática'
      : '—'
  // Gating de acciones por estado (UAT 02): un negocio suspendido solo admite Reactivar
  // (cambiar plan / extender trial apagados). Extender trial no aplica a un plan activo (pago).
  const canChangePlan = !isSuspended
  const canExtendTrial = !isSuspended && data.plan_status !== 'active'
  const waHref = data.whatsapp ? `https://wa.me/${data.whatsapp.replace(/\D/g, '')}` : null

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="space-y-3">
        <Link
          href="/admin/negocios"
          className="inline-flex items-center gap-1 font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Volver a negocios
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary font-[family-name:var(--font-heading)] text-sm text-foreground"
            aria-hidden="true"
          >
            {initials(data.name)}
          </span>
          <div className="min-w-0">
            <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold tracking-[-0.02em]">
              {data.name}
            </h1>
            <p className="font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
              {data.ownerEmail ?? 'Sin dato'} · {data.slug} · cliente desde {dateFmt.format(new Date(data.created_at))} ·{' '}
              {PLAN_LABEL[data.plan]}
            </p>
          </div>
          <span className="ml-auto">
            <StatusBadge planStatus={data.plan_status} />
          </span>
        </div>
      </div>

      {/* Tabs Resumen / Timeline (ambos reales: el Timeline dejó de ser PRONTO/disabled) */}
      <div role="tablist" aria-label="Secciones de la ficha" className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'resumen'}
          onClick={() => setTab('resumen')}
          className={cn(
            'px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            tab === 'resumen'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Resumen
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'timeline'}
          onClick={() => setTab('timeline')}
          className={cn(
            'px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            tab === 'timeline'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Timeline
        </button>
      </div>

      {/* ── Tab Timeline (TL-01) ── */}
      {tab === 'timeline' && (
        <TimelineTab
          timelineRows={timelineRows}
          filteredTimeline={filteredTimeline}
          timelineFilter={timelineFilter}
          setTimelineFilter={setTimelineFilter}
          noteBody={noteBody}
          setNoteBody={setNoteBody}
          submitNote={submitNote}
          taskTitle={taskTitle}
          setTaskTitle={setTaskTitle}
          submitTask={submitTask}
          notes={notes}
          onDeleteNote={setDeleteNoteTarget}
          tasks={tasks}
          onCompleteTask={handleCompleteTask}
          pending={pending}
        />
      )}

      {/* Dos columnas (tab Resumen) */}
      <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-2', tab !== 'resumen' && 'hidden')}>
        {/* Izquierda: Contacto + Suscripción */}
        <div className="space-y-6">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h2 className="font-[family-name:var(--font-heading)] text-base font-bold tracking-[-0.02em]">Contacto</h2>

            {/* WhatsApp */}
            <ContactBlock
              label="WHATSAPP · OBLIGATORIO"
              value={data.whatsapp}
              icon={<MessageCircle className="size-4" />}
              href={waHref}
              external
              iconColor="var(--crm-info)"
              ariaAction={`Abrir WhatsApp de ${data.name}`}
            />

            {/* Email del dueño */}
            <ContactBlock
              label="EMAIL · OBLIGATORIO"
              value={data.ownerEmail}
              icon={<Mail className="size-4" />}
              href={data.ownerEmail ? `mailto:${data.ownerEmail}` : null}
              iconColor="var(--muted-foreground)"
              ariaAction={`Enviar email a ${data.name}`}
            />

            {/* Fila de tags (D-08): chips asignadas + "+ Tag" (assignTag/removeTag del foundation compartido) */}
            <div className="space-y-2 border-t border-border pt-4">
              <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
                Tags
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin tags</span>
                )}
                {tags.map((t) => (
                  <TagChip
                    key={t.id}
                    label={t.label}
                    color={t.color}
                    removable
                    onRemove={() => setRemoveTagOpen(t)}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={pending}
                  onClick={() => setAddTagOpen(true)}
                >
                  <Plus className="size-3" aria-hidden="true" />
                  Tag
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h2 className="font-[family-name:var(--font-heading)] text-base font-bold tracking-[-0.02em]">
              Suscripción · MercadoPago
            </h2>

            <Row label="Estado de cobro">
              <span
                className="inline-flex h-5 items-center gap-1.5 rounded-4xl border border-border bg-secondary px-2 text-xs"
                style={{ color: billing.color }}
              >
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: billing.color }} />
                {billing.label}
              </span>
            </Row>

            <Row label="Plan actual">
              <span className="text-sm text-foreground">
                {PLAN_LABEL[data.plan]} · {arsFormatter.format(data.planPriceArs)}/mes
              </span>
            </Row>

            <Row label={venceLabel}>
              <span className="text-sm text-foreground">{venceDisplay}</span>
            </Row>

            <Row label="ID suscripción">
              <span className="font-[family-name:var(--font-geist-mono)] text-xs text-muted-foreground">
                {data.mp_subscription_id ?? '—'}
              </span>
            </Row>
          </section>
        </div>

        {/* Derecha: Acciones + Add-ons */}
        <div className="space-y-6">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h2 className="font-[family-name:var(--font-heading)] text-base font-bold tracking-[-0.02em]">Acciones</h2>

            <div className="space-y-1.5">
              <label
                htmlFor="plan-target"
                className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground"
              >
                Plan — actual: {PLAN_LABEL[data.plan]}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={selectedPlan} onValueChange={v => setSelectedPlan(v as PlanKey)} disabled={!canChangePlan}>
                  <SelectTrigger id="plan-target" className="flex-1">
                    <SelectValue>{PLAN_LABEL[selectedPlan]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_KEYS.filter(p => p !== data.plan).map(p => (
                      <SelectItem key={p} value={p}>{PLAN_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" className="flex-1" disabled={!canChangePlan} onClick={() => setChangePlanOpen(true)}>
                  Cambiar plan
                </Button>
              </div>
            </div>

            {isTrial ? (
              <Button type="button" className="w-full" disabled={!canExtendTrial} onClick={() => setExtendOpen(true)}>
                Extender trial
              </Button>
            ) : (
              <Button type="button" className="w-full" disabled={isSuspended} onClick={() => setGrantOpen(true)}>
                Poner en trial
              </Button>
            )}
            {isSuspended && (
              <p className="font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                Negocio suspendido: reactivalo para cambiar plan o extender trial.
              </p>
            )}

            {/* Ver como cliente — soporte read-only. NO se gatea por estado (D-11): el soporte se
                necesita justo cuando hay un problema (ej. suspendido por error). */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setVerOpen(true)}
            >
              Ver como cliente
            </Button>

            <div className="space-y-1.5 pt-2">
              <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide" style={{ color: 'var(--crm-danger)' }}>
                Zona sensible
              </p>
              {isSuspended ? (
                <Button type="button" className="w-full" onClick={() => setReactivateOpen(true)}>
                  Reactivar negocio
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setSuspendOpen(true)}
                  className="w-full bg-[var(--crm-danger)] text-[var(--crm-danger-foreground)] hover:bg-[color-mix(in_oklch,var(--crm-danger),black_10%)]"
                >
                  Suspender negocio
                </Button>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <h2 className="font-[family-name:var(--font-heading)] text-base font-bold tracking-[-0.02em]">Add-ons</h2>

            <AddonRow
              businessId={data.id}
              addon="has_web_custom"
              label="Web a medida"
              checked={data.has_web_custom}
            />
            <AddonRow
              businessId={data.id}
              addon="has_whatsapp"
              label="Recordatorios WhatsApp"
              checked={data.has_whatsapp}
            />
          </section>
        </div>
      </div>

      {/* Diálogos de acción */}
      <ConfirmDialog
        open={changePlanOpen}
        onOpenChange={setChangePlanOpen}
        title="Cambiar plan"
        description={`Vas a cambiar el plan de este negocio de ${PLAN_LABEL[data.plan]} a ${PLAN_LABEL[selectedPlan]}. Queda registrado en auditoría.`}
        risk="medio"
        confirmLabel="Cambiar plan"
        onConfirm={async () => {
          await changePlan({ businessId: data.id, plan: selectedPlan })
        }}
      />

      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title="Suspender negocio"
        description="El negocio deja de operar hasta reactivarlo. Escribí SUSPENDER para confirmar."
        confirmWord="SUSPENDER"
        risk="alto"
        confirmLabel="Suspender"
        destructive
        onConfirm={async () => {
          await suspendBusiness({ businessId: data.id })
        }}
      />

      <ConfirmDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title="Reactivar negocio"
        description="El negocio vuelve a operar y queda como activo. Queda registrado en auditoría."
        risk="medio"
        confirmLabel="Reactivar negocio"
        onConfirm={async () => {
          await reactivateBusiness({ businessId: data.id })
        }}
      />

      {/* Ver como cliente (D-07/D-10/D-14): type-to-confirm "VER" + motivo obligatorio min 10
          (minReasonLength alinea la UI con el min(10) server-side → feedback inline, no toast
          genérico) + disclaimer legal. startImpersonation SOLO audita y resuelve limpio (ya no
          redirige desde el server: el NEXT_REDIRECT atravesaba el try/catch del dialog y disparaba
          su toast de error espurio). La navegación a /ver la hace el cliente con router.push tras
          resolver la action (D-04: navegar sigue siendo navegar, ahora client-side). El toast
          genérico solo aparece ahora ante un fallo REAL (requireAdmin/zod). */}
      <ConfirmDialog
        open={verOpen}
        onOpenChange={setVerOpen}
        title="Ver como cliente"
        description="Acceso de soporte en modo solo lectura. Queda auditado con tu identidad y el motivo. Uso responsable de datos de terceros."
        confirmWord="VER"
        requireReason
        minReasonLength={10}
        risk="alto"
        confirmLabel="Ver como cliente"
        onConfirm={async (reason) => {
          await startImpersonation({ businessId: data.id, reason: reason! })
          router.push(`/admin/negocios/${data.id}/ver`)
        }}
      />

      <ExtendTrialDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        businessId={data.id}
        currentTrialEndsAt={data.trial_ends_at}
      />

      <ExtendTrialDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        businessId={data.id}
        currentTrialEndsAt={data.trial_ends_at}
        mode="grant"
      />

      {/* Tags: diálogo compartido (asignar existente + crear+auto-asignar en un paso, gap test 13). El
          flujo de QUITAR tag NO vive acá: queda en los chips de la fila del Resumen con su ConfirmDialog
          (refuerzo, ya verificado). createTag/assignTag revalidan requireAdmin()+zod server-side. */}
      <TagManagerDialog
        open={addTagOpen}
        onOpenChange={setAddTagOpen}
        entityType="business"
        entityId={data.id}
        assignedTags={tags}
        catalogTags={catalogTags}
        onChanged={() => router.refresh()}
      />

      {/* Quitar tag (refuerzo con ConfirmDialog; removeTag del foundation compartido). */}
      <ConfirmDialog
        open={removeTagOpen !== null}
        onOpenChange={(open) => !open && setRemoveTagOpen(null)}
        title="Quitar tag"
        description={`Vas a quitar la tag "${removeTagOpen?.label ?? ''}" de este negocio.`}
        risk="bajo"
        confirmLabel="Quitar tag"
        onConfirm={async () => {
          if (!removeTagOpen) return
          await removeTag({ tagId: removeTagOpen.id, entityType: 'business', entityId: data.id })
          setRemoveTagOpen(null)
          router.refresh()
        }}
      />

      {/* Borrar nota (risk medio, acción destructiva): ConfirmDialog (refuerzo) + deleteNote (garantía). */}
      <ConfirmDialog
        open={deleteNoteTarget !== null}
        onOpenChange={(open) => !open && setDeleteNoteTarget(null)}
        title="Borrar nota"
        description="Vas a borrar esta nota del historial. Queda registrado en auditoría."
        risk="medio"
        confirmLabel="Borrar nota"
        destructive
        onConfirm={async () => {
          if (!deleteNoteTarget) return
          await deleteNote({ noteId: deleteNoteTarget.id })
          setDeleteNoteTarget(null)
          router.refresh()
        }}
      />
    </div>
  )
}

// ── TimelineTab ─────────────────────────────────────────────────────────────────────────────────
// Render del tab Timeline (TL-01, reproduce 05-ficha-timeline.png): banner "Ir a Bandeja" (placeholder
// Phase 6), input "+ Nota", alta de tarea liviana, chips de filtro (con empty state para Mensajes/
// Llamadas, D-13) y la lista de TimelineEntry ordenada por occurred_at desc (ya viene ordenada del RSC).
function TimelineTab({
  timelineRows,
  filteredTimeline,
  timelineFilter,
  setTimelineFilter,
  noteBody,
  setNoteBody,
  submitNote,
  taskTitle,
  setTaskTitle,
  submitTask,
  notes,
  onDeleteNote,
  tasks,
  onCompleteTask,
  pending,
}: {
  timelineRows: TimelineRow[]
  filteredTimeline: TimelineRow[]
  timelineFilter: TimelineFilter
  setTimelineFilter: (f: TimelineFilter) => void
  noteBody: string
  setNoteBody: (v: string) => void
  submitNote: () => void
  taskTitle: string
  setTaskTitle: (v: string) => void
  submitTask: () => void
  notes: FichaNote[]
  onDeleteNote: (note: FichaNote) => void
  tasks: FichaTask[]
  onCompleteTask: (task: FichaTask, done: boolean) => void
  pending: boolean
}) {
  const showsEmptyState = filterShowsEmptyState(timelineFilter)
  // La sección de notas borrables solo aplica al filtro Notas/Todo (las notas tienen id; el resto del
  // timeline es read-only). deleteNote va detrás del ConfirmDialog del padre (risk medio).
  const showNotesManager = (timelineFilter === 'notas' || timelineFilter === 'todo') && notes.length > 0
  // La sección de tareas completables aplica al filtro Tareas/Todo (las tareas tienen id; se leen aparte
  // de la VIEW para poder marcarlas con completeTask). Espejo del manager de notas.
  const showTasksManager = (timelineFilter === 'tareas' || timelineFilter === 'todo') && tasks.length > 0

  return (
    <div className="space-y-4">
      {/* Banner "Ir a Bandeja" (los mensajes/llamadas llegan con la Bandeja, Phase 6). */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
          aria-hidden="true"
        >
          <Inbox className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">Mensajes y llamadas llegan con la Bandeja</p>
          <p className="text-xs text-muted-foreground">Próximamente vas a poder responder desde acá.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled>
          Ir a Bandeja
        </Button>
      </div>

      {/* Input "+ Nota" + alta de tarea liviana */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitNote()
              }
            }}
            placeholder="Agregar una nota al historial…"
            aria-label="Agregar una nota al historial"
            className="flex-1"
          />
          <Button type="button" className="gap-1" disabled={!noteBody.trim() || pending} onClick={submitNote}>
            <Plus className="size-3.5" aria-hidden="true" />
            Nota
          </Button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitTask()
              }
            }}
            placeholder="Crear una tarea liviana…"
            aria-label="Crear una tarea"
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            className="gap-1"
            disabled={!taskTitle.trim() || pending}
            onClick={submitTask}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Tarea
          </Button>
        </div>
      </div>

      {/* Chips de filtro (Todo/Mensajes/Llamadas/Notas/Tareas/Cambios) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={timelineFilter === f.key}
            onClick={() => setTimelineFilter(f.key)}
            className={cn(
              'inline-flex min-h-9 items-center rounded-4xl border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              timelineFilter === f.key
                ? 'border-border bg-secondary text-foreground'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Gestión de notas borrables (deleteNote detrás de ConfirmDialog, risk medio) */}
      {showNotesManager && (
        <div className="space-y-1.5 rounded-xl border border-border bg-card/60 p-3">
          <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
            Notas
          </p>
          <ul className="divide-y divide-border">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start gap-2 py-2">
                <p className="min-w-0 flex-1 text-sm text-foreground">{n.body}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-[var(--crm-danger)]"
                  aria-label="Borrar nota"
                  disabled={pending}
                  onClick={() => onDeleteNote(n)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Gestión de tareas completables (completeTask del foundation compartido, risk bajo) */}
      {showTasksManager && (
        <div className="space-y-1.5 rounded-xl border border-border bg-card/60 p-3">
          <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
            Tareas
          </p>
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="py-1">
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={pending}
                    onChange={(e) => onCompleteTask(t, e.target.checked)}
                    aria-label={t.done ? `Reabrir tarea: ${t.title}` : `Completar tarea: ${t.title}`}
                    className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-sm',
                      t.done ? 'text-muted-foreground line-through' : 'text-foreground',
                    )}
                  >
                    {t.title}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lista del timeline / empty states */}
      {showsEmptyState ? (
        <TimelineEmpty
          heading="Sin mensajes — llegan con la Bandeja"
          body="Cuando la Bandeja esté activa, los mensajes y llamadas van a aparecer acá en el historial."
        />
      ) : filteredTimeline.length === 0 ? (
        <TimelineEmpty
          heading={timelineRows.length === 0 ? 'Todavía no hay actividad' : 'Nada en este filtro'}
          body={
            timelineRows.length === 0
              ? 'Las notas, tareas y cambios sobre este negocio van a aparecer acá en orden cronológico.'
              : 'Probá con otro filtro o agregá una nota.'
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card px-4">
          {filteredTimeline.map((row, i) => (
            <TimelineEntry key={`${row.kind}-${row.occurred_at}-${i}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}

function TimelineEmpty({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
      <h2 className="text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">
        {heading}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

// Bloque de contacto: micro-label mono + valor (o "—" + "Sin dato") + botón de acción si hay valor.
function ContactBlock({
  label,
  value,
  icon,
  href,
  external,
  iconColor,
  ariaAction,
}: {
  label: string
  value: string | null
  icon: React.ReactNode
  href: string | null
  external?: boolean
  iconColor: string
  ariaAction: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {value ? (
          <p className="truncate text-sm text-foreground">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            — <span className="text-xs">Sin dato</span>
          </p>
        )}
      </div>
      {value && href && (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          aria-label={ariaAction}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          style={{ color: iconColor }}
        >
          {icon}
        </a>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

function AddonRow({
  businessId,
  addon,
  label,
  checked,
}: {
  businessId: string
  addon: 'has_web_custom' | 'has_whatsapp'
  label: string
  checked: boolean
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-1')}>
      <span className="text-sm text-foreground">{label}</span>
      <AddonToggle businessId={businessId} addon={addon} label={label} checked={checked} />
    </div>
  )
}
