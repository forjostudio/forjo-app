export interface Business {
  id: string
  owner_id: string
  slug: string
  name: string
  type: string | null
  vertical?: string | null
  // Subconjunto de widgets del dashboard a mostrar (null = todos). Ver lib/dashboard-widgets.
  dashboard_widgets?: string[] | null
  // Estilo visual de marca. Tiñen panel y página pública (data-theme/palette/font).
  // theme: forjo|modern|spa|cyber · font: auto|geometrica|bauhaus|elegante|tech|suave
  // palette: depende del theme (ver lib/theme-config). Default Forjo: red.
  palette?: string | null
  theme?: string | null
  font?: string | null
  logo_url: string | null
  primary_color: string
  // Contacto del negocio: WhatsApp normalizado a formato wa.me (ver lib/whatsapp).
  whatsapp: string | null
  address: string | null
  // Link de Google Maps del local (opcional). Si está, los botones de mapa de la
  // confirmación lo usan en vez de una búsqueda por texto de la dirección.
  maps_url?: string | null
  instagram: string | null
  // SECRETOS POR TENANT: los 7 secretos (mp_access_token, mp_refresh_token,
  // mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key,
  // google_refresh_token) ya NO viven en Business. Ahora están en BusinessSecrets
  // (lib/business-secrets.ts), keyed por business_id, en la tabla business_secrets con
  // RLS solo-dueño. Leerlos SIEMPRE vía getBusinessSecrets(businessId) (server-only).
  // MercadoPago & deposits
  require_deposit: boolean
  deposit_amount: number
  deposit_expiry_hours: number
  // Notifications
  notification_email: string | null
  // Anti-spam: recaptcha_site_key NO es secreto (se renderiza en el browser) → se queda acá.
  recaptcha_site_key: string | null
  // Scheduling
  default_slot_duration?: number | null
  // Descanso entre turnos (minutos). Gap mínimo entre turnos consecutivos. 0 = sin buffer.
  buffer_minutes?: number | null
  // MercadoPago Connect (OAuth): user_id de la cuenta MP. NO es secreto (es el id de cuenta);
  // el dashboard lo usa como flag (¿conectó por OAuth?) → se queda en Business.
  mp_user_id?: string | null
  // Plans
  plan?: string | null
  plan_status?: string | null
  trial_ends_at?: string | null
  // Subscription (MercadoPago)
  mp_subscription_id?: string | null
  mp_plan_id_active?: string | null
  subscription_ends_at?: string | null
  created_at: string
}

export interface Location {
  id: string
  business_id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

// Excepción de horario por fecha (Capa 1). Anula o cambia un día puntual por encima
// de la grilla semanal (time_blocks). closed=true → cerrado; closed=false → horario
// especial (start_time/end_time).
export interface ScheduleException {
  id: string
  business_id: string
  date: string
  closed: boolean
  start_time: string | null
  end_time: string | null
  // Consultorio al que aplica. null = global (todo el negocio).
  location_id?: string | null
  created_at: string
}

export interface TimeBlock {
  id: string
  business_id: string
  day_of_week: number
  start_time: string
  end_time: string
  label: string | null
  // Consultorio/sucursal del bloque (Capa 2a). null = sede única / sin consultorio.
  location_id: string | null
  created_at: string
}

// Los secretos por tenant viven en BusinessSecrets (lib/business-secrets.ts), keyed por
// business_id. Se re-exporta acá para que lib/types.ts sea el punto único de referencia de tipos.
export type { BusinessSecrets } from './business-secrets'

// Public subset — never include secret keys.
// Los 7 campos secretos ya no existen en Business (viven en BusinessSecrets), así que el Omit
// solo necesita excluir lo interno-pero-no-secreto que sigue siendo campo de Business.
export type PublicBusiness = Omit<Business, 'notification_email'>

export interface Professional {
  id: string
  business_id: string
  name: string
  last_name: string | null
  specialty: string | null
  license_number: string | null
  phone: string | null
  email: string | null
  photo_url: string | null
  active: boolean
  created_at: string
}

export interface Service {
  id: string
  business_id: string
  name: string
  duration_minutes: number
  price: number
  description: string | null
  active: boolean
  // Consultorio donde se presta (legacy, único). null = cualquiera.
  location_id?: string | null
  // Consultorios donde se ofrece el servicio. null/vacío = en todos. Reemplaza a location_id.
  location_ids?: string[] | null
  created_at: string
}

export interface BusinessHour {
  id: string
  business_id: string
  day_of_week: number
  open_time: string | null
  close_time: string | null
  is_open: boolean
}

export interface Client {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  status?: string | null
  client_number?: number | null
  // Salud (obra social)
  insurance_name?: string | null
  insurance_number?: string | null
  // Belleza (ficha de preferencias)
  preferences?: string | null
  created_at: string
}

export interface ClinicalNote {
  id: string
  business_id: string
  client_id: string
  note: string
  note_date: string
  created_at: string
}

export interface ClientAttachment {
  id: string
  business_id: string
  client_id: string
  file_url: string
  file_name: string | null
  uploaded_at: string
}

export interface Appointment {
  id: string
  business_id: string
  professional_id: string | null
  service_id: string | null
  // Consultorio/sucursal donde quedó el turno (Capa 2a). null = sede única.
  location_id?: string | null
  client_id: string | null
  client_name: string
  client_phone: string | null
  client_email: string | null
  date: string
  time: string
  status: 'pending' | 'pending_payment' | 'confirmed' | 'cancelled' | 'completed'
  payment_status: 'unpaid' | 'paid'
  notes: string | null
  deposit_paid: boolean
  deposit_amount: number
  mp_payment_id: string | null
  expires_at: string | null
  // Estado del email de confirmación (para detectar fallos; sin reintentos).
  email_sent?: boolean
  email_error?: string | null
  // Token impredecible para el link público de cancelación (nunca cancelar por id).
  cancel_token?: string
  // ID del evento en Google Calendar del dueño (si sincroniza). Permite borrarlo al cancelar.
  google_event_id?: string | null
  created_at: string
  professionals?: Professional
  services?: Service
  clients?: Client
}

export interface ManualSale {
  id: string
  business_id: string
  description: string
  quantity: number
  amount: number
  sale_date: string
  type: string
  client_id?: string | null
  created_at: string
}

export interface Expense {
  id: string
  business_id: string
  category: string
  amount: number
  expense_date: string
  notes: string | null
  created_at: string
}

export interface SavedProduct {
  id: string
  business_id: string
  name: string
  type: string
  created_at: string
}

export interface FixedExpense {
  id: string
  business_id: string
  name: string
  amount: number
  frequency: string
  due_day: number | null
  active: boolean
  created_at: string
}
