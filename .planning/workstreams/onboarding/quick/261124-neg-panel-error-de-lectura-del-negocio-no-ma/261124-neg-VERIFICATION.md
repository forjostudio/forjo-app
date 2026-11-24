---
phase: quick-261124-neg
verified: 2026-11-24T20:30:00Z
status: human_needed
score: 7/7 must-haves verified
covered_files:
  - "app/(dashboard)/error.tsx"
  - "app/(dashboard)/layout.tsx"
  - "app/page.tsx"
  - "components/dashboard/panel-error-de-carga.tsx"
  - "lib/negocio-del-dueno.ts"
  - "test/negocio-del-dueno.test.ts"
  - "test/panel-negocio-destinos.test.ts"
  - "test/panel-negocio-gate.test.ts"
covered_digest: "v1:sha256:d2c91fec59a2817a3fc107c895eb4b3de70e9be4db75e39c5887fc1203316031"
behavior_unverified: 0
human_verification:
  - test: "Con el dev server levantado y la red de Supabase cortada, entrar a /finances y a /agenda; luego restaurar la red y tocar «Reintentar»."
    expected: "Pantalla: «No pudimos cargar esta pantalla» dentro del chrome del panel; layout fallando: «No pudimos cargar tu panel». «Reintentar» vuelve a cargar y entra. Nunca aparece el wizard."
    why_human: "El aspecto visual y que el botón relea en un navegador real no se pueden probar sin navegador (el SUMMARY también lo declara sin comprobar). Los tests sólo inspeccionan el árbol devuelto por el server component."
---

# Quick 261124-neg: Verificación

**Goal:** el panel no confunde «falló la lectura del negocio» con «no tiene negocio».
**Status:** human_needed (todo lo programático verificado; queda una UAT visual).

## Truths

| # | Truth | Estado | Evidencia |
|---|-------|--------|-----------|
| 1 | Con error de lectura, ninguna pantalla ni `/` manda a `/onboarding` | VERIFIED | `lib/negocio-del-dueno.ts`: `negocioDelPanel` lanza `LecturaDelNegocioFallida` si `reason==='error'`; `error.tsx` renderiza «No pudimos cargar esta pantalla» + `unstable_retry`; layout devuelve `PanelErrorDeCarga` «No pudimos cargar tu panel» sin `children`; `app/page.tsx` va a `/dashboard` con `ok` o `error`. Cubierto por `test/panel-negocio-destinos.test.ts`. |
| 2 | 0 filas sigue yendo a `/onboarding` | VERIFIED | `negocioDelPanel` hace `redirect('/onboarding')` en `sin-negocio`; layout y `/` igual. |
| 3 | 2+ negocios: layout y pantallas resuelven el mismo (más viejo) | VERIFIED | Una sola consulta con `order('created_at',{ascending:true}).limit(1).maybeSingle()` usada por las 16 lecturas. |
| 4 | Consulta exacta, sin `.single()`, cliente de sesión, owner_id de la sesión | VERIFIED | `lib/negocio-del-dueno.ts` líneas de la consulta; `supabase` es el cliente de sesión pasado por cada llamador, `user.id` viene de `auth.getUser()` en cada archivo; ningún import de admin/service role. Test del fake del builder verifica la forma. |
| 5 | Cada pantalla pide sus columnas y conserva su tipado | VERIFIED | `'*'` en 12 pantallas+layout, `'id'` en finances y `/`, lista explícita en `/web` (idéntica a la anterior); `FilaDe<Q>` derivado del `select` del cliente; `expectTypeOf` en el test; `tsc --noEmit` exit 0. |
| 6 | Orden de chequeos preservado; gate anti-reincidencia | VERIFIED | Layout: sesión → negocio → render (suspended sigue después). `/equipo`: redirect canchas después de resolver negocio (línea 18). Gate `test/panel-negocio-gate.test.ts` con guarda de barrido vacío y excepción vigilada; grep manual confirma que sólo `web/_landing-actions.ts` conserva el patrón (3 server actions que devuelven `no_business`, excepción documentada). El rojo contra el código viejo está registrado en SUMMARY (commit `197fab1` previo a la migración); no re-ejecutado por mí. |
| 7 | Evidencia sin deps ni migraciones | VERIFIED | `tsc --noEmit` exit 0 (re-ejecutado). vitest `--project pure` de los 3 tests nuevos + `catalog-public`, `panel-tabs`, `panel-nav-chrome`: 6 archivos, 234/234. `git diff --stat` de `package.json`, lock, `supabase`, `app/(onboarding)` vacío. build/eslint/suite completa no re-ejecutados (confiados al SUMMARY). |

## Aislamiento por tenant y archivos protegidos

- Cliente de sesión (RLS activo), `.eq('owner_id', user.id)` preservado en el helper; sin service role. Intacto.
- `git diff ee32fdd..HEAD` sobre `lib/overlay-history.ts`, `lib/dirty-history.ts`, `scripts/con-turno.mjs`, `next.config.ts`, `lib/onboarding-alta.ts`: vacío. No se tocaron.
- 7 commits (`e4e7fbf`..`c18527e`) coinciden con `ee32fdd..HEAD`.

## Observaciones (no bloqueantes)

- Desvío aceptable: se modificaron `test/catalog-public.test.ts` y `test/panel-tabs.test.ts` (anclas que dependían del patrón viejo); siguen exigiendo lo mismo (columnas `*_sort_mode`, negocio por sesión). Pasan.
- Follow-up declarado (T-neg-05): ~17 route handlers y `_landing-actions.ts` siguen con `.single()`; un dueño con 2 negocios entra al panel pero esas escrituras fallan cerrado (404/`no_business`). Sin riesgo cross-tenant.
- No re-ejecutados: `npm run build`, eslint, `npm test` completo (carril db), prueba de mutación del gate.

## Human Verification Required

1. **Aviso y «Reintentar» en navegador real** — cortar la red de Supabase con el dev server arriba, entrar a `/finances` y `/agenda`; restaurar y tocar «Reintentar». Esperado: avisos en castellano dentro del panel / inline en el layout, recarga correcta, nunca el wizard. Por qué humano: render visual y comportamiento del botón no verificables sin navegador.

_Verifier: Claude (gsd-verifier)_
