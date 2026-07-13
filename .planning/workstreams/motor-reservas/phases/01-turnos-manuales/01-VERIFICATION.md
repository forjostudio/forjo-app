---
phase: 01-turnos-manuales
verified: 2026-06-26T17:32:00Z
status: passed
score: 9/9
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  gaps_closed:
    - "Slot ocupado rechazado con slot_taken vía el handler autenticado (no solo el core aislado) — test nombrado agregado (manual-booking.test.ts)"
    - "Anti-tampering cross-tenant (serviceId de otro negocio) vía el handler autenticado — test nombrado agregado (manual-booking.test.ts)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "La seña es opcional para el turno manual (el dueño decide si la exige al cargarlo), independiente del flag de seña del servicio"
    addressed_in: "v2 (fuera del milestone v0.12 Phase 1)"
    evidence: "MANUAL-04 diferido a v2 por decisión D-01 en REQUIREMENTS.md Traceability; ROADMAP.md SC-4 tachado con nota explícita"
---

# Phase 1: Turnos Manuales — Reporte de Verificación

**Goal de la Fase:** El dueño puede cargar un turno desde el dashboard (reserva telefónica / walk-in) reusando el mismo pipeline server-side de `/api/booking/create` (validación, disponibilidad, anti-tampering de tenant, anti-doble-booking), desde su sesión autenticada en vez del flujo anónimo. NO toca los constraints de integridad — un turno más por el mismo camino.

**Verificado:** 2026-06-26T17:32:00Z
**Estado:** passed
**Re-verificación:** Sí — tras cierre de gap (se agregaron los 2 tests de integración nombrados que faltaban). Verificación inicial: 2026-06-26T17:25:00Z (human_needed, 7/7).

---

## Logro del Goal

### Verdades Observables

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | El core `lib/booking-core.ts` existe y exporta `createAppointmentCore` con anti-tampering por `business_id`, re-check de solapamiento+buffer, traducción 23505/23P01 → slot_taken | VERIFICADO | Archivo existe, 224 líneas. Exports: `createAppointmentCore`, `CreateAppointmentInput`, `CreateAppointmentResult`. Re-validación con `.eq('business_id', business.id)` en service (línea 87), professional (línea 99), location (línea 167-173). Traducción de constraints en líneas 207-209. |
| 2 | El endpoint público `app/api/booking/create/route.ts` consume el core sin cambiar su comportamiento (reCAPTCHA, gate de plan, seña, holds-emails y GCal permanecen en el caller) | VERIFICADO | Importa `createAppointmentCore` (línea 7). Conserva `verifyRecaptcha`, `sendPendingPaymentEmail`, `sendExpiredHoldEmail`, `createCalendarEvent`, `getBusinessSecrets` (líneas 3-6). Gate `plan_inactive` presente (línea 62). reCAPTCHA en línea 74. |
| 3 | El route handler autenticado `app/api/appointments/create/route.ts` resuelve el negocio por `owner_id`, usa anon+RLS (NO admin para el insert), pasa `requireDeposit:false` al core, y crea GCal best-effort en `after()` sin mandar mail | VERIFICADO | Importa `createClient` de `@/lib/supabase/server` (línea 2), NO createAdminClient para el insert. Business resuelto con `.eq('owner_id', user.id)` (línea 35). `requireDeposit: false` en línea 86. `after()` para GCal (líneas 101-126). Sin sendPendingPaymentEmail ni verifyRecaptcha. |
| 4 | La migración `040_appointments_clients_insert_with_check.sql` agrega 2 policies FOR INSERT WITH CHECK para appointments y clients sin tocar constraints 011/013 ni la policy existente | VERIFICADO | Archivo existe en `supabase/migrations/040_appointments_clients_insert_with_check.sql`. Contiene `CREATE POLICY "appointments tenant insert" ... FOR INSERT WITH CHECK` y `CREATE POLICY "clients tenant insert" ... FOR INSERT WITH CHECK`. Sin DROP POLICY, sin referencia a appointments_no_double_booking ni appointments_no_overlap. |
| 5 | `NuevoTurnoForm` hace fetch POST a `/api/appointments/create` (NO insert client-side directo), es responsive (Dialog/Drawer), tiene combobox con crear-inline y no renderiza controles de seña | VERIFICADO | Archivo `components/dashboard/nuevo-turno-form.tsx` existe, 484 líneas. `fetch('/api/appointments/create'` en línea 224. Importa `Dialog` y `Drawer`. Sin `supabase.from('appointments').insert`. Sin controles de seña/deposit/pending_payment en el JSX. Combobox = Input + filtro en memoria. |
| 6 | El form está cableado en Turnos (appointments-client) y Agenda (agenda-client); los page.tsx correspondientes cargan los datos necesarios por business_id | VERIFICADO | `appointments-client.tsx` importa `NuevoTurnoForm` (línea 17), renderiza `<NuevoTurnoForm` (línea 426). `appointments/page.tsx` carga `clients` y `locations` (línea 18). `agenda-client.tsx` importa `NuevoTurnoForm` (línea 21), tiene `nuevoTurnoOpen`/`prefillDate` (líneas 77-78), celdas de día como `<button>` con `aria-label` (línea 452). `agenda/page.tsx` carga services/professionals/clients (líneas 40-42). |
| 7 | MANUAL-04 (seña opcional en alta manual) está correctamente registrado como diferido a v2 en REQUIREMENTS.md Traceability, citando D-01 | VERIFICADO | REQUIREMENTS.md líneas 17 y 64-66: MANUAL-04 marcado `[~]` con nota "(diferido a v2 — D-01)" y tabla Traceability con `Deferred (v2) | Out of Phase 1 (D-01)`. ROADMAP.md SC-4 tachado con nota explícita. |
| 8 | Un turno manual sobre un slot ya ocupado es rechazado con slot_taken igual que el booking público | VERIFICADO | Test nombrado en `test/manual-booking.test.ts:243` — `devuelve slot_taken cuando el slot ya está ocupado, vía el handler autenticado (no solo el core)`. Ejerce la cadena del handler (`resolveClientId → createAppointmentCore`) con `ownerAnon` (sesión anon+RLS autenticada, guard anti-falso-verde líneas 94-101). 2º intento → slot_taken/409 + verifica que sigue habiendo exactamente 1 turno. PASS (no skipped — 7/7 de manual-booking corrieron). |
| 9 | El dueño solo puede crear turnos en SU negocio (anti-tampering cross-tenant en el handler manual) | VERIFICADO | Test nombrado en `test/manual-booking.test.ts:310` — `rechaza serviceId de otro tenant (anti-tampering) en el handler autenticado`. Segundo tenant `other` sembrado en beforeAll; `other.serviceId` con la sesión anon+RLS del dueño A → `invalid_service`/400 + verifica que NO se insertó turno cross-tenant. PASS. |

