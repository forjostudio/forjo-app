---
created: 2026-08-16T00:00:00.000Z
title: "Al loguearse el panel arranca con la paleta por defecto y recién cambia al refrescar"
area: ux
source: Observación del dueño durante la UAT de la Phase 15 (2026-08-16)
files:
  - app/layout.tsx
  - components/theme-override-script.tsx
  - components/reset-theme-script.tsx
  - app/(dashboard)/layout.tsx
---

## Síntoma

**Palabras del dueño:** *"Al loguearme aparece con la paleta por defecto del sistema, y recién al
tocar actualizar se cambió al verde configurado."*

Verificado en **local**. **Falta confirmar si pasa en producción** — es lo primero a chequear, porque
en prod el timing de hidratación es distinto (build optimizado, red real).

## Por qué probablemente pasa

El panel resuelve la paleta del negocio en el cliente, pero en el **primer render después del login**
el atributo de paleta todavía no está puesto en `<html>`: el negocio se conoce recién cuando el layout
del dashboard resuelve la sesión. Al refrescar, el script de paleta corre **antes** de pintar y el
flash desaparece.

Es un **FOUC de tema** clásico: el estado correcto llega un tick tarde. El repo ya tiene el patrón
para evitarlo —un script que corre antes de pintar y estampa los atributos en `<html>`— así que
probablemente el camino de post-login no lo esté atravesando, o lo atraviese sin el dato del negocio.

## Por qué vale arreglarlo

Es lo **primero** que un dueño ve de su panel, y ve el color equivocado. Barato de arreglar y caro en
percepción de calidad — la marca del negocio es justamente lo que el panel promete respetar.

## Relacionado

- `pendiente-fix-fuente-tema-panel` — la fuente no se resetea al cambiar de tema en el panel. Mismo
  territorio (theming del panel resuelto en el cliente); conviene mirarlos juntos.

## Alcance

Chico y aislado, pero **no antes de reproducirlo en producción**: si el flash solo pasa en local por
el dev server, no hay nada que arreglar.
