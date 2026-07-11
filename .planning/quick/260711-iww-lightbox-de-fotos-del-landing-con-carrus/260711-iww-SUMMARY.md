---
phase: 260711-iww-lightbox-de-fotos-del-landing-con-carrus
plan: 01
subsystem: landing-publico
status: complete
tags: [lightbox, carrusel, scroll-snap, a11y, rsc, caja-negra-booking]
requires:
  - components/landing/landing-motion.tsx (patrón de controlador global por delegación)
  - app/globals.css (capa .frj-site / tokens --frj-*)
provides:
  - lib/landing/lightbox.ts (contrato de data-attributes + helpers puros)
  - components/landing/photo-lightbox.tsx (controlador cliente del visor)
  - app/globals.css → capa .frj-lightbox
affects:
  - components/landing/gallery.tsx
  - components/landing/rsv-strip.tsx
  - components/landing/about.tsx
  - components/landing/landing-renderer.tsx
tech-stack:
  added: []          # CERO dependencias npm nuevas (D-08)
  patterns:
    - "Controlador global por delegación de clicks (las secciones siguen siendo RSC puras)"
    - "Carrusel con scroll-snap NATIVO (el swipe mobile sale gratis, sin touch handler)"
    - "Overlay portaleado a document.body (caja negra del booking)"
    - "Lógica riesgosa en helpers puros testeados en environment node (cero deps de test)"
key-files:
  created:
    - lib/landing/lightbox.ts
    - lib/landing/lightbox.test.ts
    - components/landing/photo-lightbox.tsx
  modified:
    - app/globals.css
    - components/landing/landing-renderer.tsx
    - components/landing/gallery.tsx
    - components/landing/rsv-strip.tsx
    - components/landing/about.tsx
decisions:
  - "D-01/D-02/D-03: carrusel peek con scroll-snap + padding-inline; --frj-lb-cardw 80vw mobile / 58vw desktop (a ajustar en UAT con foto vertical)"
  - "D-04: pushState CON HASH (#foto) — sin hash el router colapsa la entrada y el 'atrás' del celular expulsa al usuario del sitio"
  - "D-05: stopPropagation en X/flechas/track/figura + closingRef idempotente + guarda shouldConsumeHistoryEntry (nunca dos history.back())"
  - "D-07: overlay vía createPortal a document.body — jamás ancestro de <section id='reservar'>"
  - "rsv-strip: removido el aria-hidden='true' del contenedor (con <button> adentro es violación WCAG)"
metrics:
  tasks: 3
  commits: 3
  tests_added: 12
  duration: ~25min
  completed: 2026-07-11
---

# Quick 260711-iww: Lightbox de fotos del landing con carrusel peek — Summary

Visor de fotos a pantalla completa para el landing público, con carrusel de **peek** (scroll-snap
nativo, vecinas asomando atenuadas), cerrable con X / backdrop / Esc / **botón atrás del celular**,
sin una sola dependencia npm nueva y sin tocar la caja negra del booking.

## Qué se construyó

| Task | Qué | Commit |
|------|-----|--------|
| 1 | `lib/landing/lightbox.ts` — contrato de data-attributes + helpers puros (`wrapIndex`, `centeredScrollLeft`, `shouldConsumeHistoryEntry`) + 12 tests en environment node | `156049d` |
| 2 | Capa CSS `.frj-lightbox` (fuera del scope `.frj-site`) + `photo-lightbox.tsx` (controlador cliente portaleado a `body`) + montaje en el renderer | `a4d99a7` |
| 3 | Triggers `<button data-frj-lightbox>` en galería / strip RSV / about + auditoría de caja negra | `b488cee` |

**Arquitectura:** un solo client component (`PhotoLightbox`) montado una vez dentro de `.frj-site`,
que captura los clicks **por delegación** sobre el markup del server. Las 3 secciones con fotos
**siguen siendo RSC puras** (sin `'use client'`, sin `onClick`): solo emiten atributos. Espejo
exacto del patrón de `LandingMotion`. El árbol de secciones nunca entra al bundle.

## Los dos bugs de producción, cerrados

Ambos venían del CMS hermano (`webs-cms-forjostudio/components/sections/Lightbox.tsx`), que los
tiene vivos. Están documentados **en el código como cicatrices, no como paranoia**:

1. **El "atrás" del celular sacaba al usuario del sitio** (línea 33 del original: `pushState({...}, '')`).
   Pushear la **misma URL** hace que el router **colapse** la entrada: no se crea ninguna entrada de
   historial, así que el "atrás" no tiene nada que deshacer y navega fuera. **Fix:** `pushState` **con
   hash** (`#foto`) → la entrada existe de verdad y el "atrás" la consume cerrando el visor.

2. **La X cerraba dos veces** (línea 114 del original: `onClick={onClose}` sin `stopPropagation`).
   El backdrop cierra con `onClick`; el click en la X **burbujeaba** hasta él → cierre doble → dos
   `history.back()` seguidos → **el usuario salía de la página**. **Fix triple:** `stopPropagation()`
   en X / flechas / track / figura, cierre **idempotente** por `closingRef`, y la guarda pura
   `shouldConsumeHistoryEntry()` (nunca `history.back()` si arriba del stack no está nuestra marca).

`shouldConsumeHistoryEntry` es helper puro **justamente para poder testearlo**: 6 de los 12 tests
cubren el camino que expulsa al usuario (`null`, `undefined`, `{}`, `frjLightbox:false`, marcas
truthy-pero-no-`true`).

