---
created: 2026-08-03T00:00:00.000Z
title: Canchas no tiene los tabs Activos/Desactivados que sí tiene Servicios
area: dashboard
milestone: motor-reservas
source: UAT de la Phase 13 (v0.26) — hallazgo del dueño después de aprobar la fase
files:
  - components/dashboard/canchas-manager.tsx (lista única, inactivas con line-through)
  - app/(dashboard)/settings/settings-client.tsx (el molde: píldoras Activos (N) / Desactivados (M))
---

## Problem

La Phase 13 (D-14) le puso a la lista de Servicios dos píldoras "Activos (N)" y "Desactivados (M)",
para que un servicio desactivado salga de la vista principal en vez de ensuciarla. El manager de
Canchas quedó afuera: sigue mostrando **una sola lista** con las canchas inactivas inline,
tachadas (`line-through text-muted-foreground` en `canchas-manager.tsx`).

Mismo problema conceptual que resolvió D-14, distinto rubro. Un negocio de canchas con varias
canchas fuera de temporada las ve todas mezcladas.

Es la segunda inconsistencia de la misma familia: en la Phase 13 ya se unificó el toggle
(canchas usaba un ojito, Servicios un botón de texto → ahora los dos son texto). Esta es la que
faltó.

## Solution

Llevar a `canchas-manager.tsx` las mismas píldoras de `settings-client.tsx`: contadores reales,
filtro por `service.active`, y empty state propio por tab (borde punteado + icono + texto) para que
un tab vacío no quede en blanco.

Reusar el molde literal de Servicios — misma variante, mismo tamaño, mismo espaciado — para que las
dos pantallas se lean como un solo sistema. Al hacerlo, evaluar si conviene extraer las píldoras a
un componente compartido en vez de copiarlas por tercera vez.

Chequear que el `line-through` de la fila inactiva sigue teniendo sentido una vez que las inactivas
viven en su propio tab (probablemente sobre).
