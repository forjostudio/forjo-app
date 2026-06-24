import { describe, it, expect } from 'vitest'
import {
  matchEntity,
  inboundSchema,
  isValidHandledByTransition,
  type HandledBy,
} from '@/lib/conversations'

// ── matchEntity ─────────────────────────────────────────────────────────────────────────────────
// El match asocia una conversación de WhatsApp a un lead existente por teléfono (normalizado AR) y,
// si no hay match de teléfono, por email (case-insensitive). Sin match → null (conversación queda
// asignada solo al negocio, lead_id null).
describe('matchEntity', () => {
  const leads = [
    { id: 'lead-1', whatsapp: '11 1234-5678', email: 'Ana@Mail.com' },
    { id: 'lead-2', whatsapp: '+54 9 351 765-4321', email: null },
    { id: 'lead-3', whatsapp: null, email: 'beto@mail.com' },
  ]

  it('matchea por teléfono normalizado (formatos distintos, mismo número)', () => {
    // El phone entrante viene del bot en otro formato pero normaliza al mismo 549...
    expect(matchEntity({ phone: '+5491112345678', email: null, leads })).toBe('lead-1')
  })

  it('matchea por teléfono aunque el lead lo tenga sin normalizar', () => {
    expect(matchEntity({ phone: '0351 15 765-4321', email: null, leads })).toBe('lead-2')
  })

  it('matchea por email case-insensitive cuando no hay match de teléfono', () => {
    expect(matchEntity({ phone: '99 0000-0000', email: 'ANA@mail.com', leads })).toBe('lead-1')
  })

  it('prioriza el match de teléfono sobre el de email', () => {
    // El teléfono matchea lead-2; el email matchearía lead-3 → gana el teléfono.
    expect(matchEntity({ phone: '+54 9 351 765-4321', email: 'beto@mail.com', leads })).toBe('lead-2')
  })

  it('matchea por email cuando el lead no tiene teléfono', () => {
    expect(matchEntity({ phone: '88 0000-0000', email: 'beto@mail.com', leads })).toBe('lead-3')
  })

  it('devuelve null si no hay match de teléfono ni de email', () => {
    expect(matchEntity({ phone: '88 0000-0000', email: 'nadie@mail.com', leads })).toBeNull()
  })

  it('devuelve null con email null y teléfono no normalizable sin match', () => {
    expect(matchEntity({ phone: '123', email: null, leads })).toBeNull()
  })

  it('devuelve null con lista de leads vacía', () => {
    expect(matchEntity({ phone: '+5491112345678', email: 'ana@mail.com', leads: [] })).toBeNull()
  })
})

// ── inboundSchema ───────────────────────────────────────────────────────────────────────────────
// El payload del bot es input NO confiable: zod lo valida antes de tocar la DB.
describe('inboundSchema', () => {
  const valid = {
    slug: 'mi-negocio',
    external_id: 'msg-abc-123',
    contact: { phone: '+5491112345678', name: 'Ana', email: 'ana@mail.com' },
    direction: 'inbound',
    body: 'Hola, quiero un turno',
    sender: 'contact',
    sent_at: '2026-06-24T18:00:00.000Z',
  }

  it('acepta un payload válido completo', () => {
    const r = inboundSchema.safeParse(valid)
    expect(r.success).toBe(true)
  })

  it('acepta un payload mínimo entrante (sin name/email/sent_at) y aplica el default de sender', () => {
    const r = inboundSchema.safeParse({
      slug: 'mi-negocio',
      external_id: 'msg-1',
      contact: { phone: '+5491112345678' },
      direction: 'inbound',
      body: 'Hola',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.sender).toBe('contact')
  })

  it('acepta un saliente con sender ai', () => {
    const r = inboundSchema.safeParse({
      slug: 'mi-negocio',
      external_id: 'msg-2',
      contact: { phone: '+5491112345678' },
      direction: 'outbound',
      body: 'Respuesta del bot',
      sender: 'ai',
    })
    expect(r.success).toBe(true)
  })

  it('rechaza una combinación incoherente direction/sender (inbound + ai)', () => {
    expect(
      inboundSchema.safeParse({ ...valid, direction: 'inbound', sender: 'ai' }).success,
    ).toBe(false)
  })

  it('rechaza una combinación incoherente direction/sender (outbound + contact)', () => {
    expect(
      inboundSchema.safeParse({ ...valid, direction: 'outbound', sender: 'contact' }).success,
    ).toBe(false)
  })

  it('rechaza payload sin slug', () => {
    const { slug: _omit, ...sinSlug } = valid
    void _omit
    expect(inboundSchema.safeParse(sinSlug).success).toBe(false)
  })

  it('rechaza payload sin external_id', () => {
    const { external_id: _omit, ...sinId } = valid
    void _omit
    expect(inboundSchema.safeParse(sinId).success).toBe(false)
  })

  it('rechaza direction inválida', () => {
    expect(inboundSchema.safeParse({ ...valid, direction: 'sideways' }).success).toBe(false)
  })

  it('rechaza contact sin phone', () => {
    expect(inboundSchema.safeParse({ ...valid, contact: { name: 'Ana' } }).success).toBe(false)
  })

  it('rechaza sender fuera del enum', () => {
    expect(inboundSchema.safeParse({ ...valid, sender: 'bot' }).success).toBe(false)
  })
})

// ── isValidHandledByTransition ──────────────────────────────────────────────────────────────────
// El universo de estados es exactamente {'unassigned','ai','human'}.
describe('isValidHandledByTransition', () => {
  it('acepta ai → human (tomar conversación)', () => {
    expect(isValidHandledByTransition('ai', 'human')).toBe(true)
  })

  it('acepta human → ai (liberar conversación)', () => {
    expect(isValidHandledByTransition('human', 'ai')).toBe(true)
  })

  it('acepta unassigned → human', () => {
    expect(isValidHandledByTransition('unassigned', 'human')).toBe(true)
  })

  it('rechaza una transición a sí mismo (no es un cambio)', () => {
    expect(isValidHandledByTransition('ai', 'ai')).toBe(false)
  })

  it('rechaza un estado destino fuera del universo', () => {
    // @ts-expect-error — destino inválido a propósito
    expect(isValidHandledByTransition('ai', 'pausado')).toBe(false)
  })

  it('el tipo HandledBy cubre los tres estados', () => {
    const all: HandledBy[] = ['unassigned', 'ai', 'human']
    expect(all).toHaveLength(3)
  })
})
