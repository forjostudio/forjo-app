---
phase: 17-superficie-y-polish
plan: 03
subsystem: ui
tags: [react, nextjs, tailwind, supabase, multi-tenant, forms, a11y, mobile]

# Dependency graph
requires:
  - phase: 17-superficie-y-polish
    plan: 01
    provides: "`CAPACITY_MODE_HELP` (los labels de modo en un solo lugar) y la disciplina de texto local + commit en `onBlur` que este control replica"
  - phase: 17-superficie-y-polish
    plan: 02
    provides: "el archivo `settings-client.tsx` tal como quedó tras el diálogo con scroll interno y el alta con botón al final"
  - phase: 15-cupo-unificado
    provides: "`services.capacity` como fuente única + el CHECK `services_capacity_matches_mode_chk` (migr. 068) y el gate de cambio de modo (migr. 070), que es lo que el rechazo mapea"
provides:
  - "`CapacityInlineControl`: badge de modo + stepper + guardado diferido con sus cuatro estados (D-07 + D-08)"
  - "`saveCapacityInline(svc, capacity)`: segundo write path sobre `services`, payload de una sola clave, filtrado por tenant"
  - "`savingCapacityId`: el primer estado de guardado POR FILA de este repo"
  - "`GATE_MODE_CHANGE_MESSAGE`: la copy del rechazo del gate de modo, compartida por los dos write paths"
  - "La línea de datos de la tarjeta de servicio convertida en contenedor `flex-wrap`"
affects: [17-05, uat-de-la-fase, futuros-controles-inline-de-lista]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Control inline en una línea de datos: valor local + `dirty` derivado del prop + confirmación explícita; el componente no habla con la base, devuelve `Promise<boolean>` al padre"
    - "Estado de guardado por fila (`savingId: string | null`) en vez del booleano singleton que usan los diálogos"
    - "Copy de un rechazo de la base en una constante de módulo cuando la leen dos caminos de escritura"
    - "Anillo de foco en el contenedor (`has-[:focus-visible]:ring-*`) cuando `overflow-hidden` recortaría el ring de los hijos"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "El label de modo es un `<span>` sin `onClick`, sin `role` y sin `tabIndex` (D-09): desde la tarjeta se cambia el número, nunca el modo"
  - "El payload inline es exactamente `{ capacity }` — higiene, no arreglo de un bug: el guard `IS NOT DISTINCT FROM` de la migr. 070 deja pasar el payload amplio (y `saveEditService` lo manda hoy en prod sin rebotar); mandar el modo sólo despacharía un trigger SECURITY DEFINER por cada `+` y cada `−`"
  - "El rechazo revierte el número ANTES de marcar el error: no existe el estado 'sucio pero fallado', así que nunca queda en pantalla un número que la base no tenga"
  - "Los servicios `individual` no llevan nada y su línea de datos conserva el MISMO nodo de texto de antes (`30min · $5.000`), no tres spans separados por gap: así la tarjeta del 100 % de producción se ve idéntica a la de ayer"
  - "El `title` de los botones en el piso/techo se muestra SÓLO cuando el botón está deshabilitado, y se cambió `disabled:pointer-events-none` por variantes `enabled:` para que el tooltip sea alcanzable (ver Deviations)"
  - "El anillo de foco vive en el contenedor del stepper, no en cada botón: el `overflow-hidden` que redondea las puntas recorta cualquier box-shadow de los hijos"
  - "Salida del botón 'Guardar' sin animar (unmount directo): animarla exige mantenerlo montado con un estado más y no paga — decisión escrita, no olvido"

patterns-established:
  - "Un dato de una lista puede volverse editable sin abrir un modal si (a) el estado de guardado es por fila, (b) la confirmación es explícita, (c) el rechazo revierte y (d) el mensaje sale por toast, nunca por un nodo dentro de la fila"
  - "Cuando un criterio de aceptación cuenta un literal de clase sobre el archivo entero, los comentarios NO lo repiten: se nombra el efecto ('el ancho mínimo del botón'), no la clase"

requirements-completed: [POLISH-08]

# Metrics
duration: 32min
completed: 2026-08-20
status: complete
---

# Phase 17 Plan 03: El cupo se ve y se ajusta desde la tarjeta de servicio Summary

**La lista de `/servicios` deja de esconder el modo de cupo detrás del modal: los servicios de cupo compartido muestran `Clase grupal · [−] 6 [+] lugares` en su línea de datos y el número se puede ajustar y guardar ahí mismo, con estado de guardado por tarjeta y un segundo camino de escritura sobre `services` que filtra por tenant, manda una sola clave y traduce el rechazo con la misma cadena que el diálogo.**

