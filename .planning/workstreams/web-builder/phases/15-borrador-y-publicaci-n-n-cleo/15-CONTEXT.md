# Phase 15: Borrador y publicación (núcleo) - Context

**Gathered:** 2026-07-12
**Status:** Ready for planning

<domain>
## Phase Boundary

`landing_config` pasa a significar **LO PUBLICADO** y `landing_draft` (columna nueva, migración
aditiva) **lo que se está editando**. El editor CMS escribe el BORRADOR; la web pública (`/[slug]`,
su `layout.tsx` y su `opengraph-image.tsx`) sigue leyendo **SOLO lo publicado**. Publicar es una
**copia server-side** de borrador → publicado; descartar tira el borrador y vuelve a lo publicado.
El editor distingue los 3 estados (sin guardar / guardado-sin-publicar / publicado).

**En scope:** migración 050 (`landing_draft jsonb`, nace copiando `landing_config`); las Server
Actions owner-only de guardar-borrador / publicar / descartar; la barra de acciones + estados del
editor; el primer go-live implícito. Reqs: PUB-03, PUB-04, PUB-05, PUB-06, PUB-07, PUB-08.
**Fuera de scope:** exponer el CMS en el nav / sacar `CMS_ENABLED` (Phase 17, PUB-01); que la skill
escriba el borrador (Phase 16, SKILL-07/08); columna `web_live`, historial/rollback, preview
compartible por link (Out of scope del milestone).

**Fase security-sensitive** — toca la migración y el write path owner-only que aseguró v0.16.
Correr `/gsd:secure-phase 15`.
</domain>

<decisions>
## Implementation Decisions

### Modelo de guardado y semántica del borrador
- **D-01:** **Guardado explícito** (se mantiene el patrón de Phase 14, D-03): el botón "Guardar"
  arma el config COMPLETO y lo persiste — pero ahora en **`landing_draft`**, no en `landing_config`.
  Guardar deja de tener consecuencias públicas. NO hay autosave (se evaluó y se descartó: sumaría
  escrituras y estados de error sin botón que reintentar).
- **D-02:** **Publicar copia `landing_draft` → `landing_config` y deja el borrador INTACTO** (queda
  como copia fiel de lo publicado). Invariante: después de publicar, `draft == published`. NO se
  limpia el borrador a NULL — eso duplicaría los caminos de lectura del editor y haría converger
  "descartar" con "publicar".
- **D-03:** **"Cambios sin publicar" = comparación estructural `draft ≠ published`** (mismo criterio
  que el `isDirty` de `lib/landing/editor-draft.ts`: `JSON.stringify` deep-compare). No hay flag ni
  timestamp de publicación: el estado se DERIVA del contenido. Cero estado nuevo más allá de la
  columna.
- **D-04:** **Publicar guarda primero.** Si hay cambios sin guardar y el dueño toca "Publicar", se
  encadena guardar-borrador → publicar (si falla el guardado, NO publica). Motivo: publicar copia el
  borrador que está EN LA DB, así que sin esto el dueño publicaría algo distinto de lo que ve en el
  preview — justo la sorpresa que el milestone viene a eliminar. NO se deshabilita el botón (era un
  dead-end visual).

### Barra de acciones y estados (PUB-05)
- **D-05:** **Una sola barra sticky inferior** (la que ya existe en `web-client.tsx`):
  `[estado] — Descartar · Guardar · **Publicar**`. Publicar = botón primario; Guardar = secundario;
  Descartar = terciario/discreto. Sin panel nuevo, sin acciones en el header.
- **D-06:** **Un único indicador de 3 estados excluyentes** en el slot de texto que hoy dice "Todo
  guardado" (copy que PUB-05 declara engañoso): `● Cambios sin guardar` → `● Guardado — sin publicar`
  → `✓ Publicado`. El botón "Publicar" se habilita solo cuando hay algo para publicar (draft ≠
  published, o hay cambios sin guardar). NO hay badge separado compitiendo por atención.
- **D-07:** **Link "Ver mi web" a `/[slug]`** (abre en otra pestaña) en vez de un toggle
  Borrador|Publicado en el preview. El preview sigue mostrando SIEMPRE el borrador (Phase 14, D-01):
  lo publicado se ve en la página pública de verdad, no en una simulación. Si el negocio nunca
  publicó, ese link muestra su página de reservas de siempre — y está bien, es la verdad.

