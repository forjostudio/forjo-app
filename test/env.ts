// Flags de skip graceful (D-03). Los tests de aislamiento (plan 05-02) necesitan creds del
// proyecto Supabase dev; si faltan, esos tests se skipean con aviso en vez de fallar el job.
// Los tests de webhook NO dependen de estos flags: stubean su propio secret (vi.stubEnv).

// hasSupabaseCreds: requiere las TRES vars (URL + anon + service-role). El test de aislamiento
// crea usuarios fixture con service-role y asierta con anon-key, así que necesita las tres.
export const hasSupabaseCreds =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY

// hasWebhookSecret: cualquiera de los dos secretos de webhook (prod o test) presente. Lo consumirá
// quien quiera correr los webhooks contra el secret del entorno en vez de stubearlo.
export const hasWebhookSecret =
  !!process.env.MP_WEBHOOK_SECRET || !!process.env.MP_WEBHOOK_SECRET_TEST

// hasStorageTests: flag EXPLÍCITO para correr los tests que golpean el Storage API (p. ej. el
// upload-gate de landing-assets, migr. 051). El Storage local está OFF (supabase/config.toml →
// [storage] enabled = false), así que en local estos casos deben SKIPEAR limpio en vez de fallar
// por "storage no disponible" (evita el falso rojo). Se prende SOLO en staging/CI con Storage
// hosteado (RUN_STORAGE_TESTS=true), donde el gate del bucket se puede verificar de verdad.
export const hasStorageTests = process.env.RUN_STORAGE_TESTS === 'true'

if (!hasSupabaseCreds) {
  // Aviso (no error): el job sigue verde, solo se skipean los tests de aislamiento (D-03).
  console.warn(
    '[test/env] Aislamiento RLS skipeado: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY'
  )
}
