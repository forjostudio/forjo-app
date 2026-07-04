import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Página de mantenimiento (autocontenida) para el kill switch.
const SUSPENDED_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>En mantenimiento</title>
<style>:root{--bg:#1a1714;--ink:#f3ead8;--muted:#a39989;--accent:#d94a2b}
*{margin:0;box-sizing:border-box}body{background:var(--bg);color:var(--ink);
font-family:system-ui,-apple-system,'Segoe UI',sans-serif;min-height:100vh;display:flex;
align-items:center;justify-content:center;padding:24px;text-align:center}
.card{max-width:440px}.dot{width:44px;height:44px;border-radius:50%;background:var(--accent);margin:0 auto 24px}
h1{font-size:26px;letter-spacing:-.02em;margin-bottom:12px}
p{color:var(--muted);line-height:1.6;font-size:15px}</style></head>
<body><div class="card"><div class="dot"></div>
<h1>Estamos en mantenimiento</h1>
<p>Volvemos en un rato. Gracias por la paciencia.</p></div></body></html>`

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

  // Kill switch / modo mantenimiento: con SITE_SUSPENDED=true la app devuelve 503
  // con la página de mantenimiento. Se deja pasar /api (webhooks de MercadoPago,
  // crons) para NO perder eventos de pago. Apagado por default; se prende con la
  // env en Vercel + redeploy.
  if (process.env.SITE_SUSPENDED === 'true' && !pathname.startsWith('/api')) {
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
