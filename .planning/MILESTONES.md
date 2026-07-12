# Milestones

## v0.17 Landing Polish + CMS usable (Shipped: 2026-07-12)

**Sin fases GSD:** 23 commits de polish reactivo sobre feedback de UAT, directo a `main`. Cero migraciones. 40 archivos, +3740/−296. Suite: 484/484.

**Key accomplishments:**

- **Motion reescrito a IntersectionObserver.** Se REVISITÓ el invariante "CSS-first, sin JS" de la Phase 12: `animation-timeline: view()` es baseline **solo Chromium**, así que el motion era invisible en Safari/Firefox/iOS — la mitad de los visitantes. Verificado en iPhone después del cambio.
- **Lightbox de fotos** (galería, strip RSV, about): carrusel scroll-snap con peek, swipe nativo, cierre con el botón atrás del celular. Modelo "el scroll manda, el índice lo sigue" — que además disuelve el bug de iOS donde el scroll programático peleaba con el snap mandatory y las flechas quedaban muertas. Secciones siguen siendo RSC (delegación por data-attributes) y el overlay se portea a `document.body` (booking = caja negra por construcción).
- **La skill emite `motion: 'premium'` + fotos del strip de reserva.** El renderer soportaba las dos features desde v0.16 pero `buildLandingConfig` nunca las escribía → toda web armada por la skill salía ESTÁTICA y sin strip. Modo de falla silencioso: no rompía nada, la feature simplemente no existía para negocios nuevos.
- **El landing declara y APLICA su propio contexto visual.** Antes heredaba tema/fuente/modo del ancestro: en el preview del CMS tomaba el tema del PANEL (la vista previa mentía) y en la web pública tomaba el claro/oscuro del VISITANTE. Requirió tres piezas: `[data-theme='forjo']` como selector real (forjo era "la ausencia del atributo", que solo funciona en `<html>`), `.frj-site` aplicando `background/color/font-family` (declarar los tokens no alcanza: el fondo se pinta en `body` y la fuente se computa en `html`), y neutralizar las reglas descendientes de `themes.css` que se filtraban al landing anidado.
- **CMS: ajustes de portada** (opacidad de la foto + tamaño de título/bajada/subtítulo), **selector de tipografía**, **modo claro/oscuro**, **botones editables en el CTA** (con allowlist de protocolo: `javascript:` parsea como URL válida y estos valores van a un `<a href>` público). Se QUITÓ "Color principal" (pisaba el acento de cualquier paleta y dejaba los swatches decorativos) con limpieza del override al cargar.
- **Gating del CMS por `has_web_custom`** (PUB-01): el gate real está en la Server Action, no en la page — gatear solo la page es cosmético, un POST directo la saltea. El trigger `businesses_protect_admin_columns` revierte el flag ante cualquier UPDATE no-service_role → el dueño no puede auto-otorgárselo.
- **Botón flotante de WhatsApp** (sticky, no fixed: un fixed se escaparía del marco del preview, y crear un containing block está prohibido porque rompe los overlays del booking) y **badge de reCAPTCHA oculto** con la atribución de texto obligatoria por el ToS de Google.

---

## v0.16 Web Builder — Ampliación + CMS (Shipped: 2026-07-10)

**Phases completed:** 4 phases, 9 plans, 11 tasks

**Key accomplishments:**

