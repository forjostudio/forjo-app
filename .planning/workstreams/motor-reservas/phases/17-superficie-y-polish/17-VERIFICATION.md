---
phase: 17-superficie-y-polish
verified: 2026-08-20T00:00:00Z
status: human_needed
score: 5/5 must-haves verified (code-level); 0 overridden
behavior_unverified: 4
overrides_applied: 0
re_verification: null
behavior_unverified_items:
  - truth: "Tocar la fila de una clase grupal abre el roster con los inscriptos correctos (D-04/D-10)"
    test: "En /agenda, con Yoga grupal (3 turnos a las 09:00) y Pilates reformer (1 turno, mismo horario), tocar la fila de Yoga a 375px"
    expected: "Se abre un Dialog/Drawer con título 'Yoga grupal · vie 21 de ago · 09:00', lista a Ana, Bruno y Carla (NO a Dora), contador '3/6 lugares ocupados'"
    why_human: "La apertura del diálogo es interacción de cliente (setRosterSlot + estado React); no hay navegador ni automatización headless en este entorno, así que solo se pudo confirmar por lectura de código que el <button> es único, su onClick es correcto, y que `roster` recupera la MISMA entrada por (date,time,serviceId). El SSR autenticado llega hasta el HTML inicial, no hasta el click."
  - truth: "El editor de servicio y el control inline de la tarjeta funcionan con teclado real en el navegador (borrar el número, tipear otro, Tab, Escape) a 375px"
    test: "En /settings → Servicios, editar un servicio grupal: borrar el '2' del campo de cupo, tipear '6', hacer Tab afuera; en la tarjeta, usar +/- del stepper, Escape con foco dentro del grupo"
    expected: "El campo acepta el vacío sin reescribirse bajo el cursor; al salir se normaliza al piso del modo; Escape revierte el stepper al valor guardado"
    why_human: "Verificado por lectura directa del código (la disciplina onChange-sin-clamp + onBlur-normaliza está implementada correctamente) y por una simulación de máquina de estados fuera del repo (no verificable por el propio verificador), pero ningún test automatizado ni sesión de navegador ejercitó el teclado real."
  - truth: "El bloque de modo (D-13) y el control inline (D-08) se ven correctamente a 375px: sin caja dentada, el control baja entero a su propia línea, 44px de alto en los targets táctiles"
    test: "DevTools a 375px en /settings → Servicios, abrir el editor de un servicio y mirar la tarjeta de un servicio de cupo compartido"
    expected: "Tres opciones de modo en una columna sin envolver mal; el control `Clase grupal · [−] 6 [+] lugares` no se parte entre el label y el stepper"
    why_human: "Las clases Tailwind están confirmadas en el código exactamente como las prescribe 17-UI-SPEC.md, pero el resultado visual real (renderizado, wrap, contraste) requiere un navegador — no disponible en este entorno."
  - truth: "El contraste y la legibilidad se sostienen en modo oscuro y en otra paleta (10º paso del uat_script)"
    test: "Repetir los pasos 4, 7 y 9 del guion de UAT con dark mode activo y con una paleta distinta a la default"
    expected: "Ningún texto pierde contraste WCAG AA"
    why_human: "Depende de next-themes + data-palette en runtime; no hay forma de confirmarlo por grep ni por SSR estático sin iterar temas en un navegador real."
gaps: []
deferred: []
---

# Phase 17: Superficie y polish — Verification Report

**Phase Goal:** Que el dueño entienda en pantalla lo que la Phase 15 volvió declarable, y que las
superficies del panel dejen de leer la fuente equivocada. Sin migración, sin cambio de motor.

**Verified:** 2026-08-20
**Status:** human_needed
**Re-verification:** No — verificación inicial

## Goal Achievement

