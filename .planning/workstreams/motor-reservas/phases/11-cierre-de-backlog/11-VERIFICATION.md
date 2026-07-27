---
phase: 11-cierre-de-backlog
verified: 2026-07-27T16:40:00Z
status: human_needed
score: 11/11 must-haves verified (code-level)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Abrir /abonos → tab Archivados con al menos una serie cancelada y una completada."
    expected: "La serie cancelada muestra un chip 'Cancelado' (tono destructive) y la completada un chip 'Completado' (tono secondary/neutral); se distinguen sin abrir el detalle."
    why_human: "Distinguibilidad visual 'a simple vista' es un juicio de percepción, no verificable por grep (SC1)."
  - test: "Abrir /clientes: buscar, filtrar, dar de alta un cliente, seleccionar distintos clientes y editar notas/campos."
    expected: "Comportamiento idéntico a antes del refactor: sin parpadeos ni renders en cascada; al cambiar de cliente el panel de detalle se resetea (editMode/editForm/notes/historyExpanded vuelven a su estado inicial)."
    why_human: "El remount por key reemplaza un useEffect; el comportamiento en vivo (timing de render, ausencia de flicker) no es verificable por análisis estático (SC2)."
  - test: "Abrir /cancelar/[token] y /abono/cancelar/[token] con tokens válidos de prueba."
    expected: "El borde lateral acentuado se ve igual en ambas pantallas; nada del contenido ni el endurecimiento (404 genérico, contraste) cambió."
    why_human: "Confirmación visual del renderizado real en navegador, más allá de la comparación byte-a-byte del className ya hecha por grep (SC3)."
  - test: "Intentar borrar un servicio, una sede, una cancha y un profesional que tengan turnos asociados (incluyendo alguno cancelado o pasado)."
    expected: "Aparece el toast nuevo aclarando 'pasados y cancelados' + las dos vías (desactivar / borrar los turnos); el profesional/servicio/sede/cancha NO desaparece de la lista. Borrar uno sin turnos sigue funcionando igual."
    why_human: "Requiere datos reales con turnos asociados en distintos estados; el flujo de UI (toast + no-mutación de la lista) se confirma mejor en vivo que por lectura de código (EXTRA-A)."
  - test: "En un negocio con ≥2 profesionales capaces del mismo servicio: probar el paso 2 del booking público con el setting en 'any' (default) y luego cambiarlo a 'choose' desde Ajustes → tab Cobros, guardando y recargando."
    expected: "Con 'any', 'Cualquiera' aparece arriba de la lista (igual que hoy). Con 'choose', 'Cualquiera' aparece debajo de los profesionales y sigue siendo reservable. El toggle en Ajustes refleja el valor guardado tras recargar y no se puede alterar el setting de otro negocio."
    why_human: "Verificación end-to-end del orden visual en el paso 2 y de la persistencia del toggle en un flujo real (EXTRA-B)."
---

# Phase 11: Cierre de backlog Verification Report