## Caja negra del booking — auditada

- El overlay se portalea con `createPortal(..., document.body)` → **jamás** es ancestro de
  `<section id="reservar">`.
- `landing-renderer.tsx`: el único cambio en ese árbol es `<PhotoLightbox />` montado como
  **hermano**. `<section id="reservar" key={i}>` quedó **verbatim, sin clases**.
- Ningún selector CSS nuevo apunta a `.frj-site`, `#reservar` ni a un ancestro del widget: todos son
  `.frj-lightbox` / `.frj-lb-*`. Las menciones a `.frj-site` en el bloque están **solo en comentarios**.
- El scroll lock usa `body { overflow: hidden }`, que **no crea containing block** (a diferencia de
  `transform`) → el `position: fixed` de vaul / sonner / react-day-picker sigue intacto.

## Verificación

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | **0 errores** |
| `npm run build` | **✓ Compiled successfully** (14.5s) — `/[slug]` (landing público) dinámico OK |
| `npx vitest run` | **403 passed, 0 failed**, 43 skipped. 8 archivos fallan a nivel suite: los de integración que necesitan Supabase local (**pre-existentes**, idénticos al baseline) |
| `npm run lint` | 588 problemas — **idénticos al baseline** (verificado con stash). **Cero** en los archivos nuevos/tocados |
| `git diff package.json package-lock.json` | **vacío** → cero dependencias npm nuevas |
| Auditoría caja negra | **limpia** (ver arriba) |

## Deviations from Plan

**Ninguna funcional.** Un solo ajuste de implementación sobre lo literal del plan:

**[Rule 1 - Bug] El efecto de apertura le robaba el foco a las flechas**
- **Encontrado en:** Task 2, al escribir el controlador.
- **Issue:** el plan describía el efecto de posicionamiento inicial + foco en la X. Si ese efecto
  depende de `view.index` (que cambia en cada navegación), **cada click en una flecha volvía a
  enfocar la X** — el foco se le escapaba al botón que el usuario acababa de tocar.
- **Fix:** se agregó un `openId` monotónico al estado (`View`), que discrimina "se abrió el visor"
  de "se cambió de foto". Los efectos de apertura (centrar el track, enfocar la X) cuelgan de
  `openId`, no de `index`. Además la navegación pasó de `goTo(absoluto)` a `moveBy(delta)` con
  update funcional, así el efecto de teclado no necesita `view` en sus deps y no se re-suscribe en
  cada navegación. Beneficio lateral: cero `eslint-disable` en el archivo.
- **Archivos:** `components/landing/photo-lightbox.tsx` · **Commit:** `a4d99a7`

## Checklist de UAT (pendiente — validación humana)

Levantar `npm run dev` y abrir el landing público de un negocio con galería (`/[slug]`):

- [ ] **1. Peek — EL AJUSTE FINO MÁS IMPORTANTE.** Tocar una foto de la galería → se abre centrada y
      las vecinas **asoman atenuadas** a los costados. **Repetir con una foto VERTICAL:** a la
      vertical la limita el `max-height` del frame, así que si el slide es muy ancho la deja centrada
      con **aire a los costados** y ese aire **tapa el peek** (parece que el carrusel no funciona).
      Si pasa: **bajar `--frj-lb-cardw`** en `app/globals.css` (hoy `80vw` mobile / `58vw` desktop,
      línea ~636 y ~646) hasta que se vea el pedacito de la vecina.
- [ ] **2. Primera y última.** Abrir la PRIMERA y la ÚLTIMA foto → las dos quedan **centradas**, no
      pegadas al borde (eso valida el `padding-inline` del track).
- [ ] **3. Swipe.** En viewport mobile (DevTools o celular real): pasar de foto con swipe → anda
      (scroll nativo, sin drag handler).
- [ ] **4. Botón ATRÁS del celular — PROBAR EN CELULAR REAL.** Con el visor abierto, apretar "atrás"
      → **cierra el visor y seguís en la página** (no sale del sitio).
- [ ] **5. La X no cierra dos veces.** Abrir y cerrar con la **X** 3 veces seguidas → siempre vuelve
      a la página, **nunca** navega fuera del sitio.
- [ ] **6. Esc + backdrop** cierran; al abrir el foco entra en la X y al cerrar **vuelve a la foto**
      que lo abrió.
- [ ] **7. Fotos destacadas.** Tocar una foto del **strip de la reserva** y la foto de **about** →
      también amplían (about = visor de 1 ítem, sin flechas).
- [ ] **8. Booking intacto.** En `#reservar`: abrir el calendario (react-day-picker), un drawer en
      mobile (vaul) y provocar un toast (sonner) → los tres siguen posicionándose bien.
- [ ] **9. Reduced motion.** Activar `prefers-reduced-motion: reduce` en DevTools → el carrusel
      **sigue funcionando**, sin transiciones de scale/opacity ni scroll suave.

## Self-Check: PASSED

- Archivos creados: `lib/landing/lightbox.ts` ✓, `lib/landing/lightbox.test.ts` ✓,
  `components/landing/photo-lightbox.tsx` ✓
- Commits verificados en git log: `156049d` ✓, `a4d99a7` ✓, `b488cee` ✓
- Cero dependencias npm nuevas ✓ · tsc 0 errores ✓ · build OK ✓ · vitest sin regresión ✓
