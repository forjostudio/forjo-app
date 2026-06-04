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
    .select('id, owner_id, slug, name, type, logo_url, primary_color, phone, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, created_at')
    .eq('slug', slug)
    .single()

  if (!business) notFound()

  const [{ data: services }, { data: professionals }, { data: timeBlocks }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('professionals').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('time_blocks').select('*').eq('business_id', business.id),
  ])

  return (
    <BookingClient
      business={business as unknown as PublicBusiness}
      services={services || []}
      professionals={professionals || []}
      timeBlocks={timeBlocks || []}
    />
  )
}
