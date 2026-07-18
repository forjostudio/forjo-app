'use client'

// ── Booking público del vertical CANCHAS (D-02) ──────────────────────────────────────
// Client component NUEVO, hermano de BookingClient (app/[slug]/booking-client.tsx): comparte
// TODO el lenguaje visual (hero Bauhaus, barra de progreso, calendario mensual, grilla de
// slots, resumen border-l-primary, formulario, footer) — solo cambia el CONTENIDO de los
// pasos: 3 pasos (Cancha → Fecha y hora → Tus datos), sin profesional ni picker de duración
// (la duración es la FIJA de la cancha) ni selector de sede (el eje reservable ES la cancha).
//
// Reusa /api/booking/availability (professionalId = cancha.id → hereda el bloqueo por espacio
// compartido, ESPACIO-02) y /api/booking/create con { professionalId: cancha.id } SIN serviceId
// ni precio (D-03): el server deriva el service de la cancha (Plan 02). El precio mostrado y el
// total salen del propio price de la cancha (public_canchas — ALQUILER-04).

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isSameMonth, isSameDay, isBefore, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import type { PublicBusiness, PublicCancha, TimeBlock } from '@/lib/types'
import { effectiveBookingCutoff } from '@/lib/booking-window'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getVerticalLabel } from '@/lib/verticals'

