import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildClientsWorkbook,
  CLIENTS_XLSX_COLUMNS,
  type ClientExportRow,
  cellText,
  detectImportFormat,
  parseClientsFile,
  zipDeclaredSizeOk,
} from '@/lib/clients-xlsx'
import { workbookToBytes, BRAND_ARGB, WHITE_ARGB } from '@/lib/xlsx-style'
import { canonicalHeader, classifyRows, parseCsv } from '@/lib/clients-import'

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

// ── Import: lectura del archivo subido ──────────────────────────────────────────────────────────

function ab(bytes: Uint8Array<ArrayBuffer>): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

// Un libro armado a mano con la librería (no con buildClientsWorkbook): así se prueban celdas número,
// hipervínculo, richText y fórmula que el builder nunca escribe.
async function handWorkbook(sheets: { name: string; rows: ExcelJS.CellValue[][] }[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name)
    for (const r of sh.rows) ws.addRow(r)
  }
  return ab(await workbookToBytes(wb))
}

const SNAKE = ['nombre', 'telefono', 'email', 'origen', 'notas', 'obra_social', 'nro_obra_social']
const business = { id: 'b1' }

describe('parseClientsFile — ida y vuelta con el export', () => {
  it('el Excel exportado vuelve a entrar sin pérdida', async () => {
    const bytes = ab(
      await workbookToBytes(
        buildClientsWorkbook([
          row({
            name: 'José Pérez',
            phone: '+54 11 2233-4455',
            email: 'jose@test.com',
            origin: 'manual',
            notes: '=HYPERLINK("http://x")',
            insurance_name: 'OSDE',
            insurance_number: '123',
          }),
          row({ name: '=Ana', email: 'ana@test.com' }),
          row({ name: "O'Brien", phone: '0348 15 1234' }),
        ]),
      ),
    )
    const parsed = await parseClientsFile({ name: 'clientes.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.validHeader).toBe(true)
    expect(parsed.rows).toHaveLength(3)

    const { importables, errores, duplicadas } = classifyRows({ rows: parsed.rows, existing: [], business })
    expect(errores).toEqual([])
    expect(duplicadas).toBe(0)
    expect(importables).toEqual([
      {
        nombre: 'José Pérez',
        telefono: '+54 11 2233-4455',
        email: 'jose@test.com',
        notas: '=HYPERLINK("http://x")',
        obra_social: 'OSDE',
        nro_obra_social: '123',
      },
      { nombre: '=Ana', telefono: null, email: 'ana@test.com', notas: null, obra_social: null, nro_obra_social: null },
      { nombre: "O'Brien", telefono: '0348 15 1234', email: null, notas: null, obra_social: null, nro_obra_social: null },
    ])
  })

  it('la plantilla parsea con header válido y 0 filas (Instrucciones no se lee como datos)', async () => {
    const bytes = ab(await workbookToBytes(buildClientsWorkbook([], { plantilla: true })))
    const parsed = await parseClientsFile({ name: 'plantilla-clientes.xlsx', bytes, maxRows: 2000 })
    expect(parsed).toEqual({ ok: true, validHeader: true, rows: [] })
  })
})

describe('parseClientsFile — headers', () => {
  const data = ['Ana', '111', 'a@t.com', '', '', '', '']

  it('MAYÚSCULAS con acento → válido', async () => {
    const headers = ['NOMBRE', 'TELÉFONO', 'EMAIL', 'ORIGEN', 'NOTAS', 'OBRA SOCIAL', 'NRO. OBRA SOCIAL']
    const bytes = await handWorkbook([{ name: 'Clientes', rows: [headers, data] }])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.validHeader).toBe(true)
    expect(parsed.ok && parsed.rows[0].telefono).toBe('111')
  })

  it('snake_case → válido', async () => {
    const bytes = await handWorkbook([{ name: 'Clientes', rows: [SNAKE, data] }])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.validHeader).toBe(true)
  })

  it('6 columnas (sin Email) → inválido', async () => {
    const headers = ['Nombre', 'Teléfono', 'Origen', 'Notas', 'Obra social', 'Nro. obra social']
    const bytes = await handWorkbook([{ name: 'Clientes', rows: [headers, ['Ana', '111', '', '', '', '']] }])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed).toEqual({ ok: true, validHeader: false, rows: [] })
  })

  it('columnas extra se ignoran y un canónico repetido lo gana la primera columna', async () => {
    const headers = ['Extra', ...SNAKE, 'Nombre']
    const bytes = await handWorkbook([{ name: 'Clientes', rows: [headers, ['x', ...data, 'otro']] }])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.rows[0]).toEqual({
      nombre: 'Ana',
      telefono: '111',
      email: 'a@t.com',
      origen: '',
      notas: '',
      obra_social: '',
      nro_obra_social: '',
    })
  })
})

