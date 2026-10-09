---
phase: 02-la-barra-inferior-y-m-s
verified: 2026-10-09T12:55:00Z
status: gaps_found
score: 5/6 criterios de éxito verificados en código (criterio 3: el gap original está cerrado; queda un residuo acotado con banners)
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
covered_digest: "v1:sha256:99563237a336520be0449866bb8f8f8313d0a4740a4acfb512c1edbb81a6f8b7"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "5/6 criterios (criterio 3 parcial)"
  gaps_closed:
    - "Criterio 3 (parte principal): /clients y /clinical-history descuentan el alto de la barra y el inset (commit 787b3f6); el candado 8 vigila la familia (65b9543); el guion de UAT A.3 los incluye (568d5d2)"
  gaps_remaining:
    - "Criterio 3 (residuo): con un banner en flujo sobre el contenido (PlanBanner en trial/expired, MpConnectionBanner, TestModeBanner) el alto fijo sigue pasándose por la altura del banner"
  regressions: []
gaps:
  - truth: "Criterio 3 — Nada queda tapado: ninguna pantalla pierde contenido bajo la barra, incluyendo /clients (una de las cinco de la barra) en el estado por defecto de un negocio nuevo"
    status: partial
    reason: >
      El arreglo descuenta 56px (header) + barra + inset de 100vh, o sea que asume que el layout
      bloqueado al viewport arranca en y=56. Eso sólo vale si NADA entra en flujo entre el header y el
      layout. Pero <main> renderiza TestModeBanner, MpConnectionBanner y PlanBanner ANTES de
      {children}, y PlanBanner devuelve contenido cuando plan_status es 'trial' o 'expired'.
      plan_status tiene DEFAULT 'trial' en schema.sql:1000 y el layout hace `?? 'trial'`, o sea
      que TODO negocio nuevo ve el banner. Con banner de altura H el layout arranca en 56+H y su borde
      inferior cae en 100vh - 56 - inset + H: H píxeles por debajo del borde superior de la barra.
      El final de la lista de clientes y de la ficha vuelve a quedar bajo la barra por H (el banner
      mide ~66-100px en 375px: pt-4 + py-3 + texto + botón h-7, con flex-wrap). Sólo se llega
      encadenando el scroll al documento, que es el doble scroll que el criterio 3 existe para evitar.
      Es la misma familia que el gap cerrado y la misma aritmética por la que lo marqué la primera vez
      (por aritmética sobre el código, NO medido en un navegador). El caso sin banner (negocio activo,
      sin error de MP, sin modo prueba) SÍ queda cerrado. El candado 8 no lo puede ver: sólo lee
      clases, no el árbol de lo que se renderiza arriba.
    artifacts:
      - path: "app/(dashboard)/layout.tsx"
        issue: "líneas 95-98: los tres banners entran en flujo dentro de <main>, antes del wrapper p-4; ninguna clase de /clients los descuenta"
      - path: "app/(dashboard)/clients/clients-client.tsx"
        issue: "línea 731: `h-[calc(100vh-56px-var(--panel-nav-h)-env(...))]` es una constante; no sabe cuánto ocupan los banners"
      - path: "app/(dashboard)/clinical-history/clinical-history-client.tsx"
        issue: "línea 32: igual"
    missing:
      - "DECISIÓN (la tiene que tomar el dueño; ver 'A o B' abajo): o se hace que el alto del layout bloqueado no dependa de constantes (p. ej. que el banner no empuje, o que el layout se mida contra su contenedor), o se acepta el residuo y se documenta como deuda con el A.3b de UAT"
      - "Sea cual sea la elección: que el guion de UAT mire /clients CON el banner de prueba visible (cuenta en trial), no sólo con una cuenta activa"
