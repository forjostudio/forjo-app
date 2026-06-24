'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, MessageSquare, Paperclip, Send, UserPlus, RotateCcw, Inbox, Sparkles, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { takeConversation, releaseConversation } from './actions'

/**
 * Bandeja del operador (client) — reproduce el mock crm-design/07-bandeja.png (COMMS-01/02).
 *
 * Layout de 2 paneles: lista de conversaciones (izq) + thread (der). El estado de atención
 * (handled_by) se muestra con un chip calcado del patrón RiskBadge/StatusBadge del CRM (pill oscuro
 * + dot con la var de color del tema, un solo rojo --crm-danger en todo el CRM). El composer está
 * DESHABILITADO (D-03, envío manual diferido): input + botón Enviar inertes, sin ningún submit cableado.
 * Sin canal de correo (D-01, mail two-way diferido): solo filtros Todas / WhatsApp.
 *
 * "Tomar conversación" invoca la server action takeConversation (re-guardada con requireAdmin + auditada
 * en 06-01); la UI no es la garantía. Optimista con reconciliación vía router.refresh().
 *
 * Sin service-role acá (es cliente): la lectura ya vino del page.tsx con session client (RLS mixta de 038).
 */

// ── Tipos (snake_case, como vienen de Supabase — convención del proyecto) ─────────────────────────

export type HandledBy = 'ai' | 'human' | 'unassigned'

export type ConversationMessage = {
  id: string
  direction: 'inbound' | 'outbound'
  sender: 'contact' | 'ai' | 'human'
  body: string
  sent_at: string
}

export type ConversationRow = {
  id: string
  business_id: string
  contact_name: string | null
  contact_phone: string
  handled_by: HandledBy
  unread_count: number
  last_message_at: string
  business_name: string | null
  last_message_preview: string | null
  messages: ConversationMessage[]
}

// ── Helpers de presentación ───────────────────────────────────────────────────────────────────────

// Zona fija de Argentina (UTC-3, sin DST) — misma constante que auditoria-client / lib/google-calendar.
const AR_TZ = 'America/Argentina/Buenos_Aires'

// Solo la hora (HH:mm AR) — para el preview de la lista y los timestamps de las burbujas.
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    timeZone: AR_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const dayKey = (x: Date) =>
  x.toLocaleDateString('es-AR', { timeZone: AR_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

// Hora si es hoy, "Ayer" si fue ayer, o "14 jun" para fechas más viejas — para la columna derecha de la lista.
function formatWhen(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (dayKey(d) === dayKey(now)) return formatTime(iso)
  if (dayKey(d) === dayKey(yesterday)) return 'Ayer'
  return d.toLocaleDateString('es-AR', { timeZone: AR_TZ, day: '2-digit', month: 'short' })
}

// Divisor de fecha del thread ("HOY" / "AYER" / "14 JUN").
function dayDivider(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (dayKey(d) === dayKey(now)) return 'HOY'
  if (dayKey(d) === dayKey(yesterday)) return 'AYER'
  return d.toLocaleDateString('es-AR', { timeZone: AR_TZ, day: '2-digit', month: 'short' }).toUpperCase()
}

function initials(name: string | null, fallback: string): string {
  const base = (name && name.trim()) || fallback
  return base
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ── Chip de estado (handled_by) — calca el patrón RiskBadge/StatusBadge: pill oscuro + dot con var ──
// de color del tema. amarillo --primary (IA atendiendo, estado distintivo), verde --crm-success (Vos
// atendés), muted (Sin asignar). NO inventa CSS nuevo ni hex hardcodeado.

const STATE_META: Record<HandledBy, { label: string; dot: string; icon: boolean }> = {
  ai: { label: 'IA atendiendo', dot: 'var(--primary)', icon: true },
  human: { label: 'Vos atendés', dot: 'var(--crm-success)', icon: false },
  unassigned: { label: 'Sin asignar', dot: 'var(--muted-foreground)', icon: false },
}

function StateChip({ handledBy }: { handledBy: HandledBy }) {
  const meta = STATE_META[handledBy]
  return (
    <span className="inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border border-border bg-secondary px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground">
      {meta.icon ? (
        <Sparkles aria-hidden="true" className="size-3 shrink-0" style={{ color: meta.dot }} />
      ) : (
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.dot }} />
      )}
      {meta.label}
    </span>
  )
}

// ── Filtros de canal (D-01: SIN correo — solo Todas / WhatsApp) ────────────────────────────────────
const FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'whatsapp', label: 'WhatsApp' },
] as const

