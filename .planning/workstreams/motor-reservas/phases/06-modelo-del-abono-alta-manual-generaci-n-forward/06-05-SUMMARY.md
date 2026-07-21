---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 05
subsystem: ui
tags: [typescript, react-19, next-16, tailwind-v4, shadcn, vaul, abonos, dashboard, multi-tenant, rls]

# Dependency graph
requires:
  - phase: 06-01-modelo-del-abono
    provides: "migración 054 (tabla abonos + appointments.abono_id + businesses.abono_window_weeks, RLS owner-only) + tipos Abono/Appointment.abono_id"
  - phase: 06-03-alta-manual
    provides: "POST /api/abonos/create (auth por owner_id, anti-tampering por business_id, primera tanda + persistencia de generated_until/skipped_occurrences)"
  - phase: 06-04-cron-extension-ventana
    provides: "extendAbonoWindows() — la ventana que este plan hace configurable desde la UI"
provides:
  - "Sección /abonos del panel: app/(dashboard)/abonos/page.tsx (Server Component, todo por business_id) + abonos-client.tsx (lista + detalle + control de ventana)"
  - "components/dashboard/nuevo-abono-form.tsx — alta del abono con día de la semana + hora (sin fecha puntual), clon del shell de nuevo-turno-form (Dialog desktop / Drawer mobile, combobox de cliente, selects por vertical)"
  - "Control de ventana de generación (businesses.abono_window_weeks) persistido por el mismo camino owner-autenticado que max_advance_days"
  - "Badge 'Fijo' en la agenda para los turnos con abono_id (Badge del design system)"
  - "Detalle del abono con las ocurrencias salteadas (skipped_occurrences) y su razón traducida al español"
  - "/abonos registrada en el sidebar (sección AGENDA) y en el menú de todos los verticales"
