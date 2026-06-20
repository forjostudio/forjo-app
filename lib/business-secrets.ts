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

// ── Presencia de integraciones (booleanos, sin valores) ──────────────────────────────────
// Estado conectado/desconectado de cada integración del negocio, SIN exponer el valor crudo de
// ningún token/secreto. La impersonación read-only (Phase 3) necesita mostrar "conectado/
// desconectado" en la sección config (#4: antes esa sección no tenía fuente de datos) PERO nunca
// el valor del secreto: getBusinessSecrets (arriba) sigue siendo la única que devuelve valores y
// NO se llama bajo impersonación. Acotado por business_id; fila ausente → todo false.
export interface BusinessIntegrationStatus {
  mercadopago: boolean
  email: boolean
  recaptcha: boolean
  google: boolean
}

export async function getBusinessIntegrationStatus(
  businessId: string,
): Promise<BusinessIntegrationStatus> {
  const supabase = createAdminClient()

  // Solo las columnas necesarias para derivar presencia. El valor crudo se descarta tras el
  // mapeo a `!= null` — jamás se retorna el string del token/secreto.
  const { data } = await supabase
    .from('business_secrets')
    .select('mp_access_token, resend_api_key, recaptcha_secret_key, google_refresh_token')
    .eq('business_id', businessId)
    .maybeSingle()

  return {
    mercadopago: data?.mp_access_token != null,
    email: data?.resend_api_key != null,
    recaptcha: data?.recaptcha_secret_key != null,
    google: data?.google_refresh_token != null,
  }
}
