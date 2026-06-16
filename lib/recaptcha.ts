import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'

const SCORE_THRESHOLD = 0.5 // reCAPTCHA v3

export type RecaptchaResult =
  | { ok: true; configured: boolean; score?: number }
  | { ok: false; configured: boolean; reason: string; score?: number; status: number }

// Verifica reCAPTCHA v3 fail-closed. Resuelve el secret por negocio (override por tenant) o
// el global de env; el lookup va por slug → mantiene aislamiento por tenant. service role es
// server-only. Si el negocio NO tiene reCAPTCHA configurado, se permite (ok, configured:false)
// pero queda rastro. Si está configurado, la verificación es OBLIGATORIA: token ausente,
// score bajo, o error llamando a Google → ok:false (no se asume éxito).
export async function verifyRecaptcha({ token, slug }: { token: string; slug: string }): Promise<RecaptchaResult> {
  let secretKey = process.env.RECAPTCHA_SECRET_KEY || ''
  if (slug) {
    // El secret de reCAPTCHA por tenant vive en business_secrets (D-01), NO en businesses.
    // Acá resolvemos primero el business_id por slug (columna NO secreta de businesses) y luego
    // leemos recaptcha_secret_key vía getBusinessSecrets. El override por tenant pisa al global
    // solo si existe el secret.
    const supabase = createAdminClient()
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('slug', slug)
      .single()
    if (business?.id) {
      const secrets = await getBusinessSecrets(business.id)
      if (secrets.recaptcha_secret_key) secretKey = secrets.recaptcha_secret_key
    }
  }

  // No configurado → no hay verificación que hacer: se permite, pero queda rastro.
  if (!secretKey) {
    console.warn(`[recaptcha] reserva creada SIN reCAPTCHA (negocio sin secret): slug=${slug || 'desconocido'}`)
    return { ok: true, configured: false }
  }

  // Configurado → verificación obligatoria y fail-closed.
  if (!token) {
    console.warn(`[recaptcha] rechazada: token ausente. slug=${slug}`)
    return { ok: false, configured: true, reason: 'missing_token', status: 400 }
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
    return { ok: false, configured: true, reason: 'verify_unreachable', status: 502 }
  }

  const score = typeof data.score === 'number' ? data.score : 0
  const passed = data.success === true && score >= SCORE_THRESHOLD
  if (!passed) {
    console.warn(
      `[recaptcha] rechazada: success=${data.success} score=${score} ` +
      `errors=${JSON.stringify(data['error-codes'] ?? [])} slug=${slug}`
    )
    return { ok: false, configured: true, reason: 'low_score_or_failed', score, status: 200 }
  }

  return { ok: true, configured: true, score }
}
