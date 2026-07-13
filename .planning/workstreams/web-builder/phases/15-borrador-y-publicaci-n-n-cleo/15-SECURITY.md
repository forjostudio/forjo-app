---
phase: 15
slug: borrador-y-publicaci-n-n-cleo
status: secured
threats_total: 18
threats_closed: 18
threats_open: 0
blocking: false
block_on: high
asvs_level: 1
audited: 2026-07-13
auditor: gsd-security-auditor
---

# Phase 15 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.
> **Registro escrito en tiempo de plan** (`register_authored_at_plan_time: true`): esta auditoría
> **verifica que la mitigación existe en el código real**, no que el SUMMARY diga que existe.
> Toda evidencia es `archivo:línea` o un test corrido, nunca una afirmación de la documentación.

**Veredicto (tras la remediación del mismo día): 18/18 CLOSED · 0 OPEN. PHASE THREAT-SECURE.**

El audit inicial cerró 17/18 y dejó **T-15-16** abierta (media, no bloqueante con `block_on: high`).
En vez de aceptarla con fecha, **se implementó** — decisión del operador, y es la correcta: T-15-16 era
la **raíz de clase** del XSS que el code review encontró (`map_url` con `javascript:`). Habíamos tapado
el sink, no la clase: un sink nuevo la reabría sin tocar el CMS. Y la Phase 17 retira `CMS_ENABLED`,
o sea que era el último momento en que cerrarla salía barato.

- **T-15-16 → CLOSED** (commit `8277cbf`): el `data` de cada sección se valida contra el esquema de su
  tipo **en el write path**, con un `Record<SectionType, ZodType>` exhaustivo que **no compila** si
  alguien agrega un tipo de sección y se olvida de mapearlo (fail-closed por type-check, no por
  disciplina). Un `javascript:` ya **no llega a la DB**. Tope de 256 KB (`config_too_large`).
- **T-15-17 → CLOSED por consecuencia**, no por aceptación: con el `data` parseado también al guardar,
  el parseo es **idempotente** y las dos columnas quedan idénticas. Verificado contra el config REAL de
  producción: `landing_draft` post-save = `landing_config` post-publish = **2386 bytes**, byte a byte.

**Prueba de fuego contra producción (la que evitaba el incidente peor que el bug):** endurecer el write
path podía dejar sin poder guardar **nunca más** a un dueño cuyo config ya estuviera al aire. Se pasó el
`landing_config` y el `landing_draft` REALES de `/estudio-test` (8 secciones) por el validador nuevo:
**ambos validan**, la web pública sigue renderizando, y la única clave estripada es `booking.title` —
dato muerto que `rsvData` no tiene y el renderer ya ignoraba. Las 4 escalas del hero y el `image_opacity`
sobreviven intactas. Sin lockout.

---

## Trust Boundaries

| Boundary | Descripción | Dato que cruza |
|----------|-------------|----------------|
| visitante anónimo (`anon`) → Postgres | Única puerta a `businesses`: la vista `public_businesses` (security-DEFINER, columnas explícitas) | `landing_config` (público). **NUNCA** `landing_draft` |
| dueño autenticado (tenant B) → Postgres | anon-key + JWT propio. RLS `owner access` (`owner_id = auth.uid()`) es lo único que lo separa de la fila de otro negocio | fila entera de `businesses` (la suya) |
| browser del dueño → Server Action | El body es **input no confiable**: puede llegar por POST directo sin pasar por la UI | `saveLandingDraft(config)`. `publishLanding()` / `discardLandingDraft()` **no reciben nada** |
| `businesses.landing_config` → visitante | Todo lo que entre a esa columna sale al aire en `/[slug]` | config publicado (URLs, copys) |
| operador (service-role, fuera del runtime web) | Bypassa RLS por diseño. Vive en scripts locales (`scripts/setup-landing.ts`); nunca en la superficie web | config completo (publish del operador) |

---

## Threat Register

