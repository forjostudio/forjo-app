import { config } from 'dotenv'

// Vitest NO auto-carga .env.local (a diferencia de Next, que sí lo hace en dev/build — Pitfall 4).
// Sin esto, los tests de aislamiento (plan 05-02) leerían process.env.NEXT_PUBLIC_SUPABASE_URL =
// undefined y se skipearían silenciosamente AUNQUE las creds existan en .env.local (falso skip).
//
// Estrategia elegida (de las dos válidas del RESEARCH Open Q2): cargar .env.local con `dotenv` en
// este setup file, en vez del flag `node --env-file=.env.local`. Motivo: `dotenv` ya está disponible
// transitivamente (verificado en node_modules) → CERO deps de runtime nuevas (D-01), y el setup file
// no obliga a recordar el flag al correr `npx vitest run` o `npm test` localmente ni en CI.
//
// Los tests de webhook NO dependen de esta carga: stubean su propio MP_WEBHOOK_SECRET con vi.stubEnv.
config({ path: '.env.local' })

// Override LOCAL para tests (Phase 2): si existe `.env.test.local` (gitignored, solo en la máquina
// del dev), apunta la suite al Supabase LOCAL (127.0.0.1) en vez del remoto de `.env.local`. Así los
// tests de integración NO escriben sobre prod y corren contra las migraciones validadas localmente
// (ej. `book_slot_atomic` de la 041). `override: true` pisa lo que cargó `.env.local`. En CI el archivo
// no existe → dotenv hace no-op y CI conserva sus env vars (staging).
config({ path: '.env.test.local', override: true })
