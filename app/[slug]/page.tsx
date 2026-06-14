import { createPublicServerClient } from '@/lib/supabase/public'
import { notFound } from 'next/navigation'
import { BookingClient } from './booking-client'
import type { PublicBusiness } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params
  const supabase = createPublicServerClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at')
    .eq('slug', slug)
    .single()

  if (!business) notFound()

  // Solo excepciones de hoy en adelante (las pasadas no afectan la reserva).
  const todayStr = new Date().toISOString().slice(0, 10)
  const [{ data: services }, { data: professionals }, { data: timeBlocks }, { data: exceptions }, { data: locations }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    // Vista pública acotada (id, name, specialty) — no expone contacto/matrícula del staff.
    supabase.from('public_professionals').select('*').eq('business_id', business.id),
    supabase.from('time_blocks').select('*').eq('business_id', business.id),
    supabase.from('schedule_exceptions').select('date, closed, start_time, end_time, location_id').eq('business_id', business.id).gte('date', todayStr),
    supabase.from('locations').select('id, name, address').eq('business_id', business.id).or('is_active.is.null,is_active.eq.true'),
  ])

  return (
    <BookingClient
      business={business as unknown as PublicBusiness}
      services={services || []}
      professionals={professionals || []}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
    />
  )
}
