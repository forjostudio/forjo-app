---
phase: quick-260722-wxt
plan: "260722-wxt"
type: execute
wave: 1
depends_on: []
autonomous: false            # incluye un checkpoint humano (prueba visual post-deploy)
requirements: [BRAND-EMAIL-01]
files_modified:
  - lib/email.ts
  - test/brand-email.test.ts
  - test/email-escaping.test.ts
  - test/abono-cancel-email.test.ts
  - app/api/booking/create/route.ts
  - app/api/appointments/create/route.ts
  - app/api/notify/booking/route.ts
  - app/api/notify/cancel/route.ts
  - app/api/cancel/[token]/route.ts
  - app/api/google/sync/route.ts
  - app/api/cron/cancel-expired/route.ts
  - app/api/payment/webhook/[slug]/route.ts
  - app/api/abonos/create/route.ts
  - app/api/abonos/cancel/route.ts
  - app/api/abonos/cancel/[token]/route.ts

must_haves:
  truths:
    - "TODOS los templates (cliente Y dueño) usan el MISMO acento que la pagina publica del negocio (override del landing o hex de la paleta), no el campo huerfano primary_color: se elimina el header oscuro fijo #1a1714 de los dos templates admin."
    - "El texto sobre el acento es legible en cualquier paleta (incluida yellow #c8901a): sale de onAccentText, no de blanco fijo."
    - "Los titulos del mail (nombre en el header + h-line) usan la fuente de titulos del negocio cuando esta definida; caen a fuente segura si font='auto'/null o el cliente de correo ignora el <link>."
    - "El cuerpo del mail y el fondo claro NO cambian; en los 10 templates el header/footer/boton/borde-izquierdo cambian de color y el texto de contraste."
    - "WR-02 cerrado en TODOS los templates: todo valor de origen no confiable (clientName, service, businessName, telefono/email mostrados, businessSlug) va envuelto en esc() en el HTML; el text plano queda sin escapar por convencion."
    - "Los 11 call sites pasan palette/font/override (via emailBrandInputs) en lugar de primaryColor."
    - "Ningun valor crudo de color o fuente de la DB se interpola en un atributo style= ni en la URL/href de Google Fonts."
    - "test/abono-cancel-email.test.ts sigue verde (21 casos), incluidos los de escapado WR-02."
  artifacts:
    - path: "lib/email.ts"
      provides: "brandEmail (tokens de marca puros) + emailBrandInputs (fila de negocio -> inputs) + renderEmailHeader reescrito + los 10 templates consumiendo brandEmail"
      contains: "export function brandEmail"
    - path: "test/brand-email.test.ts"
      provides: "Cobertura unitaria de brandEmail: mapa de color, onAccentText, allowlist de fuente, defensa isSafeColor"
      min_lines: 40
    - path: "test/email-escaping.test.ts"
      provides: "Cobertura WR-02 de los templates no-abono: clientName/service/email con markup salen escapados en el html (cliente y dueño), crudos en el text plano"
      min_lines: 30
    - path: "app/api/payment/webhook/[slug]/route.ts"
      provides: "SELECT con palette/theme/font/landing_config + emailBrandInputs + params nuevos a sendConfirmationEmail y sendAdminNotification"
      contains: "emailBrandInputs"
  key_links:
    - from: "app/api/**/route.ts (11 call sites)"
      to: "lib/email.ts emailBrandInputs"
      via: "cada caller resuelve inputs desde la fila de businesses (palette/theme/font/landing_config)"
      pattern: "emailBrandInputs\\("
    - from: "lib/email.ts emailBrandInputs"
      to: "lib/landing/theme.ts resolveLandingTheme"
      via: "misma precedencia que app/[slug]/layout.tsx (override landing -> palette del negocio)"
      pattern: "resolveLandingTheme\\("
    - from: "lib/email.ts brandEmail"
      to: "lib/contrast.ts onAccentText + lib/landing/theme.ts isSafeColor"
      via: "color de texto legible sobre el acento + revalidacion del hex override (defensa en profundidad)"
      pattern: "onAccentText\\(|isSafeColor\\("
---

<objective>
Unificar el branding de los mails de `lib/email.ts` para que el COLOR y la FUENTE de titulos de cada mail salgan de la misma fuente de verdad que la pagina publica de reservas, en lugar del campo huerfano `businesses.primary_color` y la fuente hardcodeada.

