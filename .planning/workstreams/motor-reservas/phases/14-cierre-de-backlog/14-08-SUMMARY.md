---
phase: 14-cierre-de-backlog
plan: 08
subsystem: ui-shell
tags: [polish-05, crm, dialog, portal, css-tokens, regresion]
status: complete
requires:
  - "app/(crm)/layout.tsx (shell del super-admin, 13-05)"
  - "components/ui/dialog.tsx (base-ui Dialog + DialogPortal)"
  - "components/crm/risk-badge.tsx (D-05/D-06/D-07, intacto)"
provides:
  - "CRM_SHELL_CLASS — fuente única de las clases del shell del super-admin"
  - "portalScopeClass() — helper puro del scope de superficies portaleadas"
  - "ShellScopeProvider / useShellScope — contexto opt-in con default vacío"
  - "El popup del Dialog hereda el scope del shell activo"
affects:
  - "los 33 call-sites de <DialogContent> (sin tocar ninguno)"
  - "los 4 ConfirmDialog del CRM (superficie del gap 1)"
tech-stack:
  added: []
  patterns:
    - "contexto React privado + hook exportado para superficies portaleadas (molde de DrawerPortalContainerContext)"
    - "constante de scope en lib/ (sin 'use client') para que un Server Component reciba el VALOR"
    - "tests de cableado por lectura de fuentes con readFileSync (entorno vitest node, sin DOM)"
key-files:
  created:
    - lib/shell-scope.ts
    - components/ui/shell-scope.tsx
    - test/shell-scope.test.ts
  modified:
    - components/ui/dialog.tsx
    - app/(crm)/layout.tsx
decisions:
  - "Opción C (el portal lleva el scope como clase) sobre B (reubicar el portal con container): cero movimiento de DOM ⇒ focus trap, scroll lock y stacking intactos"
  - "El scope viaja por contexto y no por prop: los 33 call-sites de DialogContent no se tocan"
  - "Default '' (opt-in): fuera del CRM el className del popup queda byte-idéntico"
metrics:
  duration: ~60min
  tasks: 3
  files: 5
  tests_added: 12
  completed: 2026-08-10
---

# Phase 14 Plan 08: Scope del shell en superficies portaleadas — Summary

El popup portaleado del `Dialog` ahora declara las mismas clases que el shell del CRM, así que dentro
de los 4 ConfirmDialog del super-admin "Alto" (relleno de `--danger`) y "Medio" (`bg-primary`) vuelven
a resolver tokens distintos — sin tocar el `RiskBadge`, los tokens de CSS ni reubicar un solo nodo del
DOM.

## Qué se construyó

| Símbolo | Archivo | Qué hace |
|---|---|---|
| `CRM_SHELL_CLASS` | `lib/shell-scope.ts` | Constante con `dark crm-shell` — las dos clases que el wrapper de `app/(crm)/layout.tsx` escribía a mano. Fuente única: el wrapper y el portal leen la misma. |
| `portalScopeClass(scope)` | `lib/shell-scope.ts` | Helper puro: `undefined` cuando no hay scope, el scope tal cual en el resto. El `undefined` es la garantía anti-regresión (`cn()` descarta los falsy). |
| `ShellScopeProvider` / `useShellScope` | `components/ui/shell-scope.tsx` | Contexto privado con default `''`, molde exacto de `DrawerPortalContainerContext`. Publica las clases del shell a todo lo que se monte por debajo, incluido lo portaleado. |
| `DialogContent` | `components/ui/dialog.tsx` | Invoca el hook y aplica `portalScopeClass()` como **primer** argumento del `cn()` del `Popup`. Firma y props intactas. |
| `CrmLayout` | `app/(crm)/layout.tsx` | Usa la constante en el wrapper y envuelve el shell en el proveedor. El guard server-side de `:22-29` no se tocó. |

La causa raíz no era el componente: el `Popup` monta dentro de `<DialogPortal>` en la raíz del
documento, o sea **fuera** del `<div class="dark crm-shell">`. Las custom properties de CSS viajan por
herencia del DOM, así que al popup no le llegaban: `--danger` caía a `--destructive` y `--primary` al
rojo de la app, y los dos chips quedaban del mismo color.