## Performance

- **Duration:** ~32 min
- **Completed:** 2026-08-20
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- **D-07 + D-08 salieron como UN elemento, no dos.** El badge es el control: hay un solo lugar en la tarjeta donde vive el número del cupo, que es la lección de la Phase 15 (una sola columna manda) aplicada a la pantalla.
- **Los cuatro estados de la fila están todos.** Limpio (sin botón en el DOM), sucio (aparece "Guardar", el stepper se tiñe `border-primary/50` sin mover nada, y `Escape` o volver el número a su valor original limpian la fila sin mandar nada), guardando (botón `aria-busy` + "Guardando…", stepper e input deshabilitados, sin spinner) y rechazado (revierte + `border-destructive` + `aria-invalid` durante 4 s, con el timer limpiado en el unmount).
- **El estado de guardado es por tarjeta.** `savingCapacityId: string | null` derivado en el call-site con `savingCapacityId === s.id`. Es el primer estado por fila del repo: el molde de `savingEditSvc` (booleano) no servía porque los diálogos son uno a la vez y las tarjetas son muchas.
- **El segundo write path no aflojó ninguna de las defensas del primero.** `.eq('id', svc.id).eq('business_id', business.id)` (el archivo pasó de 15 a **16** filtros por tenant), doble normalización con el piso del modo y el techo `MAX_CAPACITY`, y dos cadenas fijas — ninguna interpola el mensaje de la base, el SQLSTATE ni el nombre del servicio.
- **La copy del rechazo del gate dejó de estar escrita dos veces.** Salió a `GATE_MODE_CHANGE_MESSAGE` a nivel de módulo, sin tocarle una coma a la versión post-WR-02 de la Phase 16, y con su comentario explicativo mudado junto con ella. `saveEditService` y `saveCapacityInline` leen la misma constante.
- **Las tarjetas de hoy no cambiaron.** Los servicios `individual` (el 100 % de producción) conservan su línea de datos con el mismo nodo de texto de antes. Sin badge, el badge se vuelve señal.
- **La pill de cobertura no se movió.** Sigue en el bloque del nombre: el modo es un dato, las pills de arriba son advertencias, y D-07 separa los dos registros a propósito. Quedó comentado en el código para el próximo que proponga fusionarlos.

## Task Commits

1. **Task 1: `CapacityInlineControl` — el badge que además escribe (D-07 + D-08)** — `d7d1231` (feat)
2. **Task 2: `saveCapacityInline` — el segundo camino de escritura sobre `services`** — `f8a8a59` (feat)
3. **Task 3: La línea de datos de la tarjeta admite el control como tercer dato (D-07)** — `044e820` (feat)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` — único archivo tocado en los tres commits.
  - **Import:** se suma `Minus` a `lucide-react`.
  - **Módulo:** `GATE_MODE_CHANGE_MESSAGE` (declarada junto a `normalizeCapacity` / `CAPACITY_MODE_HELP`, con el comentario de WR-02 mudado entero) y el componente `CapacityInlineControl` (~150 líneas, después de `CapacityModeFields`).
  - **Estado:** `savingCapacityId` junto a `savingEditSvc`.
  - **Función:** `saveCapacityInline(svc, cap): Promise<boolean>` después de `saveEditService`.
  - **Tarjeta de servicio:** `const capMode` con el fallback de `openEditService`; el `<p>` de duración y precio pasa a `<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">` con el control como tercer dato, sólo si el modo no es `individual`.
- `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-05-PLAN.md` — **el guion de la UAT**, actualizado (ver abajo). No es código.

## Verification

### Gates automáticos

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit **0** (corrido tras cada task) |
| `npm run build` | exit **0** — `/servicios` y `/settings` compiladas |
| `npx vitest run test/agenda-occupancy.test.ts` | **20/20** verde (suite de 17-04, intacta) |
| `npm run dev` | levantó limpio (Next 16.2.7, ready in 746ms); `/servicios` respondió `307 → /login` sin error de runtime |
| `git diff --name-only` | exactamente `app/(dashboard)/settings/settings-client.tsx` |
| `git diff -- package.json package-lock.json components/ui/` | **vacío** (T-17-SC: cero paquetes nuevos) |

### Criterios de grep (medidos sobre el archivo entero, antes → después)

