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
