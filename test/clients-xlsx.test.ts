import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildClientsWorkbook, CLIENTS_XLSX_COLUMNS, type ClientExportRow } from '@/lib/clients-xlsx'
import { workbookToBytes, BRAND_ARGB, WHITE_ARGB } from '@/lib/xlsx-style'
import { canonicalHeader, parseCsv } from '@/lib/clients-import'

// ── Excel de clientes (quick 261124-ine) ────────────────────────────────────────────────────────
// Suite PURA: no toca Supabase (no importa test/env), así cae en el carril `pure`. Todo se prueba
// sobre el ARCHIVO de verdad: se arma el libro, se pasa a bytes y se recarga con la librería, que es
// lo mismo que va a leer Excel o el import.

async function reload(bytes: Uint8Array<ArrayBuffer>): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  return wb
}

function row(partial: Partial<ClientExportRow>): ClientExportRow {
  return {
    name: null,
    phone: null,
    email: null,
    origin: null,
    notes: null,
    insurance_name: null,
    insurance_number: null,
    ...partial,
  }
}

const HEADERS = ['Nombre', 'Teléfono', 'Email', 'Origen', 'Notas', 'Obra social', 'Nro. obra social']

describe('buildClientsWorkbook — formato del export', () => {
  it('una hoja Clientes con los 7 títulos legibles en orden', async () => {
    const wb = await reload(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana', phone: '111' })])))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Clientes'])
    const ws = wb.getWorksheet('Clientes')!
    const titles = HEADERS.map((_, i) => ws.getRow(1).getCell(i + 1).value)
    expect(titles).toEqual(HEADERS)
  })

  it('encabezado rojo Forjo con texto blanco en negrita, fila congelada, autofiltro y anchos', async () => {
    const wb = await reload(
      await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana', phone: '111' }), row({ name: 'Beto', email: 'b@t.com' })])),
    )
    const ws = wb.getWorksheet('Clientes')!
    for (let c = 1; c <= HEADERS.length; c++) {
      const cell = ws.getRow(1).getCell(c)
      const fill = cell.fill as ExcelJS.FillPattern
      expect(fill.type).toBe('pattern')
      expect(fill.pattern).toBe('solid')
      expect(fill.fgColor?.argb).toBe(BRAND_ARGB)
      expect(cell.font?.bold).toBe(true)
      expect(cell.font?.color?.argb).toBe(WHITE_ARGB)
    }
    // La celda 8 (fuera de la tabla) no se pinta: el estilo es por celda, no de la fila entera.
    expect(ws.getRow(1).getCell(8).fill).toBeUndefined()
    const view = ws.views[0] as ExcelJS.WorksheetViewFrozen
    expect(view.state).toBe('frozen')
    expect(view.ySplit).toBe(1)
    expect(ws.autoFilter).toBeTruthy()
    for (let c = 1; c <= HEADERS.length; c++) {
      expect(ws.getColumn(c).width ?? 0).toBeGreaterThan(0)
    }
  })

  it('Teléfono y Nro. obra social con formato texto (@)', async () => {
    const wb = await reload(
      await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana', phone: '0348 15 1234', insurance_number: '0012' })])),
    )
    const ws = wb.getWorksheet('Clientes')!
    const telCol = CLIENTS_XLSX_COLUMNS.findIndex((c) => c.key === 'telefono') + 1
    const nroCol = CLIENTS_XLSX_COLUMNS.findIndex((c) => c.key === 'nro_obra_social') + 1
    expect(ws.getColumn(telCol).numFmt).toBe('@')
    expect(ws.getColumn(nroCol).numFmt).toBe('@')
    expect(ws.getRow(2).getCell(telCol).numFmt).toBe('@')
    expect(ws.getRow(2).getCell(nroCol).numFmt).toBe('@')
  })

  it('un nombre `=Ana` y unas notas `=HYPERLINK(...)` quedan como TEXTO literal, sin fórmula ni prefijo', async () => {
    const wb = await reload(
      await workbookToBytes(
        buildClientsWorkbook([row({ name: '=Ana', email: 'a@t.com', notes: '=HYPERLINK("http://x")' })]),
      ),
    )
    const ws = wb.getWorksheet('Clientes')!
    const nombre = ws.getRow(2).getCell(1)
    const notas = ws.getRow(2).getCell(5)
    expect(nombre.type).toBe(ExcelJS.ValueType.String)
    expect(nombre.formula).toBeUndefined()
    expect(nombre.value).toBe('=Ana')
    expect(notas.type).toBe(ExcelJS.ValueType.String)
    expect(notas.formula).toBeUndefined()
    expect(notas.value).toBe('=HYPERLINK("http://x")')
    // Ninguna celda de la hoja es una fórmula.
    ws.eachRow((r) => r.eachCell((c) => expect(c.type).not.toBe(ExcelJS.ValueType.Formula)))
  })

  it('null o "" → celda sin valor (nunca la cadena "null")', async () => {
    const wb = await reload(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana', phone: '', email: null })])))
    const ws = wb.getWorksheet('Clientes')!
    expect(ws.getRow(2).getCell(2).value).toBeNull()
    expect(ws.getRow(2).getCell(3).value).toBeNull()
    ws.eachRow((r) => r.eachCell((c) => expect(c.value).not.toBe('null')))
  })
})