- **Phase 11 — Skill CMS ampliada:** modo edición idempotente (retoque desde `landing-payloads/<slug>.json` con checkpoint diff) + fuentes de contenido (operador estructurado → web existente → Instagram best-effort). SECURED 7/7.
- **Phase 12 — Premium motion + fotos en la reserva:** motor de movimiento CSS-first (`animation-timeline: view()`, scroll-reveal + parallax, fail-safe a estático, `prefers-reduced-motion`) + galería de fotos de la sucursal alrededor del widget de reserva (booking = caja negra).
- **Phase 13 — CMS foundation (write path):** Server Action owner-only `saveLandingConfig` con session client (RLS por tenant), validación Zod estricta reject-on-invalid, y kill-switch global `CMS_ENABLED` fail-closed — sin migración, sin service-role en la web, sin dependencia nueva. SECURED 7/7.
- **Phase 14 — CMS editor UI:** editor visual completo (copy por sección, upload de imágenes a `landing-assets/{business_id}/`, reorden/on-off del set fijo de 8, tema/paleta/primary/motion, preview en vivo del `LandingRenderer` real) — detrás del flag `CMS_ENABLED`, sin exposición en nav ni publish/go-live (v2). Verificado 5/5 SCs, SECURED 16/16, UAT de upload OK en preview.
- **Shipped a prod** (`gestion.forjo.studio`) con el CMS **invisible por flag** (exposición + publish/go-live = v2, PUB-01/02). Cero migraciones nuevas en el milestone.

---

## v0.15 Gestión rebrand (Shipped: 2026-07-06)

**Phases completed:** 3 phases, 9 plans, 11 tasks

**Key accomplishments:**

- Sidebar del dashboard reorganizado de lista plana a 5 grupos data-driven (PANEL·AGENDA·GESTIÓN·REPORTES·AJUSTES) filtrados por vertical, behavior-frozen, sin tocar lib/verticals.ts.
- Cobros · Integraciones · Notificaciones migraron de Configuración al hub Negocio (4 tabs client-side) reasignando qué TabsList/TabsContent muestra cada `view` del mega-componente SettingsClient, con el retorno del OAuth de MercadoPago reruteado a /negocio → Integraciones, sin tocar el cuerpo de ninguna tab ni la validación CSRF del callback.
- [SCOPE BOUNDARY] Errores eslint pre-existentes en `settings-client.tsx`
- Task 1 — Endpoint `POST /api/clients/create` (TDD)
- papaparse instalada + `lib/clients-import.ts` (parseo RFC4180, des-escapado anti-fórmula round-trip lossless, validación por fila reusada y dedup idéntica al panel) + `buildClientInsert` parametrizado con `origin` retro-compatible, todo respaldado por 20 tests.
- Dos route handlers autenticados del import (D-03): `preview` parsea+valida+deduplica y devuelve conteos SIN escribir nada (SC-1), y `confirm` RE-recibe el mismo archivo, RE-PARSEA (no confía en la preview) e inserta solo las importables con `origin='importado'` forzado server-side vía anon+RLS (SC-2/SC-4) — ambos con business_id de la sesión y guards de tamaño/extensión/header/filas antes de tocar la DB.
- El botón "Importar CSV" y el Dialog ancho de 4 etapas (upload → preview → confirmando → resumen) en `/clients`: sube el archivo a `/preview` (SC-1, nada se escribe), muestra contadores + las filas con error marcadas por fill+border+icono+texto, re-postea el mismo File a `/confirm` con anti-doble-submit y cierre bloqueado, y al cerrar el resumen re-fetchea la lista con los importados badge "Importado" — cerrando DATA-03 end-to-end con reuso puro del design system (cero componentes/deps de UI nuevas).

---

## v0.14 Onboarding (Shipped: 2026-07-04)

**Phases completed:** 3 phases, 7 plans, 16 tasks

**Key accomplishments:**