describe('cellText — tipos de celda', () => {
  it.each<[string, ExcelJS.CellValue, string]>([
    ['número', 1122334455, '1122334455'],
    ['número largo sin exponente', 5491122334455, '5491122334455'],
    ['entero fuera del rango seguro', 1e21, '1000000000000000000000'],
    ['hipervínculo', { text: 'ana@test.com', hyperlink: 'mailto:ana@test.com' }, 'ana@test.com'],
    ['richText', { richText: [{ text: 'Ana ' }, { text: 'María' }] }, 'Ana María'],
    ['fórmula con resultado', { formula: '1+1', result: 2 }, '2'],
    ['fórmula sin resultado', { formula: '1+1' }, ''],
    ['error', { error: '#N/A' }, ''],
    ['null', null, ''],
    ['fecha', new Date(Date.UTC(2026, 2, 15)), '2026-03-15'],
  ])('%s', (_label, value, expected) => {
    expect(cellText(value)).toBe(expected)
  })

  it('las mismas celdas, dentro de un archivo de verdad', async () => {
    const bytes = await handWorkbook([
      {
        name: 'Clientes',
        rows: [
          SNAKE,
          [
            { richText: [{ text: 'Ana ' }, { text: 'María' }] },
            5491122334455,
            { text: 'ana@test.com', hyperlink: 'mailto:ana@test.com' },
            '',
            { formula: '1+1', result: 2 },
            { error: '#N/A' },
            1122334455,
          ],
        ],
      },
    ])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.rows[0]).toEqual({
      nombre: 'Ana María',
      telefono: '5491122334455',
      email: 'ana@test.com',
      origen: '',
      notas: '2',
      obra_social: '',
      nro_obra_social: '1122334455',
    })
  })

  it("una celda de texto `'=Ana` → classifyRows la deja en `=Ana`", async () => {
    const bytes = await handWorkbook([{ name: 'Clientes', rows: [SNAKE, ["'=Ana", '', 'a@t.com', '', '', '', '']] }])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    if (!parsed.ok) throw new Error('no parseó')
    expect(classifyRows({ rows: parsed.rows, existing: [], business }).importables[0].nombre).toBe('=Ana')
  })
})

describe('parseClientsFile — qué hoja y qué filas', () => {
  const data = ['Ana', '111', '', '', '', '', '']

  it('con Instrucciones PRIMERO y Clientes segunda → lee Clientes', async () => {
    const bytes = await handWorkbook([
      { name: 'Instrucciones', rows: [['Columna', 'Qué poner'], ['Nombre', 'Obligatorio.']] },
      { name: 'Clientes', rows: [SNAKE, data] },
    ])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.validHeader).toBe(true)
    expect(parsed.ok && parsed.rows.map((r) => r.nombre)).toEqual(['Ana'])
  })

  it('una sola hoja llamada Hoja1 → la lee', async () => {
    const bytes = await handWorkbook([{ name: 'Hoja1', rows: [SNAKE, data] }])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.rows).toHaveLength(1)
  })

  it('una fila con solo espacios en el medio se saltea', async () => {
    const bytes = await handWorkbook([
      { name: 'Clientes', rows: [SNAKE, data, ['  ', ' ', '', '', '', '', ''], ['Beto', '222', '', '', '', '', '']] },
    ])
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.rows.map((r) => r.nombre)).toEqual(['Ana', 'Beto'])
  })
})

