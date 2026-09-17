---
status: diagnosed
trigger: "G-23-6 (descripcion-120-no-entra-tarjeta-publica): una descripción corta de 120 caracteres no entra completa en la tarjeta pública del booking a 375px"
created: 2026-09-17T00:00:00Z
updated: 2026-09-17T00:25:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMADA — el tope de 120 nunca se midió y la columna de descripción de la tarjeta pública (comparte fila con precio/duración, text-xs, line-clamp-2) admite a 375px solo 59-84 caracteres en 2 líneas
bug_class: Bohrbug (determinístico: layout + tipografía)
next_action: devolver ROOT CAUSE FOUND al orquestador (modo find_root_cause_only); la elección del fix (bajar el tope vs cambiar el layout/clamp) es decisión de producto del planner/usuario
reasoning_checkpoint:
  hypothesis: "La descripción de 120 caracteres se corta porque el tope 120 es un supuesto sin medir y la tarjeta le da a la descripción solo ~181-229px a 12px con line-clamp-2 (comparte fila con precio/duración), donde entran 59-84 caracteres"
  confirming_evidence:
    - "Medición real en Chrome a 375px: 120 caracteres = 3-5 líneas en 5 fuentes × 3 precios × 5 textos; truncado en el 100% de los casos"
    - "Con '$0 / 30 min' (la tarjeta de la captura) y Space Grotesk, entran 68-74 caracteres en 2 líneas — reproduce el síntoma exacto"
    - "REQUIREMENTS/CONTEXT/UI-SPEC afirman el 120 sin medición; 23-02-PLAN lo marca unresolved"
  falsification_test: "Si algún texto realista de 120 caracteres entrara en 2 líneas a 375px en el layout actual con alguna fuente/precio, la hipótesis sería falsa — no ocurrió en ninguna combinación (máximo 84)"
  fix_rationale: "Hay que igualar capacidad y tope: o bajar el tope al número medido, o cambiar el layout/clamp para que 120 entre (ancho completo + 3 líneas medido: 131-163)"
  blind_spots: "No se midió la segunda superficie pública (components/landing/services.tsx, line-clamp-2 con max-w-[48ch] a ~13px en grid de 3 columnas) porque ningún negocio local tiene landing; no se midió en Safari/iOS real (WebKit puede diferir unos px en métricas); no se midieron textos con muchas mayúsculas o números"
  candidate_causes:
    - "config/spec: número 120 no calibrado (REQUIREMENTS CAT-11)"
    - "code: layout de la tarjeta — descripción en columna estrecha compartida con precio/duración + text-xs + line-clamp-2"
    - "environment: tipografía del tema y ancho del dispositivo (360/375/390) — mueven el número ±15 caracteres pero nunca llegan a 120; no causal por sí solo"
    - "code (secundario): <p> sin break-words → palabra sin espacios recortada en 1 línea"
  and_gate: "sí — el fallo exige tope(120) > capacidad(layout). Cualquiera de las dos condiciones que se corrija (tope medido o layout con más capacidad) elimina el síntoma"

## Symptoms

expected: Una descripción corta de hasta 120 caracteres (tope duro del formulario del panel, plan 23-02 / CAT-11) se lee completa en la tarjeta pública de /[slug] a 375px — el tope se eligió para coincidir con lo que entra en el clamp de dos líneas.
actual: Primero, con una palabra larga sin espacios, se vio cortada en una línea. Re-probado con texto realista con espacios ("asdasdasasd asdas asd asd asd as asdas asd assssd asd asdddddd as…"): se ve en dos líneas pero cortada con "…". Captura: tarjeta con nombre "SAFSF", precio "$0" y "30 min" a la derecha en la misma fila que la descripción, descripción recortada a 2 líneas con "…".
errors: ninguno
reproduction: Test 6 de la UAT (.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UAT.md)
started: descubierto en la UAT de la phase 23 (2026-09-17); 23-02-PLAN.md ya flagueaba el 120 como supuesto sin medir (CAT-11)

## Eliminated

## Evidence

- timestamp: 2026-09-17T00:00:00Z
  checked: base de conocimiento (.planning/debug/knowledge-base.md) y sesiones resueltas
  found: no existe knowledge-base.md; la única sesión resuelta (gcal-orphan-on-delete) no tiene relación
  implication: sin patrón conocido; investigación abierta

- timestamp: 2026-09-17T00:05:00Z
  checked: app/[slug]/booking-client.tsx:550-620 (tarjeta del paso 1)
  found: contenedor `max-w-lg mx-auto px-6` (24px por lado) → grid `grid-cols-1` → `<button>` con `border p-4` → `flex items-center justify-between gap-3` → izq `min-w-0` (nombre + `<p class="mt-1 text-xs text-muted-foreground line-clamp-2">`) · der `shrink-0 text-right` (precio `text-lg font-bold` en fuente heading + duración `text-xs` con ícono w-3 + gap-1). A 375px el ancho útil del botón es 375−48−2−32 = 293px, y a eso se le resta gap 12px y el ancho de la columna de precio/duración (variable: "$0" vs "$5.000")
  implication: la descripción no tiene el ancho de la tarjeta sino ~200-230px a 12px; a priori entran ~35-38 caracteres por línea, o sea ~70-76 en dos líneas, muy por debajo de 120

