import { createAdminClient } from '@/lib/supabase/admin'

// ── Estado de conexión de MercadoPago Connect (server-only) ───────────────────────────────
// MÓDULO SERVER-ONLY. Nunca importar desde un client component ni desde lib/supabase/public.ts
// o server.ts: escribe con el service role (createAdminClient), que bypassa RLS. El aislamiento por
// tenant lo garantiza el filtro por business_id resuelto SIEMPRE server-side (D-09) — jamás un id
// que venga del cliente ni bajo impersonación.
//
// Escribe el flag durable businesses.mp_connection_status (migración 053, MPCONN-03): marca la
// conexión del negocio como 'connected' (sana) o 'error' (caída). Lo consumen el resolver de token
// (Plan 01-02) y el callback OAuth; la Phase 2 (dashboard) lo lee para avisarle al dueño que reconecte.

// Actualiza el estado de conexión de MP de un negocio. Best-effort: marcar el estado es un side-effect
// (no debe romper el cobro ni el refresh), así que si la escritura falla solo se loguea y NO se re-lanza.
// `businessId` SIEMPRE resuelto server-side por el caller — nunca un id del cliente (D-09).
export async function setMpConnectionStatus(
  businessId: string,
  status: 'connected' | 'error',
): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('businesses')
      .update({ mp_connection_status: status })
      .eq('id', businessId)
    if (error) throw error
  } catch (e) {
    const msg = e instanceof Error ? e.message : e
    console.error(`[mp/connection] no pude escribir mp_connection_status (negocio ${businessId}):`, msg)
  }
}
