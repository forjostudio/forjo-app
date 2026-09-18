---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 08
subsystem: ui
tags: [panel, servicios, layout, responsive, accesibilidad, tailwind, gap-closure]
gap_closure: true
gap_ids: [G-23-20]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "tarjeta de servicio con seis hijos de contenido, el renglón de descripción + link de 23-07 y la zona de exclusión de G-04"
provides:
  - "tarjeta de servicio del panel con columna derecha de tres celdas en desktop: precio en la fila del nombre, duración debajo y las tres acciones debajo de las dos"
  - "línea de datos convertida en el renglón de mobile, con gate de viewport y una sola derivación de duración y precio por servicio"
  - "entrada G-23-20 en Cambios post-UAT del 23-UI-SPEC con el contrato responsive de la tarjeta"
affects: [verify-work-23, phase-24-CAT-10]

actuals:
  tokens: 5200
  tasks: 2
  commits: 2
plan_head_before: a7044d090fb24bd77aa0c64294bc2fcfee9a907a

tech-stack:
  added: []
  patterns:
    - "Reordenamiento visual por grilla, no por DOM: el bloque de acciones sigue siendo el último hijo y cambia de fila declarada (sm:row-start-3 + sm:self-start)"
    - "Duplicación de markup deliberada con gate de viewport: un solo dato derivado una vez, pintado en dos nodos excluyentes (hidden/sm:block vs sm:hidden), así ningún lector de pantalla lo lee dos veces"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - .planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md

key-decisions:
  - "G-23-20: precio y duración van como DOS celdas hermanas de la columna derecha (filas 1 y 2) y no como un bloque apilado, porque el centrado vertical que la tarjeta ya tenía alinea el precio con el nombre sólo si son items de la misma fila"
  - "G-23-20: la línea de datos no se renderiza en desktop cuando el cupo es individual (sm:hidden condicional con cn()), para no dejar una celda vacía que suma una fila de separación"
  - "G-23-20: mobile no se toca — el layout nuevo va sólo desde 640px, para no reabrir el desborde medido de 375px (G-02) ni los toques errados (G-04)"
  - "Desvío medido: el gate C1 del plan exige el prefijo literal className=\" y la acción (c) del mismo plan exige cn() — son incompatibles; se conservaron las seis anclas de columna y se midió con el instrumento correcto (6)"

patterns-established:
  - "Hijo nuevo de la tarjeta de servicio: si es contenido declara la primera columna (seis hoy); si va a la derecha declara columna Y fila (tres hoy)"

requirements-completed: [CAT-11]

coverage:
  - id: D1
    description: "En desktop la columna derecha tiene tres celdas declaradas (precio en la fila del nombre, duración debajo, acciones debajo de las dos) y los seis hijos de contenido conservan su columna"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate por región awk sobre settings-client.tsx: col-derecha=3, fila1=1, fila2=1, fila3=1, alineados al borde derecho=2, bloques solo-desktop=2, anclas de columna izquierda=6 (medidas con grep sm:col-start-1; ver Deviations)"
        status: pass
    human_judgment: true
    rationale: "Que el precio quede visualmente a la altura del título sólo lo verifica la UAT visual (human-check 2 y 3 del Task 1)"
  - id: D2
    description: "En mobile la tarjeta queda idéntica: un solo renglón de texto con duración y precio, acciones al final con su divisoria y su zona de exclusión"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate por región: gates de mobile=3 (contenedor condicional, renglón y separador), formateos del precio=1, durationLabel=3, priceLabel=3, rótulo de cupo=2, divisoria border-t=1"
        status: pass
    human_judgment: true
    rationale: "UAT visual pendiente a 375px (human-check 1 y 3 del Task 1): sin scroll horizontal y sin el precio dos veces"
  - id: D3
    description: "No se perdió nada de 23-07 ni de G-04 y no hay camino de escritura nuevo"
    verification:
      - kind: other
        ref: "aperturas del diálogo=2, renglón de descripción line-clamp-1=1, control de cupo=1, líneas con from('services')=6; migraciones=41; package.json/package-lock.json sin cambios"
        status: pass
      - kind: unit
        ref: "npx vitest run --project pure — 61 archivos, 996 pasados, 3 expected fail (piso 996)"
        status: pass
    human_judgment: false
  - id: D4
    description: "El 23-UI-SPEC documenta el layout nuevo y los dos motivos por los que mobile queda afuera"
    verification:
      - kind: other
        ref: "gates de presencia: cuatro entradas en Cambios post-UAT (G-23-6, G-23-6b, G-23-10a, G-23-20), mención en Alcance=1, entrada de 7 líneas citando G-02, G-04 y 640, Checker Sign-Off intacto"
        status: pass
    human_judgment: true
    rationale: "La lectura de la entrada (human-check del Task 2) la hace una persona: tiene que poder responder qué se ve en desktop, qué en mobile y por qué no son lo mismo"

