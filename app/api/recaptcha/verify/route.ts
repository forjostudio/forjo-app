import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const { token, businessSlug } = await request.json()
    if (!token) return Response.json({ ok: false, score: 0 })

    let secretKey = process.env.RECAPTCHA_SECRET_KEY || ''

    if (businessSlug) {
      const supabase = createAdminClient()
      const { data: business } = await supabase
        .from('businesses')
        .select('recaptcha_secret_key')
        .eq('slug', businessSlug)
        .single()
      if (business?.recaptcha_secret_key) {
        secretKey = business.recaptcha_secret_key
      }
    }

    if (!secretKey) {
      // No reCAPTCHA configured — allow through
      return Response.json({ ok: true, score: 1 })
    }

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${secretKey}&response=${token}`,
    })
    const data = await res.json()

    const score = data.score ?? 0
    return Response.json({ ok: data.success === true && score >= 0.5, score })
  } catch (e) {
    console.error('reCAPTCHA verify error:', e)
    return Response.json({ ok: false, score: 0 }, { status: 500 })
  }
}
