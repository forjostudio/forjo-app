# Roadmap: Forjo App — Onboarding (workstream `onboarding`)

## Milestones

- ✅ **v0.14 Onboarding** — Phases 1-3 (shipped 2026-07-04, archivado en `milestones/v0.14-*`)
- 🔨 **v0.19 Cuenta y acceso** — Phases 4-6 (activo)

Detalle archivado: [`milestones/v0.14-ROADMAP.md`](../../milestones/v0.14-ROADMAP.md).

## Overview

v0.14 cubrió el **wizard de creación del negocio**. v0.19 es el **paso anterior del mismo recorrido**: cómo una persona pasa de no tener cuenta a estar adentro. Mismo embudo, misma historia — por eso vive en este workstream y continúa su numeración.

Hoy hay tres agujeros en esa puerta de entrada, verificados contra código:

1. **No se puede recuperar una contraseña.** `app/(auth)/` tiene solo `login` y `register`; cero ocurrencias de `resetPasswordForEmail`. Un dueño que olvida su contraseña queda afuera de su negocio, sin salida self-serve.
2. **No existe `/auth/callback`** — la ruta que intercambia código por sesión. Los callbacks que hay (`api/google/callback`, `api/mercadopago/callback`) son de **integraciones** (Calendar, MP), otro flujo. **Reset y Google necesitan esa misma ruta**: es la pieza de infraestructura común y la razón por la que el milestone no se hace de a un feature suelto.
3. **Los mails de cuenta son de Supabase, no de Forjo**: inglés, sin marca, remitente `noreply@mail.app.supabase.io`, pie "powered by Supabase".

El faseo va **infraestructura + reset → Google → mails**:

- La **Phase 4** construye `/auth/callback` una sola vez (no se duplica en ninguna otra fase) y lo estrena con el flujo de recuperación, que es el que hoy no existe y deja gente afuera. También cierra la coherencia del alta (AUTH-06), porque el research que define si `confirm email` está ON y bloquea vive acá: es la misma config de Auth que gobierna el reset.
- La **Phase 5** monta Google encima del callback ya construido y probado, y resuelve la trampa real del milestone: el **account linking** (mismo mail con contraseña y con Google → una sola cuenta, no dos ni un error opaco). Ahí también se verifica —no se construye— el hand-off al onboarding, que ya sabe manejar "autenticado sin negocio".
- La **Phase 6** cierra la marca de los mails. Va última a propósito: brandea los dos mails que para entonces **existen y tienen a dónde llevar** (MAIL-02 no sirve de nada sin flujo de reset), y concentra el grueso de la config externa —SMTP, dominio, DNS, plantillas— en una fase pensada como config + verificación, en vez de mezclarla con código autónomo.

**Nota operativa:** buena parte del milestone es **config externa** (Dashboard de Supabase: redirect URLs, provider de Google, SMTP, plantillas; Google Cloud: redirect URI). Eso implica **checkpoints humanos bloqueantes** (`autonomous: false`), igual que la migración 051 de v0.18. Están señalados por fase.

## Phases

**Phase Numbering:**

- El workstream `onboarding` **continúa** la numeración: v0.14 cerró en Phase 3, v0.19 arranca en **Phase 4**.
- Integer phases: trabajo planeado del milestone.
- Decimal phases (4.1, …): inserciones urgentes (marcadas INSERTED).

<details>
<summary>✅ v0.14 Onboarding (Phases 1-3) — SHIPPED 2026-07-04</summary>

- [x] Phase 1: Reconciliación de horarios (3/3 plans, SCHED-01/02) — completed 2026-07-03 — migr. 046 (DROP `business_hours`, `time_blocks` = fuente única)
- [x] Phase 2: Rework UX del onboarding (1/1 plan, ONB-01/02) — completed 2026-07-04 — "Omitir por ahora" + stepper dinámico
- [x] Phase 3: Rework del selector de rubro (3/3 plans, ONB-RUBRO-01/02) — completed 2026-07-04 — migr. 047 (backfill `vertical`), 4 rubros + campo libre

