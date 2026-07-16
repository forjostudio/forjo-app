---
created: 2026-07-16T15:40:59.454Z
title: Rediseñar la pantalla de upsell "Web a medida" (estado sin add-on)
area: ui
files:
  - app/(dashboard)/web/_web-upsell.tsx
  - app/(dashboard)/web/page.tsx
  - lib/plans.ts (UPGRADE_URL)
---

## Problem

`/web` para un negocio SIN el add-on `has_web_custom` muestra la pantalla de upsell "Web a medida"
(shippeada en Phase 17 / v0.18, decisiones D-01/D-02). Funciona y cumple el checklist de UI
(1 CTA claro, contraste WCAG AA, 375px, focus visible), pero visualmente **queda corta**: es una
card chica centrada en mucho espacio vacío, con poca presencia.

El problema es de negocio, no de bug: esta pantalla **es la superficie de venta del add-on pago**.
El CMS es feature estrella y la decisión explícita del milestone fue "upsell visible" en vez de un
404 invisible — o sea, la conversión de esta pantalla importa. Hoy no está diseñada para vender,
está diseñada para no romper.

Estado actual (verificado en prod 2026-07-16): ícono Globe + título "Web a medida" + párrafo +
3 checkmarks ("Diseño propio con tu logo y tus colores" / "Reservas online integradas" /
"La editás vos desde el panel") + CTA naranja "Activar" (→ `UPGRADE_URL`) + link secundario
"Ver mi página actual".

## Solution

TBD — dirección propuesta (a validar):
- Más jerarquía y densidad: hero con presencia real en vez de card chica flotando en el vacío.
- **Preview/mockup de cómo quedaría su web** (lo más convincente: mostrar el producto, no describirlo).
  Ojo: hay que ver de dónde sale el mockup (screenshot genérico del template vs render real con
  los datos del negocio).
- Quizá prueba social cerca del CTA (patrón de landing ya usado en el proyecto).
- CTA "Activar" dominante; mantener `UPGRADE_URL` (cero constante nueva).
- Respetar Bauhaus dark + tokens del design system; mobile-first 375px.

**Scope fence (NO tocar):**
- El gate `has_web_custom` ni las 3 Server Actions de `_landing-actions.ts` — el upsell es SOLO
  superficie de LECTURA. El gate de escritura es defensa en profundidad (T-17-02 del threat model
  de Phase 17, SECURED 10/10).
- El render condicional de `page.tsx` resuelve el upsell ANTES del `Promise.all` del preview
  (para no correr ~5 queries en no-entitled) — preservar esa posición.
