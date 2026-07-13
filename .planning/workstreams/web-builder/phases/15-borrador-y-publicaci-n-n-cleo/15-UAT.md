---
status: testing
phase: 15-borrador-y-publicaci-n-n-cleo
source: [15-VERIFICATION.md]
started: 2026-07-13T00:00:00Z
updated: 2026-07-13T00:00:00Z
---

## Current Test

number: 1
name: PUB-03/SC1 — Guardar NO publica
expected: |
  Editar un campo del editor y tocar "Guardar". El indicador pasa a `● Guardado — sin publicar`
  y `/{slug}` en otra pestaña sigue mostrando EXACTAMENTE lo de antes (sin refrescar caché ni
  nada especial). La web pública no cambia un solo pixel.
awaiting: user response

## Tests

### 1. PUB-03/SC1 — Guardar NO publica
expected: Editar un campo, tocar "Guardar". Indicador → `● Guardado — sin publicar`. `/{slug}` en otra pestaña sigue idéntica. La web pública no cambia un solo pixel.
result: [pending]

### 2. PUB-04/SC2 — Publicar SÍ cambia la web pública
expected: Tocar "Publicar". Aparece el toast ("Tu web está al aire" la primera vez, "Cambios publicados" después) y `/{slug}` YA muestra el cambio en el siguiente request, sin recargar el editor. El indicador queda en `✓ Publicado` con Descartar/Guardar/Publicar deshabilitados.
result: [pending]

### 3. PUB-07/SC5 — Dialog de go-live, exactamente una vez
expected: En un negocio que nunca publicó, la PRIMERA publicación abre el dialog "Publicar tu web". La segunda publicación NO abre ningún dialog. Derivado de `landing_config IS NULL` — sin checkbox ni preferencia persistida.
result: [pending]

### 4. PUB-06/SC4 — Descartar revierte a lo que está al aire
expected: Editar, guardar, tocar "Descartar", confirmar en el dialog. El editor vuelve a mostrar EXACTAMENTE lo que está al aire (o la plantilla base + aviso, si el negocio nunca publicó). Sin dead-end de UI (el botón Guardar no queda trabado).
result: [pending]

### 5. PUB-08/SC5 — Regresión: negocio YA publicado (el test más sensible)
expected: Un negocio con landing ya publicada (datos reales, tras el backfill de la migración 050) abre el editor y arranca en `✓ Publicado` desde el primer render, SIN haber tocado nada. Si arranca en `● Guardado — sin publicar` sin editar nada, el compare canónico está roto (Pitfall 7 del RESEARCH).
result: [pending]

### 6. Mobile 375px — layout de la barra
expected: La barra colapsa a 2 filas, los 3 botones y el link "Ver mi web" llegan a 44px de alto, y el texto del estado no se trunca en ningún ancho.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
