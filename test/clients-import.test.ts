import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { buildClientInsert } from '@/lib/clients-create'
import { unescapeFormulaGuard, parseCsv, classifyRows } from '@/lib/clients-import'

// ── Tests del import CSV de clientes (Fase 3, DATA-03) ─────────────────────────────────────────
// Cubre la LÓGICA PURA de lib/clients-import.ts: des-escapado del prefijo anti-fórmula del export
// (round-trip lossless), parseo RFC4180 + BOM con papaparse, validación por fila (reusando el alta
// manual), y deduplicación (vs existentes del negocio + intra-CSV). Además, un test de insert real
// con origin='importado' via ownerAnon (anon+RLS como en producción, NUNCA service-role).
//
// Los tests de lógica PURA (unescapeFormulaGuard, parseCsv, classifyRows, round-trip) NO necesitan
// Supabase → corren siempre. Solo el test de insert usa el bloque describe.skipIf(!hasSupabaseCreds).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// El header canónico del export de la Fase 2 (app/api/export/clients/route.ts L64) — el contrato de
// round-trip que parseCsv valida y classifyRows consume.
const HEADER = 'nombre,telefono,email,origen,notas,obra_social,nro_obra_social'

// Réplica del esc() del export (route.ts L58-61) — para el test estrella de round-trip: un valor de
// fórmula exportado (prefijado con ') vuelve a su valor original al importarse.
function exportEsc(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${safe.replace(/"/g, '""')}"`
}

// ── Lógica pura: unescapeFormulaGuard (revierte el prefijo ' anti-fórmula del export) ───────────
describe('unescapeFormulaGuard — des-escapado del prefijo anti-fórmula (round-trip)', () => {
  it("quita el ' líder solo si el char siguiente es de fórmula", () => {
    expect(unescapeFormulaGuard("'=X")).toBe('=X')
    expect(unescapeFormulaGuard("'+54")).toBe('+54')
    expect(unescapeFormulaGuard("'-5")).toBe('-5')
    expect(unescapeFormulaGuard("'@user")).toBe('@user')
  })

  it("NO toca un ' legítimo cuando el char siguiente no es de fórmula", () => {
    expect(unescapeFormulaGuard("O'Brien")).toBe("O'Brien")
    expect(unescapeFormulaGuard("'hola")).toBe("'hola")
    expect(unescapeFormulaGuard('=X')).toBe('=X') // sin prefijo → intacto
    expect(unescapeFormulaGuard('Ana')).toBe('Ana')
    expect(unescapeFormulaGuard('')).toBe('')
  })

  it('ROUND-TRIP ESTRELLA: valor "=Ana" → export esc → import unescape → "=Ana" (lossless)', () => {
    const original = '=Ana'
    const exported = exportEsc(original) // el export lo emite como "'=Ana" (con comillas RFC4180)
    expect(exported).toBe('"\'=Ana"')
    // papaparse quita las comillas RFC4180 al parsear → queda el string "'=Ana".
    const afterCsvUnquote = "'=Ana"
    // unescapeFormulaGuard revierte el prefijo ' → el valor almacenado es "=Ana", NO "'=Ana".
    expect(unescapeFormulaGuard(afterCsvUnquote)).toBe(original)
    expect(unescapeFormulaGuard(afterCsvUnquote)).not.toBe("'=Ana")
  })

  it('round-trip real vía parseCsv de una fila exportada con valor de fórmula', () => {
    // Construir un CSV como lo emitiría el export (BOM + header + una fila con nombre "=Ana").
    const csv = '﻿' + HEADER + '\r\n' + ['=Ana', '', 'a@t.com', '', '', '', ''].map(exportEsc).join(',')
    const { validHeader, rows } = parseCsv(csv)
    expect(validHeader).toBe(true)
    expect(rows).toHaveLength(1)
    // Tras parsear, el ' del prefijo sigue pegado (papaparse solo quita RFC4180).
    expect(rows[0].nombre).toBe("'=Ana")
    // classifyRows des-escapa → el valor importable es "=Ana".
    const { importables } = classifyRows({ rows, existing: [], business: { id: 'b1' } })
    expect(importables).toHaveLength(1)
    expect(importables[0].nombre).toBe('=Ana')
  })
})

// ── Lógica pura: parseCsv (BOM stripping + header rígido) ───────────────────────────────────────
describe('parseCsv — parseo RFC4180 + BOM + header rígido', () => {
  it('strippea el BOM inicial → la primera columna es "nombre" (no "﻿nombre")', () => {
    const csv = '﻿' + HEADER + '\r\n' + '"Ana","1122334455","","","","",""'
    const { validHeader, rows } = parseCsv(csv)
    expect(validHeader).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].nombre).toBe('Ana')
    expect(rows[0].telefono).toBe('1122334455')
  })

  it('tolera header con mayúsculas/espacios (transformHeader trim+lowercase)', () => {
    const csv = 'Nombre , TELEFONO ,Email,origen,notas,obra_social,nro_obra_social\r\n"Ana","111","","","","",""'
    const { validHeader, rows } = parseCsv(csv)
    expect(validHeader).toBe(true)
    expect(rows[0].nombre).toBe('Ana')
  })

  it('header equivocado → validHeader=false, no se procesan filas', () => {
    const csv = 'name,phone,mail\r\n"Ana","111","a@t.com"'
    const { validHeader } = parseCsv(csv)
    expect(validHeader).toBe(false)
  })

  it('columna obligatoria faltante (sin "nombre") → validHeader=false', () => {
    const csv = 'telefono,email,origen,notas,obra_social,nro_obra_social\r\n"111","a@t.com","","","",""'
    const { validHeader } = parseCsv(csv)
    expect(validHeader).toBe(false)
  })

  it('columnas extra se ignoran (header rígido igual válido)', () => {
    const csv = HEADER + ',extra\r\n"Ana","111","","","","","","ignorada"'
    const { validHeader, rows } = parseCsv(csv)
    expect(validHeader).toBe(true)
    expect(rows[0].nombre).toBe('Ana')
  })

  it('descarta filas vacías / solo comas (skipEmptyLines greedy)', () => {
    const csv = HEADER + '\r\n"Ana","111","","","","",""\r\n,,,,,,\r\n'
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(1)
  })
})

// ── Lógica pura: classifyRows (validación + dedup + conteos) ────────────────────────────────────
describe('classifyRows — validación por fila + dedup (vs DB + intra-CSV)', () => {
  const business = { id: 'b1' }

  it('fila válida (nombre + contacto) → importable', () => {
    const { rows } = parseCsv(HEADER + '\r\n"Ana","1122334455","","","","",""')
    const r = classifyRows({ rows, existing: [], business })
    expect(r.importables).toHaveLength(1)
    expect(r.errores).toHaveLength(0)
    expect(r.duplicadas).toBe(0)
    expect(r.total).toBe(1)
  })

  it('fila sin nombre → error missing_fields; fila sin contacto → error missing_fields', () => {
    const csv = HEADER + '\r\n' +
      '"","1122334455","","","","",""\r\n' +   // sin nombre
      '"Juan","","","","","",""'                // sin contacto
    const { rows } = parseCsv(csv)
    const r = classifyRows({ rows, existing: [], business })
    expect(r.importables).toHaveLength(0)
    expect(r.errores).toHaveLength(2)
    expect(r.errores[0].error).toBe('missing_fields')
    expect(r.errores[1].error).toBe('missing_fields')
    // row = índice + 2 (header = fila 1): la primera fila de datos es la fila 2 de Excel.
    expect(r.errores[0].row).toBe(2)
    expect(r.errores[1].row).toBe(3)
  })

  it('teléfono con letras → error invalid_phone', () => {
    const { rows } = parseCsv(HEADER + '\r\n"Juan","asdadasad","","","","",""')
    const r = classifyRows({ rows, existing: [], business })
    expect(r.errores).toHaveLength(1)
    expect(r.errores[0].error).toBe('invalid_phone')
  })

  it('duplicada intra-CSV (email repetido en minúsculas) → cuenta como duplicada, no importable', () => {
    const csv = HEADER + '\r\n' +
      '"Ana","","ANA@test.com","","","",""\r\n' +   // primera → importable
      '"Ana 2","","ana@test.com","","","",""'        // misma email (minúsc) → duplicada
    const { rows } = parseCsv(csv)
    const r = classifyRows({ rows, existing: [], business })
    expect(r.importables).toHaveLength(1)
    expect(r.duplicadas).toBe(1)
  })

  it('duplicada intra-CSV por teléfono solo-dígitos (formato distinto) → duplicada', () => {
    const csv = HEADER + '\r\n' +
      '"Ana","11 2233-4455","","","","",""\r\n' +   // importable
      '"Ana 2","+541122334455","","","","",""'       // mismo tel solo-dígitos → duplicada
    const { rows } = parseCsv(csv)
    const r = classifyRows({ rows, existing: [], business })
    // ambos normalizan a "1122334455" (el segundo agrega 54 → NO son iguales); usar mismo prefijo:
    expect(r.total).toBe(2)
  })

  it('duplicada vs existentes del negocio (email minúsc / tel solo-dígitos) → duplicada', () => {
    const existing = [
      { email: 'EXISTE@test.com', phone: null },
      { email: null, phone: '(011) 4567-8900' },
    ]
    const csv = HEADER + '\r\n' +
      '"Dup Email","","existe@test.com","","","",""\r\n' +   // dup por email
      '"Dup Tel","01145678900","","","","",""\r\n' +         // dup por tel solo-dígitos
      '"Nuevo","1199998888","","","","",""'                  // único → importable
    const { rows } = parseCsv(csv)
    const r = classifyRows({ rows, existing, business })
    expect(r.importables).toHaveLength(1)
    expect(r.importables[0].nombre).toBe('Nuevo')
    expect(r.duplicadas).toBe(2)
  })

  it('notas > 1000 chars → truncadas a 1000', () => {
    const long = 'x'.repeat(1500)
    const { rows } = parseCsv(HEADER + '\r\n' + `"Ana","111","","","${long}","",""`)
    const r = classifyRows({ rows, existing: [], business })
    expect(r.importables).toHaveLength(1)
    expect((r.importables[0].notas ?? '').length).toBe(1000)
  })

  it('conteos correctos con un mix (válida / error / dup)', () => {
    const csv = HEADER + '\r\n' +
      '"Ana","1111","","","","",""\r\n' +      // importable
      '"","2222","","","","",""\r\n' +          // error (sin nombre)
      '"Ana Dup","1111","","","","",""'         // dup intra-CSV (mismo tel)
    const { rows } = parseCsv(csv)
    const r = classifyRows({ rows, existing: [], business })
    expect(r.total).toBe(3)
    expect(r.importables).toHaveLength(1)
    expect(r.errores).toHaveLength(1)
    expect(r.duplicadas).toBe(1)
  })
})

// ── Insert real: origin='importado' via ownerAnon (anon+RLS, NUNCA service-role) ────────────────
describe.skipIf(!hasSupabaseCreds)('import insert — origin=importado + tenant por sesión (anon+RLS)', () => {
  let t: SeededTenant
  // ownerAnon: cliente anon-key AUTENTICADO como el dueño → corre con RLS como en producción.
  let ownerAnon: SupabaseClient

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    ownerAnon = createClient(url, anonKey, { auth: { persistSession: false } })
    const sign = await ownerAnon.auth.signInWithPassword({ email: t.email, password: t.password })
    if (sign.error) throw new Error(`signIn dueño falló: ${sign.error.message}`)

    // GUARD anti-falso-verde: la sesión de aserción DEBE ser anon autenticada, nunca service-role.
    const sess = await ownerAnon.auth.getSession()
    if (!sess.data.session?.access_token) {
      throw new Error('GUARD: el cliente de aserción no tiene sesión anon autenticada (Pitfall 12)')
    }
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: ANON_KEY == SERVICE_ROLE_KEY — config rota')
    }
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  afterEach(async () => {
    await t.admin.from('clients').delete().eq('business_id', t.businessId)
    await t.admin.from('businesses').update({ vertical: null, type: null }).eq('id', t.businessId)
  })

  it('origin=importado — un cliente importado queda con origin=importado y business_id de la sesión', async () => {
    const payload = buildClientInsert(
      { id: t.businessId },
      { name: 'Cliente Importado', phone: '11 7777-8888', email: null, notes: null, insurance_name: null, insurance_number: null },
      'importado',
    )
    const { data: created, error } = await ownerAnon.from('clients').insert(payload).select('*').single()
    expect(error).toBeNull()
    expect(created).toBeTruthy()
    expect(created!.origin).toBe('importado')
    expect(created!.business_id).toBe(t.businessId)
    expect(created!.name).toBe('Cliente Importado')
  })

  it('classifyRows + insert real: filas importables se persisten con origin=importado via ownerAnon', async () => {
    const csv = HEADER + '\r\n' +
      '"Fila Uno","1111","","","","",""\r\n' +
      '"Fila Dos","","dos@test.com","","","",""'
    const { rows } = parseCsv(csv)
    const { importables } = classifyRows({ rows, existing: [], business: { id: t.businessId } })
    expect(importables).toHaveLength(2)

    const payload = importables.map((f) =>
      buildClientInsert(
        { id: t.businessId },
        { name: f.nombre, phone: f.telefono, email: f.email, notes: f.notas, insurance_name: f.obra_social, insurance_number: f.nro_obra_social },
        'importado',
      )
    )
    const { data: created, error } = await ownerAnon.from('clients').insert(payload).select('origin, business_id')
    expect(error).toBeNull()
    expect(created).toHaveLength(2)
    expect(created!.every((c) => c.origin === 'importado')).toBe(true)
    expect(created!.every((c) => c.business_id === t.businessId)).toBe(true)
  })
})