### Publicar y go-live (PUB-04, PUB-07)
- **D-08:** **Confirmación SOLO en la primera publicación.** La condición se DERIVA de los datos
  (`landing_config IS NULL` = nunca publicó) → el dialog aparece exactamente una vez en la vida del
  negocio, sin casilla "no volver a mostrar" ni preferencia persistida. Las publicaciones siguientes
  salen de un click (son reversibles: edita y vuelve a publicar).
- **D-09:** **Copy del dialog de go-live** (directo y concreto, calma el miedo obvio):
  - Título: **"Publicar tu web"**
  - Cuerpo: *"A partir de ahora, quien entre a forjo.studio/{slug} va a ver tu web en vez de la
    página de reservas simple. Las reservas siguen funcionando igual, dentro de tu web."*
  - CTA: **"Publicar"**
- **D-10:** **Feedback post-publicación:** `toast.success('Tu web está al aire')` con **acción "Ver
  mi web"** que abre `/[slug]` en otra pestaña (sonner, convención del repo). No saca al dueño del
  editor. El indicador de la barra pasa a `✓ Publicado`.
- **D-11:** **NO hay chequeo de calidad pre-publicación.** Si el Zod estricto
  (`parseLandingConfigForWrite`) lo acepta, se publica. El renderer ya es fail-safe con secciones
  vacías y el dueño ve exactamente lo que va a salir en el preview. Sin checklist blando ni bloqueos
  por "hero sin título".

### Descartar borrador (PUB-06)
- **D-12:** **Dialog destructivo** (patrón de confirmación destructiva que ya usa el panel):
  *"Vas a perder todos los cambios que no publicaste. Tu web al aire no se toca."* Es irreversible
  (no hay historial) → merece fricción. Sin undo/toast-deshacer.
- **D-13:** **Descartar sin haber publicado nunca** (`landing_config` NULL): se borra el borrador y
  el editor vuelve a **sembrar `DEFAULT_LANDING_CONFIG`** (el mismo camino de empty-state que ya
  existe en Phase 14, §7) + el aviso "Todavía no personalizaste tu web". Nunca queda un editor vacío
  ni un estado "sin web" nuevo. El copy del dialog aclara que su `/[slug]` sigue mostrando la reserva
  simple.
- **D-14:** **Las fotos subidas quedan huérfanas al descartar.** No se toca Storage. Es la misma
  decisión ya tomada en Phase 14 (D-02c: quitar una imagen toca solo el config; el objeto queda
  huérfano, benigno y owner-scoped bajo `landing-assets/{business_id}/`). Diffear URLs draft-vs-
  publicado para borrar sería alto riesgo (un borrado mal calculado se lleva puesta una foto que SÍ
  está al aire) por muy poco beneficio. La limpieza de huérfanos sigue diferida al backlog.

### Gate y exposición (hereda Phase 13/14 — NO se toca en esta fase)
- **D-15:** **Phase 15 NO cambia una sola línea de exposición.** Publicar/Descartar viven en el
  editor actual: ruta directa `app/(dashboard)/web/`, gateada por `CMS_ENABLED` (fail-closed,
  server-side) + `has_web_custom`, **sin entrada en el nav**. Sacar el flag y exponer el CMS es
  Phase 17 (PUB-01) y el orden 15 → 16 → 17 es **LOCKED**.
- **D-16 (invariantes de seguridad, heredados y NO negociables):** las tres acciones (guardar
  borrador, publicar, descartar) pasan por Server Actions **owner-only** con el MISMO patrón que
  `saveLandingConfig` (Phase 13): flag-first fail-closed → session client (`@/lib/supabase/server`,
  anon + cookies, RLS activo) → `business_id` de la **SESIÓN** (nunca del body) → gate
  `has_web_custom` **en la acción** (gatear solo la page es cosmético) → Zod estricto reject-on-
  invalid. **PROHIBIDO service-role en la superficie web.** Publicar es una **copia server-side**:
  jamás se acepta un config del body como "lo que se publica".

### Claude's Discretion
- Firma exacta y granularidad de las Server Actions nuevas (`saveLandingDraft` / `publishLanding` /
  `discardLandingDraft` vs una sola con verbo), y si D-04 (guardar-antes-de-publicar) se resuelve
  encadenando dos actions desde el cliente o con una action `publish` que acepte el borrador y lo
  valide+persista+publique en un solo round-trip (si esto último, el config del body se escribe al
  BORRADOR y recién después se copia server-side — nunca directo a `landing_config`).
