import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

// Guard server-side reutilizable para CADA server action / route handler del CRM (D4).
//
// POR QUÉ existe aparte del guard del layout: el guard del layout (Plan 02) solo protege el RENDER
// vía redirect(). Una server action o route handler invocada directo (curl, devtools, fetch a mano)
// NO pasa por el layout (Pitfall 2), así que sin esta re-validación quedaría desprotegida. Por eso
// cada action/handler del CRM debe llamar requireAdmin() en sus primeras líneas. La UI deshabilitada
// (ConfirmDialog) es solo refuerzo, NO la garantía.
//
// NOTA: este helper LANZA (no redirige) porque corre dentro de actions/handlers, no en un layout.
// El guard del layout usa redirect() en su lugar — no mezclar ambos.
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('unauthorized')

  // is_admin se lee de app_metadata (D1): vive en auth.users, no editable por el dueño (solo
  // service-role / admin API). NO se consulta la tabla businesses — is_admin NO es columna de negocio.
  if (user.app_metadata?.is_admin !== true) throw new Error('forbidden')

  // Devuelve el user: su id es el actorId para logAudit.
  return user
}
