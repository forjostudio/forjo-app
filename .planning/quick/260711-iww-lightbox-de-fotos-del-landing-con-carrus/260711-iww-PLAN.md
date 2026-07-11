---
phase: 260711-iww-lightbox-de-fotos-del-landing-con-carrus
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/landing/lightbox.ts
  - lib/landing/lightbox.test.ts
  - app/globals.css
  - components/landing/photo-lightbox.tsx
  - components/landing/landing-renderer.tsx
  - components/landing/gallery.tsx
  - components/landing/rsv-strip.tsx
  - components/landing/about.tsx
autonomous: true
requirements: [LB-01, LB-02, LB-03, LB-04]
user_setup: []

must_haves:
  truths:
    - "Al tocar una foto de la galería se abre un visor a pantalla completa con esa foto centrada; las fotos vecinas ASOMAN atenuadas (peek) a los costados."
    - "En celular se pasa de foto con swipe nativo (scroll-snap), sin handler de drag; la primera y la última foto también se centran."
    - "El botón 'atrás' del celular CIERRA el visor (no saca al usuario del sitio): al abrir se pushea una entrada de historial CON HASH."
    - "La X cierra UNA sola vez: el click no burbujea al backdrop, así que nunca se disparan dos history.back() seguidos (el usuario nunca sale de la página)."
    - "También se amplían las fotos destacadas: el strip de la reserva (rsv) y la foto única de about (lightbox de 1 ítem)."
    - "El visor cierra con X, click en el backdrop y tecla Esc; abre con foco en la X y devuelve el foco a la foto que lo abrió."
    - "Con prefers-reduced-motion: reduce el carrusel sigue funcionando pero sin transiciones de scale/opacity ni scroll suave."
    - "El widget de reserva sigue siendo caja negra: el visor se portalea a document.body y NUNCA envuelve <section id=\"reservar\">; vaul/sonner/react-day-picker intactos."
    - "npx tsc --noEmit, npm run build, npm run lint y npx vitest run pasan sin regresión, con CERO dependencias npm nuevas."
  artifacts:
    - path: "lib/landing/lightbox.ts"
      provides: "Helpers PUROS + constantes del contrato de data-attributes (grupo/src/hash de historial)"
      exports: ["LIGHTBOX_HASH", "LIGHTBOX_GROUP_ATTR", "LIGHTBOX_SRC_ATTR", "wrapIndex", "centeredScrollLeft", "shouldConsumeHistoryEntry"]
      min_lines: 30
    - path: "lib/landing/lightbox.test.ts"
      provides: "Tests en environment node de los helpers puros (sin DOM, sin deps nuevas)"
      contains: "shouldConsumeHistoryEntry"
    - path: "components/landing/photo-lightbox.tsx"
      provides: "Controlador cliente único: delegación de clicks + overlay portaleado a document.body con carrusel scroll-snap"
      exports: ["PhotoLightbox"]
      min_lines: 80
    - path: "app/globals.css"
      provides: "Capa .frj-lightbox (fuera de .frj-site, porque el overlay se portalea a body): track scroll-snap, peek de vecinas, chrome 44px, reduced-motion"
      contains: "scroll-snap-type"
    - path: "components/landing/landing-renderer.tsx"
      provides: "Monta <PhotoLightbox/> junto a <LandingMotion/> dentro de .frj-site"
      contains: "PhotoLightbox"
  key_links:
    - from: "components/landing/gallery.tsx"
      to: "components/landing/photo-lightbox.tsx"
      via: "las tiles emiten <button data-frj-lightbox='gallery' data-frj-src={src}>; el controlador las captura por delegación"
      pattern: "data-frj-lightbox"
    - from: "components/landing/photo-lightbox.tsx"
      to: "lib/landing/lightbox.ts"
      via: "importa las constantes del contrato y los helpers puros (una sola fuente de verdad de los atributos)"
      pattern: "LIGHTBOX_GROUP_ATTR"
    - from: "components/landing/photo-lightbox.tsx"
      to: "app/globals.css"
      via: "el overlay usa las clases .frj-lightbox / .frj-lb-track / .frj-lb-slide / .frj-lb-frame / .frj-lb-btn"
      pattern: "frj-lb-track"
---

<objective>
Lightbox de fotos del landing público: al tocar una foto de la **galería** o una **foto destacada**
(strip de la reserva, foto de about) se abre un visor a pantalla completa con **carrusel peek**
(scroll-snap nativo), cerrable con X / backdrop / Esc / **botón atrás del celular**.

