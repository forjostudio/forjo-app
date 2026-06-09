'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { format, parseISO, differenceInDays, differenceInMonths, isSameMonth, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Client, Appointment } from '@/lib/types'
import { useVertical } from '@/lib/use-terminology'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  Search, Phone, Mail, Trash2, GitMerge, MessageCircle,
  Edit2, X, ChevronLeft, ChevronDown, Lightbulb, TrendingUp, FileText,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { ClinicalHistoryPanel } from '@/components/dashboard/clinical-history-panel'

// ── Constants ─────────────────────────────────────────────────────────────────
type StatusKey = 'new' | 'active' | 'frequent' | 'paused'
type FilterKey = 'all' | StatusKey

const STATUS_DOT: Record<StatusKey, string> = {
  new: 'bg-red-400',
  active: 'bg-green-400',
  frequent: 'bg-yellow-400',
  paused: 'bg-gray-400',
}
const STATUS_LABEL: Record<StatusKey, string> = {
  new: 'NUEVA',
  active: 'ACTIVA',
  frequent: 'FRECUENTE',
  paused: 'PAUSA',
}
const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'frequent', label: 'Frecuentes' },
  { key: 'active', label: 'Activas' },
  { key: 'new', label: 'Nuevas' },
  { key: 'paused', label: 'Pausa' },
]
const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('')

// ── Helpers ───────────────────────────────────────────────────────────────────
function fichaNum(n: number) { return `#${String(n).padStart(3, '0')}` }

function fmtSince(dateStr: string): string {
  const m = differenceInMonths(new Date(), parseISO(dateStr))
  if (m === 0) return 'este mes'
  if (m === 1) return '1 mes'
  return `${m} meses`
}

function fmtLastVisit(dateStr: string): string {
  const m = differenceInMonths(new Date(), parseISO(dateStr))
  const d = format(parseISO(dateStr), "d 'de' MMMM", { locale: es })
  if (m === 0) return `este mes · ${d}`
  return `${m} ${m === 1 ? 'MES' : 'MESES'} · ${d}`
}

function getApptPrice(a: Appointment): number {
  return (a.services as { price?: number } | null)?.price || 0
}
function getApptService(a: Appointment): string {
  return (a.services as { name?: string } | null)?.name || '—'
}

