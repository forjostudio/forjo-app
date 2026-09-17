---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 05
subsystem: ui
tags: [booking-publico, landing, accesibilidad, react, tailwind, resizeobserver, gap-closure]
gap_closure: true
gap_ids: [G-23-6]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "descripción corta del servicio (tope 120, CAT-11) expuesta por public_services y pintada en la tarjeta"
provides:
  - "ServiceDescription: párrafo recortado a tres renglones + Ver más/Ver menos sólo si desborda medido"
  - "tarjeta del paso 1 del booking como contenedor con botón de selección estirado (sin controles anidados)"
  - "sección Servicios de la web de marca con el mismo componente"
affects: [23-07, phase-24-CAT-10]

actuals:
  tokens: 5100
  tasks: 2
  commits: 3
plan_head_before: 3deace0238f1b3fbfb121f3f8603bc26452c314c

tech-stack:
  added: []
  patterns:
    - "Tarjeta accesible: contenedor relative isolate + botón estirado con after:absolute after:-inset-px + control hermano con relative z-10"
    - "Toggle de texto recortado decidido por medición (scrollHeight > clientHeight + 1) en el callback del ResizeObserver y en document.fonts.ready, nunca en el cuerpo del efecto"
    - "Render de servidor testeado con renderToStaticMarkup en entorno node (sin DOM, sin paquetes nuevos)"

key-files:
  created:
    - components/booking/service-description.tsx
    - components/booking/service-description.test.tsx
  modified:
    - app/[slug]/booking-client.tsx
    - components/landing/services.tsx

key-decisions:
  - "G-23-6: la descripción va a ancho completo debajo de la fila nombre/precio con line-clamp-3 (131-163 caracteres medidos a 375px); el tope de 120 del panel no cambia"
  - "G-23-6: la tarjeta del paso 1 deja de ser un <button> y pasa a contenedor con botón estirado, para que Ver más no quede anidado ni seleccione el servicio"
  - "G-23-6: la web de marca usa el mismo ServiceDescription (una sola regla de recorte en las dos superficies públicas)"

patterns-established:
  - "Tarjeta con acción principal + control secundario: botón estirado por pseudo-elemento y control hermano elevado con z-10 dentro de isolate"

requirements-completed: [CAT-11]

coverage:
  - id: D1
    description: "Helpers puros descriptionOverflows (umbral +1) y showDescriptionToggle (desborda o abierta)"
    requirement: CAT-11
    verification:
      - kind: unit
        ref: "components/booking/service-description.test.tsx#descriptionOverflows / showDescriptionToggle"
        status: pass
    human_judgment: false
  - id: D2
    description: "Render de servidor de ServiceDescription sin botón, con id, line-clamp-3, break-words, className del call site y auto-escape de <script>"
    requirement: CAT-11
    verification:
      - kind: unit
        ref: "components/booking/service-description.test.tsx#ServiceDescription — render de servidor"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tarjeta del paso 1: ninguna descripción ni botón anidado dentro del botón de selección; import y uso del componente"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate por región awk sobre app/[slug]/booking-client.tsx (L=19, IN=0, IMP=1, USE=1)"
        status: pass
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit (filtrado .next/) + eslint sobre los 3 archivos rc=0"
        status: pass
    human_judgment: true
    rationale: "UAT visual pendiente (human-check del Task 1): 120 caracteres enteros a 375/360px, Ver más no selecciona, foco por teclado, tarjeta deshabilitada, tarjeta sin descripción idéntica, sin avisos de hidratación"
  - id: D4
    description: "Web de marca (sección Servicios) con el mismo ServiceDescription, sigue siendo RSC, sin line-clamp-2 en las dos superficies"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate grep import=1 usos=1 use-client=0 line-clamp-2=0; tsc limpio; eslint rc=0; migraciones=41; package.json intacto"
        status: pass
    human_judgment: true
    rationale: "UAT visual pendiente (human-check del Task 2): recorte y Ver más a 375px, número y precio centrados, 120 caracteres enteros en desktop"

duration: 4min
completed: 2026-09-17
status: complete
---

# Phase 23 Plan 05: Descripción expandible en la tarjeta pública Summary

**Componente compartido `ServiceDescription` (line-clamp-3 + break-words, "Ver más"/"Ver menos" sólo si el texto desborda medido con ResizeObserver y `document.fonts.ready`) usado en la tarjeta del paso 1 del booking —reestructurada como contenedor con botón de selección estirado— y en la sección Servicios de la web de marca (G-23-6).**

## Performance

- **Duración:** ~4 min
- **Inicio:** 2026-09-17T15:44:18Z
- **Fin:** 2026-09-17T15:48:03Z
- **Tareas:** 2
- **Archivos:** 4 (2 creados, 2 modificados)

## Accomplishments

