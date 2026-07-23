---
phase: quick-260723-tma
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/email.ts
  - test/brand-email.test.ts
  - app/api/payment/webhook/[slug]/route.ts
  - app/api/booking/create/route.ts
  - app/api/appointments/create/route.ts
  - app/api/notify/booking/route.ts
  - app/api/cancel/[token]/route.ts
  - app/api/notify/cancel/route.ts
  - app/api/cron/cancel-expired/route.ts
  - app/api/google/sync/route.ts
  - app/api/abonos/create/route.ts
  - app/api/abonos/cancel/route.ts
  - app/api/abonos/cancel/[token]/route.ts
  - test/webhook-deposit.test.ts
  - test/abono-cancel-routes.test.ts
autonomous: false
requirements: ["TMA-01"]

must_haves:
  truths:
    - "Un negocio en theme cyber recibe el mail con su acento real (cyan #00e5ff / amber #ffd23d), no el rojo #d94a2b."
    - "Un negocio en theme cyber con font='auto' recibe el mail con Orbitron, no Helvetica."
    - "Un negocio forjo sigue recibiendo su mismo color y (ahora) su fuente de theme — cero regresión en color forjo."
    - "El primaryOverride revalidado por isSafeColor mantiene precedencia por encima de la paleta/theme (igual que hoy)."
    - "La URL de Google Fonts se arma SOLO desde el allowlist literal, nunca desde el valor crudo de theme/font de la DB (invariante T-wxt-02 intacto)."
  artifacts:
    - path: "lib/email.ts"
      provides: "brandEmail theme-aware (color desde THEME_PALETTES + fuente desde THEME_EMAIL_FONT), emailBrandInputs devuelve theme, 10 send* aceptan y pasan theme"
      contains: "THEME_EMAIL_FONT"
    - path: "test/brand-email.test.ts"
      provides: "cobertura de themes NO-forjo: cyber/cyan → cyan, font auto + cyber → Orbitron; seguridad del link preservada"
      contains: "cyber"
    - path: "app/api/payment/webhook/[slug]/route.ts"
      provides: "caller pasa theme: brand.theme a sus send*"
      contains: "brand.theme"
  key_links:
    - from: "lib/email.ts brandEmail"
      to: "lib/theme-config.ts THEME_PALETTES"
      via: "THEME_PALETTES[normalizeTheme(theme)].find(p => p.id === normalizePalette(t, palette)).swatches[0]"
      pattern: "THEME_PALETTES\\[normalizeTheme"
    - from: "lib/email.ts emailBrandInputs"
      to: "lib/email.ts brandEmail (vía los 11 callers)"
      via: "emailBrandInputs devuelve theme; cada send* lo pasa a brandEmail"
      pattern: "theme: brand\\.theme"
---

<objective>
Hacer el branding de los mails THEME-AWARE. Hoy (quick 260722-wxt) el color sale de un mapa
propio `EMAIL_PALETTE_HEX` con SOLO las 5 paletas forjo, y la fuente se mapea por id explícito;
un negocio en theme no-forjo (modern/spa/cyber) recibe el mail con rojo #d94a2b y Helvetica aunque
su web/panel usen otro color y fuente. El fix reusa la MISMA data canónica que ya resuelve la
og:image (`THEME_PALETTES` + `normalizeTheme`/`normalizePalette`) para el color, y agrega un
allowlist theme→fuente para la tipografía, sin duplicar tablas ni tocar el motor de theme.

Purpose: que el mail espeje el color y la fuente REALES del negocio (mismo look que su página
pública), independientemente del theme. Cierra la limitación aceptada del wxt.
Output: `brandEmail` recibe `theme` y resuelve color+fuente por theme; `emailBrandInputs` devuelve
`theme`; los 10 templates y los 11 callers lo threadean; tests que cubren un theme no-forjo.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@lib/email.ts
@lib/theme-config.ts
@app/[slug]/opengraph-image.tsx
@lib/landing/theme.ts
@app/layout.tsx
@app/themes.css
@test/brand-email.test.ts