| Threat ID | Categoría (STRIDE) | Componente | Disposición | Evidencia verificada (archivo:línea / test) | Status |
|-----------|--------------------|------------|-------------|---------------------------------------------|--------|
| T-15-01 | Information Disclosure | vista `public_businesses` (security-DEFINER) | mitigate | `supabase/migrations/050_landing_draft.sql:47-56` — solo `ALTER TABLE … ADD COLUMN` + backfill; **cero** sentencias de vista. `supabase/schema.sql:675-695` — la vista lista 19 columnas explícitas y `landing_draft` **no está**. Test anon-key `test/isolation.test.ts:257` (el `select('landing_draft')` sobre la vista DEBE errar) → **verde con `--sequence.shuffle`** | **closed** |
| T-15-02 | Information Disclosure | `landing_draft` — read cross-tenant | mitigate | Única policy sobre la tabla: `supabase/schema.sql:1590` (`"owner access" … USING (owner_id = auth.uid())`). La 050 no agrega policy ni permiso (`050:34-37`). Test `test/isolation.test.ts:269` — cross-READ **sin** `.eq()`: la fila de A no aparece para B (lo esconde la RLS, no el WHERE) | **closed** |
| T-15-03 | Tampering | `landing_draft` — write cross-tenant | mitigate | Ídem RLS. Test `test/isolation.test.ts:276` — centinela sembrado con service-role, B intenta el UPDATE sobre `id = bizA` → error/0 filas, y el check independiente confirma que el borrador de A sigue byte-idéntico (`__sentinel: 'draft-A'`). Ya **no depende del orden** (fix WR-06, `e66bd3d`) | **closed** |
| T-15-04 | Elevation of Privilege | gate del add-on (`has_web_custom`) | mitigate | Chequeado **dentro de las 3 acciones**, no solo en la page: `_landing-actions.ts:104` (save), `:164` (publish), `:224` (discard). El gate de la page (`page.tsx:67`) es adicional, no el único. El dueño no puede auto-otorgarse el flag: trigger `businesses_protect_admin_columns` (`schema.sql:209-225`, revierte `has_web_custom` si `auth.role() <> 'service_role'`), probado en `test/isolation.test.ts:177` | **closed** |
| T-15-05 | Tampering | `publishLanding()` — inyectar "lo publicado" por el body | mitigate | `_landing-actions.ts:139` → `export async function publishLanding(): Promise<Result>` — **cero argumentos**. Lo que se escribe en `landing_config` sale del `select('id, has_web_custom, landing_draft')` de la DB (`:157`) y del Zod (`:174`), **jamás** del cliente. Ídem `discardLandingDraft()` (`:201`) | **closed** |
| T-15-06 | Elevation of Privilege | trigger `businesses_protect_admin_columns` | mitigate | La 050 no lo modifica (`grep` del SQL efectivo: 0 menciones fuera de comentarios). `schema.sql:213-224`: la lista protegida sigue siendo `has_web_custom` / `has_whatsapp` / `plan` / `plan_status` — `landing_draft` **no está ahí** (el dueño SÍ debe poder escribir su borrador). Trigger vivo en `schema.sql:1106` | **closed** |
| T-15-07 | Tampering / EoP | service-role en la superficie web | mitigate | `grep -rn "createAdminClient\|SERVICE_ROLE" "app/(dashboard)/web/"` → **0 usos efectivos** (las únicas coincidencias son comentarios que lo declaran prohibido: `_landing-actions.ts:44,81,102,144`). Las 3 acciones usan `createClient()` de `@/lib/supabase/server` (anon + cookies, RLS activa): `:82`, `:145`, `:207` | **closed** |
| T-15-08 | Tampering | publicar un borrador corrupto | mitigate | `_landing-actions.ts:174-175` — `parseLandingConfigForWrite(business.landing_draft)` corre sobre **el borrador leído de la DB** (no sobre un body) → `invalid_draft`. `lib/landing/write.ts:20-25` es reject-on-invalid (nunca coerción a DEFAULT). Defensa en profundidad: `parseLandingConfig` (render) es fail-safe → `/[slug]` no 500ea | **closed** |
| T-15-09 | Injection (XSS) | contenido del config → sinks de la web pública | mitigate | **Cerrado de verdad, no de palabra** (fix `4d646f4` tras el BLOCKER CR-02). `safeLinkUrl` (allowlist `http`/`https`, `lib/landing/schema.ts:98-108`) aplicada a **TODAS** las URLs del config: `heroData.image:119`, `aboutData.image:148`, `galleryData.images:165`, `rsvData.images:181`, `locationData.map_url:196`, `ctaLink.url:205`. **Auditoría completa de sinks** abajo (§Sink Audit) | **closed** |
| T-15-10 | Tampering (self) | el dueño escribe su propia `landing_config` con la anon-key salteando la Server Action | **accept** | Riesgo heredado y aceptado de Phase 13 → **ARP-01** (Accepted Risks Log). Owner-only; no viola el Core Value | **closed (accepted)** |
| T-15-11 | Denial of Service | orden de deploy (código nuevo sin la columna) | mitigate | Migración **aditiva** (`ADD COLUMN IF NOT EXISTS`) e **idempotente** (backfill con `WHERE landing_draft IS NULL`) → aplicarla antes del deploy es seguro para el código viejo. Runbook en `050:41-45` + `15-01-SUMMARY.md:117-135` (aplicar a mano → `NOTIFY pgrst, 'reload schema';` → deploy → regenerar `schema.sql`). **Ejecutado**: el UAT (`15-UAT.md:9-12`) corrió sobre **prod** con la 050 aplicada, 6/6 PASS; `schema.sql` regenerado (`1d98033`, `schema.sql:359`) | **closed** |
| T-15-12 | Tampering | los botones deshabilitados / los dialogs como "gate" | **accept** | La UI no es un control de seguridad → **ARP-02**. Quien saltee la UI cae en los mismos gates server-side (T-15-04/05/07/08/15) y, en el peor caso, publica **su propio** borrador | **closed (accepted)** |
| T-15-13 | Tampering (producto) | publicar contenido distinto del que el dueño ve (D-04) | mitigate | `web-client.tsx:287-292` — `runPublish()` llama `await saveLandingDraft(draft)` **sin condición previa** (no es `if (dirty)`), y si el guardado falla **no publica** (`:293-300`). `publishLanding()` copia el borrador **de la DB** → sin ese guardado el dueño publicaría algo distinto de su preview. Verificado en UAT (`15-UAT.md`, tests 2 y 3, PASS sobre prod) | **closed** |
| T-15-14 | Information Disclosure | el preview del editor muestra el borrador | **accept** | Superficie autenticada del propio dueño → **ARP-03**. La page está gateada por `CMS_ENABLED` (`page.tsx:29`) + `has_web_custom` (`:67`) + sesión (`:37`), y la web pública lee **otra columna** | **closed (accepted)** |
| T-15-15 | Tampering | cross-tenant write vía `business_id` del body | mitigate | Ninguna acción acepta `business_id`: las dos nuevas **no reciben nada** y `saveLandingDraft(input)` solo pasa `input` por el Zod del envelope (no hay `business_id` en el schema). El negocio se resuelve **3 veces** por `.eq('owner_id', user.id).single()` (`_landing-actions.ts:95`, `:159`, `:220`) y el update apunta a `.eq('id', business.id).select('id')` (`:118`, `:182`, `:230`) con chequeo de filas afectadas (anti no-op) | **closed** |
| T-15-SC | Tampering | supply chain (npm installs) | **accept** | `git diff --stat 9ded2dd~1..HEAD -- package.json package-lock.json` → **vacío**. Cero dependencias nuevas en toda la fase → **ARP-04** (sin superficie nueva) | **closed (accepted)** |
| **T-15-16** | **Tampering / Injection (raíz) / DoS** | **`sectionSchema.data = z.unknown()` — el write path persiste el `data` verbatim** | **mitigate** | **CLOSED (`8277cbf`):** `lib/landing/write.ts:41-56` Record exhaustivo type→schema (fail-closed por type-check) · `:89-94` reject-on-invalid, nunca degrada a `{}` · `:100` tope 256KB. Config real de prod verificado sin lockout. ANTES era: `lib/landing/schema.ts:36` · `lib/landing/write.ts:20-25` · consumido en `_landing-actions.ts:107` (save) y `:174` (publish). Ver §Amenazas nuevas | **CLOSED** |
| **T-15-17** | **Tampering (integridad de datos)** | **deriva de normalización entre `landing_config` (parseado) y `landing_draft` (crudo)** | **accept** | Sin consecuencia de seguridad hoy; la deriva va en la dirección segura (lo público es lo **más** normalizado). → **ARP-05** + mitigación opcional de 1 línea. Ver §Amenazas nuevas | **closed (accepted)** |