type FilterValue = (typeof FILTERS)[number]['value']

// ── Componente ──────────────────────────────────────────────────────────────────────────────────

export function BandejaClient({ rows, loadError }: { rows: ConversationRow[]; loadError: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterValue>('todas')
  const [selectedId, setSelectedId] = useState<string | null>(rows.length > 0 ? rows[0].id : null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // El único canal en v1 es WhatsApp (D-01); el filtro "whatsapp" es equivalente a "todas" hoy, pero
    // se deja explícito porque el tab existe en el mock y prepara el terreno sin agregar correo.
    return rows.filter((r) => {
      if (!q) return true
      const haystack = [r.contact_name ?? '', r.business_name ?? '', r.last_message_preview ?? '', r.contact_phone]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [rows, query, filter])

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId])

  async function handleTake(conversationId: string) {
    setBusyId(conversationId)
    try {
      await takeConversation({ conversationId })
      toast.success('Tomaste la conversación')
      router.refresh()
    } catch {
      toast.error('No se pudo tomar la conversación. Probá de nuevo.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleRelease(conversationId: string) {
    setBusyId(conversationId)
    try {
      await releaseConversation({ conversationId })
      toast.success('Liberaste la conversación')
      router.refresh()
    } catch {
      toast.error('No se pudo liberar la conversación. Probá de nuevo.')
    } finally {
      setBusyId(null)
    }
  }

  if (loadError) {
    return (
      <EmptyState
        heading="No se pudo cargar la bandeja"
        body="Probá de nuevo o revisá tu conexión. Si el problema sigue, puede ser un permiso de lectura."
      />
    )
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem-3rem)] gap-4 overflow-hidden">
      <h1 className="sr-only">Bandeja de conversaciones</h1>

      {/* ── PANEL IZQUIERDO: lista de conversaciones ── */}
      <aside className="flex w-full max-w-sm shrink-0 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card">
        {/* Search + filtros de canal */}
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversación…"
              aria-label="Buscar conversación"
              className="pl-8"
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
            <TabsList aria-label="Filtrar por canal">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="data-active:text-primary">
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-3">
              <EmptyState
                compact
                heading="Todavía no hay conversaciones"
                body="Cuando el asistente de WhatsApp reciba mensajes, los hilos van a aparecer acá con su estado y no-leídos."
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Ninguna conversación coincide con la búsqueda.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((c) => {
                const active = c.id === selectedId
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'group/conv relative flex w-full items-start gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        'before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0',
                        active ? 'bg-secondary before:opacity-100' : 'hover:bg-secondary/60',
                      )}
                    >
                      {/* Avatar con iniciales */}
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary font-[family-name:var(--font-heading)] text-xs text-foreground"
                      >
                        {initials(c.contact_name, c.contact_phone)}
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        {/* Línea 1: nombre + hora */}
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm text-foreground">
                            {c.contact_name || c.contact_phone}
                          </span>
                          <span className="shrink-0 font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                            {formatWhen(c.last_message_at)}
                          </span>
                        </span>

                        {/* Línea 2: negocio asociado */}
                        <span className="truncate font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                          {c.business_name || '—'}
                        </span>

                        {/* Línea 3: preview + contador de no-leídos */}
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {c.last_message_preview || 'Sin mensajes'}
                          </span>
                          {c.unread_count > 0 && (
                            <span
                              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums"
                              aria-label={`${c.unread_count} sin leer`}
                            >
                              {c.unread_count}
                            </span>
                          )}
                        </span>

                        {/* Línea 4: canal + estado */}
                        <span className="mt-0.5 flex items-center gap-2">
                          <MessageSquare aria-hidden="true" className="size-3.5 text-muted-foreground" />
                          <StateChip handledBy={c.handled_by} />
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* ── PANEL DERECHO: thread ── */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              heading="Elegí una conversación"
              body="Seleccioná un hilo de la lista para ver los mensajes y, si hace falta, tomar la conversación."
            />
          </div>
        ) : (
          <>
            {/* Header del thread */}
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary"
                >
                  <MessageSquare className="size-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {selected.contact_name || selected.contact_phone}
                  </p>
                  <p className="truncate font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                    {selected.business_name ? `${selected.business_name} · ` : ''}WhatsApp Business
                  </p>
                </div>
              </div>

              {/* Acción de takeover / release según el estado */}
              {selected.handled_by === 'human' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleRelease(selected.id)}
                  disabled={busyId === selected.id}
                >
                  <RotateCcw className="size-3.5" />
                  Liberar
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleTake(selected.id)}
                  disabled={busyId === selected.id}
                >
                  <UserPlus className="size-3.5" />
                  Tomar conversación
                </Button>
              )}
            </div>

            {/* Banner del agente IA (solo cuando lo atiende la IA) */}
            {selected.handled_by === 'ai' && (
              <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-2.5 text-xs text-muted-foreground">
                <Sparkles aria-hidden="true" className="size-3.5 shrink-0" style={{ color: 'var(--primary)' }} />
                <span>El agente IA está respondiendo automáticamente. Tomá la conversación para intervenir.</span>
              </div>
            )}

            {/* Mensajes */}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Todavía no hay mensajes en este hilo.
                </div>
              ) : (
                selected.messages.map((m, i) => {
                  const prev = i > 0 ? selected.messages[i - 1] : null
                  const showDivider = !prev || dayDivider(prev.sent_at) !== dayDivider(m.sent_at)
                  const outbound = m.direction === 'outbound'
                  const senderLabel = m.sender === 'human' ? 'Vos' : m.sender === 'ai' ? 'Agente IA' : null
                  return (
                    <div key={m.id}>
                      {showDivider && (
                        <div className="my-3 flex items-center justify-center">
                          <span className="font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider text-muted-foreground">
                            {dayDivider(m.sent_at)}
                          </span>
                        </div>
                      )}
                      <div className={cn('flex flex-col gap-1', outbound ? 'items-end' : 'items-start')}>
                        {outbound && senderLabel && (
                          <span className="font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                            {senderLabel}
                          </span>
                        )}
                        <div
                          className={cn(
                            'max-w-[75%] rounded-xl px-3 py-2 text-sm',
                            outbound
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-foreground',
                          )}
                        >
                          {m.body}
                        </div>
                        <span className="font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
                          {formatTime(m.sent_at)}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* ── COMPOSER DESHABILITADO (D-03: envío manual diferido) ── */}
            <div className="border-t border-border p-4">
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
                <span>Tomá la conversación para escribir manualmente. Envío manual próximamente.</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled
                  aria-label="Adjuntar (próximamente)"
                  title="Próximamente"
                >
                  <Paperclip className="size-4" />
                </Button>
                <Input
                  type="text"
                  disabled
                  placeholder="Escribir por WhatsApp…"
                  aria-label="Escribir mensaje (próximamente)"
                  title="Próximamente"
                  className="flex-1"
                />
                <Button type="button" size="sm" className="gap-1.5" disabled title="Próximamente">
                  <Send className="size-3.5" />
                  Enviar
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// Empty state reutilizable (mismo lenguaje visual que auditoria-client).
function EmptyState({
  heading,
  body,
  compact = false,
}: {
  heading: string
  body?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 text-center',
        compact ? 'px-4 py-10' : 'px-6 py-16',
      )}
    >
      <div
        className="flex size-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
        aria-hidden="true"
      >
        <Inbox className="size-5" />
      </div>
      <h2 className="text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">
        {heading}
      </h2>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
    </div>
  )
}
