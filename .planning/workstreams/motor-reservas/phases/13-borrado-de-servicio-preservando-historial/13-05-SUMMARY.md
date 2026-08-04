---
phase: 13-borrado-de-servicio-preservando-historial
plan: 05
subsystem: testing
tags: [uat, postgres, trigger, migration, tailwind, design-tokens, timezone]

requires:
  - phase: 13-01
    provides: migración 065 (snapshot inmutable, FKs en SET NULL, gate de borrado)
  - phase: 13-02
    provides: helper de fallback snapshot → join en los 8 read-paths de historial
  - phase: 13-03
    provides: modal de dos estados, tabs Activos/Desactivados, mapeo P0001
  - phase: 13-04
    provides: tests de integración de los dos triggers
provides:
  - Verificación humana de los tres Success Criteria de la fase sobre datos reales
  - Migración 065 APLICADA EN PRODUCCIÓN (2026-08-03) con su runbook y verificaciones
  - 5 gaps detectados por la UAT y cerrados dentro de la fase
  - Token de superficie de peligro (`--danger`) usable fuera de `.crm-shell`
  - Predicado de "turno futuro" corregido: `completed` ya no bloquea el borrado
affects: [motor-reservas, canchas, finanzas, abonos]

tech-stack:
  added: []
  patterns:
    - "Token de indirección por shell: :root → --destructive, .crm-shell → --crm-danger. Un componente compartido referencia el token intermedio y cada shell resuelve su propio rojo, sin fugas ni duplicación."
    - "Editar una migración que todavía no salió del entorno local en vez de encadenar una correctiva."
    - "Mutation check del test: instalar el cuerpo viejo de la función y confirmar que los tests nuevos fallan, para probar que son pins reales."

key-files:
  created:
    - lib/appointment-time.ts
    - test/appointment-time.test.ts
    - .planning/workstreams/motor-reservas/todos/pending/2026-08-03-borrar-definitivamente-abonos-archivados.md
    - .planning/workstreams/motor-reservas/todos/pending/2026-08-03-finanzas-mobile-oculta-el-servicio.md
    - .planning/workstreams/motor-reservas/todos/pending/2026-08-03-canchas-sin-tabs-activos-desactivados.md
  modified:
    - supabase/migrations/065_service_snapshot_and_delete_gate.sql
    - supabase/schema.sql
    - app/globals.css
    - components/crm/confirm-dialog.tsx
    - components/crm/risk-badge.tsx
    - components/crm/confirm-dialog.test.tsx
    - app/(dashboard)/settings/settings-client.tsx
    - app/(dashboard)/appointments/appointments-client.tsx
    - components/dashboard/canchas-manager.tsx
    - lib/canchas.ts
    - test/service-delete-gate.test.ts
    - test/canchas-provision.test.ts

key-decisions:
  - "D-08 sobreescrito por el dueño: 'futuro' pasa de `status != cancelled` a `status NOT IN (cancelled, completed)`. Un turno completado es historia, no una reserva pendiente."
  - "La 065 se editó en su lugar en vez de encadenar una 066: nunca había salido del Supabase local, así que una correctiva habría sido deuda permanente para parchear algo que nadie corrió."
  - "`--crm-danger` NO se sacó de `.crm-shell`. El scope es deliberado (UI-SPEC del CRM §12). Se agregó `--danger` como indirección; el dashboard resuelve a `--destructive`, que ningún `[data-palette]` pisa."
  - "El foreground del peligro se invierte por modo (`#fbf3e3` claro / `#1a1714` oscuro): el crema sobre el rojo dark da 3.29:1 y no llega a AA."
  - "El checkpoint humano NO se auto-aprobó pese a `workflow.auto_advance=true` — el plan lo prohíbe y su threat model lo registra como T-13-29."

patterns-established:
  - "Token de peligro por shell: los componentes de `components/crm/` reutilizados en el dashboard referencian `--danger`, nunca `--crm-danger` directo."
  - "Predicado de turno futuro con rama NULL explícita: `status IS NULL OR status NOT IN (...)`. Ni `<>` ni `NOT IN` a secas ni `.in(...)` de PostgREST, que descartan las filas con status NULL y abren el gate."
  - "El pre-check de PostgREST del modal y el EXISTS del trigger se mantienen como espejos exactos, verificados en vivo sembrando los 6 estados."

requirements-completed: [HIST-01, HIST-02, HIST-03]

duration: 95min
completed: 2026-08-03
status: complete
---

