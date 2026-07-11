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

---

### MODO EDICIÓN (retocar una landing existente)

Si el operador quiere **RETOCAR** una web ya hecha (cambiar el headline, sumar fotos, cambiar la
paleta) y **NO rehacerla**, no arranques de cero ni recorras todo el flujo: este es un sub-modo
corto que parte de lo último que se escribió y toca solo el campo pedido.

1. **Fuente de verdad: el payload guardado.** Buscá `landing-payloads/<slug>.json` (se persiste en
   cada escritura, paso 7). Tiene la forma `{ "input": <BuilderInput>, "brand": <BrandHints> }`.
   - **Si existe** → es el estado exacto de lo último que se escribió. Partí de ahí.
   - **Si NO existe** (landing hecha antes de que se persistieran los payloads) → reconstruí el
     estado actual con:

     ```powershell
     npm run setup:landing -- --inspect <slug>
     ```

     El `--inspect` extendido **vuelca el `landing_config` completo** (copy incluido), así que el
     operador **no re-tipea todo**: solo confirma o retoca. Avisale que, al escribir, se va a
     **re-generar el config completo** a partir del payload reconstruido. Si algún campo del config
     volcado no alcanza para reconstruir lo que necesitás, pedíselo puntualmente al operador.

2. **Aplicá SOLO el cambio pedido** sobre `input`/`brand` del payload (ej. `hero.headline`, sumar
   `gallery.images`, cambiar `palette`). **No toques lo que no se pidió** — el resto queda idéntico.

3. **Copy nuevo → `humanizador` (obligatorio).** Si el cambio suma o reescribe copy, ese texto pasa
   por la skill `humanizador` antes del checkpoint, igual que en el flujo completo (paso 4). Nunca
   escribas copy crudo sin humanizar, aunque sea un solo campo.

4. **CHECKPOINT ACOTADO (D-05 — BLOQUEANTE).** Mostrá el diff **a nivel campo**: antes → después
   **solo de los campos que cambiaron** (ej. `hero.headline: <valor viejo> → <valor nuevo>`),
   computado comparando el payload viejo contra el nuevo. **NO muestres el config entero.** El diff
   contiene solo copy/imágenes/tema — nunca credenciales ni columnas sensibles del tenant. Esperá
   aprobación explícita, con el mismo ethos bloqueante del paso 6.

5. **Re-escribí (idempotente, D-06).** Corré el mismo comando del paso 7 con el payload editado:

   ```powershell
   npm run setup:landing -- --slug <slug> --config landing-payloads/<slug>.json
   ```

   Re-correr con el mismo payload da el mismo resultado: el script re-arma el `landing_config`
   completo de forma determinista. "Aplicar solo el campo" = editar solo ese campo del payload,
   **no** un patch parcial de la DB.

---

### 3. FUENTES DE CONTENIDO (materia prima — elegí la que haya)

El objetivo es juntar **copy + fotos reales** del negocio. Probá las fuentes en **orden de
confiabilidad**: si una falla o no hay data, caé a la siguiente sin bloquearte.

**(a) Entrada estructurada del operador (la más confiable — D-01).** Pedí en un formato fijo:

- **Hero**: propuesta de valor SIN la ciudad + la ciudad/zona (va al `kicker`) + (opcional) una
  frase secundaria.
- **About**: 2-4 líneas de quién es / qué hace el negocio.
- **Fotos**: ruta a una **carpeta local** con 6-12 imágenes, marcando cuál es hero / about / galería.
- **Servicios NO**: se derivan solos de la tabla (D10-04) — no los pidas ni los armes.

**(b) Web existente del negocio (D-02).** Si ya tiene web (Instagram link-in-bio, Linktree, sitio
viejo), leéla con **WebFetch nativo** para sacar copy + descargar las imágenes localmente. Mismo
trato que Instagram: **nunca hot-link** (las URLs caducan), el texto pasa por el `humanizador`, y
**NO copies estructura ni HTML** — solo el contenido.

**(c) Instagram (best-effort — D-03).** Cuando el negocio tiene IG activo, ahí están sus fotos
reales y, en las captions, su voz y sus datos. Se cosecha con **instaloader** (CLI de Python) que
**reusa la sesión de Firefox** (sin password) y se consolida con `scripts/instagram-cosechar.py`.