Diagnostico cerrado (no re-investigar el por que): hoy el `accent` sale de `primary_color` (un hex que el dueño ni edita) y la fuente esta clavada en 'Helvetica Neue'. La pagina, en cambio, resuelve color+fuente con `resolveLandingTheme(...)` (override del landing -> paleta del negocio) y los aplica via `PaletteScript`. El mail tiene que espejar ESA precedencia.

Purpose: coherencia de marca entre la reserva y sus mails, cierre COMPLETO del linaje WR-02/W-01 (todo valor de origen no confiable escapado con esc() en el HTML, en TODOS los templates) y muerte del campo huerfano como fuente de color.
Output: un helper unico `brandEmail` (+ `emailBrandInputs`) consumido por los 10 templates, con los 11 call sites pasando palette/font/override.

Decision de alcance (resueltas por el usuario — implementar, NO revisar):
- TODOS los templates (10: los 8 al cliente Y los 2 al dueño `sendAdminNotification` / `sendAbonoCancelledAdminNotification`) reciben el tratamiento UNIFORME: acento por paleta/override (`brand.accent`) + texto de contraste (`brand.accentText`/`accentTextMuted` via onAccentText) + fuente de titulos. El header oscuro fijo `#1a1714` de los dos templates admin SE ELIMINA: pasan a usar `brand.accent` como los demas (dueño y cliente miran casillas distintas; no hay confusion posible por unificar).
- WR-02 EN ALCANCE: en los templates NO-abono, todo valor dinamico de origen no confiable (`clientName`, `service`, `businessName`, telefono/email del cliente que se MUESTRAN, `businessSlug`) que hoy se interpola CRUDO en el HTML pasa a envolverse con el `esc()` que ya existe en el modulo. Nombre y servicio salen del form publico de `/api/booking/create` y terminan renderizados en el mail que el DUEÑO lee como confiable (`sendAdminNotification`) -> vector real de inyeccion/phishing, mismo WR-02 que la Phase 7 ya cerro para abonos. Los campos del `text` plano NO se escapan (ahi las entidades se verian como basura), igual que la convencion del modulo.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@lib/email.ts
@lib/contrast.ts
@lib/landing/theme.ts
@lib/theme-config.ts
@components/palette-script.tsx
@app/[slug]/layout.tsx
@app/layout.tsx
@app/globals.css
@app/themes.css
@test/abono-cancel-email.test.ts

Skills del proyecto a leer antes de tocar: `.claude/skills/convenciones-forjo/SKILL.md` y `.claude/skills/supabase-multitenant-rls/SKILL.md`.

Datos ya extraidos del codigo (no re-descubrir):

- Precedencia de la pagina (app/[slug]/layout.tsx): `const t = resolveLandingTheme(landing_config?.theme, { theme, palette, font })` -> `<PaletteScript palette={t.palette} theme={t.theme} font={t.font} primary={t.primary} />`. `t.primary` solo existe si el landing trae `overrides.primary` valido por isSafeColor; si no, undefined. El mail debe reusar `resolveLandingTheme` — NO reimplementar la precedencia.

- Mapa PALETA -> hex CLARO (globals.css lineas 148-161, variante light SIEMPRE; el mail va sobre fondo claro):
  red `#d94a2b` · blue `#2a5fa5` · yellow `#c8901a` · green `#2f8a5b` · ink `#1a1714` · (paleta ausente/desconocida) -> red `#d94a2b`.
  Nota: estas son las 5 paletas del theme forjo. Un negocio en theme modern/spa/cyber tiene paletas fuera del mapa -> caen al default red (limitacion aceptada de esta iteracion; el mapa es una tabla facil de extender desde themes.css si el usuario luego lo pide).

- Mapa FONT id -> fuente de titulos (themes.css lineas 229-233; familias reales en app/layout.tsx via next/font/google):
  geometrica -> "Plus Jakarta Sans" · bauhaus -> "Archivo" · elegante -> "Cormorant Garamond" (serif) · tech -> "Orbitron" · suave -> "Sora".
  `auto`/null/desconocido -> NO se emite <link>, se usa el fallback de siempre.

- onAccentText(hex) (lib/contrast.ts) ya existe y devuelve `'#ffffff' | '#1a1714'` por luminancia WCAG. Reusar tal cual. NO tocar lib/contrast.ts.
- isSafeColor(value) (lib/landing/theme.ts) valida hex por allowlist estricta. Reusar para revalidar el override.

