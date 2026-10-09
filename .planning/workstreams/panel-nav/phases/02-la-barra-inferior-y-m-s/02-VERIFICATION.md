---
phase: 02-la-barra-inferior-y-m-s
verified: 2026-10-09T15:00:00Z
status: human_needed
score: 6/6 criterios de éxito verificados hasta donde el código puede entregarlos (la parte que sólo se ve en un teléfono queda en 12 ítems de UAT)
covered_files:
  - ".planning/workstreams/panel-nav/REQUIREMENTS.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-01-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-01-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-02-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-02-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-03-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-03-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-04-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-04-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-GAP-FIX-2.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-GAP-FIX.md"
  - "app/(dashboard)/clients/clients-client.tsx"
  - "app/(dashboard)/clinical-history/clinical-history-client.tsx"
  - "app/(dashboard)/layout.tsx"
  - "app/(dashboard)/mas/mas-client.tsx"
  - "app/(dashboard)/mas/page.tsx"
  - "app/(dashboard)/web/web-client.tsx"
  - "app/globals.css"
  - "app/themes.css"
  - "components/dashboard/nav-groups.ts"
  - "components/dashboard/panel-bottom-nav.tsx"
  - "components/dashboard/panel-top-bar.tsx"
  - "components/dashboard/sidebar.tsx"
  - "test/panel-nav-chrome.test.ts"
  - "test/panel-nav-groups.test.ts"
covered_digest: "v1:sha256:0da492d6d0f3fe8380197a14b700717a10a2ef045c961d7b1920a1608a52ab38"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "5/6 criterios (criterio 3 con un residuo acotado de banners en flujo)"
  gaps_closed:
    - "Criterio 3 (residuo): el alto de /clients y /clinical-history ya no es una cuenta de constantes. El <main> es flex flex-col min-h-dvh, el envoltorio es relative grow y las dos pantallas son absolute inset-0 (commits fe355f4, e328edf). Con 0, 1, 2 y 3 banners el borde inferior de la pantalla queda a 1px del borde superior de la barra (el border-t de la barra), y el doble scroll del documento es 0. Medido por mi cuenta, ver abajo"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items: []