- El paso "Horarios de atención" del onboarding ahora inserta `time_blocks` (fuente única que ya leen panel y booking) con soporte de horario partido, en vez de escribir la tabla huérfana `business_hours`.
- El endpoint del agente (/api/agent/context) migra de business_hours a time_blocks vía mapTimeBlocks, agrupando por día con horario partido y preservando idéntico el contrato del HANDOFF hacia el bot.
- Migración 046 (primera destructiva del repo) que dropea `business_hours` + `public_business_hours`, schema.sql regenerado sin la tabla/vista/policy/grants, y tipo `BusinessHour` removido — deja `time_blocks` como fuente única de horarios (SCHED-02).
- Wizard de alta reworkeado en un único archivo cliente: pasos opcionales salteables ("Omitir por ahora"), gating relajado a sólo el paso Negocio, stepper dinámico que oculta Profesionales en el vertical canchas, header de Servicios siempre visible con validación inline onBlur y precio 0 permitido, más el lockup de marca Forjo Gestión en el header.
- Migración 047 de backfill de `businesses.vertical` desde `type` + rework de `lib/verticals.ts` (label belleza, `types` vacíos, dead code borrado, helpers `RUBRO_PLACEHOLDERS`/`getVerticalLabel`), con test que congela el CASE.
- Selector unificado de 4 rubros (VerticalKey) + campo libre "¿A qué se dedica tu negocio?" siempre visible con placeholder por rubro + leyenda, en onboarding y Configuración → Negocio; rubro→vertical, texto libre→type; auto-hide de canchas y gating re-keyeados a la VerticalKey elegida.
- El subtítulo de categoría del booking público muestra `business.type` (texto libre) si existe, o el label del rubro (`getVerticalLabel`) como fallback cuando está vacío (D-03), en los dos clients gemelos, con auto-escape JSX.

---

## v0.13 Vertical Canchas (Shipped: 2026-07-02)

**Phases completed:** 3 phases, 6 plans, 5 tasks

**Key accomplishments:**

- 1. [Rule 3 - Blocking] Record<VerticalKey> exhaustivos en lib/landing/seo.ts exigían la clave 'canchas'
- 1. [Rule 1 — Bug] agenda_spaces se insertan row-a-row en vez de en batch
- 1. [Rule 3 — Blocking] El ternario del branch no-canchas envolvía dos hermanos JSX sin wrapper
- Vista acotada `public_canchas` (migr. 044, molde `public_services` sin `security_invoker`, sin `service_id`) + scaffold de integración `canchas-booking.test.ts` (ALQUILER-01/03/04 + anti-tampering + cross-tenant) y el caso secuencial de exclusión por espacio (ALQUILER-02) reusando el motor v0.12.
- El create público, en el caso canchas, deriva el service_id desde `professionals.service_id` server-side (re-validado por `business_id`) e ignora cualquier `serviceId` del body — precio y duración salen del service propio de la cancha, con el path legacy byte-idéntico.
- Flujo público de reserva de canchas (`canchas-booking-client.tsx`, 3 pasos: Cancha → Fecha y hora → Tus datos), hermano visual del BookingClient, gateado por vertical en `/[slug]` (legacy + LandingRenderer) leyendo `public_canchas` y reusando availability/create/pago con `professionalId=cancha.id` sin `serviceId` (D-03). Precio y total = el precio propio de la cancha (ALQUILER-04). Tasks 1-2 ejecutadas y verificadas; Task 3 es un checkpoint humano visual pendiente.

---

## v0.12 Motor de Reservas (Shipped: 2026-06-30)

**Phases completed:** 3 phases, 14 plans, 28 tasks

**Key accomplishments:**

