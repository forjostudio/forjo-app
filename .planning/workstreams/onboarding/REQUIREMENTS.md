# Requirements — v0.19 Cuenta y acceso

**Milestone:** v0.19 — Cuenta y acceso
**Workstream:** onboarding
**Defined:** 2026-07-16
**Numeración:** continúa el workstream desde **Phase 4** (v0.14 cerró en Phase 3)

> **Goal:** Que una persona pueda crear su cuenta, entrar y recuperarla sin fricción — y que los
> mails de cuenta parezcan de Forjo, no de Supabase.

## Por qué este milestone vive en el workstream `onboarding`

v0.14 cubrió el wizard de creación del negocio. Esto es el **paso anterior del mismo recorrido**:
cómo una persona pasa de no tener cuenta a estar adentro. Mismo embudo, misma historia.

## Contexto (verificado 2026-07-16 contra código, no asumido)

- **No existe recuperación de contraseña.** `app/(auth)/` tiene solo `login` y `register`; cero
  ocurrencias de `resetPasswordForEmail` en el repo.
- **No existe `/auth/callback`** (la ruta que intercambia código por sesión). Los callbacks que hay
  — `app/api/google/callback`, `app/api/mercadopago/callback` — son de **integraciones** (Calendar,
  MP), otro flujo. **Reset y Google necesitan esa misma ruta: por eso van juntos y no de a uno.**
- **Los mails salen del default de Supabase:** inglés, sin marca, remitente
  `noreply@mail.app.supabase.io`, pie "powered by Supabase".
- **A favor:** Resend ya está cableado para los transaccionales de turnos (`lib/email.ts`) →
  candidato natural para el SMTP custom. Google Cloud ya tiene credenciales OAuth
  (`client_secret_*.json`, las usa Calendar) → falta un redirect URI para el callback de Supabase,
  no la cuenta entera.
- **A favor:** el onboarding ya maneja "usuario autenticado sin negocio" (`onboarding/page.tsx`
  resuelve `getUser()` y crea el negocio) → un usuario que entra por Google cae en ese carril sin
  inventar flujo nuevo (AUTH-04 es verificar, no construir).
- **⚠ A VERIFICAR en el research de fase (NO asumir):** si `confirm email` está ON y bloquea hoy.
  `register/page.tsx:47` hace `signUp()` y empuja directo a `/onboarding` con un toast "Revisá tu
  email para confirmarla". Si la confirmación está ON, `signUp` no devuelve sesión → el proxy
  debería rebotar a `/login`. **Define si el mail de confirmación es un gate real o decorativo** —
  y por lo tanto cuánto importa MAIL-01. De ahí sale AUTH-06.

## v1 Requirements

### Recuperar contraseña (AUTH)

- [ ] **AUTH-01**: Un dueño que olvidó su contraseña puede pedir un link de recuperación desde el
  login, poniendo su email.

- [ ] **AUTH-02**: Con ese link, el dueño setea una contraseña nueva y entra a su panel.

### Iniciar sesión con Google (AUTH)

- [ ] **AUTH-03**: Una persona puede crear su cuenta e iniciar sesión con Google, sin contraseña.

- [ ] **AUTH-04**: Un usuario que entra por Google por primera vez cae en el onboarding y crea su
  negocio, igual que uno de email/contraseña.

- [ ] **AUTH-05**: Si el mismo email ya tiene cuenta con contraseña y después entra con Google (o al
  revés), el resultado es **una sola cuenta** con comportamiento predecible — nunca una cuenta
  duplicada ni un error opaco.

### Mails de cuenta (MAIL)

- [ ] **MAIL-01**: El mail de confirmación de cuenta llega en español, con la marca Forjo y desde un
  remitente de Forjo — sin "powered by Supabase".

- [ ] **MAIL-02**: El mail de recuperación de contraseña llega con la misma marca y remitente.

### Coherencia del alta (AUTH)

- [ ] **AUTH-06**: El registro es honesto sobre la confirmación: lo que el usuario ve (mensaje y a
  dónde lo mandan) coincide con lo que Auth realmente hace — si confirmar es obligatorio, no se lo
  manda a una pantalla que lo va a rebotar.

## Decisiones abiertas (para discuss-phase)

| Decisión | Por qué importa |
|----------|-----------------|
| **Account linking** (AUTH-05) | Supabase vincula identidades o tira error según la config y según si el mail está verificado. Es LA trampa del milestone: define si un cliente que se registró con contraseña puede después entrar con Google sin quedar duplicado. Es decisión, no código. |
| **SMTP: Resend vs solo plantillas** | Resend unifica el remitente con los mails de turnos y saca el "powered by Supabase", pero requiere configurar dominio + DNS. Editar solo las plantillas del default es más rápido, pero el remitente sigue siendo `noreply@mail.app.supabase.io`. |
| **Redirect URLs en previews** | Las previews de Vercel tienen dominio dinámico. Decidir si se allowlistean (wildcard) o si auth simplemente no anda en preview. Mismo problema que ya pegó con reCAPTCHA en el UAT de Phase 14. |

## Future Requirements (diferidos)

- **AUTH-OAUTH-02**: Otros proveedores (Apple, Facebook) — Google primero; el resto es repetir el
  patrón si aparece demanda real.
- **AUTH-MAGIC-01**: Magic link / passwordless — Google cubre el grueso del "no quiero contraseña".
- **AUTH-MFA-01**: 2FA / MFA — sin demanda ni requisito regulatorio hoy.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Paleta de colores propia (Apariencia + CMS) | Dominio distinto (personalización del panel). Además arrastra un bug de base ya detectado: el editor CMS no refleja un `overrides.primary` custom (todo del 14/07) — hay que cerrarlo ANTES de montarle UI encima. Milestone aparte. |
| Categorización de servicios | Dominio distinto (booking público). La decisión real es de modelo (columna `category` vs tabla `service_categories`) → necesita su propio discuss. Milestone aparte. |
| Rediseño del upsell "Web a medida" | Follow-up de v0.18, capturado en `.planning/todos/pending/2026-07-16-redisenar-upsell-web-a-medida.md`. |
| Rediseño visual de login/register | Recién se tocaron (quick `260716-ide`: lockup de marca dark/light + copy del panel). No se re-litiga acá. |
| Cambios al onboarding wizard | v0.14 lo cerró. Este milestone llega hasta la puerta del wizard, no lo re-toca (salvo verificar el hand-off de AUTH-04). |

## Traceability

> Mapeo creado por gsd-roadmapper al crear ROADMAP.md. Cada requirement mapea a exactamente una fase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| _(lo completa el roadmap)_ | | |
