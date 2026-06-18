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
import { ChevronLeft, MessageCircle, Mail } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/crm/status-badge'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { ExtendTrialDialog } from '@/components/crm/extend-trial-dialog'
import { AddonToggle } from '@/components/crm/addon-toggle'
import { changePlan, suspendBusiness, reactivateBusiness } from '@/app/(crm)/admin/_actions'

export type PlanKey = 'basic' | 'studio' | 'pro'

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

export function FichaClient({ data }: { data: FichaData }) {
  const [changePlanOpen, setChangePlanOpen] = React.useState(false)
  const [suspendOpen, setSuspendOpen] = React.useState(false)
  const [reactivateOpen, setReactivateOpen] = React.useState(false)
  const [extendOpen, setExtendOpen] = React.useState(false)
  const [selectedPlan, setSelectedPlan] = React.useState<PlanKey>(DEFAULT_TARGET[data.plan])

  const isSuspended = data.plan_status === 'suspended'
  const billing = billingState(data.plan_status, data.subscription_ends_at)
  // Vencimiento mostrado en la card de Suscripción (UAT 02 Test 4): en trial mostramos cuándo
  // vence el trial; con suscripción activa, la fecha de próximo cobro / fin de período.
  const isTrial = data.plan_status === 'trial'
  const venceLabel = isTrial ? 'Trial vence' : 'Próximo cobro / vence'
  const venceDate = isTrial ? data.trial_ends_at : data.subscription_ends_at
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

      {/* Tabs Resumen / Timeline(PRONTO) */}
      <div role="tablist" aria-label="Secciones de la ficha" className="flex items-center gap-1 border-b border-border">
        <span
          role="tab"
          aria-selected="true"
          className="border-b-2 border-primary px-3 py-2 text-sm text-primary"
        >
          Resumen
        </span>
        <span
          role="tab"
          aria-disabled="true"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground/60"
        >
          Timeline
          <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-wide">Pronto</span>
        </span>
      </div>

      {/* Dos columnas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
              <span className="text-sm text-foreground">
                {venceDate ? dateFmt.format(new Date(venceDate)) : '—'}
              </span>
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
                <Select value={selectedPlan} onValueChange={v => setSelectedPlan(v as PlanKey)}>
                  <SelectTrigger id="plan-target" className="flex-1">
                    <SelectValue>{PLAN_LABEL[selectedPlan]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_KEYS.filter(p => p !== data.plan).map(p => (
                      <SelectItem key={p} value={p}>{PLAN_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" className="flex-1" onClick={() => setChangePlanOpen(true)}>
                  Cambiar plan
                </Button>
              </div>
            </div>

            <Button type="button" className="w-full" onClick={() => setExtendOpen(true)}>
              Extender trial
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

      <ExtendTrialDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        businessId={data.id}
        currentTrialEndsAt={data.trial_ends_at}
      />
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
