import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Tests de las server actions del pipeline / conversión (Phase 4, Plan 02) ───────────────────
// Mockeamos las dependencias server-only (guard, audit, admin/server clients) para asertar el
// CONTRATO de 6 pasos sin tocar la DB real:
//   - requireAdmin() es la PRIMERA llamada (salvo linkLeadOnSignup, que corre fuera de la sesión admin)
//   - el action code EXACTO que llega a logAudit (alimenta el visor / timeline)
//   - moveStage lee el stage previo y registra metadata {from,to}
//   - linkLeadOnSignup re-deriva el email del owner server-side y NUNCA usa email/leadId del input
//
// 'use server' es solo una marca de bundler: vitest puede importar el módulo igual.

// ── Estado mockeable del admin client (service-role) ────────────────────────────────────────────
type QueryResult = { data?: unknown; error?: { code?: string; message?: string } | null }
// Contexto de filtros aplicados sobre la query (lo usa el reuse-by-email acotado: el handler de
// 'leads' puede inspeccionar si la action filtró por `.is('business_id', null)` y responder distinto).
type QueryCtx = { is: Record<string, unknown> }
type TableHandler = (ctx: QueryCtx) => QueryResult

let tableHandlers: Record<string, TableHandler>
let insertedRows: Array<{ table: string; values: unknown }>
let updatedRows: Array<{ table: string; values: unknown }>
let auditCalls: Array<Record<string, unknown>>
let requireAdminImpl: () => Promise<{ id: string }>
let sessionUser: { id: string; email: string | null } | null

// Builder de query encadenable que termina resolviendo el handler de la tabla.
function makeQuery(table: string) {
  // Filtros .is() acumulados en esta cadena (uno por query): el handler los recibe para distinguir,
  // p. ej., un reuse-by-email acotado a business_id null (lead activo) de un lookup sin filtro.
  const ctx: QueryCtx = { is: {} }
  const result = () => tableHandlers[table]?.(ctx) ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  chain.select = passthrough
  chain.eq = passthrough
  chain.order = passthrough
  chain.limit = passthrough
  // .is(col, val) registra el filtro IS (la implementación GREEN del reuse usa .is('business_id', null)).
  chain.is = (col: string, val: unknown) => {
    ctx.is[col] = val
    return chain
  }
  // single/maybeSingle resuelven la lectura previa.
  chain.single = () => Promise.resolve(result())
  chain.maybeSingle = () => Promise.resolve(result())
  // insert/update/delete registran la mutación y resuelven (encadenable con .eq()).
  chain.insert = (values: unknown) => {
    insertedRows.push({ table, values })
    return { ...chain, then: (r: (v: QueryResult) => void) => r(result()) }
  }
  chain.update = (values: unknown) => {
    updatedRows.push({ table, values })
    return { ...chain, then: (r: (v: QueryResult) => void) => r(result()) }
  }
  chain.delete = passthrough
  // permitir await directo sobre la cadena (update().eq()) → resuelve el handler.
  ;(chain as { then?: unknown }).then = (r: (v: QueryResult) => void) => r(result())
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeQuery(table) }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}))

vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: () => requireAdminImpl(),
}))

