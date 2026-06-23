---
name: forjo-web-builder
description: >
  Arma la web de marca a medida de un negocio de Forjo Gestión: junta marca + contenido,
  lo mapea al `landing_config`, recomienda tema, sube imágenes y deja la preview viva en
  su `/[slug]` con las reservas nativas ya integradas. Produce el config POR SLUG y devuelve
  la URL de preview. Activá esta skill cuando el operador diga cosas como "armale la web a
  [cliente]", "personalizar la web de un negocio", "generar landing para [slug]", "hacele una
  web estilo jjotalab a [cliente]", "convertir el Instagram de [cliente] en su página de
  reservas", o cualquier variante de generar/personalizar la landing de un negocio existente.
  Requiere el slug del negocio como input obligatorio. Toda la escritura la hace un script
  local con service-role; la skill nunca escribe por endpoint web.
---

# Forjo Web Builder

Orquestás el flujo punta a punta para darle a un cliente de Forjo Gestión su web de marca a
medida (estilo jjotalab.com) **dentro de Forjo**, servida por `/[slug]`, con el sistema de
reservas ya existente integrado nativamente. No programás nada nuevo por cliente: el resultado
es una fila `businesses.landing_config` poblada + imágenes en Storage. El config es **dato, no
código** → aplicar una web es escribir la fila, instantáneo, sin deploy.

**Regla fundamental (heredada de instagram-a-web): no inventes ningún dato.** No inventes
servicios, precios, testimonios ni biografía. Todo sale del negocio real (tabla) o del scrape/
operador. Si falta info, la pedís — no la rellenás.

---

## Prerrequisitos (leer antes de arrancar)

- Corre desde **Claude Code del operador** (VS Code, Windows + PowerShell), con `.env.local`
  presente (trae `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_APP_URL`).
- **Toda la escritura la hace `scripts/setup-landing.ts`** vía service-role local (D10-01 / SKILL-04).
  La frontera de seguridad es la máquina del operador, no un endpoint. **NUNCA** expongas un
  endpoint web para esto, ni metas secretos en el config o en la vista `public_businesses`.
- La capa de plantilla (schema + renderer + temas) ya existe: vos solo armás el `landing_config`.

---

## Flujo (paso a paso)

### 1. INPUT: el slug es obligatorio

Pedí el `slug` del negocio. **Sin slug, no se arranca.** Es el único input requerido; marca,
copy, fotos y handle de IG son opcionales (la skill los pide o los scrapea).

### 2. RESOLVER el negocio (read-only)

Corré el modo inspect del script y mostrá el resumen:

```powershell
npm run setup:landing -- --inspect <slug>
```

Imprime un JSON read-only: `id`, `nombre`, `vertical`, `tema_actual` (theme/palette/font/
primary_color), `whatsapp`, `servicios_activos` + lista de `servicios`, y si el `landing_config`
ya está `poblado` o `null`. **No escribe nada** — re-correrlo da el mismo output.

- Si el slug no existe → el script lo reporta; pará y pedí el slug correcto.
- Si ya tiene `landing_config: poblado`, avisá al operador que la escritura lo **sobre-escribe**.
- **`services` se deriva sola de la tabla** (D10-04): la skill NO arma una lista de servicios.
  De la sección services solo definís **título/subtítulo**; los items los pone el renderer.

### 3. SCRAPE de Instagram (OPCIONAL, best-effort — D10-02 / SKILL-02)

Si el operador da un `@handle`, intentá sacar copy + fotos como **materia prima**. El motor vive
**aislado** en `.claude/skills/instagram-a-web/` (Playwright en su propio `node_modules`).

- **NUNCA instales Playwright en el root del repo** (Pitfall 4 / T-10-11). El scrape corre
  **DESDE el directorio de la skill `instagram-a-web`**, usando su engine. El script de ejemplo
  está hardcodeado a un handle: generá/editá una copia parametrizada por el `@handle` del cliente
  y corréla desde ese directorio.
- Output esperado: `instagram-data.json` + imágenes en `assets/instagram/` (dentro de la skill).
  Eso es **solo materia prima** de copy e imágenes — no se escribe crudo a ningún lado.