Detalle completo archivado en [`milestones/v0.14-ROADMAP.md`](../../milestones/v0.14-ROADMAP.md).

</details>

### v0.19 Cuenta y acceso (activo)

Faseo: infraestructura de callback + recuperación → Google (con account linking) → mails branded. El orden es **load-bearing**: `/auth/callback` se construye una vez en Phase 4 y Google lo reusa; los mails se brandean cuando los flujos que los disparan ya existen.

- [x] **Phase 4: Recuperar la cuenta (`/auth/callback` + reset)** - La ruta de intercambio de código por sesión, estrenada con el flujo completo de recuperación de contraseña, y un alta que es honesta sobre la confirmación
- [ ] **Phase 5: Entrar con Google** - Alta e inicio de sesión con Google sobre el callback ya construido, con account linking resuelto y el hand-off al onboarding verificado
- [ ] **Phase 6: Mails de cuenta con marca Forjo** - Los mails de confirmación y recuperación llegan en español, con marca y desde un remitente de Forjo — sin "powered by Supabase"

## Phase Details

### Phase 4: Recuperar la cuenta (`/auth/callback` + reset)

**Goal**: Que un dueño que olvidó su contraseña pueda volver a entrar solo, sin escribirle a nadie — construyendo en el camino `/auth/callback`, la ruta de intercambio de código por sesión que hoy no existe y que Phase 5 va a reusar tal cual. Incluye cerrar la coherencia del alta: que lo que el usuario ve al registrarse coincida con lo que Auth realmente hace.

**Depends on**: Nothing (primera fase del milestone; el workstream viene de Phase 3 completa)

**Requirements**: AUTH-01, AUTH-02, AUTH-06

**Success Criteria** (what must be TRUE):

  1. Un dueño que olvidó su contraseña entra al login, pone su email, pide el link y recibe el mail de recuperación (con la plantilla que haya en ese momento — la marca es Phase 6).
  2. Con ese link, el dueño setea una contraseña nueva y **queda adentro de su panel** — sin pasar de nuevo por el login, sin pantalla muerta y sin error opaco si el link ya venció o ya se usó (le dice qué pasó y cómo pedir otro).
  3. La contraseña nueva funciona: cierra sesión, vuelve a entrar con ella, y la vieja ya no sirve.
  4. El registro es honesto: lo que el usuario lee después de crear la cuenta y a dónde lo mandan coincide con lo que Auth hace de verdad — si confirmar el mail es obligatorio, no se lo manda a una pantalla que lo va a rebotar al login.

**Plans**: 6 plans

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — `/auth/callback`: piezas puras (`lib/auth/callback.ts`) + route handler con `token_hash`/`verifyOtp`
- [x] 04-02-PLAN.md — Proxy: las 3 listas del Edge (`/auth` a `MAINT_EXEMPT`, 3 rutas a `KNOWN_PREFIXES`, `isAuthRoute` intacta) + test de regresión
- [x] 04-03-PLAN.md — Layout split del route group anidado `(auth)/(split)/` + link "¿Olvidaste tu contraseña?" + componente compartido "revisá tu mail"

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-04-PLAN.md — `/forgot-password` (pedir el link, anti-enumeration) + `/reset-password` (contraseña nueva, cierre de otras sesiones)
- [x] 04-05-PLAN.md — AUTH-06: el alta deja de mentir (muere el push a `/onboarding` sin sesión)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-06-PLAN.md — Config local versionada + **checkpoint humano** (Dashboard: Redirect URLs + href de los 2 templates) + UAT

**Phase-level decision (RESUELTAS — ver `04-CONTEXT.md` y `04-RESEARCH.md`)**:

- **¿`confirm email` está ON y bloquea hoy?** — **RESUELTO (H-01, verificado read-only contra prod):** ya está
  **ON** (`mailer_autoconfirm: false`; 3 usuarios, **0 sin confirmar**). D-11 ya está cumplido y **D-15 no
  dispara**. Consecuencia: **AUTH-06 no es preventivo, es un bug vivo en prod** (`register/page.tsx:57` empuja a
  `/onboarding` sin sesión → el proxy rebota al login). **MAIL-01 conserva todo su peso en Phase 6.**