| Patrón | Esperado | Antes | Después |
|---|---|---|---|
| `CapacityInlineControl` | >= 2 | 0 | **3** |
| `Minus` | >= 2 | 0 | **2** |
| `aria-invalid` | == 1 | 0 | **1** |
| `min-w-24` | == 1 | 0 | **1** |
| `onBlur` | == 2 | 1 | **2** |
| `aria-busy` | == 1 | 0 | **1** |
| `h-11 w-11 sm:h-8 sm:w-8` | == 2 | 0 | **2** |
| `animate-in fade-in-0 slide-in-from-left-1` | == 1 | 0 | **1** |
| `motion-reduce:animate-none` | == 1 | 0 | **1** |
| `GATE_MODE_CHANGE_MESSAGE` | == 3 | 0 | **3** |
| `No se puede cambiar cómo se ocupa el cupo` | == 1 | 1 | **1** |
| `.eq('business_id', business.id)` | == 16 | 15 | **16** |
| `.update({ capacity })` | == 1 | 0 | **1** |
| `toast.success('Cupo actualizado')` | == 1 | 0 | **1** |
| `savingCapacityId` | >= 3 | 0 | **3** |
| `savingCapacityId === s.id` | == 1 | 0 | **1** |
| `service_mode_has_future_appointments` | == 2 | 1 | **2** |
| `Sin cobertura` | == 1 | 1 | **1** |
| `flex flex-wrap items-center gap-x-2 gap-y-1` | == 1 | 0 | **1** |
| `aria-hidden="true">·<` | >= 1 | 0 | **1** |
| `toast.error(…error.…)` (regex) | == 1 | 1 | **1** (la preexistente de la subida de foto) |

**Leído a ojo sobre el diff:** el label de modo es `<span className="font-medium text-foreground">{label}</span>` — sin `onClick`, sin `role`, sin `tabIndex` (D-09). La pill de cobertura no aparece en el diff: no se movió.

### Prueba de comportamiento (sustituto de los 5 pasos manuales — ver Deviations)

Los 5 pasos que el plan pide correr a 375px en `npm run dev` **no se pudieron correr con navegador** en este entorno (misma limitación que registraron 17-01 y 17-02). Se sustituyeron por una simulación de la máquina de estados del control, transcrita 1:1 desde el componente (`…\scratchpad\sim-inline-capacity.mjs`, **fuera del repo**): **18/18 PASS**.

| Paso del plan | Qué se probó | Resultado |
|---|---|---|
| 1. `individual` sin badge ni stepper | la condición del call-site con `capacity_mode` en `individual`, en `null` y en `group_class` | PASS (3 casos) |
| 2. Subir hace aparecer "Guardar"; bajar al original lo hace desaparecer sin guardar | `dirty` derivado del prop + contador de requests en 0 | PASS |
| 2b. `Escape` restaura y saca el botón | — | PASS |
| 3. Guardar manda una vez, la fila queda limpia | `onSave` → prop nuevo → resync del `useEffect` | PASS |
| 4. Estado por tarjeta | `savingCapacityId === s.id` sólo para la tarjeta que guarda | PASS |
| 6 (verificación del plan). Rechazo | `false` → el número vuelve al guardado, el botón se va, queda la marca | PASS |
| Disciplina del input (17-01) | vacío / basura vuelven al valor vigente; `1` → 2; `40000` → 99; `007` no se reescribe bajo el cursor | PASS (5 casos) |

**Lo que la simulación NO prueba y sigue siendo trabajo de la UAT humana:** que a 375px el control baje entero a su propia línea sin partirse (paso 5 del plan), que los targets midan 44px de verdad, el contraste en modo oscuro y en otra paleta, y que el toast se vea donde tiene que verse.

## Deviations from Plan

### 1. [Rule 2 - Funcionalidad faltante] El `title` del botón deshabilitado tenía que poder verse

- **Encontrado en:** Task 1.
- **Issue:** El plan pide `disabled:pointer-events-none disabled:opacity-30` (molde de `agenda-client.tsx`) **y** un `title` explicativo en el `−` del piso y el `+` del techo, con el argumento de que "un `disabled` sin explicación es un callejón". Las dos cosas juntas se cancelan: con los eventos de puntero apagados el navegador no hace hit-test sobre el botón y el tooltip nativo **nunca aparece**, así que el `title` quedaría escrito y muerto — exactamente el callejón que el UI-SPEC quiere evitar.
- **Fix:** Se conservó `disabled:opacity-30` y el apagado del hover se hizo con variantes `enabled:hover:*` en vez de `disabled:pointer-events-none`. El resultado visual es idéntico (un botón deshabilitado no reacciona al hover) y el tooltip es alcanzable. Además el `title` se renderiza **sólo** cuando el botón está en el límite (`title={atMin ? … : undefined}`): un botón usable no puede estar anunciando una regla que todavía no aplica.
- **Archivos:** `settings-client.tsx` (const `stepBtn`). **Commit:** `d7d1231`.