human_verification:
  - test: "A.1 Franja de gestos en un iPhone con notch"
    expected: "El bg-card de la barra cubre la zona de gestos y el último label no queda debajo; en Android no hay hueco ni doble reserva"
    why_human: "env(safe-area-inset-bottom) vale 0 en Android y en todo emulador headless; sólo un iPhone real lo ve. (La wave 1 lo confirmó en UN teléfono con una captura del dueño; el resto de las pantallas no.)"
  - test: "A.2 Teclado abierto en Android Chrome Y iOS Safari (Finanzas largo + drawer de alta de turno, enfocando el último campo; y el buscador de /clients, que ahora vive dentro de un absolute inset-0)"
    expected: "La barra no se ve ni tapa el campo ni el submit; al cerrar el teclado vuelve sin que el contenido salte"
    why_human: "Exigido por el criterio 3 del ROADMAP ('lo prueba en el teléfono'). interactiveWidget='resizes-visual' es el default y está declarado, pero iOS Safari desplaza el layout viewport por su cuenta; este repo ya pagó 4 quicks de teclado. Este cambio suma una variable que ningún headless ve: cómo se comporta dvh con el teclado abierto en cada motor"
  - test: "A.3 Nada tapado: botones de alta de Finanzas, footers de Negocio y Configuración, final de Más (firma), y final de la lista y de la ficha en /clients y /clinical-history (scrolleando DENTRO de la lista y DENTRO de la ficha, no arrastrando la página)"
    expected: "Todo completamente visible y alcanzable con el pulgar con la barra presente. Si hace falta arrastrar la página para ver la última fila, el arreglo no tomó efecto"
    why_human: "Requiere layout real con URL bar y teclado del navegador. Ya está en el guion de 02-04-SUMMARY.md (commit 568d5d2)"
  - test: "A.3b /clients con el banner de período de prueba visible (cuenta con plan_status='trial'), en 375px, y después con el banner de MercadoPago caído sumado"
    expected: "El último cliente de la lista queda visible y tocable por encima de la barra con uno y con dos banners. La página no se puede arrastrar (no hay doble scroll). Pasa de 'confirma o descarta un gap' a 'confirma una medición': el solape medido es 1px con 0, 1, 2 y 3 banners"
    why_human: "Es el estado por defecto de todo negocio nuevo y la altura real del banner depende de la fuente y del ancho. Mi sonda usa bloques de altura fija, no el banner real"
  - test: "A.3c /clients con la barra de URL VISIBLE (Android Chrome y iOS Safari), sin haber scrolleado la página antes"
    expected: "El final de la lista queda por encima de la barra. El mecanismo usa dvh a propósito (con vh el solape medido por proxy era de 60px, con dvh es 0)"
    why_human: "Ningún headless tiene barra de URL; el proxy de 60px es una simulación. Hay que ver que dvh se comporta como dice la especificación, en particular en iOS Safari"
  - test: "A.3d (NUEVO de esta pasada) Mirar en el teléfono las 12 pantallas que FLUYEN con el documento, no sólo las dos arregladas: /abonos, /agenda, /appointments, /ayuda, /consultorios, /dashboard, /equipo, /finances, /mas, /negocio, /servicios, /settings (y /web)"
    expected: "Cada una se ve igual que antes de la fase en ancho, padding y sticky; la última fila queda por encima de la barra; los banners y el TestModeBanner (sticky) siguen pegados bajo el header; ningún scroll horizontal nuevo"
    why_human: "El <main> pasó de contenedor de bloque a contenedor flex y su envoltorio a relative grow. Es el ancestro común de las 15 pantallas y lo más ancho que tocó la fase. Mi sonda y la del ejecutor midieron cajas con CSS real pero con contenido sintético: ninguna de las dos renderizó una pantalla real (el dev server del puerto 80 está colgado)"
  - test: "A.4 Tres pasadas de contraste: forjo claro, spa claro paleta clay, modern claro paleta amber"
    expected: "Foco visible, activo distinguible del inactivo, eyebrow de grupo de Más legible (5.02:1 el peor caso medido)"
    why_human: "Los números salen de cálculo (spa/modern usan color-mix, aproximado); el criterio de diseño es visual. La línea de plan del bloque de identidad (WR-05) sigue en --muted-foreground y da 3.41:1 en spa claro: mirarla en esa pasada"
  - test: "A.5 UAT de v0.30 repetida DESDE LA BARRA"
    expected: "sección -> atrás del sistema -> Inicio; el atrás cierra overlay/selector/calendario/teclado antes de navegar; cambios sin guardar preguntan antes de descartar; tocar el destino actual con subsección abierta la cierra en vez de apilar"
    why_human: "Criterio 6 en su parte conductual: el modo de falla del historial es silencioso y el repo ya tuvo 7 bugs que sólo aparecieron en un teléfono. El mecanismo está intacto por diff vacío, pero la conducta desde el nuevo origen (barra y /mas) no se miró"
  - test: "C Inventario de Más rubro por rubro en pantalla (salud 8, belleza 8, general 8, canchas 7) + CUENTA (Ayuda, Ver mi página en pestaña nueva, Cerrar sesión) + bloque de identidad (nombre >=40 caracteres, firma alcanzable, logout con su rama de error)"
    expected: "Coincide con el inventario computado; la barra dice Pacientes en salud y Reservas en canchas; ningún label truncado, con el eje de las 5 familias (mínimo geometrica y bauhaus con el ítem activo)"
    why_human: "El inventario está probado puro (4 verticales), pero que el VerticalProvider entregue el rubro correcto en runtime y que los labels se lean bien sólo se ve abriendo las cuentas en un teléfono"
  - test: "D Header de dos líneas + menú único"
    expected: "Línea 2 cambia por sección y por terminología; 'Inicio' en la raíz (el sidebar desktop sigue diciendo Dashboard a propósito); nombre largo trunca; NO hay botón de menú en ninguna pantalla mobile; lector de pantalla anuncia cada fila bajo su grupo y los dos landmarks tienen nombres distintos"
    why_human: "Terminología en runtime, lector de pantalla y orientación a mitad de scroll no se ven con grep"
  - test: "E.1 Banda de 900px y desktop >=1024px"
    expected: "A 900px: barra y header presentes, sin botón de menú. A >=1024px: cero barra, cero header mobile, sidebar idéntico, sin padding inferior extra, /clients y /clinical-history a pantalla completa SIN hueco de 56px abajo (conservan lg:h-screen) y 'Cerrar sesión' del sidebar funcionando"
    why_human: "Comparación visual contra el desktop de hoy; el logout es el único camino de código no ejecutado por tests"
  - test: "E.2 <meta name=viewport> servido en /dashboard y /admin"
    expected: "/dashboard trae `viewport-fit=cover, interactive-widget=resizes-visual`; /admin sigue con `width=device-width, initial-scale=1` y nada más"
    why_human: "El plan 02-04 sólo midió 4 de 6 rutas servidas; las otras dos devolvieron 307 sin sesión. Evidencia estática: un único `export const viewport` en todo app/, en app/(dashboard)/layout.tsx"