duration: 8min
completed: 2026-09-18
status: complete
---

# Phase 23 Plan 08: Precio y duración a la derecha en la tarjeta del panel Summary

**En `/servicios`, a partir de 640px la tarjeta de servicio muestra el precio en la columna derecha a la altura del nombre, la duración debajo en el registro de la descripción y las tres acciones debajo de las dos; la línea de datos quedó como el renglón de mobile y la tarjeta a 375px no cambió ni un píxel (G-23-20).**

## Performance

- **Duración:** ~8 min
- **Inicio:** 2026-09-18T13:27:59Z
- **Fin:** 2026-09-18T13:36:24Z
- **Tareas:** 2
- **Archivos:** 2 modificados

## Accomplishments

- **Columna derecha de tres celdas.** Dos `<p>` hermanos nuevos, inmediatamente después del bloque del nombre: el precio en `sm:col-start-2 sm:row-start-1` con el mismo registro tipográfico que el nombre, y la duración en `sm:row-start-2` con `sm:self-start` en el registro de la descripción. Los dos con `hidden … sm:block` y `sm:justify-self-end`. El bloque de acciones pasó de `sm:row-start-1` a `sm:row-start-3 sm:self-start`: su columna, su padding de mobile, su divisoria y sus resets de desktop no se tocaron.
- **Una sola derivación por servicio.** `durationLabel` y `priceLabel` se calculan junto a `capacityModeLabel` y se pintan en dos lugares con gate de viewport excluyente, así que exactamente uno está visible por vez y el otro queda fuera del árbol de accesibilidad. El precio se formatea en un único lugar del archivo (`toLocaleString` = 1 en la región).
- **La línea de datos es ahora el renglón de mobile.** El contenedor conserva su ancla de columna y suma `sm:hidden` condicional con `cn()` cuando el cupo es individual, para no dejar una celda vacía que le agregue una fila de separación a la tarjeta. Adentro, el nodo de duración y precio y el separador que precede al rótulo llevan `sm:hidden`; el rótulo del modo de cupo y el `CapacityInlineControl` no se movieron.
- **Los tres comentarios que describían el layout viejo describen el nuevo:** "ESTRUCTURA DE LA TARJETA" (la grilla de hoy y la regla de la celda declarada para el próximo que toque esto), el comentario de D-07 sobre la línea de datos (qué vale en mobile y qué en desktop) y el de la zona de exclusión (las acciones en la tercera fila + el párrafo de ORDEN DE FOCO, con el reordenamiento visual explícitamente a cargo de la grilla, no del DOM).
- **Contrato actualizado:** entrada `G-23-20` en `## Cambios post-UAT` del 23-UI-SPEC con diagnóstico, decisión del usuario, qué se hizo, por qué mobile queda afuera (los 61px medidos de G-02 y los toques errados de G-04) y qué no cambió; el blockquote de "Fuera de este contrato" nombra el gap nuevo y su plan.

## Task Commits

