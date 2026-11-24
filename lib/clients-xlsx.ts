// El Excel (.xlsx) de clientes: export, plantilla de import y lectura del archivo subido (quick
// 261124-ine, DATA-01/DATA-03). Módulo PURO y SOLO de servidor: lo usan los route handlers y sus tests.
// Nunca importarlo desde un componente 'use client' — llevaría la librería de planillas al navegador.
//
// Por qué así:
//   • Sin prefijo `'` anti-fórmula: el CSV lo necesitaba porque Excel evalúa `=...` al abrir un texto
//     plano. En el .xlsx cada valor se escribe como celda de TEXTO, y Excel no evalúa una celda de
//     texto aunque empiece con `=` (test/clients-xlsx.test.ts lo prueba recargando el archivo). El dato
//     sale tal cual, sin `'` que el import tenga que sacar.
//   • Teléfono y Nro. obra social con formato texto ('@'): si el dueño tipea `03487...` en la
//     plantilla, Excel lo guardaría como número y se comería el cero inicial.
//   • Un solo builder para el export y la plantilla (D-03): los títulos de la plantilla son los mismos
//     que los del export, así que lo que el dueño baje de cualquiera de los dos vuelve a entrar.

import ExcelJS from 'exceljs'
import { styleHeaderSheet } from '@/lib/xlsx-style'

// ── Columnas ────────────────────────────────────────────────────────────────────────────────────

// Orden canónico (el mismo que CANONICAL_HEADER de lib/clients-import.ts). `header` es el título
// legible que ve el dueño (D-04); canonicalHeader(header) === key, así el import lo reconoce.
export const CLIENTS_XLSX_COLUMNS = [
  { key: 'nombre', header: 'Nombre', width: 28 },
  { key: 'telefono', header: 'Teléfono', width: 18, text: true },
  { key: 'email', header: 'Email', width: 32 },
  { key: 'origen', header: 'Origen', width: 14 },
  { key: 'notas', header: 'Notas', width: 40 },
  { key: 'obra_social', header: 'Obra social', width: 22 },
  { key: 'nro_obra_social', header: 'Nro. obra social', width: 18, text: true },
] as const

export const CLIENTS_SHEET = 'Clientes'
export const INSTRUCTIONS_SHEET = 'Instrucciones'

// La fila tal cual la devuelve el select de app/api/export/clients/route.ts.
export interface ClientExportRow {
  name: string | null
  phone: string | null
  email: string | null
  origin: string | null
  notes: string | null
  insurance_name: string | null
  insurance_number: string | null
}

// Las reglas reales del import (validateClientBody + classifyRows), en el idioma del dueño.
const INSTRUCCIONES: [string, string][] = [
  ['Nombre', 'Obligatorio.'],
  ['Teléfono', 'Teléfono o email: al menos uno de los dos. Solo números, espacios y + ( ) -.'],
  ['Email', 'Con formato nombre@dominio.com.'],
  ['Origen', 'Se ignora al importar: todos quedan como Importado.'],
  ['Notas', 'Opcional. Se guardan hasta 1000 caracteres.'],
  ['Obra social', 'Opcional. Solo se guarda si el negocio es del rubro salud.'],
  ['Nro. obra social', 'Opcional. Solo se guarda si el negocio es del rubro salud.'],
  ['Títulos', 'No cambies ni borres los títulos de la primera fila de la hoja Clientes.'],
  ['Repetidos', 'Las filas con el mismo email o teléfono que alguien que ya tenés (o repetidas en el archivo) se saltean.'],
  ['Límite', 'Máximo 2000 filas por archivo.'],
]

// Valor de celda: string tal cual; null o '' → sin valor (no la cadena "null"). Nunca un objeto
// { formula }: todo lo que viene de la DB es texto.
function textCell(v: string | null): string | null {
  return v === null || v === '' ? null : v
}

// ── Builder (export + plantilla) ────────────────────────────────────────────────────────────────

export function buildClientsWorkbook(
  rows: ClientExportRow[],
  opts: { plantilla?: boolean } = {},
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(CLIENTS_SHEET)
  ws.columns = CLIENTS_XLSX_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  // Formato texto ANTES de cargar filas y de estilar el encabezado: las celdas nuevas lo heredan.
  CLIENTS_XLSX_COLUMNS.forEach((c, i) => {
    if ('text' in c && c.text) ws.getColumn(i + 1).numFmt = '@'
  })

  // La plantilla va sin filas de datos: ignora `rows` aunque venga algo.
  const data = opts.plantilla ? [] : rows
  for (const r of data) {
    ws.addRow([
      textCell(r.name),
      textCell(r.phone),
      textCell(r.email),
      textCell(r.origin),
      textCell(r.notes),
      textCell(r.insurance_name),
      textCell(r.insurance_number),
    ])
  }
  styleHeaderSheet(ws, { autoFilter: true })

  if (opts.plantilla) {
    const ins = wb.addWorksheet(INSTRUCTIONS_SHEET)
    ins.columns = [
      { header: 'Columna', key: 'columna', width: 18 },
      { header: 'Qué poner', key: 'que', width: 90 },
    ]
    for (const [col, que] of INSTRUCCIONES) ins.addRow([col, que])
    ins.getColumn(2).alignment = { wrapText: true, vertical: 'top' }
    styleHeaderSheet(ins, { autoFilter: false })
  }

  return wb
}
