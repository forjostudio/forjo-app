import { defineConfig, defaultExclude } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { splitSuites } from './test/suite-split'

// Config base del runner (D-01).
// - tsconfigPaths(): resuelve el alias @/* de tsconfig.json en los tests. Sin esto, todo
//   import desde '@/lib/...' o '@/app/...' falla (no hay otra fuente de verdad del alias).
// - react(): opcional acá — esta suite no renderiza JSX y el environment es 'node', pero es
//   inofensivo y alinea con el setup oficial de Next 16 + Vitest. Se pinea @^5 (no @^6: su peer
//   vite:^8 exclusivo choca con el Vite que bundlea Vitest 4 — ver RESEARCH §Alternatives).
// - environment 'node': no se testea UI (D-01).
// - setupFiles: carga .env.local antes de cualquier test (Vitest no lo auto-carga, Pitfall 4).

// ── Split pure/db (ION-01) ───────────────────────────────────────────────────────────────────────
// Las suites que pegan contra el Supabase local se corren de a UNA; el resto sigue en paralelo.
// Motivo completo (pool de PostgREST saturado → teardown que falla en silencio → contaminación del
// test siguiente) documentado en test/suite-split.ts. La lista NO se escribe a mano: se DERIVA acá,
// al cargar el config, del marcador que esas suites ya están obligadas a tener.
//
// Se resuelve el directorio desde la URL de este archivo y no desde process.cwd(): así el config no
// depende de desde dónde se invocó vitest.
const TEST_DIR = fileURLToPath(new URL('./test', import.meta.url))
const { db: dbSuites } = splitSuites(TEST_DIR)

// CÓMO SE EJECUTA ESTO (verificado leyendo el runtime de Vitest 4.1.9 instalado, no de memoria):
// `fileParallelism: false` resuelve `maxWorkers: 1` para ESE proyecto, y el agrupador de specs manda
// las specs de un proyecto con maxWorkers === 1 (+ isolate en su default + sequence.groupOrder en 0) a
// un grupo "sequential" propio que se encola AL FINAL. Los grupos corren uno después del otro →
// primero `pure` con todos los workers, después `db` de a un archivo por vez.
//
// Dos trampas a NO pisar:
// - NO declarar `isolate` ni `sequence.groupOrder` en los proyectos. Si el proyecto serializado cae en
//   el mismo grupo que el paralelo teniendo distinto maxWorkers, Vitest aborta con "Projects ... have
//   different 'maxWorkers' but same 'sequence.groupOrder'".
// - `poolOptions` con singleFork/singleThread NO existe en Vitest 4 (verificado: no está ni en los
//   tipos ni en el runtime instalado). El único mecanismo válido acá es fileParallelism / maxWorkers.
//
// Por qué `pure` se define EXCLUYENDO en vez de incluyendo: además de las suites de test/, el repo
// tiene ~21 tests co-ubicados en app/, lib/ y components/ que matchea el include por defecto. Si el
// proyecto `pure` declarara un include con la lista de test/, esos 21 dejarían de correr en silencio
// (falso verde). Excluyendo `dbSuites` del include por defecto, todo archivo nuevo cae en `pure`
// automáticamente y lo único que se mueve de carril es lo que el clasificador marcó como DB-backed.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      // extends: true → hereda plugins, environment y setupFiles de esta misma raíz.
      { extends: true, test: { name: 'pure', exclude: [...defaultExclude, ...dbSuites] } },
      { extends: true, test: { name: 'db', include: dbSuites, fileParallelism: false } },
    ],
  },
})
