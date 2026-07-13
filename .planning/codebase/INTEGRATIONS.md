# Integraciones Externas

**Fecha de análisis:** 2026-06-15

## APIs y servicios externos

**Pagos / Suscripciones (MercadoPago):**
- MercadoPago — doble rol en la app:
  - **Suscripciones SaaS (preapproval):** el negocio paga su plan a Forjo. Usa SIEMPRE el token de plataforma de Forjo (`MP_FORJO_ACCESS_TOKEN[_TEST]`), nunca el del negocio. Endpoints en `app/api/subscription/*`. Wrapper en `lib/mercadopago.ts` (`getMPAccessToken`, `getMPPlanId`, `mpFetch`).
  - **Señas/depósitos de turnos:** el cliente final paga la seña a la cuenta del negocio. Usa el token MP del propio negocio (MercadoPago Connect). Lógica en `lib/payment.ts` (`createDepositPreference`, `getValidMpAccessToken`).
  - SDK/Cliente: ninguno — `fetch` directo a `https://api.mercadopago.com`.
  - Toggle de entorno: `MP_MODE` (`test`|`production`, default `production`). Cada modo tiene sus propios tokens, plan IDs y webhook secret.
  - Auth: `MP_FORJO_ACCESS_TOKEN`, `MP_FORJO_ACCESS_TOKEN_TEST` (plataforma); `MP_CLIENT_ID` + `MP_CLIENT_SECRET` (OAuth Connect); tokens por negocio en `businesses.mp_access_token` / `mp_refresh_token`.

**MercadoPago Connect (OAuth del negocio):**
- El negocio conecta su cuenta MP con un botón (sin copiar tokens). Auth base `https://auth.mercadopago.com.ar/authorization`. Intercambio de code en `https://api.mercadopago.com/oauth/token`.
- El refresh_token de MP **ROTA en cada uso**: hay que persistir el nuevo refresh_token que vuelve (`getValidMpAccessToken` en `lib/payment.ts`).
- Endpoints: `app/api/mercadopago/connect/route.ts`, `app/api/mercadopago/callback/route.ts`, `app/api/mercadopago/disconnect/route.ts`.

**Google Calendar (sincronización de turnos):**
- El dueño conecta su Google Calendar por OAuth; se guarda su `refresh_token` en `businesses.google_refresh_token`. Crea/borra eventos de turnos en su calendario primario. Sincronización inversa: detecta si el dueño borró/canceló el evento en Google.
- Scope mínimo: `https://www.googleapis.com/auth/calendar.events`.
- SDK/Cliente: ninguno — `fetch` directo a `oauth2.googleapis.com` y `www.googleapis.com/calendar/v3`.
- Auth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Sin estas vars, la sincronización queda deshabilitada (`googleConfigured()`).
- Lógica en `lib/google-calendar.ts`. Endpoints: `app/api/google/connect`, `callback`, `disconnect`, `sync`.

**IA (Anthropic):**
- Sugerencias/clasificación cortas con modelo `claude-haiku-4-5`. Degrada elegante: sin API key, los endpoints responden `{ available: false }` y la selección manual sigue funcionando. Key solo en el server.
- SDK: `@anthropic-ai/sdk`. Cliente en `lib/anthropic.ts` (`getAnthropicClient`).
- Auth: `ANTHROPIC_API_KEY`.

**Anti-spam (reCAPTCHA v3):**
- Validación fail-closed en formularios públicos de reserva. Secret resoluble por negocio (override en `businesses.recaptcha_secret_key`) o global. Threshold de score 0.5.
- SDK/Cliente: ninguno — `fetch` a `https://www.google.com/recaptcha/api/siteverify`.
- Auth: `RECAPTCHA_SECRET_KEY` (server), `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (cliente, usada en `app/[slug]/booking-client.tsx`).
- Lógica en `lib/recaptcha.ts`. Endpoint `app/api/recaptcha/verify/route.ts`.

**Email transaccional (Resend):**
- Confirmaciones, recordatorios, cancelaciones, avisos de seña pendiente/vencida. Resolución de remitente por negocio: si el negocio tiene key propia debe tener dominio verificado (`resend_from`), si no usa la key global de Forjo con `notificaciones@forjo.studio`.
- SDK/Cliente: ninguno — POST crudo a `https://api.resend.com/emails` (el paquete `resend` está instalado pero no se usa).
- Auth: `RESEND_API_KEY` (global) o key propia por negocio en `businesses.resend_api_key`.
- Lógica en `lib/email.ts`.

## Almacenamiento de datos

