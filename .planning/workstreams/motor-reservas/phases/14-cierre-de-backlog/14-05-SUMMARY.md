---
phase: 14-cierre-de-backlog
plan: 05
subsystem: dashboard-ui
tags: [refactor, extraccion, tabs, canchas, servicios, paridad]
status: complete
requires:
  - "app/(dashboard)/settings/settings-client.tsx — píldoras Activos/Desactivados shipeadas en Phase 13 (13-03, D-14), fuente literal de la extracción"
  - "14-01 — los 9 self-start del mismo archivo (wave 1), preservados intactos"
provides:
  - "components/dashboard/active-tabs.tsx — módulo compartido: useActiveTabs + ActiveTabs + ActiveTabsEmptyState"
  - "Canchas con paridad total: tabs con contadores reales, estado vacío por tab y sin tachado"
affects:
  - "app/(dashboard)/settings/settings-client.tsx"
  - "components/dashboard/canchas-manager.tsx"
  - "/servicios (los dos verticales: CRUD genérico y manager de canchas)"
tech-stack:
  added: []
  patterns:
    - "hook genérico sobre T + predicado inyectado desde el call-site (el filtro y los contadores comparten predicado por construcción)"
    - "predicado de 'activo' declarado a nivel de módulo en el call-site para identidad estable entre renders"
    - "estado vacío como componente que recibe icono + los dos pares de copy (lo único que varía por pantalla)"
key-files:
  created:
    - "components/dashboard/active-tabs.tsx"
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"
    - "components/dashboard/canchas-manager.tsx"
decisions:
  - "API final del módulo: un archivo con 1 hook + 2 componentes + 2 tipos/interfaces auxiliares; el predicado de 'activo' NO entra al módulo, se pasa como función desde el call-site"
  - "Las etiquetas de las píldoras ('Activos'/'Desactivados') NO son configurables a propósito (D-14): lo que varía por pantalla es el estado vacío (icono + copy), que sí nombra la entidad"
  - "Abonos NO se migró: sus tabs son activos/archivados y su predicado depende de un conteo de turnos futuros, no de un booleano de la fila — meterlo volvería el tipo genérico de más"
  - "El hook se invoca donde ya existe la lista filtrada (después de manageableServices), no arriba con el resto de los useState: leer professionals/agendaSpaces antes de su declaración sería un TDZ"
metrics:
  duration: "~30 min"
  completed: 2026-08-04
  tasks: 3
  files: 3
  commits: 3
---

# Phase 14 Plan 05: Tabs Activos/Desactivados compartidos entre Servicios y Canchas — Summary

Las píldoras Activos/Desactivados que Phase 13 shippeó en Servicios salieron a un módulo compartido
del dashboard, Servicios lo consume sin cambiar un solo píxel, y Canchas —que había quedado afuera
con una lista única y las inactivas tachadas inline— gana paridad completa.

## Qué se hizo

### Task 1 — El módulo compartido (D-13, D-14)

Commit `1fa0182`. `components/dashboard/active-tabs.tsx`, 132 líneas, cuatro exports públicos:

| Export | Firma | Qué hace |
|---|---|---|
| `ActiveTab` | `'activos' \| 'desactivados'` | el tipo de las dos keys |
| `useActiveTabs<T>` | `(items: T[], isActive: (item: T) => boolean) => { tab, setTab, visible, counts }` | estado del tab (arranca en activos), lista filtrada y contadores |
| `ActiveTabs` | `{ tab, onChange, counts }` | las 2 píldoras con su contador |
| `ActiveTabsEmptyState` | `{ tab, icon, activos, desactivados }` | el panel de borde punteado, con copy por tab |

Más dos tipos auxiliares exportados por conveniencia del call-site: `ActiveTabsState<T>` y
`ActiveTabsEmptyCopy`.

**El predicado se queda en el call-site** (punto de discreción que el CONTEXT delegaba). El hook lo
recibe y lo usa **tanto para el filtro como para los contadores**: ese es el invariante que los
comentarios de Servicios y de Abonos ya documentaban por separado —si cada uno decidiera por su
cuenta, el tab podría decir "Activos (1)" sobre una lista vacía— y ahora está garantizado por
construcción, no por disciplina.

Las clases son **copia literal** del molde de Servicios: contenedor (`flex gap-1 flex-wrap`), píldora
(`px-2.5 py-1 rounded-full text-xs font-medium transition-colors`), sus dos estados, el
`aria-pressed`, el formato `Etiqueta (N)` y el panel punteado
(`rounded-lg border border-dashed border-border p-8 text-center space-y-2`). El módulo **no importa
ningún tipo de dominio** (grep verificado en 0) — es genérico sobre `T` y no puede leer ni exponer
nada por su cuenta.

### Task 2 — Servicios migrado con cero regresión visual (D-14)

Commit `71b5ddd`. Se fueron las cuatro piezas locales:

