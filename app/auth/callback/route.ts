import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCallbackParams, resolveDestination, INVALID_LINK_DEST } from '@/lib/auth/callback'

// Callback de los links de mail: canjea el token_hash por una sesión (cookies) y manda al destino que
// corresponde al tipo de link. Estrena `recovery` (D-03) y `signup` (D-13).
//
// Por qué token_hash + verifyOtp y NO code + exchangeCodeForSession: @supabase/ssr fuerza
// flowType: 'pkce', y exchangeCodeForSession exige el code_verifier que dejó en el storage el navegador
// que INICIÓ el flujo. Un link de mail se abre en cualquier lado — típicamente el webview in-app de
// Gmail — donde ese verifier no existe y el canje falla (H-03). verifyOtp no depende del navegador de
// origen: el token viaja en el link y GoTrue lo valida solo.
//
// Esta fase NO acepta parámetro de retorno (`next` / `redirect_to`) a propósito: el destino se deriva
// server-side de la tabla por `type` (ver lib/auth/callback.ts). Es la mitigación de open redirect
// (T-04-01) — en auth, un redirect abierto entrega la cuenta entera.
//
// Va en app/auth/callback/ (path literal), fuera de todo route group: `(auth)` no aporta URL (H-04).
export async function GET(request: NextRequest) {
  // Un solo destino de error para TODO el flujo (D-18): parse fallido, link vencido o ya usado caen
  // en la misma /forgot-password con el aviso arriba y el campo listo. Nunca un rebote al login con
  // toast — ese es el "error opaco" que el criterio 2 de la fase prohíbe.
  // 303 explícito: el default de NextResponse.redirect es 307, que PRESERVA el método
  // (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:212-214). Acá el
  // navegador debe hacer GET del destino.
  const fail = () => NextResponse.redirect(new URL(INVALID_LINK_DEST, request.url), 303)

  // 1 — PARSE + VALIDAR. Todo lo que viene en la URL es input no confiable (usuario anónimo).
  const parsed = parseCallbackParams(request.nextUrl.searchParams)
  if (!parsed.ok) {
    // Se loguea distinto del fallo del canje a propósito: si el template del mail quedó mal armado
    // (sin {{ .TokenHash }} o sin type), el error aparece ACÁ y no en verifyOtp. Esa distinción hace
    // el diagnóstico obvio. ⚠ Nunca loguear request.url ni el token_hash: la query string termina en
    // los logs de Vercel (T-04-02).
    console.error('[auth/callback] parametros invalidos: falta token_hash o type fuera de la allowlist')
    return fail()
  }

  // Cliente anon + cookies. NUNCA el cliente de service role: este endpoint lo alcanza un usuario
  // ANÓNIMO desde un link de mail; el service role bypassa RLS y no tiene nada que hacer acá
  // (T-04-04). El setAll de lib/supabase/server.ts persiste las cookies que crea verifyOtp — en un
  // route handler cookies() es escribible, así que su catch no dispara. No escribir un cliente nuevo.
  const supabase = await createClient()

  // 2 — CANJEAR. ÚNICO punto de extensión de la Phase 5: acá suma la rama `code` →
  // exchangeCodeForSession para el oauth, sin tocar los pasos 1, 3 ni 4 (D-13; ROADMAP §Phase 5:
  // "suma oauth, no reescribe"). verifyOtp quema el token (single-use) y respeta otp_expiry (D-19).
  const { error } = await supabase.auth.verifyOtp({
    token_hash: parsed.token_hash,
    type: parsed.type,
  })

  if (error) {
    // Solo el .message: nunca la URL ni el token (T-04-02).
    console.error('[auth/callback] verifyOtp:', error.message)
    return fail() // link vencido o ya usado (D-18, D-19)
  }

  // 3 — RESOLVER DESTINO. Derivado server-side de la tabla por `type`, no del input.
  const dest = resolveDestination(parsed.type)

  // 4 — REDIRECT + SCRUB. El destino es una URL LIMPIA: el token sale de la barra y del Referer.
  // new URL(dest, request.url) en vez de una base armada con NEXT_PUBLIC_APP_URL: no depende de
  // una env var. Referrer-Policy: no-referrer es la capa 3 de la mitigación de fuga del token
  // (T-04-02). No se usa redirect() de next/navigation: lanza NEXT_REDIRECT y no permite adjuntar
  // headers ni cookies a la respuesta — y acá hacen falta Set-Cookie (sesión) + Referrer-Policy en
  // la MISMA respuesta (precedente: app/(dashboard)/layout.tsx:27-29).
  const res = NextResponse.redirect(new URL(dest, request.url), 303)
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