behavior_unverified_items: []
human_verification:
  - test: "A.1 Franja de gestos en un iPhone con notch"
    expected: "El bg-card de la barra cubre la zona de gestos y el último label no queda debajo; en Android no hay hueco ni doble reserva"
    why_human: "env(safe-area-inset-bottom) vale 0 en Android y en todo emulador headless; sólo un iPhone real lo ve. (La wave 1 lo confirmó en UN teléfono con una captura del dueño; el resto de las pantallas no.)"
  - test: "A.2 Teclado abierto en Android Chrome Y iOS Safari (Finanzas largo + drawer de alta de turno, enfocando el último campo)"
    expected: "La barra no se ve ni tapa el campo ni el submit; al cerrar el teclado vuelve sin que el contenido salte"
    why_human: "Exigido por el criterio 3 del ROADMAP ('lo prueba en el teléfono'). interactiveWidget='resizes-visual' es el default y está declarado, pero iOS Safari desplaza el layout viewport por su cuenta; este repo ya pagó 4 quicks de teclado"
  - test: "A.3 Nada tapado: botones de alta de Finanzas, footers de Negocio y Configuración, final de Más (firma), y final de la lista y de la ficha en /clients (scrolleando DENTRO de la lista y DENTRO de la ficha, no arrastrando la página)"
    expected: "Todo completamente visible y alcanzable con el pulgar con la barra presente. Si hace falta arrastrar la página para ver la última fila, el arreglo no tomó efecto"
    why_human: "Requiere layout real con URL bar y teclado del navegador. Ya está en el guion de 02-04-SUMMARY.md (commit 568d5d2)"
  - test: "A.3b (NUEVO de esta pasada) /clients con el banner de período de prueba visible, en una cuenta con plan_status='trial', en 375px"
    expected: "El último cliente de la lista queda visible y tocable por encima de la barra aun con el banner arriba. Es la prueba que confirma o descarta el gap residual de arriba"
    why_human: "El resultado depende de la altura real del banner (puede ser una o dos filas según el ancho) y del navegador; hoy el guion sólo dice 'con la barra presente', y una cuenta de prueba activa lo escondería"
  - test: "A.3c (NUEVO de esta pasada) /clients con la barra de URL del navegador VISIBLE (Android Chrome y iOS Safari), sin haber scrolleado la página antes"
    expected: "El final de la lista queda por encima de la barra. 100vh es el viewport grande (URL bar escondida); con la URL bar visible el viewport visible es más chico que 100vh y la barra fija se dibuja más arriba que el borde calculado. El scroll DENTRO de un scroller interno no colapsa la URL bar, así que no se corrige solo"
    why_human: "Es un comportamiento de navegador móvil que ningún emulador headless reproduce. El arreglo conserva `vh` (como el alto viejo); el repo ya usa `svh` en otros dos lugares. Si se ve tapado, el cambio es `dvh`, y el candado 8 ya lo acepta"
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
    expected: "A 900px: barra y header presentes, sin botón de menú. A >=1024px: cero barra, cero header mobile, sidebar idéntico, sin padding inferior extra, /clients y /clinical-history a pantalla completa SIN hueco de 56px abajo (el arreglo conserva lg:h-screen), y 'Cerrar sesión' del sidebar funcionando"
    why_human: "Comparación visual contra el desktop de hoy; el logout es el único camino de código no ejecutado por tests"
  - test: "E.2 <meta name=viewport> servido en /dashboard y /admin"
    expected: "/dashboard trae `viewport-fit=cover, interactive-widget=resizes-visual`; /admin sigue con `width=device-width, initial-scale=1` y nada más"
    why_human: "El plan 02-04 sólo midió 4 de 6 rutas servidas; las otras dos devolvieron 307 sin sesión. Evidencia estática: un único `export const viewport` en todo app/, en app/(dashboard)/layout.tsx"
---

# Phase 2: La barra inferior y Más — Informe de verificación (segunda pasada)

**Objetivo de la fase (ROADMAP):** que en el celular el panel se navegue desde una barra inferior fija con `Inicio · Turnos · Agenda · Clientes · Más` —por encima de la zona de gestos y sin tapar contenido de ninguna pantalla— y que Más contenga el resto del menú del negocio, agrupado como hoy y sin perder ni una fila; con el mecanismo de historial intacto y el desktop idéntico.

**Verificado:** 2026-10-09 · **Base de la fase:** `49fa195` · **HEAD:** `7b18645`
**Estado:** `gaps_found` (un residuo acotado del criterio 3, nuevo en esta pasada) — y aun sin él, el estado correcto sería `human_needed`
**Re-verificación:** Sí — segunda pasada, después del cierre del gap de `/clients` y `/clinical-history`

