import { describe, it, expect } from 'vitest'
import { parseCallbackParams, resolveDestination, INVALID_LINK_DEST } from '@/lib/auth/callback'

// ── Test PURO: sin red, sin credenciales, sin Supabase (H-06) ──────────────────────────────────
// REGLA DURA: vitest.setup.ts:13 hace config({ path: '.env.local' }) y ese archivo apunta a
// PRODUCCIÓN. Un test que llamara a signUp/resetPasswordForEmail crearía usuarios reales y quemaría
// la cuota de mails en prod. Por eso este archivo importa SOLO de @/lib/auth/callback y no hace red:
// nada de describe.skipIf(!hasSupabaseCreds) ni de import de test/env.ts — eso es la marca de un test
// de integración (contra-ejemplo: test/booking-public-regression.test.ts:20). El analog correcto es
// lib/crm-reports.test.ts.

const sp = (s: string) => new URLSearchParams(s)

// ── parseCallbackParams ────────────────────────────────────────────────────────────────────────
describe('parseCallbackParams', () => {
  it('acepta recovery con token_hash', () => {
    expect(parseCallbackParams(sp('token_hash=abc&type=recovery'))).toEqual({
      ok: true,
      token_hash: 'abc',
      type: 'recovery',
    })
  })

  it('acepta signup con token_hash', () => {
    expect(parseCallbackParams(sp('token_hash=abc&type=signup'))).toEqual({
      ok: true,
      token_hash: 'abc',
      type: 'signup',
    })
  })

  it('rechaza type fuera de la allowlist', () => {
    // 'oauth' todavía NO está permitido: lo suma Phase 5 a ALLOWED_TYPES a propósito (D-13).
    // Este test es el recordatorio de que ese día la allowlist cambia acá y en el módulo, no por
    // accidente. El resto son tipos reales de EmailOtpType que esta fase no rutea, más un intento
    // de path traversal.
    for (const t of ['oauth', 'magiclink', 'email_change', 'invite', '../../etc']) {
      expect(parseCallbackParams(sp(`token_hash=abc&type=${t}`)).ok).toBe(false)
    }
  })

  it('rechaza token_hash ausente o vacío', () => {
    expect(parseCallbackParams(sp('type=recovery')).ok).toBe(false)
    expect(parseCallbackParams(sp('token_hash=&type=recovery')).ok).toBe(false)
  })

  it('rechaza type ausente', () => {
    expect(parseCallbackParams(sp('token_hash=abc')).ok).toBe(false)
  })
})

// ── resolveDestination ─────────────────────────────────────────────────────────────────────────
describe('resolveDestination', () => {
  it('mapea los tipos conocidos', () => {
    expect(resolveDestination('recovery')).toBe('/reset-password') // D-03
    expect(resolveDestination('signup')).toBe('/onboarding') // D-13
  })

  it('nunca refleja input desconocido (anti open redirect, T-04-01)', () => {
    // Los tres primeros son los bypasses clásicos de un startsWith('/') (Pitfall 2 del RESEARCH):
    // '//evil.com' es protocol-relative, '/\evil.com' lo normalizan los browsers a '//evil.com', y
    // 'https://evil.com' es el caso obvio. El cuarto cubre el esquema javascript:.
    // La defensa NO es sanitizar: es que el destino sale de una tabla por `type` y el input jamás
    // se refleja ni se concatena. Este test queda de guardia para cuando Phase 5 evalúe sumar un
    // parámetro de retorno (`next`/`redirect_to`), que esta fase NO acepta a propósito.
    for (const evil of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)']) {
      expect(resolveDestination(evil)).toBe(INVALID_LINK_DEST) // D-18
    }
  })

  it('cae en INVALID_LINK_DEST ante un type vacío', () => {
    expect(resolveDestination('')).toBe(INVALID_LINK_DEST)
  })
})