- Cómo se calcula "sin publicar" en el cliente (qué config publicado se pasa desde `page.tsx` como
  baseline) y cómo se compone el estado de 3 valores en `web-client.tsx`.
- Copy exacto de los toasts de error de las acciones nuevas (mapeo por código, como el
  `SAVE_ERROR_COPY` existente) y microcopy de los botones.
- Detalle de la migración 050 (nombre de la columna, default, backfill) mientras respete: aditiva,
  no destructiva, `UPDATE … SET landing_draft = landing_config`, validada con `supabase db reset`
  local y aplicada a mano en prod coordinada con el deploy (nunca `db push`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec de la fase y del milestone (autoritativo)
- `.planning/workstreams/web-builder/ROADMAP.md` §"Phase 15" — Goal, los 5 Success Criteria y la
  **Threat note** completa (migración 050 aditiva, RLS de la columna nueva, write path owner-only,
  gate del add-on en la acción, fail-safe `parseLandingConfig(null) → null`).
- `.planning/workstreams/web-builder/REQUIREMENTS.md` — PUB-03..PUB-08 + "El modelo" (por qué el
  go-live no necesita columna nueva y por qué la migración es aditiva) + Out of Scope (`web_live`,
  historial/rollback, preview por link).

### Write path owner-only (Phase 13 — la fundación que NO se puede debilitar)
- `app/(dashboard)/web/_landing-actions.ts` — `saveLandingConfig`: flag-first, session client,
  `business_id` de la sesión, gate `has_web_custom`, Zod estricto, overwrite-total, verificación de
  filas afectadas. **Las acciones nuevas espejan este patrón exacto.**
- `lib/landing/write.ts` — `parseLandingConfigForWrite` (validación estricta reject-on-invalid).
- `.planning/workstreams/web-builder/phases/13-cms-foundation-write-path-owner-only-flag/13-CONTEXT.md`
  y `13-SECURITY.md` — D-01..D-04 y las amenazas cerradas (T-13-01 anti-tampering, T-13-02
  service-role, T-13-04 fail-closed). **Ojo:** estos archivos figuran borrados en el working tree —
  leerlos con `git show HEAD:<path>` si no están.

### Editor CMS (Phase 14 — sobre lo que se monta esta fase)
- `app/(dashboard)/web/web-client.tsx` — barra sticky, `isDirty`, `handleSave`, `beforeunload`,
  empty-state, `SAVE_ERROR_COPY`, `<Dialog>` de confirm-on-exit (hoy código muerto).
- `app/(dashboard)/web/page.tsx` — gate `CMS_ENABLED` + `has_web_custom`, business de la sesión,
  server-fetch de los 5 datasets del preview, `initialConfig` crudo.
- `lib/landing/editor-draft.ts` — mutadores PUROS del borrador + `isDirty` (deep-compare). Es donde
  vive la lógica testeable (no hay React Testing Library en el repo).
- `.planning/workstreams/web-builder/phases/14-cms-editor-ui/14-CONTEXT.md` — D-01..D-07 (preview
  WYSIWYG, uploads directos, huérfanos benignos, set fijo de 8 secciones).
- `.planning/workstreams/web-builder/phases/14-cms-editor-ui/14-UI-SPEC.md` — contrato visual del
  editor (la barra de acciones nueva debe respetarlo).

### Lectura pública (lo que NO puede cambiar de comportamiento — PUB-03/PUB-07/PUB-08)
- `app/[slug]/page.tsx` — lee `public_businesses` con lista explícita de columnas y
  `parseLandingConfig` (fail-safe: null → reserva simple; inválido → DEFAULT).
- `app/[slug]/layout.tsx` y `app/[slug]/opengraph-image.tsx` — también leen `landing_config`
  (metadata, tema, OG image). **Los tres deben seguir leyendo lo PUBLICADO.**
- `supabase/migrations/00000000000000_baseline.sql` §`public_businesses` (línea ~520) — la vista
  expone columnas explícitas e incluye `landing_config`. **`landing_draft` NO puede entrar ahí.**

### Aislamiento y tests
- `test/isolation.test.ts` — test anon-key de aislamiento (TEST-01). Se EXTIENDE: anon no lee
  `landing_draft` de nadie; un dueño no lee/escribe el borrador de otro negocio.
- `lib/landing/write.test.ts` — tests del validador estricto.
- `supabase/migrations/README.md` + `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas de
  migraciones numeradas y de RLS multi-tenant. **Migración nueva = 050** (049 es la última aplicada).

### Skill del operador (consumidor río abajo — Phase 16)
- `scripts/setup-landing.ts` — hoy escribe `landing_config` con service-role desde fuera del runtime
  web. Phase 16 lo migra al borrador; Phase 15 NO lo toca, pero la forma de la columna condiciona
  ese cambio.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/landing/editor-draft.ts` → `isDirty(current, saved)`: el deep-compare que hoy alimenta
  "cambios sin guardar" sirve tal cual para "cambios sin publicar" (draft vs published). Los
  mutadores puros no cambian.
- `app/(dashboard)/web/_landing-actions.ts` → `saveLandingConfig`: patrón de Server Action owner-only
  a espejar (incluye el `.select('id')` que detecta el update no-op y el try/catch → `server_error`).
- `SAVE_ERROR_COPY` (`web-client.tsx`): mapa código → toast en español; se extiende con los códigos
  de las acciones nuevas.
- El `<Dialog>` de confirm-on-exit en `web-client.tsx` es hoy **código muerto** (solo dispara
  `beforeunload`): puede reusarse como base para los dialogs de publicar/descartar.
- Preview: `LandingRenderer` + los 5 datasets ya server-fetcheados en `page.tsx` — no hace falta
  fetch nuevo para nada de esta fase salvo el config publicado como baseline.

### Established Patterns
- **Migraciones numeradas, aplicadas a mano y en orden** (`supabase/migrations/`); baseline replayable
  con `supabase db reset` local. Prod se aplica a mano coordinado con el deploy — nunca `db push`.
- **Vista pública con columnas explícitas** (`public_businesses`): el default es NO exponer. Agregar
  una columna a `businesses` no la expone sola, pero hay que verificar que la policy de `anon` sobre
  `businesses` no permita leerla por otro camino (la threat note lo exige explícitamente).
- **Server Actions owner-only**: session client + `business_id` de la sesión + gate en la acción.
  Service-role SOLO fuera de la superficie web (scripts, webhooks).
- **Errores de dominio**: `{ ok: true }` | `{ ok: false, error: '<codigo_snake>' }` + toast por código.

### Integration Points
- `businesses.landing_draft` (columna nueva, migración 050) — la escriben las 3 acciones del CMS; la
  lee el editor. **No la lee nadie más** (hasta Phase 16, que la escribe desde el script).
- `businesses.landing_config` — pasa a ser SOLO lectura desde la web pública + destino de la copia
  server-side al publicar. El editor deja de escribirla directo.
- `app/(dashboard)/web/page.tsx` — pasa a server-fetchear **draft Y published** (el published como
  baseline para el estado "sin publicar" y para el `landing_config IS NULL` que dispara el go-live).

</code_context>

<specifics>
## Specific Ideas

- El dueño **nunca** debe publicar algo distinto de lo que ve en su preview (D-04). Es la promesa
  del editor y el criterio de desempate ante cualquier duda de diseño en esta fase.
- El copy del go-live tiene que decir explícitamente que **las reservas siguen funcionando dentro de
  la web** (D-09): es el miedo real del dueño al apretar el botón.
- "Cero sorpresas en la transición" (SC5): un negocio con landing publicada la sigue viendo idéntica
  y abre el editor con una copia fiel; uno que nunca publicó sigue con su reserva simple.

</specifics>

<deferred>
## Deferred Ideas

- **Autosave del borrador** — evaluado y descartado en esta fase (D-01). Si el guardado explícito
  molesta en uso real, es un cambio chico y aislado más adelante.
- **Toggle Borrador|Publicado en el preview** — descartado a favor del link "Ver mi web" (D-07).
- **Checklist de calidad pre-publicación** ("tu hero no tiene título") — descartado (D-11); sería una
  capa de reglas de producto nueva a mantener en sync con el schema.
- **Limpieza de imágenes huérfanas en Storage** — sigue diferida al backlog (heredado de Phase 14,
  D-02c).
- **Confirm-on-exit por navegación interna** — ya diferido en el milestone (interceptar la nav del
  App Router de Next 16 es no-trivial). El `<Dialog>` muerto se puede reciclar para publicar/descartar.

</deferred>

---

*Phase: 15-Borrador y publicación (núcleo)*
*Context gathered: 2026-07-12*