- Migración 040 que agrega policies `FOR INSERT WITH CHECK (business_id ∈ negocios del dueño)` explícitas para `appointments` y `clients` (defensa en profundidad de tenant), validada localmente con `supabase db reset` sobre PG17, con `schema.sql` regenerado y MANUAL-04 diferido a v2.
- Form compartido `NuevoTurnoForm` (Dialog en desktop / Drawer vaul en mobile) con combobox de cliente + crear-inline, cableado en Turnos y Agenda, que crea el turno vía el endpoint autenticado `/api/appointments/create` (reemplaza el insert client-side directo) y refresca la vista.
- Migración 041 capacity-aware (índice 011 con seat + EXCLUDE 013 condicional a NOT is_group) y RPC `book_slot_atomic` con `pg_advisory_xact_lock` — validada con `supabase db reset` local PG17, cero regresión cupo 1.
- `createAppointmentCore` ahora crea turnos vía `supabase.rpc('book_slot_atomic')` con anti-sobrecupo atómico, mapea `slot_full` (409) por separado de `slot_taken`, y hace el re-check JS capacity-aware — más un fix de la migración 041 que preserva la cero-regresión de cupo 1.
- `/api/booking/availability` ahora cuenta ocupantes por slot contra `time_blocks.capacity` y devuelve solo `full: string[]` (horarios llenos) junto al `busy` existente — el público ve disponible/lleno y JAMÁS cuántos lugares quedan (D-06 LOCKED); `booking-client` saltea los slots en `full`.
- Campo "Cupo" (capacity) por bloque en el editor de horarios de la agenda y roster del admin (overlay Dialog desktop / Drawer mobile con contador N/cupo + lista nombre·contacto·estado), reusando dialog/drawer ya instalados y sin tocar el aislamiento por tenant.
- `test/concurrency.test.ts` pasa de scaffold (3 `expect.fail`) a 4 tests reales verdes contra Supabase local con 041 aplicada: CONC-01 prueba que dos altas concurrentes sobre el último lugar de un cupo=2 resuelven 1 ok + 1 `slot_full` y dejan exactamente 2 filas en la DB (no 3); CONC-02 fija que cupo=1 sigue dando `slot_taken` (no `slot_full`); CUPOS-03 que cupo=N admite N y rechaza el excedente; CUPOS-02 que `/api/booking/availability` solo devuelve `{ ok, busy, full }` sin filtrar lugares restantes. Suite completa: 301 tests verdes (+4), cero regresión.
- Modelo de datos de espacios físicos (spaces + puente agenda_spaces, RLS por tenant sin read anon) y extensión in-place de book_slot_atomic con advisory lock por espacio + EXISTS anti-solape cross-bucket — la exclusión acoplada vive en la DB, dentro de la misma tx SECURITY DEFINER que ya serializa el anti-sobrecupo de Phase 2.
- Cierre del READ PATH de la exclusión acoplada por espacio compartido (ESPACIO-02): `/api/booking/availability` ahora refleja el bloqueo cruzado bidireccional — un slot aparece ocupado (`busy`) si una agenda hermana que comparte ≥1 espacio físico tiene un turno solapado — manteniendo D-06 (`{ ok, busy, full }` sin filtrar detalle interno), más un re-check de espacio (UX) en `booking-core` que rechaza temprano con `slot_taken` antes de entrar al RPC (cuya autoridad atómica del Plan 01 se preserva intacta).
- Tabla de proyección `appointment_spaces` (una fila por turno×espacio) con su propio EXCLUDE gist `appointment_spaces_no_overlap` y los triggers que la pueblan/limpian desde `appointments` — el único backstop declarativo y atómico cross-espacio: si el advisory lock del Plan 03-01 tuviera un bug, el insert de la proyección choca con 23P01 y aborta toda la transacción del appointment.
- Test Vitest determinista que prueba que dos reservas en paralelo sobre agendas distintas que comparten un espacio físico resuelven exactamente 1 ok + 1 slot_taken, verificado contra el estado real de la DB; más los fixtures seedSpace/seedAgendaSpace/seedProfessional.

---

## v0.11 Consola CRM (Shipped: 2026-06-25)

**Phases completed:** 6 phases, 23 plans, 42 tasks

**Key accomplishments:**

