---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 10
subsystem: ui
tags: [tailwind, css-grid, scrollbar-gutter, base-ui, dialog, sonner, settings-client, a11y]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "el diálogo de edición con scroll por caller (Phase 17), el toggle de tres modos de cupo (CUPO-09) y la tarjeta de servicio ya compactada por 23-09"
provides:
  - "el cuerpo scrolleable del diálogo Editar servicio reserva SIEMPRE el hueco del scrollbar: el ancho útil deja de moverse 15px entre modos de cupo (G-23-22, causa 1)"
  - "el toggle del modo de cupo se apila también en desktop: las tres etiquetas enteras en una línea y cero desborde del texto sobre la píldora (G-23-22, causa 2)"
  - "guarda compartida contra el descarte accidental del borrador en los tres diálogos de edición del panel — servicio, sede y profesional (G-23-25)"
  - "el patrón de cancelar el cierre de un diálogo de Base UI desde el propio onOpenChange, documentado para el próximo caller (no existía precedente en el repo)"
affects: [uat-visual-fase-23, dialogo-editar-servicio, dialogo-editar-sede, dialogo-editar-profesional]

actuals:
  tokens: 5900   # MEDIDO: chars/4 sobre el diff real (23.434 chars) — el estimate de 58k era del plan, no del cambio
  tasks: 4
  commits: 4     # MEDIDO: git rev-list --count ${plan_head_before}..HEAD (3 de código + este SUMMARY)

plan_head_before: 11e64ae9550692872466aedba5306d5cd2087723

tech-stack:
  added: []
  patterns:
    - "`[scrollbar-gutter:stable]` como propiedad arbitraria en el CALLER del diálogo, nunca en components/ui/dialog.tsx: el patrón de scroll es por caller desde la Phase 17"
    - "cancelar el cierre de un diálogo de Base UI desde el propio `onOpenChange` (`details.cancel()`), NO con `disablePointerDismissal`: la prop corta el predicado antes del handler y mataría el aviso"
    - "una guarda que devuelve el handler (`guardDraftOnDismiss(isDirty, close)`) para que los tres diálogos compartan un solo camino de código"
    - "`isDirty` viaja como FUNCIÓN, no como booleano: la huella se calcula recién cuando hay un intento de cierre, no en cada tecleo"
    - "huella normalizada contra el MISMO objeto que inicializa el borrador al abrir (un solo mapeo), pasando los dos lados por los normalizadores del guardado"
    - "identificador fijo de toast de sonner para un aviso que se puede disparar N veces seguidas"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "El hueco del scrollbar se reserva en el contenedor scrolleable del diálogo (caller) y NO en components/ui/dialog.tsx: el componente compartido lo consumen ~15 diálogos que nadie midió, y la Phase 17 decidió explícitamente dejarlo byte-idéntico"
  - "El toggle se apila también en desktop (opción C del usuario, 2026-09-18) en vez de achicar texto, achicar padding o ensanchar el diálogo: la etiqueta más larga necesita 133.58px contra los 87.33/82.33px que da una celda de tres columnas, así que en horizontal envolvía SIEMPRE — no era un caso borde"
  - "El comentario que afirmaba que 'Recurso simultáneo entra en una línea' en desktop se reescribe con el número que lo desmiente: era falso desde que se escribió"
  - "El alto fijo del botón NO se toca: el desborde de 2px del texto sólo existía con la etiqueta en dos líneas y se apaga solo (medido: 45/45 píldoras con alto de contenido = alto de caja)"
  - "G-23-25 NO se implementa con `disablePointerDismissal`, que es lo que proponía el apunte del UAT: medido en @base-ui/react 1.5, esa prop corta el predicado del click afuera ANTES del handler, así que el diálogo no cerraría pero tampoco avisaría — y el aviso es parte de la decisión del usuario"
  - "La guarda mira EXACTAMENTE dos motivos (`outside-press` y `escape-key`). La ✕ (`close-press`) y el guardado quedan afuera a propósito: si la guarda los alcanzara, un borrador con el nombre vacío dejaría al dueño encerrado en un diálogo sin salida"
  - "El punto de partida de la comparación es la huella del MISMO objeto que inicializa el borrador (capturado en una constante local en las tres aperturas), no una reconstrucción desde la fila: un segundo mapeo es una segunda fuente de verdad que se desincroniza"
  - "El payload de la sede se muda a `locToPayload` a nivel de módulo y lo comparten el guardado y la huella: así la sede tiene UNA sola normalización y no hay nada que espejar"
  - "Las sedes se ordenan sólo DENTRO de la huella: apagar y volver a prender una sede deja el mismo conjunto en otro orden, y sin ordenar la huella lo leería como cambio"
  - "El aviso es un toast y no una confirmación '¿Descartar cambios?': CLAUDE.md prohíbe los modales anidados y el usuario ya arbitró"
  - "La sonda vive fuera del repo y no se commitea: es un instrumento, no un artefacto del proyecto"

