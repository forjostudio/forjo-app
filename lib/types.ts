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
  // Ventana de reserva pública (BOOK-WINDOW). Cuánto en el futuro puede reservar el cliente en la
  // página pública. Se lee vía la vista public_businesses (no la tabla). Ambos null = sin límite.
  max_advance_days?: number | null // modo rolling: N días desde hoy (default 30 en DB). null/0 = sin límite.
  max_advance_date?: string | null // modo fecha fija, ISO yyyy-mm-dd. Precedencia fecha > días.
  // Ventana de generación forward del abono en semanas (migración 054, D-07); default 8 en la DB.
  // Owner-updatable (el trigger businesses_protect_admin_columns no la protege). NO viaja al anon.
  abono_window_weeks?: number | null
  // MercadoPago Connect (OAuth): user_id de la cuenta MP. NO es secreto (es el id de cuenta);
  // el dashboard lo usa como flag (¿conectó por OAuth?) → se queda en Business.
  mp_user_id?: string | null
  // Estado durable de la conexión de MercadoPago Connect (migración 053, MPCONN-03). Valores conocidos:
  // 'connected' (sano) | 'error' (caído). Se escribe server-side (service-role) desde
  // getValidMpAccessToken/createDepositPreference/callback OAuth; la Phase 2 lo lee del `business`
  // resuelto por owner_id. Tipado string | null (no unión estricta) para no romper ante un futuro
  // 'revoked' sin re-migrar (mismo criterio que mp_user_id).
  mp_connection_status?: string | null
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
  // Cupo del bloque (migración 041). NOT NULL DEFAULT 1 en la DB → siempre presente. 1 = comportamiento
  // individual de siempre (1 reserva por slot); > 1 = clase grupal con `capacity` lugares en el mismo slot.
  capacity: number
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
  // Puntero 1:1 a su `service` de precio+duración en el vertical canchas (migración 043, D-06).
  // La cancha ES esta fila de agenda; service_id apunta al service que le da precio+duración fija.
  // NULL en salud/belleza/general (esos verticales no son canchas y no usan la columna).
  service_id?: string | null
  created_at: string
}

// Espacio físico por negocio (migración 042). Cada cancha (A/B/C) = una fila. Datos de tenant
// (RLS por op WITH CHECK por business_id, sin read anon — D-06). Campos snake_case espejo de la fila DB.
export interface Space {
  id: string
  business_id: string
  name: string
  created_at: string
}

// Puente agenda↔espacio (migración 042). Mapea cada agenda (fila de Professional, per D-02) a los
// espacios físicos que ocupa: F11→{A,B,C}; cruzada A→{A}. professional_id y space_id son NOT NULL FK
// en la DB (la sentinela "sin profesional" no tiene espacios — Pitfall 1). PK (professional_id, space_id).
export interface AgendaSpace {
  business_id: string
  professional_id: string
  space_id: string
}

// Cancha pública (vista acotada `public_canchas`, migr. 044). Forma que ve el anon en el
// booking público de canchas: `id` = professional_id de la agenda-cancha; `price`/`duration_minutes`
// salen del service 1:1 de la cancha (D-03). NUNCA expone `service_id` (vive solo en JOIN+WHERE).
// El client reserva con `professionalId = id` (sin serviceId): el server deriva el service (Plan 02).
export interface PublicCancha {
  id: string
  business_id: string
  name: string
  price: number
  duration_minutes: number
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

export interface Client {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  status?: string | null
  client_number?: number | null
  // Procedencia del cliente: 'reserva' (llegó por la reserva pública), 'manual' (alta a mano del
  // dueño) o 'importado' (import CSV, Fase 3). Columna origin (migr. 049), NOT NULL DEFAULT 'reserva'.
  origin: 'reserva' | 'manual' | 'importado'
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
  // Cupos grupales (migración 041, lo escribe book_slot_atomic). Opcionales con `?` porque no todo
  // `select` los trae. `seat` = posición 0..capacity-1 que vuelve único el índice 011 por slot (cupo 1
  // siempre seat 0). `is_group` = desnormalización (capacity > 1) que condiciona el EXCLUDE 013.
  seat?: number
  is_group?: boolean
  // FK a la serie del abono (migración 054, D-03); marca el turno como 'fijo' en la agenda (D-09).
  // null = turno suelto. Se setea con un UPDATE acotado tras el insert atómico (Plan 02).
  abono_id?: string | null
  created_at: string
  professionals?: Professional
  services?: Service
  clients?: Client
}

// Abono = serie de turnos fijos recurrentes (semanal, mismo día/hora/cliente/servicio/agenda).
// Migración 054 (ABONO-01/02/03, D-01). Espejo snake_case de la fila DB. RLS owner-only; el público
// NUNCA lee abonos (D-10). El motor de generación forward (Plan 02) materializa turnos en `appointments`
// dentro de una ventana rolling de `businesses.abono_window_weeks` semanas.
export interface Abono {
  id: string
  business_id: string
  client_id: string | null // ON DELETE SET NULL
  service_id: string | null // ON DELETE RESTRICT (evita orfandad de generación)
  professional_id: string | null // NULLABLE: bucket "sin profesional" según vertical
  location_id: string | null // NULLABLE
  // convención EXTRACT(dow): 0=domingo..6=sábado, idéntica a time_blocks.day_of_week y book_slot_atomic.
  day_of_week: number
  start_time: string // 'HH:mm[:ss]'
  duration_minutes: number | null // snapshot de referencia; la generación usa la duración VIVA del service.
  status: 'active' | 'cancelled'
  cancel_token: string // token a NIVEL SERIE (link de cancelación, Phase 7)
  generated_until: string | null // frontera de la ventana rolling (ISO yyyy-mm-dd); idempotencia forward.
  skipped_occurrences: { date: string; reason: string }[] // D-06: ocurrencias salteadas por conflicto.
  created_at: string
  cancelled_at: string | null
  // Columnas extensibles (D-02): diferido a v0.25 / cobro futuro — v0.24 NO las usa.
  reminder_lead_hours?: number | null // v0.25: lead-time del recordatorio pagá-o-liberá
  deposit_amount?: number | null // futuro: seña por ocurrencia
  billing_subscription_id?: string | null // futuro: referencia a la suscripción de cobro por cliente
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
