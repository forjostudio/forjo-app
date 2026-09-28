---
status: testing
phase: 24-el-cat-logo-que-el-cliente-lee
source: [24-01-SUMMARY.md, 24-02-SUMMARY.md, 24-VERIFICATION.md, 24-UI-SPEC.md]
started: 2026-09-23T00:00:00Z
updated: 2026-09-28T18:00:00Z
---

## Current Test

number: 6
name: Mobile — lo que cambió es sólo lo que decidimos cambiar (D-07 revisada)
expected: |
  A 375px, en el paso 1: el ancho de la tarjeta, el "Ver más" de la descripción, los motivos de las
  deshabilitadas y el ritmo vertical dentro de la tarjeta siguen como antes de la fase. Lo único
  distinto tiene que ser lo decidido: el nombre largo que ahora envuelve, la barra de chips y el
  título de grupo.
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
result: pass
reported: "pass"
note: "CAT-08 (agrupado bajo títulos en el orden del dueño) y CAT-09 (el servicio sin categoría aparece último bajo 'Otros' y se puede reservar) confirmados en navegador real. D-03 tambien: 'Otros' se ve idéntico a una categoría real, sin degradar visualmente servicios que se venden igual." 

### 3. Los dos ejes y los tres modos de orden ⚠ el más importante
expected: Cambiá "Orden de las categorías" entre Personalizado y Alfabético, y "Orden de los servicios" entre Personalizado, Alfabético y Por precio. La pantalla pública se reordena **igual que el panel** en cada combinación.
result: pass
reported: "pass"
note: "EL TEST QUE MAS IMPORTABA de la fase. Cierra el defecto silencioso: `category_sort_mode` y `service_sort_mode` NO estaban en ninguno de los dos `select` antes de esta fase (medido: 0 y 0), así que los modos llegaban `undefined` y `groupCatalog` caía a 'custom' POR CASUALIDAD. Ningún test automático lo habría cantado — no produce error. Confirmado por el dueño en la pantalla real, en los dos ejes."
derived_request: "El dueño pidió acá un CUARTO modo: precio de MAYOR a MENOR. No es un gap de esta fase — es capacidad nueva de la Phase 23 (CAT-04/CAT-05), y necesita migración. Diferido por decisión suya: terminar la UAT primero. Ver 'Ideas surgidas en la UAT' al pie." 

### 4. Desktop — el nombre largo deja de partirse (CAT-10, backstop)
expected: En desktop (≥640px), un servicio con nombre largo **con espacios**: entra en una sola línea a ~432px útiles, ya no se parte en dos.
result: pass
reported: "pasa" (con captura: "Coloración completa con mechas", 30 caracteres, una sola línea)
note: "CAT-10 confirmado midiendo en el navegador, que es como el UI-SPEC exigía cerrarlo (backstop: 'el repo ya se equivocó dos veces estimando anchos de texto en el pizarrón' — G-23-6, G-23-21)."
primer_intento: "El dueño probó primero con un nombre de ~60 caracteres, que se veía en dos renglones. Correcto pero NO probaba CAT-10: ese largo no entra en una línea a ningún ancho de este contenedor, así que se partiría con el cambio o sin él. Se re-probó con ~30 caracteres, que es el rango que antes se partía por falta de ancho (194px útiles en dos columnas) y ahora entra (432px en una)." 

### 5. El paso 3 quedó intacto
expected: Con un negocio de 2+ sedes, el selector de sede/consultorio del paso 3 sigue **en dos columnas**, sin cambios.
result: pass
reported: "Confirmado con captura del paso 3: 'Sede Central' y 'Sede Campana' en DOS columnas."
note: "El control de que el conteo 2->1 de grillas no tocó la del paso 3. Salió de rebote mientras el dueño resolvía lo de los horarios de la sucursal nueva."
observed: "El encabezado del paso dice 'Elegí el sucursal' — sucursal es femenino. Anotado como copy a corregir, superficie del panel/booking fuera de esta fase."

### 6. Mobile: lo que cambió es sólo lo que decidimos cambiar (D-07, revisada)
expected: |
  ⚠ El enunciado original decía "byte-idéntico". Quedó obsoleto: D-07 se relajó TRES veces a
  propósito durante esta UAT — el fix del nombre largo (`min-w-0 break-words`), la barra de chips
  (D-16) y el título de grupo a 18px (Test 8). El test correcto es que mobile cambió SÓLO en eso.
  A 375px, en el paso 1, tienen que seguir igual que antes de la fase: el ancho de la tarjeta (una
  columna, como siempre fue en mobile), el "Ver más" de la descripción con su medición, los motivos
  de las tarjetas deshabilitadas, y el ritmo vertical dentro de cada tarjeta.