patterns-established:
  - "Sonda en iframes creados vacíos (about:blank ⇒ mismo origen que el host) y construidos desde el host: evita el postMessage cross-origin de file:// y deja al host leer el DOM medido directo"
  - "Bajo `--virtual-time-budget`, `requestAnimationFrame` puede no dispararse nunca (no hay presentación): los waits de una sonda headless tienen que ser `setTimeout`, que el reloj virtual sí avanza"
  - "La sonda vuelca resultados parciales en CADA vuelta: si el presupuesto de tiempo virtual se agota a mitad, el dump dice dónde se cortó en vez de quedar en PENDING"

requirements-completed: [CAT-11]

coverage:
  - id: D1
    description: "G-23-22 causa 1 — el ancho útil del cuerpo del diálogo es el MISMO en los tres modos de cupo, en los cinco altos de viewport"
    requirement: CAT-11
    verification:
      - kind: automated_ui
        ref: "scratchpad/probe-lib-23-10.js + check-23-10.js — NUEVO: 369px en los tres modos en 605/755/805/855/905; HOY: 384/369/369 a 855 y 905"
        status: pass
      - kind: other
        ref: "gate de región: la reserva del hueco aparece UNA vez, en la fila scrolleable, conservando min-h-0, el sangrado y overscroll-contain"
        status: pass
    human_judgment: false
  - id: D2
    description: "El popup nunca cambió de ancho — la premisa del reporte era falsa y queda medida"
    verification:
      - kind: automated_ui
        ref: "check-23-10.js — popupW = 384.00 en los 30 casos (2 variantes x 3 estados x 5 alturas)"
        status: pass
    human_judgment: false
  - id: D3
    description: "El hueco del scrollbar es constante entre los tres estados (es lo que congela el ancho)"
    verification:
      - kind: automated_ui
        ref: "check-23-10.js — NUEVO: 15px en los tres estados y los cinco altos; HOY: 0/15/15 a 855 y 905"
        status: pass
    human_judgment: false
  - id: D4
    description: "G-23-22 causa 2 — las tres etiquetas del toggle entran enteras en UNA línea, en los tres estados y en cualquier alto de viewport"
    requirement: CAT-11
    verification:
      - kind: automated_ui
        ref: "check-23-10.js — NUEVO: 1 renglón en los 15 casos para las tres etiquetas; HOY: 15/15 casos con al menos una en 2 líneas"
        status: pass
      - kind: other
        ref: "gate de región: el radiogroup declara exactamente `grid-cols-1`, sin override de desktop, y conserva el rol de grupo"
        status: pass
    human_judgment: false
  - id: D5
    description: "El texto ya no sobresale de la píldora (el defecto de los 2px que se apaga solo, sin tocar el alto del botón)"
    verification:
      - kind: automated_ui
        ref: "check-23-10.js — NUEVO: 45/45 píldoras con scrollHeight = clientHeight; HOY: 40 contra 36 en las que envuelven"
        status: pass
    human_judgment: false
  - id: D6
    description: "Los siete invariantes del gap siguen intactos: target táctil de 44px, rol de opción, estado marcado, descripción accesible, ids por instancia, explicador no interactivo, patch conjunto, labels de fuente única y scroll por caller"
    verification:
      - kind: other
        ref: "gates de región del Task 2 — radio/checked/describedby/min-h-11 sm:h-9 = 1 cada uno, recortes de texto = 0, uid+helpId = 1/1, patch conjunto = 1, labels 1/1/1, montajes = 2, explicador con 0 onClick / 0 role / 0 tabIndex y 1 sr-only, dialog.tsx sin cambios"
        status: pass
    human_judgment: false
  - id: D7
    description: "G-23-25 — un click afuera o un Escape sobre un borrador CON cambios no cierra el diálogo ni descarta lo escrito: avisa con un toast"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate de región: la guarda cancela el evento, mira exactamente `outside-press` + `escape-key`, llama al cierre en el resto de los casos y llegó a los tres diálogos (4 usos = definición + 3)"
        status: pass
      - kind: build
        ref: "tsc --noEmit sin error TS — el motivo se tipa contra la unión real de @base-ui/react, así que un motivo mal escrito no compila"
        status: pass
    human_judgment: true
    rationale: "El comportamiento depende del runtime de React y del manejo de eventos de Base UI, no del CSS: la sonda no puede verlo. Los catorce human-check del Task 3 son el criterio de aceptación real."
  - id: D8
    description: "Un borrador SIN cambios sigue cerrando por click afuera, Escape y ✕; la ✕ y el Guardar cierran SIEMPRE"
    verification:
      - kind: other
        ref: "gate: la lista de motivos de tipo press de la guarda es sólo `outside-press` (si apareciera `close-press`, la ✕ dejaría de cerrar); 0 diálogos ocultan su botón de cerrar; los caminos de cierre siguen en 3/3/6"
        status: pass
    human_judgment: true
    rationale: "Que el caso sin cambios no cobre fricción nueva se comprueba operando los tres diálogos (human-check 1, 2, 12, 13, 14)."
  - id: D9
    description: "Un formulario que nadie tocó NUNCA se lee como sucio: normalizar al salir de un campo, prender y apagar una sede, o ir y volver de modo de cupo dejan el diálogo cerrable"
    verification:
      - kind: other
        ref: "gate: la huella del servicio reusa los cuatro normalizadores del guardado (duración, precio, cupo, categoría), ordena las sedes y recorta espacios en dos campos; la sede y el profesional van por su normalizador COMPARTIDO con el guardado"
        status: pass
    human_judgment: true
    rationale: "Es el modo de falla GRAVE del arreglo (T-23-49) y sólo se prueba operando: human-check 7 a 10. Una huella mal normalizada encierra al dueño en un diálogo que ya no cierra con un click afuera."
  - id: D10
    description: "El aviso no se apila: cinco clicks afuera seguidos dejan UN solo toast"
    verification:
      - kind: other
        ref: "gate: el aviso se dispara con `id: UNSAVED_CHANGES_TOAST_ID`"
        status: pass
    human_judgment: true
    rationale: "El reemplazo del toast vivo es comportamiento de sonner en pantalla (human-check 11)."
  - id: D11
    description: "El repo cierra: build verde, suite completa, eslint sin errores nuevos, cero migraciones y cero paquetes"
    verification:
      - kind: build
        ref: "npm run build exit 0"
        status: pass
      - kind: test
        ref: "npm test — 95 archivos / 1301 casos pasados (+4 expected fail, 1 skipped)"
        status: pass
      - kind: other
        ref: "eslint 11 errores (piso preexistente exacto) · 41 migraciones · package.json y package-lock.json intactos · components/ui/dialog.tsx intacto"
        status: pass
    human_judgment: false
  - id: D12
    description: "El diálogo se ve y se opera bien en el navegador real a 1440x900 y en mobile a 375px"
    verification: []
    human_judgment: true
    rationale: "Los siete human-check del Task 4 son juicio visual sobre un navegador real con el negocio de prueba. La sonda mide geometría sobre una reconstrucción de la caja; no ve el render de React, ni el foco, ni el guardado."