*Status: open · closed · closed (accepted)*
*Disposición: mitigate (requiere implementación) · accept (riesgo documentado) · transfer (tercero)*

---

## Sink Audit — evidencia de T-15-09 (el fix de CR-02 es real y completo)

El plan afirmaba que "el saneado de URLs del config vive en `schema.ts` y no se toca". **Era falso**:
`safeLinkUrl` cubría **solo** `ctaLink.url`; `map_url` usaba `z.string().url()`, que acepta
`javascript:alert(1)`. Auditados **todos** los sinks (`<a href>`, `<img src>`, `next/image`, `style`)
que consumen el config, uno por uno:

| Sink | Archivo:línea | Fuente del valor | Barrera verificada |
|------|---------------|------------------|--------------------|
| `<a href>` "Ver en el mapa" | `components/landing/location.tsx:93` | `locationData.map_url` | `safeLinkUrl` (`schema.ts:196`) — **este era el agujero** |
| `<a href>` botones del CTA | `components/landing/cta.tsx:85` → `_premium.tsx:137` | `ctaData.links[].url` | `safeLinkUrl` (`schema.ts:205`) |
| `next/image src` hero (LCP) | `components/landing/hero.tsx:80` | `heroData.image` | `safeLinkUrl` (`schema.ts:119`) + `next.config.ts` `remotePatterns` (solo el bucket `landing-assets`) |
| `next/image src` about | `components/landing/about.tsx:90` | `aboutData.image` | `safeLinkUrl` (`schema.ts:148`) + remotePatterns |
| `next/image src` galería | `components/landing/gallery.tsx:89` | `galleryData.images[]` | `safeLinkUrl` (`schema.ts:165`) + remotePatterns |
| `next/image src` strip RSV | `components/landing/rsv-strip.tsx:109` | `rsvData.images[]` | `safeLinkUrl` (`schema.ts:181`) + remotePatterns |
| `next/image src` lightbox | `components/landing/photo-lightbox.tsx:345` | `data-frj-src` del DOM, poblado por gallery/about/rsv | hereda las barreras de arriba |
| `og:image` / metadata | `lib/landing/seo.ts:79` · `app/[slug]/opengraph-image.tsx:109` | `heroData.image` (parse explícito) | `safeLinkUrl` |
| `style` → CSS var `--primary` | `components/landing/landing-renderer.tsx:209` | `theme.overrides.primary` | `isSafeColor` (allowlist de hex, `lib/landing/theme.ts:23,98`) — **no es una URL, pero es el otro sink de estilo del config** |
| texto (`hours.title`, copys) | `components/landing/hours.tsx:81-83`, resto | `section.data.*` string | React escapa; **cero** `dangerouslySetInnerHTML` en `components/landing/**` |

