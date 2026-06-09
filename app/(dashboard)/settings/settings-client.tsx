'use client'

import { useState, useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { THEMES, THEME_PALETTES, THEME_DEFAULT_PAL, FONTS, normalizeTheme, normalizeFont, normalizePalette } from '@/lib/theme-config'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, Service, Professional, TimeBlock, Location } from '@/lib/types'
import { getPlanLimits, UPGRADE_URL } from '@/lib/plans'
import { PlanModal } from '@/components/dashboard/plan-modal'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Clock, DollarSign, Eye, EyeOff, X, ImageIcon, Check, Sun, Moon, Pencil } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { TYPE_GROUPS, getVerticalKeyByType, VERTICALS } from '@/lib/verticals'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_IDS, sanitizeWidgetIds } from '@/lib/dashboard-widgets'
import { normalizeArWhatsApp } from '@/lib/whatsapp'
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon → Sun
const SLOT_DURATIONS = [15, 20, 30, 45, 60, 90, 120]

// Paletas de marca (swatch = primary en claro). El detalle de tokens vive en globals.css.
// Paletas + themes + tipografías viven en lib/theme-config (fuente única).

// ── Profesionales: form ampliado + labels por rubro ─────────────────────────
type ProForm = { name: string; last_name: string; specialty: string; license_number: string; phone: string; email: string }
const EMPTY_PRO: ProForm = { name: '', last_name: '', specialty: '', license_number: '', phone: '', email: '' }

// Etiquetas de Especialidad/Matrícula adaptadas al rubro (sin sobrecomplicar).
const PRO_LABELS: Record<string, { specialty: string; specialtyPh: string; license: string; licensePh: string }> = {
  salud:   { specialty: 'Especialidad',       specialtyPh: 'Cardiología, Pediatría…',  license: 'Matrícula profesional',      licensePh: 'MN 12345' },
  belleza: { specialty: 'Especialidad',       specialtyPh: 'Colorista, barbero…',      license: 'Matrícula',                  licensePh: 'Opcional' },
  general: { specialty: 'Especialidad / rol', specialtyPh: 'Rol o especialidad',        license: 'Matrícula / N° de registro', licensePh: 'Opcional' },
}

function proToPayload(f: ProForm) {
  // Normaliza: trim y opcionales vacíos → null.
  return {
    name: f.name.trim(),
    last_name: f.last_name.trim() || null,
    specialty: f.specialty.trim() || null,
    license_number: f.license_number.trim() || null,
    phone: f.phone.trim() || null,
    email: f.email.trim() || null,
  }
}