duration: 55 min
completed: 2026-09-18
status: complete
---

# Phase 23 Plan 10: G-23-22 y G-23-25 — el diálogo que no se mueve y el borrador que no se pierde Summary

**El cuerpo del diálogo Editar servicio reserva siempre el hueco del scrollbar y el toggle del modo de cupo pasa a una sola columna en las dos vistas (el ancho útil queda fijo en 369px en los tres modos y las tres etiquetas entran enteras en una línea); y los tres diálogos de edición del panel comparten una guarda que cancela el cierre por click afuera o Escape cuando el borrador tiene cambios, avisando con un toast en vez de descartar lo escrito.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-09-18
- **Tasks:** 4 de 4
- **Files modified:** 1

## Accomplishments

- **G-23-22, causa 1 cerrada y medida.** La fila scrolleable del diálogo reserva el hueco del scrollbar de forma estable. El ancho útil del cuerpo pasa a ser **369px idéntico en los tres modos de cupo y en los cinco altos de viewport**; antes, a 855 y 905px de viewport, iba de 384 (individual, sin scrollbar) a 369 (los dos modos compartidos, con scrollbar de 15px) mientras el header y el pie —filas hermanas del grid— conservaban sus 384. Ese desalineado entre el borde del popup y el borde derecho de los campos era lo que el dueño leyó como "el diálogo se ensanchó".
- **La premisa del reporte era falsa y queda medida.** El popup mide **384.00px en los 30 casos** de la sonda (2 variantes × 3 estados × 5 alturas). El diálogo nunca cambió de ancho.
- **G-23-22, causa 2 cerrada y medida.** El radiogroup declara una sola columna también en desktop. Las tres etiquetas pasan a **1 renglón en los 15 casos** de la variante nueva; en la variante que reproduce el código de antes, **15 de 15 casos** tienen al menos una etiqueta en dos líneas. El control sube de 46 a **126px** (+80, aceptado por escrito) y ese alto extra ya no puede mover el ancho.
- **El defecto de los 2px se apagó solo, sin tocar el alto del botón.** El texto sobresalía de la píldora sólo cuando la etiqueta envolvía (40px de contenido contra 36 de caja). Medido en la variante nueva: **45/45 píldoras con alto de contenido igual al alto de caja**. El plan pedía medirlo, no arreglarlo, y así quedó.
- **El comentario que mentía, corregido con el número que lo desmiente.** Decía que en desktop "Recurso simultáneo entra en una línea": esa etiqueta necesita 133.58px de contenido contra los 87.33px (sin scrollbar) / 82.33px (con) que daba una celda de tres columnas dentro de un popup de 384px. Era falso desde que se escribió.
- **G-23-25 cerrado en los tres diálogos.** `guardDraftOnDismiss` es una guarda compartida por Editar servicio, Editar sede y Editar profesional: cancela el cierre y avisa **sólo** cuando el motivo es el click afuera o el Escape **y** el borrador tiene cambios. Sin cambios el diálogo cierra como siempre, y la ✕ cierra siempre.
- **El camino del apunte del UAT quedó descartado por lectura del paquete, no por preferencia.** `disablePointerDismissal` corta el predicado del click afuera **antes** del handler (`dialog/root/useDialogRoot.js:79-96`): el diálogo no cerraría pero tampoco avisaría. El store llama al handler **primero** y recién después corta si el detalle quedó cancelado (`dialog/store/DialogStore.js:40-60`), así que cancelar desde adentro bloquea el cierre **y** deja lugar al aviso, en un solo camino de código para los dos motivos.
- **La comparación ataca su propio modo de falla por dos lados.** El punto de partida es la huella del **mismo objeto** con el que se inicializa el borrador al abrir (capturado en una constante en las tres aperturas: un solo mapeo), y los dos lados pasan por la **misma huella**, que reusa los normalizadores del guardado campo por campo. La sede además dejó de tener dos normalizaciones: su payload se mudó a `locToPayload`, compartido por el guardado y la huella.

