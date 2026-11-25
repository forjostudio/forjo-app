---
phase: quick-261124-ubl
verified: 2026-11-24T22:25:00-03:00
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Quick 261124-ubl: Verificación

**Objetivo:** dueños con 2+ negocios: las rutas de app/api y las server actions de /web resuelven el mismo negocio que el panel (el más viejo, vía lib/negocio-del-dueno.ts); el UPDATE de mercadopago/disconnect acotado al id; gates A/B probados con mutación; test db con un dueño con dos negocios.

**Resultado:** objetivo logrado. Sin gaps ni blockers.

## Verdades observables

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | disconnect de MP con dos negocios desconecta sólo el más viejo | VERIFICADO | `app/api/mercadopago/disconnect/route.ts`: `negocioDelDueno(supabase, user.id, 'id')` y `.update({mp_user_id:null}).eq('id', biz.id).eq('owner_id', user.id)`. Carril db corrido: 2/2 verde. Mutación: saqué el `.eq('id', biz.id)` y la prueba db cayó con "el negocio más nuevo de A NO se desconecta: expected null". |
| 2 | clients/create con dos negocios da de alta en el más viejo | VERIFICADO | Test db verde. Ruta usa el helper con las mismas columnas `'id, type, vertical'`. |
| 3 | 18 rutas + 3 server actions de /web usan `negocioDelDueno` con cliente de sesión, `user.id` de `auth.getUser()` y las mismas columnas | VERIFICADO | `git diff -U0` compara cada `.select(...)` eliminado con la columna del helper nueva: las 21 coinciden letra por letra. En appointments/delete y notify/cancel el helper recibe `ssr` (cliente de sesión); el admin client sigue después, sin cambios. Ningún `negocioDelPanel` en APIs. |
| 4 | Respuestas con 0 filas iguales a las de hoy; error de lectura 500 `read_failed` / castellano / `server_error` / `fail()` | VERIFICADO | Diffs de clients/create, google/callback y _landing-actions mantienen 404 `not_found`, `fail()` y `no_business`. El error de lectura va a `read_failed`, `server_error` y `fail()` respectivamente. `oauth-return-routes` pasa. |
| 5 | Ninguna mutación de `businesses` filtra sólo por owner_id (gate B), probado en ROJO | VERIFICADO | Mutación sobre disconnect: gate B cae nombrando `app/api/mercadopago/disconnect/route.ts`. En el código real: único `.update` por owner_id es el de MP callback (`id` + `owner_id`) y el disconnect (`id` + `owner_id`). |
| 6 | Gate A: sin `.eq('owner_id').single()` ni lectura propia por owner_id en app/api, app/(dashboard), app/page.tsx; probado en ROJO | VERIFICADO | Mutación: restauré `export/clients/route.ts` a la versión de 36d3ae9. Cayeron los 3 chequeos del gate A nombrando esa ruta. Restaurado después. Grep independiente de `.eq('owner_id'` en app/ y lib/: quedan sólo el helper, `abonos/cancel-link` (excepción vigilada: ya ordena por created_at), `mercadopago/callback` (acotado por id + owner_id) y las páginas de onboarding. |
| 7 | Sin cambios en webhooks, onboarding, app/[slug], booking-core, archivos protegidos, package.json, lockfile ni supabase/ | VERIFICADO | `git diff 36d3ae9..HEAD` sobre todos esos paths: vacío. `git status` de app/lib/test/scripts limpio tras las mutaciones. |
| 8 | Evidencia: tsc 0, tests verdes | VERIFICADO | `./node_modules/.bin/tsc --noEmit` exit 0. `vitest --project pure` (gate + oauth-return-routes): 65/65. `vitest --project db dueno-con-dos-negocios`: 2/2, sin skip. |

## Aislamiento por tenant

- `user.id` sale de `auth.getUser()` de la sesión en cada ruta. El helper recibe siempre el cliente de sesión, con RLS activo. El `order + limit(1)` sólo elige entre negocios del mismo dueño.
- El diff de app/ no agrega ni quita ningún `createAdminClient` ni `supabase/admin`. El uso de service role queda igual.
- Los webhooks (`payment`, `subscription/webhook`) no se tocan.

## Notas (no bloquean)

- `app/(onboarding)/onboarding/integraciones/page.tsx:30` sigue leyendo por `owner_id` con `maybeSingle()`. No es parte del alcance (onboarding). Con dos negocios da error y redirige a `/dashboard`, que es el comportamiento intencional de WR-03.
- `app/api/abonos/cancel-link/[id]/route.ts` queda como excepción deliberada (ya elige el más viejo con `order created_at, id` y `limit(2)`).
- No corrí `npm test` completo, `npm run build` ni eslint. Se confía en la evidencia del SUMMARY para esos tres. Lo que corrí yo está arriba.

## Gaps

Ninguno.
