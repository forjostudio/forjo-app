'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Appointment, Professional, Service } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Check, X, CheckCircle2 } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', cancelled: 'Cancelado', completed: 'Completado',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  completed: 'bg-green-500/20 text-green-400 border-green-500/30',
}

interface Props {
  initialAppointments: Appointment[]
  professionals: Professional[]
  services: Service[]
  businessId: string
}

export function AppointmentsClient({ initialAppointments, professionals, services, businessId }: Props) {
  const supabase = createClient()
  const [appointments, setAppointments] = useState(initialAppointments)
  const [filterDate, setFilterDate] = useState('')
  const [filterPro, setFilterPro] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    service_id: '',
    professional_id: '',
    date: '',
    time: '',
    notes: '',
  })

  const filtered = appointments.filter(a => {
    if (filterDate && a.date !== filterDate) return false
    if (filterPro !== 'all' && a.professional_id !== filterPro) return false
    if (filterStatus !== 'all' && a.status !== filterStatus) return false
    return true
  })

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)

    if (error) {
      toast.error('Error al actualizar')
      return
    }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as Appointment['status'] } : a))
    toast.success('Estado actualizado')
  }

  async function handleCreate() {
    if (!form.client_name || !form.service_id || !form.date || !form.time) {
      toast.error('Completá los campos obligatorios')
      return
    }
    setSaving(true)

    const { data: client } = await supabase
      .from('clients')
      .insert({ business_id: businessId, name: form.client_name, phone: form.client_phone || null, email: form.client_email || null })
      .select()
      .single()

    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        business_id: businessId,
        client_id: client?.id || null,
        client_name: form.client_name,
        client_phone: form.client_phone || null,
        client_email: form.client_email || null,
        service_id: form.service_id,
        professional_id: form.professional_id || null,
        date: form.date,
        time: form.time,
        notes: form.notes || null,
        status: 'confirmed',
      })
      .select('*, professionals(name), services(name, price, duration_minutes)')
      .single()

    setSaving(false)

    if (error) {
      toast.error('Error al crear turno')
      return
    }

    setAppointments(prev => [appt as Appointment, ...prev])
    setDialogOpen(false)
    setForm({ client_name: '', client_phone: '', client_email: '', service_id: '', professional_id: '', date: '', time: '', notes: '' })
    toast.success('Turno creado')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Turnos</h1>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 sm:w-auto w-full">
          <Plus className="w-4 h-4" /> Nuevo turno
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="w-44 text-sm"
          />
          {!filterDate && (
            <span className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm text-muted-foreground bg-background rounded-md border border-input">
              Filtrar por fecha
            </span>
          )}
        </div>
        <Select value={filterPro} onValueChange={v => setFilterPro(v ?? 'all')}>
          <SelectTrigger className="w-48">
            <SelectValue>
              {filterPro === 'all'
                ? 'Todos los profesionales'
                : (professionals.find(p => p.id === filterPro)?.name ?? 'Todos los profesionales')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los profesionales</SelectItem>
            {professionals.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {filterStatus === 'all' ? 'Todos los estados' : (STATUS_LABELS[filterStatus] ?? 'Todos los estados')}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterDate || filterPro !== 'all' || filterStatus !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterDate(''); setFilterPro('all'); setFilterStatus('all') }}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No hay turnos con esos filtros</p>
        ) : (
          filtered.map(appt => {
            const service = appt.services as { name?: string; price?: number } | null
            const professional = appt.professionals as { name?: string } | null
            return (
              <div key={appt.id} className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
                <div className="w-14 flex-shrink-0">
                  <p className="text-xs text-muted-foreground">{format(parseISO(appt.date), 'd MMM', { locale: es })}</p>
                  <p className="text-sm font-mono font-semibold">{appt.time.slice(0, 5)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{appt.client_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {service?.name}
                    {professional?.name && ` · ${professional.name}`}
                    {service?.price && ` · $${Number(service.price).toLocaleString('es-AR')}`}
                  </p>
                </div>
                <Badge className={`text-xs hidden sm:inline-flex ${STATUS_COLORS[appt.status]}`} variant="outline">
                  {STATUS_LABELS[appt.status]}
                </Badge>
                {appt.status === 'pending' && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-400" onClick={() => updateStatus(appt.id, 'confirmed')}>
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400" onClick={() => updateStatus(appt.id, 'cancelled')}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                {appt.status === 'confirmed' && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-400" onClick={() => updateStatus(appt.id, 'completed')}>
                    <CheckCircle2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* New appointment dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Nombre del cliente *</Label>
                <Input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Servicio *</Label>
              <Select value={form.service_id} onValueChange={v => setForm(f => ({ ...f, service_id: v ?? '' }))}>
                <SelectTrigger>
                  <SelectValue>
                    {(() => {
                      const s = services.find(s => s.id === form.service_id)
                      return s
                        ? `${s.name} — ${s.duration_minutes}min — $${Number(s.price).toLocaleString('es-AR')}`
                        : <span className="text-muted-foreground">Elegí un servicio</span>
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {s.duration_minutes}min — ${Number(s.price).toLocaleString('es-AR')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Profesional</Label>
              <Select value={form.professional_id} onValueChange={v => setForm(f => ({ ...f, professional_id: v ?? '' }))}>
                <SelectTrigger>
                  <SelectValue>
                    {form.professional_id && form.professional_id !== 'none'
                      ? (professionals.find(p => p.id === form.professional_id)?.name ?? 'Sin preferencia')
                      : <span className="text-muted-foreground">Sin preferencia</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin preferencia</SelectItem>
                  {professionals.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Hora *</Label>
                <Input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={saving}>{saving ? 'Guardando...' : 'Crear turno'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
