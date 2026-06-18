import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock del admin client ───────────────────────────────────────────────────────────────
// logAudit escribe con service-role (createAdminClient bypassa RLS, D5). Acá interceptamos
// @/lib/supabase/admin para (a) no tocar la DB real y (b) espiar la llamada a from().insert(),
// para asertar el mapeo a snake_case y el manejo best-effort del error.

let insertSpy: ReturnType<typeof vi.fn>
let fromSpy: ReturnType<typeof vi.fn>
let insertResult: { error: { message: string } | null }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (...args: unknown[]) => fromSpy(...args),
  }),
}))

import { logAudit } from '@/lib/audit'

beforeEach(() => {
  insertResult = { error: null }
  insertSpy = vi.fn().mockImplementation(() => Promise.resolve(insertResult))
  fromSpy = vi.fn().mockReturnValue({ insert: (...args: unknown[]) => insertSpy(...args) })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logAudit', () => {
  it('Test 1: con todos los campos inserta en audit_log mapeando a snake_case', async () => {
    await logAudit({
      actorId: 'actor-1',
      action: 'business.suspend',
      targetType: 'business',
      targetId: 'biz-9',
      businessId: 'biz-9',
      risk: 'alto',
      reason: 'pago vencido',
      metadata: { plan: 'pro' },
    })

    expect(fromSpy).toHaveBeenCalledWith('audit_log')
    expect(insertSpy).toHaveBeenCalledWith({
      actor_id: 'actor-1',
      action: 'business.suspend',
      target_type: 'business',
      target_id: 'biz-9',
      business_id: 'biz-9',
      risk: 'alto',
      reason: 'pago vencido',
      metadata: { plan: 'pro' },
    })
  })

  it('Test 2: campos opcionales ausentes → null y metadata {} por default', async () => {
    await logAudit({
      actorId: 'actor-2',
      action: 'user.view',
      targetType: 'user',
      risk: 'bajo',
    })

    expect(insertSpy).toHaveBeenCalledWith({
      actor_id: 'actor-2',
      action: 'user.view',
      target_type: 'user',
      target_id: null,
      business_id: null,
      risk: 'bajo',
      reason: null,
      metadata: {},
    })
  })

  it('Test 3: error de insert → console.error prefijado y NO lanza (best-effort)', async () => {
    insertResult = { error: { message: 'boom' } }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      logAudit({ actorId: 'a', action: 'x', targetType: 't', risk: 'medio' }),
    ).resolves.toBeUndefined()

    expect(errSpy).toHaveBeenCalledWith('[audit/log] insert error:', 'boom')
  })
})