---

# Phase 2: La barra inferior y Más — Informe de verificación (tercera pasada)

**Objetivo de la fase (ROADMAP):** que en el celular el panel se navegue desde una barra inferior fija con `Inicio · Turnos · Agenda · Clientes · Más` —por encima de la zona de gestos y sin tapar contenido de ninguna pantalla— y que Más contenga el resto del menú del negocio, agrupado como hoy y sin perder ni una fila; con el mecanismo de historial intacto y el desktop idéntico.

**Verificado:** 2026-10-09 · **Base de la fase:** `49fa195` · **HEAD:** `71570a2`
**Estado:** `human_needed` — no queda ningún gap de código; lo que falta es mirar la fase en un teléfono.
**Re-verificación:** Sí — **tercera pasada**, después del cierre de raíz del residuo de los banners (opción B del dueño: `fe355f4`, `e328edf`, `71570a2`).

## Qué cambió respecto de la segunda pasada

| | Segunda pasada (`7b18645`) | Esta pasada (`71570a2`) |
|---|---|---|
| Alto de `/clients` y `/clinical-history` | `calc(100vh - 56px - barra - inset)`: una cuenta de constantes | **heredado**: `<main>` `flex flex-col min-h-dvh` + envoltorio `relative grow` + pantalla `absolute inset-0 lg:static lg:-m-8 lg:h-screen` |
| Residuo con banners en flujo | solape = alto del banner (H); `gaps_found` | **cerrado**: solape 1px con 0, 1, 2 y 3 banners; doble scroll 0 |
| Unidad de viewport | `vh` | `dvh` (decisión con número: 60px de solape con `vh` y barra de URL visible, 0 con `dvh`) |
| Candado 8 | exigía la cuenta de constantes (bendecía la forma frágil) | **prohíbe** nombrar el viewport en mobile + caso nuevo que exige el contrato cableado en los dos extremos |
| Suite | 1683 casos | 1684 casos (+1: el caso del contrato) |
| Ítems de UAT | 11 | 12 (se suma A.3d: las 12 pantallas que fluyen) |
| Requisitos MOB-01/02/03/07 | `Pending` | siguen `Pending` (`REQUIREMENTS.md:111-117`). Deliberado y correcto |

Desde la segunda pasada el diff de código es exactamente cuatro archivos (`git diff 5d2262d..HEAD --stat`): `layout.tsx` (+56), `clients-client.tsx` (+10), `clinical-history-client.tsx` (+5), `test/panel-nav-chrome.test.ts` (+94), más el reporte `02-GAP-FIX-2.md`. Sidebar y los tres módulos de historial: cero bytes de diferencia.

## Qué verifiqué yo (no copiado de los SUMMARY ni del prompt)

