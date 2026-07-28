---
phase: 08-equipo-qu-servicios-hace-cada-profesional
verified: 2026-07-24T20:40:00Z
status: passed
score: 5/8 truths verified (3 present, behavior-unverified)
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "STAFF-01: en /equipo el dueño marca chips, el mapeo se guarda al instante (escritura optimista + rollback) y persiste tras recargar"
    test: "Con un negocio ≥2 profesionales activos, entrar a /equipo, marcar/desmarcar chips de servicio para un profesional, confirmar el pintado instantáneo, recargar la página y confirmar que el estado sigue igual (round-trip real contra Supabase, no solo el estado de React)"
    expected: "El chip queda marcado/desmarcado, no hay parpadeo de rollback, y tras F5 el mapeo leído del servidor coincide con lo marcado"
    why_human: "El código implementa fielmente el patrón ya probado de toggleAgendaSpace (insert/delete con RLS + rollback en error), pero ningún test ejercita el round-trip real navegador↔Supabase; es render + persistencia real, no visible por grep"
  - truth: "STAFF-02: en /servicios la cobertura ('Lo hacen: …' / badge 'Sin cobertura') refleja el estado real y el link a Equipo funciona"
    test: "Con ≥2 profesionales activos, ver un servicio cubierto (muestra nombres) y uno sin cobertura (badge + línea con link a /equipo); confirmar que un comodín presente hace desaparecer todos los 'Sin cobertura'"
    expected: "El badge/línea aparecen exactamente cuando el helper puro dice que no hay cobertura; el link navega a /equipo"
    why_human: "Lógica de render correcta en código (consume professionalsForService/isServiceCovered sin reimplementar), pero es UI visual — no hay harness de componente (decisión documentada del ejecutor por Registry Safety) que la ejercite en runtime"
  - truth: "D-02/D-10: al desmarcar el último servicio de un profesional se avisa (toast.info) y al dejar un servicio sin nadie se avisa con precedencia D-10>D-02 (toast.warning), un solo toast por acción"
    test: "Desmarcar el único servicio marcado de un profesional que deja a ese servicio sin ningún otro profesional capaz: confirmar que aparece SOLO el toast.warning de 'Nadie ofrece…' (no ambos toasts); desmarcar un servicio que no queda sin cobertura pero deja al profesional en comodín: confirmar SOLO el toast.info"
    expected: "Exactamente un toast por toggle, con la precedencia correcta"
    why_human: "Es un invariante de orden/estado (qué toast gana) implementado con lógica if/else-if correcta en código, pero ninguna prueba automatizada ejercita las dos ramas en runtime"
---

# Phase 8: Equipo — qué servicios hace cada profesional — Verification Report

**Phase Goal:** El dueño puede declarar desde el panel qué servicios sabe hacer cada persona del equipo (mapeo muchos-a-muchos, tabla puente `professional_services` vía migración 057, RLS por `business_id`) y ver la cobertura al revés (por servicio, quién lo ofrece), SIN tocar el motor de reservas. Default sin regresión: sin mapeo definido, todos los profesionales se consideran capaces de todos los servicios. El vertical canchas sigue igual (`professionals.service_id` de migr. 043 intacto).