- **Redirect URLs en previews** — **RESUELTO (D-20):** allowlist = **solo prod + local, sin wildcard**. Auth **no
  anda en previews**, asumido a propósito → el UAT es **en local + re-verificación en prod**.

- **Forma de `/auth/callback`** — **RESUELTO (RESEARCH, evidencia estructural en `node_modules/`):**
  `token_hash` + `verifyOtp`, **no** `code` + `exchangeCodeForSession` (`@supabase/ssr` 0.10.3 fuerza
  `flowType: "pkce"` y el canje exige un `code_verifier` del navegador que inició el flujo — inexistente en el
  webview in-app de una app de mail). Una sola ruta con dispatch por parámetro; Phase 5 **suma la rama `oauth`,
  no reescribe**.

<details>
<summary>Texto original de las decisiones abiertas (pre-research)</summary>

- **¿`confirm email` está ON y bloquea hoy?** — es **research de fase, NO asumir**. `register/page.tsx:47` hace `signUp()` y empuja directo a `/onboarding` con un toast "Revisá tu email". Si la confirmación está ON, `signUp` no devuelve sesión → el proxy debería rebotar a `/login`, y el toast+push serían engañosos. El hallazgo define AUTH-06 (¿cambio de copy + redirect honesto, o el mail de confirmación es un gate real?) y **alimenta MAIL-01 en Phase 6** (cuánto importa brandear un mail que quizás nadie necesita abrir).
- **Redirect URLs en previews** — las previews de Vercel tienen dominio dinámico. Decidir si se allowlistean (wildcard) o si auth simplemente no anda en preview. Mismo problema que ya pegó con reCAPTCHA en el UAT de Phase 14. Afecta cómo se hace el UAT de esta fase y de la 5.
- **Forma de `/auth/callback`** — route handler que intercambia el código y rutea por tipo de flujo (recovery vs oauth), contemplando desde ya que Phase 5 lo va a reusar sin reescribirlo.

</details>

**Checkpoint humano (`autonomous: false`) — plan `04-06`**: en el Dashboard de Supabase de prod:
(a) verificar **Site URL** (`https://gestion.forjo.studio`) — es load-bearing: los templates arman el link con
`{{ .SiteURL }}`; (b) **allowlist de Redirect URLs** = prod + local, **sin wildcard de previews** (D-20);
(c) **el `href` de los 2 templates** (`Reset Password` y `Confirm signup`) → `token_hash` (**H-02**: el
`{{ .ConfirmationURL }}` default pasa por `/auth/v1/verify` y vuelve con `?code=`, **nunca** entrega `token_hash`
→ sin este cambio el flujo falla siempre). **Solo el href**: idioma, marca y remitente son Phase 6 (MAIL-01).
El checkpoint **pierde** el ítem "prender `enable_confirmations`" (H-01: ya está ON) y **gana** los 2 templates —
mismo tamaño, otro contenido.

**Threat note — corré `/gsd:secure-phase`**: esta fase **es la superficie de autenticación**. Toca tokens de recuperación, intercambio de código por sesión y redirect URLs. Riesgos a cubrir: **open redirect** vía el parámetro de retorno del callback (allowlist, nunca reflejar lo que venga); fuga del token de recovery en la URL/`Referer`/logs; que el reset no exija sesión válida del token (cualquiera setearía la contraseña de cualquiera); **user enumeration** en "olvidé mi contraseña" (la respuesta debe ser idéntica exista o no el mail); y reuso/expiración del link. No es RLS/multi-tenant, pero un agujero acá entrega cuentas enteras.

### Phase 5: Entrar con Google

**Goal**: Que una persona pueda crear su cuenta e iniciar sesión con Google sin contraseña, reusando el `/auth/callback` que dejó la Phase 4, y que el caso borde que puede morder —el mismo email con contraseña **y** con Google— termine en **una sola cuenta** con comportamiento predecible. El hand-off al onboarding se **verifica**, no se construye: `onboarding/page.tsx` ya resuelve `getUser()` y crea el negocio para un usuario autenticado sin negocio.