# Skill del proyecto (convenciones): .claude/skills/convenciones-forjo/SKILL.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: brandEmail theme-aware (color + fuente) en lib/email.ts + tests</name>
  <files>lib/email.ts, test/brand-email.test.ts</files>
  <behavior>
    - brandEmail({ theme: 'cyber', palette: 'cyan' }).accent === '#00e5ff' (NO '#d94a2b').
    - brandEmail({ theme: 'cyber', palette: 'amber' }).accent === '#ffd23d'.
    - brandEmail({ theme: 'modern', palette: 'indigo' }).accent === '#5b6ef5'.
    - brandEmail({ theme: 'spa', palette: 'sage' }).accent === '#7e9b82'.
    - brandEmail({ theme: 'forjo', palette: 'red' }).accent === '#d94a2b' (cero regresión forjo).
    - brandEmail({ font: 'auto', theme: 'cyber' }).headingFontFamily contiene 'Orbitron' y fontLink contiene 'Orbitron'.
    - brandEmail({ font: 'auto', theme: 'forjo' }).headingFontFamily contiene 'Archivo'.
    - brandEmail({ font: null, theme: 'spa' }).headingFontFamily contiene 'serif'.
    - brandEmail({ font: 'bauhaus' }) sigue ganando por id explícito → 'Archivo' (precedencia (a)).
    - primaryOverride hex válido sigue ganando sobre theme/paleta; inválido se ignora (isSafeColor).
    - Un `font` crudo desconocido NUNCA aparece en el fontLink (invariante de seguridad).
  </behavior>
  <action>
Importar de `@/lib/theme-config`: `THEME_PALETTES`, `normalizeTheme`, `normalizePalette`.

COLOR (theme-aware): borrar por completo el mapa muerto `EMAIL_PALETTE_HEX`. En `brandEmail`
reemplazar el lookup `EMAIL_PALETTE_HEX[palette ?? '']` por la MISMA resolución que `brandedHex` de
app/[slug]/opengraph-image.tsx: `const t = normalizeTheme(theme)`; `const palId = normalizePalette(t, palette)`;
tomar `THEME_PALETTES[t].find(p => p.id === palId)?.swatches[0]` con fallback final `?? '#d94a2b'`.
La precedencia del `primaryOverride` revalidado por `isSafeColor` queda ARRIBA de todo, exactamente
como hoy. NO duplicar la tabla THEME_PALETTES (se importa); a lo sumo replicar el resolver de 4 líneas
como helper privado local (p.ej. `themeAccentHex(theme, palette)`) — nada más.

FUENTE (theme-aware): agregar un mapa allowlist fijo `THEME_EMAIL_FONT: Record<string, { googleFamily: string; familyStack: string }>`
(mismo patrón y garantía de seguridad que el `EMAIL_HEADING_FONT` ya existente) con las 4 claves de theme:
forjo → googleFamily 'Archivo', familyStack "'Archivo',Arial,sans-serif"; modern → 'Plus+Jakarta+Sans',
"'Plus Jakarta Sans',Arial,sans-serif"; spa → 'Cormorant+Garamond', "'Cormorant Garamond',Georgia,serif";
cyber → 'Orbitron', "'Orbitron',Arial,sans-serif". (Valores verificados contra app/layout.tsx (next/font:
Archivo, Plus_Jakarta_Sans, Cormorant_Garamond, Orbitron), app/themes.css líneas 229-233 y THEME_HEADING_FONT.)
Precedencia en brandEmail: (a) si `font` es un id explícito de `EMAIL_HEADING_FONT` → esa def (comportamiento
actual); (b) si no (incluye 'auto', null y desconocido) → `THEME_EMAIL_FONT[normalizeTheme(theme)]`; (c) si aún
no hubiera def → fallback Helvetica actual (`EMAIL_DEFAULT_HEADING`, sin link). La URL de Google Fonts se sigue
armando SOLO con el `googleFamily` del allowlist (jamás con theme/font crudo): invariante T-wxt-02 intacto.