- **Modos de falla esperados** (no prometemos scraping robusto): login-wall, rate-limit/anti-bot,
  selectores que Instagram cambió. Si pasa cualquiera de estos → **FALLBACK MANUAL**, no te
  bloquees:

  > "No pude acceder al perfil automáticamente (Instagram bloquea bastante). Pasame dos cosas:
  > 1. **Copy**: la bio, a qué se dedica el negocio y la frase principal que querés en el hero.
  > 2. **Fotos**: 6-12 fotos en una carpeta local (decime la ruta)."

- Las URLs del CDN de IG (`profilePicUrl`, `postImages`) **caducan** y NO sirven en runtime
  (Pitfall 1). Se usan SOLO para descargar la imagen localmente. **Nunca** van al config.

### 4. COPY: pasarlo por el humanizador (OBLIGATORIO)

**Paso obligatorio, NO opcional.** TODO el copy (scrapeado o dado por el operador) pasa por la skill
**`humanizador`** ANTES del checkpoint — nunca escribas copy crudo "a mano" sin humanizar, aunque lo
hayas redactado vos a partir de datos reales. El humanizador lo deja directo, sin relleno ni tono
inflado; no inventa datos ni cambia cifras, solo limpia el texto. Aplicá las reglas UI/UX del CLAUDE
global como criterio (jerarquía, microcopy de botones tipo "Reservá tu turno", no "Click aquí"),
**sin inventar** servicios/precios/testimonios. En el checkpoint (paso 6) mostrás el copy YA humanizado.

### 5. ARMAR el config (BuilderInput)

Mapeá la materia prima al `BuilderInput` que consume `lib/landing/builder.ts`. Ese módulo es la
garantía de que lo escrito siempre pasa el gate Zod. Campos EXACTOS por sección (cualquier otra
clave la estripa Zod):

