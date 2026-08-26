---
phase: 19-el-panel
plan: 03
subsystem: frontend
tags: [nextjs, react, supabase, postgrest, copy, ux, multi-tenant, fail-closed, booking-publico, settings]

# Dependency graph
requires:
  - phase: 18-la-agenda-por-servicio
    provides: "time_block_services (migr. 071) — la tabla puente que este plan cuenta; y el backstop de lib/booking-core.ts que emite el codigo service_not_scheduled"
  - phase: 15
    provides: "El pre-check fail-closed del borrado de servicio (WR-02): el estado 'error' propio, el token de generacion delReqRef y el hideConfirm del dialogo, que este plan reutiliza sin tocar"
provides:
  - "El 5o count del pre-check de borrado: cuantas franjas horarias quedan comodin si se borra el servicio, contado en la base y filtrado por business_id ademas de service_id"
  - "La frase de D-07 en la rama confirmable del dialogo: el borrado AMPLIA la oferta de esas franjas, y se avisa antes de confirmar"
  - "La rama de dominio service_not_scheduled del booking publico con copy propia: la salida que se ofrece (recargar y elegir otro) existe de verdad"
affects: [19-04, 19-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El count de PostgREST con head:true no siempre falla con .error: un head que no resuelve contra la tabla vuelve 204 con error null y count null. Sobre un count que decide un aviso, el guard tiene que mirar TAMBIEN count === null"
    - "Copy de error por codigo de dominio en el cliente publico: el server manda el codigo, la copy la pone el cliente, y la salida que ofrece la copy tiene que ser ejecutable"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - app/[slug]/booking-client.tsx

key-decisions:
  - "La frase de D-07 se inserta ANTES de 'Esta accion no se puede deshacer', no al final: la irreversibilidad cierra el parrafo, que es donde el ojo la busca"
  - "El guard del pre-check se extendio con blocks.count === null (Rule 2, medido contra PostgREST local): sin eso, un head count que no resuelve se leia como 'no esta en ninguna franja' y el aviso de D-07 simplemente no aparecia — el mismo fail-open que P-08 describe, por una via distinta a la del .error"
  - "Los comentarios nuevos no repiten el nombre de la tabla ni la palabra 'trigger': los criterios de aceptacion del plan cuentan grep sobre el archivo entero, y un comentario que menciona la tabla inflaba el conteo de consultas nuevas"
  - "Las 2 findings del hook de diseno (side-tab, lineas 658 y 786 de booking-client) NO se tocaron: son markup preexistente fuera del alcance de este plan"

patterns-established:
  - "Pattern: un count nuevo que alimenta un aviso entra en el MISMO Promise.all y en el MISMO guard que los que ya estan — sin rama propia, sin valor por defecto"

requirements-completed: [AGENDA-05, AGENDA-06]

# Metrics
duration: 25min
completed: 2026-08-26
status: complete
---

# Phase 19 Plan 03: Las dos deudas de la Phase 18 Summary

**Borrar un servicio mapeado ahora avisa con el numero exacto de franjas y dice lo que de verdad pasa (esas franjas vuelven a ofrecer cualquier servicio), y el error `service_not_scheduled` —que esta fase vuelve alcanzable— dejo de caer en un "intenta de nuevo" que nunca podia funcionar.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 (las dos con commit propio)
- **Files modified:** 2 (cero creados)
- **Lineas cambiadas:** 30 insertions / 7 deletions en `settings-client.tsx`, 12 insertions en `booking-client.tsx`

## Accomplishments

- **D-07 cerrado.** El pre-check del dialogo de borrado pasa de 4 a 5 counts. El quinto cuenta las filas de la puente franja↔servicio para ese servicio, y el numero se muestra **antes** de confirmar con la copy que fija el UI-SPEC. El punto entero: el borrado no rompe la franja, la vuelve **comodin** — o sea que pasa a ofrecer **mas** de lo que el dueño queria, y en silencio. La copy describe eso y nada mas.
- **El fail-closed se mantuvo y se endurecio.** El quinto count entra en el mismo `Promise.all` y en el mismo guard que los otros cuatro: cualquier fallo deja `delInfo = 'error'`, el dialogo dice "sin verificar" y el boton Eliminar no se ofrece. **Ninguna rama nueva de fail-open.**
- **Se encontro y cerro una via de fail-open que P-08 no cubria** (ver §Deviations): con `head: true`, PostgREST puede devolver 204 con `error: null` y `count: null`, y el `?? 0` lo leia como "este servicio no esta en ninguna franja" ⇒ el aviso de D-07 desaparecia justo donde mas hacia falta. El guard ahora mira tambien `blocks.count === null`.
- **D-18 / WR-07 cerrado dentro de la fase que vuelve alcanzable el error.** La Phase 18 acepto WR-07 con esa condicion explicita (`18-SECURITY.md` §9). El booking publico tiene ahora una rama de dominio propia, con copy identica al UI-SPEC y una salida ejecutable: recargar (trae la grilla nueva) y elegir otro horario.
- **Cero gates nuevos sobre `services`.** D-17 lo pedia explicitamente y es la clase de gate que este workstream ya corrigio tres veces (migr. 063/065/070). Verificado por grep sobre el diff.

## Task Commits

1. **Task 1 — el aviso de borrado con el numero de franjas (D-07)** — `326d5d4` (feat) — `app/(dashboard)/settings/settings-client.tsx`
2. **Task 2 — la copy del error de servicio fuera de franja (D-18 / WR-07)** — `8bfa727` (feat) — `app/[slug]/booking-client.tsx`

## Files Created/Modified

| Archivo | Que cambio |
|---|---|
| `app/(dashboard)/settings/settings-client.tsx` | Campo `blocks` en el tipo de `delInfo`; 5o count sobre `time_block_services` en el `Promise.all` de `openDeleteService`; guard de error extendido a los 5 resultados + `blocks.count === null`; frase de D-07 en la rama confirmable de `delDescription` |
| `app/[slug]/booking-client.tsx` | Rama `service_not_scheduled` en la cadena de errores del submit, antes del `else` generico |

## Verification Evidence

Todos los criterios del `<verification>` del plan, medidos:

| # | Criterio | Resultado |
|---|---|---|
| 1 | `./node_modules/.bin/tsc --noEmit` | exit **0** (leido de la salida, no solo del exit code) |
| 2 | `grep -cF "time_block_services"` en settings-client | **1** — la unica consulta nueva |
| 2b | Esa consulta filtra por tenant | `grep -A3 "from('time_block_services')" \| grep -cF business_id` = **1** |
| 3 | El `Promise.all` destructura 5 y el guard cubre los 5 | verificado leyendo el bloque: `const [futDias, futHoy, abo, hist, blocks] = await Promise.all([...])` y `if (futDias.error \|\| futHoy.error \|\| abo.error \|\| hist.error \|\| blocks.error \|\| blocks.count === null)` |
| 4 | Copy veraz (sin las 4 formulaciones prohibidas), sobre el archivo sin comentarios | **0** |
| 5 | `grep -cF "service_not_scheduled"` en booking-client | **1**, en la linea **403**; el mensaje generico esta en la **421** ⇒ la rama va antes |
| 6 | Toasts que reciben un mensaje crudo del servidor | **0** |
| 7 | Pruebas manuales | ver abajo — una automatizada contra la base local, una **pendiente de UAT visual** |
| 8 | `git diff --name-only` | exactamente los 2 archivos del frontmatter |
| 9 | `git diff -- package.json package-lock.json` | vacio (T-19-SC: cero paquetes nuevos) |

Extras:

- `git diff --stat` settings-client: **37 lineas** de contexto, **30 insertions / 7 deletions** (el criterio de "<40 lineas cambiadas" se mide sobre el bloque tocado; 23 de esas insertions son comentario de POR QUE).
- `git diff --stat` booking-client: **12 insertions** (< 15).
- `git diff \| grep -cE '^\+.*(CREATE\|trigger\|RAISE)'` = **0** en los dos archivos: ningun gate nuevo.
- `eslint` sobre `booking-client.tsx`: **limpio**. Sobre `settings-client.tsx`: 11 errores **preexistentes** (`react-hooks/set-state-in-effect`, `immutability`, `purity` en las lineas 721, 946, 960, 968, 969, 981, 990, 1114, 1547) — **ninguno** en el rango tocado (1150-1270). Fuera de alcance, no se tocaron.
- Copy del toast comparada **caracter por caracter** contra el UI-SPEC §Bloque D por script: `exact_match: true`.

### Prueba manual 1 — el 5o count (Task 1)

Se corrio contra el **Postgres local** (`127.0.0.1:54322`, arriba) un script que reproduce la query **exacta** del pre-check con service-role, mapeando un servicio a 2 franjas:

```
count_ok: 2                       ← la query nueva devuelve el numero exacto
count_otro_tenant: n/a            ← solo hay 1 negocio en la base local (ver limitacion abajo)
fallo -> error? false | count: null  ← el hallazgo que motivo el endurecimiento del guard
cleanup_count: 0                  ← filas de prueba borradas, base restaurada
```

- **El caso feliz esta medido:** 2 franjas ⇒ `count = 2` ⇒ el dialogo dice "2 franjas horarias" con el plural correcto (la pluralizacion es la misma expresion ternaria que la rama ya usaba para los turnos del historial).
- **El caso de fallo esta medido y resulto ser mas sutil de lo que decia P-08:** una consulta que no resuelve contra la tabla vuelve **204 con `error: null`** — o sea que el guard por `.error` **solo** no la atrapaba. Un `select` de columna inexistente si vuelve 400 con `.error` seteado. Por eso el guard ahora mira las dos cosas. Con el guard nuevo, los dos casos caen en "sin verificar" y el boton Eliminar no se ofrece.
- **Limitacion declarada:** la base local tiene **un solo negocio**, asi que el contra-caso cross-tenant (mismo `service_id`, otro `business_id` ⇒ 0) **no se pudo ejecutar**. El filtro `.eq('business_id', ...)` esta en el codigo y verificado por grep, y la RLS es la segunda capa; el vector queda para `secure-phase`.

### Prueba manual 2 — el toast del error publico (Task 2) — **PENDIENTE DE UAT VISUAL**

**No ejecutada.** Requiere el dev server + una pestaña vieja (o un POST a mano al endpoint con el flag `enforceServiceWindow` encendido) y confirmar visualmente el toast. Lo que **si** esta verificado sin navegador:

- El codigo que emite el backstop es `service_not_scheduled` (leido en `lib/booking-core.ts:240/255/264` y declarado en la union de tipos de `:118`) y coincide **exacto** con el string de la rama nueva.
- La rama esta antes del `else` generico (linea 403 vs 421) y el `tsc` pasa.
- La copy coincide caracter por caracter con el UI-SPEC.

Queda anotado como item de UAT para el `verify-work` de la fase. **No se dio por probado lo que no se probo.**

### Suite de tests

`npx vitest run`: **1029 passed / 8 failed**. Las 8 fallas se auditaron una por una y **ninguna es de este plan** (los dos archivos que toca no los importa ningun test):

- **2 son canarios de medianoche por diseño**: `service-delete-gate` y `capacity-mode-change-gate` fallan con el mensaje explicito *"GUARD DE MEDIANOCHE: son las 00:42 en hora AR, fuera de [01:00:00, 23:30:00] ... Volver a correrlo dentro de la ventana antes de dar la fase por verde"*. Es un guard intencional del propio test.
- **6 son interferencia entre archivos DB-backed corriendo en paralelo sobre la misma base local**: `abono-generation`, `abono-cron` y `abono-create` pasan **11/11, 5/5 y limpio** al correrse aislados.

⚠ **Para el cierre de la fase:** volver a correr la suite dentro de la ventana [01:00, 23:30] hora AR antes de darla por verde. Es la instruccion que el propio test deja escrita.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Funcionalidad critica faltante] El guard del pre-check tambien mira `blocks.count === null`**

