// Lógica PURA del import CSV de clientes (DATA-03), compartida por los route handlers de la Wave 2
// (app/api/import/clients/{preview,confirm}/route.ts) y sus tests. Framework-agnostic (sin React ni
// Next), para poder testear el contrato — sobre todo el round-trip con el export — sin levantar el
// server. La ÚNICA dep externa es papaparse (parseo RFC4180); el resto reusa @/lib/clients-create.
//
// Invariantes de seguridad que viven acá (D-01/D-02/D-03 + skill supabase-multitenant-rls):
//  - El CSV NUNCA aporta business_id ni origin: el business lo resuelve el handler por sesión y
//    origin='importado' se fuerza en el insert (buildClientInsert). Este módulo solo clasifica.
//  - unescapeFormulaGuard des-escapa el prefijo ' anti-fórmula que agrega el export. Es SEGURO:
//    la defensa anti-fórmula es de PRESENTACIÓN (se re-aplica en cada export con esc() y React
//    escapa el render en el panel). Almacenar el ' corrompería el dato sin ganar seguridad
//    (Pattern 3 / Pitfall 3 del RESEARCH; test estrella de round-trip lossless lo verifica).
//  - Header RÍGIDO = el del export de la Fase 2 (round-trip). Columnas extra se ignoran; la
//    columna `origen` del CSV se ignora (nunca llega al insert). Header equivocado → no se
//    procesan filas (D-01).
//  - Dedup = MISMO criterio que "Fusionar duplicados" (clients-client.tsx L260-266): email en
//    minúsculas + teléfono solo-dígitos. Aplica vs los existentes del negocio Y dentro del CSV.

import Papa from 'papaparse'
import { validateClientBody } from '@/lib/clients-create'

// Fila cruda tal cual la devuelve papaparse (header:true) — todas las columnas son opcionales
// porque una celda vacía viene como '' y una columna faltante como undefined.
export interface RawRow {
  nombre?: string
  telefono?: string
  email?: string
  origen?: string
  notas?: string
  obra_social?: string
  nro_obra_social?: string
}

// Fila ya normalizada y lista para buildClientInsert (post-validación + post-dedup).
export interface ImportableRow {
  nombre: string
  telefono: string | null
  email: string | null
  notas: string | null
  obra_social: string | null
  nro_obra_social: string | null
}

// Header canónico del export (app/api/export/clients/route.ts L64) — el contrato de round-trip.
// El orden no importa para la validación (papaparse mapea por nombre), pero las OBLIGATORIAS del
// header rígido deben estar todas presentes.
const CANONICAL_HEADER = [
  'nombre',
  'telefono',
  'email',
  'origen',
  'notas',
  'obra_social',
  'nro_obra_social',
] as const

// Quita UN `'` líder si y solo si el siguiente carácter es de inicio de fórmula (= + - @ tab CR).
// Ese es EXACTAMENTE el conjunto que el esc() del export prefija (route.ts L59), invertido para
// detectar el prefijo en vez de agregarlo. Un `'` legítimo (O'Brien) NO se toca porque ahí el char
// siguiente no matchea. Acoplado al export: si el export cambia el conjunto, cambiar acá también.
export function unescapeFormulaGuard(v: string): string {
  return v.startsWith("'") && /^[=+\-@\t\r]/.test(v.slice(1)) ? v.slice(1) : v
}

// Resultado del parseo: filas crudas + si el header rígido es válido (D-01).
export interface ParseResult {
  validHeader: boolean
  rows: RawRow[]
}

