---
quick_id: 260928-hby
phase: quick
plan: "01"
subsystem: panel-catalogo
status: complete
tags: [organizador, categorias, drag-and-drop, copy, empty-state, phase-23]

requires:
  - "Phase 23 (el organizador del catálogo) — cerrada; esto NO la replanifica"
provides:
  - "la zona “Sin categoría” como destino de arrastre SIEMPRE que haya ≥1 categoría, incluso vacía"
  - "copy por estado del grupo de sueltos (con sueltos ≠ vacía), verdadera en los dos"
affects:
  - "components/dashboard/categorias-manager.tsx (render del grupo de sueltos)"
  - "components/dashboard/categorias-manager.test.tsx (+6 casos)"

tech-stack:
  added: []
  patterns:
    - "gate de render tomado del comentario que ya declaraba la intención, en vez de dejar código y comentario divergiendo"
    - "hint de arrastre sólo en desktop (`hidden sm:inline` / `sm:hidden`), molde ya usado por el pipeline del CRM: el arrastre nativo no existe en touch"
    - "el test de render de servidor (`renderToStaticMarkup`, entorno node) afirma el gate de verdad, no por lectura de la fuente"

key-files:
  created: []
  modified:
    - components/dashboard/categorias-manager.tsx
    - components/dashboard/categorias-manager.test.tsx

decisions:
  - "La condición pasa a `categories.length > 0` (lo que el comentario de :912-915 ya decía), no a algo nuevo: gatear por `sueltos.length > 0` armaba un círculo vicioso — la zona donde soltar para desasignar sólo existía cuando ya había algo desasignado"
  - "`serviceCountLabel(0)` = “Sin servicios” se DEJA como está: es exactamente lo que muestran las filas de categoría vacías, así que cambiarlo rompía la consistencia del panel para ganar nada"
  - "Copy distinta cuando la zona está vacía en vez de una sola frase tibia: la original habla en presente de servicios que no existen, y una zona de drop vacía necesita decir qué hacer, no sólo qué es"
  - "El atajo del copy vacío se bifurca por dispositivo: “Arrastrá uno hasta acá” sólo en ≥sm, y en touch “Tocá un servicio y elegí Sin categoría” (el arrastre nativo no existe en touch — follow-up diferido conocido del repo)"
  - "El `<ul>` de chips no se renderiza vacío (mismo criterio que los chips de cada categoría): vacío sumaba el gap del flex + su `pb-2` como hueco muerto dentro del recuadro punteado"

metrics:
  duration: ~12min
  completed: 2026-09-28

actuals:
  tokens: 2452
  tasks: 2
  commits: 2
  plan_head_before: 8d43f71b976f7b61aa2c3edecc71ec1168b47f1c
---

# Quick 260928-hby: la zona “Sin categoría” se muestra siempre que haya categorías — Summary

El grupo de los sueltos del organizador pasa a gatearse por `categories.length > 0` —la condición que
su propio comentario ya declaraba— así que con 3 categorías y 0 sueltos la zona punteada está
presente y se puede arrastrar el primer chip afuera sin pasar por el diálogo “Mover …”. Vacía, la
zona dice qué es y cómo traer un servicio, con el atajo que corresponde al dispositivo.

## Qué se hizo, tarea por tarea

### Task 1 — la condición (`afc2fbd`)

`components/dashboard/categorias-manager.tsx`:

- **El gate:** `{sueltos.length > 0 && (` → `{categories.length > 0 && (`. Con **cero** categorías el
  grupo sigue sin renderizarse (ahí todos los servicios son sueltos y sería el catálogo entero
  duplicado, sin ningún destino) — esa mitad del gate original era la correcta y queda intacta.
- **El comentario** de `:912-915` se reescribió: ahora nombra la condición real Y el **por qué** (el
  círculo vicioso del destino de arrastre + de dónde salió el reporte), no sólo la regla.
- **La copy, por estado.** Con sueltos queda literal la de siempre (*“Estos se reservan igual. En tu
  página aparecen al final, bajo ‘Otros’.”*). Vacía muestra otra: *“Acá van los servicios que no estén
  en ninguna categoría: se reservan igual y aparecen al final de tu página, bajo ‘Otros’.”* más un
  atajo que depende del dispositivo — `hidden sm:inline` *“Arrastrá uno hasta acá para sacarlo de su
  categoría.”* y `sm:hidden` *“Tocá un servicio y elegí ‘Sin categoría’ para traerlo acá.”*
- **El `<ul>` vacío** se gatea con `sueltos.length > 0`, igual que los chips de cada categoría.

**Los tres juicios que pedía el plan, resueltos y medidos:**

| Punto | Qué se encontró | Qué se hizo |
|---|---|---|
| `serviceCountLabel(0)` | devuelve `'Sin servicios'` (`lib/catalog-panel.ts:231`) — es LA MISMA etiqueta que ya muestran las filas de categoría vacías | se deja como está: “Sin categoría · Sin servicios” se lee bien y es consistente con el resto del panel |
| la copy en presente | con 0 sueltos, *“Estos se reservan igual…”* habla de servicios que no existen | copy propia del estado vacío, verdadera y accionable, sin tocar la del estado con sueltos |
| el `<ul>` vacío | dejaba `gap-2` del flex padre + su propio `pb-2` como hueco muerto dentro del recuadro | no se renderiza vacío |

**El recuadro vacío, verificado sobre el HTML real** (render de servidor, 3 categorías / 0 sueltos):
`<li class="rounded-md border border-dashed border-border bg-secondary/50 flex flex-col gap-2 p-2">`
con el header (“Sin categoría” + “Sin servicios”) y un único `<p>` de copy. El borde punteado —que ya
estaba— es lo que lo hace leer como zona de drop; no se inventó ningún token ni tratamiento nuevo.

