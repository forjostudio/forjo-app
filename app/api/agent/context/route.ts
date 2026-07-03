import { createAdminClient } from '@/lib/supabase/admin'
import { mapTimeBlocks, mapServices } from '@/lib/agent-context'
import type { NextRequest } from 'next/server'

// ── Context read-only del agente (Phase 6, Plan 01, D-06) ─────────────────────────────────────────
// El bot lee este endpoint cada ~10 min por slug para armar su prompt (HANDOFF del agent kit). Devuelve
// lo MISMO que ya muestra la página pública del negocio (name/slug/address/mapsUrl/bookingUrl +
// services + hours + notes) → sin secretos (T-06-08 accept). Espejo de booking/availability:
// service-role por slug, force-dynamic, searchParams síncrono vía nextUrl (Next 16). El mapeo vive en
// lib/agent-context.ts (puro, testeado) → este route queda delgado.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') || ''
  if (!slug) return Response.json({ ok: false, error: 'missing_params' }, { status: 400 })

  const supabase = createAdminClient()

  // slug → negocio (columnas NO secretas explícitas, sin select-estrella).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, slug, address, maps_url')
    .eq('slug', slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Services activos + horarios en paralelo.
  const [{ data: services }, { data: hours }] = await Promise.all([
    supabase
      .from('services')
      .select('name, duration_minutes, price, description')
      .eq('business_id', business.id)
      .eq('active', true),
    supabase
      .from('time_blocks')
      .select('day_of_week, start_time, end_time')
      .eq('business_id', business.id),
  ])

  // bookingUrl es OBLIGATORIO (HANDOFF): la tool `agendar` del bot manda este link al cliente.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'

  return Response.json(
    {
      business: {
        name: business.name,
        slug: business.slug,
        address: business.address ?? null,
        mapsUrl: business.maps_url ?? null,
        bookingUrl: `${appUrl}/${business.slug}/turno`, // OBLIGATORIO (HANDOFF)
      },
      services: mapServices(services),
      hours: mapTimeBlocks(hours),
      notes: null, // no hay campo notes en businesses hoy → null (HANDOFF lo permite)
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
