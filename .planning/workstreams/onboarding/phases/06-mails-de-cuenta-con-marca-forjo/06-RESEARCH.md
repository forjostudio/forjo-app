# Phase 6: Mails de cuenta con marca Forjo - Research

**Researched:** 2026-07-17
**Domain:** Supabase Auth (GoTrue) custom SMTP vía Resend + HTML de email brandeado + contrato del token en el link
**Confidence:** HIGH (los datos de SMTP y el contrato del link están verificados contra docs oficiales y el código del repo; lo único atestiguado-no-verificable es el estado del Dashboard de prod)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** SMTP custom vía Resend — apuntar el SMTP de Supabase Auth a Resend para que GoTrue mande los 2 mails desde un remitente de Forjo, sin "powered by Supabase". Editar solo las plantillas dejaría el remitente `noreply@mail.app.supabase.io` → requisito a medias.
- **D-02:** El dominio `forjo.studio` YA está verificado en Resend (SPF/DKIM hechos, lo usa `lib/email.ts` para turnos). NO hay laburo de DNS nuevo. El checkpoint solo carga credenciales SMTP en el Dashboard de Supabase; **verificar esto en el research/checkpoint antes de asumir.**
- **D-03:** Remitente = `no-reply@forjo.studio` (dedicado para mails de cuenta), NO `notificaciones@forjo.studio`. Un solo remitente, se configura una vez en el SMTP de Supabase (aplica a los 2 mails).
- **D-04:** Brandear SOLO los 2 templates existentes (`supabase/templates/confirmation.html` y `recovery.html`): español, marca Forjo, sin pie de Supabase. El `href` NO cambia de mecánica: sigue siendo `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=...`. Brandear el envoltorio, no el link.
- **D-05:** Los dos mails deben verse de la misma familia (mismo header, mismo remitente, misma marca).

### Claude's Discretion
- El HTML del branding (layout, logo inline vs hospedado, colores) sigue la identidad de marca del proyecto; el research/planner define el detalle. Los clientes de mail son limitados (tablas, CSS inline, sin JS).

### Deferred Ideas (OUT OF SCOPE)
- Mails transaccionales de turnos (ya andan por `lib/email.ts`), cualquier mail nuevo, rediseño de los flujos de auth (cerrados en Phase 4/5).
- Otros mails de auth (magic link, cambio de email) — no están en uso hoy; se brandean si se activan.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAIL-01 | El mail de confirmación de cuenta llega en español, con marca Forjo y desde un remitente de Forjo — sin "powered by Supabase" | Datos EXACTOS del SMTP de Resend (sección Standard Stack) + patrón HTML email-client-safe (Pattern 1) + subject en español (Pitfall 3). El remitente Forjo lo cierra el SMTP custom (D-01) |
| MAIL-02 | El mail de recuperación llega con la misma marca y remitente | Mismo template family (D-05); el remitente global único de Supabase custom SMTP garantiza mismo `From` para los 2 mails. `recovery.html` = mismo header/footer, `type=recovery` |
</phase_requirements>

## Summary

Esta fase NO escribe código de app: cambia **config externa** (Supabase Dashboard → Auth → SMTP + Email Templates) y **reescribe 2 templates HTML** que ya viven en el repo (`supabase/templates/confirmation.html` y `recovery.html`). Los 2 mails los manda **GoTrue por SMTP**, no `lib/email.ts`. Hoy salen del default `noreply@mail.app.supabase.io` en inglés con pie "powered by Supabase"; el objetivo es que salgan en español, con marca Forjo, desde `no-reply@forjo.studio` vía Resend.

Los datos de SMTP están confirmados contra la doc oficial de Resend y Supabase: `host=smtp.resend.com`, `port=465`, `user=resend`, `pass=<Resend API key>`, y un **único remitente global** (`no-reply@forjo.studio` + display name "Forjo") que aplica a los dos mails. El dominio `forjo.studio` ya está verificado en Resend (lo atestigua `lib/email.ts`, que manda los transaccionales de turnos desde `notificaciones@forjo.studio`); Resend verifica **el dominio, no la dirección**, así que `no-reply@forjo.studio` sale sin DNS nuevo — pero **esto se confirma en el checkpoint mirando el Dashboard de Resend**, no desde el repo.