- timestamp: 2026-09-17T00:06:00Z
  checked: origen del número 120 (REQUIREMENTS.md CAT-11, 23-CONTEXT, 23-UI-SPEC:467-469, 23-02-PLAN:433)
  found: el 120 aparece por primera vez en REQUIREMENTS.md como afirmación ("hace que lo que el dueño escribe coincida con lo que el line-clamp deja ver a 375px") sin medición; CONTEXT/UI-SPEC lo heredan; 23-02-PLAN lo marca `unresolved`: "El número viene calibrado del milestone, no re-medido en esta fase"
  implication: nadie midió el 120 contra el layout real; el contrato descansa sobre un supuesto

- timestamp: 2026-09-17T00:07:00Z
  checked: tipografía efectiva (app/layout.tsx, globals.css:74, themes.css, palette-script) y DB local (docker supabase_db_forjo-app)
  found: `html { font-sans }` → Space Grotesk por default (theme forjo, font auto); themes/fonts alternativos cambian a Jakarta/Mulish/Chakra/Manrope. text-xs = 0.75rem (12px) con line-height 16px. El negocio local de UAT es negocio-prueba (theme forjo, font auto); el servicio "SAFSF" ya no existe (se vació/renombró tras la prueba)
  implication: la medición de referencia es Space Grotesk 12px; otros temas pueden correr el número unos caracteres

- timestamp: 2026-09-17T00:20:00Z
  checked: medición real en navegador (Chrome headless vía CDP, script en scratchpad `measure.mjs`/`measure-alt.mjs`, dev server local http://localhost:3000/negocio-prueba, viewport 375/360/390 mobile). Solo se cambió textContent en el DOM del headless; cero cambios en DB o repo. Textos en español realistas (peluquería, facial, consulta, masaje) + texto tipo UAT ("asdasdasasd asdas asd…"); precios "$0 / 30 min", "$5.000 / 30 min", "$150.000 / 120 min"; 5 tipografías (Space Grotesk default, Jakarta, Mulish, Chakra Petch, Manrope) con warm-up de carga de fuentes
  found: |
    A 375px: tarjeta 327px (border-box), ancho útil 293px. Columna de precio/duración 52-100px según precio y fuente → la descripción queda en 181-229px (Space Grotesk: 201-226px). Font 12px / line-height 16px, clamp 2 confirmado en computed style.
    Máximo de caracteres que entran en 2 líneas SIN truncar (layout actual, 375px): 59-84 en todas las fuentes/precios; Space Grotesk 60-74.
    Una descripción de 120 caracteres ocupa 3-5 líneas (típicamente 4) → truncada con "…" en el 100% de las combinaciones medidas (flag scrollHeight>clientHeight coincide con lines>2 en todos los casos).
    A 390px (iPhone 14/15) tampoco entra: 2 líneas = 65-89. A 360px (Android común): 2 líneas = 54-74.
    Alternativas medidas: layout actual con 3 líneas → 84-123 a 375 (120 no entra siempre). Descripción a ancho completo (293px, sin compartir fila con el precio) con 2 líneas → 89-107 (120 NO entra). Ancho completo con 3 líneas → 133-163 a 375 y 131-150 a 360 (120 entra siempre).
  implication: el tope de 120 es ~1,6-2x lo que realmente entra en el clamp de 2 líneas; el bug es determinístico y reproduce el síntoma exacto de la UAT ($0 / 30 min, 2 líneas con "…")

- timestamp: 2026-09-17T00:22:00Z
  checked: primer intento de la UAT (palabra sin espacios) — misma medición con 'a'×120
  found: `overflow-wrap: normal`, `word-break: normal` en el <p>; la palabra queda en 1 línea, scrollWidth 828px vs clientWidth 226px, recortada horizontalmente por el `overflow:hidden` del line-clamp, sin "…"
  implication: explica el "cortado en una línea" del primer intento; es un efecto secundario (falta `break-words`), no la causa principal — con texto real el problema persiste igual

## Resolution

root_cause: |
  Desajuste entre el contrato y el layout, con dos condiciones que tienen que darse juntas:
  (1) el número 120 de CAT-11 nunca se midió: nació como afirmación en REQUIREMENTS.md y se heredó en CONTEXT/UI-SPEC/23-02-PLAN (marcado `unresolved`);
  (2) la tarjeta pública (`app/[slug]/booking-client.tsx:607-619`) pone la descripción en la columna izquierda de una fila `flex justify-between gap-3` que comparte con la columna `shrink-0` de precio (`text-lg` heading) + duración, a `text-xs` con `line-clamp-2`. A 375px eso deja 181-229px de ancho, donde en 2 líneas entran 59-84 caracteres (Space Grotesk: 60-74). 120 caracteres necesitan 3-5 líneas, así que el clamp siempre los corta.
  Secundario: el <p> no tiene `break-words`, por eso una palabra larga sin espacios se recorta en 1 línea sin "…".
fix: (modo diagnóstico — no se aplica)
verification: medición en navegador real a 375/360/390px, 5 tipografías, 3 anchos de precio; 120 caracteres truncados en todas las combinaciones
files_changed: []