**Puntaje:** 9/9 verdades verificadas (las 2 verdades de comportamiento dependiente de runtime ahora tienen test end-to-end nombrado a través de la cadena del handler — ya no quedan present-behavior-unverified)

---

### Items Diferidos

Items no alcanzados pero explícitamente diferidos a v2 por decisión.

| # | Item | Diferido a | Evidencia |
|---|------|-----------|-----------|
| 1 | MANUAL-04: seña opcional en alta manual (el dueño decide si la exige al cargarlo) | v2 (fuera del milestone v0.12) | REQUIREMENTS.md Traceability: `MANUAL-04 | Deferred (v2) | Out of Phase 1 (D-01)`. ROADMAP.md SC-4 tachado explícitamente. Decisión D-01 documentada en CONTEXT. |

---

### Artefactos Requeridos

| Artefacto | Esperado | Estado | Detalle |
|-----------|----------|--------|---------|
| `lib/booking-core.ts` | Core rol-agnóstico anti-tampering + re-check + insert | VERIFICADO | 224 líneas. Exports `createAppointmentCore`, `CreateAppointmentInput`, `CreateAppointmentResult`. No importa email/recaptcha/business-secrets. No crea su propio cliente Supabase. |
| `app/api/booking/create/route.ts` | Endpoint público consumiendo el core sin regresión | VERIFICADO | Importa y llama a `createAppointmentCore`. Mantiene reCAPTCHA/seña/holds-emails/GCal/plan-gate. |
| `app/api/appointments/create/route.ts` | Endpoint autenticado: auth.getUser + business por owner_id + dedupe + core + GCal after() | VERIFICADO | 186 líneas. 401 sin sesión. Business por owner_id. resolveClientId con dedupe D-04. requireDeposit:false. GCal en after(). |
| `supabase/migrations/040_appointments_clients_insert_with_check.sql` | 2 policies FOR INSERT WITH CHECK (appointments + clients) | VERIFICADO | 37 líneas. 2 CREATE POLICY con FOR INSERT WITH CHECK. Sin DROP ni toque a constraints 011/013. |
| `components/dashboard/nuevo-turno-form.tsx` | Form compartido modal/drawer + combobox + fetch al endpoint | VERIFICADO | 484 líneas. Dialog/Drawer responsive. Fetch a /api/appointments/create. Sin insert directo. Sin controles de seña. |
| `app/(dashboard)/appointments/page.tsx` | Carga clients por business_id y los pasa al client | VERIFICADO | Carga clients con `.eq('business_id', business.id)` (línea 36). Pasa como prop (línea 52). |
| `app/(dashboard)/agenda/page.tsx` | Carga services/professionals/clients por business_id | VERIFICADO | Carga services (línea 40), professionals (línea 41), clients (línea 42) con filtro por business_id. |
| `test/booking-core.test.ts` | Tests del core: overlap/buffer/anti-tampering/23505/confirmed | VERIFICADO | Existe. `describe.skipIf(!hasSupabaseCreds)`. Importa `createAppointmentCore` de `@/lib/booking-core`. Tests A-E presentes. |
| `test/manual-booking.test.ts` | Tests de dedupe + alta confirmed + 401 + slot_taken/anti-tampering vía handler | VERIFICADO | Existe. `describe.skipIf(!hasSupabaseCreds)`. 7 tests, todos PASS (no skipped): 401, dedupe teléfono, dedupe email, sin-match, confirmed, slot_taken vía handler, anti-tampering cross-tenant vía handler. Guard anti-falso-verde (ownerAnon ≠ service-role). |