El riesgo de fondo es de seguridad, no de diseño: el `token_hash` viaja dentro del HTML del mail. La reescritura debe conservar EXACTO el href que Phase 4 dejó andando (`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup|recovery`) y NO introducir `{{ .ConfirmationURL }}` (rompe el callback) ni `{{ .RedirectTo }}` (open redirect). Continúa T-04-02 / T-04-06 / T-04-20.

**Primary recommendation:** Reescribir los 2 templates como un mail HTML table-based con CSS inline (mismo patrón que `lib/email.ts`), header de marca Forjo con logo hospedado en URL pública, un solo botón CTA cuyo `href` es literalmente el de hoy, subject en español. Config local en `config.toml` para UAT con Mailpit; SMTP + templates de prod en el Dashboard (checkpoint humano). UAT dividido: local (HTML + link end-to-end) + prod (envío real a Gmail, inbox-no-spam).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Envío del mail de auth | GoTrue (Supabase Auth server) | Resend (SMTP relay) | GoTrue dispara el mail al `signUp`/`resetPasswordForEmail`; lo entrega por SMTP a Resend. La app NO participa del envío |
| Remitente / credenciales SMTP | Supabase Dashboard (prod) / `config.toml` (local) | — | Secreto server-side; jamás en `NEXT_PUBLIC_*` ni en el repo |
| HTML + subject del mail | `supabase/templates/*.html` (repo, versionado) | Dashboard (prod, pegado a mano) | El repo es la fuente para local; el Dashboard es la fuente para prod (se sincronizan a mano) |
| El link (token_hash → sesión) | `app/auth/callback/route.ts` (ya existe, Phase 4) | — | La fase NO lo toca; solo garantiza que el href del template siga alimentándolo |
| Deliverability (SPF/DKIM/DMARC) | DNS en Cloudflare (ya hecho para `forjo.studio`) | Resend | Dominio ya verificado; la fase re-verifica en el envío real, no configura DNS nuevo |

## Standard Stack

No se instala ninguna librería. La fase usa infra que ya existe.

### Core
| Componente | Versión/Endpoint | Propósito | Por qué es el estándar |
|-----------|------------------|-----------|------------------------|
| Resend SMTP | `smtp.resend.com:465` | Relay SMTP para que GoTrue mande los 2 mails de auth | Ya es el proveedor de mail del proyecto (dominio verificado); unifica remitente con los transaccionales `[VERIFIED: resend.com/docs/send-with-supabase-smtp + supabase.com/docs/guides/auth/auth-smtp]` |
| Supabase Auth custom SMTP | Dashboard → Auth → Emails → SMTP Settings | Reemplaza el SMTP default de Supabase por el de Forjo | Único camino que saca `noreply@mail.app.supabase.io` y el "powered by Supabase" `[VERIFIED: supabase docs]` |
| `supabase/templates/*.html` | repo | HTML brandeado de los 2 mails, versionado | Ya es el mecanismo de Phase 4 (`[auth.email.template.*].content_path`) `[VERIFIED: config.toml líneas 262-275]` |

### Supporting
| Componente | Endpoint | Propósito | Cuándo se usa |
|-----------|----------|-----------|---------------|
| Mailpit (local) | `http://localhost:54324` | Captura los mails del Supabase local para el UAT de template + link | UAT local (no manda de verdad) `[VERIFIED: config.toml [inbucket] línea 105-108]` |
| Resend API key | Dashboard de Resend | Es el `pass` del SMTP | Se genera una vez, se pega en el Dashboard de Supabase `[CITED: resend.com/docs]` |

### Datos EXACTOS del SMTP de Resend para el Dashboard de Supabase

`[VERIFIED: resend.com/docs/send-with-supabase-smtp — cross-check supabase.com/docs/guides/auth/auth-smtp]`

