---
status: testing
phase: 24-el-cat-logo-que-el-cliente-lee
source: [24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-VERIFICATION.md, 24-UI-SPEC.md]
started: 2026-09-23T00:00:00Z
updated: 2026-09-28T00:00:00Z
---

## Current Test

number: 17
name: La barra NO aparece con 0 ni con 1 categoria
expected: |
  Con 0 categorias: ni barra ni titulos, la pantalla de hoy. Con 1 categoria: tampoco hay barra,
  aunque se vean el titulo de esa categoria y "Otros". El umbral es 2 o mas categorias CREADAS.
awaiting: user response

## Tests

### 1. Cero categorías — el control negativo (SC-3)
expected: En `/{slug}` de un negocio sin categorías: cero títulos, cero "Otros", cero desplazamiento vertical respecto de hoy. A 375px el render es idéntico al de antes del plan.
result: pass
reported: "En 375 las tarjetas con titulo largo sin espacios no se corta. Despues pass."
note: "El criterio del test —cero categorías = la pantalla de hoy— pasó: sin títulos, sin 'Otros', sin corrimiento. Cierra SC-3 con verificación en navegador real, que es lo que el ROADMAP exigía textualmente."
observed_preexisting: "Con captura: el nombre `SupercalifragilisticoEspialidoso123456` se ENCIMA con el precio a 375px. NO es un defecto de esta fase ni una regresión: es la asunción diferida #2 del 24-UI-SPEC.md, diagnosticada antes de ejecutar y diferida por decisión del usuario el 2026-09-22 porque el arreglo violaba D-07. Medido al verla en vivo: el `min-w-0` está en el div padre (`booking-client.tsx:677`) y el `<p>` del nombre (`:678`) NO lleva `break-words` — exactamente el shape de G-23-21, que en el panel se cerró poniendo el par `min-w-0 break-words` en el `<p>` mismo (`settings-client.tsx:2909`)."

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

<!-- ── Añadidos durante la UAT: el fix del nombre + la barra de chips (D-16 / G-24-6) ── -->

### 15. El nombre largo sin espacios ya no se encima con el precio (fix del 2026-09-28)
expected: A 375px, el servicio con nombre de 40+ caracteres **sin espacios** envuelve dentro de la tarjeta. No se encima con el precio ni se sale por el costado. En desktop sigue entrando en una línea (CAT-10, test 4).
result: [pending]
note: "Arreglo nacido de la observación del dueño en el Test 1. `min-w-0 break-words` en el `<p>` del nombre — el par que ya cerró G-23-21 en el panel. Commit e7b5ef1."

### 16. La barra de chips aparece y filtra (D-16, G-24-6)
expected: Con **2 o más categorías** creadas, arriba del catálogo hay una fila de chips: **`Todo` primero y ya seleccionado**, después un chip por categoría en tu orden, y `Otros` al final si hay sueltos. Tocar un chip deja **sólo** los servicios de ese grupo. Tocar `Todo` vuelve al catálogo completo. **No salta el scroll** al filtrar.
result: pass
reported: "pass"
note: "Confirma D-16 en la app real: `Todo` seleccionado por defecto (catalogo completo al entrar, CAT-09 intacto y cero clicks extra para reservar), chips en el orden del dueno, filtrado al toque y sin salto de scroll. Es la decision que el dueno tomo DURANTE la UAT, viendo su catalogo cargado."

### 17. Cuándo NO aparece la barra (umbral revisado el 2026-09-28)
expected: |
  La barra pide **≥2 grupos Y ≥6 servicios**, las dos a la vez. Comprobá que NO aparece en:
  (a) **0 categorías** — un solo grupo, sin barra ni títulos: la pantalla de hoy;
  (b) **2 categorías creadas pero ninguna asignada** — sigue siendo un solo grupo;
  (c) **2 grupos con pocos servicios** (p. ej. 2 + 2) — el catálogo ya entra en una pantalla.
  Y que SÍ aparece en el caso que encontraste: **1 categoría con muchos servicios + sueltos** — son
  dos grupos y una página larga, así que ahora sí hay barra (`Todo` / la categoría / `Otros`).
result: [pending]
note: "El test original decía 'no aparece con 0 ni con 1 categoría'. El propio dueño objetó el umbral durante este test y tenía razón: contaba categorías cuando el problema es la longitud de la página. Regla vigente: >=2 grupos Y >=6 servicios.

### 18. La barra en mobile y con teclado
expected: A **375px** los chips no se apilan: la fila scrollea de costado, sin barra de scroll a la vista, y cada chip se toca cómodo (44px de alto real). Con **teclado**: Tab llega a los chips, el foco se ve, y Enter/Espacio filtra.
result: [pending]

## Summary

total: 18
passed: 2
issues: 0
pending: 16
skipped: 0
blocked: 0

## Asunciones declaradas (NO son tests, NO son gaps)

Las dos vienen del `24-UI-SPEC.md` y las **diferiste vos explícitamente el 2026-09-22**. Están acá
sólo para que nadie las confunda con un defecto encontrado en la UAT:

- **Cero SERVICIOS** (no cero categorías) deja el paso 1 en blanco bajo el `h2`. Preexistente;
  escribir copy de empty state es superficie que ninguna de las 15 decisiones autoriza.
- ~~**Un nombre de SERVICIO de 40+ caracteres sin espacios** se sale de la tarjeta a 375px.~~
  **YA NO ES UNA ASUNCIÓN: se arregló el 2026-09-28** (commit `e7b5ef1`, se verifica en el Test 15).
  El dueño la vio en vivo en el Test 1 —el nombre encimado con el precio— y decidió arreglarla ahí
  mismo. **D-07 se relajó a propósito y con motivo escrito:** existía para que mobile no se rompiera,
  no para conservarlo roto. El arreglo es el par `min-w-0 break-words` en el `<p>`, el mismo que cerró
  G-23-21 en el panel.

> **Nota sobre D-11:** también fue revisada durante esta UAT (→ **D-16**, la barra de chips). No es
> una asunción abierta ni un gap: es un cambio de alcance decidido con la pantalla a la vista, con el
> CONTEXT y el UI-SPEC corregidos en el mismo commit que lo introduce.

## Gaps