interface Props {
  business: PublicBusiness
  canchas: PublicCancha[]
  timeBlocks: TimeBlock[]
  // Excepciones por fecha (capa 1): anular o cambiar el horario de un día puntual.
  // En canchas usamos las excepciones GLOBALES (location_id null); las por-consultorio
  // no aplican (el eje reservable es la cancha, no un consultorio).
  exceptions: { date: string; closed: boolean; start_time: string | null; end_time: string | null; location_id: string | null }[]
  // Sedes activas del negocio. En v0.13 el flujo de canchas NO expone multi-sede en el
  // picker (un único eje reservable = la cancha), pero se recibe para paridad de props.
  locations: { id: string; name: string; address: string | null; phone: string | null }[]
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export function CanchasBookingClient({ business, canchas, timeBlocks, exceptions }: Props) {
  const [step, setStep] = useState(1)
  const [selectedCancha, setSelectedCancha] = useState<PublicCancha | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = useState('')
  const [calMonth, setCalMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Auto-scroll de navegación (UX) — mismo patrón que BookingClient ─────────────────
  // Al avanzar/retroceder de paso llevamos el inicio del paso al tope; al elegir un día
  // bajamos a la grilla de horarios. Respeta prefers-reduced-motion (sin smooth).
  const stepTopRef = useRef<HTMLDivElement>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLDivElement>(null)
  const didMountRef = useRef(false)
  const smoothScrollTo = (el: HTMLElement | null, block: ScrollLogicalPosition = 'start') => {
    if (!el || typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() =>
      requestAnimationFrame(() => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block }))
    )
  }
  // En el paso de día/hora centramos el calendario; en los demás vamos al inicio del paso.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (step === 2 && calRef.current) smoothScrollTo(calRef.current, 'center')
    else smoothScrollTo(stepTopRef.current)
  }, [step])
  // Al elegir día y tener los horarios cargados, baja a la grilla de horarios.
  useEffect(() => {
    if (selectedDate && !loadingSlots) smoothScrollTo(timeRef.current)
  }, [selectedDate, loadingSlots])
  const router = useRouter()

  const requireDeposit = Boolean(business.require_deposit) && Number(business.deposit_amount) > 0
  const siteKey = business.recaptcha_site_key || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY

  useEffect(() => {
    if (!requireDeposit && siteKey) {
      const existing = document.querySelector(`script[data-recaptcha="${siteKey}"]`)
      if (existing) return
      const script = document.createElement('script')
      script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`
      script.setAttribute('data-recaptcha', siteKey)
      document.head.appendChild(script)
    }
  }, [requireDeposit, siteKey])

  // Días de la semana abiertos (de los time_blocks) para deshabilitar el resto en el calendario.
  const openDaysSet = useMemo(() => new Set(timeBlocks.map(b => b.day_of_week)), [timeBlocks])
  // Excepciones GLOBALES por fecha (location_id null): en canchas solo esas aplican al calendario.
  type Exc = { closed: boolean; start_time: string | null; end_time: string | null }
  const globalExcByDate = useMemo(() => {
    const m = new Map<string, Exc>()
    for (const e of exceptions) if (!e.location_id) m.set(e.date, e)
    return m
  }, [exceptions])
  // ¿El día está abierto? Si hay cierre global manda; si no, abre según la grilla semanal.
  const isDayOpen = (d: Date) => {
    const ds = format(d, 'yyyy-MM-dd')
    const g = globalExcByDate.get(ds)
    if (g) return !g.closed
    return openDaysSet.has(d.getDay())
  }
  // Grilla del mes mostrado, en semanas de lunes a domingo.
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(calMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [calMonth])
  const thisMonth = startOfMonth(new Date())
  // Ventana de reserva pública (BOOK-WINDOW-02): corte inclusive en hora AR (helper del Plan 01).
  // Cap de UX — la autoridad real es el backstop server (D-08). null = sin límite. Gemelo de booking-client.
  const cutoff = useMemo(() => effectiveBookingCutoff(business), [business])
  const cutoffMonth = cutoff ? startOfMonth(cutoff) : null

  async function handleDateSelect(date: Date | undefined) {
    if (!date || !selectedCancha) return
    setSelectedDate(date)
    setSelectedTime('')
    setLoadingSlots(true)

    const dateStr = format(date, 'yyyy-MM-dd')
    const weekly = timeBlocks.filter(b => b.day_of_week === date.getDay())
    const globalEx = globalExcByDate.get(dateStr)
    const dayBlocks: { start_time: string; end_time: string }[] = []
    if (globalEx?.closed) {
      // Cierre global: sin slots ese día.
    } else if (globalEx && !globalEx.closed && globalEx.start_time && globalEx.end_time) {
      // Horario especial global: reemplaza el día por ese rango.
      dayBlocks.push({ start_time: globalEx.start_time, end_time: globalEx.end_time })
    } else {
      // Grilla semanal tal cual (canchas: sin consultorios ni location_ids por bloque).
      for (const b of weekly) dayBlocks.push({ start_time: b.start_time, end_time: b.end_time })
    }
    if (dayBlocks.length === 0) {
      setAvailableSlots([])
      setLoadingSlots(false)
      return
    }

    // Disponibilidad server-side: /api/booking/availability con professionalId = cancha.id
    // (hereda el bloqueo por espacio compartido, ESPACIO-02). Devuelve { busy, full }; una
    // respuesta vieja sin `full` se trata como [] (defensivo). Se consume IGUAL que BookingClient.
    let busy: { time: string; duration_minutes?: number | null }[] = []
    let full: string[] = []
    try {
      const params = new URLSearchParams({ slug: business.slug, date: dateStr, professionalId: selectedCancha.id })
      const res = await fetch(`/api/booking/availability?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        busy = data.busy || []
        full = data.full || []
      }
    } catch (e) {
      console.error('availability error:', e)
    }

    // Cómputo de slots idéntico al BookingClient: la duración del slot es la FIJA de la cancha
    // (D-02/D-06, sin picker); un slot [inicio, fin) se descarta si solapa con un turno ocupado
    // (con buffer) o si el server lo marcó `full`.
    const duration = selectedCancha.duration_minutes
    const buffer = Number(business.buffer_minutes) || 0
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const isToday = dateStr === todayStr
    const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1

    const slots: string[] = []
    const seen = new Set<string>()
    for (const block of [...dayBlocks].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const openMin = timeToMinutes(block.start_time)
      const closeMin = timeToMinutes(block.end_time)
      for (let t = openMin; t + duration <= closeMin; t += duration) {
        if (nowMinutes >= 0 && t <= nowMinutes) continue
        const slotEnd = t + duration
        const conflict = busy.some(b => {
          const bStart = timeToMinutes(b.time)
          const bEnd = bStart + (Number(b.duration_minutes) || duration)
          return t < bEnd + buffer && slotEnd > bStart - buffer
        })
        if (conflict) continue
        const time = minutesToTime(t)
        if (full.includes(time)) continue
        if (seen.has(time)) continue
        seen.add(time)
        slots.push(time)
      }
    }
    slots.sort((a, b) => a.localeCompare(b))

    setAvailableSlots(slots)
    setLoadingSlots(false)
  }

  async function handleConfirm() {
    if (!clientName || !selectedCancha || !selectedDate || !selectedTime) return
    setSubmitting(true)

    const dateStr = format(selectedDate, 'yyyy-MM-dd')

    // reCAPTCHA token (solo reservas sin seña). Lo generamos acá; la VERIFICACIÓN la hace
    // el server dentro de /api/booking/create (fail-closed).
    let recaptchaToken = ''
    if (!requireDeposit) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gr = (window as any).grecaptcha
        if (siteKey && gr) {
          recaptchaToken = await new Promise<string>((resolve, reject) =>
            gr.ready(() => gr.execute(siteKey, { action: 'book' }).then(resolve).catch(reject))
          )
        }
      } catch (e) {
        console.error('reCAPTCHA execute error:', e)
      }
    }

    // Creación server-side. El cliente manda professionalId = cancha.id y NUNCA serviceId ni
    // precio (D-03): el server deriva el service de la cancha (Plan 02) → precio+duración fijos.
    let appointmentId = ''
    let cancelToken = ''
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: business.slug,
          professionalId: selectedCancha.id,
          date: dateStr,
          time: selectedTime,
          locationId: null,
          clientName,
          clientPhone: clientPhone || null,
          clientEmail: clientEmail || null,
          notes: clientNotes || null,
          recaptchaToken,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setSubmitting(false)
        if (data?.error === 'slot_taken') {
          toast.error('Ese horario se acaba de ocupar, elegí otro.')
        } else if (data?.error === 'recaptcha_failed') {
          toast.error('No pudimos verificar que no seas un bot. Recargá la página e intentá de nuevo.')
        } else {
          toast.error('Error al confirmar. Intentá de nuevo.')
        }
        return
      }
      appointmentId = data.appointmentId
      cancelToken = data.cancelToken || ''
    } catch (e) {
      setSubmitting(false)
      console.error('booking create error:', e)
      toast.error('No pudimos conectar. Revisá tu conexión e intentá de nuevo.')
      return
    }

    if (requireDeposit) {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, businessSlug: business.slug }),
      })
      const data = await res.json()
      if (data.ok && data.url) {
        window.location.href = data.url
      } else {
        setSubmitting(false)
        toast.error(data.error || 'Error al iniciar el pago')
      }
      return
    }

    // Sin seña — notificaciones fire-and-forget y a la confirmación.
    fetch('/api/notify/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    }).catch(console.error)

    if (cancelToken) {
      router.push(`/${business.slug}/turno/${cancelToken}`)
    } else {
      setSubmitting(false)
      toast.success('¡Reserva confirmada!')
    }
  }

  const stepsLabels = ['Cancha', 'Fecha y hora', 'Tus datos']
  const priceLabel = selectedCancha ? `$${Number(selectedCancha.price).toLocaleString('es-AR')}` : ''

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Bauhaus full-bleed — idéntico al BookingClient (sigue la paleta del negocio) */}
      <div className="relative overflow-hidden bg-primary text-primary-foreground">
        <svg className="absolute inset-0 w-full h-full opacity-90 pointer-events-none" viewBox="0 0 760 200" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <circle cx="690" cy="40" r="70" fill="rgba(255,255,255,.10)" />
          <rect x="600" y="120" width="90" height="90" fill="rgba(0,0,0,.10)" />
          <path d="M720 140 L760 140 L760 200 Z" fill="rgba(255,255,255,.08)" />
        </svg>
        <div className="max-w-lg mx-auto px-6 py-10 relative flex items-center gap-4">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt={business.name}
              className="w-14 h-14 rounded-xl object-cover border border-white/20 flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-white/15 font-[family-name:var(--font-heading)] font-black text-2xl flex-shrink-0">
              {business.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-[clamp(22px,6vw,34px)] font-black uppercase tracking-tight leading-[1.05] break-words font-[family-name:var(--font-heading)]">{business.name}</h1>
            {/* Categoría del negocio: el texto libre `type` si existe, o el label del rubro como
                fallback (D-03) — gemelo idéntico al de booking-client. Interpolado en JSX → auto-escape. */}
            {(business.type || getVerticalLabel(business)) && <p className="text-sm text-primary-foreground/80 mt-1.5">{business.type || getVerticalLabel(business)}</p>}
          </div>
        </div>
      </div>

      <div ref={stepTopRef} className="max-w-lg mx-auto px-6 py-8 scroll-mt-4">
        {/* Progreso — 3 pasos */}
        <div className="mb-7">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Paso {step} de 3</span>
            <span className="text-xs text-muted-foreground">{stepsLabels[step - 1]}</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(step / 3) * 100}%` }} />
          </div>
        </div>

        {/* Step 1 - Cancha */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí tu cancha</h2>
            {canchas.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm font-semibold text-foreground">Todavía no hay canchas disponibles</p>
                <p className="mt-1 text-sm text-muted-foreground">Este negocio aún no cargó sus canchas. Escribile para consultar disponibilidad.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {canchas.map(cancha => (
                  <button
                    key={cancha.id}
                    onClick={() => { setSelectedCancha(cancha); setSelectedDate(undefined); setSelectedTime(''); setStep(2) }}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors',
                      selectedCancha?.id === cancha.id
                        ? 'border-primary bg-primary/[0.06]'
                        : 'border-border bg-card hover:border-primary'
                    )}
                  >
                    {/* Tarjeta: izq = nombre; der = precio propio + duración fija. La vista
                        public_canchas no expone descripción → sin bloque de descripción. */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold font-[family-name:var(--font-heading)]">{cancha.name}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold leading-tight font-[family-name:var(--font-heading)]">${Number(cancha.price).toLocaleString('es-AR')}</p>
                        <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                          <Clock className="w-3 h-3" /> {cancha.duration_minutes} min
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2 - Date & time */}
        {step === 2 && selectedCancha && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí día y horario</h2>

            {/* Resumen de la cancha elegida (nombre · duración fija · precio propio) */}
            <div className="mb-4 rounded-md bg-card border border-border border-l-4 border-l-primary p-3 text-sm">
              <p className="text-muted-foreground">
                Cancha: <span className="text-foreground">{selectedCancha.name}</span> · {selectedCancha.duration_minutes} min · <span className="text-foreground">{priceLabel}</span>
              </p>
            </div>

            {/* Día — calendario mensual (verbatim del BookingClient) */}
            <p className="text-sm font-semibold mb-2 font-[family-name:var(--font-heading)]">Día</p>
            <div ref={calRef} className="rounded-lg border border-border bg-card p-3 scroll-mt-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setCalMonth(m => addMonths(m, -1))}
                  disabled={isSameMonth(calMonth, thisMonth)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold capitalize font-[family-name:var(--font-heading)]">{format(calMonth, 'MMMM yyyy', { locale: es })}</span>
                <button
                  type="button"
                  onClick={() => setCalMonth(m => addMonths(m, 1))}
                  disabled={cutoffMonth != null && !isBefore(startOfMonth(calMonth), cutoffMonth)}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'].map(w => (
                  <div key={w} className="text-center text-[10px] font-semibold uppercase text-muted-foreground">{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map(d => {
                  const inMonth = isSameMonth(d, calMonth)
                  const isPast = isBefore(d, startOfDay(new Date()))
                  const isOpen = isDayOpen(d)
                  const disabled = !inMonth || isPast || !isOpen || (cutoff != null && isAfter(startOfDay(d), cutoff))
                  const sel = selectedDate != null && isSameDay(d, selectedDate)
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleDateSelect(d)}
                      className={cn(
                        'aspect-square rounded-md text-sm font-medium flex items-center justify-center border transition-colors',
                        sel
                          ? 'bg-primary text-primary-foreground border-primary'
                          : disabled
                            ? 'border-transparent text-muted-foreground/30 cursor-default'
                            : 'border-border bg-card hover:border-primary'
                      )}
                    >
                      {format(d, 'd')}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* D-05: aviso del corte de la ventana de reserva (solo si hay límite). */}
            {cutoff && (
              <p className="mt-2 text-xs text-muted-foreground text-center">Reservas hasta el {format(cutoff, 'dd/MM')}</p>
            )}

            {/* Horario — duración fija de la cancha, sin picker */}
            {selectedDate && (
              <div ref={timeRef} className="mt-6 scroll-mt-4">
                <p className="text-sm font-semibold mb-2 font-[family-name:var(--font-heading)]">Horario</p>
                {loadingSlots ? (
                  <p className="text-center text-muted-foreground text-sm py-4">Cargando horarios...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">No hay horarios disponibles para este día</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {availableSlots.map(time => {
                        const sel = selectedTime === time
                        return (
                          <button
                            key={time}
                            onClick={() => setSelectedTime(time)}
                            className={cn(
                              'py-2 px-3 rounded-lg text-sm font-medium transition-colors border flex flex-col items-center leading-tight',
                              sel ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:border-primary'
                            )}
                          >
                            <span>{time}</span>
                          </button>
                        )
                      })}
                    </div>
                    {/* Sugerencia de 2 turnos consecutivos (D-06): sin lógica nueva, solo ayuda. */}
                    <p className="mt-2 text-xs text-muted-foreground">
                      <strong className="text-foreground">¿Necesitás más tiempo?</strong> Reservá dos horarios seguidos.
                    </p>
                  </>
                )}
              </div>
            )}

            <Button
              className="w-full mt-6"
              disabled={!selectedDate || !selectedTime}
              onClick={() => setStep(3)}
            >
              Continuar
            </Button>
          </div>
        )}

        {/* Step 3 - Client data */}
        {step === 3 && selectedCancha && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-2 font-[family-name:var(--font-heading)]">Tus datos</h2>

            <div className="rounded-md p-4 space-y-1 text-sm mb-4 bg-card border border-border border-l-4 border-l-primary">
              <p className="text-muted-foreground">Cancha: <span className="text-foreground">{selectedCancha.name}</span></p>
              <p className="text-muted-foreground">
                {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} a las <strong className="text-foreground">{selectedTime}</strong>
              </p>
              <p className="text-muted-foreground">
                Total: <strong className="text-foreground">{priceLabel}</strong>
              </p>
              {requireDeposit && (
                <p className="text-muted-foreground">
                  Seña requerida: <strong className="text-foreground">${Number(business.deposit_amount).toLocaleString('es-AR')}</strong>
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Tu nombre completo"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono *</Label>
                <Input
                  type="tel"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="+54 9 11 1234-5678"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notas para el negocio <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Textarea
                  value={clientNotes}
                  onChange={e => setClientNotes(e.target.value)}
                  placeholder="¿Algo que quieras avisar? (equipo, cantidad de jugadores, etc.)"
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>

            <Button
              className="w-full mt-2"
              disabled={!clientName || !clientPhone || !clientEmail || submitting}
              onClick={handleConfirm}
            >
              {submitting
                ? (requireDeposit ? 'Iniciando pago...' : 'Reservando...')
                : (requireDeposit ? `Pagar seña $${Number(business.deposit_amount).toLocaleString('es-AR')}` : 'Reservar cancha')}
            </Button>

            {requireDeposit && (
              <p className="text-xs text-center text-muted-foreground">
                Serás redirigido a MercadoPago para abonar la seña.
              </p>
            )}
          </div>
        )}

        {/* Back button */}
        {step > 1 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-6 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Volver
          </button>
        )}

        {/* Footer — hecho con Forjo Studio (idéntico al BookingClient) */}
        <div className="flex items-center justify-center gap-2 mt-10 text-xs text-muted-foreground">
          <svg viewBox="0 0 64 80" className="w-3 h-[0.95rem]" aria-hidden="true">
            <rect x="6" y="6" width="14" height="68" fill="currentColor" />
            <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
            <path d="M20 34 L50 34 L36 48 L20 48 Z" fill="#2a5fa5" />
            <circle cx="56" cy="13" r="6" fill="#f4c543" />
          </svg>
          <span>
            hecho con{' '}
            <a href="https://www.forjo.studio" target="_blank" rel="noopener noreferrer" className="font-[family-name:var(--font-archivo)] hover:text-foreground transition-colors">
              <span className="font-semibold text-foreground">Forjo</span> Studio
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}