SIGNATURE: `brandEmail` acepta un campo opcional más, `theme?: string | null`, en su objeto de params (además
de palette/font/primaryOverride).

THREADING interno del módulo: `emailBrandInputs` ya resuelve `t = resolveLandingTheme(...)` y `t.theme` existe;
cambiar su return para incluir `theme: t.theme` (return type pasa a `{ palette; theme; font; primaryOverride }`).
En cada uno de los 10 templates `send*` (sendConfirmationEmail, sendManualBookingConfirmation, sendAbonoConfirmation,
sendAbonoCancelledEmail, sendAbonoCancelledAdminNotification, sendAdminNotification, sendBusinessCancelEmail,
sendClientCancelEmail, sendPendingPaymentEmail, sendExpiredHoldEmail): agregar `theme?: string | null` al
destructuring de params y a su type inline, y cambiar la llamada `brandEmail({ palette, font, primaryOverride })`
por `brandEmail({ theme, palette, font, primaryOverride })`. Cambio ADITIVO: `theme` es opcional, así que el
árbol entero sigue compilando aunque los callers todavía no lo pasen (se hace en Task 2 y 3).

NO tocar: el escapado `esc()` / WR-02, `renderEmailHeader`, el fondo claro del mail, ni el HTML de los templates.
NO tocar lib/theme-config.ts, lib/landing/theme.ts ni lib/contrast.ts (se reusan tal cual).

TESTS (test/brand-email.test.ts): actualizar para cubrir themes no-forjo y el nuevo comportamiento de fuente:
- COLOR: agregar casos non-forjo (cyber/cyan → '#00e5ff'; cyber/amber → '#ffd23d'; modern/indigo → '#5b6ef5';
  spa/sage → '#7e9b82'). Los casos forjo existentes (líneas 12-25) NO cambian: default theme = forjo y
  THEME_PALETTES.forjo swatches[0] == los hex viejos.
- FUENTE: el bloque 'auto / null / desconocido' (líneas 68-74) CAMBIA de semántica: sin id de fuente explícito
  ahora resuelve la fuente del THEME. Reescribirlo: font 'auto' + theme 'cyber' → headingFontFamily y fontLink
  contienen 'Orbitron'; theme 'forjo' + font 'auto' → 'Archivo'; theme 'spa' + font null → 'serif'. Dejar el
  fallback Helvetica solo como red de seguridad última (sin theme válido en el allowlist).
- SEGURIDAD (líneas 76-82): MANTENER `not.toContain(evil)` y `not.toContain('evil')` (el valor crudo nunca se
  interpola). Ajustar SOLO la assertion `fontLink === ''`: con un font desconocido + theme válido el link ahora
  se arma desde el allowlist del theme (contiene la familia del theme, no el evil). Verificar que el link NO
  contiene el string crudo.
- Los bloques de override (28-40), contraste (42-55) y emailBrandInputs (85-108) siguen; sumar un assert de que
  emailBrandInputs devuelve `theme`.
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run test/brand-email.test.ts test/abono-cancel-email.test.ts test/email-escaping.test.ts && ./node_modules/.bin/tsc --noEmit</automated>
  </verify>
  <done>brandEmail resuelve color desde THEME_PALETTES y fuente desde THEME_EMAIL_FONT según theme; EMAIL_PALETTE_HEX borrado; brandEmail acepta theme; emailBrandInputs devuelve theme; los 10 send* aceptan y pasan theme; test/brand-email.test.ts cubre cyber/modern/spa (color) y font auto+theme (Orbitron/Archivo/serif) manteniendo el invariante de seguridad del link; los 21 de abono-cancel-email y los de email-escaping siguen verdes; tsc --noEmit verde.</done>
</task>

