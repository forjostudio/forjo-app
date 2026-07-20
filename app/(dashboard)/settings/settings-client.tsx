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
import { Plus, Trash2, Clock, DollarSign, Eye, EyeOff, ImageIcon, Check, Sun, Moon, Pencil, MapPin, TriangleAlert, CalendarClock, RefreshCw } from 'lucide-react'
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
  // Google Calendar (mismo estado/conexión que el control de la Agenda): presencia del refresh_token
  // (booleano, nunca el token) + si la integración está configurada. Se leen server-side en negocio/page.
  googleEnabled?: boolean
  googleConnected?: boolean
  // Email del dueño (sesión) para autocargar el campo de notificaciones cuando aún no hay uno seteado.
  ownerEmail?: string | null
  // Qué mostrar: 'config' = pestañas de Configuración; el resto = una sección suelta (sidebar).
  view?: SettingsView
}

// Isotipo oficial de MercadoPago (SVG inline decorativo, aria-hidden — el nombre accesible lo da el
// texto de la card). Recortado del logo horizontal oficial al handshake (sin el wordmark, que sería
// redundante con el título "MercadoPago"). El repo no usa paquetes de íconos de marca (patrón google-button).
function MpLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="128 110 292 205" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#00bcff" d="m274.38,116.94c-77.83,0-140.91,40.36-140.91,90.15s63.09,94.05,140.91,94.05,140.91-44.27,140.91-94.05-63.09-90.15-140.91-90.15Z"/>
      <path fill="#fff" d="m228.53,179.22c-.07.14-1.45,1.56-.55,2.71,2.18,2.78,8.91,4.38,15.72,2.85,4.05-.91,9.25-5.04,14.28-9.03,5.45-4.33,10.86-8.67,16.3-10.39,5.76-1.83,9.45-1.05,11.89-.31,2.67.8,5.82,2.56,10.84,6.32,9.45,7.1,47.43,40.26,54,45.99,5.28-2.39,30.47-12.56,62.39-19.6-2.78-17.02-13.01-33.25-28.72-45.99-21.89,9.19-50.42,14.7-76.58,1.93-.13-.05-14.29-6.75-28.25-6.42-20.75.48-29.74,9.46-39.25,18.97l-12.05,12.99Z"/>
      <path fill="#fff" d="m349.44,220.97c-.45-.4-44.67-39.09-54.69-46.62-5.8-4.35-9.02-5.46-12.41-5.89-1.76-.23-4.2.1-5.9.57-4.66,1.27-10.75,5.34-16.16,9.63-5.6,4.46-10.88,8.66-15.79,9.76-6.26,1.4-13.91-.25-17.4-2.61-1.41-.95-2.41-2.05-2.89-3.16-1.29-2.99,1.09-5.38,1.48-5.78l12.2-13.2c1.42-1.41,2.85-2.83,4.31-4.23-3.94.51-7.58,1.52-11.12,2.5-4.42,1.24-8.68,2.42-12.98,2.42-1.8,0-11.42-1.58-13.25-2.07-11.05-3.02-23.56-5.97-38.04-12.73-17.35,12.91-28.65,28.77-32,46.56,2.49.66,9.02,2.15,10.71,2.52,39.26,8.73,51.49,17.72,53.71,19.6,2.4-2.67,5.87-4.36,9.73-4.36,4.35,0,8.26,2.19,10.64,5.56,2.25-1.78,5.35-3.3,9.36-3.29,1.82,0,3.71.34,5.62.98,4.43,1.52,6.72,4.47,7.9,7.14,1.48-.67,3.31-1.17,5.46-1.16,2.12,0,4.32.48,6.53,1.44,7.24,3.11,8.36,10.22,7.71,15.58.52-.06,1.04-.08,1.56-.08,8.58,0,15.56,6.98,15.56,15.57,0,2.66-.68,5.16-1.86,7.35,2.34,1.31,8.29,4.28,13.52,3.62,4.17-.53,5.76-1.95,6.32-2.76.39-.55.8-1.2.42-1.66l-11.08-12.3s-1.82-1.73-1.22-2.39c.62-.68,1.75.3,2.55.96,5.64,4.71,12.52,11.81,12.52,11.81.12.08.57.98,3.12,1.43,2.19.39,6.07.17,8.76-2.04.67-.56,1.35-1.25,1.93-1.97-.05.04-.09.08-.13.1,2.84-3.63-.32-7.29-.32-7.29l-12.93-14.52s-1.85-1.71-1.22-2.4c.56-.6,1.75.3,2.56.98,4.09,3.42,9.88,9.23,15.42,14.66,1.09.79,5.96,3.8,12.41-.43,3.92-2.57,4.7-5.73,4.59-8.1-.27-3.15-2.73-5.4-2.73-5.4l-17.66-17.76s-1.87-1.59-1.21-2.4c.54-.68,1.75.3,2.55.96,5.62,4.71,20.86,18.68,20.86,18.68.22.15,5.48,3.9,11.99-.24,2.33-1.49,3.81-3.73,3.94-6.34.22-4.52-2.96-7.2-2.96-7.2Z"/>
      <path fill="#fff" d="m263.76,243.48c-2.74-.03-5.74,1.6-6.13,1.36-.22-.14.17-1.24.42-1.88.27-.63,3.87-11.48-4.92-15.25-6.73-2.89-10.85.36-12.26,1.83-.37.38-.54.35-.58-.13-.14-1.96-1.01-7.24-6.82-9.02-8.3-2.54-13.64,3.25-14.99,5.35-.61-4.73-4.61-8.4-9.5-8.41-5.32,0-9.64,4.3-9.65,9.63,0,5.32,4.31,9.64,9.64,9.64,2.59,0,4.93-1.03,6.66-2.69.06.05.08.14.05.32-.41,2.39-1.15,11.04,7.92,14.57,3.64,1.41,6.73.36,9.29-1.43.76-.54.89-.31.78.41-.33,2.23.09,6.99,6.77,9.7,5.08,2.07,8.09-.04,10.07-1.87.86-.78,1.09-.65,1.14.56.24,6.44,5.59,11.56,12.09,11.57,6.7,0,12.13-5.41,12.13-12.1,0-6.7-5.42-12.06-12.12-12.13Z"/>
      <path fill="#0a0080" d="m274.35,113.21c-79.31,0-143.6,42.18-143.6,93.92,0,1.34-.02,5.03-.02,5.5,0,54.9,56.19,99.35,143.6,99.35s143.61-44.45,143.61-99.34v-5.51c0-51.74-64.29-93.92-143.59-93.92Zm137.12,83.51c-31.21,6.94-54.49,17.01-60.32,19.61-13.62-11.89-45.1-39.26-53.63-45.66-4.87-3.67-8.2-5.6-11.12-6.47-1.31-.4-3.12-.85-5.45-.85-2.17,0-4.5.39-6.93,1.17-5.51,1.75-11,6.11-16.31,10.33l-.27.22c-4.95,3.93-10.06,8-13.93,8.86-1.69.38-3.43.58-5.16.58-4.34,0-8.23-1.26-9.69-3.12-.24-.31-.08-.81.48-1.52l.07-.1,11.99-12.91c9.39-9.39,18.25-18.25,38.66-18.72.34-.01.68-.02,1.02-.02,12.7.01,25.4,5.69,26.83,6.36,11.91,5.81,24.21,8.76,36.56,8.77,12.85,0,26.11-3.17,40.05-9.58,14.56,12.24,24.21,26.99,27.15,43.06Zm-137.1-77.97c42.1,0,79.76,12.07,105.09,31.07-12.24,5.3-23.91,7.97-35.17,7.97-11.52-.01-23.03-2.78-34.21-8.23-.59-.28-14.61-6.89-29.2-6.9-.38,0-.77,0-1.15.01-17.14.4-26.8,6.49-33.29,11.82-6.31.16-11.76,1.68-16.61,3.03-4.33,1.2-8.06,2.24-11.7,2.24-1.5,0-4.2-.14-4.44-.15-4.18-.13-25.18-5.28-41.95-11.61,25.27-17.96,61.89-29.26,102.64-29.26Zm-107.61,33.01c17.51,7.16,38.76,12.7,45.48,13.13,1.87.12,3.87.34,5.87.34,4.46,0,8.91-1.25,13.21-2.45,2.54-.71,5.35-1.49,8.3-2.05-.79.77-1.58,1.56-2.37,2.35l-12.17,13.17c-.96.97-3.04,3.55-1.67,6.73.54,1.28,1.65,2.51,3.2,3.55,2.9,1.95,8.1,3.28,12.92,3.28,1.83,0,3.57-.18,5.15-.54,5.11-1.14,10.46-5.41,16.13-9.92,4.52-3.59,10.94-8.15,15.86-9.49,1.38-.37,3.06-.61,4.42-.61.41,0,.79.02,1.14.07,3.24.41,6.38,1.51,11.99,5.72,10,7.51,54.22,46.2,54.65,46.58.03.02,2.85,2.46,2.65,6.5-.11,2.26-1.36,4.26-3.54,5.65-1.89,1.2-3.83,1.81-5.8,1.81-2.96,0-4.99-1.39-5.13-1.48-.16-.13-15.31-14.03-20.89-18.7-.89-.74-1.75-1.4-2.62-1.4-.47,0-.88.2-1.16.55-.88,1.08.1,2.58,1.26,3.56l17.7,17.8s2.21,2.06,2.45,4.79c.14,2.95-1.27,5.42-4.2,7.34-2.09,1.38-4.2,2.07-6.27,2.07-2.72,0-4.63-1.24-5.05-1.53l-2.54-2.5c-4.64-4.57-9.43-9.29-12.94-12.21-.86-.71-1.77-1.37-2.64-1.37-.43,0-.82.16-1.12.48-.4.44-.68,1.24.32,2.57.4.55.89,1,.89,1l12.91,14.51c.1.13,2.66,3.17.29,6.19l-.46.58c-.39.42-.8.82-1.2,1.16-2.2,1.81-5.14,2-6.31,2-.63,0-1.22-.05-1.75-.15-1.27-.23-2.13-.58-2.55-1.07l-.16-.16c-.7-.73-7.21-7.38-12.6-11.87-.71-.6-1.6-1.34-2.51-1.34-.45,0-.85.18-1.17.52-1.06,1.17.54,2.91,1.22,3.55l11.01,12.15c-.01.11-.15.36-.41.74-.4.55-1.73,1.88-5.73,2.38-.48.06-.98.09-1.46.09-4.12,0-8.52-2-10.79-3.2,1.03-2.18,1.57-4.58,1.57-6.98,0-9.07-7.36-16.44-16.43-16.45-.19,0-.4,0-.59.01.29-4.14-.29-11.98-8.34-15.43-2.32-1-4.63-1.52-6.87-1.52-1.76,0-3.45.3-5.04.91-1.67-3.24-4.44-5.6-8.04-6.83-2-.69-3.98-1.04-5.9-1.04-3.35,0-6.44.99-9.19,2.94-2.64-3.28-6.62-5.22-10.81-5.22-3.67,0-7.2,1.47-9.81,4.06-3.43-2.62-17.03-11.26-53.44-19.53-1.74-.39-5.69-1.52-8.17-2.25,3.41-16.34,13.8-31.27,29.2-43.52Zm67.54,94.78l-.39-.35h-.4c-.32,0-.66.13-1.11.45-1.86,1.31-3.63,1.94-5.44,1.94-1,0-2.02-.2-3.04-.59-8.44-3.29-7.78-11.25-7.36-13.65.06-.49-.06-.86-.37-1.12l-.6-.49-.56.53c-1.65,1.59-3.8,2.45-6.06,2.45-4.83,0-8.77-3.93-8.76-8.77,0-4.83,3.94-8.76,8.78-8.75,4.37,0,8.09,3.28,8.64,7.65l.3,2.35,1.29-1.99c.14-.23,3.69-5.59,10.2-5.58,1.24,0,2.52.2,3.81.6,5.19,1.58,6.07,6.29,6.2,8.25.09,1.14.91,1.2,1.06,1.2.45,0,.78-.28,1.01-.53.98-1.02,3.11-2.72,6.45-2.72,1.53,0,3.15.37,4.83,1.09,8.25,3.54,4.51,14.02,4.47,14.13-.71,1.74-.74,2.5-.07,2.95l.32.15h.24c.37,0,.83-.16,1.6-.42,1.12-.39,2.81-.97,4.4-.97h0c6.21.07,11.26,5.13,11.26,11.26,0,6.2-5.06,11.24-11.27,11.24-6.07,0-11.01-4.73-11.23-10.74-.02-.52-.07-1.88-1.23-1.88-.47,0-.89.29-1.36.72-1.34,1.24-3.04,2.49-5.52,2.49-1.13,0-2.35-.26-3.64-.79-6.41-2.6-6.5-7-6.24-8.77.07-.47.09-.96-.23-1.35Zm40.07,48.88c-76.26,0-138.08-39.55-138.08-88.33,0-1.96.14-3.91.33-5.84.61.15,6.67,1.59,7.92,1.88,37.19,8.26,49.48,16.85,51.56,18.48-.7,1.69-1.07,3.51-1.07,5.35,0,7.69,6.25,13.95,13.93,13.95.86,0,1.72-.08,2.56-.24,1.16,5.66,4.86,9.95,10.51,12.15,1.65.63,3.32.96,4.97.96,1.06,0,2.13-.13,3.17-.39,1.05,2.65,3.39,5.96,8.65,8.09,1.84.74,3.68,1.13,5.47,1.13,1.46,0,2.89-.26,4.25-.76,2.52,6.13,8.51,10.2,15.19,10.2,4.43,0,8.68-1.8,11.78-4.99,2.65,1.48,8.25,4.15,13.91,4.16.73,0,1.41-.05,2.11-.13,5.62-.71,8.23-2.91,9.43-4.62.22-.3.41-.62.58-.95,1.32.38,2.78.69,4.46.7,3.07,0,6.01-1.05,8.99-3.21,2.93-2.11,5.01-5.14,5.31-7.72,0-.03,0-.07.01-.11.99.2,2,.3,3.01.3,2.96,0,5.88-.89,8.65-2.66,3.55-2.27,5.69-5.75,6.02-9.79.21-2.75-.47-5.53-1.91-7.91,9.58-4.13,31.48-12.12,57.27-17.93.11,1.46.17,2.93.17,4.41,0,48.78-61.82,88.33-138.07,88.33Z"/>
    </svg>
  )
}

