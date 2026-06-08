'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Appointment, Professional, Service, TimeBlock } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Check, X, CheckCircle2, Phone, Mail, Trash2, Eye, EyeOff, History } from 'lucide-react'

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  pending_payment: 'Pendiente de pago',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  pending_payment: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  confirmed: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

interface Props {
  initialAppointments: Appointment[]
  professionals: Professional[]
  services: Service[]
  timeBlocks: TimeBlock[]
  businessId: string
}

export function AppointmentsClient({ initialAppointments, professionals, services, timeBlocks, businessId }: Props) {
  const supabase = createClient()
  const [appointments, setAppointments] = useState(initialAppointments)
  const [filterDate, setFilterDate] = useState('')
  const [filterPro, setFilterPro] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showCancelled, setShowCancelled] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // New appointment form
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
  const [modalSlots, setModalSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')

  // Calculate available slots for new appointment modal
  const calculateModalSlots = useCallback(async () => {
    if (!form.date || !form.service_id) { setModalSlots([]); return }
    const service = services.find(s => s.id === form.service_id)
    if (!service) return

    const dateObj = new Date(form.date + 'T12:00:00')
    const dayBlocks = timeBlocks.filter(b => b.day_of_week === dateObj.getDay())
    if (dayBlocks.length === 0) {
      setModalSlots([])
      return
    }

    setLoadingSlots(true)
    const { data: existing } = await supabase
      .from('appointments')
      .select('time, professional_id, services(duration_minutes)')
      .eq('business_id', businessId)
      .eq('date', form.date)
      .neq('status', 'cancelled')
      .neq('status', 'pending_payment')

    const proId = form.professional_id && form.professional_id !== 'none' ? form.professional_id : null
    const relevant = proId
      ? (existing || []).filter(a => !a.professional_id || a.professional_id === proId)
      : (existing || [])

    const duration = service.duration_minutes
    const isToday = form.date === today
    const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1

    const slots: string[] = []
    for (const block of dayBlocks.sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const openMin = timeToMinutes(block.start_time)
      const closeMin = timeToMinutes(block.end_time)
      for (let t = openMin; t + duration <= closeMin; t += duration) {
        if (nowMin >= 0 && t <= nowMin) continue
        const slotEnd = t + duration
        const conflict = relevant.some(a => {
          const aStart = timeToMinutes(a.time)
          const aDur = (a.services as { duration_minutes?: number } | null)?.duration_minutes || 30
          return t < aStart + aDur && slotEnd > aStart
        })
        if (!conflict) slots.push(minutesToTime(t))
      }
    }
    setModalSlots(slots)
    setLoadingSlots(false)
  }, [form.date, form.service_id, form.professional_id, services, timeBlocks, businessId, today, supabase])

  useEffect(() => {
    if (form.date && form.service_id) calculateModalSlots()
    else setModalSlots([])
  }, [form.date, form.service_id, form.professional_id, calculateModalSlots])

  const filtered = appointments.filter(a => {
    if (!showCancelled && a.status === 'cancelled') return false
    if (!showPast && a.date < today) return false
    if (filterDate && a.date !== filterDate) return false
    if (filterPro !== 'all' && a.professional_id !== filterPro) return false
    if (filterStatus !== 'all' && a.status !== filterStatus) return false
    return true
  }).sort((a, b) => {
    const dateComp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    if (dateComp !== 0) return showPast ? -dateComp : dateComp
    return a.time < b.time ? -1 : 1
  })

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) { toast.error('Error al actualizar'); return }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as Appointment['status'] } : a))
    toast.success('Estado actualizado')
  }

  // Cancelación desde el panel: solo se ejecuta al confirmar en el diálogo. El endpoint es
  // la autoridad: cancela el turno (auth + ownership + tenant) Y manda el email server-side,
  // en orden, sin carrera de tiempos. Acá NO cancelamos por separado (eso causaba la carrera
  // que dejaba el mail sin salir). credentials same-origin para que viajen las cookies de
  // sesión; se chequea res.ok porque fetch no rechaza ante 401/403/500.
  async function handleCancel() {
    if (!confirmCancelId) return
    const id = confirmCancelId
    setCancelling(true)

    let cancelled = false
    let emailSent = false
    let reason: string | null = null
    let emailError: string | null = null
    try {
      const res = await fetch('/api/notify/cancel', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: id }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        cancelled = !!data?.cancelled
        emailSent = !!data?.email_sent
        reason = data?.reason ?? null
        emailError = data?.email_error ?? null
      } else {
        console.error(`[notify/cancel] el endpoint respondió HTTP ${res.status}`, data)
      }
    } catch (e) {
      console.error('[notify/cancel] no se pudo disparar:', e)
    }

    setCancelling(false)
    setConfirmCancelId(null)

    if (!cancelled) {
      toast.error('No se pudo cancelar el turno. Probá de nuevo.')
      return
    }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' as Appointment['status'] } : a))
    if (emailSent) {
      toast.success('Turno cancelado — le avisamos al cliente por email')
    } else if (reason === 'no_client_email') {
      toast.success('Turno cancelado (el cliente no tiene email cargado)')
    } else {
      if (emailError) console.error('[notify/cancel] Resend:', emailError)
      toast.warning('Turno cancelado, pero no pudimos enviar el email al cliente')
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return
    setDeleting(true)
    const { error } = await supabase.from('appointments').delete().eq('id', confirmDeleteId)
    setDeleting(false)
    setConfirmDeleteId(null)
    if (error) { toast.error('Error al eliminar'); return }
    setAppointments(prev => prev.filter(a => a.id !== confirmDeleteId))
    toast.success('Turno eliminado')
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
      .select().single()

    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        business_id: businessId,
        client_id: client?.id || null,
        client_name: form.client_name,
        client_phone: form.client_phone || null,
        client_email: form.client_email || null,
        service_id: form.service_id,
        professional_id: form.professional_id && form.professional_id !== 'none' ? form.professional_id : null,
        date: form.date,
        time: form.time,
        notes: form.notes || null,
        status: 'confirmed',
      })
      .select('*, professionals(name), services(name, price, duration_minutes)')
      .single()

    setSaving(false)
    if (error) { toast.error('Error al crear turno'); return }
    setAppointments(prev => [...prev, appt as Appointment])
    setDialogOpen(false)
    setForm({ client_name: '', client_phone: '', client_email: '', service_id: '', professional_id: '', date: '', time: '', notes: '' })
    toast.success('Turno creado')
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Turnos</h1>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 sm:w-auto w-full">
          <Plus className="w-4 h-4" /> Nuevo turno
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-44 text-sm" />
          {!filterDate && (
            <span className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm text-muted-foreground bg-background rounded-md border border-input">
              Filtrar por fecha
            </span>
          )}
        </div>
        <Select value={filterPro} onValueChange={v => setFilterPro(v ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue>{filterPro === 'all' ? 'Profesional' : (professionals.find(p => p.id === filterPro)?.name ?? 'Profesional')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'all')}>
          <SelectTrigger className="w-44">
            <SelectValue>{filterStatus === 'all' ? 'Estado' : (STATUS_LABELS[filterStatus] ?? 'Estado')}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={showPast ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowPast(v => !v)} className="gap-1.5">
          <History className="w-3.5 h-3.5" />
          {showPast ? 'Próximos' : 'Ver todos'}
        </Button>
        <Button variant={showCancelled ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowCancelled(v => !v)} className="gap-1.5">
          {showCancelled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          Cancelados
        </Button>
        {(filterDate || filterPro !== 'all' || filterStatus !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterDate(''); setFilterPro('all'); setFilterStatus('all') }}>
            Limpiar
          </Button>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">
            {!showPast ? 'No hay turnos próximos — usá "Ver todos" para ver el historial' : 'No hay turnos con esos filtros'}
          </p>
        ) : (
          filtered.map(appt => {
            const service = appt.services as { name?: string; price?: number } | null
            const professional = appt.professionals as { name?: string } | null
            const phone = appt.client_phone
            const waPhone = phone ? '549' + phone.replace(/\D/g, '').replace(/^(549|54)/, '') : null
            const isActive = !['cancelled', 'completed'].includes(appt.status)

            return (
              <div key={appt.id} className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border">
                <div className="w-14 flex-shrink-0 pt-0.5">
                  <p className="text-xs text-muted-foreground">{format(parseISO(appt.date), 'd MMM', { locale: es })}</p>
                  <p className="text-sm font-mono font-semibold">{appt.time.slice(0, 5)}</p>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{appt.client_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {service?.name}
                    {professional?.name && ` · ${professional.name}`}
                    {service?.price != null && ` · $${Number(service.price).toLocaleString('es-AR')}`}
                  </p>
                  {(phone || appt.client_email) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      {waPhone && (
                        <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 transition-colors">
                          <Phone className="w-3 h-3" />{phone}
                        </a>
                      )}
                      {appt.client_email && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />{appt.client_email}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <Badge className={`text-xs hidden sm:inline-flex flex-shrink-0 ${STATUS_COLORS[appt.status] ?? ''}`} variant="outline">
                  {STATUS_LABELS[appt.status] ?? appt.status}
                </Badge>

                <div className="flex gap-1 flex-shrink-0">
                  {appt.status === 'pending' && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-green-400 hover:text-green-300" title="Confirmar" onClick={() => updateStatus(appt.id, 'confirmed')}>
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                  {appt.status === 'confirmed' && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-400 hover:text-blue-300" title="Marcar completado" onClick={() => updateStatus(appt.id, 'completed')}>
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  )}
                  {isActive && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300" title="Cancelar" onClick={() => setConfirmCancelId(appt.id)}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  {(appt.status === 'cancelled' || appt.status === 'pending_payment') && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-400" title="Eliminar registro" onClick={() => setConfirmDeleteId(appt.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Confirm cancel dialog */}
      <Dialog open={!!confirmCancelId} onOpenChange={open => { if (!open && !cancelling) setConfirmCancelId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Cancelar este turno?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">El cliente será notificado por email. El horario queda disponible para otras personas.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmCancelId(null)} disabled={cancelling}>Volver</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelando...' : 'Sí, cancelar turno'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={open => !open && setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Eliminar turno?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción borra el registro permanentemente y no se puede deshacer.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New appointment dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) setModalSlots([]) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo turno</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Nombre *</Label>
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
              <Select value={form.service_id} onValueChange={v => setForm(f => ({ ...f, service_id: v ?? '', time: '' }))}>
                <SelectTrigger>
                  <SelectValue>
                    {(() => {
                      const s = services.find(s => s.id === form.service_id)
                      return s ? `${s.name} — ${s.duration_minutes}min` : <span className="text-muted-foreground">Elegí un servicio</span>
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — {s.duration_minutes}min — ${Number(s.price).toLocaleString('es-AR')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Profesional</Label>
              <Select value={form.professional_id} onValueChange={v => setForm(f => ({ ...f, professional_id: v ?? '', time: '' }))}>
                <SelectTrigger>
                  <SelectValue>
                    {form.professional_id && form.professional_id !== 'none'
                      ? (professionals.find(p => p.id === form.professional_id)?.name ?? 'Sin preferencia')
                      : <span className="text-muted-foreground">Sin preferencia</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin preferencia</SelectItem>
                  {professionals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Fecha *</Label>
                <Input
                  type="date"
                  min={today}
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value, time: '' }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Horario *</Label>
                {form.date && form.service_id ? (
                  loadingSlots ? (
                    <div className="h-9 flex items-center px-3 text-sm text-muted-foreground border rounded-md">Calculando...</div>
                  ) : modalSlots.length === 0 ? (
                    <div className="h-9 flex items-center px-3 text-sm text-muted-foreground border rounded-md">Sin horarios</div>
                  ) : (
                    <Select value={form.time} onValueChange={v => setForm(f => ({ ...f, time: v ?? '' }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Elegí horario" />
                      </SelectTrigger>
                      <SelectContent>
                        {modalSlots.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <div className="h-9 flex items-center px-3 text-sm text-muted-foreground border rounded-md border-dashed">
                    Elegí servicio y fecha
                  </div>
                )}
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
