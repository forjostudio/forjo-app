# Roadmap: Forjo App — Web Builder (workstream `web-builder`)

## Milestones

- ✅ **v0.9 Security Hardening** — Phases 1-5 (shipped 2026-06-17, workstream base)
- ✅ **v0.10 Web Builder** — Phases 6-10 (shipped 2026-06-23, archivado en `milestones/v0.10-*`)
- 🚧 **v0.16 Web Builder — Ampliación + CMS** — Phases 11-14 (in progress)

Detalle v0.9 archivado en [`milestones/v0.9-ROADMAP.md`](../../milestones/v0.9-ROADMAP.md). Detalle v0.10 archivado en [`milestones/v0.10-ROADMAP.md`](../../milestones/v0.10-ROADMAP.md).

**Milestone Goal (v0.16):** Elevar el web-builder sin cambiar el modelo (data-not-código, booking nativo, secciones FIJAS): darle al dueño un editor visual (CMS self-serve, detrás de flag) para gestionar su propia landing, sumar movimiento premium data-driven, permitir fotos alrededor de la reserva, y mejorar la skill del operador (modo edición + más fuentes). Con **cero regresión** y todos los invariantes de v0.9/v0.10 intactos: aislamiento multi-tenant (el CMS escribe por un path autenticado owner-only con RLS + Zod, NUNCA service-role ni endpoint anónimo en la web), booking = **caja negra** (sin transform/overflow/scroll-timeline alrededor del widget), fail-safe (`motion`/`landing_config` ausente o roto → estático actual), y `prefers-reduced-motion` off → estático SIEMPRE.

## Phases

**Phase Numbering:**

- El workstream `web-builder` continúa la numeración: v0.10 cerró en Phase 10, este milestone arranca en **Phase 11**.
- Integer phases (11, 12, …): trabajo planeado del milestone.
- Decimal phases (12.1, …): inserciones urgentes (marcadas INSERTED).

<details>
<summary>✅ v0.9 Security Hardening (Phases 1-5) — SHIPPED 2026-06-17</summary>

- [x] Phase 1: RLS Lockdown + Secret Isolation (5/5 plans, SEC-01) — completed 2026-06-16
- [x] Phase 2: MP Webhook Signature + Amount Check (2/2 plans, SEC-02) — completed 2026-06-16
- [x] Phase 3: Admin Endpoint Hardening (1/1 plan, SEC-03) — completed 2026-06-16
- [x] Phase 4: Plan Gating on Public Booking (1/1 plan, SEC-04) — completed 2026-06-17
- [x] Phase 5: Vitest Test Suite (2/2 plans, TEST-01) — completed 2026-06-17

</details>

<details>
<summary>✅ v0.10 Web Builder (Phases 6-10 + 8.1) — SHIPPED 2026-06-23</summary>

- [x] Phase 6: Schema, Storage & Safe Foundation (2/2 plans) — completed 2026-06-17
- [x] Phase 7: Renderer & Section Components (4/4 plans) — completed 2026-06-18
- [x] Phase 8: Theming (2/2 plans) — completed 2026-06-19
- [x] Phase 8.1: Re-diseño premium del template (full-bleed editorial) (INSERTED, 4/4 plans) — completed 2026-06-20
- [x] Phase 9: SEO, OG & Performance (3/3 plans) — completed 2026-06-22
- [x] Phase 10: Skill `forjo-web-builder` (3/3 plans) — completed 2026-06-23

Detalle completo archivado en [`milestones/v0.10-ROADMAP.md`](../../milestones/v0.10-ROADMAP.md).

</details>

### 🚧 v0.16 Web Builder — Ampliación + CMS (In Progress)

**Milestone Goal:** ver arriba. Build order LOCKED: skill (11) → motion + reserva media / schema (12) → CMS foundation (13) → CMS editor UI (14). El schema (`motion` + galería de reserva) existe ANTES del CMS porque el editor expone esos campos.

