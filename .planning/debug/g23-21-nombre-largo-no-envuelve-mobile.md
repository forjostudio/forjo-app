---
status: investigating
trigger: "G-23-21 — en MOBILE, un nombre de servicio de 40+ caracteres sin espacios (ej. `Premiumssssssssssssssssssssssssssssssssss`) no envuelve: se sale de la tarjeta de /servicios."
created: 2026-09-18T00:00:00Z
updated: 2026-09-18T00:00:00Z
mode: symptoms_prefilled=true, goal=find_root_cause_only
---

## Current Focus

status: CAUSA RAÍZ CONFIRMADA Y MEDIDA. Modo diagnose-only: NO se aplica arreglo.

reasoning_checkpoint:
  hypothesis: "El `<p>` del nombre (2758) desborda en mobile porque su `min-width:auto` (tamaño mínimo automático de flex item, CSS Flexbox §4.5) resuelve al min-content del texto, y `overflow-wrap:break-word` NO reduce el min-content de una palabra sin espacios. El mínimo automático sólo se anula cuando el `overflow` del item deja de ser `visible` — y eso pasa SÓLO en desktop, donde `sm:truncate` pone `overflow:hidden`."
  confirming_evidence:
    - "min-content del texto con `overflow-wrap:break-word` = 307.88px, IDÉNTICO a `normal` y a max-content. Con `anywhere` o `break-all` = 12px."
    - "Interior real de la tarjeta a 375px = 271px (medido sobre la cadena main p-4 → Card p-6 → tarjeta p-3). El `<p>` se planta en 307.88px → 36.88px afuera del padding-box."
    - "Agregar SÓLO `overflow:hidden` al `<p>` (sin tocar min-width) lo baja de 307.88 a 271px: prueba directa de que el mecanismo es el mínimo automático del flex item, no la regla de corte."
    - "La descripción (2819) se salvó del mismo defecto porque `line-clamp-1` implica `overflow:hidden` (medido: 271px)."
  falsification_test: "Si el mecanismo fuese otro, poner `overflow:hidden` sin min-width no cambiaría nada. Cambió (307.88 → 271)."
  candidate_causes:
    - "código: falta `min-w-0` en el `<p>` (categoría: código)"
    - "config/tooling: Tailwind no tiene utilidad de `overflow-wrap:anywhere` en uso en el repo (0 apariciones) — descartada como causa, es sólo una alternativa de arreglo"
    - "datos: nombre de servicio sin espacios de 41 chars — es el DISPARADOR, no la causa (la validación del alta no limita largo ni exige espacios)"
  and_gate: "no — una sola condición suficiente: el mínimo automático del flex item. El nombre largo es el disparador, no un segundo aporte causal."
  blind_spots: "Medido en Chrome headless 375px con Space Grotesk del build. No se probó en Safari iOS real; el mínimo automático es comportamiento de spec y no debería divergir, pero la UAT en dispositivo sigue siendo el único instrumento final."

next_action: (diagnose-only) entregar el reporte al planner. NO tocar el código.

## Symptoms

expected: "Nombre de 40+ caracteres … envolviendo en mobile" (contrato del Test 21 de la UAT de la fase 23).
actual: el nombre sin espacios no envuelve y se sale de la tarjeta en mobile (captura del usuario).
errors: (ninguno — defecto visual)
reproduction: /servicios en mobile (375px) con un servicio llamado `Premiumssssssssssssssssssssssssssssssssss` (41 chars, sin espacios).
started: el resto del Test 21 pasó (cupo compartido + sedes + cobertura). Defecto acotado al nombre sin espacios.

## Eliminated

- hypothesis: "El `min-w-0` del padre (2756) debería haber alcanzado"
  evidence: "El padre SÍ encoge (wrap.clientWidth = 271). El que no encoge es el `<p>`: wrap.scrollWidth = 308 > 271. El min-w-0 del padre resuelve un problema distinto (que el wrapper encoja dentro de la tarjeta), no éste."
  timestamp: 2026-09-18

- hypothesis: "`break-words` no alcanza porque no parte la palabra"
  evidence: "FALSO. `break-word` SÍ parte la palabra cuando el ancho está acotado (medido: min-w-0 + break-words → 271px en 2 líneas, cortes idénticos a `anywhere` en las 4 muestras de nombre). Lo que `break-word` no hace es REDUCIR EL MIN-CONTENT, que es otra cosa. La hipótesis del reporte acertó el mecanismo pero la consecuencia práctica es la inversa: `min-w-0` solo SÍ alcanza."
  timestamp: 2026-09-18

## Evidence

- timestamp: 2026-09-18
  checked: "Cadena real de contenedores a 375px (main p-4 → Card p-6 → tarjeta p-3)"
  found: "Interior de la tarjeta = 271px exactos — coincide con el número documentado en el comentario de G-02."
  implication: "La sonda es fiel; los números son comparables con los del contrato escrito en el archivo."

- timestamp: 2026-09-18
  checked: "min-content del texto `Premiumsss…` (41 chars, 14px/500, Space Grotesk del build) según la regla de corte"
  found: "overflow-wrap:normal → 307.88px · break-word → 307.88px · anywhere → 12px · word-break:break-all → 12px · max-content → 307.88px"
  implication: "`break-word` deja el min-content igual al max-content. Confirma la premisa de la hipótesis."

