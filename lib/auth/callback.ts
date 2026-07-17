import type { EmailOtpType } from '@supabase/supabase-js'

// ── Módulo PURO del callback de auth (/auth/callback) ──────────────────────────────────────────
// Espejo de lib/crm-reports.ts y lib/booking-core.ts: SIN Supabase, SIN next/headers, SIN red. El
// único import es type-only, así que desaparece en el build.
//
// Por qué puro: es la pieza testeable de la superficie de auth. vitest.setup.ts:13 carga .env.local,
// que apunta a PRODUCCIÓN — un test que tuviera que instanciar Supabase para probar la allowlist
// terminaría hablándole a prod. Manteniendo el parse y la tabla de destinos acá, lib/auth/callback.test.ts
// corre sin red ni credenciales (H-06) y el route handler queda con una sola responsabilidad: canjear.
//
// Por qué NO hay parámetro de retorno (`next` / `redirect_to`): es la mitigación de open redirect
// (T-04-01) y es deliberada. En la superficie de auth un redirect abierto entrega la cuenta entera, y
// la defensa robusta no es sanitizar el input sino no tener superficie: el destino se deriva
// server-side de DESTINATIONS por `type`, y lo que no está en la tabla cae en INVALID_LINK_DEST.

// ── Constantes ─────────────────────────────────────────────────────────────────────────────────
// Allowlist CERRADA, validada en RUNTIME. `EmailOtpType` incluye `(string & {})` (ver
// node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:704), o sea que el tipo acepta CUALQUIER
// string: TypeScript no filtra nada acá. Este Set valida el `type` del path de MAIL (OTP), y `oauth`
// queda fuera a propósito y para siempre: OAuth vuelve con `?code=` y SIN `type`, así que se rutea por
// presencia de `code` en el route handler, no por `type` (Hallazgo Crítico #2 del 05-RESEARCH). Meter
// 'oauth' acá sería contraproducente: haría que un `token_hash=x&type=oauth` FABRICADO pasara el parse y
// fuera a verifyOtp, que no entiende ese tipo. lib/auth/callback.test.ts lo asierta como guardia.
const ALLOWED_TYPES = new Set<string>(['recovery', 'signup'])

// Tabla de destinos: la ÚNICA fuente del redirect post-canje. Phase 5 agrega una fila, no reescribe.
const DESTINATIONS: Record<string, string> = {
  recovery: '/reset-password', // D-03
  signup: '/onboarding', // D-13: usuario recién creado sin negocio → el wizard es lo único que puede hacer
  // /dashboard y NO /onboarding (AUTH-04, D-09): el layout de (dashboard) ya rebota a /onboarding cuando
  // el usuario no tiene negocio (app/(dashboard)/layout.tsx:23), así que UN solo destino sirve al usuario
  // nuevo (→onboarding) y al recurrente (→dashboard). Apuntar directo a /onboarding rompería al
  // recurrente (lo mandaría a re-onboardear).
  oauth: '/dashboard',
}

// Único destino de error de todo el flujo (D-18): el error y su solución en la misma pantalla, en un
// click. NUNCA un rebote al login con toast — eso es el "error opaco" que el criterio 2 de la fase prohíbe.
export const INVALID_LINK_DEST = '/forgot-password?error=invalid_link'

// ── Tipos ──────────────────────────────────────────────────────────────────────────────────────
// Retorno discriminado { ok: true, ... } | { ok: false } — el patrón de los helpers de validación del
// repo (lib/recaptcha.ts, lib/booking-core.ts).
export type ParsedCallback =
  | { ok: true; token_hash: string; type: EmailOtpType }
  | { ok: false }

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────
// Valida la query string del callback. Todo lo que llega en la URL es input NO confiable: viene de un
// link de mail abierto por un usuario anónimo.
export function parseCallbackParams(params: URLSearchParams): ParsedCallback {
  const token_hash = params.get('token_hash')
  const type = params.get('type')
  if (!token_hash || !type) return { ok: false }
  if (!ALLOWED_TYPES.has(type)) return { ok: false }
  return { ok: true, token_hash, type: type as EmailOtpType }
}

// Resuelve el destino post-canje desde la tabla. Ante cualquier input desconocido cae en
// INVALID_LINK_DEST: nunca devuelve ni concatena lo que recibió (T-04-01).
export function resolveDestination(type: string): string {
  return DESTINATIONS[type] ?? INVALID_LINK_DEST
}
