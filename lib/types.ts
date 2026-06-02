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
  created_at: string
}

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
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  payment_status: 'unpaid' | 'paid'
  notes: string | null
  created_at: string
  professionals?: Professional
  services?: Service
  clients?: Client
}
