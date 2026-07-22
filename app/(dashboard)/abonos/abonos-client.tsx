'use client'

// Superficie de UI del abono en el panel (ABONO-01, D-04/D-06/D-07). Lista los abonos activos del
// negocio, abre el form de alta (día de la semana + hora, sin fecha), muestra el detalle de cada serie
// con las ocurrencias salteadas por conflicto (D-06), y expone el control de la VENTANA de generación
// (businesses.abono_window_weeks, D-07). La persistencia de la ventana espeja EXACTAMENTE el mecanismo
// con que la Agenda persiste max_advance_days (Phase 4): update de businesses por id con el cliente
// anon+RLS del navegador (owner-only por RLS; abono_window_weeks no está protegida por el trigger admin).

import { useState, useMemo, useCallback, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Business, Client, Service, Professional, Location } from '@/lib/types'
import { resolveVertical } from '@/lib/verticals'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Plus, Minus, Repeat, Clock, CalendarClock, AlertTriangle, Ban, Copy } from 'lucide-react'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { NuevoAbonoForm } from '@/components/dashboard/nuevo-abono-form'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'

// Fila de abono con los joins de nombre (cliente / servicio / cancha) que arma la page server.
export type AbonoRow = {
  id: string
  day_of_week: number
  start_time: string
  status: 'active' | 'cancelled' | 'completed'
  total_occurrences: number | null // null = indefinido; N = finito de N sesiones (D-07′)
  generated_until: string | null
  skipped_occurrences: { date: string; reason: string }[]
  created_at: string
  // La CREDENCIAL DE BAJA de la serie NO forma parte de la fila que llega al browser (WR-07/D-25): no
  // viaja en el payload de la página, se le pide al servidor recién cuando el dueño toca "Copiar link
  // de baja". Ver el comentario del select en page.tsx.
  cancelled_at: string | null
  clients: { name: string } | null
  services: { name: string } | null
  professionals: { name: string } | null
}

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Filtro del listado (D-20). La vista principal es de series VIVAS; lo que ya no genera turnos
// (cancelled) o ya asignó todas sus sesiones (completed) vive bajo Archivados.
type AbonoTab = 'activos' | 'archivados'
const ABONO_TABS: { key: AbonoTab; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'archivados', label: 'Archivados' },
]

// Razón de salteo (motor de generación / booking-core) → texto en español para el dueño (D-06).
// 'out_of_hours' YA NO EXISTE: el abono del dueño dejó de gatearse por la grilla semanal (D-06′) — el
// motor sólo saltea por día cerrado (feriado) o por conflicto real del core.
const SKIP_REASON_ES: Record<string, string> = {
  slot_taken: 'Horario ocupado',
  slot_full: 'Cupo lleno',
  day_closed: 'Día cerrado',
  space_conflict: 'Espacio ocupado',
  invalid_service: 'Servicio no disponible',
  invalid_professional: 'Recurso no disponible',
  insert_failed: 'No se pudo reservar',
}
function skipReasonES(reason: string): string {
  return SKIP_REASON_ES[reason] ?? 'Conflicto'
}

// hh:mm de un 'HH:mm[:ss]'.
function hhmm(t: string): string {
  return t.slice(0, 5)
}

// Dialog (desktop ≥768px) / Drawer vaul (mobile): breakpoint en JS, sin setState-in-effect.
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

interface Props {
  business: Business
  abonos: AbonoRow[]
  turnoCounts: Record<string, number>
  // Fecha ISO del ÚLTIMO turno real de cada serie (max date de los turnos no cancelados), D-09′.
  lastTurnoDates: Record<string, string>
  // Preview de la baja por serie (D-03), calculado en el server con los MISMOS helpers que ejecuta el
  // motor de baja: cuántos turnos FUTUROS se cancelarían y cuál sería el último.
  futureTurnoCounts: Record<string, number>
  lastFutureDates: Record<string, string | null>
  clients: Client[]
  services: Service[]
  professionals: Professional[]
  locations: Location[]
}

