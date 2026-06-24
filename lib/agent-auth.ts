import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

// ── Auth del bot del agente (Phase 6, compartido ingest + state) ──────────────────────────────────
// FAIL-CLOSED sobre FORJO_AGENT_TOKEN: si el secreto no está seteado → false → 401 (NUNCA fail-open,
// igual que verifyMPSignature del webhook de pago, SIN rama `if (secret)` que abriría el endpoint).
// El token es server-only (NO NEXT_PUBLIC_), igual que la service-role key.
//
// La comparación es CONSTANT-TIME (timingSafeEqual): un `===` de strings corta en el primer byte
// distinto y filtra timing (longitud/prefijo) del secreto. Guardamos la longitud primero porque
// timingSafeEqual lanza si los buffers difieren en tamaño (y comparar longitudes no filtra el
// contenido del secreto).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// agentAuthOk — true solo si el header Authorization: Bearer <token> matchea FORJO_AGENT_TOKEN en
// tiempo constante. Compartido por el ingest (POST) y el state (GET) para que un fix de seguridad se
// aplique en un solo lugar (antes estaba duplicado verbatim, IN-03).
export function agentAuthOk(request: NextRequest): boolean {
  const expected = process.env.FORJO_AGENT_TOKEN
  if (!expected) return false // sin secreto configurado → rechazo (fail-closed)
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return Boolean(got) && safeEqual(got!, expected)
}
