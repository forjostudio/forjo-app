import { readdirSync, readFileSync } from 'node:fs'

// ── Clasificador de suites: quién corre en paralelo y quién de a uno (ION-01) ────────────────────
//
// EL PROBLEMA QUE RESUELVE. Vitest reparte los archivos de test entre ~11 workers. 27 de ellos pegan
// contra el MISMO Supabase local, cuyo PostgREST tiene un pool de 10 conexiones que NO se puede subir
// desde el repo (el CLI 2.116 no lo expone en config.toml). Bajo carga alguna request se cae; cuando
// la que se cae es un `delete()` de teardown cuyo resultado nadie chequea, la limpieza falla en
// silencio y el test SIGUIENTE arranca con datos del anterior → asserts tipo "expected 5, got 10".
// Está probado que es 100% inducido por paralelismo: con `--fileParallelism=false` la suite entera
// pasa. Este módulo le da a `vitest.config.mts` las dos listas para serializar SOLO la mitad que toca
// la base, dejando la mitad pura corriendo en paralelo como hasta ahora.
//
// POR QUÉ DERIVADO Y NO UNA LISTA A MANO (D-01). El marcador de DB — `import ... from './env'` — ya es
// convención obligatoria y load-bearing del repo: sin las tres credenciales, un test DB-backed TIENE
// que skipear, así que necesita ese import sí o sí. Reusarlo como criterio de clasificación no agrega
// nada nuevo que mantener. Una lista escrita a mano, en cambio, reintroduce el bug el día que alguien
// se olvide de sumar su archivo — y lo reintroduce en silencio.
//
// LA TRAMPA DEL TOKEN SUELTO (verificada en el repo, no asumida). Buscar el nombre del flag a secas
// (`grep -l hasSupabaseCreds test/*.test.ts`) devuelve 29 archivos, pero 2 son falsos positivos:
// `appointment-service.test.ts` y `appointment-time.test.ts` lo nombran en un comentario en PROSA,
// justamente para explicar que NO lo usan, y no tocan la base. Anclado al IMPORT el set da 27, que es
// el real. Por eso todas las reglas de acá miran imports, nunca tokens sueltos.

export interface SuiteSplit {
  /** Globs de las suites que pegan contra Supabase → proyecto `db`, serializado. */
  db: string[]
  /** Globs de las suites de `test/` que no tocan la base → proyecto `pure`, en paralelo. */
  pure: string[]
}

const SUITE_SUFFIX = '.test.ts'

// Marcador de suite DB-backed. Anclado a línea (`^...$` con /m) y exigiendo que la línea EMPIECE con
// `import`: así un `'./env'` que aparezca en un comentario o en un string no clasifica nada.
const DB_IMPORT_RE = /^\s*import\b[^\n]*from\s*['"]\.\/env['"]/m

// Señales secundarias de "esto toca la base": los dos helpers de fixtures y el cliente de Supabase.
// `(?!type\b)` descarta los `import type { ... }`, que se borran al compilar y no ejecutan nada — un
// test puro puede tipar un mock de SupabaseClient sin ser DB-backed.
// Verificado hoy: los 27 archivos con el marcador tienen ADEMÁS alguna de estas señales, así que los
// dos detectores se cubren mutuamente (si el marcador se escribiera en varias líneas y este módulo no
// lo viera, `findUnmarkedDbSuites` igual lo denunciaría en vez de dejarlo pasar al carril paralelo).
const DB_TOUCH_RE =
  /^\s*import\s+(?!type\b)[^\n]*from\s*['"](?:\.\/helpers\/booking-fixtures|\.\/helpers\/supabase-fixtures|@supabase\/supabase-js)['"]/m

// Los globs se arman por CONCATENACIÓN de strings, nunca con `path.join`: en Windows join produce
// `test\x.test.ts` y picomatch (el matcher de Vitest) no matchea el separador invertido → el archivo
// no correría en ningún proyecto. Falso verde silencioso, que es exactamente lo que se quiere evitar.
function toPosixGlob(relPath: string): string {
  return `test/${relPath}`
}

function readSuite(testDir: string, name: string): string {
  return readFileSync(`${testDir}/${name}`, 'utf8')
}

/**
 * Reparte los `*.test.ts` del PRIMER NIVEL de `test/` entre el carril serializado (`db`) y el
 * paralelo (`pure`), según importen o no desde `'./env'`.
 *
 * Ojo: `pure` acá son SOLO las suites de `test/`. El proyecto `pure` de `vitest.config.mts` corre
 * bastante más que eso (las ~21 suites co-ubicadas en `app/`, `lib/` y `components/`), y por eso el
 * config se arma EXCLUYENDO `db` en vez de incluir esta lista — ver el comentario del config.
 */
export function splitSuites(testDir: string): SuiteSplit {
  const db: string[] = []
  const pure: string[] = []

  for (const entry of readdirSync(testDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(SUITE_SUFFIX)) continue
    const source = readSuite(testDir, entry.name)
    if (DB_IMPORT_RE.test(source)) db.push(toPosixGlob(entry.name))
    else pure.push(toPosixGlob(entry.name))
  }

  return { db, pure }
}

/**
 * Devuelve los `*.test.ts` que vivan en SUBCARPETAS de `test/`. Hoy da vacío, y esa es la premisa que
 * el split necesita: `splitSuites` solo mira el primer nivel, así que una suite anidada nunca podría
 * entrar al proyecto `db` — caería en `pure` por el include por defecto y volvería a golpear la base
 * en paralelo. El guard `test/suite-split.test.ts` falla si esto deja de dar vacío.
 */
export function findSubdirSuites(testDir: string): string[] {
  const encontradas: string[] = []

  const recorrer = (dirAbs: string, dirRel: string) => {
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      const abs = `${dirAbs}/${entry.name}`
      const rel = `${dirRel}/${entry.name}`
      if (entry.isDirectory()) recorrer(abs, rel)
      else if (entry.name.endsWith(SUITE_SUFFIX)) encontradas.push(toPosixGlob(rel))
    }
  }

  for (const entry of readdirSync(testDir, { withFileTypes: true })) {
    if (entry.isDirectory()) recorrer(`${testDir}/${entry.name}`, entry.name)
  }

  return encontradas
}

/**
 * Devuelve las suites de `test/` que tocan la base (importan los fixtures o `@supabase/supabase-js`)
 * pero NO tienen el marcador `import ... from './env'`. Hoy da vacío; es la red que impide reintroducir
 * la interferencia con un archivo nuevo mal marcado (D-02).
 *
 * Si esto denuncia un archivo, el arreglo es agregarle el `import { hasSupabaseCreds } from './env'` y
 * su `describe.skipIf(!hasSupabaseCreds)` — que es lo que el repo exige igual para que la suite skipee
 * limpio cuando faltan las credenciales.
 */
export function findUnmarkedDbSuites(testDir: string): string[] {
  const sinMarcar: string[] = []

  for (const entry of readdirSync(testDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(SUITE_SUFFIX)) continue
    const source = readSuite(testDir, entry.name)
    if (DB_IMPORT_RE.test(source)) continue
    if (DB_TOUCH_RE.test(source)) sinMarcar.push(toPosixGlob(entry.name))
  }

  return sinMarcar
}