Purpose: hoy las fotos del landing no se pueden ampliar. El visor es la pieza que falta para que la
galería sirva de verdad (mirar el local, los trabajos) antes de reservar.

Output: un controlador cliente único (`photo-lightbox.tsx`) montado dentro de `.frj-site`, helpers
puros testeados (`lib/landing/lightbox.ts`), una capa CSS nueva (`.frj-lightbox`) y las 3 secciones
RSC emitiendo botones-trigger con data-attributes. Cero dependencias nuevas, el booking intacto.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.claude/CLAUDE.md

Estado actual (leído durante el planning, NO hace falta re-leerlo entero):
- `components/landing/gallery.tsx`, `rsv-strip.tsx`, `about.tsx` son **RSC puros** (sin `'use client'`).
  Las tiles son `<div>` con `frj-zoom lift relative overflow-hidden rounded-[12px]` + `<Image fill>`.
- `components/landing/landing-motion.tsx` es el ÚNICO client component del árbol: un controlador
  global montado una vez en `.frj-site` que **no renderiza DOM** (`return null`) y trabaja sobre el
  markup del server vía `querySelectorAll`. **Este plan replica ese patrón** para el lightbox.
- `components/landing/landing-renderer.tsx` monta `<LandingMotion level={motionLevel} />` como primer
  hijo de `<main className="frj-site" data-motion={...}>`.
- `app/globals.css`: capa `LANDING PREMIUM` scopeada a `.frj-site` (tokens `--frj-*`, `.frj-reveal`,
  `.frj-zoom`, `.lift`, `.frj-gallery-grid`, `@media (prefers-reduced-motion: reduce)` al final).
- `vitest.config.mts` corre **`environment: 'node'`**: NO hay jsdom ni Testing Library, y la regla del
  repo es **cero paquetes npm nuevos**. Convención ya establecida (ver `components/crm/confirm-dialog.test.tsx`):
  **la lógica testeable se extrae a helpers PUROS** y se testea en node; el render se valida con
  `tsc` + `lint` + `build` + revisión visual.
</context>

<decisiones_lockeadas>
Estas decisiones vienen del usuario y son **lecciones ya sufridas en producción** (el CMS hermano
`webs-cms-forjostudio` tiene los dos bugs). NO re-litigar, NO "mejorar", NO copiar verbatim de allá.

- **D-01 — Carrusel peek, no una foto suelta.** Track con `scroll-snap-type: x mandatory`, slides con
  `scroll-snap-align: center`. Vecinas atenuadas (`opacity:.35; transform:scale(.92)`), activa
  (`opacity:1; transform:none`). El swipe en celular **sale gratis** (scroll nativo): PROHIBIDO
  agregar touch/drag handlers.
- **D-02 — `padding-inline: calc((100% - var(--frj-lb-cardw)) / 2)` en el track.** Sin esto la PRIMERA
  y la ÚLTIMA foto no pueden centrarse.
- **D-03 — Ancho del slide.** `--frj-lb-cardw` ≈ **80vw mobile / 58vw desktop**. Gotcha: una foto
  vertical la limita el `max-height`, así que un slide **muy ancho** la deja centrada con aire a los
  costados y **tapa el peek** (parece que no funciona). Se ajusta `--frj-lb-cardw` hasta que se vea el
  pedacito de la vecina (validación humana, Task 3).
- **D-04 — `history.pushState` CON HASH (`#foto`).** Si se pushea la MISMA URL sin hash, el router la
  colapsa, NO crea entrada de historial, y el "atrás" del celular **saca al usuario del sitio**.
- **D-05 — La X no cierra dos veces.** El backdrop cierra con `onClick`; el click en la X (y en la
  figura de la foto y en las flechas) **burbujea** al backdrop → cierre doble → dos `history.back()` →
  **el usuario sale de la página**. `stopPropagation()` en X, figura y flechas, + cierre **idempotente**
  por ref.
- **D-06 — Alcance:** galería + strip de la reserva + foto de about (lightbox de 1 ítem). El **hero NO**
  (es fondo/LCP, no se toca).
- **D-07 — Booking = CAJA NEGRA.** El overlay es `position: fixed` **portaleado a `document.body`** →
  jamás es ancestro de `<section id="reservar">`. Ningún ancestro del widget recibe transform/overflow/
  filter/perspective. A las fotos solo se les agregan atributos y el cambio `<div>` → `<button>`.
