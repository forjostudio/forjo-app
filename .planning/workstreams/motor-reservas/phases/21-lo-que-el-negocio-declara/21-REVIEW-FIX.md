---
phase: 21-lo-que-el-negocio-declara
fixed_at: 2026-09-11T23:50:00Z
review_path: .planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 21: Code Review Fix Report

**Fixed at:** 2026-09-11T23:50:00Z
**Source review:** `.planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW.md`
**Iteration:** 1
**Scope:** `critical_warning` — CR-01 + WR-01..WR-07. IN-01..IN-05 NO se tocaron.

**Resumen:**
- Hallazgos en scope: 8
- Corregidos: 8
- Salteados: 0

**Worktree:** `workflow.use_worktrees: false` en `.planning/config.json`, así que se editó y commiteó
directo en el checkout principal sobre `main` (`git.allow_default_branch_commits: true`). No se creó
worktree ni rama. Todos los commits se hicieron con lista explícita de archivos; los cambios sin
commitear que ya estaban en el árbol (borrados bajo `.claude/skills/**`, `config.json` del workstream,
untracked de `.planning/`) quedaron intactos.

**Archivos tocados en total (los 8 commits):**
`app/(onboarding)/onboarding/page.tsx`, `lib/onboarding-agenda.ts`,
`test/onboarding-agenda.test.ts`, `test/onboarding-agenda-rpc.test.ts`.

---

## Gates medidos

Todos corridos en el **checkout principal** (no en un worktree), o sea reproducibles tal cual desde
el árbol que estás mirando.

| Gate | Baseline (HEAD `b4f5464`) | Después (HEAD `bbdf4ed`) | Veredicto |
|---|---|---|---|
| `npm run build` | exit 0 | **exit 0** | sin regresión |
| `./node_modules/.bin/tsc --noEmit` | exit 0 | **exit 0** | sin regresión |
| `npm test` (`vitest run`) | 87 files, 1104 passed \| 4 expected fail \| 1 skipped | 87 files, **2 failed \| 1119 passed \| 4 expected fail \| 6 skipped** | ver abajo |
| `npm run lint` | 1292 problems (1043 errors, 249 warnings) | **1290 problems (1042 errors, 248 warnings)** | −2, ninguno nuevo |

### Los 2 rojos de `npm test` NO son míos — son el guard de medianoche

```
FAIL |db| test/service-delete-gate.test.ts > 0 — canario: esta corrida cubre los casos horarios de GATE-03
FAIL |db| test/capacity-mode-change-gate.test.ts > 0 — canario: esta corrida cubre los dos casos horarios de GATE-03
AssertionError: GUARD DE MEDIANOCHE: son las 23:44:32 en hora AR, fuera de [01:00:00, 23:30:00].
```

Son canarios de reloj de pared: fuera de la ventana `[01:00, 23:30]` AR, los casos con horas fijas de
"hoy" dejan de ser deterministas, se skipean, y el canario falla A PROPÓSITO para que el skip no sea
mudo. Corrí la suite a las 23:44 AR. Evidencia de que no los causé yo:

1. **Ninguno de los dos archivos toca nada mío.** `git diff --name-only b4f5464..HEAD` = 4 archivos,
   todos `onboarding-*`; `grep -n onboarding` en esos dos tests no devuelve nada.
2. **La aritmética cierra exacto.** Agregué 22 casos (21 en `onboarding-agenda.test.ts`: 12→33; 1 en
   `onboarding-agenda-rpc.test.ts`: 3→4).
   Total: 1109 baseline + 22 = **1131** medidos. ✓
   Passed: 1104 + 22 = 1126 esperados = 1119 passed + 2 failed + 5 skipped extra. ✓
   O sea: los 2 rojos y los 5 skipped de más son exactamente los casos horarios de esos dos archivos,
   y no hay ni un caso sin explicar.

**Acción pendiente para quien cierre la fase:** volver a correr `npm test` dentro de la ventana
`[01:00, 23:30]` AR para ver esos dos archivos en verde. No es un bug de esta fase.