# Phase 13 · Plan 05: UAT visual y apply en producción

**Los tres Success Criteria verificados por el dueño sobre datos reales, 5 gaps encontrados y cerrados dentro de la fase, y la migración 065 aplicada a producción a mano el 2026-08-03.**

## Performance

- **Duration:** ~95 min (incluye dos rondas de UAT y dos rondas de gap closure)
- **Completed:** 2026-08-03
- **Tasks:** 2 (los dos checkpoints bloqueantes)
- **Files modified:** 12 + 3 de backlog

## Accomplishments

- **UAT visual APROBADA** por el dueño en la segunda ronda, sobre el negocio del seed con datos reales.
- **HIST-01 + HIST-03 demostrados en producción de datos, no solo en tests:** al borrar el servicio "Cancha de 6", sus 8 turnos quedaron con `service_id NULL` pero conservaron `service_name` y `service_price` ($70.000). Lo mismo con "Corte" y sus 3 turnos ($5.000), visibles en Finanzas, ficha del cliente, Turnos desktop y mobile, CSV y Dashboard.
- **HIST-02 verificado:** el modal abre en "Verificando turnos…", pasa a bloqueado con el conteo real y la fecha del próximo turno, ofrece "Desactivar" como salida, y no habilita "Eliminar". Con 0 turnos bloqueantes abre directo en confirmable.
- **D-14 verificado:** píldoras "Activos (N)" / "Desactivados (M)" con contadores correctos y empty state por tab.
- **Migración 065 aplicada en producción** el 2026-08-03, con el runbook de 7 pasos ejecutado por el dueño en el SQL editor. `supabase db push` NO se usó en ningún momento.

## Copy real del modal, transcrito de pantalla

**Estado contando:**
> Vas a eliminar "Corte". Verificando turnos…

**Estado bloqueado** (badge `Alto`, botones `Cancelar` / `Desactivar`):
> "Corte" tiene 1 turno reservado a partir del 3/8. Desactivalo para dejar de ofrecerlo y conservar el historial.

**Estado confirmable** (badge `Alto`, botones `Eliminar` en rojo sólido / `Cancelar`):
> Vas a eliminar "Corte". Se conservan sus 3 turnos en el historial (Finanzas y ficha del cliente) con su nombre y su precio. Esta acción no se puede deshacer.

**Variante de canchas** (el modal propio del manager, con confirmación tipeada):
> "Cancha de 6" tiene 8 reserva(s) próxima(s). Eliminarla es permanente y no se puede deshacer. Si querés conservar el historial, desactivala en su lugar. Para eliminar igual, escribí ELIMINAR.

## Gaps encontrados por la UAT y cómo se cerraron

La primera ronda de UAT no pasó. Los 5 hallazgos, su diagnóstico y su resolución:

### G1 — El rojo de peligro no aparecía en el dashboard · CERRADO

**Observado:** el botón "Eliminar" salía sin fondo y el badge "Alto" sin su punto rojo. El dueño lo reportó como "sigue sin aparecer" — venía de antes.

**Causa raíz:** `--crm-danger` / `--crm-danger-foreground` están definidos SOLO dentro de `.crm-shell` (`app/globals.css`), con un comentario explícito de que nunca deben filtrarse al dashboard. Pero `confirmButtonClass()` y `RiskBadge` los referencian directo, y el plan 13-03 reusó `ConfirmDialog` en el dashboard. Fuera de `.crm-shell` la var no resuelve a nada. Afectaba a 3 pantallas: Servicios, Abonos y Canchas.

**Fix (`b679575`):** token de indirección `--danger` / `--danger-foreground`. En `:root` apunta a `--destructive` (`#b23a26` claro / `#e05c43` oscuro, no pisado por ningún `[data-palette]`); en `.crm-shell` apunta a `--crm-danger`. El CRM renderiza byte-idéntico. Contrastes medidos: `#fbf3e3` sobre `#b23a26` = **5.40:1**; `#1a1714` sobre `#e05c43` = **4.91:1**; ambos AA. El crema sobre el rojo dark daba 3.29:1 y se descartó, por eso el foreground se invierte por modo.

El test 6 de `confirm-dialog.test.tsx` asertaba `/crm-danger/` literal y fallaba por diseño; se reescribió para asertar `var(--danger)` y prohibir explícitamente `crm-danger` y `destructive`, quedando como guarda de regresión de este mismo bug.

