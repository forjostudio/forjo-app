import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeMpCode } from '@/lib/mercadopago'
import { MP_RETURN, oauthReturnPath, resolveOAuthReturn, type MpErrorReason } from '@/lib/oauth-return'
import { negocioDelDueno } from '@/lib/negocio-del-dueno'

// Callback del OAuth de MercadoPago: valida el state, canjea el code y guarda las credenciales
// del negocio del dueño logueado. El access_token va a mp_access_token (lo usa el flujo de seña
// tal cual el modo manual). Vuelve con ?mp=connected|error al destino de la lista CERRADA de MP
// (`lib/oauth-return.ts`): /negocio por default (Integraciones del panel, NAV-02/D-06) o
// /onboarding/integraciones cuando el connect se inició desde el paso 5 del onboarding.
// Si la cuenta de MP ya está conectada a otro negocio (índice único de la migración 082 → 23505),
// vuelve con ?mp=error&motivo=cuenta-en-uso sin guardar secretos (quick 261124-obs).
export async function GET(request: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/$/, '')
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const saved = request.cookies.get('mp_oauth_state')?.value
  // Destino de vuelta (anti open-redirect T-05-02): la cookie guarda sólo un token y se vuelve a
  // normalizar acá; cualquier otra cosa (cookie ausente o editada) cae a /negocio. Se calcula ANTES de
  // `fail()` para que el error vuelva al mismo lugar que el éxito. No participa del chequeo de `state`.
  const returnPath = oauthReturnPath(resolveOAuthReturn(request.cookies.get('mp_oauth_from')?.value, MP_RETURN))

  // `motivo` sólo puede ser un token de la lista cerrada (MpErrorReason), nunca texto libre; sin motivo
  // la vuelta es el `?mp=error` genérico de siempre.
  const fail = (motivo?: MpErrorReason) => {
    const qs = motivo ? `?mp=error&motivo=${motivo}` : '?mp=error'
    const r = NextResponse.redirect(`${base}${returnPath}${qs}`)
    r.cookies.delete('mp_oauth_state')
    r.cookies.delete('mp_oauth_from')
    return r
  }

  if (!code || !state || !saved || state !== saved) return fail()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${base}/login`)

  const tokens = await exchangeMpCode(code)
  if (!tokens?.access_token) return fail()

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  // Resolver el business_id del dueño (necesario para keyear business_secrets por business_id).
  // negocioDelDueno (quick 261124-neg) en vez del single de PostgREST: con el single, un dueño con dos
  // negocios no podía conectar (2+ filas = error). Elige siempre el más viejo, el mismo que el panel.
  const negocio = await negocioDelDueno(supabase, user.id, 'id')
  if (!negocio.ok) return fail()
  const biz = negocio.business

  // mp_user_id NO es secreto (es el id de cuenta MP, el dashboard lo usa como flag de conexión)
  // → se queda en businesses. Lo escribimos con el session client (autorizado por owner_id).
  // La reconexión = conexión sana: seteamos mp_connection_status='connected' en el mismo update
  // owner-scoped (RLS owner-only), así se sana SOLO el negocio del dueño (MPCONN-05, D-06).
  // Filtrado por el id del negocio resuelto Y por owner_id: con sólo owner_id, un dueño con dos negocios
  // escribiría la misma cuenta en los dos (y con la 082 eso mismo chocaría). owner_id se mantiene como
  // defensa en profundidad.
  const { error: bizErr } = await supabase
    .from('businesses')
    .update({
      mp_user_id: tokens.user_id != null ? String(tokens.user_id) : null,
      mp_connection_status: 'connected',
    })
    .eq('id', biz.id)
    .eq('owner_id', user.id)
  if (bizErr?.code === '23505') {
    // La cuenta ya está conectada a otro negocio (índice businesses_mp_user_id_key, migración 082): es el
    // único único que este update puede pisar, porque sólo escribe mp_user_id y mp_connection_status.
    // El update es atómico, así que la fila conserva su mp_user_id y su estado anteriores; y como se
    // vuelve ANTES de escribir business_secrets, los tokens anteriores quedan intactos: si el negocio
    // tenía otra cuenta conectada, la conserva. Los tokens recién canjeados de la cuenta rechazada se
    // descartan sin persistirse. Se loguea sólo el código (el detail de PostgREST trae el valor).
    console.error('[mp/callback] la cuenta de MP ya está en otro negocio:', bizErr.code)
    return fail('cuenta-en-uso')
  }
  if (bizErr) {
    console.error('[mp/callback] guardar mp_user_id falló:', bizErr.message)
    return fail()
  }

  // Los 3 secretos MP van a business_secrets (migración 027), keyed por business_id. El upsert
  // del session client lo autoriza la policy owner-only de business_secrets (Pitfall F).
  const { error: secErr } = await supabase
    .from('business_secrets')
    .upsert({
      business_id: biz.id,
      mp_access_token: tokens.access_token,
      mp_refresh_token: tokens.refresh_token ?? null,
      mp_token_expires_at: expiresAt,
    }, { onConflict: 'business_id' })
  if (secErr) {
    console.error('[mp/callback] guardar secretos MP falló:', secErr.message)
    return fail()
  }

  const r = NextResponse.redirect(`${base}${returnPath}?mp=connected`)
  r.cookies.delete('mp_oauth_state')
  r.cookies.delete('mp_oauth_from')
  return r
}
