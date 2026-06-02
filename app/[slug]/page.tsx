import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BookingClient } from './booking-client'
import type { PublicBusiness } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  // Exclude secrets from public query
  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id, slug, name, type, logo_url, primary_color, phone, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, created_at')
    .eq('slug', slug)
    .single()

  if (!business) notFound()

  const [{ data: services }, { data: professionals }, { data: hours }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('professionals').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('business_hours').select('*').eq('business_id', business.id),
  ])

  return (
    <BookingClient
      business={business as unknown as PublicBusiness}
      services={services || []}
      professionals={professionals || []}
      hours={hours || []}
    />
  )
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: business } = await supabase
    .from('businesses')
    .select('name, type')
    .eq('slug', slug)
    .single()

  if (!business) return { title: 'Negocio no encontrado' }

  return {
    title: `${business.name} — Reservar turno`,
    description: `Reservá tu turno en ${business.name}`,
  }
}
