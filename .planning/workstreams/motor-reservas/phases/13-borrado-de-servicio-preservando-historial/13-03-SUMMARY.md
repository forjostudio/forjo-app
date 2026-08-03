---
phase: 13-borrado-de-servicio-preservando-historial
plan: 03
subsystem: ui
tags: [react, nextjs, supabase, postgrest, dialog, multi-tenant, error-mapping, tabs]

requires:
  - phase: 13-01
    provides: "services_block_delete_trg (P0001 + los dos messages de dominio) y los FKs en SET NULL"
provides:
  - "ConfirmDialog con footer de dos estados: props aditivas secondaryAction / hideConfirm / onConfirmError"
  - "computeFooterLayout(input) — helper puro exportado de components/crm/confirm-dialog.tsx"
  - "openDeleteService(s) — pre-check de turnos futuros / abono activo / historial (D-11, D-13)"
  - "deleteService(id) devuelve discriminado { ok } | { ok:false, error } y mapea P0001/23503"
  - "toggleService(id, active) con filtro por business_id, error real y toast (T-13-15)"
  - "Tabs Activos/Desactivados con contador en la sección Servicios de Ajustes (D-14)"
  - "deleteCancha reconoce el rechazo P0001 del trigger y lo mapea a has_appointments (T-13-21)"
affects:
  - "13-04 (tests: los códigos de dominio has_future_appointments / has_active_abono y el pre-check)"
  - "13-05 (aplicación de la 065 a prod: hasta entonces el gate no existe y el modal nunca bloquea)"

tech-stack:
  added: []
  patterns:
    - "Diálogo de dos estados sobre UN solo ConfirmDialog: el estado lo decide el pre-check, no un segundo componente"
    - "Pre-check de cliente como UX/refuerzo + gate autoritativo en la DB (el modal nunca autoriza)"
    - "onConfirm LANZA ante rechazo tardío: ConfirmDialog cierra si no lanza, y el rechazo se tragaría en silencio"
    - "`.or('status.is.null,status.neq.cancelled')` = equivalente PostgREST de `IS DISTINCT FROM 'cancelled'`"
    - "DELETE con `.select('id')`: 0 filas sin error = la RLS filtró, NO es éxito"

key-files:
  created: []
  modified:
    - components/crm/confirm-dialog.tsx
    - components/crm/confirm-dialog.test.tsx
    - app/(dashboard)/settings/settings-client.tsx
    - lib/canchas.ts

key-decisions:
  - "El botón secundario asciende a variant 'default' solo cuando el confirmar está oculto: si no, el footer bloqueado quedaría con dos outline y ninguna acción evidente"
  - "onConfirm hace `await openDeleteService(...)` ANTES de lanzar: cuando aparece el toast de error el modal ya está en estado bloqueado con los números nuevos, sin parpadeo intermedio"
  - "El pre-check corre las 3 queries en Promise.all (el plan pedía tres queries, no su orden): un solo round-trip percibido"
  - "Pluralización real en el copy ('1 turno reservado' / 'N turnos reservados') en vez del literal 'turno(s)' del plan"
  - "El tacho ganó aria-label={`Eliminar ${s.name}`}: el botón es solo un icono y el de editar (hermano) ya lo tenía"

patterns-established:
  - "Props aditivas al ConfirmDialog: cada una documentada con JSDoc que explica que quien no la pasa conserva el comportamiento previo (molde minReasonLength)"
  - "Filtro por tabs: el MISMO predicado alimenta la lista y el contador (molde /abonos)"

requirements-completed: [HIST-01, HIST-02]

duration: 20min
completed: 2026-08-03
status: complete
---

# Phase 13 Plan 03: UX del borrado de servicio — modal de dos estados, tabs y mapeo del gate — Summary

**El tacho de un servicio ahora abre un modal que anticipa el resultado con números reales, ofrece "Desactivar" ejecutable cuando la DB va a rechazar, y los desactivados viven en su propio tab con contador.**

## Performance

- **Duración:** ~20 min
- **Tareas:** 3 (la 1 en TDD → 2 commits)
- **Archivos modificados:** 4
- **Commits:** 4

## Lo que se construyó

