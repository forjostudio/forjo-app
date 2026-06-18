import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isDashboardRoute = pathname.startsWith('/dashboard') ||
    pathname.startsWith('/appointments') ||
    pathname.startsWith('/clients') ||
    pathname.startsWith('/finances') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/onboarding') ||
    // CRM super-admin (D3, defensa en profundidad): un request a /admin sin
    // sesion se corta en el Edge antes de llegar al layout. Aca solo se
    // garantiza que HAY sesion; el chequeo de rol is_admin vive en el layout
    // del CRM (FND-01), no en el middleware.
    pathname.startsWith('/admin')

  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
