import { describe, it, expect } from 'vitest'
import {
  createDealSchema,
  moveStageSchema,
  markLostSchema,
  convertLeadSchema,
  linkLeadOnSignupSchema,
  createTagSchema,
  assignTagSchema,
  removeTagSchema,
  createNoteSchema,
  editNoteSchema,
  createTaskSchema,
  completeTaskSchema,
} from './_crm-actions.schemas'
import { STAGES } from '@/lib/crm-pipeline'

// UUID v4 válido de prueba (los schemas usan z.uuid()).
const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

// ── stage enum calcado de STAGES ──────────────────────────────────────────────────────────────
describe('stage enum (calcado de STAGES, no literal duplicado)', () => {
  it('acepta cada key de STAGES', () => {
    for (const s of STAGES) {
      expect(moveStageSchema.safeParse({ dealId: UUID, stage: s.key }).success).toBe(true)
    }
  })
  it('rechaza un stage fuera de STAGES', () => {
    expect(moveStageSchema.safeParse({ dealId: UUID, stage: 'ganado' }).success).toBe(false)
  })
})

// ── createDealSchema ────────────────────────────────────────────────────────────────────────────
describe('createDealSchema', () => {
  it('acepta nombre + default stage lead + valueArs 0', () => {
    const res = createDealSchema.safeParse({ leadName: 'Acme' })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.stage).toBe('lead')
      expect(res.data.valueArs).toBe(0)
    }
  })
  it('normaliza email a lowercase', () => {
    const res = createDealSchema.safeParse({ leadName: 'Acme', leadEmail: 'HOLA@ACME.COM' })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.leadEmail).toBe('hola@acme.com')
  })
  it('rechaza leadName vacío', () => {
    expect(createDealSchema.safeParse({ leadName: '   ' }).success).toBe(false)
  })
  it('rechaza valueArs negativo', () => {
    expect(createDealSchema.safeParse({ leadName: 'Acme', valueArs: -1 }).success).toBe(false)
  })
})

// ── markLostSchema ───────────────────────────────────────────────────────────────────────────────
describe('markLostSchema', () => {
  it('exige motivo no vacío', () => {
    expect(markLostSchema.safeParse({ dealId: UUID, reason: 'no tiene presupuesto' }).success).toBe(true)
    expect(markLostSchema.safeParse({ dealId: UUID, reason: '  ' }).success).toBe(false)
  })
})

// ── convertLeadSchema ─────────────────────────────────────────────────────────────────────────────
describe('convertLeadSchema', () => {
  it('exige dos uuids', () => {
    expect(convertLeadSchema.safeParse({ leadId: UUID, businessId: UUID2 }).success).toBe(true)
    expect(convertLeadSchema.safeParse({ leadId: 'abc', businessId: UUID2 }).success).toBe(false)
  })
})

// ── linkLeadOnSignupSchema (anti-tampering) ───────────────────────────────────────────────────────
describe('linkLeadOnSignupSchema', () => {
  it('solo acepta businessId (el email se re-deriva server-side)', () => {
    expect(linkLeadOnSignupSchema.safeParse({ businessId: UUID }).success).toBe(true)
  })
  it('NO incluye email ni leadId en la forma parseada (campos extra se descartan)', () => {
    const res = linkLeadOnSignupSchema.safeParse({ businessId: UUID, email: 'x@y.com', leadId: UUID2 })
    expect(res.success).toBe(true)
    if (res.success) {
      expect('email' in res.data).toBe(false)
      expect('leadId' in res.data).toBe(false)
    }
  })
})

// ── createTagSchema ───────────────────────────────────────────────────────────────────────────────
describe('createTagSchema', () => {
  it('exige label y color no vacíos', () => {
    expect(createTagSchema.safeParse({ label: 'VIP', color: 'var(--crm-info)' }).success).toBe(true)
    expect(createTagSchema.safeParse({ label: '', color: 'x' }).success).toBe(false)
    expect(createTagSchema.safeParse({ label: 'VIP', color: '  ' }).success).toBe(false)
  })
})

// ── assignTagSchema / removeTagSchema ─────────────────────────────────────────────────────────────
describe('assignTagSchema / removeTagSchema', () => {
  it('acepta entityType lead|business', () => {
    expect(assignTagSchema.safeParse({ tagId: UUID, entityType: 'lead', entityId: UUID2 }).success).toBe(true)
    expect(removeTagSchema.safeParse({ tagId: UUID, entityType: 'business', entityId: UUID2 }).success).toBe(true)
  })
  it('rechaza entityType fuera de (lead, business)', () => {
    expect(assignTagSchema.safeParse({ tagId: UUID, entityType: 'deal', entityId: UUID2 }).success).toBe(false)
  })
  it('exige uuids', () => {
    expect(assignTagSchema.safeParse({ tagId: 'x', entityType: 'lead', entityId: UUID2 }).success).toBe(false)
  })
})

// ── createNoteSchema / editNoteSchema ─────────────────────────────────────────────────────────────
describe('notes schemas', () => {
  it('createNote rechaza body vacío', () => {
    expect(createNoteSchema.safeParse({ leadId: UUID, body: 'seguimiento' }).success).toBe(true)
    expect(createNoteSchema.safeParse({ leadId: UUID, body: '   ' }).success).toBe(false)
  })
  it('createNote acepta sin businessId ni leadId (ambos opcionales)', () => {
    expect(createNoteSchema.safeParse({ body: 'nota suelta' }).success).toBe(true)
  })
  it('editNote exige noteId uuid + body', () => {
    expect(editNoteSchema.safeParse({ noteId: UUID, body: 'corregido' }).success).toBe(true)
    expect(editNoteSchema.safeParse({ noteId: 'x', body: 'corregido' }).success).toBe(false)
  })
})

// ── createTaskSchema / completeTaskSchema ─────────────────────────────────────────────────────────
describe('tasks schemas', () => {
  it('createTask exige title; dueDate ISO opcional', () => {
    expect(createTaskSchema.safeParse({ leadId: UUID, title: 'Llamar' }).success).toBe(true)
    expect(createTaskSchema.safeParse({ leadId: UUID, title: 'Llamar', dueDate: '2026-07-01' }).success).toBe(true)
    expect(createTaskSchema.safeParse({ leadId: UUID, title: '' }).success).toBe(false)
  })
  it('createTask rechaza dueDate mal formada', () => {
    expect(createTaskSchema.safeParse({ title: 'Llamar', dueDate: 'mañana' }).success).toBe(false)
  })
  it('completeTask exige taskId uuid + done boolean', () => {
    expect(completeTaskSchema.safeParse({ taskId: UUID, done: true }).success).toBe(true)
    expect(completeTaskSchema.safeParse({ taskId: UUID, done: 'si' }).success).toBe(false)
  })
})