**Sin regresiones de comportamiento:** `onDragOver` / `onDragLeave` / `onDrop` / `chipDropIntent` y la
regla G-23-10a (sin modo personalizado, el grupo propio de los sueltos no se marca como zona de drop)
quedaron **byte por byte iguales** — el diff del `<li>` toca sólo el gate, la copy y el `<ul>`.

**Verify:** `./node_modules/.bin/tsc --noEmit` → **0 líneas con `error TS`** · `npx eslint
components/dashboard/categorias-manager.tsx` → **rc=0**.

### Task 2 — el test que lo fija (`ab4eced`)

`components/dashboard/categorias-manager.test.tsx` (+6 casos, de 6 a 12 en el archivo).

**Desviación menor del plan, declarada:** el plan sugería `test/catalog-panel.test.ts` “o el archivo
que corresponda al organizador”, con el molde de *gates por lectura de fuente*. El archivo que
corresponde es el co-ubicado `categorias-manager.test.tsx`, que ya renderiza el componente entero con
`renderToStaticMarkup` en entorno `node` (cero paquetes, sin jsdom). Afirmar el gate sobre el HTML
REAL es estrictamente más fuerte que leer la fuente, así que se usó ese molde. `test/catalog-panel.test.ts`
queda para lo puro de `lib/` y no se tocó.

Los casos:

1. 3 categorías + 0 sueltos → **la zona se renderiza** (`<li ... border-dashed` × 1) y el conteo dice “Sin servicios”.
2. vacía → está la copy nueva y **no** está la que habla de servicios inexistentes.
3. con ≥1 suelto → vuelve la copy original y la de vacío no aparece.
4. vacía → **no** queda un `<ul>` de chips colgado (4 uls con sueltos vs 3 sin sueltos).
5. **0 categorías → la zona NO se renderiza**, ni su copy en ninguna de las dos formas.
6. el gate no depende del modo de orden: `alpha`/`alpha` con 0 sueltos también la muestra.

El marcador `<li[^>]*border-dashed` es preciso: las filas de categoría sólo toman `border-dashed`
mientras se las arrastra, y en render de servidor nada se arrastra.

`render()` pasa a aceptar un 4º parámetro `services` con default `SERVICES`, así los 6 tests viejos
quedan literalmente iguales.

## Verificación (números medidos, no narrados)

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` (NUNCA `npx tsc`) | `grep -c "error TS"` → **0** |
| `npx eslint` sobre el componente y su test | **rc=0**, sin hallazgos |
| `npx vitest run` | **97 files passed · 1365 passed** \| 4 expected fail \| 1 skipped (1370) — piso 1359 + los 6 nuevos = 1365 exacto |
| canarios de reloj (`service-delete-gate`, `capacity-mode-change-gate`) | **verdes** — corrido a las **12:34 AR**, dentro de `[01:00, 23:30]` |
| `ls supabase/migrations/*.sql \| wc -l` | **41** (sin cambios) |
| paquetes nuevos | **0** — `package.json` y `package-lock.json` sin modificar (`git status --short` vacío para ambos) |

## Desviaciones del plan

**1. [Menor — elección de archivo de test] El test vive en `components/dashboard/categorias-manager.test.tsx`, no en `test/catalog-panel.test.ts`**

- **Encontrado durante:** Task 2.
- **Motivo:** el plan admitía “el archivo que corresponda al organizador”. Ese archivo ya existe y ya
  renderiza el componente con `renderToStaticMarkup` en entorno `node`; el gate se afirma sobre el
  HTML real en vez de por lectura de la fuente.
- **Impacto:** ninguno negativo — test más fuerte, cero paquetes nuevos, carril `pure` (los tests
  co-ubicados fuera de `test/` caen ahí automáticamente por el `exclude` de `vitest.config.mts`).
- **Commit:** `ab4eced`.

**2. [Decisión de copy — no era un cambio “mínimo”] La zona vacía trae copy propia + atajo por dispositivo**

- **Encontrado durante:** Task 1, resolviendo el segundo juicio que el plan marcaba.
- **Motivo:** una caja siempre visible con una frase que miente es peor que el bug que reemplaza, y
  una zona de drop vacía sin instrucción se lee como un error de render. El hint de arrastre se
  esconde en mobile porque ahí el arrastre nativo no existe (molde `hidden sm:inline` que el pipeline
  del CRM ya usa en `app/(crm)/admin/pipeline/pipeline-client.tsx:225`).
- **Impacto:** sólo copy y visibilidad responsive; ningún handler tocado.
- **Commit:** `afc2fbd`.

**Total: 2 desviaciones, ninguna arquitectónica, ninguna de Rule 4.**

## Known Stubs

Ninguno. No se dejó placeholder, TODO ni dato sin cablear.

## Fuera de alcance (respetado)

- No se tocó nada más del organizador ni de la Phase 23.
- El arrastre táctil en mobile sigue siendo el follow-up diferido conocido del repo; acá sólo se
  reconoce en la copy (el camino en touch es el botón del chip → “Mover …”).

## Verificación visual pendiente

Los gates automáticos cubren la condición, la copy y la estructura. Queda para el dueño confirmar a
ojo, en `/servicios` con ≥1 categoría y 0 sueltos: que el recuadro punteado vacío se lee como zona de
drop y que arrastrar el primer chip hasta ahí lo desasigna.

## Self-Check: PASSED

- `components/dashboard/categorias-manager.tsx` — FOUND (modificado)
- `components/dashboard/categorias-manager.test.tsx` — FOUND (modificado)
- commit `afc2fbd` — FOUND
- commit `ab4eced` — FOUND
- `git rev-list --count 8d43f71..HEAD` → **2**, igual a `actuals.commits`