### Observable Truths (Success Criteria del ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El editor EXPLICA la diferencia entre grupal y simultáneo con el eje de conteo (no dos labels intercambiables) — CUPO-09 | ✓ VERIFIED (código) | `CAPACITY_MODE_HELP` (settings-client.tsx:197-218) tiene las 3 capas exigidas por D-01 (label + `axis` + `example` + `warning?`) para los 3 modos; el bloque explicativo (líneas 380-406) renderiza SIEMPRE los tres grupos, sin `onClick`/`role`/`tabIndex` (D-02 confirmado por lectura directa); `individual` sin `warning` pero con `example` (D-01). Calidad visual final (¿se leen como 3 bloques, no 9 líneas?) → ver human_verification #3. |
| 2 | Los 3 defectos de la UAT cerrados: cupo editable con teclado, toggles alineados, alta confirma con "Guardar" al final — CUPO-09 | ✓ VERIFIED (código) | Campo de cupo: `onChange` NO clampea (solo `setCapacityText`), `onBlur` normaliza con `normalizeCapacity(n, minCapacityFor(value))` (líneas 422-439) — el bug original (`normalizeCapacity(parseInt(...))` en cada tecla) ya no existe (`grep -cE 'normalizeCapacity\(parseInt'` = 0). Toggles: grid `grid-cols-1 ... sm:grid-cols-3` (línea 316), reemplaza el flex-wrap viejo. Alta: botón "Agregar servicio" al final del bloque (línea 2238) con guard `savingNewSvc` (declarado línea 916, usado en guard de reentrada línea 1029 y en `disabled`/texto línea 2237-2238) — sin doble submit. Interacción real de teclado → ver human_verification #2. |
| 3 | `/servicios` muestra el modo de cada servicio sin abrirlo — POLISH-08 | ✓ VERIFIED (código) | `CapacityInlineControl` en la línea de datos de la tarjeta (línea 2145), condicionado a `capMode !== 'individual'` (línea 2140) — los servicios `individual` NO muestran nada (D-07 confirmado). El label de modo es `<span className="font-medium text-foreground">{label}</span>` sin `onClick`/`role`/`tabIndex` (línea 549) — D-09 confirmado por lectura directa. Segundo write path `saveCapacityInline` filtra por tenant (`.eq('business_id', business.id)` cuenta 16, antes 15), payload de una sola clave (`.update({ capacity })` cuenta 1), copy compartida `GATE_MODE_CHANGE_MESSAGE` (cuenta 3: declaración + los dos write paths) sin interpolar `error.message` (el único `toast.error` con interpolación de error en el archivo es el preexistente de subida de foto, no tocado por esta fase). |
| 4 | La grilla de la agenda computa la ocupación desde `services.capacity` (misma fuente que el motor) y muestra ocupación GRUPAL con el mismo tratamiento que ya tenía el simultáneo — POLISH-09 | ✓ VERIFIED (código + mutación + datos reales) | `lib/agenda-occupancy.ts` es un módulo puro (`grep -c '^import'` = 0) que decide el cupo por `services.capacity` (nunca recibe `time_blocks`) y el modo por `capacity_mode === 'group_class'` (nunca por el número). En `agenda-client.tsx`: `capacityFor(` = 0, `const isGroup` = 0, `capacity_mode ===` = 0 (confirmado independientemente por el verificador). Las dos garantías críticas (D-10: `service_id` en la clave del grupo; guard de hold vivo en `occupiesSeat`) están probadas por MUTACIÓN — **reproducido independientemente por el verificador**: mutar la clave del grupo hace fallar los casos 1 y 4; mutar el guard de hold vivo hace fallar los casos 2 y 15; restaurado, 20/20 verde. Además, el fixture descrito en el SUMMARY 05 (Yoga grupal cap.6, Pilates reformer cap.4, Corte individual, Color simultáneo cap.2, con Ana/Bruno/Carla/Dora/Elsa en las fechas y horarios exactos) fue confirmado presente en el Postgres local por el verificador vía consulta SQL directa, corroborando que la verificación por HTML renderizado del ejecutor no fue inventada. `OccupancyBadge` es un único componente consumido por los dos modos (`<OccupancyBadge` = 2). Apertura real del roster por click → ver human_verification #1. |
| 5 | Finanzas en mobile muestra el servicio de cada movimiento — POLISH-10 | ✓ VERIFIED (código) | `finances-client.tsx` línea 899-903: el nombre del cliente en `min-w-0 flex-1`, el servicio como segunda línea `sm:hidden` (solo si `svc` no vacío), la columna `hidden sm:block` preexistente intacta — las dos visibilidades son complementarias, nunca se ven a la vez. `apptServiceName` reusado (no reimplementado), fecha/precio/botón no se movieron. |