- [x] **Phase 11: Skill — modo edición + fuentes de contenido** - Retoque idempotente de landings existentes desde el payload guardado + fuentes de contenido en orden de confiabilidad (operador → web existente → IG best-effort) (completed 2026-07-07)
- [ ] **Phase 12: Premium motion + fotos en la reserva (renderer + schema)** - Campo `landing_config.motion` fail-safe con scroll-reveal/parallax CSS-first alrededor de las secciones editoriales + galería alrededor del widget de reserva; booking caja negra intacto
- [ ] **Phase 13: CMS foundation — write path owner-only + flag** - Path autenticado owner-only (RLS por tenant + Zod) para escribir `landing_config` desde el panel, detrás de feature flag, sin service-role ni endpoint anónimo
- [ ] **Phase 14: CMS editor UI** - Editor visual completo: copy/imágenes por sección (incl. galería RSV), reorden/on-off del set FIJO, tema/paleta/motion, y preview de los cambios

## Phase Details

### Phase 11: Skill — modo edición + fuentes de contenido

**Goal**: El operador de Forjo Studio puede retocar una landing ya publicada sin rehacerla y armar el contenido desde varias fuentes en orden de confiabilidad — todo dentro de la skill `forjo-web-builder`, sin tocar el renderer ni el schema. Pieza chica, standalone, cero riesgo de seguridad (reusa el write path service-role local ya existente de v0.10).
**Depends on**: Nothing nuevo (opera sobre la skill + `scripts/setup-landing.ts` de Phase 10, ya shipped)
**Requirements**: SKILL-05, SKILL-06
**Success Criteria** (what must be TRUE):

  1. El operador pide un cambio puntual ("cambiá el headline", "sumá 3 fotos a la galería") y la skill parte de `landing-payloads/<slug>.json`, aplica SOLO ese campo, muestra un checkpoint acotado (diff antes→después de lo tocado, no el config entero) y re-escribe idempotente (re-correr el mismo payload da el mismo resultado).
  2. Si no existe el payload guardado (landing anterior a la persistencia de payloads), la skill reconstruye el estado con `npm run setup:landing -- --inspect <slug>`, avisa que va a re-escribir el config completo y pide al operador lo que el inspect no devuelve (el copy).
  3. La skill arma el contenido probando fuentes en orden — entrada estructurada del operador (la más confiable) → web existente del negocio → Instagram best-effort — y si una falla cae a la siguiente sin bloquearse.
  4. Todo el copy nuevo pasa por el `humanizador` y las imágenes se referencian como rutas locales re-hosteadas por el script (nunca hot-link al CDN de origen).

**Threat note**: Bajo riesgo. La skill NO abre superficie web nueva — sigue escribiendo por el script local service-role de v0.10 (SKILL-04), con el mismo checkpoint humano pre-escritura. El único cuidado: el diff acotado no debe filtrar secretos del payload (el payload no contiene secretos de tenant, solo copy/imágenes/tema).

**Plans**: 2/2 plans complete

- [x] 11-01-PLAN.md — Artefactos de código: extender `--inspect` (read-only, D-04) + copiar `scripts/instagram-cosechar.py` (D-03)
- [x] 11-02-PLAN.md — Skill: sección MODO EDICIÓN (SKILL-05) + paso FUENTES DE CONTENIDO con pipeline instaloader (SKILL-06)

### Phase 12: Premium motion + fotos en la reserva (renderer + schema)