## Qué cambió respecto de la primera pasada

| | Primera pasada (`5b8327d`) | Esta pasada (`7b18645`) |
|---|---|---|
| Gap de `/clients` y `/clinical-history` (alto sin descontar la barra) | abierto | **cerrado en código**, verificado abajo |
| Candado 8 | no vigilaba altos fijados al viewport | vigila la familia; **mordió en las 5 mutaciones que le hice yo** |
| Guion de UAT A.3 | no incluía `/clients` | incluye `/clients` (lista y ficha) y `/clinical-history` |
| Gap nuevo | n/a | **sí, uno acotado**: el arreglo asume que no hay banners en flujo (ver abajo) |
| Ítems de UAT humana | 9 | 11 (se suman A.3b y A.3c, ambos derivados de esta pasada) |
| Requisitos MOB-01/02/03/07 | `Pending` | siguen `Pending` (verifiqué `REQUIREMENTS.md` líneas 111-117). Deliberado y correcto |

Desde la primera pasada, el diff de código es exactamente cuatro archivos: los dos altos (1 línea cada uno), el test y el guion de UAT. `git diff a0d1940..HEAD --stat` lo confirma. Los criterios 1, 2, 4, 5 y 6 no tienen un solo byte de código distinto a lo que ya verifiqué, así que los conservo por chequeo de regresión (suite verde, diff de historial vacío, sidebar sin diff).

## Qué verifiqué yo (no copiado de los SUMMARY ni del prompt)

| Comando / lectura | Resultado |
|---|---|
| `grep -rn 'calc(100vh-56px)' app components lib` | **rc 1, cero hits**: el alto viejo desapareció del código |
| Barrido ancho `(min-\|max-)?h-[...100[dsv]vh...]` bajo `app/(dashboard)` | 4 hits, todos explicados: `clients:731` y `clinical-history:32` (ahora con `var(--panel-nav-h)`), `web:504` (`lg:max-h-`, eximido), `settings:3290` (`max-h-[calc(100svh-2rem)]` dentro de `DialogContent`, eximido) |
| Barrido de formas NO arbitrarias (`h-screen`, `h-dvh`, `h-svh`, `min-h-screen`) en `app/(dashboard)`, `components/dashboard`, `components/ui` | Sólo `lg:h-screen` en los dos archivos arreglados, `min-h-screen` en el wrapper y en `<main>` (fluyen con el documento) y los `max-h-[42vh]`/`[24vh]` internos de diálogos de `clients`. Ninguno pierde contenido bajo la barra. `min-h-[70vh]` del upsell de `/web` es un mínimo, no un tope |
| CSS del build existente (`.next/static/chunks/*.css`, 09:37) | contiene `height:calc(100vh - 56px - var(--panel-nav-h) - env(safe-area-inset-bottom,0px))`. Las otras reglas con `100vh - 56px` son el fenómeno ya documentado (Tailwind v4 escanea los `.md`): reglas muertas, **no** un arreglo que no tomó. Las dos mitades del criterio (código sin el viejo, CSS con el nuevo) se cumplen |
| `lg:h-screen` intacto en ambos archivos | Sí, leído en las líneas 731 y 32. A ≥1024px el comportamiento es el de antes del arreglo |
| `npx vitest run test/panel-nav-chrome.test.ts` | rc 0 · 39/39 (reloj 09:46 AR, dentro de la ventana de los canarios) |
| `npx vitest run` completo | 1.ª corrida: **flake conocido del pool** (`106/107`, `1679` casos, `Errors 1 error`). 2.ª corrida, comando idéntico: rc 0 · `Test Files 107 passed (107)` · `Tests 1683 passed \| 4 expected fail \| 1 skipped (1688)`. No aflojé el piso |
| `./node_modules/.bin/tsc --noEmit` | rc 0, sin salida |
| `git diff 49fa195..HEAD --stat -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts` | **vacío** |
| `git diff a0d1940..HEAD --stat` | 5 archivos: dos altos (2 líneas), test (+76), `02-04-SUMMARY.md` (+12), `02-GAP-FIX.md`. Sidebar y los tres módulos de historial: 0 |
| `git status --porcelain -- app components lib test` tras mis mutaciones | vacío (todas revertidas con `git checkout --`) |

