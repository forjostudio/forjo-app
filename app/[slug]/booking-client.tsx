'use client'

import { useState } from 'react'
import { format, addMinutes, parseISO, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, Service, Professional, BusinessHour } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { Check, Clock, DollarSign, ChevronRight, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  business: Business
  services: Service[]
  professionals: Professional[]
  hours: BusinessHour[]
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

export function BookingClient({ business, services, professionals, hours }: Props) {
  const supabase = createClient()

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

  const openDays = hours.filter(h => h.is_open).map(h => h.day_of_week)

  function isDateDisabled(date: Date) {
    if (isBefore(date, startOfDay(new Date()))) return true
    return !openDays.includes(date.getDay())
  }

  async function handleDateSelect(date: Date | undefined) {
    if (!date || !selectedService) return
    setSelectedDate(date)
    setSelectedTime('')
    setLoadingSlots(true)

    const dayHour = hours.find(h => h.day_of_week === date.getDay())
    if (!dayHour?.is_open || !dayHour.open_time || !dayHour.close_time) {
      setAvailableSlots([])
      setLoadingSlots(false)
      return
    }

    const dateStr = format(date, 'yyyy-MM-dd')
    const { data: existingAppts } = await supabase
      .from('appointments')
      .select('time, services(duration_minutes)')
      .eq('business_id', business.id)
      .eq('date', dateStr)
      .neq('status', 'cancelled')

    const openMin = timeToMinutes(dayHour.open_time)
    const closeMin = timeToMinutes(dayHour.close_time)
    const duration = selectedService.duration_minutes

    const slots: string[] = []
    for (let t = openMin; t + duration <= closeMin; t += duration) {
      const slotEnd = t + duration
      const conflict = (existingAppts || []).some(a => {
        const aStart = timeToMinutes(a.time)
        const aDuration = (a.services as { duration_minutes?: number } | null)?.duration_minutes || 30
        const aEnd = aStart + aDuration
        return t < aEnd && slotEnd > aStart
      })
      if (!conflict) slots.push(minutesToTime(t))
    }

    setAvailableSlots(slots)
    setLoadingSlots(false)
  }

  async function handleConfirm() {
    if (!clientName || !selectedService || !selectedDate || !selectedTime) return
    setSubmitting(true)

    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const proId = selectedPro && selectedPro !== 'none' ? (selectedPro as Professional).id : null

    const { data: client } = await supabase
      .from('clients')
      .insert({
        business_id: business.id,
        name: clientName,
        phone: clientPhone || null,
        email: clientEmail || null,
      })
      .select()
      .single()

    const { error } = await supabase.from('appointments').insert({
      business_id: business.id,
      client_id: client?.id || null,
      client_name: clientName,
      client_phone: clientPhone || null,
      client_email: clientEmail || null,
      service_id: selectedService.id,
      professional_id: proId,
      date: dateStr,
      time: selectedTime,
      status: 'pending',
    })

    setSubmitting(false)
    if (error) {
      toast.error('Error al confirmar. Intentá de nuevo.')
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#1a1714' }}>
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            <Check className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">¡Turno confirmado!</h1>
          <p className="text-gray-400 mb-6">
            Tu turno en <strong className="text-white">{business.name}</strong> fue registrado.
          </p>
          <div className="rounded-xl p-4 text-left space-y-2 mb-6" style={{ backgroundColor: '#252220' }}>
            <p className="text-sm text-gray-400">Servicio: <span className="text-white">{selectedService?.name}</span></p>
            <p className="text-sm text-gray-400">
              Fecha: <span className="text-white">{selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span>
            </p>
            <p className="text-sm text-gray-400">Hora: <span className="text-white">{selectedTime}</span></p>
            {selectedPro && selectedPro !== 'none' && (
              <p className="text-sm text-gray-400">Profesional: <span className="text-white">{(selectedPro as Professional).name}</span></p>
            )}
          </div>
          <p className="text-xs text-gray-500">Te contactaremos para confirmar tu reserva.</p>
        </div>
      </div>
    )
  }

  const stepsLabels = ['Servicio', 'Profesional', 'Fecha y hora', 'Tus datos']

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: '#1a1714', color: '#f3ead8' }}>
      <div className="max-w-lg mx-auto py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-3"
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            {business.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-bold">{business.name}</h1>
          {business.type && <p className="text-sm text-gray-400 mt-0.5">{business.type}</p>}
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {stepsLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                step > i + 1 ? 'text-white' : step === i + 1 ? 'text-white' : 'bg-white/10 text-gray-500'
              )}
                style={step >= i + 1 ? { backgroundColor: 'var(--primary-color)' } : {}}
              >
                {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              {i < stepsLabels.length - 1 && (
                <div className={cn('h-px w-6 sm:w-10 transition-colors', step > i + 1 ? 'bg-white/30' : 'bg-white/10')} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 - Service */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold mb-4">¿Qué servicio necesitás?</h2>
            {services.map(service => (
              <button
                key={service.id}
                onClick={() => { setSelectedService(service); setStep(2) }}
                className={cn(
                  'w-full flex items-center justify-between p-4 rounded-xl border transition-colors text-left',
                  selectedService?.id === service.id
                    ? 'border-current'
                    : 'border-white/10 hover:border-white/20 bg-white/5'
                )}
                style={selectedService?.id === service.id ? { borderColor: 'var(--primary-color-border)', backgroundColor: 'var(--primary-color-subtle)' } : {}}
              >
                <div>
                  <p className="font-medium text-sm">{service.name}</p>
                  {service.description && <p className="text-xs text-gray-400 mt-0.5">{service.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {service.duration_minutes} min
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> ${Number(service.price).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2 - Professional */}
        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold mb-4">¿Con quién querés atenderte?</h2>
            <button
              onClick={() => { setSelectedPro('none'); setStep(3) }}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 text-left"
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-gray-400 text-sm flex-shrink-0">
                ?
              </div>
              <div>
                <p className="font-medium text-sm">Sin preferencia</p>
                <p className="text-xs text-gray-400">Se asignará automáticamente</p>
              </div>
            </button>
            {professionals.map(pro => (
              <button
                key={pro.id}
                onClick={() => { setSelectedPro(pro); setStep(3) }}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 text-left"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
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
            <h2 className="text-lg font-semibold mb-4">¿Cuándo querés venir?</h2>
            <div className="flex justify-center mb-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={isDateDisabled}
                locale={es}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              />
            </div>

            {selectedDate && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-400">
                  Horarios disponibles — {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                </p>
                {loadingSlots ? (
                  <p className="text-center text-gray-400 text-sm py-4">Cargando horarios...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-4">No hay horarios disponibles para este día</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {availableSlots.map(slot => (
                      <button
                        key={slot}
                        onClick={() => setSelectedTime(slot)}
                        className={cn(
                          'py-2 px-3 rounded-lg text-sm font-medium transition-colors border',
                          selectedTime === slot
                            ? 'text-white border-transparent'
                            : 'border-white/10 hover:border-white/20 bg-white/5'
                        )}
                        style={selectedTime === slot ? { backgroundColor: 'var(--primary-color)', borderColor: 'var(--primary-color)' } : {}}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              className="w-full mt-6 text-white"
              style={{ backgroundColor: 'var(--primary-color)' }}
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
            <h2 className="text-lg font-semibold mb-2">Tus datos</h2>

            <div className="rounded-xl p-4 space-y-1 text-sm mb-4" style={{ backgroundColor: '#252220' }}>
              <p className="text-gray-400">Servicio: <span className="text-white">{selectedService?.name}</span></p>
              <p className="text-gray-400">
                {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} a las <strong className="text-white">{selectedTime}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-gray-300">Nombre *</Label>
                <Input
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="Tu nombre completo"
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300">Teléfono *</Label>
                <Input
                  type="tel"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="+54 9 11 1234-5678"
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-gray-300">Email <span className="text-gray-500">(opcional)</span></Label>
                <Input
                  type="email"
                  value={clientEmail}
                  onChange={e => setClientEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
            </div>

            <Button
              className="w-full mt-2 text-white"
              style={{ backgroundColor: 'var(--primary-color)' }}
              disabled={!clientName || !clientPhone || submitting}
              onClick={handleConfirm}
            >
              {submitting ? 'Confirmando...' : 'Confirmar turno'}
            </Button>
          </div>
        )}

        {/* Back button */}
        {step > 1 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mt-6 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Volver
          </button>
        )}
      </div>
    </div>
  )
}