No vi el "Worker exited unexpectedly" en ninguna de las corridas.

### Regresión dirigida — las 10 suites del eje franja↔servicio (Phases 18/19/20)

`agenda-hours-payload`, `agenda-save-blocks-rpc`, `availability-service-window`,
`booking-service-window-backstop`, `isolation`, `onboarding-agenda`, `onboarding-agenda-rpc`,
`schedule-coverage-public`, `settings-delete-precheck-tenant`, `time-block-services`:

```
Test Files  10 passed (10)
     Tests  141 passed | 1 skipped (142)
```

(141 = 119 previos + los 22 casos nuevos. Ojo: éste NO es el mismo set de 10 archivos que midió el
orquestador — el suyo daba 131 —, así que lo dejo explicitado en vez de comparar peras con manzanas.)

### Lint: el único diagnóstico nuevo de la fase desapareció

`eslint app/(onboarding)/onboarding/page.tsx`, antes y después:

| | Baseline | Después |
|---|---|---|
| `13:10 @typescript-eslint/no-unused-vars` (`Badge`) | warning | **sigue** (es IN-01, fuera de scope) |
| `191:5 react-hooks/set-state-in-effect` | error | **sigue** (pre-existente a `f2d2ddd`) |
| `437:84 react-hooks/purity` (`Date.now`) | error | **ya no se reporta** — ver nota |
| `979:21 jsx-a11y/role-supports-aria-props` | warning | **eliminado (WR-04)** |
| **Total del archivo** | 4 problems (2 errors, 2 warnings) | **2 problems (1 error, 1 warning)** |

**Nota honesta sobre el `react-hooks/purity`:** NO lo arreglé y no me lo cuelgo. El `Date.now()` sigue
tal cual en el archivo (ahora línea 466, verificado con grep). Lo que pasó es que el React Compiler
dejó de reportarlo cuando cambió el cuerpo de `handleFinish`: su análisis abandona la función en otro
punto. Sigue siendo deuda pre-existente y va a volver a aparecer si el compilador cambia de opinión.

---

## Fixed Issues

### CR-01: chips, aviso y payload decían tres cosas distintas de la misma franja

**Commit:** `304611d`
**Archivos:** `lib/onboarding-agenda.ts`, `app/(onboarding)/onboarding/page.tsx`, `test/onboarding-agenda.test.ts`

**Qué hice:** "vigente" pasa a ser UNA regla declarada una sola vez —`esServicioVigente()` +
`franjaServiceIdsVigentes()`— y la consumen los TRES bordes: `buildOnboardingAgendaPayload`,
`servicesWithoutCoverage`, y el prop `serviceIds` que recibe `BlockServicesLine`. Seguí la
recomendación del review de NO limpiar `dayStates` desde `updateService` (destruiría el mapeo mientras
el dueño retipea un nombre) y dejé eso escrito en el código.

**Evidencia medida — test que falla ANTES y pasa DESPUÉS.**
Escribí el bloque `describe('CR-01: un servicio al que se le vació el nombre y quedó mapeado')` ANTES
de tocar `servicesWithoutCoverage` y lo corrí:

```
ANTES del fix:   Tests  2 failed | 13 passed (15)
  AssertionError: expected [ { id: …, name: 'Yoga' } ] to deeply equal []
  ❯ test/onboarding-agenda.test.ts:245  expect(servicesWithoutCoverage(services, days)).toEqual([])
  AssertionError: expected [ { id: …, name: 'Cerámica' } ] to deeply equal []
  ❯ test/onboarding-agenda.test.ts:272

DESPUÉS del fix: Tests  18 passed (18)   (15 puros + 3 RPC)
```

O sea: reproduje el desacuerdo exacto que el reviewer reprodujo en su scratch (el aviso denunciaba
'Yoga' mientras el payload guardaba comodín) y ahora los tres bordes coinciden.