---

### Verificación de Key Links

| Desde | Hacia | Vía | Estado | Detalle |
|-------|-------|-----|--------|---------|
| `app/api/booking/create/route.ts` | `lib/booking-core.ts` | `import { createAppointmentCore } from '@/lib/booking-core'` | CABLEADO | Línea 7 del endpoint público. Llamada en línea 91. |
| `app/api/appointments/create/route.ts` | `lib/booking-core.ts` | `import { createAppointmentCore } from '@/lib/booking-core'` | CABLEADO | Línea 5 del handler autenticado. Llamada en línea 73. |
| `app/api/appointments/create/route.ts` | `lib/supabase/server` | `createClient()` anon+RLS (sesión del dueño), NO admin | CABLEADO | Línea 2: `import { createClient } from '@/lib/supabase/server'`. Sin createAdminClient para el insert. |
| `components/dashboard/nuevo-turno-form.tsx` | `app/api/appointments/create/route.ts` | `fetch('/api/appointments/create', { method: 'POST' })` | CABLEADO | Línea 224 del form. |
| `app/(dashboard)/agenda/agenda-client.tsx` | `components/dashboard/nuevo-turno-form.tsx` | `import { NuevoTurnoForm }` + click-en-día pre-llena fecha | CABLEADO | Línea 21 agenda-client. `prefillDate` + `setPrefillDate` en líneas 77-80. `prefill={{ date: prefillDate }}` en línea 773. |
| `app/(dashboard)/appointments/appointments-client.tsx` | `components/dashboard/nuevo-turno-form.tsx` | `import { NuevoTurnoForm }` + reemplazo del handleCreate inline | CABLEADO | Línea 17 de appointments-client. Sin supabase.from('appointments').insert() directo. |

---

### Trazado de Flujo de Datos (Nivel 4)

| Artefacto | Variable de datos | Fuente | Produce datos reales | Estado |
|-----------|------------------|--------|---------------------|--------|
| `NuevoTurnoForm` (clients) | `clients: Client[]` | `app/(dashboard)/appointments/page.tsx` y `agenda/page.tsx` cargan con `.eq('business_id', business.id)` desde Supabase | Sí — query real con filtro de tenant | FLOWING |
| `NuevoTurnoForm` (services) | `services: Service[]` | `agenda/page.tsx` carga con `.eq('active', true).eq('business_id', ...)` | Sí — query real | FLOWING |
| `NuevoTurnoForm` (professionals) | `professionals: Professional[]` | `agenda/page.tsx` carga con `.eq('active', true).eq('business_id', ...)` | Sí — query real | FLOWING |
| `app/api/appointments/create` (business) | `business` | `.eq('owner_id', user.id)` desde la sesión autenticada | Sí — nunca del cliente | FLOWING |

---

### Verificaciones de Comportamiento (Spot-checks)

| Comportamiento | Comando | Resultado | Estado |
|----------------|---------|-----------|--------|
| Suite Vitest completa verde (297 tests, de 295 → +2) | `npm run test` | 25 archivos, 297/297 passed | PASS |
| manual-booking.test.ts corre sin skip (7 tests) | `npx vitest run test/manual-booking.test.ts` | 1 archivo, 7/7 passed (ninguno skipped) | PASS |
| TypeScript sin errores | `npx tsc --noEmit` | Sin output de error | PASS |
| booking-core no importa módulos prohibidos (email/recaptcha/business-secrets) | `grep "email\|recaptcha\|business-secrets" lib/booking-core.ts` | Sin matches | PASS |
| booking-core no crea su propio cliente Supabase | `grep "createClient\|createAdminClient" lib/booking-core.ts` | Sin matches | PASS |
| NuevoTurnoForm sin insert directo a supabase | `grep "supabase.*appointments.*insert\|\.insert(" appointments-client.tsx` | Sin matches en appointments-client | PASS |
| NuevoTurnoForm sin controles de seña | `grep -i "seña\|deposit\|pending_payment" nuevo-turno-form.tsx` | Solo comentario en línea 8, sin controles de UI | PASS |
| slot_taken vía handler autenticado (test nombrado) | `npx vitest run test/manual-booking.test.ts` | Test `devuelve slot_taken ... vía el handler autenticado` PASS | PASS |
| anti-tampering cross-tenant vía handler (test nombrado) | `npx vitest run test/manual-booking.test.ts` | Test `rechaza serviceId de otro tenant ... en el handler autenticado` PASS | PASS |