**Phase Goal:** Cerrar 3 pendientes chicos e independientes del ciclo anterior sin tocar el motor de reservas — POLISH-01 (chip Cancelado/Completado en Archivados de Abonos), POLISH-02 (eliminar el error eslint `set-state-in-effect` en `clients-client.tsx`), POLISH-03 (mismo criterio de borde en las 2 pantallas de cancelación) — más 2 extras foldeados: EXTRA-A (copy honesto de borrado bloqueado + fix `deleteProfessional`) y EXTRA-B (default del selector "Cualquiera" configurable por negocio).
**Verified:** 2026-07-27
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | SC1/POLISH-01 — chip semántico distingue cancelada de completada en Archivados | ✓ VERIFIED (code) | `abonos-client.tsx:329-332`: gateado a `tab === 'archivados'`, `Badge variant={status==='cancelled'?'destructive':'secondary'}` con textos "Cancelado"/"Completado"; sin hex. `isAbonoActivo` intacto. |
| 2 | SC2/POLISH-02 — Clientes deja de disparar `set-state-in-effect`; comportamiento igual | ✓ VERIFIED (code) | `npx eslint "app/(dashboard)/clients/clients-client.tsx"` → sin salida (exit limpio). El `useEffect` de reset (:494-508 original) ya no existe; subcomponente `ClientDetail` montado con `key={selected.id}` (líneas 770-771), estados `editMode/editForm/notes/historyExpanded` inicializados desde `client` prop (línea 1087+). |
| 3 | SC3/POLISH-03 — bordes de las 2 pantallas de cancelación coinciden; endurecimiento intacto | ✓ VERIFIED (code) | Ambos archivos: `rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5` + `style={{ borderLeftColor: accent }}` byte-idénticos (grep). `.impeccable/config.json` (local, gitignored) registra el finding `side-tab` como aceptado, acotado a esos 2 paths. |
| 4 | EXTRA-A — toasts de borrado bloqueado (servicio/sede/cancha) aclaran pasados+cancelados y ofrecen 2 vías | ✓ VERIFIED (code) | `settings-client.tsx:403` (servicio), `:746` (sede), `canchas-manager.tsx:181` (cancha): las 3 strings contienen "pasados y cancelados" + "Desactivalo/a... o borrá esos turnos primero". |
| 5 | EXTRA-A — `deleteProfessional` captura error, ramifica 23503, no muta estado ni miente "eliminado" | ✓ VERIFIED (code) | `settings-client.tsx:578-588`: `const { error } = await supabase...delete()`; si `error.code === '23503'` → toast + `return` sin tocar `setProfessionals`/`setAgendaSpaces`; solo en camino sin error se muta el estado y se muestra success. |
| 6 | EXTRA-B — migración 061 agrega `public_selector_default` (NOT NULL DEFAULT 'any', CHECK enum), idempotente, aplicada local | ✓ VERIFIED (code + runtime) | `061_public_selector_default.sql` completo: `ADD COLUMN IF NOT EXISTS` + CHECK vía `pg_constraint` + `CREATE OR REPLACE VIEW public_businesses` + `NOTIFY pgrst`. Confirmado aplicada en la DB local: los tests de integración que dependen de esta columna pasan contra la DB local real (ver Behavioral Spot-Checks). |
| 7 | EXTRA-B — la columna viaja server-side hasta `BookingClient` sin abrir superficie nueva a `anon` | ✓ VERIFIED (code) | `public_selector_default` presente en: vista `public_businesses` (migr. 061), `.select()` de `app/[slug]/page.tsx:63`, tipo `Business`→`PublicBusiness` en `lib/types.ts:53`. No se tocó `public_professionals` ni el contrato `{ok,busy,full}`. |
| 8 | EXTRA-B — `anyCardPlacement` es función pura testeada sin DOM (5 casos) | ✓ VERIFIED (code + test run) | `lib/booking-selector.ts`: `'choose'→'last'`, todo lo demás→`'first'`. `npx vitest run test/booking-selector.test.ts` → **5/5 passed** (verificado en esta sesión). |
| 9 | EXTRA-B — paso 2 del booking ordena la tarjeta "Cualquiera" según el setting; gate ≥2 intacto | ✓ VERIFIED (code + test run) | `booking-client.tsx:512-572`: IIFE que llama `anyCardPlacement(business.public_selector_default)`; `'last'` → profesionales primero + Cualquiera al final; default → Cualquiera arriba. `showAny`/sentinel/`isAny` sin tocar. `npx vitest run test/booking-cualquiera-public.test.ts` → **verde** (ejecutado en esta sesión, incluido en 11/11 passed junto a canchas-booking y booking-public-regression). |
| 10 | EXTRA-B — el dueño cambia el setting desde Ajustes; persiste owner-only vía `businesses.update().eq('id', business.id)` | ✓ VERIFIED (code) | `settings-client.tsx:838-841` (estado inicializado desde `business.public_selector_default`), `:886-897` (`saveSelectorDefault`, `update({ public_selector_default: value }).eq('id', business.id)`, patrón `require_deposit`), `:1813-1831` (control de 2 opciones en JSX, tab Cobros). `settings/page.tsx` usa `.select('*')` — la columna llega gratis, sin cambio necesario. |
| 11 | EXTRA-B — no toca el motor de reservas (`book_slot_atomic`/availability/create/contrato) | ✓ VERIFIED (code) | Ningún archivo de la fase toca `lib/booking*.sql`, rutas `availability`/`create`, ni el RPC; el cambio es orden de render en `booking-client.tsx` (paso 2) + escritura de un campo de presentación en `settings-client.tsx`. |