result: [pending]

### 7. Grupo mudo (D-12)
expected: Una categoría con **todos** sus servicios deshabilitados: título normal, en su posición del orden, y cada tarjeta con su motivo a la vista.
result: pass
reported: "Test 7 - Pass"
note: "D-12 confirmado: una categoría con todos sus servicios deshabilitados se pinta igual, en su posición del orden, con el motivo a la vista en cada tarjeta."

### 8. Los themes no rompen la jerarquía
expected: Con los themes `spa` y `cyber`: el título de grupo se sigue leyendo un nivel **por debajo** de "Elegí tu servicio" (la jerarquía es por tamaño, no por negrita) y no se rompe con la mayúscula automática de `cyber`.
result: pass
reported: "Funciona, pero en SPA se ve muy chiquito el titulo del grupo." -> arreglado en el acto y re-confirmado: "Test 8 pass"
severity: minor
root_cause: "MEDIDO al reportarlo, y era peor que estético: a `text-sm` (14px) el título quedaba más chico Y más liviano que los nombres de servicio que agrupa (16px/600) — un encabezado por debajo de sus propios ítems. Sólo se veía en `spa` porque `app/themes.css`, importado SIN capa (layout.tsx:12), baja el peso de h1/h2/h3 a 500 ahí y a 600 en `elegante` (:150, :250): el `font-bold` que lo compensaba desaparece en 2 de los 5 themes."
resolved: "En el acto, 2026-09-28: `text-sm` -> `text-lg` (18px). La escalera queda 20 (h2) > 18 (grupo) > 16 (servicio) y se sostiene en los cinco themes porque descansa en el TAMAÑO, que ningún theme pisa. `text-lg` ya se usaba en la pantalla (el precio), así que sigue sin agregarse ningún tamaño nuevo. Gate y UI-SPEC actualizados en el mismo commit."
reconfirmado: "2026-09-28 — el dueño confirmó `spa` y `cyber` con 18px: 'Test 8 pass'. El título ahora se lee como un nivel entre el h2 y las tarjetas en los dos themes."

### 9. Un nombre de categoría con `<script>` adentro
expected: Se ve como **texto plano**. No ejecuta nada.
result: pass
reported: "Test 9 - Pass"
note: "El nombre de categoría con <script> adentro se ve como texto plano. Confirma en navegador la interpolación JSX (T-23-06 / T-23-10 / T-23-26 del registro de amenazas)."

### 10. Consola del navegador — pública
expected: Recorré el flujo completo: sin avisos de hidratación ni warnings de `key`.
result: pass
reported: "Me muevo con la consola abierta y no sale nada, estoy parado bien?" — sí: la captura muestra sólo ruido de desarrollo (HMR, Vercel Analytics). CERO warnings de React.
note: "Sin avisos de hidratación ni de `key` en el flujo completo. Un problema de esos aparecería como 'Warning:' en amarillo o rojo."

### 11. El preview de /web contra la pública, lado a lado (D-13, D-14)
expected: Con un negocio con categorías, abrí `/web` y `/{slug}` en paralelo: el preview muestra el catálogo agrupado **con el mismo ancho**, sin nada achicado, estirado ni escalado — 512px centrados dentro del contenedor ancho del panel.
result: pass
reported: "Test 11 pass"
note: "D-13 y D-14 confirmados lado a lado: el preview muestra el catálogo agrupado con el mismo ancho que la pública, sin escalar nada. G-24-7 — es fiel por construcción porque BookingClient se auto-restringe a max-w-lg." 

### 12. El preview respeta los modos de orden
expected: Cambiá el modo de orden de categorías y de servicios, recargá `/web`: el preview se reordena **igual que la pantalla pública**.
result: pass
reported: "Test 12 pass"
note: "El mismo defecto silencioso del Test 3, cerrado también en la superficie del panel: a `web/page.tsx` le faltaban las dos columnas de modo de orden igual que a la pública (plan 24-02)." 

### 13. El preview con un negocio SIN categorías
expected: Lista plana de siempre, sin títulos y sin "Otros".
result: pass
reported: "Test 13 pass"
note: "Control negativo del preview: sin categorías, lista plana, sin títulos y sin 'Otros'." 

