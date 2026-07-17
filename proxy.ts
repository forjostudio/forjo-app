import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createPublicServerClient } from '@/lib/supabase/public'
import { isMaintExempt, isKnownRoute } from '@/lib/auth/route-lists'

// Página de mantenimiento (autocontenida) para el kill switch.
const SUSPENDED_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>En mantenimiento</title>
<style>:root{--bg:#1a1714;--ink:#f3ead8;--muted:#a39989;--accent:#d94a2b}
*{margin:0;box-sizing:border-box}body{background:var(--bg);color:var(--ink);
font-family:system-ui,-apple-system,'Segoe UI',sans-serif;min-height:100vh;display:flex;
align-items:center;justify-content:center;padding:24px;text-align:center}
.card{max-width:460px}.logo{width:220px;max-width:72%;height:auto;margin:0 auto 30px;display:block}
h1{font-size:26px;letter-spacing:-.02em;margin-bottom:12px}
p{color:var(--muted);line-height:1.6;font-size:15px}</style></head>
<body><div class="card"><img class="logo" src="/forjo-lockup.png" alt="Forjo Gestión">
<h1>Estamos en mantenimiento</h1>
<p>Volvemos en un rato. Gracias por la paciencia.</p></div></body></html>`

// ¿App en mantenimiento? Override por env (break-glass) o flag en app_settings
// (toggle del panel super-admin). Fail-open: si la lectura falla, NO corta la app.
async function isMaintenance(): Promise<boolean> {
  if (process.env.SITE_SUSPENDED === 'true') return true
  try {
    const sb = createPublicServerClient()
    const { data } = await sb
      .from('app_settings')
      .select('maintenance')
      .eq('id', 'default')
      .maybeSingle()
    return data?.maintenance === true
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Kill switch / modo mantenimiento: se controla desde el panel super-admin
  // (flag en app_settings) o por env SITE_SUSPENDED (break-glass). Devuelve 503
  // con la página de mantenimiento en todo lo público; deja pasar /api, /admin,
  // /login y /auth (ver MAINT_EXEMPT en @/lib/auth/route-lists) para no perder
  // webhooks, poder apagarlo, y que un link de mail no queme su token contra un 503.
  if (!isMaintExempt(pathname) && (await isMaintenance())) {
    return new NextResponse(SUSPENDED_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '3600' },
    })
  }

  // Public booking pages — skip session handling entirely so the logged-in
  // owner's credentials never leak into the anon booking flow.
  if (!isKnownRoute(pathname) && pathname !== '/') {
    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