**Cobertura:** todos los componentes parsean su `data` con el esquema de sección
(`hero:23`, `about:33`, `services:26`, `gallery:34`, `location:41`, `cta:36`, `rsv-strip:35`,
`seo.ts:79`, `opengraph-image:109`). No queda **ninguna** URL del config llegando a un sink sin
allowlist de protocolo.

**Tests:** `test/landing-schema.test.ts:214-251` — 4 casos (`map_url` rechaza `javascript:`/`data:`/`file:`;
un `https://` pasa intacto; un `map_url` inválido degrada la sección pero **no tira la página**; las 4
familias de imágenes rechazan `data:` y aceptan `https`). `npx vitest run test/landing-schema.test.ts`
→ **27 passed**.

**Chrome del editor:** los únicos `href` interpolados son `/${business.slug}`
(`web-client.tsx:430`, `:560`), que viene de la sesión y lo escapa React. Cero `dangerouslySetInnerHTML`
en `app/(dashboard)/web/**`.

---

## Amenazas nuevas (diferidas del code review / UAT a este secure-phase)

### T-15-16 — `sectionSchema.data` es `z.unknown()`: el write path no valida el `data` por tipo de sección

- **STRIDE:** Tampering (primario) · Injection (es la **raíz de clase** del XSS de `map_url`, CR-02) · DoS (sin tope de tamaño)
- **ASVS L1:** V5.1.3 (validar toda entrada contra una lista positiva) y **V5.1.4** (los datos estructurados se validan contra un esquema definido) — es un gap de nivel 1. También V12/V13 en su arista de tamaño de payload.
- **Severidad: MEDIA.** No es alta, y por eso **no bloquea** con `block_on: high`:
  - **No toca el Core Value.** El `data` arbitrario se persiste en la fila **del propio tenant** (RLS `owner access` + `business_id` de la sesión, T-15-02/03/15 CLOSED). Nadie escribe ni lee la fila de otro.
  - **No hay ruta de explotación activa hoy:** verifiqué que **todo** consumidor del `data` lo parsea con su esquema de sección (§Sink Audit), y `z.object` de Zod v4 **estripa** las claves desconocidas al renderizar. Las claves basura almacenadas son inertes.