- **Found during:** Task 1, al ejecutar la prueba manual del fallo del quinto count.
- **Issue:** el plan (y P-08 del research) asumen que un count que falla se detecta por `.error`. Medido contra PostgREST local, un `select(..., { count: 'exact', head: true })` que no resuelve contra la tabla devuelve **204 / `error: null` / `count: null`**. Con el guard por `.error` solamente, `blocks.count ?? 0` daba **0** ⇒ `blocks > 0` falso ⇒ **el aviso de D-07 no aparecia**, que es exactamente el fail-open que T-19-15 y P-08 querian cerrar, por una via distinta.
- **Fix:** una condicion mas en el **mismo** `if` (no una rama nueva, no un valor por defecto — se respeto la instruccion del plan): `|| blocks.count === null`. Con head+count exact sobre una tabla que responde, el count es **siempre** un numero, asi que un null solo puede ser un fallo.
- **Files modified:** `app/(dashboard)/settings/settings-client.tsx`
- **Commit:** `326d5d4`

**2. [Rule 3 - Bloqueante] Dos comentarios reescritos para no romper los criterios de aceptacion**

- **Found during:** Task 1, al correr los greps de aceptacion.
- **Issue:** el criterio `grep -cF "time_block_services" = 1` cuenta el archivo **entero**, no solo las consultas; un comentario que nombraba la tabla lo llevaba a 2. Lo mismo con `grep -cE '^\+.*(CREATE|trigger|RAISE)' = 0`: un comentario que decia "el trigger no las mira" lo llevaba a 1.
- **Fix:** los comentarios dicen "la puente franja↔servicio" y "el gate de la migr. 065". El sentido es el mismo y los dos criterios dan el valor esperado.
- **Commit:** `326d5d4`