1. **Task 1: precio y duración a la derecha, acciones debajo** - `3b500af` (feat)
2. **Task 2: el contrato documenta el layout nuevo** - `9a4d16b` (docs)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` - dos celdas nuevas en la columna derecha de la tarjeta, la línea de datos convertida en renglón de mobile, las acciones a la tercera fila, tres comentarios reescritos.
- `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md` - entrada G-23-20 en Cambios post-UAT y mención en "Fuera de este contrato".

## Decisions Made

- Precio y duración van como **dos celdas hermanas** y no como un bloque apilado: el nombre y el precio son items de la misma fila, así que el `sm:items-center` que la tarjeta ya tenía los alinea sin una sola clase extra. Un contenedor único sería un item alto en la fila 1 y el nombre quedaría centrado contra ese bloque en vez de alineado con el precio.
- La duración lleva `sm:self-start` para quedar pegada debajo del precio sin importar cuánto mida el renglón de descripción que tiene al lado; las acciones llevan `sm:self-start` por el mismo motivo respecto de las píldoras de sedes.
- Se replicó la **jerarquía** de la tarjeta pública, no sus clases: `text-sm font-medium` para el precio y `text-xs text-muted-foreground` para la duración. Ni `text-lg`, ni `font-bold`, ni la fuente de títulos, ni `tabular-nums`. Cero clases de espaciado nuevas: se reusa el `gap-2` de la caja.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Contradicción interna del plan entre el gate C1 y la acción (c)**

- **Encontrado durante:** Task 1.
- **Problema:** el primer gate automatizado mide las anclas de la columna izquierda con `grep -cE 'className="[^"]*sm:col-start-1'` y exige **6**, o sea exige el prefijo literal `className="`. La acción (c) del mismo plan —y el gate siguiente, que espera `sm:hidden` en "el contenedor condicional"— exige envolver el `className` de la línea de datos en `cn()`, lo que convierte el atributo en `className={cn('…')}` y hace que esa línea deje de matchear esa regex. **Las dos cosas no pueden ser ciertas a la vez:** ninguna forma de JSX permite un `className` condicional conservando el prefijo `className="`.
- **Resolución:** se implementó `cn()` (la acción en prosa, el gate de mobile y el uso idiomático del archivo apuntan ahí) y se midió la verdad que el gate quería proteger —*"cada hijo de contenido declara su celda"*— con el instrumento correcto:
  - `grep -cE 'className="[^"]*sm:col-start-1'` (regex del plan) → **5**
  - `grep -cE 'sm:col-start-1'` (intención: anclas declaradas) → **6** ✅
- **Efecto sobre el `must_have`:** ninguno. Los seis hijos de contenido conservan su columna declarada y ninguno se va al hueco de la derecha en desktop; los otros cinco gates de estructura (columna derecha = 3, fila 1/2/3 = 1 cada una, alineados al borde derecho = 2, bloques solo-desktop = 2) pasan tal cual.
- **Archivos modificados:** ninguno extra.
- **Commit:** `3b500af`.
- **Para `/gsd-verify-work`:** el gate 1 del plan va a reportar `columna izquierda=5 (6)` y salir distinto de 0. Es un defecto del instrumento, no del código: re-medir con `grep -cE 'sm:col-start-1'` sobre la misma región.

## Issues Encountered

- `npm run lint` sobre el repo entero reporta 1057 errores y 253 warnings preexistentes (fuera de alcance, no se tocaron). El gate que aplica es el per-archivo: `settings-client.tsx` sigue en **11 errores**, exactamente el piso medido, o sea el cambio no agregó ninguno.
- `./node_modules/.bin/tsc --noEmit` filtrado: cero líneas `error TS`.
- `npx vitest run --project pure`: 61 archivos, 996 pasados, 3 expected fail — el piso exacto del plan. Se corrió el carril `pure` y no la suite completa por la decisión escrita del plan (este cambio no toca lógica ni datos).
- Migraciones: **41**, sin cambios. `package.json` / `package-lock.json`: sin tocar.

## Pending human checks (UAT visual)

No se pudo verificar en navegador; quedan para `/gsd-verify-work` (local, login `test@forjo.local` / `Forjo1234!`, pantalla `/servicios`):

1. **Mobile a 375px — nada cambió.** Una sola columna: nombre, renglón de descripción, link Editar, la línea con duración y precio en un solo renglón (y el modo de cupo detrás del punto medio si corresponde), sedes, cobertura, y al final la divisoria con las tres acciones. El precio **no** aparece dos veces. Sin scroll horizontal.
2. **Desktop — el layout nuevo.** A la derecha del nombre y a su misma altura, el precio; debajo la duración, más chica y en gris; debajo de las dos, Desactivar / lápiz / tacho. Duración y precio ya **no** aparecen en la columna izquierda. Los tres bloques alineados contra el borde derecho.
3. **Servicio con cupo compartido.** En desktop, el rótulo del modo en la columna izquierda **sin** separador colgando adelante, y el control de cupo debajo con el mismo aire. En mobile, la línea completa igual que hoy. Un servicio individual en desktop no deja hueco vacío donde estaba la línea.
4. **Nombre largo (40+ caracteres) y precio de 7 dígitos.** Sigue truncando en desktop (la tarjeta no crece hacia la derecha ni el nombre pierde ancho) y envolviendo en mobile.
5. **Foco por teclado.** Con Tab: link Editar → Desactivar → lápiz → tacho, con anillo visible, en las dos vistas. Enter en el link abre el diálogo. Repetir en la pestaña Desactivados.
6. **Lectura del contrato (Task 2):** alguien que no vio esta UAT tiene que poder responder, leyendo la entrada `G-23-20` del 23-UI-SPEC, qué ve el dueño en desktop, qué ve en mobile y por qué no son lo mismo.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-23-20 era el único gap abierto de la UAT de la Phase 23: con este plan la fase queda lista para la re-verificación.
- La Phase 24 (superficie pública) hereda del contrato la regla de celdas declaradas de la tarjeta del panel, aunque no toca este archivo.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-18*

## Self-Check: PASSED
