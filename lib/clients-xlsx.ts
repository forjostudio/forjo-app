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
//   • Origen (quick 261124-lfd) va SOLO en el export, al final, marcada como columna del sistema:
//     encabezado gris, nota «se ignora» y lista desplegable. La plantilla no la trae y el import la
//     ignora siempre: así el que abre el Excel no piensa que es algo que tiene que completar.

import ExcelJS from 'exceljs'
import { styleHeaderSheet } from '@/lib/xlsx-style'
// Sin ciclo: este módulo importa de clients-import, nunca al revés.
import { CANONICAL_HEADER, canonicalHeader, isValidImportHeader, parseCsv, type RawRow } from '@/lib/clients-import'

// ── Columnas ────────────────────────────────────────────────────────────────────────────────────

// Orden canónico (el mismo que CANONICAL_HEADER de lib/clients-import.ts). `header` es el título
// legible que ve el dueño (D-04); canonicalHeader(header) === key, así el import lo reconoce.
// `informativa`: la columna la completa el sistema. Solo va en el export (al final, con nota y lista),
// nunca en la plantilla, y el import la ignora. Hoy es solo Origen.
export const CLIENTS_XLSX_COLUMNS = [
  { key: 'nombre', header: 'Nombre', width: 28 },
  { key: 'apellido', header: 'Apellido', width: 24 },
  { key: 'telefono', header: 'Teléfono', width: 18, text: true },
  { key: 'email', header: 'Email', width: 32 },
  { key: 'notas', header: 'Notas', width: 40 },
  { key: 'obra_social', header: 'Obra social', width: 22 },
  { key: 'nro_obra_social', header: 'Nro. obra social', width: 18, text: true },
  { key: 'origen', header: 'Origen', width: 14, informativa: true },
] as const

// Gris neutro para el encabezado de una columna informativa: la señal visual de «esto no lo completás
// vos», distinta del rojo de marca de las columnas que el dueño sí carga.
const INFO_HEADER_ARGB = 'FF7F7F7F'
const ORIGEN_NOTE =
  'Lo completa el sistema según cómo llegó el cliente: reserva, manual o importado. Es informativa: si volvés a importar este archivo, se ignora.'

export const CLIENTS_SHEET = 'Clientes'
export const INSTRUCTIONS_SHEET = 'Instrucciones'

// La fila tal cual la devuelve el select de app/api/export/clients/route.ts.
export interface ClientExportRow {
  name: string | null
  last_name: string | null
  phone: string | null
  email: string | null
  origin: string | null
  notes: string | null
  insurance_name: string | null
  insurance_number: string | null
}

// Las reglas reales del import (validateClientBody + classifyRows), en el idioma del dueño.
const INSTRUCCIONES: [string, string][] = [
  ['Nombre', 'Obligatorio. El apellido va en su propia columna.'],
  ['Apellido', 'Opcional.'],
  ['Teléfono', 'Teléfono o email: al menos uno de los dos. Solo números, espacios y + ( ) -.'],
  ['Email', 'Con formato nombre@dominio.com.'],
  ['Notas', 'Opcional. Se guardan hasta 1000 caracteres.'],
  ['Obra social', 'Opcional. Solo se guarda si el negocio es del rubro salud.'],
  ['Nro. obra social', 'Opcional. Solo se guarda si el negocio es del rubro salud.'],
  [
    'Columnas',
    'Tienen que estar la columna Nombre y al menos una de Teléfono o Email, con esos títulos en la primera fila de la hoja Clientes. Las demás son opcionales. Las columnas que no reconocemos se ignoran, igual que la columna Origen del export: todo lo que importes queda como Importado.',
  ],
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
  // La plantilla va sin las columnas informativas (Origen): el dueño no tiene nada que poner ahí.
  const cols = CLIENTS_XLSX_COLUMNS.filter((c) => !(opts.plantilla && 'informativa' in c && c.informativa))
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  // Formato texto ANTES de cargar filas y de estilar el encabezado: las celdas nuevas lo heredan. Por
  // índice sobre la lista de ESTA hoja (la plantilla tiene una columna menos).
  cols.forEach((c, i) => {
    if ('text' in c && c.text) ws.getColumn(i + 1).numFmt = '@'
  })

  // La plantilla va sin filas de datos: ignora `rows` aunque venga algo. Cada fila se agrega por key de
  // columna, así una columna que la hoja no tiene no corre las demás.
  const data = opts.plantilla ? [] : rows
  for (const r of data) {
    ws.addRow({
      nombre: textCell(r.name),
      apellido: textCell(r.last_name),
      telefono: textCell(r.phone),
      email: textCell(r.email),
      notas: textCell(r.notes),
      obra_social: textCell(r.insurance_name),
      nro_obra_social: textCell(r.insurance_number),
      origen: textCell(r.origin),
    })
  }
  styleHeaderSheet(ws, { autoFilter: true })

  // Origen, solo en el export: encabezado gris + nota, y lista desplegable en cada celda de datos.
  if (!opts.plantilla) {
    const origenCol = cols.findIndex((c) => c.key === 'origen') + 1
    if (origenCol > 0) {
      const head = ws.getRow(1).getCell(origenCol)
      head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INFO_HEADER_ARGB } }
      head.note = ORIGEN_NOTE
      for (let r = 2; r <= ws.rowCount; r++) {
        ws.getRow(r).getCell(origenCol).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"reserva,manual,importado"'],
          showErrorMessage: true,
          errorTitle: 'Origen',
          error: 'Lo completa el sistema: reserva, manual o importado.',
        }
      }
    }
  }

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