export function SettingsClient({ business, secrets = EMPTY_SECRETS, initialServices, initialProfessionals, initialLocations, initialSpaces = [], initialAgendaSpaces = [], mpConnectEnabled, googleEnabled = false, googleConnected = false, ownerEmail = null, view = 'config' }: Props) {
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
  // Conectado sano SOLO si hay cuenta OAuth y el flag no está caído (D-01).
  const mpConnected = !!business.mp_user_id && business.mp_connection_status !== 'error'
  // La cuenta estuvo conectada por OAuth y se cayó (Phase 1 dejó el flag en 'error').
  const mpConnectionError = !!business.mp_user_id && business.mp_connection_status === 'error'
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

  // ── Google Calendar (misma conexión que el control de la Agenda) ──────────────
  // Comparte los endpoints /api/google/* → conectar/desconectar/sincronizar acá refleja lo mismo
  // que en la Agenda (el token vive en business_secrets, keyed por business_id). Conectar hace un
  // full redirect al OAuth de Google, cuyo callback vuelve a /agenda (hardcodeado).
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
      if (res.ok) toast.success('Turnos sincronizados con Google Calendar')
      else toast.error('No se pudo sincronizar')
    } finally {
      setSyncingGoogle(false)
    }
  }

  const [depositForm, setDepositForm] = useState({
    require_deposit: business.require_deposit || false,
    deposit_amount: business.deposit_amount || 0,
    deposit_expiry_hours: business.deposit_expiry_hours || 1,
  })
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)

  const [notifForm, setNotifForm] = useState({
    // notification_email NO es secreto → sigue en businesses. resend_* vienen de secrets (D-05).
    // Autocarga: si el negocio todavía no seteó un email, precargamos el del dueño (sesión) como
    // fallback — no pisa un valor ya guardado.
    notification_email: business.notification_email || ownerEmail || '',
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
          <TabsList className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:flex lg:flex-wrap w-full lg:w-fit h-auto">
            <TabsTrigger value="business" className="py-1.5">Datos del negocio</TabsTrigger>
            <TabsTrigger value="cobros" className="py-1.5">Cobros</TabsTrigger>
            <TabsTrigger value="integraciones" className="py-1.5">Integraciones</TabsTrigger>
            <TabsTrigger value="notificaciones" className="py-1.5">Notificaciones/Mails</TabsTrigger>
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
              <div className="flex items-center gap-2">
                <MpLogo className="h-5 w-auto" />
                <p className="font-semibold text-sm">MercadoPago</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Conectá tu cuenta para cobrar las señas de los turnos.</p>
            </div>

            {mpConnectEnabled && (
              mpConnected ? (
                // Estado sano (D-09): "Conectado" limpio, sin el número de cuenta.
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> Conectado
                  </p>
                  <Button variant="outline" size="sm" onClick={disconnectMp} disabled={disconnectingMp}>
                    {disconnectingMp ? 'Desconectando...' : 'Desconectar'}
                  </Button>
                </div>
              ) : mpConnectionError ? (
                // Estado caído (D-02/03/04): aviso ámbar recuperable + Reconectar (reusa el OAuth existente).
                <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 space-y-3">
                  <p className="text-sm font-medium text-warning flex items-start gap-2">
                    <TriangleAlert aria-hidden="true" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    Tu conexión con MercadoPago se interrumpió, reconectá tu cuenta para seguir cobrando señas.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => { window.location.href = '/api/mercadopago/connect' }}>Reconectar</Button>
                    <Button variant="outline" size="sm" onClick={disconnectMp} disabled={disconnectingMp}>
                      {disconnectingMp ? 'Desconectando...' : 'Desconectar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => { window.location.href = '/api/mercadopago/connect' }}>
                  <MpLogo className="h-4 w-auto" />
                  Conectar con MercadoPago
                </Button>
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

          {/* Google Calendar — misma conexión/estado que el control de la Agenda (endpoints /api/google/*).
              Conectar/desconectar/sincronizar acá refleja lo mismo que allá. */}
          {googleEnabled && (
            <Card className="p-6 space-y-4">
              <div>
                <p className="font-semibold text-sm">Google Calendar</p>
                <p className="text-xs text-muted-foreground mt-0.5">Sincronizá los turnos con tu Google Calendar. Es la misma conexión que ves en la Agenda.</p>
              </div>
              {googleConnected ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> Conectado
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={syncGoogle} disabled={syncingGoogle}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncingGoogle ? 'animate-spin' : ''}`} />
                      {syncingGoogle ? 'Sincronizando...' : 'Sincronizar'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={disconnectGoogle} disabled={disconnectingGoogle}>
                      {disconnectingGoogle ? 'Desconectando...' : 'Desconectar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => { window.location.href = '/api/google/connect' }}>
                  <CalendarClock className="w-4 h-4 mr-1.5" /> Conectar Google Calendar
                </Button>
              )}
            </Card>
          )}
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