---

### Ejecución de Probes

No aplica — esta fase no declara probes en PLAN ni SUMMARY.

---

### Cobertura de Requirements

| Requirement | Plan origen | Descripción | Estado | Evidencia |
|-------------|------------|-------------|--------|-----------|
| MANUAL-01 | 01-01, 01-02, 01-04 | El dueño crea un turno desde el dashboard reusando el pipeline de `/api/booking/create` desde su sesión autenticada | SATISFECHO | `lib/booking-core.ts` es el pipeline compartido. `app/api/appointments/create` lo consume con anon+RLS. `NuevoTurnoForm` lo dispara vía fetch. Anti-tampering cross-tenant vía handler con test nombrado. |
| MANUAL-02 | 01-02, 01-04 | Al crear un turno manual, el dueño elige cliente existente o crea uno nuevo (nombre + contacto) | SATISFECHO | `resolveClientId` en el handler autenticado implementa dedupe D-04 (teléfono normalizado + email lowercase). `NuevoTurnoForm` tiene combobox + rama crear-inline. Tests de dedupe por teléfono y email PASS. |
| MANUAL-03 | 01-01, 01-02, 01-04 | El turno manual respeta la disponibilidad real del slot igual que el booking público | SATISFECHO | El core reutiliza el re-check de solapamiento+buffer y los constraints 011/013. Test slot_taken vía el handler autenticado PASS — el camino manual no abre bypass del re-check. |
| MANUAL-04 | 01-03 | La seña es opcional para el turno manual — DIFERIDO a v2 | DIFERIDO — correctamente registrado | REQUIREMENTS.md Traceability: `Deferred (v2) | Out of Phase 1 (D-01)`. No se cuenta como gap. |

---

### Anti-patrones Encontrados

| Archivo | Línea | Patrón | Severidad | Impacto |
|---------|-------|--------|-----------|---------|
| `app/(dashboard)/appointments/appointments-client.tsx` | 7 | `import { createClient } from '@/lib/supabase/client'` | INFO | El archivo todavía importa el cliente de browser. Verificado que NO se usa para insertar appointments ni clients (sin `.from('appointments').insert` ni `.from('clients').insert`). Se usa para otras operaciones del dashboard (edición, borrado). No es un stub ni una regresión. |

Sin TBD/FIXME/XXX en archivos modificados por la fase.

---

### Verificación Humana Requerida

Ninguna pendiente. Los 2 items de la verificación inicial (slot_taken vía handler completo; anti-tampering cross-tenant vía handler completo) fueron cerrados con tests de integración nombrados en `test/manual-booking.test.ts` (commit `7be1315`), que ejercen la cadena del handler con la sesión anon+RLS del dueño (la misma capa que corre en producción) y un guard anti-falso-verde que rechaza el uso de service-role. Ambos PASS.

El UAT humano del checkpoint 01-04 (alta en desktop/mobile, slot_taken, dedupe, click-en-día, sin control de seña) también PASÓ.

---

## Resumen de Gaps

No hay gaps. Todos los artefactos existen, están cableados, los datos fluyen y las 9 verdades observables están verificadas — incluidas las 2 verdades de seguridad (slot_taken + anti-tampering cross-tenant) que ahora tienen test end-to-end nombrado a través del handler autenticado completo, no solo del core aislado.

**MANUAL-04** está correctamente registrado como diferido a v2 (D-01) — no es un gap de Phase 1.

Suite Vitest **297/297 verde** (de 295 → +2 tests de integración), `manual-booking.test.ts` corre sin skip (7/7), y `tsc --noEmit` limpio — sin regresiones. El núcleo de integridad (constraints 011/013, anti-doble-booking, aislamiento por tenant) no se debilitó: la migración 040 solo AGREGA policies FOR INSERT WITH CHECK y el alta manual pasa por el mismo core que el público.

**El goal de la fase se logró.** Listo para proceder a Phase 2.

---

_Verificado: 2026-06-26T17:32:00Z (re-verificación tras cierre de gap)_
_Verificación inicial: 2026-06-26T17:25:00Z_
_Verificador: Claude (gsd-verifier) — Sonnet 4.6_