- 11 call sites (verbo -> archivo:linea del SELECT / de la llamada):
  1. sendExpiredHoldEmail + sendPendingPaymentEmail -> app/api/booking/create/route.ts (SELECT :57, calls :182/:239)
  2. sendManualBookingConfirmation -> app/api/appointments/create/route.ts (SELECT :37, call :145)
  3. sendConfirmationEmail + sendAdminNotification -> app/api/notify/booking/route.ts (nested SELECT :18, calls :42/:75)
  4. sendBusinessCancelEmail -> app/api/notify/cancel/route.ts (nested SELECT :45, call :108)
  5. sendClientCancelEmail + sendAdminNotification -> app/api/cancel/[token]/route.ts (nested SELECT :22, calls :79/:101; cast en :63)
  6. sendBusinessCancelEmail -> app/api/google/sync/route.ts (SELECT :20, call :67)
  7. sendExpiredHoldEmail -> app/api/cron/cancel-expired/route.ts (SELECT :261, call :304)
  8. sendConfirmationEmail + sendAdminNotification -> app/api/payment/webhook/[slug]/route.ts (SELECT :65, calls :170/:200)
  9. sendAbonoConfirmation -> app/api/abonos/create/route.ts (SELECT :87, call :271)
  10. sendAbonoCancelledEmail -> app/api/abonos/cancel/route.ts (SELECT :61, call :128)
  11. sendAbonoCancelledEmail + sendAbonoCancelledAdminNotification -> app/api/abonos/cancel/[token]/route.ts (nested SELECT :59, calls :157/:182; cast en :101)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: brandEmail + emailBrandInputs + reescritura de renderEmailHeader, los 10 templates y escapado WR-02</name>
  <files>lib/email.ts, test/brand-email.test.ts, test/email-escaping.test.ts, test/abono-cancel-email.test.ts</files>
  <behavior>
    brandEmail (helper puro, unit-testeable):
    - accent = override valido (isSafeColor) SI viene; si no, el hex CLARO del mapa por paleta; si la paleta no esta en el mapa o es null -> red #d94a2b.
    - accentText = onAccentText(accent): yellow #c8901a -> #1a1714 (near-black legible); red/blue/green/ink -> #ffffff.
    - accentTextMuted = variante translucida de accentText (blanco -> rgba(255,255,255,.7); near-black -> rgba(26,23,20,.6)) para subtitulo del header y footer.
    - fontLink = <link rel=stylesheet> a Google Fonts SOLO para geometrica/bauhaus/elegante/tech/suave; auto/null/desconocido -> ''.
    - headingFontFamily = familia con fallback: bauhaus 'Archivo'..sans; geometrica 'Plus Jakarta Sans'..sans; elegante 'Cormorant Garamond',Georgia,serif; tech 'Orbitron'..sans; suave 'Sora'..sans; default 'Helvetica Neue',Arial,sans-serif.
    - Seguridad: un override que NO pasa isSafeColor se ignora (cae a paleta). Un font id desconocido NUNCA arma URL (cae a ''). El valor de font crudo jamas se interpola en la URL/href.
    emailBrandInputs (fila de negocio -> inputs, espejo exacto de app/[slug]/layout.tsx):
    - Toma { palette, theme, font, landing_config } y devuelve { palette, font, primaryOverride } via resolveLandingTheme(landing_config?.theme, { theme, palette, font }); primaryOverride = t.primary ?? null. NO lee primary_color (el campo huerfano deja de ser fuente).
  </behavior>
  <action>
En lib/email.ts, importar onAccentText (@/lib/contrast), isSafeColor + resolveLandingTheme (@/lib/landing/theme) y el tipo LandingTheme (@/lib/landing/schema).

1) Definir dos tablas literales fijas a nivel de modulo:
   - EMAIL_PALETTE_HEX: Record<string,string> = { red:'#d94a2b', blue:'#2a5fa5', yellow:'#c8901a', green:'#2f8a5b', ink:'#1a1714' }. Valores literales (de globals.css lineas 148-161), NUNCA de la DB.
   - EMAIL_HEADING_FONT: mapea cada font id valido (bauhaus, geometrica, elegante, tech, suave) a { googleFamily, familyStack } con los strings fijos del bloque de datos del <context>. La URL de Google Fonts se arma SOLO desde googleFamily (string fijo del mapa), nunca desde el argumento.

