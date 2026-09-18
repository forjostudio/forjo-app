---
status: diagnosed
trigger: "G-23-22 — El modal de edición, cuando elijo recurso simultáneo cambia el ancho y en el toggle clase grupal pasa a tener dos líneas."
created: 2026-09-18T00:00:00Z
updated: 2026-09-18T00:00:00Z
---

## Current Focus

hypothesis: NO hay cambio de ancho del diálogo. Hay (1) aparición condicional del scrollbar de la fila
  scrolleable que come 15px del ancho ÚTIL sólo en los modos no-individual, y (2) un radiogroup de 3
  columnas cuyo ancho de celda (111.33 / 106.33 px) nunca alcanzó para "Recurso simultáneo" (133.58 px).
test: sonda HTML con las clases y la fuente REALES, medida en Chrome headless
expecting: anchos computados del popup, del cuerpo y de las 3 celdas en los 3 estados
next_action: DIAGNOSE-ONLY — no se aplica arreglo. Reportar al padre.

reasoning_checkpoint:
  hypothesis: "El popup mide 384px constantes en los 3 estados. Al pasar a un modo no-individual aparece
    el bloque 'Cuántos lugares' (+~55px de alto), el contenido supera el alto disponible de la fila
    scrolleable (settings-client.tsx:3126) y se materializa un scrollbar clásico de 15px que reduce el
    ancho útil de 384→369. Eso baja cada celda del radiogroup de 111.33→106.33 y el ancho de contenido de
    87.33→82.33, cruzando por 1.00 px el umbral de 'Clase grupal' (83.33 px)."
  confirming_evidence:
    - "popup_offsetWidth = 384.00 en los tres estados (medido, no inferido)"
    - "body.offsetWidth - body.clientWidth = 0 en individual y 15 en los otros dos"
    - "radiogroup.clientWidth = 350 → 335; celda = 111.33 → 106.33"
    - "'Clase grupal' nowrap = 83.33 px (Space Grotesk 500/14px, archivo real de next/font)"
    - "líneas medidas por Range.getClientRects(): Clase grupal 1→2 al aparecer el scrollbar"
  falsification_test: "Si popup_offsetWidth cambiara entre estados, o si el scrollbar midiera 0 en los
    tres, la hipótesis caería. Medido: no pasa ninguna de las dos."
  fix_rationale: "scrollbar-gutter:stable congela el ancho útil en 369px en los 3 estados (medido).
    La 2ª causa es independiente del scroll y exige decisión de layout: 3 columnas a 384px nunca caben."
  blind_spots: "No se midió en el navegador real del usuario (zoom, escalado de Windows, tema de fuente
    distinto). Las 5 familias --font-sans del panel se midieron aparte y ninguna cambia el orden."
  candidate_causes:
    - "code: radiogroup grid-cols-3 con ancho de celda insuficiente (settings-client.tsx:463/487)"
    - "code: fila scrolleable sin scrollbar-gutter (settings-client.tsx:3126)"
    - "environment: scrollbar clásico de 15px de Windows/Chrome (en macOS overlay = 0px, el bug no se ve)"
    - "data: el contenido del diálogo creció en la Phase 23 (+188px) y corrió el umbral de scroll"
  and_gate: "SÍ. El síntoma reportado (el FLIP de 'Clase grupal') exige TRES condiciones simultáneas:
    scrollbar clásico (Windows) + alto de viewport en la ventana [~801, ~901] px + el contenido post-23.
    Quitando cualquiera de las tres, el flip desaparece. El wrap de 'Recurso simultáneo', en cambio, es
    de causa única y se ve siempre."

## Symptoms

expected: el ancho del diálogo y el de las 3 columnas del toggle son estables entre los 3 modos
actual: al elegir "Recurso simultáneo" el diálogo se ve más ancho, aparece scrollbar vertical, y la
  etiqueta que envuelve en 2 líneas cambia (A: "Recurso simultáneo"; B: "Clase grupal")
errors: ninguno (defecto visual)
reproduction: /servicios → Editar servicio → alternar el toggle "Cómo se ocupa el cupo", en Windows,
  con el viewport entre ~801 y ~901 px de alto (p. ej. laptop 1440×900)
