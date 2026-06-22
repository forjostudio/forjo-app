import { GitCommitVertical, StickyNote, CheckSquare, MessageCircle, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { actionLabel, type TimelineRow, type TimelineKind } from '@/lib/crm-timeline'

/**
 * TimelineEntry — entrada presentacional del timeline unificado (TL-01), modelada sobre el row render
 * de auditoria-client.tsx. Sin estado propio: el padre (ficha-client) le pasa la fila ya leída de la
 * VIEW crm_timeline. Reproduce 05-ficha-timeline.png: icono por kind + título legible + badge de actor
 * (OPERADOR/CLIENTE/IA/SISTEMA) + body + timestamp relativo (Hoy/Ayer · HH:MM). Tema dark del shell CRM,
 * tokens CSS (nunca hex).
 *
 * El título legible de la rama 'cambio' sale del mapa ACTION_LABEL CENTRAL de lib/crm-timeline (mismo
 * que consume el visor de auditoría), así audit y timeline leen consistente sin duplicar copy.
 */

// Zona fija de Argentina (UTC-3, sin DST) — misma constante que auditoria-client / google-calendar.
const AR_TZ = 'America/Argentina/Buenos_Aires'

// Formatea occurred_at como "Hoy · 13:22" / "Ayer · 17:05" / "14 jun · 09:12" en hora AR (calca formatWhen).
function formatWhen(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('es-AR', {
    timeZone: AR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const dayKey = (x: Date) =>
    x.toLocaleDateString('es-AR', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (dayKey(d) === dayKey(now)) return `Hoy · ${time}`
  if (dayKey(d) === dayKey(yesterday)) return `Ayer · ${time}`
  const date = d.toLocaleDateString('es-AR', { timeZone: AR_TZ, day: '2-digit', month: 'short' })
  return `${date} · ${time}`
}

// Icono por kind (lucide). 'mensaje'/'llamada' son futuros (Bandeja) pero el mapa los cubre para cuando lleguen.
const KIND_ICON: Record<TimelineKind, React.ComponentType<{ className?: string }>> = {
  cambio: GitCommitVertical,
  nota: StickyNote,
  tarea: CheckSquare,
  mensaje: MessageCircle,
  llamada: Phone,
}

// Badge de actor: OPERADOR (acción del operador), SISTEMA (actor null en audit), CLIENTE/IA (futuros,
// llegan con la Bandeja). Color por token CSS del shell CRM (reproduce 05-ficha-timeline.png).
function actorBadge(actorType: string): { label: string; color: string } {
  switch (actorType) {
    case 'operador':
      return { label: 'OPERADOR', color: 'var(--crm-info)' }
    case 'cliente':
      return { label: 'CLIENTE', color: 'var(--crm-success)' }
    case 'ia':
      return { label: 'IA', color: 'var(--primary)' }
    default:
      return { label: 'SISTEMA', color: 'var(--muted-foreground)' }
  }
}

// Título legible: la rama 'cambio' mapea el action code (title) a copy via ACTION_LABEL; el resto ya
// trae un título legible desde la VIEW ('Nota' / 'Tarea creada' / 'Tarea completada').
function entryTitle(row: TimelineRow): string {
  return row.kind === 'cambio' ? actionLabel(row.title) : row.title
}

export function TimelineEntry({ row }: { row: TimelineRow }) {
  const Icon = KIND_ICON[row.kind]
  const actor = actorBadge(row.actor_type)

  return (
    <li className="flex gap-3 py-3">
      {/* Icono por kind */}
      <span
        className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
        aria-hidden="true"
      >
        <Icon className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-foreground">{entryTitle(row)}</span>
          <span
            className="inline-flex h-4 items-center rounded-4xl border border-border px-1.5 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-wide"
            style={{ color: actor.color }}
          >
            {actor.label}
          </span>
          <span className="ml-auto font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
            {formatWhen(row.occurred_at)}
          </span>
        </div>
        {row.body && (
          <p className={cn('text-sm text-muted-foreground')}>{row.body}</p>
        )}
      </div>
    </li>
  )
}