### 2. [Rule 3 - Colisión entre dos criterios de aceptación] El orden de las clases del wrapper

- **Encontrado en:** Task 1, confirmado al medir Task 3.
- **Issue:** El plan pide para el wrapper del control `inline-flex flex-wrap items-center gap-x-2 gap-y-1` y para la línea de datos `flex flex-wrap items-center gap-x-2 gap-y-1`, con el criterio `grep -cF` de este último **== 1**. Como `grep -F` busca subcadena, el wrapper matchea también (`inline-flex flex-wrap…` contiene `flex flex-wrap…`) y el conteo daba 2: los dos criterios no podían cumplirse a la vez.
- **Fix:** El wrapper quedó como `inline-flex items-center flex-wrap gap-x-2 gap-y-1` — mismas clases, mismo CSS, otro orden. El criterio de Task 3 da 1.
- **Archivos:** `settings-client.tsx`. **Commit:** `d7d1231`.

### 3. [Rule 3 - Colisión de conteo] Tres comentarios reescritos para no repetir literales medidos

- **Encontrado en:** Tasks 1 y 3.
- **Issue:** Los criterios cuentan literales sobre el **archivo entero**, así que un comentario que los nombra los infla: `min-w-24` daba 2 (uso + comentario), `savingCapacityId === s.id` iba a dar 2 (call-site + comentario del componente) y `Sin cobertura` daba 2 (pill + comentario de la línea de datos).
- **Fix:** Los tres comentarios nombran ahora el efecto y no la clase ("el ancho mínimo del botón", "comparando el id de esta tarjeta con el que tiene un guardado en vuelo", "la de cobertura"). Es la misma disciplina que ya había adoptado 17-02.
- **Archivos:** `settings-client.tsx`. **Commits:** `d7d1231`, `f8a8a59`, `044e820`.

### 4. [Rule 3 - Verificación manual imposible en este entorno] Los 5 pasos a 375px

- **Encontrado en:** Task 3.
- **Issue:** `/servicios` exige sesión autenticada y en este entorno no hay automatización de navegador; instalar una violaría T-17-SC (cero paquetes nuevos). Misma limitación que registraron 17-01 y 17-02.
- **Fix:** Se sustituyó por la evidencia más fuerte disponible sin navegador: `npm run build` exit 0, dev server sirviendo `/servicios` sin error de runtime, los 21 gates de grep sobre las clases exactas del UI-SPEC, y la simulación 18/18 de la máquina de estados (tabla de arriba). **El chequeo visual a 375px sigue siendo trabajo del checkpoint de UAT de la fase.**
- **Impacto:** Ninguno sobre el código.

### 5. [Rule 2 - Documentación desincronizada] El guion de la UAT decía una mentira futura

- **Encontrado en:** después de Task 3.
- **Issue:** El `<uat_script>` de `17-05-PLAN.md` avisaba que "si la tarjeta del grupal no muestra el stepper, no es un defecto — es que 17-03 no corrió todavía". Con 17-03 ya ejecutado, esa nota le habría enseñado al dueño a **ignorar** justamente el defecto que la UAT tiene que atrapar.
- **Fix:** La nota ahora dice que 17-03 se ejecutó el 2026-08-20 (con los tres SHA) y que la ausencia del stepper **sí** es un defecto reportable. Además el paso 5 se amplió con lo que este plan construyó y el plan no le había dicho al guion: la reversión sin request, el toast `Cupo actualizado`, el control bajando entero a su propia línea, y dos comprobaciones negativas (tocar el label de modo no hace nada — D-09 — y la tarjeta nunca crece con un error adentro).
- **Archivos:** `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-05-PLAN.md`.

**Ninguna deviación tocó el alcance ni el contrato de escritura.** Los cuatro `must_haves` de escritura (tenant, payload de una clave, copy propia, estado por tarjeta) se cumplen tal cual estaban escritos.

## Threat Model Compliance

