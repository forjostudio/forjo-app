---
status: investigating
trigger: "G-23-23 — en DESKTOP, con cupo compartido, el rótulo del modo (`Recurso simultáneo`) y el control inline del cupo (`— 2 + lugares`) ocupan una línea cada uno, con un hueco vertical grande entre medio. El dueño los quiere en la misma línea y la tarjeta más compacta."
created: 2026-09-18T00:00:00Z
updated: 2026-09-18T00:00:00Z
mode: symptoms_prefilled=true, goal=find_root_cause_only
---

## Current Focus

status: CAUSA RAÍZ CONFIRMADA Y MEDIDA (son DOS causas que aportan en simultáneo). Modo diagnose-only: NO se aplica arreglo.

reasoning_checkpoint:
  hypothesis: "El rótulo y el control ocupan una fila cada uno por DOS condiciones simultáneas: (1) son dos HIJOS distintos de la grilla, los dos en `sm:col-start-1`, así que la ubicación automática les da una fila a cada uno; (2) el `py-6` del contenedor interno de CapacityInlineControl (806) no tiene gate de viewport, así que la fila del control mide 82px en desktop en vez de 34px. El 'hueco grande' que ve el dueño es la zona de exclusión de G-04 renderizándose en un viewport sin dedo."
  confirming_evidence:
    - "A 1280px con cupo compartido + sedes + cobertura: `grid-template-rows: 20px 36px 16px 82px 24px 32px`. Fila 3 = 16px = el rótulo solo. Fila 4 = 82px = el control solo."
    - "82px = 24 (py-6 arriba) + 34 (stepper: 32 de alto + 2 de borde) + 24 (py-6 abajo). El padding es el 58 % de la fila."
    - "Distancia vertical medida rótulo→stepper en desktop = 32px."
    - "Arreglar sólo (1) baja la tarjeta de 274 a 250px. Arreglar (1)+(2) la baja a 202px. Las dos condiciones aportan."
  falsification_test: "Si (2) no aportara, juntar los dos hijos en uno daría ya la altura compacta. Da 250px, no 202px → (2) aporta 48px."
  candidate_causes:
    - "código/estructura: dos hijos de grilla en la misma columna (categoría: código)"
    - "código/estilo: `py-6` sin gate `sm:` heredado de una invariante táctil (categoría: config de estilo por viewport)"
    - "entorno: se descartó — el defecto es determinista y reproducible en headless a cualquier ancho ≥640px"
  and_gate: "SÍ. Se necesitan las dos condiciones para el síntoma completo que reportó el dueño ('una línea cada uno' Y 'hueco vertical grande'). Un plan que arregle sólo una deja la mitad del síntoma en pie."
  blind_spots: "No se midió con el botón 'Guardar' montado (estado dirty). Alto desktop del botón = 28px < 34px del stepper, así que no debería cambiar la fila, pero no está medido."

next_action: (diagnose-only) entregar el reporte al planner. NO tocar el código.

## Symptoms

expected: (pedido del dueño) rótulo del modo y control del cupo en la MISMA línea en desktop; tarjeta más compacta.
actual: dos líneas, con hueco vertical grande entre medio.
errors: (ninguno — defecto de layout)
reproduction: /servicios en desktop (≥640px) con un servicio en cupo compartido (`capacity_mode !== 'individual'`).
started: tras G-23-20 (duración y precio se mudaron a la columna derecha en desktop, dejando el rótulo del modo solo en la línea de datos).

## Eliminated

- hypothesis: "Se puede juntar los dos SIN tocar el DOM, dándoles la misma fila explícita y separándolos con justify-self"
  evidence: "Los dos son `sm:col-start-1`. Misma fila + misma columna = se superponen. `justify-self:end` en uno lo manda contra el borde de la columna 1 (pegado al precio), con un hueco horizontal variable según el largo del rótulo. Además el número de fila tendría que viajar como una SEGUNDA variable CSS calculada. Geométricamente inviable; descartado sin medir."
  timestamp: 2026-09-18

- hypothesis: "Mover el rótulo adentro del envoltorio del control (un solo nodo, sin duplicar)"
  evidence: "Rompe D-07 en mobile: el rótulo es el TERCER dato del renglón de mobile (junto a duración y precio) y dejaría de estarlo. Y pondría texto inerte pegado horizontalmente a los botones del stepper en mobile, que es la adyacencia que G-04 prohíbe. Descartado por contrato, no por medición."
  timestamp: 2026-09-18

- hypothesis: "Duplicar el rótulo (uno en la línea de datos para mobile, otro junto al control para desktop)"
  evidence: "El comentario de estructura de la tarjeta (2721) dice explícitamente 'una sola pasada, sin markup duplicado'. Y NO ahorra nada: igual obliga a cambiar la fórmula de `leftRows`, porque la línea de datos pasaría a ser `sm:hidden` siempre. Peor en todo."
  timestamp: 2026-09-18

## Evidence

