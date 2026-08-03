---
phase: 13-borrado-de-servicio-preservando-historial
plan: 02
subsystem: dashboard
tags: [read-path, helper-puro, snapshot, historial, finanzas, abonos, vitest]
status: complete

dependency_graph:
  requires:
    - "13-01 (migración 065: appointments.service_name/service_price, abonos.service_name)"
  provides:
    - "lib/appointment-service.ts — fuente ÚNICA del fallback snapshot → join (D-05)"
    - "apptServiceName / apptServicePrice / apptServicePriceOrNull"
    - "ServiceSnapshotRow (tipo estructural mínimo, acepta el embed como objeto o array)"
    - "Appointment.service_name / Appointment.service_price / Abono.service_name (lib/types.ts)"
    - "AbonoRow.service_name (abonos-client.tsx)"
  affects:
    - "13-03 (modal de borrado: ya puede borrar sin dejar el historial mudo)"
    - "13-04 (tests de integración: pueden asertar el render tras un borrado real)"

tech_stack:
  added: []
  patterns:
    - "Helper puro compartido por Server Components, Client Components y route handlers (molde lib/booking-window.ts)"
    - "Tipo estructural mínimo como parámetro: lo cumplen el Appointment completo, las filas acotadas de PostgREST y las de abonos"
    - "Ampliar el select ES parte de migrar el reduce: un select acotado sin la columna del snapshot degrada en silencio"
    - "?? y nunca ||: un precio 0 legítimo no puede colapsar con 'sin precio'"

key_files:
  created:
    - lib/appointment-service.ts
    - test/appointment-service.test.ts
  modified:
    - lib/types.ts
    - app/(dashboard)/finances/finances-client.tsx
    - app/api/export/finances/route.ts
    - app/(dashboard)/dashboard/page.tsx
    - app/(dashboard)/clients/clients-client.tsx
    - app/(dashboard)/appointments/appointments-client.tsx
    - app/(dashboard)/abonos/page.tsx
    - app/(dashboard)/abonos/abonos-client.tsx

decisions:
  - "El embed services(...) se acepta como objeto O array: supabase-js (sin tipos generados) lo INFIERE como array en los select acotados; aceptar las dos formas evita reintroducir un cast por call-site"
  - "El fallback por defecto del nombre es '—', pero los sitios que hoy no muestran guion piden apptServiceName(row, '') para no cambiar el copy (D-07: un servicio borrado no se distingue)"
  - "monthRevenue del Dashboard SÍ se migra aunque D-06 deje al Dashboard fuera: el mes en curso incluye turnos pasados y sin snapshot dejaría de coincidir con Finanzas"
  - "El CSV de Finanzas entra en alcance (D-06 ampliado): si se omitía, exportaba '—' y $0 para un servicio borrado, contradiciendo HIST-03"

metrics:
  duration: "~20 min"
  completed: 2026-08-03
  tasks: 3
  commits: 4
  files_created: 2
  files_modified: 8
---

# Phase 13 Plan 02: Read-paths de historial sobre el snapshot del servicio — Summary

El fallback **snapshot → join** de D-05 pasó de estar duplicado a mano en 12 lugares a vivir en un solo helper puro (`lib/appointment-service.ts`), y los 8 read-paths de historial lo consumen: un turno de un servicio ya borrado sigue mostrando su nombre y su precio en Finanzas, el CSV, el Dashboard, la ficha del cliente, Turnos (desktop y mobile) y Abonos.

## Qué se construyó

Un helper puro de 3 funciones + los tipos del snapshot, y la migración de todos los sitios que leían el join directo. Cero cambios de layout, clases o copy: es una migración de **origen de datos**, no de diseño.

| Tarea | Nombre | Commit | Archivos |
|-------|--------|--------|----------|
| 1 (RED) | Tests puros del fallback | `dc744db` | `test/appointment-service.test.ts` |
| 1 (GREEN) | Helper + campos de tipo | `35c9909` | `lib/appointment-service.ts`, `lib/types.ts` |
| 2 | Finanzas + CSV + `monthRevenue` | `c13230c` | `finances-client.tsx`, `export/finances/route.ts`, `dashboard/page.tsx` (+ helper/test) |
| 3 | Ficha del cliente + Turnos + Abonos | `f4a568f` | `clients-client.tsx`, `appointments-client.tsx`, `abonos/page.tsx`, `abonos-client.tsx` |