| Pieza | Dónde | Qué hace |
|-------|-------|----------|
| 3 props aditivas + `computeFooterLayout` | `components/crm/confirm-dialog.tsx` | El footer pasa a tener tres formas posibles sin que ningún call-site existente cambie |
| `openDeleteService` + `delInfo` | `settings-client.tsx` | Pre-check: turnos futuros, fecha del próximo, abono activo, total histórico |
| `delBlocked` + `delDescription` | `settings-client.tsx` | Los tres estados del copy, derivados FUERA del JSX |
| `deleteService` discriminado | `settings-client.tsx` | Mapea `P0001` (dos messages) y `23503`; detecta el DELETE filtrado por RLS |
| `toggleService` endurecido | `settings-client.tsx` | `business_id` + error real + toast (pasó a ser acción primaria del modal) |
| Tabs Activos/Desactivados | `settings-client.tsx` | Molde literal de `/abonos`, con empty state por tab |
| Mapeo `P0001` | `lib/canchas.ts` | El rechazo del trigger nuevo deja de caer en el toast genérico de canchas |

## Copy final de los tres estados del modal (literal)

**1. Contando (`delInfo === null`)** — footer solo con "Cancelar":

```
Vas a eliminar "Corte". Verificando turnos…
```

**2. Bloqueado (`future > 0 || activeAbono`)** — sin botón "Eliminar", con "Desactivar" como primario:

```
"Corte" tiene 3 turnos reservados a partir del 5/8. Desactivalo para dejar de ofrecerlo y conservar el historial.
```

Con abono activo además de los turnos, la frase suma ` y un abono activo` antes del punto:

```
"Corte" tiene 3 turnos reservados a partir del 5/8 y un abono activo. Desactivalo para dejar de ofrecerlo y conservar el historial.
```

Con abono activo y CERO turnos futuros, la frase arranca por el abono:

```
"Corte" tiene un abono activo. Desactivalo para dejar de ofrecerlo y conservar el historial.
```

Con un solo turno futuro la pluralización cambia: `tiene 1 turno reservado a partir del 5/8`. Si por algún motivo el conteo es > 0 pero no volvió la fecha del próximo turno, el fragmento ` a partir del d/M` simplemente no aparece.

**3. Confirmable (`future === 0 && !activeAbono`)** — con "Eliminar" destructivo:

```
Vas a eliminar "Corte". Se conservan sus 42 turnos en el historial (Finanzas y ficha del cliente) con su nombre y su precio. Esta acción no se puede deshacer.
```

Con un solo turno en el historial: `Se conservan sus 1 turno en el historial…`.

**Toasts del rechazo tardío** (`onConfirmError`, cuando alguien reserva entre el pre-check y el confirm):

```
No se puede eliminar: quedaron turnos futuros reservados. Desactivalo para dejar de ofrecerlo y conservar el historial.
No se puede eliminar: el servicio tiene un abono activo. Desactivalo para dejar de ofrecerlo y conservar el historial.
No se pudo eliminar el servicio
```

**Empty states de los tabs:**

```
Activos      → "Todavía no tenés servicios activos" / "Agregá el primero acá abajo para empezar a recibir reservas."
Desactivados → "No hay servicios desactivados" / "Acá van a aparecer los que dejes de ofrecer: se conservan con todo su historial y los podés volver a activar cuando quieras."
```

## Tareas completadas

| Tarea | Nombre | Commit | Tipo |
|-------|--------|--------|------|
| 1 (RED) | Tests de `computeFooterLayout` (4 casos) | `320fd15` | test |
| 1 (GREEN) | `ConfirmDialog` con las 3 props aditivas | `e4676a5` | feat |
| 2 | Pre-check, modal de dos estados, `deleteService` discriminado, `toggleService` endurecido | `db57a75` | feat |
| 3 | Tabs Activos/Desactivados + mapeo `P0001` en `deleteCancha` | `a24118a` | feat |

## Verificación

| # | Criterio del plan | Resultado |
|---|-------------------|-----------|
| 1 | `npx vitest run components/crm/confirm-dialog.test.tsx` | **12/12** (8 preexistentes + 4 nuevos) |
| 2 | `./node_modules/.bin/tsc --noEmit` | **exit 0** — los ~10 call-sites de `ConfirmDialog` compilan sin cambios |
| 3 | `npm run lint` | Ver "Desviaciones" — baseline del repo, no alcanzable; lint verificado sobre los archivos tocados |
| 4 | Suite completa | **812 passed, 1 skipped, 3 failed** — las 3 son el baseline conocido |
| 5 | `git diff --name-only` lista exactamente los 4 archivos del plan | OK |

Criterios de aceptación por grep:

