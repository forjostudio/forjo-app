import { z } from 'zod'
import { normalizeArWhatsApp } from '@/lib/whatsapp'

// ── Lógica PURA de la bandeja de WhatsApp (Phase 6, Plan 01) ──────────────────────────────────────
// Módulo SIN cliente Supabase ni React ni 'use server': es testeable con Vitest sin DB. El ingest
// (app/api/agent/inbox/route.ts) y los route handlers del agente importan estos helpers; la lógica
// vive acá para tener una sola fuente de verdad y poder testearla aislada.

// ── Estados de atención (handled_by) ──────────────────────────────────────────────────────────────
// El universo de estados es EXACTAMENTE estos tres (coincide con el CHECK de conversations.handled_by
// en la migración 038):
//   - 'ai'         → el agente IA está respondiendo (default al ingestar).
//   - 'human'      → un operador tomó la conversación; el bot lee este estado y PAUSA (D-03).
//   - 'unassigned' → estado de takeover "sin asignar" del mock (no es estado de asociación a entidad).
export type HandledBy = 'unassigned' | 'ai' | 'human'

export const HANDLED_BY_VALUES: readonly HandledBy[] = ['unassigned', 'ai', 'human'] as const

/**
 * isValidHandledByTransition — true si `from`→`to` es un cambio de estado válido.
 * Una transición es válida cuando ambos estados pertenecen al universo y son DISTINTOS (pasar al
 * mismo estado no es un cambio). El takeover (ai→human) y el release (human→ai) son los dos casos
 * reales; el resto se modela por completitud.
 */
export function isValidHandledByTransition(from: HandledBy, to: HandledBy): boolean {
  if (!HANDLED_BY_VALUES.includes(from) || !HANDLED_BY_VALUES.includes(to)) return false
  return from !== to
}

// ── Schema zod del ingest (payload del bot) ───────────────────────────────────────────────────────
// El bot es input NO confiable (CLAUDE.md): el payload se valida con zod ANTES de tocar la DB. El
// `slug` resuelve el tenant server-side (anti-tampering: el business_id NUNCA sale del body). El
// `external_id` es el id del mensaje en el SQLite del bot → garantiza idempotencia en reintentos.
export const inboundSchema = z.object({
  slug: z.string().min(1),
  external_id: z.string().min(1), // id del mensaje en el bot → idempotencia (D-05)
  contact: z.object({
    phone: z.string().min(1),
    name: z.string().nullish(),
    email: z.string().nullish(),
  }),
  direction: z.enum(['inbound', 'outbound']), // entrante (cliente) / saliente (bot/IA)
  body: z.string(),
  sender: z.enum(['contact', 'ai', 'human']).default('contact'),
  sent_at: z.string().datetime().nullish(),
})

export type InboundMessage = z.infer<typeof inboundSchema>

// ── Asociación a lead (matchEntity) ───────────────────────────────────────────────────────────────
// Una conversación de WhatsApp llega por el slug de un negocio (ya tenemos business_id). El "lead" es
// el CONTACTO que escribe; intentamos asociarlo a un lead existente del pipeline por teléfono y, si no,
// por email. POR QUÉ phone-then-email: el teléfono es el identificador fuerte del canal WhatsApp (el
// número con el que escribe); el email es secundario y puede faltar o estar compartido. Sin match el
// lead_id queda null (la conversación igual está asignada al negocio — "Sin asignar" es estado de
// takeover, no de asociación, D-04).
//
// La normalización del teléfono usa normalizeArWhatsApp (lib/whatsapp.ts) — idempotente, maneja
// 15/área/país AR — para NO reinventar un regex frágil. Se normalizan ambos lados (phone entrante y
// leads.whatsapp) así un lead guardado sin normalizar igual matchea.
export interface MatchEntityInput {
  phone: string
  email: string | null | undefined
  leads: { id: string; whatsapp: string | null; email: string | null }[]
}

export function matchEntity({ phone, email, leads }: MatchEntityInput): string | null {
  // 1) Match por teléfono normalizado (identificador fuerte del canal).
  const normPhone = normalizeArWhatsApp(phone)
  if (normPhone) {
    const byPhone = leads.find((l) => normalizeArWhatsApp(l.whatsapp) === normPhone)
    if (byPhone) return byPhone.id
  }

  // 2) Fallback por email case-insensitive (solo si no hubo match de teléfono).
  const normEmail = email?.trim().toLowerCase()
  if (normEmail) {
    const byEmail = leads.find((l) => l.email?.trim().toLowerCase() === normEmail)
    if (byEmail) return byEmail.id
  }

  // 3) Sin match → null (lead_id nullable; la conversación queda asignada al negocio).
  return null
}
