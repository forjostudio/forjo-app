'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isSameMonth, isSameDay, isBefore, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import type { PublicBusiness, Service, Professional, TimeBlock } from '@/lib/types'
import { effectiveBookingCutoff } from '@/lib/booking-window'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { resolveVertical, getVerticalLabel } from '@/lib/verticals'
import { cn } from '@/lib/utils'
import { notifyEmbedScroll } from '@/lib/embed-bridge'

interface Props {
  business: PublicBusiness
  services: Service[]
  professionals: Professional[]
  timeBlocks: TimeBlock[]
  // Excepciones por fecha (capa 1): anular o cambiar el horario de un día puntual.
  // location_id null = global (todo el negocio); con valor = solo ese consultorio.
  exceptions: { date: string; closed: boolean; start_time: string | null; end_time: string | null; location_id: string | null }[]
  // Consultorios/sucursales activos (capa 2a). Los slots se etiquetan con su consultorio.
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

export function BookingClient({ business, services, professionals, timeBlocks, exceptions, locations }: Props) {
  const [step, setStep] = useState(1)
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedPro, setSelectedPro] = useState<Professional | null | 'none'>('none')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [selectedTime, setSelectedTime] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  // Consultorio elegido en el paso previo al calendario (cuando hay más de uno reservable).
  const [bookingLoc, setBookingLoc] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useState<Date>(() => startOfMonth(new Date()))
  const [availableSlots, setAvailableSlots] = useState<{ time: string; locationId: string | null }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [clientName, setClientName] = useState('')
  const [clientPhone, setClientPhone] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientNotes, setClientNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── Auto-scroll de navegación (UX) ───────────────────────────────────────────────
  // Al avanzar/retroceder de paso llevamos el inicio del paso al tope del viewport; al
  // elegir un día bajamos a la grilla de horarios. Respeta prefers-reduced-motion (sin smooth).
  const stepTopRef = useRef<HTMLDivElement>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLDivElement>(null)
  const didMountRef = useRef(false)
  const smoothScrollTo = (el: HTMLElement | null, block: ScrollLogicalPosition = 'start') => {
    if (!el || typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Doble rAF: esperamos a que el layout (slots recién pintados, imágenes) se asiente
    // antes de medir la posición, si no scrollIntoView calcula contra el layout viejo.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block })
        // Modo embed: el scrollIntoView de arriba scrollea DENTRO del iframe (que no tiene scroll
        // interno) y no reposiciona nada útil. Ya con el layout asentado, le mandamos al host el
        // offset del target + el alto total, para que agrande y scrollee él. Fuera de embed, no-op.
        notifyEmbedScroll(el)
      })
    )
  }
  // Cada cambio de paso (menos el montaje inicial) reposiciona el scroll. En el paso de día/hora,
  // si el calendario ya está visible lo CENTRAMOS (calRef.current existe solo cuando se renderiza);
  // en los demás pasos vamos al inicio del paso. bookingLoc en deps: al elegir consultorio aparece
  // el calendario sin cambiar de paso, y ahí también queremos centrarlo.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    if (step === 3 && calRef.current) smoothScrollTo(calRef.current, 'center')
    else smoothScrollTo(stepTopRef.current)
  }, [step, bookingLoc])
  // Al elegir día y tener los horarios cargados, baja a la grilla de horarios.
  useEffect(() => {
    if (selectedDate && !loadingSlots) smoothScrollTo(timeRef.current)
  }, [selectedDate, loadingSlots])
  const router = useRouter()
  const locWord = resolveVertical(business).terminology.location

  // Consultorios donde se ofrece el servicio (location_ids; vacío = todos). El picker muestra
  // esos; los que no tienen horarios quedan deshabilitados. El paso aparece si quedan 2+ con
  // horarios. Compatibilidad con el location_id único (legacy).
  const locHasBlocks = (id: string) => timeBlocks.some(b => b.location_id === id)
  const svcAllowed = selectedService?.location_ids?.length
    ? selectedService.location_ids
    : (selectedService?.location_id ? [selectedService.location_id] : [])
  const isAllowed = (id: string) => svcAllowed.length === 0 || svcAllowed.includes(id)
  const bookableLocs = locations.filter(l => isAllowed(l.id))
  const locsWithHours = bookableLocs.filter(l => locHasBlocks(l.id))
  const needLocStep = locsWithHours.length > 1
  const resolvedLoc = needLocStep ? bookingLoc : (locsWithHours[0]?.id ?? null)

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
  // Excepciones indexadas. Global (location_id null) = todo el negocio ese día. Por consultorio
  // (location_id) = solo ese consultorio. La de consultorio manda sobre la global.
  type Exc = { closed: boolean; start_time: string | null; end_time: string | null }
  const globalExcByDate = useMemo(() => {
    const m = new Map<string, Exc>()
    for (const e of exceptions) if (!e.location_id) m.set(e.date, e)
    return m
  }, [exceptions])
  const locExcByKey = useMemo(() => {
    const m = new Map<string, Exc>()
    for (const e of exceptions) if (e.location_id) m.set(`${e.date}|${e.location_id}`, e)
    return m
  }, [exceptions])
  // Fechas con alguna excepción de horario especial por consultorio (para abrir días "cerrados").
  const locSpecialDates = useMemo(() => {
    const s = new Set<string>()
    for (const e of exceptions) if (e.location_id && !e.closed && e.start_time && e.end_time) s.add(e.date)
    return s
  }, [exceptions])
  // ¿El día está abierto? Permisivo: si la grilla abre ese día (o hay un especial por consultorio)
  // y no hay un cierre GLOBAL, se muestra; el detalle por consultorio se resuelve al generar slots.
  const isDayOpen = (d: Date) => {
    const ds = format(d, 'yyyy-MM-dd')
    const g = globalExcByDate.get(ds)
    if (g) return !g.closed
    return openDaysSet.has(d.getDay()) || locSpecialDates.has(ds)
  }
  // Grilla del mes mostrado, en semanas de lunes a domingo.
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(calMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [calMonth])
  const thisMonth = startOfMonth(new Date())
  // Ventana de reserva pública (BOOK-WINDOW-02): corte inclusive en hora AR (helper del Plan 01).
  // Cap de UX — la autoridad real es el backstop server (D-08). null = sin límite.
  const cutoff = useMemo(() => effectiveBookingCutoff(business), [business])
  const cutoffMonth = cutoff ? startOfMonth(cutoff) : null

  async function handleDateSelect(date: Date | undefined) {
    if (!date || !selectedService) return
    setSelectedDate(date)
    setSelectedTime('')
    setSelectedLocationId(null)
    setLoadingSlots(true)

    const dateStr = format(date, 'yyyy-MM-dd')
    // Consultorio del servicio (opcional): se usa como consultorio del slot cuando el bloque
    // de horario no tiene uno propio (Capa 2a). El bloque manda si está asignado.
    const svcLoc = selectedService.location_id ?? null
    const loc = resolvedLoc // consultorio elegido para esta reserva (o null si no hay)
    const weekly = timeBlocks.filter(b => b.day_of_week === date.getDay())
    const globalEx = globalExcByDate.get(dateStr)
    const dayBlocks: { start_time: string; end_time: string; location_id: string | null }[] = []
    if (globalEx?.closed) {
      // Cierre global: sin slots ese día.
    } else if (globalEx && !globalEx.closed && globalEx.start_time && globalEx.end_time) {
      // Horario especial global: reemplaza el día por ese rango (un bloque).
      dayBlocks.push({ start_time: globalEx.start_time, end_time: globalEx.end_time, location_id: loc ?? svcLoc })
    } else if (loc) {
      // Consultorio elegido: manda su excepción. Usa sus bloques propios o, si no tiene, los de
      // "General" (sin consultorio) — así un negocio con horario único igual ofrece sus salas.
      const locEx = locExcByKey.get(`${dateStr}|${loc}`)
      if (!locEx?.closed) {
        if (locEx && locEx.start_time && locEx.end_time) {
          dayBlocks.push({ start_time: locEx.start_time, end_time: locEx.end_time, location_id: loc })
        } else {
          let base = weekly.filter(b => b.location_id === loc)
          // Fallback a "General" SOLO cuando no hubo elección de consultorio (un único consultorio).
          if (base.length === 0 && !needLocStep) base = weekly.filter(b => !b.location_id)
          for (const b of base) dayBlocks.push({ start_time: b.start_time, end_time: b.end_time, location_id: loc })
        }
      }
    } else {
      // Negocio sin consultorios: la grilla tal cual, con excepción por bloque si la hay.
      for (const b of weekly) {
        const bLoc = b.location_id ?? svcLoc
        const ex = bLoc ? locExcByKey.get(`${dateStr}|${bLoc}`) : undefined
        if (ex?.closed) continue
        if (ex && !ex.closed && ex.start_time && ex.end_time) {
          dayBlocks.push({ start_time: ex.start_time, end_time: ex.end_time, location_id: bLoc })
        } else {
          dayBlocks.push({ start_time: b.start_time, end_time: b.end_time, location_id: bLoc })
        }
      }
    }
    const blocks = dayBlocks
    if (blocks.length === 0) {
      setAvailableSlots([])
      setLoadingSlots(false)
      return
    }

    const proId = selectedPro && selectedPro !== 'none' ? (selectedPro as Professional).id : null

    // Disponibilidad server-side: el anon ya NO puede leer appointments (RLS), así que la
    // sirve /api/booking/availability (service role) devolviendo solo los slots OCUPADOS
    // (time/status/expires_at, sin datos del cliente) para este negocio+fecha+profesional.
    let busy: { time: string; duration_minutes?: number | null }[] = []
    // `full`: horarios donde el server ya decidió "lleno" (count >= capacity). La AUTORIDAD del
    // conteo vive en el server (anon NO lee appointments); el client confía en `full` y NUNCA
    // recomputa la ocupación ni conoce cuántos lugares quedan (D-06). Respuesta vieja sin `full`
    // → se trata como [] (defensivo, no rompe).
    let full: string[] = []
    try {
      const params = new URLSearchParams({ slug: business.slug, date: dateStr })
      if (proId) params.set('professionalId', proId)
      const res = await fetch(`/api/booking/availability?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        busy = data.busy || []
        full = data.full || []
      }
    } catch (e) {
      console.error('availability error:', e)
    }

    // Un slot [inicio, fin) está ocupado si se SOLAPA con algún turno ocupado (consistente con
    // la exclusion constraint 013, que protege el rango por profesional). El buffer (descanso
    // entre turnos) ensancha cada turno ocupado para dejar un hueco mínimo entre consecutivos.
    const duration = selectedService.duration_minutes
    const buffer = Number(business.buffer_minutes) || 0
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const isToday = dateStr === todayStr
    const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1

    const slots: { time: string; locationId: string | null }[] = []
    const seen = new Set<string>()
    for (const block of [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const openMin = timeToMinutes(block.start_time)
      const closeMin = timeToMinutes(block.end_time)
      for (let t = openMin; t + duration <= closeMin; t += duration) {
        if (nowMinutes >= 0 && t <= nowMinutes) continue
        const slotEnd = t + duration
        const conflict = busy.some(b => {
          const bStart = timeToMinutes(b.time)
          const bEnd = bStart + (Number(b.duration_minutes) || 30)
          return t < bEnd + buffer && slotEnd > bStart - buffer
        })
        if (conflict) continue
        const time = minutesToTime(t)
        // Slot lleno según el server (cupo grupal: count >= capacity). El client confía en `full`
        // y no recomputa contra capacity (no tiene ni debe tener el count). Para capacity=1 esto
        // coincide con el `conflict` por solapamiento; ambos co-existen sin romperse.
        if (full.includes(time)) continue
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
            <h1 className="text-[clamp(22px,6vw,34px)] font-black uppercase tracking-tight leading-[1.05] break-words font-[family-name:var(--font-heading)]">{business.name}</h1>
            {/* Categoría del negocio: el texto libre `type` si existe, o el label del rubro como
                fallback (D-03) — nunca queda sin subtítulo. Interpolado en JSX → auto-escape de React. */}
            {(business.type || getVerticalLabel(business)) && <p className="text-sm text-primary-foreground/80 mt-1.5">{business.type || getVerticalLabel(business)}</p>}
          </div>
        </div>
      </div>

      <div ref={stepTopRef} className="max-w-lg mx-auto px-6 py-8 scroll-mt-4">
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
                  onClick={() => { setSelectedService(service); setBookingLoc(null); setSelectedDate(undefined); setSelectedTime(''); setStep(2) }}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    selectedService?.id === service.id
                      ? 'border-primary bg-primary/[0.06]'
                      : 'border-border bg-card hover:border-primary'
                  )}
                >
                  {/* Tarjeta: izq = título + descripción (si hay); der = precio + duración a la
                      derecha. items-center → SIN descripción el título queda centrado contra el
                      bloque de precio (no parece 3 líneas). La descripción se edita en el admin. */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold font-[family-name:var(--font-heading)]">{service.name}</p>
                      {service.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{service.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-bold leading-tight font-[family-name:var(--font-heading)]">${Number(service.price).toLocaleString('es-AR')}</p>
                      <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                        <Clock className="w-3 h-3" /> {service.duration_minutes} min
                      </p>
                    </div>
                  </div>
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
        {step === 3 && needLocStep && !bookingLoc && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí el {locWord.toLowerCase()}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {bookableLocs.map(l => {
                const enabled = locHasBlocks(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => { setBookingLoc(l.id); setSelectedDate(undefined); setSelectedTime('') }}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors',
                      enabled ? 'border-border bg-card hover:border-primary' : 'border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed'
                    )}
                  >
                    <p className="font-semibold">{l.name}</p>
                    {l.address && <p className="text-sm text-muted-foreground mt-0.5">{l.address}</p>}
                    {l.phone && <p className="text-xs text-muted-foreground mt-0.5">{l.phone}</p>}
                    {!enabled && <p className="text-xs text-muted-foreground mt-1">Sin horarios disponibles</p>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === 3 && (!needLocStep || bookingLoc) && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí día y horario</h2>

            {/* Resumen de lo ya elegido (servicio · profesional · consultorio) */}
            <div className="mb-4 rounded-md bg-card border border-border border-l-4 border-l-primary p-3 text-sm space-y-0.5">
              <p className="text-muted-foreground">Servicio: <span className="text-foreground">{selectedService?.name}</span></p>
              <p className="text-muted-foreground">Profesional: <span className="text-foreground">{selectedPro && selectedPro !== 'none' ? selectedPro.name : 'Sin preferencia'}</span></p>
              {resolvedLoc && (() => {
                const loc = locations.find(l => l.id === resolvedLoc)
                return (
                  <div>
                    <p className="text-muted-foreground flex items-center gap-2">
                      <span>{locWord}: <span className="text-foreground">{loc?.name}</span></span>
                      {needLocStep && <button type="button" onClick={() => { setBookingLoc(null); setSelectedDate(undefined); setSelectedTime('') }} className="text-xs text-primary hover:underline flex-shrink-0">Cambiar</button>}
                    </p>
                    {loc?.address && <p className="text-xs text-muted-foreground">{loc.address}</p>}
                    {loc?.phone && <p className="text-xs text-muted-foreground">{loc.phone}</p>}
                  </div>
                )
              })()}
            </div>

            {/* Día — calendario mensual con cuadrados y navegación de mes */}
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

            {/* Horario */}
            {selectedDate && (
              <div ref={timeRef} className="mt-6 scroll-mt-4">
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
                <p className="text-muted-foreground">{locWord}: <span className="text-foreground">{locations.find(l => l.id === selectedLocationId)?.name}</span></p>
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

            {/* ⚠ ATRIBUCIÓN DE reCAPTCHA — OBLIGATORIA, NO ES DECORATIVA.
                Ocultamos el badge flotante de Google (.grecaptcha-badge en globals.css) porque
                queda pegado en una esquina de todas las páginas del sitio y ensucia el diseño.
                Los términos de reCAPTCHA PERMITEN esconderlo, pero SOLO si se muestra esta
                leyenda con los dos links en el flujo del usuario. Sin esto, ocultar el badge
                viola el ToS de Google (y pueden cortar la key).
                Si algún día se saca este texto, hay que volver a mostrar el badge. Van juntos. */}
            {siteKey && (
              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
                Protegido por reCAPTCHA. Aplican la{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Política de Privacidad
                </a>{' '}
                y los{' '}
                <a
                  href="https://policies.google.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Términos del Servicio
                </a>{' '}
                de Google.
              </p>
            )}

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
            <a href="https://www.forjo.studio" target="_blank" rel="noopener noreferrer" className="font-[family-name:var(--font-archivo)] hover:text-foreground transition-colors">
              <span className="font-semibold text-foreground">Forjo</span> Studio
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}