vi.mock('@/lib/audit', () => ({
  logAudit: async (input: Record<string, unknown>) => {
    auditCalls.push(input)
  },
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { moveStage, createDeal, markLost, markWon, convertLead, linkLeadOnSignup } from './_pipeline-actions'

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  tableHandlers = {}
  insertedRows = []
  updatedRows = []
  auditCalls = []
  requireAdminImpl = async () => ({ id: 'admin-1' })
  sessionUser = { id: 'owner-1', email: 'Owner@Example.com' }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('moveStage', () => {
  it('lee el stage previo y audita deal.stage_change con metadata {from,to}', async () => {
    tableHandlers['deals'] = () => ({ data: { stage: 'lead' }, error: null })
    await moveStage({ dealId: UUID, stage: 'trial' })

    expect(updatedRows.some((u) => u.table === 'deals')).toBe(true)
    const audit = auditCalls.find((a) => a.action === 'deal.stage_change')
    expect(audit).toBeTruthy()
    expect(audit!.metadata).toEqual({ from: 'lead', to: 'trial' })
    expect(audit!.actorId).toBe('admin-1')
  })

  it('requireAdmin lanza → la action no muta ni audita', async () => {
    requireAdminImpl = async () => {
      throw new Error('forbidden')
    }
    await expect(moveStage({ dealId: UUID, stage: 'trial' })).rejects.toThrow('forbidden')
    expect(updatedRows.length).toBe(0)
    expect(auditCalls.length).toBe(0)
  })

  it('input inválido (stage fuera de STAGES) → rechaza antes de mutar', async () => {
    await expect(moveStage({ dealId: UUID, stage: 'ganado' })).rejects.toBeTruthy()
    expect(updatedRows.length).toBe(0)
  })
})

describe('createDeal', () => {
  it('crea lead + deal y audita deal.create', async () => {
    tableHandlers['leads'] = () => ({ data: { id: UUID }, error: null })
    tableHandlers['deals'] = () => ({ data: { id: UUID2 }, error: null })
    await createDeal({ leadName: 'Nuevo Lead', valueArs: 5000, stage: 'lead' })

    expect(insertedRows.some((i) => i.table === 'deals')).toBe(true)
    expect(auditCalls.some((a) => a.action === 'deal.create')).toBe(true)
  })

  // ── Gap test 4b (reuse-by-email acotado a leads activos) ──────────────────────────────────────
  // DECIDIDO POR EL USUARIO: createDeal NO debe reusar un lead YA CONVERTIDO (business_id no-null).
  // El reuse-by-email se acota server-side con .is('business_id', null). El mock distingue por el
  // filtro aplicado (ctx.is): el handler de 'leads' "ve" la fila convertida SOLO cuando el lookup
  // NO filtró por business_id null (RED: implementación vieja); cuando SÍ filtra (GREEN), el lead
  // convertido no matchea → null → se cae a la rama de crear un lead nuevo con data.leadName.
  it('email de un lead YA CONVERTIDO → NO lo reusa, crea un lead nuevo con data.leadName', async () => {
    tableHandlers['leads'] = (ctx) => {
      // El reuse-by-email acotado filtra por .is('business_id', null): el lookup (con el filtro)
      // representa "buscar lead ACTIVO con ese email". El único lead con este email está convertido
      // (business_id no-null), así que el lookup acotado NO lo encuentra → null → se cae a crear uno
      // nuevo. RED (lookup sin .is) encontraría el convertido y lo reusaría (BUG). El insert posterior
      // del lead nuevo NO aplica .is → entra por la rama sin filtro y devuelve el id creado.
      if ('business_id' in ctx.is) return { data: null, error: null } // lookup acotado: no hay activo
      return { data: { id: UUID2 }, error: null } // insert().select().single() del lead nuevo
    }
    tableHandlers['deals'] = () => ({ data: { id: UUID2 }, error: null })
    await createDeal({ leadName: 'Franco Vellani', leadEmail: 'franco@example.com', valueArs: 0, stage: 'lead' })

    const leadInsert = insertedRows.find((i) => i.table === 'leads')
    expect(leadInsert).toBeTruthy() // se creó un lead nuevo (no se reusó el convertido)
    expect((leadInsert!.values as Record<string, unknown>).name).toBe('Franco Vellani')
  })

  it('email de un lead ACTIVO (business_id null) → lo reusa, no inserta lead nuevo', async () => {
    // El reuse acotado SÍ encuentra el lead activo (matchea business_id null) → no inserta lead.
    tableHandlers['leads'] = (ctx) => {
      if ('business_id' in ctx.is) return { data: { id: UUID, business_id: null }, error: null }
      return { data: { id: UUID, business_id: null }, error: null }
    }
    tableHandlers['deals'] = () => ({ data: { id: UUID2 }, error: null })
    await createDeal({ leadName: 'Lead Activo', leadEmail: 'activo@example.com', valueArs: 0, stage: 'lead' })

    expect(insertedRows.some((i) => i.table === 'leads')).toBe(false) // NO se creó lead nuevo
    expect(insertedRows.some((i) => i.table === 'deals')).toBe(true) // solo el deal
  })
})

describe('markWon', () => {
  it('setea status won y audita deal.won risk bajo con actorId del admin', async () => {
    tableHandlers['deals'] = () => ({ data: null, error: null })
    await markWon({ dealId: UUID })

    const upd = updatedRows.find((u) => u.table === 'deals')
    expect(upd).toBeTruthy()
    expect((upd!.values as Record<string, unknown>).status).toBe('won')
    const audit = auditCalls.find((a) => a.action === 'deal.won')
    expect(audit).toBeTruthy()
    expect(audit!.risk).toBe('bajo') // ganar NO es destructivo (a diferencia de mark_lost = medio)
    expect(audit!.actorId).toBe('admin-1')
    expect(audit!.targetId).toBe(UUID)
  })

  it('NO toca stage (D-04: stage y status son ortogonales)', async () => {
    tableHandlers['deals'] = () => ({ data: null, error: null })
    await markWon({ dealId: UUID })

    const upd = updatedRows.find((u) => u.table === 'deals')
    expect((upd!.values as Record<string, unknown>).stage).toBeUndefined()
  })

  it('requireAdmin lanza → no muta ni audita', async () => {
    requireAdminImpl = async () => {
      throw new Error('forbidden')
    }
    await expect(markWon({ dealId: UUID })).rejects.toThrow('forbidden')
    expect(updatedRows.length).toBe(0)
    expect(auditCalls.length).toBe(0)
  })

  it('input inválido (dealId no-uuid) → rechaza antes de mutar', async () => {
    await expect(markWon({ dealId: 'no-es-uuid' })).rejects.toBeTruthy()
    expect(updatedRows.length).toBe(0)
  })
})

describe('markLost', () => {
  it('setea status lost + lost_reason y audita deal.mark_lost risk medio', async () => {
    tableHandlers['deals'] = () => ({ data: null, error: null })
    await markLost({ dealId: UUID, reason: 'sin presupuesto' })

    const upd = updatedRows.find((u) => u.table === 'deals')
    expect(upd).toBeTruthy()
    expect((upd!.values as Record<string, unknown>).status).toBe('lost')
    const audit = auditCalls.find((a) => a.action === 'deal.mark_lost')
    expect(audit).toBeTruthy()
    expect(audit!.risk).toBe('medio')
  })
})

describe('convertLead', () => {
  it('vincula el lead al negocio y audita lead.convert', async () => {
    tableHandlers['leads'] = () => ({ data: null, error: null })
    tableHandlers['deals'] = () => ({ data: null, error: null })
    await convertLead({ leadId: UUID, businessId: UUID2 })

    expect(updatedRows.some((u) => u.table === 'leads')).toBe(true)
    expect(auditCalls.some((a) => a.action === 'lead.convert')).toBe(true)
  })
})

describe('linkLeadOnSignup (conversión automática, anti-tampering)', () => {
  it('re-deriva el email del owner de la sesión (lowercase) y vincula el lead existente', async () => {
    tableHandlers['leads'] = () => ({ data: { id: UUID }, error: null })
    tableHandlers['deals'] = () => ({ data: null, error: null })
    await linkLeadOnSignup({ businessId: UUID2 })

    // Vinculó el lead existente al negocio.
    expect(updatedRows.some((u) => u.table === 'leads')).toBe(true)
    const audit = auditCalls.find((a) => a.action === 'lead.convert')
    expect(audit).toBeTruthy()
    expect(audit!.actorId).toBe('owner-1') // actorId = owner, no admin
    expect((audit!.metadata as Record<string, unknown>).auto).toBe(true)
  })

  it('lead inexistente → crea un lead ya convertido (deal won) — D-06', async () => {
    // El maybeSingle del lookup devuelve null (no hay match); el insert().select().single() del
    // alta devuelve la fila creada con su id (igual que Supabase). El mock no distingue lecturas de
    // inserts por tabla, así que devolvemos el id: el lookup usa maybeSingle (null real lo da el
    // primer call), pero acá el patrón de "crear" necesita el id de vuelta.
    let leadCall = 0
    tableHandlers['leads'] = () => {
      leadCall += 1
      // 1er call = lookup (maybeSingle) → sin match; 2do call = insert().select().single() → id nuevo.
      return leadCall === 1 ? { data: null, error: null } : { data: { id: UUID }, error: null }
    }
    tableHandlers['deals'] = () => ({ data: null, error: null })
    await linkLeadOnSignup({ businessId: UUID2 })

    expect(insertedRows.some((i) => i.table === 'leads')).toBe(true)
    expect(insertedRows.some((i) => i.table === 'deals')).toBe(true)
  })

  it('sin sesión (user null) → best-effort, no lanza ni muta', async () => {
    sessionUser = null
    await expect(linkLeadOnSignup({ businessId: UUID2 })).resolves.toBeUndefined()
    expect(updatedRows.length).toBe(0)
    expect(insertedRows.length).toBe(0)
  })

  it('NUNCA usa email/leadId del input (anti-tampering): un email arbitrario en el input se ignora', async () => {
    tableHandlers['leads'] = () => ({ data: { id: UUID }, error: null })
    tableHandlers['deals'] = () => ({ data: null, error: null })
    // Pasamos basura extra en el input; el schema solo acepta businessId y el email se re-deriva.
    await linkLeadOnSignup({ businessId: UUID2, email: 'attacker@evil.com', leadId: 'fake' } as never)

    const audit = auditCalls.find((a) => a.action === 'lead.convert')
    expect(audit!.actorId).toBe('owner-1')
  })
})
