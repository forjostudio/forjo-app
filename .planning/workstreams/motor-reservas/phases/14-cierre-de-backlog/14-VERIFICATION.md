---
phase: 14-cierre-de-backlog
verified: 2026-08-06T00:00:00Z
status: gaps_found
score: 5/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "El RiskBadge 'Alto' pesa visualmente más que 'Medio' (POLISH-05 / D-05), en TODA superficie que lo consume, incluidos los ConfirmDialog del CRM"
    status: failed
    reason: "Regresión de 14-01. `.crm-shell` se aplica sobre un <div> en app/(crm)/layout.tsx:47, pero DialogContent monta en <DialogPortal> (base-ui Portal) en la raíz del documento, fuera de ese div. Dentro de los 4 ConfirmDialog del CRM (abonos-client.tsx:551, settings-client.tsx:2491/:2530, canchas-manager.tsx:368), --danger cae a --destructive y --primary (variante medio) cae al primary de la app: los dos rojos, indistinguibles. Confirmado independientemente leyendo app/(crm)/layout.tsx:47 y components/ui/dialog.tsx (DialogPortal en :51/:79)."
    artifacts:
      - path: "components/crm/risk-badge.tsx"
        issue: "El componente en sí es correcto (D-05/D-06/D-07 cumplidos: pill relleno de --danger, sin dot, un solo componente). El defecto no está en risk-badge.tsx sino en el contexto de montaje del Portal, fuera del scope del componente."
      - path: "app/(crm)/layout.tsx"
        issue: "`.crm-shell` en un <div> que no envuelve el árbol del Portal donde React monta los Dialog/ConfirmDialog"
    missing:
      - "Fix de scoping de tokens del CRM para que el Portal herede --danger/--primary del shell (candidato: mover .crm-shell a un ancestro que sí envuelva el Portal, o inyectar el atributo/clase del shell en el propio Portal). Ya identificado y priorizado como plan 14-08 ítem 1 por el propio equipo — este verifier corrobora el diagnóstico, no lo re-descubre."
  - truth: "POLISH-04 cubre TODOS los botones de acción del dashboard con ancho consistente (criterio D-01/D-02), sin dejar afuera pantallas visibles al usuario"
    status: partial
    reason: "El toggle 'Al reservar, ¿preseleccionar «Cualquiera»?' (radiogroup en settings-client.tsx:1914, renderizado en la vista Equipo vía app/(dashboard)/equipo/page.tsx → <SettingsClient view=\"equipo\">) queda fuera del inventario auditado por 14-01/14-PATTERNS.md — no es de los 5 archivos con must_haves de la fase y ningún plan lo tocó. El wrapper `<div role=\"radiogroup\">` es hijo directo de un `<Card className=\"p-6 space-y-4 mt-4\">` (:1909) — mismo patrón causa-2 (Card flex-col → align-items:stretch) que 14-01 sí resolvió en otros 8 casos del mismo archivo, así que es plausible que se estire igual. Confirmado además en la UAT real (14-07, punto 6) y en las botoneras '+ Agregar' de Equipo (punto 7) sin centrado vertical."
    artifacts:
      - path: "app/(dashboard)/settings/settings-client.tsx"
        issue: "El bloque EXTRA-B/D-19 (líneas ~1907-1940, vista Equipo) no fue auditado por 14-01 — su radiogroup hijo directo de <Card> queda sin self-start, y los botones '+ Agregar' de Equipo sin centrado vertical"
    missing:
      - "Auditar y aplicar self-start (u otra corrección de alineación) al radiogroup de preselección y a los '+ Agregar' de Equipo. Ya priorizado como plan 14-08 ítems 2 y 3."
deferred: []
human_verification: []
---

# Phase 14: Cierre de backlog — Verification Report

**Phase Goal:** Drenar el backlog chico de polish acumulado, sin impacto en el motor de reservas ni en los constraints: unificar el ancho de los botones de acción app-wide, que el `RiskBadge` "Alto" se vea con color fuera del CRM, que un abono cancelado deje de mostrar "Copiar link de baja", y que un cliente recién creado sin turnos caiga en "Nuevas" y no en "Pausa" — más EXTRA-A (tabs Activos/Desactivados en Canchas) y EXTRA-B (borrado definitivo de abono archivado, migración 066).

**Verified:** 2026-08-06
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