2) Exportar `brandEmail({ palette, font, primaryOverride }: { palette?: string|null; font?: string|null; primaryOverride?: string|null })` que devuelve { accent, accentText, accentTextMuted, fontLink, headingFontFamily } segun <behavior>. accent = (primaryOverride && isSafeColor(primaryOverride)) ? primaryOverride : (EMAIL_PALETTE_HEX[palette ?? ''] ?? '#d94a2b'). accentText = onAccentText(accent). accentTextMuted derivado de accentText. Para la fuente: buscar font en EMAIL_HEADING_FONT; si existe -> fontLink = un <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=<googleFamily>:wght@400;600;700;800&display=swap"> y headingFontFamily = familyStack; si no existe (incluye 'auto' y null) -> fontLink = '' y headingFontFamily = "'Helvetica Neue',Arial,sans-serif".

3) Exportar `emailBrandInputs(row: { palette?: string|null; theme?: string|null; font?: string|null; landing_config?: unknown })` que hace `const landingTheme = (row.landing_config as { theme?: LandingTheme } | null)?.theme; const t = resolveLandingTheme(landingTheme, { theme: row.theme, palette: row.palette, font: row.font }); return { palette: t.palette, font: t.font, primaryOverride: t.primary ?? null }`. Comentario en español explicando que espeja app/[slug]/layout.tsx y que a proposito NO lee primary_color.

4) Reescribir `renderEmailHeader(businessName, logoUrl, opts: { fontFamily: string; textColor: string; mutedColor: string })`. En el <div> del nombre: reemplazar `color:#ffffff` por `color:${opts.textColor}` y agregar `font-family:${opts.fontFamily};`. En el subtitulo "Gestion de turnos": reemplazar `color:rgba(255,255,255,.6)` por `color:${opts.mutedColor}`. Mantener intacto el escapado esc() de safeName. La variante con logo tambien aplica textColor+fontFamily al nombre.

5) En los 8 templates AL CLIENTE (sendConfirmationEmail, sendManualBookingConfirmation, sendAbonoConfirmation, sendAbonoCancelledEmail, sendBusinessCancelEmail, sendClientCancelEmail, sendPendingPaymentEmail, sendExpiredHoldEmail):
   - En la firma, agregar params opcionales `palette?, font?, primaryOverride?` (string|null). MANTENER `primaryColor?` como puente legacy temporal (se elimina en Task 3) para que los callers aun no migrados sigan compilando y comportandose como hoy.
   - Reemplazar la linea `const accent = (primaryColor && primaryColor.trim()) || '#d94a2b'` por: `const brand = brandEmail({ palette, font, primaryOverride: primaryOverride ?? primaryColor }); const accent = brand.accent`.
   - Inyectar `${brand.fontLink}` dentro del <head>, justo despues del ultimo <meta>.
   - Header: pasar `renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })`.
   - Titulo principal del cuerpo (el <p style="font-size:22px;font-weight:700;color:#1a1a1a;..."> tipo "Tu turno esta confirmado!"): agregar `font-family:${brand.headingFontFamily};` a ese style. El color #1a1a1a queda (va sobre fondo blanco).
   - Botones (los <a ...color:#ffffff...> sobre `background:${accent}`): cambiar `color:#ffffff` por `color:${brand.accentText}`.
   - Footer (el <div ...color:rgba(255,255,255,.7)...> sobre `background:${accent}`): cambiar por `color:${brand.accentTextMuted}`.
   - Cierre COMPLETO del linaje WR-02 (aplica a estos templates cliente): envolver con el `esc()` del modulo TODO valor de origen no confiable interpolado en el HTML — `clientName`, `businessName`, `service` y `businessSlug` (footer `forjo.studio/${esc(businessSlug)}` y hrefs `${baseUrl}/${esc(businessSlug)}`). NO escapar los mismos valores en el `text` plano (convencion del modulo: ahi las entidades se verian como basura). Valores derivados/seguros (fecha, hora, montos con fmtPrice, tokens) NO necesitan esc(). IMPORTANTE: `sendAbonoConfirmation` HOY interpola clientName/businessName/service CRUDOS -> escaparlos aca tambien; en cambio `sendAbonoCancelledEmail` YA escapa via sus rows -> NO re-tocar su escapado (romperia los 21 tests). Para un slug normal esc() no altera el string, asi que Test 6 (`/peluqueria-test"`) sigue verde. (El campo primary_color deja de leerse -> el otro medio del linaje queda cerrado por diseño.)

6) En los 2 templates ADMIN (sendAdminNotification, sendAbonoCancelledAdminNotification): agregar params opcionales `palette?, font?, primaryOverride?` (+ el puente `primaryColor?` legacy, igual que los cliente). Calcular `const brand = brandEmail({ palette, font, primaryOverride: primaryOverride ?? primaryColor })`. UNIFICAR con los cliente (se ELIMINA el header oscuro fijo): reemplazar TODOS los usos de `#1a1714` como color de acento (header bg, footer bg, borde-izquierdo de la tabla de detalle, y el color del valor "Total") por `${brand.accent}`; el texto del header `#ffffff` por `${brand.accentText}`; los textos muted del header/footer oscuros (el eyebrow `rgba(255,255,255,.4)` y el footer `color:#555`) por `${brand.accentTextMuted}`. Inyectar `${brand.fontLink}` en el <head>. Llamar `renderEmailHeader(businessName||'', logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })`. NO tocar los badges de estado (badgeBg/badgeColor: #fee2e2/#991b1b/#fef3c7/#dcfce7/#166534/#92400e) — son colores semanticos sobre fondo blanco, ajenos al acento.
   - Escapado WR-02: `sendAbonoCancelledAdminNotification` YA escapa clientName/clientPhone/clientEmail (no re-tocar, romperia los tests). `sendAdminNotification` NO escapa nada: envolver con esc() `clientName`, `service`, el `clientPhone` que se MUESTRA (el `waPhone` del href es solo-digitos y ya es seguro) y `clientEmail`.

7) test/brand-email.test.ts (NUEVO): importar brandEmail y emailBrandInputs. Casos: (a) cada paleta -> hex correcto; (b) paleta null/desconocida -> red default; (c) primaryOverride hex valido gana sobre la paleta; (d) primaryOverride invalido ('red', 'javascript:alert(1)', '#zzz') se ignora -> cae a paleta; (e) accentText: brandEmail({palette:'yellow'}).accentText === '#1a1714' y brandEmail({palette:'red'}).accentText === '#ffffff'; (f) fontLink de bauhaus contiene 'Archivo' y headingFontFamily contiene 'Archivo'; elegante -> familyStack contiene 'serif'; (g) font 'auto'/null/'inexistente' -> fontLink === '' y headingFontFamily === "'Helvetica Neue',Arial,sans-serif"; (h) SEGURIDAD: para todo font desconocido, fontLink NO contiene el valor pasado (no hay interpolacion cruda). Para emailBrandInputs: (i) landing_config con overrides.primary valido -> primaryOverride seteado; (j) sin landing_config -> palette del negocio y primaryOverride null; (k) landing_config basura ({} o string) no rompe (fallback).

