---
created: 2026-06-19T15:08:45.443Z
title: Reducir alto del drawer de reservas en mobile (375px)
area: ui
files:
  - app/[slug]/booking-client.tsx
---

## Problem

En mobile (375px) el drawer de reservas (vaul) queda demasiado alto: al llegar al
borde inferior se corta el título "Elegí día y horario" arriba; y si se ve el título,
se corta el botón "Volver" abajo. No entran a la vez el título y "Volver".

Detectado en el checkpoint humano de la Fase 8 (theming), pero **NO es regresión del
theming** — es el alto del drawer de booking en pantalla chica. (BookingClient ya está
des-congelado desde F7 por el auto-scroll, así que tocarlo es válido.)

## Solution

Ajustar el alto del drawer en el componente de booking (NO en el wrapper del landing
ni con transform/overflow alrededor — eso rompe vaul/sonner/date-picker, Pitfall 2 de F7):
reducir un poco su `max-height` o ajustar el snap/altura de vaul para que entren juntos
el título del paso y el botón "Volver". Probar a 375px en los 4 pasos (el paso 3 día/hora
es el más alto). Archivo probable: `app/[slug]/booking-client.tsx` (o el `<Drawer>`/vaul
que envuelve el funnel). Verificación: visual a 375px (no automatizable).
</content>
