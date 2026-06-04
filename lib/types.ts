export interface Business {
  id: string
  owner_id: string
  slug: string
  name: string
  type: string | null
  vertical?: string | null
  logo_url: string | null
  primary_color: string
  phone: string | null
  address: string | null
  instagram: string | null
  // MercadoPago & deposits
  mp_access_token: string | null
  require_deposit: boolean
  deposit_amount: number
  deposit_expiry_hours: number
  // Notifications
  notification_email: string | null
  resend_api_key: string | null
  // Anti-spam
  recaptcha_site_key: string | null
  recaptcha_secret_key: string | null
  // Scheduling
  default_slot_duration?: number | null
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

export interface TimeBlock {
  id: string
  business_id: string
  day_of_week: number
  start_time: string
  end_time: string
  label: string | null
  created_at: string
}

// Public subset — never include secret keys
export type PublicBusiness = Omit<Business, 'mp_access_token' | 'notification_email' | 'resend_api_key' | 'recaptcha_secret_key'>

export interface Professional {
  id: string
  business_id: string
  name: string
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
