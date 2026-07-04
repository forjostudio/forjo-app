import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createPublicServerClient } from '@/lib/supabase/public'

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

// Rutas que NUNCA se cortan por mantenimiento: /api (webhooks de MercadoPago +
// crons) y /admin + /login para que el super-admin pueda entrar y apagar el switch.
const MAINT_EXEMPT = ['/api', '/admin', '/login']

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

const KNOWN_PREFIXES = [
  '/login',
  '/register',
  '/dashboard',
  '/appointments',
  '/clients',
  '/finances',
  '/settings',
  '/onboarding',
  // CRM super-admin (Pitfall 3 / D3): sin este prefijo, /admin cae en el
  // NextResponse.next() de abajo y NO pasa por updateSession → la cookie de
  // sesion queda stale y getUser() en el layout puede devolver null intermitente.
  '/admin',
  '/api',
  '/_next',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Kill switch / modo mantenimiento: se controla desde el panel super-admin
  // (flag en app_settings) o por env SITE_SUSPENDED (break-glass). Devuelve 503
  // con la página de mantenimiento en todo lo público; deja pasar /api, /admin y
  // /login (ver MAINT_EXEMPT) para no perder webhooks y poder apagarlo.
  const maintExempt = MAINT_EXEMPT.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!maintExempt && (await isMaintenance())) {
    return new NextResponse(SUSPENDED_HTML, {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': '3600' },
    })
  }

  // Public booking pages — skip session handling entirely so the logged-in
  // owner's credentials never leak into the anon booking flow.
  const isKnownRoute = KNOWN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
  if (!isKnownRoute && pathname !== '/') {
    return NextResponse.next()
  }

  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