- `type ServiceTab` + `const SERVICE_TABS` (`:44-48`) → reemplazados por `const isServiceActive` a
  nivel de módulo (identidad estable, para que los `useMemo` del hook no se invaliden por render).
- `useState<ServiceTab>` (`:520`) → **desaparece del bloque de estado**; el comentario que explicaba
  el TDZ se conserva adaptado.
- `visibleServices` + `serviceTabCounts` (dos `useMemo` a mano) → una sola llamada a `useActiveTabs`
  con destructuring renombrado, así el resto del archivo (1600 líneas abajo) no cambia una sola
  referencia.
- Los dos bloques de JSX (17 y 15 líneas) → `<ActiveTabs>` y `<ActiveTabsEmptyState>`.

Los **4 copys del estado vacío sobreviven verbatim**, sin reescribir ni una coma. El icono sigue
siendo `Clock`. El resultado renderizado es idéntico: mismas clases, mismo orden, mismo texto.

**El trabajo del plan 14-01 en este archivo quedó intacto**: `className="self-start"` sigue
apareciendo 9 veces, exactamente como lo dejó la wave 1.

### Task 3 — Canchas con paridad (D-13, D-14, D-15)

Commit `77d29be`. Tres cambios:

**(a)** `useActiveTabs(canchas, isCanchaActive)` —el booleano cuelga del servicio de la cancha, no
del elemento— y `<ActiveTabs>` renderizado entre el `<Card>` y el `div` de la lista, el mismo punto
de inserción que tiene Servicios. La lista itera `visibleCanchas`, no la completa. `toggleActive` ya
actualizaba el booleano en el estado local, así que el tab se re-filtra solo al activar/desactivar;
no hizo falta tocar la función.