El propio equipo de ejecución (14-07-SUMMARY.md, UAT humana real contra datos sembrados) ya declaró que la fase **NO está cerrada** y abrió el plan `14-08` para los 3 ítems de gap listados abajo. Este verifier corrobora esa evidencia de forma independiente contra el código (no confía en la narrativa del SUMMARY) y confirma que el diagnóstico es correcto. El ROADMAP.md (línea 540) y el `14-07-SUMMARY.md` ya reflejan `status: gaps_found` en los hechos; **REQUIREMENTS.md marca POLISH-04 y POLISH-05 como `[x] Complete` en su tabla de Traceability, lo cual es inexacto** — ver nota en Requirements Coverage.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POLISH-04: botones de acción con ancho consistente app-wide, sin `w-full` no intencional en desktop | ⚠️ PARTIAL | Cumplido en los 5 archivos declarados por 14-01/14-02/14-03 (19+3 call-sites verificados por grep, `self-start`/`sm:w-auto` presentes). **2 gaps de cobertura en `settings-client.tsx` vista Equipo** (radiogroup de preselección + botones "+ Agregar"), no auditados por ningún plan de la fase. Confirmado leyendo el código (línea 1909-1940: `<div role="radiogroup">` hijo directo de `<Card className="p-6 space-y-4 mt-4">`, mismo patrón causa-2 sin corregir) y corroborado en la UAT real (14-07, puntos 6 y 7). |
| 2 | POLISH-05: el RiskBadge "Alto" se ve con relleno semántico de peligro también fuera del CRM, y pesa más que "Medio" en toda superficie | ✗ FAILED | El componente `risk-badge.tsx` está correctamente implementado (D-05/D-06/D-07: `bg-[var(--danger)]`, sin dot, un solo componente para los dos shells — verificado leyendo el archivo completo). Pero **dentro de los 4 ConfirmDialog del CRM**, "Alto" y "Medio" se ven del mismo color porque el `DialogPortal` (base-ui) monta fuera del `<div className="crm-shell">` de `app/(crm)/layout.tsx:47` — confirmado leyendo ambos archivos, independientemente del diagnóstico de la UAT. El criterio de aceptación de D-05 no se cumple en esa superficie. |
| 3 | POLISH-06: una serie de abono cancelada no muestra "Copiar link de baja", ni en la UI ni desde el endpoint | ✓ VERIFIED | `app/api/abonos/cancel-link/[id]/route.ts:76` tiene `.neq('status', 'cancelled')` sobre la query ya scopeada por `id`+`business_id` (gate server-side, D-09). El bloque de UI en `abonos-client.tsx` está envuelto en `a.status !== 'cancelled'` (D-08). UAT real (14-07, puntos 6-8) confirmó los dos endpoints (id real cancelado vs id inventado) devuelven cuerpo idéntico `{ ok: false, error: 'not_found' }` — indistinguible, cumpliendo el 404 genérico. Test de integración `test/abono-cancel-link.test.ts` (6 casos) con prueba de mutación documentada. |
| 4 | POLISH-07: un cliente recién creado sin turnos cae en "Nuevos", no en "Pausa" | ✓ VERIFIED | `lib/client-status.ts` implementa `classifyClient` con el guard `visits === 0 ⇒ 'new'` antes del chequeo de días (D-10), umbral unificado `PAUSED_AFTER_DAYS = 60` (D-11), consumido por `clients-client.tsx`. 11 tests unitarios (`test/client-status.test.ts`) cubren los bordes (60 exacto no es pausa, 61 sí). UAT real con datos sembrados confirmó en pantalla: cliente con 0 turnos cae en tab Nuevos con badge NUEVO (ficha #005), y un cliente con ~50 días sin venir cae en Activos, no en Pausa. |
| 5 | EXTRA-A: Canchas tiene tabs Activos/Desactivados con paridad de Servicios, vía componente compartido | ✓ VERIFIED | `components/dashboard/active-tabs.tsx` existe (132 líneas, `useActiveTabs`/`ActiveTabs`/`ActiveTabsEmptyState`), consumido por `settings-client.tsx` (Servicios, sin regresión — 9 `self-start` de 14-01 preservados) y `canchas-manager.tsx` (paridad: contadores reales, empty state por tab, tachado eliminado — D-15). UAT real (14-07, puntos 9-10) confirmó visualmente cero regresión en Servicios y paridad completa en Canchas. |
| 6 | EXTRA-B: el dueño puede eliminar definitivamente un abono archivado, con el gate autoritativo en la base (migración 066) | ✓ VERIFIED | `supabase/migrations/066_abono_delete_gate.sql` existe (trigger `BEFORE DELETE` que rechaza `status='active'` con `P0001`/`abono_is_active`). `abonos-client.tsx` tiene `deleteAbono()` (DELETE con RLS + `business_id`, sin service-role — grep=0) y el botón "Eliminar" gateado por `esArchivado`. Test de integración `test/abono-delete-gate.test.ts` (7 casos) con prueba de mutación. **Migración 066 aplicada en producción el 2026-08-06** con el rechazo del gate verificado en vivo contra la base real (`ERROR: P0001: abono_is_active`, dentro de una transacción abortada para no mutar datos) — evidencia documentada en 14-07-SUMMARY.md con el output literal de la consola SQL. |
| 7 | Cero impacto en el motor de reservas / constraints (nota de Security de la fase) | ✓ VERIFIED | Ningún plan de la fase toca `book_slot_atomic`, `createAppointmentCore`, constraints 011/013 ni RLS de tablas del motor. `git diff --stat` de cada plan confirma archivos acotados a UI/lib/una migración nueva aislada (066). |
| 8 | La fase produce un pipeline verde reproducible (tsc, build, tests) que no enmascara regresiones reales | ⚠️ PARTIAL | `tsc --noEmit` y `npm run build` en verde (confirmado por el contexto de ejecución del orquestador y consistente con los 6 SUMMARYs). `npx vitest run` → 887 tests, 7 fallan, confinados a `test/abono-{create,cron,generation}.test.ts`. Evidencia de que es flakiness pre-existente y no regresión de esta fase: (a) el conjunto de tests que falla cambia entre corridas (documentado de forma independiente y consistente en 14-01, 14-02, 14-03, 14-04, 14-05, 14-06 — 6 SUMMARYs distintos con el mismo patrón), (b) las suites dan verde corridas aisladas (14-03 lo reprodujo 3 veces seguidas: 95/95 + 1 expected fail), (c) 14-04 diagnosticó con y sin el trigger de la 066 (mismo resultado), (d) el baseline se documentó ANTES de la Task 3 de 14-01, previo a cualquier cambio de código de la fase. No se re-investiga por instrucción explícita del contexto de verificación — la evidencia documental ya es suficientemente cruzada. |

**Score:** 5/8 truths verified (2 parciales con gaps registrados, 1 nota de calidad de pipeline sin gap de código)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/crm/risk-badge.tsx` | Variante `alto` = pill relleno de peligro sin dot, un solo componente | ✓ VERIFIED (componente) / ✗ contexto de montaje falla | Código correcto; falla el contexto del Portal fuera de `.crm-shell` (no es un defecto del archivo) |
| `app/(dashboard)/settings/settings-client.tsx` | 9 `self-start` + POLISH-04 completo | ⚠️ PARCIAL | 9/9 `self-start` del inventario auditado presentes; el bloque Equipo (radiogroup + "+ Agregar") no fue auditado |
| `app/(dashboard)/agenda/agenda-client.tsx` | 4 `sm:w-auto` + 1 `self-start` | ✓ VERIFIED | Confirmado por SUMMARY con greps exactos (5/5 y 8/8 criterios de aceptación) |
| `components/dashboard/nuevo-turno-form.tsx`, `nuevo-abono-form.tsx` | 2 `sm:w-auto` cada uno | ✓ VERIFIED | Confirmado por SUMMARY |
| `lib/client-status.ts` | `classifyClient` + `PAUSED_AFTER_DAYS` | ✓ VERIFIED | Existe en disco; 11 tests unitarios pasan |
| `app/api/abonos/cancel-link/[id]/route.ts` | `.neq('status','cancelled')` | ✓ VERIFIED | Grep confirma línea 76 |
| `app/(dashboard)/abonos/abonos-client.tsx` | Gate UI + botón Eliminar + `deleteAbono` | ✓ VERIFIED | Grep confirma `deleteAbono`, `esArchivado`, `.eq('business_id'`, cero `service_role` |
| `components/dashboard/active-tabs.tsx` | Módulo compartido de tabs | ✓ VERIFIED | Existe en disco, consumido por Servicios y Canchas |
| `supabase/migrations/066_abono_delete_gate.sql` | Trigger `BEFORE DELETE` idempotente | ✓ VERIFIED | Existe en disco; aplicado en prod con evidencia de rechazo real |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `components/crm/risk-badge.tsx` | `app/globals.css` (`--danger`) | indirección de tokens | ✗ NOT_WIRED (dentro de Portal) | El componente consume el token correctamente, pero el Portal donde monta el ConfirmDialog no hereda el scope `.crm-shell` — el link semántico existe en el código pero no en el DOM renderizado |
| `app/(dashboard)/abonos/abonos-client.tsx` | `supabase/migrations/066...sql` | DELETE → trigger `abonos_block_delete_trg` | ✓ WIRED | Verificado en UAT real contra prod y contra local (7 tests de integración) |
| `app/api/abonos/cancel-link/[id]/route.ts` | UI de `abonos-client.tsx` | 404 genérico consumido por el detalle | ✓ WIRED | UAT confirmó cuerpos idénticos entre id cancelado e id inventado |
| `lib/client-status.ts` | `app/(dashboard)/clients/clients-client.tsx` | `classifyClient` importado y usado en `clientStats` | ✓ WIRED | UAT confirmó comportamiento con datos reales sembrados |

### Anti-Patterns Found

Ninguno de tipo `TBD`/`FIXME`/`XXX` sin referencia a follow-up en los archivos modificados por la fase. El único ítem "TODO-como" es el gap de cobertura POLISH-04 en Equipo, que ya está documentado y referenciado como plan `14-08` en el propio `14-07-SUMMARY.md` (no es un marcador de código huérfano).

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| POLISH-04 | 14-01, 14-02, 14-03 | ⚠️ PARCIAL (dentro de su alcance declarado) | Cumplido en los 5 archivos con `must_haves`; 2 gaps de cobertura fuera de ese alcance (Equipo) |
| POLISH-05 | 14-01 | ✗ NO CUMPLIDO en los 4 ConfirmDialog del CRM | Componente correcto, contexto de montaje roto — regresión de 14-01 |
| POLISH-06 | 14-03 | ✓ SATISFIED | Gate server + UI verificados |
| POLISH-07 | 14-02 | ✓ SATISFIED | Helper + UAT con datos reales |
| EXTRA-A (sin REQ-ID) | 14-05 | ✓ SATISFIED | Folded todo, fuera de REQUIREMENTS.md por diseño (documentado en 14-CONTEXT.md) |
| EXTRA-B (sin REQ-ID) | 14-04, 14-06 | ✓ SATISFIED | Folded todo, fuera de REQUIREMENTS.md por diseño; migración 066 en prod con rechazo verificado |

**⚠️ Inconsistencia documental detectada (no es un gap de código, es un gap de trazabilidad):** `REQUIREMENTS.md` (líneas 63-66, 108-111) marca `POLISH-04` y `POLISH-05` como `[x] Complete` en su checklist y en la tabla de Traceability. Esto es inexacto a la fecha de esta verificación: la propia evidencia primaria de la fase (`14-07-SUMMARY.md`, UAT real) declara POLISH-05 con una falla y POLISH-04 con 2 gaps de cobertura, y el `ROADMAP.md` (línea 540) ya lo refleja correctamente ("La fase NO está cerrada"). `REQUIREMENTS.md` no se actualizó tras la UAT — debe corregirse a `[ ]` / `Partial` para POLISH-04 y POLISH-05 cuando se cierre el plan 14-08, o dejarse así con una nota explícita si el criterio del proyecto es marcar por "plan ejecutado" en vez de "UAT aprobada". No se trata como gap de esta fase porque no es código, pero se deja registrado para que no quede una fuente de verdad contradictoria.

### Human Verification Required

Ninguno pendiente — la UAT humana bloqueante ya se corrió de verdad (14-07-SUMMARY.md, 23 observaciones transcritas contra datos sembrados en navegador), no fue auto-aprobada. Los 3 gaps que encontró ya están estructurados arriba como `gaps` de esta verificación.

### Gaps Summary

La fase entregó 6/6 ítems declarados con evidencia de código verificable independientemente (POLISH-06, POLISH-07, EXTRA-A, EXTRA-B con migración 066 en producción confirmada), pero **no alcanza el goal completo de la fase** por dos motivos, ambos ya identificados por el propio equipo de ejecución en la UAT real y priorizados en el plan `14-08` (no requiere ser "redescubierto", solo verificado — lo cual se hizo aquí de forma independiente contra el código):

1. **Regresión (BLOCKER):** POLISH-05 no se cumple dentro de los 4 `ConfirmDialog` del CRM — "Alto" y "Medio" son indistinguibles porque el `DialogPortal` de base-ui monta fuera del scope `.crm-shell`. Causa raíz confirmada leyendo `app/(crm)/layout.tsx:47` y `components/ui/dialog.tsx` de forma independiente al diagnóstico del SUMMARY.
2. **Gap de cobertura (WARNING):** POLISH-04 no llegó a 2 controles de la vista Equipo (radiogroup de preselección de profesional + botones "+ Agregar"), que viven en el mismo archivo (`settings-client.tsx`) que sí tocó 14-01, pero en una sección (bloque EXTRA-B de multi-staff, líneas ~1907-1940) que quedó fuera del inventario auditado en `14-PATTERNS.md`.

La flakiness de las 3 suites de abonos (`abono-create`, `abono-cron`, `abono-generation`) está fuera del alcance de esta fase: es pre-existente, documentada de forma cruzada por los 6 ejecutores de plan con evidencia consistente (conjunto de fallos que varía entre corridas, mismo comportamiento con y sin el trigger 066, baseline tomado antes de cualquier cambio de código de la fase). No se re-investiga.

---

*Verified: 2026-08-06*
*Verifier: Claude (gsd-verifier)*
