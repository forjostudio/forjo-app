---
phase: 14-cierre-de-backlog
verified: 2026-08-10T23:59:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/8
  gaps_closed:
    - "POLISH-05: el RiskBadge 'Alto' se ve con relleno semántico de peligro también fuera del CRM, y pesa más que 'Medio' en toda superficie — incluidos los 4 ConfirmDialog del CRM"
    - "POLISH-04: botones de acción con ancho consistente app-wide — cobertura completa en la vista Equipo (radiogroup de preselección + los 3 controles de alta auditados)"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 14: Cierre de backlog — Verification Report (re-verificación)

**Phase Goal:** Drenar el backlog chico de polish acumulado, sin impacto en el motor de reservas ni en los constraints: unificar el ancho de los botones de acción app-wide, que el `RiskBadge` "Alto" se vea con color fuera del CRM, que un abono cancelado deje de mostrar "Copiar link de baja", y que un cliente recién creado sin turnos caiga en el filtro "Nuevas" y no en "Pausa" — más EXTRA-A (tabs Activos/Desactivados en Canchas) y EXTRA-B (borrado definitivo de abono archivado, migración 066).

**Verified:** 2026-08-10
**Status:** passed
**Re-verification:** Sí — después del cierre de gaps de los planes 14-08 y 14-09

## Goal Achievement

La verificación anterior (commit `0fdd851`, 2026-08-06) encontró 3 gaps: **gap 1 (BLOCKER)** — regresión de POLISH-05 dentro de los 4 `ConfirmDialog` del CRM — y **gaps 2/3 (WARNING)** — cobertura de POLISH-04 en la vista Equipo. Esta re-verificación confirma, de forma independiente contra el código y el historial de commits (no contra la narrativa de los SUMMARY), que los 3 gaps están cerrados.

### Gaps cerrados — verificación independiente

**Gap 1 (BLOCKER, POLISH-05).** Leí `lib/shell-scope.ts`, `components/ui/shell-scope.tsx`, `components/ui/dialog.tsx` y `app/(crm)/layout.tsx` completos. El mecanismo declarado por `14-08-SUMMARY.md` existe tal cual se describe: `CRM_SHELL_CLASS = 'dark crm-shell'` es la fuente única (el wrapper del layout la consume vía `cn(CRM_SHELL_CLASS, ...)` y el `ShellScopeProvider` la propaga); `DialogContent` invoca `useShellScope()` y aplica `portalScopeClass(shellScope)` como primer argumento del `cn()` del `Popup`, **antes** que el `className` del caller; `portalScopeClass(undefined)` devuelve `undefined` (la garantía anti-fuga). `grep -rln "ShellScopeProvider" app components` da exactamente 2 archivos (definición + único montaje). `risk-badge.tsx` no fue tocado y sigue resolviendo `alto` por `var(--danger)` y `medio` por `bg-primary` — dos tokens distintos, la premisa que hace que el fix del portal alcance. Corrí `./node_modules/.bin/vitest run test/shell-scope.test.ts` de forma independiente: **12/12 passed**, incluida la prueba de cableado que falla si `portalScopeClass(` se borra del `cn()` del Popup (mutación documentada y verificada en el SUMMARY). El cierre final de este gap es **visual** — no hay aserción de código que pruebe que dos chips se ven de colores distintos — y la evidencia es la observación 1 del checkpoint humano de `14-09-SUMMARY.md`: *"OK" (observado con captura: modal del CRM sobre fondo oscuro, chip "Alto" en rojo y botón "Cambiar plan" en amarillo — se distinguen a simple vista)*. Es evidencia válida para un criterio que por definición no se puede verificar con grep.

