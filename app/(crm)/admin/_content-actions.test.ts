import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Tests de las server actions de notas y tareas (Phase 4, Plan 03) ───────────────────────────
// Mockeamos las dependencias server-only (guard, audit, admin client) para asertar el CONTRATO de
// 6 pasos sin tocar la DB real:
//   - requireAdmin() es la PRIMERA llamada (si lanza → no muta ni audita)
//   - schema.parse() rechaza input inválido antes de mutar
//   - el action code EXACTO que llega a logAudit (alimenta el visor / timeline)
//   - createNote/createTask insertan; completeTask setea completed_at según `done`; deleteNote es risk medio
//
// 'use server' es solo una marca de bundler: vitest puede importar el módulo igual.

type QueryResult = { data?: unknown; error?: { code?: string; message?: string } | null }

let tableHandlers: Record<string, () => QueryResult>
let insertedRows: Array<{ table: string; values: unknown }>
let updatedRows: Array<{ table: string; values: unknown }>
let deletedTables: string[]
let auditCalls: Array<Record<string, unknown>>
let requireAdminImpl: () => Promise<{ id: string }>

function makeQuery(table: string) {
  const result = () => tableHandlers[table]?.() ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  chain.select = passthrough
  chain.eq = passthrough
  chain.order = passthrough
  chain.limit = passthrough
  chain.single = () => Promise.resolve(result())
  chain.maybeSingle = () => Promise.resolve(result())
  chain.insert = (values: unknown) => {
    insertedRows.push({ table, values })
    return { ...chain, then: (r: (v: QueryResult) => void) => r(result()) }
  }
  chain.update = (values: unknown) => {
    updatedRows.push({ table, values })
    return { ...chain, then: (r: (v: QueryResult) => void) => r(result()) }
  }
  chain.delete = () => {
    deletedTables.push(table)
    return { ...chain, then: (r: (v: QueryResult) => void) => r(result()) }
  }
  ;(chain as { then?: unknown }).then = (r: (v: QueryResult) => void) => r(result())
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeQuery(table) }),
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

import { createNote, editNote, deleteNote, createTask, completeTask } from './_content-actions'

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  tableHandlers = {}
  insertedRows = []
  updatedRows = []
  deletedTables = []
  auditCalls = []
  requireAdminImpl = async () => ({ id: 'admin-1' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createNote', () => {
  it('inserta en notes y audita note.create risk bajo', async () => {
    tableHandlers['notes'] = () => ({ data: null, error: null })
    await createNote({ businessId: UUID, body: 'Una nota' })

    expect(insertedRows.some((i) => i.table === 'notes')).toBe(true)
    const audit = auditCalls.find((a) => a.action === 'note.create')
    expect(audit).toBeTruthy()
    expect(audit!.risk).toBe('bajo')
    expect(audit!.actorId).toBe('admin-1')
    expect(audit!.businessId).toBe(UUID)
  })

  it('requireAdmin lanza → no inserta ni audita', async () => {
    requireAdminImpl = async () => {
      throw new Error('forbidden')
    }
    await expect(createNote({ businessId: UUID, body: 'x' })).rejects.toThrow('forbidden')
    expect(insertedRows.length).toBe(0)
    expect(auditCalls.length).toBe(0)
  })

  it('body vacío → rechaza antes de insertar', async () => {
    await expect(createNote({ businessId: UUID, body: '' })).rejects.toBeTruthy()
    expect(insertedRows.length).toBe(0)
  })
})

describe('editNote', () => {
  it('actualiza notes.body y audita note.edit risk bajo', async () => {
    tableHandlers['notes'] = () => ({ data: null, error: null })
    await editNote({ noteId: UUID, body: 'editada' })

    const upd = updatedRows.find((u) => u.table === 'notes')
    expect(upd).toBeTruthy()
    expect((upd!.values as Record<string, unknown>).body).toBe('editada')
    expect(auditCalls.some((a) => a.action === 'note.edit')).toBe(true)
  })
})

describe('deleteNote', () => {
  it('borra la nota y audita note.delete risk medio', async () => {
    tableHandlers['notes'] = () => ({ data: null, error: null })
    await deleteNote({ noteId: UUID })

    expect(deletedTables.includes('notes')).toBe(true)
    const audit = auditCalls.find((a) => a.action === 'note.delete')
    expect(audit).toBeTruthy()
    expect(audit!.risk).toBe('medio')
  })
})

describe('createTask', () => {
  it('inserta tarea con done=false y audita task.create', async () => {
    tableHandlers['tasks'] = () => ({ data: null, error: null })
    await createTask({ businessId: UUID, title: 'Llamar al cliente' })

    const ins = insertedRows.find((i) => i.table === 'tasks')
    expect(ins).toBeTruthy()
    expect((ins!.values as Record<string, unknown>).done).toBe(false)
    expect((ins!.values as Record<string, unknown>).title).toBe('Llamar al cliente')
    expect(auditCalls.some((a) => a.action === 'task.create')).toBe(true)
  })
})

describe('completeTask', () => {
  it('done=true → setea completed_at no nulo y audita task.complete', async () => {
    tableHandlers['tasks'] = () => ({ data: null, error: null })
    await completeTask({ taskId: UUID2, done: true })

    const upd = updatedRows.find((u) => u.table === 'tasks')
    expect(upd).toBeTruthy()
    const values = upd!.values as Record<string, unknown>
    expect(values.done).toBe(true)
    expect(values.completed_at).not.toBeNull()
    expect(auditCalls.some((a) => a.action === 'task.complete')).toBe(true)
  })

  it('done=false → completed_at vuelve a null', async () => {
    tableHandlers['tasks'] = () => ({ data: null, error: null })
    await completeTask({ taskId: UUID2, done: false })

    const upd = updatedRows.find((u) => u.table === 'tasks')
    const values = upd!.values as Record<string, unknown>
    expect(values.done).toBe(false)
    expect(values.completed_at).toBeNull()
  })
})
