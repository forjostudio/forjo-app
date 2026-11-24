// Lógica PURA del import de clientes (DATA-03), compartida por los route handlers de la Wave 2
// (app/api/import/clients/{preview,confirm}/route.ts) y sus tests. Framework-agnostic (sin React ni
// Next), para poder testear el contrato — sobre todo el round-trip con el export — sin levantar el
// server. La ÚNICA dep externa es papaparse (parseo RFC4180); el resto reusa @/lib/clients-create.
// Desde el quick 261124-ine también lo consume el import de Excel (lib/clients-xlsx.ts): el .xlsx se
// lee a las mismas RawRow con el mismo canonicalHeader, y classifyRows es el mismo para los dos.
//
// Invariantes de seguridad que viven acá (D-01/D-02/D-03 + skill supabase-multitenant-rls):
//  - El CSV NUNCA aporta business_id ni origin: el business lo resuelve el handler por sesión y
//    origin='importado' se fuerza en el insert (buildClientInsert). Este módulo solo clasifica.
//  - unescapeFormulaGuard des-escapa el prefijo ' anti-fórmula que agregaba el export CSV (los .csv
//    viejos lo siguen trayendo; el export de Excel ya no lo pone: escribe celdas de texto). Es SEGURO:
//    la defensa anti-fórmula es de PRESENTACIÓN (el export la re-aplica escribiendo texto y React
//    escapa el render en el panel). Almacenar el ' corrompería el dato sin ganar seguridad
//    (Pattern 3 / Pitfall 3 del RESEARCH; test estrella de round-trip lossless lo verifica).
//  - Header válido = la columna Nombre Y al menos una de Teléfono o Email (quick 261124-lfd). El resto
//    (Apellido, Notas, Obra social, Nro. obra social) es opcional; la columna `origen` se ignora SIEMPRE
//    (nunca llega al insert); columnas extra se ignoran. Header equivocado → no se procesan filas (D-01).
//  - Dedup = MISMO criterio que "Fusionar duplicados" (clients-client.tsx L260-266): email en
//    minúsculas + teléfono solo-dígitos. Aplica vs los existentes del negocio Y dentro del CSV.

import Papa from 'papaparse'
import { validateClientBody } from '@/lib/clients-create'
import { normalizeLastName } from '@/lib/client-name'

// Fila cruda tal cual la devuelve papaparse (header:true) — todas las columnas son opcionales
// porque una celda vacía viene como '' y una columna faltante como undefined.
export interface RawRow {
  nombre?: string
  apellido?: string
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
  // Apellido opcional (migr. 081): normalizeLastName → null si viene vacío o falta la columna.
  apellido: string | null
  telefono: string | null
  email: string | null
  notas: string | null
  obra_social: string | null
  nro_obra_social: string | null
}

// Columnas RECONOCIDAS (ya normalizadas por canonicalHeader), en el orden del export nuevo. El export
// de Excel escribe los títulos legibles (Nombre, Apellido, Teléfono, … Origen) y el CSV viejo los
// escribía en snake_case: los dos normalizan a esto. Desde el quick 261124-lfd YA NO son todas
// obligatorias: las obligatorias las decide isValidImportHeader. El orden no importa (se mapea por
// nombre). `origen` se reconoce para no confundirla con una extra, pero se ignora siempre.
export const CANONICAL_HEADER = [
  'nombre',
  'apellido',
  'telefono',
  'email',
  'notas',
  'obra_social',
  'nro_obra_social',
  'origen',
] as const

// ¿El header alcanza para importar? = tiene Nombre Y al menos una de Teléfono o Email.
// Por qué ese set y no «solo Nombre»: con solo Nombre, un archivo cualquiera que tenga esa columna
// pasaría el header y TODAS sus filas caerían como missing_fields (2000 errores de fila en vez de un
// aviso claro de formato). Exigir la columna de contacto que validateClientBody pide fila por fila
// conserva el «header equivocado → no se procesan filas» (D-01) sin obligar a agregar columnas de
// puro dato: una lista propia con Nombre + Teléfono entra tal cual. Lo usan parseCsv y el Excel.
export function isValidImportHeader(fields: Iterable<string>): boolean {
  const set = new Set(fields)
  return set.has('nombre') && (set.has('telefono') || set.has('email'))
}

