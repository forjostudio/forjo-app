<!-- refreshed: 2026-06-15 -->
# Arquitectura

**Fecha de análisis:** 2026-06-15

## Visión general del sistema

Forjo Gestión es un **SaaS multi-tenant de gestión de turnos** construido sobre **Next.js 16 (App Router)** y **Supabase (Postgres + Auth)**, desplegado en **Vercel**. Cada negocio es un tenant identificado por `slug` (tabla `businesses`), y todo dato de negocio se aísla por `business_id` con defensa en profundidad (RLS en la base + filtro explícito en las queries).

Hay tres superficies de aplicación, modeladas como route groups del App Router:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         Cliente (browser)                                 │
├──────────────────┬──────────────────────┬────────────────────────────────┤
│  Dashboard admin │  Booking público     │  Onboarding                    │
│  (dueño logueado)│  (cliente final anon)│  (alta de negocio)             │
│  `app/(dashboard)`│  `app/[slug]`        │  `app/(onboarding)`            │
└────────┬─────────┴──────────┬───────────┴───────────┬────────────────────┘
         │ cookies sesión     │ sin sesión            │ cookies sesión
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              proxy.ts (Edge) → updateSession  ·  Route Handlers           │
│  `proxy.ts`             `lib/supabase/middleware.ts`   `app/api/**`       │
│  refresh de sesión + guard de rutas         lógica server-side (pagos,    │
│                                             booking, webhooks, cron)      │
└────────┬──────────────────────────────────────────────────┬──────────────┘
         │ anon key (RLS)                                    │ service role (bypassa RLS)
         ▼                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Supabase (Postgres + Auth)                         │
│  RLS por business_id  ·  vistas públicas acotadas  ·  constraints anti    │
│  doble-booking (índice 011 / exclusion 013)                              │
└────────────────────┬──────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Integraciones externas (best-effort, vía `after()`)                      │
│  MercadoPago (señas/suscripción) · Resend (emails) · Google Calendar      │
│  reCAPTCHA · Anthropic (sugerencia de rubro)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

## Responsabilidades de componentes

| Componente | Responsabilidad | Archivo |
|-----------|----------------|---------|
| Proxy (middleware Edge) | Refresh de sesión Supabase + guard de rutas protegidas | `proxy.ts` |
| `updateSession` | Crea cliente SSR, evalúa `auth.getUser()`, redirige según ruta | `lib/supabase/middleware.ts` |
| Cliente Supabase server | Lectura/escritura con cookies del dueño (anon key, respeta RLS) | `lib/supabase/server.ts` |
| Cliente Supabase admin | Operaciones server-side con service role (bypassa RLS) | `lib/supabase/admin.ts` |
| Cliente Supabase público | Server components de rutas públicas, rol anon sin cookies | `lib/supabase/public.ts` |
| Cliente Supabase browser | Componentes client del dashboard (anon key) | `lib/supabase/client.ts` |
| Resolución de vertical | Mapea `type`/`vertical` del negocio a terminología, menú y features | `lib/verticals.ts` |
| Provider de terminología | Inyecta el vertical resuelto a los componentes client | `lib/use-terminology.tsx` |
| Route handler de booking | Creación de turno público server-side (validación + anti-tampering) | `app/api/booking/create/route.ts` |
| Webhook de pago | Confirma turnos al aprobarse la seña (fuente de verdad async) | `app/api/payment/webhook/[slug]/route.ts` |
| Cron de limpieza | Cancela holds vencidos a diario (Vercel cron) | `app/api/cron/cancel-expired/route.ts` |

## Vista general del patrón

**General:** App Router multi-tenant con separación por route groups y dos planos de acceso a datos (sesión-con-RLS vs. service-role-server-only).

**Características clave:**
- **Route groups** dividen las superficies sin afectar la URL: `(auth)`, `(dashboard)`, `(onboarding)` y la ruta dinámica pública `[slug]`.
- **Server Components por defecto:** las páginas (`page.tsx`) son async server components que leen Supabase directo; la interactividad se delega a componentes client co-ubicados (`*-client.tsx`).
- **Defensa en profundidad de tenant:** RLS en la base + filtro explícito por `business_id` en cada query. El service role solo vive en route handlers server-side.
- **Verticales:** la UI (terminología, menú, features) se adapta al rubro del negocio (`salud`, `belleza`, `general`) desde una única fuente de configuración.
- **No persistir optimista en flujos async:** pagos y webhooks esperan la confirmación de la fuente de verdad; los efectos secundarios best-effort van en `after()`.

## Capas

