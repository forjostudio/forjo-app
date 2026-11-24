// El Excel (.xlsx) del export de finanzas (quick 261124-ine, DATA-02). Módulo PURO y SOLO de servidor:
// lo usan app/api/export/finances/route.ts y sus tests. Nunca importarlo desde un componente 'use
// client' — llevaría la librería de planillas al navegador.
//
// Por qué así:
//   • Un libro con Resumen + una hoja por tipo de movimiento (Turnos, Ventas, Egresos): el contador ve
//     los totales primero y cada hoja tiene SUS columnas (una venta tiene cantidad y precio unitario,
//     un turno no). El CSV viejo los mezclaba en una sola tabla con una columna `tipo`.
//   • El Resumen lleva VALORES calculados, nunca fórmulas: el número que ve el dueño es el que calculó
//     el server, y no depende de que Excel recalcule (ni de que alguien borre una fila de otra hoja).
//   • Fechas como fecha real de Excel (se pueden filtrar y ordenar), construidas en UTC para que
//     muestren el MISMO día que la DB (ymdToUtcDate). Montos como número con formato de pesos.
//   • NO se incluye fixed_expenses: son plantillas recurrentes (name / amount / frequency), NO
//     movimientos fechados. Meterlas obligaría a inventar fechas y rompería la coherencia de un export
//     que es un registro de hechos fechados. Quedan fuera a propósito.

import ExcelJS from 'exceljs'
import { ARS_FMT, DATE_FMT, styleHeaderSheet, ymdToUtcDate } from '@/lib/xlsx-style'

// ── Tipos ───────────────────────────────────────────────────────────────────────────────────────

export interface TurnoRow {
  fecha: string
  servicio: string
  monto: number
}

export interface VentaRow {
  fecha: string
  descripcion: string
  cantidad: number
  precioUnitario: number
}

export interface EgresoRow {
  fecha: string
  categoria: string
  monto: number
}

export interface FinancesExportInput {
  turnos: TurnoRow[]
  ventas: VentaRow[]
  egresos: EgresoRow[]
}

export interface FinancesSummary {
  turnos: { cantidad: number; monto: number }
  ventas: { cantidad: number; monto: number }
  ingresos: number
  egresos: { cantidad: number; monto: number }
  saldo: number
}

// ── Cálculo ─────────────────────────────────────────────────────────────────────────────────────

// Un número que no es finito (NaN de un Number(null) raro, Infinity) cuenta como 0.
const num = (v: number) => (Number.isFinite(v) ? v : 0)

// Total de una venta = cantidad × precio unitario (el mismo cálculo que la ruta y finances-client).
const ventaTotal = (v: VentaRow) => num(num(v.cantidad) * num(v.precioUnitario))

export function financesSummary(input: FinancesExportInput): FinancesSummary {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + num(b), 0)
  const turnos = { cantidad: input.turnos.length, monto: sum(input.turnos.map((t) => t.monto)) }
  const ventas = { cantidad: input.ventas.length, monto: sum(input.ventas.map(ventaTotal)) }
  const egresos = { cantidad: input.egresos.length, monto: sum(input.egresos.map((e) => e.monto)) }
  const ingresos = turnos.monto + ventas.monto
  return { turnos, ventas, ingresos, egresos, saldo: ingresos - egresos.monto }
}

// Fecha descendente con el mismo comparador de strings de siempre, sobre una COPIA (no muta la entrada).
function byFechaDesc<T extends { fecha: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
}

// ── Builder ─────────────────────────────────────────────────────────────────────────────────────

export function buildFinancesWorkbook(input: FinancesExportInput): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  const s = financesSummary(input)

  // Resumen: Ingresos y Saldo en negrita y sin cantidad (son totales, no movimientos).
  const resumen = wb.addWorksheet('Resumen')
  resumen.columns = [
    { header: 'Concepto', key: 'concepto', width: 22 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Monto', key: 'monto', width: 18, style: { numFmt: ARS_FMT } },
  ]
  resumen.addRow(['Turnos', s.turnos.cantidad, s.turnos.monto])
  resumen.addRow(['Ventas', s.ventas.cantidad, s.ventas.monto])
  resumen.addRow(['Ingresos', null, s.ingresos]).font = { bold: true }
  resumen.addRow(['Egresos', s.egresos.cantidad, s.egresos.monto])
  resumen.addRow(['Saldo', null, s.saldo]).font = { bold: true }
  styleHeaderSheet(resumen, { autoFilter: false })

  const turnos = wb.addWorksheet('Turnos')
  turnos.columns = [
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: DATE_FMT } },
    { header: 'Servicio', key: 'servicio', width: 36 },
    { header: 'Monto', key: 'monto', width: 16, style: { numFmt: ARS_FMT } },
  ]
  for (const t of byFechaDesc(input.turnos)) {
    turnos.addRow([ymdToUtcDate(t.fecha), t.servicio, num(t.monto)])
  }
  styleHeaderSheet(turnos, { autoFilter: true })

  const ventas = wb.addWorksheet('Ventas')
  ventas.columns = [
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: DATE_FMT } },
    { header: 'Descripción', key: 'descripcion', width: 36 },
    { header: 'Cantidad', key: 'cantidad', width: 10 },
    { header: 'Precio unitario', key: 'precio', width: 16, style: { numFmt: ARS_FMT } },
    { header: 'Total', key: 'total', width: 16, style: { numFmt: ARS_FMT } },
  ]
  for (const v of byFechaDesc(input.ventas)) {
    ventas.addRow([ymdToUtcDate(v.fecha), v.descripcion, num(v.cantidad), num(v.precioUnitario), ventaTotal(v)])
  }
  styleHeaderSheet(ventas, { autoFilter: true })

  const egresos = wb.addWorksheet('Egresos')
  egresos.columns = [
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: DATE_FMT } },
    { header: 'Categoría', key: 'categoria', width: 30 },
    { header: 'Monto', key: 'monto', width: 16, style: { numFmt: ARS_FMT } },
  ]
  for (const e of byFechaDesc(input.egresos)) {
    egresos.addRow([ymdToUtcDate(e.fecha), e.categoria, num(e.monto)])
  }
  styleHeaderSheet(egresos, { autoFilter: true })

  return wb
}
