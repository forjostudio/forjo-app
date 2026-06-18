import { createPublicServerClient } from '@/lib/supabase/public'
import { notFound } from 'next/navigation'
import { BookingClient } from './booking-client'
import { LandingRenderer } from '@/components/landing/landing-renderer'
import type { PublicBusiness } from '@/lib/types'
import { parseLandingConfig } from '@/lib/landing/schema'

// Datos siempre frescos: la página de reserva debe reflejar al instante los cambios del dueño
// (horarios, consultorios, servicios, días especiales). Sin esto, Next cachea la ruta y sirve
// datos viejos hasta el próximo deploy.
export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params
  const supabase = createPublicServerClient()

  // Vista pública acotada (migración 026): expone solo columnas no sensibles. NO leer la
  // tabla `businesses` directo con anon key — filtraría secretos por tenant (mp_access_token,
  // resend_api_key, recaptcha_secret_key, google_refresh_token, …).
  const { data: business } = await supabase
    .from('public_businesses')
    .select('id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, landing_config')
    .eq('slug', slug)
    .single()

  if (!business) notFound()

  // D-01: ejercitamos el parser fail-safe en el path real del request (prueba viva de que
  // ningún config inválido puede 500ear esta página). landing === null = negocio legacy
  // (passthrough byte-idéntico, LAND-06); config presente → lo compone el LandingRenderer.
  const landing = parseLandingConfig((business as { landing_config?: unknown }).landing_config)

  // Solo excepciones de hoy en adelante (las pasadas no afectan la reserva).
  const todayStr = new Date().toISOString().slice(0, 10)
  const [{ data: services }, { data: professionals }, { data: timeBlocks }, { data: exceptions }, { data: locations }] = await Promise.all([
    // Vista pública acotada (migración 027): leer la vista, NO la tabla base `services` con anon
    // key. La vista ya filtra WHERE active = true, así que el .eq('active', true) es redundante
    // (consistente con cómo leemos public_professionals). Tras el DROP POLICY de 028, anon ya no
    // podrá leer la tabla base y esta página seguirá funcionando.
    supabase.from('public_services').select('*').eq('business_id', business.id),
    // Vista pública acotada (id, name, specialty) — no expone contacto/matrícula del staff.
    supabase.from('public_professionals').select('*').eq('business_id', business.id),
    supabase.from('time_blocks').select('*').eq('business_id', business.id),
    supabase.from('schedule_exceptions').select('date, closed, start_time, end_time, location_id').eq('business_id', business.id).gte('date', todayStr),
    supabase.from('locations').select('id, name, address, phone').eq('business_id', business.id).or('is_active.is.null,is_active.eq.true'),
  ])

  // Seam legacy-vs-renderer (Pitfall 4: NO se toca force-dynamic, fetch ni se agregan queries).
  // landing === null → passthrough legacy byte-idéntico (LAND-06, probado en F6): un negocio que
  // nunca optó por una landing ve EXACTAMENTE el BookingClient de siempre, cero regresión.
  if (landing === null) {
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

  // landing !== null → el LandingRenderer compone las secciones por order/enabled e inyecta
  // booking (D7-05). Mismos props que el passthrough + el config; sin queries nuevas.
  return (
    <LandingRenderer
      config={landing}
      business={business as unknown as PublicBusiness}
      services={services || []}
      professionals={professionals || []}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
    />
  )
}
