import { createClient } from '@supabase/supabase-js'

// For server components in public routes — no cookies, always anon role.
// (El cliente público de browser se eliminó: la reserva pública ya no inserta ni lee con
// anon key, todo pasa por los route handlers server-side de /api/booking.)
export function createPublicServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