- `ServiceDescription` con dos helpers puros testeados: el toggle se decide por medición (`scrollHeight > clientHeight + 1`), nunca contando caracteres, y arranca oculto en el servidor para que la hidratación coincida.
- La tarjeta del paso 1 del booking pasa de `<button>` a contenedor `relative isolate`; el botón de selección se estira con `after:absolute after:-inset-px` (el anillo de foco cae donde caía), la descripción y el motivo de deshabilitada son hermanos referenciados por `aria-describedby`, y el toggle queda encima con `relative z-10`. La descripción sale de la columna angosta y va a ancho completo.
- La sección Servicios de la web de marca reemplaza su `<small>` con `line-clamp-2` por el mismo componente y sigue siendo Server Component.

## Task Commits

1. **Task 1 (RED): tests en rojo del componente** - `52bedb5` (test)
2. **Task 1 (GREEN): componente + tarjeta del booking** - `12ec91b` (feat)
3. **Task 2: web de marca con el mismo componente** - `2aad5bf` (feat)

## Files Created/Modified

- `components/booking/service-description.tsx` - componente cliente con recorte, medición y toggle accesible (`aria-expanded`, `aria-controls`, sufijo `sr-only` con el nombre del servicio, área táctil de 44px con márgenes negativos).
- `components/booking/service-description.test.tsx` - 9 casos: helpers y render de servidor (sin botón, recorte, break-words, className, auto-escape).
- `app/[slug]/booking-client.tsx` - tarjeta del paso 1 como contenedor con botón estirado; import del componente. El cálculo de `scheduled`/`staffed`/`enabled` y el `onClick` quedaron intactos.
- `components/landing/services.tsx` - descripción con `ServiceDescription`; cabecera actualizada con la excepción del "Ver más".

## TDD Gate Compliance

- **RED** (`52bedb5`): 9 tests, 6 fallan por aserción y 3 pasan (los casos que esperan `false`, que el esqueleto devuelve por defecto). Para que el RED fallara por aserción y no por un import roto, el commit incluye un esqueleto de `service-description.tsx` sin comportamiento. Evidencia validada con `gsd-tools check tdd-red-evidence` → `RED_EVIDENCE_OK` (target: "pinta el párrafo con el id, recortado a tres renglones y partiendo palabras largas, sin botón"). Nota: vitest `tap-flat` no imprime el resumen `# tests/# pass/# fail`; se agregó al registro contando las mismas líneas `ok`/`not ok`.
- **GREEN** (`12ec91b`): 9/9 en verde.
- **REFACTOR:** no hizo falta.

## Decisions Made

Se siguieron las seis decisiones de discreción del plan sin apartarse: tres renglones a ancho completo, la descripción fuera de la columna angosta, tarjeta contenedor con botón estirado, mismo componente en la web de marca, nueva medición en `document.fonts.ready` y sufijo accesible del toggle.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- El verificador de evidencia RED espera TAP con el resumen de `node --test`; vitest no lo genera. Se resolvió construyendo el registro con `--reporter=tap-flat` y derivando el resumen de las mismas líneas (sin cambiar el resultado real de la corrida).

## Pending human checks (UAT visual)

No se pudo verificar en navegador; quedan para `/gsd-verify-work`:

**Task 1 (booking, `/negocio-prueba` en local, login `test@forjo.local` / `Forjo1234!`):**
1. A 375px y 360px, una descripción de 120 caracteres con espacios se lee entera a ancho completo, sin "…" y sin botón.
2. Una palabra de 120 letras sin espacios parte en renglones, se recorta a tres y muestra "Ver más"; abrir/cerrar cambia el alto de la tarjeta y ninguno de los toques avanza al paso 2.
3. Tocar nombre, precio o texto de la descripción selecciona y avanza al paso 2.
4. Desktop (≥640px, dos columnas): con 120 caracteres aparece "Ver más" y al expandir la tarjeta crece.
5. Teclado: Tab enfoca la tarjeta con anillo alrededor de toda la tarjeta; Enter selecciona; el Tab siguiente enfoca "Ver más" con su propio anillo.
6. Servicio deshabilitado con descripción larga: motivo visible, no se selecciona, "Ver más" abre.
7. Servicio sin descripción: tarjeta idéntica a la de antes.
8. Consola sin avisos de hidratación.

**Task 2 (web de marca o preview `/web`):** con 120 caracteres, a 375px recorte a tres renglones con "Ver más" si no entra, abre y cierra, número y precio siguen centrados; en desktop (48ch) se lee entero sin botón.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El plan 23-07 puede cambiar la ayuda del campo del panel para decir que el texto largo "se abre con Ver más": ya es cierto en las dos superficies públicas.
- La suite completa no se corrió acá (según el plan, la corre 23-07); sólo el test focalizado, `tsc` y `eslint` sobre los archivos tocados.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-17*

## Self-Check: PASSED
