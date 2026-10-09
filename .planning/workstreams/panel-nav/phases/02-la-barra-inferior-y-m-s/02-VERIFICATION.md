---
phase: 02-la-barra-inferior-y-m-s
verified: 2026-10-09T05:40:00Z
status: gaps_found
score: 5/6 criterios de éxito verificados en código (1 parcial: criterio 3)
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
covered_digest: "v1:sha256:31c30faf4f4d503e834f8dc18d5546af9104ceca0bc5c87ce8716d53a5868aa1"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps:
  - truth: "Criterio 3 — Nada queda tapado: el alto de la barra se reserva y el último elemento de la pantalla más larga sigue alcanzable; ninguna pantalla pierde contenido bajo la barra"
    status: partial
    reason: >
      La reserva (`pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))]` en el <main>) es sólo
      padding del DOCUMENTO. Dos pantallas del route group (`/clients` y `/clinical-history`) NO fluyen
      con el documento: son un layout bloqueado al viewport (`-m-4 ... h-[calc(100vh-56px)] overflow-hidden`)
      con scrollers internos. Medido por aritmética sobre el código (no en un navegador): el layout ocupa
      y=56..100vh y la barra fija cubre los últimos 56px + inset de ese rango, así que en reposo las
      últimas filas de la lista de clientes y el final de la ficha quedan DEBAJO de la barra; sólo se
      revelan encadenando el scroll al documento (que mide 100vh + 56px + inset). Nadie lo midió: el
      review (17 hallazgos), los candados estáticos y el guion de UAT (bloque A.3) cubren Finanzas,
      Negocio, Configuración y el final de Más, pero no /clients. El único barrido de "ancla al borde
      inferior" (candado 8) busca `sticky|fixed bottom-*`, y esto no es eso: es un alto calculado.
    artifacts:
      - path: "app/(dashboard)/clients/clients-client.tsx"
        issue: "línea 731: `h-[calc(100vh-56px)] lg:h-screen overflow-hidden` no descuenta el alto de la barra; listRef (852) y el detalle (918) scrollean dentro de ese alto"
      - path: "app/(dashboard)/clinical-history/clinical-history-client.tsx"
        issue: "línea 32: mismo patrón de alto bloqueado al viewport (ruta sin enlace desde el menú, alcanzable por URL)"
    missing:
      - "Descontar el alto del chrome fijo en esos dos layouts, con el mismo token y el mismo `lg:` simétrico que ya usan <main> y /web (p. ej. `h-[calc(100vh-56px-var(--panel-nav-h)-env(safe-area-inset-bottom,0px))] lg:h-screen`)"
      - "Extender el candado 8 de test/panel-nav-chrome.test.ts: ningún `h-[calc(100vh-...)]` bajo app/(dashboard) sin var(--panel-nav-h) antes de `lg:`"
      - "Sumar /clients (final de la lista y final de la ficha, con la barra presente) al bloque A.3 del guion de UAT"