**Gaps 2 y 3 (WARNING, POLISH-04 en Equipo).** Leí `app/(dashboard)/settings/settings-client.tsx` línea por línea en la zona de Equipo. El `<div role="radiogroup" aria-label="Preselección del profesional">` (línea 1932) ya no es hijo directo estirado de un `<Card>`: el `className` es `flex w-full flex-col gap-1 rounded-md border border-border p-1 sm:inline-flex sm:w-auto sm:flex-row sm:flex-wrap sm:self-start` — mobile-first con `sm:self-start` para desestirar en desktop (decisión del dueño en la UAT: en mobile queda un segmentado a ancho completo deliberado, no un estirón accidental). Los 3 controles de alta de Equipo quedaron auditados con veredicto en la tabla de `14-09-SUMMARY.md`: el botón de alta de profesional y el de alta de espacio se confirmaron correctos por layout (contenedor de bloque / `items-end` con alturas iguales); el enlace "+ Datos de contacto (opcional)" resultó ser el único defecto real, y en vez de parchearlo se eliminó — Teléfono y Email quedan siempre visibles (confirmado leyendo `ProFields`, que ya no tiene ninguna rama condicional: los dos `<Input>` se renderizan sin gate). Los 9 `<Button className="self-start">` de 14-01 y los 2 `<ActiveTabs` de 14-05 siguen intactos (`grep -cE '<Button[^>]*className="self-start"'` = 9, `grep -cE '<ActiveTabs'` = 2). Evidencia visual: observaciones 5, 6 y 7 del checkpoint de `14-09-SUMMARY.md`, con la segunda ronda de re-observación tras las correcciones ("Aprobado todo. Aplica el min-h11").

