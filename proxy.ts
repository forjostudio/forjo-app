import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const KNOWN_PREFIXES = [
  '/login',
  '/register',
  '/dashboard',
  '/appointments',
  '/clients',
  '/finances',
  '/settings',
  '/onboarding',
  '/api',
  '/_next',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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
