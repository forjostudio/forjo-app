'use client'

import { useState, useMemo, useEffect, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, TimeBlock, Location, ScheduleException } from '@/lib/types'
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, addDays, isSameMonth, isSameDay, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X, Copy, ChevronLeft, ChevronRight, CalendarOff, CalendarClock, Check, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveVertical } from '@/lib/verticals'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'

// Turno para la vista semanal (subset con joins de nombre de servicio/profesional).
export type AgendaAppt = {
  id: string
  date: string
  time: string
  status: string
  client_name: string
  duration_minutes: number | null
  location_id: string | null
  services: { name?: string } | null
  professionals: { name?: string } | null
}

// Color del chip de turno según su estado, para la vista semanal.
function statusChip(status: string): string {
  if (status === 'confirmed') return 'bg-primary/10 text-foreground border-primary/30'
  if (status === 'pending_payment') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
  return 'bg-secondary text-muted-foreground border-border'
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon → Sun
const SLOT_DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30]

// ── Time block state types ──────────────────────────────────────────────────
type LocalBlock = { id?: string; start_time: string; end_time: string; label: string; location_id: string; error?: string }
type DayConfig = { enabled: boolean; blocks: LocalBlock[] }

function defaultBlock(day: number): LocalBlock {
  if (day >= 1 && day <= 5) return { start_time: '09:00', end_time: '18:00', label: '', location_id: '' }
  if (day === 6) return { start_time: '09:00', end_time: '13:00', label: '', location_id: '' }
  return { start_time: '09:00', end_time: '18:00', label: '', location_id: '' }
}

interface Props {
  business: Business
  initialTimeBlocks: TimeBlock[]
  initialLocations: Location[]
  initialExceptions: ScheduleException[]
  initialAppointments: AgendaAppt[]
  googleEnabled: boolean
  googleConnected: boolean
}

