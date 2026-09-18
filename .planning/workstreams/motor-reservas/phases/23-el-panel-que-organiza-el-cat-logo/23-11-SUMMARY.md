---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 11
subsystem: docs
tags: [ui-spec, contrato, gap-closure, documentacion, wr-03]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "la tarjeta y el diálogo FINALES que dejaron 23-09 (nombre que envuelve, modo+cupo en una línea, cinco hijos de contenido) y 23-10 (hueco del scrollbar reservado, toggle apilado, guarda del borrador)"
provides:
  - "la entrada G-23-20 del 23-UI-SPEC.md describe la fila DERIVADA de las acciones y ya no una fila fija (G-23-24)"
  - "su 'Regla para el que toque esta región' nombra WR-03, el defecto que ya ocurrió una vez sobre ese mismo fix, y da el corolario operativo"
  - "dos entradas post-UAT nuevas: G-23-21 + G-23-23 (23-09) y G-23-22 (23-10), con los números MEDIDOS y los modos de falla que no hay que reabrir"
  - "el blockquote de alcance nombra los gaps de esta ronda con su plan y deja escrito por qué el toggle de la Phase 17 se tocó en esta fase"
affects: [phase-24, tarjeta-de-servicio, dialogo-editar-servicio]

actuals:
  tokens: 4366   # MEDIDO: chars/4 sobre el diff real (17.463 chars) — el estimate del plan era 25k
  tasks: 2
  commits: 2     # MEDIDO: git rev-list --count bd9eebe..HEAD

plan_head_before: bd9eebe360d60e0d734665a3ca2c4547278a4a28

tech-stack:
  added: []
  patterns:
    - "el contrato y el comentario del código son DOS lecturas del mismo hecho: la regla remite al nombre de la fórmula en el archivo y dice explícitamente que si divergen, alguien tocó uno sin el otro"
    - "una regla de contrato nombra el defecto que ya ocurrió (WR-03), no sólo la buena práctica: una regla que no nombra el defecto no lo previene la segunda vez"

key-files:
  created:
    - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-11-SUMMARY.md"
  modified:
    - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md"

key-decisions:
  - "La entrada G-23-20 se CORRIGE, no se rehace: el diagnóstico, la decisión del usuario y el párrafo de por qué mobile queda afuera (G-02 y G-04) son la parte que el dueño aprobó en el Test 22 y quedan enteros. Cambian dos cosas: el bullet 'Qué se hizo' y la regla del final"
  - "La fila derivada sale a un BULLET propio en vez de quedar sepultada dentro de 'Qué se hizo': es el primer ítem de `missing` del gap y lo que la Phase 24 va a buscar primero"
  - "G-23-21 y G-23-23 van en UNA sola entrada: son la misma tarjeta, el mismo plan y el mismo párrafo de trampas; separarlas obligaba a repetir el modo de falla del gate del envoltorio en las dos"
  - "G-23-25 se documenta DENTRO de la entrada de G-23-22 y no en una entrada propia: comparten plan (23-10) y el gate del plan exige exactamente seis entradas en la sección"
  - "El diagnóstico histórico de G-23-20 conserva su 'seis hijos de contenido' (era cierto ANTES del layout nuevo); el número de HOY —cinco— se declara en 'Qué se hizo' y en la regla, que son los dos lugares desde donde alguien va a operar"

requirements-completed: [CAT-11]

