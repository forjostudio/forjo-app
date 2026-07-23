---
phase: quick-260723-tma
plan: 01
subsystem: api
tags: [email, resend, theming, branding, next16, multi-tenant]

# Dependency graph
requires:
  - phase: quick-260722-wxt
    provides: "brandEmail + emailBrandInputs (color por paleta forjo + fuente por id), esc()/WR-02, SELECT de theme/palette/font/landing_config en los callers"
provides:
  - "brandEmail theme-aware: acento desde THEME_PALETTES (motor de theme), fuente desde THEME_EMAIL_FONT segun theme"
  - "emailBrandInputs devuelve theme; los 11 callers lo threadean a cada send*"
  - "mails que espejan color y fuente REALES del negocio para cualquier theme (modern/spa/cyber), no solo forjo"
affects: [email, branding, landing-theme, mercadopago-webhook, abonos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuso del motor de theme canonico (THEME_PALETTES + normalizeTheme/normalizePalette) para resolver el acento del mail, mismo patron que brandedHex de la og:image — sin duplicar la tabla"
    - "Allowlist theme->fuente (THEME_EMAIL_FONT) con la misma garantia anti-injection que EMAIL_HEADING_FONT: la URL de Google Fonts solo se arma desde googleFamily literal"

key-files:
  created: []
  modified:
    - "lib/email.ts"
    - "test/brand-email.test.ts"
    - "app/api/payment/webhook/[slug]/route.ts"
    - "app/api/booking/create/route.ts"
    - "app/api/appointments/create/route.ts"
    - "app/api/notify/booking/route.ts"
    - "app/api/cancel/[token]/route.ts"
    - "app/api/notify/cancel/route.ts"
    - "app/api/cron/cancel-expired/route.ts"
    - "app/api/google/sync/route.ts"
    - "app/api/abonos/create/route.ts"
    - "app/api/abonos/cancel/route.ts"
    - "app/api/abonos/cancel/[token]/route.ts"
    - "test/webhook-deposit.test.ts"
    - "test/abono-cancel-routes.test.ts"

key-decisions:
  - "El color del mail se resuelve con el mismo motor que la og:image (THEME_PALETTES via normalizeTheme/normalizePalette), no con un mapa propio — cero duplicacion de la tabla de paletas"
  - "Precedencia de fuente: (a) id explicito de EMAIL_HEADING_FONT gana; (b) si no, la fuente nativa del theme (THEME_EMAIL_FONT); (c) fallback Helvetica como red de seguridad ultima"
  - "El cambio de theme es ADITIVO/opcional: tras Task 1 el arbol compila aunque los callers no threadeen todavia (orden Task 1 -> 2 -> 3)"

patterns-established:
  - "Branding de mail derivado 100% del theme del negocio (color + fuente), espejando la pagina publica para todos los verticales visuales"

requirements-completed: ["TMA-01"]

# Metrics
duration: ~20min
completed: 2026-07-23
status: complete
---

# Phase quick-260723-tma: Mails theme-aware Summary

**El branding de los mails ahora resuelve acento y fuente desde el theme real del negocio (THEME_PALETTES + THEME_EMAIL_FONT), de modo que un negocio cyber recibe el mail en cyan/amber con Orbitron en vez del rojo Forjo con Helvetica.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-23T15:29Z (aprox)
- **Completed:** 2026-07-23T15:36Z (aprox)
- **Tasks:** 3 auto completadas (Task 4 = checkpoint humano post-deploy, PENDIENTE)
- **Files modified:** 15

## Accomplishments
- `brandEmail` resuelve el acento con el motor de theme canonico (`themeAccentHex` reusa `THEME_PALETTES` + `normalizeTheme`/`normalizePalette`, mismo patron que `brandedHex` de la og:image). Se borro el mapa muerto `EMAIL_PALETTE_HEX`.
- Nuevo allowlist `THEME_EMAIL_FONT` (forjo/modern/spa/cyber): sin id de fuente explicito, el mail usa la fuente nativa del theme. La URL de Google Fonts se sigue armando SOLO desde `googleFamily` literal (T-tma-02 intacto).
- `brandEmail` acepta `theme?`; `emailBrandInputs` devuelve `theme`; los 10 templates `send*` y los 11 callers (2 grupos) lo threadean.
- Cobertura de tests para themes no-forjo (cyber/cyan, cyber/amber, modern/indigo, spa/sage) y para la fuente por theme (Orbitron/Archivo/serif), preservando el invariante de seguridad del link.

## Task Commits

1. **Task 1 (TDD): brandEmail theme-aware (color + fuente) + tests** — `e146690` (test, RED) + `abd83cc` (feat, GREEN)
2. **Task 2: threading de theme en callers grupo A (booking/confirmaciones)** — `b3bc414` (feat)
3. **Task 3: threading de theme en callers grupo B (cancelaciones/abonos/cron)** — `3b2f4e2` (feat)

**Plan metadata:** lo commitea el orquestador (SUMMARY/STATE/ROADMAP no se commitean desde el executor).

## Files Created/Modified
- `lib/email.ts` — `themeAccentHex` + `THEME_EMAIL_FONT`; `brandEmail` theme-aware; `emailBrandInputs` devuelve theme; 10 `send*` aceptan/pasan theme; borrado `EMAIL_PALETTE_HEX`
- `test/brand-email.test.ts` — casos no-forjo (color) + fuente por theme + assert de `emailBrandInputs().theme`; seguridad del link ajustada (font desconocido cae al allowlist del theme, nunca al valor crudo)
- `app/api/payment/webhook/[slug]/route.ts`, `app/api/booking/create/route.ts`, `app/api/appointments/create/route.ts`, `app/api/notify/booking/route.ts`, `app/api/cancel/[token]/route.ts` — grupo A: `theme: brand.theme` en cada `send*`
- `app/api/notify/cancel/route.ts`, `app/api/cron/cancel-expired/route.ts`, `app/api/google/sync/route.ts`, `app/api/abonos/create/route.ts`, `app/api/abonos/cancel/route.ts`, `app/api/abonos/cancel/[token]/route.ts` — grupo B: `theme: brand.theme` en cada `send*`
- `test/webhook-deposit.test.ts`, `test/abono-cancel-routes.test.ts` — mock de `emailBrandInputs` incluye `theme: null` (consistencia de shape)

## Decisions Made
None nuevas mas alla de las del plan — se ejecuto exactamente como estaba escrito (ver key-decisions).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered

**Fallos de test ambientales (Supabase local), NO regresion de este cambio:**
- La suite completa (`./node_modules/.bin/vitest run`) reporta fallos en `test/abono-create.test.ts`, `test/abono-cron.test.ts` y `test/abono-generation.test.ts`. Estos tests son `describe.skipIf(!hasSupabaseCreds)` y corren contra el Supabase LOCAL, requiriendo migraciones 054-056 aplicadas; la generacion de turnos devuelve `[]` porque el DB local no las tiene aplicadas.
- Evidencia de que es ambiental y no regresion:
  1. Los conteos de fallos son **no deterministas** entre corridas (9 fallos en la 1a corrida, 4 en la 2a, mismos 3 archivos). Una regresion de codigo falla de forma determinista.
  2. `test/abono-generation.test.ts` importa SOLO `generateAbonoOccurrences` (`@/lib/abono-generation`) y helpers de test — **cero** archivos tocados por este plan — y aun asi falla. Su fallo no puede originarse en el cambio de branding de mail.
- Los tests que SI cubren este cambio pasan **verdes** en todas las corridas: `brand-email` (todos los casos nuevos), `abono-cancel-email` (21), `email-escaping`, `webhook-deposit`, `abono-cancel-routes`.
- `./node_modules/.bin/tsc --noEmit` → exit 0 (verde) en las tres tasks.

Reportado tal cual (no se presenta la suite como verde ni el fallo como regresion), segun la restriccion del executor sobre fallos por Supabase local.

## User Setup Required
None - no external service configuration required.

## Threat surface
Sin nueva superficie. Los dos invariantes del wxt siguen intactos y con test:
- T-tma-01: el acento sale SOLO de `THEME_PALETTES` (allowlist) o de un override revalidado por `isSafeColor`; nunca de un valor crudo de la DB.
- T-tma-02: la URL de Google Fonts se arma SOLO desde `googleFamily` literal de `EMAIL_HEADING_FONT`/`THEME_EMAIL_FONT`; un font desconocido cae al allowlist del theme, nunca se interpola crudo (test de seguridad verde).

## Next Phase Readiness

**Task 4 = checkpoint humano BLOQUEANTE (blocking-human), PENDIENTE.** No se puede validar visualmente el mail en local (RESEND vacio, no envia). Requiere:
1. Deployar a prod (o entorno con RESEND configurado).
2. Con `estudio-test` (theme cyber), disparar un mail real (p.ej. una confirmacion).
3. Abrir en Apple Mail y confirmar: header/footer en cyan #00e5ff o amber #ffd23d (no rojo #d94a2b), titulares en Orbitron (no Helvetica), fondo del mail claro y texto legible.
4. (Opcional) Repetir con un negocio forjo para confirmar cero regresion (rojo + Archivo).

El executor se detuvo en Task 4 sin auto-aprobar, como corresponde a un checkpoint humano.

## Self-Check: PASSED

- Archivos verificados en disco: `lib/email.ts`, `test/brand-email.test.ts`, este SUMMARY.
- Commits verificados en git: `e146690` (test RED), `abd83cc` (feat GREEN), `b3bc414` (grupo A), `3b2f4e2` (grupo B).

---
*Phase: quick-260723-tma*
*Completed: 2026-07-23*
