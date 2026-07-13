# Phase 16: La web nace como borrador (skill del operador) - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Cerrar el circuito **operador → dueño → público**. La web que arma el operador con la skill
`forjo-web-builder` deja de salir cruda al aire: nace como **borrador** (`landing_draft`) y espera la
aprobación del dueño desde su editor. El operador puede ver, por separado, qué está al aire y qué
quedó pendiente de publicar.

Es la pieza que convierte a v0.18 en el prerequisito real del auto-armado con el pago del add-on: sin
esto, un cobro automático publicaría una web sin que nadie la haya mirado.

**Toca:** `scripts/setup-landing.ts` (write path service-role del operador) y
`.claude/skills/forjo-web-builder/SKILL.md` (el flujo que lo maneja, incluido el modo edición de
Phase 11).
**NO toca:** la superficie web. No se agrega ningún endpoint, ninguna Server Action, ningún runtime
nuevo. El script sigue siendo local, service-role, fuera del runtime web, con checkpoint humano
pre-escritura (invariante LOCKED de v0.10).

</domain>

<decisions>
## Implementation Decisions

### Choque operador ↔ dueño sobre el borrador (la decisión central de la fase)

**El problema que esta fase crea y tiene que resolver:** hasta hoy el script era el **único** escritor
del landing, así que su `UPDATE` de overwrite total era seguro. A partir de esta fase hay **dos
escritores sobre la misma columna** (`landing_draft`): el operador y el dueño. Si el dueño tiene
cambios sin publicar y el operador corre la skill, le pisa el trabajo **en silencio**. Es la misma
clase de bug que CR-01 (cerrado en Phase 15), con los roles invertidos.

- **D-01:** El script **detecta** si el dueño tocó su borrador (`landing_draft` ≠ `landing_config`,
  con el compare **canónico** de Phase 15 — `configsEqual`, inmune al reordenamiento de claves que
  hace Postgres en el `jsonb`) y **avisa en el checkpoint humano pre-escritura que ya existe**, antes
  de tocar la fila. El operador decide en el momento, con el dato a la vista. **No aborta, no fuerza a
  re-correr el comando**: el caso limpio (el 95%) no paga ninguna fricción.
- **D-02:** El aviso lista **qué secciones difieren**, no un diff campo por campo:
  `⚠ El dueño tiene cambios sin publicar. Secciones que difieren de lo publicado: hero, gallery. Si seguís, los pisás.`
  Es lo justo para decidir sin leer un JSON. Barato: `configsEqual` ya existe y se aplica por sección.
  El diff completo campo-por-campo se **descarta** (un diff-er de JSON para mantener, y en la práctica
  se decide con el nombre de la sección).

### Publicar desde el script (`--publish`)

**La tensión, explícita:** el milestone existe para que nada salga al aire sin la aprobación del
dueño. Un `--publish` reabre un camino del operador a producción. Pero la web es un **servicio con el
operador adentro**: el caso real es el dueño que pide "hacémela y subila" por WhatsApp y nunca entra
al panel. La línea no es *si* el operador puede publicar — es si publica **por defecto** (el bug que
el milestone mata) o **porque lo eligió explícitamente** (decisión humana, con el dueño de acuerdo).

- **D-03:** **Por defecto el script escribe SOLO el borrador** (`landing_draft`). Con el flag
  **explícito `--publish`**, además publica. **Nunca por defecto, nunca silencioso.** Antes de
  publicar, el script imprime **qué web está por reemplazar** (si el negocio ya tenía una al aire).
  SC1 del ROADMAP se cumple: el comportamiento por defecto no hace aparecer nada en `/[slug]`.
- **D-03b:** `--publish` escribe **las dos columnas con el config ya parseado** (`landing_draft` =
  `landing_config` = el mismo objeto validado). Esto mantiene el invariante que la Phase 15 verificó:
  el parseo es idempotente y las dos columnas quedan byte-idénticas, así que el dueño abre el editor
  en `✓ Publicado` y no en un falso "sin publicar".

### Modo edición de la skill: de qué columna parte

- **D-04:** El modo edición (Phase 11) reconstruye el payload **SIEMPRE desde el borrador**
  (`landing_draft`). Si no hay borrador (negocio legacy, columna en `NULL`), **cae a lo publicado**.
  **Por qué, y no es una preferencia:** el borrador es "lo último que se tocó" e **incluye los
  retoques que el dueño hizo y no publicó**. Partir de lo publicado los **descartaría en silencio** al
  re-escribir — la misma pérdida que D-01 viene a avisar, pero por la puerta de atrás, donde ningún
  aviso es posible. Lo único que puede pisar el trabajo del dueño es una decisión avisada del
  operador (D-01), nunca un default silencioso.
