---
created: 2026-06-22T00:20:27.905Z
title: Deduplicar openingHoursSpecification del JSON-LD
area: ui
milestone: web-builder
files:
  - lib/landing/seo.ts (buildJsonLd)
  - app/[slug]/page.tsx (serialización del JSON-LD)
---

## Problem

Refinamiento que quedó de la Fase 9 (SEO/OG). El `openingHoursSpecification` del JSON-LD
`LocalBusiness` hoy se **repite por consultorio/location**: `buildJsonLd` (en `lib/landing/seo.ts`)
deriva los horarios de `time_blocks` y, cuando un negocio tiene varias locations/profesionales con
los mismos rangos, los specs salen duplicados en el structured data emitido desde `app/[slug]/page.tsx`.

No rompe la validación de Rich Results, pero es subóptimo: ensucia el JSON-LD con specs idénticos.

## Solution

Deduplicar los specs (por `dayOfWeek` + `opens` + `closes`) antes de serializar:
- Opción A: deduplicar dentro de `buildJsonLd` al construir el array de `openingHoursSpecification`
  (probablemente el lugar correcto — mantiene el helper como única fuente de verdad y es testeable
  con Vitest en `test/landing-seo.test.ts`).
- Opción B: deduplicar en el call site de `page.tsx` antes del `JSON.stringify`.

Preferir A. Agregar un caso al test que pase varias locations con rangos repetidos y verifique que
el `openingHoursSpecification` resultante no tiene specs duplicados. Mantener el fail-safe (omitir el
campo si no hay horarios) intacto.