// ── Import: lectura del archivo subido (.xlsx o .csv) ────────────────────────────────────────────

// Una sola fuente para los dos handlers (preview y confirm). 2000 es el cap vigente (T-03-06): el
// confirm hace UN batch insert y subirlo aflojaría un límite de seguridad sin que nadie lo pida.
export const IMPORT_MAX_ROWS = 2000
// Topes del ZIP-bomba: un .xlsx de 2 MB con 2000 clientes descomprime a pocos cientos de KB y unas
// pocas decenas de entradas. 30 MB y 500 entradas dejan holgura de sobra para un archivo honesto.
export const XLSX_MAX_UNZIPPED_BYTES = 30 * 1024 * 1024
export const XLSX_MAX_ENTRIES = 500

// Lo que guarda una celda, siempre como texto (mismo espíritu que celda() de facturador-ARCA, pero sin
// devolver números: el import compara y valida strings).
//   • Número entero grande → BigInt, para que un teléfono escrito como número no salga con exponente.
//   • Fórmula → SOLO su resultado cacheado. Nada se evalúa (T-q-06): sin resultado, celda vacía.
//   • Hipervínculo → su texto (Excel convierte los emails tipeados en links mailto:).
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') {
    if (Number.isInteger(v) && !Number.isSafeInteger(v)) return BigInt(v).toString()
    return String(v)
  }
  if (typeof v === 'boolean') return String(v)
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text ?? '').join('')
    if ('text' in v) return cellText(v.text as ExcelJS.CellValue)
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue)
    if ('error' in v) return ''
  }
  return ''
}

// Pre-chequeo del ZIP-bomba ANTES de cargar el libro: el cap de filas recién actúa cuando la librería
// ya descomprimió todo en memoria. Acá se suma el tamaño descomprimido que DECLARA el directorio
// central (sin descomprimir nada) y se corta si pasa los topes, si es ZIP64 o si está roto.
//
// Residuo aceptado (T-q-03b): los tamaños declarados se pueden falsificar, y la librería recién lo
// nota al terminar de descomprimir. Esto frena el ZIP-bomba común (tamaños honestos) sin costo.
export function zipDeclaredSizeOk(
  bytes: ArrayBuffer,
  limits: { maxUnzippedBytes: number; maxEntries: number } = {
    maxUnzippedBytes: XLSX_MAX_UNZIPPED_BYTES,
    maxEntries: XLSX_MAX_ENTRIES,
  },
): boolean {
  const view = new DataView(bytes)
  const len = bytes.byteLength
  if (len < 22) return false

  // Fin del directorio central: 22 bytes fijos + un comentario de hasta 65535 → buscar hacia atrás.
  let eocd = -1
  for (let i = len - 22; i >= Math.max(0, len - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return false

  const entries = view.getUint16(eocd + 10, true)
  const cdSize = view.getUint32(eocd + 12, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return false // ZIP64
  if (entries > limits.maxEntries) return false
  if (cdOffset + cdSize > len) return false

  let pos = cdOffset
  let total = 0
  for (let i = 0; i < entries; i++) {
    if (pos + 46 > len) return false
    if (view.getUint32(pos, true) !== 0x02014b50) return false
    const unzipped = view.getUint32(pos + 24, true)
    if (unzipped === 0xffffffff) return false
    total += unzipped
    if (total > limits.maxUnzippedBytes) return false
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true)
  }
  return true
}

// Qué parser usar. La extensión es SOLO lista permitida (.xlsx o .csv); lo decide el CONTENIDO (D-01,
// T-q-04): un .xlsx es un ZIP y arranca con `PK\x03\x04`. Un .csv que en realidad es un Excel se lee
// como Excel; un .xlsx que no es ZIP se rechaza (el server no confía en la extensión).
export function detectImportFormat({ name, bytes }: { name: string; bytes: ArrayBuffer }): 'xlsx' | 'csv' | null {
  const lower = name.toLowerCase()
  const isXlsxName = lower.endsWith('.xlsx')
  const isCsvName = lower.endsWith('.csv')
  if (!isXlsxName && !isCsvName) return null
  const head = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength))
  const isZip =
    head.length === 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
  if (isZip) return 'xlsx'
  return isCsvName ? 'csv' : null
}