- 1. [Rule 3 - Blocking] Typing del mock para tsc strict
- Patrón de doble confirmación reutilizable (type-to-confirm escalonado sobre el Dialog de @base-ui/react) con lógica de gating en helpers puros testeados, más el script local que otorga is_admin en app_metadata vía la Admin API de Supabase.
- Migración 032 (plan_prices ARS + add-on flags + cierre del agujero RLS A5 vía trigger) escrita, libs puras de KPIs/alertas/trial/filtro testeadas en verde (20/20), y 'suspended' habilitado en set-plan — PAUSADO en el checkpoint humano de aplicar la migración a Supabase.
- Las 6 server actions del CRM (`'use server'`, primer patron de actions del repo) que cambian plan, suspenden/reactivan, extienden trial, togglean add-ons y editan precios — cada una con `requireAdmin()` primera linea + zod + `logAudit()` — mas el corte REAL de `'suspended'` (booking 403 + dashboard redirige a `/suspendido`).
- Dashboard `/admin` con 4 KPI cards reales (computeKpis) + alertas clickeables (deriveAlerts), y directorio `/admin/negocios` buscable/filtrable que SIEMPRE muestra los suspendidos marcados — todo leído server-side con service-role sin que el cliente cruce, más los 3 componentes nuevos (StatusBadge/KpiCard/AlertList) y el sidebar cableado.
- La ficha `/admin/negocios/[id]` (contacto + suscripción MP + acciones plan/suspender/reactivar/extender-trial + 2 toggles de add-ons) y el editor `/admin/planes` (3 cards de plan editables en ARS), donde cada acción peligrosa pasa por el ConfirmDialog escalonado de Phase 1 al tier locked y dispara la server action correspondiente de Plan 02 — más los 3 componentes de acción nuevos (AddonToggle sobre @base-ui/react/switch, ExtendTrialDialog con presets+calendario, PlanPriceCard con type-to-confirm CONFIRMAR).
- Backbone server-side de la impersonación read-only: action de entrada que audita el motivo (validado server-side) y navega sin mutar, capa de lectura cross-tenant service-role acotada por `business_id` centralizada en un helper, y loader RSC `/ver` que audita CADA carga y aplica la paleta del negocio escapando del shell dark del CRM.
- 1. [Rule 1 - Bug] Toast de error espurio al confirmar "Ver como cliente" (commit `8723f4f`)
- Migración 034 con 6 tablas CRM admin-only + VIEW crm_timeline (security_invoker), STAGES como única fuente de verdad de las 5 etapas, filtro de tags OR, schemas zod de Wave 2, y _tag-actions.ts como catálogo de tags compartido
- 1. [Rule 2 - Missing critical functionality] Lectura de notas con id para el deleteNote
- 1. [Rule 1 - Bug] Lógica del mock del test del lead convertido corregida en GREEN
- Migración SQL aplicada a mano (RESUELTO).
- createDeal refresca el board al instante, botón "Marcar ganado" (markWon optimista-revertible), header con "$ ganados" real server-side y tarjetas que muestran el nombre del deal (d.title) — todo sin paquetes nuevos.
- 1. [Rule 3 - Blocking] Import de `toast` faltante en ficha-client.tsx
- 1. [Rule 1 - Bug] Import muerto `toast` en la ficha tras borrar handlers de tags
- Task 1 — Sección "Asignadas" en TagManagerDialog (gap test 7)
- Lib pura crm-reports.ts (MRR/ARPA/embudo/churn/ranking/snapshot reusando computeKpis + STAGES) más la tabla mrr_snapshots admin-only por RLS con seed y autoalimentación mensual idempotente desde el cron diario.
- Pantalla `/admin/reportes` (RSC con split session/service-role + reportes-client con 5 KPIs y 4 charts recharts) reproduciendo el mock LOCKED 06-reportes.png sobre el shell dark del CRM, cerrando RPT-01 (MRR/revenue) y RPT-02 (conversión por etapa + ranking).
- Tablas conversations/messages con RLS mixta owner-OR-admin (migración 038, aplicada a Supabase), libs puras testeables, y los tres endpoints del agente (ingest fail-closed e idempotente, context con shape del HANDOFF, state para el polling de pausa) + takeover auditado.
- Bandeja /admin/bandeja: RSC con lectura RLS-gated (session client) + cliente 2-paneles (lista + thread + estados IA/Vos/Sin asignar + filtros Todas/WhatsApp + Tomar conversación auditado + composer deshabilitado), fiel a 07-bandeja.png, cero service-role en la superficie, cero deps nuevas.

---

## v0.10 Web Builder (Shipped: 2026-06-23)

**Phases completed:** 6 phases, 18 plans, 32 tasks

**Key accomplishments:**