- **D-08 — Cero dependencias npm nuevas** (scroll-snap + IntersectionObserver + createPortal, todo nativo).
</decisiones_lockeadas>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Helpers puros del lightbox + contrato de data-attributes (testeados en node)</name>
  <files>lib/landing/lightbox.ts, lib/landing/lightbox.test.ts</files>
  <read_first>
    - `components/crm/confirm-dialog.test.tsx` (líneas 1-20): la convención del repo para testear
      lógica de un client component SIN DOM ni deps nuevas (helpers puros exportados + environment node).
    - `lib/landing/write.test.ts` (primeras 20 líneas): estilo de tests en `lib/landing/`.
  </read_first>
  <behavior>
    - `wrapIndex(3, 3)` → `0`; `wrapIndex(-1, 3)` → `2`; `wrapIndex(1, 3)` → `1`; `wrapIndex(0, 0)` → `0`
      (len 0 no debe dividir por cero ni devolver NaN).
    - `centeredScrollLeft({ slideOffsetLeft: 500, slideWidth: 300, trackWidth: 1000 })` → `150`
      (el scrollLeft que deja el slide centrado en el track: `offsetLeft + w/2 - trackW/2`).
    - `centeredScrollLeft` nunca devuelve negativo (clamp a 0) — el primer slide con padding-inline ya
      queda centrado en scrollLeft 0.
    - `shouldConsumeHistoryEntry({ frjLightbox: true })` → `true` (hay que consumir la entrada empujada).
    - `shouldConsumeHistoryEntry(null)`, `shouldConsumeHistoryEntry({})`, `shouldConsumeHistoryEntry({ frjLightbox: false })`,
      `shouldConsumeHistoryEntry(undefined)` → `false` (NUNCA llamar `history.back()` sin nuestra marca:
      ese es el camino que saca al usuario del sitio).
    - Las constantes exportadas son estables: `LIGHTBOX_HASH === '#foto'`,
      `LIGHTBOX_GROUP_ATTR === 'data-frj-lightbox'`, `LIGHTBOX_SRC_ATTR === 'data-frj-src'`.
  </behavior>
  <action>
    Crear `lib/landing/lightbox.ts`: módulo PURO (sin React, sin `window`, sin imports del framework)
    con el contrato compartido entre las secciones RSC y el controlador cliente.

    Exportar:
    - `LIGHTBOX_HASH = '#foto'` — el hash que se pushea al historial (D-04).
    - `LIGHTBOX_GROUP_ATTR = 'data-frj-lightbox'` — atributo que marca una foto ampliable y nombra su
      grupo/carrusel.
    - `LIGHTBOX_SRC_ATTR = 'data-frj-src'` — atributo con la URL de la foto en tamaño visor.
    - `type LightboxGroup = 'gallery' | 'rsv' | 'about'`.
    - `wrapIndex(i: number, len: number): number` — índice circular seguro (len 0 → 0).
    - `centeredScrollLeft({ slideOffsetLeft, slideWidth, trackWidth }): number` — scrollLeft que centra
      un slide dentro del track; clamp a 0.
    - `shouldConsumeHistoryEntry(state: unknown): boolean` — true SOLO si el `history.state` lleva
      nuestra marca `frjLightbox === true`. Narrowing manual (`typeof state === 'object' && state !== null &&
      'frjLightbox' in state && (state as {frjLightbox?: unknown}).frjLightbox === true`), sin `any`
      (tsconfig strict).

    Comentarios en **español del POR QUÉ**, obligatorios:
    - Por qué las constantes viven acá y no inline en cada sección: son el **contrato** entre 3 RSC y
      1 client component; duplicar los strings garantiza drift silencioso (una sección deja de abrir).
    - Por qué existe `shouldConsumeHistoryEntry` como helper puro y no un `if` inline: es la guarda del
      bug de D-05 (dos `history.back()` seguidos sacan al usuario de la página) y necesita test.
    - Por qué helpers puros: `vitest.config.mts` corre `environment: 'node'`, no hay jsdom ni Testing
      Library y la regla del repo es cero deps nuevas (misma resolución que `confirm-dialog.test.tsx`).

    Crear `lib/landing/lightbox.test.ts` con los casos del bloque `<behavior>` (uno por `it`), usando
    `import { describe, it, expect } from 'vitest'`. Escribir los tests PRIMERO (deben fallar), después
    implementar hasta verde.
  </action>
  <verify>
    <automated>npx vitest run lib/landing/lightbox.test.ts</automated>
  </verify>
  <done>
    `npx vitest run lib/landing/lightbox.test.ts` pasa con todos los casos del `<behavior>` en verde, y
    `npx tsc --noEmit` no reporta errores nuevos. Ninguna dependencia npm agregada.
  </done>
