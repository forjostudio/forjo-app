import { createClient } from '@/lib/supabase/server'
import { AuditoriaClient, type AuditRow } from './auditoria-client'

/**
 * Visor read-only de auditoría (FND-02 lectura, UI-SPEC §"Table — audit-log look").
 *
 * Lee `audit_log` con la SESIÓN del operador (`createClient()` → anon key + cookies), NO con
 * el cliente service-role. La garantía de aislamiento es la policy RLS admin-read de la
 * migración 031 ("admin read audit_log": SELECT solo si app_metadata.is_admin === 'true'),
 * NO el cliente. Leer con service-role bypassaría la RLS y expondría todo el log sin pasar por la
 * policy (threat T-01-09) — por eso se evita explícitamente en lectura.
 *
 * Defensa en profundidad: el layout `(crm)` ya redirige a un no-admin antes de este render, así
 * que un usuario sin is_admin nunca llega acá; aun si llegara, la RLS no le devolvería filas.
 *
 * Scope: el visor es read-only y muestra lo que `logAudit` haya escrito. En Phase 1 el log puede
 * estar vacío hasta que corran acciones sensibles (Phases 2+) — el empty state lo cubre. El valor
 * de Phase 1 es el contrato de tabla + RiskBadge + tabs ya probado para Phases 2+.
 */
export default async function AuditoriaPage() {
  const supabase = await createClient()

  // SELECT explícito (sin comodín) ordenado por created_at desc, con límite razonable.
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, target_type, target_id, business_id, risk, reason, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  // Error de lectura (best-effort): se renderiza el visor con lista vacía + flag de error para
  // que el cliente muestre el estado de error en vez de un empty state engañoso.
  if (error) {
    console.error('[crm/auditoria] read error:', error.message)
  }

  const rows: AuditRow[] = (data ?? []) as AuditRow[]

  return <AuditoriaClient rows={rows} loadError={Boolean(error)} />
}
