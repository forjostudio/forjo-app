import { createAdminClient } from '@/lib/supabase/admin'
import { PaletteScript } from '@/components/palette-script'
import { CancelClient } from './cancel-client'

export const metadata = { title: 'Cancelar turno' }

// Página pública de cancelación. Resuelve el turno SOLO por el cancel_token (impredecible);
// sin token válido no muestra ni cancela nada. service role server-side (no anon).
export default async function CancelarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: appt } = await supabase
    .from('appointments')
    .select('date, time, status, client_name, services(name), businesses(name, slug, primary_color, logo_url, theme, palette, font)')
    .eq('cancel_token', token)
    .single()

  // Token inexistente/ inválido → mensaje genérico, sin revelar nada.
  if (!appt) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">Link inválido</h1>
          <p className="text-muted-foreground">Este enlace de cancelación no es válido o el turno ya no existe.</p>
        </div>
      </main>
    )
  }

  const business = appt.businesses as { name?: string; slug?: string; primary_color?: string | null; logo_url?: string | null; theme?: string | null; palette?: string | null; font?: string | null } | null
  const serviceName = (appt.services as { name?: string } | null)?.name ?? ''
  const todayStr = new Date().toISOString().slice(0, 10)
  // Turno guardado en hora local AR (UTC-3). Dentro de las 24 h previas → ya no se cancela.
  const apptMs = new Date(`${appt.date}T${String(appt.time).slice(0, 5)}:00-03:00`).getTime()
  const initialState: 'active' | 'cancelled' | 'past' | 'too_late' =
    appt.status === 'cancelled' ? 'cancelled'
    : appt.date < todayStr ? 'past'
    : apptMs - new Date().getTime() < 24 * 60 * 60 * 1000 ? 'too_late'
    : 'active'

  return (
    <>
      <PaletteScript palette={business?.palette} theme={business?.theme} font={business?.font} />
      <CancelClient
        token={token}
      clientName={appt.client_name}
      service={serviceName}
      date={appt.date}
      time={appt.time}
      businessName={business?.name ?? ''}
      businessSlug={business?.slug ?? ''}
      logoUrl={business?.logo_url ?? null}
      accent={(business?.primary_color && business.primary_color.trim()) || '#d94a2b'}
      initialState={initialState}
      />
    </>
  )
}