| Patrón | Archivo | Esperado | Real |
|--------|---------|----------|------|
| `secondaryAction` | confirm-dialog.tsx | >= 3 | 6 |
| `hideConfirm` | confirm-dialog.tsx | >= 3 | 5 |
| `onConfirmError` | confirm-dialog.tsx | >= 3 | 3 |
| `export function computeFooterLayout` | confirm-dialog.tsx | 1 | 1 |
| `computeFooterLayout` | confirm-dialog.test.tsx | >= 1 | 6 |
| diff de confirm-dialog.tsx | — | < 70 líneas | **65** (48 ins / 17 del) |
| `openDeleteService` | settings-client.tsx | >= 2 | 3 |
| `status.is.null,status.neq.cancelled` | settings-client.tsx | 1 | 1 |
| `America/Argentina/Buenos_Aires` | settings-client.tsx | >= 1 | 1 |
| `service_has_future_appointments` | settings-client.tsx | 1 | 1 |
| `service_has_active_abono` | settings-client.tsx | 1 | 1 |
| `secondaryAction` / `hideConfirm` / `onConfirmError` | settings-client.tsx | 1 c/u | 1 / 1 / 1 |
| `grep -A3 "async function toggleService"` contiene `.eq('business_id', business.id)` | settings-client.tsx | sí | sí (línea +1) |
| `grep -A6 "async function toggleService"` contiene `if (error)` | settings-client.tsx | sí | sí (línea +2) |
| `grep -A8 "async function deleteService"` contiene `.select('id')` | settings-client.tsx | sí | sí (línea +1) |
| `SERVICE_TABS` | settings-client.tsx | >= 2 | 2 |
| `visibleServices` | settings-client.tsx | >= 2 | 3 |
| `aria-pressed` | settings-client.tsx | >= 1 | 7 |
| clases exactas de la píldora de `/abonos` | settings-client.tsx | 1 | 1 |
| tachado condicional del nombre | settings-client.tsx | 0 | 0 |
| `P0001` | lib/canchas.ts | >= 1 | 2 |
| `service_has_future_appointments\|service_has_active_abono` | lib/canchas.ts | >= 1 | 1 |
| `'has_appointments'` | lib/canchas.ts | >= 2 | 5 |
| `git diff components/dashboard/canchas-manager.tsx` | — | vacío | vacío |

**Toasts de sede y profesional: intactos.** El `git diff` de `settings-client.tsx` no toca ninguna línea con el copy de sede (~886 original) ni de profesional (~715): verificado filtrando el diff por esos términos, sin resultados. Se movieron de número de línea por las inserciones de arriba, nada más.

## Regresión de la suite

`npx vitest run` completo: **812 passed · 1 skipped · 3 failed (64 archivos)**.

Las 3 fallas viven íntegramente en `test/abono-create.test.ts`, `test/abono-cron.test.ts` y `test/abono-generation.test.ts` — el baseline intermitente conocido del repo (contaminación entre archivos contra la DB local compartida, preexistente desde v0.24). Verificado en esta misma corrida: `npx vitest run test/abono-create.test.ts test/abono-cron.test.ts test/abono-generation.test.ts --no-file-parallelism` → **34/34 pass**. Ninguna falla nueva fuera de ese trío, que es lo que contaría como regresión de este plan.

## Desviaciones del plan

### Ajustes de forma (ninguno cambia comportamiento)

**1. [Forma] La densidad de comentarios de `confirm-dialog.tsx` se recortó para respetar el techo de diff.**
Con los JSDoc completos y el botón de confirmar re-indentado en su bloque condicional, `git diff --stat` daba **96** líneas, por encima del techo de 70 que fija el criterio de aceptación del Task 1. Se comprimieron los tres JSDoc a 3 líneas, la firma de `computeFooterLayout` a una forma densa, y el ternario de loading del botón confirmar a una sola línea (idiomático en este repo: `settings-client.tsx` y `abonos-client.tsx` están llenos de JSX denso). Quedó en **65**. Ninguna semántica cambió: 12/12 tests y `tsc` exit 0.

**2. [Forma] El comentario del filtro de estado no repite el literal `.or('status.is.null,status.neq.cancelled')`.**
El criterio de aceptación exige `grep -c` exactamente 1 sobre ese literal, y el plan además pide dejarlo comentado en español. Se redactó el comentario refiriéndose al `.or(...)` de la línea siguiente en vez de transcribirlo: la explicación (y la advertencia de por qué NO usar `.neq` a secas) está completa, y el conteo da 1.

**3. [Forma] `npm run lint` exit 0 no es alcanzable en este repo.**
El baseline tiene ~468 errores de `react-compiler` en archivos que esta fase no toca. En `settings-client.tsx` hay **10 errores preexistentes** (líneas 327, 341, 349×2, 350×2, 362, 371, 495, 701 — `set-state-in-effect`, `immutability`, `purity`), todos en código anterior a este plan y ninguno en las regiones tocadas. Verificación aplicada en su lugar: `npx eslint` sobre los tres archivos modificados → `confirm-dialog.tsx` **exit 0**, `lib/canchas.ts` **exit 0**, `settings-client.tsx` con exactamente esos 10 errores de baseline y **cero hallazgos nuevos** (el único warning que sí introduje —`useMemo` importado sin usar tras el Task 2— quedó resuelto al consumirlo en el Task 3).