8) test/abono-cancel-email.test.ts: en el objeto BASE (cliente), renombrar `primaryColor: '#123456'` a `primaryOverride: '#123456'` (sendAbonoCancelledEmail es template cliente). No debilitar ningun caso de escapado (Tests 15-19). ADMIN_BASE queda igual: no setea color, asi que brandEmail cae al default red y el header admin se pinta rojo en vez de #1a1714 — ninguno de los 21 casos asierta sobre el color del header, asi que siguen verdes. Confirmar.

9) test/email-escaping.test.ts (NUEVO): cobertura WR-02 de los templates NO-abono (Nyquist: la nueva superficie de escapado necesita test automatico, no solo grep). Reusar el mismo patron que abono-cancel-email.test.ts (stub de global.fetch que responde ok, capturar el body del POST, parsear html/text/subject; pasar resendApiKey+resendFrom propios para no depender de process.env). Con un EVIL_NAME tipo `Ana <a href="https://evil.example/phish">click</a>` y un servicio con comillas, asertar sobre AL MENOS `sendConfirmationEmail` (cliente) y `sendAdminNotification` (el que lee el DUEÑO): el html NO contiene `href="https://evil.example` ni `<a href="https://evil.example`, y SI contiene la forma escapada `&lt;a href=&quot;`; el `text` plano SI contiene el markup crudo (no se escapa). Un caso extra para `sendAdminNotification`: un clientEmail con `<script>` sale como `&lt;script&gt;` en el html.

NO poner bloques de codigo cercado en comentarios que repitan literalmente palabras que los tests negativo-grepean (Test 8: importe/total/precio/seña). El <link> de Google Fonts no contiene ninguna de esas palabras ni '$'.
  </action>
  <verify>
    <automated>./node_modules/.bin/vitest run test/brand-email.test.ts test/email-escaping.test.ts test/abono-cancel-email.test.ts</automated>
  </verify>
  <done>brandEmail + emailBrandInputs + renderEmailHeader(3 args) existen y compilan; los 10 templates (incl. los 2 admin, ahora con brand.accent en header/footer/borde/Total) consumen brandEmail; todo valor no confiable escapado con esc() en el HTML de todos los templates; test/brand-email.test.ts y test/email-escaping.test.ts pasan; los 21 casos de abono-cancel siguen verdes. Los callers aun pasan primaryColor (puente) -> el arbol sigue compilando.</done>
