---
created: 2026-06-23T00:00:00.000Z
title: Editar descripción de servicio en el panel admin
area: dashboard
milestone: web-builder
files:
  - app/[slug]/booking-client.tsx (ya muestra service.description en la tarjeta 2x2)
  - components/landing/services.tsx (ya muestra description en la lista del landing)
  - lib/types.ts (Service.description ya existe en el tipo/DB)
---

## Problem

La tarjeta de servicio del booking (rediseñada 2x2, commit 1f56c2f) y la lista de servicios del
landing muestran `service.description` si existe. El campo `description` YA existe en el tipo
`Service` y en la DB, pero NO hay un editor de servicios dedicado en el dashboard
(`app/(dashboard)/services/` no existe) donde el dueño pueda cargar/editar esa descripción.

## Solution

Exponer `description` en el CRUD de servicios del dashboard (donde sea que se gestionen los
servicios hoy — confirmar la ubicación: settings/onboarding/otro). Un `<textarea>` opcional
"Descripción (opcional)" en el form de servicio, persistido en la columna `description`.
**Límite de caracteres ~80-90** (validado server + counter en el form) para que entre en 2 líneas
y no desordene la tarjeta 2x2 ni la lista del landing (ambos ya hacen line-clamp-2). Referencia de
tono: descripciones cortas tipo flyer ("Mejora el rendimiento y previene lesiones."). Una vez
cargada, aparece sola en la tarjeta del booking y en la lista del landing (ya cableado, commits
1f56c2f/3d9c260). No es parte de la skill web-builder; es un cambio de dashboard.