started: mecanismo desde el commit 228fa13/39917896 (Phase 17, 2026-08-20); disparador movido por
  93e8da6 + 713dbd5 (Phase 23)

## Eliminated

- hypothesis: "El DialogContent tiene ancho derivado del contenido (w-fit / w-auto / max-content)"
  evidence: dialog.tsx:69 declara `w-full max-w-[calc(100%-2rem)] sm:max-w-sm`; medido popup_offsetWidth
    = 384.00 idéntico en los 3 estados y en todas las alturas de viewport probadas
  timestamp: T3

- hypothesis: "Las 3 columnas del grid son desiguales (la seleccionada empuja a las vecinas)"
  evidence: `sm:grid-cols-3` = repeat(3, minmax(0,1fr)); medido 111.33 / 111.33 / 111.34 en estado A y
    106.33 / 106.33 / 106.34 en estado B. Son iguales dentro del px. El desbalance no existe.
  timestamp: T4

- hypothesis: "La fuente del tema del negocio cambia qué etiqueta envuelve"
  evidence: medidas las 5 familias --font-sans del panel (Space Grotesk, Jakarta, Mulish, Chakra Petch,
    Manrope) a 14px/500. "Recurso simultáneo" (127.80–133.58) es en TODAS ~1.6× "Clase grupal"
    (80.17–83.44). No existe ancho donde "Clase grupal" envuelva y "Recurso simultáneo" no.
  timestamp: T5

## Evidence

- timestamp: T0
  checked: app/(dashboard)/servicios/page.tsx
  found: /servicios monta SettingsClient con view="servicios" — es el mismo settings-client.tsx
  implication: el código señalado es el correcto; sólo hay 2 instancias de CapacityModeFields (3064 alta,
    3167 diálogo)

- timestamp: T1
  checked: components/ui/dialog.tsx:69 + settings-client.tsx:3116
  found: "fixed ... grid w-full max-w-[calc(100%-2rem)] p-4 ... sm:max-w-sm" — el caller sólo agrega
    grid-rows, max-h y gap-0
  implication: ancho FIJO 384px a partir de 640px de viewport

- timestamp: T2
  checked: settings-client.tsx:3126 (fila scrolleable del medio)
  found: "-mx-4 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-1" — SIN scrollbar-gutter
  implication: el scrollbar se materializa y se desmaterializa según el contenido, robando 15px

- timestamp: T6
  checked: sonda dialog-probe.html en Chrome headless 1440×900 (viewport 1424×805), fuente real cargada
  found: |
    estado                popup  scrollbar  body.clientW  rg.clientW  celda    "Individual" "Clase grupal" "Recurso simultáneo"
    individual            384    0 px       384           350         111.33   1 línea      1 línea        2 líneas
    group_class           384    15 px      369           335         106.33   1 línea      2 líneas       2 líneas
    simultaneous_resource 384    15 px      369           335         106.33   1 línea      2 líneas       2 líneas
    Anchos intrínsecos (nowrap, Space Grotesk 500/14px): Individual 65.16 · Clase grupal 83.33 ·
    Recurso simultáneo 133.58. Ancho de contenido disponible por celda: 87.33 (sin scroll) / 82.33 (con).
  implication: el diálogo NO cambia de ancho. Lo que cambia es el ancho ÚTIL del cuerpo (−15px). El
    margen de "Clase grupal" es de 1.00 px: 83.33 vs 82.33 disponibles. Reproduce el reporte exacto.

- timestamp: T7
  checked: barrido de alturas de viewport (HOY vs PRE-Phase-23)
  found: |
    HOY   viewport 605–755 → scroll en los 3 estados  → "Clase grupal" SIEMPRE en 2 líneas (sin flip)
    HOY   viewport 805–855 → scroll sólo en no-indiv. → FLIP (el bug reportado)
    HOY   viewport 905+    → sin scroll en ninguno    → "Clase grupal" siempre 1 línea
    Alto del cuerpo HOY:    609 px (individual) / 735 px (cupo compartido)
    Alto del cuerpo PRE-23: 421 px (individual) / 531 px (cupo compartido)
  implication: la Phase 23 agregó +188 px al cuerpo (Categoría 93e8da6 + Descripción corta 713dbd5) y
    corrió la ventana del flip de ~[535,605] a ~[801,901] px de viewport — justo un laptop 1440×900

