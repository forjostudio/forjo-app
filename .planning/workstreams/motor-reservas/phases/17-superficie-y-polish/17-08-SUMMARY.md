---
phase: 17-superficie-y-polish
plan: 08
subsystem: ui
tags: [react, nextjs, tailwind, mobile, a11y, gap-closure, cupo]

# Dependency graph
requires:
  - phase: 17-superficie-y-polish
    plan: 06
    provides: "`settings-client.tsx` con la tarjeta de servicio ya recompuesta; este plan toca otra región del mismo archivo (el explicador de `CapacityModeFields`) sin reordenar nada de aquello"
  - phase: 17-superficie-y-polish
    plan: 01
    provides: "`CAPACITY_MODE_HELP` como fuente única de label/eje/ejemplo/advertencia y el bloque explicativo de tres grupos que este plan colapsa"
  - phase: 17-superficie-y-polish
    plan: 02
    provides: "el diálogo con scroll interno y footer anclado (D-05), que es lo que absorbe el cambio de alto que este plan introduce"
provides:
  - "El explicador con dos presentaciones por grupo: el modo activo completo (eje + ejemplo + advertencia) y los otros dos en una línea con su eje de conteo (cierra G-01, aplica el D-02 revisado en la UAT)"
  - "El texto accesible del grupo colapsado: ejemplo + advertencia siguen viajando por la descripción accesible de cada opción del radiogroup, sin activar ninguna (cierra T-17-37)"
  - "El precedente de 'colapsar es una decisión de render, no una segunda redacción': la versión corta ES el eje que ya vive en la fuente única"
affects: [segunda-ronda-de-uat, 17-UI-SPEC]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Colapsar sin volver interactivo: dos presentaciones condicionales del mismo dato, sin manejador, sin rol y sin índice de tabulación — leer no puede tener efecto de escritura"
    - "Cuando un bloque colapsa en pantalla, el canal accesible NO colapsa: el texto completo queda como contenido del mismo nodo que referencia la descripción accesible"
    - "El gate mide el constructo (`onClick={`) y no el token, porque el propio archivo nombra el atributo en prosa y un conteo de la palabra se auto-invalidaría"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "El modo activo conserva exactamente la presentación de hoy (las tres capas de D-01) y los otros dos se reducen a una línea que junta label + eje en un mismo párrafo de 12px: el label pierde su tamaño de 14px a propósito, porque esa línea es el ancla de 'acá hay una decisión tomada' y el modo no elegido no la tiene"
  - "NO se ocultan del todo los no seleccionados: comparar pasaría a exigir tocar cada botón y cada toque escribe `capacity_mode` + `capacity` en el formulario (T-17-36). La línea corta conserva la comparación gratis"
  - "La versión corta no se redactó: ES el `axis` de `CAPACITY_MODE_HELP`. Cero textos nuevos, cero claves nuevas — el label sigue apareciendo una sola vez en todo el archivo (T-17-38)"
  - "El riel izquierdo, el `id` del grupo y el ritmo entre grupos sobreviven al colapso: son el dispositivo de paralelismo, y colapsar dos de tres sin ellos devolvía el bloque a líneas sueltas"
  - "UI-SPEC §2.2 queda revisado en DOS puntos: (a) los tres grupos ya no están siempre completos en pantalla (D-02 revisada por la UAT) y (b) la afirmación de 'cero reflow' al cambiar de modo deja de valer por diseño"
  - "El cambio de alto es aceptable porque el diálogo scrollea por dentro con el `Guardar` anclado abajo (D-05, aprobado en la UAT test 2): un cuerpo más alto no puede volver a dejar el botón fuera del viewport. El alto NO se anima (regla del proyecto: sólo transform y opacity)"
  - "El grupo colapsado conserva ejemplo y advertencia en texto accesible: sin eso, quien usa lector de pantalla tenía que ACTIVAR cada modo para compararlos — el mismo efecto de escritura de T-17-36, entrando por la puerta de la accesibilidad"
  - "La UAT de step 1/3 apuntaba a `/settings` → Servicios; la ruta real de la lista de servicios es `/servicios` (`/settings` sólo muestra Apariencia/Seguridad/Suscripción). Corregido en el guion"

patterns-established:
  - "La contracara de la regla de composición de la fase: si a 375px un dato nuevo se lleva su propia línea, lo que NO está en juego cede espacio al que sí"

requirements-completed: [CUPO-09]

# Metrics
duration: 18min
completed: 2026-08-24
status: complete
---

# Phase 17 Plan 08: El explicador de modos muestra completo sólo el modo elegido Summary

El bloque de `Cómo se ocupa el cupo` pasa de tres explicaciones completas y simultáneas (~10 líneas
dentro del modal a 375px) a una sola completa —la del modo activo— más dos líneas de una sola frase con
el eje de conteo de los otros. Misma fuente de datos, misma no-interactividad y el texto completo de los
tres modos intacto en el canal accesible.

## Qué se construyó

**Task 1 — dos presentaciones por grupo** (`d0e26e9`)