**Depends on**: Phase 4 (reusa `/auth/callback`; no lo re-implementa)

**Requirements**: AUTH-03, AUTH-04, AUTH-05

**Success Criteria** (what must be TRUE):

  1. Una persona sin cuenta entra con "Continuar con Google", elige su cuenta, y queda autenticada en Forjo sin haber inventado ninguna contraseña.
  2. Ese usuario nuevo **cae en el onboarding y crea su negocio**, igual que uno de email/contraseña — y al terminar llega a su panel (verificación del carril que ya existe, no un flujo nuevo).
  3. Un usuario que ya entró con Google vuelve más tarde y entra directo a su panel: la segunda vez es un login, no un alta duplicada.
  4. El mismo email registrado antes con contraseña entra después con Google (y al revés) y termina en **una sola cuenta** con sus datos y su negocio intactos — nunca una cuenta duplicada ni un error opaco. Si la decisión de fase es bloquear el cruce, el usuario ve un mensaje que le dice exactamente qué hacer.

**Plans**: 3 plans

Plans:
**Wave 1**

- [ ] 05-01-PLAN.md — Callback: rama `code`→`exchangeCodeForSession` + `DESTINATIONS.oauth='/dashboard'` + error propio a `/login?error=oauth` (reusa el callback de Phase 4, `oauth` NO entra en `ALLOWED_TYPES`)
- [ ] 05-02-PLAN.md — Botón "Continuar con Google" compartido en login y register (glifo oficial, divisor "o") + aviso de `?error=oauth` en login

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 05-03-PLAN.md — **Checkpoint humano** (Google Cloud: redirect URI en credenciales existentes · Supabase: habilitar provider Google + allowlist sin wildcard) + UAT prod-first con cross-test de linking en los dos órdenes

**UI hint**: yes

**Phase-level decision (RESUELTAS — ver `05-CONTEXT.md` y `05-RESEARCH.md`)**:

- **Account linking (AUTH-05) — RESUELTO (D-01, confirmado por el research):** **unificar en una sola cuenta.** Es el comportamiento **por defecto** de Supabase (auto-link), gateado por email verificado (garantizado por confirm-email ON en prod, H-01/D-02). **Sin código de linking, sin cambio de config** (`enable_manual_linking` queda `false`). Se **verifica** en los dos órdenes en el UAT (plan `05-03`), no se construye.
- **Botón de Google — RESUELTO (D-03):** va en login **Y** en register. Sin rediseño visual — se suma al layout existente (plan `05-02`).
- **Forma de la extensión del callback — RESUELTO (D-07, corregido por el research):** el route branchea por presencia de `?code=` → `exchangeCodeForSession`; el path `token_hash`/`verifyOtp` de Phase 4 queda intacto. `oauth` **NO** entra en `ALLOWED_TYPES` (solo `DESTINATIONS` gana la fila `oauth: '/dashboard'`). Fallo/cancelación caen en `/login?error=oauth`, nunca en el error de recuperación (D-05/D-08).

**Checkpoint humano (`autonomous: false`)**: (a) **Google Cloud** — agregar el redirect URI del callback de Supabase a las credenciales OAuth que ya existen (`client_secret_*.json`, hoy usadas por Calendar); (b) **Dashboard de Supabase** — habilitar el provider de Google con client ID/secret. Sin esto el botón no puede probarse ni existir.

**Threat note — corré `/gsd:secure-phase`**: OAuth + account linking. Riesgos a cubrir: **account takeover por linking automático** sobre un email no verificado (el ataque clásico: registro con el mail de otro y me lo apropio cuando entra por Google); qué identidad manda si los dos existen; reuso del callback con `state`/PKCE; y el mismo open-redirect de Phase 4 sobre el retorno del OAuth. Comparte superficie con Phase 4 — verificar que el callback endurecido allá siga endurecido acá.

### Phase 6: Mails de cuenta con marca Forjo

