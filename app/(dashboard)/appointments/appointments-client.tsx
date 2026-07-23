'use client'

import { useState, useRef, useEffect } from 'react'
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Appointment, Professional, Service, TimeBlock, Client, Location } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Plus, Check, X, CheckCircle2, Phone, Mail, Trash2, RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { NuevoTurnoForm } from '@/components/dashboard/nuevo-turno-form'

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

// Rango de fechas (strings 'yyyy-MM-dd') para los presets del filtro, relativos a `ref`.
// La comparación luego es lexicográfica sobre strings ISO (= comparación cronológica),
// igual patrón que ya usa el filtro con `a.date < today`. Semana = lunes a domingo.
function dateRangeFor(mode: 'today' | 'week' | 'month', ref: Date): { from: string; to: string } {
  if (mode === 'today') {
    const d = format(ref, 'yyyy-MM-dd')
    return { from: d, to: d }
  }
  if (mode === 'week') {
    return {
      from: format(startOfWeek(ref, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to: format(endOfWeek(ref, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    }
  }
  return {
    from: format(startOfMonth(ref), 'yyyy-MM-dd'),
    to: format(endOfMonth(ref), 'yyyy-MM-dd'),
  }
}

// Pill de estado y botones de acción de fila — componentes a nivel módulo (no se definen en
// el render) para reusarlos en la tabla (desktop) y en las tarjetas (mobile).
function StatusBadge({ appt }: { appt: Appointment }) {
  return (
    <Badge className={`text-xs ${STATUS_COLORS[appt.status] ?? ''}`} variant="outline">
      {STATUS_LABELS[appt.status] ?? appt.status}
    </Badge>
  )
}

function RowActions({ appt, onStatus, onCancel, onDelete }: {
  appt: Appointment
  onStatus: (id: string, status: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isActive = !['cancelled', 'completed'].includes(appt.status)
  return (
    <div className="flex gap-1 justify-end">
      {appt.status === 'pending' && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-green-400 hover:text-green-300" title="Confirmar" onClick={() => onStatus(appt.id, 'confirmed')}>
          <Check className="w-4 h-4" />
        </Button>
      )}
      {appt.status === 'confirmed' && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-400 hover:text-blue-300" title="Marcar completado" onClick={() => onStatus(appt.id, 'completed')}>
          <CheckCircle2 className="w-4 h-4" />
        </Button>
      )}
      {isActive && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300" title="Cancelar" onClick={() => onCancel(appt.id)}>
          <X className="w-4 h-4" />
        </Button>
      )}
      {(appt.status === 'cancelled' || appt.status === 'pending_payment') && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-400" title="Eliminar registro" onClick={() => onDelete(appt.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  )
}

interface Props {
  initialAppointments: Appointment[]
  professionals: Professional[]
  services: Service[]
  timeBlocks: TimeBlock[]
  clients: Client[]
  locations: Location[]
  businessId: string
}

export function AppointmentsClient({ initialAppointments, professionals, services, clients, locations, businessId }: Props) {
  const supabase = createClient()
  const [appointments, setAppointments] = useState(initialAppointments)
  const [filterDate, setFilterDate] = useState('')
  const [dateMode, setDateMode] = useState<'none' | 'today' | 'week' | 'month' | 'custom'>('none')
  const [dateOpen, setDateOpen] = useState(false)
  const [calView, setCalView] = useState(false)
  const [filterPro, setFilterPro] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [tab, setTab] = useState<'proximos' | 'pasados' | 'todos'>('proximos')
  const [refreshing, setRefreshing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const dateRef = useRef<HTMLDivElement>(null)

  const today = format(new Date(), 'yyyy-MM-dd')

  // Cierre del dropdown de fecha al hacer click fuera del control.
  useEffect(() => {
    if (!dateOpen) return
    function onDown(e: MouseEvent) {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setDateOpen(false)
        setCalView(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dateOpen])

  const filtered = appointments.filter(a => {
    if (tab === 'proximos' && (a.date < today || a.status === 'cancelled')) return false
    if (tab === 'pasados' && a.date >= today) return false
    if (dateMode === 'custom') {
      if (filterDate && a.date !== filterDate) return false
    } else if (dateMode !== 'none') {
      const r = dateRangeFor(dateMode, new Date())
      if (a.date < r.from || a.date > r.to) return false
    }
    if (filterPro !== 'all' && a.professional_id !== filterPro) return false
    if (filterStatus !== 'all' && a.status !== filterStatus) return false
    return true
  }).sort((a, b) => {
    const dateComp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    if (dateComp !== 0) return tab === 'pasados' ? -dateComp : dateComp
    return a.time < b.time ? -1 : 1
  })

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) { toast.error('Error al actualizar'); return }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as Appointment['status'] } : a))
    toast.success('Estado actualizado')
  }

  async function refresh() {
    setRefreshing(true)
    const { data } = await supabase
      .from('appointments')
      .select('*, professionals(name), services(name, price, duration_minutes)')
      .eq('business_id', businessId)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
    if (data) setAppointments(data as Appointment[])
    setRefreshing(false)
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
    const id = confirmDeleteId
    setDeleting(true)
    // Borrado server-side: limpia el evento de Google Calendar (el token es server-only) antes
    // de hard-deletear la fila. Un .delete() client-side dejaba el evento huérfano.
    let ok = false
    try {
      const res = await fetch('/api/appointments/delete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: id }),
      })
      ok = res.ok && !!(await res.json().catch(() => null))?.ok
    } catch (e) {
      console.error('[appointments/delete] no se pudo disparar:', e)
    }
    setDeleting(false)
    setConfirmDeleteId(null)
    if (!ok) { toast.error('Error al eliminar'); return }
    setAppointments(prev => prev.filter(a => a.id !== id))
    toast.success('Turno eliminado')
  }

  const TABS: { k: typeof tab; label: string }[] = [
    { k: 'proximos', label: 'Próximos' },
    { k: 'pasados', label: 'Pasados' },
    { k: 'todos', label: 'Todos' },
  ]

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <PageEyebrow label="Agenda" />
          <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Turnos</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 sm:w-auto w-full">
          <Plus className="w-4 h-4" /> Nuevo turno
        </Button>
      </div>

      {/* Tabs + actualizar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {TABS.map(({ k, label }) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} /> Actualizar
        </Button>
      </div>

      {/* Filtros secundarios */}
      <div className="flex flex-wrap gap-2">
        <div className="relative" ref={dateRef}>
          <button
            type="button"
            onClick={() => { setDateOpen(v => !v); setCalView(false) }}
            className="h-8 w-44 flex items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
          >
            <span className={cn('truncate', dateMode === 'none' && 'text-muted-foreground')}>
              {dateMode === 'none' && 'Fecha'}
              {dateMode === 'today' && 'Hoy'}
              {dateMode === 'week' && 'Esta semana'}
              {dateMode === 'month' && 'Este mes'}
              {dateMode === 'custom' && filterDate && format(parseISO(filterDate), "d 'de' MMM", { locale: es })}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
          {dateOpen && (
            <div className={cn('absolute z-50 mt-1 bg-popover border border-border rounded-md shadow-lg', calView ? 'w-fit' : 'w-44')}>
              {!calView ? (
                <>
                  <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { setDateMode('today'); setDateOpen(false) }}>Hoy</button>
                  <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { setDateMode('week'); setDateOpen(false) }}>Esta semana</button>
                  <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { setDateMode('month'); setDateOpen(false) }}>Este mes</button>
                  <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => setCalView(true)}>Elegir fecha…</button>
                </>
              ) : (
                <Calendar
                  mode="single"
                  selected={filterDate ? parseISO(filterDate) : undefined}
                  onSelect={d => {
                    if (d) { setFilterDate(format(d, 'yyyy-MM-dd')); setDateMode('custom') }
                    setDateOpen(false)
                    setCalView(false)
                  }}
                />
              )}
            </div>
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
        {(dateMode !== 'none' || filterPro !== 'all' || filterStatus !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setDateMode('none'); setFilterDate(''); setDateOpen(false); setCalView(false); setFilterPro('all'); setFilterStatus('all') }}>
            Limpiar
          </Button>
        )}
      </div>

      {/* Lista: tabla en desktop, tarjetas en mobile */}
      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          {tab === 'proximos' ? 'No hay turnos próximos.' : 'No hay turnos con esos filtros.'}
        </p>
      ) : (
        <>
          {/* Desktop: tabla */}
          <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hora</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Servicio</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profesional</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Precio</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(appt => {
                  const service = appt.services as { name?: string; price?: number } | null
                  const professional = appt.professionals as { name?: string } | null
                  const phone = appt.client_phone
                  const waPhone = phone ? '549' + phone.replace(/\D/g, '').replace(/^(549|54)/, '') : null
                  return (
                    <tr key={appt.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        <div className="text-xs text-muted-foreground capitalize">{format(parseISO(appt.date), 'EEE d MMM', { locale: es })}</div>
                        <div className="font-mono font-semibold">{appt.time.slice(0, 5)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {appt.client_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{appt.client_name}</div>
                            {waPhone ? (
                              <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:text-green-400 flex items-center gap-1 transition-colors">
                                <Phone className="w-3 h-3" />{phone}
                              </a>
                            ) : appt.client_email ? (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Mail className="w-3 h-3 flex-shrink-0" />{appt.client_email}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">{service?.name || '—'}</td>
                      <td className="px-4 py-3 align-top text-muted-foreground">{professional?.name || '—'}</td>
                      <td className="px-4 py-3 align-top text-right font-medium whitespace-nowrap">{service?.price != null ? `$${Number(service.price).toLocaleString('es-AR')}` : '—'}</td>
                      <td className="px-4 py-3 align-top"><StatusBadge appt={appt} /></td>
                      <td className="px-4 py-3 align-top"><RowActions appt={appt} onStatus={updateStatus} onCancel={setConfirmCancelId} onDelete={setConfirmDeleteId} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: tarjetas */}
          <div className="md:hidden space-y-2">
            {filtered.map(appt => {
              const service = appt.services as { name?: string; price?: number } | null
              const professional = appt.professionals as { name?: string } | null
              const phone = appt.client_phone
              const waPhone = phone ? '549' + phone.replace(/\D/g, '').replace(/^(549|54)/, '') : null
              return (
                <div key={appt.id} className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border">
                  <div className="w-14 flex-shrink-0 pt-0.5">
                    <p className="text-xs text-muted-foreground capitalize">{format(parseISO(appt.date), 'd MMM', { locale: es })}</p>
                    <p className="text-sm font-mono font-semibold">{appt.time.slice(0, 5)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm truncate">{appt.client_name}</p>
                      <StatusBadge appt={appt} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {service?.name}
                      {professional?.name && ` · ${professional.name}`}
                      {service?.price != null && ` · $${Number(service.price).toLocaleString('es-AR')}`}
                    </p>
                    {(phone || appt.client_email) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        {waPhone && (
                          <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 hover:text-green-400 flex items-center gap-1 transition-colors">
                            <Phone className="w-3 h-3" />{phone}
                          </a>
                        )}
                        {appt.client_email && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{appt.client_email}</span>
                        )}
                      </div>
                    )}
                    <div className="mt-2"><RowActions appt={appt} onStatus={updateStatus} onCancel={setConfirmCancelId} onDelete={setConfirmDeleteId} /></div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

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

      {/* Nuevo turno — form compartido (modal desktop / drawer mobile), alta vía el endpoint autenticado */}
      <NuevoTurnoForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clients={clients}
        services={services}
        professionals={professionals}
        locations={locations}
      />
    </div>
  )
}
