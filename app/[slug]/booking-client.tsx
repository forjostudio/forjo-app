'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isSameMonth, isSameDay, isBefore } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import type { PublicBusiness, Service, Professional, TimeBlock } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  business: PublicBusiness
  services: Service[]
  professionals: Professional[]
  timeBlocks: TimeBlock[]
  // Excepciones por fecha (capa 1): anular o cambiar el horario de un día puntual.
  exceptions: { date: string; closed: boolean; start_time: string | null; end_time: string | null }[]
  // Consultorios/sucursales activos (capa 2a). Los slots se etiquetan con su consultorio.
  locations: { id: string; name: string; address: string | null }[]
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

export function BookingClient({ business, services, professionals, timeBlocks, exceptions, locations }: Props) {
  const [step, setStep] = useState(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedPro, setSelectedPro] = useState<Professional | null | 'none'>('none')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [availableSlots, setAvailableSlots] = useState<{ time: string; locationId: string | null }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
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
  // Excepciones indexadas por fecha (yyyy-MM-dd) para resolver cada día del calendario.
  const exceptionByDate = useMemo(() => {
    const m = new Map<string, { closed: boolean; start_time: string | null; end_time: string | null }>()
    for (const e of exceptions) m.set(e.date, e)
    return m
  }, [exceptions])
  // ¿El día está abierto? Una excepción manda sobre la grilla semanal.
  const isDayOpen = (d: Date) => {
    const ex = exceptionByDate.get(format(d, 'yyyy-MM-dd'))
    return ex ? !ex.closed : openDaysSet.has(d.getDay())
  }
  // Grilla del mes mostrado, en semanas de lunes a domingo.
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(calMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [calMonth])
  const thisMonth = startOfMonth(new Date())

  async function handleDateSelect(date: Date | undefined) {
    if (!date || !selectedService) return
    setSelectedDate(date)
    setSelectedTime('')
    setSelectedLocationId(null)
    setLoadingSlots(true)

    const dateStr = format(date, 'yyyy-MM-dd')
    const ex = exceptionByDate.get(dateStr)
    // Consultorio del servicio (opcional): se usa como consultorio del slot cuando el bloque
    // de horario no tiene uno propio (Capa 2a). El bloque manda si está asignado.
    const svcLoc = selectedService.location_id ?? null
    // Excepción del día: cerrado → sin slots; horario especial → ese rango; si no, la grilla semanal.
    // Cada bloque lleva su consultorio (location_id) para etiquetar los slots.
    const dayBlocks: { start_time: string; end_time: string; location_id: string | null }[] = ex
      ? ((!ex.closed && ex.start_time && ex.end_time) ? [{ start_time: ex.start_time, end_time: ex.end_time, location_id: svcLoc }] : [])
      : timeBlocks.filter(b => b.day_of_week === date.getDay()).map(b => ({ start_time: b.start_time, end_time: b.end_time, location_id: b.location_id ?? svcLoc }))
    if (dayBlocks.length === 0) {
      setAvailableSlots([])
      setLoadingSlots(false)
      return
    }

    const proId = selectedPro && selectedPro !== 'none' ? (selectedPro as Professional).id : null

    // Disponibilidad server-side: el anon ya NO puede leer appointments (RLS), así que la
    // sirve /api/booking/availability (service role) devolviendo solo los slots OCUPADOS
    // (time/status/expires_at, sin datos del cliente) para este negocio+fecha+profesional.
    let busy: { time: string; duration_minutes?: number | null }[] = []
    try {
      const params = new URLSearchParams({ slug: business.slug, date: dateStr })
      if (proId) params.set('professionalId', proId)
      const res = await fetch(`/api/booking/availability?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) busy = data.busy || []
    } catch (e) {
      console.error('availability error:', e)
    }

    // Un slot [inicio, fin) está ocupado si se SOLAPA con algún turno ocupado (consistente con
    // la exclusion constraint 013, que protege el rango por profesional).
    const duration = selectedService.duration_minutes
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const isToday = dateStr === todayStr
    const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1

    const slots: { time: string; locationId: string | null }[] = []
    const seen = new Set<string>()
    for (const block of [...dayBlocks].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const openMin = timeToMinutes(block.start_time)
      const closeMin = timeToMinutes(block.end_time)
      for (let t = openMin; t + duration <= closeMin; t += duration) {
        if (nowMinutes >= 0 && t <= nowMinutes) continue
        const slotEnd = t + duration
        const conflict = busy.some(b => {
          const bStart = timeToMinutes(b.time)
          const bEnd = bStart + (Number(b.duration_minutes) || 30)
          return t < bEnd && slotEnd > bStart
        })
        if (conflict) continue
        const time = minutesToTime(t)
        const key = `${time}|${block.location_id ?? ''}`
        if (seen.has(key)) continue
        seen.add(key)
        slots.push({ time, locationId: block.location_id })
      }
    }
    slots.sort((a, b) => a.time.localeCompare(b.time))

    setAvailableSlots(slots)
    setLoadingSlots(false)
  }

  async function handleConfirm() {
    if (!clientName || !selectedService || !selectedDate || !selectedTime) return
    setSubmitting(true)

    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const proId = selectedPro && selectedPro !== 'none' ? (selectedPro as Professional).id : null

    // reCAPTCHA token (solo reservas sin seña). Lo generamos acá; la VERIFICACIÓN la hace
    // el server dentro de /api/booking/create (fail-closed, no bypasseable). Si no se puede
    // generar, el server decide según la config del negocio.
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

    // Creación server-side. El cliente ya NO inserta con anon key: el endpoint valida
    // reCAPTCHA, que service/professional sean del negocio, re-chequea disponibilidad e
    // inserta capturando la constraint anti doble-booking.
    let appointmentId = ''
    let cancelToken = ''
    try {
      const res = await fetch('/api/booking/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: business.slug,
          serviceId: selectedService.id,
          professionalId: proId,
          date: dateStr,
          time: selectedTime,
          locationId: selectedLocationId,
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

    // No deposit — fire-and-forget notifications
    fetch('/api/notify/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId }),
    }).catch(console.error)

    // Aterrizamos en la página de confirmación dedicada (theme-aware: código, calendario,
    // cómo llegar, WhatsApp). Dejamos submitting en true: la navegación cambia la página.
    if (cancelToken) {
      router.push(`/${business.slug}/turno/${cancelToken}`)
    } else {
      // Fallback raro (sin token): no podemos linkear la confirmación → avisamos y reseteamos.
      setSubmitting(false)
      toast.success('¡Turno confirmado!')
    }
  }

  const stepsLabels = ['Servicio', 'Profesional', 'Fecha y hora', 'Tus datos']

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Bauhaus full-bleed — banda bg-primary (sigue la paleta del negocio) con formas geométricas */}
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
            <h1 className="text-[clamp(28px,7vw,40px)] font-black uppercase tracking-tight leading-none truncate font-[family-name:var(--font-heading)]">{business.name}</h1>
            {business.type && <p className="text-sm text-primary-foreground/80 mt-1.5">{business.type}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 py-8">
        {/* Progreso */}
        <div className="mb-7">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Paso {step} de 4</span>
            <span className="text-xs text-muted-foreground">{stepsLabels[step - 1]}</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }} />
          </div>
        </div>

        {/* Step 1 - Service */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí tu servicio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {services.map(service => (
                <button
                  key={service.id}
                  onClick={() => { setSelectedService(service); setStep(2) }}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    selectedService?.id === service.id
                      ? 'border-primary bg-primary/[0.06]'
                      : 'border-border bg-card hover:border-primary'
                  )}
                >
                  <p className="font-semibold font-[family-name:var(--font-heading)]">{service.name}</p>
                  {service.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{service.description}</p>}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                    <Clock className="w-3.5 h-3.5" /> {service.duration_minutes} min
                  </div>
                  <p className="text-xl font-bold mt-2 font-[family-name:var(--font-heading)]">${Number(service.price).toLocaleString('es-AR')}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 - Professional */}
        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold mb-4 font-[family-name:var(--font-heading)]">¿Con quién querés atenderte?</h2>
            <button
              onClick={() => { setSelectedPro('none'); setStep(3) }}
              className="w-full flex items-center gap-3 p-4 rounded-md border border-border bg-card hover:border-primary transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-muted-foreground text-sm flex-shrink-0">
                ?
              </div>
              <div>
                <p className="font-medium text-sm">Sin preferencia</p>
                <p className="text-xs text-muted-foreground">Se asignará automáticamente</p>
              </div>
            </button>
            {professionals.map(pro => (
              <button
                key={pro.id}
                onClick={() => { setSelectedPro(pro); setStep(3) }}
                className="w-full flex items-center gap-3 p-4 rounded-md border border-border bg-card hover:border-primary transition-colors text-left"
              >
                {pro.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pro.photo_url} alt={pro.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary text-primary-foreground font-semibold text-sm flex-shrink-0">
                    {pro.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <p className="font-medium text-sm">{pro.name}</p>
              </button>
            ))}
          </div>
        )}

        {/* Step 3 - Date & time */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí día y horario</h2>

            {/* Día — calendario mensual con cuadrados y navegación de mes */}
            <p className="text-sm font-semibold mb-2 font-[family-name:var(--font-heading)]">Día</p>
            <div className="rounded-lg border border-border bg-card p-3">
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
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
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
                  const disabled = !inMonth || isPast || !isOpen
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

            {/* Horario */}
            {selectedDate && (
              <div className="mt-6">
                <p className="text-sm font-semibold mb-2 font-[family-name:var(--font-heading)]">Horario</p>
                {loadingSlots ? (
                  <p className="text-center text-muted-foreground text-sm py-4">Cargando horarios...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">No hay horarios disponibles para este día</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map(slot => {
                      const sel = selectedTime === slot.time && selectedLocationId === slot.locationId
                      const locName = slot.locationId ? (locations.find(l => l.id === slot.locationId)?.name ?? null) : null
                      return (
                        <button
                          key={`${slot.time}|${slot.locationId ?? ''}`}
                          onClick={() => { setSelectedTime(slot.time); setSelectedLocationId(slot.locationId) }}
                          className={cn(
                            'py-2 px-3 rounded-lg text-sm font-medium transition-colors border flex flex-col items-center leading-tight',
                            sel ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:border-primary'
                          )}
                        >
                          <span>{slot.time}</span>
                          {locName && <span className={cn('text-[10px] font-normal truncate max-w-full', sel ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{locName}</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <Button
              className="w-full mt-6"
              disabled={!selectedDate || !selectedTime}
              onClick={() => setStep(4)}
            >
              Continuar
            </Button>
          </div>
        )}

        {/* Step 4 - Client data */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold mb-2 font-[family-name:var(--font-heading)]">Tus datos</h2>

            <div className="rounded-md p-4 space-y-1 text-sm mb-4 bg-card border border-border border-l-4 border-l-primary">
              <p className="text-muted-foreground">Servicio: <span className="text-foreground">{selectedService?.name}</span></p>
              <p className="text-muted-foreground">
                {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} a las <strong className="text-foreground">{selectedTime}</strong>
              </p>
              {selectedLocationId && (
                <p className="text-muted-foreground">Consultorio: <span className="text-foreground">{locations.find(l => l.id === selectedLocationId)?.name}</span></p>
              )}
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
                  placeholder="¿Algo que quieras avisar? (alergias, preferencias, etc.)"
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
                ? (requireDeposit ? 'Iniciando pago...' : 'Confirmando...')
                : (requireDeposit ? `Pagar seña $${Number(business.deposit_amount).toLocaleString('es-AR')}` : 'Confirmar turno')}
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

        {/* Footer — hecho con Forjo Studio */}
        <div className="flex items-center justify-center gap-2 mt-10 text-xs text-muted-foreground">
          <svg viewBox="0 0 64 80" className="w-3 h-[0.95rem]" aria-hidden="true">
            <rect x="6" y="6" width="14" height="68" fill="currentColor" />
            <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
            <path d="M20 34 L50 34 L36 48 L20 48 Z" fill="#2a5fa5" />
            <circle cx="56" cy="13" r="6" fill="#f4c543" />
          </svg>
          <span>
            hecho con{' '}
            <a href="https://www.forjo.studio" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              <span className="font-semibold text-foreground font-[family-name:var(--font-heading)]">Forjo</span> Studio
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}