coverage:
  - id: D1
    description: "G-23-24 ítem 1 — el bullet 'Qué se hizo' de G-23-20 dice que la fila de las acciones se DERIVA de cuántos hijos rinde la columna izquierda, y por qué viaja como variable CSS"
    requirement: CAT-11
    verification:
      - kind: command
        ref: "gate del Task 1 — la entrada dice 'deriva' (2 líneas), conserva G-02, G-04 y el breakpoint de 640px, y tiene cuerpo (17 líneas)"
        status: pass
    human_judgment: false
  - id: D2
    description: "G-23-24 ítem 2 — la regla del final nombra WR-03, advierte que un número de fila fijo en la columna derecha se rompe cuando la izquierda crece, y da el corolario operativo"
    requirement: CAT-11
    verification:
      - kind: command
        ref: "gate del Task 1 — 'WR-03' en 2 líneas de la entrada y 'fija/fijo' en 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "La entrada describe la tarjeta FINAL (cinco hijos de contenido, el envoltorio único del modo+cupo), no la intermedia de 23-08"
    verification:
      - kind: other
        ref: "el bullet 'Qué se hizo' y la regla dicen cinco hijos y remiten a la entrada nueva; contrastado contra 23-09-SUMMARY.md (gate de región: hijos de la columna izquierda = 5) y contra el comentario vigente de settings-client.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "La sección post-UAT tiene una entrada por cada gap cerrado en la fase, incluidas las tres de esta ronda, cada una con su plan"
    requirement: CAT-11
    verification:
      - kind: command
        ref: "gate del Task 2 — 6 entradas exactas: G-23-6, G-23-6b, G-23-10a, G-23-20, G-23-21+G-23-23 (23-09) y G-23-22 (23-10, con G-23-25 adentro)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Las entradas nuevas citan los números MEDIDOS y nombran los modos de falla que no hay que reabrir"
    verification:
      - kind: command
        ref: "gate del Task 2 — la de la tarjeta cita 271px, G-04, WR-03 y 640px; la del diálogo cita el popup de 384px, el scrollbar y el caller/Phase 17"
        status: pass
      - kind: other
        ref: "los números salen de 23-09-SUMMARY.md (307.88 → 271 / 276.5 → 204.5 / filas [20 36 34 26.5 32]) y de 23-10-SUMMARY.md (384.00 en los 30 casos, 369px de ancho útil, 46 → 126 de alto), no del plan"
        status: pass
    human_judgment: false
  - id: D6
    description: "El blockquote de alcance nombra los gaps de esta ronda con su plan y deja escrito por qué el toggle del modo de cupo, que es de la Phase 17, se tocó acá"
    requirement: CAT-11
    verification:
      - kind: command
        ref: "gate del Task 2 — el alcance nombra G-23-21, G-23-22 y G-23-23; el párrafo nuevo explica el diálogo adentro del alcance y el componente compartido intacto"
        status: pass
    human_judgment: false
  - id: D7
    description: "Ninguna otra sección del contrato cambió y no se tocó una línea de código"
    verification:
      - kind: command
        ref: "gates de los dos tasks — Sign-Off / Cambios post-UAT / Responsive / Accesibilidad / Copywriting / Registry = 1 cada una; `git status --porcelain app components lib` vacío en las dos tareas; el diff del plan toca 1 solo archivo `.md`"
        status: pass
    human_judgment: false
  - id: D8
    description: "Quien llegue a la Phase 24 sin haber visto esta UAT puede responder, leyendo SÓLO el contrato, las cuatro preguntas del human-check"
    verification: []
    human_judgment: true
    rationale: "Es juicio de lectura sobre prosa: que el contrato se entienda de punta a punta no lo puede assertar un grep. El autor las recorrió (desktop vs mobile y su por qué en G-23-20; lo derivado y qué pasa si se clava, en el bullet nuevo y en la regla; lo intocable de la tarjeta en la 'trampa' de G-23-21+G-23-23; el toggle apilado y el arreglo en el caller en G-23-22), pero la confirmación es del dueño en la UAT."

duration: 12 min
completed: 2026-09-18
status: complete
---

# Phase 23 Plan 11: G-23-24 — el contrato al día con la tarjeta y el diálogo finales Summary

**La entrada `G-23-20` del `23-UI-SPEC.md` deja de contar una fila fija: ahora dice que la fila de las acciones se DERIVA de cuántos hijos rinde la columna izquierda, por qué viaja como variable CSS, y su regla nombra WR-03 —el defecto que ya ocurrió una vez sobre ese mismo fix— con el corolario de que quien agregue un hijo a la izquierda tiene que sumar su fila; y la sección post-UAT suma las dos entradas de esta ronda con los números que midieron 23-09 y 23-10, no con los que proyectaba el plan.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-09-18
- **Tasks:** 2 de 2
- **Files modified:** 1 (`.md`) · **Código tocado: 0 líneas**

## Accomplishments