</task>

<task type="auto">
  <name>Task 2: threading de los call sites de turnos/cancelaciones (7 archivos)</name>
  <files>app/api/booking/create/route.ts, app/api/appointments/create/route.ts, app/api/notify/booking/route.ts, app/api/notify/cancel/route.ts, app/api/cancel/[token]/route.ts, app/api/google/sync/route.ts, app/api/cron/cancel-expired/route.ts</files>
  <action>
Importar `emailBrandInputs` desde `@/lib/email` en cada archivo. Patron UNIFORME por caller (edicion pequeña, 3 puntos):

A) SELECT de businesses: agregar `palette, theme, font, landing_config` a la lista de columnas. Se puede quitar `primary_color` de la lista (ya no se usa). En los SELECT anidados `businesses(...)` (notify/booking :18, notify/cancel :45, cancel/[token] :22) agregar las 4 columnas dentro del parentesis del embed. Actualizar los casts de tipo del objeto business donde existan (cancel/[token] :63: agregar palette?/theme?/font?/landing_config? al type inline; quitar primary_color? si estaba).

B) Antes de las llamadas a los send*, calcular una sola vez: `const brand = emailBrandInputs(business)` (usar el nombre de variable del negocio que ya exista en cada archivo; en los anidados es la variable ya casteada, p.ej. `business`).

C) En CADA llamada send*: reemplazar `primaryColor: business.primary_color (as ...)` por `palette: brand.palette, font: brand.font, primaryOverride: brand.primaryOverride`. Donde el mismo caller manda tambien un mail admin (notify/booking :75 sendAdminNotification, cancel/[token] :101 sendAdminNotification) agregar los mismos tres params a esa llamada (el template admin ahora los acepta y los usa para el color de marca + la fuente, uniforme con los cliente).

Detalles por archivo:
- booking/create/route.ts: SELECT :57; brand desde `business`; aplicar a sendExpiredHoldEmail (:182) y sendPendingPaymentEmail (:239). (sendPendingPaymentEmail no tiene businessSlug ni whatsapp — solo cambia el color/fuente.)
- appointments/create/route.ts: SELECT :37; sendManualBookingConfirmation (:145).
- notify/booking/route.ts: SELECT anidado :18; brand desde la var business del embed; sendConfirmationEmail (:42) + sendAdminNotification (:75).
- notify/cancel/route.ts: SELECT anidado :45; sendBusinessCancelEmail (:108).
- cancel/[token]/route.ts: SELECT anidado :22; extender el cast :63; sendClientCancelEmail (:79) + sendAdminNotification (:101).
- google/sync/route.ts: SELECT :20; sendBusinessCancelEmail (:67).
- cron/cancel-expired/route.ts: SELECT :261; sendExpiredHoldEmail (:304).

NO tocar logica de negocio, RLS, ni el filtrado por business_id. Es threading de branding puro. Respetar el aislamiento multi-tenant: no ampliar los SELECT a columnas sensibles (palette/theme/font/landing_config son no-secretas, ya expuestas en public_businesses).
  </action>
  <verify>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
  </verify>
  <done>Los 7 callers seleccionan palette/theme/font/landing_config, calculan emailBrandInputs y pasan palette/font/primaryOverride a sus send* (incluidos los admin de notify/booking y cancel/[token]). tsc verde.</done>
</task>

<task type="auto">
  <name>Task 3: threading de abonos + pago/webhook, quitar el puente legacy y verificacion dura</name>
  <files>app/api/abonos/create/route.ts, app/api/abonos/cancel/route.ts, app/api/abonos/cancel/[token]/route.ts, app/api/payment/webhook/[slug]/route.ts, lib/email.ts</files>
  <action>
1) Threading (mismo patron uniforme de Task 2: importar emailBrandInputs, agregar palette/theme/font/landing_config al SELECT, `const brand = emailBrandInputs(business)`, pasar palette/font/primaryOverride):
   - abonos/create/route.ts: SELECT :87; sendAbonoConfirmation (:271).
   - abonos/cancel/route.ts: SELECT :61; sendAbonoCancelledEmail (:128).
   - abonos/cancel/[token]/route.ts: SELECT anidado :59; extender el cast :101; borrar la linea `const primaryColor = business?.primary_color ?? null` (:139) y en su lugar `const brand = emailBrandInputs(business)`; aplicar a sendAbonoCancelledEmail (:157) y sendAbonoCancelledAdminNotification (:182, admin -> mismos tres params).
   - payment/webhook/[slug]/route.ts: SELECT :65; sendConfirmationEmail (:170) + sendAdminNotification (:200, admin).