</task>

<task type="auto">
  <name>Task 2: Capa CSS .frj-lightbox + controlador cliente PhotoLightbox montado en el renderer</name>
  <files>app/globals.css, components/landing/photo-lightbox.tsx, components/landing/landing-renderer.tsx</files>
  <read_first>
    - `components/landing/landing-motion.tsx` (archivo completo): el patrón EXACTO a replicar —
      client component global, montado una vez en `.frj-site`, que opera sobre el markup del server por
      `querySelectorAll` y no arrastra las secciones al bundle.
    - `app/globals.css` líneas 470-611: el bloque de motion, para ubicar el nuevo bloque DESPUÉS y
      respetar el estilo de comentarios / uso de `rgb()` en scrims y sombras.
    - `components/landing/landing-renderer.tsx` líneas 170-180: dónde se monta `<LandingMotion/>`.
  </read_first>
  <action>
    **(a) `app/globals.css` — bloque nuevo AL FINAL del archivo**, con cabecera de comentario en español:

    Documentar en la cabecera: este bloque vive **FUERA del scope `.frj-site`** a propósito, porque el
    overlay se portalea a `document.body` (así ningún ancestro con transform/overflow lo atrapa, y así
    NUNCA es ancestro del widget de reserva — caja negra, D-07). Documentar también que el scrim y el
    chrome usan `rgb()` translúcido y no tokens de paleta, igual que `.frj-kicker-on-photo` y las
    sombras de `.lift`: un visor de fotos debe ser oscuro en TODA paleta y modo (near-black, nunca
    negro puro). Y que acá se usan **media queries**, no `@container`/`cqw`: el overlay está en `body`,
    fuera del `container-type` de `.frj-site`.

    Clases:
    - `.frj-lightbox` — `--frj-lb-cardw: 80vw` (mobile) y `--frj-lb-gap: 12px`; `position: fixed;
      inset: 0; z-index: 100; display:flex; align-items:center; justify-content:center;`
      `background: rgb(10 10 10 / 0.94);` `overscroll-behavior: contain;`.
      `@media (min-width: 768px) { .frj-lightbox { --frj-lb-cardw: 58vw; } }` (D-03: ver comentario del
      gotcha — si una foto vertical no deja ver el peek de la vecina, se BAJA este valor).
    - `.frj-lb-track` — `position: relative` (para que `offsetLeft` de los slides sea relativo al track,
      que es lo que consume `centeredScrollLeft`); `display:flex; gap: var(--frj-lb-gap); width:100%;`
      `overflow-x:auto; overflow-y:hidden; scroll-snap-type: x mandatory; scroll-behavior: smooth;`
      `padding-inline: calc((100% - var(--frj-lb-cardw)) / 2);` (D-02 — comentar POR QUÉ: sin esto la
      primera y la última foto no pueden centrarse), `overscroll-behavior-x: contain;` y ocultar la
      scrollbar (`scrollbar-width: none;` + `.frj-lb-track::-webkit-scrollbar { display: none; }`).
    - `.frj-lb-slide` — `flex: 0 0 var(--frj-lb-cardw); scroll-snap-align: center; display:flex;
      align-items:center; justify-content:center; margin: 0;` y el **peek** (D-01):
      `opacity: 0.35; transform: scale(0.92); transition: opacity .35s ease, transform .35s ease;`
    - `.frj-lb-slide.is-active` — `opacity: 1; transform: none;`
    - `.frj-lb-frame` — `position: relative; width: 100%; height: 78vh; height: 78dvh;` (la doble
      declaración es el fallback progresivo para navegadores sin `dvh`). Es el contenedor del
      `<Image fill>` con `object-contain`.
    - `.frj-lb-btn` — chrome del visor: `display:inline-flex; align-items:center; justify-content:center;
      min-width:44px; min-height:44px; border-radius:999px;` (touch target ≥44px),
      `color: rgb(255 255 255 / 0.85); background: rgb(255 255 255 / 0.08);`
      transición de color/background 0.2s; `:hover` sube a `rgb(255 255 255)` / `rgb(255 255 255 / 0.16)`;
      `:focus-visible` con `outline: 2px solid rgb(255 255 255 / 0.9); outline-offset: 2px;`
      (estado de foco visible, no negociable).
    - `@media (prefers-reduced-motion: reduce)`: `.frj-lb-track { scroll-behavior: auto; }` y
      `.frj-lb-slide { transition: none; }` — el carrusel SIGUE funcionando (scroll-snap nativo), solo
      se apagan las transiciones (matiz 2). No tocar el `@media` de reduced-motion ya existente: agregar
      uno nuevo dentro del bloque del lightbox.

    **(b) `components/landing/photo-lightbox.tsx` — NUEVO, `'use client'`.** Export: `PhotoLightbox`.
    Importa `createPortal` de `react-dom` y las constantes/helpers de `@/lib/landing/lightbox`.

    Estructura:
    1. Estado: `const [view, setView] = useState<{ images: string[]; index: number } | null>(null)`.
       Refs: `closingRef` (cierre idempotente), `triggerRef` (el `<button>` que abrió, para devolver el
       foco), `trackRef`, `closeBtnRef`.
    2. **Delegación de clicks** (efecto montado siempre, una vez): listener de `click` en `document`.
       En el handler: `const el = (e.target as HTMLElement).closest('[' + LIGHTBOX_GROUP_ATTR + ']')`;
       si no hay, salir. Leer el grupo del atributo; scopear la recolección al `.frj-site` más cercano
       (`el.closest('.frj-site') ?? document`) y juntar en orden de DOM todos los
       `[data-frj-lightbox="<grupo>"]`, mapeando su `data-frj-src`. `index = nodos.indexOf(el)`.
       Guardar `triggerRef.current = el`, `closingRef.current = false`, `setView({ images, index })`.
       Comentar POR QUÉ delegación y no `onClick` por foto: las 3 secciones siguen siendo **RSC** (cero
       árbol al bundle), mismo patrón que `LandingMotion`.
    3. **Historial (D-04)** — efecto que corre solo con `view !== null`:
       `window.history.pushState({ frjLightbox: true }, '', LIGHTBOX_HASH)` al abrir, y un listener de
       `popstate` que **solo** marca `closingRef.current = true` y hace `setView(null)` (NUNCA llama a
       `history.back()`). Comentario obligatorio: **el hash es lo que hace que el router NO colapse la
       entrada**; sin hash no se crea entrada de historial y el "atrás" del celular saca al usuario del
       sitio (bug real del CMS hermano).
    4. **Cierre idempotente (D-05)**: `closeFromUi()` → si `closingRef.current` ya es `true`, return;
       si no, marcar `true`, `setView(null)` y, SOLO si `shouldConsumeHistoryEntry(window.history.state)`,
       llamar `window.history.back()` **una vez**. Comentario obligatorio: dos cierres seguidos = dos
       `history.back()` = el usuario SALE de la página (bug real). Restaurar el foco a
       `triggerRef.current` al cerrar.
    5. **Teclado**: efecto con `keydown` mientras está abierto — `Escape` → `closeFromUi()`;
       `ArrowRight` / `ArrowLeft` → `goTo(index ± 1)`. Trampa de foco mínima: en `Tab`, ciclar entre los
       botones del overlay (`overlayRef.current.querySelectorAll('button')`) con `preventDefault`.
    6. **Scroll lock**: mientras está abierto, guardar y setear `document.body.style.overflow = 'hidden'`;
       restaurar el valor previo al cerrar. Comentar que `overflow` en `body` NO crea containing block
       (no rompe el `position: fixed` de vaul/sonner) — a diferencia de `transform`.
    7. **Posicionamiento inicial y navegación**: `goTo(i)` calcula el slide `trackRef.current.children[i]`
       y setea `trackRef.current.scrollLeft = centeredScrollLeft({ slideOffsetLeft: slide.offsetLeft,
       slideWidth: slide.clientWidth, trackWidth: track.clientWidth })`. Al abrir, posicionar en
       `view.index` con `behavior` instantáneo (setear `scrollLeft` directo, sin `scrollIntoView` — que
       puede scrollear ancestros). Usar `wrapIndex` para las flechas/teclas.
    8. **Slide activo**: un `IntersectionObserver` con `root: trackRef.current` y `threshold: 0.6` que
       agrega/quita `is-active` en los slides (mismo patrón nativo que `LandingMotion`, cero deps).
       Comentar por qué 0.6 alcanza: con cardw 58-80vw, las vecinas nunca superan el 40% de visibilidad.
    9. **Render**: si `view === null` → `null`. Si no, `createPortal(<overlay/>, document.body)` con:
       - raíz `<div className="frj-lightbox" role="dialog" aria-modal="true" aria-label="Visor de fotos"
         onClick={closeFromUi}>` (backdrop).
       - `<button className="frj-lb-btn absolute right-[16px] top-[16px]" aria-label="Cerrar"
         onClick={(e) => { e.stopPropagation(); closeFromUi() }} ref={closeBtnRef}>` con un icono de
         `lucide-react` (`X`) — la librería ya está en el proyecto.
       - flechas prev/next (solo si `images.length > 1`): `.frj-lb-btn absolute left-[12px]/right-[12px]
         top-1/2 -translate-y-1/2`, `aria-label="Anterior"` / `"Siguiente"`, `onClick` con
         `e.stopPropagation()` + `goTo(...)`. Iconos `ChevronLeft` / `ChevronRight`.
       - `<div className="frj-lb-track" ref={trackRef} onClick={(e) => e.stopPropagation()}>` con un
         `<figure className="frj-lb-slide" onClick={(e) => e.stopPropagation()}>` por imagen, cada uno
         con `<div className="frj-lb-frame"><Image src={src} alt="" fill sizes="(min-width: 768px) 58vw, 80vw"
         className="object-contain" loading={i === view.index ? undefined : 'lazy'} /></div>`.
         Usar `next/image` (no `<img>`: lo prohíbe `eslint-config-next/core-web-vitals` y las URLs de
         Supabase ya están en `remotePatterns`).
       - **`stopPropagation()` en X, flechas, track y figura** — es la guarda de D-05, comentarla como tal.
    10. Enfocar `closeBtnRef.current` al abrir (foco al abrir, matiz 4).

    **(c) `components/landing/landing-renderer.tsx`**: importar `PhotoLightbox` y montarlo JUSTO
    DESPUÉS de `<LandingMotion level={motionLevel} />`, como hijo directo de `<main className="frj-site">`.
    `<PhotoLightbox />` no recibe props y no renderiza DOM inline (portalea a `body`). NO tocar el
    `case 'booking'` ni la `<section id="reservar">`: quedan **verbatim**. Agregar un comentario que
    explique que el overlay se portalea a `body`, así que jamás envuelve al widget.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npx vitest run</automated>
  </verify>
  <done>
    `npx tsc --noEmit` limpio, `npm run lint` sin errores nuevos, `npx vitest run` en verde (sin
    regresión). `grep -n "createPortal" components/landing/photo-lightbox.tsx` devuelve ≥1 match.
    `grep -n "scroll-snap-type" app/globals.css` devuelve ≥1 match.
    `grep -n "PhotoLightbox" components/landing/landing-renderer.tsx` devuelve ≥2 matches (import + montaje).
    `grep -n 'section id="reservar"' components/landing/landing-renderer.tsx` sigue devolviendo la línea
    `<section id="reservar" key={i}>` **sin clases nuevas** (caja negra intacta).
    Cero dependencias npm agregadas (`git diff package.json` vacío).
  </done>
