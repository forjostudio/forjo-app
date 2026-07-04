'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, Plus, Trash2, Clock, DollarSign, Stethoscope, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TYPE_GROUPS, getVerticalKeyByType } from '@/lib/verticals'
import { normalizeArWhatsApp } from '@/lib/whatsapp'
import { linkLeadOnSignup } from '@/app/(crm)/admin/_pipeline-actions'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Paletas curadas de marca (mismas que Configuración → Apariencia). El swatch es el
// primary en claro; se persiste en businesses.palette y tiñe panel + página pública.
const PALETTES: { key: string; label: string; swatch: string }[] = [
  { key: 'red', label: 'Rojo', swatch: '#d94a2b' },
  { key: 'blue', label: 'Azul', swatch: '#2a5fa5' },
  { key: 'yellow', label: 'Amarillo', swatch: '#c8901a' },
  { key: 'green', label: 'Verde', swatch: '#2f8a5b' },
  { key: 'ink', label: 'Tinta', swatch: '#1a1714' },
]

// Estado del paso de horarios: un día → { enabled, blocks[] }, donde cada bloque es una ventana
// simple { start_time, end_time }. Modelo N-bloques/día para soportar horario partido (D-04, ej.
// Lun 9-12 y 15-19). En el insert cada bloque se mapea a una fila time_blocks con label=null,
// location_id=null, capacity=1 fijos (el onboarding no maneja sedes ni cupos). error = validación
// inline por bloque (fin > inicio), mismo criterio que el panel (agenda-client.tsx:validateBlocks).
interface HourBlock {
  start_time: string
  end_time: string
  error?: string
}

interface DayState {
  enabled: boolean
  blocks: HourBlock[]
}

// Default equivalente al DEFAULT_HOURS anterior, expresado como bloques: lun-vie 9-18, sáb 9-13,
// dom cerrado. Índice del array = day_of_week (0=domingo … 6=sábado).
const DEFAULT_DAY_STATES: DayState[] = [
  { enabled: false, blocks: [] },                                    // 0 domingo — cerrado
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00' }] }, // 1 lunes
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00' }] }, // 2 martes
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00' }] }, // 3 miércoles
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00' }] }, // 4 jueves
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00' }] }, // 5 viernes
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '13:00' }] }, // 6 sábado
]

interface Service {
  name: string
  duration_minutes: number
  price: number
  // Error inline de precio (validación onBlur, D-08). Vive en el estado del item, mismo criterio que
  // HourBlock.error / validateBlocks del panel. Solo estado de UI: NO se persiste en la fila de services.
  priceError?: string
  // Error inline de nombre (validación onBlur). Se marca solo si la fila tiene datos (precio/duración
  // distintos del default) pero sin nombre → el nombre es obligatorio para que la fila sea un servicio
  // real. NO bloquea Siguiente/Omitir (gating relajado, D-02). Solo estado de UI, no se persiste.
  nameError?: string
}

interface Professional {
  name: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1 - Business
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [slug, setSlug] = useState('')
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [slugChecking, setSlugChecking] = useState(false)
  const [whatsapp, setWhatsapp] = useState('')
  // Error inline de WhatsApp (validación onBlur, D-08). WhatsApp es OPCIONAL: vacío = válido, sin error.
  const [whatsappError, setWhatsappError] = useState<string | undefined>()
  const [address, setAddress] = useState('')
  const [instagram, setInstagram] = useState('')
  const [palette, setPalette] = useState('red')

  function selectPalette(key: string) {
    setPalette(key)
    // Feedback inmediato: tiñe el onboarding al instante (igual que Apariencia).
    document.documentElement.dataset.palette = key
  }

  // Step 2 - Services
  const [services, setServices] = useState<Service[]>([{ name: '', duration_minutes: 30, price: 0 }])

  // Step 3 - Professionals
  const [professionals, setProfessionals] = useState<Professional[]>([{ name: '' }])