export function AbonosClient({ business, abonos, turnoCounts, lastTurnoDates, futureTurnoCounts, lastFutureDates, clients, services, professionals, locations }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const term = resolveVertical(business).terminology

  const [formOpen, setFormOpen] = useState(false)
  const [detailAbono, setDetailAbono] = useState<AbonoRow | null>(null)
  // Serie sobre la que se está por confirmar la baja. Manda el ConfirmDialog: se setea al tocar "Dar
  // de baja" en el detalle, DESPUÉS de cerrar el detalle (no se anidan modales).
  const [cancelTarget, setCancelTarget] = useState<AbonoRow | null>(null)
  const [tab, setTab] = useState<AbonoTab>('activos')

  // Listado por tab (D-20). CAMBIO de comportamiento respecto de la versión previa: antes el memo sólo
  // excluía los cancelados y dejaba los `completed` en la lista principal. Ahora la vista principal es
  // de series VIVAS (`active`) y todo lo demás — cancelled + completed — vive bajo Archivados. Un
  // finito que ya asignó sus N sesiones no es trabajo pendiente del dueño; sigue accesible (y se puede
  // dar de baja, D-21) desde el otro tab.
  const visibleAbonos = useMemo(
    () => abonos.filter((a) => (tab === 'activos' ? a.status === 'active' : a.status !== 'active')),
    [abonos, tab],
  )
  const tabCounts = useMemo(() => {
    const activos = abonos.filter((a) => a.status === 'active').length
    return { activos, archivados: abonos.length - activos }
  }, [abonos])

  // ── Copiar el link de baja del cliente (D-17) ──────────────────────────────────────────────────
  // ÚNICO lugar donde la credencial de baja sale a la vista: el dueño la copia deliberadamente para
  // mandarle el link a su cliente por WhatsApp (caso frecuente en canchas: cliente sin mail, o cliente
  // que perdió el mail de alta). La URL ya NO se arma acá: se le pide al endpoint autenticado, que la
  // resuelve para ESA serie del propio negocio recién en este momento (WR-07/D-25). Así el secreto no
  // viaja con el listado en cada render. No hay endpoint de reenvío de mail.
  const [copyingLink, setCopyingLink] = useState(false)
  const copyCancelLink = useCallback(async (a: AbonoRow) => {
    setCopyingLink(true)
    try {
      const res = await fetch(`/api/abonos/cancel-link/${a.id}`)
      const data = await res.json().catch(() => null)
      const url = typeof data?.url === 'string' ? data.url : ''
      if (!res.ok || !data?.ok || !url) {
        // Sin link no se escribe NADA al portapapeles: es preferible que el dueño reintente a que
        // pegue en el WhatsApp de su cliente lo que hubiera copiado antes.
        toast.error('No se pudo obtener el link de baja. Probá de nuevo.')
        return
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable')
        await navigator.clipboard.writeText(url)
        toast.success('Link copiado')
      } catch {
        // Contexto no seguro (http) o permiso denegado: no se rompe la vista, se muestra el link para
        // que el dueño lo copie a mano.
        toast.error('No se pudo copiar automáticamente. Copiá este link:', { description: url })
      }
    } finally {
      setCopyingLink(false)
    }
  }, [])

  // ── Baja de la serie (ABONO-05) ────────────────────────────────────────────────────────────────
  // Toda la baja corre server-side en el endpoint autenticado: el cliente no escribe una sola fila.
  // Si algo falla se LANZA el error a propósito — el ConfirmDialog deja el diálogo abierto y muestra
  // su toast (contrato del componente), así el dueño puede reintentar sin perder el contexto.
  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    const res = await fetch('/api/abonos/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ abonoId: cancelTarget.id }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(data?.error || 'cancel_failed')
    // El número que se informa es el del SERVIDOR, no el del preview: entre que se cargó la página y
    // se confirmó pudo cambiar algo, y la autoridad del efecto real es el motor de baja.
    const n = Number(data.cancelledCount ?? 0)
    toast.success(n > 0 ? `Abono dado de baja · ${n} turno${n === 1 ? '' : 's'} cancelado${n === 1 ? '' : 's'}` : 'Abono dado de baja')
    setCancelTarget(null)
    router.refresh() // la serie pasa a 'cancelled' → se mueve sola al tab Archivados
  }, [cancelTarget, router])

  // ── Control de ventana de generación (abono_window_weeks, D-07) ────────────────────────────────
  // Rango permitido 1..52 (GAP-01): la ventana dimensiona el loop del motor, que corre dentro del cron
  // diario COMPARTIDO por todos los negocios. Esto es UX + coherencia con el server; la AUTORIDAD es el
  // clamp server-side (app/api/abonos/create y app/api/cron/cancel-expired) más el CHECK de la migr. 055.
  const WINDOW_MIN_WEEKS = 1
  const WINDOW_MAX_WEEKS = 52
  const [windowWeeks, setWindowWeeks] = useState<number>(business.abono_window_weeks ?? 8)
  const [savingWindow, setSavingWindow] = useState(false)
  async function saveWindow() {
    const weeks = Math.floor(windowWeeks)
    if (!Number.isFinite(weeks) || weeks < WINDOW_MIN_WEEKS || weeks > WINDOW_MAX_WEEKS) {
      toast.error(`Ingresá un número de semanas entre ${WINDOW_MIN_WEEKS} y ${WINDOW_MAX_WEEKS}`)
      return
    }
    setSavingWindow(true)
    // Espejo del guardado de max_advance_days (Agenda): update de businesses por id con anon+RLS.
    const { error } = await supabase.from('businesses').update({ abono_window_weeks: weeks }).eq('id', business.id)
    setSavingWindow(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Ventana de generación guardada')
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <PageEyebrow label="Abonos" />
          <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Abonos</h1>
          <p className="text-sm text-muted-foreground mt-1">Turnos fijos que se repiten cada semana, indefinidos o por una cantidad de sesiones. Se generan solos y podés ver qué semanas se saltearon por conflicto.</p>
        </div>
        <div className="flex-shrink-0 sm:pt-1">
          <Button onClick={() => setFormOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nuevo abono
          </Button>
        </div>
      </div>

      {/* Lista de abonos: activos por defecto, archivados (cancelados + completados) bajo el filtro */}
      <Card className="p-6 space-y-4">
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-sm">Tus abonos</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tocá un abono para ver la serie y las semanas salteadas.</p>
          </div>
          {/* Píldoras de filtro (D-20), mismo molde visual que los filtros de Clientes. */}
          <div className="flex gap-1 flex-wrap">
            {ABONO_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={tab === t.key}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label} ({tabCounts[t.key]})
              </button>
            ))}
          </div>
        </div>

        {visibleAbonos.length === 0 ? (
          tab === 'archivados' ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
              <Repeat className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No hay abonos archivados</p>
              <p className="text-xs text-muted-foreground">Acá van a aparecer los abonos que des de baja y los que ya asignaron todas sus sesiones.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
              <Repeat className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">Todavía no tenés abonos</p>
              <p className="text-xs text-muted-foreground">Creá uno para reservar automáticamente el mismo día y hora todas las semanas.</p>
              <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => setFormOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> Nuevo abono
              </Button>
            </div>
          )
        ) : (
          <ul className="space-y-2">
            {visibleAbonos.map((a) => {
              const count = turnoCounts[a.id] ?? 0
              const skipped = a.skipped_occurrences?.length ?? 0
              const bookable = a.services?.name || a.professionals?.name || '—'
              const total = a.total_occurrences // null = indefinido
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setDetailAbono(a)}
                    className="w-full text-left rounded-lg border border-border p-3.5 transition-colors hover:border-primary/60 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium truncate">{a.clients?.name ?? 'Cliente'}</p>
                        <p className="text-xs text-muted-foreground truncate">{bookable}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span>
                            Todos los {DAY_LABELS[a.day_of_week].toLowerCase()} · {hhmm(a.start_time)}
                            {total != null && <> · {total} sesion{total === 1 ? '' : 'es'}</>}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {/* El chip cuenta TURNOS ASIGNADOS y NADA más — idéntico para finitos e
                            indefinidos. Tanto "Completado" como "X de N" se leían como "la serie ya
                            terminó", cuando en realidad esos turnos están por delante. La duración del
                            abono (indefinido vs N sesiones) ya se comunica en el subtítulo de la fila. */}
                        <Badge variant="secondary" className="gap-1">
                          <CalendarClock className="w-3 h-3" />
                          {`${count} turno${count === 1 ? '' : 's'}`}
                        </Badge>
                        {skipped > 0 && (
                          <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />{skipped} salteada{skipped === 1 ? '' : 's'}</Badge>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Ventana de generación (D-07) */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold text-sm flex items-center gap-1.5"><CalendarClock className="w-4 h-4" /> Ventana de generación</p>
          <p className="text-xs text-muted-foreground mt-0.5">Con cuántas semanas de anticipación se generan los turnos de tus abonos <span className="font-medium text-foreground">indefinidos</span>. Se extiende sola día a día. Los abonos de N sesiones usan la misma ventana hasta completar sus sesiones.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Semanas hacia adelante</Label>
          <div className="flex items-center overflow-hidden rounded-md border border-border w-fit">
            <button
              type="button"
              aria-label="Menos semanas"
              disabled={windowWeeks <= WINDOW_MIN_WEEKS}
              onClick={() => setWindowWeeks((w) => Math.max(WINDOW_MIN_WEEKS, w - 1))}
              className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min={WINDOW_MIN_WEEKS}
              max={WINDOW_MAX_WEEKS}
              value={windowWeeks}
              onFocus={(e) => e.target.select()}
              onChange={(e) =>
                setWindowWeeks(
                  Math.min(WINDOW_MAX_WEEKS, Math.max(WINDOW_MIN_WEEKS, Math.floor(Number(e.target.value) || WINDOW_MIN_WEEKS))),
                )
              }
              className="h-9 w-14 border-x border-border bg-transparent text-center text-sm tabular-nums outline-none focus:bg-secondary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              aria-label="Semanas hacia adelante"
            />
            <button
              type="button"
              aria-label="Más semanas"
              disabled={windowWeeks >= WINDOW_MAX_WEEKS}
              onClick={() => setWindowWeeks((w) => Math.min(WINDOW_MAX_WEEKS, w + 1))}
              className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Entre {WINDOW_MIN_WEEKS} y {WINDOW_MAX_WEEKS} semanas (hasta 1 año de anticipación).</p>
        </div>
        <Button onClick={saveWindow} disabled={savingWindow}>{savingWindow ? 'Guardando...' : 'Guardar'}</Button>
      </Card>

      {/* Detalle del abono — serie + ocurrencias salteadas (D-06). Dialog desktop / Drawer mobile. */}
      {detailAbono && (() => {
        const a = detailAbono
        const count = turnoCounts[a.id] ?? 0
        const total = a.total_occurrences // null = indefinido
        const lastDate = lastTurnoDates[a.id] ?? null
        const bookable = a.services?.name || a.professionals?.name || '—'
        const skipped = [...(a.skipped_occurrences ?? [])].sort((x, y) => x.date.localeCompare(y.date))
        const close = () => setDetailAbono(null)
        const title = `${a.clients?.name ?? 'Cliente'} · ${DAY_LABELS[a.day_of_week]} ${hhmm(a.start_time)}`
        const body = (
          <div className="space-y-4">
            {/* Serie */}
            <div className="space-y-1.5 rounded-lg border border-border bg-card p-3.5 text-sm">
              <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">Cliente</span><span className="font-medium">{a.clients?.name ?? '—'}</span></div>
              <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">{term.service}</span><span className="font-medium">{bookable}</span></div>
              {a.professionals?.name && a.services?.name && (
                <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">{term.resource}</span><span className="font-medium">{a.professionals.name}</span></div>
              )}
              <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">Cuándo</span><span className="font-medium capitalize">Todos los {DAY_LABELS[a.day_of_week].toLowerCase()} · {hhmm(a.start_time)}</span></div>
              <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">Duración</span><span className="font-medium">{total != null ? `${total} sesion${total === 1 ? '' : 'es'}` : 'Indefinido'}</span></div>
              <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">{total != null ? 'Sesiones' : 'Generados'}</span><span className="font-medium">{total != null ? `${count} de ${total}` : `${count} turno${count === 1 ? '' : 's'}`}</span></div>
              {/* Último turno REAL de la serie (D-09′): cae siempre en el día de la semana del abono.
                  Antes se mostraba generated_until (frontera de la ventana), que caía cualquier día. */}
              {lastDate && (
                <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">Último</span><span className="font-medium capitalize">{format(parseISO(lastDate), "EEE d 'de' MMM", { locale: es })}</span></div>
              )}
              {/* 'completed' = ya se asignaron todas las sesiones, NO que la serie terminó (los turnos
                  pueden seguir por delante). El copy describe la asignación, no una finalización. */}
              {a.status === 'completed' && (
                <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">Estado</span><span className="font-medium text-primary">Todas las sesiones asignadas</span></div>
              )}
            </div>

            {/* Ocurrencias salteadas (D-06) */}
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" /> Semanas salteadas
              </p>
              {skipped.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguna. Todas las semanas se reservaron sin conflicto.</p>
              ) : (
                <ul className="space-y-1.5">
                  {skipped.map((s, i) => (
                    <li key={`${s.date}-${i}`} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5 text-sm">
                      <span className="capitalize">{format(parseISO(s.date), "EEE d 'de' MMM", { locale: es })}</span>
                      <Badge variant="destructive">{skipReasonES(s.reason)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Acciones de la serie (D-17/D-18/D-21). Viven SOLO acá, dentro del detalle: la tarjeta
                del listado no ofrece ninguna acción destructiva — es fricción deliberada, y acá el
                dueño ya tiene el contexto (día/hora, último turno, sesiones X de N). Tampoco hay
                ninguna acción que devuelva la serie a activa: 'cancelled' es terminal (D-04).
                "Copiar link de baja" sigue siendo el ÚNICO lugar donde el dueño obtiene el link, pero
                ahora la credencial la entrega el servidor recién al tocar el botón (WR-07). */}
            <div className="space-y-2 border-t border-border pt-4">
              <Button variant="outline" size="sm" className="w-full gap-1.5 sm:w-auto" onClick={() => copyCancelLink(a)} disabled={copyingLink}>
                <Copy className="w-3.5 h-3.5" /> {copyingLink ? 'Copiando...' : 'Copiar link de baja'}
              </Button>
              <p className="text-xs text-muted-foreground">Mandáselo por WhatsApp si tu cliente no tiene mail cargado: desde ese link puede darse de baja solo.</p>

              {a.status !== 'cancelled' ? (
                <div className="space-y-2 pt-2">
                  {/* Se muestra también para 'completed' (D-21): sirve para cancelar de un saque los
                      turnos futuros que le queden a un finito que ya asignó sus N sesiones. */}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full gap-1.5 sm:w-auto"
                    onClick={() => {
                      // Primero se cierra el detalle y recién después se abre la confirmación: no se
                      // anidan modales.
                      setDetailAbono(null)
                      setCancelTarget(a)
                    }}
                  >
                    <Ban className="w-3.5 h-3.5" /> Dar de baja
                  </Button>
                </div>
              ) : (
                <p className="pt-2 text-xs text-muted-foreground">
                  Serie dada de baja
                  {a.cancelled_at ? <> el <span className="capitalize">{format(parseISO(a.cancelled_at), "d 'de' MMMM 'de' yyyy", { locale: es })}</span></> : null}. No genera turnos nuevos.
                </p>
              )}
            </div>
          </div>
        )
        return isDesktop ? (
          <Dialog open onOpenChange={(open) => { if (!open) close() }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="capitalize">{title}</DialogTitle>
              </DialogHeader>
              {body}
            </DialogContent>
          </Dialog>
        ) : (
          <Drawer open onOpenChange={(open) => { if (!open) close() }}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle className="capitalize">{title}</DrawerTitle>
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-6">{body}</div>
            </DrawerContent>
          </Drawer>
        )
      })()}

      {/* Confirmación de la baja (D-19). Nivel SIMPLE del ConfirmDialog (sin palabra a tipear): escribir
          una palabra para confirmar es fricción excesiva para una acción rutinaria del negocio, pero
          sin confirmación tampoco va. La descripción dice el número REAL de turnos que se cancelan y
          hasta cuándo — es refuerzo de UX: la autorización de verdad vive en el endpoint. */}
      {cancelTarget && (() => {
        const t = cancelTarget
        const n = futureTurnoCounts[t.id] ?? 0
        const last = lastFutureDates[t.id] ?? null
        const description =
          n > 0
            ? `Se cancelan ${n} turno${n === 1 ? '' : 's'} futuro${n === 1 ? '' : 's'} de esta serie${last ? `, el último el ${format(parseISO(last), "d 'de' MMMM", { locale: es })}` : ''}. Esta acción no se puede deshacer.`
            : 'No quedan turnos futuros por cancelar. La serie deja de generar turnos nuevos. Esta acción no se puede deshacer.'
        return (
          <ConfirmDialog
            open
            onOpenChange={(o) => { if (!o) setCancelTarget(null) }}
            title={`¿Dar de baja el turno fijo de ${t.clients?.name ?? 'este cliente'}?`}
            description={description}
            risk="alto"
            confirmLabel="Dar de baja"
            destructive
            onConfirm={confirmCancel}
          />
        )
      })()}

      {/* Form de alta del abono (día de la semana + hora, sin fecha). Al crear, refresca la lista. */}
      <NuevoAbonoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        business={business}
        clients={clients}
        services={services}
        professionals={professionals}
        locations={locations}
        onCreated={() => router.refresh()}
      />
    </div>
  )
}