**Goal**: El visitante ve movimiento premium data-driven (scroll-reveal + parallax sutil) en las secciones editoriales de la landing, y el dueño puede mostrar fotos de sucursal/servicio alrededor de la sección de reserva — todo desde `landing_config`, con el widget de reserva como caja negra intocable y cero regresión. Este es el trabajo de SCHEMA que habilita al CMS: el campo `motion` y la galería de reserva viven en `schema.ts`/`landing_config` antes de que el editor (Phase 14) los exponga.
**Depends on**: Phase 11 (orden del milestone; técnicamente independiente de la skill, pero encadena el workstream)
**Requirements**: MOTION-01, MOTION-02, MOTION-03, MOTION-04, RSV-01, RSV-02
**Success Criteria** (what must be TRUE):

  1. El envelope de `landing_config` acepta `motion: 'none' | 'subtle' | 'premium'` (default `subtle`), por negocio y sin deploy; un valor ausente, inválido o roto cae al render estático actual vía `parseLandingConfig` (fail-safe, cero regresión).
  2. El visitante ve reveals de entrada (scroll-reveal, ease-out ≤300ms, solo `transform`/`opacity`) y parallax sutil del hero/imágenes (`transform: translateY`, nunca `background-attachment: fixed`) en las secciones editoriales; el LCP del hero no se degrada (imagen sigue `priority`).
  3. Con `prefers-reduced-motion` activo el motion se apaga y el render es estático; el motion envuelve SOLO secciones editoriales y NUNCA el contenedor de `BookingClient`.
  4. El landing muestra la galería de sucursal/servicio (header/intro/galería adyacente) configurable desde `landing_config` alrededor de la sección de reserva; sin contenido, la sección se comporta como hoy (empty-state, cero regresión).
  5. El widget interactivo de reserva NO queda envuelto en `transform`/`overflow`/scroll-timeline ni se re-estiliza por dentro — disponibilidad, seña y el flujo de MercadoPago no regresionan (invariante caja negra verificado con vaul/sonner/react-day-picker).

**Plans**: 2 plans

- [ ] 12-01-PLAN.md — Schema (`motion` + `rsvData`) + `normalizeMotion` + motor de motion CSS-first en `.frj-site` + `data-motion`/clases en el renderer y editoriales + hero a `preload` (MOTION-01..04)
- [ ] 12-02-PLAN.md — `RsvStrip` (header + strip horizontal, empty-state safe) montado como hermano del widget + checkpoint funcional de la caja negra (reserva con/sin seña) (RSV-01/02)

**UI hint**: yes

**Threat note**: Riesgo = regresión, no aislamiento. El motion y la galería RSV comparten el mismo peligro que Pitfall 4/8 de v0.10: envolver el booking en transform/overflow rompe vaul/date-picker/toasts. Contrato de props de `BookingClient` congelado; el `<section id="reservar">` solo puede llevar la galería FUERA del contenedor interactivo. Verificar: `landing_config` null → legacy byte-idéntico, `motion` roto → estático, reserva real (con y sin seña) sin diferencia.

### Phase 13: CMS foundation — write path owner-only + flag

**Goal**: Existe un path autenticado owner-only para que el dueño escriba su propio `landing_config` desde el panel — con RLS por tenant + validación Zod del config completo — detrás de un feature flag, sin exponerse a clientes y sin flujo publish/go-live. Es la capa de persistencia segura sobre la que se monta el editor (Phase 14); se verifica de forma independiente antes de construir UI encima. **Fase security-sensitive: toca el invariante multi-tenant (Core Value).**
**Depends on**: Phase 12 (el schema `motion` + galería RSV ya existe; el write path valida el config final que definen 12 y v0.10)
**Requirements**: EDIT-05, EDIT-07
**Success Criteria** (what must be TRUE):

  1. Un dueño autenticado puede persistir su `landing_config` por un path owner-only (server action o route handler con sesión), y el config se valida con el Zod compartido (`parseLandingConfig`) antes de escribir — un config inválido se rechaza sin corromper el guardado ni tirar 500.
  2. La escritura pasa por RLS por tenant: un dueño NO puede escribir el `landing_config` de otro negocio (verificado por un test de aislamiento con dos sesiones anon autenticadas, al estilo TEST-01); nunca se usa service-role ni un endpoint de escritura anónimo en la superficie web.
  3. El CMS vive detrás de un feature flag y NO aparece en el nav del dashboard para clientes en este milestone; su exposición + el flujo publish/go-live quedan explícitamente fuera de alcance (EDIT-07 es el borde).

