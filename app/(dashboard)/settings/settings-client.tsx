'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { THEMES, THEME_PALETTES, THEME_DEFAULT_PAL, FONTS, normalizeTheme, normalizeFont, normalizePalette } from '@/lib/theme-config'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, BusinessSecrets, Service, Professional, Location, Space, AgendaSpace } from '@/lib/types'
import { getPlanLimits, UPGRADE_URL } from '@/lib/plans'
import { PlanModal } from '@/components/dashboard/plan-modal'
import { CanchasManager } from '@/components/dashboard/canchas-manager'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Clock, DollarSign, Eye, EyeOff, ImageIcon, Check, Sun, Moon, Pencil, MapPin } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { getVerticalKeyByType, VERTICALS, RUBRO_PLACEHOLDERS, resolveVertical, type VerticalKey } from '@/lib/verticals'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_IDS, sanitizeWidgetIds } from '@/lib/dashboard-widgets'
import { normalizeArWhatsApp } from '@/lib/whatsapp'

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

// ── Props ───────────────────────────────────────────────────────────────────
type SettingsView = 'config' | 'negocio' | 'servicios' | 'equipo' | 'consultorios'

// Secretos vacíos: default para las vistas de sidebar (negocio/equipo/servicios/consultorios) que
// reusan SettingsClient pero NO renderizan los forms de secretos (view !== 'config'). Solo la
// página /settings (view='config') fetchea y pasa los valores reales (D-05).
const EMPTY_SECRETS: BusinessSecrets = {
  mp_access_token: null,
  mp_refresh_token: null,
  mp_token_expires_at: null,
  resend_api_key: null,
  resend_from: null,
  recaptcha_secret_key: null,
  google_refresh_token: null,
}

interface Props {
  business: Business
  // Valores crudos de los secretos del dueño (leídos server-side vía getBusinessSecrets). Este
  // es el form de edición del PROPIO dueño → D-05 permite mostrarle SU valor. Nunca se exponen
  // a anon ni a otro componente que no sea este form. Opcional: las vistas de sidebar que no
  // muestran los forms de secretos no lo pasan (default EMPTY_SECRETS).
  secrets?: BusinessSecrets
  initialServices: Service[]
  initialProfessionals: Professional[]
  initialLocations: Location[]
  // Espacios físicos (canchas) + mapeo agenda→espacios (motor-reservas / espacio compartido).
  // Cargados por tenant en page.tsx / equipo (.eq('business_id', business.id) + RLS). Opcionales:
  // las vistas de sidebar que no muestran la tab de Equipo (servicios/negocio/consultorios) no los pasan.
  initialSpaces?: Space[]
  initialAgendaSpaces?: AgendaSpace[]
  mpConnectEnabled: boolean
  // Qué mostrar: 'config' = pestañas de Configuración; el resto = una sección suelta (sidebar).
  view?: SettingsView
}