### 14. Consola del navegador — /web
expected: Sin avisos nuevos.
result: pass
reported: "Test 14 dejo captura"
note: "PASS. El único aviso de la consola es de Next.js, NO de React: detecta `scroll-behavior: smooth` en el <html> y sugiere `data-scroll-behavior`. Verificado preexistente y ajeno a esta fase — viene de `app/globals.css:323`, commit a4d99a7 (julio, el lightbox). El criterio del test son los warnings de HIDRATACIÓN y de `key`, y de esos hay CERO. Anotado como pendiente aparte." 

<!-- ── Añadidos durante la UAT: el fix del nombre + la barra de chips (D-16 / G-24-6) ── -->

### 15. El nombre largo sin espacios ya no se encima con el precio (fix del 2026-09-28)
expected: A 375px, el servicio con nombre de 40+ caracteres **sin espacios** envuelve dentro de la tarjeta. No se encima con el precio ni se sale por el costado. En desktop sigue entrando en una línea (CAT-10, test 4).
result: pass
reported: "pass"
note: "Cierra el defecto que el dueño vio en el Test 1 (nombre encimado con el precio). Era la asunción diferida #2 del UI-SPEC: se relajó D-07 a propósito porque existía para que mobile no se rompiera, no para conservarlo roto." 
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
result: pass
reported: "pass"
confirmed: "Los tres controles negativos (0 categorías · 2 creadas sin asignar · 2 grupos con pocos servicios) y el caso positivo que el dueño encontró (1 categoría con muchos servicios + sueltos). El umbral revisado se comporta en la app real como lo describen los tests puros."
note: "El test original decía 'no aparece con 0 ni con 1 categoría'. El propio dueño objetó el umbral durante este test y tenía razón: contaba categorías cuando el problema es la longitud de la página. Regla vigente: >=2 grupos Y >=6 servicios.

### 18. La barra en mobile y con teclado
expected: A **375px** los chips no se apilan: la fila scrollea de costado, sin barra de scroll a la vista, y cada chip se toca cómodo (44px de alto real). Con **teclado**: Tab llega a los chips, el foco se ve, y Enter/Espacio filtra.
result: pass
reported: "pass"
note: "Cierra el bloque de la barra de chips (tests 16, 17 y 18): D-16 / G-24-6 verificados en la app real, en desktop, en mobile y con teclado."
observed_otra_superficie: "El dueño reportó acá una fricción del PANEL (/servicios), NO de esta fase: la zona 'Sin categoría' del organizador sólo se renderiza cuando YA hay servicios sueltos (`categorias-manager.tsx:916`, `sueltos.length > 0`), así que no hay dónde soltar el primer chip para desasignarlo — hay que abrir el diálogo 'Mover …'. Es superficie de la Phase 23, que está cerrada. Medido: el COMENTARIO de :912-915 justifica gatear por '>=1 categoría', que es una condición distinta de la que el código aplica; divergen justo en el caso del dueño (3 categorías, 0 sueltos). Registrado para tratarlo aparte, no como gap de la Phase 24."

## Summary

total: 18
passed: 17
issues: 0
pending: 1
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

## Ideas surgidas en la UAT (NO son gaps — capacidad nueva, diferida)

### Cuarto modo de orden: por precio, de MAYOR a MENOR

Pedido por el dueño en el Test 3 (2026-09-28). **No es de esta fase:** los modos de orden son
CAT-04/CAT-05, superficie del panel (Phase 23). La Fase 24 sólo los consume — en cuanto el modo
exista, la pública y el preview lo respetan **sin tocar una línea**, porque leen `service_sort_mode`
y se lo pasan a `groupCatalog`.

**La cadena, ya medida (2026-09-28) para que quien lo tome no la re-derive:**

| Punto | Detalle |
|---|---|
| **Migración 080** | `businesses_service_sort_mode_chk` es un CHECK con la lista literal `['custom','alpha','price']` (`schema.sql:1029`). Un valor nuevo no entra sin alterar el constraint. ⚠ Las migraciones de este proyecto se aplican a prod **a mano y coordinadas con el deploy**. |
| Tipo | `ServiceSortMode = 'custom' \| 'alpha' \| 'price'` (`lib/service-categories.ts:54`) |
| Comparador | `porPrecio` (`:175`) y el `switch` de `comparadorDeServicios` (`:188`) |
| Selector del panel | `settings-client.tsx:2776` — el rótulo actual dice literal *"Por precio (de menor a mayor)"*, así que el copy de los dos modos hay que rehacerlo junto |
| Whitelist de escritura | `settings-client.tsx:1989` rechaza hoy cualquier valor fuera de los tres |

**Decisión del dueño:** terminar la UAT de la Fase 24 primero y decidir después.
