import { createAdminClient } from '@/lib/supabase/admin'

// ── Secretos por tenant ──────────────────────────────────────────────────────────────
// MÓDULO SERVER-ONLY. Nunca importar desde un client component ni desde lib/supabase/public.ts
// o server.ts: lee con el service role (createAdminClient), que bypassa RLS. Los 7 secretos
// viven en la tabla business_secrets (migración 027), keyed por business_id, con RLS solo-dueño.
export interface BusinessSecrets {
  mp_access_token: string | null
  mp_refresh_token: string | null
  // timestamptz; Supabase lo serializa como string ISO.
  mp_token_expires_at: string | null
  resend_api_key: string | null
  resend_from: string | null
  recaptcha_secret_key: string | null
  google_refresh_token: string | null
}

const EMPTY: BusinessSecrets = {
  mp_access_token: null,
  mp_refresh_token: null,
  mp_token_expires_at: null,
  resend_api_key: null,
  resend_from: null,
  recaptcha_secret_key: null,
  google_refresh_token: null,
}

const SECRET_COLUMNS =
  'mp_access_token, mp_refresh_token, mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token'

// Lee los 7 secretos de un negocio por business_id. SOLO service role (server-only).
// Lee primero de business_secrets; si no hay fila, FALLBACK a las columnas de businesses.
//
// El fallback existe SOLO durante la ventana de transición entre 027 (crea/copan los datos)
// y 028 (dropea las columnas-secreto en businesses, plan 01-05). Tras 028 esas columnas no
// existen → el fallback queda como no-op (devuelve EMPTY) y se removerá en el cleanup post-028.
export async function getBusinessSecrets(businessId: string): Promise<BusinessSecrets> {
  const supabase = createAdminClient()

  const { data: secrets } = await supabase
    .from('business_secrets')
    .select(SECRET_COLUMNS)
    .eq('business_id', businessId)
    .maybeSingle()

  if (secrets) return { ...EMPTY, ...(secrets as Partial<BusinessSecrets>) }

  // Fallback transición (pre-028): leer las mismas 7 columnas desde businesses.
  const { data: biz } = await supabase
    .from('businesses')
    .select(SECRET_COLUMNS)
    .eq('id', businessId)
    .maybeSingle()

  return biz ? { ...EMPTY, ...(biz as Partial<BusinessSecrets>) } : EMPTY
}