- `business`: `{ name, whatsapp? }` (para fallbacks/decisiones).
- `hero`: `{ headline?, kicker?, subhead?, image?, cta_label? }` — SIEMPRE va. El `headline` es la
  propuesta de valor SIN la ciudad (ej. "Masajes deportivos y descontracturantes", NO "...en Capilla
  del Señor"). La **ciudad/zona va en `kicker`** (eyebrow editorial del hero, ej. "Capilla del Señor"):
  no la metas en el headline.
- `about`: `{ title?, body?, image? }`.
- `services`: `{ title?, subtitle? }` — **SOLO título/subtítulo, NUNCA una lista** (D10-04).
- `gallery`: `{ title?, images? }`.
- `location`: `{ title?, map_url?, show_address? }`.
- `hours`: `{ title? }`.
- `cta`: `{ headline? }`.
- **NUNCA `booking`**: la sección de reservas la inyecta el renderer sola (LAND-02). No la pongas
  en el config.

Las imágenes (`hero.image`, `about.image`, `gallery.images[]`) van como **RUTAS LOCALES** del
disco (las que dejó el scrape o el operador). El script las re-hostea — no pongas URLs de IG.

Para el **tema**, lo normal es **NO pasar nada**: por default el landing hereda el `theme/palette/font`
que el negocio ya configuró en su **Apariencia** (la misma identidad de su web de reservas). El script
parte de la fila `businesses` y solo usa los `brand` hints que le pases como **override explícito**. Es
decir: dejá `brand` vacío (o solo con `vertical`) para que la web matchee el booking; pasá
`{ theme?, palette?, font?, primary_color? }` **únicamente si el operador quiere que la landing se vea
distinta** a su página de reservas. El `primary_color` solo se aplica si pasa `isSafeColor` (allowlist
de hex) — esa validación la resuelve el builder, no la fuerces vos. `recommendTheme` solo adivina por
vertical cuando el negocio no configuró nada en Apariencia.

### 6. CHECKPOINT DE APROBACIÓN (D10-03 / SKILL-04 — BLOQUEANTE)

**Antes de tocar absolutamente nada**, mostrá al operador un resumen completo y esperá aprobación
explícita. Esto escribe sobre una fila REAL de producción: es la doble-confirmación del ethos del
proyecto. Mostrá:

- **Secciones** que se van a habilitar y su orden (hero → about → services → gallery → location →
  hours → cta, según lo que haya data).
- **Tema** elegido: preset / palette / font / primary.
- **Imágenes** a subir (lista de rutas locales, por rol: hero / about / gallery).
- **Copy final** (ya humanizado) de cada sección.

**Nada se sube ni se escribe hasta que el operador apruebe.** Si rechaza → no escribís nada,
ajustás según el feedback y volvés a mostrar el checkpoint.

### 7. ESCRIBIR (solo tras aprobar)

Escribí el `BuilderInput` + `brand` a un archivo JSON temporal (PowerShell pelea con el quoting de
JSON inline; por eso el script recibe `--config <path>`). El JSON tiene la forma
`{ "input": <BuilderInput>, "brand": <BrandHints> }`. Luego corré:

```powershell
npm run setup:landing -- --slug <slug> --config <ruta-al-payload.json>
```

El script, en orden: resuelve `business_id` del slug → re-hostea cada imagen local a
`landing-assets/{businessId}/{uuid}.webp` (re-encode con sharp) y reemplaza las rutas por URLs
públicas de Storage → arma el config con `buildLandingConfig` + `recommendTheme` → **GATE**
`parseLandingConfig` (SKILL-04) → `UPDATE ... WHERE id = businessId` (por id, NUNCA por slug).

Si el script **aborta** (el gate Zod falla, o falla el re-hosteo) → reportá el error tal cual y
**NO reintentes a ciegas**. Revisá el payload y volvé al checkpoint.

### 8. OUTPUT

Devolvé la **URL de preview** (`/[slug]` es `force-dynamic` → inmediata, sin deploy) + un resumen
de lo armado (secciones, tema, cantidad de imágenes re-hosteadas). El script ya imprime la URL.

---

## Guardrails / No-goals (no negociables)

- **Secciones FIJAS** (D3): mismo set para todos; varían colores/tipografía/imágenes/orden y
  on-off. **Sin layout libre / drag-and-drop / bespoke** por cliente (eso es milestone futuro, D6).
- **Solo componentes Forjo-native**: NUNCA inyectes HTML suelto de `instagram-a-web` ni de
  `web-scrolling`. Esas skills son **referencia + scraping**, no output literal (D5). Todo es
  config que consume el renderer nativo (React/Tailwind).
- **NO tocar booking ni pagos**: la sección de reservas reusa `BookingClient` tal cual, **caja
  negra** (LAND-02). No la pongas en el config; el renderer la inyecta.
- **`services` SIEMPRE auto desde la tabla** (D10-04): jamás armes una lista de servicios en el
  config. Solo título/subtítulo de esa sección.
- **NUNCA campos sensibles** en el config ni en la vista `public_businesses`.
- **Re-host OBLIGATORIO de imágenes** (SKILL-03): nunca referencies el CDN de IG en runtime.
  Las URLs de IG caducan; solo se descargan localmente y el script las re-hostea a `landing-assets`.
- **Escritura SOLO por `setup:landing`** (service-role local): cero endpoint web, gate Zod
  obligatorio. La skill nunca escribe directo a la DB.
- **UI/UX del CLAUDE global** como criterio (jerarquía visual, mobile-first 375px, WCAG AA,
  microcopy de botones), pero **sin inventar datos**: todo sale del negocio real o del operador.

---

## Reusos declarados

- **`instagram-a-web`** → SOLO el motor de scraping de contenido (su HTML no se usa).
- **`web-scrolling`** → SOLO criterio/inspiración de diseño (su HTML no se usa).
- **`humanizador`** → pasar el copy generado para que no suene a IA.
- **Reglas UI/UX del CLAUDE global** → jerarquía, mobile-first, WCAG, microcopy.
- **`lib/landing/builder.ts`** → el mapeo materia prima → config y marca → tema. La skill arma el
  `BuilderInput`, no reinventa el shape.
