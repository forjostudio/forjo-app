import { describe, it, expect, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { agentAuthOk } from '@/lib/agent-auth'

// ── agentAuthOk ───────────────────────────────────────────────────────────────────────────────────
// Auth fail-closed compartido por el ingest y el state endpoint. Verifica el token contra
// FORJO_AGENT_TOKEN en tiempo constante. Acá solo se prueba la lógica de aceptar/rechazar; el
// timingSafeEqual interno no es observable desde un test (solo garantiza no filtrar timing).

// Request mínimo: solo necesitamos headers.get('authorization').
function reqWithAuth(value: string | null): NextRequest {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === 'authorization' ? value : null),
    },
  } as unknown as NextRequest
}

const ORIGINAL = process.env.FORJO_AGENT_TOKEN

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FORJO_AGENT_TOKEN
  else process.env.FORJO_AGENT_TOKEN = ORIGINAL
})

describe('agentAuthOk', () => {
  it('rechaza fail-closed cuando FORJO_AGENT_TOKEN no está seteado', () => {
    delete process.env.FORJO_AGENT_TOKEN
    expect(agentAuthOk(reqWithAuth('Bearer cualquier-cosa'))).toBe(false)
  })

  it('acepta el token correcto con prefijo Bearer', () => {
    process.env.FORJO_AGENT_TOKEN = 'secreto-123'
    expect(agentAuthOk(reqWithAuth('Bearer secreto-123'))).toBe(true)
  })

  it('rechaza un token incorrecto de la misma longitud', () => {
    process.env.FORJO_AGENT_TOKEN = 'secreto-123'
    expect(agentAuthOk(reqWithAuth('Bearer secreto-999'))).toBe(false)
  })

  it('rechaza un token de longitud distinta (sin lanzar timingSafeEqual)', () => {
    process.env.FORJO_AGENT_TOKEN = 'secreto-123'
    expect(agentAuthOk(reqWithAuth('Bearer corto'))).toBe(false)
  })

  it('rechaza cuando falta el header Authorization', () => {
    process.env.FORJO_AGENT_TOKEN = 'secreto-123'
    expect(agentAuthOk(reqWithAuth(null))).toBe(false)
  })
})
