---
created: 2026-07-14T00:00:00.000Z
title: El editor CMS no refleja un override de primary custom (preview cyan vs público violeta)
area: web-builder-cms
files:
  - lib/landing/theme.ts
  - app/(dashboard)/web/**
  - app/[slug]/**
---

## Problem

Detectado en el UAT de la Fase 16 (web-builder). Cuando el `landing_config` tiene un
tema con `overrides.primary` custom que NO coincide con ninguna paleta con nombre
(ej. `{ preset: "cyber", overrides: { primary: "#7c3aed" } }`), la página pública
`/[slug]` **aplica el override** y renderiza violeta, pero el editor del dueño
(`/web`) muestra su preview y su selector de paletas en la paleta default del preset
(cyan). O sea: la página pública y la preview del editor **resuelven el mismo tema de
forma distinta** ante un primary custom.

Cómo se reprodujo: `npm run setup:landing -- --slug estudio-test --config <cfg> --publish`
con `brand.primary_color: "#7c3aed"` + `vertical: general` → el builder resolvió
preset `cyber` + override primary violeta. Público = violeta, editor = cyan.

NO es un bug de la Fase 16: `scripts/setup-landing.ts` y el `SKILL.md` (lo único que
tocó esa fase) escriben el config correcto y el público lo renderiza bien. La
discrepancia vive en el editor CMS + el renderer (v0.16, fases 13-15).

## Riesgo secundario (verificar)

Si el dueño abre ese editor, ve la paleta cyan seleccionada y aprieta "Guardar", podría
**pisar el override violeta con cyan** — perdiendo el color que el operador dejó. Eso
sería write-path del editor (fase 15). Confirmar si el "Guardar" del editor persiste el
estado del picker (cyan) o preserva el `overrides.primary` existente.

## Solution (a investigar)

- El selector de paletas del editor debería representar un `primary` custom (ej.
  mostrar un swatch "custom"/"personalizado" en vez de caer al default del preset), y
  la preview del editor debería aplicar el mismo `overrides.primary` que aplica el
  público. Unificar la resolución de tema entre `app/[slug]` y la preview del editor.
- Decidir si `recommendTheme` debería evitar emitir un `primary` suelto que el editor
  no sabe representar, o si el editor debe soportar overrides arbitrarios (preferible).