- timestamp: 2026-09-18
  checked: "Tarjeta completa a 375px, 5 variantes, con y sin la pill 'Sin cobertura'"
  found: "HOY: wrap.client=271 wrap.scroll=308, p=307.88, 1 línea, DESBORDE=36.88px, card.scroll-client=25. Con pill: wrap.scroll=418 (147px de desborde). Candidatos A (min-w-0), B (break-all), C (anywhere), D (anywhere+min-w-0): TODOS 271px, 2 líneas, desborde 0."
  implication: "Los cuatro candidatos resuelven el desborde. La elección se decide por otros criterios, no por eficacia."

- timestamp: 2026-09-18
  checked: "Mecanismo aislado: `<p>` con break-word en un flex de 271px, variando sólo el overflow/min-width"
  found: "overflow visible sin min-width → 307.88px / 1 línea / desborda. + min-width:0 → 271px / 2 líneas. + overflow:hidden SIN min-width → 271px / 2 líneas. + line-clamp-1 → 271px. + overflow:clip → 307.88px (sigue desbordando)."
  implication: "CAUSA RAÍZ PROBADA: el mínimo automático del flex item sólo se anula con overflow != visible. Desktop funciona por `sm:truncate` (overflow:hidden), no por mérito propio; la descripción se salvó por `line-clamp-1`."

- timestamp: 2026-09-18
  checked: "`min-w-0` SIN `break-words` (por si alguien 'limpia' la clase al aplicar el fix)"
  found: "p.width=271 pero scrollWidth=308 → el texto sigue saliéndose adentro del `<p>`. Con los dos juntos: 271/271, 2 líneas."
  implication: "`min-w-0` y `break-words` son NECESARIOS LOS DOS. Quitar `break-words` al agregar `min-w-0` reabre el defecto."

- timestamp: 2026-09-18
  checked: "Dónde corta cada regla con nombres REALES, ancho 160px (el que queda con la pill)"
  found: "'Corte de cabello con lavado y peinado' → break-word/anywhere: ['Corte de cabello con ','lavado y peinado'] · break-all: ['Corte de cabello con lava','do y peinado']. 'Masaje descontracturante' → break-all: ['Masaje descontracturant','e']. 'Depilación definitiva Premium' → break-all: ['Depilación definitiva Pre','mium']."
  implication: "`break-all` (candidato B) daña la tipografía de los nombres NORMALES, que son el 100% del uso real. Queda descartado."

- timestamp: 2026-09-18
  checked: "Regresión de desktop: 640px (el viewport más angosto con grilla) con un nombre de 82 chars que SÍ fuerza truncado"
  found: "Los 5 candidatos idénticos: colIzq=363.31, p.client=363, p.scroll=581, truncando=true, 1 línea, altoTarjeta=270, card.scroll-client=0."
  implication: "Ningún candidato rompe `sm:truncate` ni le roba ancho al nombre. (Nota: el nombre reportado de 41 chars mide 294px y NI SIQUIERA trunca a 640px.)"

- timestamp: 2026-09-18
  checked: "Regresión de mobile con nombres normales (4 combinaciones de pill × largo), HOY vs min-w-0"
  found: "Ancho del `<p>` y alto de la tarjeta IDÉNTICOS en las 4 (34.23/287, 238.17/287, 34.23/288, 179.56/307)."
  implication: "`min-w-0` es inerte salvo en el caso patológico. Cero riesgo de regresión visual."

- timestamp: 2026-09-18
  checked: "Precedente en el repo: `grep min-w-0` vs `grep break-all|wrap-anywhere|overflow-wrap`"
  found: "73 usos de `min-w-0` en app/ + components/, DOS de ellos en este mismo archivo sobre un `<p>` de nombre dentro de un flex (3305: `text-sm font-medium truncate min-w-0`; 3418: `flex-1 min-w-0 text-sm truncate`). CERO usos de break-all / wrap-anywhere / overflow-wrap en todo el repo."
  implication: "`min-w-0` es el patrón establecido de la casa y el autor del propio archivo ya lo aplica al mismo shape. La tarjeta de servicio es el outlier."

## Resolution

root_cause: "app/(dashboard)/settings/settings-client.tsx:2758 — el `<p>` del nombre no declara `min-w-0`. Es flex item del contenedor de 2756; en mobile `sm:truncate` NO aplica, así que su `overflow` queda en `visible` y el tamaño mínimo automático de flex item (CSS Flexbox §4.5) resuelve al min-content del texto. Con `overflow-wrap:break-word` el min-content de una palabra sin espacios es igual al max-content (307.88px medidos), o sea mayor que los 271px disponibles: el item no puede encoger y se sale 36.88px. Desktop no falla porque `sm:truncate` pone `overflow:hidden` y eso anula el mínimo automático; la descripción tampoco, porque `line-clamp-1` hace lo mismo."
fix: "(diagnose-only — NO aplicado) Recomendado: agregar `min-w-0` al `<p>` de 2758, conservando `break-words`."
verification: "(pendiente del plan de arreglo)"
files_changed: []