behavior_unverified_items: []
human_verification:
  - test: "A.1 Franja de gestos en un iPhone con notch"
    expected: "El bg-card de la barra cubre la zona de gestos y el último label no queda debajo; en Android no hay hueco ni doble reserva"
    why_human: "env(safe-area-inset-bottom) vale 0 en Android y en todo emulador headless; sólo un iPhone real lo ve. (La wave 1 lo confirmó en UN teléfono con una captura del dueño; el resto de las pantallas no.)"
  - test: "A.2 Teclado abierto en Android Chrome Y iOS Safari (Finanzas largo + drawer de alta de turno, enfocando el último campo)"
    expected: "La barra no se ve ni tapa el campo ni el submit; al cerrar el teclado vuelve sin que el contenido salte"
    why_human: "Exigido por el criterio 3 del ROADMAP ('lo prueba en el teléfono'). interactiveWidget='resizes-visual' es el default y está declarado, pero iOS Safari desplaza el layout viewport por su cuenta; este repo ya pagó 4 quicks de teclado"
  - test: "A.3 Nada tapado: botones de alta de Finanzas, footers de Negocio y Configuración, final de Más (firma) y — AÑADIDO por esta verificación — final de la lista y de la ficha en /clients"
    expected: "Todo completamente visible y alcanzable con el pulgar con la barra presente, sin tener que encadenar el scroll al documento"
    why_human: "Requiere layout real con teclado/URL bar del navegador; la sospecha de /clients está en gaps"
  - test: "A.4 Tres pasadas de contraste: forjo claro, spa claro paleta clay, modern claro paleta amber"
    expected: "Foco visible, activo distinguible del inactivo, eyebrow de grupo de Más legible (5.02:1 el peor caso medido)"
    why_human: "Los números salen de cálculo (spa/modern usan color-mix, aproximado); el criterio de diseño es visual. Ojo: la línea de plan del bloque de identidad (WR-05) sigue en --muted-foreground y da 3.41:1 en spa claro — mirarla en esa pasada"
  - test: "A.5 UAT de v0.30 repetida DESDE LA BARRA"
    expected: "sección -> atrás del sistema -> Inicio; el atrás cierra overlay/selector/calendario/teclado antes de navegar; cambios sin guardar preguntan antes de descartar; tocar el destino actual con subsección abierta la cierra en vez de apilar"
    why_human: "Es el criterio 6 en su parte conductual: el modo de falla del historial es silencioso (atrás muerto, expulsión del sitio) y el repo ya tuvo 7 bugs que sólo apareció en un teléfono. El mecanismo está intacto por diff vacío, pero la conducta desde el nuevo origen (barra y /mas) no se miró"
  - test: "C Inventario de Más rubro por rubro en pantalla (salud 8, belleza 8, general 8, canchas 7) + CUENTA (Ayuda, Ver mi página en pestaña nueva, Cerrar sesión) + bloque de identidad (nombre >=40 caracteres, firma alcanzable, logout con su rama de error)"
    expected: "Coincide con el inventario computado; barra dice Pacientes en salud y Reservas en canchas; ningún label truncado, con el eje de las 5 familias (mínimo geometrica y bauhaus con el ítem activo)"
    why_human: "El inventario está probado puro (4 verticales), pero que el VerticalProvider entregue el rubro correcto en runtime y que los labels se lean bien sólo se ve abriendo las cuentas en un teléfono"
  - test: "D Header de dos líneas + menú único"
    expected: "Línea 2 cambia por sección y por terminología (Pacientes/Reservas); 'Inicio' en la raíz (el sidebar desktop sigue diciendo Dashboard a propósito); nombre largo trunca; el header orienta a mitad de un formulario; NO hay botón de menú en ninguna pantalla mobile; lector de pantalla anuncia cada fila bajo su grupo y los dos landmarks tienen nombres distintos"
    why_human: "Terminología en runtime, lector de pantalla y orientación a mitad de scroll no se ven con grep"
  - test: "E.1 Banda de 900px y desktop >=1024px"
    expected: "A 900px: barra y header presentes, sin botón de menú. A >=1024px: cero barra, cero header mobile, sidebar idéntico, sin padding inferior extra y 'Cerrar sesión' del sidebar funcionando (es el único onClick que sobrevive y ningún gate lo ejecuta)"
    why_human: "Comparación visual contra el desktop de hoy; el logout es el único camino de código no ejecutado por tests"
  - test: "E.2 <meta name=viewport> servido en /dashboard y /admin"
    expected: "/dashboard trae `viewport-fit=cover, interactive-widget=resizes-visual`; /admin sigue con `width=device-width, initial-scale=1` y nada más"
    why_human: "El plan 02-04 sólo midió 4 de 6 rutas (/, /[slug], /login, /mas); las otras dos devolvieron 307 sin sesión. Evidencia estática: un único `export const viewport` en todo app/, en app/(dashboard)/layout.tsx, que verifiqué por grep"
