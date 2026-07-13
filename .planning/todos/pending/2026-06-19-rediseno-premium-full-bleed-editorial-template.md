---
created: 2026-06-19T15:08:45.443Z
title: Re-diseño premium full-bleed editorial del template (web-builder)
area: ui
files:
  - components/landing/
  - app/[slug]/page.tsx
---

## Problem

El template del landing (Fase 7) funciona y es theme-ready, pero estéticamente es básico:
el caso peor es el **Hero sin imagen → bloque plano** poco premium. El usuario quiere un
**re-diseño premium full-bleed editorial**, base de referencia = **jjotalab.com**.

Esfuerzo GRANDE, design-first (no es un fix puntual). NO bloquea el checkpoint de F8.

## Solution

Flujo propuesto por el usuario: **Claude Design → revisar → re-implementar.** Restricciones
que se mantienen:
- **Set de secciones FIJO** (no agregar/quitar secciones; mismas 7 + booking).
- **Booking = caja negra** (BookingClient, contrato de props; no rediseñar el funnel acá).
- **Temable**: claro/oscuro y **con/sin imagen** (cada sección debe verse premium aunque
  falte la imagen — resolver el Hero-sin-imagen, que hoy es lo peor).
- Reusar el motor de tema existente (F8: theme-config.ts + PaletteScript + tokens).

**Fuente de verdad (detalle + prompt de Claude Design):**
`c:\Users\franc\Desktop\Forjo Studio\forjo-webbuilder-followups.md` (fuera del repo, junto al
web-builder-brief.md). Leer ESE archivo antes de arrancar — tiene el detalle de FU-2 y el prompt
para Claude Design.

Encaje GSD: por tamaño, esto probablemente sea una **fase nueva del milestone web-builder**
(o un milestone de polish) más que un todo chico — al tomarlo, evaluar `/gsd:phase` para
insertarlo en el ROADMAP en vez de hacerlo ad-hoc. Relacionado con 07-UI-SPEC (contrato visual actual).
</content>