Los 3 casos nuevos:
1. `los tres bordes coinciden: la franja es COMODÍN para los chips, para el aviso y para la base` —
   asierta el prop que recibe el componente, lo pasa por `isBlockWildcard` (la MISMA función a la que
   delega `block-services-line.tsx:64`), asierta `payload[0].service_ids === []`, y asierta que el
   aviso no dice nada.
2. `la franja sin nombre vacío sigue restringida` — el **control**: sin él, el fix podría haber
   comprado la coincidencia convirtiendo todo en comodín. Con nombre, la franja sigue restringida y el
   aviso SÍ denuncia el servicio sin cobertura.
3. `la franja que sólo declaraba al servicio sin nombre deja de tapar al resto del catálogo`.

**Desviación del snippet del review:** el review sugería inline `const vigentes = new Set(services.filter(s => s.name.trim() !== ''))`
dentro de `servicesWithoutCoverage` y otro `new Set(chipCatalog.map(...))` en el call site — o sea, el
criterio escrito dos veces más. Lo extraje a `esServicioVigente`/`franjaServiceIdsVigentes` porque el
bug ERA tener el criterio repetido; repetirlo de nuevo, aunque coincidan hoy, deja abierta la misma
puerta.

**Limitación (no cubierta por test):** el JSX no se renderiza (`environment: 'node'`). El test asierta
la ENTRADA del componente y la regla que el componente aplica sobre ella, no el DOM. Que el chip
"Cualquier servicio" se dibuje sigue siendo UAT visual.

---

### WR-01: el toast del fallo de servicios no decía que el mapeo se descartó

**Commit:** `bd13293` · **Archivo:** `app/(onboarding)/onboarding/page.tsx`

