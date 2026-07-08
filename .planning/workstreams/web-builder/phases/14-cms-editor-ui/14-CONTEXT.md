# Phase 14: CMS editor UI - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Editor **visual** en el panel para que el dueño edite TODA su landing: copy por sección, imágenes
(subir/reemplazar/borrar, incluida la galería alrededor de la reserva), reorden y on/off de las
secciones del **set FIJO**, preset de tema + paleta/primary + `motion`, con **preview** antes de
persistir. **Toda** la escritura pasa por el path owner-only de la Phase 13 (`saveLandingConfig`).

**En scope:** editor UI en `app/(dashboard)/web/` detrás del flag `CMS_ENABLED`; forms de copy por
sección; upload de imágenes al bucket `landing-assets` namespaced por `{business_id}/`; reorden/toggle
del set fijo; editor de tema/paleta/primary/motion; preview en vivo. Reqs: EDIT-01, EDIT-02, EDIT-03,
EDIT-04, EDIT-06.
**Fuera de scope:** exposición del CMS en el nav + gating por plan (v2, PUB-01); flujo publish/go-live
draft→publicado (v2, PUB-02); `has_web_custom` como gate; layout libre / drag-and-drop de secciones
nuevas (anti-feature: el set es FIJO). El write path + flag ya existen (Phase 13, EDIT-05/07).
</domain>

<decisions>
## Implementation Decisions

### Layout y preview (EDIT-06 / SC5)
- **D-01:** **Split: panel de edición + preview en vivo lado a lado.** El preview **re-renderiza el
  `landing-renderer` REAL** con el config **borrador** en el cliente (WYSIWYG fiel, sin iframe ni ruta
  de preview nueva). Desktop = split; mobile = toggle Editar/Preview. El **booking sigue caja negra**
  dentro del preview (no se ejercita la reserva; threat note Phase 14).
- **D-01b:** El `landing-renderer` consume datos server-fetched además del config (business, services,
  locations, time_blocks). La `page.tsx` los server-fetchea **una vez** y los pasa al cliente; el
  preview solo intercambia el `landing_config` borrador contra esos datos estáticos. (Research: confirmar
  la firma/props exacta del renderer y qué datos necesita para no romper el preview.)

### Subida de imágenes (EDIT-02)
- **D-02:** **Upload directo del navegador** al bucket `landing-assets` con el **Storage client de
  sesión** (browser client, anon + sesión del dueño). La **RLS owner-write** del bucket (v0.10, migr.
  030) ya fuerza el prefijo `{business_id}/` — un intento fuera del prefijo se rechaza. **Nunca**
  service-role en la superficie web (hereda invariante Phase 13). No hay helper de upload en la app
  todavía: es NUEVO.
- **D-02b:** La **URL pública** del objeto subido se guarda en el campo `image`/`images` del config y se
  persiste recién con "Guardar" (no auto). Reemplazar = subir un objeto nuevo y apuntar la URL. Los
  campos de imagen del schema son `z.string().url()` → la URL debe ser https válida.
- **D-02c:** **Borrar/quitar** una imagen toca **SOLO el config** (saca la URL). El objeto en Storage
  queda huérfano (benigno, owner-scoped). La **limpieza real de huérfanos se DIFIERE** (v2/backlog).
- **D-02d:** Aplica a las secciones cuyo schema tiene imagen: `hero.image`, `about.image`,
  `gallery.images[]`, y la **galería de la reserva** (`rsvData.images[]` en la sección `booking`) — la
  galería alrededor de la reserva se edita ACÁ (EDIT-02 la menciona explícita; el campo `rsvData` lo
  agregó Phase 12).

### Guardar / modelo de borrador (EDIT-06)
- **D-03:** **Borrador en memoria (estado cliente) + botón "Guardar cambios".** El botón arma el config
  **COMPLETO** y llama `saveLandingConfig` (Phase 13, **overwrite-total**). El preview refleja siempre
  el borrador → cumple SC5 (preview antes de persistir). El editor **carga el `landing_config` actual**
  (o `DEFAULT_LANDING_CONFIG` si es null) como estado inicial.
- **D-03b:** **Sin tabla/columna de draft** — eso sería publish/go-live (v2). Indicador de "cambios sin
  guardar" + confirm al salir/navegar con cambios pendientes.
- **D-03c:** El caller **DEBE** manejar el retorno de `saveLandingConfig` (WR-03 de Phase 13):
  `{ ok:false, error }` → toast por código (`cms_disabled`, `unauthorized`, `no_business`,
  `invalid_config`, `update_failed`, `server_error`); `{ ok:true }` → limpiar el flag de cambios sin
  guardar. Feedback con `sonner` (convención del repo).

