'use client'

import { useState, useEffect } from 'react'
import { format, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import type { PublicBusiness, Service, Professional, TimeBlock } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Check, Clock, DollarSign, ChevronRight, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  business: PublicBusiness
  services: Service[]
  professionals: Professional[]
  timeBlocks: TimeBlock[]
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

export function BookingClient({ business, services, professionals, timeBlocks }: Props) {
  const [step, setStep] = useState(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedPro, setSelectedPro] = useState<Professional | null | 'none'>('none')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const openDays = [...new Set(timeBlocks.map(b => b.day_of_week))]
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

  function isDateDisabled(date: Date) {
    if (isBefore(date, startOfDay(new Date()))) return true
    return !openDays.includes(date.getDay())
  }

  async function handleDateSelect(date: Date | undefined) {
    if (!date || !selectedService) return
    setSelectedDate(date)
    setSelectedTime('')
    setLoadingSlots(true)

    const dayBlocks = timeBlocks.filter(b => b.day_of_week === date.getDay())
    if (dayBlocks.length === 0) {
      setAvailableSlots([])
      setLoadingSlots(false)
      return
    }

    const dateStr = format(date, 'yyyy-MM-dd')
    const proId = selectedPro && selectedPro !== 'none' ? (selectedPro as Professional).id : null

    // Disponibilidad server-side: el anon ya NO puede leer appointments (RLS), así que la
    // sirve /api/booking/availability (service role) devolviendo solo los slots OCUPADOS
    // (time/status/expires_at, sin datos del cliente) para este negocio+fecha+profesional.
    const busyTimes = new Set<string>()
    try {
      const params = new URLSearchParams({ slug: business.slug, date: dateStr })
      if (proId) params.set('professionalId', proId)
      const res = await fetch(`/api/booking/availability?${params.toString()}`)
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        for (const b of (data.busy as { time: string }[])) busyTimes.add(b.time.slice(0, 5))
      }
    } catch (e) {
      console.error('availability error:', e)
    }

    // Marca de slot ocupado por inicio exacto (consistente con el índice 011, que protege el
    // mismo time de inicio por profesional). El solapamiento por distinta duración sigue
    // siendo la limitación conocida de la etapa 1.
    const duration = selectedService.duration_minutes
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const isToday = dateStr === todayStr
    const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1

    const slots: string[] = []
    for (const block of dayBlocks.sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const openMin = timeToMinutes(block.start_time)
      const closeMin = timeToMinutes(block.end_time)
      for (let t = openMin; t + duration <= closeMin; t += duration) {
        if (nowMinutes >= 0 && t <= nowMinutes) continue
        const slotTime = minutesToTime(t)
        if (busyTimes.has(slotTime)) continue
        slots.push(slotTime)
      }
    }

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
          clientName,
          clientPhone: clientPhone || null,
          clientEmail: clientEmail || null,
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

    setSubmitting(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-primary text-primary-foreground">
            <Check className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">¡Turno confirmado!</h1>
          <p className="text-muted-foreground mb-6">
            Tu turno en <strong className="text-foreground">{business.name}</strong> fue registrado.
          </p>
          <div className="rounded-xl p-4 text-left space-y-2 mb-6 bg-card border border-border">
            <p className="text-sm text-muted-foreground">Servicio: <span className="text-foreground">{selectedService?.name}</span></p>
            <p className="text-sm text-muted-foreground">
              Fecha: <span className="text-foreground">{selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span>
            </p>
            <p className="text-sm text-muted-foreground">Hora: <span className="text-foreground">{selectedTime}</span></p>
            {selectedPro && selectedPro !== 'none' && (
              <p className="text-sm text-muted-foreground">Profesional: <span className="text-foreground">{(selectedPro as Professional).name}</span></p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Te contactaremos para confirmar tu reserva.</p>
        </div>
      </div>
    )
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
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepsLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                step >= i + 1 ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
              )}>
                {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < stepsLabels.length - 1 && (
                <div className={cn('h-px w-6 sm:w-10 transition-colors', step > i + 1 ? 'bg-primary/40' : 'bg-border')} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 - Service */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold mb-4 font-[family-name:var(--font-heading)]">¿Qué servicio necesitás?</h2>
            {services.map(service => (
              <button
                key={service.id}
                onClick={() => { setSelectedService(service); setStep(2) }}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-md border transition-colors text-left',
                  selectedService?.id === service.id
                    ? 'border-primary bg-primary/[0.08]'
                    : 'border-border bg-card hover:border-primary'
                )}
              >
                <div>
                  <p className="font-medium text-sm">{service.name}</p>
                  {service.description && <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {service.duration_minutes} min
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> ${Number(service.price).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
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
                <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary text-primary-foreground font-semibold text-sm flex-shrink-0">
                  {pro.name.charAt(0).toUpperCase()}
                </div>
                <p className="font-medium text-sm">{pro.name}</p>
              </button>
            ))}
          </div>
        )}

        {/* Step 3 - Date & time */}
        {step === 3 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 font-[family-name:var(--font-heading)]">¿Cuándo querés venir?</h2>
            <div className="flex justify-center mb-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={isDateDisabled}
                locale={es}
                className="rounded-md border border-border bg-card p-3"
              />
            </div>

            {selectedDate && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Horarios disponibles — {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                </p>
                {loadingSlots ? (
                  <p className="text-center text-muted-foreground text-sm py-4">Cargando horarios...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">No hay horarios disponibles para este día</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map(slot => (
                      <button
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        className={cn(
                          'py-2 px-3 rounded-md text-sm font-medium transition-colors border',
                          selectedTime === slot
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border bg-card hover:border-primary'
                        )}
                      >
                        {slot}
                      </button>
                    ))}
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
      </div>
    </div>
  )
}
