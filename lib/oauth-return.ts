// ── Destino de vuelta de los OAuth (MercadoPago Connect y Google Calendar) ───────────────────────
// Lista CERRADA de destinos (anti open-redirect T-05-02). El connect recibe `?from=<token>` del
// cliente y lo guarda en una cookie httpOnly (`mp_oauth_from` / `g_oauth_from`); el callback la lee y
// arma el `Location`. Las dos puntas normalizan contra la MISMA lista del proveedor (los presets de
// abajo), así que ni el query ni una cookie editada a mano pueden elegir un destino fuera de ella.
//
// Por qué la cookie guarda el TOKEN y no el path: un path crudo en la cookie (o en el query) es un
// open-redirect esperando a pasar (`//evil.example`, `https://…`). Con el token, el path sale
// únicamente de `oauthReturnPath`, que es un `switch` exhaustivo y no un objeto indexado: con un
// objeto, `'__proto__'`/`'constructor'` resolverían a algo; con el `switch` no matchean nunca.
//
// Módulo puro (sin Next ni Supabase) y FUERA de `lib/mercadopago.ts`: `test/mp-cobro-callback.test.ts`
// mockea ese módulo entero, y un helper metido ahí quedaría `undefined` en el callback bajo test.

export type OAuthReturnToken = 'negocio' | 'agenda' | 'onboarding'

export interface OAuthReturnPolicy {
  allowed: readonly OAuthReturnToken[]
  fallback: OAuthReturnToken
}

/** Path del sitio para cada token. Siempre relativo (una sola `/` y una letra). */
export function oauthReturnPath(token: OAuthReturnToken): string {
  switch (token) {
    case 'negocio':
      return '/negocio'
    case 'agenda':
      return '/agenda'
    case 'onboarding':
      return '/onboarding/integraciones'
  }
}

/**
 * Normaliza un valor crudo (query o cookie) contra los tokens que ESE proveedor acepta. Devuelve el
 * valor sólo si está textual en `policy.allowed`; cualquier otra cosa —vacío, mayúsculas, espacios,
 * un path, una URL— cae a `policy.fallback`.
 */
export function resolveOAuthReturn(
  raw: string | null | undefined,
  policy: OAuthReturnPolicy,
): OAuthReturnToken {
  if (typeof raw !== 'string') return policy.fallback
  const match = policy.allowed.find(t => t === raw)
  return match ?? policy.fallback
}

// MercadoPago: el panel (Negocio → Integraciones, sin `from`) y el paso 5 del onboarding. NO acepta
// `agenda`: la Agenda sólo maneja `?google=`, así que un `?mp=` ahí quedaría sin aviso y sin limpiar.
export const MP_RETURN: Readonly<OAuthReturnPolicy> = {
  allowed: ['negocio', 'onboarding'] as const,
  fallback: 'negocio',
}

// Google Calendar: la Agenda (default de hoy, sin `from`), Negocio → Integraciones (`from=negocio`) y
// el paso 5 del onboarding.
export const GOOGLE_RETURN: Readonly<OAuthReturnPolicy> = {
  allowed: ['negocio', 'agenda', 'onboarding'] as const,
  fallback: 'agenda',
}