- Parser fail-safe de landing config (Zod v4 + DEFAULT seguro + parseLandingConfig total) cableado en el path vivo de /[slug] sin cambiar el render, con suite de tests creds-free que prueba la invariante null != DEFAULT.
- Migration 030 adds the `landing_config` jsonb column, extends `public_businesses` to 19 columns (no secrets), and creates the public-read/owner-write `landing-assets` bucket — proven safe by 3 new anon-key isolation tests (D-10a/b/c) running green against the live DEV DB.
- Logica pura de orden/Hours/empty-state extraida a lib/landing/derive.ts (20 tests Vitest), tipos data por-seccion fail-safe en el schema sin romper el envelope F6, y next/image habilitado para el bucket Supabase.
- Cuatro secciones de la landing como React Server Components puros (Hero, Services, Hours, Location), theme-ready solo con tokens, que derivan su contenido de la data ya fetcheada y consumen los helpers/predicados de 07-01.
- `<LandingRenderer>` RSC que compone las 7 secciones + booking por order/enabled, cableado en `/[slug]` con passthrough legacy byte-idéntico, más auto-scroll del funnel de reserva pedido por el usuario.
- 1. [Rule 3 - Blocking] Cast de tipo en layout.tsx
- JetBrains Mono via next/font + capa de tokens premium derivados (color-mix) scopeada a `.frj-site` + 5 primitivas editoriales RSC (Kicker/GhostIndex/SectionShell/PillButton/NoiseField) listas para la Wave 2, sin tocar el motor de tema ni el dashboard/CRM.
- 1. [Rule 1 - Bug] Clase `<em>` contradictoria en About
- Las 4 secciones restantes del landing reescritas al estandar full-bleed editorial del mock: grid asimetrico CLS-safe, mapa de fallback premium (grid-lines + pin), lista de horarios display+mono con today/cerrado, y bookend de color de cierre con pills — reusando primitivas/tokens de 08.1-01/02, cero hex, firmas y empty-states intactos.
- Gate automatizado verde y re-diseño premium aprobado visualmente por el operador, con un único ajuste pedido (hero a full-screen).
- Tres helpers puros y fail-safe (verticalToSchemaType, buildMetadataParts, buildJsonLd) que derivan title/description y un objeto JSON-LD LocalBusiness por-negocio, con 19 unit tests Vitest verdes.
- generateMetadata por-negocio (title/desc/OG/twitter/metadataBase fail-safe) en layout.tsx + JSON-LD LocalBusiness escapado y emitido en ambas ramas de page.tsx, sin queries nuevas.
- NO completable por el agente.
- buildLandingConfig (materia prima → LandingConfig con campos exactos por sección, sin booking ni lista de servicios) y recommendTheme (marca → preset+overrides acotado al set del motor + isSafeColor), ambos puros, con 22 unit tests Vitest que garantizan el gate parseLandingConfig.

---

## v0.10 v0.10 (Shipped: 2026-06-23)

**Phases completed:** 6 phases, 18 plans, 32 tasks

**Key accomplishments:**