Dentro del `.map` del explicador, cada grupo elige presentación según `activo` (la variable ya existía):

- **Expandida** (modo seleccionado): idéntica a la de ayer. Label de 14px, eje, ejemplo con el prefijo
  resaltado y la advertencia con su icono cuando el modo la tiene. `individual` sigue sin advertencia.
- **Colapsada** (los otros dos): un solo párrafo de 12px que junta el label en negrita, dos puntos y el
  `axis` tal cual sale de `CAPACITY_MODE_HELP`. Nada más.

Lo que **no** cambió, y es la mitad del trabajo: el contenedor, el ritmo entre grupos, el `id` de cada
grupo, el riel izquierdo (con su color de activo) y el espaciado interno. El riel es lo que hace que los
grupos se lean como paralelos; colapsar dos de tres no podía llevárselo puesto.

El comentario del bloque se reescribió en su primera mitad (ya no es cierto que los tres estén siempre
completos) y conserva la segunda con su porqué: comparar no puede exigir tocar un control que escribe.
Quedaron anotados ahí mismo los dos puntos del UI-SPEC §2.2 que esto revisa.

**Task 2 — el colapso es visual, no informativo** (`d3af254`)

En la presentación colapsada se agregó un `span` con `sr-only` que lleva el ejemplo (con su prefijo
adentro del propio texto, porque el resaltado visual no existe en ese canal) y, cuando el modo la tiene,
la advertencia — armados desde el mismo `CAPACITY_MODE_HELP`, sin reescribir un solo texto. Como es hijo
del `div` con `id="cap-mode-help-{modo}"`, la descripción accesible de cada `role="radio"` lo incluye sin
cablear nada más.

## Gates de aceptación medidos

| Gate | Base | Después | Resultado |
|---|---|---|---|
| `grep -cF '{h.axis}'` | 1 | 2 | PASS |
| `grep -cF '{h.label}'` | 1 | 2 | PASS |
| `grep -cF 'CAPACITY_MODE_HELP.map'` | 2 | 2 | PASS |
| `grep -cF 'const activo = value === h.key'` | 1 | 1 | PASS |
| `grep -cF 'border-l-primary'` | 1 | 1 | PASS |
| `grep -cF 'space-y-2.5'` | 2 | 2 | PASS |
| `onClick={` dentro de `CapacityModeFields` | 1 | 1 | PASS |
| `grep -cE 'tabIndex='` | 0 | 0 | PASS |
| `grep -cE 'role="button"'` | 0 | 0 | PASS |
| radiogroup en grid (D-13) | 1 | 1 | PASS |
| `normalizeCapacity(base, minCapacityFor(value))` (D-06) | 1 | 1 | PASS |
| `grep -cE 'sr-only'` | 0 | 1 | PASS |
| `grep -cF 'cap-mode-help'` | 2 | 2 | PASS |
| `grep -cF 'aria-describedby'` | 1 | 1 | PASS |
| `grep -cF "'Clase grupal'"` | 1 | 1 | PASS |

Cómo se probó que el bloque **no** es interactivo: el gate mide el constructo `onClick={` acotado con
`sed` al cuerpo de `CapacityModeFields`, y sigue habiendo **uno solo** — el del `role="radio"`. En todo
el archivo no hay índice de tabulación ni rol de botón. Los comentarios nuevos nombran esos atributos en
prosa (sin el signo `=` ni las comillas) precisamente para no auto-invalidar los conteos.

Cómo se probó que el texto completo sobrevive para el lector de pantalla: el `span` accesible es hijo del
mismo `div` que lleva `id="cap-mode-help-{modo}"`, y el cableado `aria-describedby` → `id` quedó en 1 y 2
respectivamente (sin tocar). Los textos salen de `CAPACITY_MODE_HELP` por interpolación, verificado por el
gate de que el label sigue apareciendo una sola vez en todo el archivo.

## Verificación

- `./node_modules/.bin/tsc --noEmit` → **exit 0** (con el binario local; `npx tsc` acá siempre sale 0 y no
  sirve como gate).
- `npm run build` → compila. Corrido una sola vez, al final. En Next 16 `next dev` escribe en `.next/dev` y
  `next build` en `.next/build`, así que el build **no** pisó el dev server (documentado en
  `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:920`). Confirmado después:
  `http://localhost:3000/login` → 200 y `/settings` → 307 (redirect a login, o sea la ruta compiló).
- `npx vitest run test/agenda-occupancy.test.ts --no-file-parallelism` → **20 passed**.
- `git diff --stat` → un solo archivo de código: `app/(dashboard)/settings/settings-client.tsx`.
- `git diff -- package.json package-lock.json components/ui/ lib/ test/ "app/(dashboard)/agenda/" "app/(dashboard)/finances/"` → vacío (T-17-SC: cero dependencias nuevas).

## UI-SPEC §2.2 — queda revisado en dos puntos

1. **"Los tres grupos, siempre los tres visibles (D-02)"** deja de valer: sólo el activo se muestra
   completo. La decisión original se tomó sin la pantalla delante y la UAT la revirtió con el modal a la
   vista. Lo que sí se conserva es el motivo por el que los otros dos no desaparecen.