- **D-04b:** Se **descarta** un flag `--from-published`. Es una superficie de CLI más para un caso que
  puede no aparecer nunca; si aparece (el dueño rompió su borrador y pide dejarlo como está al aire),
  el operador tiene `--inspect` para verlo y el editor tiene "Descartar" para resolverlo desde el
  panel del dueño, que es donde corresponde.

### `--inspect`: borrador y publicado por separado (SKILL-08)

- **D-05:** `--inspect` vuelca **las dos columnas por separado** y dice claramente cuál es cuál:
  qué está **al aire** (`landing_config`) y qué está **pendiente de aprobación** (`landing_draft`).
  Sigue siendo **read-only**: no escribe nada, no sube nada. Debe dejar obvio el caso "el dueño tiene
  cambios sin publicar" (el mismo que dispara el aviso de D-01/D-02).

### Aviso al dueño

- **D-06:** **Nada en código.** El operador le avisa al dueño por WhatsApp, como ya trabaja hoy: la
  web a medida es un servicio con el operador adentro, no un self-service. Un mail apuntaría además a
  una puerta que **todavía no existe** — el editor sigue detrás de `CMS_ENABLED` y su entrada en el
  panel recién aparece en la Phase 17. Se anota como idea diferida.

### Claude's Discretion

Decisiones técnicas que el planner resuelve sin volver a preguntar:

- **Validación del write path del script.** `scripts/setup-landing.ts:306` valida hoy con
  `parseLandingConfig` — el validador **fail-safe de LECTURA**, que ante un `data` inválido **degrada
  la sección a `{}` en silencio** y el operador no se entera. Debe pasar a
  `parseLandingConfigForWrite` (`lib/landing/write.ts`), el **estricto de escritura**, que rechaza
  ruidosamente (`invalid_config` / `config_too_large`). Quedó anotado al cerrar la Phase 15 y **ésta
  es la fase que toca ese archivo**.
- **Revertir el fix CR-01.** Hoy el script escribe **las dos columnas**
  (`.update({ landing_config: parsed, landing_draft: parsed })`, commit `f98ed6b`). Eso era correcto
  en Phase 15 (el script era un publish y dejar el borrador desincronizado hacía que el "Publicar" del
  dueño revirtiera la web del operador). Con D-03 deja de serlo: por defecto se escribe **solo**
  `landing_draft`; las dos columnas solo con `--publish`. **El planner debe leer el comentario que
  `f98ed6b` dejó ahí y reemplazarlo, no borrarlo sin más** — explica un incidente real.
- **Actualizar el SKILL.md.** `.claude/skills/forjo-web-builder/SKILL.md` documenta hoy que la
  escritura "sobre-escribe el `landing_config`" y que el modo edición parte de él. Hay que reescribir
  esos pasos (el checkpoint humano, el aviso de D-01/D-02, `--publish`, y la base de edición de D-04).
- Formato exacto de la salida de `--inspect` y el copy de los avisos.
- Estructura interna del script (flags, orden de los pasos, dónde vive el compare por sección).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Lo que esta fase modifica
- `scripts/setup-landing.ts` — el write path service-role del operador. Tiene `--inspect` (read-only,
  líneas ~107-160) y el modo escritura (~300-335). El comentario de cabecera explica **por qué es un
  script local y no un endpoint web** (D10-01 / SKILL-04): es un invariante, no una preferencia.
- `.claude/skills/forjo-web-builder/SKILL.md` — el flujo del operador, incluido el modo edición de
  Phase 11 (pasos ~49-107).

### El contrato borrador/publicado (Phase 15 — leer antes de tocar nada)
- `.planning/workstreams/web-builder/phases/15-borrador-y-publicaci-n-n-cleo/15-CONTEXT.md` — las 15
  decisiones LOCKED del núcleo de publicación.
- `.planning/workstreams/web-builder/phases/15-borrador-y-publicaci-n-n-cleo/15-SECURITY.md` — 18/18
  amenazas cerradas. **T-15-16** y su fix explican por qué el write path valida por tipo de sección.
- `lib/landing/write.ts` — `parseLandingConfigForWrite`: el validador **estricto de escritura**
  (reject-on-invalid) + `SECTION_DATA_SCHEMAS` (Record exhaustivo por tipo de sección) + tope de
  256 KB. **Es el que el script tiene que usar.**
- `lib/landing/schema.ts` — `parseLandingConfig`: el validador **fail-safe de lectura** (degrada, no
  rechaza). **NO es el que va en el write path.** Acá también vive `safeLinkUrl` (allowlist http/https
  para TODAS las URLs del config).
