---
phase: 260710-oa7-portar-tratamiento-motion-fotos-de-armar
plan: 01
subsystem: landing-public
status: complete
tags: [motion, intersection-observer, landing, css, rsc, polish]
requires:
  - lib/landing/theme.ts (normalizeMotion — sin cambios)
  - lib/utils.ts (cn)
provides:
  - components/landing/landing-motion.tsx (controlador IO scroll-reveal)
  - app/globals.css (bloque motion IO-driven .frj-reveal/.frj-zoom/.lift + .frj-hero-scrim + .frj-gallery-grid)
affects:
  - app/[slug] (landing público de cada negocio)
tech-stack:
  added: []
  patterns:
    - IntersectionObserver nativo (reemplaza animation-timeline:view())
    - controlador cliente único montado en .frj-site (secciones siguen RSC)
key-files:
  created:
    - components/landing/landing-motion.tsx
  modified:
    - app/globals.css
    - components/landing/landing-renderer.tsx
    - components/landing/hero.tsx
    - components/landing/about.tsx
    - components/landing/gallery.tsx
    - components/landing/rsv-strip.tsx
decisions:
  - "Mecanismo de motion: IntersectionObserver (JS nativo) en vez de animation-timeline:view() (baseline solo Chromium → invisible en Safari/Firefox/iOS)"
  - "Anti-trap: estado base VISIBLE; opacity:0 solo con data-motion-ready (JS activo + motion≠none + sin reduced-motion)"
  - "Gating por nivel: none=estático · subtle=reveal · premium=reveal+scale-in+lift"
  - "Scrim hero + grilla dense/wide = polish estructural SIEMPRE-ON (no gateado por motion)"
  - "Booking = caja negra: frj-reveal/frj-zoom/lift nunca sobre #reservar ni ancestro del widget"
metrics:
  duration: ~35min
  completed: 2026-07-10
  tasks: 3
  files: 7
  commits: 2
---

# Quick 260710-oa7: Portar tratamiento motion+fotos de armar-web-forjo al landing público — Summary

Reemplazado el motor de motion del landing público (`animation-timeline: view()`, soporte solo Chromium — el reveal/parallax era invisible en Safari/Firefox/iOS) por un controlador cliente **IntersectionObserver** (JS nativo, cero dependencias) que anima en todos los navegadores, sumando scale-in de fotos, lift al hover, scrim bottom-heavy del hero hacia `--background` y galería con `grid-auto-flow: dense` + soporte de fotos a doble ancho. El widget de reserva quedó intacto (caja negra).

## Qué se construyó

- **`components/landing/landing-motion.tsx`** (nuevo, `'use client'`, `LandingMotion`): controlador único que retorna `null` (no renderiza DOM). Observa los `.frj-reveal` del markup RSC y les agrega `.shown` al entrar al viewport. Threshold 0.15, rootMargin `0px 0px -8% 0px`, one-shot (`unobserve`). Stagger de grilla 90ms/item por índice de hermano `.frj-reveal` bajo `.frj-stagger`. Anti-flash: marca `.shown` **síncrono** a los que ya están above-the-fold (hero) → aparecen crisp sin parpadear. Guards: `level==='none'` → return; `prefers-reduced-motion` → return (no setea `data-motion-ready`).
- **`app/globals.css`**: bloque MOTION reescrito. Nuevos selectores gateados por `.frj-site[data-motion][data-motion-ready]`: `.frj-reveal` (fade+slide 28px, 0.92s cubic), `.frj-zoom img` (scale 1.08→1, premium), `.lift:hover` (brightness+translateY-3px, premium, CSS puro). Polish estructural siempre-on: `.frj-hero-scrim` (linear-gradient bottom-heavy hacia `--background`) y `.frj-gallery-grid` (2/3 cols vía `@container`, `grid-auto-rows`, `grid-auto-flow: dense`, `.wide` = span 2). Fail-safe `@media (prefers-reduced-motion: reduce)`. Eliminados `@keyframes frj-parallax/frj-reveal-in` y reglas `frj-stagger` CSS.
- **`landing-renderer.tsx`**: monta `<LandingMotion level={motionLevel} />` como primer hijo de `.frj-site`. Case `'booking'` VERBATIM.
- **`hero.tsx`**: wrapper de imagen `frj-parallax frj-parallax-hero` → `frj-zoom`; scrim negro denso de abajo → `.frj-hero-scrim`.
- **`about.tsx`**: foto `frj-parallax` → `frj-zoom lift`.
- **`gallery.tsx`**: grid → `.frj-gallery-grid frj-stagger`; eliminado `SHAPES`/`shapeFor`; agregado `isWide(i) = i%4===2` (doble ancho determinista, placeholder hasta que el editor lo setee); tiles → `cn('frj-reveal frj-zoom lift …', isWide(i) && 'wide')`; `sizes` ajustado a `(min-width: 768px) 33vw, 50vw`.
- **`rsv-strip.tsx`**: div externo (hermano del widget) → `frj-reveal`; fotos del strip → `frj-zoom lift`.