describe('buildClientsWorkbook — plantilla', () => {
  it('hojas Clientes + Instrucciones, Clientes solo con los títulos y el mismo estilo', async () => {
    // Aunque le pasen filas, la plantilla no las escribe.
    const wb = await reload(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana' })], { plantilla: true })))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Clientes', 'Instrucciones'])
    const ws = wb.getWorksheet('Clientes')!
    expect(ws.actualRowCount).toBe(1)
    expect(HEADERS.map((_, i) => ws.getRow(1).getCell(i + 1).value)).toEqual(HEADERS)
    const fill = ws.getRow(1).getCell(1).fill as ExcelJS.FillPattern
    expect(fill.fgColor?.argb).toBe(BRAND_ARGB)
    expect((ws.views[0] as ExcelJS.WorksheetViewFrozen).ySplit).toBe(1)

    const ins = wb.getWorksheet('Instrucciones')!
    expect(ins.getRow(1).getCell(1).value).toBe('Columna')
    expect(ins.getRow(1).getCell(2).value).toBe('Qué poner')
    // Una fila por columna de la hoja Clientes, con el título exacto.
    const columnas: string[] = []
    ins.eachRow((r, n) => {
      if (n > 1) columnas.push(String(r.getCell(1).value))
    })
    for (const h of HEADERS) expect(columnas).toContain(h)
    // Sin ¿ ni ¡ de apertura (copy rioplatense del panel).
    ins.eachRow((r) => r.eachCell((c) => expect(String(c.value)).not.toMatch(/[¿¡]/)))
  })
})

describe('canonicalHeader — títulos legibles y snake_case caen en lo mismo', () => {
  it.each([
    ['Teléfono', 'telefono'],
    ['TELÉFONO', 'telefono'],
    [' telefono ', 'telefono'],
    ['telefono', 'telefono'],
    ['Nro. obra social', 'nro_obra_social'],
    ['nro_obra_social', 'nro_obra_social'],
    ['NRO. OBRA SOCIAL', 'nro_obra_social'],
    ['Obra social', 'obra_social'],
    ['Email', 'email'],
    ['"nombre', 'nombre'],
  ])('%j → %j', (input, expected) => {
    expect(canonicalHeader(input)).toBe(expected)
  })

  it('cada título del export normaliza a su key canónica', () => {
    for (const c of CLIENTS_XLSX_COLUMNS) expect(canonicalHeader(c.header)).toBe(c.key)
  })
})

describe('parseCsv — reconoce los títulos legibles del Excel', () => {
  it('header legible → validHeader y las filas pobladas', () => {
    const csv = 'Nombre,Teléfono,Email,Origen,Notas,Obra social,Nro. obra social\r\n"Ana","1122334455","","","","",""'
    const { validHeader, rows } = parseCsv(csv)
    expect(validHeader).toBe(true)
    expect(rows[0].nombre).toBe('Ana')
    expect(rows[0].telefono).toBe('1122334455')
  })

  it('sin la columna Email → validHeader false (el header sigue rígido)', () => {
    const csv = 'Nombre,Teléfono,Origen,Notas,Obra social,Nro. obra social\r\n"Ana","111","","","",""'
    expect(parseCsv(csv).validHeader).toBe(false)
  })
})