---

# Phase 2: La barra inferior y Más — Informe de verificación

**Objetivo de la fase (ROADMAP):** que en el celular el panel se navegue desde una barra inferior fija con `Inicio · Turnos · Agenda · Clientes · Más` —por encima de la zona de gestos y sin tapar contenido de ninguna pantalla— y que Más contenga el resto del menú del negocio, agrupado como hoy y sin perder ni una fila; con el mecanismo de historial intacto y el desktop idéntico.

**Verificado:** 2026-10-09 · **Base de la fase:** `49fa195` · **HEAD:** `5b8327d`
**Estado:** `gaps_found` (un gap acotado de código sobre el criterio 3, más 9 ítems de UAT humana que de todos modos son obligatorios)
**Re-verificación:** No — verificación inicial

> Nota de lectura. La expectativa del orquestador era `human_needed`. Termina en `gaps_found` porque el árbol de decisión da precedencia a los gaps de código, y encontré uno real que el pipeline verde, el code review y el guion de UAT no cubren. **Es un gap chico (una clase CSS en dos archivos + un candado)**, no un problema de arquitectura: el resto de la fase se sostiene y, una vez cerrado, el estado esperado es `human_needed` con la lista de abajo.

## Qué verifiqué yo (no copiado de los SUMMARY)

| Comando / lectura | Resultado |
|---|---|
| `npx vitest run` | rc 0 · `Test Files 107 passed (107)` · `Tests 1682 passed \| 4 expected fail \| 1 skipped (1687)` (reloj 02:34 AR, dentro de la ventana de los canarios) |
| `./node_modules/.bin/tsc --noEmit` | rc 0, sin líneas `error TS` |
| `eslint` sobre los 8 archivos nuevos/tocados de `components/` y `app/(dashboard)/mas` + los 2 tests | rc 0 |
| `git diff 49fa195..HEAD --stat -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts` | **vacío** |
| `grep pushState\|replaceState\|history.back\|history.go` sobre barra, header, nav-groups y `/mas` (descontando comentarios) | **0 hits** |
| `grep TBD\|FIXME\|XXX` en todos los archivos de la fase | 0 hits |
| Mutación propia: `lg:hidden` -> `md:hidden` en la barra, corrí `test/panel-nav-chrome.test.ts` | **rojo** (`la barra se esconde en lg y NO en el breakpoint intermedio`); revertí con `git checkout --`, working tree limpio |
| CSS del build (`.next/static/chunks/*.css`) | existen `height:var(--panel-nav-h)`, `padding-bottom:calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px))` y `padding-bottom:env(safe-area-inset-bottom,0px)` ⇒ las clases arbitrarias SÍ generan CSS (la trampa del espacio no mordió) |
| `grep export const viewport` en `app lib components` | **1 solo hit**: `app/(dashboard)/layout.tsx:36` (`viewportFit:'cover'`, `interactiveWidget:'resizes-visual'`); `app/layout.tsx` no exporta ninguno |
| Lectura completa de `nav-groups.ts`, `panel-bottom-nav.tsx`, `panel-top-bar.tsx`, `mas-client.tsx`, `mas/page.tsx`, `layout.tsx`, `sidebar.tsx` (+ diff), `globals.css`/`themes.css` (+ diff) | ver tablas |

Lo que **no** repetí: la sonda headless de 80 pasadas (geometría 75×56 @375 / 64×56 @320); la geometría sale trivialmente de `h-[var(--panel-nav-h)]` (3.5rem) con `flex-1` sobre 5 hijos, y no tengo sesión real para montar la pantalla.

