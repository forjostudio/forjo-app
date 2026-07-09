# Requirements: Forjo App — Web Builder Ampliación + CMS (v0.16)

**Defined:** 2026-07-07
**Core Value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados. (v0.16 suma edición self-serve y movimiento premium SIN debilitar este invariante ni el motor de reservas.)

> Continúa el workstream `web-builder` desde **Phase 11** (v0.10 shipped Phases 6-10, archivado en `.planning/milestones/v0.10-*`). REQ-IDs continúan la numeración de las categorías existentes (SKILL, EDIT) y abren categorías nuevas (MOTION, RSV).

## v1 Requirements

Requirements del milestone v0.16. Cada uno mapea a una fase del roadmap. Actores: **dueño** (negocio que gestiona su landing desde el panel), **visitante** (usuario anónimo de `/[slug]`), **operador** (Forjo Studio corriendo la skill).

### Skill del operador — edición y fuentes (SKILL)

- [x] **SKILL-05**: El operador puede RETOCAR una landing existente sin rehacerla — la skill parte del payload guardado (`landing-payloads/<slug>.json`), aplica solo el cambio puntual pedido, muestra un checkpoint acotado (diff antes→después de los campos tocados) y re-escribe de forma idempotente.
- [x] **SKILL-06**: La skill arma el contenido desde múltiples fuentes en orden de confiabilidad — entrada estructurada del operador (la más confiable) y web existente del negocio como materia prima, además de Instagram best-effort; si una falla cae a la siguiente sin bloquearse. Todo el copy pasa por el `humanizador` y las imágenes van como rutas locales re-hosteadas (nunca hot-link).

### Premium motion en el renderer (MOTION)

- [x] **MOTION-01**: El envelope de `landing_config` acepta un campo `motion: 'none' | 'subtle' | 'premium'` (default `subtle`), por negocio y sin deploy; un valor ausente, inválido o roto cae a comportamiento estático actual (fail-safe, cero regresión).
- [x] **MOTION-02**: El visitante ve reveals de entrada (scroll-reveal) en las secciones editoriales, implementados CSS-first (scroll-driven animations donde el soporte alcance, si no un wrapper mínimo con IntersectionObserver), usando solo `transform`/`opacity`, ease-out ≤300ms.
- [x] **MOTION-03**: El hero y las imágenes soportan parallax sutil ligado al scroll (`transform: translateY`), nunca `background-attachment: fixed`; el LCP del hero no se degrada (la imagen sigue con carga priorizada).
- [x] **MOTION-04**: Con `prefers-reduced-motion` activo el motion se apaga y el render es estático; el motion envuelve solo secciones editoriales y NUNCA el contenedor del widget de reserva (booking caja negra).

### CMS self-serve en el panel (EDIT)

- [x] **EDIT-01**: El dueño edita los textos/copy de cada sección de su landing (Hero, About, CTA, etc.) desde un editor visual en el panel.
- [ ] **EDIT-02**: El dueño sube, reemplaza y borra imágenes por sección desde el panel — incluyendo la galería alrededor de la reserva (RSV) — re-hosteadas en el bucket `landing-assets` namespaced por `business_id`.
- [x] **EDIT-03**: El dueño reordena y prende/apaga las secciones habilitadas (`order`/`enabled`), dentro del set FIJO de secciones (sin layout libre).
- [x] **EDIT-04**: El dueño elige preset de tema y ajusta paleta/color primario y `motion` dentro del set permitido, viendo el resultado aplicado.
- [x] **EDIT-05**: Los cambios del CMS se persisten por un path autenticado owner-only (RLS por tenant + validación Zod del `landing_config`); nunca vía service-role ni endpoint de escritura anónimo en la superficie web.
- [x] **EDIT-06**: El dueño ve un preview de su landing con los cambios antes de que impacten en la página pública (WYSIWYG o preview lado a lado).
- [x] **EDIT-07**: El CMS se monta detrás de un feature flag y NO se expone a clientes en este milestone; su exposición en el nav + el flujo publish/go-live quedan explícitamente fuera de alcance.

