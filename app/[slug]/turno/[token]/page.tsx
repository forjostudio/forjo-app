import { createAdminClient } from '@/lib/supabase/admin'
import { ConfirmationView } from '@/components/booking/confirmation-view'
import { bookingCode } from '@/lib/booking-code'
import { resolveVertical } from '@/lib/verticals'

export const metadata = { title: 'Turno confirmado' }

// Página pública de confirmación del turno. Resuelve SOLO por cancel_token (impredecible),
// igual que la cancelación; sin token válido no muestra nada. service role server-side.
// Hereda theme/palette/font del negocio vía el layout de [slug].
export default async function TurnoConfirmacion({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('date, time, client_name, client_phone, client_email, cancel_token, deposit_paid, duration_minutes, professionals(name), services(name, price, duration_minutes), locations(name, address), businesses(name, type, vertical, slug, logo_url, address, maps_url, whatsapp)')
    .eq('cancel_token', token)
    .single()

  if (!appt) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">Link inválido</h1>
          <p className="text-muted-foreground">Este enlace no es válido o el turno ya no existe.</p>
        </div>
      </main>
    )
  }

  const business = appt.businesses as { name?: string; type?: string | null; vertical?: string | null; slug?: string; logo_url?: string | null; address?: string | null; maps_url?: string | null; whatsapp?: string | null } | null
  const service = appt.services as { name?: string; price?: number | null; duration_minutes?: number | null } | null
  const professional = appt.professionals as { name?: string } | null
  const location = appt.locations as { name?: string; address?: string | null } | null
  const locationLabel = resolveVertical({ vertical: business?.vertical ?? null, type: business?.type ?? null }).terminology.location

  return (
    <ConfirmationView
      businessName={business?.name ?? ''}
      businessType={business?.type ?? null}
      businessSlug={business?.slug ?? ''}
      logoUrl={business?.logo_url ?? null}
      address={business?.address ?? null}
      mapsUrl={business?.maps_url ?? null}
      whatsapp={business?.whatsapp ?? null}
      locationName={location?.name ?? null}
      locationAddress={location?.address ?? null}
      locationLabel={locationLabel}
      clientName={appt.client_name}
      clientPhone={appt.client_phone}
      clientEmail={appt.client_email}
      serviceName={service?.name ?? 'Turno'}
      durationMinutes={appt.duration_minutes ?? service?.duration_minutes ?? null}
      price={service?.price ?? null}
      professionalName={professional?.name ?? null}
      date={appt.date}
      time={appt.time}
      code={bookingCode(token)}
      cancelToken={token}
      depositPaid={!!appt.deposit_paid}
    />
  )
}
