---
phase: 19-el-panel
plan: 05
subsystem: frontend
tags: [nextjs, react, typescript, agenda, panel, chips, a11y, rpc, supabase, multi-tenant]

# Dependency graph
requires:
  - phase: 19-el-panel
    provides: "19-01: isBlockWildcard (la regla del comodin) + buildSaveHoursPayload / buildDayStatesFromRows / SavedAgendaBlock"
  - phase: 19-el-panel
    provides: "19-02: public.save_agenda_blocks(uuid, jsonb) y sus 4 codigos de dominio"
  - phase: 19-el-panel
    provides: "19-04: serviceCatalog + ServiceCatalogItem, service_ids en el bloque local, toggleBlockService y hoursDirty"
provides:
  - "ServiceChip y BlockServicesLine: la linea de servicios bajo cada franja del editor, sin abrir nada (AGENDA-05)"
  - "El chip 'Cualquier servicio': la franja sin mapeo se lee como un estado DECLARADO (AGENDA-06)"
  - "CHIPS_COLLAPSED_MAX: el umbral de colapso determinista, sin medir el DOM (D-10)"
  - "saveHours sobre el RPC: una sola llamada todo-o-nada, con el estado local re-derivado de la base"
  - "classifySaveHoursError + SAVE_HOURS_REJECT_COPY: el rechazo de Postgres traducido a copy propia"
  - "El indicador 'Cambios sin guardar' al lado del boton que ya existia"