**Qué hice:** el mensaje ahora se bifurca. Cuando el dueño venía mapeando franjas
(`canMapServices && perFranja`), dice qué se perdió, **en qué quedaron los horarios** ("abiertos a
cualquier servicio") y dónde terminar de configurarlo — o sea qué salió mal Y cómo arreglarlo, que es
la regla del proyecto. Le agregué al snippet del review la mitad que le faltaba: que la agenda quedó
ABIERTA. Sin eso el dueño no sabe que tiene algo que cerrar.

**Evidencia:** `tsc --noEmit` exit 0; `eslint` sin diagnósticos nuevos; build exit 0. La condición
usada (`canMapServices && perFranja`) son exactamente los dos términos de `shouldMapServices` que
siguen en `true` en ese punto (el tercero, `servicesFailed`, acaba de pasar a `true`), y esos dos
términos **sí** están pineados por la tabla de verdad de WR-05.

**⚠ Requiere verificación humana:** es copy dentro de un client component que el runner no renderiza.
No hay test automático posible sin montar JSX. Verificar en UAT forzando un fallo del insert de
servicios.

---

### WR-02: `randomUUID()` dejaba el alta en blanco en `http://`

**Commit:** `0800889` · **Archivos:** `lib/onboarding-agenda.ts`, `app/(onboarding)/onboarding/page.tsx`, `test/onboarding-agenda.test.ts`

**Qué hice:** moví `newServiceId()` al módulo puro y le puse tres ramas: `randomUUID` (https) →
`getRandomValues` (que NO es secure-context: es la que corre en la LAN) → `Math.random` (última red).
La forma de salida es uuid v4 válido por las tres ramas, porque la columna es `uuid` y el id viaja en
el payload del RPC.

**Por qué al módulo puro y no inline en el componente (desviación del review):** el review dejaba la
función en `page.tsx`. Ahí la rama de degradación **no se puede ejercitar** — el runner no renderiza
ese componente —, y un fallback que nunca corrió es una suposición, no una red. Vos me pediste
explícitamente ejercitar la rama no-`randomUUID`, y eso obliga a moverla.

**Evidencia medida — la rama del fallback corre de verdad.** 3 casos nuevos que reemplazan
`globalThis.crypto` por un doble sin `randomUUID` (el `Crypto` real de un origen inseguro) y por uno
sin nada, con `afterEach` restaurando. Falsificado contra la implementación vieja:

```
mutante = implementación vieja (return globalThis.crypto.randomUUID()):
  Tests  2 failed | 26 passed (28)
  AssertionError: expected [Function] to not throw ... "TypeError: globalThis.crypto.randomUUID is not a function"
  AssertionError: expected [Function] to not throw ... "TypeError: Cannot read properties of undefined (reading 'randomUUID')"

restaurado: Tests  28 passed (28)
```

El `TypeError` que el test captura es **textualmente** el que el review predijo. Además se asierta
unicidad (200 ids distintos por rama) y forma v4 con regex.

**Sobre `http://192.168.x.x:3000`:** la rama que va a correr ahí es la del medio (`getRandomValues`),
que es la que el segundo caso ejercita — el doble tiene exactamente las capacidades de un `Crypto` de
origen inseguro. La confirmación end-to-end en el celular sigue siendo UAT.

**Fuera de scope pero anotado:** `lib/landing/editor-upload.ts:58` tiene el mismo patrón
(`globalThis.crypto.randomUUID()` directo). Es server-side, así que no tiene el mismo modo de falla, y
no lo toqué.

---

### WR-03: un campo numérico vaciado volteaba el insert entero de servicios

**Commit:** `2deaf7e` · **Archivos:** `lib/onboarding-agenda.ts`, `app/(onboarding)/onboarding/page.tsx`, `test/onboarding-agenda.test.ts`

**Qué hice:** `toNumberOr()` en el módulo puro, usado en los `onChange` de Min. y Precio. Más
`validateServiceDuration()` inline onBlur y `durationError` en el estado de la fila.

**⚠ DESVIACIÓN IMPORTANTE — el snippet del review tenía un bug, y lo encontré midiendo.**
El review proponía:

```ts
function toNumberOr(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
```

**`Number('') === 0`, no `NaN`.** `Number('   ')` también es `0`. Con ese snippet, vaciar el campo
"Min." no cae al default: produce un servicio de **0 minutos** — que es exactamente la entrada
degenerada para la grilla horaria de la que el mismo hallazgo advierte en su último párrafo. Cambiaba
un bug por otro. Lo detecté porque el test se puso rojo:

```
AssertionError: expected +0 to be 30 // Object.is equality
❯ test/onboarding-agenda.test.ts:401  expect(toNumberOr('', 30)).toBe(30)
```

La versión que quedó chequea la cadena vacía ANTES y aparte. Después: `Tests 33 passed (33)`.

Los 5 casos nuevos incluyen el que importa de verdad: la fila **serializada** no lleva `null` a una
columna NOT NULL (`JSON.parse(JSON.stringify(fila))`), porque lo que rompe la base es la
serialización, no el número — y un `toEqual` distraído sobre `NaN` pasa igual (`NaN !== NaN`). El
contraejemplo (`JSON.stringify({ duration_minutes: parseInt('') })` → `null`) queda asertado al lado.

**Desviación en la segunda mitad del hallazgo ("que 0 o negativo no se pueda submitear"):**
`validateServiceDuration` **corrige a la vista** (el campo pasa a `MIN_SERVICE_MINUTES = 5`) y explica
por qué, en vez de bloquear Finalizar. Razón: (a) el precedente que el propio hallazgo cita —
`priceError` — tampoco bloquea Finalizar hoy, así que bloquear la duración sería inconsistente con su
vecino; (b) D-02/D-06 dicen que el wizard no puede dejar al dueño encerrado. Corregir a la vista es lo
único que a la vez no lo encierra, no cambia el dato en silencio, y deja el valor degenerado
inalcanzable en el submit. El error se suma al `canAddService` igual que `priceError`.

**⚠ Requiere verificación humana:** el auto-ajuste a 5 onBlur es un comportamiento de UI nuevo. Merece
una pasada de UAT.

---

### WR-04: el toggle por-franja con un ARIA que su rol prohíbe y sin nombre accesible

**Commit:** `7fc5f23` · **Archivo:** `app/(onboarding)/onboarding/page.tsx`

**Qué hice:** saqué `aria-pressed` (el estado ya lo lleva `aria-checked`, que es el correcto para
`role="switch"`) y vinculé el botón a la pregunta con `id="per-franja-label"` + `aria-labelledby`.
Aplicado tal cual el snippet del review.

**Evidencia medida — es el único diagnóstico NUEVO de la fase y desapareció:**

```
ANTES:   979:21  warning  The attribute aria-pressed is not supported by the role switch   jsx-a11y/role-supports-aria-props
         ✖ 4 problems (2 errors, 2 warnings)
DESPUÉS: (no aparece)
         ✖ 2 problems (1 error, 1 warning)
```

Lint global: 1292 → 1290 problems. No toqué ni pretendo haber tocado los pre-existentes
(`set-state-in-effect`, `Badge` sin usar = IN-01, fuera de scope).

**⚠ Requiere verificación humana:** que un lector de pantalla anuncie ahora "¿Cada franja es para un
servicio puntual?, switch, apagado" es UAT con VoiceOver/NVDA, no algo que el lint pruebe.

---

### WR-05: nada testeaba la expresión que decide qué se persiste

**Commit:** `2963d46` · **Archivos:** `lib/onboarding-agenda.ts`, `app/(onboarding)/onboarding/page.tsx`, `test/onboarding-agenda.test.ts`

**Qué hice:** la expresión sale del submit a `shouldMapServices({ vertical, perFranja, servicesFailed })`
en el módulo puro, y la regla del rubro a `canMapServicesInVertical(vertical)` — que además pasa a ser
la fuente del `canMapServices` de la UI, así el gate de la pantalla y el del submit no se pueden
separar. Las 8 filas de la tabla de verdad se enumeran A MANO (derivarlas de la implementación haría
un test que se pone de acuerdo consigo mismo).

**Evidencia medida — falsificación por mutación.** El estándar que vos y el reviewer pidieron: si
invertir un término deja todo verde, el test no constriñe nada. Mutación aplicada al cuerpo de
`shouldMapServices`, suite completa del archivo (25 casos en ese momento):

| Mutación | Resultado |
|---|---|
| `!servicesFailed` → `servicesFailed` | **3 failed** \| 22 passed |
| `&&` → `\|\|` (con `!servicesFailed`) | **7 failed** \| 18 passed |
| soltar `canMapServicesInVertical(vertical)` | **1 failed** \| 24 passed |
| soltar `perFranja` | **1 failed** \| 24 passed |
| *(restaurado)* | 25 passed |

Los cuatro mutantes mueren. Además del truth-table hay dos casos que cierran los flancos: uno enchufa
el gate al traductor tal como lo hace `handleFinish` (con `servicesFailed: true` el payload crea la
franja pero sin mapeo — lo que evita el 23503 y la reversión de la agenda), y otro pinea
`canMapServicesInVertical` contra 4 rubros no-canchas, para que cambiar el literal no quede impune.

---

### WR-06: el caso "backstop" del test de RPC nunca demostraba la falla que decía cubrir

**Commit:** `bbdf4ed` · **Archivo:** `test/onboarding-agenda-rpc.test.ts`

**Qué hice:** agregué el caso `c-bis`, la mitad negativa. Construye el payload con el filtro puesto,
asierta que el filtro lo vació, y después **le vuelve a meter el id fantasma a mano** para evadir el
backstop a propósito: así lo que se mide es el rechazo de la BASE, no el del módulo puro.

**Evidencia medida — el caso SÍ observa el 23503 y la atomicidad:**

```
Test Files  1 passed (1)
     Tests  4 passed (4)      (antes: 3)
```

Falsificación: si NO se evade el backstop (payload válido, que es literalmente lo que el caso (c)
hacía), el caso muere:

```
mutante (sin evadir): AssertionError: expected null not to be null
                      Tests  1 failed | 3 passed (4)
restaurado:           Tests  4 passed (4)
```

O sea que la aserción `error?.code === '23503'` es load-bearing sobre el id fantasma, no decorativa.
Si mañana se cayera `tbs_service_same_tenant` (migr. 073) o el RPC se tragara el error, este caso se
pone rojo — que es justo lo que el caso (c) no hacía.

**Desviación del snippet del review:** el review proponía
`expect(await readBridge(seeded.bizA)).toHaveLength(0)` con el comentario "la llamada anterior dejó 2
franjas y ésta no pudo borrarlas". Eso es contradictorio y habría sido un falso verde frágil: el caso
(c) deja **1** fila en la puente, así que si el RPC es todo-o-nada la puente después de `c-bis` tiene
**1**, no 0. En vez de un literal, `c-bis` **lee el estado ANTES** de la llamada (franjas y puente,
con un helper `readBlocks` nuevo) y asierta que quedó idéntico. Así la prueba de atomicidad es real y
además no depende del orden en que corran los casos de arriba.

**Sobre el `describe.skipIf(!hasSupabaseCreds)` — la nota "Related" del hallazgo: verificado, CI sí
las setea.** `.github/workflows/test.yml:32-34` inyecta `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` desde secrets. Y en esta máquina la
suite **corrió de verdad** (4 passed, no 4 skipped), así que A2 —que un `services.id` generado en el
cliente lo acepta la policy de INSERT— está cerrada y no sólo declarada.

---

### WR-07: el insert de profesionales descartaba su error

**Commit:** `62dfa5a` · **Archivo:** `app/(onboarding)/onboarding/page.tsx`

**Qué hice:** aplicado tal cual el snippet del review — `filasDeProfesionales` filtradas con
`p.name.trim()`, guard de `length > 0` para no hacer el round-trip de `.insert([])`, chequeo del error
con `console.error('[onboarding/professionals]', proErr.code)` (sólo el código, como sus dos vecinas) y
toast con la misma forma. No se tira ni se corta el redirect, por el mismo motivo que las otras dos: el
negocio ya existe y el alta no es re-entrante.

**Evidencia:** `tsc --noEmit` exit 0, `eslint` sin diagnósticos nuevos, build exit 0. Las tres
escrituras consecutivas del submit ahora tienen la misma política.

**⚠ Requiere verificación humana:** manejo de errores en un client component no renderizable por el
runner. Verificar en UAT forzando un fallo del insert de profesionales.

---

## Skipped Issues

Ninguno. Los 8 hallazgos en scope se corrigieron.

## Fuera de scope (NO tocados, por instrucción)

IN-01 (`Badge` sin usar — sigue apareciendo como warning de lint), IN-02 (identidad posicional de los
bloques), IN-03 (`console.error(err)` genérico), IN-04 (estilos de update mezclados en `removeService`),
IN-05 (`addBlock` al final del día).

---

## Lo que queda pendiente de humano

1. **Re-correr `npm test` entre las 01:00 y las 23:30 AR** para ver `service-delete-gate` y
   `capacity-mode-change-gate` en verde. No es deuda de esta fase, pero la fase no debería declararse
   verde sobre una corrida con los canarios en rojo.
2. **UAT visual/mobile**, que es donde este proyecto encuentra lo que el pipeline no:
   - WR-02 en `http://192.168.x.x:3000` desde el celular: la pantalla del alta tiene que renderizar.
   - WR-04 con lector de pantalla sobre el switch por-franja.
   - CR-01: con un servicio al que se le vació el nombre, el chip "Cualquier servicio" tiene que
     aparecer en esa franja.
   - WR-03: el ajuste a 5 minutos onBlur.
   - WR-01 / WR-07: los toasts, forzando el fallo de cada insert.

---

_Fixed: 2026-09-11T23:50:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