| Comando / lectura | Resultado |
|---|---|
| Lectura de `layout.tsx` líneas 82 y 131-145 | `<div className="min-h-dvh">`; `<main className="lg:pl-60 pt-14 lg:pt-0 min-h-dvh flex flex-col pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0">`; envoltorio `relative grow p-4 sm:p-6 lg:p-8`; los tres banners siguen antes del envoltorio |
| Lectura de `clients-client.tsx:739` y `clinical-history-client.tsx:35` | `absolute inset-0 lg:static lg:-m-8 lg:h-screen flex overflow-hidden bg-background` en las dos |
| `grep -rn 'calc(100vh-56px' app components lib` | **rc 1, cero hits** |
| Barrido de `vh`, `dvh`, `svh`, `h-screen`, `min-h-screen` en `app/(dashboard)` y `components/dashboard` | Sólo: `lg:h-screen` en las dos pantallas; `lg:max-h-[calc(100vh-8rem)]` en `/web:504`; `max-h-[calc(100svh-2rem)]` en `/settings:3290` y `categorias-manager.tsx:1050` (ambos `DialogContent` en portal `z-50` sobre la barra `z-30`); `min-h-[70vh]` del upsell de `/web` (piso); `max-h-[42vh]`/`[24vh]` internos de diálogos de `clients`; el propio layout |
| Los 2 `absolute` internos de `/clients` y `/clinical-history` (ícono de búsqueda) | Cada uno dentro de `<div className="relative">` propio: el `relative` nuevo del envoltorio y el `absolute` nuevo de la pantalla no les cambian el bloque contenedor |
| `page.tsx` de las dos pantallas | Sólo `<Suspense fallback={null}>`/el componente cliente: nada en flujo que el `absolute` tape. No hay `loading.tsx`, `error.tsx` ni `template.tsx` en el route group |
| Banners (`plan-banner`, `mp-connection-banner`, `test-mode-banner`) | Ninguno usa `mx-auto` ni `max-w-*`: pasar el `<main>` a columna flex no los encoge al ancho de su contenido |
| CSS del build (`.next/static/chunks/*.css`, 11:51), `grep -F` | presentes: `min-height:100dvh`, `.grow{flex-grow:1}`, `lg\:static{position:static}`, `lg\:h-screen{height:100vh}` (1 cada una) |
| `./node_modules/.bin/tsc --noEmit` | rc 0, sin salida |
| `npx vitest run` completo (reloj 11:54 AR, dentro de la ventana de los canarios) | rc 0 · `Test Files 107 passed (107)` · `Tests 1684 passed \| 4 expected fail \| 1 skipped (1689)`. Corrida limpia, sin flake |
| `git diff 49fa195..HEAD -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts` | **vacío** |
| `git diff 5d2262d..HEAD` sobre `sidebar.tsx` y `.planning/` salvo el reporte | vacío: STATE/ROADMAP/REQUIREMENTS sin tocar |
| `git status --porcelain -- app components lib test` tras mis mutaciones | vacío (todas revertidas con `git checkout --`) |

### Medición propia del DOM (no la del ejecutor)

Armé una sonda aparte: Chrome headless por CDP, **el CSS REAL del build** (todos los `.next/static/chunks/*.css` inlineados) y **las cadenas de clases reales** del `<main>`, del envoltorio y de las pantallas bloqueadas, con el header y la barra reales como `fixed`. A diferencia de la sonda del ejecutor (CSS escrito a mano replicando declaraciones), acá la cascada la resuelve el CSS generado por Tailwind. Contenido sintético (bloques de altura fija); no renderiza pantallas reales.

| Escenario | H banner | `panel.top` | `panel.height` | `panel.bottom` | `bar.top` | **solape** | **docScr** (scroll del documento) | último elemento de la lista vs `bar.top` |
|---|---|---|---|---|---|---|---|---|
| 375×667, 0 banners | 0 | 56 | 555 | 611 | 610 | **1** | **0** | 1 |
| 375×667, 1 banner | 102 | 158 | 453 | 611 | 610 | **1** | **0** | 1 |
| 375×667, 2 banners | 112 | 280 | 331 | 611 | 610 | **1** | **0** | 1 |
| 375×667, 3 banners | 90 | 326 | 285 | 611 | 610 | **1** | **0** | 1 |
| 320×568, 1 banner | 102 | 158 | 354 | 512 | 511 | **1** | 0 | 1 |
| 640×800 (banda `sm`, `p-6`), 1 banner | 70 | 126 | 618 | 744 | 743 | **1** | 0 | 1 |
| 1023×800 (último px antes de `lg`), 1 banner | 70 | 126 | 618 | 744 | 743 | **1** | 0 | 1 |
| 1440×900 (desktop), 1 banner | 78 | 78 | **900** (= `lg:h-screen`) | 978 | 0 (la barra está `hidden`) | n/a | 78 (heredado, idéntico a antes) | n/a |

