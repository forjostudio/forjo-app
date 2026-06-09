import Link from 'next/link'
import { Check } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { ConfirmationView } from '@/components/booking/confirmation-view'
import { bookingCode } from '@/lib/booking-code'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// Retorno de MercadoPago tras pagar la seña (auto_return=approved). MP agrega
// external_reference (= id del turno) al back_url → con eso mostramos la misma
// confirmación rica que el flujo sin seña. Si falta, caemos al mensaje simple.
export default async function PagoExitoso({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const ref = typeof sp.external_reference === 'string' ? sp.external_reference : null

  if (ref) {
    const supabase = createAdminClient()
    const { data: appt } = await supabase
      .from('appointments')
      .select('date, time, client_name, client_phone, client_email, cancel_token, duration_minutes, professionals(name), services(name, price, duration_minutes), locations(name, address), businesses(name, type, slug, logo_url, address, maps_url, whatsapp)')
      .eq('id', ref)
      .single()

    if (appt?.cancel_token) {
      const business = appt.businesses as { name?: string; type?: string | null; slug?: string; logo_url?: string | null; address?: string | null; maps_url?: string | null; whatsapp?: string | null } | null
      const service = appt.services as { name?: string; price?: number | null; duration_minutes?: number | null } | null
      const professional = appt.professionals as { name?: string } | null
      const location = appt.locations as { name?: string; address?: string | null } | null
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
          clientName={appt.client_name}
          clientPhone={appt.client_phone}
          clientEmail={appt.client_email}
          serviceName={service?.name ?? 'Turno'}
          durationMinutes={appt.duration_minutes ?? service?.duration_minutes ?? null}
          price={service?.price ?? null}
          professionalName={professional?.name ?? null}
          date={appt.date}
          time={appt.time}
          code={bookingCode(appt.cancel_token)}
          cancelToken={appt.cancel_token}
          depositPaid
        />
      )
    }
  }

  // Fallback: sin external_reference válido, mensaje genérico de éxito.
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-primary text-primary-foreground">
          <Check className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">¡Turno confirmado!</h1>
        <p className="text-muted-foreground mb-6">Tu seña fue recibida. Te esperamos.</p>
        <Link
          href={`/${slug}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
