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
// Fuente única: la tabla business_secrets. Las columnas-secreto ya NO existen en businesses
// (dropeadas en la migración 028, plan 01-05), así que no hay fallback: si no hay fila en
// business_secrets, el negocio no tiene secretos cargados → se devuelve EMPTY.
export async function getBusinessSecrets(businessId: string): Promise<BusinessSecrets> {
  const supabase = createAdminClient()

  const { data: secrets } = await supabase
    .from('business_secrets')
    .select(SECRET_COLUMNS)
    .eq('business_id', businessId)
    .maybeSingle()

  return secrets ? { ...EMPTY, ...(secrets as Partial<BusinessSecrets>) } : EMPTY
}