- **Evidencia del gap (código real):**
  - `lib/landing/schema.ts:32-37` → `data: z.unknown().optional()`.
  - `lib/landing/write.ts:16-19` promete *"un payload con campos extra queda limpio antes de tocar la DB"* — **es falso para el `data`**, que es la mayor parte del payload. La promesa solo se cumple en el envelope (`theme` / `sections` / `motion`).
  - `_landing-actions.ts:107` persiste `parsed.data` verbatim; `:174-181` lo copia **tal cual** a `landing_config`, la columna que lee la web pública.
  - **Sin tope de tamaño:** `next.config.ts` no configura `serverActions.bodySizeLimit` → default de Next (1 MB). Un dueño puede persistir ~1 MB de jsonb en su fila y publicarlo; `/[slug]` es `force-dynamic` → lo lee en **cada** request. Es un DoS **auto-infligido** (solo su propia página), amplificación baja, sin crecimiento ilimitado (el write es overwrite, no append).
- **Riesgo residual real:** defensa en profundidad. La allowlist de protocolo vive **solo en el render**. Un sink nuevo mañana (un componente que lea `data` sin parsear, un export, un email, un endpoint de la API del agente) re-abre el XSS **sin tocar una línea del CMS**. Es exactamente cómo nació CR-02.
- **Disposición: mitigate.** Cómo, exactamente (los esquemas ya existen — el cambio es de contrato, no de diseño):
  1. En `lib/landing/write.ts` (**no** en `schema.ts`: el contrato de RENDER debe seguir siendo fail-safe y tolerante), después del `landingConfigSchema.safeParse`, mapear cada sección a su esquema y **re-escribir el `data` con el resultado parseado**:
     `hero → heroData`, `about → aboutData`, `services → servicesData`, `gallery → galleryData`, `location → locationData`, `cta → ctaData`, `booking → rsvData`, `hours → { title? }`. Todos tienen `.catch({})`, así que un `data` roto degrada esa sección a `{}` **en la escritura** en vez de persistirse crudo. Efecto: `map_url: 'javascript:…'` **ni siquiera llega a la DB**, y la promesa de `write.ts:16-19` pasa a ser verdad.
  2. Tope de tamaño explícito antes del `.update`: rechazar con `invalid_config` si `JSON.stringify(parsed.data).length > N` (p. ej. 256 KB — el config real de `/estudio-test` en prod pesa 2.4 KB, así que hay 100× de margen).
  3. Tests: 2 casos en `test/landing-write.test.ts` (un `data` con clave desconocida queda estripado; un `map_url` `javascript:` no se persiste) + 1 de tope de tamaño.