### Fotos en la sección de reserva (RSV)

- [x] **RSV-01**: El landing puede mostrar fotos de la sucursal/servicio alrededor de la sección de reserva (header/intro/galería adyacente), configurables desde `landing_config`; sin contenido, la sección se comporta como hoy (empty-state, cero regresión).
- [x] **RSV-02**: El widget interactivo de reserva no se envuelve en `transform`/`overflow`/scroll-timeline ni se re-estiliza por dentro — disponibilidad, seña y el flujo de MercadoPago no regresionan (invariante caja negra verificado).

## v2 Requirements

Reconocidos pero diferidos — no entran en el roadmap de v0.16.

### Publicación / go-live del CMS (PUB)

- **PUB-01**: El CMS se expone a los clientes en el nav del dashboard (gating por plan).
- **PUB-02**: Flujo publish/go-live (draft → publicado) que conecta el editor con la landing pública viva.

### Track operativo (OPS)

- **OPS-01**: Sección de upsell "Tu página web" + `landing_status` (none → requested → paid → live) + aviso a Forjo.
- **OPS-02**: Base URL parametrizado por negocio (reemplaza `NEXT_PUBLIC_APP_URL` global en emails y `back_url` de MercadoPago).
- **OPS-03**: Dominio propio del cliente vía resolución por header `Host` en `proxy.ts` (requiere Vercel Pro).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Exponer el CMS a clientes + publish/go-live | El milestone construye el editor detrás de flag; "conectarlo a la app" (exposición + publish) es v2 (PUB-01/02) |
| Rediseño premium full-bleed del template (FU-2) | Pasada de estilo design-first aparte; no estructural (ver `forjo-webbuilder-followups.md`) |
| Alto del drawer de reservas en mobile (FU-1) | Polish del componente de booking, no del web-builder; follow-up chico aparte |
| Foto por servicio DENTRO del widget de booking | Requiere tocar el componente de reserva (caja negra); RSV solo suma fotos alrededor |
| Layout libre / drag-and-drop de secciones | Anti-feature: el set de secciones es FIJO (D3); EDIT-03 solo reordena/togglea |
| Inyectar HTML suelto de `web-scrolling` / `instagram-a-web` | Referencia de movimiento/scraping, no output literal (D5); todo React/Tailwind nativo |
| Sitio standalone vía API (bespoke total) | Milestone aparte (path standalone / jotalab) |

## Traceability

Qué fases cubren qué requirements.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SKILL-05 | Phase 11 | Mapped |
| SKILL-06 | Phase 11 | Mapped |
| MOTION-01 | Phase 12 | Mapped |
| MOTION-02 | Phase 12 | Mapped |
| MOTION-03 | Phase 12 | Mapped |
| MOTION-04 | Phase 12 | Mapped |
| RSV-01 | Phase 12 | Mapped |
| RSV-02 | Phase 12 | Mapped |
| EDIT-05 | Phase 13 | Mapped |
| EDIT-07 | Phase 13 | Mapped |
| EDIT-01 | Phase 14 | Mapped |
| EDIT-02 | Phase 14 | Mapped |
| EDIT-03 | Phase 14 | Mapped |
| EDIT-04 | Phase 14 | Mapped |
| EDIT-06 | Phase 14 | Mapped |

**Coverage:**

- v1 requirements: 15 total (SKILL: 2 · MOTION: 4 · EDIT: 7 · RSV: 2)
- Mapped to phases: 15 / 15 ✓
- Unmapped: 0
- Duplicates: 0

**Phase → Requirements:**

- **Phase 11** (Skill: edición + fuentes): SKILL-05, SKILL-06
- **Phase 12** (Premium motion + fotos en la reserva): MOTION-01, MOTION-02, MOTION-03, MOTION-04, RSV-01, RSV-02
- **Phase 13** (CMS foundation: write path owner-only + flag): EDIT-05, EDIT-07
- **Phase 14** (CMS editor UI): EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-06

---
*Requirements defined: 2026-07-07*
*Last updated: 2026-07-07 — roadmap creado, 15/15 requirements mapeados a Phases 11-14*