### Reordenar + on/off de secciones (EDIT-03)
- **D-04:** Se listan **SIEMPRE las 8 secciones fijas** (`hero, about, services, gallery, location,
  hours, cta, booking`) con **toggle `enabled`** + **botones subir/bajar** que reescriben `order`. **Sin
  drag-and-drop**, sin dependencia nueva, accesible. Set fijo — no se crean ni borran secciones.
- **D-04b:** (Discreción de UI/planner) evaluar si `booking` (y quizás `hero`) deben quedar **siempre
  enabled** por ser núcleo de conversión; por defecto todas togglean.

### Edición de copy (EDIT-01)
- **D-05:** Un **form por sección** manejado por los schemas de `data` por-sección ya existentes
  (`heroData`, `aboutData`, `servicesData`, `galleryData`, `rsvData`, `locationData`, `ctaData` en
  `lib/landing/schema.ts`). El editor edita el `data` del config. Las **listas** de `services`/`locations`
  vienen de sus **tablas** (read-only en el editor — no se editan acá, solo su título/subtítulo/map);
  `hours` deriva de `time_blocks` (sin copy); `booking` no tiene copy salvo `rsvData` (header/intro/images).

### Tema / paleta / primary / motion (EDIT-04) — decidido con default (no discutido)
- **D-06:** **Reusar el patrón de swatches** de `settings-client.tsx` (`THEMES`/`THEME_PALETTES` de
  `lib/theme-config.ts`) PERO apuntado a **`landing_config.theme`** (`preset` + `overrides.palette` +
  `overrides.primary`), **NO** a las columnas de chrome del dashboard (`business.theme/palette/font`) —
  son cosas distintas (el chrome del panel vs el tema de la landing pública). El **primary** por input de
  color validado contra la allowlist `isSafeColor` de `lib/landing/theme.ts`. Selector de **`motion`**
  (`none`/`subtle`/`premium`). Todo se ve aplicado en vivo en el preview vía `resolveLandingTheme`.

### Ubicación / gating (hereda Phase 13)
- **D-07:** El editor vive en **`app/(dashboard)/web/`** (junto a `_landing-actions.ts`): `page.tsx`
  Server Component **gateado por `CMS_ENABLED` server-side** (fail-closed: sin flag no renderiza NADA —
  threat note d de Phase 13), resuelve el business de la sesión, server-fetchea los datos del preview, y
  monta el client `*-client.tsx`. **Cero exposición en nav** (EDIT-07, v1).

### Claude's Discretion
- Estructura fina de componentes del editor (un client grande vs sub-componentes por sección / drawers
  `vaul` en mobile), naming, y cómo se compone el estado del borrador.
- Debounce/optimización del re-render del preview; wrapper del renderer vs uso directo.
- Copy exacto de los toasts de error y labels de las secciones en la UI.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec de la fase y del milestone (autoritativo)
- `.planning/workstreams/web-builder/ROADMAP.md` §"Phase 14" — Goal, los 5 Success Criteria y la
  **Threat note** (upload solo bajo `{business_id}/`, preview no expone otro tenant, booking caja negra).
- `.planning/workstreams/web-builder/REQUIREMENTS.md` — EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-06 + la
  sección Out of Scope (PUB-01/02, OPS-*, layout libre/DnD como anti-feature).

### Write path + flag (Phase 13 — la fundación sobre la que monta este editor)
- `.planning/workstreams/web-builder/phases/13-cms-foundation-write-path-owner-only-flag/13-CONTEXT.md`
  — D-01..D-04 (flag, Server Action owner-only, validador estricto).
- `app/(dashboard)/web/_landing-actions.ts` — `saveLandingConfig(input): { ok } | { ok:false, error }`
  (overwrite-total, session client, flag-first, códigos de error). El editor la invoca al Guardar.
- `lib/landing/write.ts` — `parseLandingConfigForWrite` (validación que corre server-side al escribir;
  el editor NO la necesita, pero define qué shape es válido).

### Schema y tema (el contrato que el editor manipula)
- `lib/landing/schema.ts` — `SECTION_TYPES` (8 fijas), `landingConfigSchema` (theme + sections + motion),
  `DEFAULT_LANDING_CONFIG`, y los schemas de `data` por-sección (`heroData`/`aboutData`/`servicesData`/
  `galleryData`/`rsvData`/`locationData`/`ctaData`). `rsvData` es la galería de la reserva (Phase 12).