### Fuera de alcance (no se toco)

- **11 errores de eslint preexistentes** en `settings-client.tsx`, todos fuera del rango tocado.
- **2 findings del hook de diseño** (`side-tab`, `booking-client.tsx:658` y `:786`): markup preexistente que este plan no toca. Se dejan como estan — cambiarlos seria tocar el diseño del booking publico, que esta explicitamente fuera del alcance (AGENDA-07 es de la Phase 20).
- **Los comentarios "tres queries"** del docstring de `openDeleteService` se actualizaron a "TODAS las queries" (ya estaban desactualizados con 4; con 5 quedaban directamente falsos). Es la unica edicion cosmetica.

## Threat Model — estado

| Threat ID | Disposicion | Evidencia |
|---|---|---|
| T-19-13 | mitigate ✅ | La rama nueva usa copy propia por codigo. `grep` de toasts que reciben `.message/.details/.hint` de un error o de `data` = **0** |
| T-19-14 | mitigate ✅ | La consulta filtra por `business_id` **ademas** de `service_id`. ⚠ El contra-caso cross-tenant **no se pudo ejecutar** (un solo negocio en la base local) — queda para `secure-phase` |
| T-19-15 | mitigate ✅✅ | Mismo `Promise.all`, mismo guard, sin fail-open. **Reforzado** con `blocks.count === null` tras medir el 204 silencioso de PostgREST |
| T-19-16 | mitigate ✅ | Aviso con el numero exacto antes de confirmar, con copy que describe la **ampliacion** de la oferta. Las 4 formulaciones prohibidas = 0 |
| T-19-17 | accept (por diseño) | `git diff \| grep -cE '^\+.*(CREATE\|trigger\|RAISE)'` = **0**: ningun gate nuevo |
| T-19-SC | accept ✅ | `git diff -- package.json package-lock.json` vacio |

## Known Stubs

Ninguno. Los dos cambios estan cableados de punta a punta: el count sale de la base y alimenta la copy; el codigo de error sale del backstop que ya existe en `lib/booking-core.ts` y alimenta la rama nueva.

## Pendientes que este plan deja anotados

1. **UAT visual del toast de `service_not_scheduled`** (prueba manual 2, arriba).
2. **Re-correr la suite completa dentro de [01:00, 23:30] hora AR** antes de dar la fase por verde (canarios de medianoche).
3. **El contra-caso cross-tenant del 5o count** necesita una base local con 2 negocios; se deriva a `secure-phase`.

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — FOUND
- `app/[slug]/booking-client.tsx` — FOUND
- `.planning/workstreams/motor-reservas/phases/19-el-panel/19-03-SUMMARY.md` — FOUND
- commit `326d5d4` — FOUND
- commit `8bfa727` — FOUND