## Verdades observables (criterios de éxito del ROADMAP)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | La barra existe y navega en todas las pantallas y rubros; activo con `aria-current` además del color; labels de la terminología del vertical; 375px sin truncar | ✓ VERIFICADO en código (la parte en pantalla va a UAT) | `panel-bottom-nav.tsx`: `DESTINOS` = `/dashboard`, `/appointments`, `/agenda`, `/clients`, `/mas`; `aria-current={active ? 'page' : undefined}` + indicador 4×24 en `bg-foreground` + peso 600; labels 2 y 4 leen `useTerminology()` (`t.appointments`, `t.clients`); `truncate` presente como red. Montada en `layout.tsx` como hermana del Sidebar. Nota: el peor label medido es `Pacientes` (53px), no `Reservas`; los SUMMARY lo corrigieron. Un teléfono real solo confirmó que navega (wave 1) |
| 2 | Zona segura real: `viewport-fit=cover` sólo en el export `viewport` de `(dashboard)/layout.tsx`; destinos ≥44×44 | ✓ VERIFICADO (con un hueco declarado) | Único `export const viewport` del árbol, en el layout correcto; 3 `env(safe-area-inset-*)` con fallback `0px`; el plan 02-04 midió el `<meta>` servido en `/`, `/[slug]`, `/login` (sin cambios) y `/mas` (con las dos claves). **`/dashboard` y `/admin` NO se midieron servidos** (307) → E.2. Área táctil: 75×56 / 64×56 según la sonda del 02-04 |
| 3 | Nada queda tapado: alto reservado en UN solo lugar incluyendo el inset; último elemento alcanzable; teclado decidido y probado en el teléfono | ✗ **PARCIAL — gap** | Reserva en `<main>` ✓, `lg:pb-0` simétrico ✓, `/web` arreglado por CR-01 (`sticky bottom-[calc(var(--panel-nav-h)+…)] lg:bottom-0`) ✓, perilla del teclado declarada (`resizes-visual`, default de la plataforma) ✓. **Pero `/clients` y `/clinical-history` quedan con su final bajo la barra** (ver Gaps). Teclado: decidido en código, **no probado en un teléfono** (A.2) |
| 4 | Más reproduce el inventario exacto: 8/8/8/7 filas, sin grupo vacío, + Ayuda / Ver mi página (pestaña nueva) / Cerrar sesión | ✓ VERIFICADO en código | `nav-groups.ts` extraído (con `NAV_GROUPS` y `buildNavGroups` sin la directiva de cliente); `mas-client.tsx` resta por **href** con `EN_LA_BARRA = {/dashboard,/appointments,/agenda,/clients}` (cuatro valores, no cinco keys → sin "Pacientes" duplicado en salud) y descarta grupos vacíos después de restar; grupo `CUENTA` con `<Link href="/ayuda">`, `<a target="_blank" rel="noopener noreferrer">` y `<button>` de logout con `signOut()` + rama de error. `test/panel-nav-groups.test.ts` (25 casos) afirma 12/12/12/11 → 8/8/8/7 en los 4 verticales; el candado WR-01 ata `EN_LA_BARRA` a `DESTINOS` por igualdad de conjuntos. Rubro por rubro **en pantalla**: no mirado (C) |
| 5 | Desktop idéntico y un solo menú en mobile | ✓ VERIFICADO en código | `sidebar.tsx`: `hidden lg:flex lg:flex-col lg:fixed … lg:w-60 … z-20` intacto; el diff elimina sólo `useState`, `mobileOpen`, header, overlay y drawer (+ los `onClick={() => setMobileOpen(false)}` de los links, inertes en desktop). `grep mobileOpen` fuera del CRM = 0. Barra y header con `lg:hidden` (cero `md:hidden`, candado con mutación propia). `<main>`: `pt-14 lg:pt-0 … pb-[…] lg:pb-0`. Mobile queda con UN camino de entrada. Comparación visual del desktop y el logout del sidebar: E.1 |
| 6 | Historial intacto y auditable | ✓ VERIFICADO | Diff vacío sobre los tres módulos (arriba); cero mutaciones crudas de historial en los componentes nuevos; barra y `/mas` usan `panelNavMode({from:pathname,to})` y `consumeOwnedPanelEntry()` con el orden `requestNavigation` -> `active && consume` idéntico al sidebar; suites de la Phase 1 verdes dentro de las 107. La conducta desde el nuevo origen (A.5) **no se miró en un teléfono** |

