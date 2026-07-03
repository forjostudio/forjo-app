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
    updated[i] = { ...updated[i], [field]: value }
    setServices(updated)
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

      await supabase.from('services').insert(
        services.filter(s => s.name).map(s => ({ ...s, business_id: business.id }))
      )

      await supabase.from('professionals').insert(
        professionals.filter(p => p.name).map(p => ({ ...p, business_id: business.id }))
      )

      // TODO(Task 2): insertar time_blocks desde dayStates.
      void dayStates

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

  const steps = [
    { n: 1, label: 'Tu negocio' },
    { n: 2, label: 'Servicios' },
    { n: 3, label: 'Profesionales' },
    { n: 4, label: 'Horarios' },
  ]

  const canGoNext = () => {
    if (step === 1) return name && slug && slugAvailable && type
    if (step === 2) return services.every(s => s.name && s.price > 0) && services.length > 0
    if (step === 3) return professionals.every(p => p.name) && professionals.length > 0
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
          <p className="text-muted-foreground mt-2">Configurá tu negocio en 4 pasos</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 gap-0">
          {steps.map((s, idx) => (
            <div key={s.n} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                  step > s.n ? 'bg-primary text-primary-foreground' :
                  step === s.n ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                  'bg-secondary text-muted-foreground'
                )}>
                  {step > s.n ? <Check className="w-4 h-4" /> : s.n}
                </div>
                <span className={cn(
                  'text-xs mt-1 hidden sm:block',
                  step === s.n ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}>{s.label}</span>
              </div>
              {idx < steps.length - 1 && (
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
                  <Input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+54 9 11 1234-5678" />
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
                {services.map((service, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5 space-y-1">
                      {i === 0 && <Label className="text-xs text-muted-foreground">Nombre</Label>}
                      <Input
                        value={service.name}
                        onChange={e => updateService(i, 'name', e.target.value)}
                        placeholder="Corte de cabello"
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      {i === 0 && (
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Min.
                        </Label>
                      )}
                      <Input
                        type="number"
                        value={service.duration_minutes}
                        onChange={e => updateService(i, 'duration_minutes', parseInt(e.target.value))}
                        min={5}
                        step={5}
                      />
                    </div>
                    <div className="col-span-3 space-y-1">
                      {i === 0 && (
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> Precio
                        </Label>
                      )}
                      <Input
                        type="number"
                        value={service.price}
                        onChange={e => updateService(i, 'price', parseFloat(e.target.value))}
                        min={0}
                        step={100}
                      />
                    </div>
                    <div className="col-span-1 flex items-end justify-end">
                      {services.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeService(i)}
                          className="text-muted-foreground hover:text-destructive h-9 w-9"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
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
              <p className="text-sm text-muted-foreground">Podés cargar horario partido: agregá más de un bloque por día (ej. 9-12 y 15-19). Un día sin bloques queda cerrado.</p>
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

          {/* Navigation */}
          <div className="flex justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="ghost"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 1}
            >
              Atrás
            </Button>
            {step < 4 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                disabled={!canGoNext()}
              >
                Siguiente
              </Button>
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