### Sitios migrados (los 8 read-paths, por archivo y forma)

| # | Archivo | Sitio | Forma |
|---|---------|-------|-------|
| 1 | `finances-client.tsx` | select del período anterior | **select** — `select('service_price, services(price)')` |
| 2 | `finances-client.tsx` | `pServices` del período anterior | reduce → `apptServicePrice(x)` |
| 3 | `finances-client.tsx` | select del chart de 6 meses | **select** — `select('service_price, services(price)')` |
| 4 | `finances-client.tsx` | `ingresos` del chart | reduce → `apptServicePrice(x)` |
| 5 | `finances-client.tsx` | `apptRevenue` | reduce → `apptServicePrice(a)` |
| 6 | `finances-client.tsx` | ranking por servicio | variable + reduce → `apptServiceName(a, 'Sin servicio')` / `apptServicePrice(a)` |
| 7 | `finances-client.tsx` | `buildDailyCashflow` | reduce → `apptServicePrice(a)` |
| 8 | `finances-client.tsx` | render de fila (tab Turnos) | render → `apptServiceName(appt, '')` / `fmtARS(apptServicePrice(appt))` |
| 9 | `app/api/export/finances/route.ts` | select del CSV | **select** — `select('date, service_name, service_price, services(name, price)')` |
| 10 | `app/api/export/finances/route.ts` | armado de `movimientos` | render (CSV) → `apptServiceName(a)` / `apptServicePrice(a)` |
| 11 | `app/(dashboard)/dashboard/page.tsx` | `monthRevenue` | reduce → `apptServicePrice(a)` |
| 12 | `clients-client.tsx` | `totalSpend` de la ficha | reduce → `apptServicePrice(a)` |
| 13 | `clients-client.tsx` | `servicesBreakdown` | reduce → `apptServiceName(a)` / `apptServicePrice(a)` |
| 14 | `clients-client.tsx` | render del historial | render → `apptServiceName(a)` / `apptServicePrice(a)` |
| 15 | `appointments-client.tsx` | render **desktop** (tabla) | render → `apptServiceName(appt)` / `apptServicePriceOrNull(appt)` |
| 16 | `appointments-client.tsx` | render **mobile** (tarjetas) | render → `apptServiceName(appt, '')` / `apptServicePriceOrNull(appt)` |
| 17 | `abonos/page.tsx` | select de la serie | **select** — `+ service_name` |
| 18 | `abonos-client.tsx` | `bookable` de la lista | variable → `apptServiceName(a, '')` |
| 19 | `abonos-client.tsx` | `bookable` del detalle | variable → `apptServiceName(a, '')` |
| 20 | `abonos-client.tsx` | condición del renglón de cancha | condición → `serviceName` derivado del helper |

**3 selects acotados ampliados** (los que degradaban en silencio): período anterior y chart de 6 meses de Finanzas, y el del CSV. Los demás usan `select('*, …')` — verificado uno por uno: el `*` ya trae `service_name` / `service_price`, así que `clients/page.tsx`, `appointments/page.tsx`, el `refresh()` de Turnos y el `monthData` del Dashboard **no se tocaron**.

## Deviaciones del plan

### Auto-arregladas

**1. [Rule 3 — Blocking] El embed `services(...)` se tipa como ARRAY en los selects acotados**

- **Encontrado en:** Tarea 2 (`tsc --noEmit` falló con 4 errores TS2345).
- **Problema:** sin tipos generados de la base, supabase-js infiere `services` como `{ price: any }[]` en `select('service_price, services(price)')` y en el del CSV. La firma original del helper (`services?: { … } | null`) rechazaba esas filas. En runtime PostgREST devuelve un objeto (relación many-to-one), así que era puramente un choque de tipos — pero "arreglarlo" con un cast por call-site habría reintroducido exactamente el cast inline que este plan vino a eliminar.
- **Arreglo:** `ServiceSnapshotRow.services` acepta objeto **o** array, y un `joinedService()` interno normaliza (`Array.isArray ? s[0] ?? null : s`). Se agregaron 3 tests (embed array con nombre, embed array con precio, array vacío → fallback).
- **Archivos:** `lib/appointment-service.ts`, `test/appointment-service.test.ts`.
- **Commit:** `c13230c`.

**2. [Forma] Dos sitios piden el nombre con fallback `''` en vez del `'—'` por defecto**