### Endurecimientos y mejoras de copy dentro del alcance

**4. [Rule 2 - Missing Critical] `aria-label` en el botón del tacho.**
- **Encontrado en:** Task 2, al cablear el tacho a `openDeleteService`.
- **Problema:** el botón es solo un icono (`Trash2`) sin texto accesible; su hermano de editar ya tenía `aria-label={`Editar ${s.name}`}`.
- **Fix:** `aria-label={`Eliminar ${s.name}`}`, mismo molde.
- **Commit:** `db57a75`.

**5. [Forma] Pluralización real en vez del literal "turno(s)".**
El plan escribe el copy como `N turno(s) reservado(s)`. Se implementó la forma correcta (`1 turno reservado` / `3 turnos reservados`, y `1 turno` / `42 turnos` en el estado confirmable): es el mismo mensaje, mejor escrito, y el proyecto trata el copy de cara al dueño como load-bearing.

---

**Total desviaciones:** 5 (3 de forma, 1 endurecimiento Rule 2, 1 de copy). **Sin scope creep:** no se tocó ningún archivo fuera de los 4 del plan.

## Notas de seguridad (threat model del plan)

| Threat | Estado |
|--------|--------|
| T-13-15 (EoP: `toggleService` sin tenant) | **Cerrado** — `.eq('business_id', business.id)` + `if (error)` antes de mutar el estado local |
| T-13-16 (ID: queries del pre-check) | **Cerrado** — las 3 filtran por `business_id` además de `service_id` |
| T-13-17 (Tampering: saltear el modal) | **Mitigado por diseño** — el gate autoritativo es el trigger; comentado explícitamente sobre `openDeleteService` |
| T-13-18 (Spoofing: DELETE filtrado por RLS) | **Cerrado** — `.select('id')` + `data.length === 0` ⇒ `{ ok: false, error: 'unknown' }` |
| T-13-19 (Repudiation: rechazo tardío en silencio) | **Cerrado** — discriminado + `throw` en `onConfirm` + `onConfirmError` con el motivo real |
| T-13-20 (ID: conteo y fecha en el modal) | **Accept** — datos del propio tenant, es literalmente lo que pide D-13 |
| T-13-21 (DoS UX: `P0001` al toast genérico de canchas) | **Cerrado** — `deleteCancha` mapea `P0001` + los dos messages a `has_appointments` |
| T-13-SC (paquetes) | **Accept** — cero instalaciones |

Sin superficie de seguridad nueva fuera del `<threat_model>` del plan.

## Notas para la próxima etapa

- **El modal NO bloquea en producción todavía.** El gate es el trigger de la migración 065, que sigue sin aplicarse en prod (última aplicada: 064). Hasta el plan **13-05**, en prod el pre-check informa pero el DELETE lo rechazaría el FK viejo (`23503`), que el mapeo ya cubre como `has_future_appointments`.
- **13-04** puede asertar contra los códigos de dominio `has_future_appointments` / `has_active_abono` y contra la semántica del pre-check (el caso `status = NULL` es el que separa el `.or(...)` del `.neq(...)`).
- **UAT visual pendiente:** los tres estados del modal y los dos tabs no se abrieron en el navegador en esta corrida (no hay entorno de render en tests: el repo corre vitest en `environment: 'node'`).
- El `line-through` condicional se quitó SOLO del nombre del servicio. El de sedes (`loc.is_active === false && 'line-through …'`) sigue igual: sedes no ganaron tabs en esta fase (diferido explícito de D-14).

## Self-Check: PASSED

- `.planning/workstreams/motor-reservas/phases/13-borrado-de-servicio-preservando-historial/13-03-SUMMARY.md` — FOUND
- `components/crm/confirm-dialog.tsx` — FOUND (modificado)
- `components/crm/confirm-dialog.test.tsx` — FOUND (modificado)
- `app/(dashboard)/settings/settings-client.tsx` — FOUND (modificado)
- `lib/canchas.ts` — FOUND (modificado)
- Commit `320fd15` — FOUND
- Commit `e4676a5` — FOUND
- Commit `db57a75` — FOUND
- Commit `a24118a` — FOUND

---
*Phase: 13-borrado-de-servicio-preservando-historial*
*Completado: 2026-08-03*