| Campo (Supabase) | Valor |
|------------------|-------|
| Host | `smtp.resend.com` |
| Port | `465` (Resend también acepta `587`, `2465`, `2587` como fallback; la doc de Resend para Supabase documenta **465**) |
| Username | `resend` (literal, ese string exacto) |
| Password | Un **Resend API key** (`re_...`) — NO una contraseña |
| Sender email | `no-reply@forjo.studio` (D-03) |
| Sender name | `Forjo` (display name; aplica a los 2 mails) |

> **Un solo remitente global:** Supabase custom SMTP tiene **una** "default From address" que aplica a TODOS los mails de auth (confirmación y recuperación por igual). No hay remitente por-template. Esto cierra D-05 (misma familia) por diseño. `[VERIFIED: supabase docs]`

### Alternatives Considered
| En vez de | Se podría | Tradeoff |
|-----------|-----------|----------|
| SMTP custom (Resend) | Solo editar los templates del default | Descartado en D-01: el remitente seguiría siendo `noreply@mail.app.supabase.io` → MAIL-01/02 a medias |
| `port=465` | `port=587` | Ambos válidos en Resend. 465 = TLS implícito (lo que documenta Resend para Supabase); 587 = STARTTLS. Si 465 diera timeout en el Dashboard, probar 587 como fallback |
| Logo hospedado (URL) | Logo base64/CID inline | Descartado: Gmail bloquea `data:` URIs en `<img>` y el CID no es confiable cross-cliente. **Hospedar sí o sí** (ver Pitfall 4) |

**Installation:** N/A — no se instalan paquetes. La "instalación" es cargar credenciales en 2 pantallas del Dashboard + reescribir 2 archivos HTML.

## Package Legitimacy Audit

**N/A — esta fase no instala ningún paquete externo.** Es config de Dashboard + reescritura de 2 templates HTML versionados. No hay superficie de supply-chain nueva.

## Architecture Patterns

### System Architecture Diagram

```text
  Usuario                         Supabase Auth (GoTrue)              Resend                 Cliente de mail
  ──────                          ──────────────────────             ──────                 ───────────────
  signUp() ─────────────────────▶ genera token_hash
  o resetPasswordForEmail()       renderiza template ───▶ SMTP ────▶ smtp.resend.com ─────▶ Gmail / Apple Mail
                                  (confirmation/recovery)  465        from: no-reply@         (HTML brandeado,
                                                            user=resend  forjo.studio          español, marca Forjo)
                                                            pass=API key
                                                                                                    │
                                                                                     usuario clickea el botón
                                                                                                    │
                                                                                                    ▼
                                            {{ .SiteURL }}/auth/callback?token_hash=..&type=signup|recovery
                                                                                                    │
                                                                                                    ▼
                                            app/auth/callback/route.ts (Phase 4, NO se toca)
                                            verifyOtp(token_hash) ─▶ sesión ─▶ /onboarding | /reset-password
```

El template solo controla el **envoltorio visual** y el **subject**. El mecanismo (qué variable arma el href, a dónde va, cómo se canjea el token) es de Phase 4 y NO cambia.

### Variables de Go template disponibles (y cuáles usar)

GoTrue renderiza los templates con Go `text/template`. Variables disponibles en estos 2 mails `[CITED: supabase.com/docs/guides/auth/auth-email-templates]`:

| Variable | Qué es | ¿Usar en Phase 6? |
|----------|--------|-------------------|
| `{{ .SiteURL }}` | Site URL de la CONFIG del proyecto (no del navegador) | **SÍ** — base del href. Es la pieza segura (T-04-01) |
| `{{ .TokenHash }}` | Hash del OTP, single-use, 1h | **SÍ** — el token del link |
| `{{ .ConfirmationURL }}` | URL default que pasa por `/auth/v1/verify` y vuelve con `?code=` | **NO** — rompe el callback (Phase 4 lo evita a propósito) |
| `{{ .RedirectTo }}` | Destino de retorno reflejado desde el request | **NO** — open redirect (T-04-20) |
| `{{ .Email }}` | Email del usuario | Opcional (personalización "Hola, {{ .Email }}"). Bajo valor, no crítico |
| `{{ .Token }}` | OTP de 6 dígitos | NO (no usamos OTP manual) |

