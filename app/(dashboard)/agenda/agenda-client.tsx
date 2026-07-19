'use client'

import { useState, useMemo, useEffect, useCallback, useSyncExternalStore, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, TimeBlock, Location, ScheduleException, Service, Professional, Client } from '@/lib/types'
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, addDays, isSameMonth, isSameDay, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Minus, X, Copy, ChevronLeft, ChevronRight, CalendarOff, CalendarClock, CalendarDays, Clock, Check, RefreshCw, Users, Phone, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveVertical } from '@/lib/verticals'
import { todayInAR } from '@/lib/booking-window'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { NuevoTurnoForm } from '@/components/dashboard/nuevo-turno-form'

// Turno para la vista semanal (subset con joins de nombre de servicio/profesional).
export type AgendaAppt = {
  id: string
  date: string
  time: string
  status: string
  client_name: string
  // Contacto para el roster del admin (D-04). Datos propios del negocio sobre sus clientes.
  client_phone?: string | null
  client_email?: string | null
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

// Etiqueta del estado para el roster (mismo semantismo de color que statusChip).
function statusLabel(status: string): string {
  if (status === 'confirmed') return 'Confirmado'
  if (status === 'pending_payment') return 'Seña pendiente'
  return status
}

// Estados que OCUPAN un lugar del cupo (mismo WHERE de los constraints 011/013).
const OCCUPYING_STATUSES = ['confirmed', 'pending_payment']

// Minutos desde 'HH:MM[:SS]' para resolver la ventana del time_block que cubre un slot.
function timeToMin(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m)
}

// Dialog (desktop ≥768px) / Drawer vaul (mobile) son portales con estado propio: el breakpoint
// se decide en JS, no con clases CSS. useSyncExternalStore se suscribe a matchMedia (store externo)
// sin setState-in-effect. SSR-safe: getServerSnapshot → false. Espeja NuevoTurnoForm (D-09/D-04).
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon → Sun
const SLOT_DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30]

// ── Time block state types ──────────────────────────────────────────────────
// `capacity` = lugares del bloque (CUPOS-01). 1 = bloque individual de siempre (cero cambio de
// comportamiento); > 1 = clase grupal con N cupos en el mismo slot.
type LocalBlock = { id?: string; start_time: string; end_time: string; label: string; location_id: string; capacity: number; error?: string }
type DayConfig = { enabled: boolean; blocks: LocalBlock[] }

function defaultBlock(day: number): LocalBlock {
  if (day >= 1 && day <= 5) return { start_time: '09:00', end_time: '18:00', label: '', location_id: '', capacity: 1 }
  if (day === 6) return { start_time: '09:00', end_time: '13:00', label: '', location_id: '', capacity: 1 }
  return { start_time: '09:00', end_time: '18:00', label: '', location_id: '', capacity: 1 }
}

interface Props {
  business: Business
  initialTimeBlocks: TimeBlock[]
  initialLocations: Location[]
  initialExceptions: ScheduleException[]
  initialAppointments: AgendaAppt[]
  services: Service[]
  professionals: Professional[]
  clients: Client[]
  googleEnabled: boolean
  googleConnected: boolean
}

