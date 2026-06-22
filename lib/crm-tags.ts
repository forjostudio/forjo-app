// ── Filtro de tags por semántica OR (D-09) ──────────────────────────────────────────────────────
// Módulo PURO (sin DB ni React): el RSC trae las filas con sus tagIds y el cliente filtra en memoria,
// igual que filterBusinesses en lib/crm-directory.ts (bajo volumen, un operador).
//
// D-09: el filtro de tags es OR (unión), NO AND: seleccionar varias tags muestra las filas que tengan
// CUALQUIERA de ellas (no la intersección). Sin selección, no filtra (devuelve todo).

// Cualquier fila con un campo tagIds: las filas del pipeline (deals/leads) y del directorio (negocios)
// lo cumplen.
export type TaggedRow = {
  tagIds: string[]
}

/**
 * filterByTags — filtra `rows` por semántica OR contra `selectedTagIds`:
 *   - selección vacía → devuelve TODAS las filas (el filtro está inactivo).
 *   - con selección → devuelve las filas que tengan AL MENOS UNA de las tags seleccionadas.
 */
export function filterByTags<T extends TaggedRow>(rows: T[], selectedTagIds: string[]): T[] {
  if (selectedTagIds.length === 0) return rows
  return rows.filter((row) => selectedTagIds.some((t) => row.tagIds.includes(t)))
}