**Goal**: Que los mails que Forjo manda para crear y recuperar una cuenta dejen de parecer de Supabase: español, marca Forjo, remitente de Forjo, sin "powered by Supabase". Va última porque brandea los dos mails que para entonces **existen y llevan a algún lado** (el de recuperación no existe hasta la Phase 4), y porque concentra el grueso de la config externa —SMTP, dominio, DNS, plantillas— en una fase de config + verificación en vez de mezclarla con código autónomo.

**Depends on**: Phase 4 (el mail de recuperación necesita el flujo de reset y su link; el hallazgo de AUTH-06 define cuánto pesa el de confirmación). Phase 5 no lo bloquea, pero corriendo después ya se sabe cuántos usuarios llegan pre-verificados por Google.

**Requirements**: MAIL-01, MAIL-02

**Success Criteria** (what must be TRUE):

  1. Al crear una cuenta con email/contraseña, el mail de confirmación llega **en español, con la marca Forjo y desde un remitente de Forjo** — sin "powered by Supabase" ni `noreply@mail.app.supabase.io`.
  2. Al pedir recuperar la contraseña, el mail llega con **la misma marca y el mismo remitente** — los dos se ven de la misma familia, no de dos productos distintos.
  3. Los links de los dos mails **siguen funcionando end-to-end** tras el cambio de plantilla y de remitente: confirmar deja la cuenta confirmada, recuperar deja al dueño seteando su contraseña nueva y adentro del panel (cero regresión sobre lo que cerró la Phase 4).
  4. Los mails **llegan a la bandeja de entrada**, no a spam, en Gmail — probado con un envío real desde el remitente configurado.

**Plans**: TBD

**Phase-level decision (defer to discuss-phase)**:

- **SMTP: Resend vs solo editar las plantillas del default.** Resend ya está cableado para los transaccionales de turnos (`lib/email.ts`) → unifica el remitente con los mails que el negocio ya manda y saca el "powered by Supabase", pero requiere configurar dominio + DNS (SPF/DKIM). Editar solo las plantillas es más rápido, pero el remitente sigue siendo `noreply@mail.app.supabase.io` — o sea, MAIL-01/02 quedan a medias. Decidir con el criterio del requisito ("desde un remitente de Forjo"), no con el de menor esfuerzo.
- **Qué dominio/remitente** (`no-reply@forjo.studio` vs el que ya usa `lib/email.ts`) y si se reusa el dominio ya verificado en Resend.

**Checkpoint humano (`autonomous: false`) — el grueso de la fase**: Dashboard de Supabase (Auth → SMTP custom + plantillas de Confirm signup y Reset password) + Resend (dominio) + **DNS** (SPF/DKIM en Cloudflare). Nada de esto lo puede hacer el agente: van en un plan con instrucciones exactas y verificación por envío real.

**Threat note — corré `/gsd:secure-phase` (alcance acotado)**: las plantillas de Auth llevan **tokens de sesión en sus links** (`{{ .ConfirmationURL }}` / `{{ .TokenHash }}`). Riesgos: romper o exponer el token al reescribir la plantilla; meter un `redirect_to` arbitrario en el template (open redirect por otra puerta); y credenciales SMTP en el lugar equivocado (van al Dashboard de Supabase, **nunca** a `NEXT_PUBLIC_*` ni al repo). Menor superficie que 4 y 5, pero es el canal por el que viaja el token.

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6. El orden es load-bearing: `/auth/callback` (4) antes de Google (5); los flujos de mail (4) antes de brandearlos (6).

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Reconciliación de horarios | v0.14 | 3/3 | Complete | 2026-07-03 |
| 2. Rework UX del onboarding | v0.14 | 1/1 | Complete | 2026-07-04 |
| 3. Rework del selector de rubro | v0.14 | 3/3 | Complete | 2026-07-04 |
| 4. Recuperar la cuenta (`/auth/callback` + reset) | v0.19 | 6/6 | Complete   | 2026-07-17 |
| 5. Entrar con Google | v0.19 | 0/3 | Not started | - |
| 6. Mails de cuenta con marca Forjo | v0.19 | 0/? | Not started | - |
