// Esqueleto RED (Phase 23, plan 23-01): firmas del módulo puro del panel del catálogo, sin
// comportamiento todavía. La implementación llega en el commit GREEN.

export const SIN_CATEGORIA = ''

export function categoryPatch(value: string): { category_id: string | null } {
  return { category_id: value }
}

export function fromCategoryId(id: string | null | undefined): string {
  return String(id)
}

export function mapCategoryWriteError(_code: string | null | undefined): string | null {
  return null
}

export function renumber(_ids: string[]): { id: string; sort_order: number }[] {
  return []
}

export function moveWithinList(ids: string[], _from: number, _to: number): string[] {
  return ids
}

export function categoryCountLabel(_n: number): string {
  return ''
}

export function serviceCountLabel(_n: number): string {
  return ''
}

export type CategoryWriteReject = 'duplicate' | 'blank' | 'unknown'

export function classifyCategoryWriteError(_error: { code?: string | null } | null | undefined): CategoryWriteReject {
  return 'unknown'
}

export const CATEGORY_WRITE_REJECT_COPY: Record<CategoryWriteReject, string> = { duplicate: '', blank: '', unknown: '' }

export const ORDER_REJECT_COPY = ''

export function moveRejectCopy(_serviceName: string): string {
  return ''
}
