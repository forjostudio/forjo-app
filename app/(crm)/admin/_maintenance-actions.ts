'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Modo mantenimiento (kill switch global) ───────────────────────────────────────────────────
// Prende/apaga app_settings.maintenance. El middleware lee ese flag y corta lo público (503) sin
// tocar env ni redeploy. Mismo patrón que las actions del CRM: requireAdmin() PRIMERA línea
// (endpoint POST invocable directo), service-role para la escritura, logAudit, revalidatePath.
export async function setMaintenance(on: boolean): Promise<void> {
  const actor = await requireAdmin()
  const value = on === true

  const admin = createAdminClient()
  const { error } = await admin
    .from('app_settings')
    .update({ maintenance: value, updated_at: new Date().toISOString() })
    .eq('id', 'default')
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'app.maintenance',
    targetType: 'app',
    targetId: 'default',
    risk: 'alto',
    metadata: { maintenance: value },
  })

  revalidatePath('/admin')
}
