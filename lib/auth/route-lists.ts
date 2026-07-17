// ── Listas de ruteo del Edge: 3 listas + 4 predicados, en un módulo PURO ────────────────────────
// Módulo PURO (sin imports de Next ni de Supabase): lo consumen `proxy.ts` y `lib/supabase/middleware.ts`
// —ambos en Edge Runtime— y también `test/proxy-auth-routes.test.ts`, que no puede arrastrar env vars de
// Supabase. Por eso las listas viven acá y no exportadas desde `proxy.ts`.
//
// SON LISTAS DISTINTAS CON EFECTOS DISTINTOS Y HAY QUE TOCARLAS DISTINTO (D-22). La trampa: vivían en
// dos archivos separados, y el reflejo de "agrego la ruta nueva a las listas de auth" toca las cuatro y
// rompe cosas sin que nada falle en rojo. Qué hace cada una:
//
//   | Lista                     | Si NO matchea …                                          | Si SÍ matchea …                         |
//   |---------------------------|----------------------------------------------------------|-----------------------------------------|
//   | MAINT_EXEMPT              | con mantenimiento ON → 503 HTML                          | pasa igual con la app en mantenimiento  |
//   | KNOWN_PREFIXES            | NextResponse.next() SIN updateSession → cookie stale     | pasa por updateSession (sesión fresca)  |
//   | AUTH_ROUTE_PREFIXES       | (nada)                                                    | con sesión → redirect a /dashboard      |
//   | DASHBOARD_ROUTE_PREFIXES  | (nada)                                                    | sin sesión → redirect a /login          |
//
// Antes de sumar una ruta acá: preguntate en cuál de las CUATRO va, y en cuáles NO va. Casi nunca va en
// todas. `test/proxy-auth-routes.test.ts` es el guardia permanente de esas reglas.

// ── Mantenimiento (kill switch) ─────────────────────────────────────────────────────────────────
// Rutas que NUNCA se cortan por mantenimiento: /api (webhooks de MercadoPago +
// crons) y /admin + /login para que el super-admin pueda entrar y apagar el switch.
//
// '/auth' (D-21): con la app en mantenimiento el kill switch devuelve 503 a todo lo demás, y un link de
// recuperación o de confirmación QUEMARÍA SU TOKEN contra una pantalla de mantenimiento — los links son
// single-use y vencen en 1h (D-19). El callback tiene que poder canjear el token siempre.
//
// OJO: '/forgot-password' y '/reset-password' NO se eximen a propósito. Si el sistema está caído no hay
// a dónde entrar igual, y /reset-password ESCRIBE en la base — el mantenimiento existe justo para que
// nadie escriba.
export const MAINT_EXEMPT = ['/api', '/admin', '/login', '/auth'] as const

// ── Rutas conocidas (las que pasan por updateSession) ───────────────────────────────────────────
export const KNOWN_PREFIXES = [
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
  // Recuperación de cuenta (D-22): mismo modo de falla que /admin justo acá arriba. Sin estos 3
  // prefijos, las rutas caen en el NextResponse.next() de proxy.ts (el que existe para que el booking
  // público /[slug] nunca vea las credenciales del dueño) y NO pasan por updateSession → la cookie de
  // sesión queda stale. El callback necesita sí o sí que la cookie que acaba de setear se propague.
  '/auth',
  '/forgot-password',
  '/reset-password',
  '/api',
  '/_next',
] as const

// ── Rutas de auth (con sesión abierta rebotan al dashboard) ─────────────────────────────────────
// ⚠ NO AGREGUES NINGUNA RUTA DE RECUPERACIÓN ACÁ. ⚠
// Sumar '/forgot-password' a esta lista ROMPE D-06: es el único camino para cambiar la contraseña (no
// existe pantalla de "cambiar contraseña" en el panel), así que rebotar al dueño que tiene la sesión
// abierta en el celu y no se acuerda la contraseña lo deja SIN SALIDA.
// El síntoma del bug es silencioso — nada falla en rojo, solo aparece en producción como:
// "con sesión abierta, la pantalla de recuperación me tira al dashboard".
// `test/proxy-auth-routes.test.ts` es el guardia permanente de esta lista.
export const AUTH_ROUTE_PREFIXES = ['/login', '/register'] as const

// ── Rutas del panel (sin sesión rebotan al login) ───────────────────────────────────────────────
// ⚠ NO AGREGUES NINGUNA RUTA DE RECUPERACIÓN ACÁ. ⚠
// Sumar '/reset-password' haría que el proxy redirija a /login a quien llega con un link válido pero
// todavía sin sesión — que es exactamente el "error opaco" que D-18 PROHÍBE (link vencido/usado debe
// caer en /forgot-password en estado de error, no en un rebote al login con toast). El guard de
// /reset-password va EN LA PÁGINA, no en el proxy (Pitfall 5).
export const DASHBOARD_ROUTE_PREFIXES = [
  '/dashboard',
  '/appointments',
  '/clients',
  '/finances',
  '/settings',
  '/onboarding',
  // CRM super-admin (D3, defensa en profundidad): un request a /admin sin
  // sesion se corta en el Edge antes de llegar al layout. Aca solo se
  // garantiza que HAY sesion; el chequeo de rol is_admin vive en el layout
  // del CRM (FND-01), no en el middleware.
  '/admin',
] as const

// ── Predicados ──────────────────────────────────────────────────────────────────────────────────
// ⚠ LAS DOS FAMILIAS MATCHEAN DISTINTO, A PROPÓSITO. ⚠
// - isMaintExempt / isKnownRoute (venían de proxy.ts) usan `=== p || startsWith(p + '/')`: '/auth'
//   cubre '/auth/callback' pero NO '/authentication'.
// - isAuthRoute / isDashboardRoute (venían de lib/supabase/middleware.ts) usan `startsWith(p)` PELADO.
// Esa diferencia es la que hay HOY EN PRODUCCIÓN. Esta extracción es behavior-preserving: se movió la
// definición, no se cambió ninguna semántica de matcheo. Unificarlas es un cambio de comportamiento —
// no se hace de paso.

/** Matcheo por segmento: `/auth` cubre `/auth/callback`, no `/authentication`. */
function matchesSegment(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** Matcheo por prefijo pelado (el que usa hoy `updateSession`). */
function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname.startsWith(p))
}

/** ¿La ruta sigue viva con la app en mantenimiento? (proxy.ts) */
export function isMaintExempt(pathname: string): boolean {
  return matchesSegment(pathname, MAINT_EXEMPT)
}

/** ¿La ruta pasa por `updateSession` (sesión refrescada) o cae en `NextResponse.next()`? (proxy.ts) */
export function isKnownRoute(pathname: string): boolean {
  return matchesSegment(pathname, KNOWN_PREFIXES)
}

/** ¿Es una pantalla de auth de la que hay que rebotar al que YA tiene sesión? (updateSession) */
export function isAuthRoute(pathname: string): boolean {
  return matchesPrefix(pathname, AUTH_ROUTE_PREFIXES)
}

/** ¿Es una pantalla del panel que exige sesión? (updateSession) */
export function isDashboardRoute(pathname: string): boolean {
  return matchesPrefix(pathname, DASHBOARD_ROUTE_PREFIXES)
}