export function SettingsClient({ business, secrets = EMPTY_SECRETS, initialServices, initialProfessionals, initialLocations, initialSpaces = [], initialAgendaSpaces = [], mpConnectEnabled, view = 'config' }: Props) {
  const supabase = createClient()
  const router = useRouter()

  // Secciones que viven en el sidebar (una sola, sin pestañas). 'config' muestra las pestañas.
  // 'negocio' ahora es un HUB con sus propias pestañas (NAV-02, D-04): dejó de ser una sección
  // suelta de una sola tab. El resto (servicios/equipo/consultorios) siguen siendo secciones sueltas.
  const SECTION_TAB: Record<string, string> = { negocio: 'business', servicios: 'services', equipo: 'professionals', consultorios: 'locations' }
  const isSection = view !== 'config'
  const isNegocio = view === 'negocio'
  const [configTab, setConfigTab] = useState('appearance')
  // Estado de tab propio del hub Negocio (Datos·Cobros·Integraciones·Notificaciones/Mails). Se
  // separa de configTab porque son dos TabsList distintas en dos rutas distintas; default 'business'.
  const [negocioTab, setNegocioTab] = useState('business')
  // Qué value/handler recibe el <Tabs>: config y negocio tienen estado propio (TabsList visible);
  // las secciones sueltas restantes mapean a su única tab fija y no cambian de tab (onValueChange undefined).
  const tabValue = isNegocio ? negocioTab : isSection ? SECTION_TAB[view] : configTab
  const onTabChange = isNegocio ? setNegocioTab : isSection ? undefined : setConfigTab

  // Aviso al volver del OAuth de MercadoPago (?mp=connected|error) y limpieza de la URL.
  // D-06: Integraciones migró de /settings a /negocio, así que el retorno del OAuth se maneja acá,
  // en el hub Negocio. El backend ahora redirige a /negocio?mp=... → gateamos por isNegocio para que
  // el efecto solo corra al montar /negocio (nunca en /settings).
  useEffect(() => {
    if (!isNegocio) return
    const mp = new URLSearchParams(window.location.search).get('mp')
    if (!mp) return
    if (mp === 'connected') toast.success('MercadoPago conectado')
    else if (mp === 'error') toast.error('No se pudo conectar con MercadoPago')
    setNegocioTab('integraciones')
    window.history.replaceState(null, '', '/negocio')
  }, [isNegocio])

  // Etiqueta del lugar de atención según el rubro (Consultorio/Local/Sucursal).
  const term = resolveVertical(business).terminology
  const locWord = term.location.toLowerCase()
  // Vertical canchas: en /servicios (view='servicios') se renderiza el manager de canchas (D-03) en
  // lugar del CRUD genérico de services. El resto de verticales conserva el CRUD de services intacto.
  const isCanchas = resolveVertical(business).key === 'canchas'

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
    // Elegir un estilo es la decisión de primer orden y RESETEA lo de abajo (mismo criterio que el
    // CMS del landing, theme-controls.tsx selectPreset): la paleta al default del theme (sus ids son
    // distintos) y la fuente a 'auto' (borra el override para que mande la tipografía del theme nuevo;
    // sin esto, una fuente elegida a mano seguía pisando la del tema al cambiar de estilo).
    const newPal = THEME_DEFAULT_PAL[t] || 'red'
    setVtheme(t); setPalette(newPal); setFont('auto')
    applyTheme(t)
    applyFont('auto')
    document.documentElement.dataset.palette = newPal
    const { error } = await supabase.from('businesses').update({ theme: t, palette: newPal, font: 'auto' }).eq('id', business.id)
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
    maps_url: business.maps_url || '',
    instagram: business.instagram || '',
    primary_color: business.primary_color,
  })
  const [savingBiz, setSavingBiz] = useState(false)

  // Rubro (vertical): resuelve terminología/menú del panel (D-07). Inicializa desde la columna
  // vertical guardada; para filas viejas sin vertical, deriva del type con getVerticalKeyByType.
  // El type es texto libre de display (bizForm.type), ya no un subtipo del selector.
  const [vertical, setVertical] = useState<VerticalKey>(
    (business.vertical && business.vertical in VERTICALS
      ? business.vertical
      : getVerticalKeyByType(business.type)) as VerticalKey
  )

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
    // El vertical lo define el rubro elegido (estado `vertical`); el type es texto libre.
    const verticalChanged = vertical !== (business.vertical ?? 'general')
    const type = bizForm.type.trim()
    const maps_url = bizForm.maps_url.trim() || null
    const { error } = await supabase.from('businesses').update({ ...bizForm, type, whatsapp, vertical, maps_url }).eq('id', business.id)
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
  const [newService, setNewService] = useState<{ name: string; duration_minutes: number; price: number; location_ids: string[] }>({ name: '', duration_minutes: 30, price: 0, location_ids: [] })
  const [delService, setDelService] = useState<Service | null>(null)

  async function addService() {
    if (!newService.name) return
    const { name, duration_minutes, price, location_ids } = newService
    const { data, error } = await supabase.from('services')
      .insert({ name, duration_minutes, price, location_ids: location_ids.length ? location_ids : null, business_id: business.id })
      .select().single()
    if (error) { toast.error('Error'); return }
    setServices(prev => [...prev, data as Service])
    setNewService({ name: '', duration_minutes: 30, price: 0, location_ids: [] })
    toast.success('Servicio agregado')
  }
  async function deleteService(id: string) {
    // NO optimista: capturamos el error real. Defensa en profundidad con business_id (igual que
    // deleteProfessional). Si hay turnos asociados, el FK (23503) bloquea el borrado → sugerimos
    // desactivar en vez de tocar el estado (el item sigue en la lista porque no filtramos).
    const { error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id)
    if (error) {
      if (error.code === '23503') toast.error('No se puede eliminar: el servicio tiene turnos asociados. Desactivalo en vez de borrarlo.')
      else toast.error('No se pudo eliminar el servicio')
      return
    }
    setServices(prev => prev.filter(s => s.id !== id))
    toast.success('Servicio eliminado')
  }
  async function toggleService(id: string, active: boolean) {
    await supabase.from('services').update({ active }).eq('id', id)
    setServices(prev => prev.map(s => s.id === id ? { ...s, active } : s))
  }
  // Consultorios donde se ofrece un servicio (con compatibilidad legacy location_id).
  const serviceLocSet = (s: Service) => s.location_ids?.length ? s.location_ids : (s.location_id ? [s.location_id] : [])
  async function setServiceLocations(id: string, ids: string[]) {
    await supabase.from('services').update({ location_ids: ids.length ? ids : null, location_id: null }).eq('id', id)
    setServices(prev => prev.map(s => s.id === id ? { ...s, location_ids: ids, location_id: null } : s))
  }
  function toggleServiceLocation(s: Service, locId: string) {
    const cur = serviceLocSet(s)
    setServiceLocations(s.id, cur.includes(locId) ? cur.filter(x => x !== locId) : [...cur, locId])
  }

  // Edición de servicio (reusa el form de alta: nombre, duración, precio, consultorios).
  const [editSvc, setEditSvc] = useState<Service | null>(null)
  const [editSvcForm, setEditSvcForm] = useState<{ name: string; duration_minutes: number; price: number; location_ids: string[] }>({ name: '', duration_minutes: 30, price: 0, location_ids: [] })
  const [savingEditSvc, setSavingEditSvc] = useState(false)
  function openEditService(s: Service) {
    setEditSvc(s)
    setEditSvcForm({ name: s.name, duration_minutes: s.duration_minutes, price: Number(s.price), location_ids: serviceLocSet(s) })
  }
  async function saveEditService() {
    if (!editSvc || !editSvcForm.name.trim()) return
    setSavingEditSvc(true)
    // Normaliza igual que addService/setServiceLocations: array vacío → null = "todos"; limpia el legacy location_id.
    const payload = {
      name: editSvcForm.name.trim(),
      duration_minutes: editSvcForm.duration_minutes,
      price: editSvcForm.price,
      location_ids: editSvcForm.location_ids.length ? editSvcForm.location_ids : null,
      location_id: null,
    }
    const { error } = await supabase.from('services').update(payload).eq('id', editSvc.id).eq('business_id', business.id)
    setSavingEditSvc(false)
    if (error) { toast.error('Error al guardar'); return }
    setServices(prev => prev.map(s => s.id === editSvc.id ? { ...s, ...payload } : s))
    setEditSvc(null)
    toast.success('Servicio actualizado')
  }

  // ── Tab 3 — Professionals ─────────────────────────────────────────────────
  const [professionals, setProfessionals] = useState<Professional[]>(initialProfessionals)
  const [newPro, setNewPro] = useState<ProForm>(EMPTY_PRO)
  const [proExtraOpen, setProExtraOpen] = useState(false)
  const [savingPro, setSavingPro] = useState(false)
  const [editingPro, setEditingPro] = useState<Professional | null>(null)
  const [editPro, setEditPro] = useState<ProForm>(EMPTY_PRO)
  const [savingEditPro, setSavingEditPro] = useState(false)
  const [uploadingProPhoto, setUploadingProPhoto] = useState(false)
  const [newProPhoto, setNewProPhoto] = useState<File | null>(null)
  const [newProPhotoPreview, setNewProPhotoPreview] = useState<string | null>(null)

  // Foto del profesional (se muestra en la página pública). Mismo bucket que el logo,
  // bajo la carpeta del negocio: logos/{businessId}/pro-{proId}.{ext}.
  function validatePhoto(file: File): boolean {
    if (file.size > 2 * 1024 * 1024) { toast.error('El archivo no puede superar 2MB'); return false }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error('Formato no soportado. Usá JPG, PNG o WebP'); return false }
    return true
  }
  async function uploadPhotoFile(proId: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${business.id}/pro-${proId}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (error) { toast.error('Error al subir la foto: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    return `${publicUrl}?t=${Date.now()}`
  }

  // Alta: se elige antes de que exista el profesional; se sube en addProfessional.
  function selectNewProPhoto(file: File) {
    if (!validatePhoto(file)) return
    setNewProPhoto(file)
    setNewProPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
  }
  function clearNewProPhoto() {
    setNewProPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setNewProPhoto(null)
  }

  // Edición: sube y persiste de inmediato.
  async function uploadProPhoto(file: File) {
    if (!editingPro || !validatePhoto(file)) return
    setUploadingProPhoto(true)
    const url = await uploadPhotoFile(editingPro.id, file)
    if (!url) { setUploadingProPhoto(false); return }
    const { error } = await supabase.from('professionals').update({ photo_url: url }).eq('id', editingPro.id)
    if (error) { toast.error('Error al guardar la foto'); setUploadingProPhoto(false); return }
    setProfessionals(prev => prev.map(p => p.id === editingPro.id ? { ...p, photo_url: url } : p))
    setEditingPro(prev => prev ? { ...prev, photo_url: url } : prev)
    setUploadingProPhoto(false)
    toast.success('Foto actualizada')
  }
  async function removeProPhoto() {
    if (!editingPro) return
    const { error } = await supabase.from('professionals').update({ photo_url: null }).eq('id', editingPro.id)
    if (error) { toast.error('Error al quitar la foto'); return }
    setProfessionals(prev => prev.map(p => p.id === editingPro.id ? { ...p, photo_url: null } : p))
    setEditingPro(prev => prev ? { ...prev, photo_url: null } : prev)
    toast.success('Foto eliminada')
  }

  const canAddPro = professionals.filter(p => p.active).length < planConfig.max_agendas
  // Labels de Especialidad/Matrícula según el rubro del negocio.
  const proLabels = PRO_LABELS[vertical] ?? PRO_LABELS.general

  async function addProfessional() {
    if (!newPro.name.trim()) return
    if (!canAddPro) { toast.error('Límite de profesionales del plan alcanzado'); return }
    setSavingPro(true)
    const { data, error } = await supabase
      .from('professionals')
      .insert({ ...proToPayload(newPro), business_id: business.id })
      .select()
      .single()
    if (error) { setSavingPro(false); toast.error('Error al agregar'); return }
    let created = data as Professional
    // Si eligió foto en el alta, la subimos ahora que existe el id.
    if (newProPhoto) {
      const url = await uploadPhotoFile(created.id, newProPhoto)
      if (url) {
        await supabase.from('professionals').update({ photo_url: url }).eq('id', created.id)
        created = { ...created, photo_url: url }
      }
    }
    setSavingPro(false)
    setProfessionals(prev => [...prev, created])
    setNewPro(EMPTY_PRO)
    clearNewProPhoto()
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
    // Limpieza optimista del mapeo: al borrar la agenda, sus filas de agenda_spaces caen por FK
    // CASCADE en la DB; reflejarlo en el estado para que el UI no muestre mapeos huérfanos.
    setAgendaSpaces(prev => prev.filter(a => a.professional_id !== id))
    toast.success('Profesional eliminado')
  }

  // ── Espacios físicos + mapeo agenda→espacios (motor-reservas / espacio compartido) ─────────
  // Reusa el patrón del CRUD de professionals (estado local + browser client RLS + UI optimista +
  // toast). Toda escritura confía en RLS WITH CHECK por tenant (Plan 01); el business_id se pasa
  // porque la columna es NOT NULL, pero la policy lo valida (no es superficie falsificable).
  const [spaces, setSpaces] = useState<Space[]>(initialSpaces)
  const [agendaSpaces, setAgendaSpaces] = useState<AgendaSpace[]>(initialAgendaSpaces)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [savingSpace, setSavingSpace] = useState(false)
  // Término del eje según el rubro: 'Cancha'/'Canchas' para canchas, 'Profesional'/'Equipo' resto.
  const resourceWord = term.resource
  const resourcesWord = term.resources

  async function addSpace() {
    const name = newSpaceName.trim()
    if (!name) return
    setSavingSpace(true)
    const { data, error } = await supabase
      .from('spaces')
      .insert({ name, business_id: business.id })
      .select()
      .single()
    setSavingSpace(false)
    if (error) { toast.error('Error al agregar el espacio'); return }
    setSpaces(prev => [...prev, data as Space])
    setNewSpaceName('')
    toast.success('Espacio agregado')
  }

  async function deleteSpace(id: string) {
    // Defensa en profundidad: filtro explícito por business_id además de la RLS.
    const { error } = await supabase.from('spaces').delete().eq('id', id).eq('business_id', business.id)
    if (error) { toast.error('Error al eliminar el espacio'); return }
    setSpaces(prev => prev.filter(s => s.id !== id))
    // Sus filas de agenda_spaces caen por FK CASCADE en la DB; reflejarlo en el estado.
    setAgendaSpaces(prev => prev.filter(a => a.space_id !== id))
    toast.success('Espacio eliminado')
  }

  function isMapped(professionalId: string, spaceId: string) {
    return agendaSpaces.some(a => a.professional_id === professionalId && a.space_id === spaceId)
  }

  // Marca/desmarca el mapeo de una agenda a un espacio. Optimista con rollback en error.
  async function toggleAgendaSpace(professionalId: string, spaceId: string) {
    const mapped = isMapped(professionalId, spaceId)
    if (mapped) {
      // Optimista: quitar primero.
      setAgendaSpaces(prev => prev.filter(a => !(a.professional_id === professionalId && a.space_id === spaceId)))
      const { error } = await supabase
        .from('agenda_spaces')
        .delete()
        .eq('business_id', business.id)
        .eq('professional_id', professionalId)
        .eq('space_id', spaceId)
      if (error) {
        // Rollback: re-insertar la fila quitada.
        setAgendaSpaces(prev => [...prev, { business_id: business.id, professional_id: professionalId, space_id: spaceId }])
        toast.error('Error al actualizar el mapeo')
      }
    } else {
      const row: AgendaSpace = { business_id: business.id, professional_id: professionalId, space_id: spaceId }
      setAgendaSpaces(prev => [...prev, row])
      const { error } = await supabase.from('agenda_spaces').insert(row)
      if (error) {
        // Rollback: quitar la fila agregada.
        setAgendaSpaces(prev => prev.filter(a => !(a.professional_id === professionalId && a.space_id === spaceId)))
        toast.error('Error al actualizar el mapeo')
      }
    }
  }

  // ── Tab 4 — Locations ─────────────────────────────────────────────────────
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [newLocation, setNewLocation] = useState({ name: '', address: '', phone: '' })
  const [savingLocation, setSavingLocation] = useState(false)

  const activeLocations = locations.filter(l => l.is_active !== false)
  const canAddLocation = true // sucursales sin tope de plan

  async function addLocation() {
    if (!newLocation.name.trim()) return
    if (!canAddLocation) { toast.error('Límite del plan alcanzado'); return }
    setSavingLocation(true)
    const { data, error } = await supabase.from('locations').insert({
      business_id: business.id,
      name: newLocation.name.trim(),
      address: newLocation.address.trim() || null,
      phone: newLocation.phone.trim() || null,
      is_active: true,
    }).select().single()
    setSavingLocation(false)
    if (error) { toast.error('Error al agregar'); return }
    setLocations(prev => [...prev, data as Location])
    setNewLocation({ name: '', address: '', phone: '' })
    toast.success('Guardado')
  }

  const [delLoc, setDelLoc] = useState<Location | null>(null)
  async function deleteLocation(id: string) {
    // Mismo patrón que deleteService: NO optimista, error real + business_id. FK (23503) =
    // tiene turnos → bloqueamos y sugerimos desactivar (soft-disable vía is_active).
    const { error } = await supabase.from('locations').delete().eq('id', id).eq('business_id', business.id)
    if (error) {
      if (error.code === '23503') toast.error(`No se puede eliminar: el ${locWord} tiene turnos asociados. Desactivalo en vez de borrarlo.`)
      else toast.error('No se pudo eliminar')
      return
    }
    setLocations(prev => prev.filter(l => l.id !== id))
    toast.success('Eliminado')
  }
  // Soft-disable de locales (la columna en locations es is_active, NO active). El booking público
  // ya filtra is_active (app/[slug]/page.tsx) → un local desactivado deja de ofrecerse sin más.
  async function toggleLocation(id: string, is_active: boolean) {
    const { error } = await supabase.from('locations').update({ is_active }).eq('id', id).eq('business_id', business.id)
    if (error) { toast.error('Error al actualizar'); return }
    setLocations(prev => prev.map(l => l.id === id ? { ...l, is_active } : l))
    toast.success(is_active ? 'Activado' : 'Desactivado')
  }
  const [editLoc, setEditLoc] = useState<Location | null>(null)
  const [editLocForm, setEditLocForm] = useState({ name: '', address: '', phone: '' })
  const [savingEditLoc, setSavingEditLoc] = useState(false)
  function openEditLocation(l: Location) {
    setEditLoc(l)
    setEditLocForm({ name: l.name, address: l.address || '', phone: l.phone || '' })
  }
  async function saveEditLocation() {
    if (!editLoc || !editLocForm.name.trim()) return
    setSavingEditLoc(true)
    const payload = { name: editLocForm.name.trim(), address: editLocForm.address.trim() || null, phone: editLocForm.phone.trim() || null }
    const { error } = await supabase.from('locations').update(payload).eq('id', editLoc.id)
    setSavingEditLoc(false)
    if (error) { toast.error('Error al guardar'); return }
    setLocations(prev => prev.map(l => l.id === editLoc.id ? { ...l, ...payload } : l))
    setEditLoc(null)
    toast.success('Guardado')
  }

  // ── Tab 5 — Payments ──────────────────────────────────────────────────────
  // El valor crudo del token viene de secrets (business_secrets), no de business (D-05: el form
  // de edición del dueño puede mostrar SU valor; el secreto ya no vive en Business).
  const [mpToken, setMpToken] = useState(secrets.mp_access_token || '')
  const [showMpToken, setShowMpToken] = useState(false)
  const [savingMp, setSavingMp] = useState(false)
  // Conexión por MercadoPago Connect (OAuth): mp_user_id presente = conectado por botón.
  // mp_user_id NO es secreto → sigue en businesses.
  const mpConnected = !!business.mp_user_id
  // Pegar el token a mano: avanzado. Abierto si ya hay token manual (sin user_id de OAuth).
  const [mpManual, setMpManual] = useState(!!secrets.mp_access_token && !business.mp_user_id)
  const [disconnectingMp, setDisconnectingMp] = useState(false)
  async function disconnectMp() {
    setDisconnectingMp(true)
    const res = await fetch('/api/mercadopago/disconnect', { method: 'POST' })
    setDisconnectingMp(false)
    if (res.ok) { toast.success('MercadoPago desconectado'); router.refresh() }
    else toast.error('No se pudo desconectar')
  }

  const [depositForm, setDepositForm] = useState({
    require_deposit: business.require_deposit || false,
    deposit_amount: business.deposit_amount || 0,
    deposit_expiry_hours: business.deposit_expiry_hours || 1,
  })
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)

  // Ventana de reserva pública (BOOK-WINDOW-01). 3 modos mutuamente excluyentes (D-01): días de
  // anticipación (rolling) / sin límite / fecha exacta. El modo inicial se deriva de las columnas
  // que llegan por props: fecha fija tiene precedencia (espeja la del helper effectiveBookingCutoff).
  const [windowForm, setWindowForm] = useState<{ mode: 'dias' | 'sin_limite' | 'fecha'; days: number; date: string }>({
    mode: business.max_advance_date ? 'fecha' : (business.max_advance_days && business.max_advance_days > 0 ? 'dias' : 'sin_limite'),
    days: business.max_advance_days ?? 30,
    date: business.max_advance_date ?? '',
  })
  const [savingWindow, setSavingWindow] = useState(false)

  const [notifForm, setNotifForm] = useState({
    // notification_email NO es secreto → sigue en businesses. resend_* vienen de secrets (D-05).
    notification_email: business.notification_email || '',
    resend_api_key: secrets.resend_api_key || '',
    resend_from: secrets.resend_from || '',
  })
  const [showResendKey, setShowResendKey] = useState(false)
  const [savingNotif, setSavingNotif] = useState(false)
  // Avanzado: dominio propio de email (Resend). Abierto si ya tenían key cargada.
  const [ownDomain, setOwnDomain] = useState(!!secrets.resend_api_key)

  const [recaptchaForm, setRecaptchaForm] = useState({
    // recaptcha_site_key NO es secreto (se renderiza en el browser) → sigue en businesses.
    // recaptcha_secret_key viene de secrets (business_secrets), valor solo al dueño (D-05).
    recaptcha_site_key: business.recaptcha_site_key || '',
    recaptcha_secret_key: secrets.recaptcha_secret_key || '',
  })
  const [showRecaptchaSecret, setShowRecaptchaSecret] = useState(false)
  const [savingRecaptcha, setSavingRecaptcha] = useState(false)
  // Avanzado: cuenta propia de reCAPTCHA. Por defecto todos quedan protegidos con la
  // clave global de Forjo; esto es un override. Abierto si ya tenían key cargada.
  const [ownRecaptcha, setOwnRecaptcha] = useState(!!secrets.recaptcha_secret_key)

  async function saveMpToken() {
    setSavingMp(true)
    // El secreto va a business_secrets (upsert por business_id). El session client lo autoriza
    // la policy owner-only de business_secrets (Pitfall F).
    const { error } = await supabase
      .from('business_secrets')
      .upsert({ business_id: business.id, mp_access_token: mpToken || null }, { onConflict: 'business_id' })
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
  async function saveWindow() {
    // Pitfall 4: los 3 modos son mutuamente excluyentes en la DB — se escribe la columna del modo
    // activo y se nulea SIEMPRE la otra. Nunca dejar max_advance_days y max_advance_date seteadas a la vez.
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
    // Sin dominio propio → se limpian las claves de Resend (los emails vuelven a salir desde Forjo).
    // notification_email NO es secreto → businesses. resend_* (secretos) → business_secrets (Pitfall F).
    const { error: bizErr } = await supabase.from('businesses').update({
      notification_email: notifForm.notification_email || null,
    }).eq('id', business.id)
    const { error: secErr } = await supabase.from('business_secrets').upsert({
      business_id: business.id,
      resend_api_key: ownDomain ? (notifForm.resend_api_key || null) : null,
      resend_from: ownDomain ? (notifForm.resend_from || null) : null,
    }, { onConflict: 'business_id' })
    setSavingNotif(false)
    if (bizErr || secErr) toast.error('Error al guardar')
    else toast.success('Notificaciones guardadas')
  }
  async function saveRecaptcha() {
    setSavingRecaptcha(true)
    // Sin cuenta propia → se limpian las claves (queda la protección global de Forjo).
    // recaptcha_site_key es pública (se renderiza en el browser) → businesses.
    // recaptcha_secret_key es secreto → business_secrets (upsert owner RLS, Pitfall F).
    const { error: bizErr } = await supabase.from('businesses').update({
      recaptcha_site_key: ownRecaptcha ? (recaptchaForm.recaptcha_site_key || null) : null,
    }).eq('id', business.id)
    const { error: secErr } = await supabase.from('business_secrets').upsert({
      business_id: business.id,
      recaptcha_secret_key: ownRecaptcha ? (recaptchaForm.recaptcha_secret_key || null) : null,
    }, { onConflict: 'business_id' })
    setSavingRecaptcha(false)
    if (bizErr || secErr) toast.error('Error al guardar')
    else toast.success('Configuración anti-spam guardada')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <PageEyebrow label={isSection ? 'Gestión' : 'Ajustes'} />
        <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">
          {view === 'negocio' ? 'Negocio'
            : view === 'servicios' ? 'Servicios'
            : view === 'equipo' ? 'Equipo'
            : view === 'consultorios' ? term.locations
            : 'Configuración'}
        </h1>
      </div>

      <Tabs value={tabValue} onValueChange={onTabChange}>
        {/* TabsList del hub Negocio (NAV-02): Cobros·Integraciones·Notificaciones migraron acá desde
            Configuración. El label de la 4ª es literal "Notificaciones/Mails" (brief §3) aunque el
            value siga siendo 'notificaciones'. */}
        {isNegocio && (
          <TabsList className="grid grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap w-full lg:w-fit h-auto">
            <TabsTrigger value="business">Datos del negocio</TabsTrigger>
            <TabsTrigger value="cobros">Cobros</TabsTrigger>
            <TabsTrigger value="integraciones">Integraciones</TabsTrigger>
            <TabsTrigger value="notificaciones">Notificaciones/Mails</TabsTrigger>
          </TabsList>
        )}
        {/* TabsList de Configuración reducido a 3 (NAV-02): Cobros/Integraciones/Notificaciones se
            movieron al hub Negocio de arriba. */}
        {!isSection && (
          <TabsList className="grid grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap w-full lg:w-fit h-auto">
            <TabsTrigger value="appearance">Apariencia</TabsTrigger>
            <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
            <TabsTrigger value="suscripcion">Suscripción</TabsTrigger>
          </TabsList>
        )}

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

          {/* ── Panel del dashboard (widgets) ── */}
          <Card className="p-6 space-y-3 mt-4">
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
                <Label>Rubro</Label>
                <Select value={vertical} onValueChange={v => setVertical(v as VerticalKey)}>
                  {/* Base UI Select.Value muestra el value crudo (la VerticalKey); mapeamos a su label. */}
                  <SelectTrigger className="w-full"><SelectValue>{(v: string | null) => (v && v in VERTICALS ? VERTICALS[v as VerticalKey].label : 'Elegí tu rubro')}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(VERTICALS) as VerticalKey[]).map(k => (
                      <SelectItem key={k} value={k}>{VERTICALS[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground pt-0.5">
                  Rubro: <span className="text-foreground">{VERTICALS[vertical].label}</span>
                  {' · '}define el menú y los campos del panel.
                </p>
                <Label className="pt-2">¿A qué se dedica tu negocio?</Label>
                <Input
                  value={bizForm.type}
                  onChange={e => setBizForm(f => ({ ...f, type: e.target.value }))}
                  placeholder={RUBRO_PLACEHOLDERS[vertical]}
                />
                <p className="text-xs text-muted-foreground">Así aparecerá en tu página de reservas</p>
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
              <div className="space-y-1 sm:col-span-2">
                <Label>Link de Google Maps <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input
                  value={bizForm.maps_url}
                  onChange={e => setBizForm(f => ({ ...f, maps_url: e.target.value }))}
                  placeholder="https://maps.app.goo.gl/…"
                />
                <p className="text-xs text-muted-foreground pt-0.5">
                  Si lo pegás, los botones “Ver en el mapa” y “Cómo llegar” de la confirmación llevan exactamente a tu local. En Google Maps: buscá tu local → Compartir → Copiar vínculo.
                </p>
              </div>
            </div>
            <div className="pt-2">
              <Label className="text-muted-foreground text-xs">URL de tu página</Label>
              <p className="text-sm mt-1">{process.env.NEXT_PUBLIC_APP_URL}/{business.slug}</p>
            </div>
            <Button className="self-start" onClick={saveBusiness} disabled={savingBiz}>{savingBiz ? 'Guardando...' : 'Guardar cambios'}</Button>
          </Card>
        </TabsContent>

        {/* ── Services ── */}
        <TabsContent value="services" className="mt-4">
          {isCanchas ? (
            /* Vertical canchas (D-03): manager de canchas en lugar del CRUD genérico de services.
               Consume lib/canchas.ts (Plan 01) y comparte el estado de services/professionals/
               spaces/agendaSpaces para reconstruir la lista por service_id. */
            <CanchasManager
              business={business}
              supabase={supabase}
              services={services}
              setServices={setServices}
              professionals={professionals}
              setProfessionals={setProfessionals}
              spaces={spaces}
              setSpaces={setSpaces}
              agendaSpaces={agendaSpaces}
              setAgendaSpaces={setAgendaSpaces}
            />
          ) : (
          <>
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              {services.map(s => {
                const set = serviceLocSet(s)
                const all = set.length === 0
                return (
                  <div key={s.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium', !s.active && 'line-through text-muted-foreground')}>{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.duration_minutes}min · ${Number(s.price).toLocaleString('es-AR')}</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => toggleService(s.id, !s.active)}>
                        {s.active ? 'Desactivar' : 'Activar'}
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8" onClick={() => openEditService(s)} aria-label={`Editar ${s.name}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => setDelService(s)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {activeLocations.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground mr-0.5">Se ofrece en:</span>
                        <button type="button" onClick={() => setServiceLocations(s.id, [])} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', all ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>Todos</button>
                        {activeLocations.map(l => (
                          <button key={l.id} type="button" onClick={() => toggleServiceLocation(s, l.id)} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', !all && set.includes(l.id) ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>{l.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
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
              {activeLocations.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Se ofrece en</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setNewService(f => ({ ...f, location_ids: [] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', newService.location_ids.length === 0 ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>Todos</button>
                    {activeLocations.map(l => {
                      const on = newService.location_ids.includes(l.id)
                      return (
                        <button key={l.id} type="button" onClick={() => setNewService(f => ({ ...f, location_ids: on ? f.location_ids.filter(x => x !== l.id) : [...f.location_ids, l.id] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>{l.name}</button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Editar servicio (reusa el form de alta: nombre, min, precio, consultorios).
              Los chips espejan el alta; usa el cliente browser directo (sin server actions). */}
          <Dialog open={!!editSvc} onOpenChange={open => { if (!open) setEditSvc(null) }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Editar servicio</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre</Label>
                  <Input value={editSvcForm.name} onChange={e => setEditSvcForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Min.</Label>
                    <Input type="number" value={editSvcForm.duration_minutes} onChange={e => setEditSvcForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))} min={5} step={5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Precio</Label>
                    <Input type="number" value={editSvcForm.price} onChange={e => setEditSvcForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} min={0} step={100} />
                  </div>
                </div>
                {activeLocations.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Se ofrece en</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => setEditSvcForm(f => ({ ...f, location_ids: [] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', editSvcForm.location_ids.length === 0 ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>Todos</button>
                      {activeLocations.map(l => {
                        const on = editSvcForm.location_ids.includes(l.id)
                        return (
                          <button key={l.id} type="button" onClick={() => setEditSvcForm(f => ({ ...f, location_ids: on ? f.location_ids.filter(x => x !== l.id) : [...f.location_ids, l.id] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>{l.name}</button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              <Button onClick={saveEditService} disabled={savingEditSvc || !editSvcForm.name.trim()}>{savingEditSvc ? 'Guardando...' : 'Guardar'}</Button>
            </DialogContent>
          </Dialog>
          </>
          )}
        </TabsContent>

        {/* ── Professionals ── */}
        <TabsContent value="professionals" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Profesionales del equipo</p>
              <span className="text-xs bg-secondary px-2 py-1 rounded-full text-muted-foreground">
                {planConfig.name} · {professionals.filter(p => p.active).length}/{planConfig.max_agendas}
              </span>
            </div>
            <div className="space-y-2">
              {professionals.map(p => {
                const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
                const sub = [p.specialty, p.license_number].filter(Boolean).join(' · ')
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
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
                <div className="flex items-center gap-3">
                  {newProPhotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={newProPhotoPreview} alt="" className="w-12 h-12 rounded-full object-cover border border-border flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <label className="inline-flex items-center h-7 px-2.5 rounded-md border border-border text-xs font-medium cursor-pointer hover:border-primary hover:text-primary transition-colors">
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) selectNewProPhoto(f); e.target.value = '' }} />
                    {newProPhoto ? 'Cambiar foto' : 'Foto (opcional)'}
                  </label>
                  {newProPhoto && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearNewProPhoto}>Quitar</Button>
                  )}
                </div>
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

          {/* ── Espacios físicos + mapeo agenda→espacios (motor-reservas / espacio compartido) ──
               Vive dentro de la tab de Equipo (D-04, sin pantalla nueva). El alta de espacios y el
               mapeo escriben spaces/agenda_spaces por el browser client con RLS. El término del eje
               ('Cancha'/'Profesional') se nombra por rubro. */}
          <Card className="p-6 space-y-4 mt-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Espacios físicos compartidos</p>
              <p className="text-xs text-muted-foreground">
                Un espacio físico es un lugar real que se comparte entre varias {resourcesWord.toLowerCase()}
                {' '}—una sala, un sector de cancha, un equipo—. Reservar en una bloquea a las demás que comparten
                ese espacio en el mismo horario. Ejemplo: una cancha de fútbol 11 partida en 3 cruzadas → creás
                3 espacios (A, B y C); la cancha grande ocupa los tres.
              </p>
            </div>

            {spaces.length > 0 && (
              <div className="space-y-2">
                {spaces.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <p className="flex-1 min-w-0 text-sm truncate">{s.name}</p>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => deleteSpace(s.id)} aria-label={`Eliminar espacio ${s.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium">Agregar espacio</p>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="new-space-name">Nombre del espacio</Label>
                  <Input
                    id="new-space-name"
                    value={newSpaceName}
                    onChange={e => setNewSpaceName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpace() } }}
                    placeholder="Sala 1, Sector A, Equipo de pilates…"
                  />
                </div>
                <Button onClick={addSpace} disabled={savingSpace || !newSpaceName.trim()} className="gap-1">
                  <Plus className="w-4 h-4" /> {savingSpace ? 'Agregando...' : 'Agregar'}
                </Button>
              </div>
            </div>

            {/* Mapeo agenda→espacios: por cada agenda, qué espacios ocupa (checkbox por espacio).
                Si todavía no hay agendas reales, mostramos una línea guía en vez de ocultar el bloque. */}
            {spaces.length > 0 && (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Qué espacios ocupa cada {resourceWord.toLowerCase()}</p>
                  <p className="text-xs text-muted-foreground">
                    Marcá los espacios que ocupa cada {resourceWord.toLowerCase()}; al reservarse bloquea a las
                    demás que compartan alguno.
                  </p>
                </div>
                {professionals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Primero agregá tus {resourcesWord.toLowerCase()} más arriba; después vas a poder marcar qué
                    espacios ocupa cada una.
                  </p>
                ) : (
                <div className="space-y-2">
                  {professionals.map(p => {
                    const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
                    return (
                      <div key={p.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
                        <p className="text-sm font-medium truncate">{fullName}</p>
                        <div className="flex flex-wrap gap-2">
                          {spaces.map(s => {
                            const checked = isMapped(p.id, s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleAgendaSpace(p.id, s.id)}
                                aria-pressed={checked}
                                className={cn(
                                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
                                  checked
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary hover:text-primary',
                                )}
                              >
                                {checked && <Check className="w-3.5 h-3.5" />}
                                {s.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Locations ── */}
        <TabsContent value="locations" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{term.locations}</p>
              <span className="text-xs bg-secondary px-2 py-1 rounded-full text-muted-foreground">
                {planConfig.name} · {activeLocations.length}
              </span>
            </div>
            <div className="space-y-2">
              {locations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Todavía no agregaste {term.locations.toLowerCase()}</p>
              )}
              {locations.map(loc => (
                <div key={loc.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', loc.is_active === false && 'line-through text-muted-foreground')}>{loc.name}</p>
                    {(loc.address || loc.phone) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[loc.address, loc.phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground flex-shrink-0" onClick={() => toggleLocation(loc.id, loc.is_active === false)}>
                    {loc.is_active === false ? 'Activar' : 'Desactivar'}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 flex-shrink-0" onClick={() => openEditLocation(loc)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0" onClick={() => setDelLoc(loc)}>
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
                <p className="text-sm font-medium">Agregar {locWord}</p>
                <div className="space-y-2">
                  <Input value={newLocation.name} onChange={e => setNewLocation(f => ({ ...f, name: e.target.value }))} placeholder="Nombre *" />
                  <Input value={newLocation.address} onChange={e => setNewLocation(f => ({ ...f, address: e.target.value }))} placeholder="Dirección (opcional)" />
                  <Input value={newLocation.phone} onChange={e => setNewLocation(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono (opcional)" />
                </div>
                <Button onClick={addLocation} disabled={savingLocation} className="gap-1">
                  <Plus className="w-4 h-4" /> {savingLocation ? 'Guardando...' : `Agregar ${locWord}`}
                </Button>
              </div>
            )}
          </Card>

          <Dialog open={!!editLoc} onOpenChange={open => { if (!open) setEditLoc(null) }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Editar {locWord}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Input value={editLocForm.name} onChange={e => setEditLocForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre *" />
                <Input value={editLocForm.address} onChange={e => setEditLocForm(f => ({ ...f, address: e.target.value }))} placeholder="Dirección (opcional)" />
                <Input value={editLocForm.phone} onChange={e => setEditLocForm(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono (opcional)" />
              </div>
              <Button onClick={saveEditLocation} disabled={savingEditLoc}>{savingEditLoc ? 'Guardando...' : 'Guardar'}</Button>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ── Payments ── */}
        {/* ── Cobros (seña) ── */}
        <TabsContent value="cobros" className="mt-4 space-y-4">
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
        </TabsContent>

        {/* ── Integraciones (MercadoPago) ── */}
        <TabsContent value="integraciones" className="mt-4 space-y-4">
          {/* MercadoPago */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">MercadoPago</p>
              <p className="text-xs text-muted-foreground mt-0.5">Conectá tu cuenta para cobrar las señas de los turnos.</p>
            </div>

            {mpConnectEnabled && (
              mpConnected ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> Conectado {business.mp_user_id ? <span className="text-foreground">· cuenta #{business.mp_user_id}</span> : null}
                  </p>
                  <Button variant="outline" size="sm" onClick={disconnectMp} disabled={disconnectingMp}>
                    {disconnectingMp ? 'Desconectando...' : 'Desconectar'}
                  </Button>
                </div>
              ) : (
                <Button onClick={() => { window.location.href = '/api/mercadopago/connect' }}>Conectar con MercadoPago</Button>
              )
            )}

            {/* Pegar el Access Token a mano (avanzado / fallback si no usás Connect) */}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={mpManual} onChange={e => setMpManual(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Pegar el Access Token a mano <span className="text-muted-foreground text-xs">(avanzado)</span>
            </label>
            {mpManual && (
              <div className="space-y-3 border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">Lo encontrás en mercadopago.com.ar → Tu negocio → Credenciales.</p>
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
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Notificaciones ── */}
        <TabsContent value="notificaciones" className="mt-4 space-y-4">
          {/* Notificaciones */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">Notificaciones por email</p>
              <p className="text-xs text-muted-foreground mt-0.5">Dónde recibís los avisos de turnos nuevos y cancelaciones. Los emails salen desde Forjo Studio.</p>
            </div>
            <div className="space-y-1">
              <Label>Email para recibir notificaciones</Label>
              <Input type="email" value={notifForm.notification_email} onChange={e => setNotifForm(f => ({ ...f, notification_email: e.target.value }))} placeholder="vos@tudominio.com" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={ownDomain} onChange={e => setOwnDomain(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Enviar los emails desde mi propio dominio <span className="text-muted-foreground text-xs">(avanzado)</span>
            </label>
            {ownDomain && (
              <div className="space-y-4 border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">Creá tu cuenta gratis en resend.com, verificá tu dominio y pegá la API Key. Así los mails salen desde tu dominio en vez de Forjo Studio.</p>
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
                  <Label>Email remitente</Label>
                  <Input type="email" value={notifForm.resend_from} onChange={e => setNotifForm(f => ({ ...f, resend_from: e.target.value }))} placeholder="turnos@tudominio.com" />
                  <p className="text-xs text-muted-foreground">Debe ser de un dominio verificado en tu cuenta de Resend.</p>
                </div>
              </div>
            )}
            <Button onClick={saveNotif} disabled={savingNotif}>{savingNotif ? 'Guardando...' : 'Guardar'}</Button>
          </Card>
        </TabsContent>

        {/* ── Seguridad (anti-spam) ── */}
        <TabsContent value="seguridad" className="mt-4 space-y-4">
          {/* Anti-spam */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">Verificación anti-spam</p>
              <p className="text-xs text-muted-foreground mt-0.5">Tus reservas ya están protegidas con reCAPTCHA por defecto. No tenés que configurar nada.</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={ownRecaptcha} onChange={e => setOwnRecaptcha(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Usar mi propia cuenta de reCAPTCHA <span className="text-muted-foreground text-xs">(avanzado)</span>
            </label>
            {ownRecaptcha && (
              <div className="space-y-4 border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">Creá tu cuenta en google.com/recaptcha → v3 → tu dominio.</p>
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
              </div>
            )}
            <Button onClick={saveRecaptcha} disabled={savingRecaptcha}>{savingRecaptcha ? 'Guardando...' : 'Guardar'}</Button>
          </Card>
        </TabsContent>

        {/* ── Suscripción ── */}
        <TabsContent value="suscripcion" className="mt-4 space-y-4">
          {(business.plan_status === 'active' || business.plan_status === 'cancelled') ? (
            <Card className="p-6 space-y-4">
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
          ) : (
            <Card className="p-6 space-y-3">
              <p className="font-semibold text-sm">Tu suscripción</p>
              <p className="text-sm text-muted-foreground">Plan actual: <span className="font-medium text-foreground">{planConfig.name}</span></p>
              <Button variant="outline" size="sm" onClick={() => setPlanModalOpen(true)}>Ver planes</Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Segundo acceso a la ayuda (HELP-01 / D-07): navegación interna del dashboard hacia la guía
          estática. Se muestra solo en Configuración (no en los hubs Negocio/Servicios/etc.). */}
      {!isSection && (
        <Link
          href="/ayuda"
          className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded"
        >
          ¿Necesitás ayuda? Ver la guía
        </Link>
      )}

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
          {/* Foto del profesional — se muestra en la página pública de reservas */}
          <div className="flex items-center gap-4">
            {editingPro?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={editingPro.photo_url} alt={editingPro.name} className="w-16 h-16 rounded-full object-cover border border-border flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-semibold flex-shrink-0">
                {(editPro.name.charAt(0) || '?').toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium">Foto del profesional</p>
              <p className="text-[11px] text-muted-foreground">Se muestra en tu página pública. JPG, PNG o WebP · máx 2MB.</p>
              <div className="flex items-center gap-2 pt-2">
                <label className={cn(
                  'inline-flex items-center h-7 px-2.5 rounded-md border border-border text-xs font-medium cursor-pointer hover:border-primary hover:text-primary transition-colors',
                  uploadingProPhoto && 'opacity-60 pointer-events-none'
                )}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingProPhoto}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadProPhoto(f); e.target.value = '' }}
                  />
                  {uploadingProPhoto ? 'Subiendo...' : (editingPro?.photo_url ? 'Cambiar' : 'Subir foto')}
                </label>
                {editingPro?.photo_url && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={removeProPhoto}>Quitar</Button>
                )}
              </div>
            </div>
          </div>
          <ProFields value={editPro} onChange={setEditPro} labels={proLabels} showExtra />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingPro(null)}>Cancelar</Button>
            <Button onClick={saveEditPro} disabled={savingEditPro || !editPro.name.trim()}>
              {savingEditPro ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado (servicio / consultorio). El ConfirmDialog usa el cliente browser
          de Supabase directo (NO server actions, NO redirect) → sin toast espurio de NEXT_REDIRECT.
          Ante FK (turnos asociados) deleteService/deleteLocation muestran su toast y NO filtran el
          item: el dialog se cierra pero la fila sigue en la lista. */}
      <ConfirmDialog
        open={!!delService}
        onOpenChange={(o) => { if (!o) setDelService(null) }}
        title="¿Eliminar servicio?"
        description={delService ? `Vas a eliminar "${delService.name}". Esta acción no se puede deshacer.` : undefined}
        risk="alto"
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => { if (delService) { await deleteService(delService.id); setDelService(null) } }}
      />
      <ConfirmDialog
        open={!!delLoc}
        onOpenChange={(o) => { if (!o) setDelLoc(null) }}
        title={`¿Eliminar ${locWord}?`}
        description={delLoc ? `Vas a eliminar "${delLoc.name}". Esta acción no se puede deshacer.` : undefined}
        risk="alto"
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => { if (delLoc) { await deleteLocation(delLoc.id); setDelLoc(null) } }}
      />
    </div>
  )
}