// Quita UN `'` líder si y solo si el siguiente carácter es de inicio de fórmula (= + - @ tab CR).
// Ese es EXACTAMENTE el conjunto que prefijaba el esc() del export CSV, invertido para detectar el
// prefijo en vez de agregarlo (el export de Excel ya no prefija, pero los .csv exportados antes del
// quick 261124-ine sí, y un dueño puede tipear `'=` en una celda del Excel). Un `'` legítimo
// (O'Brien) NO se toca porque ahí el char siguiente no matchea.
export function unescapeFormulaGuard(v: string): string {
  return v.startsWith("'") && /^[=+\-@\t\r]/.test(v.slice(1)) ? v.slice(1) : v
}

// Resultado del parseo: filas crudas + si el header rígido es válido (D-01).
export interface ParseResult {
  validHeader: boolean
  rows: RawRow[]
}

// Normaliza un nombre de columna al canónico: trim → quita comillas sueltas (Excel puede dejar
// `nombre"`/`"nombre` al re-guardar) → trim → sin acentos → minúsculas → sin puntos → espacios y
// guiones bajos repetidos a un solo `_`. Así el título legible del Excel (`Teléfono`, `Nro. obra
// social`) y el snake_case del CSV viejo (`telefono`, `nro_obra_social`) caen en lo mismo (D-04).
// Hay UN solo alias: `last_name` → `apellido` (el snake_case en inglés de la columna de la base, que
// un dueño puede traer de otro sistema). Las columnas que no se reconocen se ignoran; las obligatorias
// las decide isValidImportHeader. La usan parseCsv y el import de Excel.
const HEADER_ALIAS: Record<string, string> = { last_name: 'apellido' }

export function canonicalHeader(h: string): string {
  const k = h
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .trim()
    .replace(/[\s_]+/g, '_')
  return HEADER_ALIAS[k] ?? k
}

// Parseo RFC4180 con papaparse. Strip defensivo del BOM del export (U+FEFF) y de `sep=`.
// transformHeader = canonicalHeader (ver arriba). El header se valida con isValidImportHeader; si no
// alcanza → validHeader=false y no se devuelven filas (el handler responde invalid_header).
export function parseCsv(text: string): ParseResult {
  // Strip del BOM del export (U+FEFF) + de una línea `sep=,`/`sep=;` que Excel a veces escribe
  // adelante para fijar el delimitador. Ambos romperían el header rígido si no.
  const clean = text.replace(/^﻿/, '').replace(/^sep=.\r?\n/i, '')

  let result = Papa.parse<RawRow>(clean, { header: true, skipEmptyLines: 'greedy', transformHeader: canonicalHeader })
  let fields = result.meta.fields ?? []

  // Recuperación del "colapso a una columna" de Excel (locale ES/AR, delimitador ;): Excel abre el
  // comma-CSV como UNA columna y al re-guardar envuelve cada fila entera en un campo RFC4180 con las
  // comillas internas dobladas (`"a,""b"",""c"""`). papaparse lo des-quotea a `a,"b","c"` → queda UN
  // solo campo cuyo nombre CONTIENE comas. Si detectamos eso, re-parseamos: cada celda colapsada YA es
  // una línea CSV real (papaparse ya deshizo el doblado de comillas), así que re-unimos y re-parseamos.
  if (fields.length === 1 && fields[0].includes(',')) {
    const flat = Papa.parse<string[]>(clean, { header: false, skipEmptyLines: 'greedy' })
    const lines = (flat.data as string[][]).map((r) => r[0] ?? '')
    result = Papa.parse<RawRow>(lines.join('\r\n'), { header: true, skipEmptyLines: 'greedy', transformHeader: canonicalHeader })
    fields = result.meta.fields ?? []
  }

  const validHeader = isValidImportHeader(fields)
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

    // Apellido: mismo des-escape anti-fórmula que el resto y la normalización de los otros escritores
    // (trim; vacío → null). Si el archivo no trae la columna, queda null.
    const apellido = normalizeLastName(unescapeFormulaGuard((raw.apellido ?? '').trim()))

    importables.push({
      nombre,
      apellido,
      telefono,
      email,
      notas,
      obra_social: (raw.obra_social ?? '').trim() || null,
      nro_obra_social: (raw.nro_obra_social ?? '').trim() || null,
    })
  })

  return { importables, errores, duplicadas, total: rows.length }
}
