---
status: passed
phase: 15-borrador-y-publicaci-n-n-cleo
source: [15-VERIFICATION.md]
started: 2026-07-13T00:00:00Z
updated: 2026-07-13T00:00:00Z
---

## Entorno del UAT

Preview de Vercel de la rama `gsd/gestion-rebrand` (env `Preview` → **Supabase de PRODUCCIÓN**).
Migración 050 aplicada a mano en prod + `NOTIFY pgrst, 'reload schema';`. `CMS_ENABLED=true`.

Dos negocios reales, cada uno cubriendo un lado de la matriz de estados:

| Negocio | `landing_config` | `landing_draft` | Para qué sirvió |
|---------|------------------|-----------------|-----------------|
| `/estudio-test` (Forjo Barbers) | presente | presente (backfill) | Regresión PUB-08: la web ya publicada no se cae y el editor abre fiel |
| `/estudio` (Estudio) | NULL | NULL | Go-live implícito (PUB-07) y empty-state de negocio virgen |

## Tests

### 1. PUB-03/SC1 — Guardar NO publica
expected: Editar un campo, tocar "Guardar". Indicador → `● Guardado — sin publicar`. `/{slug}` en otra pestaña sigue idéntica.
result: PASS — en `/estudio-test`. La web pública no cambió.

### 2. PUB-04/SC2 — Publicar SÍ cambia la web pública
expected: Tocar "Publicar" → toast + `/{slug}` muestra el cambio. Indicador `✓ Publicado`, las 3 acciones deshabilitadas.
result: PASS — en `/estudio-test`.

### 3. PUB-07/SC5 — Dialog de go-live, exactamente una vez
expected: Primera publicación de un negocio que nunca publicó → dialog "Publicar tu web". Segunda publicación → sin dialog.
result: PASS — en `/estudio` (virgen). El dialog apareció en la primera y NO en la segunda. Derivado de `landing_config IS NULL`, sin flag persistido.

### 4. PUB-06/SC4 — Descartar revierte a lo que está al aire
expected: Editar, guardar, descartar → el editor vuelve a mostrar lo publicado. Sin dead-end (Guardar no queda trabado).
result: PASS — en `/estudio-test`.

### 5. PUB-08/SC5 — Regresión: negocio YA publicado (el check más sensible)
expected: Un negocio con landing ya publicada abre el editor en `✓ Publicado` desde el primer render, sin tocar nada. Si arrancara en `● Guardado — sin publicar`, el compare canónico estaría roto (Pitfall 7 del RESEARCH).
result: PASS — en `/estudio-test`, con datos reales post-backfill. El compare canónico resiste el reordenamiento de claves del `jsonb` que hace Postgres.

### 6. Mobile 375px — layout de la barra
expected: Barra en 2 filas, botones ≥44px, el texto del estado no se trunca.
result: PASS.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

Ninguno abierto.

**Un gap encontrado y CERRADO durante el UAT** (no queda pendiente):

- **Copy engañoso en negocio virgen.** Un negocio que nunca publicó ni guardó nada abría el editor
  con el cartel `● Guardado — sin publicar`. Era falso: `landing_draft` es `NULL` en la base, no hay
  nada guardado. Es la misma clase de mentira que PUB-05 vino a matar (el viejo "Todo guardado").
  La causa: el estado `unpublished` de `deriveEditorState` mete dos situaciones distintas en la misma
  bolsa (hay borrador guardado sin publicar / no hay nada persistido), y el label era fijo.
  El code review lo había detectado solo en el camino post-Descartar (WR-04) y el fix de entonces
  sacó el dead-end pero dejó el cartel mintiendo.
  **Cerrado en `6c48258`:** helper puro `deriveStateLabel` en `lib/landing/editor-draft.ts` (+6 tests)
  y prop `hasPersistedDraft` viva en el cliente. El label pasa a `● Sin publicar`. **Sin agregar un 4º
  estado** — D-06 (un indicador, 3 estados excluyentes) sigue intacta: `EditorState` conserva sus 3
  miembros y `deriveEditorState` no se tocó.
  Verificado end-to-end en `/estudio` tras el redeploy.

## Diferido a `/gsd:secure-phase 15`

- **WR-05** — `sectionSchema.data` es `z.unknown()`: el write path persiste el `data` de cada sección
  verbatim, sin validar por tipo de sección. Es la raíz que habilitó el XSS de `map_url` (CR-02, ya
  cerrado con la allowlist `safeLinkUrl`). Cerrar la raíz es un cambio de contrato más grande.
- **Deriva de normalización entre columnas** — `publishLanding()` escribe en `landing_config` el
  borrador **ya parseado** por el Zod estricto (que normaliza y estripa), pero deja `landing_draft`
  con el crudo. Observado en prod: `/estudio-test` tiene config = 2414 bytes y draft = 2413.
  Hoy es inofensivo (el editor parsea ambas columnas al leerlas, por eso el compare da igual y el
  estado `✓ Publicado` es correcto), pero es exactamente la clase de deriva silenciosa entre columnas
  que hizo peligroso el pitfall del orden de claves.