### Pruebas de que el candado 8 no se da la razón a sí mismo

Tres enfermedades posibles: (a) que sólo muerda la mutación que el autor probó, (b) que las exenciones se coman todo, (c) que pase por vacío. Las ataqué con mutaciones propias, distintas de la del orquestador, y revirtiendo después de cada una:

| Mutación | Resultado |
|---|---|
| M1. `clinical-history` (el OTRO archivo) al alto viejo `h-[calc(100vh-56px)]` | **rojo**: `clinical-history-client.tsx: h-[calc(100vh-56px)] fija el alto al viewport sin descontar...` |
| M2. `web:504` con `sm:` en lugar de `lg:` (no tiene que eximir: a 640-1023px la barra está) | **rojo**: `sm:max-h-[calc(100vh-8rem)] ...` |
| M3. `clients` con `100dvh` sin descontar (otra unidad de viewport) | **rojo** |
| M4. `clients` con `md:` delante y sin descontar (`md` tampoco exime) | **rojo** |
| M5. los dos altos con `lg:` delante (el modo "silenciar el candado"; las exenciones se comen todo) | **rojo** por la segunda guarda: `AssertionError: expected 0 to be greater than 0` (`exigidos`) |

Conclusión: ambas guardas de honestidad funcionan, las exenciones están acotadas a lo medido (`lg/xl/2xl` y overlays por etiqueta JSX) y el caso `settings:3290` pasa porque el `DialogContent` está en la lista de overlays, no porque el candado no lo vea. **Límite honesto del candado:** sólo lee clases de un archivo. No puede saber qué se renderiza arriba del elemento. Por eso no ve el gap nuevo.

## Verdades observables (criterios de éxito del ROADMAP)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | La barra existe y navega en todas las pantallas y rubros; `aria-current`; labels de la terminología; 375px sin truncar | ✓ VERIFICADO en código (la parte en pantalla va a UAT) | Sin cambios de código desde la 1.ª pasada. `DESTINOS` = `/dashboard`, `/appointments`, `/agenda`, `/clients`, `/mas`; `aria-current`; labels 2 y 4 leen `useTerminology()`. Un teléfono real sólo confirmó que navega (wave 1) |
| 2 | Zona segura real: `viewport-fit=cover` sólo en `(dashboard)/layout.tsx`; destinos ≥44×44 | ✓ VERIFICADO (con un hueco declarado) | Un único `export const viewport`. `/dashboard` y `/admin` no se midieron servidos (E.2) |
| 3 | Nada queda tapado: alto reservado, último elemento alcanzable, teclado decidido y probado en el teléfono | ◐ **PARCIAL** | **Gap original cerrado:** `/clients` y `/clinical-history` ahora miden `100vh - 56px - barra - inset` y su borde inferior cae en el borde superior de la barra (sin banners). `<main>` con `pb`, `lg:pb-0`, `/web` sticky: sin cambios. Teclado: decidido (`resizes-visual`), **no probado en un teléfono**. **Residuo nuevo:** con un banner en flujo el alto fijo se pasa por la altura del banner (ver abajo) |
| 4 | Más reproduce el inventario exacto: 8/8/8/7 + Ayuda / Ver mi página / Cerrar sesión | ✓ VERIFICADO en código | Sin cambios. `test/panel-nav-groups.test.ts` (4 verticales) verde. Rubro por rubro en pantalla: C |
| 5 | Desktop idéntico y un solo menú en mobile | ✓ VERIFICADO en código | Sidebar sin diff en toda la ronda de cierre; `lg:h-screen` conservado en los dos archivos tocados. Visual: E.1 |
| 6 | Historial intacto y auditable | ✓ VERIFICADO | Diff vacío sobre los tres módulos; suites de la Phase 1 dentro de las 107 verdes. Conducta desde el nuevo origen: A.5 |

### Gap residual en detalle — criterio 3 con banners en flujo

El arreglo es correcto para lo que apuntaba, pero su aritmética es `100vh - 56px - barra - inset`, que supone que el layout bloqueado nace en `y = 56`. En `app/(dashboard)/layout.tsx` el `<main>` renderiza, **antes** del wrapper `p-4` que contiene la pantalla:

```
<TestModeBanner />      sticky top-14  (en flujo cuando MP_MODE=test)
<MpConnectionBanner />  en flujo cuando la conexión de MP está caída
<PlanBanner />          en flujo cuando plan_status es 'trial' o 'expired'  (plan-banner.tsx:84,127)
```

`plan_status` es `DEFAULT 'trial'` (`supabase/schema.sql:1000`) y el layout hace `business.plan_status ?? 'trial'`, así que **el banner es el estado por defecto de todo negocio nuevo**, que es justo el que más importa para la primera impresión. El banner mide `pt-4` + `py-3` + texto + botón `h-7` con `flex-wrap`: entre ~66 y ~100px a 375px según haga wrap.

Con un banner de alto `H`: el layout arranca en `56 + H` y termina en `100vh - 56 - inset + H`, o sea `H` píxeles **por debajo** del borde superior de la barra. El final de la lista y de la ficha vuelven a nacer tapados por `H`. Se alcanza igual encadenando el scroll al documento (que mide `100vh + 56 + inset + H`), por eso no es pérdida de contenido, sino el doble scroll torpe que el criterio existe para evitar.

Antes del arreglo el solape era `56 + H`; ahora es `H`. Mejoró, pero no se cerró.

Dos precisiones para no exagerar:
- Es aritmética sobre el código, **no una medición en un navegador** (igual que la primera vez). El ítem A.3b lo confirma o lo descarta en 30 segundos con una cuenta en trial.
- A ≥1024px el `lg:h-screen` ya tenía este mismo desfase antes de esta fase (la página scrollea unos píxeles). Es defecto heredado y sin barra, así que no es regresión; en mobile la barra lo vuelve visible.

**A o B (decisión del dueño, no mía):**
- **A, rápido:** aceptar el residuo, dejarlo anotado como deuda, y que la UAT A.3b lo mida. Costo: en trial, la pantalla más usada tiene el doble scroll hasta que el negocio pague.
- **B, mejor de mantener:** que el alto del layout bloqueado deje de depender de constantes (por ejemplo, medir contra su contenedor o sacar los banners del cálculo). Más laburo y toca el layout de todas las pantallas, pero cierra la familia entera en lugar de una instancia, y el candado 8 hoy no podría vigilarlo.

Recomendación: B si la UAT A.3b confirma el solape; A sólo si se decide que `/clients` en trial no es prioridad.

### Advertencia aparte: `vh` versus la URL bar del móvil

El arreglo conserva `100vh`, como el alto viejo. En Android Chrome e iOS Safari `100vh` es el viewport **grande** (URL bar escondida); con la URL bar visible, el viewport visible es más chico y la barra fija se dibuja más arriba que el borde que calcula el layout. La URL bar no colapsa al scrollear dentro de un scroller interno. No lo puedo afirmar sin teléfono, por eso es un ítem de UAT (A.3c) y no un gap. Si se ve tapado, la solución es `dvh` y el candado 8 ya lo acepta (probado en M3).

## Artefactos requeridos

| Artefacto | Estado | Detalle |
|---|---|---|
| `components/dashboard/nav-groups.ts`, `panel-bottom-nav.tsx`, `panel-top-bar.tsx`, `mas/page.tsx`, `mas/mas-client.tsx`, `sidebar.tsx`, `globals.css`, `themes.css` | ✓ VERIFICADO | Sin cambios desde la 1.ª pasada (diff). Todos sustantivos y cableados |
| `app/(dashboard)/layout.tsx` | ✓ VERIFICADO | `viewport` acotado, barra, header, `pb` de reserva; **los banners en flujo son el origen del residuo** |
| `clients-client.tsx:731`, `clinical-history-client.tsx:32` | ✓ VERIFICADO el arreglo / ◐ residuo con banners | Una clase por archivo, sin espacios en el valor arbitrario (el CSS lo genera, comprobado en el build) |
| `test/panel-nav-chrome.test.ts` | ✓ VERIFICADO | 39 casos; el caso nuevo muerde (M1-M5) y no pasa por vacío |
| `02-04-SUMMARY.md` bloque A.3 | ✓ VERIFICADO | incluye `/clients` (lista y ficha) y `/clinical-history` |