### Gap en detalle — criterio 3 (`/clients`, `/clinical-history`)

`<main>` reserva `56px + inset` de padding inferior, pero `app/(dashboard)/clients/clients-client.tsx:731` es

```
-m-4 sm:-m-6 lg:-m-8 flex h-[calc(100vh-56px)] lg:h-screen overflow-hidden
```

Los márgenes negativos anulan el `p-4` del wrapper, así que el layout ocupa de y=56 a y=100vh. La barra (`fixed bottom-0`, 56px + inset) tapa el tramo final de ese rango **en reposo**: las últimas filas de la lista (`listRef`, 852) y el final de la ficha (918) viven dentro de scrollers internos que terminan bajo la barra. El documento sí mide `100vh + 56 + inset`, así que el contenido es *alcanzable* encadenando el scroll al documento (por eso no lo marco como pérdida total) — pero ése es exactamente el doble scroll torpe que el criterio 3 existe para evitar, y es la pantalla que el dueño usa todos los días (Clientes está en la barra). El mismo patrón está en `clinical-history-client.tsx:32` (alcanzable sólo por URL, hallazgo WR-08).

Por qué se escapó: el candado 8 barre `sticky|fixed bottom-*`, y esto es un alto calculado; el code review no lo listó entre sus 17 hallazgos; el guion de UAT pide mirar Finanzas, Negocio, Configuración y Más, no Clientes. Es una **conclusión por aritmética sobre el código, sin medición en navegador** — la UAT de A.3 la confirma o la descarta en 30 segundos.

Fix de una línea por archivo (ver `gaps.missing` en el frontmatter), con el mismo token y el mismo `lg:` simétrico que `<main>` y `/web`.

## Artefactos requeridos

| Artefacto | Esperado | Estado | Detalle |
|---|---|---|---|
| `components/dashboard/nav-groups.ts` | inventario único, sin directiva de cliente | ✓ VERIFICADO | importado por sidebar y `/mas`; el test (entorno node) lo importa directo |
| `components/dashboard/panel-bottom-nav.tsx` | barra de 5 destinos | ✓ VERIFICADO | sustantivo (166 líneas), cableado en `layout.tsx` |
| `components/dashboard/panel-top-bar.tsx` | header de 2 líneas, `lg:hidden`, sin ☰ | ✓ VERIFICADO | 14 títulos; ver WR-08 (`/clinical-history` sin título) |
| `app/(dashboard)/mas/page.tsx` | server component, tenant por `owner_id` | ✓ VERIFICADO | `getUser()` -> `redirect('/login')`; `.eq('owner_id', user.id)`; sin service role, sin queries nuevas |
| `app/(dashboard)/mas/mas-client.tsx` | inventario - barra + CUENTA + identidad + firma | ✓ VERIFICADO | datos fluyen de `buildNavGroups(business)`; sin stubs |
| `app/(dashboard)/layout.tsx` | `viewport` acotado, barra, header, `pb` de reserva | ✓ VERIFICADO | ver criterio 2/3 |
| `app/globals.css`, `app/themes.css` | `--panel-nav-h`, `--panel-nav-muted` | ✓ VERIFICADO | `--panel-nav-h` en `:root, [data-theme='forjo']` ⇒ definido en todos los temas; `--panel-nav-muted` con overrides en modern/spa claro y vuelve al default en oscuro |
| `components/dashboard/sidebar.tsx` | sólo desktop | ✓ VERIFICADO | |
| `test/panel-nav-groups.test.ts`, `test/panel-nav-chrome.test.ts` | candados | ✓ VERIFICADO | verdes; una mutación propia los puso en rojo; el segundo no vigila el hueco del criterio 3 |