**Plans**: TBD

**Threat note** (SECURITY-SENSITIVE — flag esta fase para secure-phase): (a) **Aislamiento de tenant**: el write path debe ser owner-only por RLS + `.eq('business_id', …)` de la sesión; nunca confiar en un `business_id` del body. (b) **Sin service-role en la web**: prohibido `createAdminClient()` en cualquier route/action que escriba config desde el panel — solo el cliente de sesión (anon + cookies, RLS activo). (c) **Validación Zod estricta**: `safeParse` + `.strip()` de claves desconocidas antes de escribir, para no re-abrir la fuga de secretos que v0.9 cerró ni inyectar campos no permitidos. (d) **Feature flag**: el flag apaga la ruta entera; verificar que un cliente sin el flag no llega ni al render del editor. El test de aislamiento anon-key de v0.9/v0.10 se extiende al write path.

### Phase 14: CMS editor UI

**Goal**: El dueño edita toda su landing desde un editor visual en el panel — copy por sección, imágenes (subir/reemplazar/borrar, incluida la galería alrededor de la reserva), reorden y on/off del set FIJO de secciones, preset de tema + paleta + `motion` — y ve un preview de los cambios antes de que impacten. Todo escribe por el path owner-only de la Phase 13.
**Depends on**: Phase 13 (usa el write path owner-only + flag) y Phase 12 (expone `motion` + galería RSV en el editor)
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-06
**Success Criteria** (what must be TRUE):

  1. El dueño edita los textos/copy de cada sección (Hero, About, CTA, etc.) desde el editor y ve el cambio reflejado.
  2. El dueño sube, reemplaza y borra imágenes por sección — incluida la galería alrededor de la reserva (RSV) — re-hosteadas en el bucket `landing-assets` namespaced por `business_id` (nunca escribe fuera de su prefijo `{business_id}/`).
  3. El dueño reordena y prende/apaga las secciones habilitadas (`order`/`enabled`) dentro del set FIJO (sin layout libre / drag-and-drop de secciones nuevas).
  4. El dueño elige preset de tema y ajusta paleta/color primario y `motion` dentro del set permitido, viendo el resultado aplicado.
  5. El dueño ve un preview de su landing con los cambios (WYSIWYG o preview lado a lado) antes de persistir por el path owner-only.

**Plans**: TBD

**UI hint**: yes

**Threat note**: Hereda el invariante de la Phase 13 (toda escritura por el path owner-only, cero service-role, Zod). Riesgo propio: el **upload de imágenes** debe escribir SOLO bajo `{business_id}/` en `landing-assets` (RLS owner-write del bucket, ya existente de v0.10) — un intento fuera del prefijo del dueño se rechaza. El preview no debe exponer datos de otro tenant. Booking sigue caja negra dentro del preview.

## Progress

**Execution Order:**
Phases execute in numeric order: 11 → 12 → 13 → 14

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 6. Schema, Storage & Safe Foundation | v0.10 | 2/2 | Complete | 2026-06-17 |
| 7. Renderer & Section Components | v0.10 | 4/4 | Complete | 2026-06-18 |
| 8. Theming | v0.10 | 2/2 | Complete | 2026-06-19 |
| 8.1 Re-diseño premium del template | v0.10 | 4/4 | Complete | 2026-06-20 |
| 9. SEO, OG & Performance | v0.10 | 3/3 | Complete | 2026-06-22 |
| 10. Skill `forjo-web-builder` | v0.10 | 3/3 | Complete | 2026-06-23 |
| 11. Skill — modo edición + fuentes | v0.16 | 2/2 | Complete    | 2026-07-07 |
| 12. Premium motion + fotos en la reserva | v0.16 | 0/2 | Not started | - |
| 13. CMS foundation — write path owner-only + flag | v0.16 | 0/TBD | Not started | - |
| 14. CMS editor UI | v0.16 | 0/TBD | Not started | - |

---
*Next: `/gsd:plan-phase 11 --ws web-builder`*