2) Quitar el puente legacy de lib/email.ts: eliminar el parametro opcional legacy de las 10 firmas y su uso en el fallback de brandEmail, dejando `brandEmail({ palette, font, primaryOverride })`. Verificar por construccion que ya ningun caller lo pasa (todos migrados en Task 2 + este). <!-- planner-discipline-allow: primaryColor -->

3) Greps de seguridad (deben dar 0 coincidencias salvo donde se indica):
   - WR-02 — ningun valor no confiable interpolado CRUDO adyacente a markup HTML: `grep -nE '(<strong>|>)\$\{(clientName|businessName|service|clientPhone|clientEmail)\}' lib/email.ts` -> sin coincidencias (en el HTML todos van como `${esc(...)}`; las formas crudas del `text` plano no quedan pegadas a `>` ni `<strong>`, asi que no matchean). Reforzado por test/email-escaping.test.ts (asercion en memoria sobre el html renderizado, mas robusta que el grep).
   - Ningun color/fuente crudo de la DB dentro de un style=: `grep -nE 'style="[^"]*(background|border-left|color):[^"]*\$\{(palette|font|primary_color)' lib/email.ts` -> sin coincidencias. <!-- planner-discipline-allow: primary_color -->
   - La URL de Google Fonts solo interpola el literal de allowlist `googleFamily`, NUNCA un valor crudo de DB. El grep anterior (`fonts\.googleapis[^"]*\$\{`) era auto-invalidante: matcheaba la interpolacion SEGURA de `${googleFamily}` que la Task 1 especifica. Anclar al parametro crudo que no debe aparecer en la URL: `grep -nE 'fonts\.googleapis[^"]*\$\{\s*(font|row\.font)\b' lib/email.ts` -> sin coincidencias. Verificacion positiva complementaria: `grep -nE 'fonts\.googleapis[^"]*\$\{googleFamily\}' lib/email.ts` -> exactamente 1 coincidencia (la unica interpolacion permitida en esa URL).
   - Todos los templates consumen el helper: `grep -c 'brandEmail(' lib/email.ts` -> >= 10.
   - El campo huerfano ya no alimenta ningun mail: confirmar por revision que no queda `primaryColor:` en ninguna llamada send* de los 11 callers (grep manual por archivo). <!-- planner-discipline-allow: primary_color -->
  </action>
  <verify>
    <automated>./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run && ./node_modules/.bin/eslint . && npm run build</automated>
  </verify>
  <done>Los 11 call sites migrados; puente legacy eliminado de lib/email.ts; los 3 greps de seguridad limpios; tsc + vitest (incl. brand-email y los 21 de abono) + eslint + build verdes.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Todos los mails de lib/email.ts toman color de acento y fuente de titulos de la misma fuente de verdad que la pagina publica (paleta u override del landing), con texto de contraste legible via onAccentText y fuente por <link> de Google Fonts con fallback. Fondo del mail: claro (sin cambios).</what-built>
  <how-to-verify>
    Prueba VISUAL real (no la puede cerrar el executor; es post-deploy y depende del cliente de correo):
    1. Deployar (o correr en un entorno con RESEND configurado) y disparar al menos: una confirmacion de turno (sendConfirmationEmail), una cancelacion al cliente, un pendiente de seña, un alta de abono, y un aviso admin (sendAdminNotification) — el aviso al dueño ahora debe salir con el COLOR DE MARCA, ya no con el header oscuro #1a1714.
    2. Probar con al menos 2 negocios de paletas distintas, incluido uno con paleta YELLOW (#c8901a): confirmar que el texto del header y del boton NO queda blanco ilegible sobre amarillo (debe verse near-black).
    3. Probar un negocio con override de color del landing: el acento del mail debe COINCIDIR con el de su pagina /[slug].
    4. Probar un negocio con fuente de titulos no-default (ej. tech/Orbitron o elegante/Cormorant): abrir el mail en Apple Mail (respeta <link>) y en Gmail (suele ignorar <link> -> debe caer limpio al fallback sans/serif, sin romperse).
    5. Confirmar que el CUERPO del mail y el fondo siguen claros e iguales que antes; solo cambian header/footer/boton/borde-izquierdo y el texto de contraste.
    Chequear contraste WCAG AA (>=4.5:1 texto normal, >=3:1 texto grande) del texto sobre el acento; onAccentText elige el mejor de blanco/near-black pero para acentos de luminancia intermedia puede no alcanzar 4.5:1 (limitacion honesta documentada en lib/contrast.ts) — anotar cualquier combo que se vea flojo.
  </how-to-verify>
  <resume-signal>Escribi "aprobado" o describi los combos negocio/cliente-de-correo donde el color/fuente/contraste no cerro.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DB/landing_config -> HTML del mail | palette/theme/font/landing_config (y el override primary) de businesses cruzan al string HTML que se manda por Resend |
| HTML del mail -> cliente de correo | el <link> a Google Fonts y los estilos inline se renderizan en Apple Mail/Gmail |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wxt-01 | Tampering/Injection | color de acento en atributos style= (header bg, borde-izq, boton) | mitigate | accent solo desde EMAIL_PALETTE_HEX (literales fijos) o un override revalidado con isSafeColor en brandEmail; nunca un valor crudo de DB en style= |
| T-wxt-02 | Tampering/Injection | font -> URL/href de Google Fonts | mitigate | font mapeado por allowlist fija (EMAIL_HEADING_FONT) a familia+URL fijas; id desconocido/'auto' -> sin <link>; jamas se interpola el valor crudo en la URL |
| T-wxt-03 | Information disclosure / content injection | businessSlug interpolado en HTML (linaje WR-02/W-01) | mitigate | esc(businessSlug) en toda interpolacion (texto y href) |
| T-wxt-05 | Injection / Spoofing (content) | clientName, service, businessName, telefono/email interpolados en el HTML de TODOS los templates (origen: form publico ANONIMO de /api/booking/create) | mitigate | esc() del modulo en toda interpolacion HTML de valores no confiables; el mail que lee el DUEÑO (sendAdminNotification) deja de renderizar links/markup plantados por un atacante (phishing dirigido con el branding del negocio); el `text` plano no ejecuta markup y se deja crudo. Cubierto por test/email-escaping.test.ts + grep de Task 3 |
| T-wxt-04 | Tampering | campo huerfano primary_color como fuente de color | mitigate | se deja de leer como fuente; el color sale de palette/override (paridad con la pagina), cerrando la otra mitad del linaje |
| T-wxt-SC | Tampering (supply chain) | dependencias | accept | sin installs npm: Google Fonts entra por <link> en el HTML; no hay paquete nuevo que auditar |
</threat_model>

<verification>
- `./node_modules/.bin/tsc --noEmit` verde (NUNCA `npx tsc` — resuelve un paquete equivocado y da falso verde).
- `./node_modules/.bin/vitest run` verde: test/brand-email.test.ts (nuevo) + test/abono-cancel-email.test.ts (21 casos, incl. escapado WR-02).
- `./node_modules/.bin/eslint .` sin errores.
- `npm run build` verde.
- Greps de seguridad de Task 3 limpios (0 interpolaciones crudas de color/fuente; helper consumido por >=10 templates).
</verification>

<success_criteria>
- Los 10 templates (cliente Y dueño) pintan acento por paleta/override, texto por onAccentText y titulos con la fuente del negocio; el header oscuro fijo #1a1714 de los admin queda eliminado.
- WR-02 cerrado en TODOS los templates: 0 interpolaciones crudas de clientName/service/businessName/telefono/email/businessSlug en el HTML (grep + test/email-escaping.test.ts en verde); text plano crudo por convencion.
- Los 11 call sites pasan palette/font/primaryOverride via emailBrandInputs; ninguno alimenta color desde primary_color.
- Puente legacy eliminado; tsc/vitest/eslint/build verdes; greps de seguridad limpios.
- Checkpoint humano aprobado (color coincide con la pagina, yellow legible, fallback de fuente limpio en Gmail).
</success_criteria>

<output>
Al terminar, crear `.planning/quick/260722-wxt-unificar-el-branding-de-todos-los-templa/260722-wxt-SUMMARY.md` con: helper creado, unificacion admin (header/footer/borde con brand.accent, sin #1a1714 fijo), cierre WR-02 (esc() en todos los templates), lista de call sites migrados, resultado de los greps de seguridad + tests de escapado, y el estado del checkpoint humano.
</output>