affects: [19-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El borrador del editor se ADAPTA a la forma que espera el modulo puro y se DELEGA, en vez de reimplementar la regla con un length === 0 en el componente"
    - "Rechazo de la base -> codigo de dominio propio (funcion de modulo) -> copy del call site: el mensaje se inspecciona, nunca se muestra"
    - "Estado de VISTA (el colapso por franja) fuera del estado de configuracion, en un Set con clave dia-indice que se resetea cuando los indices dejan de corresponder"

key-files:
  created: []
  modified:
    - app/(dashboard)/agenda/agenda-client.tsx

key-decisions:
  - "isBlockWildcard se consume via un adaptador de modulo (isDraftBlockWildcard) que convierte los service_ids del borrador en filas de la puente: es la unica forma de delegar la regla sin cambiar la firma de la funcion pura ni escribir una segunda interpretacion en el JSX"
  - "El colapso se resetea entero (Set vacio) al eliminar un bloque y al cambiar de consultorio, en vez de reindexarse: reindexar seria estado de vista con logica propia, y el costo de resetear es que el dueno vuelva a tocar 'Ver todos'"
  - "El toast del servicio inactivo vive dentro de BlockServicesLine y no en el componente: es la unica rama de la linea que sabe si el chip que se toco era de un servicio de baja"
  - "Tres comentarios preexistentes se reescribieron para que los grep-guards del plan pudieran medir: dos citaban 'Guardar horarios' y uno el token de acento"

patterns-established:
  - "Pattern: cuando el estado local tiene una forma distinta a la que espera el modulo puro, se escribe un adaptador de 3 lineas al lado de la funcion y se delega — nunca se reimplementa la regla en el componente"

requirements-completed: [AGENDA-05, AGENDA-06]

# Metrics
duration: 35min
completed: 2026-08-26
status: complete
---

# Phase 19 Plan 05: La línea de servicios y el guardado atómico Summary

**El dueño ve y cambia qué se da en cada franja sin abrir nada, la franja sin mapeo se lee como "Cualquier servicio" —un estado declarado, no un hueco— y "Guardar horarios" pasó de borrar-todo-e-insertar a una sola llamada transaccional que conserva el mapeo y devuelve el estado con el que el editor se re-sincroniza.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-26T00:55:00Z
- **Completed:** 2026-08-26T01:30:00Z
- **Tasks:** 2
- **Files modified:** 1 de código

## Accomplishments

- **AGENDA-05 cerrado.** Debajo de cada franja hay una segunda línea con un chip por servicio: cero clicks para VER qué se da, un click para cambiarlo. No abre nada — el diff no agrega ni un `Dialog`, ni un `Drawer`, ni un `Popover`, ni un `Sheet`.
- **AGENDA-06 cerrado.** La franja sin mapeo muestra un chip `✱ Cualquier servicio` con borde punteado y `role="status"`, con la misma altura mínima de 44 que los chips clickeables **aunque no lo sea**: la línea mide igual con y sin él, así que prender o apagar el último chip no mueve el layout (D-17). Es informativo, no clickeable, por las dos razones que fijó el contrato visual.
- **La regla del comodín no se reimplementó.** El componente no filtra la puente: adapta los `service_ids` del borrador a la forma de una fila y delega en `isBlockWildcard`. `grep -cE "\.filter\([^)]*time_block_id"` = **0**.
- **El servicio dado de baja que sigue mapeado se ve, y dice que está inactivo.** Marcado + borde punteado + el sufijo `· inactivo` + `aria-label` completo. Ni se oculta (mentiría: la franja sigue restringida) ni se atenúa con opacidad (bajaría el contraste por debajo de AA). Es el **único** toggle de la línea que emite aviso, porque es la única acción que no se puede deshacer desde esa pantalla.
- **El colapso nunca esconde un servicio declarado.** Con más de 6 chips, en colapsado se ven **todos** los marcados + el comodín si corresponde + los no marcados hasta llegar a 6. Lo único que se colapsa son las opciones no elegidas, y la expansión es in situ.
- **El editor dejó de escribir `time_blocks`.** `grep -cE "from\('time_blocks'\)"` = **0**. La única escritura de horarios es la llamada al RPC de la 074.
- **Guardar dos veces seguidas ya no puede duplicar nada.** El estado local se re-deriva de las filas que devuelve la base con la **misma** función del inicializador (P-01). Verificado contra Postgres, no supuesto.
- **Ningún rechazo de la base llega crudo a la pantalla.** Se inspecciona `code` + `message`, se devuelve un código de dominio y la copy la pone el call site. `grep` de toasts con una propiedad de mensaje de error = **0**.
- **El `UPDATE` de la duración del turno y el descanso dejó de fallar mudo** (T-19-27): ahora chequea su error y avisa con copy que dice la verdad — los horarios sí se guardaron.
- **El indicador de estado sucio existe y no miente:** seis encendidos, **un solo** apagado, y sólo tras un guardado exitoso.
- Cero dependencias nuevas, cero componentes de registry, cero media queries nuevas, cero `useEffect` nuevo.

## Task Commits

| # | Task | Commit | Qué entró |
|---|------|--------|-----------|
| 1 | La línea de servicios (Bloque A) | `8585d32` | `ServiceChip`, `BlockServicesLine`, `CHIPS_COLLAPSED_MAX`, `isDraftBlockWildcard`, los gates de vertical y catálogo, la línea guía / empty state, el estado de colapso por franja |
| 2 | El guardado atómico + el indicador | `69de079` | `saveHours` entera sobre el RPC, `classifySaveHoursError`, `SAVE_HOURS_REJECT_COPY`, el chequeo del error de duración/descanso, `Cambios sin guardar` |

## Files Created/Modified

- `app/(dashboard)/agenda/agenda-client.tsx` — **único archivo de código tocado.** +383 / −34 líneas entre los dos commits. Se usó `Edit` en todos los cambios; nunca `Write` (el archivo tiene ~1.500 líneas).
- `package.json` / `package-lock.json` / `components.json` — **sin cambios**. `git status --porcelain components/ui` vacío.

## Verificación (los 12 puntos del plan)

| # | Chequeo | Esperado | Resultado |
|---|---|---|---|
| 1 | `./node_modules/.bin/tsc --noEmit` · lint | 0 / 0 | **exit 0** · eslint acotado: **1 error preexistente ajeno** (ver §Desviaciones), **0 warnings** |
| 2 | `^function (ServiceChip\|BlockServicesLine)` | 2 | **2** (las dos en columna 0, fuera del componente) |
| 3 | `save_agenda_blocks` / `from('time_blocks')` | 1 / 0 | **1 / 0** |
| 4 | `buildSaveHoursPayload` / `buildDayStatesFromRows` | 1 / 2 | **2 / 3** — el import cuenta (ver §Desviaciones) |
| 5 | `isBlockWildcard` / filtro inline sobre la puente | >=1 / 0 | **2 (import + uso) / 0** |
| 6 | toast con mensaje de error / `[agenda/save-hours]` | 0 / >=1 | **0 / 3** |
| 7 | `setHoursDirty(true)` / `setHoursDirty(false)` | 6 / 1 | **6 / 1** |
| 8 | `+` con diálogo/cajón/popover/acento/opacidad/hex/tipografía prohibida | 0 | **0** (diff completo del plan, contra `e437a5a`) |
| 9 | `min-h-11` / `min-w-11` / `aria-pressed` / `role="group"` / `role="status"` / `role="alert"` | >=3 / >=1 / >=1 / >=1 / >=1 / 0 | **4 / 1 / 1 / 1 / 2 / 0** |
| 10 | `components/ui` sucio · diff de dependencias | 0 · vacío | **0 · vacío** |
| 11 | Las dos UAT | reportadas | **ver §UAT** (la funcional, ejecutada; la visual, **NO** hecha en navegador) |
| 12 | `git diff --name-only` | 1 archivo | **exactamente `app/(dashboard)/agenda/agenda-client.tsx`** |

Extras verificados:

- `CHIPS_COLLAPSED_MAX` = **3** apariciones (la constante + dos usos) y su valor es **6**.
- `'canchas'` = **1**: el gate de vertical existe, con el mismo precedente que `/servicios` y `/equipo`.
- `Asterisk` = **2** (import + uso), `git diff -- package.json` vacío: el icono sale de la librería que ya estaba.
- `Guardar horarios` = **1** y `Cambios sin guardar` = **1**: la fase no agrega ningún CTA nuevo (D-03).
- `default_slot_duration` con `error` a ±2 líneas = **1**: el update chequea su error.
- **`validateBlocks` intacta** (P-10): la única línea del diff completo que la menciona es un **comentario** (`// bandera. \`validateBlocks\` NO la prende: ...`). Su cuerpo no tiene ni una línea `+` ni `−` — verificado leyendo el diff, no sólo contando.
- `npx vitest run test/time-block-services.test.ts test/agenda-hours-payload.test.ts` → **36/36 verdes**: los dos módulos puros que este plan consume siguen intactos.
- `npm run build` → **build de producción exitoso**, con `/agenda` compilada como ruta dinámica. Es evidencia adicional de que el árbol RSC/cliente cierra, más allá del typecheck.

## UAT

### UAT funcional (Task 2) — ✔ EJECUTADA contra el Postgres local con la 074 aplicada

Se escribió un **andamiaje temporal** (`test/__uat-19-05-save-hours.test.ts`, borrado después de correr y **no commiteado**) que ejercita el **pipeline exacto del call site**: `buildSaveHoursPayload` → `supabase.rpc('save_agenda_blocks', …)` → `buildDayStatesFromRows`, con un cliente **anon-key autenticado** como el dueño (RLS activa, igual que en producción) y los guards anti-falso-verde del molde de `test/agenda-save-blocks-rpc.test.ts`. **4 tests, 4 verdes**, cubriendo 6 de los 7 escenarios del plan.

| # | Escenario | Resultado |
|---|---|---|
| 1 | Mapear servicios a una franja, guardar, **recargar** (re-lectura independiente de `time_blocks` + `time_block_services`) | ✔ el mapeo sigue: `servicesOfBlock(lunes)` = `[svc1]`; la franja sin mapeo queda comodín |
| 2 | **Guardar dos veces seguidas sin recargar** | ✔ siguen siendo **2** filas, no 4 — P-01 cerrado en la práctica, no sólo por construcción |
| 3 | Cambiarle el horario a una franja mapeada y guardar | ✔ **el mismo `id` de fila** (UPDATE, no delete+insert), hora nueva `08:00` y `service_ids` = `[svc1]` intacto (D-02) |
| 4 | Negocio con **dos consultorios**: guardar con el editor parado en la sede A | ✔ los bloques de las **dos** sedes sobreviven (P-03 / T-19-25) |
| 5 | Apagar todos los chips de una franja y guardar | ✔ **cero** filas en la puente para esa franja e `isBlockWildcard` = `true` ⇒ el chip comodín vuelve |
| 6 | Copiar un día con mapeo a otros dos y togglear un chip en un destino | **verificado por código, no ejecutado**: `applyCopyDay` clona con `service_ids: [...b.service_ids]`, así que dos destinos nunca comparten referencia (P-04). Es la misma línea que el Plan 19-04 introdujo y verificó; este plan no la tocó. El toast condicional también es del 19-04 |
| 7 | Forzar un rechazo de la base | ✔ llamada con el `business_id` de **otro** negocio ⇒ `P0001` + `not_your_business`; el clasificador lo mapea a `reload`, la copy es propia, y **el estado local quedó byte-por-byte idéntico** (comparación de snapshot antes/después) |

**Cero contacto con producción:** el andamiaje corrió contra `NEXT_PUBLIC_SUPABASE_URL` = `127.0.0.1:54321` (kong local del proyecto `forjo-app`, verificado por `docker ps`), y la función existe en esa base en modo **invoker** (`prosecdef = f`).

### UAT visual (Task 1) — ✘ **NO EJECUTADA EN NAVEGADOR**

**No se abrió un navegador.** Se anota explícitamente porque `auto_advance` auto-aprueba los checkpoints `human-verify` sin que nadie mire la pantalla, y porque el Plan 19-04 dejó pendiente exactamente lo mismo para la fila sin stepper.

Lo que **sí** se verificó, por inspección de código y por los guards del diff:

| # | Escenario del plan | Estado |
|---|---|---|
| 1 | Franja sin servicios ⇒ chip comodín, y no se lee como campo sin llenar | **por código**: `wildcard` sale de `isDraftBlockWildcard`, el chip lleva `Asterisk` + `border-dashed` + la palabra, y es un `<span>`, no un control |
| 2 | Marcar un servicio ⇒ el comodín desaparece y la línea **no** cambia de altura | **por código**: el comodín tiene `min-h-11`, igual que el botón del chip; el chip visual es `h-7` en los dos casos. **Falta confirmarlo con el ojo** |
| 3 | Apagar el último ⇒ el comodín reaparece al instante | **por código**: sin animación de aparición (la única transición es de color) |
| 4 | 8 servicios ⇒ aparece el disparador y los marcados nunca se esconden | **por código**: el recorte sólo consume presupuesto sobre los NO marcados; con 7 marcados de 10 se ven los 7 y el disparador dice `Ver todos (10)` |
| 5 | Servicio de baja mapeado ⇒ marcado + punteado + la palabra, y aviso al quitarlo | **por código** |
| 6 | Negocio sin servicios ⇒ **una sola** línea con el enlace, no una por franja | **por código**: el gate del catálogo apaga `showServicesLine` y el `<p>` del empty state está fuera del `map` de días |
| 7 | Vertical canchas ⇒ ninguna línea de servicios | **por código**: `isCanchas` apaga la línea de todas las franjas y también la línea guía |
| 8 | Navegación por teclado con anillo de foco visible | **por código**: orden natural del DOM (hora inicio → hora fin → × → chips), `focus-visible:ring-2 focus-visible:ring-ring` en el botón externo del chip y en el disparador. **Sin verificar a mano** |

**Queda para la UAT visual de la fase, a 375px y en desktop:** los ocho escenarios de arriba, con foco especial en el **2** (que la línea no salte de alto al marcar el primer chip) y el **8** (que el anillo de foco se vea sobre los 44px del botón, no sobre el pill).

## Decisions Made

- **`isBlockWildcard` se consume por adaptador, no por reimplementación.** El editor guarda los servicios *dentro* del bloque (`service_ids`), pero la función pura pregunta por filas de la puente. En vez de escribir un `serviceIds.length === 0` en el componente —que sería una segunda interpretación de la regla del comodín— se agregó `isDraftBlockWildcard`, tres líneas que convierten el borrador a la forma que la función espera y delegan. El costo es un `map` de N elementos por franja; el beneficio es que el panel y el motor no pueden divergir nunca.
- **El colapso se resetea entero en vez de reindexarse.** Al eliminar un bloque los índices se corren y una clave guardada pasaría a apuntar a otra franja. Reindexar sería lógica propia sobre estado de vista; el costo de resetear es que el dueño vuelva a tocar "Ver todos", que es barato y no pierde nada configurado.
- **El toast del servicio inactivo vive dentro de `BlockServicesLine`.** Es la única rama que sabe si el chip que se tocó era de un servicio de baja; subirlo al componente obligaría a que el mutador genérico volviera a mirar el catálogo.
- **El clasificador de rechazos devuelve un código de dominio y la copy vive en un mapa aparte.** Es lo que pedía el molde de `deleteService`: la función que inspecciona el error no sabe nada de copy, y el call site no sabe nada de códigos de Postgres. Además hace trivial verificar que ninguna copy interpola nada de la base.
- **La `console.error` registra el `code`, nunca el `message`.** El código de Postgres alcanza para diagnosticar y no arrastra nombres de tabla ni de constraint a ningún lado. El caso de la función no expuesta suma una segunda línea explícita, porque sin ella el síntoma es indistinguible de un problema de red (P-05).
- **La línea guía va como primer hijo del contenedor de días**, no como hermano de la card. Así la separación con la primera fila de días es el `space-y-4` (16px) que fija el contrato de espaciado, sin introducir ningún valor nuevo.

## Deviations from Plan

### Aclaraciones de criterios (el código salió como el plan lo describía)

**1. `buildSaveHoursPayload` = 2 y `buildDayStatesFromRows` = 3, no 1 y 2.** El plan contó **call sites**; el `grep` cuenta también la **línea de import**. Los invariantes reales se cumplen y se verificaron leyendo el archivo:

- `buildSaveHoursPayload`: **un solo call site**, dentro de `saveHours`, alimentado con los 7 días enteros.
- `buildDayStatesFromRows`: **dos call sites** — el inicializador de `dayStates` (que ya existía) y la re-derivación post-guardado (nueva). **Si hubiera uno solo, P-01 seguiría abierto**; hay dos.

Es exactamente la misma clase de error de medición que el Plan 19-04 documentó para este mismo archivo, y que él mismo anticipó: *"El Plan 19-05 sumará el segundo call site y el total pasará a 3."*

**2. Tres comentarios preexistentes reescritos para no romper sus propios grep-guards.** Dos citaban textualmente `"Guardar horarios"` (el criterio exige que el literal aparezca **una** vez, para probar que la fase no agrega ningún CTA) y uno, nuevo, citaba el token de acento del design system (el criterio exige **cero** apariciones en el diff, para probar que el acento no entra en la línea). Los tres se reescribieron en prosa: el guard vuelve a ser útil y el porqué sigue escrito. Es el mismo tratamiento que el 19-04 le dio a dos comentarios por el mismo motivo, y el patrón que ese plan dejó establecido.

**3. `min-h-11` = 4 y `role="status"` = 2, por encima del mínimo.** Los tres usos reales de `min-h-11` son el chip, el chip comodín y el disparador del colapso; el cuarto es una mención dentro de un comentario que explica **por qué** el comodín lo lleva sin ser clickeable. Ídem `role="status"`: un uso real (el comodín) y una mención en el comentario de al lado. El indicador "Cambios sin guardar" también usa `role="status"` — está en la misma línea de código que su `<span>`, así que suma al uso, no al comentario.

### [Rule 3 — Bloqueante, heredado] `npm run lint` no puede dar exit 0 por un error preexistente ajeno

- **Encontrado en:** las dos tasks (el plan lo pone como gate en las dos).
- **Issue:** `eslint` marca **error** `react-hooks/purity` — *Cannot call impure function during render* — en `const nowMs = Date.now()` dentro del `useMemo` de la ocupación, hoy en la línea **952** de `agenda-client.tsx`.
- **Por qué NO se arregló:** vive en la **vista semanal de turnos**, que D-13 declara explícitamente fuera de alcance de la Phase 19, y el Plan 19-04 ya lo registró en `deferred-items.md` con su fix sugerido. Arreglarlo para pasar un gate de lint sería salirse del alcance del plan (SCOPE BOUNDARY).
- **Qué se hizo:** se sustituyó el gate por `./node_modules/.bin/eslint` acotado al archivo del plan, con el criterio **"cero findings nuevos"**. Resultado final: **1 error, 0 warnings** — el error es el preexistente y los **tres warnings** que el 19-04 dejó abiertos (`serviceCatalog`, `hoursDirty`, `toggleBlockService` sin consumir) **desaparecieron**, que era la señal de que este plan enchufó las tres mitades del cableado.
- **Nota de entorno:** `npm run lint` completo se corta por timeout de 2 min en esta máquina — ya reportado por los Planes 19-01, 19-02 y 19-04.
- **Sin cambio de código.** La deuda ya está registrada; no se duplica la entrada.

## Issues Encountered

- **`npm run lint` completo, inejecutable en esta máquina** (timeout de 2 min). Sustituido por `eslint` acotado, igual que en los tres planes anteriores de la fase.
- **Fin de línea:** git avisa `LF will be replaced by CRLF` sobre el archivo (herencia de la restauración que hizo el 19-04). Es cosmético y git normaliza al commitear: los dos commits muestran **264+/8−** y **119+/26−**, no el archivo entero.
- **El puerto 54321 lo comparten tres proyectos Supabase en esta máquina.** Se verificó por `docker ps` que el kong de `forjo-app` es el que está mapeado ahí antes de correr nada; `forjo-tiendas` está en 54521 y `webs-cms-forjostudio` en 55321.

## Known Stubs

Ninguno. Las tres piezas que el Plan 19-04 dejó declaradas y sin consumir están las tres enchufadas: `serviceCatalog` alimenta los chips, `toggleBlockService` es el `onClick` del chip y `hoursDirty` pinta el indicador y se apaga tras un guardado exitoso. No queda ningún componente recibiendo datos vacíos ni ningún texto placeholder.

**Lo único que este plan NO puede cerrar por diseño de la fase:** la migr. 074 sigue **sin aplicar a producción** — es el Plan 19-06. Hasta que se aplique y se recargue el cache del schema de PostgREST, un guardado de horarios en producción devolvería `PGRST202`. El código ya lo contempla: cae en la copy genérica **y** deja dos líneas en consola con el prefijo `[agenda/save-hours]` que nombran la causa real, para que el síntoma no se confunda con un problema de red (P-05 / T-19-30).

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. Las siete amenazas con disposición `mitigate` quedaron implementadas:

| Threat | Estado |
|---|---|
| **T-19-24** (filtrar el schema en un toast) | El mensaje se inspecciona en `classifySaveHoursError` y nunca sale de ahí; la copy vive en un mapa de constantes. Criterio de toasts con propiedad de mensaje de error = **0** |
| **T-19-25** (payload por sede que borra las otras) | El payload sale del constructor puro que **no acepta** consultorio, alimentado con los 7 días enteros. Verificado con el escenario de dos sedes contra la base |
| **T-19-26** (invocar la función con el id de otro negocio) | El cliente manda el `business_id` de la sesión, jamás uno de un input. La defensa real es el guard de autoría + la RLS + las FK compuestas — verificado end-to-end en el escenario 7 (`not_your_business`) |
| **T-19-27** (guardado que falla mudo) | Se chequea el error del RPC **y** el del update de duración/descanso, con registro en consola y copy distinta para cada caso |
| **T-19-28** (el indicador que miente) | Seis encendidos, un solo apagado, y sólo tras éxito |
| **T-19-29** (validar la franja sin servicios como error) | `validateBlocks` no se tocó: su cuerpo no tiene ni una línea en el diff |
| **T-19-30** (código deployado sin la 074) | Mapeado a copy propia **con** registro diagnosticable; la aplicación y verificación contra producción es el Plan 19-06 |
| **T-19-SC** (supply chain) | `git diff -- package.json package-lock.json components.json` **vacío**; `git status --porcelain components/ui` **vacío** |

## Notas para el contrato visual (anotadas, no cambiadas)

El `19-UI-SPEC.md` está LOCKED y se materializó tal cual. Dos observaciones menores, para que queden por escrito y no se pierdan:

1. **El chip comodín dice "Cualquier servicio" literal en todos los rubros**, incluso donde la terminología es "Prestaciones". El propio spec lo declara como excepción (no existe la forma singular en `lib/verticals.ts` y crearla sería capacidad nueva). Sigue siendo deuda menor.
2. **La deuda de contraste de los chips de `/equipo`** (que pintan el estado marcado con el color de acento, y no llegan a AA en tres paletas en modo claro) sigue abierta y **fuera** del alcance de esta fase, tal como el spec la anotó. Este plan divergió del molde justamente para no heredarla.

## Next Phase Readiness

Listo para el **Plan 19-06**, que cierra la fase con lo único que queda: aplicar la migr. 074 a producción, recargar el cache del schema de PostgREST, verificar los privilegios contra la base real y regenerar `supabase/schema.sql`. El código del panel ya está del lado correcto de ese deploy: si la función no está expuesta, el dueño ve copy propia y la consola dice exactamente qué falta.

Sin blockers.

## Self-Check: PASSED

- `app/(dashboard)/agenda/agenda-client.tsx` — **FOUND**
- Commit `8585d32` (Task 1) — **FOUND**
- Commit `69de079` (Task 2) — **FOUND**
- `test/__uat-19-05-save-hours.test.ts` — **ausente a propósito**: andamiaje temporal, borrado tras correr y nunca commiteado (declarado arriba, en §UAT)