**Score:** 5/5 truths con implementación de código verificada. 4 aspectos quedan como
PRESENT_BEHAVIOR_UNVERIFIED (comportamiento interactivo/visual real en navegador) — ver tabla de
Human Verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/agenda-occupancy.ts` | Módulo puro con `buildDayEntries`, `computeOverlapFull`, `capacityOf`, `occupiesSeat`, `timeToMin` | ✓ VERIFIED | 221 líneas, cero imports, exporta las 5 funciones + tipos. Leído completo por el verificador. |
| `test/agenda-occupancy.test.ts` | 20 casos, 2 discriminantes por mutación | ✓ VERIFIED | `vitest run` → 20 passed (reproducido). Las 2 mutaciones (clave sin `service_id`; `occupiesSeat` sin guard) reproducidas independientemente por el verificador — ambas ponen en rojo exactamente los casos previstos (1+4 y 2+15). Restaurado a verde. |
| `app/(dashboard)/settings/settings-client.tsx` → `CAPACITY_MODE_HELP` + `CapacityModeFields` + `CapacityInlineControl` + `saveCapacityInline` | Explicador de 3 capas, input onBlur, badge-que-edita, segundo write path | ✓ VERIFIED | Todo el código leído línea por línea; coincide con `17-CONTEXT.md` D-01/D-02/D-03/D-04/D-05/D-06/D-07/D-08/D-09/D-13 y con `17-UI-SPEC.md`. |
| `app/(dashboard)/agenda/agenda-client.tsx` → `entriesByDate` + `OccupancyBadge` + línea de grupo colapsada | Consume el módulo puro, un solo `Date.now()`, una fila por slot grupal | ✓ VERIFIED | `entriesByDate` (6 ocurrencias), `Date.now()` (1 ocurrencia), `OccupancyBadge` (1 función + 2 usos). `apptsByDate` viejo (0), `capacityFor(` (0). |
| `app/(dashboard)/finances/finances-client.tsx` | Segunda línea de servicio en mobile | ✓ VERIFIED | `sm:hidden` (1), `hidden sm:block` (1, preexistente intacto), `min-w-0 flex-1` (1). |
| `components/ui/dialog.tsx` | NO tocado (patrón por-caller) | ✓ VERIFIED | `git diff c07e3da..HEAD -- components/ui/dialog.tsx` vacío. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `CAPACITY_MODE_HELP` | radiogroup de modo | mismos labels, un solo array | ✓ WIRED | `label: 'Clase grupal'` aparece 1 sola vez en el archivo; radiogroup y explicador leen el mismo array. |
| `agenda-client.tsx` | `lib/agenda-occupancy.ts` | `import { buildDayEntries, computeOverlapFull, type DayEntry } from '@/lib/agenda-occupancy'` | ✓ WIRED | Confirmado, 1 ocurrencia del import. `git diff -- lib/ test/` vacío tras el plan 17-05 (el consumidor no ajustó el módulo para que le cierre). |
| Línea de grupo de la columna | roster del slot | `rosterSlot` con `{date,time,serviceId}`, el roster recupera (no recalcula) la misma entrada de `entriesByDate` | ✓ WIRED | Código leído: `roster` hace `.find(e => e.kind === 'group' && e.time === time && e.serviceId === serviceId)` sobre `entriesByDate.get(date)` — estructuralmente no puede divergir de lo pintado. |
| `CapacityInlineControl` | `saveCapacityInline` | `onSave` retorna `Promise<boolean>`; `false` revierte antes de marcar error | ✓ WIRED | Código leído: `handleSave` llama `revert()` antes de `setRejected(true)` en el camino de rechazo — sin estado "sucio pero fallado". |
| `saveCapacityInline` | `services` (PostgREST) | `.update({ capacity }).eq('id', svc.id).eq('business_id', business.id)` | ✓ WIRED | Confirmado por lectura directa; conteo de `.eq('business_id', business.id)` en el archivo = 16 (era 15 antes de esta fase). |

### Behavioral Spot-Checks / Verificación independiente

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `tsc --noEmit` en HEAD | `./node_modules/.bin/tsc --noEmit` | exit 0 | ✓ PASS (reproducido por el verificador) |
| Suite pura de ocupación | `npx vitest run test/agenda-occupancy.test.ts --no-file-parallelism` | 20 passed, 0 failed | ✓ PASS (reproducido por el verificador) |
| Mutación 1: clave de grupo sin `service_id` | edición temporal de `lib/agenda-occupancy.ts` + vitest | 2 failed (casos 1 y 4), restaurado a 20/20 | ✓ PASS — confirma que D-10 es una garantía real, no cosmética |
| Mutación 2: `occupiesSeat` sin guard de hold vivo | edición temporal + vitest | 2 failed (casos 2 y 15), restaurado a 20/20 | ✓ PASS — confirma que el descarte del hold vencido es real |
| Fixture de agenda en Postgres local | `psql` directo sobre `services`/`appointments` de `negocio-prueba` | Yoga grupal (group_class, cap 6), Pilates reformer (group_class, cap 4), Corte (individual), Color (simultaneous_resource, cap 2); turnos de Ana/Bruno/Carla (09:00, Yoga), Dora (09:00, Pilates), Elsa (11:00, Corte) — coincide EXACTO con lo que el SUMMARY 05 dice haber verificado por SSR | ✓ PASS — corrobora que la verificación del ejecutor no fue inventada |
| Build de producción | `npm run build` | "Compiled successfully in 2.7min"; el paso posterior de chequeo de tipos del worker terminó con código 143 (interrumpido en este entorno, no un fallo de tipos — `tsc --noEmit` ya lo cubrió de forma independiente y completa) | ✓ PASS (con nota) |
| Diff de archivos tocados | `git diff c07e3da..HEAD --stat` | Exactamente los 5 archivos de código esperados (`settings-client.tsx`, `agenda-client.tsx`, `finances-client.tsx`, `lib/agenda-occupancy.ts` nuevo, `test/agenda-occupancy.test.ts` nuevo) + artefactos de planificación | ✓ PASS |
| Archivos fuera de alcance | `git diff -- package.json package-lock.json components/ui/ "agenda/page.tsx" lib/verticals.ts` | vacío | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| CUPO-09 | 17-01, 17-02 | ✓ SATISFIED (código) | Explicador de 3 capas + input onBlur (17-01); diálogo con scroll interno + alta con botón al final (17-02). ⚠ **REQUIREMENTS.md checkbox marcado `[x]` pero la tabla de traceability al final del archivo todavía dice "Pending"** — desincronización de documentación, no del código (ver Gaps/Notas). |
| POLISH-08 | 17-03 | ✓ SATISFIED (código) | `CapacityInlineControl` + `saveCapacityInline`. Misma nota de desincronización de REQUIREMENTS.md que CUPO-09. |
| POLISH-09 | 17-04, 17-05 | ✓ SATISFIED (código + mutación) | Módulo puro + cableado de la grilla. Traceability table de REQUIREMENTS.md YA actualizada a "Complete" — consistente. |
| POLISH-10 | 17-04 | ✓ SATISFIED (código) | Segunda línea de servicio en mobile. Traceability table ya "Complete" — consistente. |

No hay requisitos huérfanos: los 4 IDs del alcance de la fase (CUPO-09, POLISH-08, POLISH-09, POLISH-10) están declarados en algún `requirements:` de PLAN frontmatter y los cuatro tienen evidencia de código.

### Anti-Patterns Found

Ninguno. Escaneados los 5 archivos de código de la fase (`grep -nE "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` case-insensitive): los únicos hits son el texto legítimo "placeholder" de atributos HTML, el import `RUBRO_PLACEHOLDERS` (nombre de símbolo preexistente) y la palabra española "todo/todos" (nada que ver con el marcador `TODO`). Sin marcadores de deuda sin resolver, sin `return null`/`{}`/`[]` sospechosos, sin datos hardcodeados que alimenten renderizado.

### Gaps Summary

**Sin gaps de código.** Los 5 archivos tocados (`settings-client.tsx`, `agenda-client.tsx`,
`finances-client.tsx`, `lib/agenda-occupancy.ts`, `test/agenda-occupancy.test.ts`) implementan
literalmente las 13 decisiones bloqueadas de `17-CONTEXT.md` y el contrato de `17-UI-SPEC.md`. Las
dos garantías de integridad que más importaban (D-10: el `service_id` en la clave del grupo, y el
descarte del hold vencido en `occupiesSeat`) están probadas por mutación y el verificador reprodujo
esa prueba de forma independiente, no confió en la narrativa del SUMMARY.

**Una nota menor, no bloqueante:** la tabla de traceability al final de `REQUIREMENTS.md` (la
sección "## Traceability") no se actualizó para CUPO-09 y POLISH-08 (dice "Pending" mientras el
checkbox del requisito arriba ya está en `[x]`), aunque sí se actualizó para POLISH-09 y POLISH-10.
Es una inconsistencia de bookkeeping, no del código — normalmente se corrige al cerrar la fase.

**Lo que queda pendiente es exclusivamente visual/interactivo**, y es exactamente lo que el propio
plan 17-05 declaró como "PENDIENTE DE UAT VISUAL" desde el momento en que cerró: abrir el roster con
un click real, escribir con teclado real en los inputs de cupo, ver el layout a 375px en un
navegador, y confirmar contraste en modo oscuro / otra paleta. Ninguno de estos ítems es
programáticamente verificable en este entorno (sin navegador, rutas detrás de login), y los propios
ejecutores lo declararon así en cada SUMMARY en vez de inflar el resultado — la narrativa coincide
con lo que el verificador pudo confirmar de forma independiente.

### Human Verification Required

#### 1. Abrir el roster de una clase grupal

**Test:** En `/agenda`, semana del viernes 21 de agosto de 2026 (fixture ya sembrado en el Supabase
local — confirmado presente por el verificador), a 375px, tocar la fila `09:00 · Yoga grupal · 👥
3/6 · 1 sin seña`.
**Expected:** Se abre un diálogo/drawer con título `Yoga grupal · vie 21 de ago · 09:00`, lista a
Ana Gomez, Bruno Diaz y Carla Ruiz (NO a Dora Paz, que es de Pilates reformer), y el contador dice
`3/6` + "lugares ocupados".
**Why human:** Es JS de cliente (click → `setRosterSlot` → estado React). El entorno no tiene
navegador ni automatización headless (agregar una violaría el `T-17-SC` del propio plan). El
verificador confirmó por lectura de código que el `onClick` es correcto y que `roster` recupera —no
recalcula— la misma entrada, pero no pudo ejercitar el click en sí.

#### 2. Interacción real de teclado en los campos de cupo

**Test:** En el editor de un servicio grupal (`/settings` → Servicios), borrar el número de "Cuántos
lugares" con el teclado, tipear otro número, y salir del campo con Tab. Repetir con el stepper `+`/`−`
de la tarjeta y la tecla Escape con foco dentro del control.
**Expected:** El campo se puede vaciar sin que se reescriba solo bajo el cursor; al salir, el valor
se normaliza al piso del modo. Escape revierte el stepper al valor guardado.
**Why human:** El código implementa correctamente la disciplina "texto local mientras hay foco +
normalización en onBlur" (confirmado por lectura directa y por la simulación de máquina de estados
que documentaron los SUMMARYs), pero ningún test automatizado ni sesión de navegador real ejercitó
el teclado.

