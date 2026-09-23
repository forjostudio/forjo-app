---
status: testing
phase: 24-el-cat-logo-que-el-cliente-lee
source: [24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-VERIFICATION.md, 24-UI-SPEC.md]
started: 2026-09-23T00:00:00Z
updated: 2026-09-23T00:00:00Z
---

## Current Test

number: 1
name: Cero categorías — el control negativo
expected: |
  Abrí `/{slug}` de un negocio SIN ninguna categoría creada. La pantalla tiene que verse
  **exactamente como antes** de esta fase: ni un título de grupo, ni el literal "Otros", ni
  corrimiento vertical. A 375px, idéntica.
  Este es el primero a propósito: si el camino de cero categorías se movió, todo lo demás da igual.
awaiting: user response

## Tests

### 1. Cero categorías — el control negativo (SC-3)
expected: En `/{slug}` de un negocio sin categorías: cero títulos, cero "Otros", cero desplazamiento vertical respecto de hoy. A 375px el render es idéntico al de antes del plan.
result: [pending]

### 2. Con categorías — el agrupado y "Otros" (CAT-08, CAT-09, D-03)
expected: Creá 2 categorías desde el panel, asigná algunos servicios y dejá **uno sin asignar**. En la pública: los dos títulos con sus tarjetas y, último, el grupo "Otros" con el **mismo** tamaño, peso y tarjetas que una categoría real. El servicio suelto se puede reservar.
result: [pending]

### 3. Los dos ejes y los tres modos de orden ⚠ el más importante
expected: Cambiá "Orden de las categorías" entre Personalizado y Alfabético, y "Orden de los servicios" entre Personalizado, Alfabético y Por precio. La pantalla pública se reordena **igual que el panel** en cada combinación.
result: [pending]

### 4. Desktop — el nombre largo deja de partirse (CAT-10, backstop)
expected: En desktop (≥640px), un servicio con nombre largo **con espacios**: entra en una sola línea a ~432px útiles, ya no se parte en dos.
result: [pending]

### 5. El paso 3 quedó intacto
expected: Con un negocio de 2+ sedes, el selector de sede/consultorio del paso 3 sigue **en dos columnas**, sin cambios.
result: [pending]

### 6. Mobile byte-idéntico (D-07)
expected: A 375px, comparar el paso 1 con y sin categorías: igual salvo los títulos nuevos — mismo ancho de tarjeta, mismo "Ver más", mismos motivos.
result: [pending]

### 7. Grupo mudo (D-12)
expected: Una categoría con **todos** sus servicios deshabilitados: título normal, en su posición del orden, y cada tarjeta con su motivo a la vista.
result: [pending]

### 8. Los themes no rompen la jerarquía
expected: Con los themes `spa` y `cyber`: el título de grupo se sigue leyendo un nivel **por debajo** de "Elegí tu servicio" (la jerarquía es por tamaño, no por negrita) y no se rompe con la mayúscula automática de `cyber`.
result: [pending]

### 9. Un nombre de categoría con `<script>` adentro
expected: Se ve como **texto plano**. No ejecuta nada.
result: [pending]

### 10. Consola del navegador — pública
expected: Recorré el flujo completo: sin avisos de hidratación ni warnings de `key`.
result: [pending]

### 11. El preview de /web contra la pública, lado a lado (D-13, D-14)
expected: Con un negocio con categorías, abrí `/web` y `/{slug}` en paralelo: el preview muestra el catálogo agrupado **con el mismo ancho**, sin nada achicado, estirado ni escalado — 512px centrados dentro del contenedor ancho del panel.
result: [pending]

### 12. El preview respeta los modos de orden
expected: Cambiá el modo de orden de categorías y de servicios, recargá `/web`: el preview se reordena **igual que la pantalla pública**.
result: [pending]

### 13. El preview con un negocio SIN categorías
expected: Lista plana de siempre, sin títulos y sin "Otros".
result: [pending]

### 14. Consola del navegador — /web
expected: Sin avisos nuevos.
result: [pending]

## Summary

total: 14
passed: 0
issues: 0
pending: 14
skipped: 0
blocked: 0

## Asunciones declaradas (NO son tests, NO son gaps)

Las dos vienen del `24-UI-SPEC.md` y las **diferiste vos explícitamente el 2026-09-22**. Están acá
sólo para que nadie las confunda con un defecto encontrado en la UAT:

- **Cero SERVICIOS** (no cero categorías) deja el paso 1 en blanco bajo el `h2`. Preexistente;
  escribir copy de empty state es superficie que ninguna de las 15 decisiones autoriza.
- **Un nombre de SERVICIO de 40+ caracteres sin espacios** se sale de la tarjeta a 375px. Arreglarlo
  violaría **D-07** (mobile byte-idéntico), que es LOCKED. Causa y arreglo ya diagnosticados:
  `min-w-0` junto al `break-words`, el par que cerró G-23-21 en el panel.

## Gaps
