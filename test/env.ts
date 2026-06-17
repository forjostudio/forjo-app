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

if (!hasSupabaseCreds) {
  // Aviso (no error): el job sigue verde, solo se skipean los tests de aislamiento (D-03).
  console.warn(
    '[test/env] Aislamiento RLS skipeado: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY'
  )
}
