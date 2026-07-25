---
created: 2026-07-25T00:20:00.000Z
title: "Vertical canchas: el H1 de la página dice 'Servicios' en vez de 'Canchas' (terminología del vertical)"
area: frontend
files:
  - app/(dashboard)/servicios/page.tsx
  - lib/verticals.ts
  - lib/use-terminology.tsx
---

## Problem

En un negocio del vertical **canchas**, la página de gestión de servicios/canchas ya adapta el sidebar
("Canchas"), el CTA ("Agregar cancha") y el empty state ("Todavía no creaste ninguna cancha"), pero el
**H1 de la página sigue diciendo "Servicios"** (genérico). Detectado en UAT de la Fase 8 (2026-07-25).
NO es de la Fase 8 — la Fase 8 solo agregó la línea de cobertura "Lo hacen: …" (que además se oculta en
canchas). Es una inconsistencia pre-existente del sistema de terminología por vertical.

## Desired

El título de la página usa la terminología del vertical: "Canchas" para el vertical canchas, "Servicios"
para el resto (belleza/salud/general), igual que ya hacen el sidebar y el CTA.

## Fix propuesto (chico)

Reemplazar el string hardcodeado "Servicios" del H1 por el término del vertical, usando el mismo
resolver que ya alimenta el sidebar/CTA (`resolveVertical` / `useTerminology` — `lib/verticals.ts`,
`lib/use-terminology.tsx`). Revisar si hay otros H1/encabezados con el mismo hardcodeo en la superficie
de gestión. Bajo esfuerzo, sin dependencias.