**Residual conocido:** en el estado bloqueado, "Desactivar" es `variant="default"` = `--primary`, que en la paleta *red* es `#d94a2b` y se lee como destructivo aunque sea la acción segura. En blue/green/yellow no pasa. Se dejó tal cual; bajarlo a `secondary` exige tocar la lógica de variante de 13-03.

### G2 — La lista genérica de Servicios mostraba (y dejaba borrar) las canchas · CERRADO

**Observado:** con el negocio en rubro belleza, el tab "Desactivados" de Servicios listaba "Cancha de 6", y desde ahí se podía borrar. El modal decía "¿Eliminar servicio?" en vez de "¿Eliminar cancha?".

**Causa raíz:** `settings/page.tsx:29` trae todos los `services` sin filtrar; `isCanchas` solo decide qué UI renderiza, no qué datos. Una cancha es un `services` + un `professionals` que le apunta por `service_id` (migr. 043). **Consecuencia real reproducida:** borrar la cancha desde ahí dejó `professionals.service_id` en NULL y la cancha huérfana.

**Fix (`cef4e19`):** helper puro `nonCanchaServices(services, canchas)` en `lib/canchas.ts`, alimentado por `canchasFromData` (match por `service_id`, nunca por nombre). Aplicado a la lista, los dos tabs y los dos contadores. `CanchasManager` sigue recibiendo `services` completo. 4 tests nuevos.

**Fuera de alcance, no tocado:** el bloque "Qué servicios hace cada profesional" (~línea 1845) sigue iterando `services` crudo, así que mostraría el chip de una cancha. Cambiarlo altera el mapeo `professional_services`.

### G3 — Toggle inconsistente entre rubros · CERRADO

**Observado:** en canchas el toggle activo/inactivo era un ojito; en Servicios, un botón de texto.

**Causa raíz:** `canchas-manager.tsx:227-228` usaba un icon-button con `EyeOff`/`Eye` (de v0.13); el plan 13-03 introdujo un botón de texto en Servicios.

**Fix (`1c69216`):** canchas pasa al botón de texto, molde literal de Servicios. Se conservó el `aria-label` con el nombre de la cancha — de hecho mejor que Servicios, donde N botones "Desactivar" son indistinguibles para un lector de pantalla. Verificado a 375px: no desborda (el nombre envuelve antes de empujar los controles).

**Deuda heredada del molde:** `size="sm"` da 28px de alto, por debajo de los 44px de touch target. Es el baseline de Servicios, no se cambió unilateralmente.

### G4 — El tab "Pasados" de Turnos ignoraba la hora · CERRADO

**Observado:** un turno de hoy a una hora ya pasada aparecía en "Próximos" y nunca en "Pasados". Fue lo que impidió completar los pasos C.08–C.15 en la primera ronda.

**Causa raíz:** `appointments-client.tsx:142-143` comparaba solo `a.date` contra `format(new Date(), 'yyyy-MM-dd')`, sin mirar `time`. Bug preexistente, no introducido por esta fase.

**Fix (`3722efa`):** `lib/appointment-time.ts` puro con `nowInAR()` e `isPastAppointment()`, reusando la convención AR de `lib/booking-window.ts`. `time` se normaliza a `HH:mm:ss` antes de comparar; sin hora = fin del día. 11 tests nuevos, incluido el caso exacto del bug y un test de partición.

### G5 — El gate bloqueaba por turnos ya completados · CERRADO

**Observado (segunda ronda de UAT):** el dueño marcó el turno de hoy como `completed` y el modal siguió diciendo "tiene 1 turno reservado a partir del 3/8", sin dejar borrar. Su argumento: *"en ese caso me debería dejar eliminar igual, ya es completado"*.

**Causa raíz:** D-08 definía "futuro" como `date >= hoy AND status IS DISTINCT FROM 'cancelled'`. Un turno `completed` pasa ese filtro. Evidencia de que la semántica pretendida era la más laxa: `canchas-manager.openDelete` (anterior a esta fase) ya contaba solo `pending`/`pending_payment`/`confirmed`.

**Fix (`acf1dae`) — D-08 sobreescrito por el dueño.** Predicado nuevo, espejado en los dos lados:

```sql
-- supabase/migrations/065_...sql §6.2 y supabase/schema.sql
AND a."date" >= v_today
AND (a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed'))
```
```
// app/(dashboard)/settings/settings-client.tsx:548
.gte('date', today).or('status.is.null,and(status.neq.cancelled,status.neq.completed)')
```