export type ParseFileResult =
  | { ok: true; validHeader: boolean; rows: RawRow[] }
  | { ok: false; error: 'invalid_file_type' | 'unreadable_file' | 'too_many_rows' }

type CanonicalKey = (typeof CANONICAL_HEADER)[number]
const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_HEADER)
const isCanonicalKey = (k: string): k is CanonicalKey => CANONICAL_SET.has(k)

// El archivo subido → las mismas RawRow que daba el CSV, para que classifyRows (y su numeración de
// errores) signifique lo mismo en los dos formatos. Guards en orden: tipo → ZIP → filas → header.
export async function parseClientsFile({
  name,
  bytes,
  maxRows,
}: {
  name: string
  bytes: ArrayBuffer
  maxRows: number
}): Promise<ParseFileResult> {
  const format = detectImportFormat({ name, bytes })
  if (!format) return { ok: false, error: 'invalid_file_type' }

  if (format === 'csv') {
    // parseCsv ya saca el BOM y `sep=`, y recupera el colapso a una columna: el CSV viejo, idéntico.
    const { validHeader, rows } = parseCsv(new TextDecoder('utf-8').decode(bytes))
    return { ok: true, validHeader, rows }
  }

  if (!zipDeclaredSizeOk(bytes)) return { ok: false, error: 'unreadable_file' }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(bytes)
  } catch {
    return { ok: false, error: 'unreadable_file' }
  }

  // La hoja Clientes; si el dueño la renombró, la primera que no sea Instrucciones (un libro propio
  // con una sola "Hoja1" también entra). Nunca se leen datos de la hoja Instrucciones.
  const ws =
    wb.worksheets.find((w) => canonicalHeader(w.name) === 'clientes') ??
    wb.worksheets.find((w) => canonicalHeader(w.name) !== 'instrucciones')
  if (!ws) return { ok: false, error: 'unreadable_file' }

  // Cap de filas ANTES de recorrerlas (+1 por el encabezado).
  if (ws.actualRowCount > maxRows + 1) return { ok: false, error: 'too_many_rows' }

  // Fila 1: columna → canónico. Si un canónico se repite, gana la primera columna. Las columnas que no
  // son canónicas se ignoran (alcanza con Nombre + Teléfono o Email; las extra no molestan).
  const colOf = new Map<CanonicalKey, number>()
  ws.getRow(1).eachCell((cell, col) => {
    const key = canonicalHeader(cellText(cell.value))
    if (isCanonicalKey(key) && !colOf.has(key)) colOf.set(key, col)
  })
  if (!isValidImportHeader(colOf.keys())) return { ok: true, validHeader: false, rows: [] }

  // Filas de datos. NO se aplica unescapeFormulaGuard acá: classifyRows ya lo hace para los dos formatos.
  const rows: RawRow[] = []
  ws.eachRow((r, n) => {
    if (n === 1) return
    const raw: RawRow = {}
    let empty = true
    for (const [key, col] of colOf) {
      const value = cellText(r.getCell(col).value)
      if (value.trim() !== '') empty = false
      raw[key] = value
    }
    // Una fila con solo espacios se saltea (mismo criterio que skipEmptyLines 'greedy' del CSV).
    if (!empty) rows.push(raw)
  })

  return { ok: true, validHeader: true, rows }
}