**Efecto colateral esperado y deseado:** el popup ahora también lleva `dark`, así que los modales del
CRM pasan a verse con los neutrales oscuros del shell (antes tomaban el tema global de la app). Es
coherente con el resto del CRM, pero es un cambio visible — está listado abajo para el checkpoint de
14-09.

## Inventario de los 33 `<DialogContent>` (criterio de aceptación de la Task 2)

`grep -rn "<DialogContent" app components --include=*.tsx | wc -l` → **33**.

| # | Call-site | `className` / props |
|---|---|---|
| 1 | `app/(crm)/admin/pipeline/pipeline-client.tsx:334` | `showCloseButton={!creating}` |
| 2 | `app/(dashboard)/abonos/abonos-client.tsx:612` | `sm:max-w-md` |
| 3 | `app/(dashboard)/agenda/agenda-client.tsx:1112` | `sm:max-w-md` |
| 4 | `app/(dashboard)/agenda/agenda-client.tsx:1133` | `sm:max-w-sm` |
| 5 | `app/(dashboard)/appointments/appointments-client.tsx:482` | `sm:max-w-sm` |
| 6 | `app/(dashboard)/appointments/appointments-client.tsx:498` | `sm:max-w-sm` |
| 7 | `app/(dashboard)/clients/clients-client.tsx:808` | `sm:max-w-sm` |
| 8 | `app/(dashboard)/clients/clients-client.tsx:824` | `sm:max-w-md` |
| 9 | `app/(dashboard)/clients/clients-client.tsx:854` | `sm:max-w-md` |
| 10 | `app/(dashboard)/clients/clients-client.tsx:901` | `sm:max-w-2xl` |
| 11 | `app/(dashboard)/finances/finances-client.tsx:950` | `sm:max-w-sm` |
| 12 | `app/(dashboard)/finances/finances-client.tsx:1089` | `sm:max-w-sm` |
| 13 | `app/(dashboard)/finances/finances-client.tsx:1129` | `sm:max-w-sm` |
| 14 | `app/(dashboard)/finances/finances-client.tsx:1170` | `sm:max-w-sm` |
| 15 | `app/(dashboard)/finances/finances-client.tsx:1187` | `sm:max-w-sm` |
| 16 | `app/(dashboard)/finances/finances-client.tsx:1204` | `sm:max-w-sm` |
| 17 | `app/(dashboard)/finances/finances-client.tsx:1214` | `sm:max-w-sm` |
| 18 | `app/(dashboard)/settings/settings-client.tsx:1719` | `sm:max-w-sm` |
| 19 | `app/(dashboard)/settings/settings-client.tsx:2105` | `sm:max-w-sm` |
| 20 | `app/(dashboard)/settings/settings-client.tsx:2396` | `sm:max-w-sm` |
| 21 | `app/(dashboard)/settings/settings-client.tsx:2416` | `sm:max-w-md` |
| 22 | `app/(dashboard)/web/web-client.tsx:629` | *(sin className)* |
| 23 | `app/(dashboard)/web/web-client.tsx:667` | *(sin className)* |
| 24 | `components/crm/confirm-dialog.tsx:286` | `showCloseButton={!loading && !secLoading}` |
| 25 | `components/crm/extend-trial-dialog.tsx:139` | `showCloseButton={!loading}` + `sm:max-w-md` |
| 26 | `components/crm/plan-price-card.tsx:153` | `showCloseButton={!loading}` |
| 27 | `components/dashboard/canchas-manager.tsx:364` | `sm:max-w-sm` |
| 28 | `components/dashboard/clinical-history-panel.tsx:254` | `sm:max-w-sm` |
| 29 | `components/dashboard/nuevo-abono-form.tsx:135` | `sm:max-w-md` |
| 30 | `components/dashboard/nuevo-abono-form.tsx:157` | `sm:max-w-sm` |
| 31 | `components/dashboard/nuevo-turno-form.tsx:123` | `sm:max-w-md` |
| 32 | `components/dashboard/nuevo-turno-form.tsx:146` | `sm:max-w-sm` |
| 33 | `components/dashboard/plan-modal.tsx:76` | `sm:max-w-2xl` |

**Veredicto:** ninguno de los 33 declara sobre el popup una utilidad con la variante de esquema
oscuro. Todos usan únicamente `sm:max-w-*`, `showCloseButton`, o nada. Esto importa porque
`app/globals.css:5` declara la variante como `&:is(.dark *)`, o sea que matchea **descendientes** del
marcador: una utilidad `dark:…` escrita sobre el propio popup dejaría de aplicar al agregarle la clase
`dark`. Como no existe ninguna, aplicar el scope sobre el propio popup no desactiva ninguna utilidad
existente.

