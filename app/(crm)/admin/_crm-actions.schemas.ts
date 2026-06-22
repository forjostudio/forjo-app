import { z } from 'zod'
import { STAGES } from '@/lib/crm-pipeline'

// Schemas zod de las server actions de Phase 4 (pipeline / tags / notas / tareas), en un MÓDULO PURO
// (SIN 'use server') para poder importarlos desde un test node (Vitest) — mismo motivo que
// _actions.schemas.ts: las server actions no son importables en un test porque 'use server' las marca
// como endpoints. Las actions (_tag-actions.ts de este plan, _pipeline-actions.ts/_content-actions.ts
// de Wave 2) importan estos schemas y hacen `.parse(input)` como segunda línea (tras requireAdmin),
// mitigando tampering del input (stage/status/monto fuera de rango llegan por POST directo sin UI).

// id siempre es un uuid de columna *.id — z.uuid() (zod 4) rechaza cualquier no-uuid antes de tocar DB.
const id = z.uuid()

// Enum de etapas construido a partir de las keys de STAGES (lib/crm-pipeline): NO se redeclara el
// listado de etapas acá. STAGES es la única fuente de verdad y sus keys coinciden con el CHECK de
// deals.stage en la migración 034. Si STAGES cambia, este enum cambia con él (cero divergencia).
const stageKeys = STAGES.map((s) => s.key) as [string, ...string[]]
export const stageEnum = z.enum(stageKeys)

// ── Pipeline (Plan 02 las consume) ──────────────────────────────────────────────────────────────

// createDeal: alta de un deal (con un lead nuevo o existente; el lead se resuelve server-side por
// nombre/email). El email se normaliza a lowercase con .toLowerCase() (alineado con leads.email).
export const createDealSchema = z.object({
  leadName: z.string().trim().min(1),
  leadEmail: z.string().trim().toLowerCase().email().optional(),
  valueArs: z.int().min(0).default(0),
  stage: stageEnum.default('lead'),
})

// moveStage: mover un deal a otra etapa (DnD del tablero).
export const moveStageSchema = z.object({
  dealId: id,
  stage: stageEnum,
})

// markLost: marcar un deal como perdido con motivo obligatorio (a nivel app; en DB lost_reason es nullable).
export const markLostSchema = z.object({
  dealId: id,
  reason: z.string().trim().min(1),
})

// convertLead: conversión MANUAL desde el tablero (el operador asocia un lead a un negocio ya creado).
export const convertLeadSchema = z.object({
  leadId: id,
  businessId: id,
})

// linkLeadOnSignup: conversión AUTOMÁTICA al alta de un negocio (onboarding handleFinish). Solo recibe
// el businessId; el email del owner se RE-DERIVA server-side desde la sesión/negocio (anti-tampering):
// NUNCA llega leadId ni email en el input, así un POST directo no puede vincular un lead arbitrario.
export const linkLeadOnSignupSchema = z.object({
  businessId: id,
})

// ── Tags (Plan 01 _tag-actions.ts + Plan 02/03 las consumen) ─────────────────────────────────────

export const createTagSchema = z.object({
  label: z.string().trim().min(1),
  color: z.string().trim().min(1),
})

export const assignTagSchema = z.object({
  tagId: id,
  entityType: z.enum(['lead', 'business']),
  entityId: id,
})

export const removeTagSchema = z.object({
  tagId: id,
  entityType: z.enum(['lead', 'business']),
  entityId: id,
})

// ── Notas (Plan 03 _content-actions.ts las consume) ──────────────────────────────────────────────
// businessId/leadId opcionales y nullable: una nota cuelga de un lead, de un negocio, o de ambos.

export const createNoteSchema = z.object({
  businessId: id.nullable().optional(),
  leadId: id.nullable().optional(),
  body: z.string().trim().min(1),
})

export const editNoteSchema = z.object({
  noteId: id,
  body: z.string().trim().min(1),
})

export const deleteNoteSchema = z.object({
  noteId: id,
})

// ── Tareas (Plan 03 _content-actions.ts las consume) ─────────────────────────────────────────────

export const createTaskSchema = z.object({
  businessId: id.nullable().optional(),
  leadId: id.nullable().optional(),
  title: z.string().trim().min(1),
  dueDate: z.iso.date().optional(),
})

export const completeTaskSchema = z.object({
  taskId: id,
  done: z.boolean(),
})

// ── Tipos inferidos para tipar el input parseado en las actions ──────────────────────────────────
export type CreateDealInput = z.infer<typeof createDealSchema>
export type MoveStageInput = z.infer<typeof moveStageSchema>
export type MarkLostInput = z.infer<typeof markLostSchema>
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>
export type LinkLeadOnSignupInput = z.infer<typeof linkLeadOnSignupSchema>
export type CreateTagInput = z.infer<typeof createTagSchema>
export type AssignTagInput = z.infer<typeof assignTagSchema>
export type RemoveTagInput = z.infer<typeof removeTagSchema>
export type CreateNoteInput = z.infer<typeof createNoteSchema>
export type EditNoteInput = z.infer<typeof editNoteSchema>
export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>
export type CreateTaskInput = z.infer<typeof createTaskSchema>
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>