- `lib/landing/editor-draft.ts` — `configsEqual` / `canonical`: el compare **canónico** que D-01/D-02
  necesitan. Un `JSON.stringify` crudo NO sirve: Postgres reordena las claves del `jsonb` y el compare
  daría siempre "distinto".
- `app/(dashboard)/web/_landing-actions.ts` — las 3 Server Actions del dueño
  (`saveLandingDraft` / `publishLanding` / `discardLandingDraft`). **El script no las usa** (es
  service-role, fuera del runtime web) pero define el otro lado del contrato: qué espera encontrar el
  dueño en su editor.

### Requisitos y roadmap
- `.planning/workstreams/web-builder/REQUIREMENTS.md` — SKILL-07 (el script escribe el borrador) y
  SKILL-08 (`--inspect` muestra borrador y publicado por separado).
- `.planning/workstreams/web-builder/ROADMAP.md` §Phase 16 — Goal, Success Criteria y Threat note.

### Reglas del proyecto
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — aislamiento por tenant (Core Value).
- `.claude/skills/convenciones-forjo/SKILL.md` — convenciones del repo.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`configsEqual` / `canonical`** (`lib/landing/editor-draft.ts`): resuelven D-01/D-02 **gratis**. Ya
  están testeados y son inmunes al reordenamiento de claves del `jsonb`. Aplicarlos por sección da el
  "qué secciones difieren" de D-02 sin escribir un diff-er.
- **`parseLandingConfigForWrite`** (`lib/landing/write.ts`): el validador estricto que el script
  necesita. Ya existe, ya valida el `data` por tipo de sección, ya tiene tope de tamaño.
- **El checkpoint humano pre-escritura**: ya está en el flujo del SKILL.md. D-01 **no inventa un gate
  nuevo** — cuelga el aviso del que ya hay.
- **`--inspect`**: ya existe y ya es read-only. SKILL-08 lo **extiende**, no lo crea.

### Established Patterns
- **Overwrite total e idempotente**: el script re-arma el config completo de forma determinista desde
  el payload. Re-correr con el mismo payload da el mismo resultado. Esta fase **no cambia eso** — solo
  cambia **a qué columna** va el resultado.
- **Service-role fuera del runtime web**: el script bypassa RLS por diseño, y por eso vive en Node,
  fuera de Next, con un humano en el medio. **Invariante, no preferencia.**
- **El pipeline de imágenes** (`rehostImage`): descarga → re-encode con sharp → sube a
  `landing-assets/{businessId}/`. Fail-safe. **Esta fase no lo toca.**

### Integration Points
- **La columna `landing_draft`** (migración 050, ya aplicada a prod): es donde escribe el script ahora.
- **El editor del dueño** (`/web`): es quien lee ese borrador y decide publicarlo. El circuito se
  cierra ahí. El estado que el dueño va a ver (`● Sin publicar` / `● Guardado — sin publicar` /
  `✓ Publicado`) se **deriva** del par (`landing_config`, `landing_draft`) — el script no lo controla
  directamente, lo condiciona con lo que escribe.

</code_context>

<specifics>
## Specific Ideas

- El copy del aviso de D-02, tal como se discutió:
  `⚠ El dueño tiene cambios sin publicar. Secciones que difieren de lo publicado: hero, gallery. Si seguís, los pisás.`
- **Ventana 15→16 (deuda temporal que esta fase cierra):** entre el deploy de la Phase 15 y el de
  ésta, el script sigue publicando al instante (escribe las dos columnas). El RESEARCH de la Phase 15
  ya lo marcó como Open Question: **no correr la skill sobre un negocio en esa ventana** si no querés
  que su web salga al aire sola.

</specifics>

<deferred>
## Deferred Ideas

- **Avisarle al dueño que su web está lista para revisar** (mail con Resend, badge en el panel, o
  ambos). Es una **capacidad nueva**, no una aclaración de esta fase. Y hoy apuntaría a una puerta que
  no existe: el editor sigue detrás de `CMS_ENABLED` y su entrada al panel recién aparece en la
  **Phase 17**. Re-evaluar ahí — o cuando el auto-armado con el pago del add-on lo haga necesario de
  verdad (ahí ya no hay un operador para avisar por WhatsApp).
- **Flag `--from-published`** para el modo edición (D-04b). Descartado por ahora: superficie de CLI
  para un caso que puede no aparecer nunca, y el dueño ya tiene "Descartar" en su editor.
- **Diff completo campo-por-campo** en el aviso de choque (D-02). Descartado: un diff-er de JSON para
  mantener, cuando en la práctica se decide con el nombre de la sección.

</deferred>

---

*Phase: 16-la-web-nace-como-borrador-skill-del-operador*
*Context gathered: 2026-07-13*