El render de fila de Finanzas y la tarjeta mobile de Turnos hoy no muestran ningún guion cuando no hay servicio (`{service?.name}` a secas), igual que la cadena `|| cancha || '—'` de Abonos. Usar el default `'—'` habría cambiado el copy en pantalla, contra la instrucción explícita del plan de no tocar copy y contra D-07. Se pasa `apptServiceName(row, '')` en esos 4 sitios (Finanzas fila, Turnos mobile, Abonos lista y detalle), documentado con un comentario en cada uno.

### Criterios de aceptación con conteo distinto al literal (intención cumplida)

| Criterio | Esperado | Real | Por qué |
|----------|----------|------|---------|
| `grep -c "apptServicePrice" dashboard/page.tsx` | 1 | **2** | El literal cuenta también la línea del `import`. Hay **un solo** call-site (`monthRevenue`); el resto del Dashboard sigue con su join directo (`page.tsx:174`), como manda D-06. |
| `grep -c "apptServiceName" appointments-client.tsx` | 2 | **3** | Ídem: 2 renders (desktop + mobile) + la línea del `import`. |
| `grep -c "apptServicePriceOrNull" appointments-client.tsx` | 2 | **3** | Ídem. |

### Criterio de aceptación NO alcanzable: `npm run lint` exit 0

`npm run lint` **falla en el baseline del repo**, sin relación con este plan: 468 errores repartidos por todo el árbol, incluidos archivos que este plan nunca toca (`.claude/gsd-core/bin/*.cjs`, `app/(dashboard)/agenda/**`, `clients-client.tsx` antes de tocarlo). Son reglas del react-compiler (`Cannot call impure function during render`, `Calling setState synchronously within an effect`). Fuera de alcance (scope boundary): no se arregló nada de eso.

Lo que sí se verificó, que es la pregunta real — **el diff no agrega ni un solo error de lint**:

- `eslint` sobre los 4 archivos de la Tarea 3 → **0 problemas**.
- `eslint` sobre los archivos de las Tareas 1–2 → 2 errores, ambos **preexistentes y en líneas que este plan no tocó**: `dashboard/page.tsx:43` (`Date.now` en render) y `finances-client.tsx:290` (`useEffect(() => { fetchData() })`).

## Verificación

| # | Criterio del plan | Resultado |
|---|-------------------|-----------|
| 1 | `npx vitest run test/appointment-service.test.ts` verde con ≥ 11 casos | **19/19 verdes** (mínimo 11) |
| 2 | `./node_modules/.bin/tsc --noEmit` exit 0 | **exit 0** |
| 3 | `npm run lint` exit 0 | **No alcanzable** (baseline roto, ver arriba). Diff sin errores nuevos |
| 4 | `npm test` completo sin regresión | **810 passed, 1 skipped, 1 failed** — el fallo es `abono-cron.test.ts > 1` (timeout de 5000ms), del baseline intermitente conocido. Aislado con `--no-file-parallelism`: **34/34 verdes** en los tres archivos de abonos |
| 5 | El write-path NO se toca (D-02) | `git diff --name-only d5e3a64..HEAD` no lista `lib/booking-core.ts` ni nada bajo `app/api/booking/` (**0 coincidencias**) |

### Criterios de aceptación por tarea

**Tarea 1**

| Patrón | Esperado | Real |
|--------|----------|------|
| `^import .*(react\|@supabase)` en el helper | 0 | **0** (el helper no importa nada) |
| líneas con `??` en el helper | ≥ 4 | **5** |
| tests verdes | ≥ 11 | **19** |
| caso `service_price: 0` con join presente asertando `0` | presente | **presente** |
| `service_price` en `lib/types.ts` | ≥ 1 | **1** |
| `service_name` en `lib/types.ts` | ≥ 2 | **2** |

**Tarea 2**

| Patrón | Esperado | Real |
|--------|----------|------|
| `from '@/lib/appointment-service'` en `finances-client.tsx` | 1 | **1** |
| `from '@/lib/appointment-service'` en `export/finances/route.ts` | 1 | **1** |
| `from '@/lib/appointment-service'` en `dashboard/page.tsx` | 1 | **1** |
| `select('service_price, services(price)')` en Finanzas | 2 | **2** |
| `service_price` en `export/finances/route.ts` | ≥ 1 | **1** |
| `(a\|x)\.services as \{` en Finanzas | 0 | **0** |
| `apptServicePrice\|apptServiceName` en Finanzas | ≥ 7 | **9** |

**Tarea 3**

