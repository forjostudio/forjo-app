---
phase: 14-cierre-de-backlog
plan: 06
subsystem: abonos
tags: [ui, borrado, rls, confirm-dialog, extra-b, panel]
status: complete

# Dependency graph
requires:
  - plan: 14-04
    provides: "gate de la migr. 066: rechaza status='active' con message 'abono_is_active' sobre ERRCODE P0001"
  - plan: 14-03
    provides: "estado actual del bloque de acciones del detalle (gate del link de baja, D-08) y del Guardar de la ventana"
  - phase: 13-borrado-de-servicio-preservando-historial
    provides: "molde completo del borrado con RLS + mapeo P0001 + onConfirm que lanza (settings-client.tsx:625-642 / 2469-2506)"
provides:
  - "acción de borrado definitivo de una serie de abono ARCHIVADA en el detalle de /abonos (D-19)"
  - "deleteAbono(): DELETE por el cliente del navegador (anon+RLS) + filtro por negocio + detección de 0 filas"
  - "mapeo del rechazo del gate a un motivo cerrado ('is_active' | 'unknown') traducido a copy propio"
affects: [abonos, 14-07, panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "visibilidad de una acción destructiva derivada UNA vez, combinando el predicado del tab con un guard redundante que espeja el gate de la base"
    - "onConfirm que LANZA ante el rechazo tardío de la base + onConfirmError que traduce el motivo (2ª aplicación del molde de 13-03)"

key-files:
  created: []
  modified:
    - app/(dashboard)/abonos/abonos-client.tsx

key-decisions:
  - "El predicado de la UI NO se movió para 'alinearlo' con el del trigger: se verificó que ya es un subconjunto estricto (isAbonoActivo devuelve activa para todo status='active' sin mirar conteos) y se FIJÓ el invariante con un guard redundante + comentario."
  - "El botón se ubicó después del par 'Dar de baja' / 'Serie dada de baja', dentro del mismo contenedor de acciones: aparece tanto sobre una serie cancelled como sobre una completed sin turnos futuros — las dos formas de estar archivado."
  - "ConfirmDialog de nivel simple (sin confirmWord), igual que la baja: es limpieza sobre una serie ya muerta, no la acción de máximo riesgo del panel."

requirements-completed: [EXTRA-B]

# Metrics
duration: 38min
completed: 2026-08-04
---

# Phase 14 Plan 06: EXTRA-B — Eliminar una serie de abono archivada Summary

**Una serie archivada ya se puede borrar definitivamente desde su detalle: DELETE por el navegador con
RLS + filtro por negocio, confirmación de dos pasos que promete que los turnos ya generados se
conservan, y el rechazo del gate de la 066 traducido a copy propio con el modal quedándose abierto.**

## Performance

- **Duration:** ~38 min
- **Tasks:** 2
- **Files modified:** 1 (`app/(dashboard)/abonos/abonos-client.tsx`)
- **Commits:** 2 de tarea + 1 de docs

## Accomplishments

- El hueco que reportó la UAT de Phase 13 (un abono archivado sin ninguna acción disponible) quedó
  cerrado: el detalle de una serie archivada ofrece "Eliminar".
- El borrado va por el **cliente del navegador con anon + RLS** y filtro explícito por negocio, nunca
  por service-role (T-14-22, verificado por grep = 0).
- El borrado de 0 filas —el caso en que la RLS filtró la fila— se trata como **fallo**, no como éxito
  silencioso (T-14-23).
- El rechazo tardío del gate deja el modal **abierto** con un motivo entendible, y el texto crudo del
  error de la base nunca llega a la pantalla (T-14-24, T-14-25).
- Ninguna acción nueva sobre una serie viva: doble candado entre la visibilidad de la UI y el trigger
  (T-14-26).

## Task Commits

1. **Task 1: `DeleteAbonoResult` + `deleteAbono` (RLS + mapeo del gate)** — `62df02c` (feat)
2. **Task 2: botón Eliminar + `ConfirmDialog` de confirmación** — `5860c6d` (feat)

## El invariante de visibilidad (esto es lo que hay que no romper después)

La condición del botón se deriva **una sola vez**, en `esArchivado`, dentro del render del detalle:

```tsx
const gateRechaza = a.status === 'active'
const esArchivado = !isAbonoActivo(a, futureTurnoCounts) && !gateRechaza
```

Son **dos** condiciones a propósito:

1. **El mismo predicado que alimenta el tab y los contadores.** "Archivada" es exactamente "no activa"
   según `isAbonoActivo`, así que no nace una tercera definición de archivado que pueda
   desincronizarse del tab donde el dueño está parado.
2. **Un guard redundante sobre el estado de la fila** que espeja literalmente el predicado del gate de
   la migr. 066 (`OLD.status = 'active'`).

**Por qué NO se movió el predicado de la UI** (el aviso que dejó 14-04): se verificó contra el código
real que la primera rama de `isAbonoActivo` devuelve "activa" para **toda** serie con `status='active'`
**sin mirar** el conteo de turnos futuros (`abonos-client.tsx:104-108`). Es decir: una serie activa
**nunca** cae en el tab de Archivados, ni siquiera con 0 turnos por delante. Por lo tanto el conjunto
que la pantalla ofrece borrar es un **subconjunto estricto** del que la base acepta — la dirección
segura. No había nada que alinear moviendo el gate ni el predicado.

**Entonces, ¿para qué el guard?** Para el futuro. Si mañana alguien afloja el predicado (por ejemplo,
para archivar también una serie activa sin turnos por delante), el guard evita que aparezca un botón
sobre una fila que la base va a rechazar. La redundancia convierte el invariante en estructura en vez
de disciplina, y queda escrita en el comentario del código, no sólo acá. Y aun si los dos candados
fallaran, el `onConfirm` que **lanza** es el backstop: el modal no cierra y el dueño se entera.

## Mapeo del rechazo (contrato de 14-04, aplicado literal)

| Lo que devuelve la base | Motivo interno | Copy que ve el dueño |
|---|---|---|
| `code='P0001'` + message contiene el código de dominio | `is_active` | "No se puede eliminar: la serie sigue activa. Dala de baja primero y después eliminala." |
| Cualquier otro error | `unknown` | "No se pudo eliminar el abono. Probá de nuevo." |
| Sin error, **0 filas** (la RLS filtró) | `unknown` | idem |
| Sin error, 1 fila | `ok` | toast "Abono eliminado" + `router.refresh()` |

La función **no** emite toast de error (igual que el molde de 13-03): devuelve el motivo y lo traduce
el modal, que es el único que sabe qué le estaba mostrando al dueño.

## Verificación

| Qué | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit 0 (nunca `npx tsc`) |
| `npm run build` | completa sin error |
| `npx vitest run` (completo) | **887 tests** · 876 passed + 4 expected fail + 1 skipped |
| `npx vitest run` suites del gate (aisladas) | `abono-delete-gate` + `abono-cancel-link` + `abono-cancel` → **26/26 verde** |
| `git diff --name-only HEAD~2 HEAD` | exactamente `app/(dashboard)/abonos/abonos-client.tsx` |

**Flakiness pre-existente (ya diagnosticada por el orquestador, no causada por este plan):** el run
completo muestra fallos no deterministas por contención cross-suite contra el Postgres local
compartido, siempre dentro de la familia `abono-{create,cron,generation}`:

| Corrida completa | Fallos | Archivos |
|---|---|---|
| 1 | 6 | `abono-create`, `abono-cron`, `abono-generation` |
| 2 | 2 | `abono-create` (caso 7), `abono-cron` (caso 1) |

El conjunto **cambia entre corridas** y no hay ningún fallo fuera de esa familia. Criterio de verde de
este plan (total ≥ 887 sin fallos nuevos fuera de la familia): **cumplido**.

## Evidencia de los 4 pasos de la prueba manual

⚠ **Los 4 pasos NO se ejecutaron en un navegador por este ejecutor** (corrida autónoma, sin sesión
interactiva). Lo que sí se hizo, paso por paso, y qué queda pendiente:

| # | Paso del plan | Estado | Evidencia |
|---|---|---|---|
| 1 | Serie del tab **Activos** → el botón **no** aparece | **Verificado por construcción, NO en navegador** | Toda serie del tab Activos cumple `isAbonoActivo(a) === true` (el filtro del listado ES ese predicado, `:163`), y `esArchivado` lo niega → `false` sin depender de ninguna otra variable. Además el guard `gateRechaza` corta por segunda vez toda serie `status='active'`. |
| 2 | Serie del tab **Archivados** → aparece | **Verificado por construcción, NO en navegador** | Complemento exacto del filtro: en Archivados `isAbonoActivo(a) === false`, y ninguna de esas series tiene `status='active'` (rama 1 del predicado) → `esArchivado === true`. |
| 3 | Confirmar → la serie desaparece y sus turnos siguen en el historial | **Verificado a nivel base, NO en navegador** | `test/abono-delete-gate.test.ts` casos **2**, **3** y **7** (la serie archivada se borra de verdad con la sesión anon del propio dueño, 1 fila) y caso **4** (los turnos sobreviven desvinculados con su snapshot de nombre y precio). La UI dispara `router.refresh()`, así que la lista y los contadores se recalculan en el servidor. |
| 4 | Forzar el rechazo (serie a activa por SQL con el modal abierto) → el modal queda abierto con el motivo | **Verificado a nivel base + contrato del componente, NO en navegador** | Caso **1** de la misma suite: el DELETE de una serie activa vuelve con `P0001` + el código de dominio, que es exactamente el input del mapeo. Del lado del componente, `ConfirmDialog.handleConfirm` sólo cierra si `onConfirm` **no** lanza (`components/crm/confirm-dialog.tsx:266-282`), y ante el throw llama `onConfirmError` sin cerrar. |

El helper `deleteAbono` de esa suite (`test/abono-delete-gate.test.ts:71-73`) es **la misma cadena
literal** que emite este plan (`.delete().eq('id').eq('business_id').select('id')`), así que las tres
ramas del mapeo tienen evidencia contra la base real: rechazo (caso 1), éxito (casos 2/3/7) y 0 filas
sin error por RLS ajena (caso 6).

**Pendiente para la UAT visual del plan 14-07 (bloqueante para el deploy):** abrir `/abonos` en el
navegador y correr los 4 pasos tal cual los describe el plan, en particular el **paso 4** (que es el
único donde se ve el comportamiento del modal ante el rechazo tardío) y la revisión visual del botón
destructivo dentro del Dialog en desktop y del Drawer en mobile.

## Decisions Made

- **No se movió el predicado de la UI ni el gate.** Ver "El invariante de visibilidad": el mapeo real
  ya es seguro y lo que faltaba era **fijarlo**, no cambiarlo. Mover el predicado hubiera cambiado qué
  series ve el dueño en cada tab (efecto de producto) para resolver un problema que no existía.
- **El botón va después del par "Dar de baja" / "Serie dada de baja"**, dentro del mismo contenedor de
  acciones, con `pt-2` propio. Así aparece igual sobre una serie `cancelled` (debajo del párrafo de la
  baja) que sobre una `completed` sin turnos futuros (debajo de "Dar de baja"), que son las dos formas
  de estar archivado. No se reabrió el bloque que gateó 14-03.
- **Nivel simple del `ConfirmDialog`** (sin palabra a tipear), igual que la baja: la fricción máxima se
  reserva para acciones sobre datos vivos; ésta es limpieza sobre una serie que ya no genera nada. El
  riesgo sigue marcado como `alto` y el botón es destructivo.
- **La descripción promete el historial.** Dice, con el número real de turnos ya generados, que **se
  conservan en el historial (Finanzas y ficha del cliente)** — es la promesa de D-16 y es lo que
  convierte un "eliminar permanentemente" en una acción segura de tomar.

## Deviations from Plan

### Criterios de aceptación mal calibrados (sin cambio de código)

**1. [Regla 3 — criterio mal calibrado] `grep -cE 'isAbonoActivo\('` da 4, no 3**

- **Encontrado en:** Task 2, al verificar los criterios.
- **Causa:** el criterio enumeraba "filtro del listado + contador de tabs + la constante" pero
  `grep -c` cuenta también la **línea de la declaración** de la función (`:104`), que ya existía. El
  baseline en `HEAD` era **3** (declaración + los 2 usos), no 2.
- **Resolución:** no se cambió nada. El invariante real que el criterio quería fijar se cumple: la
  visibilidad se deriva **una sola vez** en `esArchivado` y la condición del botón referencia esa
  constante, no el predicado otra vez. Verificado contra `git show HEAD~2:…` para confirmar que el 3
  es pre-existente.

**2. [Regla 3 — criterio mal calibrado] `grep -c 'Copiar link de baja'` da 2, no 1**

- **Causa:** mismo hallazgo que ya documentó 14-03 (el string aparece en el comentario del bloque y en
  el label del botón). Pre-existente en `HEAD`, no lo introdujo este plan.
- **Resolución:** ninguna. El invariante ("el botón existe una sola vez, bajo guard") se cumple, igual
  que `a.status !== 'cancelled'` = 2 → el trabajo de 14-03 quedó intacto.

**3. [Ajuste menor] Un comentario se reescribió para no contaminar el grep de `onConfirmError`**

- **Causa:** el comentario del backstop nombraba `onConfirmError`, así que el criterio de "=1" daba 2
  contando una línea de prosa.
- **Fix:** el comentario ahora dice "el handler de error de arriba"; el prop sigue apareciendo una sola
  vez. Sin cambio de comportamiento.

---

**Total deviations:** 3, todas de calibración de criterios; **0 cambios de comportamiento** respecto de
lo que pedía el plan. Ningún archivo fuera de `files_modified`.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan: no hay endpoint nuevo, ni
migración, ni cambio de policy. La única escritura nueva es un DELETE autenticado del dueño sobre su
propia tabla, ya cubierto por la RLS de la 054 y el gate de la 066.

## Self-Check: PASSED

Archivos verificados en disco:
- `app/(dashboard)/abonos/abonos-client.tsx` — FOUND

Commits verificados con `git log`:
- `62df02c` — FOUND
- `5860c6d` — FOUND

Greps de aceptación (sobre el archivo modificado):
- `from('abonos').delete()` = 1 · `.eq('id'` ≥ 1 · `.eq('business_id', business.id)` = 1 · `.select('id')` ≥ 1
- `error.code === 'P0001'` = 1 · `abono_is_active` = 1 (sólo en código, no en comentarios)
- `createAdminClient|SERVICE_ROLE|service_role` = **0**
- `<ConfirmDialog` = 2 · `onConfirmError` = 1 · `confirmWord` = 0
- `status === 'active'` = 2 (rama del predicado + guard redundante) · `throw new Error` = 3 (≥ 2)
- `se conservan en el historial` = 1 · `Copiar link de baja` = 2 (pre-existente) · `a.status !== 'cancelled'` = 2
- `git diff --name-only HEAD~2 HEAD` = exactamente 1 archivo

Verificaciones ejecutadas:
- `./node_modules/.bin/tsc --noEmit` → exit 0
- `npm run build` → completa
- `npx vitest run` → 887 tests, sin fallos fuera de la familia flaky documentada
- ningún `git stash`, ningún `git clean`, ningún `supabase db push`

---
*Phase: 14-cierre-de-backlog*
*Completed: 2026-08-04*
