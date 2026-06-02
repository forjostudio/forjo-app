'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, Service, Professional, BusinessHour } from '@/lib/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Clock, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

const BUSINESS_TYPES = ['Barbería', 'Estética', 'Centro médico', 'Psicología', 'Odontología', 'Kinesiología', 'Otro']
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface Props {
  business: Business
  initialServices: Service[]
  initialProfessionals: Professional[]
  initialHours: BusinessHour[]
}

export function SettingsClient({ business, initialServices, initialProfessionals, initialHours }: Props) {
  const supabase = createClient()

  // Tab 1 - Business info
  const [bizForm, setBizForm] = useState({
    name: business.name,
    type: business.type || '',
    phone: business.phone || '',
    address: business.address || '',
    instagram: business.instagram || '',
    primary_color: business.primary_color,
  })
  const [savingBiz, setSavingBiz] = useState(false)

  async function saveBusiness() {
    setSavingBiz(true)
    const { error } = await supabase
      .from('businesses')
      .update(bizForm)
      .eq('id', business.id)
    setSavingBiz(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Negocio actualizado')
  }

  // Tab 2 - Services
  const [services, setServices] = useState<Service[]>(initialServices)
  const [newService, setNewService] = useState({ name: '', duration_minutes: 30, price: 0 })

  async function addService() {
    if (!newService.name) return
    const { data, error } = await supabase
      .from('services')
      .insert({ ...newService, business_id: business.id })
      .select()
      .single()
    if (error) { toast.error('Error'); return }
    setServices(prev => [...prev, data as Service])
    setNewService({ name: '', duration_minutes: 30, price: 0 })
    toast.success('Servicio agregado')
  }

  async function deleteService(id: string) {
    await supabase.from('services').delete().eq('id', id)
    setServices(prev => prev.filter(s => s.id !== id))
    toast.success('Servicio eliminado')
  }

  async function toggleService(id: string, active: boolean) {
    await supabase.from('services').update({ active }).eq('id', id)
    setServices(prev => prev.map(s => s.id === id ? { ...s, active } : s))
  }

  // Tab 3 - Professionals
  const [professionals, setProfessionals] = useState<Professional[]>(initialProfessionals)
  const [newProName, setNewProName] = useState('')

  async function addProfessional() {
    if (!newProName) return
    const { data, error } = await supabase
      .from('professionals')
      .insert({ name: newProName, business_id: business.id })
      .select()
      .single()
    if (error) { toast.error('Error'); return }
    setProfessionals(prev => [...prev, data as Professional])
    setNewProName('')
    toast.success('Profesional agregado')
  }

  async function deleteProfessional(id: string) {
    await supabase.from('professionals').delete().eq('id', id)
    setProfessionals(prev => prev.filter(p => p.id !== id))
    toast.success('Profesional eliminado')
  }

  // Tab 4 - Hours
  const [hours, setHours] = useState<BusinessHour[]>(initialHours)

  async function saveHours() {
    const { error } = await supabase
      .from('business_hours')
      .upsert(hours.map(h => ({ ...h, business_id: business.id })))
    if (error) toast.error('Error al guardar')
    else toast.success('Horarios actualizados')
  }

  function toggleDay(i: number) {
    const updated = [...hours]
    updated[i] = { ...updated[i], is_open: !updated[i].is_open }
    setHours(updated)
  }

  function updateHour(i: number, field: 'open_time' | 'close_time', value: string) {
    const updated = [...hours]
    updated[i] = { ...updated[i], [field]: value }
    setHours(updated)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración</h1>

      <Tabs defaultValue="business">
        <TabsList className="grid grid-cols-4 w-full sm:w-auto">
          <TabsTrigger value="business">Negocio</TabsTrigger>
          <TabsTrigger value="services">Servicios</TabsTrigger>
          <TabsTrigger value="professionals">Equipo</TabsTrigger>
          <TabsTrigger value="hours">Horarios</TabsTrigger>
        </TabsList>

        {/* Business */}
        <TabsContent value="business" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre del negocio</Label>
                <Input value={bizForm.name} onChange={e => setBizForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={bizForm.type} onValueChange={v => setBizForm(f => ({ ...f, type: v ?? '' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={bizForm.phone} onChange={e => setBizForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Instagram</Label>
                <Input value={bizForm.instagram} onChange={e => setBizForm(f => ({ ...f, instagram: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Dirección</Label>
                <Input value={bizForm.address} onChange={e => setBizForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Color principal</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={bizForm.primary_color}
                    onChange={e => setBizForm(f => ({ ...f, primary_color: e.target.value }))}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-sm text-muted-foreground">{bizForm.primary_color}</span>
                </div>
              </div>
            </div>
            <div className="pt-2">
              <Label className="text-muted-foreground text-xs">URL de tu página</Label>
              <p className="text-sm mt-1">
                {process.env.NEXT_PUBLIC_APP_URL}/{business.slug}
              </p>
            </div>
            <Button onClick={saveBusiness} disabled={savingBiz}>
              {savingBiz ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </Card>
        </TabsContent>

        {/* Services */}
        <TabsContent value="services" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              {services.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', !s.active && 'line-through text-muted-foreground')}>
                      {s.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.duration_minutes}min · ${Number(s.price).toLocaleString('es-AR')}</p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => toggleService(s.id, !s.active)}>
                    {s.active ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => deleteService(s.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium">Agregar servicio</p>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5 space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre</Label>
                  <Input value={newService.name} onChange={e => setNewService(f => ({ ...f, name: e.target.value }))} placeholder="Nombre" />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Min.</Label>
                  <Input type="number" value={newService.duration_minutes} onChange={e => setNewService(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))} min={5} step={5} />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Precio</Label>
                  <Input type="number" value={newService.price} onChange={e => setNewService(f => ({ ...f, price: parseFloat(e.target.value) }))} min={0} step={100} />
                </div>
                <div className="col-span-1">
                  <Button size="icon" onClick={addService} className="h-9 w-9"><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Professionals */}
        <TabsContent value="professionals" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              {professionals.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm">{p.name}</span>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => deleteProfessional(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4 flex gap-2">
              <Input value={newProName} onChange={e => setNewProName(e.target.value)} placeholder="Nombre del profesional" className="flex-1" />
              <Button onClick={addProfessional} className="gap-1"><Plus className="w-4 h-4" /> Agregar</Button>
            </div>
          </Card>
        </TabsContent>

        {/* Hours */}
        <TabsContent value="hours" className="mt-4">
          <Card className="p-6 space-y-2">
            {hours.sort((a, b) => a.day_of_week - b.day_of_week).map((h, i) => (
              <div key={h.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <button
                  onClick={() => toggleDay(i)}
                  className={cn(
                    'w-24 text-xs font-medium py-1.5 px-3 rounded transition-colors',
                    h.is_open ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {DAYS[h.day_of_week]}
                </button>
                {h.is_open ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={h.open_time || '09:00'}
                      onChange={e => updateHour(i, 'open_time', e.target.value)}
                      className="w-28 text-sm"
                    />
                    <span className="text-muted-foreground">—</span>
                    <Input
                      type="time"
                      value={h.close_time || '18:00'}
                      onChange={e => updateHour(i, 'close_time', e.target.value)}
                      className="w-28 text-sm"
                    />
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Cerrado</span>
                )}
              </div>
            ))}
            <div className="pt-4">
              <Button onClick={saveHours}>Guardar horarios</Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