</task>

<task type="auto">
  <name>Task 3: Triggers en las 3 secciones RSC (galería, strip de reserva, about) + auditoría caja negra</name>
  <files>components/landing/gallery.tsx, components/landing/rsv-strip.tsx, components/landing/about.tsx</files>
  <read_first>
    - `components/landing/gallery.tsx`, `components/landing/rsv-strip.tsx`, `components/landing/about.tsx`
      (completos): las tiles actuales y sus comentarios de caja negra, que hay que PRESERVAR.
    - `lib/landing/lightbox.ts` (Task 1): las constantes del contrato — importarlas, no hardcodear los
      strings de los atributos.
  </read_first>
  <action>
    Convertir la tile-contenedora de cada foto ampliable de `<div>` a `<button type="button">`,
    **conservando las clases existentes tal cual** (`frj-reveal frj-zoom lift relative overflow-hidden
    rounded-[12px] border ... bg-...`, `wide`, `aspect-[4/3]`, etc.) y agregando:
    - `type="button"` (evita submits fantasma),
    - `data-frj-lightbox="<grupo>"` y `data-frj-src={src}` — **usando las constantes de
      `@/lib/landing/lightbox`** como nombre de prop dinámica (`{[LIGHTBOX_GROUP_ATTR]: 'gallery'}` vía
      spread, o el atributo literal si el spread complica el tipado; lo importante es que el string no
      se duplique a mano en 3 archivos: si se escribe literal, dejar un comentario apuntando a
      `lib/landing/lightbox.ts` como fuente de verdad),
    - `aria-label="Ampliar foto"`,
    - `cursor-pointer` y `p-0` en las clases (Tailwind v4 no le pone cursor pointer a `button` por
      defecto), más `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current`
      (estado de foco visible, WCAG).

    Grupos (D-06): `gallery` en `gallery.tsx`, `rsv` en `rsv-strip.tsx`, `about` en `about.tsx`.

    Detalles por archivo:
    - **`gallery.tsx`**: la tile del `images.map` pasa de `<div className={cn(...)}>` a
      `<button type="button" className={cn(...)}>`. El `cn()` y el `isWide(i) && 'wide'` quedan igual
      (un `<button>` como grid item se "blockifica": `.wide` con `grid-column: span 2` sigue funcionando).
    - **`rsv-strip.tsx`**: además de convertir la tile, **QUITAR el `aria-hidden="true"` del contenedor
      del strip**: con descendientes focuseables adentro, `aria-hidden` es una violación WCAG
      (elemento focuseable dentro de un subárbol oculto para AT) y dispara warning del browser.
      Actualizar el comentario que dice que las fotos son decorativas / sin lightbox: ahora SÍ son
      interactivas. **NO tocar** el `overflow-x-auto` del div del strip ni su relación de hermano con el
      widget (invariante caja negra ya documentada en el archivo).
    - **`about.tsx`**: la foto única pasa a `<button>` (lightbox de 1 ítem: sin flechas, el controlador
      ya las oculta con `images.length === 1`). El `<span>` del tag overlay ("Conocé el espacio") queda
      DENTRO del botón: es contenido no interactivo, sin handler propio.
    - **`hero.tsx` NO se toca** (D-06).

    Actualizar los comentarios de cabecera de las 3 secciones: siguen siendo **RSC sin `'use client'`**;
    el click lo captura por delegación el controlador global `PhotoLightbox` (mismo patrón que
    `LandingMotion`), así que el `<button>` **no lleva `onClick`** y el árbol no se arrastra al bundle.

    **Auditoría caja negra (obligatoria, en el mismo commit)**: confirmar que ningún cambio agregó
    transform/overflow/filter/perspective/position a un ANCESTRO del widget de reserva. Los únicos
    contenedores tocados son las tiles de foto (que ya tenían `overflow-hidden` propio) y el overlay,
    que vive en `document.body` vía portal.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npm run build && npx vitest run</automated>
    <human-check>
      En `npm run dev`, abrir el landing público de un negocio con galería (`/[slug]`):
      1. **Peek (D-03)**: tocar una foto de la galería → se abre el visor con esa foto centrada y las
         vecinas ASOMAN atenuadas a los costados. Repetir con una foto **VERTICAL**: si el aire lateral
         tapa el peek, BAJAR `--frj-lb-cardw` en `app/globals.css` hasta que se vea el pedacito de la
         vecina.
      2. **Primera y última**: abrir la PRIMERA foto y la ÚLTIMA → ambas quedan centradas (no pegadas al
         borde).
      3. **Swipe**: en viewport mobile (DevTools o celular real), pasar de foto con swipe → funciona sin
         drag handler.
      4. **Atrás del celular (D-04)**: con el visor abierto, apretar "atrás" → CIERRA el visor y sigue en
         la página (no sale del sitio).
      5. **X no cierra dos veces (D-05)**: abrir el visor, cerrar con la **X** → vuelve a la página, NO
         navega hacia atrás fuera del sitio. Repetir abriendo/cerrando 3 veces seguidas.
      6. **Esc + backdrop** cierran; el foco vuelve a la foto que abrió el visor.
      7. **Fotos destacadas**: tocar una foto del strip de la reserva y la foto de about → también amplían.
      8. **Booking intacto (D-07)**: en `#reservar`, abrir el calendario (react-day-picker), un drawer en
         mobile (vaul) y provocar un toast (sonner) → todos siguen posicionándose bien.
      9. **Reduced motion**: activar `prefers-reduced-motion: reduce` en DevTools → el carrusel sigue
         funcionando, sin transiciones de scale/opacity ni scroll suave.
    </human-check>
  </verify>
  <done>
    `npx tsc --noEmit`, `npm run lint`, `npm run build` y `npx vitest run` pasan sin regresión.
    `grep -c "data-frj-lightbox" components/landing/gallery.tsx components/landing/rsv-strip.tsx components/landing/about.tsx`
    devuelve ≥1 en cada archivo.
    `grep -n "aria-hidden" components/landing/rsv-strip.tsx` NO devuelve el `aria-hidden="true"` del
    contenedor del strip (fue removido).
    `grep -n 'section id="reservar"' components/landing/landing-renderer.tsx` sigue siendo
    `<section id="reservar" key={i}>` sin clases.
    Los 9 puntos del `<human-check>` verificados por el usuario (incluido el ajuste de `--frj-lb-cardw`
    con una foto vertical).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| `landing_config` (jsonb del negocio) → DOM del landing público | Las URLs de las fotos vienen del config, que hoy escribe la skill/el editor CMS. Se renderizan en `next/image` y ahora también en el `data-frj-src` de un `<button>`. |
