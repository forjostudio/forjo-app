import { createAdminClient } from '@/lib/supabase/admin'

// Nivel de riesgo de la acción auditada. Coincide con el check de la columna `risk`
// en la migración 031 (audit_log).
export type Risk = 'alto' | 'medio' | 'bajo'

// Entrada de logAudit: un único objeto (patrón del proyecto para >2 params).
export interface AuditInput {
  // Nullable: acciones del sistema / callers externos sin sesión (ej. set-plan gateado por
  // x-admin-secret) registran actor_id NULL → "Sistema" en el visor de auditoría (migración 033).
  actorId: string | null
  action: string
  targetType: string
  targetId?: string | null
  businessId?: string | null
  risk: Risk
  reason?: string | null
  metadata?: Record<string, unknown>
}

// Registra una acción sensible del CRM super-admin en audit_log.
//
// Usa service-role (createAdminClient, bypassa RLS) PORQUE audit_log no tiene policy de insert
// para usuarios: solo el service-role escribe (D5), así el registro no es falsificable.
//
// Es BEST-EFFORT: si el insert falla, NO lanza — loguea con prefijo [audit/log] y retorna. Una
// falla de auditoría no debe tumbar la acción de negocio que ya se ejecutó (mismo criterio que los
// efectos no críticos del proyecto). El llamador NO debe envolver esto en lógica de rollback.
export async function logAudit(input: AuditInput): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase.from('audit_log').insert({
    actor_id: input.actorId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    business_id: input.businessId ?? null,
    risk: input.risk,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  })

  if (error) {
    console.error('[audit/log] insert error:', error.message)
    return
  }
}