<task type="auto">
  <name>Task 2: threading de theme en callers grupo A (booking/confirmaciones)</name>
  <files>app/api/payment/webhook/[slug]/route.ts, app/api/booking/create/route.ts, app/api/appointments/create/route.ts, app/api/notify/booking/route.ts, app/api/cancel/[token]/route.ts, test/webhook-deposit.test.ts</files>
  <action>
Cada uno de estos callers ya tiene `const brand = emailBrandInputs(business)` (o la variable de negocio
casteada) y llama a sus `send*` pasando `palette: brand.palette, font: brand.font, primaryOverride: brand.primaryOverride`.
Edición uniforme, una línea por call site: agregar `theme: brand.theme,` junto a esos tres campos en CADA
llamada a un `send*`. Call sites por archivo:
- payment/webhook/[slug]/route.ts (:76 brand): sendConfirmationEmail y sendAdminNotification.
- booking/create/route.ts (:64 brand): sendPendingPaymentEmail y sendExpiredHoldEmail.
- appointments/create/route.ts (:44 brand): sendManualBookingConfirmation.
- notify/booking/route.ts (:30 brand): sendConfirmationEmail y sendAdminNotification.
- cancel/[token]/route.ts (:66 brand): sendClientCancelEmail y sendAdminNotification.

MOCK: en test/webhook-deposit.test.ts (:53) el stub `emailBrandInputs: () => ({ palette: null, font: null, primaryOverride: null })`
debe reflejar la nueva forma → agregar `theme: null,`. (El test no asierta branding; es por consistencia de shape.)

NO agregar SELECTs nuevos: `emailBrandInputs` ya recibe theme/palette/font/landing_config del business (el wxt
ya sumó esas columnas al SELECT de cada caller). Solo se threadea la prop `theme` que ahora devuelve brand.
  </action>
  <verify>
    <automated>./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run test/webhook-deposit.test.ts</automated>
  </verify>
  <done>Los 5 callers del grupo A pasan theme: brand.theme en cada send*; el mock de webhook-deposit incluye theme: null; tsc --noEmit verde y webhook-deposit.test.ts verde.</done>
</task>

<task type="auto">
  <name>Task 3: threading de theme en callers grupo B (cancelaciones/abonos/cron) + suite completa</name>
  <files>app/api/notify/cancel/route.ts, app/api/cron/cancel-expired/route.ts, app/api/google/sync/route.ts, app/api/abonos/create/route.ts, app/api/abonos/cancel/route.ts, app/api/abonos/cancel/[token]/route.ts, test/abono-cancel-routes.test.ts</files>
  <action>
Mismo patrón uniforme que Task 2: agregar `theme: brand.theme,` junto a `palette/font/primaryOverride` en CADA
llamada a un `send*`. Call sites por archivo:
- notify/cancel/route.ts (:97 brand): sendBusinessCancelEmail.
- cron/cancel-expired/route.ts (:305 brand): sendExpiredHoldEmail.
- google/sync/route.ts (:29 brand): sendBusinessCancelEmail.
- abonos/create/route.ts (:94 brand): sendAbonoConfirmation.
- abonos/cancel/route.ts (:68 brand): sendAbonoCancelledEmail.
- abonos/cancel/[token]/route.ts (:145 brand): sendAbonoCancelledEmail y sendAbonoCancelledAdminNotification.

MOCK: en test/abono-cancel-routes.test.ts (:82) el stub `emailBrandInputs: () => ({ palette: null, font: null, primaryOverride: null })`
→ agregar `theme: null,` por consistencia de shape.

Igual que Task 2: NO agregar SELECTs; solo threadear la prop `theme`.
  </action>
  <verify>
    <automated>./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run test/abono-cancel-routes.test.ts && ./node_modules/.bin/vitest run</automated>
  </verify>
  <done>Los 6 callers del grupo B pasan theme: brand.theme en cada send*; el mock de abono-cancel-routes incluye theme: null; tsc --noEmit verde, abono-cancel-routes.test.ts verde y la SUITE COMPLETA (./node_modules/.bin/vitest run) verde (incluidos los 21 de abono-cancel-email y los de email-escaping).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking-human">
  <what-built>