| Visitante anónimo → historial del navegador | El visor manipula `history.pushState` / `history.back()` en la sesión del propio visitante. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-IWW-01 | Tampering | `data-frj-src` en las tiles | mitigate | El controlador NO evalúa ni navega a la URL: solo la pasa como `src` a `next/image`, que exige `remotePatterns` en `next.config.ts`. Un src fuera de los patterns falla el render, no ejecuta nada. Además `galleryData`/`rsvData`/`aboutData` ya validan `z.string().url()` en el parse (schema.ts). |
| T-IWW-02 | Denial of Service | `history.pushState` / `history.back()` | mitigate | `shouldConsumeHistoryEntry` (testeado) garantiza que `history.back()` solo corre con NUESTRA marca en el state, y `closingRef` hace el cierre idempotente: nunca dos `back()` seguidos → el usuario nunca es expulsado de la página (D-05). |
| T-IWW-03 | Denial of Service | Widget de reserva (`#reservar`) | mitigate | El overlay se portalea a `document.body` (nunca ancestro del widget) y ningún ancestro del booking recibe transform/overflow/filter. Auditoría explícita en Task 3 + gate de grep sobre `<section id="reservar">`. |
| T-IWW-04 | Information Disclosure | Preview del editor CMS (`/web`) | accept | El mismo controlador corre en el preview del panel. El `pushState` con hash + `back()` idempotente solo agrega/consume UNA entrada sobre la ruta del panel; no navega fuera ni pierde el draft. Riesgo bajo y contenido por T-IWW-02. |
| T-IWW-SC | Tampering | instalaciones npm | mitigate | CERO paquetes nuevos (D-08): scroll-snap, IntersectionObserver, `createPortal` y `lucide-react` ya están en el proyecto. Si el ejecutor necesita instalar algo, PARAR y consultar. |
</threat_model>