export function AgendaClient({ business, initialTimeBlocks, initialLocations, initialExceptions, initialAppointments, services, professionals, clients, googleEnabled, googleConnected }: Props) {
  const supabase = createClient()
  const router = useRouter()

  // ── Alta manual de turno (D-08): botón "Nuevo turno" + click-en-día pre-llena la FECHA.
  // El form compartido corre el pipeline server-side completo vía el endpoint autenticado.
  const [nuevoTurnoOpen, setNuevoTurnoOpen] = useState(false)
  const [prefillDate, setPrefillDate] = useState('')
  function openNuevoTurno(date = '') {
    setPrefillDate(date)
    setNuevoTurnoOpen(true)
  }

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
  // Los consultorios se administran en Configuración; acá solo se asignan a los bloques.
  const activeLocations = initialLocations.filter(l => l.is_active !== false)

  // ── Grilla semanal (time_blocks) ────────────────────────────────────────────
  const [slotDuration, setSlotDuration] = useState(business.default_slot_duration ?? 60)
  const [bufferMinutes, setBufferMinutes] = useState(business.buffer_minutes ?? 0)
  // Consultorio activo en el editor de horarios. Con consultorios, arranca en el primero;
  // sin consultorios, '' = grilla única (sin concepto de "General").
  const [activeLoc, setActiveLoc] = useState(() => activeLocations[0]?.id ?? '')
  const selLoc = activeLocations.find(l => l.id === activeLoc) || null
  const selMeta = selLoc ? [selLoc.address, selLoc.phone].filter(Boolean).join(' · ') : ''
  const [dayStates, setDayStates] = useState<DayConfig[]>(() =>
    Array.from({ length: 7 }, (_, day) => {
      const blocks = initialTimeBlocks.filter(b => b.day_of_week === day)
      return {
        enabled: blocks.length > 0,
        blocks: blocks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, label: b.label || '', location_id: b.location_id || '', capacity: b.capacity ?? 1 })),
      }
    })
  )
  const [savingHours, setSavingHours] = useState(false)

  // Abrir/cerrar un día PARA EL CONSULTORIO ACTIVO: cerrar = quitar sus bloques de ese día;
  // abrir = agregar un bloque por defecto de ese consultorio. Los bloques de otros consultorios
  // del mismo día no se tocan. enabled = hay algún bloque (de cualquier consultorio) ese día.
  function toggleDay(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const dayBlocks = next[day].blocks
      const hasLoc = dayBlocks.some(b => (b.location_id || '') === activeLoc)
      const blocks = hasLoc
        ? dayBlocks.filter(b => (b.location_id || '') !== activeLoc)
        : [...dayBlocks, { ...defaultBlock(day), location_id: activeLoc }]
      next[day] = { enabled: blocks.length > 0, blocks }
      return next
    })
  }

  function addBlock(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const locBlocks = next[day].blocks.filter(b => (b.location_id || '') === activeLoc)
      const lastBlock = locBlocks[locBlocks.length - 1]
      const newStart = lastBlock?.end_time || '09:00'
      const [h, m] = newStart.split(':').map(Number)
      const newEnd = `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      next[day] = { ...next[day], enabled: true, blocks: [...next[day].blocks, { start_time: newStart, end_time: newEnd, label: '', location_id: activeLoc, capacity: 1 }] }
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

  // value: string para los Inputs de texto/hora/label; number para `capacity` (cupo).
  function updateBlock(day: number, idx: number, field: keyof LocalBlock, value: string | number) {
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
      // Solapamiento POR consultorio: dos consultorios distintos pueden coincidir en horario;
      // solo es error si se pisan bloques del MISMO consultorio.
      const byLoc = new Map<string, typeof blocks>()
      for (const b of blocks) { const k = b.location_id || ''; const arr = byLoc.get(k) || []; arr.push(b); byLoc.set(k, arr) }
      const overlapLocs = new Set<string>()
      for (const [k, arr] of byLoc) {
        const sorted = [...arr].sort((a, b) => a.start_time.localeCompare(b.start_time))
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i].end_time > sorted[i + 1].start_time) { overlapLocs.add(k); break }
        }
      }
      const marked = overlapLocs.size > 0
        ? blocks.map(b => overlapLocs.has(b.location_id || '') ? { ...b, error: b.error || 'Los bloques se superponen' } : b)
        : blocks
      if (marked.some(b => b.error)) valid = false
      return { ...ds, blocks: marked }
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
    // Copia SOLO los bloques del consultorio activo del día origen; en los destinos reemplaza
    // los de ese consultorio y conserva los de los demás.
    const src = dayStates[copyDay].blocks.filter(b => (b.location_id || '') === activeLoc)
    setDayStates(prev => {
      const next = [...prev]
      for (const d of copyTargets) {
        const others = next[d].blocks.filter(b => (b.location_id || '') !== activeLoc)
        const copied = src.map(b => ({ start_time: b.start_time, end_time: b.end_time, label: b.label, location_id: activeLoc, capacity: b.capacity }))
        const blocks = [...others, ...copied]
        next[d] = { enabled: blocks.length > 0, blocks }
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
    const toInsert: { business_id: string; day_of_week: number; start_time: string; end_time: string; label: string | null; location_id: string | null; capacity: number }[] = []
    dayStates.forEach((ds, day) => {
      if (!ds.enabled) return
      ds.blocks.forEach(b => {
        // Con consultorios cargados no existe "General": se descartan los bloques sin consultorio.
        if (activeLocations.length > 0 && !b.location_id) return
        // capacity viaja en el insert (delete-all + insert ya reinserta todos los bloques). Default 1 = individual.
        toInsert.push({ business_id: business.id, day_of_week: day, start_time: b.start_time, end_time: b.end_time, label: b.label || null, location_id: b.location_id || null, capacity: b.capacity || 1 })
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

  // Ventana de reserva pública (BOOK-WINDOW-01): con cuánta anticipación puede reservar un cliente
  // desde la página pública. Vive acá (junto a horarios y días especiales) porque es config de AGENDA,
  // no de cobros. 3 modos mutuamente excluyentes (D-01): días rolling / sin límite / fecha exacta; el
  // modo inicial se deriva de las columnas (fecha tiene precedencia, espeja effectiveBookingCutoff).
  const [windowForm, setWindowForm] = useState<{ mode: 'dias' | 'sin_limite' | 'fecha'; days: number; date: string }>({
    mode: business.max_advance_date ? 'fecha' : (business.max_advance_days && business.max_advance_days > 0 ? 'dias' : 'sin_limite'),
    days: business.max_advance_days ?? 30,
    date: business.max_advance_date ?? '',
  })
  const [savingWindow, setSavingWindow] = useState(false)
  async function saveWindow() {
    // Pitfall 4: los 3 modos son mutuamente excluyentes en la DB — se escribe la columna del modo
    // activo y se nulea SIEMPRE la otra. Nunca dejar max_advance_days y max_advance_date a la vez.
    let payload: { max_advance_days: number | null; max_advance_date: string | null }
    if (windowForm.mode === 'dias') {
      const days = Math.floor(windowForm.days)
      if (!Number.isFinite(days) || days < 1) { toast.error('Ingresá un número de días mayor o igual a 1'); return }
      payload = { max_advance_days: days, max_advance_date: null }
    } else if (windowForm.mode === 'fecha') {
      if (!windowForm.date) { toast.error('Elegí una fecha de corte'); return }
      payload = { max_advance_days: null, max_advance_date: windowForm.date }
    } else {
      payload = { max_advance_days: null, max_advance_date: null }
    }
    setSavingWindow(true)
    const { error } = await supabase.from('businesses').update(payload).eq('id', business.id)
    setSavingWindow(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Ventana de reserva guardada')
  }

  // ── Excepciones por fecha (capa 1) ──────────────────────────────────────────
  const [exceptions, setExceptions] = useState<ScheduleException[]>(initialExceptions)
  const [excMonth, setExcMonth] = useState(() => startOfMonth(new Date()))
  const thisMonthStart = startOfMonth(new Date())

  // Excepciones agrupadas por fecha (puede haber varias por día: global + por consultorio).
  const excByDate = useMemo(() => {
    const m = new Map<string, ScheduleException[]>()
    for (const e of exceptions) { const arr = m.get(e.date) || []; arr.push(e); m.set(e.date, arr) }
    return m
  }, [exceptions])
  const excCalendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(excMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(excMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [excMonth])

  // Borrar una excepción puntual (de la lista de próximos), por id.
  async function clearExceptionRow(ex: ScheduleException) {
    const { error } = await supabase.from('schedule_exceptions').delete().eq('id', ex.id)
    if (error) { toast.error('Error'); return }
    setExceptions(prev => prev.filter(e => e.id !== ex.id))
    toast.success('Excepción quitada')
  }

  // Selección de días. excSel = días elegidos; el panel lateral opera sobre ellos (1 o varios).
  const [excMulti, setExcMulti] = useState(false)
  const [excSel, setExcSel] = useState<Set<string>>(new Set())
  const [excBulk, setExcBulk] = useState({ start: '09:00', end: '18:00' })
  // "Aplicar a:" — a qué consultorios aplica la excepción. '__all__' = global (todo el negocio).
  const [excTargets, setExcTargets] = useState<Set<string>>(new Set(['__all__']))
  const excIsGlobal = excTargets.has('__all__') || activeLocations.length === 0
  const excLocs: (string | null)[] = excIsGlobal ? [null] : [...excTargets]
  const excMatchesTarget = (e: ScheduleException) => excIsGlobal ? !e.location_id : (!!e.location_id && excTargets.has(e.location_id))
  // Merge de filas tras un upsert, deduplicando por (fecha|consultorio).
  function mergeExceptions(prev: ScheduleException[], rows: ScheduleException[]) {
    const key = (e: ScheduleException) => `${e.date}|${e.location_id ?? ''}`
    const m = new Map(prev.map(e => [key(e), e]))
    for (const e of rows) m.set(key(e), e)
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date))
  }
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
  const selectionHasException = selDates.some(ds => (excByDate.get(ds)?.length ?? 0) > 0)
  async function bulkCloseDays(dates: string[]) {
    if (dates.length === 0) return
    const rows = dates.flatMap(date => excLocs.map(loc => ({ business_id: business.id, date, location_id: loc, closed: true, start_time: null, end_time: null })))
    const { data, error } = await supabase.from('schedule_exceptions').upsert(rows, { onConflict: 'business_id,date,location_id' }).select()
    if (error) { toast.error('Error al guardar'); return }
    setExceptions(prev => mergeExceptions(prev, data as ScheduleException[]))
    setExcSel(new Set()); setExcMulti(false); setExcAnchor(null)
    toast.success(`${dates.length} día${dates.length > 1 ? 's' : ''} cerrado${dates.length > 1 ? 's' : ''}`)
  }
  async function bulkSpecialDays(dates: string[], start: string, end: string) {
    if (dates.length === 0) return
    if (end <= start) { toast.error('La hora fin debe ser mayor a la inicio'); return }
    const rows = dates.flatMap(date => excLocs.map(loc => ({ business_id: business.id, date, location_id: loc, closed: false, start_time: start, end_time: end })))
    const { data, error } = await supabase.from('schedule_exceptions').upsert(rows, { onConflict: 'business_id,date,location_id' }).select()
    if (error) { toast.error('Error al guardar'); return }
    setExceptions(prev => mergeExceptions(prev, data as ScheduleException[]))
    setExcSel(new Set()); setExcMulti(false); setExcAnchor(null)
    toast.success(`Horario especial en ${dates.length} día${dates.length > 1 ? 's' : ''}`)
  }
  async function bulkClearDays(dates: string[]) {
    if (dates.length === 0) return
    let q = supabase.from('schedule_exceptions').delete().eq('business_id', business.id).in('date', dates)
    q = excIsGlobal ? q.is('location_id', null) : q.in('location_id', [...excTargets])
    const { error } = await q
    if (error) { toast.error('Error'); return }
    setExceptions(prev => prev.filter(e => !(dates.includes(e.date) && excMatchesTarget(e))))
    setExcSel(new Set()); setExcMulti(false); setExcAnchor(null)
    toast.success('Excepciones quitadas')
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

  // ── Roster del admin (CUPOS-04, D-04) ────────────────────────────────────────
  // Click en un slot grupal → overlay con contador "ocupados/cupo" + lista (nombre, contacto, estado).
  // Solo se computa en memoria sobre initialAppointments (ya filtrados por business_id en el server,
  // T-02-13): NUNCA toca datos de otro tenant.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [rosterSlot, setRosterSlot] = useState<{ date: string; time: string } | null>(null)

  // capacityFor(date, time): MAX capacity de los time_blocks cuyo día (getUTCDay, igual que la DB y
  // availability) + ventana [start,end) cubren el slot. Sin bloque que lo cubra → 1 (individual).
  const capacityFor = useCallback((date: string, time: string): number => {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    const tMin = timeToMin(time)
    let cap = 0
    for (const b of initialTimeBlocks) {
      if (b.day_of_week !== dow) continue
      if (timeToMin(b.start_time) <= tMin && tMin < timeToMin(b.end_time)) {
        cap = Math.max(cap, Number(b.capacity) || 1)
      }
    }
    return cap || 1
  }, [initialTimeBlocks])

  // Roster del slot seleccionado: turnos del MISMO (date, time) que ocupan lugar (confirmed/pending),
  // + el cupo del bloque que cubre el slot. Contador "N/capacity".
  const roster = useMemo(() => {
    if (!rosterSlot) return null
    const { date, time } = rosterSlot
    const slotKey = time.slice(0, 5)
    const enrollees = initialAppointments
      .filter(a => a.date === date && a.time.slice(0, 5) === slotKey && OCCUPYING_STATUSES.includes(a.status))
      .sort((a, b) => a.client_name.localeCompare(b.client_name))
    return { date, time: slotKey, enrollees, capacity: capacityFor(date, time) }
  }, [rosterSlot, initialAppointments, capacityFor])
  // Estado del día para el badge: cerrado / horario especial / abierto (según excepción o grilla).
  function dayStatus(d: Date): 'closed' | 'special' | 'open' {
    const list = excByDate.get(format(d, 'yyyy-MM-dd')) || []
    if (list.some(e => e.closed && !e.location_id)) return 'closed' // cierre global
    if (list.length > 0) return 'special' // excepciones parciales/especiales
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

        {/* Acciones de la página: alta de turno + controles de Google Calendar */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0 sm:pt-1">
          <Button onClick={() => openNuevoTurno()} className="gap-2">
            <Plus className="w-4 h-4" /> Nuevo turno
          </Button>
          {googleEnabled && (
            googleConnected ? (
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
            )
          )}
        </div>
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
            // D-08 acotado: el header de la celda pre-llena la FECHA del form (no la hora).
            // Los chips de un slot GRUPAL (capacity > 1) abren el roster (D-04); los individuales
            // se muestran como hoy (no interactivos). La celda es un <div> para que los chips-botón
            // del roster no queden anidados en un <button> (HTML inválido / a11y rota).
            return (
              <div
                key={ds}
                className={cn(
                  // Hover sutil de la celda (mismo token que el header-boton y los chips): la celda
                  // dejo de ser <button> (a11y de los chips-boton del roster) y recupera el feedback
                  // de hover aca. transition-colors (≤300ms, solo color) · los hijos (header-boton,
                  // chips) mantienen su propio hover/focus encima.
                  'rounded-lg border p-2 min-h-[5rem] flex flex-col gap-1 transition-colors hover:border-primary/60',
                  st === 'closed' ? 'bg-secondary/30 hover:bg-secondary/95' : 'hover:bg-secondary/85',
                  isToday ? 'border-primary' : 'border-border',
                )}
              >
                <button
                  type="button"
                  onClick={() => openNuevoTurno(ds)}
                  aria-label={`Agregar turno el ${format(d, "EEEE d 'de' MMMM", { locale: es })}`}
                  className="text-left flex items-center justify-between rounded -m-1 p-1 transition-[background-color,filter] hover:bg-secondary hover:brightness-[0.85] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <span className={cn('text-xs font-semibold capitalize', isToday && 'text-primary')}>{format(d, 'EEE d', { locale: es })}</span>
                  {st === 'closed' && <CalendarOff className="w-3 h-3 text-muted-foreground" />}
                  {st === 'special' && <CalendarClock className="w-3 h-3 text-primary" />}
                </button>
                {dayAppts.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">{st === 'closed' ? 'Cerrado' : 'Sin turnos'}</span>
                ) : dayAppts.map(a => {
                  const isGroup = capacityFor(ds, a.time) > 1
                  const chipClass = cn('rounded px-1.5 py-1 text-[11px] leading-tight border break-words', statusChip(a.status))
                  const chipBody = (
                    <>
                      <span className="font-semibold">{a.time.slice(0, 5)}</span> {a.client_name}
                      {a.services?.name && <span className="block text-[10px] opacity-80">{a.services.name}</span>}
                    </>
                  )
                  // Slot grupal → chip clickeable que abre el roster del slot (mismo date/time).
                  return isGroup ? (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setRosterSlot({ date: ds, time: a.time })}
                      aria-label={`Ver inscriptos de las ${a.time.slice(0, 5)} del ${format(d, "EEEE d 'de' MMMM", { locale: es })}`}
                      className={cn(chipClass, 'text-left w-full cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background')}
                    >
                      {chipBody}
                    </button>
                  ) : (
                    <div key={a.id} className={chipClass}>{chipBody}</div>
                  )
                })}
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

        {/* Selector de consultorio (tabs estilo Configuración) + ficha — solo si hay consultorios */}
        {activeLocations.length > 0 && (
          <div className="space-y-3">
            <Tabs value={activeLoc} onValueChange={setActiveLoc}>
              <TabsList className="flex flex-wrap w-full sm:w-fit h-auto">
                {activeLocations.map(l => <TabsTrigger key={l.id} value={l.id}>{l.name}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            {selLoc && (
              <div className="rounded-md bg-secondary/50 p-3">
                <p className="text-sm font-medium">{selLoc.name}</p>
                {selMeta && <p className="text-xs text-muted-foreground mt-0.5">{selMeta}</p>}
              </div>
            )}
          </div>
        )}

        {/* Days — del consultorio activo */}
        <div className="space-y-4">
          {DAY_DISPLAY_ORDER.map(day => {
            const dayBlocks = dayStates[day].blocks.map((block, idx) => ({ block, idx })).filter(({ block }) => (block.location_id || '') === activeLoc)
            const dayOpen = dayBlocks.length > 0
            return (
              <div key={day} className="space-y-2 sm:max-w-md">
                {/* Día: chip full-width y centrado (parecido al onboarding, mejor en mobile). */}
                <button
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'w-full text-center text-sm font-semibold py-2 px-3 rounded transition-colors',
                    dayOpen ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {DAYS[day]}
                </button>
                {!dayOpen && <p className="text-center text-xs text-muted-foreground">Cerrado — tocá el día para abrirlo</p>}

                {dayOpen && (
                  <div className="space-y-2">
                    {dayBlocks.map(({ block, idx }) => (
                      <div key={idx} className="space-y-1">
                        {/* Hora + cupo en UNA sola línea: los inputs de hora (flex-1) se achican, el cupo
                            y la × van fijos. La leyenda "Cupo" se omite en la línea por espacio (title/aria). */}
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="time"
                            value={block.start_time}
                            onChange={e => updateBlock(day, idx, 'start_time', e.target.value)}
                            className="min-w-0 flex-1 px-2 text-sm"
                          />
                          <span className="shrink-0 text-xs text-muted-foreground">→</span>
                          <Input
                            type="time"
                            value={block.end_time}
                            onChange={e => updateBlock(day, idx, 'end_time', e.target.value)}
                            className="min-w-0 flex-1 px-2 text-sm"
                          />
                          {/* Cupo (CUPOS-01): stepper −/+ con el número EDITABLE a mano. min 1 = individual. */}
                          <div className="flex shrink-0 items-center overflow-hidden rounded-md border border-border" title="Cupo (lugares por bloque)">
                            <button
                              type="button"
                              aria-label="Menos cupo"
                              disabled={block.capacity <= 1}
                              onClick={() => updateBlock(day, idx, 'capacity', Math.max(1, block.capacity - 1))}
                              className="flex h-8 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={block.capacity}
                              onFocus={e => e.target.select()}
                              onChange={e => updateBlock(day, idx, 'capacity', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                              className="h-8 w-9 border-x border-border bg-transparent text-center text-sm tabular-nums outline-none focus:bg-secondary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              aria-label="Cupo (lugares por bloque)"
                            />
                            <button
                              type="button"
                              aria-label="Más cupo"
                              onClick={() => updateBlock(day, idx, 'capacity', block.capacity + 1)}
                              className="flex h-8 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => removeBlock(day, idx)}
                            className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
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

      {/* Ventana de reserva pública (BOOK-WINDOW-01) — 3 modos mutuamente excluyentes (D-01). Va acá,
          junto a horarios y días especiales, por ser config de agenda (no de cobros). */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold text-sm flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Ventana de reserva</p>
          <p className="text-xs text-muted-foreground mt-0.5">Limita con cuánta anticipación un cliente puede reservar desde tu página pública. No afecta los turnos que cargás manualmente.</p>
        </div>

        <fieldset className="space-y-3">
          {/* Modo: días de anticipación */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input type="radio" id="window_mode_dias" name="window_mode" className="w-4 h-4 accent-primary cursor-pointer"
                checked={windowForm.mode === 'dias'} onChange={() => setWindowForm(f => ({ ...f, mode: 'dias' }))} />
              <Label htmlFor="window_mode_dias" className="cursor-pointer">Hasta cierta cantidad de días de anticipación</Label>
            </div>
            {windowForm.mode === 'dias' && (
              <div className="pl-7 space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Días de anticipación</Label>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <div className="flex items-center overflow-hidden rounded-md border border-border">
                    <button
                      type="button"
                      aria-label="Menos días"
                      disabled={windowForm.days <= 1}
                      onClick={() => setWindowForm(f => ({ ...f, days: Math.max(1, f.days - 1) }))}
                      className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={windowForm.days}
                      onFocus={e => e.target.select()}
                      onChange={e => setWindowForm(f => ({ ...f, days: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))}
                      className="h-8 w-12 border-x border-border bg-transparent text-center text-sm tabular-nums outline-none focus:bg-secondary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Días de anticipación"
                    />
                    <button
                      type="button"
                      aria-label="Más días"
                      onClick={() => setWindowForm(f => ({ ...f, days: f.days + 1 }))}
                      className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {windowForm.days >= 1 && (() => {
                    const d = addDays(todayInAR(), windowForm.days)
                    return (
                      <span className="text-sm font-medium text-primary">
                        Hasta el <span className="capitalize">{format(d, 'EEE', { locale: es }).replace('.', '')}</span> {format(d, 'dd/MM')}
                      </span>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Modo: sin límite */}
          <div className="flex items-center gap-3">
            <input type="radio" id="window_mode_sin_limite" name="window_mode" className="w-4 h-4 accent-primary cursor-pointer"
              checked={windowForm.mode === 'sin_limite'} onChange={() => setWindowForm(f => ({ ...f, mode: 'sin_limite' }))} />
            <Label htmlFor="window_mode_sin_limite" className="cursor-pointer">Sin límite</Label>
          </div>

          {/* Modo: fecha exacta */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input type="radio" id="window_mode_fecha" name="window_mode" className="w-4 h-4 accent-primary cursor-pointer"
                checked={windowForm.mode === 'fecha'} onChange={() => setWindowForm(f => ({ ...f, mode: 'fecha' }))} />
              <Label htmlFor="window_mode_fecha" className="cursor-pointer">Hasta una fecha exacta</Label>
            </div>
            {windowForm.mode === 'fecha' && (
              <div className="pl-7 space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Fecha de corte (inclusive)</Label>
                <div className="inline-block rounded-lg border border-border bg-card">
                  <Calendar
                    mode="single"
                    selected={windowForm.date ? parseISO(windowForm.date) : undefined}
                    onSelect={d => setWindowForm(f => ({ ...f, date: d ? format(d, 'yyyy-MM-dd') : '' }))}
                    disabled={d => d < startOfDay(new Date())}
                  />
                </div>
                {windowForm.date && (
                  <p className="text-sm font-medium text-primary">
                    Hasta el <span className="capitalize">{format(parseISO(windowForm.date), 'EEE', { locale: es }).replace('.', '')}</span> {format(parseISO(windowForm.date), 'dd/MM')}
                  </p>
                )}
              </div>
            )}
          </div>
        </fieldset>

        <Button onClick={saveWindow} disabled={savingWindow}>{savingWindow ? 'Guardando...' : 'Guardar'}</Button>
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
                const exList = excByDate.get(ds) || []
                const exClosed = exList.some(e => e.closed)
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
                        : exClosed ? 'border-destructive/40 bg-destructive/15 text-destructive'
                          : exList.length > 0 ? 'border-primary/40 bg-primary/10 text-primary'
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
            {activeLocations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Aplicar a</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setExcTargets(new Set(['__all__']))} className={cn('text-[11px] font-semibold py-1 px-2.5 rounded transition-colors', excIsGlobal ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>Todos</button>
                  {activeLocations.map(l => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setExcTargets(prev => {
                        const n = new Set(prev)
                        n.delete('__all__')
                        if (n.has(l.id)) n.delete(l.id); else n.add(l.id)
                        if (n.size === 0) n.add('__all__')
                        return n
                      })}
                      className={cn('text-[11px] font-semibold py-1 px-2.5 rounded transition-colors', !excIsGlobal && excTargets.has(l.id) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
                    >{l.name}</button>
                  ))}
                </div>
              </div>
            )}
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
                <span className="capitalize w-28 flex-shrink-0">{format(parseISO(e.date), "EEE d 'de' MMM", { locale: es })}</span>
                <span className="text-xs text-muted-foreground flex-1">
                  {e.closed ? 'Cerrado' : `Horario especial ${e.start_time?.slice(0, 5)}–${e.end_time?.slice(0, 5)}`}
                  {' · '}<span className="text-foreground/70">{e.location_id ? (activeLocations.find(l => l.id === e.location_id)?.name ?? term.location) : 'Todos'}</span>
                </span>
                <button onClick={() => clearExceptionRow(e)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0" title="Quitar"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Roster del slot grupal (CUPOS-04, D-04): contador "ocupados/cupo" + inscriptos.
          Dialog en desktop / Drawer vaul en mobile (mismo shell responsive que NuevoTurnoForm). */}
      {roster && (() => {
        const title = `${format(parseISO(roster.date), "EEE d 'de' MMM", { locale: es })} · ${roster.time}`
        const counter = `${roster.enrollees.length}/${roster.capacity}`
        const body = (
          <div className="space-y-3">
            {/* Contador de ocupación — dato exclusivo del admin (el público nunca lo ve, D-06). */}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold tabular-nums">{counter}</span>
              <span className="text-xs text-muted-foreground">{roster.enrollees.length === 1 ? 'inscripto' : 'inscriptos'}</span>
            </div>
            {roster.enrollees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin inscriptos aún.</p>
            ) : (
              <ul className="space-y-2">
                {roster.enrollees.map(a => (
                  <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium truncate">{a.client_name}</p>
                      {a.client_phone && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3 flex-shrink-0" /><span className="truncate">{a.client_phone}</span></p>
                      )}
                      {a.client_email && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{a.client_email}</span></p>
                      )}
                      {!a.client_phone && !a.client_email && (
                        <p className="text-xs text-muted-foreground">Sin contacto</p>
                      )}
                    </div>
                    <span className={cn('flex-shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium', statusChip(a.status))}>
                      {statusLabel(a.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
        const close = () => setRosterSlot(null)
        return isDesktop ? (
          <Dialog open onOpenChange={open => { if (!open) close() }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 capitalize">{title}</DialogTitle>
              </DialogHeader>
              {body}
            </DialogContent>
          </Dialog>
        ) : (
          <Drawer open onOpenChange={open => { if (!open) close() }}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle className="capitalize">{title}</DrawerTitle>
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-6">{body}</div>
            </DrawerContent>
          </Drawer>
        )
      })()}

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

      {/* Nuevo turno — form compartido (modal desktop / drawer mobile), alta vía el endpoint autenticado.
          prefill.date = día clickeado en el resumen semanal (D-08 acotado: solo la fecha, no la hora). */}
      <NuevoTurnoForm
        open={nuevoTurnoOpen}
        onOpenChange={setNuevoTurnoOpen}
        prefill={{ date: prefillDate }}
        clients={clients}
        services={services}
        professionals={professionals}
        locations={initialLocations}
      />
    </div>
  )
}