| Patrón | Esperado | Real |
|--------|----------|------|
| `function getAppt(Price\|Service)` en `clients-client.tsx` | 0 | **0** |
| `getAppt(Price\|Service)\(` en `clients-client.tsx` | 0 | **0** |
| `from '@/lib/appointment-service'` en `clients-client.tsx` | 1 | **1** |
| `service_name` en `abonos/page.tsx` | ≥ 1 | **2** |
| `service_name` en `abonos-client.tsx` | ≥ 1 | **1** |
| lectura directa del join en `abonos-client.tsx` | 0 | **0** |
| `apptServiceName` en `abonos-client.tsx` | ≥ 1 | **4** |
| `git diff app/(dashboard)/clients/page.tsx` | vacío | **vacío** |

### Prueba de que no quedó ningún fallback inline

```
$ grep -rnE "services as \{" \
    "app/(dashboard)/finances/finances-client.tsx" \
    "app/api/export/finances/route.ts" \
    "app/(dashboard)/clients/clients-client.tsx" \
    "app/(dashboard)/appointments/appointments-client.tsx" \
    "app/(dashboard)/abonos/abonos-client.tsx" | grep -v "professionals as" | wc -l
0
```

(Los `professionals as { name?: string }` que quedan son otro join, fuera del alcance de este plan.)

La única ocurrencia viva del cast del servicio en todo el panel es `dashboard/page.tsx:174` — los **turnos de hoy**, que D-06 deja fuera a propósito porque son turnos vivos.

## Amenazas del plan

| Threat ID | Cómo quedó |
|-----------|-----------|
| T-13-10 | Select del CSV ampliado sólo con `service_name`/`service_price` de `appointments`; el `.eq('business_id', business.id)` de las tres queries quedó intacto (verificado en el diff) |
| T-13-11 | Los dos selects de Finanzas suman únicamente `service_price` de la propia fila; ambos conservan `.eq('business_id', businessId)` |
| T-13-12 | `git diff --name-only` no lista ninguna migración ni vista: `public_services` / `public_canchas` no se tocaron. Las columnas nuevas viven en `appointments`/`abonos` |
| T-13-13 | Orden `snapshot ?? join` con `??`; test dedicado ("el snapshot GANA aunque el join exista") en las dos funciones |
| T-13-14 | `apptServicePriceOrNull` distingue `0` de `null`; dos tests dedicados (`service_price: 0` con join presente → `0`, y `null/null` → `null`) |
| T-13-SC | No se instaló ningún paquete |

## Threat Flags

Ninguna superficie de seguridad nueva. Los tres selects ampliados agregan columnas de la propia tabla del tenant y conservan su filtro por `business_id`; no hay endpoints, rutas ni permisos nuevos.

## Notas para la próxima fase

- El helper es la **fuente única**: cualquier read-path nuevo que muestre el servicio de un turno debe importarlo, no re-escribir el ternario. Vale igual para `abonos` (misma forma estructural).
- **13-03** ya puede permitir el borrado real sin dejar el historial mudo: lo que se ve tras el `SET NULL` es lo que sostiene este plan.
- **13-04** puede asertar el render end-to-end (borrar un servicio con turnos pasados y verificar que Finanzas/ficha siguen mostrando nombre y precio); acá sólo hay tests puros del helper, sin base.
- El fallback al join sigue siendo red de seguridad real: con la 065 aún **no aplicada en prod**, hasta el deploy de 13-05 todas las filas de producción resuelven por el join. El helper funciona idéntico en los dos mundos.

## Self-Check: PASSED

- `lib/appointment-service.ts` — FOUND
- `test/appointment-service.test.ts` — FOUND
- `lib/types.ts` — FOUND (modificado)
- `app/(dashboard)/finances/finances-client.tsx` — FOUND (modificado)
- `app/api/export/finances/route.ts` — FOUND (modificado)
- `app/(dashboard)/dashboard/page.tsx` — FOUND (modificado)
- `app/(dashboard)/clients/clients-client.tsx` — FOUND (modificado)
- `app/(dashboard)/appointments/appointments-client.tsx` — FOUND (modificado)
- `app/(dashboard)/abonos/page.tsx` — FOUND (modificado)
- `app/(dashboard)/abonos/abonos-client.tsx` — FOUND (modificado)
- Commit `dc744db` — FOUND
- Commit `35c9909` — FOUND
- Commit `c13230c` — FOUND
- Commit `f4a568f` — FOUND