- **G-23-24 cerrado en sus dos ítems de `missing`.** (1) El bullet "Qué se hizo" pasa de "las tres acciones debajo de las dos" a "**en la última**", y un bullet nuevo declara que la fila **se deriva** de cuántos hijos rinde la columna izquierda —enumerando cuáles son condicionales: el envoltorio del modo+cupo sólo con cupo compartido, las sedes sólo si hay alguna activa, la cobertura sólo con dos o más profesionales—, con el piso que impide que las acciones queden por encima del precio y la duración. (2) La regla del final nombra el defecto: **WR-03 ya ocurrió exactamente así**, con las acciones clavadas en la tercera fila y el stepper, las píldoras de sedes y la cobertura por debajo de los botones, y el foco bajando y volviendo a subir (WCAG 2.4.3).
- **La variable CSS quedó explicada, no sólo mencionada.** Por qué no es una clase (una clase de fila con valor dinámico no la genera el compilador de Tailwind), por qué igual se puede gatear por viewport (el `style` inline no, pero la clase que lo consume sí) y qué pasa si falta (cae en `auto` y la grilla coloca igual el bloque al final: **el degradado es el layout correcto, nunca el defecto de la fila fija**).
- **El contrato describe la tarjeta FINAL, no la intermedia.** Donde se opera —el bullet "Qué se hizo" y la regla— el número es **cinco** hijos de contenido, con el envoltorio del modo+cupo contado como **uno**. El "seis" del diagnóstico queda intacto porque ahí es histórico: describe lo que la tarjeta **había acumulado** antes del layout nuevo.
- **Dos entradas post-UAT nuevas, con los números medidos.** La de la tarjeta (23-09) trae los 271px de interior contra los 307.88 del párrafo, los 147px de desborde con la pill, la descomposición de la fila de 82px en 24 + 34 + 24, el −72px de compactación y la trampa del gate del envoltorio. La del diálogo (23-10) trae las **dos premisas falsas del reporte medidas** —el popup mide 384px constantes y las tres columnas del toggle eran iguales—, los 133.58px que "Recurso simultáneo" necesitaba y nunca tuvo, el +80px aceptado por escrito y las dos opciones descartadas.
- **G-23-25 quedó documentado donde alguien lo va a buscar**, dentro de la entrada de su propio plan: la guarda que cancela el cierre por click afuera o Escape sólo con cambios, la ✕ que cierra siempre y por qué, y el modo de falla a vigilar (la huella mal normalizada que convierte la mejora en trampa).
- **El alcance dejó de mentir por omisión.** El blockquote nombra los cinco gaps nuevos con su plan y suma un párrafo que explica por qué un componente de la **Phase 17** se tocó en esta fase: los dos campos nuevos del bloque C le sumaron 188px al cuerpo del diálogo y corrieron la ventana de un defecto que ya estaba puesto.

## Task Commits

1. **Task 1: G-23-24 — la entrada G-23-20 dice que la fila es derivada y su regla previene WR-03** — `9b7dd6a` (docs)
2. **Task 2: dos entradas nuevas + encabezado + blockquote de alcance** — `91aa7a1` (docs)

**Plan metadata:** ver el commit `docs(23-11)` de este SUMMARY.

## Files Created/Modified

- `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md` — en la entrada `G-23-20`: el cierre del bullet "Qué se hizo" ("en la última" + los cinco hijos + la remisión a la entrada nueva), un bullet nuevo con la fila derivada y la variable CSS, y la regla del final ampliada con WR-03 y el corolario. En `## Cambios post-UAT`: el encabezado (23-05 … 23-11), su bajada (las dos rondas) y las dos entradas nuevas antes del Checker Sign-Off. En `## Alcance de la superficie`: el blockquote actualizado con los cinco gaps nuevos y el párrafo del diálogo/Phase 17.

## Verificación