- **Cuándo:** **antes de la Phase 17** (que saca el flag `CMS_ENABLED` y abre el CMS a clientes reales). Mientras el CMS siga detrás del flag y con `has_web_custom` acotado, el riesgo está contenido.

### T-15-17 — Deriva de normalización entre `landing_config` (parseado) y `landing_draft` (crudo)

- **STRIDE:** Tampering (integridad de datos). No es Information Disclosure ni EoP.
- **ASVS L1:** ninguno directamente aplicable (es higiene de invariantes, no un control).
- **Análisis de consecuencia — la deriva va en la dirección SEGURA:**
  - `publishLanding()` escribe en `landing_config` el resultado de `parseLandingConfigForWrite` (`_landing-actions.ts:174-181`), o sea el config **ya estripado** por el envelope; `landing_draft` se queda con el crudo que mandó el editor (`:117`). Consecuencia: **lo publicado es siempre un subconjunto normalizado del borrador**, nunca al revés. Observado en prod: `landing_config` = 2414 B vs `landing_draft` = 2413 B (`15-UAT.md:80-85`).
  - Ninguna decisión de seguridad depende de la igualdad byte-a-byte de las dos columnas: el editor **parsea las dos** al leerlas (`web-client.tsx:148`, `:164`) y compara con `configsEqual` **canónico** (`lib/landing/editor-draft.ts`), por eso el estado `✓ Publicado` es correcto (verificado en el UAT, test 5, PASS sobre datos reales post-backfill).
  - El borrador crudo **nunca sale al aire**: la web pública lee `landing_config` (`app/[slug]/page.tsx:47`) y el borrador es invisible para `anon` (T-15-01/02 CLOSED).
- **Riesgo residual:** que alguien mañana asuma un invariante que **no existe** — un compare byte-wise en SQL, un job que trate `landing_draft` como "lo publicado", o un `WHERE landing_config = landing_draft` para calcular "sin publicar". Daría falsos negativos silenciosos. Es la misma clase de trampa que el pitfall del orden de claves del `jsonb`.
- **Disposición: accept** (→ **ARP-05**), con una **mitigación opcional de una línea** si se prefiere cerrar el invariante en vez de documentarlo:
  `_landing-actions.ts:181` → `.update({ landing_config: parsed.data, landing_draft: parsed.data })`.
  Deja `draft == published` **byte a byte** post-publicación (que es lo que D-02 dice en su letra), estripa el borrador de paso y no cambia ninguna semántica del editor (los baselines en memoria ya son el config parseado). Riesgo del cambio: nulo. **Recomendado, no bloqueante.** Si T-15-16 se implementa, esto se cierra solo (el crudo deja de existir).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Racional | Aceptado por | Fecha |
