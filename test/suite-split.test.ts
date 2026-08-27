import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { splitSuites, findSubdirSuites, findUnmarkedDbSuites } from './suite-split'

// ── Guard del split pure/db (ION-01, D-02) ───────────────────────────────────────────────────────
// Este archivo es PURO: no toca la base, solo lee el directorio `test/` con fs. Corre en el proyecto
// `pure` (en paralelo) y consume EXACTAMENTE el mismo módulo que `vitest.config.mts`, así que la regla
// de clasificación tiene una sola fuente de verdad: si el config y el guard se pudieran desincronizar,
// el guard no probaría nada.
//
// Por qué existe: la clasificación es DERIVADA (D-01), así que nadie se puede olvidar de "sumar su
// archivo a la lista". Lo que SÍ se puede olvidar es escribir un test DB-backed sin el marcador
// (`import ... from './env'`). Ese caso lo cachan estos tests, nombrando el archivo infractor, en vez
// de que el archivo se cuele al carril paralelo y reintroduzca la interferencia en silencio.

const TEST_DIR = resolve(process.cwd(), 'test')

// Listado independiente del clasificador: si lo pidiéramos al propio módulo bajo prueba, la aserción
// de exhaustividad sería circular (compararía el resultado consigo mismo).
function suiteFilesOnDisk(): string[] {
  return readdirSync(TEST_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.test.ts'))
    .map((e) => `test/${e.name}`)
}

describe('suite-split — clasificador pure/db', () => {
  it('1 — es EXHAUSTIVO: cada *.test.ts de test/ cae en exactamente un proyecto', () => {
    const { db, pure } = splitSuites(TEST_DIR)
    const onDisk = suiteFilesOnDisk()

    expect(db.length + pure.length).toBe(onDisk.length)
    // Cobertura por nombre, no solo por cantidad: descarta que un archivo falte y otro sobre.
    expect([...db, ...pure].sort()).toEqual([...onDisk].sort())
  })

  it('2 — es DISJUNTO: ningún archivo aparece en los dos proyectos', () => {
    const { db, pure } = splitSuites(TEST_DIR)
    const repetidos = db.filter((f) => pure.includes(f))
    expect(repetidos).toEqual([])
  })

  it('3 — no hay suites en subcarpetas de test/ (el clasificador solo mira el primer nivel)', () => {
    // Una suite en `test/algo/x.test.ts` no la ve `splitSuites`, así que NUNCA entraría al proyecto
    // `db`: caería en `pure` por el include por defecto y volvería a pegarle a la base en paralelo.
    // El split asume que las suites viven en el primer nivel; esto verifica esa premisa.
    expect(findSubdirSuites(TEST_DIR)).toEqual([])
  })

  it('4 — no hay suites DB-backed sin el marcador de skip (import desde ./env)', () => {
    // Red de contención de D-02: un archivo que usa los fixtures o el cliente de Supabase pero se
    // olvidó del `import { hasSupabaseCreds } from './env'` queda clasificado como puro y rompe el
    // aislamiento del carril serializado. Acá falla nombrándolo.
    expect(findUnmarkedDbSuites(TEST_DIR)).toEqual([])
  })

  it('5 — anclas de regresión: la clasificación va por el IMPORT, no por el token suelto', () => {
    const { db, pure } = splitSuites(TEST_DIR)

    // Toca la base de verdad (es la suite de aislamiento RLS) → carril serializado.
    expect(db).toContain('test/isolation.test.ts')

    // Puro de toda la vida.
    expect(pure).toContain('test/verticals.test.ts')

    // Los 2 falsos positivos del listado original: NOMBRAN `hasSupabaseCreds` en un comentario en
    // prosa (justamente para explicar que NO lo usan) pero no importan `./env` ni tocan la base.
    // Contar el token suelto los arrastraba al carril serializado sin motivo.
    expect(pure).toContain('test/appointment-service.test.ts')
    expect(pure).toContain('test/appointment-time.test.ts')
  })

  it('6 — devuelve rutas con separador POSIX (picomatch no matchea el \\ de Windows)', () => {
    const { db, pure } = splitSuites(TEST_DIR)
    const todas = [...db, ...pure]

    expect(todas.length).toBeGreaterThan(0)
    for (const ruta of todas) {
      expect(ruta).not.toContain('\\')
      expect(ruta).toMatch(/^test\/[^/]+\.test\.ts$/)
    }
  })
})
