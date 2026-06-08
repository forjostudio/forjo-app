import { verifyRecaptcha } from '@/lib/recaptcha'

// Verificación de reCAPTCHA como endpoint (compat). La lógica vive en lib/recaptcha para que
// el endpoint de reserva server-side (/api/booking/create) la reuse sin self-HTTP.
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
  const tok = typeof token === 'string' ? token : ''

  const result = await verifyRecaptcha({ token: tok, slug })
  if (result.ok) {
    return Response.json({ ok: true, configured: result.configured, score: result.score })
  }
  return Response.json(
    { ok: false, configured: result.configured, reason: result.reason, score: result.score },
    { status: result.status }
  )
}