## Regla dura respetada (caja negra del booking — T-OA7-01)

`<section id="reservar">` quedó **bare** (sin className/motion). El único `.frj-reveal` dentro de `#reservar` es el `<div>` externo de `RsvStrip`, que es **hermano** del widget (renderizado antes), nunca su ancestro. Ningún `transform`/`overflow` toca un ancestro del widget → vaul/sonner/react-day-picker (position:fixed) siguen funcionando. Auditado en código en Task 3.

## Verificación

- `npx tsc --noEmit`: limpio (strict).
- `npm run build`: PASA (landing público + CSS Tailwind/PostCSS + árbol RSC con el client component embebido).
- `npx vitest run`: **391 passed / 43 skipped**. 8 archivos fallan (`booking-core`, `booking-public-regression`, `canchas-booking`, `clients-import`, `concurrency`, `isolation`, `manual-booking`, `manual-client`) con `seed: createUser falló: fetch failed` — son tests de integración que requieren el Supabase local corriendo (`supabase start`), NO están corriendo en esta sesión. Confirmado **pre-existente**: `test/isolation.test.ts` falla idéntico en el commit base (HEAD~2, antes de este trabajo). **Cero regresión** de este cambio (que solo toca CSS + componentes RSC del landing, nada de auth/Supabase).
- Auditoría de caja negra: `section#reservar` sin clases de motion; RsvStrip sibling; widget hijo directo.

## Deviations from Plan

None — plan ejecutado tal cual. Los 3 tasks se implementaron con los valores exactos del mockup y las decisiones D-A…D-G verbatim.

## Known Stubs

- **`isWide(i) = i % 4 === 2`** en `gallery.tsx`: placeholder determinista para fotos a doble ancho, intencional. El CSS `.wide` + `grid-auto-flow: dense` queda listo para cuando el editor CMS setee el flag "foto ancha" (follow-up aparte, D-G). No bloquea el objetivo del plan (replica el ritmo del mockup hoy).

## UAT Checklist (validación visual manual contra polish-mockup.html)

Probar en `/[slug]` de un negocio con `motion` seteado, y **especialmente en Safari/Firefox/iOS** (donde el motor viejo `view()` era invisible):

- [ ] **motion 'subtle'**: secciones editoriales (about/gallery/rsv/location/hours/cta) aparecen con fade+slide al scrollear — ahora también en Safari/Firefox.
- [ ] **motion 'premium'**: fotos con scale-in (1.08→1) al entrar + lift al hover en fotos/tarjetas de about/galería/RSV strip.
- [ ] **motion 'none'**: landing estática, sin reveal/zoom/lift, sin flash `opacity:0` en la carga (hero crisp).
- [ ] **`prefers-reduced-motion: reduce`** (DevTools → Rendering): contenido visible estático, sin animaciones.
- [ ] **Hero**: `.frj-hero-scrim` funde la foto hacia `--background` abajo; texto legible (chequear también una paleta clara — ocre — por el texto blanco del hero).
- [ ] **Galería**: filas parejas (`grid-auto-rows`) + `grid-auto-flow: dense` + tiles a doble ancho (`.wide`) rellenando huecos; 2 cols mobile / 3 cols ≥768px.
- [ ] **Reserva (#reservar)**: drawer (vaul), toasts (sonner) y calendario (react-day-picker) siguen funcionando; el widget nunca "salta" ni queda invisible.
- [ ] **Anti-flash**: recargar con motion subtle/premium — el contenido above-the-fold no parpadea de invisible a visible.
- [ ] **Preview del editor CMS** (si aplica): no rompe el build ni el preview en vivo.

## Commits

- `ee342fe` feat(260710-oa7-01): reescribir motion de globals.css a IO-driven + scrim hero + grilla dense/wide
- `72f48df` feat(260710-oa7-02): controlador IntersectionObserver + clases nuevas en hero/about/gallery/rsv-strip
- (Task 3: verificación, sin cambios de código)

## Self-Check: PASSED

- FOUND: components/landing/landing-motion.tsx
- FOUND: commit ee342fe (globals.css motion IO-driven)
- FOUND: commit 72f48df (controlador + secciones)
- tsc/build verdes; vitest sin regresión (fallos pre-existentes de Supabase local)
