import { createPublicServerClient } from '@/lib/supabase/public'
import { notFound } from 'next/navigation'
import { BookingClient } from './booking-client'
import { LandingRenderer } from '@/components/landing/landing-renderer'
import type { PublicBusiness, Location } from '@/lib/types'
import { parseLandingConfig } from '@/lib/landing/schema'
import { resolveVertical } from '@/lib/verticals'
import { buildJsonLd } from '@/lib/landing/seo'

// ── JSON-LD (SEO-03 / D9-04) ───────────────────────────────────────────────────────
// Componente local que serializa el objeto TIPADO de buildJsonLd y lo emite en un
// <script type="application/ld+json">. Por qué objeto tipado + escape y no concatenar
// strings (T-09-01 / Pitfall 4): un name/address con `<...>` podría romper o inyectar
// markup en el HTML; serializamos con JSON.stringify y escapamos el carácter de apertura
// de etiqueta a su forma unicode `<` para neutralizar cualquier `</script>` o tag.
// Si jsonLd es null (sin name) no se renderiza nada.
function JsonLdScript({ jsonLd }: { jsonLd: object | null }) {
  if (!jsonLd) return null
  const json = JSON.stringify(jsonLd).replace(/</g, '\\u003c')
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  )
}

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

  // JSON-LD LocalBusiness (SEO-03 / D9-04): se construye SOLO con la data ya fetcheada
  // arriba (business con vertical/type/whatsapp, locations, timeBlocks) — NO se agregan
  // queries ni se toca force-dynamic. Se emite en AMBAS ramas (legacy y renderer) porque
  // D9-03/D9-04 piden structured data en CADA landing, también la del negocio legacy.
  const vertical = resolveVertical(business)
  // url ABSOLUTO (W2): el JSON-LD NO pasa por metadataBase (eso solo aplica a la Metadata
  // del layout), así que el `url` interno del objeto debe ser fully-qualified a mano.
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  // `locations` viene del select acotado (id/name/address/phone) — buildJsonLd solo lee
  // address/phone, así que el cast nombra la forma parcial que el helper realmente usa
  // (mismo patrón `as unknown as` que ya se aplica a `business` abajo). Sin queries nuevas.
  const jsonLd = buildJsonLd({
    business,
    locations: (locations || []) as unknown as Location[],
    timeBlocks: timeBlocks || [],
    vertical: vertical.key,
    url: `${base}/${slug}`,
  })

  // Seam legacy-vs-renderer (Pitfall 4: NO se toca force-dynamic, fetch ni se agregan queries).
  // landing === null → passthrough legacy byte-idéntico (LAND-06, probado en F6): un negocio que
  // nunca optó por una landing ve EXACTAMENTE el BookingClient de siempre, cero regresión.
  // El <JsonLdScript> es aditivo (no altera los props de BookingClient/LandingRenderer, LAND-02).
  if (landing === null) {
    return (
      <>
        <JsonLdScript jsonLd={jsonLd} />
        <BookingClient
          business={business as unknown as PublicBusiness}
          services={services || []}
          professionals={professionals || []}
          timeBlocks={timeBlocks || []}
          exceptions={exceptions || []}
          locations={locations || []}
        />
      </>
    )
  }

  // landing !== null → el LandingRenderer compone las secciones por order/enabled e inyecta
  // booking (D7-05). Mismos props que el passthrough + el config; sin queries nuevas.
  return (
    <>
      <JsonLdScript jsonLd={jsonLd} />
      <LandingRenderer
        config={landing}
        business={business as unknown as PublicBusiness}
        services={services || []}
        professionals={professionals || []}
        timeBlocks={timeBlocks || []}
        exceptions={exceptions || []}
        locations={locations || []}
      />
    </>
  )
}
