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
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Plus, Minus, Repeat, Clock, CalendarClock, AlertTriangle, Check } from 'lucide-react'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { NuevoAbonoForm } from '@/components/dashboard/nuevo-abono-form'

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
  clients: { name: string } | null
  services: { name: string } | null
  professionals: { name: string } | null
}

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

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
  clients: Client[]
  services: Service[]
  professionals: Professional[]
  locations: Location[]
}

export function AbonosClient({ business, abonos, turnoCounts, lastTurnoDates, clients, services, professionals, locations }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const term = resolveVertical(business).terminology

  const [formOpen, setFormOpen] = useState(false)
  const [detailAbono, setDetailAbono] = useState<AbonoRow | null>(null)

  // Se listan los abonos vigentes: activos + completados (finitos que ya juntaron sus N sesiones, D-07′;
  // siguen teniendo turnos en la agenda y el dueño necesita verlos). Los cancelados no se listan.
  const visibleAbonos = useMemo(() => abonos.filter((a) => a.status !== 'cancelled'), [abonos])

  // ── Control de ventana de generación (abono_window_weeks, D-07) ────────────────────────────────
  const [windowWeeks, setWindowWeeks] = useState<number>(business.abono_window_weeks ?? 8)
  const [savingWindow, setSavingWindow] = useState(false)
  async function saveWindow() {
    const weeks = Math.floor(windowWeeks)
    if (!Number.isFinite(weeks) || weeks < 1) { toast.error('Ingresá un número de semanas mayor o igual a 1'); return }
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

      {/* Lista de abonos activos */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold text-sm">Tus abonos</p>
          <p className="text-xs text-muted-foreground mt-0.5">Tocá un abono para ver la serie y las semanas salteadas.</p>
        </div>

        {visibleAbonos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-2">
            <Repeat className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Todavía no tenés abonos</p>
            <p className="text-xs text-muted-foreground">Creá uno para reservar automáticamente el mismo día y hora todas las semanas.</p>
            <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={() => setFormOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Nuevo abono
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleAbonos.map((a) => {
              const count = turnoCounts[a.id] ?? 0
              const skipped = a.skipped_occurrences?.length ?? 0
              const bookable = a.services?.name || a.professionals?.name || '—'
              const total = a.total_occurrences // null = indefinido
              const isCompleted = a.status === 'completed'
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
                        {isCompleted ? (
                          <Badge variant="outline" className="gap-1"><Check className="w-3 h-3" />Completado</Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <CalendarClock className="w-3 h-3" />
                            {total != null ? `${count} de ${total}` : `${count} turno${count === 1 ? '' : 's'}`}
                          </Badge>
                        )}
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
              disabled={windowWeeks <= 1}
              onClick={() => setWindowWeeks((w) => Math.max(1, w - 1))}
              className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min={1}
              value={windowWeeks}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setWindowWeeks(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="h-9 w-14 border-x border-border bg-transparent text-center text-sm tabular-nums outline-none focus:bg-secondary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              aria-label="Semanas hacia adelante"
            />
            <button
              type="button"
              aria-label="Más semanas"
              onClick={() => setWindowWeeks((w) => w + 1)}
              className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
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
              {a.status === 'completed' && (
                <div className="flex gap-2"><span className="w-24 shrink-0 text-muted-foreground">Estado</span><span className="font-medium text-primary">Completado</span></div>
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
