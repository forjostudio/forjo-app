export interface Business {
  id: string
  owner_id: string
  slug: string
  name: string
  type: string | null
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
  created_at: string
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
