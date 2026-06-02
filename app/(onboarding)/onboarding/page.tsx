'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, Plus, Trash2, Clock, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

const BUSINESS_TYPES = ['Barbería', 'Estética', 'Centro médico', 'Psicología', 'Odontología', 'Kinesiología', 'Otro']

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const DEFAULT_HOURS = [
  { day_of_week: 0, is_open: false, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 3, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 5, is_open: true, open_time: '09:00', close_time: '18:00' },
  { day_of_week: 6, is_open: true, open_time: '09:00', close_time: '13:00' },
]

interface Service {
  name: string
  duration_minutes: number
  price: number
}

interface Professional {
  name: string
}

interface HourConfig {
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
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
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [instagram, setInstagram] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#d94a2b')

  // Step 2 - Services
  const [services, setServices] = useState<Service[]>([{ name: '', duration_minutes: 30, price: 0 }])

  // Step 3 - Professionals
  const [professionals, setProfessionals] = useState<Professional[]>([{ name: '' }])

  // Step 4 - Hours
  const [hours, setHours] = useState<HourConfig[]>(DEFAULT_HOURS)

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

  // Hours
  function toggleDay(i: number) {
    const updated = [...hours]
    updated[i].is_open = !updated[i].is_open
    setHours(updated)
  }

  function updateHour(i: number, field: 'open_time' | 'close_time', value: string) {
    const updated = [...hours]
    updated[i][field] = value
    setHours(updated)
  }

  async function handleFinish() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name,
          slug,
          type,
          phone: phone || null,
          address: address || null,
          instagram: instagram || null,
          primary_color: primaryColor,
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

      await supabase.from('business_hours').insert(
        hours.map(h => ({ ...h, business_id: business.id }))
      )

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
          <h1 className="text-3xl font-bold text-primary mb-2">Forjo</h1>
          <p className="text-muted-foreground">Configurá tu negocio en 4 pasos</p>
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
                      {BUSINESS_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

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
                  <Label>Teléfono <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+54 9 11 1234-5678" />
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
                <Label>Color principal</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-sm text-muted-foreground">{primaryColor}</span>
                  <Button variant="ghost" size="sm" onClick={() => setPrimaryColor('#d94a2b')}>
                    Resetear
                  </Button>
                </div>
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
              <div className="space-y-2">
                {hours.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <button
                      onClick={() => toggleDay(i)}
                      className={cn(
                        'w-20 text-xs font-medium py-1 px-2 rounded transition-colors',
                        h.is_open ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                      )}
                    >
                      {DAYS[h.day_of_week]}
                    </button>
                    {h.is_open ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="time"
                          value={h.open_time}
                          onChange={e => updateHour(i, 'open_time', e.target.value)}
                          className="w-28 text-sm"
                        />
                        <span className="text-muted-foreground text-sm">—</span>
                        <Input
                          type="time"
                          value={h.close_time}
                          onChange={e => updateHour(i, 'close_time', e.target.value)}
                          className="w-28 text-sm"
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Cerrado</span>
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