## Key links

| Desde | Hacia | Vía | Estado |
|---|---|---|---|
| `layout.tsx` | `PanelBottomNav` / `PanelTopBar` | hermanos del `<Sidebar>` dentro de `UnsavedChangesProvider` + `VerticalProvider` | ✓ WIRED |
| barra / `/mas` | `panel-history` | `panelNavMode` + `consumeOwnedPanelEntry`, guard `requestNavigation` primero | ✓ WIRED (T-5) |
| `mas-client` | `nav-groups` | `buildNavGroups(business)` (no reimplementa el filtro) | ✓ WIRED |
| barra | provider de terminología | `useTerminology()` | ✓ WIRED (runtime sin mirar) |
| `<main>` pb / barra h / `/web` sticky | `--panel-nav-h` | misma var en tres sitios | ✓ WIRED; **no** en `clients`/`clinical-history` |

## Data-flow (Nivel 4)

`MasClient` <- `business` de `select('*')` por `owner_id` (consulta real, no estática) <- `buildNavGroups` <- `resolveVertical(business).menu`. Los labels de la barra y del header vienen del `VerticalProvider` montado en el layout. Todo FLOWING; sin props vacías ni fallbacks estáticos.

## Cobertura de requisitos

| Requisito | Planes que lo declaran | Descripción | Estado | Evidencia |
|---|---|---|---|---|
| MOB-01 | 02-01, 02-03, 02-04 | Barra fija con 5 destinos y activo señalado | ✓ SATISFECHO en código | criterio 1; confirmación en pantalla de los 5 labels/estados pendiente (C, D) |
| MOB-02 | 02-01, 02-04 | Zona segura + áreas táctiles 44×44 + no tapa contenido | ⚠ **PARCIAL** | zona segura y áreas ✓ (franja de gestos confirmada una vez en un teléfono); "no tapa contenido" ✗ en `/clients` (gap) |
| MOB-03 | 02-02, 02-04 | Más = menú resuelto - barra, agrupado, sin perder destinos | ✓ SATISFECHO en código | criterio 4; 4 verticales por test |
| MOB-07 | 02-01, 02-03, 02-04 | Desktop sin cambios | ✓ SATISFECHO en código | criterio 5; visual en E.1 |

Sin huérfanos: `REQUIREMENTS.md` mapea exactamente MOB-01/02/03/07 a la Phase 2 y los cuatro aparecen en el `requirements:` de algún plan. MOB-04/05/06 pertenecen a la Phase 3 y MOB-08/09 a la Phase 4 (no esperados acá).

⚠ **Bookkeeping adelantado:** `REQUIREMENTS.md` ya marca MOB-01/02/03/07 como `[x]` / "Complete (2026-10-08)" y el cierre de la fase está escrito en STATE/ROADMAP, pero la UAT que el propio plan define como "el único criterio que vale" no corrió y MOB-02 tiene el gap de arriba. Conviene revertir MOB-02 a pendiente hasta cerrarlo. Además, la sección "Plans" del ROADMAP tiene las 4 entradas duplicadas (4 tildadas + 4 descripciones sin tildar) y la tabla de progreso dice "In Progress" — cosmético.

## Anti-patrones y hallazgos del review no corregidos

Sin marcadores de deuda (`TBD|FIXME|XXX`) ni stubs en los archivos de la fase. De los 17 hallazgos del review, 4 se arreglaron (CR-01, CR-02, WR-01, WR-02; los verifiqué en el código y en los tests). Los 13 restantes siguen abiertos; los que tocan el objetivo de la fase:

| Hallazgo | Severidad | Impacto sobre el objetivo |
|---|---|---|
| **WR-07** `/mas` sin gate de viewport | ⚠ Warning | A >=1024px la ruta renderiza un segundo menú junto al sidebar y sin título visible (el `h1` es `sr-only` y el header es `lg:hidden`). Sólo alcanzable por URL o al ensanchar la ventana. No viola "sidebar idéntico" pero sí la limpieza de "un solo menú" en desktop |
| **WR-13** `--font-geist-mono` no existe | ⚠ Warning (preexistente en el sidebar) | El eyebrow de grupo de Más nunca pinta mono (hereda la sans del negocio); el contrato de diseño pedía mono. Medido con probe de navegador en 02-04 |
| **WR-05** línea de plan en `--muted-foreground` | ⚠ Warning | 3.41:1 sobre `--card` en spa claro (5 de 40 combinaciones); arreglo de una palabra |
| **WR-08** `/clinical-history` sin título ni activo | ⚠ Warning | Ruta viva sin chrome orientador; ver también el gap de altura |
| WR-03, WR-04, WR-06, WR-09, WR-10, WR-11, WR-12, WR-14, WR-15 | ℹ Info/Warning menor | `slugDeGrupo` frágil; `select('*')` serializado al cliente; `alt` duplicado en el logo; label vacío sin red; restos del drawer; exports sin consumidor; filas pegadas (0px vs 8px del contrato); candado de espacios sin cobertura de `mas-client`; sin guarda ante key duplicada. Ninguno rompe el objetivo hoy |

Otros apuntes (no bloquean): `/mas` no está en `KNOWN_PREFIXES` de `lib/auth/route-lists.ts`, igual que `/agenda`, `/abonos`, `/servicios`, `/equipo`, `/negocio`, `/web`, `/ayuda` y `/consultorios` (decisión T-02-05 documentada y consistente con el resto); el panel puede quedar con la sesión sin refrescar por el borde en esas rutas, pero el layout igual valida con `getUser()`. `eslint` sobre `app/(dashboard)/layout.tsx` sigue en rc 1 por `react-hooks/purity` (`Date.now`), **preexistente en `49fa195`** y registrado en `deferred-items.md` / WINDOWS #8.

## Lo que sigue sin verificar en una pantalla (no tratado como verificado)

Sólo la wave 1 se miró en un teléfono real, y sólo dos cosas: la franja de gestos pintada por el `bg-card` (evidencia de que `viewport-fit=cover` tomó efecto) y que Turnos/Agenda/Clientes naveguen con el indicador correcto. **Todo lo demás está sin mirar:** `/mas` entera y su inventario por rubro, el header de dos líneas y su terminología en runtime, el **teclado abierto en los dos motores**, las tres pasadas de contraste, los touch targets medidos en el DOM real, la banda de 900px, el desktop con su logout, el lector de pantalla y la conducta del atrás desde el nuevo origen. El guion completo está en `02-04-SUMMARY.md` (bloques A-E) y consolidado en `WINDOWS.md` #11 (que reemplaza a #9 y #10). La lista de `human_verification` del frontmatter es ese guion + el ítem añadido por esta verificación.

## Resumen de gaps

Hay **un** gap de código, acotado: las dos pantallas con layout bloqueado al viewport no descuentan el alto de la barra, así que en `/clients` (la pantalla de uso diario) el final de la lista y de la ficha nacen debajo de la barra y sólo se alcanzan encadenando el scroll al documento. Es el mismo defecto de familia que CR-01 (`/web`), con otra forma, y los candados no lo ven. El cierre es un `--gaps` plan chico (2 clases CSS + 1 caso de candado + 1 línea en el guion de UAT). Todo lo demás de la fase se sostiene contra el código: inventario 8/8/8/7 exacto, historial con diff vacío y cero escrituras crudas, desktop sin tocar, un solo menú en mobile, viewport acotado al route group, y los candados nuevos muerden con mutación propia.

Una vez cerrado el gap, el estado esperado y correcto es `human_needed` por los 9 ítems de arriba; la fase no debería cerrarse apoyándose en el verde del pipeline.

---

_Verificado: 2026-10-09_
_Verificador: Claude (gsd-verifier)_