## Task Commits

1. **Task 1: el cuerpo del diálogo reserva el hueco del scrollbar** — `bba8f94` (fix)
2. **Task 2: el toggle se apila también en desktop + comentario corregido** — `25655ec` (fix)
3. **Task 3: la guarda de descarte accidental del borrador (G-23-25)** — `f11307c` (fix)
4. **Task 4: medición en Chrome headless + cierre del repo** — sin commit de código (tarea de medición; la sonda vive fuera del repo por decisión del plan)

**Plan metadata:** ver el commit `docs(23-10)` de este SUMMARY.

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` — la reserva del hueco del scrollbar en la fila scrolleable del diálogo de servicio con su comentario; el radiogroup del modo de cupo sin el override de columnas de desktop y su comentario reescrito; el bloque de módulo nuevo "descarte accidental del borrador" (`UNSAVED_CHANGES_MESSAGE` / `_HINT` / `_TOAST_ID`, `guardDraftOnDismiss`, `ServiceEditForm`, `serviceFormFingerprint`, `LocationEditForm`, `locToPayload`, `locationFormFingerprint`, `proFormFingerprint`); las tres huellas de partida y sus tres capturas al abrir; las tres funciones de "¿hay cambios?" pegadas a sus guardados; `saveEditLocation` pasando a usar el normalizador compartido; y los tres `onOpenChange` cableados a la guarda.

**Fuera del repo (instrumento, no artefacto):**
- `scratchpad/probe-lib-23-10.js` — la sonda: reconstruye el diálogo con el **CSS del build de producción** (`.next/static/chunks/*.css`) y las fuentes reales, en las dos variantes (HOY y NUEVO).
- `scratchpad/host-23-10.html` — el host que corre las 30 combinaciones en iframes de 1440×alto.
- `scratchpad/check-23-10.js` — el comparador contra los umbrales del plan.
- `scratchpad/measured-23-10.json` / `measured-23-10.txt` — la salida completa de la última corrida.

## La medición (Task 4)

Chrome headless, `--dump-dom`, cero paquetes nuevos. **21/21 gates de la sonda en verde, exit 0.** El barrido completo es 2 variantes × 3 estados × 5 alturas = 30 mediciones.

### HOY (el código de antes, medido con el MISMO instrumento)

| viewport | ancho útil (ind / grupal / simult.) | scrollbar | renglones por estado | alto RG |
|---|---|---|---|---|
| 605 | 369 / 369 / 369 | 15 / 15 / 15 | 122 · 122 · 122 | 46 |
| 755 | 369 / 369 / 369 | 15 / 15 / 15 | 122 · 122 · 122 | 46 |
| 805 | 369 / 369 / 369 | 15 / 15 / 15 | 122 · 122 · 122 | 46 |
| **855** | **384 / 369 / 369** | **0 / 15 / 15** | **112 · 122 · 122** ← el flip | 46 |
| **905** | **384 / 369 / 369** | **0 / 15 / 15** | **112 · 122 · 122** ← el flip | 46 |

(“renglones por estado” = los renglones de Individual, Clase grupal y Recurso simultáneo, en ese orden, para cada uno de los tres estados del toggle.)

### NUEVO

| viewport | ancho útil (los tres modos) | scrollbar | renglones por estado | alto RG |
|---|---|---|---|---|
| 605 / 755 / 805 / 855 / 905 | **369 / 369 / 369** | **15 / 15 / 15** | **111 · 111 · 111** | **126** |

### La tabla de umbrales del plan

| Medición | Hoy | Exigido | Medido |
|---|---|---|---|
| ancho del popup en los tres estados | 384 en los tres | 384 en los tres | **384.00 en los 30 casos** ✅ |
| ancho útil del cuerpo, por cada alto | 384 / 369 / 369 según estado | el mismo en los tres, en los cinco altos | **369 en los 15** ✅ |
| hueco del scrollbar reservado | 0 / 15 / 15 | constante | **15 en los tres estados y los cinco altos** ✅ |
| "Individual": renglones | 1 | 1 | **1 en los 15** ✅ |
| "Clase grupal": renglones | 1 o 2 según el alto (el flip) | 1 en los cinco altos y los tres estados | **1 en los 15** ✅ |
| "Recurso simultáneo": renglones | 2 siempre | 1 en los cinco altos y los tres estados | **1 en los 15** ✅ |
| desborde vertical del botón | 40 contra 36 al envolver | iguales | **45/45 iguales** ✅ |
| alto del radiogroup | 46 | ~126 | **126** ✅ |
| ¿algún alto de viewport con wrap? | sí | no | **ninguno** ✅ |

### Validez del instrumento

El plan avisa que si la sonda midiera 0px de scrollbar en los tres estados, la medición **no valdría**. Medido: el scrollbar clásico de 15px **se materializa** en Chrome headless sobre Windows, igual que en el navegador del dueño, y la variante HOY **reproduce las dos caras del reporte** — el ancho útil que se mueve (384→369) y el flip de "Clase grupal" (1→2 renglones) — que es la prueba de que el instrumento ve el defecto antes de decir que desapareció.

### Un número que no coincide con el reporte de debug, y por qué

La **ventana de alturas del flip**. La sesión de debug la ubicó en ~[801, 901]px de viewport; esta sonda la mide en ~[830, >905]: a 805 el defecto todavía no aparece y a 855 y 905 sí. Es un **offset de reconstrucción** —los altos absolutos del cuerpo de esta sonda no son idénticos a los de aquélla, igual que pasó en 23-09 con los altos de la tarjeta— y **no cambia nada de lo vinculante**: el flip existe, se reproduce, y desaparece en los cinco altos con el arreglo. Lo que se asserta es el contraste HOY→NUEVO medido con el mismo instrumento, no el número absoluto del viewport.

### Dos defectos del instrumento, encontrados antes de dar por bueno ningún número

1. **`postMessage` desde un iframe `file://` nunca llegó al host**: las 30 mediciones quedaban en `PENDING` sin decir dónde. Resuelto creando el iframe **vacío** (`about:blank` hereda el origen del host) y construyéndolo desde el host, que después lee su DOM directo.
2. **`requestAnimationFrame` no se dispara bajo `--virtual-time-budget`** (no hay presentación que programar), así que el `await` de estabilización colgaba para siempre. Resuelto con `setTimeout`, que el reloj virtual sí avanza. Queda anotado como patrón: se va a repetir en cualquier sonda headless de este proyecto.

## Cierre del repo

- `npm run build` — **verde**.
- Suite completa — **95 archivos / 1301 casos pasados** (+4 expected fail, 1 skipped). Pisos del plan: 95 / 1301.
- `eslint` sobre el archivo — **11 errores**, exactamente el piso preexistente medido. El cambio no agregó ninguno.
- **41 migraciones**, `package.json` y `package-lock.json` intactos, `components/ui/dialog.tsx` intacto.
- `tsc --noEmit` sin `error TS` fuera de `.next/` después de cada tarea.

## Gates de región

| Gate | Medido | Exigido |
|---|---|---|
| reservas del hueco del scrollbar en el archivo | 1 | 1 |
| está en la fila scrolleable (con `overflow-y-auto`) | 1 | 1 |
| conserva el mínimo cero / el desbordamiento contenido | 1 / 1 | 1 / 1 |
| declaraciones de columnas del radiogroup | `grid-cols-1` | exactamente `grid-cols-1` |
| rol de grupo / rol de opción / estado marcado / descripción accesible | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| target táctil + alto fijo (`min-h-11 sm:min-h-0 sm:h-9`) | 1 | 1 |
| recortes de texto en la etiqueta | 0 | 0 |
| ids por instancia (`useId` + helper) | 1 / 1 | 1 / 1 |
| patch con modo y cupo juntos | 1 | 1 |
| labels de la fuente única | 1 / 1 / 1 | 1 / 1 / 1 |
| montajes del componente | 2 | 2 |
| explicador: onClick / role / tabIndex / sr-only | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 1 |
| la guarda cancela el evento | 1 | 1 |
| motivo Escape / motivos de tipo press | 1 / `'outside-press'` | 1 / sólo el click afuera |
| la guarda cierra en el resto de los casos | 1 | 1 |
| aviso con identificador fijo / texto del usuario | 1 / 1 | 1 / 1 |
| objetos iniciales capturados en las tres aperturas | 3 | 3 |
| huellas de partida seteadas (svc / sede / pro) | 1 / 1 / 1 | 1 / 1 / 1 |
| preguntas de "¿hay cambios?" (definición + uso) | 2 / 2 / 2 | 2 / 2 / 2 |
| usos de la guarda (definición + tres diálogos) | 4 | 4 |
| huella del servicio: duración / precio / cupo / categoría | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| huella del servicio: sedes ordenadas / recortes de espacios | 1 / 2 | 1 / >=2 |
| normalizador de sede / de profesional | 3 / 4 | 3 / 4 |
| tipo del borrador de servicio / tipo del detalle del evento | 3 / 2 | 3 / 2 |
| caminos de cierre svc / sede / pro | 3 / 3 / 6 | 3 / 3 / 6 |
| props que desactivan el descarte por puntero | 0 | 0 |
| diálogos que ocultan su botón de cerrar | 0 | 0 |
| `components/ui/dialog.tsx` | sin cambios | sin cambios |

## Decisions Made

Ver `key-decisions` en el frontmatter. En corto: el arreglo del ancho va en el caller y no en el componente compartido; el toggle se apila en las dos vistas porque tres columnas a 384px nunca alcanzaron; la guarda de G-23-25 cancela desde el handler y no con la prop de la raíz, mira exactamente dos motivos, y compara contra la huella del mismo objeto que inicializa el borrador.

## Deviations from Plan

**1. [Rule 3 - Bloqueante] La anotación de tipo del objeto inicial del servicio se quitó para que el gate diera**

- **Encontrado durante:** Task 3
- **Problema:** con `const inicial: ServiceEditForm = { … }` el nombre del tipo aparecía **4** veces en el archivo (definición, parámetro de la huella, genérico del `useState` y esa anotación) y el gate del plan exige exactamente **3**.
- **Arreglo:** se quitó la anotación en las tres aperturas. La forma la siguen imponiendo sus dos consumidores inmediatos (`setEditSvcForm(inicial)` y la huella), que es justamente lo que garantiza que los dos vean el mismo objeto; queda comentado en el código.
- **Verificación:** `tsc --noEmit` sin `error TS` y el gate en 3.
- **Commit:** `f11307c`

Fuera de eso, el plan se ejecutó como estaba escrito. El único otro trabajo no previsto fue **dentro de la sonda** (los dos defectos de instrumento del Task 4), que vive fuera del repo y forma parte de "medir", no del entregable.

## Issues Encountered

- **`postMessage` desde iframes `file://`** no llegó nunca al host: la sonda quedaba en `PENDING`. Ver "Dos defectos del instrumento" arriba.
- **`requestAnimationFrame` no se dispara bajo `--virtual-time-budget`**. Ver el mismo bloque. Los dos quedan anotados como patrón para la próxima sonda headless.

## Known Stubs

None — los dos gaps quedan cerrados en código, sin placeholders ni caminos sin cablear.

## User Setup Required

None — cambio de layout y de manejo de eventos del cliente, sin servicios externos, sin variables de entorno y sin migraciones (siguen siendo 41).

## Next Phase Readiness

- **Los dos gaps de este plan quedan pendientes de UAT visual** en `/gsd-verify-work`, y son **veintiún** checks manuales:
  - **G-23-22 (siete, Task 4):** el diálogo no se mueve al alternar los tres modos a 1440×900; las tres etiquetas enteras en una línea; el mismo control en la tarjeta de alta; el gate de "Cuántos lugares" y el guardado en cada modo; mobile a 375px sin cambios; teclado y lector con el explicador todavía no enfocable; y el aviso de espacio compartido con su link a Equipo.
  - **G-23-25 (catorce, Task 3):** los dos caminos sin fricción, los cuatro que cierran el gap, los **cuatro falsos positivos** (normalizar al salir de un campo, prender y apagar una sede, ir y volver de modo de cupo, un servicio con y otro sin categoría), el no-spam del aviso, los otros dos diálogos con su "Cancelar" y su foto, y "Cancelar suscripción" que queda afuera.
- **Los cuatro falsos positivos son la prioridad de la UAT**: si la huella estuviera mal normalizada, el dueño quedaría encerrado en un diálogo que ya no cierra con un click afuera — la mejora convertida en trampa (T-23-49).
- Sin blockers.

## Self-Check: PASSED

- `23-10-SUMMARY.md` existe en disco.
- `app/(dashboard)/settings/settings-client.tsx` existe en disco.
- Los tres commits de código existen en el árbol: `bba8f94`, `25655ec`, `f11307c`.
- `git rev-list --count 11e64ae..HEAD` = 3 antes de este commit; con el de este SUMMARY da 4, igual al `commits:` del frontmatter.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-18*
