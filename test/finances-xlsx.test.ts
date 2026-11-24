import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildFinancesWorkbook, financesSummary, type FinancesExportInput } from '@/lib/finances-xlsx'
import { workbookToBytes, BRAND_ARGB, WHITE_ARGB, DATE_FMT } from '@/lib/xlsx-style'

// ── Excel de finanzas (quick 261124-ine) ────────────────────────────────────────────────────────
// Suite PURA (sin test/env → carril `pure`). Se arma el libro, se pasa a bytes y se recarga con la
// librería: se prueba el archivo que baja el dueño, no el objeto en memoria.

async function reload(input: FinancesExportInput): Promise<ExcelJS.Workbook> {
  const bytes = await workbookToBytes(buildFinancesWorkbook(input))
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  return wb
}

const INPUT: FinancesExportInput = {
  turnos: [
    { fecha: '2026-03-01', servicio: 'Corte', monto: 1000 },
    { fecha: '2026-03-15', servicio: 'Color', monto: 2500 },
  ],
  ventas: [{ fecha: '2026-03-10', descripcion: 'Shampoo', cantidad: 2, precioUnitario: 1500 }],
  egresos: [{ fecha: '2026-03-05', categoria: 'Alquiler', monto: 500 }],
}

const EMPTY: FinancesExportInput = { turnos: [], ventas: [], egresos: [] }

// Busca en la hoja Resumen la fila por la etiqueta de la columna A.
function resumenRow(wb: ExcelJS.Workbook, label: string): ExcelJS.Row {
  const ws = wb.getWorksheet('Resumen')!
  let found: ExcelJS.Row | undefined
  ws.eachRow((r) => {
    if (r.getCell(1).value === label) found = r
  })
  if (!found) throw new Error(`no está la fila ${label} en Resumen`)
  return found
}

describe('buildFinancesWorkbook — estructura', () => {
  it('hojas Resumen · Turnos · Ventas · Egresos en ese orden, con el encabezado de marca congelado', async () => {
    const wb = await reload(INPUT)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Turnos', 'Ventas', 'Egresos'])
    for (const ws of wb.worksheets) {
      const cell = ws.getRow(1).getCell(1)
      expect((cell.fill as ExcelJS.FillPattern).fgColor?.argb).toBe(BRAND_ARGB)
      expect(cell.font?.bold).toBe(true)
      expect(cell.font?.color?.argb).toBe(WHITE_ARGB)
      expect((ws.views[0] as ExcelJS.WorksheetViewFrozen).ySplit).toBe(1)
    }
  })
})

describe('financesSummary + hoja Resumen', () => {
  it('totales calculados', () => {
    expect(financesSummary(INPUT)).toEqual({
      turnos: { cantidad: 2, monto: 3500 },
      ventas: { cantidad: 1, monto: 3000 },
      ingresos: 6500,
      egresos: { cantidad: 1, monto: 500 },
      saldo: 6000,
    })
  })

  it('el Resumen trae VALORES (números, no fórmulas)', async () => {
    const wb = await reload(INPUT)
    for (const [label, monto] of [
      ['Turnos', 3500],
      ['Ventas', 3000],
      ['Ingresos', 6500],
      ['Egresos', 500],
      ['Saldo', 6000],
    ] as const) {
      const cell = resumenRow(wb, label).getCell(3)
      expect(cell.type).toBe(ExcelJS.ValueType.Number)
      expect(cell.value).toBe(monto)
    }
    expect(resumenRow(wb, 'Turnos').getCell(2).value).toBe(2)
    expect(resumenRow(wb, 'Ingresos').getCell(2).value).toBeNull()
    wb.worksheets.forEach((ws) =>
      ws.eachRow((r) => r.eachCell((c) => expect(c.type).not.toBe(ExcelJS.ValueType.Formula))),
    )
  })

  it('un número no finito cuenta como 0', () => {
    const s = financesSummary({ turnos: [{ fecha: '2026-03-01', servicio: 'x', monto: NaN }], ventas: [], egresos: [] })
    expect(s.turnos).toEqual({ cantidad: 1, monto: 0 })
  })
})

describe('hojas de datos — fechas, montos y orden', () => {
  it('Turnos: fila 2 = la fecha más nueva, como fecha UTC dd/mm/yyyy y monto con formato de pesos', async () => {
    const wb = await reload(INPUT)
    const ws = wb.getWorksheet('Turnos')!
    const fecha = ws.getRow(2).getCell(1)
    expect(fecha.value).toBeInstanceOf(Date)
    const d = fecha.value as Date
    expect([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]).toEqual([2026, 2, 15])
    expect(fecha.numFmt).toBe(DATE_FMT)
    const monto = ws.getRow(2).getCell(3)
    expect(monto.value).toBe(2500)
    expect(monto.numFmt).toContain('#,##0.00')
    expect(ws.getRow(3).getCell(2).value).toBe('Corte')
  })

  it('Ventas: Cantidad, Precio unitario y Total como números', async () => {
    const wb = await reload(INPUT)
    const r = wb.getWorksheet('Ventas')!.getRow(2)
    expect(r.getCell(2).value).toBe('Shampoo')
    expect(r.getCell(3).value).toBe(2)
    expect(r.getCell(4).value).toBe(1500)
    expect(r.getCell(5).value).toBe(3000)
    expect(r.getCell(5).type).toBe(ExcelJS.ValueType.Number)
  })

  it('una descripción `=SUM(A1)` queda como texto; una fecha vacía o inválida deja la celda vacía', async () => {
    const wb = await reload({
      turnos: [],
      ventas: [
        { fecha: '', descripcion: '=SUM(A1)', cantidad: 1, precioUnitario: 10 },
        { fecha: '2026-02-31', descripcion: 'x', cantidad: 1, precioUnitario: 10 },
        { fecha: 'mañana', descripcion: 'y', cantidad: 1, precioUnitario: 10 },
      ],
      egresos: [],
    })
    const ws = wb.getWorksheet('Ventas')!
    let sum: ExcelJS.Cell | undefined
    ws.eachRow((r, n) => {
      if (n === 1) return
      expect(r.getCell(1).value ?? null).toBeNull()
      if (r.getCell(2).value === '=SUM(A1)') sum = r.getCell(2)
    })
    expect(sum?.type).toBe(ExcelJS.ValueType.String)
    expect(sum?.formula).toBeUndefined()
  })

  it('sin movimientos: las cuatro hojas existen, Resumen en 0, datos solo con encabezados', async () => {
    const wb = await reload(EMPTY)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Turnos', 'Ventas', 'Egresos'])
    expect(resumenRow(wb, 'Saldo').getCell(3).value).toBe(0)
    expect(resumenRow(wb, 'Ingresos').getCell(3).value).toBe(0)
    for (const name of ['Turnos', 'Ventas', 'Egresos']) {
      expect(wb.getWorksheet(name)!.actualRowCount).toBe(1)
    }
  })

  it('la entrada no se muta (el orden desc se hace sobre copias)', () => {
    const input: FinancesExportInput = JSON.parse(JSON.stringify(INPUT))
    buildFinancesWorkbook(input)
    expect(input).toEqual(INPUT)
    expect(input.turnos.map((t) => t.fecha)).toEqual(['2026-03-01', '2026-03-15'])
  })
})