| Threat | Disposición | Cómo quedó |
|---|---|---|
| **T-17-09** Tampering — write path sin filtro por tenant | mitigate | `.eq('id', svc.id).eq('business_id', business.id)`, molde literal de `saveEditService`. El archivo pasó de **15** a **16** filtros. |
| **T-17-10** Information Disclosure — internals de la base en el toast | mitigate | Dos cadenas fijas: `GATE_MODE_CHANGE_MESSAGE` (compartida) y la genérica del UI-SPEC §7.3. El único `toast.error` con una propiedad de `error` sigue siendo el preexistente de la subida de foto. |
| **T-17-11** Tampering — cupo que viola el CHECK o desborda el `smallint` | mitigate | `normalizeCapacity(n, minCapacityFor(mode))` aplicado **dos veces** (en el `onBlur` del control y en `saveCapacityInline` antes de mandar); techo `MAX_CAPACITY = 99`. La autoridad sigue siendo el CHECK de la 068. Probado en la simulación (`1` → 2, `40000` → 99). |
| **T-17-12** Elevation of Privilege — la tarjeta como camino para cambiar el modo | mitigate | Payload exactamente `{ capacity }` (grep == 1) y label de modo sin `onClick`/`role`/`tabIndex`. El rechazo del trigger de la 070 queda mapeado como **fail-safe** documentado, no como camino feliz. |
| **T-17-13** DoS (UX) — un `saving` global congelando todas las tarjetas | mitigate | `savingCapacityId` por tarjeta, apagado en **todas** las salidas de la función (antes del `if (error)`, así que también en los dos `return false`). |
| **T-17-14** Repudiation — el estado "sucio pero fallado" | mitigate | Ante `false` el control revierte al valor guardado **antes** de marcar el error; el botón desaparece solo. Marca transitoria de 4 s con el timer limpiado en el unmount. |
| **T-17-15** Tampering — un `<p>` de error empujando las tarjetas de abajo | mitigate | No hay ningún nodo de error dentro de la tarjeta: el canal es `toast.error` + `border-destructive`/`aria-invalid` en el propio stepper. |
| **T-17-SC** Supply chain | accept | `git diff -- package.json package-lock.json` **vacío**. `tw-animate-css` y `lucide-react` ya eran dependencias. |

## Known Stubs

Ninguno. El control escribe contra `services` de verdad y la tarjeta lee el dato real; no quedó ningún valor hardcodeado ni ningún camino sin cablear.

## Threat Flags

Ninguna superficie nueva fuera del registro: el plan no agrega endpoints, ni rutas de auth, ni acceso a archivos, ni cambios de esquema. El único write path nuevo es el que el `<threat_model>` ya contempla (T-17-09 … T-17-12).

## Next Phase Readiness

- **17-03 era el último plan de la fase.** Los cinco planes están ejecutados; la fase queda **PENDIENTE DE UAT VISUAL**.
- **Lo que la UAT tiene que mirar de este plan** (pasos 4 y 5 del guion, ya actualizados en `17-05-PLAN.md`), a 375px y con **dos** servicios de cupo compartido:
  1. Un servicio `individual` se ve igual que ayer: sin badge, sin stepper.
  2. El grupal muestra `Clase grupal · [−] 6 [+] lugares`, y el control baja **entero** a su propia línea sin partirse entre el label y el stepper.
  3. Subir el cupo hace aparecer "Guardar"; bajarlo al valor original lo hace desaparecer **sin guardar nada**.
  4. Guardar dice "Guardando…", después sale `Cupo actualizado` y la fila queda limpia.
  5. Mientras uno guarda, el stepper del **otro** servicio sigue usable.
  6. Tocar el label `Clase grupal` no hace nada (D-09), y la tarjeta nunca crece con un mensaje de error adentro.
  7. El nombre del servicio sigue siendo lo primero que gana el ojo en la tarjeta — salvo mientras la fila está sucia, donde el "Guardar" domina a propósito.
- **Prueba del rechazo (opcional, recomendada):** poner un servicio grupal en un estado que el gate rechace y confirmar que el número vuelve al anterior y que el toast dice la copy propia, sin ningún fragmento del mensaje de Postgres. Ojo: por D-09 el camino inline **no manda el modo**, así que el gate de modo no debería dispararse — para forzar un rechazo real hay que provocar un error genérico (por ejemplo, cortando la red).
- **Deuda que este plan NO abrió pero conviene tener presente:** el control es el primer estado-por-fila del repo. Si mañana otra lista quiere lo mismo (precio inline, duración inline), el molde ya está — pero conviene extraerlo recién en el segundo caso, no antes.

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — FOUND (modificado, en los tres commits).
- `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-05-PLAN.md` — FOUND (guion de UAT actualizado).
- Commits `d7d1231`, `f8a8a59`, `044e820` — FOUND en `git log`.
- 21/21 criterios de grep con el valor exacto declarado; `tsc --noEmit` exit 0; `npm run build` exit 0; `vitest test/agenda-occupancy.test.ts` 20/20.