## Prueba de mutación (Task 3, obligatoria)

**Mutación aplicada:** se quitó a mano la línea `portalScopeClass(shellScope),` del `cn()` del
`DialogPrimitive.Popup` en `components/ui/dialog.tsx` — exactamente el estado previo al fix.

**Resultado:** la suite se puso roja.

```
 ❯ test/shell-scope.test.ts (12 tests | 1 failed) 13ms
     × el scope se aplica sobre el POPUP, no sobre el backdrop 4ms

 FAIL  test/shell-scope.test.ts > cableado del scope portaleado (regresión del gap 1 de
 14-VERIFICATION.md) > el scope se aplica sobre el POPUP, no sobre el backdrop
AssertionError: expected -1 to be greater than 2485
 ❯ test/shell-scope.test.ts:83:21

 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
```

- **Test que falla:** `el scope se aplica sobre el POPUP, no sobre el backdrop`
- **Mensaje:** `AssertionError: expected -1 to be greater than 2485` (el `-1` es el `lastIndexOf` de
  `portalScopeClass(` cuando la llamada ya no existe; `2485` es el offset del `data-slot="dialog-content"`).

**Restauración verificada:** se repuso la línea y `git diff --name-only components/ui/dialog.tsx`
devolvió **vacío** contra el commit `1ad8d8c`, o sea que el archivo quedó byte-idéntico al estado
commiteado. Re-corrida: `npx vitest run test/shell-scope.test.ts` → **12 passed (12)**.

## Verificación

| Gate | Comando literal | Resultado |
|---|---|---|
| Typecheck | `./node_modules/.bin/tsc --noEmit` | exit **0** (nunca `npx tsc` — ver nota de entorno) |
| Build | `npm run build` | exit **0** |
| Suite del plan | `npx vitest run test/shell-scope.test.ts` | **12 passed (12)** |
| Suite completa | `npx vitest run` | ver abajo |
| Archivos del plan | `git diff --name-only 8e0b03e..HEAD` | los **5** de `files_modified`, ni uno más |
| Archivos prohibidos | grep sobre el diff | **0** (`globals.css`, `themes.css`, `risk-badge.tsx`, `confirm-dialog.tsx`, `drawer.tsx`, `select.tsx`, `package.json`, `package-lock.json`) |
| Anti-fuga | `grep -rln "ShellScopeProvider" app components` | **2 archivos**: `app/(crm)/layout.tsx` y `components/ui/shell-scope.tsx` |
| Call-sites | `grep -rn "<DialogContent" app components --include=*.tsx \| wc -l` | **33** |

### Suite completa — conteo y baseline de flakiness

Se corrió **dos veces** `npx vitest run`:

| Corrida | Test Files | Tests | Fallas |
|---|---|---|---|
| 1 | 4 failed / 68 passed (72) | **11 failed · 883 passed · 4 expected fail · 1 skipped (899)** | `abono-create` (2), `abono-cron` (4), `abono-generation` (4), `concurrency` (1) |
| 2 | 25 failed / 46 passed (71) | **2 failed · 706 passed · 3 expected fail · 168 skipped (879)** | `webhook-deposit` (1), `email-escaping` (1) — + 24 suites caídas enteras por `Hook timed out` |

**El baseline declarado por el plan (cero fallas fuera de las 3 suites de abonos) NO se cumple
literalmente**, y se declara explícitamente en vez de maquillarse. Evidencia de que es el entorno y no
esta fase:

1. **Todas** las fallas de las dos corridas son `Test timed out in 5000ms` o `Hook timed out in
   10000ms`. Ninguna es una aserción de comportamiento.
2. **Los conjuntos que fallan son disjuntos entre corridas.** La corrida 2 no repite ni una sola de
   las 11 fallas de la corrida 1; sus 2 fallas están en suites que la corrida 1 pasó en verde. Un
   defecto de código no se comporta así.