- **Prerrequisitos** (tool LOCAL del operador, **NO** dependencias de la app — no van al
  `package.json` ni al runtime web):
  - `pip install instaloader browser_cookie3`.
  - Estar **logueado en Instagram en Firefox** en esta PC. **Firefox** es el más confiable para
    importar la sesión (Chrome/Edge fallan por el cifrado de cookies); las cookies tienen que estar
    **en disco** → **incógnito NO sirve**.
  - Usá una **cuenta IG dedicada** (no la personal): scrapear puede marcar la cuenta. El perfil a
    cosechar debe ser **público** (uno privado exige que la cuenta logueada lo siga).

  ```powershell
  # 1. Bajar posts (fotos + metadata). Sin videos, solo imágenes. Reusa la sesión de Firefox:
  python -m instaloader --load-cookies firefox --no-videos --no-video-thumbnails --dirname-pattern "<handle>" "<handle>"
  # 2. Consolidar a datos usables:
  python scripts/instagram-cosechar.py <dir>/<handle>
  ```

  El paso 2 (`scripts/instagram-cosechar.py`) deja en la carpeta: `captions.md` (las captions en
  limpio — **voz real del negocio**, materia prima de copy), `resumen.json` (posts por fecha con
  `likes`/`caption`/`images[]` + un bloque `top_fotos` con las mejores) y las imágenes en alta.

- **Falla esperada** (login-wall / anti-bot / rate-limit) → **caé a la fuente (a) sin bloquearte**.
  Los `403 Forbidden [retrying]` intermitentes son normales: instaloader reintenta solo y termina.

**Cierre (vale para cualquier fuente — no regresión):** el copy pasa por el `humanizador` (paso 4)
y **NADA se inventa** (regla fundamental) — se usa lo que el negocio ya dijo. Las imágenes van como
**RUTAS LOCALES**; el script las **re-hostea** a `landing-assets/{businessId}/` (SKILL-03). Las URLs
del CDN de IG/web **caducan** y NO sirven en runtime: se descargan localmente, **nunca** van al config.

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
- `rsv`: `{ header?, intro?, images? }` — las **fotos de confianza que van ARRIBA del widget de
  reserva**: la sucursal / el ambiente, lo último que el cliente ve antes de reservar. Si no pasás
  `rsv.images`, el builder **reusa las primeras 3 de la galería** para que el strip no salga vacío
  (el dueño después las cambia desde el CMS). Si no hay ninguna foto en ningún lado, el strip no se
  renderiza y el bloque de reserva queda como siempre.
- **El widget de reserva en sí NO se configura** (LAND-02): `BookingClient` es una caja negra que
  el renderer monta solo. `rsv` solo decora lo de arriba; no toca el flujo de reservas.

Las imágenes (`hero.image`, `about.image`, `gallery.images[]`, `rsv.images[]`) van como **RUTAS
LOCALES** del disco (las que dejó el scrape o el operador). El script las re-hostea — no pongas URLs
de IG.

**Movimiento:** el builder escribe `motion: 'premium'` solo (reveal al entrar en viewport +
scale-in de las fotos + lift en hover). No hay que pasar nada. El dueño lo baja a `subtle` o `none`
desde el CMS (**Estilo visual → Movimiento**) si lo quiere más quieto.

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

Escribí el `BuilderInput` + `brand` a un archivo JSON **persistente por slug** en
`landing-payloads/<slug>.json` (carpeta gitignored, creala si no existe; PowerShell pelea con el
quoting de JSON inline, por eso el script recibe `--config <path>`). El JSON tiene la forma
`{ "input": <BuilderInput>, "brand": <BrandHints> }`. **NO lo borres al terminar** — queda guardado
para editar y re-correr la próxima sin rehacer todo (ej. ajustar el headline o el kicker y volver a
escribir). Si ya existe `landing-payloads/<slug>.json`, partí de ese y editá lo que cambie. Luego corré:

```powershell
npm run setup:landing -- --slug <slug> --config landing-payloads/<slug>.json
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
  `web-scrolling`. Esas skills son **referencia/inspiración**, no output literal (D5). Todo es
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

- **Cosecha de Instagram** → el pipeline **instaloader** (documentado en el paso "3. FUENTES DE
  CONTENIDO") + `scripts/instagram-cosechar.py`. Reusa la sesión de Firefox del operador; es la
  fuente de IG de esta skill. (`instagram-a-web` ya NO es el motor de IG.)
- **`web-scrolling`** → SOLO criterio/inspiración de diseño (su HTML no se usa).
- **`humanizador`** → pasar el copy generado para que no suene a IA.
- **Reglas UI/UX del CLAUDE global** → jerarquía, mobile-first, WCAG, microcopy.
- **`lib/landing/builder.ts`** → el mapeo materia prima → config y marca → tema. La skill arma el
  `BuilderInput`, no reinventa el shape.