describe('detectImportFormat / parseClientsFile — el formato lo decide el contenido', () => {
  const enc = (s: string) => ab(new TextEncoder().encode(s))
  const CSV = '﻿' + SNAKE.join(',') + '\r\n"Ana","111","","","","",""'

  it('x.csv con BOM → camino CSV con filas', async () => {
    expect(detectImportFormat({ name: 'x.csv', bytes: enc(CSV) })).toBe('csv')
    const parsed = await parseClientsFile({ name: 'x.csv', bytes: enc(CSV), maxRows: 2000 })
    expect(parsed.ok && parsed.validHeader).toBe(true)
    expect(parsed.ok && parsed.rows[0].nombre).toBe('Ana')
  })

  it('el CSV colapsado por Excel ES sigue entrando', async () => {
    // Mismo fixture que test/clients-import.test.ts (bytes exactos del UAT).
    const excelCollapsed = [
      '"nombre,""telefono"",""email"",""origen"",""notas"",""obra_social"",""nro_obra_social"""',
      '"Franco Ezequiel,""03487675109"",""francovellani@gmail.com"",""manual"",""Alergico"",""Accord Salud"",""8548698"""',
    ].join('\r\n')
    const parsed = await parseClientsFile({ name: 'x.csv', bytes: enc(excelCollapsed), maxRows: 2000 })
    expect(parsed.ok && parsed.validHeader).toBe(true)
    expect(parsed.ok && parsed.rows[0].telefono).toBe('03487675109')
  })

  it('el prefijo anti-fórmula del CSV viejo se sigue sacando', async () => {
    const csv = SNAKE.join(',') + '\r\n"\'=Ana","","a@t.com","","","",""'
    const parsed = await parseClientsFile({ name: 'x.csv', bytes: enc(csv), maxRows: 2000 })
    if (!parsed.ok) throw new Error('no parseó')
    expect(parsed.rows[0].nombre).toBe("'=Ana")
    expect(classifyRows({ rows: parsed.rows, existing: [], business }).importables[0].nombre).toBe('=Ana')
  })

  it('x.xlsx con bytes de CSV → invalid_file_type', async () => {
    expect(await parseClientsFile({ name: 'x.xlsx', bytes: enc(CSV), maxRows: 2000 })).toEqual({
      ok: false,
      error: 'invalid_file_type',
    })
  })

  it('x.txt con bytes de xlsx → invalid_file_type', async () => {
    const bytes = ab(await workbookToBytes(buildClientsWorkbook([])))
    expect(detectImportFormat({ name: 'x.txt', bytes })).toBeNull()
    expect(await parseClientsFile({ name: 'x.txt', bytes, maxRows: 2000 })).toEqual({
      ok: false,
      error: 'invalid_file_type',
    })
  })

  it('x.csv con bytes de xlsx → se lee como xlsx (manda el contenido)', async () => {
    const bytes = ab(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana', phone: '111' })])))
    expect(detectImportFormat({ name: 'x.csv', bytes })).toBe('xlsx')
    const parsed = await parseClientsFile({ name: 'x.csv', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.rows[0].nombre).toBe('Ana')
  })

  it('X.XLSX en mayúsculas → ok', async () => {
    const bytes = ab(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana', phone: '111' })])))
    const parsed = await parseClientsFile({ name: 'X.XLSX', bytes, maxRows: 2000 })
    expect(parsed.ok && parsed.validHeader).toBe(true)
  })

  it("x.xlsx con 'PK\\x03\\x04' + basura → unreadable_file", async () => {
    const junk = new Uint8Array(200)
    junk.set([0x50, 0x4b, 0x03, 0x04])
    for (let i = 4; i < junk.length; i++) junk[i] = (i * 37) & 0xff
    expect(await parseClientsFile({ name: 'x.xlsx', bytes: ab(junk), maxRows: 2000 })).toEqual({
      ok: false,
      error: 'unreadable_file',
    })
  })
})

describe('límites — filas y ZIP-bomba', () => {
  it('maxRows 2 con 3 filas de datos → too_many_rows', async () => {
    const bytes = ab(
      await workbookToBytes(
        buildClientsWorkbook([row({ name: 'A', phone: '1' }), row({ name: 'B', phone: '2' }), row({ name: 'C', phone: '3' })]),
      ),
    )
    expect(await parseClientsFile({ name: 'x.xlsx', bytes, maxRows: 2 })).toEqual({ ok: false, error: 'too_many_rows' })
  })

  it('un libro real y un export de 2000 filas pasan el pre-chequeo', async () => {
    expect(zipDeclaredSizeOk(ab(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana' })]))))).toBe(true)
    const many = Array.from({ length: 2000 }, (_, i) =>
      row({ name: `Cliente ${i}`, phone: `11 ${String(i).padStart(8, '0')}`, email: `c${i}@test.com`, notes: 'nota '.repeat(10) }),
    )
    const big = ab(await workbookToBytes(buildClientsWorkbook(many)))
    expect(zipDeclaredSizeOk(big)).toBe(true)
    const parsed = await parseClientsFile({ name: 'x.xlsx', bytes: big, maxRows: 2000 })
    expect(parsed.ok && parsed.rows).toHaveLength(2000)
  })

  it('tamaño descomprimido declarado de la primera entrada parcheado a 0x7FFFFFF0 → false y unreadable_file', async () => {
    const src = new Uint8Array(ab(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana', phone: '111' })]))))
    const copy = new Uint8Array(src)
    let cd = -1
    for (let i = 0; i + 4 <= copy.length; i++) {
      if (copy[i] === 0x50 && copy[i + 1] === 0x4b && copy[i + 2] === 0x01 && copy[i + 3] === 0x02) {
        cd = i
        break
      }
    }
    expect(cd).toBeGreaterThan(0)
    new DataView(copy.buffer).setUint32(cd + 24, 0x7ffffff0, true)
    expect(zipDeclaredSizeOk(copy.buffer)).toBe(false)
    expect(await parseClientsFile({ name: 'x.xlsx', bytes: copy.buffer, maxRows: 2000 })).toEqual({
      ok: false,
      error: 'unreadable_file',
    })
  })

  it('más entradas que el tope → false', async () => {
    const bytes = ab(await workbookToBytes(buildClientsWorkbook([row({ name: 'Ana' })])))
    expect(zipDeclaredSizeOk(bytes, { maxUnzippedBytes: 30 * 1024 * 1024, maxEntries: 2 })).toBe(false)
  })

  it('un buffer sin registro de fin de directorio → false', () => {
    expect(zipDeclaredSizeOk(new ArrayBuffer(100))).toBe(false)
    expect(zipDeclaredSizeOk(new ArrayBuffer(0))).toBe(false)
  })
})