**Regla dura:** los templates brandeados contienen SOLO `{{ .SiteURL }}` y `{{ .TokenHash }}` (y opcionalmente `{{ .Email }}`). Nada más.

### Pattern 1: Mail HTML email-client-safe (table-based + CSS inline)

**What:** Layout con `<table>` anidadas, todo el estilo `style="..."` inline, sin `<style>`, sin clases externas, sin JS.
**When to use:** Los 2 templates. Los clientes de mail (Gmail, Apple Mail, Outlook) NO son navegadores.
**Example:** el repo ya tiene el patrón probado en producción — reusarlo tal cual (mismos colores de marca, misma estructura header/body/footer):

```html
<!-- Source: lib/email.ts (patrón en prod, sendConfirmationEmail) — adaptar a marca Forjo estática -->
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <!-- HEADER marca Forjo -->
      <tr><td style="background:#d94a2b;padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        <img src="https://forjo.studio/logo-email.png" alt="Forjo" height="44" style="max-height:44px;display:block;margin:0 auto;"/>
      </td></tr>
      <!-- BODY -->
      <tr><td style="background:#ffffff;padding:40px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">Confirmá tu cuenta</p>
        <p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 28px;">Tocá el botón para confirmar tu cuenta en Forjo.</p>
        <!-- CTA: el href es EXACTAMENTE el de Phase 4, no se toca -->
        <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#d94a2b;">
          <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup"
             style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Confirmar cuenta</a>
        </td></tr></table>
      </td></tr>
      <!-- FOOTER -->
      <tr><td style="background:#d94a2b;padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,.7);">Enviado por Forjo · forjo.studio</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
```

Identidad de marca a aplicar (de convenciones-forjo): acento **#d94a2b**, estilo Bauhaus dark. `recovery.html` = mismo header/footer/estilo, distinto copy y `type=recovery` (D-05).

### Anti-Patterns to Avoid
- **`{{ .ConfirmationURL }}` en el href:** rompe el callback (vuelve con `?code=`, que `route.ts` no acepta). El comentario de los templates actuales lo documenta.
- **`{{ .RedirectTo }}` o cualquier `redirect_to`/`next` en el link:** open redirect (T-04-20).
- **CSS en `<style>` o clases:** Gmail limpia gran parte de `<style>` en el `<head>` y no soporta CSS externo. Todo inline.
- **Logo en base64/`data:`:** Gmail lo bloquea. Hospedar en URL pública.
- **`<div>`/flexbox/grid para layout:** Outlook (motor Word) no lo renderiza. Tablas.
- **Traducir/brandear solo uno de los 2:** rompe D-05 (misma familia).

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Entrega del mail de auth | Un endpoint propio que mande el mail de confirmación/reset | GoTrue + SMTP custom | GoTrue ya genera el token, lo cifra, lo vence, lo canjea. Reimplementarlo = reimplementar auth |
| Verificación de dominio / SPF/DKIM | Configurar un relay SMTP propio | Resend (dominio ya verificado) | SPF/DKIM ya hechos para `forjo.studio`; cero DNS nuevo |
| Framework de email HTML (MJML, react-email) | Introducir un builder/render de emails | Copiar el patrón table+inline de `lib/email.ts` | Son 2 mails simples y estáticos; sumar dependencia es sobre-ingeniería para esta fase |

**Key insight:** el 90% de esta fase es pegar credenciales y HTML en 2 pantallas del Dashboard + versionar el HTML en el repo. Lo "difícil" es no romper el link ni filtrar el token — que es disciplina, no código.

## Runtime State Inventory

