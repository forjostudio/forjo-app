---
quick_id: 260722-nll
slug: un-abono-finito-cuyas-n-sesiones-entran-
date: 2026-07-22
status: complete
type: execute
workstream: motor-reservas
phase_ref: 07-cancelaci-n-del-abono-mail-panel
commits:
  - d4e4bc7
files_modified:
  - "app/(dashboard)/abonos/abonos-client.tsx"
tasks_completed: 2
tasks_total: 2
uat: pending
---

# Quick 260722-nll — El abono finito con turnos por delante se queda en Activos

Un abono finito cuyas N sesiones entran enteras en la ventana de generación nacía con
`status: 'completed'` y el panel lo archivaba en el mismo alta, con sus N turnos todavía en el
futuro. Se corrigió **solo la lectura que la UI hacía del flag**: `completed` pasa a leerse como
"el motor ya no extiende esta serie", no como "terminado".

## Qué se hizo

**Tarea 1 — predicado único + rewire de los dos memos + doctrina escrita** (commit `d4e4bc7`)

`app/(dashboard)/abonos/abonos-client.tsx`:

- Helper de módulo `isAbonoActivo(a: AbonoRow, futureCounts: Record<string, number>): boolean`,
  junto a los otros helpers puros (`skipReasonES`, `hhmm`), por encima de `interface Props`.
  Devuelve `true` para `'active'`; para `'completed'` sólo si `(futureCounts[a.id] ?? 0) > 0`;
  `false` para cualquier otro status. El `?? 0` archiva la serie que no figura en el record.
- `visibleAbonos` y `tabCounts` resuelven la pertenencia al tab llamando al **mismo** helper. El
  filtro quedó como `isAbonoActivo(a, futureTurnoCounts) === (tab === 'activos')` (una sola
  invocación, el tab `'archivados'` es el complemento exacto); `tabCounts.archivados` sigue siendo
  `abonos.length - activos`.
- `futureTurnoCounts` entró en las dependencias de los dos memos: `[abonos, tab, futureTurnoCounts]`
  y `[abonos, futureTurnoCounts]`.
- Reescritos los dos comentarios doctrinales que describían el comportamiento viejo: el de
  `type AbonoTab` y el de `visibleAbonos`. La doctrina nueva (**generadas ≠ dictadas**) vive arriba
  del helper: `status` es un flag del motor de generación (D-07′), no un estado de negocio; el
  backend no cambia — el cron sigue filtrando por `'active'` y la baja sigue aceptando `'completed'`
  (D-21).

**Tarea 2 — verificación de cierre.** Sin cambios de código.

## Verificación

| Gate | Resultado |
|------|-----------|
| `./node_modules/.bin/tsc --noEmit` | exit 0 |
| `./node_modules/.bin/eslint "app/(dashboard)/abonos/abonos-client.tsx"` | exit 0 |
| `grep -cE 'isAbonoActivo\(a, futureTurnoCounts\)'` | **2** (filtro + contador) |
| `grep -cE 'function isAbonoActivo'` | **1** (un solo predicado) |
| `grep -cE '\[abonos, tab, futureTurnoCounts\]\|\[abonos, futureTurnoCounts\]'` | **2** |
| `git status --porcelain` sobre los 5 intocables | 0 líneas |
| Diff de producción del commit | 1 archivo (`abonos-client.tsx`, +30/-11) |
| `./node_modules/.bin/vitest run --no-file-parallelism` | **55 archivos / 723 passed / 1 skipped**, exit 0 |

La suite corrió con el binario local (nunca `npx`) y salió verde entera: el Supabase local estaba
levantado, así que no hubo fallos de entorno que reportar. Ningún test cubre este componente (la
suite corre en environment `node`, sin jsdom), por eso el verde es no-regresión, no cobertura del
cambio.

Intocables confirmados sin modificar: `app/(dashboard)/abonos/page.tsx`, `lib/types.ts`,
`lib/abono-cancel.ts`, `app/api/abonos/create/route.ts`, `app/api/cron/cancel-expired/route.ts`.
No se agregó ninguna query: el dato de turnos futuros ya llegaba como prop `futureTurnoCounts`.

## UAT — PENDIENTE (humana)

Los dos `<human-check>` del plan **no se ejecutaron**: requieren `npm run dev` y operación manual
del panel, fuera del alcance del ejecutor. Quedan pendientes para el operador:

1. Ventana de generación en 8 semanas → alta de un abono de **7 sesiones** → la serie debe aparecer
   en **Activos (1)**, no en Archivados, con sus 7 turnos por delante; el detalle debe seguir
   mostrando "Estado: Todas las sesiones asignadas"; el número del tab tiene que coincidir con la
   cantidad de filas listadas en los dos tabs.
2. No-regresión de la baja: dar de baja esa serie → desaparece de Activos y aparece en
   **Archivados**, con los contadores coherentes. Un abono indefinido (`active`) sigue en Activos
   exactamente como antes.

## Desvíos del plan

Ninguno funcional. Única diferencia de forma: el plan describía `visibleAbonos` como un ternario
sobre el helper; se escribió como comparación booleana (`isAbonoActivo(...) === (tab === 'activos')`)
para invocar el predicado **una sola vez** por fila en vez de dos, manteniendo idéntico el resultado
y la forma de la llamada que exigen los gates.

## Self-Check: PASSED

- `app/(dashboard)/abonos/abonos-client.tsx` — FOUND
- commit `d4e4bc7` — FOUND