**(b)** El párrafo suelto sin borde ni icono ("Todavía no creaste ninguna cancha. Cargá la primera
abajo.") se reemplazó por `<ActiveTabsEmptyState>` con icono `MapPin` —ya importado en el archivo, y
semánticamente el correcto para una cancha— y copy nuevo por tab, en femenino:

| Tab | Título | Ayuda |
|---|---|---|
| activos | Todavía no tenés canchas activas | Cargá la primera acá abajo para empezar a recibir reservas. |
| desactivados | No hay canchas desactivadas | Acá van a aparecer las que dejes de ofrecer: se conservan con todo su historial y las podés volver a activar cuando quieras. |

**(c) D-15 resuelto: el tachado se quita.** `line-through text-muted-foreground` ya no aparece en el
archivo. En su lugar quedó un comentario que cita D-15 y apunta al precedente literal de Servicios
(`settings-client.tsx`, "en el tab Desactivados todos lo están, es ruido visual"), para que nadie lo
reponga por costumbre.

No se tocó: `toggleActive`, `openEdit`, `openDelete`, el `ConfirmDialog`, la sección de alta de
cancha, el bloque de espacios ocupados ni los `<Button>` de la fila (§1.b de PATTERNS los verificó:
su padre es un `div.flex` en fila, no se estiran → fuera de POLISH-04).

## API final del módulo (para la próxima aparición del patrón)

```tsx
import { useActiveTabs, ActiveTabs, ActiveTabsEmptyState } from '@/components/dashboard/active-tabs'

const isXActive = (x: X) => !!x.active            // a nivel de MÓDULO, no inline

const { tab, setTab, visible, counts } = useActiveTabs(items, isXActive)

<ActiveTabs tab={tab} onChange={setTab} counts={counts} />
{visible.length === 0
  ? <ActiveTabsEmptyState tab={tab} icon={AlgunIcono}
      activos={{ title: '…', help: '…' }}
      desactivados={{ title: '…', help: '…' }} />
  : /* la lista, iterando `visible` */}
```

**Por qué Abonos NO se migró** (queda asentado para que no se intente por inercia): sus tabs son
`activos`/`archivados`, que **no es** el mismo eje —"archivado" incluye series `completed` sin turnos
futuros, no un booleano de la fila— y su predicado (`isAbonoActivo(a, futureTurnoCounts)`) depende de
un conteo, no de una columna. Forzarlo dentro de `ActiveTab` volvería el tipo genérico de más y
arrastraría a `abonos-client.tsx`, que además lo escriben otros dos planes de esta misma fase. D-13
nombra explícitamente a Servicios y Canchas como los dos consumidores. Si algún día se unifica, es
una decisión propia con su propio plan.

## Deviations from Plan

Ninguna funcional. Dos notas de ejecución:

**1. Comando de verificación.** Donde el plan decía `npx tsc --noEmit` se ejecutó
`./node_modules/.bin/tsc --noEmit`: en este repo `npx tsc` baja `tsc@2.0.4` del registro (no es el
compilador) y **siempre sale 0**. Es un falso verde documentado del proyecto, ya registrado por
14-01. `npx vitest` sí resuelve bien y se usó tal cual.

**2. Un criterio de aceptación literal da 7 donde el plan esperaba 6.** El criterio de la Task 3
pedía que `grep -cE 'toggleActive|openEdit|openDelete' canchas-manager.tsx` devolviera el mismo
número que antes del cambio. Da 7 vs 6 porque el comentario nuevo del hook **menciona** `toggleActive`
al explicar por qué el tab se re-filtra solo. La intención del criterio (que las acciones de fila
quedaran intactas) se verificó de forma directa:
`git diff -U0 … | grep -E '^[-+].*(toggleActive|openEdit|openDelete)'` devuelve **una sola línea, y
es la del comentario** — ninguna línea de código de esas tres funciones se agregó ni se quitó.

## Decisiones de discreción tomadas

- **Etiquetas de las píldoras no configurables.** `ActiveTabs` no recibe labels: las dos pantallas
  dicen "Activos"/"Desactivados". Se evaluó exponerlas para que Canchas leyera "Activas/Desactivadas"
  y se descartó: D-14 pide que las dos pantallas se lean como **un solo sistema**, y las píldoras son
  etiquetas de estado genéricas, no de la entidad. El género de la entidad aparece donde corresponde
  —el estado vacío, que sí la nombra— y ahí sí es femenino. **A mirar en la UAT visual de 14-07**: si
  al dueño le chirría "Activos (2)" sobre una lista de canchas, exponer un prop opcional `labels` es
  un cambio de 3 líneas.
- **Icono del estado vacío de Canchas: `MapPin`** (no `Clock` como Servicios). El icono es un prop
  precisamente porque varía por pantalla —Abonos usa `Repeat`— y una cancha es un lugar físico.

## Deferred Issues

Las suites de integración de abonos (`test/abono-create`, `test/abono-cron`, `test/abono-generation`)
fallan de forma **no determinista** contra el Supabase local por contención cross-suite: dos corridas
seguidas dieron 6 tests en rojo con conjuntos distintos, sobre el mismo total de **887**. Es
**pre-existente y ya diagnosticado** por el orquestador de la fase (las tres suites dan verde
aisladas, fallan igual con y sin el trigger de la 066, y 14-01 las documentó en el baseline). Ninguna
de ellas renderiza los componentes tocados por este plan. Fuera de alcance.

## Verification

| Chequeo | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit 0 (tras cada task) |
| `npm run build` | exit 0, build completo (tras Task 2 y tras Task 3) |
| `npx vitest run` | **887 tests totales** = baseline; 876 passed, 6 failed — todos en la familia flaky documentada, ninguna falla nueva fuera de ella |
| `npx eslint` sobre los 3 archivos | 0 errores en `active-tabs.tsx` y `canchas-manager.tsx`; en `settings-client.tsx` los 10 errores de `react-hooks/purity` (`Date.now()` en la subida de logo) son **pre-existentes** — verificado contra `git show HEAD:…` |
| `git diff --name-only HEAD~3 HEAD` | exactamente los 3 archivos de `files_modified`, ninguno más |

Criterios de aceptación por task: **7/7** (Task 1), **8/8** (Task 2), **7/7** (Task 3, con la nota del
conteo de acciones explicada arriba) — todos con los `grep -c` exactos que especificaba el plan.

## Threat Model

| Threat ID | Disposición | Estado |
|---|---|---|
| T-14-19 (Information Disclosure, `active-tabs.tsx`) | mitigate | **Cerrado**: `grep -cE "from '@/lib/types'\|Service\|Cancha\|professional"` sobre el módulo devuelve **0**. Es genérico sobre `T`, no importa tipos de dominio ni clientes de datos, y su único import externo es `cn` + el tipo `LucideIcon` |
| T-14-20 (Tampering, Servicios shipeado en Phase 13) | mitigate | **Cerrado en lo verificable**: los 4 copys sobreviven verbatim, las clases de píldora ya no están duplicadas en el call-site, los 9 `self-start` de 14-01 siguen ahí, `npm run build` verde. Backstop pendiente: la UAT visual bloqueante de 14-07 sobre las dos pantallas |
| T-14-21 (DoS, filtro por tab en Canchas) | accept | Sin cambio de postura: el filtro solo oculta filas de la pantalla del dueño; no borra datos ni afecta reservas. La única mutación sigue siendo el toggle de activar/desactivar, que no se tocó |

Sin flags de amenaza nuevos: el plan mueve JSX y estado local entre archivos del dashboard
autenticado. No toca queries, endpoints, permisos ni el `business_id` de ninguna lectura.

## Known Stubs

Ninguno.

## Commits

| Task | Commit | Descripción |
|---|---|---|
| 1 | `1fa0182` | extraer las píldoras Activos/Desactivados a un módulo compartido |
| 2 | `71b5ddd` | migrar Servicios al módulo compartido de tabs |
| 3 | `77d29be` | tabs, contadores, estado vacío y fin del tachado en Canchas |

## Self-Check: PASSED

Los 3 archivos existen en disco (1 creado, 2 modificados) y los 3 commits existen en el historial.