|---------|------------|----------|--------------|-------|
| ARP-01 | T-15-10 | La policy `owner access` es `FOR ALL`: el dueño puede escribir **su propia** `landing_config` con la anon-key desde la consola del browser, salteando la semántica de "publicar" (igual que hoy escribe `theme`/`palette` desde settings). **No viola el Core Value:** sigue siendo owner-only y nadie escribe la fila de otro (probado, T-15-03). Cerrarlo exigiría revocar el UPDATE de la columna al rol `authenticated`, lo que **también rompería las 3 Server Actions** (corren como `authenticated`) y obligaría a un RPC security-definer. Heredado y ya aceptado en Phase 13; fuera de scope de la 15 | Franco (dueño del producto) | 2026-07-13 |
| ARP-02 | T-15-12 | La UI **no es un control de seguridad**: botones deshabilitados, matriz de habilitación y dialogs son cosméticos. Un dueño que postee directo a las acciones cae en los mismos gates server-side (flag → sesión → `business_id` de la sesión → `has_web_custom` → Zod estricto) y en el peor caso publica **su propio** borrador — que es su derecho. Riesgo residual para el Core Value: nulo | Franco | 2026-07-13 |
| ARP-03 | T-15-14 | El preview del editor muestra el borrador. Es la superficie autenticada del propio dueño (page gateada por `CMS_ENABLED` + sesión + `has_web_custom`, RLS activa). El borrador no sale de esa sesión: la página pública lee `landing_config` y el link "Ver mi web" abre la web **real**, no una simulación | Franco | 2026-07-13 |
| ARP-04 | T-15-SC | Cero dependencias nuevas en toda la fase (`git diff package.json package-lock.json` vacío entre `9ded2dd~1` y `HEAD`). Sin superficie de supply chain nueva | Franco | 2026-07-13 |
| ARP-05 | T-15-17 | Deriva de normalización entre columnas: lo publicado es el config **parseado**, el borrador queda crudo. Sin consecuencia de seguridad (la deriva va hacia lo más normalizado, y ninguna decisión de seguridad depende de la igualdad byte-a-byte). **Condición de la aceptación:** cualquier código futuro que compare las dos columnas o que trate `landing_draft` como "lo publicado" **debe parsear primero**. Se cierra solo si se implementa T-15-16 | Franco | 2026-07-13 |

---

## Unregistered Flags

Ninguno de los 3 SUMMARY declara una sección `## Threat Flags`. La superficie de ataque nueva que
apareció durante la implementación (y que los SUMMARY **no** flaggearon) fue detectada por el code
review y quedó registrada acá como **T-15-16** y **T-15-17** (+ el BLOCKER CR-02, que estaba mal
mapeado a T-15-09 y **ya está cerrado**, fix `4d646f4`).

**Advertencia de proceso (WARNING, no bloqueante):** los 3 SUMMARY afirman que el contrato de
seguridad se cumple citando **greps de su propio plan**, y el plan de 15-03 afirmaba —textual— que
*"el saneado de URLs del config (allowlist http/https) vive en `lib/landing/schema.ts` y no se toca ni
se debilita"*. Esa afirmación era **falsa en el momento de escribirse** (la allowlist solo cubría
`ctaLink.url`) y ningún gate de la fase la habría detectado: el XSS almacenado lo encontró el code
review, no el registro de amenazas. Lección para el próximo threat model: **una mitigación que dice
"ya existe en otro archivo" hay que grepearla en ese archivo, no citarla.**

---

## Fixes del code review — verificados en el código, no en el changelog

| Fix | Commit | Verificación independiente |
|-----|--------|----------------------------|
| **CR-02** XSS almacenado vía `map_url` | `4d646f4` | `schema.ts:196` usa `safeLinkUrl`; §Sink Audit cubre las 9 URLs restantes; 4 tests nuevos, 27 passed |
| **CR-01** `setup-landing.ts` revertía la web del operador | `f98ed6b` | `scripts/setup-landing.ts:325` → `.update({ landing_config: parsed, landing_draft: parsed })` (**las dos** columnas, con el porqué escrito en `:315-322`) |
| **WR-01** `select('*')` mandaba la fila entera al cliente | `d87e808` | `app/(dashboard)/web/page.tsx:51` — columnas explícitas; `:114` destructura `landing_config`/`landing_draft` fuera de `publicBusiness`; el cast `as unknown as PublicBusiness` ya no existe |
| **WR-03** `schema.sql` desactualizado | `1d98033` | `schema.sql:359` (`landing_draft jsonb` en `businesses`) y la vista `:675-695` **sin** la columna |
| **WR-06** tests de aislamiento dependientes del orden | `e66bd3d` | Centinela en `test/isolation.test.ts:280-283`; suite **13/13 passed con `--sequence.shuffle`** (corrida en esta auditoría) |
| **WR-04** dead-end del indicador tras descartar | `c96dedc` + `6c48258` | `web-client.tsx:192` (`deriveEditorState`) + `hasPersistedDraft`; UAT §Gaps lo da por cerrado end-to-end en prod |