Pantalla que fluye, 375×667 (el `pb` del `<main>` sigue reservando con el CSS real): largo con 1 banner → `docScr` 2599 y el último bloque cae **15px por encima** de la barra (16 de padding menos el borde de 1px); corto sin banner → `docScr` 0; corto con 2 banners → `docScr` 0.

Conclusión de la medición: **el solape no depende del número ni del alto de los banners** (los cuatro escenarios de 375px dan 1px) y el doble scroll del documento desapareció. Es consistente con lo que el ejecutor reportó (555/453/331, solape 1, `docScr` 0), por un instrumento distinto. Un cuarto banner queda cubierto por construcción: no hay ninguna cuenta que actualizar.

El 1px es el `border-t` de la barra, que vive encima de la caja de 56px que reserva `--panel-nav-h`. Es preexistente (idéntico al caso sin banner aceptado en la segunda pasada) y es una línea de borde, no contenido: **refinamiento, no gap**.

### Pruebas de que el candado 8 adaptado no se da la razón a sí mismo

Las enfermedades que ya aparecieron tres veces en esta fase: (a) que sólo muerda la mutación del autor, (b) que las exenciones se coman todo, (c) que pase por vacío, y (d) la nueva de esta ronda: que la regla vieja bendiga la forma frágil. Atacé el candado con **seis mutaciones propias, distintas de las seis del ejecutor y de las dos del orquestador**, revirtiendo cada una:

| Mutación | Resultado |
|---|---|
| N1. `h-dvh` agregado a `/abonos` (forma por palabra, en una pantalla que no es de la familia) | **rojo**: `abonos-client.tsx: h-dvh ata el alto al viewport en mobile…` |
| N2. `sm:h-[calc(100vh-4rem)]` agregado a `/clients` (`sm:` no debe eximir: la barra está a 640-1023px) | **rojo**: `sm:h-[calc(100vh-4rem)] ata el alto…` |
| N3. quitar el `pb-[calc(…)] lg:pb-0` del `<main>` (la reserva de las pantallas que fluyen) | **rojo** (caso de la reserva del header y la barra): `expected '<main …' to contain 'var(--panel-nav-h)'` |
| N4. `/clients` sin `inset-0` (con `absolute` y `lg:static`) | **rojo** (caso del contrato): `fija el alto a la pantalla en desktop pero en mobile le falta inset-0` |
| N5. quitar `flex-col` del `<main>` | **rojo**: `el <main> perdió flex flex-col: sin él el envoltorio no recibe el sobrante` |
| N6. `h-[90vh] overflow-hidden` agregado a `/abonos` (viewport con un número distinto de 100) | **verde — punto ciego**, ver abajo |

Veredicto sobre el candado: **las dos guardas de honestidad (`hallados > 0`, `exigidos > 0`) siguen, las exenciones están acotadas a lo medido** (`lg/xl/2xl`, nunca `sm/md`; overlays por etiqueta JSX; `min-h-*` fuera por ser piso), y el caso nuevo de contrato cierra el hueco que la regla prohibitiva por sí sola dejaría (borrar `grow` o `inset-0` no tendría ningún alto de viewport que señalar). Con el mecanismo nuevo **no pasa por vacío**: `exigidos = 3` hoy. La enfermedad vieja —exigir la cuenta de constantes— no está: ahora prohíbe nombrar el viewport, que es lo que desaparece cuando el chrome cambia.