**Desviación de alcance registrada (no es un gap):** durante el checkpoint humano de 14-09 (punto 3), el dueño reportó un tercer defecto no previsto — el confirmar destructivo de los diálogos de abono tomaba el color del badge de riesgo en vez del primario del tema — y arbitró la corrección: `confirmButtonClass(destructive, shellScope)` ahora condiciona la superficie de peligro a la presencia de un shell activo. Toca 3 archivos fuera de `files_modified` del plan 14-09 (`components/crm/confirm-dialog.tsx`, `confirm-dialog.test.tsx`, `components/crm/maintenance-toggle.tsx`). El plan autorizaba explícitamente esto ("el árbitro final es el checkpoint humano"), y el reparto final —5 `ConfirmDialog` del panel al primario del tema, 10 del CRM conservan `--danger`— lo verifiqué de forma independiente: `grep -rn "<ConfirmDialog" app components --include=*.tsx` da 15 en total, con el desglose por archivo exacto que declara el SUMMARY (`ficha-client.tsx` ×7, `pipeline-client.tsx` ×1, `abonos-client.tsx` ×2, `settings-client.tsx` ×2, `maintenance-toggle.tsx` ×1, `plan-price-card.tsx` ×1, `canchas-manager.tsx` ×1).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | POLISH-04: botones de acción con ancho consistente app-wide, sin `w-full` no intencional en desktop — TODA la superficie, incluida Equipo | ✓ VERIFIED | 9/9 `self-start` de 14-01 intactos + 3/3 `sm:w-auto` de Agenda/formularios intactos + gap 2 (radiogroup de Equipo, `sm:self-start`) y gap 3 (3 controles de alta auditados, 1 defecto real corregido) cerrados. Confirmado por lectura de código y por las observaciones 5, 6, 7 del checkpoint humano de 14-09. |
| 2 | POLISH-05: el RiskBadge "Alto" se ve con relleno semántico de peligro también fuera del CRM, y pesa más que "Medio" en toda superficie, incluidos los 4 ConfirmDialog del CRM | ✓ VERIFIED | Mecanismo de scope portaleado (`lib/shell-scope.ts` + `ShellScopeProvider` + `DialogContent`) leído completo y consistente con lo declarado; 12/12 tests de `test/shell-scope.test.ts` corridos de forma independiente, incluida la prueba de cableado con mutación documentada. Cierre visual: observación 1 del checkpoint humano de 14-09 ("Alto" en rojo, "Medio" en amarillo, distinguibles) — única evidencia admisible para un criterio de color. |
| 3 | POLISH-06: una serie de abono cancelada no muestra "Copiar link de baja", ni en la UI ni desde el endpoint | ✓ VERIFIED | Sin cambios desde la verificación previa. `app/api/abonos/cancel-link/[id]/route.ts:76` conserva `.neq('status', 'cancelled')`. Regresión chequeada: la línea sigue presente. |
| 4 | POLISH-07: un cliente recién creado sin turnos cae en "Nuevos", no en "Pausa" | ✓ VERIFIED | Sin cambios desde la verificación previa. `lib/client-status.ts` conserva el guard `visits <= 0 ⇒ 'new'` **antes** del chequeo de `daysSinceLast > PAUSED_AFTER_DAYS` (60), leído línea por línea. |
| 5 | EXTRA-A: Canchas tiene tabs Activos/Desactivados con paridad de Servicios, vía componente compartido | ✓ VERIFIED | Sin cambios desde la verificación previa. `components/dashboard/active-tabs.tsx` sigue consumido por `settings-client.tsx` y `canchas-manager.tsx` (regresión chequeada: 2 `<ActiveTabs` en settings-client.tsx, intactos tras 14-09). |
| 6 | EXTRA-B: el dueño puede eliminar definitivamente un abono archivado, con el gate autoritativo en la base (migración 066) | ✓ VERIFIED | Sin cambios desde la verificación previa. `supabase/migrations/066_abono_delete_gate.sql` existe; `deleteAbono()` y `esArchivado` presentes en `abonos-client.tsx`. Migración ya aplicada en prod (documentado en 14-07). |
| 7 | Cero impacto en el motor de reservas / constraints | ✓ VERIFIED | Los planes 14-08 y 14-09 tocan exclusivamente `lib/shell-scope.ts`, `components/ui/{shell-scope,dialog}.tsx`, `app/(crm)/layout.tsx`, `components/crm/{confirm-dialog,maintenance-toggle}.tsx`, `settings-client.tsx` y documentos de planificación. Ninguno toca `book_slot_atomic`, `createAppointmentCore`, constraints 011/013 ni RLS del motor. |
| 8 | Trazabilidad consistente: REQUIREMENTS.md, ROADMAP.md y esta verificación dicen lo mismo sobre POLISH-04/05 | ✓ VERIFIED | `REQUIREMENTS.md` líneas 63-64 marcan POLISH-04/05 con `[x]`, y la tabla de Traceability (líneas 108-111) marca las 4 filas de la fase `Complete`. `ROADMAP.md` §Phase 14 (línea 540) declara la fase cerrada con la evidencia de 14-08/14-09. La inconsistencia que registró la verificación anterior queda cerrada. |

**Score:** 8/8 truths verified (2 cerrados en esta re-verificación, 6 confirmados sin regresión)

### Hallazgo menor, no bloqueante (documentación)