---

## Security Audit Trail

| Fecha | Amenazas | Closed | Open | Corrida por |
|-------|----------|--------|------|-------------|
| 2026-07-13 | 18 (16 de plan + 2 nuevas) | 17 | 1 (T-15-16, media) | gsd-security-auditor |
| 2026-07-13 (remediación) | 18 | **18** | **0** | operador — T-15-16 implementada (`8277cbf`), T-15-17 cerrada por consecuencia |

**Evidencia de la remediación (corrida por el orquestador, no auto-reportada):**

```
npx tsc --noEmit                                  → exit 0
npx vitest run                                    → 535/535 passed (37 files; +28 de T-15-16)
git diff --name-only HEAD~1 -- package.json …     → vacío (cero deps nuevas)

# Prueba de fuego: el config REAL de PROD contra el write path endurecido
landing_config (8 secciones) → ✓ valida · claves estripadas: booking.title (dato muerto)
landing_draft  (8 secciones) → ✓ valida · read path sigue renderizando
                             → ✅ SIN LOCKOUT

# T-15-17: idempotencia del parseo
landing_draft post-save    = 2386 bytes
landing_config post-publish = 2386 bytes  → ✅ idénticas, la deriva desaparece
```

**Comandos corridos como evidencia:**

```
npx vitest run test/isolation.test.ts --sequence.shuffle   → 13 passed / 0 skipped
npx vitest run test/landing-schema.test.ts                 → 27 passed
git diff --stat 9ded2dd~1..HEAD -- package.json package-lock.json → vacío
grep -rn "createAdminClient|SERVICE_ROLE" "app/(dashboard)/web/"  → 0 usos efectivos
```

---

## Sign-Off

- [x] Las 18 amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados (ARP-01..05; ARP-05/T-15-17 quedó **superado**: se cerró por mitigación, no por aceptación)
- [x] **`threats_open: 0`** — T-15-16 implementada (`8277cbf`) en vez de aceptada con fecha
- [x] Ninguna amenaza toca el Core Value (aislamiento multi-tenant)
- [x] Archivos de implementación **no modificados** por la auditoría (el fix es posterior y va en su propio commit)
- [x] Sin lockout: el config REAL de producción sigue validando contra el write path endurecido

**Estado: PHASE 15 THREAT-SECURE.**

### Lección para las próximas fases (vale más que el registro)

El plan de 15-03 afirmaba, textual, que la allowlist de URLs *"vive en `lib/landing/schema.ts` y no se
toca ni se debilita"* (T-15-09). **Era falsa cuando se escribió**: `safeLinkUrl` cubría solo
`ctaLink.url`, y `map_url` seguía con `z.string().url()`, que acepta `javascript:`. Ningún gate de la
fase la habría detectado — el XSS lo encontró el code review, de casualidad.

Una mitigación que dice *"eso ya está resuelto en otro archivo"* **hay que grepearla en ese archivo**.
Una amenaza cuya mitigación se declara por referencia, y no por evidencia, no está mitigada: está
supuesta.

**Aprobación:** la Phase 15 puede shippear. **Condición de cierre:** T-15-16 debe implementarse
**antes de la Phase 17** (que saca el flag `CMS_ENABLED` y abre el CMS a clientes reales).
