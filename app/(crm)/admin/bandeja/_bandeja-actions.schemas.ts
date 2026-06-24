import { z } from 'zod'

// Schemas zod de las server actions de la bandeja (Phase 6, Plan 01), en un MÓDULO PURO (SIN
// 'use server') — mismo motivo que _crm-actions.schemas.ts: poder importarlos desde un test node y
// reusarlos en las actions con `.parse(input)` (input no confiable, validado antes de mutar).

// conversationId siempre es un uuid de conversations.id — z.uuid() rechaza no-uuid antes de tocar DB.
const conversationId = z.uuid()

// takeConversation: el operador toma el hilo (handled_by → 'human', el bot pausa).
export const takeConversationSchema = z.object({
  conversationId,
})

// releaseConversation: el operador libera el hilo (handled_by → 'ai', el bot retoma).
export const releaseConversationSchema = z.object({
  conversationId,
})

export type TakeConversationInput = z.infer<typeof takeConversationSchema>
export type ReleaseConversationInput = z.infer<typeof releaseConversationSchema>