- timestamp: 2026-09-18
  checked: "Grilla de la tarjeta a 1280px, cupo compartido + sedes + cobertura (la configuración de la captura)"
  found: "grid-template-rows = [20px 36px 16px 82px 24px 32px]. Alto de tarjeta = 274px. Fila 3 (16px) = rótulo del modo solo. Fila 4 (82px) = bloque del control solo. Separación vertical rótulo→stepper = 32px. leftRows=6, actionsRow=6, fila real de las acciones = 6."
  implication: "Confirma la estructura: dos hijos, dos filas. Y el 82px identifica al `py-6` como el otro aporte."

- timestamp: 2026-09-18
  checked: "Descomposición del 82px de la fila del control"
  found: "24 (py-6 arriba) + 34 (stepper: h-8=32 + 2px de borde) + 24 (py-6 abajo) = 82."
  implication: "48 de los 82px son la zona de exclusión táctil de G-04, que en desktop no compra nada."

- timestamp: 2026-09-18
  checked: "Variante 'envoltorio compartido': un div padre con los dos, `flex-col gap-2` en mobile y `sm:flex-row sm:items-center sm:gap-2` en desktop"
  found: "SIN tocar el py-6: filas=[20 36 82 24 32], alto 250px, misma línea = true. CON `sm:py-0` en el control: filas=[20 36 34 24 32], alto 202px, misma línea = true."
  implication: "El envoltorio resuelve la línea compartida; el gate del py-6 resuelve la compactación. 274 → 202px = −72px (−26 %)."

- timestamp: 2026-09-18
  checked: "Invariante de G-04 en MOBILE 375px, HOY vs con el envoltorio (cupo compartido + sedes + cobertura)"
  found: "líneaDatos→botón(−) = 33px en los DOS. botón→'Se ofrece en:' = 33px en los DOS. Alto de tarjeta = 343px en los DOS. (33 = 8 del gap + 24 del py-6 + 1 del borde del stepper.)"
  implication: "El envoltorio con `flex-col gap-2` reproduce EXACTAMENTE el ritmo de 8px de la tarjeta. Mobile no cambia ni un píxel: G-04 y G-02 intactos."

- timestamp: 2026-09-18
  checked: "`leftRows`/`actionsRow` en las 5 configuraciones, con la fórmula ACTUALIZADA (compartido suma 1 en vez de 2)"
  found: "individual: 2→fila 3 · compartido: 3→3 · individual+sedes+cobertura: 4→4 · compartido+sedes: 4→4 · compartido+sedes+cobertura: 5→5. En las 5, las acciones caen en la ÚLTIMA fila y NINGÚN hijo de la izquierda queda en una fila posterior. Altos: 126/128/156/168/198."
  implication: "La fórmula con `+1` es correcta en las 5. WR-03 no se reabre."

- timestamp: 2026-09-18
  checked: "Modo de falla A: envoltorio aplicado pero fórmula `leftRows` SIN actualizar (sigue sumando 2)"
  found: "No queda contenido debajo de las acciones, pero las acciones se van a una fila fantasma propia: 'compartido sin sedes' pasa de 128 a 168px y 'compartido+sedes+cobertura' de 198 a 222px, con los botones descolgados abajo a la derecha."
  implication: "Falla cosmética, no WR-03. Igual hay que corregir la fórmula o se pierde parte de la compactación pedida."

- timestamp: 2026-09-18
  checked: "Modo de falla B: envoltorio SIN el gate `sm:hidden` cuando capMode === 'individual'"
  found: "filas=[20px 34px 0px 32px 16px], fila de acciones = 4, y `cobertura` cae en la fila 5 → POSTERIOR a las acciones. WR-03 REABIERTO."
  implication: "Éste sí es el modo de falla grave. El envoltorio vacío reclama una fila de 0px + 8px de gap y desfasa todo hacia abajo mientras `actionsRow` se queda donde estaba. El gate `capMode === 'individual' && 'sm:hidden'` tiene que moverse de la línea de datos AL ENVOLTORIO."

## Resolution

root_cause: "DOS causas que aportan en simultáneo (el AND-gate dio SÍ). (1) app/(dashboard)/settings/settings-client.tsx:2859 y :2881 — el rótulo del modo y el envoltorio del control son dos HIJOS distintos de la grilla de la tarjeta, ambos en `sm:col-start-1`; la ubicación automática de la grilla les asigna una fila a cada uno (medido: filas 3 y 4 de [20 36 16 82 24 32]). (2) app/(dashboard)/settings/settings-client.tsx:806 — el contenedor interno de CapacityInlineControl lleva `py-6` sin gate de viewport, así que los 48px de zona de exclusión táctil de G-04 se renderizan también en desktop: la fila del control mide 82px en vez de 34px. El 'hueco vertical grande' del reporte ES esa zona de exclusión."
fix: "(diagnose-only — NO aplicado) Recomendado: envolver la línea de datos y el envoltorio del control en un único hijo de grilla `flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:col-start-1`, mover a ese envoltorio el gate `capMode === 'individual' && 'sm:hidden'`, cambiar `py-6` por `py-6 sm:py-0` en 806, y actualizar `leftRows` (2714-2717) para que cupo compartido sume 1 en vez de 2."
verification: "(pendiente del plan de arreglo)"
files_changed: []