  // Step 4 - Hours (día → { enabled, blocks[] }, índice = day_of_week)
  const [dayStates, setDayStates] = useState<DayState[]>(DEFAULT_DAY_STATES)

  const checkSlug = useCallback(async (value: string) => {
    if (!value || value.length < 3) return
    setSlugChecking(true)
    const { data } = await supabase
      .from('businesses')
      .select('slug')
      .eq('slug', value)
      .single()
    setSlugAvailable(!data)
    setSlugChecking(false)
  }, [supabase])

  useEffect(() => {
    const slugified = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)
    setSlug(slugified)
  }, [name])

  useEffect(() => {
    const timeout = setTimeout(() => checkSlug(slug), 500)
    return () => clearTimeout(timeout)
  }, [slug, checkSlug])

  function handleSlugChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(clean)
  }

  // Services
  function addService() {
    setServices([...services, { name: '', duration_minutes: 30, price: 0 }])
  }

  function removeService(i: number) {
    setServices(services.filter((_, idx) => idx !== i))
  }

  function updateService(i: number, field: keyof Service, value: string | number) {
    const updated = [...services]
    // Limpiar el error del campo editado al escribir → feedback en vivo (se re-valida onBlur). El nombre
    // limpia su error solo cuando pasa a ser no-vacío; los demás campos limpian nameError igual porque
    // cambiar precio/duración puede resolver la condición "fila con datos sin nombre".
    const clearName = field === 'name' ? (typeof value === 'string' && value.trim() !== '') : true
    updated[i] = {
      ...updated[i],
      [field]: value,
      priceError: undefined,
      nameError: clearName ? undefined : updated[i].nameError,
    }
    setServices(updated)
  }

  // Validación inline de precio onBlur (D-08/D-09): precio 0 y positivos son VÁLIDOS (servicio gratuito);
  // solo el negativo da error. El error vive en el item, se limpia al corregir (updateService).
  function validateServicePrice(i: number) {
    setServices(prev => prev.map((s, idx) =>
      idx === i
        ? { ...s, priceError: s.price < 0 ? 'El precio no puede ser negativo' : undefined }
        : s
    ))
  }

  // Validación inline de nombre onBlur: el nombre es obligatorio SOLO si la fila tiene datos (precio > 0
  // o duración distinta del default 30). Una fila totalmente vacía se ignora (se filtra en handleFinish),
  // así que no molesta con error. Mismo precedente que validateServicePrice; no bloquea el avance (D-02).
  function validateServiceName(i: number) {
    setServices(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      const hasData = s.price > 0 || s.duration_minutes !== 30
      const missing = s.name.trim() === '' && hasData
      return { ...s, nameError: missing ? 'El nombre es obligatorio' : undefined }
    }))
  }

  // Professionals
  function addProfessional() {
    setProfessionals([...professionals, { name: '' }])
  }

  function removeProfessional(i: number) {
    setProfessionals(professionals.filter((_, idx) => idx !== i))
  }

  function updateProfessional(i: number, value: string) {
    const updated = [...professionals]
    updated[i] = { name: value }
    setProfessionals(updated)
  }

  // Hours — patrón del panel (agenda-client.tsx) adaptado a un solo eje día (sin consultorio/location).
  // Activar un día = arrancar con un bloque por defecto; desactivar = sin bloques (día cerrado).
  function toggleDay(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks: HourBlock[] = next[day].enabled ? [] : [{ start_time: '09:00', end_time: '18:00' }]
      next[day] = { enabled: blocks.length > 0, blocks }
      return next
    })
  }

  // Agregar bloque = horario partido. Arranca donde terminó el último bloque (+3h), como el panel.
  function addBlock(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const last = next[day].blocks[next[day].blocks.length - 1]
      const newStart = last?.end_time || '09:00'
      const [h, m] = newStart.split(':').map(Number)
      const newEnd = `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      next[day] = { enabled: true, blocks: [...next[day].blocks, { start_time: newStart, end_time: newEnd }] }
      return next
    })
  }

  function removeBlock(day: number, idx: number) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks = next[day].blocks.filter((_, i) => i !== idx)
      next[day] = { enabled: blocks.length > 0, blocks }
      return next
    })
  }

  function updateBlock(day: number, idx: number, field: 'start_time' | 'end_time', value: string) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks = [...next[day].blocks]
      blocks[idx] = { ...blocks[idx], [field]: value, error: undefined }
      next[day] = { ...next[day], blocks }
      return next
    })
  }

  // Validación inline por bloque: fin > inicio (mismo criterio que validateBlocks del panel).
  // No valida solapamiento (el onboarding no maneja consultorios). Marca errores en el estado y
  // devuelve false si hay alguno para bloquear el finalizar.
  function validateHours(): boolean {
    let valid = true
    const next = dayStates.map(ds => {
      if (!ds.enabled) return ds
      const blocks = ds.blocks.map(b => {
        if (b.end_time <= b.start_time) { valid = false; return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' } }
        return { ...b, error: undefined }
      })
      return { ...ds, blocks }
    })
    setDayStates(next)
    return valid
  }

  async function handleFinish() {
    // Bloquear el finalizar si algún bloque de horario es inválido (fin <= inicio). Marca el error
    // inline en el estado y no avanza (no crea el negocio con horarios rotos).
    if (!validateHours()) {
      toast.error('Revisá los horarios: la hora de fin debe ser mayor a la de inicio.')
      return
    }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      // WhatsApp opcional: si lo cargaron, normalizar a formato wa.me y validar.
      let whatsappNorm: string | null = null
      if (whatsapp.trim()) {
        whatsappNorm = normalizeArWhatsApp(whatsapp)
        if (!whatsappNorm) {
          toast.error('WhatsApp inválido. Usá código de país y área, ej. +54 9 11 1234-5678')
          return
        }
      }

      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name,
          slug,
          type,
          vertical: getVerticalKeyByType(type),
          whatsapp: whatsappNorm,
          address: address || null,
          instagram: instagram || null,
          palette,
          // back-compat: la columna primary_color sigue existiendo; la derivamos del swatch.
          primary_color: PALETTES.find(p => p.key === palette)?.swatch ?? '#d94a2b',
        })
        .select()
        .single()

      if (bizError) throw bizError

      // priceError es solo estado de UI (validación inline): NO se envía al insert (columna inexistente
      // en services). Se arma la fila con los campos de dominio explícitos. Precio 0 se persiste tal cual
      // (servicio gratuito, D-09).
      await supabase.from('services').insert(
        services.filter(s => s.name.trim()).map(s => ({
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: s.price,
          business_id: business.id,
        }))
      )

      await supabase.from('professionals').insert(
        professionals.filter(p => p.name).map(p => ({ ...p, business_id: business.id }))
      )

      // Horarios → time_blocks (fuente única canónica, D-01/D-04). Cada bloque de un día habilitado es
      // una fila; días sin bloques = cerrado (no se inserta nada). label/location_id null y capacity=1
      // fijos: el onboarding no maneja sedes ni cupos (patrón del panel, agenda-client.tsx:saveHours).
      // business_id = SIEMPRE el del negocio recién creado por esta sesión (business.id), nunca del
      // cliente (aislamiento por tenant + RLS de time_blocks por business_id ya vigente, T-01-01).
      const timeBlocksToInsert = dayStates.flatMap((ds, day) =>
        ds.enabled
          ? ds.blocks.map(b => ({
              business_id: business.id,
              day_of_week: day,
              start_time: b.start_time,
              end_time: b.end_time,
              label: null,
              location_id: null,
              capacity: 1,
            }))
          : []
      )
      if (timeBlocksToInsert.length > 0) {
        await supabase.from('time_blocks').insert(timeBlocksToInsert)
      }

      // Conversión automática lead→negocio (CRM, PIPE-03 / D-05). Este es el punto de integración
      // REAL de la conversión: register solo hace auth.signUp; el negocio recién existe ACÁ. La sesión
      // del dueño NO puede escribir leads/deals (tablas admin-only por RLS, migración 034) → la action
      // corre service-role server-side y re-deriva el email del owner de la sesión (anti-tampering, por
      // eso NO le pasamos email ni leadId). Best-effort: si falla, el negocio ya se creó; loguear y
      // seguir, NUNCA bloquear el redirect al dashboard (T-04-09).
      try {
        await linkLeadOnSignup({ businessId: business.id })
      } catch (linkErr) {
        console.error('[onboarding/link-lead]', linkErr instanceof Error ? linkErr.message : linkErr)
      }

      toast.success('¡Negocio creado con éxito!')
      router.push('/dashboard')
    } catch (err) {
      toast.error('Error al crear el negocio. Intentá de nuevo.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Array base de pasos con su `n` ESTABLE (n=1 Negocio … n=4 Horarios). `n` es el identificador
  // canónico del paso: `step` y los bloques del render (`step === 1/2/3/4`) siempre keyean contra él,
  // así el contenido de cada paso no se corre cuando ocultamos uno. El orden NO cambia (D-06).
  const steps = [
    { n: 1, label: 'Tu negocio' },
    { n: 2, label: 'Servicios' },
    { n: 3, label: 'Profesionales' },
    { n: 4, label: 'Horarios' },
  ]

  // Stepper dinámico por vertical (D-03): en 'canchas' una cancha NO es un profesional humano, así que
  // el paso Profesionales (n=3) desaparece del flujo → quedan 3 pasos (Negocio → Servicios → Horarios).
  // En el resto de verticales `visibleSteps === steps` (4 pasos). La numeración VISIBLE del stepper
  // deriva de la POSICIÓN en este array (idx+1), no del `n`, para leerse 1-2-3 / 1-2-3-4 sin huecos.
  const visibleSteps = getVerticalKeyByType(type) === 'canchas'
    ? steps.filter(s => s.n !== 3)
    : steps

  // Índice del paso actual dentro de `visibleSteps` (posición, no `n`). La navegación se mueve entre
  // posiciones para saltar limpio el paso oculto en canchas (Servicios n=2 → Horarios n=4 sin pasar
  // por el Profesionales inexistente). También define cuál es el "último paso" (Finalizar) y si mostrar
  // Omitir. Fallback a 0 si `step` no está en la lista visible (cambio de rubro que oculta el actual).
  const currentIndex = Math.max(0, visibleSteps.findIndex(s => s.n === step))
  const isLastStep = currentIndex === visibleSteps.length - 1

  const canGoNext = () => {
    // Gating relajado (D-02): solo el paso Negocio (siempre visibleSteps[0]) bloquea el avance;
    // Servicios/Profesionales/Horarios son omitibles → nunca bloquean (esto también elimina el viejo
    // requisito `price > 0`, cumpliendo D-09 a nivel de gating). Negocio es el primer paso en todo
    // vertical, así que keyeamos contra su `n` (1), no contra una posición que pueda correrse.
    if (step === 1) return name && slug && slugAvailable && type
    return true
  }

  return (
    <div className="min-h-screen p-4 flex flex-col items-center">
      <div className="w-full max-w-2xl mt-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2">
            <svg width="26" height="33" viewBox="0 0 64 80" aria-hidden="true">
              <rect x="6" y="6" width="14" height="68" fill="currentColor" className="text-foreground" />
              <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
              <path d="M20 34 L50 34 L36 48 L20 48 Z" fill="#2a5fa5" />
              <circle cx="56" cy="13" r="6" fill="#f4c543" />
            </svg>
            <span className="font-[family-name:var(--font-heading)] font-black text-3xl text-primary">Forjo <span className="font-medium opacity-85">Studio</span></span>
          </div>
          {/* Subtítulo count-aware: refleja el conteo real de pasos visibles (3 en canchas, 4 en el
              resto), no un literal fijo. */}
          <p className="text-muted-foreground mt-2">Configurá tu negocio en {visibleSteps.length} pasos</p>
        </div>

        {/* Stepper — itera sobre visibleSteps (Profesionales oculto en canchas, D-03). El número visible
            del nodo deriva de la POSICIÓN (idx+1) → 1-2-3 / 1-2-3-4 sin huecos; el estado
            activo/completado compara contra `s.n` (el paso real), no contra la posición. */}
        <div className="flex items-center justify-center mb-8 gap-0">
          {visibleSteps.map((s, idx) => (
            <div key={s.n} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                  step > s.n ? 'bg-primary text-primary-foreground' :
                  step === s.n ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                  'bg-secondary text-muted-foreground'
                )}>
                  {step > s.n ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span className={cn(
                  'text-xs mt-1 hidden sm:block',
                  step === s.n ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}>{s.label}</span>
              </div>
              {idx < visibleSteps.length - 1 && (
                <div className={cn(
                  'h-px w-12 sm:w-20 mx-1 sm:mx-2 mb-4 transition-colors',
                  step > s.n ? 'bg-primary' : 'bg-border'
                )} />
              )}
            </div>
          ))}
        </div>

        <Card className="p-6">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Tu negocio</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre del negocio *</Label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej: Estudio Nova"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de negocio *</Label>
                  <Select value={type} onValueChange={v => setType(v ?? '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_GROUPS.map(group => (
                        <SelectGroup key={group.key}>
                          <SelectLabel>{group.label}</SelectLabel>
                          {group.types.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vertical hint — explica qué incluye el panel según el rubro */}
              {type && getVerticalKeyByType(type) === 'salud' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Stethoscope className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">Tu panel incluirá <strong className="text-foreground">historia clínica</strong> y <strong className="text-foreground">obra social</strong>.</span>
                </div>
              )}
              {type && getVerticalKeyByType(type) === 'belleza' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">Tu panel incluirá <strong className="text-foreground">fichas de preferencias</strong> de clientes.</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>URL de tu página *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm whitespace-nowrap">forjo.studio/</span>
                  <Input
                    value={slug}
                    onChange={e => handleSlugChange(e.target.value)}
                    placeholder="mi-negocio"
                    className="flex-1"
                  />
                </div>
                <div className="text-sm">
                  {slugChecking && <span className="text-muted-foreground">Verificando disponibilidad...</span>}
                  {!slugChecking && slug && slugAvailable === true && (
                    <span className="text-green-500">✓ Disponible</span>
                  )}
                  {!slugChecking && slug && slugAvailable === false && (
                    <span className="text-destructive">✗ Ya está en uso</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>WhatsApp <span className="text-muted-foreground">(opcional)</span></Label>
                  {/* Validación inline onBlur (D-08): si hay algo cargado y el formato es inválido, error
                      inmediato; vacío o válido = sin error. Se limpia al escribir (feedback en vivo). */}
                  <Input
                    value={whatsapp}
                    onChange={e => { setWhatsapp(e.target.value); setWhatsappError(undefined) }}
                    onBlur={() => setWhatsappError(
                      whatsapp.trim() && !normalizeArWhatsApp(whatsapp)
                        ? 'WhatsApp inválido. Usá código de país y área, ej. +54 9 11 1234-5678'
                        : undefined
                    )}
                    placeholder="+54 9 11 1234-5678"
                    aria-invalid={!!whatsappError}
                  />
                  {whatsappError && <p className="text-xs text-destructive">{whatsappError}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Instagram <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@minegocio" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dirección <span className="text-muted-foreground">(opcional)</span></Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
              </div>

              <div className="space-y-2">
                <Label>Paleta de marca</Label>
                <div className="flex flex-wrap gap-2">
                  {PALETTES.map(p => {
                    const active = palette === p.key
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => selectPalette(p.key)}
                        aria-pressed={active}
                        title={p.label}
                        className={cn(
                          'h-9 w-16 rounded-sm border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active ? 'border-foreground' : 'border-transparent hover:border-muted-foreground/50'
                        )}
                        style={{ backgroundColor: p.swatch }}
                      >
                        <span className="sr-only">{p.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Tiñe tu panel y tu página pública de reservas. Podés cambiarla luego en Configuración.</p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Tus servicios</h2>
              <div className="space-y-3">
                {/* Header de columnas fijo (D-07): los labels Nombre/Min./Precio viven UNA sola vez arriba
                    de la grilla y quedan visibles siempre, sin importar qué fila tenga foco. Sticky (top-0)
                    para no perderse con listas largas; oculto en mobile (< sm) donde cada fila es una
                    tarjeta con labels propios. bg-card = superficie del onboarding. */}
                <div className="hidden sm:grid sticky top-0 z-10 bg-card grid-cols-12 gap-2 py-1">
                  <Label className="col-span-5 text-xs text-muted-foreground">Nombre</Label>
                  <Label className="col-span-3 text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Min.
                  </Label>
                  <Label className="col-span-3 text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Precio
                  </Label>
                  <div className="col-span-1" />
                </div>
                {/* Un solo template responsive por fila (FIX 4/6): mobile (< sm) = tarjeta de dos líneas con
                    labels propios (el header de columnas está oculto → labels siempre visibles, ONB-02);
                    desktop (sm+) = fila en la grilla 12-col alineada al header sticky. */}
                {services.map((service, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:border-0 sm:p-0 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center"
                  >
                    {/* Línea 1 mobile / col Nombre desktop */}
                    <div className="sm:col-span-5 space-y-1">
                      <Label className="sm:hidden text-xs text-muted-foreground">Nombre</Label>
                      <Input
                        value={service.name}
                        onChange={e => updateService(i, 'name', e.target.value)}
                        onBlur={() => validateServiceName(i)}
                        placeholder={i === 0 ? 'Ej: Corte de cabello' : ''}
                        aria-invalid={!!service.nameError}
                      />
                    </div>
                    {/* Línea 2 mobile: Min. + Precio lado a lado + trash centrado; en desktop cada campo es
                        su propia columna de la grilla. */}
                    <div className="flex items-end gap-2 sm:contents">
                      <div className="flex-1 min-w-0 sm:col-span-3 space-y-1">
                        <Label className="sm:hidden text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Min.
                        </Label>
                        <Input
                          type="number"
                          value={service.duration_minutes}
                          onChange={e => updateService(i, 'duration_minutes', parseInt(e.target.value))}
                          onFocus={e => e.target.select()}
                          min={5}
                          step={5}
                        />
                      </div>
                      <div className="flex-1 min-w-0 sm:col-span-3 space-y-1">
                        <Label className="sm:hidden text-xs text-muted-foreground flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> Precio
                        </Label>
                        {/* Precio valida onBlur (D-08/D-09): negativo = error inline; 0 y positivos válidos.
                            onFocus select() → escribir reemplaza el 0 preseteado (antes escribía "05"). */}
                        <Input
                          type="number"
                          value={service.price}
                          onChange={e => updateService(i, 'price', parseFloat(e.target.value))}
                          onFocus={e => e.target.select()}
                          onBlur={() => validateServicePrice(i)}
                          min={0}
                          step={100}
                          aria-invalid={!!service.priceError}
                        />
                      </div>
                      <div className="sm:col-span-1 flex items-center justify-end">
                        {services.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeService(i)}
                            className="text-muted-foreground hover:text-destructive h-9 w-9"
                            aria-label="Quitar servicio"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {(service.nameError || service.priceError) && (
                      <p className="sm:col-span-12 text-xs text-destructive">
                        {service.nameError || service.priceError}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={addService} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Agregar servicio
              </Button>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Tus profesionales</h2>
              <div className="space-y-2">
                {professionals.map((pro, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={pro.name}
                      onChange={e => updateProfessional(i, e.target.value)}
                      placeholder={`Profesional ${i + 1}`}
                      className="flex-1"
                    />
                    {professionals.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProfessional(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={addProfessional} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Agregar profesional
              </Button>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Horarios de atención</h2>
              <p className="text-sm text-muted-foreground">Tocá cada día para abrirlo o cerrarlo. Podés cargar horario partido: agregá más de un bloque por día (ej. 9-12 y 15-19). Un día sin bloques queda cerrado.</p>
              <div className="space-y-2">
                {dayStates.map((ds, day) => (
                  <div key={day} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={ds.enabled}
                      className={cn(
                        'w-20 shrink-0 text-xs font-medium py-1 px-2 rounded transition-colors mt-1',
                        ds.enabled ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                      )}
                    >
                      {DAYS[day]}
                    </button>
                    {ds.enabled ? (
                      <div className="flex-1 space-y-2">
                        {ds.blocks.map((b, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={b.start_time}
                                onChange={e => updateBlock(day, idx, 'start_time', e.target.value)}
                                className="w-28 text-sm"
                                aria-invalid={!!b.error}
                              />
                              <span className="text-muted-foreground text-sm">—</span>
                              <Input
                                type="time"
                                value={b.end_time}
                                onChange={e => updateBlock(day, idx, 'end_time', e.target.value)}
                                className="w-28 text-sm"
                                aria-invalid={!!b.error}
                              />
                              {ds.blocks.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeBlock(day, idx)}
                                  className="text-muted-foreground hover:text-destructive h-9 w-9"
                                  aria-label="Quitar bloque"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            {b.error && <p className="text-xs text-destructive">{b.error}</p>}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addBlock(day)}
                          className="gap-1.5 text-xs text-muted-foreground h-8"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar bloque
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm mt-1.5">Cerrado</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation — la detección de "último paso" y el avance/retroceso se guían por la POSICIÓN
              dentro de visibleSteps (no por el literal 4), para saltar limpio el paso oculto en canchas
              (Servicios n=2 → Horarios n=4). Cluster: Atrás — [ Omitir por ahora ] [ Siguiente ];
              en el último paso solo la CTA Finalizar. */}
          <div className="flex justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="ghost"
              onClick={() => setStep(visibleSteps[currentIndex - 1].n)}
              disabled={currentIndex === 0}
            >
              Atrás
            </Button>
            {!isLastStep ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Omitir por ahora (D-01/D-04): visible SOLO en pasos opcionales intermedios
                    (currentIndex > 0 = no en Negocio; !isLastStep = no en el último, ahí va Finalizar).
                    variant="ghost" → menor énfasis, nunca accent (el accent queda para la única CTA
                    forward). Avanza a la posición siguiente SIN correr canGoNext ni validar: skip
                    granular por paso, no salto al final. No persiste nada (handleFinish ya filtra
                    vacíos, D-05). Siempre habilitado en pasos opcionales. */}
                {currentIndex > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setStep(visibleSteps[currentIndex + 1].n)}
                    className="text-muted-foreground"
                  >
                    Omitir por ahora
                  </Button>
                )}
                <Button
                  onClick={() => setStep(visibleSteps[currentIndex + 1].n)}
                  disabled={!canGoNext()}
                >
                  Siguiente
                </Button>
              </div>
            ) : (
              <Button onClick={handleFinish} disabled={loading}>
                {loading ? 'Guardando...' : 'Finalizar y entrar al dashboard'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