2. **"El estado activo se marca sólo con color → cero reflow"** deja de valer **por diseño**: ahora el
   bloque cambia de alto al cambiar de modo. Está absorbido por el scroll interno del diálogo con el
   `Guardar` anclado (D-05), que pasó la UAT (test 2). No se anima el alto.

Todo lo demás de §2.2 sigue vigente tal cual: el riel como dispositivo de paralelismo, el ritmo 2px/10px,
el molde de la advertencia y la no-interactividad del bloque.

## Cambios al guion de UAT del plan

- **Fecha del fixture corregida:** decía *semana del viernes 21 de agosto de 2026*, que ya quedó en el
  pasado y la agenda abre en la semana actual. El guion ahora apunta al **viernes 28 de agosto de 2026**,
  con la nota de que un `supabase db reset` se lleva puesta la siembra.
- **Ruta corregida en los pasos 1 y 3:** el guion mandaba a `/settings` → Servicios, pero `/settings` sólo
  muestra Apariencia/Seguridad/Suscripción; la lista de servicios vive en **`/servicios`**. Con la ruta
  vieja el dueño no encontraba ni la tarjeta del paso 1 ni el lápiz del paso 3.
- **Nota agregada al paso 3:** si el servicio que se abre es `individual`, su versión expandida **no**
  lleva advertencia ámbar — es D-01, no un defecto. Sin esa nota el guion inducía a reportar un falso
  positivo, porque el "Esperado" describe las tres capas.
- Paso 4 pasa a *semana del vie 28 de ago*, coherente con la resiembra.

## Deviations from Plan

**1. [Rule 2 - Missing critical] La ruta del guion de UAT apuntaba a una pantalla sin servicios**

- **Found during:** revisión del `<uat_script>` (encargo explícito del plan: que el guion coincida con lo
  construido).
- **Issue:** los pasos 1 y 3 mandaban a `/settings` → Servicios. `app/(dashboard)/settings/page.tsx` renderiza
  `SettingsClient` **sin** `view`, y ese modo muestra las pestañas Apariencia/Seguridad/Suscripción. La
  lista de servicios la renderiza `app/(dashboard)/servicios/page.tsx` con `view="servicios"`.
- **Fix:** el guion apunta a `/servicios` y aclara que `/settings` no lista servicios.
- **Files modified:** `17-08-PLAN.md` (sólo el bloque `<uat_script>`).
- **Verification:** `grep -n "view=" app/(dashboard)/servicios/page.tsx` y el listado de rutas del build.

**2. [Rule 2 - Missing critical] El "Esperado" del paso 3 inducía un falso positivo con `individual`**

- **Found during:** misma revisión.
- **Issue:** el paso 3 describe el modo seleccionado como *eje + ejemplo + advertencia en ámbar*. Si el
  dueño abre un servicio `individual` (que es el 100 % de producción), no hay advertencia — y el guion lo
  empujaba a reportarlo como defecto. Es exactamente lo contrario de lo que dice D-01 y el `constraint`
  de G-01.
- **Fix:** nota explícita en el paso 3.
- **Files modified:** `17-08-PLAN.md`.

**3. [Nota, no desviación] El comentario del bloque conserva la mención de los pasos de espaciado**

- El plan pedía no meter listas de clases en los comentarios, pero el gate de `space-y-2.5` exige **2**
  ocurrencias y la segunda es justamente la del comentario del UI-SPEC que ya estaba. Se conservó ese
  párrafo (una mención de dos tokens, no una lista de clases) y se reescribió el resto.

**Total deviations:** 2 auto-fixed (ambas Rule 2, sobre el guion de UAT — cero cambios de código fuera de
lo planificado). **Impact:** ninguno sobre la implementación; evitan dos horas perdidas y un falso
positivo en la segunda ronda de UAT.

## Threat Flags

Ninguno. El plan no toca escritura, ni datos, ni frontera de tenant: la superficie modificada es texto
descriptivo. Los tres threats del registro (T-17-36, T-17-37, T-17-38) y el de cadena de suministro
(T-17-SC) quedaron cubiertos con gate medible — ver la tabla de gates.

## Known Stubs

Ninguno.

## Issues Encountered

Ninguno.

## Próximo paso

Es el **último plan de la fase**. La fase cierra con la **segunda ronda de UAT** del guion de este plan:
los tres gaps (G-01, G-02, G-03), a 375px, en los dos temas, sobre el dev server que ya está corriendo en
el puerto 3000 y quedó sano.

## Self-Check: PASSED

- `17-08-SUMMARY.md` existe en disco.
- `app/(dashboard)/settings/settings-client.tsx` existe y es el único archivo de código tocado.
- Commits `d0e26e9` y `d3af254` presentes en `git log`.
- Los 15 gates de aceptación de las dos tasks vueltos a correr al cierre: todos PASS.
- `tsc --noEmit` exit 0 · `npm run build` compila · `agenda-occupancy` 20/20.
