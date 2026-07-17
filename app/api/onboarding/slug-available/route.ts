import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

// Chequeo de disponibilidad de slug para el wizard de alta. NUNCA cachear: dos usuarios
// registrándose en paralelo tienen que ver el mismo estado global de ocupación del slug.
export const dynamic = 'force-dynamic'

// El slug del wizard es un espacio de nombres GLOBAL multi-tenant: un slug ocupado por CUALQUIER
// negocio (no solo el del usuario) no está disponible. La tabla `businesses` solo tiene policy RLS
// `owner access`, así que la query anon/owner NO ve slugs ajenos → el chequeo bajo RLS daba
// "disponible" en falso y el negocio recién fallaba en el insert (bug ONB-01). Por eso acá usamos
// service-role (bypassa RLS) para ver el espacio global.
//
// PERO service-role bypassa RLS → el aislamiento multi-tenant es responsabilidad MANUAL de este
// handler. Invariante dura (T-07-01 / D-02): la respuesta de éxito serializa EXCLUSIVAMENTE el
// booleano de existencia. Nunca el row, ni id/name/owner_id: un leak acá permitiría enumerar todos
// los negocios por nombre. El `select('id')` es SOLO para saber si existe; el id jamás sale.
export async function GET(request: NextRequest) {
  // Gate de sesión (T-07-04, regla 14 — refuerzo de bajo costo): el onboarding SIEMPRE está
  // autenticado, así que exigir sesión corta la enumeración anónima con cero costo de UX. Achica
  // la superficie de ataque; la invariante dura sigue siendo D-02 (solo el booleano).
  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const slug = (searchParams.get('slug') || '').toLowerCase()

  // Validar el shape coherente con el slugify del wizard: no vacío, length >= 3, solo [a-z0-9-].
  if (slug.length < 3 || !/^[a-z0-9-]+$/.test(slug)) {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // .maybeSingle() → sin match devuelve data:null sin error (a diferencia de .single(), que emite
  // PGRST116 en un slug libre). select('id') es solo el marcador de existencia, NO se serializa.
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  // INVARIANTE D-02 (T-07-01): la respuesta es EXCLUSIVAMENTE el booleano — cero campos del negocio.
  return Response.json({ available: !data }, { headers: { 'Cache-Control': 'no-store' } })
}