**Capa de ruteo / sesión (Edge):**
- Propósito: refrescar la sesión Supabase y proteger rutas del dashboard.
- Ubicación: `proxy.ts`, `lib/supabase/middleware.ts`.
- Corre en Edge Runtime sobre las rutas conocidas (incluidas todas las `/api/*`). El booking público (`/[slug]`) se saltea a propósito para que las credenciales del dueño no se filtren al flujo anónimo.
- Usado por: todo request que matchea el `matcher` del proxy.

**Capa de presentación (Server + Client Components):**
- Propósito: render del dashboard, booking y onboarding.
- Ubicación: `app/(dashboard)/**`, `app/[slug]/**`, `app/(onboarding)/**`.
- Contiene: `page.tsx` (server, fetch de datos), `*-client.tsx` (interactividad), `layout.tsx` (sesión + chrome).
- Depende de: clientes Supabase, `lib/verticals`, componentes UI.

**Capa de lógica server-side (Route Handlers):**
- Propósito: operaciones que no pueden confiar en el cliente (booking público, pagos, webhooks, cron, OAuth de Google/MP).
- Ubicación: `app/api/**`.
- Contiene: validación de entrada, anti-tampering de tenant, re-check de disponibilidad, integraciones externas.
- Usa: `lib/supabase/admin.ts` (service role), libs de integración (`lib/mercadopago`, `lib/email`, `lib/google-calendar`, `lib/recaptcha`).

**Capa de dominio / utilidades (`lib/`):**
- Propósito: lógica de negocio framework-agnostic y wrappers de integración.
- Ubicación: `lib/*.ts`.
- Contiene: verticales, límites de plan, planes, código de booking, terminología, helpers de WhatsApp/email/pago.

**Capa de datos (Supabase):**
- Propósito: persistencia con aislamiento por tenant.
- Tablas clave: `businesses`, `services`, `professionals`, `locations`, `time_blocks`, `schedule_exceptions`, `appointments`, `clients`.
- Vistas públicas acotadas (ej. `public_professionals`) para no exponer datos sensibles a `anon`.
- Constraints anti doble-booking: índice único (011, mismo inicio) + exclusion constraint (013, solapamiento).

## Flujo de datos

### Reserva pública con seña (camino principal)

1. El cliente final abre `/[slug]` → server component carga negocio, servicios, profesionales (vista acotada), horarios y excepciones (`app/[slug]/page.tsx`).
2. `BookingClient` (componente client) consulta disponibilidad en `app/api/booking/availability/route.ts`.
3. Al confirmar, POST a `app/api/booking/create/route.ts`: verifica reCAPTCHA (fail-closed salvo flujo con seña), valida que servicio/profesional/consultorio sean del negocio (anti-tampering), re-chequea solapamiento con buffer y crea el `appointment` en `pending_payment` con `expires_at`.
4. El cliente es redirigido al checkout de MercadoPago (`app/api/payment/create/route.ts`).
5. MercadoPago notifica al webhook `app/api/payment/webhook/[slug]/route.ts` → al aprobarse, el turno pasa a `confirmed` y se crea el evento de Google Calendar.
6. Efectos secundarios (emails de confirmación, gcal) corren en `after()` para no demorar la respuesta.

### Reserva sin seña

Pasos 1–3 igual, pero el turno se crea directamente como `confirmed` y, si el negocio sincroniza, se crea el evento de Google Calendar en `after()` (`app/api/booking/create/route.ts`).

### Dashboard del dueño

1. `app/(dashboard)/layout.tsx` lee la sesión (`createClient` server), carga el negocio por `owner_id` y resuelve el vertical.
2. `VerticalProvider` inyecta la terminología; `PaletteScript` aplica la paleta/tema del negocio.
3. Cada `page.tsx` vuelve a validar sesión + negocio y filtra por `business_id`.

**Gestión de estado:**
- Estado de servidor: leído fresco en cada request (booking con `export const dynamic = 'force-dynamic'`).
- Estado de cliente: `react-hook-form` + `zod` para formularios; React Context para el vertical/terminología.
- Tema/paleta: `next-themes` + `data-palette`/`data-theme` en `<html>` vía `PaletteScript`.

## Abstracciones clave

**Vertical (rubro de negocio):**
- Propósito: adaptar terminología, menú y features según el tipo de negocio.
- Ejemplos: `lib/verticals.ts`, `lib/use-terminology.tsx`.
- Patrón: configuración declarativa (`VERTICALS`) resuelta por `resolveVertical(business)` y consumida vía Context.

**Cliente Supabase por contexto:**
- Propósito: elegir el plano de acceso correcto (sesión vs. anon vs. service role).
- Ejemplos: `lib/supabase/server.ts`, `client.ts`, `public.ts`, `admin.ts`, `middleware.ts`.
- Patrón: un factory por contexto; `admin` (service role) jamás llega al cliente.