**Punto ciego medido, registrado como deuda y NO como gap (N6):** la expresión `ALTO_DE_VIEWPORT` exige literalmente `100` antes de `vh`. Un `h-[90vh]`/`h-[calc(90vh-…)]` en una pantalla nueva pasaría sin avisar. Hoy ninguna pantalla lo hace (los únicos `vh` con otro número son los `max-h-[42vh]`/`[24vh]` internos de diálogos de `/clients`, eximidos por etiqueta), así que no es un defecto que el usuario vaya a encontrar; es una forma de falla futura. Refinamiento: ampliar la expresión a cualquier `\d+[dsl]?vh` en `h-`/`max-h-` y eximir los diálogos por etiqueta como ya se hace. Además el barrido sólo recorre `app/(dashboard)`, no `components/dashboard` (donde hoy sólo hay un `max-h` de `DialogContent`, correcto).

## Verdades observables (criterios de éxito del ROADMAP)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | La barra existe y navega en todas las pantallas y rubros; `aria-current`; labels de la terminología; 375px sin truncar | ✓ VERIFICADO en código (la parte en pantalla va a UAT) | Sin cambios de código desde la 1.ª pasada: `DESTINOS` = `/dashboard`, `/appointments`, `/agenda`, `/clients`, `/mas`; labels 2 y 4 leen `useTerminology()`. Un teléfono real sólo confirmó que navega (wave 1) |
| 2 | Zona segura real: `viewport-fit=cover` sólo en `(dashboard)/layout.tsx`; destinos ≥44×44 | ✓ VERIFICADO (con un hueco declarado) | Un único `export const viewport` en `app/`. `/dashboard` y `/admin` no se midieron servidos (E.2) |
| 3 | Nada queda tapado: alto reservado, último elemento alcanzable, teclado decidido y probado en el teléfono | ✓ VERIFICADO en código; **teclado y barra de URL sólo en teléfono (A.2, A.3b, A.3c)** | Las pantallas que fluyen: `pb` del `<main>` (medido con CSS real: último bloque 15px sobre la barra). Las bloqueadas: alto derivado, solape 1px con 0-3 banners, `docScr` 0, a 320/375/640/1023px. `/web` sticky intacto. Teclado: decidido (`resizes-visual`), no probado en un teléfono, que el criterio exige explícitamente |
| 4 | Más reproduce el inventario exacto: 8/8/8/7 + Ayuda / Ver mi página / Cerrar sesión | ✓ VERIFICADO en código | Sin cambios. `test/panel-nav-groups.test.ts` (4 verticales) verde. Rubro por rubro en pantalla: C |
| 5 | Desktop idéntico y un solo menú en mobile | ✓ VERIFICADO en código | Sidebar sin diff. A 1440×900 mi sonda midió `panel.height` 900 (`lg:h-screen`) y la barra `hidden`, igual que antes; `lg:static` y `lg:-m-8` devuelven la pantalla al flujo. Visual: E.1 |
| 6 | Historial intacto y auditable | ✓ VERIFICADO | Diff vacío sobre los tres módulos; suites de la Phase 1 dentro de las 107 verdes. Conducta desde el nuevo origen: A.5 |

**Puntaje:** 6/6 verificados hasta donde el código puede entregarlos. Ningún criterio está `FAILED` y ninguno quedó `PRESENT_BEHAVIOR_UNVERIFIED` por falta de test: lo que falta es lo que ningún test headless puede mostrar (teclado en dos motores, barra de URL real, contraste visual, conducta del atrás), y está en `human_verification`.

## Por qué no hay un gap nuevo (la distinción defecto / refinamiento)

Busqué activamente un defecto que el usuario vaya a encontrar en el cambio de `<main>` y no encontré ninguno. Lo que descarté y por qué:

- **Pantallas que fluyen rotas por el `flex-col`.** En una columna flex el eje cruzado es el ancho: los ítems se estiran al ancho del `<main>` igual que en bloque, y el `min-width:auto` sólo aplica al eje principal. Banners sin `mx-auto`/`max-w`. Medido: el envoltorio sigue a ancho completo.
- **`absolute` que ahora resuelve contra otro bloque.** Los `absolute` de las dos pantallas son los íconos de búsqueda, cada uno dentro de su `relative`. Para el resto del route group, el ejecutor auditó 14 tokens; yo verifiqué los de las dos pantallas afectadas, que son las únicas donde el `absolute` nuevo se interpone.
- **`dvh` no soportado.** `min-h-dvh` sin fallback haría colapsar las pantallas bloqueadas a 0px en un navegador sin `dvh`. Pero `dvh` es baseline desde 2022 (Safari 15.4, Chrome 108) y este repo ya compila con Tailwind v4 y Next 16, cuyos objetivos de navegador (Safari 16.4+, Chrome 111+) lo incluyen. No es un caso alcanzable por un usuario del producto.
- **Pérdida de la jaula del teclado.** Con `resizes-visual` el layout viewport no se reduce con el teclado, y `dvh` sigue a la barra de URL, no al teclado. Es una inferencia de especificación, **no** una medición: por eso A.2 sigue siendo UAT obligatoria y no la cuento como verificada.