// Campos del profesional, reutilizados en alta (inline) y edición (dialog).
function ProFields({ value, onChange, labels, showExtra }: {
  value: ProForm
  onChange: (v: ProForm) => void
  labels: { specialty: string; specialtyPh: string; license: string; licensePh: string }
  showExtra: boolean
}) {
  const set = (k: keyof ProForm, v: string) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nombre *</Label>
          <Input value={value.name} onChange={e => set('name', e.target.value)} placeholder="Nombre" />
        </div>
        <div className="space-y-1">
          <Label>Apellido</Label>
          <Input value={value.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Apellido" />
        </div>
        <div className="space-y-1">
          <Label>{labels.specialty}</Label>
          <Input value={value.specialty} onChange={e => set('specialty', e.target.value)} placeholder={labels.specialtyPh} />
        </div>
        <div className="space-y-1">
          <Label>{labels.license} <span className="text-muted-foreground text-xs">(opcional)</span></Label>
          <Input value={value.license_number} onChange={e => set('license_number', e.target.value)} placeholder={labels.licensePh} />
        </div>
      </div>
      {showExtra && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Teléfono <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={value.phone} onChange={e => set('phone', e.target.value)} placeholder="+54 9 …" />
          </div>
          <div className="space-y-1">
            <Label>Email <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input type="email" value={value.email} onChange={e => set('email', e.target.value)} placeholder="profesional@email.com" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Time block state types ──────────────────────────────────────────────────
type LocalBlock = { id?: string; start_time: string; end_time: string; label: string; error?: string }
type DayConfig = { enabled: boolean; blocks: LocalBlock[] }

function defaultBlock(day: number): LocalBlock {
  if (day >= 1 && day <= 5) return { start_time: '09:00', end_time: '18:00', label: '' }
  if (day === 6) return { start_time: '09:00', end_time: '13:00', label: '' }
  return { start_time: '09:00', end_time: '18:00', label: '' }
}

// ── Props ───────────────────────────────────────────────────────────────────
interface Props {
  business: Business
  initialServices: Service[]
  initialProfessionals: Professional[]
  initialTimeBlocks: TimeBlock[]
  initialLocations: Location[]
}

export function SettingsClient({ business, initialServices, initialProfessionals, initialTimeBlocks, initialLocations }: Props) {
  const supabase = createClient()

  // ── Apariencia: paleta + tema (next-themes) ─────────────────────────────────
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Estilo visual: theme (forjo|modern|spa|cyber), paleta (depende del theme) y font.
  const [vtheme, setVtheme] = useState(() => normalizeTheme(business.theme))
  const [palette, setPalette] = useState(() => normalizePalette(normalizeTheme(business.theme), business.palette))
  const [font, setFont] = useState(() => normalizeFont(business.font))
  const themePalettes = THEME_PALETTES[vtheme] || THEME_PALETTES.forjo

  // Setea/borra los data-* del <html> según los defaults del preview (forjo/auto = sin atributo).
  function applyTheme(t: string) { const d = document.documentElement.dataset; if (t === 'forjo') delete d.theme; else d.theme = t }
  function applyFont(f: string) { const d = document.documentElement.dataset; if (f === 'auto') delete d.font; else d.font = f }

  async function selectTheme(t: string) {
    if (t === vtheme) return
    // Cambiar de theme resetea la paleta al default de ese theme (sus ids son distintos).
    const newPal = THEME_DEFAULT_PAL[t] || 'red'
    setVtheme(t); setPalette(newPal)
    applyTheme(t)
    document.documentElement.dataset.palette = newPal
    const { error } = await supabase.from('businesses').update({ theme: t, palette: newPal }).eq('id', business.id)
    if (error) { toast.error('Error al guardar el estilo'); return }
    toast.success('Estilo actualizado')
  }

  async function selectPalette(key: string) {
    setPalette(key)
    // Feedback inmediato en el <html>; la persistencia confirma después.
    document.documentElement.dataset.palette = key
    const { error } = await supabase.from('businesses').update({ palette: key }).eq('id', business.id)
    if (error) { toast.error('Error al guardar la paleta'); return }
    toast.success('Paleta actualizada')
  }

  async function selectFont(f: string) {
    setFont(f)
    applyFont(f)
    const { error } = await supabase.from('businesses').update({ font: f }).eq('id', business.id)
    if (error) { toast.error('Error al guardar la tipografía'); return }
    toast.success('Tipografía actualizada')
  }

  // ── Plan limits ───────────────────────────────────────────────────────────
  const planConfig = getPlanLimits(business.plan || 'basic')
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [confirmCancelSub, setConfirmCancelSub] = useState(false)
  const [cancellingSub, setCancellingSub] = useState(false)

  async function cancelSubscription() {
    setCancellingSub(true)
    const res = await fetch('/api/subscription/cancel', { method: 'POST' })
    const data = await res.json()
    setCancellingSub(false)
    setConfirmCancelSub(false)
    if (data.ok) {
      toast.success('Suscripción cancelada')
      setTimeout(() => window.location.reload(), 800)
    } else {
      toast.error(data.error || 'Error al cancelar')
    }
  }

  // ── Tab 1 — Business ──────────────────────────────────────────────────────
  const [bizForm, setBizForm] = useState({
    name: business.name,
    type: business.type || '',
    whatsapp: business.whatsapp || '',
    address: business.address || '',
    instagram: business.instagram || '',
    primary_color: business.primary_color,
  })
  const [savingBiz, setSavingBiz] = useState(false)

  async function saveBusiness() {
    // WhatsApp: vacío permitido (null); si hay algo, normalizar a formato wa.me y validar.
    let whatsapp: string | null = null
    if (bizForm.whatsapp.trim()) {
      whatsapp = normalizeArWhatsApp(bizForm.whatsapp)
      if (!whatsapp) {
        toast.error('WhatsApp inválido. Usá código de país y área, ej. +54 9 11 1234-5678')
        return
      }
    }
    setSavingBiz(true)
    // Cambiar el tipo recalcula el vertical del negocio.
    const vertical = getVerticalKeyByType(bizForm.type)
    const verticalChanged = vertical !== (business.vertical ?? 'general')
    const { error } = await supabase.from('businesses').update({ ...bizForm, whatsapp, vertical }).eq('id', business.id)
    setSavingBiz(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Negocio actualizado')
    // El menú y la terminología del dashboard dependen del vertical → recargar.
    if (verticalChanged) setTimeout(() => window.location.reload(), 600)
  }

  // ── Widgets del dashboard (selección manual) ────────────────────────────────
  // El usuario elige del catálogo FIJO y confirma con "Guardar panel".
  // Persistimos null si están todos = default mostrar todo.
  const [widgetSelection, setWidgetSelection] = useState<string[]>(
    sanitizeWidgetIds(business.dashboard_widgets) ?? DASHBOARD_WIDGET_IDS
  )
  const [savingWidgets, setSavingWidgets] = useState(false)

  function toggleWidget(id: string) {
    setWidgetSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function saveWidgets() {
    setSavingWidgets(true)
    const value = widgetSelection.length === DASHBOARD_WIDGET_IDS.length ? null : widgetSelection
    const { error } = await supabase.from('businesses').update({ dashboard_widgets: value }).eq('id', business.id)
    setSavingWidgets(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Panel actualizado')
  }

  // ── Logo upload ───────────────────────────────────────────────────────────
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [currentLogo, setCurrentLogo] = useState<string | null>(business.logo_url)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('El archivo no puede superar 2MB'); return }
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { toast.error('Formato no soportado. Usá JPG, PNG o WebP'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo() {
    if (!logoFile) return
    setUploadingLogo(true)
    const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${business.id}/logo.${ext}`
    const { error: uploadError } = await supabase.storage.from('logos').upload(path, logoFile, { upsert: true })
    if (uploadError) { toast.error('Error al subir el logo: ' + uploadError.message); setUploadingLogo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    const urlWithCache = `${publicUrl}?t=${Date.now()}`
    const { error: updateError } = await supabase.from('businesses').update({ logo_url: urlWithCache }).eq('id', business.id)
    if (updateError) { toast.error('Error al guardar'); setUploadingLogo(false); return }
    setCurrentLogo(urlWithCache)
    setLogoPreview(null)
    setLogoFile(null)
    setUploadingLogo(false)
    toast.success('Logo actualizado')
  }

  async function deleteLogo() {
    const { error } = await supabase.from('businesses').update({ logo_url: null }).eq('id', business.id)
    if (error) { toast.error('Error'); return }
    setCurrentLogo(null)
    setLogoPreview(null)
    setLogoFile(null)
    toast.success('Logo eliminado')
  }

  // ── Tab 2 — Services ──────────────────────────────────────────────────────
  const [services, setServices] = useState<Service[]>(initialServices)
  const [newService, setNewService] = useState({ name: '', duration_minutes: 30, price: 0 })

  async function addService() {
    if (!newService.name) return
    const { data, error } = await supabase.from('services').insert({ ...newService, business_id: business.id }).select().single()
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

  // ── Tab 3 — Professionals ─────────────────────────────────────────────────
  const [professionals, setProfessionals] = useState<Professional[]>(initialProfessionals)
  const [newPro, setNewPro] = useState<ProForm>(EMPTY_PRO)
  const [proExtraOpen, setProExtraOpen] = useState(false)
  const [savingPro, setSavingPro] = useState(false)
  const [editingPro, setEditingPro] = useState<Professional | null>(null)
  const [editPro, setEditPro] = useState<ProForm>(EMPTY_PRO)
  const [savingEditPro, setSavingEditPro] = useState(false)
  const canAddPro = professionals.filter(p => p.active).length < planConfig.max_professionals
  // Labels de Especialidad/Matrícula según el rubro del negocio.
  const proLabels = PRO_LABELS[getVerticalKeyByType(business.type)] ?? PRO_LABELS.general

  async function addProfessional() {
    if (!newPro.name.trim()) return
    if (!canAddPro) { toast.error('Límite de profesionales del plan alcanzado'); return }
    setSavingPro(true)
    const { data, error } = await supabase
      .from('professionals')
      .insert({ ...proToPayload(newPro), business_id: business.id })
      .select()
      .single()
    setSavingPro(false)
    if (error) { toast.error('Error al agregar'); return }
    setProfessionals(prev => [...prev, data as Professional])
    setNewPro(EMPTY_PRO)
    setProExtraOpen(false)
    toast.success('Profesional agregado')
  }

  function openEditPro(p: Professional) {
    setEditingPro(p)
    setEditPro({
      name: p.name ?? '',
      last_name: p.last_name ?? '',
      specialty: p.specialty ?? '',
      license_number: p.license_number ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
    })
  }

  async function saveEditPro() {
    if (!editingPro || !editPro.name.trim()) return
    setSavingEditPro(true)
    const payload = proToPayload(editPro)
    // Defensa en profundidad: filtro explícito por business_id además de la RLS.
    const { error } = await supabase
      .from('professionals')
      .update(payload)
      .eq('id', editingPro.id)
      .eq('business_id', business.id)
    setSavingEditPro(false)
    if (error) { toast.error('Error al guardar'); return }
    setProfessionals(prev => prev.map(p => p.id === editingPro.id ? { ...p, ...payload } as Professional : p))
    setEditingPro(null)
    toast.success('Profesional actualizado')
  }

  async function deleteProfessional(id: string) {
    // Defensa en profundidad: filtro explícito por business_id además de la RLS.
    await supabase.from('professionals').delete().eq('id', id).eq('business_id', business.id)
    setProfessionals(prev => prev.filter(p => p.id !== id))
    toast.success('Profesional eliminado')
  }

  // ── Tab 4 — Locations ─────────────────────────────────────────────────────
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [newLocation, setNewLocation] = useState({ name: '', address: '', phone: '' })
  const [savingLocation, setSavingLocation] = useState(false)

  const activeLocations = locations.filter(l => l.is_active !== false)
  const canAddLocation = activeLocations.length < planConfig.max_locations

  async function addLocation() {
    if (!newLocation.name.trim()) return
    if (!canAddLocation) { toast.error('Límite del plan alcanzado'); return }
    setSavingLocation(true)
    const { data, error } = await supabase.from('locations').insert({
      business_id: business.id,
      name: newLocation.name.trim(),
      address: newLocation.address.trim() || null,
      phone: newLocation.phone.trim() || null,
    }).select().single()
    setSavingLocation(false)
    if (error) { toast.error('Error al agregar'); return }
    setLocations(prev => [...prev, data as Location])
    setNewLocation({ name: '', address: '', phone: '' })
    toast.success('Sucursal agregada')
  }

  async function deleteLocation(id: string) {
    await supabase.from('locations').delete().eq('id', id)
    setLocations(prev => prev.filter(l => l.id !== id))
    toast.success('Sucursal eliminada')
  }

  // ── Tab 5 — Hours (time blocks) ───────────────────────────────────────────
  const [slotDuration, setSlotDuration] = useState(business.default_slot_duration ?? 60)
  const [dayStates, setDayStates] = useState<DayConfig[]>(() =>
    Array.from({ length: 7 }, (_, day) => {
      const blocks = initialTimeBlocks.filter(b => b.day_of_week === day)
      return {
        enabled: blocks.length > 0,
        blocks: blocks.map(b => ({ id: b.id, start_time: b.start_time, end_time: b.end_time, label: b.label || '' })),
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
      next[day] = { ...next[day], blocks: [...next[day].blocks, { start_time: newStart, end_time: newEnd, label: '' }] }
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
          // Mark overlapping
          return { ...ds, blocks: blocks.map(b => ({ ...b, error: b.error || 'Los bloques se superponen' })) }
        }
      }
      if (blocks.some(b => b.error)) valid = false
      return { ...ds, blocks }
    })
    setDayStates(next)
    return valid
  }

  async function saveHours() {
    if (!validateBlocks()) { toast.error('Corregí los errores antes de guardar'); return }
    setSavingHours(true)
    // Delete all existing blocks for this business
    await supabase.from('time_blocks').delete().eq('business_id', business.id)
    // Collect blocks to insert
    const toInsert: { business_id: string; day_of_week: number; start_time: string; end_time: string; label: string | null }[] = []
    dayStates.forEach((ds, day) => {
      if (!ds.enabled) return
      ds.blocks.forEach(b => {
        toInsert.push({ business_id: business.id, day_of_week: day, start_time: b.start_time, end_time: b.end_time, label: b.label || null })
      })
    })
    if (toInsert.length > 0) {
      const { error } = await supabase.from('time_blocks').insert(toInsert)
      if (error) { toast.error('Error al guardar horarios'); setSavingHours(false); return }
    }
    // Save slot duration
    await supabase.from('businesses').update({ default_slot_duration: slotDuration }).eq('id', business.id)
    setSavingHours(false)
    toast.success('Horarios guardados')
  }

  // ── Tab 5 — Payments ──────────────────────────────────────────────────────
  const [mpToken, setMpToken] = useState(business.mp_access_token || '')
  const [showMpToken, setShowMpToken] = useState(false)
  const [savingMp, setSavingMp] = useState(false)

  const [depositForm, setDepositForm] = useState({
    require_deposit: business.require_deposit || false,
    deposit_amount: business.deposit_amount || 0,
    deposit_expiry_hours: business.deposit_expiry_hours || 1,
  })
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)

  const [notifForm, setNotifForm] = useState({
    notification_email: business.notification_email || '',
    resend_api_key: business.resend_api_key || '',
    resend_from: business.resend_from || '',
  })
  const [showResendKey, setShowResendKey] = useState(false)
  const [savingNotif, setSavingNotif] = useState(false)

  const [recaptchaForm, setRecaptchaForm] = useState({
    recaptcha_site_key: business.recaptcha_site_key || '',
    recaptcha_secret_key: business.recaptcha_secret_key || '',
  })
  const [showRecaptchaSecret, setShowRecaptchaSecret] = useState(false)
  const [savingRecaptcha, setSavingRecaptcha] = useState(false)

  async function saveMpToken() {
    setSavingMp(true)
    const { error } = await supabase.from('businesses').update({ mp_access_token: mpToken || null }).eq('id', business.id)
    setSavingMp(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Token guardado')
  }
  async function saveDeposit() {
    setSavingDeposit(true)
    const { error } = await supabase.from('businesses').update(depositForm).eq('id', business.id)
    setSavingDeposit(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Configuración de seña guardada')
  }
  async function cleanupExpired() {
    setCleaningUp(true)
    try {
      const res = await fetch('/api/appointments/cleanup-expired', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        toast.success(data.cancelled > 0
          ? `Se liberaron ${data.cancelled} reserva(s) con seña vencida`
          : 'No había reservas vencidas para liberar')
      } else {
        toast.error('No se pudo limpiar. Probá de nuevo.')
      }
    } catch {
      toast.error('No se pudo conectar. Probá de nuevo.')
    } finally {
      setCleaningUp(false)
    }
  }
  async function saveNotif() {
    setSavingNotif(true)
    const { error } = await supabase.from('businesses').update({ notification_email: notifForm.notification_email || null, resend_api_key: notifForm.resend_api_key || null, resend_from: notifForm.resend_from || null }).eq('id', business.id)
    setSavingNotif(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Notificaciones guardadas')
  }
  async function saveRecaptcha() {
    setSavingRecaptcha(true)
    const { error } = await supabase.from('businesses').update({ recaptcha_site_key: recaptchaForm.recaptcha_site_key || null, recaptcha_secret_key: recaptchaForm.recaptcha_secret_key || null }).eq('id', business.id)
    setSavingRecaptcha(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Configuración anti-spam guardada')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <PageEyebrow label="Ajustes" />
        <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Configuración</h1>
      </div>

      <Tabs defaultValue="appearance">
        <TabsList className="grid grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap w-full lg:w-fit h-auto">
          <TabsTrigger value="appearance">Apariencia</TabsTrigger>
          <TabsTrigger value="business">Negocio</TabsTrigger>
          <TabsTrigger value="services">Servicios</TabsTrigger>
          <TabsTrigger value="professionals">Equipo</TabsTrigger>
          <TabsTrigger value="locations">Sucursales</TabsTrigger>
          <TabsTrigger value="hours">Horarios</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
        </TabsList>

        {/* ── Apariencia ── */}
        <TabsContent value="appearance" className="mt-4">
          <Card className="p-6 space-y-6">
            {/* Estilo visual (theme) */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Estilo visual</p>
                <p className="text-xs text-muted-foreground">Cambiá la personalidad completa del panel y tu página: tipografías, colores y detalles.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {THEMES.map(t => {
                  const active = vtheme === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTheme(t.id)}
                      aria-pressed={active}
                      className={cn(
                        'overflow-hidden rounded-lg border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <span className="relative flex h-[68px] items-end gap-1.5 p-3" style={{ background: t.bg }}>
                        <span className="absolute left-3 top-2.5 text-sm font-extrabold" style={{ color: t.fg }}>Aa</span>
                        {t.chips.map((c, i) => (
                          <span key={i} className="h-6 flex-1 rounded" style={{ background: c, opacity: 1 - i * 0.18, boxShadow: t.glow ? `0 0 10px ${c}` : undefined }} />
                        ))}
                      </span>
                      <span className="flex items-center gap-2 p-2.5">
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold truncate">{t.name}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{t.meta}</span>
                        </span>
                        {active && (
                          <span className="ml-auto flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Paleta de color (depende del theme activo) */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Paleta de color</p>
                <p className="text-xs text-muted-foreground">Define el color principal de tu panel y tu página pública de reservas.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {themePalettes.map(p => {
                  const active = palette === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPalette(p.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col gap-2.5 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <span className="flex h-10 w-full overflow-hidden rounded-md border border-border/50">
                        {p.swatches.map((c, i) => <span key={i} className="flex-1" style={{ backgroundColor: c, boxShadow: p.glow ? `inset 0 0 8px ${c}` : undefined }} />)}
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.meta}</p>
                        </div>
                        {active && (
                          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Tipografía */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Tipografía</p>
                <p className="text-xs text-muted-foreground">Elegí el carácter de las letras. «Automática» usa la fuente nativa de cada estilo.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {FONTS.map(f => {
                  const active = font === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => selectFont(f.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <span className="flex-shrink-0 w-10 h-10 rounded-md bg-secondary flex items-center justify-center text-xl font-bold leading-none" style={{ fontFamily: f.css }}>Aa</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold truncate">{f.name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate">{f.meta}</span>
                      </span>
                      {active && (
                        <span className="ml-auto flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Tema claro / oscuro */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Tema</p>
                <p className="text-xs text-muted-foreground">Se guarda en este dispositivo.</p>
              </div>
              <div className="inline-flex rounded-lg border border-border p-1 bg-secondary/30">
                {([
                  { key: 'light', label: 'Claro', icon: Sun },
                  { key: 'dark', label: 'Oscuro', icon: Moon },
                ] as const).map(opt => {
                  const Icon = opt.icon
                  // Hasta montar, next-themes no conoce el tema → evitamos marcar activo (hydration).
                  const active = mounted && theme === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setTheme(opt.key)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4" /> {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ── Business ── */}
        <TabsContent value="business" className="mt-4">
          <Card className="p-6 space-y-5">
            {/* Logo */}
            <div className="space-y-3">
              <Label>Logo del negocio</Label>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {(logoPreview || currentLogo) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoPreview || currentLogo!}
                      alt="Logo"
                      className="w-20 h-20 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                      {bizForm.name ? (
                        <span className="text-2xl font-bold text-primary">{bizForm.name.charAt(0).toUpperCase()}</span>
                      ) : (
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={handleLogoSelect}
                  />
                  {logoPreview ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={uploadLogo} disabled={uploadingLogo}>
                        {uploadingLogo ? 'Subiendo...' : 'Guardar logo'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setLogoPreview(null); setLogoFile(null) }}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                        {currentLogo ? 'Cambiar logo' : 'Subir logo'}
                      </Button>
                      {currentLogo && (
                        <Button size="sm" variant="outline" className="text-red-400 border-red-500/30" onClick={deleteLogo}>
                          Eliminar
                        </Button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">JPG, PNG o WebP · Máximo 2MB</p>
                </div>
              </div>
            </div>

            <Separator />

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
                    {TYPE_GROUPS.map(group => (
                      <SelectGroup key={group.key}>
                        <SelectLabel>{group.label}</SelectLabel>
                        {group.types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                {bizForm.type && (
                  <p className="text-xs text-muted-foreground pt-0.5">
                    Rubro: <span className="text-foreground">{VERTICALS[getVerticalKeyByType(bizForm.type)].label}</span>
                    {' · '}cambiarlo ajusta el menú y los campos del panel.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={bizForm.whatsapp} onChange={e => setBizForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+54 9 11 1234-5678" />
                <p className="text-xs text-muted-foreground">Con código de país, ej. +54 9 11 1234-5678. Se usa para el botón de WhatsApp en los emails.</p>
              </div>
              <div className="space-y-1">
                <Label>Instagram</Label>
                <Input value={bizForm.instagram} onChange={e => setBizForm(f => ({ ...f, instagram: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Dirección</Label>
                <Input value={bizForm.address} onChange={e => setBizForm(f => ({ ...f, address: e.target.value }))} />
              </div>
            </div>
            <div className="pt-2">
              <Label className="text-muted-foreground text-xs">URL de tu página</Label>
              <p className="text-sm mt-1">{process.env.NEXT_PUBLIC_APP_URL}/{business.slug}</p>
            </div>
            <Button className="self-start" onClick={saveBusiness} disabled={savingBiz}>{savingBiz ? 'Guardando...' : 'Guardar cambios'}</Button>

            {/* ── Panel del dashboard (widgets + recomendación IA) ── */}
            <div className="border-t border-border pt-5 space-y-3">
              <div>
                <p className="font-semibold text-sm">Panel del dashboard</p>
                <p className="text-xs text-muted-foreground">Elegí qué widgets ver en tu panel principal.</p>
              </div>
              <div className="space-y-2">
                {DASHBOARD_WIDGETS.map(w => (
                  <label key={w.id} className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={widgetSelection.includes(w.id)} onChange={() => toggleWidget(w.id)}
                      className="w-4 h-4 accent-primary cursor-pointer mt-0.5" />
                    <span>
                      <span className="text-sm">{w.label}</span>
                      <span className="block text-xs text-muted-foreground">{w.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Button size="sm" onClick={saveWidgets} disabled={savingWidgets}>{savingWidgets ? 'Guardando...' : 'Guardar panel'}</Button>
            </div>
          </Card>

          {/* Subscription */}
          {(business.plan_status === 'active' || business.plan_status === 'cancelled') && (
            <Card className="p-6 space-y-4 mt-4">
              <p className="font-semibold text-sm">Tu suscripción</p>
              <div className="text-sm space-y-1">
                <p>Plan actual: <span className="font-medium">{planConfig.name}</span></p>
                {business.subscription_ends_at && (
                  <p className="text-muted-foreground">
                    {business.plan_status === 'cancelled' ? 'Tu plan sigue activo hasta' : 'Próximo cobro'}:{' '}
                    {new Date(business.subscription_ends_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {business.plan_status === 'cancelled' && (
                  <p className="text-amber-400 text-xs">Suscripción cancelada — no se renovará automáticamente</p>
                )}
              </div>
              {business.plan_status === 'active' && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPlanModalOpen(true)}>Cambiar plan</Button>
                  <Button variant="outline" size="sm" className="text-red-400 border-red-500/30"
                    onClick={() => setConfirmCancelSub(true)}>Cancelar suscripción</Button>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── Services ── */}
        <TabsContent value="services" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              {services.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', !s.active && 'line-through text-muted-foreground')}>{s.name}</p>
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

        {/* ── Professionals ── */}
        <TabsContent value="professionals" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Profesionales del equipo</p>
              <span className="text-xs bg-secondary px-2 py-1 rounded-full text-muted-foreground">
                {planConfig.name} · {professionals.filter(p => p.active).length}/{planConfig.max_professionals}
              </span>
            </div>
            <div className="space-y-2">
              {professionals.map(p => {
                const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
                const sub = [p.specialty, p.license_number].filter(Boolean).join(' · ')
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{fullName}</p>
                      {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8" onClick={() => openEditPro(p)} aria-label={`Editar ${fullName}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => deleteProfessional(p.id)} aria-label={`Eliminar ${fullName}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
            {!canAddPro ? (
              <div className="border-t border-border pt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Límite del plan alcanzado · Upgrade para agregar más</span>
                <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">Ver planes →</a>
              </div>
            ) : (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium">Agregar profesional</p>
                <ProFields value={newPro} onChange={setNewPro} labels={proLabels} showExtra={proExtraOpen} />
                {!proExtraOpen && (
                  <button type="button" onClick={() => setProExtraOpen(true)} className="text-xs text-primary hover:underline">
                    + Datos de contacto (opcional)
                  </button>
                )}
                <Button onClick={addProfessional} disabled={savingPro || !newPro.name.trim()} className="gap-1">
                  <Plus className="w-4 h-4" /> {savingPro ? 'Agregando...' : 'Agregar'}
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Locations ── */}
        <TabsContent value="locations" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Sucursales</p>
              <span className="text-xs bg-secondary px-2 py-1 rounded-full text-muted-foreground">
                {planConfig.name} · {activeLocations.length}/{planConfig.max_locations}
              </span>
            </div>
            <div className="space-y-2">
              {locations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin sucursales registradas</p>
              )}
              {locations.map(loc => (
                <div key={loc.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{loc.name}</p>
                    {(loc.address || loc.phone) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[loc.address, loc.phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0" onClick={() => deleteLocation(loc.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            {!canAddLocation ? (
              <div className="border-t border-border pt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Límite del plan alcanzado · Upgrade para agregar más</span>
                <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">Ver planes →</a>
              </div>
            ) : (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium">Agregar sucursal</p>
                <div className="space-y-2">
                  <Input value={newLocation.name} onChange={e => setNewLocation(f => ({ ...f, name: e.target.value }))} placeholder="Nombre de la sucursal *" />
                  <Input value={newLocation.address} onChange={e => setNewLocation(f => ({ ...f, address: e.target.value }))} placeholder="Dirección (opcional)" />
                  <Input value={newLocation.phone} onChange={e => setNewLocation(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono (opcional)" />
                </div>
                <Button onClick={addLocation} disabled={savingLocation} className="gap-1">
                  <Plus className="w-4 h-4" /> {savingLocation ? 'Guardando...' : 'Agregar sucursal'}
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Hours ── */}
        <TabsContent value="hours" className="mt-4">
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
                                className="w-44 text-sm"
                              />
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
                        <button
                          onClick={() => addBlock(day)}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium mt-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar bloque
                        </button>
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
        </TabsContent>

        {/* ── Payments ── */}
        <TabsContent value="payments" className="mt-4 space-y-4">
          {/* MercadoPago */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">MercadoPago</p>
              <p className="text-xs text-muted-foreground mt-0.5">Encontralo en mercadopago.com.ar → Tu negocio → Credenciales</p>
            </div>
            <div className="space-y-1">
              <Label>Access Token</Label>
              <div className="relative">
                <Input type={showMpToken ? 'text' : 'password'} value={mpToken} onChange={e => setMpToken(e.target.value)} placeholder="APP_USR-..." className="pr-10" />
                <button type="button" onClick={() => setShowMpToken(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showMpToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button onClick={saveMpToken} disabled={savingMp}>{savingMp ? 'Guardando...' : 'Guardar'}</Button>
          </Card>

          {/* Seña */}
          <Card className="p-6 space-y-4">
            <p className="font-semibold text-sm">Seña</p>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="require_deposit" checked={depositForm.require_deposit}
                onChange={e => setDepositForm(f => ({ ...f, require_deposit: e.target.checked }))} className="w-4 h-4 accent-primary cursor-pointer" />
              <Label htmlFor="require_deposit" className="cursor-pointer">Requerir seña para confirmar el turno</Label>
            </div>
            {depositForm.require_deposit && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Monto (ARS)</Label>
                  <Input type="text" inputMode="numeric"
                    value={depositForm.deposit_amount === 0 ? '' : String(depositForm.deposit_amount)}
                    onChange={e => { const raw = e.target.value.replace(/\D/g, ''); setDepositForm(f => ({ ...f, deposit_amount: raw === '' ? 0 : Number(raw) })) }}
                    placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Horas para pagar</Label>
                  <Input type="number" min={1} value={depositForm.deposit_expiry_hours}
                    onChange={e => setDepositForm(f => ({ ...f, deposit_expiry_hours: parseInt(e.target.value) || 1 }))} />
                </div>
              </div>
            )}
            <Button onClick={saveDeposit} disabled={savingDeposit}>{savingDeposit ? 'Guardando...' : 'Guardar'}</Button>
          </Card>

          {/* Limpieza de reservas con seña vencida */}
          <Card className="p-6 space-y-3">
            <div>
              <p className="font-semibold text-sm">Reservas con seña vencida</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cancela las reservas cuya seña no se pagó a tiempo y libera esos horarios. Se hace solo una vez por día; podés forzarlo acá.</p>
            </div>
            <Button variant="outline" onClick={cleanupExpired} disabled={cleaningUp}>
              {cleaningUp ? 'Limpiando...' : 'Liberar horarios vencidos'}
            </Button>
          </Card>

          {/* Notificaciones */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">Notificaciones por email</p>
              <p className="text-xs text-muted-foreground mt-0.5">Creá tu cuenta gratis en resend.com</p>
            </div>
            <div className="space-y-1">
              <Label>Email para recibir notificaciones</Label>
              <Input type="email" value={notifForm.notification_email} onChange={e => setNotifForm(f => ({ ...f, notification_email: e.target.value }))} placeholder="vos@tudominio.com" />
            </div>
            <div className="space-y-1">
              <Label>API Key de Resend</Label>
              <div className="relative">
                <Input type={showResendKey ? 'text' : 'password'} value={notifForm.resend_api_key} onChange={e => setNotifForm(f => ({ ...f, resend_api_key: e.target.value }))} placeholder="re_..." className="pr-10" />
                <button type="button" onClick={() => setShowResendKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showResendKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email remitente <span className="text-muted-foreground text-xs">(solo si usás tu propia API Key)</span></Label>
              <Input type="email" value={notifForm.resend_from} onChange={e => setNotifForm(f => ({ ...f, resend_from: e.target.value }))} placeholder="turnos@tudominio.com" />
              <p className="text-xs text-muted-foreground">Debe ser de un dominio verificado en tu cuenta de Resend. Si dejás la API Key vacía, los emails salen desde Forjo Studio y este campo se ignora.</p>
            </div>
            <Button onClick={saveNotif} disabled={savingNotif}>{savingNotif ? 'Guardando...' : 'Guardar'}</Button>
          </Card>

          {/* Anti-spam */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">Verificación anti-spam</p>
              <p className="text-xs text-muted-foreground mt-0.5">Creá tu cuenta en google.com/recaptcha → v3 → dominio: forjo.studio</p>
            </div>
            <div className="space-y-1">
              <Label>reCAPTCHA Site Key</Label>
              <Input value={recaptchaForm.recaptcha_site_key} onChange={e => setRecaptchaForm(f => ({ ...f, recaptcha_site_key: e.target.value }))} placeholder="6Le..." />
            </div>
            <div className="space-y-1">
              <Label>reCAPTCHA Secret Key</Label>
              <div className="relative">
                <Input type={showRecaptchaSecret ? 'text' : 'password'} value={recaptchaForm.recaptcha_secret_key} onChange={e => setRecaptchaForm(f => ({ ...f, recaptcha_secret_key: e.target.value }))} placeholder="6Le..." className="pr-10" />
                <button type="button" onClick={() => setShowRecaptchaSecret(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showRecaptchaSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button onClick={saveRecaptcha} disabled={savingRecaptcha}>{savingRecaptcha ? 'Guardando...' : 'Guardar'}</Button>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Plan change modal */}
      <PlanModal open={planModalOpen} onOpenChange={setPlanModalOpen} />

      {/* Cancel subscription confirmation */}
      <Dialog open={confirmCancelSub} onOpenChange={setConfirmCancelSub}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>¿Cancelar suscripción?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tu plan seguirá activo hasta{' '}
            {business.subscription_ends_at
              ? new Date(business.subscription_ends_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
              : 'el fin del período'}
            . No se renovará automáticamente.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmCancelSub(false)}>Volver</Button>
            <Button variant="destructive" onClick={cancelSubscription} disabled={cancellingSub}>
              {cancellingSub ? 'Cancelando...' : 'Cancelar suscripción'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar profesional */}
      <Dialog open={!!editingPro} onOpenChange={open => { if (!open) setEditingPro(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar profesional</DialogTitle></DialogHeader>
          <ProFields value={editPro} onChange={setEditPro} labels={proLabels} showExtra />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingPro(null)}>Cancelar</Button>
            <Button onClick={saveEditPro} disabled={savingEditPro || !editPro.name.trim()}>
              {savingEditPro ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
