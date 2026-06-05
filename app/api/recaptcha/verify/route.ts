import { createAdminClient } from '@/lib/supabase/admin'

const SCORE_THRESHOLD = 0.5 // reCAPTCHA v3

export async function POST(request: Request) {
  // Cuerpo inválido → no podemos verificar nada. Fail-closed.
  let token: unknown
  let businessSlug: unknown
  try {
    const body = await request.json()
    token = body?.token
    businessSlug = body?.businessSlug
  } catch {
    console.error('[recaptcha] body inválido')
    return Response.json({ ok: false, reason: 'bad_request' }, { status: 400 })
  }

  const slug = typeof businessSlug === 'string' ? businessSlug : ''

  // ── ¿reCAPTCHA está configurado para ESTE negocio? ──────────────────────────
  // Secret propio del negocio (override por tenant) o el global de env. El lookup
  // va por slug → mantiene el aislamiento por tenant. createAdminClient (service
  // role) es server-only.
  let secretKey = process.env.RECAPTCHA_SECRET_KEY || ''
  if (slug) {
    const supabase = createAdminClient()
    const { data: business } = await supabase
      .from('businesses')
      .select('recaptcha_secret_key')
      .eq('slug', slug)
      .single()
    if (business?.recaptcha_secret_key) secretKey = business.recaptcha_secret_key
  }

  // No configurado → no hay verificación que hacer: se permite, pero queda rastro.
  if (!secretKey) {
    console.warn(`[recaptcha] reserva creada SIN reCAPTCHA (negocio sin secret): slug=${slug || 'desconocido'}`)
    return Response.json({ ok: true, configured: false })
  }

  // ── Configurado → verificación OBLIGATORIA y fail-closed ───────────────────
  if (typeof token !== 'string' || !token) {
    console.warn(`[recaptcha] rechazada: token ausente. slug=${slug}`)
    return Response.json({ ok: false, configured: true, reason: 'missing_token' }, { status: 400 })
  }

  let data: { success?: boolean; score?: number; 'error-codes'?: string[] }
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    })
    data = await res.json()
  } catch (e) {
    // Excepción llamando a Google → NO asumir éxito. Fail-closed.
    console.error(`[recaptcha] error llamando a siteverify. slug=${slug}:`, e)
    return Response.json({ ok: false, configured: true, reason: 'verify_unreachable' }, { status: 502 })
  }

  const score = typeof data.score === 'number' ? data.score : 0
  const passed = data.success === true && score >= SCORE_THRESHOLD
  if (!passed) {
    console.warn(
      `[recaptcha] rechazada: success=${data.success} score=${score} ` +
      `errors=${JSON.stringify(data['error-codes'] ?? [])} slug=${slug}`
    )
    return Response.json({ ok: false, configured: true, score, reason: 'low_score_or_failed' })
  }

  return Response.json({ ok: true, configured: true, score })
}