- timestamp: T8
  checked: desborde vertical del botón (sm:h-9 = 36px fijo, 2 líneas = 40px)
  found: button.scrollHeight = 40 vs clientHeight = 36, overflow computado = visible
  implication: cuando una etiqueta envuelve, el texto SOBRESALE 2px arriba y 2px abajo de la píldora.
    En el estado B la píldora que desborda es la seleccionada (bg-primary) — explicación más probable de
    por qué el usuario leyó "Recurso simultáneo entra en una línea" ahí (medido: entra en 2)

- timestamp: T9
  checked: sonda options-probe.html — ancho mínimo para 3 columnas en 1 línea
  found: celda necesaria 157.58 px → radiogroup 480.74 → popup ≥ 522.74 px (sin scrollbar) / 537.74 (con).
    Medido: md(448) sigue dando 2 líneas; xl(576) da 1/1/1.
  implication: el comentario de settings-client.tsx:462 ("tres columnas iguales en desktop, donde
    'Recurso simultáneo' entra en una línea") es FALSO desde que se escribió: faltan 138.74 px

- timestamp: T10
  checked: opciones de arreglo medidas a 384px (con y sin scrollbar)
  found: |
    variante                       sin scroll    con scroll   altoRG  desborda
    (actual)                       1/1/2         1/2/2        46      sí
    px-3→px-2                      1/1/2         1/1/2        46      sí
    text-sm→text-xs                1/1/2         1/1/2        46      no
    h-9→min-h-9 + py-1             1/1/2         1/2/2        58      no
    grid-cols-1 también en desktop 1/1/1         1/1/1        126     no
    sm:max-w-xl (576px)            —             1/1/1        46      no
  implication: scrollbar-gutter:stable congela el ancho (arregla causa 1) pero por sí solo deja
    "Clase grupal" en 2 líneas SIEMPRE (empeora la 2). La causa 2 exige decisión de layout.

## Resolution

root_cause: |
  DOS causas independientes, ninguna de ellas un cambio de ancho del diálogo.

  (1) El "cambio de ancho" es el scrollbar condicional de la fila scrolleable, NO el popup.
      settings-client.tsx:3126 declara `overflow-y-auto` sin `scrollbar-gutter`. Al elegir un modo de
      cupo compartido aparece el bloque "Cuántos lugares" (settings-client.tsx:590), el contenido pasa
      de 609 a 735 px de alto, supera el alto disponible y Chrome/Windows materializa un scrollbar
      clásico de 15 px. El ancho útil del cuerpo cae de 384 a 369 px. El header y el footer NO están
      dentro de ese contenedor (son filas hermanas del grid, settings-client.tsx:3116), así que
      conservan sus 384 px mientras los campos se angostan 15 px: el borde del popup deja de alinear
      con el borde derecho de los campos, y eso se lee como "el diálogo se ensanchó". Medido:
      popup_offsetWidth = 384.00 px idéntico en los tres estados.

  (2) El re-envoltorio NO es un desbalance de columnas: las tres son iguales (111.33 / 111.33 / 111.34
      sin scrollbar; 106.33 / 106.33 / 106.34 con). Es que el ancho de celda nunca alcanzó.
      settings-client.tsx:487 da al botón `px-3` (24 px) sobre una celda de 111.33/106.33 px → quedan
      87.33/82.33 px de contenido. "Recurso simultáneo" necesita 133.58 px: envuelve SIEMPRE, en los
      tres estados y en todas las alturas de viewport. "Clase grupal" necesita 83.33 px: entra por
      4.00 px sin scrollbar y NO entra por 1.00 px con scrollbar. Ese 1.00 px es todo el "flip".
      Además `sm:h-9` fija 36 px de alto: dos líneas miden 40 px y el texto desborda la píldora
      (scrollHeight 40 vs clientHeight 36, overflow visible).

fix: NO APLICADO — modo diagnose-only.
verification: n/a
files_changed: []