La rama `IS NULL` explícita es obligatoria en ambos: `NOT IN` sobre NULL evalúa NULL y abriría el gate, y `.in(...)` de PostgREST descarta las filas con status NULL. No se tocó la regla del abono (6.3), el guard de cascada (6.1), el trigger de snapshot ni los messages/ERRCODE.

**La 065 se editó en su lugar, no se encadenó una 066** — nunca había salido del Supabase local (prod estaba en 064), así que una correctiva habría sido deuda permanente para parchear algo que nadie corrió.

**Evidencia:** `npx supabase db reset` ×3 exit 0 sin líneas `ERROR`; idempotencia real re-corriendo la migración completa con `ON_ERROR_STOP=1` sobre la DB ya migrada (`UPDATE 0` / `UPDATE 0`); espejo UI↔trigger verificado en vivo sembrando los 6 estados (el `.or(...)` devolvió exactamente `{pending, pending_payment, confirmed, NULL}`); y un mutation check — instalar el cuerpo viejo de `services_block_delete()` hizo fallar exactamente los tests 7 y 8, probando que son pins reales.

3 tests nuevos en `test/service-delete-gate.test.ts` (completed hoy, completed futuro, y un `it.each` que confirma que `pending`/`pending_payment`/`confirmed` siguen bloqueando). Ninguna aserción previa se relajó: los tests viejos solo usaban `confirmed` y `null`, que siguen bloqueando.

### Divergencia registrada (deliberada, no es un gap)

El tab "Pasados" ahora mira la hora, pero el gate de la 065 sigue definiendo "futuro" como `date >= hoy` **sin hora**. Un turno de hoy a una hora ya pasada, y todavía no marcado como completado, se ve en "Pasados" pero sigue bloqueando el borrado de su servicio. Documentado en el header de `lib/appointment-time.ts`.

## Runbook de producción (ejecutado)

**Estado: APLICADA en producción el 2026-08-03. Runbook COMPLETO (7/7) al 2026-08-04.** `supabase db push` NO se usó en ningún momento; el apply fue manual en el SQL editor de producción, coordinado con el deploy.

### Salida real de producción — pasos 3 y 4 (2026-08-04)

Ejecutados por el dueño en el SQL editor de prod (una sola query con `UNION ALL`):

| chequeo | resultado |
|---|---|
| `FK abonos_service_id_fkey` (debe ser `n`) | **`n`** |
| `FK appointments_service_id_fkey` (debe ser `n`) | **`n`** |
| backfill: turnos con servicio y sin snapshot (debe ser `0`) | **`0`** |

Los dos FKs quedaron en `SET NULL` en producción — la acción referencial de la que depende HIST-01/HIST-03 — y ningún turno histórico quedó sin snapshot.

### Pasos 6 y 7 (2026-08-04)

- **Paso 6 — deploy: HECHO.** `git push origin main` (`86f5bb9..fe7ef4c`, 83 commits) → deploy de Vercel. El orden del runbook se respetó: la 065 estaba aplicada desde el día anterior, así que el schema fue siempre por delante del código.
- **Paso 7 — smoke test: HECHO.** Turno de prueba creado en prod con `service_name`/`service_price` poblados, y **borrado** después (obligación de T-13-30, confirmada por el dueño).

1. Confirmar que la última migración aplicada en prod es la **064**.
2. Pegar el contenido íntegro de `supabase/migrations/065_service_snapshot_and_delete_gate.sql` en el SQL editor de PRODUCCIÓN. Es idempotente: re-correrla es no-op.
3. Verificar el backfill — debe dar **0**:
   ```sql
   SELECT count(*) FROM appointments WHERE service_id IS NOT NULL AND service_name IS NULL;
   ```
4. Verificar que los dos FKs quedaron en SET NULL — `n` en las dos filas:
   ```sql
   SELECT conname, confdeltype FROM pg_constraint
   WHERE conname IN ('appointments_service_id_fkey', 'abonos_service_id_fkey');
   ```
5. Recargar el schema cache de PostgREST (la migración ya lo trae al final; repetir si el editor lo separó):
   ```sql
   NOTIFY pgrst, 'reload schema';
   ```
6. **Recién entonces** desplegar el código. El orden importa: el código nuevo lee columnas que solo existen después de la 065; el fallback al join protege los read-paths, pero el select ampliado del CSV de Finanzas falla con `PGRST204` si las columnas no están.
7. Smoke test: crear un turno de prueba, verificar `service_name` / `service_price` poblados, y **borrarlo**.