### Deuda registrada (refinamientos, ninguno es gap)

1. Punto ciego N6 del candado 8 (viewport con número distinto de 100). Ver arriba.
2. El 1px del `border-t` de la barra (57px visuales vs 56 reservados). Preexistente y consciente.
3. A ≥1024px el `lg:h-screen` deja que el documento se arrastre la altura del banner (78px medidos). Preexistente, sin barra, y el encargo pedía desktop idéntico. Se cierra gratis quitando `lg:h-screen` si algún día se quiere.
4. Deuda documental del UI-SPEC (artefacto aprobado, no editado): §10 dice "nada de `100dvh`/`100svh` nuevo ni tocar el `min-h-screen`" y el cambio lo contradice a propósito con el número de los 60px; §10 "el alto se reserva en UN SOLO lugar" hoy son dos (el `pb` del `<main>` y el `sticky` de `/web`); §4 ~110 y §11 regla 3 rancias frente a §5/§18.8/§19 C-6; "13 pantallas" son 15.
5. Del review sin corregir: WR-07 (`/mas` sin gate de viewport en desktop), WR-13 (`--font-geist-mono` inexistente), WR-05 (3.41:1 en spa claro), WR-08 (`/clinical-history` sin título ni activo). Ninguno rompe el objetivo hoy. `eslint` sobre `layout.tsx` sigue con el `react-hooks/purity` preexistente (`Date.now` en `daysLeft`), fuera de alcance.
6. La trampa de Tailwind v4 escaneando los `.md` de `.planning/` (strings viejos vivos en el CSS del build, hasta con warnings por un `env(...)` con elipsis del frontmatter anterior) no es un defecto del producto; el criterio doble (viejo fuera del código + nuevo presente en el CSS) se cumple. Esta reescritura del frontmatter no contiene ya el `env(...)` con elipsis.

## Artefactos requeridos

| Artefacto | Estado | Detalle |
|---|---|---|
| `components/dashboard/nav-groups.ts`, `panel-bottom-nav.tsx`, `panel-top-bar.tsx`, `mas/page.tsx`, `mas/mas-client.tsx`, `sidebar.tsx`, `globals.css`, `themes.css` | ✓ VERIFICADO | Sin cambios desde la 1.ª pasada. Sustantivos y cableados |
| `app/(dashboard)/layout.tsx` | ✓ VERIFICADO | `viewport` acotado, barra, header, contrato del alto (`flex flex-col min-h-dvh` + `relative grow`), `pb` de reserva con `lg:pb-0` |
| `clients-client.tsx:739`, `clinical-history-client.tsx:35` | ✓ VERIFICADO | `absolute inset-0 lg:static lg:-m-8 lg:h-screen`; el CSS se genera; medido 1px de solape con 0-3 banners |
| `test/panel-nav-chrome.test.ts` | ✓ VERIFICADO | 40 casos; el barrido prohibitivo muerde (N1, N2) y el caso del contrato muerde (N4, N5); las dos guardas de honestidad siguen. Ciego a `vh` con número ≠ 100 (deuda 1) |
| `02-GAP-FIX-2.md` | ✓ PRESENTE | Mediciones consistentes con las mías |

## Key links