export function AgendaClient({ business, initialTimeBlocks, initialLocations, initialExceptions, initialAppointments, googleEnabled, googleConnected }: Props) {
  const supabase = createClient()
  const router = useRouter()

  // Aviso al volver del OAuth de Google (?google=connected|error) y limpieza de la URL.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get('google')
    if (!g) return
    if (g === 'connected') toast.success('Google Calendar conectado')
    else if (g === 'error') toast.error('No se pudo conectar con Google Calendar')
    window.history.replaceState(null, '', '/agenda')
  }, [])

  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false)
  async function disconnectGoogle() {
    setDisconnectingGoogle(true)
    const res = await fetch('/api/google/disconnect', { method: 'POST' })
    setDisconnectingGoogle(false)
    if (res.ok) { toast.success('Google Calendar desconectado'); router.refresh() }
    else toast.error('No se pudo desconectar')
  }
  const [syncingGoogle, setSyncingGoogle] = useState(false)
  async function syncGoogle() {
    setSyncingGoogle(true)
    try {
      const res = await fetch('/api/google/sync', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        const n = data.cancelled ?? 0
        toast.success(n > 0 ? `${n} turno${n > 1 ? 's' : ''} cancelado${n > 1 ? 's' : ''} desde tu calendario` : 'Todo al día, sin cambios')
        if (n > 0) router.refresh()
      } else toast.error('No se pudo sincronizar')
    } finally {
      setSyncingGoogle(false)
    }
  }

  // Etiqueta del lugar de atención según el rubro (Consultorio/Local/Sucursal).
  const term = resolveVertical(business).terminology
  const locWord = term.location.toLowerCase()
  // Los consultorios se administran en Configuración; acá solo se asignan a los bloques.
  const activeLocations = initialLocations.filter(l => l.is_active !== false)

  // ── Grilla semanal (time_blocks) ────────────────────────────────────────────
  const [slotDuration, setSlotDuration] = useState(business.default_slot_duration ?? 60)
  const [bufferMinutes, setBufferMinutes] = useState(business.buffer_minutes ?? 0)
  const [dayStates, setDayStates] = useState<DayConfig[]>(() =>
    Array.from({ length: 7 }, (_, day) => {
      const blocks = initialTimeBlocks.filter(b => b.day_of_week === day)
      return {
        enabled: blocks.length > 0,
        blocks: blocks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, label: b.label || '', location_id: b.location_id || '' })),
      }
    })
  )
  const [savingHours, setSavingHours] = useState(false)

  function toggleDay(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const current = next[day]
      if (current.enabled) {
        next[day] = { ...current, enabled: false }
      } else {
        next[day] = {
          enabled: true,
          blocks: current.blocks.length > 0 ? current.blocks : [defaultBlock(day)],
        }
      }
      return next
    })
  }

  function addBlock(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const lastBlock = next[day].blocks[next[day].blocks.length - 1]
      const newStart = lastBlock?.end_time || '09:00'
      const [h, m] = newStart.split(':').map(Number)
      const newEnd = `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      next[day] = { ...next[day], blocks: [...next[day].blocks, { start_time: newStart, end_time: newEnd, label: '', location_id: lastBlock?.location_id || '' }] }
      return next
    })
  }

  function removeBlock(day: number, idx: number) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks = next[day].blocks.filter((_, i) => i !== idx)
      next[day] = { ...next[day], blocks, enabled: blocks.length > 0 }
      return next
    })
  }

  function updateBlock(day: number, idx: number, field: keyof LocalBlock, value: string) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks = [...next[day].blocks]
      blocks[idx] = { ...blocks[idx], [field]: value, error: undefined }
      next[day] = { ...next[day], blocks }
      return next
    })
  }

  function validateBlocks(): boolean {
    let valid = true
    const next = dayStates.map(ds => {
      if (!ds.enabled) return ds
      const blocks = ds.blocks.map(b => {
        if (b.end_time <= b.start_time) return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' }
        return { ...b, error: undefined }
      })
      // Check overlaps (sort by start, check consecutive)
      const sorted = [...blocks].sort((a, b) => a.start_time.localeCompare(b.start_time))
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].end_time > sorted[i + 1].start_time) {
          return { ...ds, blocks: blocks.map(b => ({ ...b, error: b.error || 'Los bloques se superponen' })) }
        }
      }
      if (blocks.some(b => b.error)) valid = false
      return { ...ds, blocks }
    })
    setDayStates(next)
    return valid
  }

  // Copiar el horario de un día a otros (multi-día). Solo toca el estado local; se persiste
  // al "Guardar horarios", igual que el resto de la grilla.
  const [copyDay, setCopyDay] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set())
  function applyCopyDay() {
    if (copyDay === null || copyTargets.size === 0) { setCopyDay(null); return }
    const src = dayStates[copyDay].blocks
    setDayStates(prev => {
      const next = [...prev]
      for (const d of copyTargets) {
        next[d] = { enabled: true, blocks: src.map(b => ({ start_time: b.start_time, end_time: b.end_time, label: b.label, location_id: b.location_id })) }
      }
      return next
    })
    setCopyDay(null)
    toast.success('Horario copiado · acordate de guardar')
  }

  async function saveHours() {
    if (!validateBlocks()) { toast.error('Corregí los errores antes de guardar'); return }
    setSavingHours(true)
    // Delete all existing blocks for this business
    await supabase.from('time_blocks').delete().eq('business_id', business.id)
    // Collect blocks to insert
    const toInsert: { business_id: string; day_of_week: number; start_time: string; end_time: string; label: string | null; location_id: string | null }[] = []
    dayStates.forEach((ds, day) => {
      if (!ds.enabled) return
      ds.blocks.forEach(b => {
        toInsert.push({ business_id: business.id, day_of_week: day, start_time: b.start_time, end_time: b.end_time, label: b.label || null, location_id: b.location_id || null })
      })
    })
    if (toInsert.length > 0) {
      const { error } = await supabase.from('time_blocks').insert(toInsert)
      if (error) { toast.error('Error al guardar horarios'); setSavingHours(false); return }
    }
    // Save slot duration + buffer entre turnos
    await supabase.from('businesses').update({ default_slot_duration: slotDuration, buffer_minutes: bufferMinutes }).eq('id', business.id)
    setSavingHours(false)
    toast.success('Horarios guardados')
  }

  // ── Excepciones por fecha (capa 1) ──────────────────────────────────────────
  const [exceptions, setExceptions] = useState<ScheduleException[]>(initialExceptions)
  const [excMonth, setExcMonth] = useState(() => startOfMonth(new Date()))
  const thisMonthStart = startOfMonth(new Date())

  const excByDate = useMemo(() => {
    const m = new Map<string, ScheduleException>()
    for (const e of exceptions) m.set(e.date, e)
    return m
  }, [exceptions])
  const excCalendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(excMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(excMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [excMonth])

  async function clearException(date: string) {
    const { error } = await supabase.from('schedule_exceptions').delete().eq('business_id', business.id).eq('date', date)
    if (error) { toast.error('Error'); return }
    setExceptions(prev => prev.filter(e => e.date !== date))
    toast.success('Día normalizado')
  }

  // Selección de días. excSel = días elegidos; el panel lateral opera sobre ellos (1 o varios).
  const [excMulti, setExcMulti] = useState(false)
  const [excSel, setExcSel] = useState<Set<string>>(new Set())
  const [excBulk, setExcBulk] = useState({ start: '09:00', end: '18:00' })
  // Ancla para la selección por rango (Shift). Es el último día clickeado sin modificadores.
  const [excAnchor, setExcAnchor] = useState<string | null>(null)
  // Selección estilo Windows: click = un día · Shift = rango hacia el futuro · Ctrl/Cmd = sumar
  // individuales. En modo "Seleccionar varios" el click simple ya suma (para touch sin teclado).
  function handleDayClick(d: Date, ev: MouseEvent) {
    const ds = format(d, 'yyyy-MM-dd')
    if (ev.shiftKey && excAnchor && ds >= excAnchor) {
      const today = startOfDay(new Date())
      const range = eachDayOfInterval({ start: parseISO(excAnchor), end: parseISO(ds) })
        .filter(x => !isBefore(x, today))
        .map(x => format(x, 'yyyy-MM-dd'))
      setExcSel(new Set(range))
      return
    }
    if (ev.ctrlKey || ev.metaKey || excMulti) {
      setExcSel(s => { const n = new Set(s); if (n.has(ds)) n.delete(ds); else n.add(ds); return n })
    } else {
      setExcSel(new Set([ds]))
    }
    setExcAnchor(ds)
  }
  // Resumen de la selección para el panel (1 día = fecha completa; varios = conteo + rango).
  const selDates = [...excSel].sort()
  const selectionLabel = selDates.length === 1
    ? format(parseISO(selDates[0]), "EEEE d 'de' MMMM", { locale: es })
    : selDates.length > 1
      ? `${selDates.length} días · ${format(parseISO(selDates[0]), 'd MMM', { locale: es })} → ${format(parseISO(selDates[selDates.length - 1]), 'd MMM', { locale: es })}`
      : ''
  const selectionHasException = selDates.some(ds => excByDate.has(ds))
  async function bulkCloseDays(dates: string[]) {
    if (dates.length === 0) return
    const rows = dates.map(date => ({ business_id: business.id, date, closed: true, start_time: null, end_time: null }))
    const { data, error } = await supabase.from('schedule_exceptions').upsert(rows, { onConflict: 'business_id,date' }).select()
    if (error) { toast.error('Error al guardar'); return }
    setExceptions(prev => {
      const m = new Map(prev.map(e => [e.date, e]))
      for (const e of (data as ScheduleException[])) m.set(e.date, e)
      return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date))
    })
    setExcSel(new Set()); setExcMulti(false); setExcAnchor(null)
    toast.success(`${dates.length} día${dates.length > 1 ? 's' : ''} cerrado${dates.length > 1 ? 's' : ''}`)
  }
  async function bulkSpecialDays(dates: string[], start: string, end: string) {
    if (dates.length === 0) return
    if (end <= start) { toast.error('La hora fin debe ser mayor a la inicio'); return }
    const rows = dates.map(date => ({ business_id: business.id, date, closed: false, start_time: start, end_time: end }))
    const { data, error } = await supabase.from('schedule_exceptions').upsert(rows, { onConflict: 'business_id,date' }).select()
    if (error) { toast.error('Error al guardar'); return }
    setExceptions(prev => {
      const m = new Map(prev.map(e => [e.date, e]))
      for (const e of (data as ScheduleException[])) m.set(e.date, e)
      return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date))
    })
    setExcSel(new Set()); setExcMulti(false); setExcAnchor(null)
    toast.success(`Horario especial en ${dates.length} día${dates.length > 1 ? 's' : ''}`)
  }
  async function bulkClearDays(dates: string[]) {
    if (dates.length === 0) return
    const { error } = await supabase.from('schedule_exceptions').delete().eq('business_id', business.id).in('date', dates)
    if (error) { toast.error('Error'); return }
    setExceptions(prev => prev.filter(e => !dates.includes(e.date)))
    setExcSel(new Set()); setExcMulti(false); setExcAnchor(null)
    toast.success('Días normalizados')
  }

  // ── Vista semanal de turnos ─────────────────────────────────────────────────
  const todayWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const [weekStart, setWeekStart] = useState(todayWeekStart)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const openDays = useMemo(() => new Set(initialTimeBlocks.map(b => b.day_of_week)), [initialTimeBlocks])
  const apptsByDate = useMemo(() => {
    const m = new Map<string, AgendaAppt[]>()
    for (const a of initialAppointments) {
      const arr = m.get(a.date) || []
      arr.push(a)
      m.set(a.date, arr)
    }
    return m
  }, [initialAppointments])
  // Estado del día para el badge: cerrado / horario especial / abierto (según excepción o grilla).
  function dayStatus(d: Date): 'closed' | 'special' | 'open' {
    const ex = excByDate.get(format(d, 'yyyy-MM-dd'))
    if (ex?.closed) return 'closed'
    if (ex) return 'special'
    return openDays.has(d.getDay()) ? 'open' : 'closed'
  }
  // Próximos días especiales (de hoy en adelante) para listarlos bajo el calendario.
  const upcomingExc = useMemo(() => {
    const t = format(new Date(), 'yyyy-MM-dd')
    return exceptions.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date))
  }, [exceptions])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <PageEyebrow label="Agenda" />
          <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">Tus turnos de la semana, la grilla de atención y los días especiales.</p>
        </div>

        {/* Google Calendar — controles arriba a la derecha (solo si hay credenciales OAuth) */}
        {googleEnabled && (
          <div className="flex items-center gap-2 flex-shrink-0 sm:pt-1">
            {googleConnected ? (
              <>
                <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary" /> Google Calendar</span>
                <Button variant="outline" size="sm" onClick={syncGoogle} disabled={syncingGoogle}>
                  <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', syncingGoogle && 'animate-spin')} />{syncingGoogle ? 'Sincronizando...' : 'Sincronizar'}
                </Button>
                <Button variant="ghost" size="sm" onClick={disconnectGoogle} disabled={disconnectingGoogle}>
                  {disconnectingGoogle ? '...' : 'Desconectar'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { window.location.href = '/api/google/connect' }}>
                <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Conectar Google Calendar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Turnos de la semana */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Turnos de la semana</p>
            <p className="text-xs text-muted-foreground capitalize">{format(weekStart, "d 'de' MMM", { locale: es })} – {format(addDays(weekStart, 6), "d 'de' MMM", { locale: es })}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={!isBefore(todayWeekStart, weekStart)} onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {weekDays.map(d => {
            const ds = format(d, 'yyyy-MM-dd')
            const st = dayStatus(d)
            const dayAppts = apptsByDate.get(ds) || []
            const isToday = isSameDay(d, new Date())
            return (
              <div key={ds} className={cn('rounded-lg border p-2 min-h-[5rem] flex flex-col gap-1', isToday ? 'border-primary' : 'border-border', st === 'closed' && 'bg-secondary/30')}>
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs font-semibold capitalize', isToday && 'text-primary')}>{format(d, 'EEE d', { locale: es })}</span>
                  {st === 'closed' && <CalendarOff className="w-3 h-3 text-muted-foreground" />}
                  {st === 'special' && <CalendarClock className="w-3 h-3 text-primary" />}
                </div>
                {dayAppts.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">{st === 'closed' ? 'Cerrado' : 'Sin turnos'}</span>
                ) : dayAppts.map(a => (
                  <div key={a.id} className={cn('rounded px-1.5 py-1 text-[11px] leading-tight border break-words', statusChip(a.status))}>
                    <span className="font-semibold">{a.time.slice(0, 5)}</span> {a.client_name}
                    {a.services?.name && <span className="block text-[10px] opacity-80">{a.services.name}</span>}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Grilla semanal */}
      <Card className="p-6 space-y-5">
        {/* Slot duration */}
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <div className="space-y-1 flex-1">
            <Label>Duración del turno por defecto</Label>
            <p className="text-xs text-muted-foreground">Se usa para calcular los slots disponibles. Puede sobreescribirse por servicio.</p>
          </div>
          <Select value={String(slotDuration)} onValueChange={v => setSlotDuration(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLOT_DURATIONS.map(d => (
                <SelectItem key={d} value={String(d)}>{d} minutos</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buffer entre turnos */}
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <div className="space-y-1 flex-1">
            <Label>Descanso entre turnos</Label>
            <p className="text-xs text-muted-foreground">Tiempo libre que se deja entre un turno y el siguiente.</p>
          </div>
          <Select value={String(bufferMinutes)} onValueChange={v => setBufferMinutes(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue>{bufferMinutes === 0 ? 'Sin descanso' : `${bufferMinutes} minutos`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BUFFER_OPTIONS.map(d => (
                <SelectItem key={d} value={String(d)}>{d === 0 ? 'Sin descanso' : `${d} minutos`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Days */}
        <div className="space-y-4">
          {DAY_DISPLAY_ORDER.map(day => {
            const config = dayStates[day]
            return (
              <div key={day} className="space-y-2">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'w-28 text-xs font-semibold py-1.5 px-3 rounded transition-colors flex-shrink-0',
                      config.enabled ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {DAYS[day]}
                  </button>
                  {!config.enabled && <span className="text-sm text-muted-foreground">Cerrado</span>}
                </div>

                {config.enabled && (
                  <div className="pl-4 space-y-2">
                    {config.blocks.map((block, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            type="time"
                            value={block.start_time}
                            onChange={e => updateBlock(day, idx, 'start_time', e.target.value)}
                            className="w-28 text-sm"
                          />
                          <span className="text-muted-foreground text-sm">→</span>
                          <Input
                            type="time"
                            value={block.end_time}
                            onChange={e => updateBlock(day, idx, 'end_time', e.target.value)}
                            className="w-28 text-sm"
                          />
                          <Input
                            value={block.label}
                            onChange={e => updateBlock(day, idx, 'label', e.target.value)}
                            placeholder="Mañana, Tarde... (opcional)"
                            className="w-40 text-sm"
                          />
                          {activeLocations.length > 0 && (
                            <Select value={block.location_id || '__none__'} onValueChange={v => updateBlock(day, idx, 'location_id', v === '__none__' ? '' : (v ?? ''))}>
                              <SelectTrigger className="w-40 text-sm">
                                <SelectValue>{block.location_id ? (activeLocations.find(l => l.id === block.location_id)?.name ?? term.location) : `Sin ${locWord}`}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sin {locWord}</SelectItem>
                                {activeLocations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                          <button
                            onClick={() => removeBlock(day, idx)}
                            className="text-muted-foreground hover:text-red-400 transition-colors"
                            title="Eliminar bloque"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {block.error && (
                          <p className="text-xs text-red-400 pl-0.5">{block.error}</p>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-4 mt-1">
                      <button
                        onClick={() => addBlock(day)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" /> Agregar bloque
                      </button>
                      <button
                        onClick={() => { setCopyDay(day); setCopyTargets(new Set()) }}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar a otros días
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="pt-2 border-t border-border">
          <Button onClick={saveHours} disabled={savingHours}>
            {savingHours ? 'Guardando...' : 'Guardar horarios'}
          </Button>
        </div>
      </Card>

      {/* Excepciones por fecha — anular/cambiar un día puntual sobre la grilla semanal */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Días especiales</p>
            <p className="text-xs text-muted-foreground">{excMulti ? 'Tocá los días que quieras y elegí qué hacer en el panel.' : 'Tocá un día para anularlo o cambiarle el horario. Shift = rango · Ctrl = varios.'}</p>
          </div>
          <Button variant={excMulti ? 'default' : 'outline'} size="sm" className="flex-shrink-0" onClick={() => { setExcMulti(v => !v); setExcSel(new Set()); setExcAnchor(null) }}>
            {excMulti ? 'Listo' : 'Seleccionar varios'}
          </Button>
        </div>
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
          <div className="max-w-sm w-full">
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={() => setExcMonth(m => addMonths(m, -1))} disabled={isSameMonth(excMonth, thisMonthStart)} className="w-8 h-8 rounded-md flex items-center justify-center text-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none transition-colors" aria-label="Mes anterior">‹</button>
              <span className="text-sm font-semibold capitalize">{format(excMonth, 'MMMM yyyy', { locale: es })}</span>
              <button type="button" onClick={() => setExcMonth(m => addMonths(m, 1))} className="w-8 h-8 rounded-md flex items-center justify-center text-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label="Mes siguiente">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground font-semibold mb-1">
              {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {excCalendarDays.map(d => {
                const ds = format(d, 'yyyy-MM-dd')
                const inMonth = isSameMonth(d, excMonth)
                const isPast = isBefore(d, startOfDay(new Date()))
                const ex = excByDate.get(ds)
                const disabled = !inMonth || isPast
                return (
                  <button
                    key={ds}
                    type="button"
                    disabled={disabled}
                    onClick={e => handleDayClick(d, e)}
                    className={cn(
                      'aspect-square rounded-md text-xs font-medium flex items-center justify-center border transition-colors',
                      disabled ? 'border-transparent text-muted-foreground/30 cursor-default'
                        : ex?.closed ? 'border-destructive/40 bg-destructive/15 text-destructive'
                          : ex ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border bg-card hover:border-primary',
                      excSel.has(ds) && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    )}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-destructive/15 border border-destructive/40" /> Cerrado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/10 border border-primary/40" /> Horario especial</span>
            </div>
          </div>

          {/* Panel de acción a la derecha del calendario. Siempre visible; apagado sin selección. */}
          <div className={cn('rounded-md bg-secondary/50 p-4 space-y-3 lg:w-64 lg:flex-shrink-0 transition-opacity', excSel.size === 0 && 'opacity-50 pointer-events-none')}>
            <div>
              <p className={cn('text-sm font-medium', selDates.length === 1 && 'capitalize')}>{excSel.size === 0 ? 'Ningún día seleccionado' : selectionLabel}</p>
              {excSel.size === 0 && <p className="text-xs text-muted-foreground mt-0.5">Tocá un día del calendario.</p>}
            </div>
            <div className="space-y-2">
              <Button size="sm" variant="destructive" className="w-full" onClick={() => bulkCloseDays([...excSel])}>Marcar como cerrado</Button>
              {selectionHasException && (
                <Button size="sm" variant="outline" className="w-full" onClick={() => bulkClearDays([...excSel])}>Quitar excepción</Button>
              )}
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium">Horario especial</p>
              <div className="flex items-center gap-2">
                <Input type="time" value={excBulk.start} onChange={e => setExcBulk(s => ({ ...s, start: e.target.value }))} className="w-full text-sm h-8" />
                <span className="text-muted-foreground text-sm">→</span>
                <Input type="time" value={excBulk.end} onChange={e => setExcBulk(s => ({ ...s, end: e.target.value }))} className="w-full text-sm h-8" />
              </div>
              <Button size="sm" className="w-full" onClick={() => bulkSpecialDays([...excSel], excBulk.start, excBulk.end)}>Aplicar horario especial</Button>
            </div>
          </div>
        </div>
        {upcomingExc.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Próximos días especiales</p>
            {upcomingExc.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="capitalize w-32 flex-shrink-0">{format(parseISO(e.date), "EEE d 'de' MMM", { locale: es })}</span>
                <span className="text-xs text-muted-foreground flex-1">{e.closed ? 'Cerrado' : `Horario especial ${e.start_time?.slice(0, 5)}–${e.end_time?.slice(0, 5)}`}</span>
                <button onClick={() => clearException(e.date)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0" title="Quitar"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Copiar el horario de un día a otros (multi-día) */}
      <Dialog open={copyDay !== null} onOpenChange={open => { if (!open) setCopyDay(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Copiar horario {copyDay !== null ? `del ${DAYS[copyDay]}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Elegí a qué días copiar este horario. Reemplaza lo que tengan.</p>
            <div className="flex flex-wrap gap-2">
              {DAY_DISPLAY_ORDER.filter(d => d !== copyDay).map(d => {
                const on = copyTargets.has(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCopyTargets(s => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })}
                    className={cn(
                      'text-xs font-semibold py-1.5 px-3 rounded transition-colors',
                      on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {DAYS[d]}
                  </button>
                )
              })}
            </div>
            <Button size="sm" className="w-full" disabled={copyTargets.size === 0} onClick={applyCopyDay}>
              Copiar a {copyTargets.size} día{copyTargets.size === 1 ? '' : 's'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