**Bases de datos:**
- PostgreSQL gestionado por Supabase.
  - Conexión: `NEXT_PUBLIC_SUPABASE_URL`.
  - Clientes:
    - `lib/supabase/server.ts` — server components con cookies (rol del usuario logueado, anon key).
    - `lib/supabase/client.ts` — browser (anon key).
    - `lib/supabase/admin.ts` — service role (`SUPABASE_SERVICE_ROLE_KEY`), server-only, bypassa RLS.
    - `lib/supabase/public.ts` — anon sin cookies para rutas públicas server-side.
    - `lib/supabase/middleware.ts` — refresh de sesión en `proxy.ts`.
  - Aislamiento por tenant vía RLS (Postgres policies). Ver migraciones `012_harden_public_insert.sql`, `024_public_read_locations.sql`, etc. La reserva pública ya NO inserta/lee con anon key: todo pasa por route handlers server-side de `/api/booking`.
  - Esquema y migraciones: `supabase/schema.sql` + `supabase/migrations/001`–`025`.

**Almacenamiento de archivos:**
- Supabase Storage — adjuntos y logos de negocio. Ver migración `003_storage_attachments.sql` y `015_public_professional_photo.sql`.

**Caché:**
- Ninguno (sin Redis/Memcached). Tokens MP se cachean en la propia tabla `businesses` con expiración.

## Autenticación e identidad

**Proveedor de auth:**
- Supabase Auth. Sesión refrescada en el middleware `proxy.ts` → `updateSession` (`lib/supabase/middleware.ts`) sobre rutas conocidas. Las páginas públicas de booking (`/[slug]`) NO pasan por el manejo de sesión para que las credenciales del dueño logueado no se filtren al flujo anon.

## Monitoreo y observabilidad

**Tracking de errores:**
- Ninguno (sin Sentry/Datadog). Errores vía `console.error`/`console.warn` con prefijos por integración (`[mp]`, `[google]`, `[recaptcha]`).

**Logs:**
- `console.*` (logs de Vercel). Entregabilidad de emails registrada en tabla dedicada (migración `008_email_delivery.sql`).

## CI/CD y despliegue

**Hosting:**
- Vercel. App en `gestion.forjo.studio`. Landing estática separada en `forjo.studio` (repo `forjostudio/forjo-landing`).

**Pipeline CI:**
- No detectado (sin `.github/workflows`). Deploy gestionado por la integración Vercel ↔ GitHub.

## Configuración de entorno

**Variables requeridas (nombres, sin valores):**
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- App: `NEXT_PUBLIC_APP_URL` (default `https://gestion.forjo.studio`).
- MercadoPago: `MP_MODE`, `MP_FORJO_ACCESS_TOKEN[_TEST]`, `MP_WEBHOOK_SECRET[_TEST]`, `MP_PLAN_{BASIC,STUDIO,PRO}_ID[_TEST]`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TEST_PAYER_EMAIL`.
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Email: `RESEND_API_KEY`.
- IA: `ANTHROPIC_API_KEY`.
- reCAPTCHA: `RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`.
- Jobs/admin: `CRON_SECRET`, `ADMIN_SECRET`.
- Flags: `NEXT_PUBLIC_PLANS_UNLIMITED`.

**Ubicación de secretos:**
- `.env.local` (dev, no commiteado). Variables de entorno de Vercel (producción). Tokens por negocio en la tabla `businesses` de Supabase.

## Webhooks y callbacks

**Entrantes:**
- `POST app/api/subscription/webhook/route.ts` — eventos de preapproval (suscripciones SaaS). Valida firma `x-signature` con `MP_WEBHOOK_SECRET[_TEST]`, fail-closed (401 si falta el secret).
- `POST app/api/payment/webhook/[slug]/route.ts` — notificaciones de pago de seña por negocio (slug en la ruta). NO escribe estado de pago optimista: el turno queda `pending_payment` hasta que el webhook confirme.
- `GET app/api/mercadopago/callback/route.ts` — callback OAuth de MercadoPago Connect.
- `GET app/api/google/callback/route.ts` — callback OAuth de Google Calendar.
- `GET app/api/cancel/[token]/route.ts` — cancelación por link de email (token).
- `GET app/api/cron/cancel-expired/route.ts` — cron diario (Vercel `0 3 * * *`), protegido con `CRON_SECRET`. Cancela reservas con seña vencida.

**Salientes (notification_url configuradas en MP):**
- `back_urls` de checkout de seña: `/{slug}/pago/{exitoso,fallido,pendiente}` (`auto_return: approved`).
- `notification_url`: `/api/payment/webhook/{slug}`.
- Definidas en `lib/payment.ts` (`createDepositPreference`).

---

*Auditoría de integraciones: 2026-06-15*