Branding de mail theme-aware: brandEmail resuelve el acento desde THEME_PALETTES y la fuente desde
THEME_EMAIL_FONT según el theme del negocio; emailBrandInputs threadea `theme`; los 11 callers lo pasan.
En local NO se puede validar visualmente el mail: RESEND está vacío (no envía). Requiere deploy y una
prueba real en Apple Mail contra un negocio en theme no-forjo.
  </what-built>
  <how-to-verify>
    1. Deployar a prod (o al entorno donde RESEND esté configurado).
    2. Con el negocio de prueba `estudio-test` (theme cyber: acento cyan/amber, fuente Orbitron),
       disparar un mail real (p.ej. una reserva/confirmación que caiga en un send*).
    3. Abrir el mail en Apple Mail (cliente que respeta el <link> de Google Fonts).
    4. Confirmar VISUALMENTE:
       - La barra de header/footer sale con el acento del theme cyber (cyan #00e5ff o amber #ffd23d
         según su paleta), NO con el rojo #d94a2b.
       - Los titulares usan Orbitron (no Helvetica).
       - El fondo del mail sigue CLARO (no cambió) y el texto es legible (contraste OK).
    5. (Opcional) Repetir con un negocio forjo para confirmar cero regresión (rojo + Archivo).
  </how-to-verify>
  <resume-signal>Escribí "aprobado" si el mail sale con cyan/amber + Orbitron en Apple Mail, o describí lo que se ve mal (color/fuente/contraste).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DB (businesses.theme/palette/font, landing_config) → HTML del mail | Valores per-negocio cruzan a atributos `style=` (color) y a la URL de Google Fonts (fuente). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tma-01 | Tampering/Injection | brandEmail color (accent → style=) | mitigate | El color sale SOLO de la tabla literal THEME_PALETTES vía normalizeTheme/normalizePalette (allowlist), nunca de un valor crudo; el override sigue gateado por isSafeColor (regex hex estricto). |
| T-tma-02 | Tampering/Injection | brandEmail fuente (googleFamily → URL de Google Fonts) | mitigate | La URL se arma SOLO desde el `googleFamily` literal de EMAIL_HEADING_FONT/THEME_EMAIL_FONT (allowlist fijo), nunca desde theme/font crudo de la DB. Test de seguridad cubre que un valor desconocido no se interpola. |
| T-tma-03 | Info disclosure / regresión | Escapado WR-02 de valores no confiables (clientName, etc.) | accept | Fuera de alcance: no se toca `esc()` ni el HTML; los tests email-escaping y abono-cancel-email deben seguir verdes como evidencia. |
</threat_model>

<verification>
- Suite completa verde: `./node_modules/.bin/vitest run` (incluye brand-email, abono-cancel-email 21, email-escaping, webhook-deposit, abono-cancel-routes).
- Tipos: `./node_modules/.bin/tsc --noEmit` sin errores.
- SIEMPRE binarios locales `./node_modules/.bin/...`; NUNCA `npx tsc`/`npx vitest` (paquete equivocado → falso verde).
- Validación visual del mail: checkpoint humano post-deploy (Apple Mail, estudio-test cyber).
</verification>

<success_criteria>
- Un negocio no-forjo (cyber/modern/spa) recibe el mail con su acento real y su fuente de theme.
- Los negocios forjo no cambian su color; su fuente pasa a la del theme (Archivo) coherente con su marca.
- primaryOverride validado mantiene precedencia; el invariante de seguridad del link se preserva (test).
- tsc + vitest completos en verde; escapado WR-02 intacto.
</success_criteria>

<output>
Crear `.planning/quick/260723-tma-mails-theme-aware/260723-tma-SUMMARY.md` al terminar.
</output>