3. **El Supabase local está degradado en esta máquina ahora mismo:** `curl` al root de
   `http://127.0.0.1:54321/rest/v1/` devuelve 200 pero tarda **1.26 s** (lo normal son decenas de ms).
   Con esa latencia, los `beforeAll` que siembran un tenant no entran en el presupuesto de 10 s y los
   tests de integración no entran en el de 5 s. Corriendo `test/concurrency.test.ts` **aislado** el
   `beforeAll` se cae por timeout dos veces seguidas, con 20 tests skipeados — o sea que el fallo se
   reproduce sin ningún cambio de esta fase de por medio.
4. **Imposibilidad causal:** el diff de este plan son 2 módulos nuevos, un componente de UI y un
   layout. `test/concurrency.test.ts` importa `@/lib/booking-core` y el route handler de
   `availability`; su grafo de imports no toca `dialog.tsx`, `shell-scope.tsx`, `shell-scope.ts` ni
   `app/(crm)/layout.tsx`. Ningún archivo del diff participa de esas suites.
5. `test/shell-scope.test.ts` pasó en verde en **las dos** corridas completas y en las corridas
   aisladas (12/12).

**Lectura honesta:** la corrida completa de hoy **no es un gate útil** en esta máquina — la
infraestructura local de tests está degradada más allá del baseline de 7 fallas que documentaron los 6
SUMMARYs previos de la fase. Lo que sí es concluyente es el gate del plan (`tsc` 0, `build` 0,
`shell-scope` 12/12 con prueba de mutación).

## Deviations from Plan

### 1. [Rule 3 — criterio de aceptación no ejecutable tal cual] `grep -c` de un identificador importado

- **Encontrado en:** Task 2.
- **Criterio del plan:** `grep -c "useShellScope" components/ui/dialog.tsx` devuelve `1` (ídem
  `portalScopeClass`).
- **Realidad:** devuelve **2**, porque `grep -c` cuenta *líneas* y un identificador importado aparece
  necesariamente dos veces (la línea del `import` y la del uso). El criterio no es alcanzable con
  imports de ES.
- **Cómo se satisfizo la intención:** con el patrón de invocación, que sí distingue import de uso:
  `grep -c 'useShellScope()' components/ui/dialog.tsx` → **1**; `grep -c 'portalScopeClass('
  components/ui/dialog.tsx` → **1**. Además el test `DialogContent consume el scope del shell activo`
  afirma la invocación por regex, así que el invariante queda fijado en la suite y no en un grep.
- **Archivos:** ninguno (solo la forma de verificar).

### 2. [Rule 3 — criterio anti-fuga roto por un comentario] Mención literal del proveedor en `dialog.tsx`

- **Encontrado en:** Task 2, al correr `grep -rln "ShellScopeProvider" app components`, que devolvía
  **3** archivos en vez de 2.
- **Causa:** el tercer archivo era `components/ui/dialog.tsx`, y matcheaba **solo por un comentario**
  que nombraba al proveedor ("Fuera de un ShellScopeProvider devuelve undefined…"). No lo monta ni lo
  importa.
- **Fix:** se reformuló el comentario a "Fuera de un proveedor de scope…". El grep vuelve a devolver
  exactamente 2 archivos, con lo cual el criterio sigue siendo un guard real (si alguien montara el
  proveedor en otro shell, el grep lo delataría) en vez de un falso positivo permanente.
- **Archivos:** `components/ui/dialog.tsx` (comentario).

### 3. [Nota de entorno, sin cambio de código] `npm run build` falló una vez por la CDN de fuentes

- **Encontrado en:** Task 2. Una corrida intermedia de `npm run build` salió con exit 1 con 6
  `Error while requesting resource` / `Received response with status 404 when requesting
  https://fonts.gstatic.com/s/manrope/...woff2` — `next/font` no pudo bajar Manrope.
- **Diagnóstico:** flake de red de la CDN de Google Fonts, sin relación con el diff (ningún archivo
  del plan toca fuentes ni `app/layout.tsx`).
- **Resultado:** las corridas anterior y posterior salieron **exit 0** con 0 ocurrencias del error. El
  gate de la Task 2 se declara cumplido sobre la corrida verde.

### 4. [Nota de entorno] Baseline de flakiness excedido

Detallado arriba en §"Suite completa". No es una desviación del código sino de la infraestructura
local de tests; queda declarado en vez de re-encuadrado como verde.

## Threat Flags