**Booking público server-side:**
- Propósito: que el cliente final no autenticado pueda reservar sin permisos de escritura directos.
- Ejemplos: `app/api/booking/create/route.ts`, `app/api/booking/availability/route.ts`.
- Patrón: route handler con service role que resuelve el tenant por slug y valida todo del lado del servidor.

## Entry points

**Layout raíz:**
- Ubicación: `app/layout.tsx`.
- Responsabilidades: fuentes, `ThemeProvider`, `Toaster`, atributos de paleta en `<html>`.

**Proxy (middleware Edge):**
- Ubicación: `proxy.ts`.
- Dispara: refresh de sesión + guard sobre rutas conocidas; saltea el booking público.

**Layouts de route group:**
- `app/(dashboard)/layout.tsx`: sesión, negocio, vertical, sidebar.
- `app/[slug]/layout.tsx`: metadata por negocio (favicon, título) y paleta pública.

**Route handlers (`app/api/**`):**
- Booking, pagos, suscripción, webhooks, cron, OAuth de Google y MercadoPago, notificaciones, reCAPTCHA.

## Restricciones arquitectónicas

- **Runtime:** el proxy corre en **Edge Runtime**; los route handlers corren en el runtime Node por defecto (usan service role y librerías de integración).
- **Next 16, NO 14:** el middleware se llama `proxy.ts` (no `middleware.ts`); hay breaking changes respecto a versiones viejas. Consultar `node_modules/next/dist/docs/` antes de asumir comportamiento.
- **Service role solo en server:** `SUPABASE_SERVICE_ROLE_KEY` jamás en `NEXT_PUBLIC_*` ni en componentes client.
- **Booking público fuera de la sesión:** el `proxy.ts` excluye `/[slug]` para no filtrar credenciales del dueño al flujo anónimo.
- **Cron de Vercel Hobby:** solo se permite frecuencia diaria como máximo (`vercel.json` → `0 3 * * *`). Un cron más frecuente rompe el deploy.
- **Booking dinámico:** `app/[slug]/page.tsx` usa `export const dynamic = 'force-dynamic'` para servir siempre datos frescos.

## Anti-patrones

### Persistir estado optimista en flujos de pago

**Qué pasa:** confirmar un turno o suscripción antes de que MercadoPago confirme.
**Por qué está mal:** el pago puede rechazarse o abandonarse; el slot queda ocupado falsamente.
**Hacé esto en su lugar:** crear el turno en `pending_payment` con `expires_at` y confirmarlo recién en el webhook (`app/api/payment/webhook/[slug]/route.ts`). El cron libera holds vencidos.

### Confiar en datos del cliente para resolver el tenant o la duración

**Qué pasa:** usar `duration`, `business_id` o precios enviados por el browser.
**Por qué está mal:** permite tampering entre tenants y manipular disponibilidad/montos.
**Hacé esto en su lugar:** resolver el negocio por slug y releer servicio/profesional/consultorio filtrando por `business_id` server-side, como en `app/api/booking/create/route.ts`.

### Abrir una tabla entera a `anon` para la página pública

**Qué pasa:** exponer `professionals`/`clients` completos a la página de booking.
**Por qué está mal:** filtra contacto/matrícula del staff o datos sensibles (historia clínica, finanzas).
**Hacé esto en su lugar:** exponer vistas acotadas (ej. `public_professionals`) y columnas específicas, como en `app/[slug]/page.tsx`.

### Demorar la respuesta con efectos secundarios

**Qué pasa:** esperar a Resend/Google Calendar dentro del request del usuario.
**Por qué está mal:** suma latencia a una acción que solo necesita el resultado primario.
**Hacé esto en su lugar:** envolver emails/gcal en `after()` (best-effort, con `try/catch` y log), como en `app/api/booking/create/route.ts`.

## Manejo de errores

**Estrategia:** los route handlers devuelven `Response.json({ ok, error }, { status })` con códigos semánticos (`missing_fields`, `slot_taken`, `invalid_service`, `recaptcha_failed`).

**Patrones:**
- Constraints de base traducidas a respuestas de dominio: `23505`/`23P01` → `slot_taken` (409).
- Efectos best-effort en `after()` con `try/catch` y `console.error` contextualizado.
- Redirecciones de guard en el middleware (`/login`, `/dashboard`, `/onboarding`).

## Concerns transversales

**Logging:** `console.error` con prefijo de origen (ej. `[booking/create]`) en route handlers.
**Validación:** `zod` + `@hookform/resolvers` en formularios; validación manual y anti-tampering en route handlers públicos.
**Autenticación:** Supabase Auth vía SSR; sesión refrescada en `proxy.ts`; guards en `lib/supabase/middleware.ts` y en cada layout/página protegida.

---

*Análisis de arquitectura: 2026-06-15*