## Key links

| Desde | Hacia | Estado |
|---|---|---|
| `layout.tsx` -> `PanelBottomNav` / `PanelTopBar` | hermanos del `<Sidebar>` | ✓ WIRED |
| barra / `/mas` -> `panel-history` | `panelNavMode` + `consumeOwnedPanelEntry`, guard primero | ✓ WIRED |
| `mas-client` -> `nav-groups` | `buildNavGroups(business)` | ✓ WIRED |
| `<main>` pb / barra h / `/web` sticky / `/clients` alto / `/clinical-history` alto | `--panel-nav-h` | ✓ WIRED en los cinco lugares (antes: tres). Ver el residuo de banners |

## Cobertura de requisitos

| Requisito | Planes | Estado | Evidencia |
|---|---|---|---|
| MOB-01 | 02-01, 02-03, 02-04 | ✓ SATISFECHO en código | criterio 1; confirmación en pantalla pendiente (C, D) |
| MOB-02 | 02-01, 02-04 | ◐ **PARCIAL** | zona segura y áreas ✓; "no tapa contenido": cerrado para el caso sin banner, abierto con banner en flujo |
| MOB-03 | 02-02, 02-04 | ✓ SATISFECHO en código | criterio 4 |
| MOB-07 | 02-01, 02-03, 02-04 | ✓ SATISFECHO en código | criterio 5; `lg:h-screen` conservado |

Sin huérfanos: `REQUIREMENTS.md` mapea exactamente MOB-01/02/03/07 a la Phase 2. **Los cuatro siguen en `Pending` y tienen que seguir así** hasta la UAT en teléfono.

## Anti-patrones

Sin `TBD|FIXME|XXX` ni stubs en los archivos de la fase. El único cambio de código desde la 1.ª pasada son dos clases CSS; no introdujo hallazgos. Los 13 hallazgos del review sin corregir (WR-03..WR-15, salvo los arreglados) siguen como los listé: WR-07 (`/mas` sin gate de viewport en desktop), WR-13 (`--font-geist-mono` inexistente), WR-05 (3.41:1 en spa claro), WR-08 (`/clinical-history` sin título; el alto ya está arreglado, el chrome orientador no). Ninguno rompe el objetivo hoy. Las discrepancias del UI-SPEC (§4, §10, §11) están registradas como deuda documental en `02-REVIEW-FIX.md` y `02-GAP-FIX.md` y **no se cuentan como gaps**. `eslint` sobre `layout.tsx` sigue con el `react-hooks/purity` preexistente, fuera de alcance.

## Lo que sigue sin verificar en una pantalla

Sólo se miraron en un teléfono dos cosas de la wave 1: la franja de gestos pintada por el `bg-card` y que Turnos/Agenda/Clientes naveguen. **Todo lo demás está sin mirar:** `/mas` y su inventario por rubro, el header y su terminología, el **teclado abierto en los dos motores**, el contraste, los touch targets en el DOM real, la banda de 900px, el desktop con su logout, el lector de pantalla, la conducta del atrás desde el nuevo origen, y el arreglo de este gap (A.3, A.3b, A.3c). Los 11 ítems del frontmatter son la lista completa. El verde del pipeline (1683 casos, tsc, build) no sustituye nada de eso.

## Resumen

El gap que bloqueó la primera pasada **está cerrado**: los dos altos descuentan la barra y el inset, `lg:h-screen` sigue intacto, el CSS se genera, y el candado nuevo muerde en cinco mutaciones propias con sus dos guardas de honestidad funcionando. Pero el arreglo, correcto para lo que apuntaba, deja un residuo de la misma familia: asume que ningún banner entra en flujo sobre la pantalla, y el banner de prueba es el estado por defecto de un negocio nuevo. Por eso el estado es `gaps_found` y no `human_needed`. Es un residuo acotado y la elección entre A y B es del dueño; si decide A (aceptarlo con A.3b como medición), el estado pasa a `human_needed` por los 11 ítems de UAT. En ningún caso la fase debería cerrarse apoyándose en el pipeline verde: MOB-01/02/03/07 quedan en `Pending`.

---

_Verificado: 2026-10-09 (segunda pasada)_
_Verificador: Claude (gsd-verifier)_