| Gate | Medido | Exigido |
|---|---|---|
| la entrada G-23-20 dice que la fila es derivada | 2 líneas | ≥1 |
| nombra WR-03 / advierte sobre la fila fija | 2 / 2 | ≥1 / ≥1 |
| conserva G-02 · G-04 · el breakpoint de 640px | 1 · 1 · 1 | ≥1 cada uno |
| entradas en `## Cambios post-UAT` | 6 | exactamente 6 |
| las cuatro anteriores intactas (6 · 6b · 10a · 20) | 1 · 1 · 1 · 1 | 1 cada una |
| entrada de la tarjeta: cuerpo · 271px · G-04 · WR-03 · 640 | 6 · 2 · 2 · 1 · 2 | ≥6 · ≥1 · ≥1 · ≥1 · ≥1 |
| entrada del diálogo: cuerpo · 384px · scrollbar · caller/Phase 17 | 7 · 1 · 3 · 3 | ≥5 · ≥1 · ≥1 · ≥1 |
| el alcance nombra G-23-21 · G-23-22 · G-23-23 | 1 · 2 · 1 | ≥1 cada uno |
| secciones mayores intactas (Sign-Off, post-UAT, Responsive, Accesibilidad, Copywriting, Registry) | 1 cada una | 1 cada una |
| **cambios sin commitear en `app` / `components` / `lib`** | **0** | **0** |
| archivos tocados por el plan | 1 (`.md`) | sólo el contrato |

**`human-check` del Task 2 (lectura de las cuatro preguntas):** las cuatro se responden leyendo sólo el contrato — (1) desktop vs mobile y su porqué, en `G-23-20` ("Qué se hizo" + "Por qué mobile queda afuera", con los 61px de G-02 y los toques errados de G-04); (2) qué es derivado y qué pasa si se clava, en el bullet nuevo y en la regla; (3) qué no se puede tocar en la tarjeta, en la "trampa" de `G-23-21 + G-23-23` (el gate del envoltorio, el padding por debajo de 640px, la divisoria de mobile); (4) por qué el toggle se lee apilado y por qué el arreglo del scroll va en el caller, en `G-23-22`. Queda igual para la confirmación del dueño en la UAT visual: es juicio de lectura, no un grep.

## Decisions Made

Ver `key-decisions` en el frontmatter. En corto: la entrada de G-23-20 se corrige y no se rehace; la fila derivada sale a un bullet propio porque es lo que la Phase 24 va a buscar primero; G-23-21 y G-23-23 comparten una entrada (misma tarjeta, mismo plan, mismas trampas) y G-23-25 va adentro de la de G-23-22 (mismo plan); el "seis" del diagnóstico se conserva porque ahí es histórico.

## Deviations from Plan

None - plan executed exactly as written. Las dos tareas hicieron las ediciones que el plan describe, con `Edit` acotado y anclado por texto único, y los cinco gates automáticos dieron verde en la primera corrida.

## Issues Encountered

- **Ninguno.** Vale una nota de instrumento: el `awk` de los gates corta la entrada de `G-23-20` en el próximo `^###`, que ya no existe hasta el final del archivo, así que el conteo de líneas de esa entrada (17) incluye las entradas siguientes. No invalida el gate —lo que mide es que la entrada tenga cuerpo y que no se haya perdido nada— pero el número no es "líneas de la entrada" en sentido estricto.

## Known Stubs

None — el plan es documentación y quedó completa: no hay secciones marcadas como pendientes ni remisiones a un archivo que no exista.

## User Setup Required

None — cero código, cero servicios externos, cero variables de entorno, cero migraciones (siguen siendo 41 en el repo).

## Next Phase Readiness

- **Phase 23 cerrada del lado del contrato.** Los tres gaps de esta ronda (G-23-21, G-23-22, G-23-23), el reportado post-UAT (G-23-25) y este mismo (G-23-24) quedan documentados en `## Cambios post-UAT` con su plan.
- **Lo que sigue pendiente es la UAT visual de `/gsd-verify-work`**, que es de los planes 23-09 y 23-10, no de éste: siete checks de la tarjeta y veintiuno del diálogo (los cuatro falsos positivos de la guarda del borrador son la prioridad).
- **Lo que la Phase 24 hereda de este contrato:** la fila de las acciones es derivada y quien agregue un hijo a la columna izquierda tiene que sumar su fila; el padding del control de cupo no se saca de mobile; el gate de viewport viaja con el envoltorio; y el patrón de scroll de los diálogos es por caller, nunca en `components/ui/dialog.tsx`.
- Sin blockers.

## Self-Check: PASSED

- `23-11-SUMMARY.md` existe en disco.
- `23-UI-SPEC.md` existe en disco y es el único archivo del diff del plan.
- Los dos commits de tarea existen en el árbol: `9b7dd6a`, `91aa7a1`.
- `git rev-list --count bd9eebe..HEAD` = 2, igual al `commits:` del frontmatter.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-18*
</content>
</invoke>