- `lib/landing/theme.ts` — `resolveLandingTheme` (preset→theme, overrides.palette→palette,
  overrides.primary por `isSafeColor`), `normalizeMotion`. El editor produce lo que esto resuelve.
- `lib/theme-config.ts` — `THEMES`, `THEME_PALETTES`, `THEME_DEFAULT_PAL`, `FONTS` (fuente única de
  presets/paletas a mostrar en los swatches).

### Renderer + secciones (a reusar para el preview en vivo)
- `components/landing/landing-renderer.tsx` — el renderer público; el preview lo re-renderiza con el
  config borrador. Confirmar props/datos que consume.
- `components/landing/{hero,about,services,gallery,location,hours,cta,rsv-strip}.tsx` + `_premium.tsx` —
  las secciones que el preview renderiza; muestran qué campos de `data` usa cada una.

### Storage (upload de imágenes)
- `supabase/_migrations-archive/030_landing_config_and_storage.sql` — bucket `landing-assets` + RLS
  owner-write namespaced por `{business_id}/` (la garantía de aislamiento del upload; ya existe).
- `lib/supabase/client.ts` — browser client de sesión (el que hace el upload con RLS activa).

### Patrón de edición existente (a espejar, OJO al target)
- `app/(dashboard)/settings/settings-client.tsx` — patrón de swatches de tema/paleta/primary + escritura
  client-side a `businesses`. **OJO:** edita el chrome del dashboard (`business.theme/palette/font`), NO
  `landing_config.theme` — reusar el PATRÓN de UI, no el target.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/landing/landing-renderer.tsx` + secciones: el preview en vivo re-renderiza el MISMO
  renderer con el config borrador → WYSIWYG fiel sin duplicar UI ni iframe.
- Swatches de tema/paleta/primary de `settings-client.tsx` + `THEME_PALETTES`/`isSafeColor`: patrón de UI
  reusable para EDIT-04 (re-apuntado a `landing_config.theme`).
- `saveLandingConfig` (Phase 13): único camino de escritura; el editor solo arma el config completo.
- Schemas de `data` por-sección: definen exactamente qué campos edita cada form (headline, body, images…).

### Established Patterns
- **Escritura solo por el path owner-only + session client**, nunca service-role (invariante v0.9/Phase 13).
- **Overwrite-total del config**: el editor mantiene el config completo en el borrador y lo manda entero.
- **Fail-safe del config**: Zod v4 `z.object` estripa claves desconocidas; `data` por-sección permisivo
  con `.catch({})` en render → un borrador raro no rompe el preview.
- **Retorno `{ ok, error }` snake_case** + `sonner` para feedback (convención del repo).

### Integration Points
- Nueva ruta `app/(dashboard)/web/page.tsx` (server, gateada por `CMS_ENABLED`) + `*-client.tsx` (editor).
- Upload: browser Storage client → `landing-assets/{business_id}/...` → URL pública al config.
- Guardar: `saveLandingConfig(configCompleto)` → toast por resultado.
- Preview: `landing-renderer` con config borrador + datos server-fetched (business/services/locations/time_blocks).
</code_context>

<specifics>
## Specific Ideas

- El norte visual del milestone es una landing premium estilo jjotalab/Meitre; el editor es la
  herramienta para que el dueño llegue a eso sin tocar el config a mano (hoy lo arma la skill
  `forjo-web-builder` por script service-role — este editor es el equivalente self-serve del dueño).
- Preview lado a lado tipo CMS: editás a la izquierda, ves la landing real actualizarse a la derecha.
</specifics>

<deferred>
## Deferred Ideas

- **Exposición del CMS en el nav + gating por plan** — v2, PUB-01.
- **Publish/go-live (draft → publicado)** — v2, PUB-02. Por eso el borrador es efímero en cliente, sin
  tabla de draft.
- **Limpieza real de objetos huérfanos en `landing-assets`** al borrar/reemplazar imágenes — backlog.
- **Drag-and-drop** para reordenar secciones y **WYSIWYG inline** (editar sobre la página) — descartados
  en esta fase a favor de subir/bajar + toggle y split editor+preview.
- **Tightening per-sección del `data`** (discriminated union en el schema) — sigue permisivo; no es de
  esta fase.

None de scope creep nuevo: la discusión se mantuvo en cómo construir el editor de lo ya scopeado.
</deferred>

---

*Phase: 14-cms-editor-ui*
*Context gathered: 2026-07-08*