⚠ El archivo cambió después de la validación original de 13-01: el gap G5 modificó el predicado del gate. Lo aplicado a prod es la versión corregida.

## Task Commits

1. **Task 1: UAT visual** — sin commit de código propio; el resultado son los 5 gaps de arriba y sus fixes.
2. **Task 2: runbook y apply en prod** — acción manual del dueño, sin cambios en el repo.

**Gap closure ronda 1:** `b679575` (G1), `cef4e19` (G2), `1c69216` (G3), `3722efa` (G4)
**Gap closure ronda 2:** `acf1dae` (G5)
**Backlog:** `d419cc9`, `93051a8`

## Decisions Made

Ver `key-decisions` en el frontmatter. La más consecuente es la sobreescritura de D-08: la definición de "turno futuro" que bloquea un borrado ahora excluye también los completados, tanto en el trigger como en el pre-check del modal.

## Deviations from Plan

El plan preveía un UAT de aprobación o rechazo. Lo que pasó fue un ciclo: la primera ronda encontró 4 defectos, se cerraron, la segunda encontró 1 más, se cerró, y la tercera aprobó. Los 5 arreglos se ejecutaron **dentro** de la fase por decisión explícita del dueño, en vez de derivarse a un ciclo `plan-phase --gaps`.

Dos de los cinco (G4, el filtro Pasados; y G3, el toggle) eran defectos preexistentes ajenos a esta fase — el dueño eligió incluirlos igual.

El checkpoint **no se auto-aprobó** pese a que `workflow.auto_advance` está en `true`, porque el plan lo prohíbe explícitamente y su threat model registra ese escenario como T-13-29.

## Issues Encountered

- **El dueño no podía crear turnos con fecha pasada desde la UI**, lo que bloqueó los pasos C.08–C.15. Se resolvió sembrando los turnos por service-role contra el Supabase local. De paso quedó una prueba en vivo del anti-tampering: se enviaron con `service_price: 1` y el trigger los reescribió a $5.000.
- **El `db reset` de la ronda 2 borró los datos de la UAT.** Se repusieron los 3 turnos de Corte y se recreó una cancha (servicio + profesional apuntándole) para poder re-verificar G2.
- **Falso positivo reportado como bug:** "en 375px no tengo conexión" era el throttling de DevTools en `Offline`, no la app.
- **Residuo `__test_*` en la base local** de los tests de integración: sus `afterAll` no completan del todo, probablemente porque el propio gate les bloquea el borrado del servicio en la limpieza. No afecta al negocio del seed.

## Follow-ups al backlog

- [Borrar definitivamente abonos archivados](../../todos/pending/2026-08-03-borrar-definitivamente-abonos-archivados.md) — capacidad nueva, nunca discutida.
- [Finanzas mobile oculta el servicio](../../todos/pending/2026-08-03-finanzas-mobile-oculta-el-servicio.md) — `hidden sm:block` en `finances-client.tsx:890`. NO es un read-path olvidado: el dato está y el helper del snapshot está cableado; es layout. El dueño va a rehacer esa sección.
- [Canchas sin tabs Activos/Desactivados](../../todos/pending/2026-08-03-canchas-sin-tabs-activos-desactivados.md) — D-14 llegó a Servicios y no a Canchas.
- **`canchas-manager.tsx:166`** sigue con `.in('status', [...])`, que descarta las filas con status NULL: su pre-check puede decir "podés borrar" donde el trigger rechaza. Una línea, sin cerrar.

## User Setup Required

Ninguno adicional. La migración 065 ya está aplicada en producción (2026-08-03).

## Next Phase Readiness

- Los tres requisitos (HIST-01, HIST-02, HIST-03) están verificados por humano sobre datos reales y respaldados por tests de integración.
- La 065 está en prod; la próxima migración del proyecto es la **066**.
- Queda la Phase 14 (polish) del milestone v0.26.
- **Deploy HECHO el 2026-08-04** (`86f5bb9..fe7ef4c`, 83 commits — incluye también la Phase 12, que estaba cerrada y sin pushear). Runbook 7/7. `13-SECURITY.md`: SECURED 31/31, W-2 y W-3 resueltos, queda W-1 (residual IN-05, decisión para la 066).

---
*Phase: 13-borrado-de-servicio-preservando-historial*
*Completed: 2026-08-03*