**Score:** 11/11 truths verified at code level (0 behavior-unverified — ninguno de estos truths es una invariante de estado/cancelación no exercitable; son artefactos + wiring verificables por lectura+ejecución).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/(dashboard)/abonos/abonos-client.tsx` | Chip Cancelado/Completado en Archivados | ✓ VERIFIED | Badge destructive/secondary derivado de `status`, gateado a tab archivados |
| `app/(dashboard)/clients/clients-client.tsx` | `ClientDetail` montado con `key={selected.id}`, sin useEffect de reset | ✓ VERIFIED | eslint limpio; subcomponente presente en :770-771, :1087+ |
| `app/cancelar/[token]/cancel-client.tsx` | Borde verificado, diseño/endurecimiento intactos | ✓ VERIFIED | className byte-idéntico al gemelo |
| `app/abono/cancelar/[token]/abono-cancel-client.tsx` | Borde gemelo consistente | ✓ VERIFIED | className byte-idéntico |
| `app/(dashboard)/settings/settings-client.tsx` | Copy nuevo (403/746) + `deleteProfessional` (573-589) + toggle selector (838-897, 1800-1842) | ✓ VERIFIED | Los 3 bloques presentes y correctos |
| `components/dashboard/canchas-manager.tsx` | Copy nuevo en toast de cancha (:181) | ✓ VERIFIED | String con "pasados y cancelados" presente |
| `supabase/migrations/061_public_selector_default.sql` | Columna + CHECK + vista, idempotente | ✓ VERIFIED | Los 4 pasos (columna, CHECK, vista, NOTIFY) presentes |
| `supabase/schema.sql` | Columna+constraint reflejados en `businesses` y `public_businesses` | ✓ VERIFIED (indirecto) | Migración aplicada en local (tests de integración pasan contra la DB real) |
| `lib/types.ts` | `public_selector_default` en `PublicBusiness` | ✓ VERIFIED | línea 53 |
| `app/[slug]/page.tsx` | Columna en el `.select()` | ✓ VERIFIED | línea 63 |
| `lib/booking-selector.ts` | `anyCardPlacement` puro exportado | ✓ VERIFIED | 5/5 test cases pasan |
| `test/booking-selector.test.ts` | Test unitario sin DOM | ✓ VERIFIED | ejecutado en esta sesión: 5/5 passed |
| `app/[slug]/booking-client.tsx` | Orden de la tarjeta según el setting | ✓ VERIFIED | IIFE :512-572, gate ≥2 intacto |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `abonos-client.tsx` | `AbonoRow.status` | derivación directa del chip | ✓ WIRED | Sin re-interpretar `isAbonoActivo` |
| `clients-client.tsx` | `ClientDetail` | remount por `key={selected.id}` | ✓ WIRED | Confirmado en JSX |
| `settings-client.tsx (deleteProfessional)` | patrón `deleteService` | captura `{error}`, ramifica 23503 | ✓ WIRED | Espejo exacto confirmado línea por línea |
| `app/[slug]/page.tsx (.select public_businesses)` | `BookingClient (prop business)` | columna viaja en el objeto `business` | ✓ WIRED | Confirmado + probado en runtime (tests de integración) |
| `booking-client.tsx (paso 2, showAny)` | `lib/booking-selector.ts (anyCardPlacement)` | orden de render decidido por el helper | ✓ WIRED | import + llamada confirmados; test de integración verde |
| `settings-client.tsx (toggle)` | `businesses.public_selector_default` | `update().eq('id', business.id)` | ✓ WIRED | RLS owner-only, sin service-role |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| `anyCardPlacement` — 5 casos puros | `npx vitest run test/booking-selector.test.ts` | 5/5 passed | ✓ PASS |
| Gate ≥2 capaces + contrato de disponibilidad tras el reorder | `npx vitest run test/booking-cualquiera-public.test.ts test/canchas-booking.test.ts test/booking-public-regression.test.ts` | 11/11 passed (3 test files) | ✓ PASS |
| Compilación TypeScript del árbol completo | `./node_modules/.bin/tsc --noEmit` | exit 0, sin salida | ✓ PASS |
| Lint de los 8 archivos tocados por la fase | `npx eslint <8 archivos>` | 10 errores, TODOS fuera de los hunks tocados por la fase (verificado con `git diff` — líneas 217/229/238/362/477 de `settings-client.tsx`, código de tema/paleta/logo pre-existente y no tocado por ningún commit de esta fase) | ✓ PASS (sin regresión nueva) |
| `npm test` full suite | `npx vitest run --no-file-parallelism` (según SUMMARY 11-04, no re-corrida completa en esta verificación por costo — evidencia ya provista: 776/1/0) | 776 passed / 1 skipped / 0 failed | ✓ PASS (evidencia del SUMMARY + subconjunto re-confirmado en vivo en esta sesión) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| POLISH-01 | 11-01 | Chip Cancelado/Completado en Archivados | ✓ SATISFIED | Truth #1 |
| POLISH-02 | 11-01 | Eliminar `set-state-in-effect` en Clientes | ✓ SATISFIED | Truth #2 |
| POLISH-03 | 11-01 | Consistencia de borde en las 2 pantallas de cancelación | ✓ SATISFIED | Truth #3 |
| EXTRA-A (folded) | 11-02 | Copy de borrado bloqueado + fix `deleteProfessional` | ✓ SATISFIED | Truths #4-5 |
| EXTRA-B (folded) | 11-03 + 11-04 | Default del selector "Cualquiera" configurable por negocio | ✓ SATISFIED | Truths #6-11 |

**Nota — desincronización documental (no bloqueante):** `.planning/workstreams/motor-reservas/REQUIREMENTS.md` todavía tiene los checkboxes de POLISH-01/02/03 sin marcar (`[ ]`) y la tabla de Traceability los lista como "Pending". `ROADMAP.md` (la fuente de verdad de Success Criteria, Step 2a) SÍ refleja la Fase 11 como completa con los 4 plans marcados `[x]` y fecha `completed 2026-07-27`, consistente con la evidencia de código de este reporte. Es un artefacto de documentación desactualizado (probablemente el paso de sincronización de REQUIREMENTS.md quedó pendiente), no una falla del código. Se reporta como ítem informativo, no como gap.

### Anti-Patterns Found

Ninguno bloqueante. Escaneo de TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER sobre los 11 archivos tocados por la fase: sin coincidencias reales (2 falsos positivos: `RUBRO_PLACEHOLDERS` es un identificador pre-existente no relacionado, y "TODOS" en `lib/types.ts`/`abono-cancel-client.tsx` es texto de negocio, no un marcador de deuda).

### Human Verification Required

Ver frontmatter `human_verification` — 5 ítems, todos de confirmación visual/UX en vivo (chip legible, comportamiento sin cascada en Clientes, borde idéntico en navegador, copy de los toasts con datos reales, y el orden del paso 2 + persistencia del toggle end-to-end). Ninguno es security-sensitive de alto riesgo; la lógica y el wiring subyacentes ya están verificados por código y por tests de integración.

### Gaps Summary

Sin gaps. Los 11 must-haves (roadmap SC1-3 + EXTRA-A + EXTRA-B) están verificados a nivel de código, tipos, migración aplicada en local, y tests automatizados (unitarios + integración) corridos en esta sesión de verificación. El único hallazgo es una desincronización de `REQUIREMENTS.md` (documentación, no código) reportada arriba como informativa. El estado queda en `human_needed` porque quedan 5 confirmaciones visuales/UX que, por naturaleza, no son verificables por análisis estático — no porque haya evidencia de que algo falle.

---

_Verified: 2026-07-27_
_Verifier: Claude (gsd-verifier)_