// Parseo RFC4180 con papaparse. Strip defensivo del BOM del export (U+FEFF vía secuencia de escape,
// NUNCA el glifo pegado — misma convención que el export). transformHeader normaliza trim+lowercase
// para tolerar "Nombre "/"TELEFONO" sin habilitar mapeo flexible (eso es v2). El header rígido se
// valida contra CANONICAL_HEADER; si falta una columna obligatoria → validHeader=false y no se
// devuelven filas (el handler responde invalid_header).
export function parseCsv(text: string): ParseResult {
  const clean = text.replace(/^﻿/, '')
  const result = Papa.parse<RawRow>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const fields = result.meta.fields ?? []
  const validHeader = CANONICAL_HEADER.every((col) => fields.includes(col))
  if (!validHeader) return { validHeader: false, rows: [] }

  return { validHeader: true, rows: result.data }
}

// Un contacto (email/teléfono) existente para el índice de dedup (viene de la query de clientes del
// negocio, filtrada por business_id de la sesión).
export interface ExistingContact {
  email?: string | null
  phone?: string | null
}

export interface RowError {
  row: number // fila en Excel: índice 0-based del data-row + 2 (header = fila 1, 1-indexado).
  error: string // código snake_case de validateClientBody (missing_fields / invalid_phone).
}

export interface ClassifyResult {
  importables: ImportableRow[]
  errores: RowError[]
  duplicadas: number
  total: number
}

// Clasifica cada fila cruda: des-escapa → valida (reusando validateClientBody) → deduplica (vs los
// existentes del negocio Y dentro del CSV). NO inserta — devuelve las importables ya normalizadas
// (el confirm handler de la Wave 2 hace el batch insert con origin='importado').
export function classifyRows({
  rows,
  existing,
  business: _business,
}: {
  rows: RawRow[]
  existing: ExistingContact[]
  business: { id: string; type?: string | null; vertical?: string | null }
}): ClassifyResult {
  // Índices de existentes (email minúsc + teléfono solo-dígitos) — MISMA lógica que L260-266.
  const existingEmails = new Set<string>()
  const existingPhones = new Set<string>()
  for (const c of existing) {
    if (c.email) existingEmails.add(c.email.toLowerCase())
    if (c.phone) {
      const k = c.phone.replace(/\D/g, '')
      if (k) existingPhones.add(k)
    }
  }

  // Sets para dedup INTRA-CSV (dos filas iguales dentro del mismo archivo → una sola importable).
  const seenEmails = new Set<string>()
  const seenPhones = new Set<string>()

  const importables: ImportableRow[] = []
  const errores: RowError[] = []
  let duplicadas = 0

  rows.forEach((raw, i) => {
    const nombre = unescapeFormulaGuard((raw.nombre ?? '').trim())
    const telRaw = unescapeFormulaGuard((raw.telefono ?? '').trim())
    const emailRaw = unescapeFormulaGuard((raw.email ?? '').trim())
    const telefono = telRaw || null
    const email = emailRaw || null

    const invalid = validateClientBody({ name: nombre, phone: telefono, email })
    if (invalid) {
      errores.push({ row: i + 2, error: invalid })
      return
    }

    const emailKey = email ? email.toLowerCase() : null
    const phoneKey = telefono ? telefono.replace(/\D/g, '') : null

    const dupDB =
      (emailKey && existingEmails.has(emailKey)) || (!!phoneKey && existingPhones.has(phoneKey))
    const dupCSV =
      (emailKey && seenEmails.has(emailKey)) || (!!phoneKey && seenPhones.has(phoneKey))
    if (dupDB || dupCSV) {
      duplicadas++
      return
    }

    if (emailKey) seenEmails.add(emailKey)
    if (phoneKey) seenPhones.add(phoneKey)

    // Notas truncadas a 1000 chars (mismo que el alta manual — create/route.ts .slice(0,1000)).
    const notasRaw = unescapeFormulaGuard((raw.notas ?? '').trim())
    const notas = notasRaw ? notasRaw.slice(0, 1000) : null

    importables.push({
      nombre,
      telefono,
      email,
      notas,
      obra_social: (raw.obra_social ?? '').trim() || null,
      nro_obra_social: (raw.nro_obra_social ?? '').trim() || null,
    })
  })

  return { importables, errores, duplicadas, total: rows.length }
}