Ninguna. El diff no agrega endpoints, queries, policies ni superficie de red: son dos módulos de
presentación (una constante de clases CSS + un contexto de React), el `className` de un popup y el
wrapper de un layout. Los tres threats con disposición `mitigate` del plan quedan cubiertos:

- **T-14-31** (pérdida de la señal de peligro): mitigado por el cableado de la Task 2, con la
  regresión cubierta por el describe de cableado + la prueba de mutación. Arbitraje visual final en
  14-09.
- **T-14-32** (confusión de superficie): default `''`, `portalScopeClass(undefined) === undefined`
  probado, y el inventario `grep -rln "ShellScopeProvider" app components` = 2 archivos, afirmado
  además por el test anti-fuga sobre `app/(dashboard)/layout.tsx`.
- **T-14-34** (reabrir tokens / componente compartido): `app/globals.css`, `app/themes.css` y
  `components/crm/risk-badge.tsx` fuera del diff (verificado por grep sobre `git diff --name-only`) y
  el invariante D-07 afirmado en test.
- **T-14-SC** (supply chain): cero instalaciones; `package.json` y `package-lock.json` fuera del diff.

## A mirar en el checkpoint humano (14-09)

Lo que sigue **no** se puede verificar sin ojos: el entorno de tests de este repo es `node`, sin DOM,
y el milestone prohíbe agregar paquetes. Los 3 ítems, en orden de prioridad:

1. **"Alto" vs "Medio" dentro de los modales del CRM.** Abrir los 4 `ConfirmDialog` del super-admin
   (`abonos-client.tsx:644` y `:668`, `settings-client.tsx:2466` y `:2507`, `canchas-manager.tsx:390`)
   y confirmar que el chip "Alto" se ve del **rojo de marca del CRM** y el "Medio" del **amarillo del
   CRM** — dos colores claramente distintos, y "Alto" pesando más (D-05). Es el criterio que cierra
   POLISH-05. **Mirar también el fondo del modal:** ahora es oscuro (el popup lleva `dark`), no el
   crema/tema global de antes. Es intencional; si el dueño lo considera un cambio no deseado, es una
   decisión de diseño, no un bug del fix.
2. **Los modales del dashboard NO cambiaron de aspecto.** Abrir al menos uno de los modales
   destructivos del panel del dueño (ej. eliminar un abono archivado en `/abonos`, o cualquiera de
   Ajustes) y confirmar que el botón "Eliminar" y el badge de riesgo se ven **exactamente igual que
   antes** de este plan, en claro y en oscuro, y con una paleta de negocio no-roja si hay una a mano.
   Es la contracara de la garantía anti-fuga (`portalScopeClass(undefined) → undefined`).
3. **Los diálogos que NO son ConfirmDialog y los drawers en mobile se ven como antes.** Abrir "Nuevo
   turno" y "Nuevo abono" (`sm:max-w-md`), "Copiar a N días" en Agenda, y el modal de Plan
   (`plan-modal.tsx`, `sm:max-w-2xl`); y en mobile (≤640px) abrir un drawer que contenga un `Select`
   para confirmar que el arreglo de 06-07 sigue funcionando (el popup del Select **no** consume este
   scope: el alcance quedó acotado al `Dialog` a propósito). Nada de esto debería haberse movido: el
   popup no se reubicó en el DOM, así que el foco, el scroll lock y el apilado tienen que comportarse
   igual.

## Commits

| Commit | Tipo | Qué |
|---|---|---|
| `950b3a4` | `test` | RED: contrato del scope portaleado (6 casos, falla porque `lib/shell-scope` no existe) |
| `d870e90` | `feat` | GREEN: `CRM_SHELL_CLASS` + `portalScopeClass()` en `lib/shell-scope.ts` |
| `1ad8d8c` | `fix` | Cableado: contexto, `DialogContent` y layout del CRM |
| `7db4671` | `test` | Suite de regresión del cableado (6 aserciones por lectura de fuentes) |

## Self-Check: PASSED

Archivos declarados, verificados en disco:

- `lib/shell-scope.ts` — FOUND
- `components/ui/shell-scope.tsx` — FOUND
- `test/shell-scope.test.ts` — FOUND
- `components/ui/dialog.tsx` — FOUND (modificado)
- `app/(crm)/layout.tsx` — FOUND (modificado)

Commits declarados, verificados con `git log`: `950b3a4`, `d870e90`, `1ad8d8c`, `7db4671` — los 4
FOUND.