#### 3. Layout a 375px del explicador de modos y del control inline

**Test:** DevTools a 375×667, abrir el editor de un servicio de cupo compartido y mirar la tarjeta
de `/servicios` con al menos un servicio grupal.
**Expected:** Las tres opciones de modo se ven en una columna, sin caja dentada; los tres bloques
del explicador se leen como tres grupos (no nueve líneas sueltas); el control de la tarjeta
(`Clase grupal · [−] 6 [+] lugares`) baja entero a su propia línea, sin partirse.
**Why human:** Las clases Tailwind coinciden exactamente con lo prescrito en `17-UI-SPEC.md`
(verificado por grep y lectura), pero el resultado de layout real requiere un navegador que este
entorno no tiene.

#### 4. Contraste en modo oscuro y otra paleta

**Test:** Repetir los pasos 4, 7 y 9 del `<uat_script>` de `17-05-PLAN.md` con dark mode activo y con
una paleta distinta a la default.
**Expected:** Ningún texto pierde contraste WCAG AA (en particular el texto `--warning` del badge de
ocupación y las tres capas del explicador).
**Why human:** Depende de tokens resueltos en runtime por `next-themes` + `data-palette`; no
verificable por grep ni por HTML estático sin iterar temas en un navegador real.

---

## Nota sobre el guion de UAT (`17-05-PLAN.md` → `<uat_script>`)

El guion fue corregido dos veces durante la ejecución (primero por 17-03, que actualizó la
advertencia de que el stepper de la tarjeta ya no es opcional una vez que 17-03 corrió; después por
17-05 mismo, que reescribió los pasos 7 y 8 contra lo que realmente se construyó). El verificador
evaluó el resultado final y lo considera **apto para entregar a un humano**:

- Trae un fixture concreto y ya sembrado (negocio, login, servicios y turnos exactos), confirmado
  presente en la base local por este verificador vía consulta SQL directa — no es un guion
  especulativo, describe datos reales.
- Cada paso tiene una expectativa verificable en una sola mirada (no requiere que el humano infiera
  qué buscar).
- Declara explícitamente qué pasos dependen de trabajo de otros planes de la fase (17-01/02/03) y
  qué paso NO pudo cerrar el propio ejecutor (el paso 3, apertura del roster).
- Incluye verificaciones negativas (D-09: tocar el label de modo no debe hacer nada; un turno
  individual no debe abrir nada) que un guion menos cuidadoso suele omitir.

No se encontró ninguna instrucción del guion que contradiga lo que el código realmente hace.

---

_Verified: 2026-08-20_
_Verifier: Claude (gsd-verifier)_