> Fase de config + templates, NO rename/refactor. Igual conviene registrar el estado runtime que esta config toca fuera del repo, porque el grueso vive en Dashboards.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Ninguno — no se toca ninguna tabla ni dato de usuario | None |
| Live service config | **(1)** Supabase Dashboard → Auth → SMTP Settings (hoy: default de Supabase → pasa a Resend). **(2)** Supabase Dashboard → Auth → Email Templates: subject + HTML de *Confirm signup* y *Reset password* (hoy: default inglés → pasa a brandeado español). NINGUNO está en git | Checkpoint humano: cargar credenciales + pegar HTML/subject |
| OS-registered state | Ninguno | None |
| Secrets/env vars | **Resend API key** nueva (o reusar la global `RESEND_API_KEY`): va al Dashboard de Supabase como `pass` del SMTP. NUNCA a `NEXT_PUBLIC_*` ni al repo | Generar en Resend, pegar en Dashboard |
| Build artifacts | Ninguno | None |

**Divergencia local↔prod (igual que Phase 4):** el `config.toml` versiona los templates + subjects para el UAT local; el Dashboard es la copia de prod. Se sincronizan **a mano**. Un cambio de HTML/subject hay que hacerlo en LOS DOS lugares.

## Common Pitfalls

### Pitfall 1: Regresar la sintaxis del link a `{{ .ConfirmationURL }}`
**What goes wrong:** El link vuelve con `?code=`, `app/auth/callback/route.ts` no lo acepta, el usuario cae en `invalid_link`. Regresa toda la Phase 4.
**Why it happens:** Los ejemplos de branding de Supabase usan `{{ .ConfirmationURL }}` por defecto; al copiar un template "lindo" de la doc se cuela.
**How to avoid:** Href EXACTO: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup` (y `type=recovery`). `type` debe matchear `ALLOWED_TYPES` de `lib/auth/callback.ts` (`signup`, `recovery`) — exacto.
**Warning signs:** `grep -i "ConfirmationURL\|RedirectTo" supabase/templates/` debe dar **0**. (Continúa la verificación T-04-20.)

### Pitfall 2: Credenciales SMTP en el lugar equivocado
**What goes wrong:** La Resend API key termina en el repo o en un `NEXT_PUBLIC_*` → fuga de credencial de envío.
**Why it happens:** Confundir "config del proyecto" con "config de la app".
**How to avoid:** La API key va SOLO al Dashboard de Supabase (o, para local, como `env(RESEND_API_KEY)` en `config.toml [auth.email.smtp].pass`, nunca el valor literal). Patrón del proyecto (service role, tokens MP viven fuera del repo).
**Warning signs:** cualquier `re_...` en un diff versionado.

### Pitfall 3: Asumir que el subject se brandea solo con el HTML
**What goes wrong:** El HTML queda en español pero el subject sigue "Confirm Your Signup" → MAIL-01 pide "en español", el subject es parte del mensaje.
**Why it happens:** El subject vive aparte del HTML — en `config.toml [auth.email.template.*].subject` (local) y en el Dashboard (prod).
**How to avoid:** Traducir subject en LOS DOS lugares. Ej: "Confirmá tu cuenta en Forjo" / "Restablecé tu contraseña".
**Warning signs:** `config.toml` con `subject = "Confirm Your Signup"` sin tocar.

### Pitfall 4: Logo que no renderiza (base64 / URL rota / bucket privado)
**What goes wrong:** El header queda sin logo (imagen rota) en Gmail.
**Why it happens:** `data:` URI bloqueado por Gmail; o la URL apunta a un bucket privado / a un path que 404ea.
**How to avoid:** Hospedar el logo en una URL **pública y estable**. Opciones, en orden de preferencia: (a) un asset estático en `forjo.studio` (landing en Vercel, dominio de marca); (b) `public/` de la app servido en `gestion.forjo.studio`; (c) el bucket `landing-assets` de Supabase Storage (público, ≤2MB — ya existe). Evitar el logo del *negocio*: estos mails son de la marca Forjo, no del tenant (GoTrue no tiene contexto de negocio).
**Warning signs:** `<img src="data:...">` o una URL que no abre en incógnito.

### Pitfall 5: `config.toml` usa `[inbucket]` (deprecado a favor de `[local_smtp]`)
**What goes wrong:** En una versión nueva del Supabase CLI, `[inbucket]` tira warning de deprecación; a futuro se renombra a `[local_smtp]`.
**Why it happens:** El servidor de test local pasó de Inbucket a **Mailpit**; el CLI v2.108+ introdujo `[local_smtp]` como key preferida. `[CITED: github.com/supabase/cli/issues/5222 + PR supabase#47634]`
**How to avoid:** No bloquea nada hoy (`[inbucket]` sigue funcionando y el UAT local usa Mailpit en `:54324`). Si el planner toca esa sección, migrar a `[local_smtp]`; si no, dejarlo — está fuera del scope de branding.
**Warning signs:** warning "inbucket is deprecated" al correr `supabase start`.

### Pitfall 6: Esperar que el SMTP custom se pruebe en local
**What goes wrong:** Se intenta validar el envío real por Resend corriendo Supabase local → el mail nunca sale (o se intenta y falla).
**Why it happens:** El Supabase local captura TODOS los mails en Mailpit; no manda por SMTP real aunque configures `[auth.email.smtp]`.
**How to avoid:** Dividir el UAT (ver abajo). Local prueba HTML + link. El envío real + remitente + deliverability es prod.

## Local Reproducibility (la pregunta del UAT)

`[VERIFIED: config.toml + supabase docs]`

| Aspecto | ¿Reproducible en local? | Cómo |
|---------|-------------------------|------|
| HTML brandeado (marca, español, layout) | **SÍ** | `config.toml [auth.email.template.confirmation/recovery].content_path` → los `.html` del repo → renderizado en Mailpit (`localhost:54324`) |
| Subject en español | **SÍ** | `config.toml [auth.email.template.*].subject` → visible en Mailpit |
| Link end-to-end (token_hash → sesión → destino) | **SÍ** | Disparar `signUp`/`resetPasswordForEmail` en local, abrir Mailpit, clickear el link, verificar que cae en `/onboarding` / `/reset-password` (mismo host `localhost`, ver nota de `config.toml` líneas 163-169) |
| Remitente `no-reply@forjo.studio` | **NO** (Dashboard/prod) | Local usa un sender ficticio; el remitente real es config del Dashboard |
| Envío real por Resend / SMTP custom | **NO** (prod) | Local captura en Mailpit, no manda |
| Inbox-no-spam / deliverability | **NO** (prod) | Requiere envío real a Gmail |

**UAT recomendado (espeja Phase 4: local-first + re-verificación prod):**
1. **Local (template + link):** `supabase start` → registrar/resetear un usuario de prueba → Mailpit: verificar marca + español + subject + que el botón lleva al destino correcto end-to-end.
2. **Prod (checkpoint humano):** cargar SMTP + templates en el Dashboard → **envío real a una casilla Gmail** → verificar remitente `no-reply@forjo.studio` + display "Forjo", que el link funciona, y que **cae en bandeja, no en spam**.

## Deliverability / inbox-no-spam (criterio 4)

`[CITED: resend.com/docs + práctica estándar de email transaccional]`

Con el dominio verificado en Resend, **SPF y DKIM ya están firmados y alineados** — es el 80% de caer en inbox. Qué verificar en el envío real (es un paso de verificación, no un proyecto de deliverability):

- **DKIM/SPF = pass:** en Gmail, "Mostrar original" → `SPF: PASS`, `DKIM: PASS`. Como `notificaciones@forjo.studio` ya entrega bien, `no-reply@forjo.studio` (mismo dominio) debería heredar el estado.
- **DMARC:** conviene que `forjo.studio` tenga un registro DMARC (Gmail/Yahoo lo piden desde 2024 para volumen). Si los mails de turnos ya caen en inbox, DMARC probablemente ya está OK → cero DNS nuevo. **Verificar en el checkpoint**, no asumir.
- **From-name claro:** display "Forjo" (no vacío, no un string raro).
- **Contenido:** evitar todo-mayúsculas en el subject, exceso de signos, un solo link legítimo (el del token). El mail es corto y transaccional → bajo riesgo de spam.
- **Nice-to-have:** GoTrue manda estos templates como HTML; no hay parte `text/plain`. No es bloqueante para inbox transaccional, pero es un factor menor de spam score. No hay forma de agregar parte text desde el template de GoTrue, así que se acepta.

**Punto de honestidad:** que `notificaciones@forjo.studio` entregue bien es **atestiguado por el código** (`lib/email.ts` manda en prod), no verificado por mí en el Dashboard de Resend. El checkpoint confirma dominio verificado + DMARC + primer envío real.

## Security Domain

`security_enforcement: true` — sección requerida. Alcance acotado: el canal por el que viaja el `token_hash`. Continúa el registro de Phase 4.

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sí | GoTrue maneja token/expiry/canje; la fase no lo toca. Confirmación es gate real (`enable_confirmations=true`) |
| V3 Session Management | no | El callback (Phase 4) crea la sesión; la fase no la toca |
| V4 Access Control | no | — |
| V5 Input Validation | sí (indirecto) | El `type` del href debe estar en `ALLOWED_TYPES`; el href no acepta input del navegador (usa `{{ .SiteURL }}` de config) |
| V6 Cryptography | no | El token lo genera/firma GoTrue; no se hand-roll-ea nada |

### Known Threat Patterns (continúa Phase 4)

| Pattern | STRIDE | Standard Mitigation | Ref |
|---------|--------|---------------------|-----|
| Reescribir el template expone o rompe el `token_hash` | Info Disclosure / Tampering | Href a mano con `{{ .SiteURL }}` + `type` fijo; solo `{{ .SiteURL }}`+`{{ .TokenHash }}` en el HTML; grep `ConfirmationURL` = 0 | T-04-20 / T-04-02 |
| `{{ .RedirectTo }}` / `redirect_to` arbitrario en el href | Tampering (open redirect) | Prohibido; `grep -i "RedirectTo\|redirect_to\|&next=" templates` = 0 | T-04-20 / T-04-01 |
| Credenciales SMTP en el repo o en `NEXT_PUBLIC_*` | Info Disclosure | API key solo en Dashboard (prod) / `env()` en `config.toml` (local) | nuevo T-06 |
| Token single-use logueado por el proveedor | Info Disclosure | Residual aceptado: token single-use + 1h ya consumido | T-04-06 (accept) |

**Recomendación de verificación automatizable (opcional, barata):** un guard test (vitest) que lea los 2 templates y afirme (a) contienen el href exacto `.../auth/callback?token_hash={{ .TokenHash }}&type=...`, (b) NO contienen `ConfirmationURL` ni `RedirectTo`. Convierte T-04-20 en regresión permanente. `nyquist_validation` está en `false`, así que no es obligatorio, pero es el único test que aporta acá.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (local) | UAT local (Mailpit + templates) | ✓ | on PATH | — |
| Mailpit | Ver los mails en local | ✓ | `localhost:54324` (`[inbucket]` en config.toml) | — |
| Cuenta Resend + API key | `pass` del SMTP | Atestiguado (dominio verificado, lo usa turnos) — key nueva se genera en el checkpoint | — | Reusar `RESEND_API_KEY` global |
| Supabase Dashboard (prod) | SMTP + templates de prod | ✓ (proyecto hosteado) | — | — |
| Dominio `forjo.studio` verificado en Resend (SPF/DKIM) | Enviar desde `no-reply@forjo.studio` | Atestiguado por `lib/email.ts`; **confirmar en checkpoint** | — | Si NO estuviera: verificar dominio en Resend (DNS en Cloudflare) — pero D-02 dice que ya está |

**Missing dependencies con fallback:** ninguna bloqueante. La única incógnita (dominio verificado + DMARC) se confirma en el checkpoint; si por algún motivo faltara, el fallback es agregar los registros DNS en Cloudflare (Resend los da), pero D-02 lo descarta.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `[inbucket]` en `config.toml` | `[local_smtp]` (Mailpit) | Supabase CLI v2.108 | Solo cosmético hoy; migrar si se toca esa sección |
| Sin política DMARC | Gmail/Yahoo exigen DMARC para volumen | 2024 | Confirmar que `forjo.studio` ya lo tiene (turnos entrega OK → probable) |

**Deprecado/desactualizado:**
- Inbucket → Mailpit como servidor de test local (mismo puerto, mismo rol; la key `[inbucket]` sigue andando).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `forjo.studio` está verificado en Resend y `no-reply@forjo.studio` sale sin DNS/verificación extra (Resend verifica dominio, no dirección) | Standard Stack / Env | Si el dominio no estuviera verificado, el envío da 403 y hay que hacer DNS en Cloudflare. **Mitigado:** lo atestigua `lib/email.ts` en prod + D-02; se confirma en el checkpoint |
| A2 | `forjo.studio` ya tiene DMARC (o al menos entrega en inbox sin él) | Deliverability | Sin DMARC, riesgo de spam mayor. **Mitigado:** los mails de turnos ya entregan; confirmar en el envío real |
| A3 | El Dashboard de prod tiene la Site URL correcta y la allowlist de `/auth/callback` (de Phase 4) intacta | Security | Si la Site URL está mal, `{{ .SiteURL }}` arma un link roto. Fuera del scope de esta fase (es config de Phase 4), pero el UAT prod lo detecta |
| A4 | Port 465 funciona desde el Dashboard de Supabase hacia Resend | Standard Stack | Si diera timeout, fallback a 587. Bajo riesgo (465 es lo documentado por Resend para Supabase) |

**Ninguno de estos es código:** son atestiguaciones del Dashboard/Resend que el checkpoint humano confirma.

## Open Questions

1. **¿La Resend API key es nueva o se reusa la global `RESEND_API_KEY`?**
   - Qué sabemos: cualquier key del workspace de Resend sirve como `pass`; el dominio es el mismo.
   - Qué falta: decisión operativa (una key dedicada "supabase-auth-smtp" es más limpia para rotar/revocar sin tumbar los mails de turnos).
   - Recomendación: generar una key dedicada. Aísla el blast radius si hay que rotarla.

2. **¿El logo se hospeda en `forjo.studio`, en `public/` de la app, o en `landing-assets`?**
   - Qué sabemos: las 3 sirven si son públicas y estables.
   - Qué falta: elegir 1 (discreción del planner/diseño).
   - Recomendación: `forjo.studio/<asset>.png` — dominio de marca, estático, sin depender de auth de la app.

## Sources

### Primary (HIGH confidence)
- `resend.com/docs/send-with-supabase-smtp` — SMTP host/port/user/pass exactos para Supabase
- `supabase.com/docs/guides/auth/auth-smtp` — campos de custom SMTP, remitente global único, Dashboard-only para hosted
- `supabase.com/docs/guides/auth/auth-email-templates` — variables de Go template disponibles
- Repo: `supabase/config.toml` (SMTP block líneas 247-255, templates 262-275, inbucket 105-108), `supabase/templates/*.html`, `lib/email.ts` (patrón HTML + dominio verificado atestiguado), `04-SECURITY.md` (T-04-02/06/20)

### Secondary (MEDIUM confidence)
- `github.com/supabase/cli/issues/5222` + PR `supabase#47634` — deprecación `[inbucket]` → `[local_smtp]` / Mailpit
- `resend.com/blog/how-to-configure-supabase-to-send-emails-from-your-domain` — flujo de verificación de dominio

### Tertiary (LOW confidence)
- Ninguna crítica. Los datos de puertos alternativos (587/2465/2587) son de conocimiento general de Resend, no del hilo Supabase específico.

## Metadata

**Confidence breakdown:**
- Datos de SMTP (host/port/user/pass/sender): HIGH — verificado contra docs oficiales de Resend y Supabase, cross-checked.
- Contrato del link / seguridad: HIGH — leído directo de los templates + `04-SECURITY.md` del repo.
- Reproducibilidad local vs prod: HIGH — `config.toml` + docs.
- Dominio verificado / deliverability: MEDIUM — atestiguado por `lib/email.ts` en prod, confirmable solo en el Dashboard (checkpoint).
- HTML email-client-safe: HIGH — patrón ya en producción en `lib/email.ts`.

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 (30 días; los datos de SMTP de Resend son estables. Único drift posible: renombre `[inbucket]`→`[local_smtp]` en un CLI nuevo).
