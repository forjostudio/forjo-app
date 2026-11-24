// Piezas compartidas de los Excel (.xlsx) que baja el panel: export de clientes, plantilla de import y
// export de finanzas (quick 261124-ine). Módulo PURO y SOLO de servidor: lo usan route handlers y sus
// tests; nunca importarlo desde un componente 'use client' (llevaría la librería de planillas entera al
// bundle del navegador).
//
// Por qué un módulo aparte: los tres archivos tienen que verse iguales en Excel (encabezado de marca,
// fila congelada, mismos formatos de fecha y plata). Con el estilo escrito en un solo lugar, cambiar el
// rojo o el formato de pesos no deja un archivo distinto del otro.

import ExcelJS from 'exceljs'

// ── Constantes ──────────────────────────────────────────────────────────────────────────────────

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Rojo Forjo (app/globals.css → --primary: #d94a2b) en ARGB, que es como lo pide el formato de Excel.
export const BRAND_ARGB = 'FFD94A2B'
export const WHITE_ARGB = 'FFFFFFFF'

// Fecha como la lee un argentino, y pesos con dos decimales (negativos en rojo con el signo adelante).
export const DATE_FMT = 'dd/mm/yyyy'
export const ARS_FMT = '"$" #,##0.00;[Red]-"$" #,##0.00'

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

// Pinta la fila 1 como encabezado de marca y la congela. Se llama DESPUÉS de cargar las filas, así el
// autofiltro cubre todos los datos.
//
// Se pinta CELDA POR CELDA y no con el estilo de la fila entera: el estilo de fila se aplica a las
// 16384 columnas de la hoja y Excel mostraría la franja roja hasta el infinito.
export function styleHeaderSheet(ws: ExcelJS.Worksheet, { autoFilter }: { autoFilter: boolean }): void {
  const lastCol = Math.max(1, ws.columnCount)
  const header = ws.getRow(1)
  for (let c = 1; c <= lastCol; c++) {
    const cell = header.getCell(c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ARGB } }
    cell.font = { bold: true, color: { argb: WHITE_ARGB } }
    cell.alignment = { vertical: 'middle' }
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  if (autoFilter) {
    const lastRow = Math.max(1, ws.rowCount)
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastRow, column: lastCol } }
  }
}

// 'YYYY-MM-DD' (como guarda las fechas la DB) → Date en medianoche UTC. La librería pasa la fecha a
// número de serie de Excel con los milisegundos UTC, así que medianoche UTC muestra el MISMO día en
// cualquier zona horaria. new Date('YYYY-MM-DD') local correría el día según dónde corra el server.
// Cualquier otra cosa (vacío, formato raro, fecha imposible) → null, y la celda queda vacía.
export function ymdToUtcDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // 2026-02-31 no existe: Date.UTC lo corre al 3 de marzo. Mejor celda vacía que un día inventado.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null
  return date
}

// El libro como bytes, listos para el body de un Response (mismo molde que facturador-ARCA).
export async function workbookToBytes(wb: ExcelJS.Workbook): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