- Parser fail-safe de landing config (Zod v4 + DEFAULT seguro + parseLandingConfig total) cableado en el path vivo de /[slug] sin cambiar el render, con suite de tests creds-free que prueba la invariante null != DEFAULT.
- Migration 030 adds the `landing_config` jsonb column, extends `public_businesses` to 19 columns (no secrets), and creates the public-read/owner-write `landing-assets` bucket — proven safe by 3 new anon-key isolation tests (D-10a/b/c) running green against the live DEV DB.
- Logica pura de orden/Hours/empty-state extraida a lib/landing/derive.ts (20 tests Vitest), tipos data por-seccion fail-safe en el schema sin romper el envelope F6, y next/image habilitado para el bucket Supabase.
- Cuatro secciones de la landing como React Server Components puros (Hero, Services, Hours, Location), theme-ready solo con tokens, que derivan su contenido de la data ya fetcheada y consumen los helpers/predicados de 07-01.
- `<LandingRenderer>` RSC que compone las 7 secciones + booking por order/enabled, cableado en `/[slug]` con passthrough legacy byte-idéntico, más auto-scroll del funnel de reserva pedido por el usuario.
- 1. [Rule 3 - Blocking] Cast de tipo en layout.tsx
- JetBrains Mono via next/font + capa de tokens premium derivados (color-mix) scopeada a `.frj-site` + 5 primitivas editoriales RSC (Kicker/GhostIndex/SectionShell/PillButton/NoiseField) listas para la Wave 2, sin tocar el motor de tema ni el dashboard/CRM.
- 1. [Rule 1 - Bug] Clase `<em>` contradictoria en About
- Las 4 secciones restantes del landing reescritas al estandar full-bleed editorial del mock: grid asimetrico CLS-safe, mapa de fallback premium (grid-lines + pin), lista de horarios display+mono con today/cerrado, y bookend de color de cierre con pills — reusando primitivas/tokens de 08.1-01/02, cero hex, firmas y empty-states intactos.
- Gate automatizado verde y re-diseño premium aprobado visualmente por el operador, con un único ajuste pedido (hero a full-screen).
- Tres helpers puros y fail-safe (verticalToSchemaType, buildMetadataParts, buildJsonLd) que derivan title/description y un objeto JSON-LD LocalBusiness por-negocio, con 19 unit tests Vitest verdes.
- generateMetadata por-negocio (title/desc/OG/twitter/metadataBase fail-safe) en layout.tsx + JSON-LD LocalBusiness escapado y emitido en ambas ramas de page.tsx, sin queries nuevas.
- NO completable por el agente.
- buildLandingConfig (materia prima → LandingConfig con campos exactos por sección, sin booking ni lista de servicios) y recommendTheme (marca → preset+overrides acotado al set del motor + isSafeColor), ambos puros, con 22 unit tests Vitest que garantizan el gate parseLandingConfig.

---

## v0.9 Security Hardening (Shipped: 2026-06-17)

**Phases completed:** 5 phases, 11 plans, 20 tasks

**Key accomplishments:**

- Migración aditiva 027 (tabla business_secrets owner-only + vistas public_services/public_business_hours + copia de datos), más el helper server-only getBusinessSecrets() con fallback de transición y el split de secretos fuera de la interface Business. PAUSADO en el checkpoint [BLOCKING] para aplicar 027 a mano en Supabase.
- Los 6 archivos de booking/cancelación (recaptcha, booking/create, cancel/[token], cron/cancel-expired, notify/booking, notify/cancel) leen ahora los secretos de email (Resend), reCAPTCHA y calendar desde business_secrets vía getBusinessSecrets — los dos nested-join (cancel/[token], cron) con un fetch separado (Pitfall E) — sin arrastrar credenciales por joins ni selects, de modo que ningún flujo se rompa en silencio tras el drop de columnas de la migración 028.
- OAuth callbacks (MP/Google), dashboard settings y agenda repuntados a business_secrets vía owner RLS (D-05), y /[slug] leyendo servicios desde la vista acotada public_services — resuelve los 7 tsc errors del split Business/BusinessSecrets.
- verifyMPSignature movido verbatim a lib/mercadopago.ts como export reusable; el webhook de suscripcion ahora lo importa sin copia inline ni imports muertos, con comportamiento inalterado.
- Booking publico (`POST /api/booking/create`) rechaza con 403 `plan_inactive` a negocios con `plan_status` `expired`/`cancelled` via blocklist explicito, reusando el lookup por slug existente sin query extra.
- Runner Vitest 4 ejecutable (npm test) con 7 tests unitarios que blindan ambos webhooks de MercadoPago: firma HMAC fail-closed (401) y under-payment de seña (amount_mismatch sin confirmar), sin DB ni red.
- Tests de aislamiento multi-tenant (RLS owner-level) que ponen ROJA la suite si un negocio puede leer/modificar datos de otro — con 2 sesiones anon autenticadas (nunca service-role), más el workflow de CI que corre toda la suite en push/PR con skip graceful.

---