**Verified:** 2026-07-24T20:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | STAFF-01: mapeo muchos-a-muchos persiste (un profesional → varios servicios, un servicio → varios profesionales) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `toggleProfessionalService` (settings-client.tsx:667-704) escribe optimista con rollback contra `professional_services`, espejo exacto de `toggleAgendaSpace` (patrón ya en prod desde Phase 3); read-path `equipo/page.tsx` carga el mapeo por tenant. Código correcto por inspección; round-trip real navegador↔DB no ejercitado por ningún test — ver Human Verification. |
| 2 | STAFF-02: cobertura inversa por servicio + detección de "nadie lo ofrece" | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Bloque B (settings-client.tsx:1289-1345) consume `professionalsForService`/`isServiceCovered` de `lib/staff-services.ts` (no reimplementa la regla); badge "Sin cobertura" + línea `role="status"` con link a `/equipo` cuando `!covered`. Lógica de render correcta por inspección; sin harness de componente que la ejercite en runtime — ver Human Verification. |
| 3 | STAFF-03: sin mapeo definido (0 filas) todos los profesionales son capaces de todo (comodín); negocio de 1 profesional reserva igual que hoy | ✓ VERIFIED | `servicesForProfessional`/`professionalsForService`/`isServiceCovered` en `lib/staff-services.ts` implementan el comodín (0 filas ⇒ todo); `test/staff-services.test.ts` 8/8 verde cubre exactamente estos casos (comodín, mapeo explícito, último desmarcado, comodín presente=todo cubierto, inactivo excluido). Bloque A/B se ocultan con `<2` profesionales activos (`settings-client.tsx:1294`, `:1511`), así que negocios de 1 profesional no ven ni el editor ni la cobertura y la migración no hace backfill (0 filas de base). |
| 4 | El vertical canchas sigue igual; `professionals.service_id` (migr. 043) intacto, sin pisarse | ✓ VERIFIED | `isCanchas` gatea Bloque A (`!isCanchas &&`, línea 1511) y Bloque B (rama `!isCanchas` del `map` de servicios, línea 1266/1290); `/equipo` redirige antes de las queries si `resolveVertical(business).key === 'canchas'`. `supabase/schema.sql` muestra `professionals_service_id_fkey`/`professionals_service_id_idx` sin cambios; ningún archivo de la Phase 8 toca `professionals.service_id` (confirmado por `git show --stat` de los 6 commits de la fase — solo migración/tipos/helper/test + `settings-client.tsx` + los dos `page.tsx`). |
| 5 | Tabla puente con RLS habilitada + 4 policies por tenant, sin acceso `anon` | ✓ VERIFIED | `supabase/migrations/057_professional_services.sql`: `ENABLE ROW LEVEL SECURITY` + 4 `CREATE POLICY` (select/insert/update/delete) con predicado `business_id IN (SELECT businesses.id ... WHERE owner_id = auth.uid())`, idéntico a `agenda_spaces` (042). `supabase/schema.sql` (post `db reset` local, confirmado por el orquestador y re-verificado acá) refleja las 4 policies. `GRANT ALL ... TO anon` es el auto-grant estándar de Supabase (idéntico en `agenda_spaces`/`clients`, confirmado por grep); 0 policies referencian `anon` ⇒ sin exposición real. |
| 6 | Helper puro (D-01/D-12) es la fuente única de la regla del comodín, testeada, sin reimplementación en la UI | ✓ VERIFIED | `lib/staff-services.ts` exporta exactamente `servicesForProfessional`, `professionalsForService`, `isServiceCovered`, puro (sin React/Supabase); `settings-client.tsx` importa y usa `professionalsForService`/`isServiceCovered` (líneas 12, 687, 1296, 1298) — no hay lógica de comodín/cobertura duplicada en el componente. `npx vitest run test/staff-services.test.ts` → 8/8 verde (re-ejecutado en esta verificación). |
| 7 | Prohibiciones D-04/D-15: la fase NO toca el alta manual de turnos, abonos, ni el motor de reservas; no reescribe histórico | ✓ VERIFIED | `git show --stat` de los 6 commits de la fase (`77b3508`, `57deac4`, `19e8e01`, `bd3a4a1`, `23959b6`, `0273fd5`) solo modifica: `lib/types.ts`, `supabase/migrations/057_*.sql`, `supabase/schema.sql`, `test/staff-services.test.ts`, `lib/staff-services.ts`, `settings-client.tsx`, `equipo/page.tsx`, `servicios/page.tsx`. Cero archivos de `app/api/booking/*`, alta manual o abonos. `grep` sobre `settings-client.tsx` no encuentra referencias a `appointments`/`abono` fuera de comentarios. |
| 8 | D-03: un servicio nuevo no se auto-asigna a ningún profesional (arranca sin cobertura si el negocio ya tiene mapeo explícito) | ✓ VERIFIED | `addService` (settings-client.tsx:386-396) solo hace `insert` en `services`; no toca `professional_services`. Consecuencia estructural: un servicio recién creado tiene 0 filas en la puente y, si hay al menos un profesional con mapeo explícito y ninguno lo marcó, `isServiceCovered` devuelve `false` (test `staff-services.test.ts` cubre "último desmarcado = sin cobertura", caso estructuralmente idéntico). |