<verification>
1. `npx tsc --noEmit` — limpio.
2. `npm run lint` — sin errores nuevos.
3. `npm run build` — el landing público compila (las 3 secciones siguen siendo RSC: `photo-lightbox.tsx`
   es el único client component nuevo).
4. `npx vitest run` — toda la suite en verde, incluidos los tests nuevos de `lib/landing/lightbox.test.ts`.
5. `git diff --stat package.json package-lock.json` — vacío (cero dependencias nuevas).
6. Auditoría caja negra: `<section id="reservar">` en `landing-renderer.tsx` sigue sin clases; el overlay
   se monta por `createPortal(..., document.body)`.
7. Los 9 puntos del `<human-check>` de Task 3 (peek con foto vertical, atrás del celular, X sin doble cierre).
</verification>

<success_criteria>
- Tocar una foto de la galería, del strip de reserva o de about abre un visor a pantalla completa con la
  foto tocada centrada y las vecinas asomando atenuadas.
- El swipe nativo pasa de foto en celular; la primera y la última se centran.
- El botón "atrás" del celular cierra el visor y NO saca al usuario del sitio.
- La X cierra una sola vez (nunca dos `history.back()`).
- Esc y el backdrop cierran; el foco entra en la X y vuelve a la foto al cerrar.
- `prefers-reduced-motion: reduce` apaga las transiciones sin romper el carrusel.
- El widget de reserva sigue funcionando igual (vaul / sonner / react-day-picker).
- tsc + lint + build + vitest en verde, cero dependencias nuevas.
</success_criteria>

<output>
Crear `.planning/quick/260711-iww-lightbox-de-fotos-del-landing-con-carrus/260711-iww-SUMMARY.md` al terminar.
</output>