| Desde | Hacia | Estado |
|---|---|---|
| `layout.tsx` -> `PanelBottomNav` / `PanelTopBar` | hermanos del `<Sidebar>` | ✓ WIRED |
| barra / `/mas` -> `panel-history` | `panelNavMode` + `consumeOwnedPanelEntry`, guard primero | ✓ WIRED |
| `mas-client` -> `nav-groups` | `buildNavGroups(business)` | ✓ WIRED |
| `<main>` (`flex flex-col`, `min-h-dvh`) -> envoltorio `relative grow` -> pantalla `absolute inset-0` | alto derivado, sin constantes | ✓ WIRED (medido) |
| `<main>` pb / barra h / `/web` sticky | `--panel-nav-h` | ✓ WIRED (ya no hay un cálculo de alto en las pantallas bloqueadas) |

## Cobertura de requisitos

| Requisito | Planes | Estado | Evidencia |
|---|---|---|---|
| MOB-01 | 02-01, 02-03, 02-04 | ✓ SATISFECHO en código | criterio 1; confirmación en pantalla pendiente (C, D) |
| MOB-02 | 02-01, 02-04 | ✓ SATISFECHO en código | zona segura y áreas ✓; "no tapa contenido" cerrado y medido con 0-3 banners; teclado y barra de URL en teléfono (A.2, A.3c) |
| MOB-03 | 02-02, 02-04 | ✓ SATISFECHO en código | criterio 4 |
| MOB-07 | 02-01, 02-03, 02-04 | ✓ SATISFECHO en código | criterio 5; `lg:h-screen`, `lg:static`, `lg:-m-8` conservan el desktop |

Sin huérfanos: `REQUIREMENTS.md` mapea exactamente MOB-01/02/03/07 a la Phase 2. **Los cuatro siguen en `Pending` y tienen que seguir así** hasta que el dueño pase la UAT en teléfono.

## Anti-patrones

Sin `TBD|FIXME|XXX` ni stubs en los archivos tocados por la fase. Sin nuevos hallazgos de `eslint` (el único es el preexistente de `layout.tsx`). Los comentarios largos del layout y de las dos pantallas explican el por qué y reflejan lo medido (15 pantallas, `dvh`, `grow` vs `flex-1`).

## Lo que sigue sin verificar en una pantalla

En un teléfono se miraron sólo dos cosas de la wave 1: la franja de gestos pintada por el `bg-card` y que Turnos/Agenda/Clientes naveguen. **Todo lo demás está sin mirar**, y esta ronda agrega una superficie: el `<main>` cambió de modelo de caja para las 15 pantallas, así que la UAT tiene que recorrer las 12 que fluyen (A.3d), no sólo las dos arregladas. Sigue sin probarse el **teclado abierto en Android Chrome e iOS Safari**, que el criterio 3 exige hacer en el teléfono. Los 12 ítems del frontmatter son la lista completa. El verde del pipeline (1684 casos, tsc, build) y las dos sondas de DOM (la del ejecutor y la mía) no sustituyen nada de eso: ambas miden cajas con contenido sintético, ninguna renderizó una pantalla real.

## Resumen

El residuo de la segunda pasada está **cerrado de raíz**: el alto de las dos pantallas bloqueadas dejó de ser una cuenta de constantes y pasó a derivarse del espacio que de verdad queda. Lo medí con un instrumento distinto al del ejecutor (CSS real del build, cadenas de clases reales): 1px de solape —el borde de la barra— con cero, uno, dos y tres banners, doble scroll en 0, a 320, 375, 640 y 1023px, y el desktop idéntico. El cambio ancho (el `<main>` a columna flex) no rompe las pantallas que fluyen según la medición y la revisión de código. El candado 8 adaptado no tiene la enfermedad de las tres veces anteriores: muerde en cinco de seis mutaciones propias, no pasa por vacío, mantiene las dos guardas, y el único punto ciego (`vh` con un número distinto de 100) es una deuda futura que no produce ningún defecto hoy. Por eso el estado es `human_needed` y no `gaps_found`: el lado de código entrega el objetivo hasta donde el código puede entregarlo. Lo que sigue es la UAT en teléfono, con el teclado abierto en los dos motores como el ítem más importante. MOB-01/02/03/07 quedan en `Pending`.

---

_Verificado: 2026-10-09 (tercera pasada)_
_Verificador: Claude (gsd-verifier)_