function getSuggestion(visits: number, daysSinceLast: number) {
  if (daysSinceLast > 60) return {
    label: 'CLIENTE PAUSADO',
    text: 'Hace más de 2 meses que no viene, ideal para recontactar',
    status: 'paused' as StatusKey,
    color: 'text-foreground',
    border: 'border-border',
    bg: 'bg-secondary',
  }
  if (visits <= 1) return {
    label: 'CLIENTE RECIENTE',
    text: 'Pocas visitas, pedile feedback y ofrecele su segundo servicio con descuento',
    status: 'new' as StatusKey,
    color: 'text-red-400',
    border: 'border-red-500/30',
    bg: 'bg-red-500/10',
  }
  if (visits <= 4) return {
    label: 'CLIENTE EN DESARROLLO',
    text: 'Va tomando ritmo, ideal para sugerirle servicios complementarios',
    status: 'active' as StatusKey,
    color: 'text-green-400',
    border: 'border-green-500/30',
    bg: 'bg-green-500/10',
  }
  return {
    label: 'CLIENTE FRECUENTE',
    text: 'Alta fidelidad, considerá un beneficio de cliente VIP',
    status: 'frequent' as StatusKey,
    color: 'text-yellow-400',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/10',
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  initialClients: Client[]
  appointments: Appointment[]
  businessId: string
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ClientsClient({ initialClients, appointments: initialAppts, businessId }: Props) {
  const supabase = createClient()
  const vertical = useVertical()
  const term = vertical.terminology
  const isSalud = vertical.key === 'salud'
  const isBelleza = vertical.key === 'belleza'

  // State
  const [clients, setClients] = useState(initialClients)
  const [appts, setAppts] = useState(initialAppts)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', insurance_name: '', insurance_number: '', preferences: '' })
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [mergeModal, setMergeModal] = useState(false)
  // Historia Clínica colapsable (solo salud): arranca colapsada y se cierra al cambiar de paciente.
  const [historyExpanded, setHistoryExpanded] = useState(false)

  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const listRef = useRef<HTMLDivElement>(null)

  // ── Computed stats per client ─────────────────────────────────────────────
  const clientStats = useMemo(() => {
    const now = new Date()
    return Object.fromEntries(clients.map(c => {
      const all = appts.filter(a => a.client_id === c.id)
      const confirmed = all.filter(a => ['confirmed', 'completed'].includes(a.status))
      const visits = confirmed.length
      const sorted = [...confirmed].sort((a, b) => b.date < a.date ? -1 : 1)
      const lastDate = sorted[0]?.date ?? null
      const daysSinceLast = lastDate ? differenceInDays(now, parseISO(lastDate)) : 999
      const totalSpend = confirmed.reduce((s, a) => s + getApptPrice(a), 0)

      let status: StatusKey
      if (daysSinceLast > 45) status = 'paused'
      else if (visits >= 5) status = 'frequent'
      else if (visits >= 2) status = 'active'
      else status = 'new'

      return [c.id, { status, visits, lastDate, daysSinceLast, totalSpend }]
    }))
  }, [clients, appts])

  // ── Client number map (sequential by created_at) ─────────────────────────
  const clientNumberMap = useMemo(() => {
    return Object.fromEntries(
      clients.map((c, i) => [c.id, c.client_number ?? (i + 1)])
    )
  }, [clients])

  // ── Duplicates ───────────────────────────────────────────────────────────
  const duplicates = useMemo(() => {
    const byEmail: Record<string, Client[]> = {}
    const byPhone: Record<string, Client[]> = {}
    clients.forEach(c => {
      if (c.email) { const k = c.email.toLowerCase(); (byEmail[k] = byEmail[k] || []).push(c) }
      if (c.phone) { const k = c.phone.replace(/\D/g, ''); if (k) (byPhone[k] = byPhone[k] || []).push(c) }
    })
    const groups: Client[][] = []
    const seen = new Set<string>()
    ;[...Object.values(byEmail), ...Object.values(byPhone)].forEach(grp => {
      if (grp.length < 2) return
      const key = grp.map(c => c.id).sort().join(',')
      if (!seen.has(key)) { seen.add(key); groups.push(grp) }
    })
    return groups
  }, [clients])

  // ── Filtered + grouped by letter ─────────────────────────────────────────
  const filteredClients = useMemo(() => {
    const q = search.toLowerCase()
    return clients
      .filter(c => {
        const m = !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)
        const f = filter === 'all' || clientStats[c.id]?.status === filter
        return m && f
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [clients, search, filter, clientStats])

  const groupedByLetter = useMemo(() => {
    const groups: Record<string, Client[]> = {}
    filteredClients.forEach(c => {
      const letter = /^[A-Z]/.test(c.name[0].toUpperCase()) ? c.name[0].toUpperCase() : '#'
      ;(groups[letter] = groups[letter] || []).push(c)
    })
    return groups
  }, [filteredClients])
  const availableLetters = Object.keys(groupedByLetter).sort()

  // ── Selected client data ──────────────────────────────────────────────────
  const selected = clients.find(c => c.id === selectedId) ?? null
  const selectedAppts = useMemo(() => selectedId ? appts.filter(a => a.client_id === selectedId).sort((a, b) => b.date < a.date ? -1 : 1) : [], [selectedId, appts])
  const confirmedAppts = useMemo(() => selectedAppts.filter(a => ['confirmed', 'completed'].includes(a.status)), [selectedAppts])
  const stats = selectedId ? clientStats[selectedId] : null

  const servicesBreakdown = useMemo(() => {
    const map: Record<string, { count: number; price: number }> = {}
    confirmedAppts.forEach(a => {
      const name = getApptService(a)
      if (!map[name]) map[name] = { count: 0, price: 0 }
      map[name].count++
      map[name].price = getApptPrice(a)
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count)
  }, [confirmedAppts])

  const visitChart = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = subMonths(now, 5 - i)
      return {
        name: format(d, 'MMM', { locale: es }),
        visitas: selectedAppts.filter(a => a.status !== 'cancelled' && isSameMonth(parseISO(a.date), d)).length,
      }
    })
  }, [selectedAppts])

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) return
    setNotes(selected.notes || '')
    setEditMode(false)
    setHistoryExpanded(false)
    setEditForm({
      name: selected.name,
      phone: selected.phone || '',
      email: selected.email || '',
      insurance_name: selected.insurance_name || '',
      insurance_number: selected.insurance_number || '',
      preferences: selected.preferences || '',
    })
  }, [selectedId]) // eslint-disable-line

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleNotesChange(value: string) {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      if (!selectedId) return
      await supabase.from('clients').update({ notes: value }).eq('id', selectedId)
      setClients(prev => prev.map(c => c.id === selectedId ? { ...c, notes: value } : c))
    }, 800)
  }

  async function saveClient() {
    if (!selectedId) return
    setSaving(true)
    const updates: Partial<Client> = {
      name: editForm.name,
      phone: editForm.phone || null,
      email: editForm.email || null,
    }
    if (isSalud) {
      updates.insurance_name = editForm.insurance_name || null
      updates.insurance_number = editForm.insurance_number || null
    }
    if (isBelleza) {
      updates.preferences = editForm.preferences || null
    }
    const { error } = await supabase.from('clients').update(updates).eq('id', selectedId)
    setSaving(false)
    if (error) { toast.error('Error al guardar'); return }
    setClients(prev => prev.map(c => c.id === selectedId ? { ...c, ...updates } : c))
    setEditMode(false)
    toast.success('Cliente actualizado')
  }

  async function deleteClient() {
    if (!selectedId) return
    setDeleting(true)
    await supabase.from('appointments').delete().eq('client_id', selectedId)
    const { error } = await supabase.from('clients').delete().eq('id', selectedId)
    setDeleting(false)
    if (error) { toast.error('Error al eliminar'); return }
    setClients(prev => prev.filter(c => c.id !== selectedId))
    setAppts(prev => prev.filter(a => a.client_id !== selectedId))
    setSelectedId(null)
    setConfirmDelete(false)
    toast.success('Cliente eliminado')
  }

  async function deleteAppt(id: string) {
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) { toast.error('Error'); return }
    setAppts(prev => prev.filter(a => a.id !== id))
    toast.success('Visita eliminada')
  }

  async function markStatus(status: string) {
    if (!selectedId) return
    const { error } = await supabase.from('clients').update({ status }).eq('id', selectedId)
    if (!error) {
      setClients(prev => prev.map(c => c.id === selectedId ? { ...c, status } : c))
      toast.success('Estado actualizado')
    }
  }

  async function mergeGroup(group: Client[]) {
    const sorted = [...group].sort((a, b) => a.created_at < b.created_at ? -1 : 1)
    const keep = sorted[0], toDelete = sorted.slice(1)
    try {
      for (const dup of toDelete) {
        await supabase.from('appointments').update({ client_id: keep.id }).eq('client_id', dup.id)
        await supabase.from('clients').delete().eq('id', dup.id)
      }
      setClients(prev => prev.filter(c => !toDelete.find(d => d.id === c.id)))
      setAppts(prev => prev.map(a => toDelete.find(d => d.id === a.client_id) ? { ...a, client_id: keep.id } : a))
      if (selectedId && toDelete.find(d => d.id === selectedId)) setSelectedId(keep.id)
      toast.success(`Fusionados ${group.length} → ${keep.name}`)
    } catch { toast.error('Error al fusionar') }
  }

  function scrollToLetter(letter: string) {
    const el = letterRefs.current[letter]
    const list = listRef.current
    if (el && list) list.scrollTop = el.offsetTop - 8
  }

  const showDetail = selectedId !== null

  // ── STATUS BADGE COLORS ───────────────────────────────────────────────────
  const APPT_STATUS_COLOR: Record<string, string> = {
    confirmed: 'text-green-400',
    completed: 'text-blue-400',
    cancelled: 'text-red-400',
    pending: 'text-yellow-400',
    pending_payment: 'text-amber-400',
  }
  const APPT_STATUS_LABEL: Record<string, string> = {
    confirmed: 'Confirmado',
    completed: 'Completado',
    cancelled: 'Cancelado',
    pending: 'Pendiente',
    pending_payment: 'Pago pend.',
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 flex h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-background">

      {/* ═══════════════ LEFT PANEL ═══════════════ */}
      <div className={cn(
        'w-full lg:w-80 flex-shrink-0 flex flex-col overflow-hidden border-r border-border',
        showDetail && 'hidden lg:flex'
      )}>
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">
              {term.clients} <span className="text-muted-foreground font-normal text-sm">({clients.length})</span>
            </h1>
            {duplicates.length > 0 && (
              <button onClick={() => setMergeModal(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Fusionar duplicados">
                <GitMerge className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {FILTER_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  filter === t.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, teléfono, email..." className="pl-8 h-8 text-sm" />
          </div>

          {/* Alphabet index */}
          <div className="flex flex-wrap gap-0.5">
            {ALL_LETTERS.map(l => {
              const has = availableLetters.includes(l)
              return (
                <button
                  key={l}
                  onClick={() => has && scrollToLetter(l)}
                  disabled={!has}
                  className={cn(
                    'w-5 h-5 text-[10px] font-mono rounded transition-colors',
                    has ? 'text-foreground hover:text-white hover:bg-primary' : 'text-muted-foreground/30 cursor-default'
                  )}
                >
                  {l}
                </button>
              )
            })}
          </div>
        </div>

        {/* Client list */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {filteredClients.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">
              {search ? 'Sin resultados' : `Sin ${term.clients.toLowerCase()}`}
            </p>
          ) : (
            availableLetters.map(letter => (
              <div key={letter} ref={el => { letterRefs.current[letter] = el }}>
                <div className="px-4 py-1.5 text-xs font-bold text-muted-foreground tracking-widest bg-secondary/30 sticky top-0">
                  {letter}
                </div>
                {groupedByLetter[letter]?.map(client => {
                  const cs = clientStats[client.id]
                  const num = clientNumberMap[client.id]
                  const isSelected = client.id === selectedId
                  return (
                    <button
                      key={client.id}
                      onClick={() => setSelectedId(client.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left border-l-2 transition-all',
                        isSelected
                          ? 'border-l-primary bg-primary/10'
                          : 'border-l-transparent hover:bg-secondary/40'
                      )}
                    >
                      {/* Avatar — iniciales atenuadas si el cliente está en pausa (inactivo) */}
                      <div className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : cs?.status === 'paused'
                            ? 'bg-secondary text-muted-foreground'
                            : 'bg-secondary text-secondary-foreground'
                      )}>
                        {client.name.slice(0, 2).toUpperCase()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{fichaNum(num)} · {cs?.visits ?? 0} visitas</p>
                      </div>
                      {/* Status dot */}
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[cs?.status ?? 'new'])} title={STATUS_LABEL[cs?.status ?? 'new']} />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ═══════════════ RIGHT PANEL ═══════════════ */}
      <div className={cn(
        'flex-1 overflow-y-auto',
        !showDetail && 'hidden lg:flex lg:items-center lg:justify-center'
      )}>
        {/* Empty state */}
        {!selected && (
          <div className="text-center text-muted-foreground space-y-2">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto">
              <Search className="w-7 h-7 opacity-40" />
            </div>
            <p className="text-sm">Seleccioná un {term.client.toLowerCase()} para ver su ficha</p>
          </div>
        )}

        {/* Client detail */}
        {selected && stats && (() => {
          const num = clientNumberMap[selected.id]
          const suggestion = getSuggestion(stats.visits, stats.daysSinceLast)
          const avgTicket = stats.visits > 0 ? Math.round(stats.totalSpend / stats.visits) : 0
          const waPhone = selected.phone ? '549' + selected.phone.replace(/\D/g, '').replace(/^(549|54)/, '') : null
          const monthsSinceJoin = differenceInMonths(new Date(), parseISO(selected.created_at))

          return (
            <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
              {/* ── Back button (mobile) ── */}
              <button onClick={() => setSelectedId(null)} className="lg:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2">
                <ChevronLeft className="w-4 h-4" /> Volver
              </button>

              {/* ── Header ── */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs font-bold tracking-widest px-2 py-0.5 rounded-full', STATUS_DOT[stats.status], 'text-black')}>
                    {STATUS_LABEL[stats.status]}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">FICHA {fichaNum(num)}</span>
                </div>

                {editMode ? (
                  <div className="space-y-2">
                    <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="text-2xl font-bold h-auto py-1" />
                    <div className="flex gap-2">
                      <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="Teléfono" className="h-8 text-sm" />
                      <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="Email" className="h-8 text-sm" />
                    </div>
                    {isSalud && (
                      <div className="flex gap-2">
                        <Input value={editForm.insurance_name} onChange={e => setEditForm(f => ({ ...f, insurance_name: e.target.value }))}
                          placeholder="Obra social" className="h-8 text-sm" />
                        <Input value={editForm.insurance_number} onChange={e => setEditForm(f => ({ ...f, insurance_number: e.target.value }))}
                          placeholder="N° de afiliado" className="h-8 text-sm" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveClient} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-3xl font-bold tracking-tight uppercase">{selected.name}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {selected.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selected.phone}</span>}
                      <span>alta hace {fmtSince(selected.created_at)}</span>
                      {selected.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selected.email}</span>}
                    </div>
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {waPhone && (
                        <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-500 text-white h-8">
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </Button>
                        </a>
                      )}
                      <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setEditMode(true)}>
                        <Edit2 className="w-3.5 h-3.5" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-red-400 hover:text-red-300 border-red-500/30"
                        onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="w-3.5 h-3.5" /> Eliminar
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* ── Stats cards ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'VISITAS', value: stats.visits, sub: monthsSinceJoin > 0 ? `en ${monthsSinceJoin} meses` : 'este mes' },
                  { label: 'GASTO TOTAL', value: `$${stats.totalSpend.toLocaleString('es-AR')}`, sub: 'histórico' },
                  { label: 'TICKET PROM.', value: `$${avgTicket.toLocaleString('es-AR')}`, sub: 'por visita' },
                  { label: 'ÚLTIMA VISITA', value: stats.lastDate ? fmtLastVisit(stats.lastDate) : '—', sub: '' },
                ].map(card => (
                  <div key={card.label} className="bg-card border border-border rounded-lg p-3">
                    <p className="text-[10px] font-bold tracking-widest text-muted-foreground">{card.label}</p>
                    <p className="text-base font-bold mt-1 leading-tight">{card.value}</p>
                    {card.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>}
                  </div>
                ))}
              </div>

              {/* ── Suggestion ── */}
              <div className={cn('rounded-lg border p-4 flex items-start gap-3', suggestion.bg, suggestion.border)}>
                <Lightbulb className={cn('w-4 h-4 flex-shrink-0 mt-0.5', suggestion.color)} />
                <div className="flex-1">
                  <p className={cn('text-xs font-bold tracking-widest mb-1', suggestion.color)}>{suggestion.label}</p>
                  <p className="text-sm text-muted-foreground">{suggestion.text}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0"
                  onClick={() => markStatus(suggestion.status)}>
                  Marcar seguimiento
                </Button>
              </div>

              {/* ── Services ── */}
              {servicesBreakdown.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-widest text-muted-foreground">SERVICIOS REALIZADOS</h3>
                  <div className="space-y-1.5">
                    {servicesBreakdown.map(s => (
                      <div key={s.name} className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border text-sm">
                        <span className="flex-1 truncate">{s.name}</span>
                        <div className="flex items-center gap-3 flex-shrink-0 text-muted-foreground text-xs">
                          <span>{s.count} {s.count === 1 ? 'vez' : 'veces'}</span>
                          <span className="font-medium text-foreground">${s.price.toLocaleString('es-AR')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── History + Chart ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* History */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-widest text-muted-foreground">
                    HISTORIAL DE VISITAS ({selectedAppts.length})
                  </h3>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {selectedAppts.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Sin visitas registradas</p>
                    ) : selectedAppts.slice(0, 20).map(a => (
                      <div key={a.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-card border border-border text-xs">
                        <span className="text-muted-foreground w-16 flex-shrink-0">
                          {format(parseISO(a.date), 'd MMM yy', { locale: es })}
                        </span>
                        <span className="font-mono w-10 flex-shrink-0">{a.time.slice(0, 5)}</span>
                        <span className="flex-1 truncate text-foreground">{getApptService(a)}</span>
                        <span className="text-muted-foreground">${getApptPrice(a).toLocaleString('es-AR')}</span>
                        <span className={cn('w-16 text-right flex-shrink-0', APPT_STATUS_COLOR[a.status] || 'text-muted-foreground')}>
                          {APPT_STATUS_LABEL[a.status] || a.status}
                        </span>
                        <button onClick={() => deleteAppt(a.id)} className="text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Chart */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold tracking-widest text-muted-foreground">VISITAS POR MES</h3>
                  <div className="bg-card border border-border rounded-lg p-3">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={visitChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                          formatter={(v) => [Number(v), 'Visitas']}
                        />
                        <Bar dataKey="visitas" radius={[3, 3, 0, 0]} fill="var(--primary)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ── Notas (única sección libre; reemplaza Ficha técnica + Preferencias) ── */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold tracking-widest text-muted-foreground">NOTAS</h3>
                <Textarea
                  value={notes}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Preferencias, alergias, observaciones..."
                  rows={6}
                  className="bg-card resize-none text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Guarda automáticamente</p>
              </div>

              {/* ── Historia Clínica (colapsable, solo salud) ── */}
              {isSalud && (
                <div className="space-y-3 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setHistoryExpanded(v => !v)}
                    aria-expanded={historyExpanded}
                    className="flex items-center justify-between w-full text-left rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-sm font-bold tracking-wide flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" /> Historia Clínica
                    </span>
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200', historyExpanded && 'rotate-180')} />
                  </button>
                  {historyExpanded && (
                    <ClinicalHistoryPanel
                      clientId={selected.id}
                      businessId={businessId}
                      initialInsuranceName={selected.insurance_name}
                      initialInsuranceNumber={selected.insurance_number}
                      onInsuranceSaved={(name, number) =>
                        setClients(prev => prev.map(c => c.id === selected.id ? { ...c, insurance_name: name, insurance_number: number } : c))}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── Confirm delete ── */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar cliente?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminarán <strong>{selected?.name}</strong> y todos sus turnos. Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={deleteClient} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Merge duplicates ── */}
      <Dialog open={mergeModal} onOpenChange={setMergeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Fusionar duplicados</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Se detectaron clientes con el mismo email o teléfono. Se conserva el más antiguo y se reasignan los turnos.
          </p>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {duplicates.map((group, i) => {
              const keep = [...group].sort((a, b) => a.created_at < b.created_at ? -1 : 1)[0]
              return (
                <div key={i} className="p-3 rounded-lg border border-border space-y-2">
                  {group.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      {c.id === keep.id && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">CONSERVAR</span>}
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-muted-foreground text-xs">{c.phone}</span>}
                      {c.email && <span className="text-muted-foreground text-xs">{c.email}</span>}
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => mergeGroup(group)}>
                    <GitMerge className="w-3 h-3" /> Fusionar
                  </Button>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