affects: [06-06-cierre-post-uat, 06-07-select-en-drawer, 07-cancelacion-serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El form del abono NO inventa UI: clona el shell responsive de nuevo-turno-form (Dialog ≥768px / Drawer mobile) y sólo reemplaza el campo temporal (fecha puntual → día de la semana + hora)"
    - "La UI no es fuente de verdad de aislamiento: el form sólo sugiere IDs, la autoridad es /api/abonos/create que los re-valida por business_id"
    - "El control de ventana espeja el mecanismo owner-autenticado ya existente de max_advance_days (Phase 4) en vez de crear un camino de escritura nuevo"
    - "Razones de salteo con diccionario a español + fallback genérico, para que una razón nueva del motor nunca rompa el detalle"

key-files:
  created:
    - app/(dashboard)/abonos/page.tsx
    - app/(dashboard)/abonos/abonos-client.tsx
    - components/dashboard/nuevo-abono-form.tsx
  modified:
    - components/dashboard/sidebar.tsx
    - lib/verticals.ts
    - app/(dashboard)/agenda/agenda-client.tsx
    - app/(dashboard)/agenda/page.tsx

key-decisions:
  - "El badge de la agenda dice 'Fijo' (no 'Abono'): es la palabra que usa el dueño para el turno recurrente y entra en la tarjeta compacta sin romper el layout"
  - "El detalle del abono vive en abonos-client.tsx (no en una ruta /abonos/[id]): la serie es poca data y ya viene cargada por la page, así que un Dialog/Drawer evita un round-trip y un archivo más"
  - "El control de ventana se persiste con el mecanismo de max_advance_days en vez de un endpoint nuevo — un solo camino auditado de escritura sobre businesses"
  - "abono_id se sumó al select de appointments en agenda/page.tsx (única línea tocada de esa query): es un id opaco, no expone datos del abono"

patterns-established:
  - "Toda sección nueva del panel se registra a la vez en sidebar.tsx y en el menú por vertical de lib/verticals.ts (si no, la ruta existe pero es inalcanzable)"

requirements-completed: [ABONO-01]

# Metrics
duration: 11min
completed: 2026-07-21
status: complete
---

# Phase 6 Plan 05: UI del abono (sección /abonos, badge en la agenda, detalle de salteos) Summary

**La cara visible del abono en el panel: una sección `/abonos` con alta por día de la semana + hora (clon del shell de "Nuevo turno", sin fecha puntual), lista de abonos con su serie, detalle con las ocurrencias que el motor salteó y su razón en español, control de la ventana de generación (`abono_window_weeks`) persistido por el mismo camino que `max_advance_days`, y un badge "Fijo" en la agenda para distinguir los turnos que vienen de un abono. Cerrado por checkpoint humano: APROBADO tras 3 rondas de UAT en local.**

## Performance

- **Duration:** ~11 min de implementación (tasks 1-2) + 3 rondas de UAT humano
- **Started:** 2026-07-20T23:36Z (ART 20:36)
- **Implementación completada:** 2026-07-20T23:47Z (ART 20:47)
- **Checkpoint aprobado:** 2026-07-21
- **Tasks:** 3 (2 auto + 1 checkpoint human-verify)
- **Files modified:** 7 (3 creados + 4 modificados)

## Accomplishments

- **Sección `/abonos` completa.** `page.tsx` es Server Component (patrón `agenda/page.tsx`): auth → `business` por `owner_id` → `Promise.all` de clients / services / professionals / locations / abonos (con joins a cliente, servicio y profesional) + conteo de turnos generados, **toda query acotada por `.eq('business_id', business.id)`**.
- **Alta del abono sin fecha puntual.** `nuevo-abono-form.tsx` reusa el shell responsive de `nuevo-turno-form` (Dialog en desktop, Drawer en mobile), el combobox de cliente con creación inline y los selects por vertical (servicio / profesional / cancha / consultorio), pero pide **día de la semana + hora**. Postea a `/api/abonos/create`, con `saving` para evitar doble submit y toasts de sonner.
- **Ventana de generación configurable desde el panel.** El input de semanas persiste `businesses.abono_window_weeks` por el **mismo mecanismo owner-autenticado** con que Ajustes persiste `max_advance_days` (Phase 4) — no se creó un camino de escritura nuevo sobre `businesses`.
- **Los turnos de abono se distinguen en la agenda.** `abono_id` se sumó al select de `agenda/page.tsx` y `agenda-client.tsx` renderiza un badge "Fijo" (componente `Badge` del design system, tokens del proyecto, sin hex hardcodeado) que no altera el layout de la tarjeta compacta.
- **El dueño ve qué semanas no se pudieron reservar.** El detalle del abono lista `skipped_occurrences` con la fecha y la razón traducida al español (slot ocupado / cupo lleno / día cerrado / conflicto de espacio), que es el cierre de D-06.
- **Ruta alcanzable.** `/abonos` quedó registrada en el sidebar (sección AGENDA) y en el menú de **todos los verticales** que reservan.

## Task Commits

| Task | Nombre | Commit | Archivos |
| ---- | ------ | ------ | -------- |
| 1 | Página de abonos + form de alta (día de la semana + hora) + control de ventana | `9c32ef5` (feat) | `app/(dashboard)/abonos/page.tsx`, `app/(dashboard)/abonos/abonos-client.tsx`, `components/dashboard/nuevo-abono-form.tsx`, `components/dashboard/sidebar.tsx`, `lib/verticals.ts` |
| 2 | Badge "Fijo" en la agenda + detalle del abono con ocurrencias salteadas | `494cddc` (feat) | `app/(dashboard)/agenda/agenda-client.tsx`, `app/(dashboard)/agenda/page.tsx` |
| 3 | **[BLOCKING] Checkpoint human-verify** | — (sin código) | verificación en vivo con `npm run dev` |

## Files Created/Modified

- `app/(dashboard)/abonos/page.tsx` — Server Component: sesión, `business` por `owner_id`, carga en paralelo de clientes/servicios/profesionales/consultorios/abonos + conteo de turnos por abono, todo `.eq('business_id', business.id)`.
- `app/(dashboard)/abonos/abonos-client.tsx` — lista de abonos, detalle (serie + ocurrencias salteadas con razón en español) y control de ventana de generación.
- `components/dashboard/nuevo-abono-form.tsx` — alta del abono: shell Dialog/Drawer, combobox de cliente, selects por vertical, **día de la semana + hora**, POST a `/api/abonos/create`.
- `components/dashboard/sidebar.tsx` — entrada `/abonos` en la sección AGENDA.
- `lib/verticals.ts` — `/abonos` en el menú de los verticales que reservan.
- `app/(dashboard)/agenda/agenda-client.tsx` — badge "Fijo" cuando el turno tiene `abono_id`.
- `app/(dashboard)/agenda/page.tsx` — `abono_id` sumado al select de `appointments` (una línea; el resto de la query intacto).

## Decisions Made

Ver `key-decisions` del frontmatter. Ninguna decisión arquitectónica nueva: el plan pedía explícitamente reusar el design system y los patrones existentes, y así se hizo (shell del form, Badge, mecanismo de persistencia de `max_advance_days`).

## Deviations from Plan

**None** — el plan se ejecutó como estaba escrito. `sidebar.tsx` y `lib/verticals.ts` no figuraban en el `files_modified` del frontmatter pero el `<action>` de Task 1 pedía explícitamente registrar la ruta en el menú/sidebar; sin eso la sección existiría pero sería inalcanzable.

## Checkpoint (Task 3) — Verificación humana: **APROBADO**

Checkpoint `human-verify` con `gate="blocking"`. El usuario corrió `npm run dev` contra un negocio de prueba y verificó en vivo: alta del abono → generación de la serie → badge en la agenda → detalle con salteos → persistencia de la ventana, más el chequeo visual (WCAG AA del badge, form usable en mobile 375px, estados hover/focus/disabled).

**Resultado: APROBADO tras 3 rondas de UAT.** Las rondas no rechazaron lo construido: confirmaron el flujo y **destaparon trabajo de producto y un bug de componente compartido**, que se cerró en planes propios (patrón de cierre post-UAT: no se re-abren los planes ya cerrados).

### Follow-ups entregados en 06-06 y 06-07

| Plan | Qué salió del UAT | Commits |
| ---- | ----------------- | ------- |
| **06-06** | **D-06′** — el abono deja de gatearse por la grilla semanal (`time_blocks` / `out_of_hours` fuera): el alta manual de un turno suelto tampoco chequea horario, así que el abono era MÁS restrictivo que poner el turno a mano. Queda sólo el skip por `day_closed` y por conflicto real del core. | `2676d0c`, `219519f`→`5540f53` |
| **06-06** | **D-07′ / ABONO-07** — duración por abono: `abonos.total_occurrences` (`null` = indefinido / `N` = finito) + `status 'completed'` como estado terminal; el motor acepta `maxCreated` y el finito converge contando turnos REALES contra la DB (un choque no consume sesión). | `1a5a28f`→`84f4a58`, `fe4304a` |
| **06-06** | **D-09′** — el detalle mostraba `generated_until` (frontera de la ventana rolling, cae cualquier día) y por eso un abono de los jueves mostraba un martes. Ahora "Último" = fecha del **último turno real** de la serie, más "Sesiones: X de N". | `fe4304a` |
| **06-07** | **Bug de producción destapado por el UAT en mobile:** el popup del `Select` se portaleaba a `<body>`, fuera del subárbol modal de vaul → se veía pero no se podía clickear. Arreglado en la **capa compartida** (`drawer.tsx` publica su nodo por contexto, `select.tsx` lo consume). Esto arregla de rebote el **alta manual de turno**, que tenía el mismo bug **en producción desde v0.22**. | `57c8f33` |
| **06-07** | Copy del abono finito: el chip de la lista pasa de "Completado" a "**X de N turnos**" (coherente con "8 turnos" del indefinido). | `4fd5e49`, `c434976`, `8aacf7a` |

## Estado de deploy — migración 054 **YA APLICADA A PRODUCCIÓN**

> **La migración `054_abonos.sql` fue aplicada a producción el 2026-07-21.**
>
> - **Última migración en prod = 054.** La próxima migración del repo debe numerarse **055**.
> - **El schema del abono ya NO se puede enmendar en el lugar.** El atajo que usó 06-06 (editar la 054 porque prod seguía en 053) **quedó cerrado**: cualquier cambio sobre `abonos`, `appointments.abono_id` o `businesses.abono_window_weeks` requiere una migración **nueva** (055+), idempotente, numerada y aplicada a mano coordinada con el deploy.
> - Alcance de la 054 en prod: tabla `abonos` (con `total_occurrences` + `status` en `('active','cancelled','completed')`), FK `appointments.abono_id`, `businesses.abono_window_weeks`, RLS owner-only.

## Verification

| Check | Resultado |
| ----- | --------- |
| `npx tsc --noEmit` | limpio |
| `npx eslint "app/(dashboard)/abonos" components/dashboard/nuevo-abono-form.tsx` | limpio (los ~10 errores react-hooks de `settings-client.tsx` son PRE-EXISTENTES y ajenos) |
| `grep -cE "abono_id" app/(dashboard)/agenda/agenda-client.tsx` | > 0 (badge cableado) |
| Checkpoint humano (Task 3) | **APROBADO** tras 3 rondas de UAT en local |

## Threat Mitigations

| Threat ID | Disposición | Cómo quedó |
| --------- | ----------- | ---------- |
| T-06-19 | mitigate | El form sólo sugiere `serviceId`/`professionalId`/`clientId`/`dayOfWeek`/`time`; la autoridad es `/api/abonos/create` (Plan 03), que los re-valida por `business_id`. La UI nunca es fuente de verdad de aislamiento. |
| T-06-20 | mitigate | Toda query de `abonos/page.tsx` y el select de la agenda van `.eq('business_id', business.id)`; `abono_id` es un id opaco sin datos sensibles y `skipped_occurrences` sólo se lee dentro del tenant. |
| T-06-21 | mitigate | El control de ventana persiste por el mismo camino owner-autenticado que `max_advance_days` (business por `owner_id` + RLS owner-only); no se abrió un endpoint de escritura nuevo sobre `businesses`. |
| T-06-SC | accept | Este plan no instaló ningún paquete: reusa componentes y design system existentes. |

## Known Stubs

Ninguno.

## User Setup Required

Ninguno propio de este plan. La migración 054 (dependencia de 06-01/06-06) **ya está aplicada en producción** — ver la sección de deploy más arriba.

## Next Phase Readiness

- La superficie de UI del abono queda cerrada para v0.24 (alta, lista, detalle, salteos, ventana, badge), con sus revisiones post-UAT ya aplicadas en 06-06 y 06-07.
- Phase 7 (baja de la serie, ABONO-04/05) parte de acá: la lista y el detalle del abono son el lugar natural del botón "dar de baja" del dueño, y `status` ya distingue `cancelled` de `completed`.
- Fuera de alcance y sin abrir: editar una serie viva, recurrencia no-semanal, alta pública del abono, cobro recurrente (v0.25).

## Self-Check: PASSED

- Archivos declarados presentes en disco: `app/(dashboard)/abonos/page.tsx`, `app/(dashboard)/abonos/abonos-client.tsx`, `components/dashboard/nuevo-abono-form.tsx`, `components/dashboard/sidebar.tsx`, `lib/verticals.ts`, `app/(dashboard)/agenda/agenda-client.tsx`, `app/(dashboard)/agenda/page.tsx`.
- Commits verificados en `git log` de `gsd/motor-reservas-v024`: `9c32ef5`, `494cddc`.
- Commits de los follow-ups verificados: `2676d0c`, `219519f`, `5540f53`, `1a5a28f`, `84f4a58`, `fe4304a` (06-06) · `57c8f33`, `4fd5e49`, `c434976`, `8aacf7a` (06-07).

---
*Phase: 06-modelo-del-abono-alta-manual-generaci-n-forward*
*Completed: 2026-07-21*
</content>
</invoke>