`ROADMAP.md` línea 59 (la lista `## Phases` de nivel milestone, fuera de la sección de detalle de Phase 14) todavía dice `- [ ] **Phase 14: Cierre de backlog** - ...` sin el sufijo `(completed ...)` que sí llevan las Phases 1-13. La sección de detalle (línea 521-567) sí está actualizada y es correcta ("Fase **cerrada**"). El plan 14-09 acotó su diff a la sección `Cierre de backlog (polish)` de REQUIREMENTS.md y a la sección de detalle de Phase 14 en ROADMAP.md (criterio de aceptación: `git diff --stat` ≤ 20 líneas) — la lista de overview de nivel milestone quedó fuera de ese alcance. No afecta ningún success criteria de la fase ni la trazabilidad de requisitos (que sí es consistente). Se deja registrado para que `/gsd:complete-milestone` no lo herede como una discrepancia nueva.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/shell-scope.ts` | `CRM_SHELL_CLASS` + `portalScopeClass()` | ✓ VERIFIED | Leído completo; sin directiva de cliente (importable desde Server Component); comentario de causa raíz presente |
| `components/ui/shell-scope.tsx` | `ShellScopeProvider` / `useShellScope`, default `''` | ✓ VERIFIED | Leído completo; molde de `DrawerPortalContainerContext` respetado |
| `components/ui/dialog.tsx` | `DialogContent` consume `useShellScope()` + `portalScopeClass()` sobre el Popup | ✓ VERIFIED | Leído completo; aplicado como primer argumento del `cn()`, antes del `className` del caller |
| `app/(crm)/layout.tsx` | usa `CRM_SHELL_CLASS` + monta `ShellScopeProvider` | ✓ VERIFIED | Leído completo; wrapper y proveedor sobre la misma constante |
| `test/shell-scope.test.ts` | suite de regresión con prueba de mutación | ✓ VERIFIED | 12/12 tests pasan (corrida independiente) |
| `components/crm/risk-badge.tsx` | intacto, D-05/D-06/D-07 | ✓ VERIFIED | Sin cambios; `alto` → `var(--danger)`, `medio` → `bg-primary`, sin token de shell nombrado |
| `components/crm/confirm-dialog.tsx` | `confirmButtonClass(destructive, shellScope)` | ✓ VERIFIED | Firma nueva presente; consumida en `ConfirmDialog` y en `maintenance-toggle.tsx` |
| `app/(dashboard)/settings/settings-client.tsx` | radiogroup de Equipo desestirado + Teléfono/Email siempre visibles | ✓ VERIFIED | `sm:self-start` presente; `ProFields` sin gate condicional |
| `app/api/abonos/cancel-link/[id]/route.ts` | `.neq('status','cancelled')` | ✓ VERIFIED | Línea 76, sin cambios |
| `lib/client-status.ts` | `classifyClient` + `PAUSED_AFTER_DAYS` | ✓ VERIFIED | Sin cambios, guard de `visits<=0` primero |
| `components/dashboard/active-tabs.tsx` | módulo compartido de tabs | ✓ VERIFIED | Sin cambios, 2 consumidores intactos |
| `supabase/migrations/066_abono_delete_gate.sql` | trigger `BEFORE DELETE` | ✓ VERIFIED | Sin cambios, aplicado en prod |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `components/ui/dialog.tsx` (`DialogContent`) | `lib/shell-scope.ts` | `portalScopeClass()` sobre el `className` del Popup | ✓ WIRED | Verificado leyendo el archivo; test de cableado con prueba de mutación pasa |
| `components/ui/dialog.tsx` | `components/ui/shell-scope.tsx` | `useShellScope()` | ✓ WIRED | Confirmado |
| `app/(crm)/layout.tsx` | `lib/shell-scope.ts` + `components/ui/shell-scope.tsx` | `CRM_SHELL_CLASS` en el wrapper + `ShellScopeProvider` montado | ✓ WIRED | El wrapper y el proveedor consumen la misma constante — no pueden divergir |
| `components/crm/confirm-dialog.tsx` | `lib/shell-scope.ts` | `portalScopeClass(shellScope)` dentro de `confirmButtonClass()` | ✓ WIRED | Misma función que decide el scope del popup — las dos superficies no divergen por construcción |
| `app/(dashboard)/equipo/page.tsx` | `settings-client.tsx` (`view="equipo"`) | render de la vista Equipo | ✓ WIRED | Confirmado (sin cambios respecto a la verificación previa) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite de regresión del scope portaleado, con prueba de mutación | `./node_modules/.bin/vitest run test/shell-scope.test.ts` | 12 passed (12) | ✓ PASS |
| Suite de `ConfirmDialog` (cobertura de `confirmButtonClass` nueva) | `./node_modules/.bin/vitest run components/crm/confirm-dialog.test.tsx` | 14 passed (14) | ✓ PASS |
| `tsc --noEmit` y `npm run build` | (ya verificados por el orquestador de forma independiente antes de esta corrida, per contexto de la tarea) | exit 0 / exit 0 | ✓ PASS (no re-ejecutado en esta corrida por instrucción explícita del contexto) |
| Suite completa de Vitest | **No se corre** — degradación de entorno documentada de forma cruzada por 8 SUMMARYs de la fase (Supabase local con 3 stacks levantados, latencia de segundos en el root). No es un gate útil en esta máquina; no aporta evidencia nueva. | — | — SKIPPED (entorno, no código) |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| POLISH-04 | 14-01, 14-02, 14-03, 14-09 | ✓ SATISFIED | Cobertura completa app-wide, incluida Equipo (gaps 2/3 cerrados) |
| POLISH-05 | 14-01, 14-08, 14-09 | ✓ SATISFIED | Causa raíz cerrada (scope portaleado) + evidencia visual del checkpoint humano |
| POLISH-06 | 14-03 | ✓ SATISFIED | Sin cambios, gate server + UI verificados |
| POLISH-07 | 14-02 | ✓ SATISFIED | Sin cambios, helper + UAT con datos reales |
| EXTRA-A (sin REQ-ID) | 14-05 | ✓ SATISFIED | Sin cambios |
| EXTRA-B (sin REQ-ID) | 14-04, 14-06 | ✓ SATISFIED | Sin cambios, migración 066 en prod |

Ningún requisito huérfano: los 4 IDs de la sección "Cierre de backlog (polish)" de `REQUIREMENTS.md` (POLISH-04..07) están declarados en al menos un plan de la fase, y todo `requirements:` de los 9 planes mapea a un ID real de esa sección (o a EXTRA-A/EXTRA-B, fuera de REQUIREMENTS.md por diseño documentado).

### Anti-Patterns Found

Ninguno de tipo `TBD`/`FIXME`/`XXX` en los archivos tocados por 14-08 y 14-09 (`lib/shell-scope.ts`, `components/ui/shell-scope.tsx`, `components/ui/dialog.tsx`, `app/(crm)/layout.tsx`, `settings-client.tsx`, `confirm-dialog.tsx`, `confirm-dialog.test.tsx`, `maintenance-toggle.tsx`, `test/shell-scope.test.ts`) — grep vacío. El único ítem "TODO-como" es la línea 59 del `ROADMAP.md` (nota arriba), que es staleness documental, no un marcador de código.

### Human Verification Required

Ninguno pendiente. La UAT humana bloqueante de 14-09 ya se corrió de verdad — 7 observaciones transcritas con las palabras del dueño, 3 defectos reportados en la primera ronda y corregidos, segunda ronda de re-observación aprobada ("Aprobado todo. Aplica el min-h11"). No fue auto-aprobada por `auto_advance`: las observaciones tienen contenido específico (colores, anchos en px, descripciones de defectos), no solo la palabra "aprobado".

### Gaps Summary

No quedan gaps abiertos. Los 3 gaps de la verificación anterior (1 BLOCKER + 2 WARNING) están cerrados con evidencia de código verificada de forma independiente en esta corrida (lectura completa de los 5 archivos que tocó 14-08 + los 4 que tocó 14-09, más 26/26 tests corridos por este verifier, no solo citados de un SUMMARY) y con evidencia visual humana transcrita para el único criterio que no admite aserción de código (POLISH-05). La fase alcanza su goal completo: los 4 requisitos de polish (POLISH-04..07) están satisfechos app-wide, las 2 extensiones (EXTRA-A, EXTRA-B) están entregadas y verificadas en producción donde corresponde (migración 066), y no hay impacto en el motor de reservas ni en sus constraints. El único hallazgo es documental y no bloqueante (línea 59 de ROADMAP.md, overview de milestone sin el sufijo de completado).

---

*Verified: 2026-08-10*
*Verifier: Claude (gsd-verifier)*