**Score:** 5/8 truths verified (3 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/057_professional_services.sql` | Tabla puente + RLS + 4 policies + índice inverso, idempotente | ✓ VERIFIED | `CREATE TABLE IF NOT EXISTS`, `ENABLE ROW LEVEL SECURITY`, 4 `CREATE POLICY` (2 `WITH CHECK`), `CREATE INDEX IF NOT EXISTS professional_services_by_service`, 0 `CREATE OR REPLACE FUNCTION`, 0 `book_slot_atomic` |
| `supabase/schema.sql` | Snapshot regenerado con `professional_services` | ✓ VERIFIED | Tabla + PK + 3 FKs + índice + RLS + 4 policies + grants presentes (líneas 274-1593, 3412-3414) |
| `lib/types.ts` | `interface ProfessionalService` | ✓ VERIFIED | Líneas 158-162, 3 campos snake_case, comentario de la regla del comodín |
| `lib/staff-services.ts` | Helper puro con 3 funciones exportadas | ✓ VERIFIED | `servicesForProfessional`, `professionalsForService`, `isServiceCovered`; sin Supabase/React; importa solo tipos de `@/lib/types` |
| `test/staff-services.test.ts` | Suite vitest de la regla del comodín | ✓ VERIFIED | 8/8 tests verdes (re-ejecutado) |
| `app/(dashboard)/settings/settings-client.tsx` | Bloque A (editor) + Bloque B (cobertura) + `toggleProfessionalService`/`isServiceMapped` + estado | ✓ VERIFIED (wiring); ⚠️ visual no ejercitado en runtime | Todos los símbolos presentes y wireados (ver truths 1-2) |
| `app/(dashboard)/equipo/page.tsx` | Read-path carga `services` + `professional_services` por tenant | ✓ VERIFIED | `Promise.all` con `.eq('business_id', business.id)` en ambas cargas nuevas; `initialServices={services \|\| []}` (ya no `{[]}`); redirect por canchas intacto |
| `app/(dashboard)/servicios/page.tsx` | Read-path carga `professional_services` por tenant | ✓ VERIFIED | `.eq('business_id', business.id)`; pasa `initialProfessionalServices` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/staff-services.ts` | `lib/types.ts` | import de `Professional`, `Service`, `ProfessionalService` | WIRED | `import type { Professional, Service, ProfessionalService } from '@/lib/types'` |
| `supabase/migrations/057_professional_services.sql` | `supabase/schema.sql` | `supabase db reset` local replaya 001→057; schema.sql regenerado | WIRED | Confirmado por evidencia del orquestador (`supabase migration list --local` muestra 057) y re-verificado por grep directo sobre `schema.sql` |
| `settings-client.tsx` | tabla `professional_services` | `toggleProfessionalService` con browser client + RLS + `.eq('business_id')` | WIRED | `from('professional_services')` aparece 2 veces (insert línea 697, delete línea 673), 0 `service_role`/`createAdminClient` |
| `settings-client.tsx` | `lib/staff-services.ts` | Bloque B + toast D-10 consumen `professionalsForService`/`isServiceCovered` | WIRED | Import línea 12, uso líneas 687, 1296, 1298 |
| `equipo/page.tsx` | tabla `professional_services` | `Promise.all` scoped por `business_id` | WIRED | Línea 29 |
| `servicios/page.tsx` | tabla `professional_services` | `Promise.all` scoped por `business_id` | WIRED | Línea 27 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `settings-client.tsx` (`professionalServices` state) | `initialProfessionalServices` prop | `equipo/page.tsx` / `servicios/page.tsx` `Promise.all` query real contra Supabase (`.eq('business_id', business.id)`) | Sí — query real, no estático/vacío hardcodeado | ✓ FLOWING |
| `equipo/page.tsx` (`initialServices`) | `services` query | `supabase.from('services').select('*').eq('business_id', ...)` | Sí — reemplaza el `initialServices={[]}` estático previo | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite `staff-services` (regla del comodín + cobertura) pasa | `npx vitest run test/staff-services.test.ts` | 8 passed (8) | ✓ PASS |
| Typecheck limpio tras los cambios de la fase | `node ./node_modules/typescript/bin/tsc --noEmit` | Exit 0, sin errores | ✓ PASS |
| Round-trip real de escritura (marcar chip → recargar → persiste) | — | — | ? SKIP (requiere servidor dev + sesión autenticada; ver Human Verification) |

### Probe Execution

No hay probes formales (`scripts/*/tests/probe-*.sh`) declarados para esta fase; no es una fase de migración/tooling con ese patrón. La integridad de la migración 057 se validó con `npx supabase db reset` (Task 3 [BLOCKING] del Plan 01), confirmado por el orquestador (`supabase migration list --local` muestra 057 aplicada tras replay limpio 001→057) y re-verificado en esta pasada por grep directo de la sección `professional_services` en `supabase/schema.sql`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| STAFF-01 | 08-01, 08-02 | El dueño define qué servicios puede hacer cada profesional (M2M) desde el panel | ✓ SATISFIED (código); visual pendiente de UAT | Tabla + RLS (08-01) + editor de chips wireado (08-02) — ver truths 1, 5 |
| STAFF-02 | 08-01, 08-02 | El dueño ve, por servicio, qué profesionales lo ofrecen, detecta huecos | ✓ SATISFIED (código); visual pendiente de UAT | Helper `professionalsForService`/`isServiceCovered` (08-01) + Bloque B (08-02) — ver truths 2, 6 |
| STAFF-03 | 08-01, 08-02 | Negocio de 1 profesional o sin mapeo reserva igual que hoy (cero regresión) | ✓ SATISFIED | Regla del comodín + gates `<2` activos + cero backfill — ver truth 3 |

Sin requisitos huérfanos: `REQUIREMENTS.md` mapea STAFF-01/02/03 exclusivamente a Phase 8, y ambos PLAN.md (08-01, 08-02) declaran los tres IDs en su frontmatter `requirements`.

### Anti-Patterns Found

Ninguno. Scan sobre los 8 archivos tocados por la fase (`057_professional_services.sql`, `lib/types.ts`, `lib/staff-services.ts`, `test/staff-services.test.ts`, `settings-client.tsx`, `equipo/page.tsx`, `servicios/page.tsx`, `schema.sql`) no encontró `TBD`/`FIXME`/`XXX`/`HACK` reales (los únicos matches de la regex `TODO` fueron falsos positivos de la palabra española "TODOS"), ni handlers vacíos, ni datos hardcodeados que reemplacen el fetch real.

### Human Verification Required

### 1. Persistencia real del mapeo en /equipo

**Test:** Con un negocio de ≥2 profesionales activos, entrar a `/equipo`, marcar y desmarcar chips de servicio para distintos profesionales, y recargar la página (F5).
**Expected:** Los chips se pintan al instante sin parpadeo de rollback, y tras recargar el estado leído del servidor coincide exactamente con lo marcado antes.
**Why human:** El código implementa el patrón ya probado de `toggleAgendaSpace` correctamente por inspección, pero el round-trip real navegador↔Supabase (RLS incluida) no lo ejercita ningún test automatizado.

### 2. Cobertura visual en /servicios

**Test:** Con ≥2 profesionales activos, revisar `/servicios`: un servicio con al menos un profesional capaz debe mostrar "Lo hacen: {nombres}"; un servicio sin ningún profesional capaz debe mostrar el badge "Sin cobertura" + la línea con link a `/equipo` (confirmar que el link navega). Confirmar que con al menos un profesional comodín (0 filas) presente, ningún servicio muestra "Sin cobertura".
**Expected:** El estado visual coincide exactamente con la regla del comodín en cada combinación.
**Why human:** Lógica de render correcta por inspección de código; no hay harness de componente que la ejercite en runtime (decisión documentada del ejecutor, para no agregar una dependencia nueva).

### 3. Precedencia de toasts D-10/D-02 al desmarcar

**Test:** Desmarcar el último servicio marcado de un profesional cuando ese servicio queda sin ningún otro profesional capaz → debe aparecer SOLO `toast.warning` ("Nadie ofrece..."). Desmarcar un servicio que no deja al servicio sin cobertura pero sí deja al profesional en comodín (0 servicios marcados) → debe aparecer SOLO `toast.info` ("vuelve a ofrecerse para todo"). Nunca ambos toasts a la vez.
**Expected:** Exactamente un toast por acción, con la precedencia correcta (D-10 gana sobre D-02).
**Why human:** Es un invariante de orden de estado implementado con lógica if/else-if correcta en código, pero ninguna prueba automatizada ejercita ambas ramas en runtime.

### 4. Gates de vertical/cantidad de profesionales (regresión visual)

**Test:** En un negocio del vertical canchas, confirmar que ni el editor de chips (`/equipo`) ni la cobertura (`/servicios`) aparecen. En un negocio con solo 1 profesional activo, confirmar que tampoco aparece ninguno de los dos bloques (y que la reserva sigue funcionando igual que antes).
**Expected:** Cero cambios visuales/funcionales para canchas y negocios de 1 profesional.
**Why human:** Gating correcto por inspección (`isCanchas`, `professionals.filter(p => p.active).length >= 2`), pero es comportamiento de renderizado condicional en runtime, no verificable solo por grep.

### Gaps Summary

No hay gaps de código: los 8 truths derivados del ROADMAP + must_haves de ambos PLAN.md están soportados por evidencia directa en el código (migración, RLS, helper puro con 8 tests, wiring de la UI, ausencia de tocar el motor/alta manual/abonos/`professionals.service_id`). El motivo del estado `human_needed` es exclusivamente que 3 de los 8 truths son comportamientos de UI/runtime (persistencia real tras recargar, render de cobertura, precedencia de toasts) que el propio SUMMARY de 08-02 marca como "UAT visual pendiente en el checkpoint de fase" y para los que no existe (ni se agregó, por decisión documentada de no sumar dependencias) un harness de test de componente. No bloquea el avance a Phase 9/10 salvo que la UAT visual encuentre una discrepancia con lo documentado acá.

---

_Verified: 2026-07-24T20:40:00Z_
_Verifier: Claude (gsd-verifier)_
