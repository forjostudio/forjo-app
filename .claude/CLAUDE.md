<!-- GSD:project-start source:PROJECT.md -->

## Project

**Forjo App — Security Hardening (v0.9)**

Forjo App es un SaaS multi-tenant de gestión de turnos para negocios de servicios (peluquerías, consultorios, estudios), construido sobre Next.js 16 (App Router) + Supabase (Postgres con RLS, aislamiento por `business_id`) + MercadoPago. Cada negocio tiene un dashboard privado y una página pública de reservas en `/[slug]`. Este milestone (v0.9) no agrega features: endurece la seguridad antes de salir a producción con clientes reales.

**Core Value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados. Si todo lo demás falla, el aislamiento multi-tenant y la integridad de los pagos deben sostenerse.

### Constraints

- **Security**: aislamiento por tenant es no negociable — toda query/policy/route que toque datos de un negocio debe garantizarlo (RLS + `business_id`).
- **Tech stack**: Next.js 16 tiene breaking changes frente a versiones viejas; consultar `node_modules/next/dist/docs/` antes de asumir comportamiento. Middleware = `proxy.ts`.
- **Plataforma**: Vercel Hobby (`gestion.forjo.studio`) — cron limitado a una ejecución diaria; no introducir crons más frecuentes.
- **DB**: migraciones SQL numeradas en `supabase/migrations/`, aplicadas a mano y en orden; SEC-01 requiere una migración nueva coordinada con el deploy.
- **Dev env**: Windows + PowerShell (sintaxis distinta a bash) + VS Code + Claude Code.
- **Timeline**: pre-requisito de lanzamiento — bloquea salir a producción con clientes reales.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Lenguajes

- TypeScript `^5` — todo el código de la app (`app/`, `lib/`, `components/`, `proxy.ts`). `strict: true` activado en `tsconfig.json`.
- SQL (PostgreSQL) — esquema y migraciones en `supabase/migrations/*.sql` y `supabase/schema.sql`.
- CSS — estilos globales y tokens de diseño en `app/globals.css` (Tailwind v4 con `@tailwindcss/postcss`).

## Runtime

- Node.js (sin versión fijada: no hay `.nvmrc` ni `.node-version`). Despliegue en Vercel.
- Edge Runtime para el middleware: `proxy.ts` corre `updateSession` sobre rutas conocidas (incluidas todas las `/api/*`).
- npm (lockfile `package-lock.json` presente).
- Lockfile: presente.

## Frameworks

- Next.js `16.2.7` (App Router) — NO es Next 14. Hay breaking changes respecto a versiones viejas (APIs, convenciones, estructura). Consultar `node_modules/next/dist/docs/` antes de asumir comportamiento. El middleware se llama `proxy.ts` (raíz), no `middleware.ts`.
- React `19.2.4` + React DOM `19.2.4` — React Server Components activados (`rsc: true` en `components.json`).
- Tailwind CSS `^4` (config CSS-first vía `@tailwindcss/postcss`, sin `tailwind.config`). Variables CSS en `app/globals.css`.
- shadcn `^4.10.0` (estilo `base-nova`, baseColor `neutral`, CSS variables). Config en `components.json`. Componentes en `@/components/ui`.
- `@base-ui/react` `^1.5.0` — primitivas de UI sin estilo.
- `lucide-react` `^1.17.0` — iconografía (definida como `iconLibrary` en `components.json`).
- `next-themes` `^0.4.6` — modo claro/oscuro (identidad Bauhaus dark).
- `recharts` `^3.8.1` — gráficos del dashboard/finanzas.
- `react-day-picker` `^10.0.1` — selector de fechas para reservas.
- `sonner` `^2.0.7` — toasts/notificaciones.
- `vaul` `^1.1.2` — drawers en mobile.
- `class-variance-authority` `^0.7.1`, `clsx` `^2.1.1`, `tailwind-merge` `^3.6.0`, `tw-animate-css` `^1.4.0` — utilidades de estilos y variantes.
- `react-hook-form` `^7.77.0` + `@hookform/resolvers` `^5.4.0`.
- `zod` `^4.4.3` — esquemas de validación.
- `date-fns` `^4.4.0`. La app maneja zona fija de Argentina (`America/Argentina/Buenos_Aires`, UTC-3 sin DST).
- No detectado. No hay framework de tests (jest/vitest/playwright) ni archivos `*.test.*` / `*.spec.*` en el repo.
- ESLint `^9` + `eslint-config-next` `16.2.7` (config en `eslint.config.mjs`).
- `next-env.d.ts` autogenerado; `tsconfig.tsbuildinfo` para builds incrementales.

## Dependencias clave

- `@supabase/supabase-js` `^2.106.2` — cliente Postgres/Auth (admin y público).
- `@supabase/ssr` `^0.10.3` — clientes Supabase con cookies para SSR (server, browser, middleware).
- `next` `16.2.7` — framework completo (App Router, route handlers, RSC).
- `resend` `^6.12.4` — emails transaccionales (aunque `lib/email.ts` hace POST crudo a `api.resend.com`, no usa el SDK).
- `@anthropic-ai/sdk` `^0.100.1` — sugerencias/clasificación con IA (modelo `claude-haiku-4-5`). Degrada elegante sin API key.
- MercadoPago — sin SDK; se llama vía `fetch` directo a `api.mercadopago.com` (ver `lib/mercadopago.ts`, `lib/payment.ts`).
- Google Calendar — sin SDK; OAuth + REST vía `fetch` (ver `lib/google-calendar.ts`).
- reCAPTCHA v3 — verificación vía `fetch` a `google.com/recaptcha/api/siteverify` (ver `lib/recaptcha.ts`).

## Configuración

- Variables en `.env.local` (presente en raíz — contiene configuración de entorno; NO se leyó su contenido).
- Toggle de entornos MercadoPago: `MP_MODE` (`test` | `production`, default `production`).
- Variables públicas con prefijo `NEXT_PUBLIC_` (URL de app, Supabase URL/anon key, reCAPTCHA site key, plans unlimited).
- Secretos server-only: service role key de Supabase, tokens de MercadoPago, client secrets de Google/MP, API keys de Resend/Anthropic, secretos de cron/admin.
- `next.config.ts` — configuración mínima (sin opciones custom).
- `postcss.config.mjs` — pipeline de Tailwind v4.
- `vercel.json` — cron diario (`0 3 * * *`) a `/api/cron/cancel-expired`. Vercel Hobby NO permite crons más frecuentes que diario.
- `tsconfig.json` — alias de import `@/*` → raíz del proyecto.
- `.env.local` — configuración de entorno.
- `client_secret_*.apps.googleusercontent.com.json` — credenciales OAuth de Google (en raíz; verificar que esté en `.gitignore`).

## Requisitos de plataforma

- Windows + VS Code + Claude Code. Terminal PowerShell (sintaxis distinta a bash).
- Node.js + npm. Supabase como Postgres (local o remoto).
- Vercel (`gestion.forjo.studio`). DNS en Cloudflare con wildcard. Org de GitHub: `forjostudio`.
- Plan Vercel Hobby: límite de cron a una ejecución diaria.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Patrones de Naming

- Rutas y páginas: kebab-case según convención de App Router. Páginas de servidor en `page.tsx`; su contraparte cliente en `[seccion]-client.tsx` (ej. `app/(dashboard)/clients/page.tsx` + `clients-client.tsx`).
- Route handlers de API: siempre `route.ts` bajo `app/api/.../route.ts`.
- Módulos de `lib/`: kebab-case (`lib/google-calendar.ts`, `lib/plan-limits.ts`, `lib/use-terminology.tsx`).
- Componentes UI: kebab-case (`components/ui/button.tsx`, `components/dashboard/plan-banner.tsx`).
- camelCase para funciones y helpers (`timeToMinutes`, `createAdminClient`, `verifyRecaptcha`, `fichaNum`, `fmtSince`).
- Componentes React en PascalCase como default o named export (`ClientsPage`, `RegisterPage`, `ClientsClient`).
- Handlers HTTP exportados con el verbo en mayúscula que exige Next (`export async function POST(...)`, `GET`, etc.).
- camelCase para variables locales (`requireDeposit`, `expiredHoldIds`, `reqStart`).
- UPPER_SNAKE_CASE para constantes a nivel de módulo (`SENTINEL`, `STATUS_DOT`, `FILTER_TABS`, `ALL_LETTERS`).
- Columnas de base de datos en snake_case (`business_id`, `client_name`, `expires_at`); se reflejan tal cual en los objetos que vienen de Supabase. La capa TS NO renombra a camelCase.
- `interface` PascalCase para entidades de dominio en `lib/types.ts` (`Business`, `Location`, `Client`, `Appointment`).
- `type` PascalCase para uniones y derivados locales (`StatusKey`, `FilterKey`, `FormData = z.infer<typeof schema>`).
- Campos de tipo en snake_case para coincidir con la fila de DB; opcionales marcados con `?` y `| null` cuando la columna es nullable.

## Estilo de Código

- Sin Prettier ni `.editorconfig`. Estilo de facto observado:
- `tsconfig.json`: `"strict": true`, `target: ES2017`, `moduleResolution: bundler`, `jsx: react-jsx`.
- `eslint.config.mjs` (flat config) compone `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
- Script: `npm run lint` (ejecuta `eslint`).
- No hay reglas custom más allá del preset de Next. Respetar reglas de Core Web Vitals (ej. usar `next/image`, `next/link`).

## Organización de Imports

- Único alias: `@/*` → raíz del repo (definido en `tsconfig.json`). Usar SIEMPRE `@/lib/...`, `@/components/...`; evitar rutas relativas profundas.

## Manejo de Errores

- Respuestas con `Response.json({ ok: boolean, ... }, { status })`. Forma estable: `{ ok: true, ... }` en éxito; `{ ok: false, error: '<codigo_snake>' }` en falla.
- Códigos de error como strings cortos en snake_case: `'bad_request'`, `'missing_fields'`, `'not_found'`, `'invalid_service'`, `'slot_taken'`, `'recaptcha_failed'`, `'insert_failed'`.
- Status HTTP coherentes: 400 (validación), 403 (reCAPTCHA), 404 (no existe), 409 (conflicto/slot tomado), 500 (insert/server).
- Parseo defensivo del body: `try { raw = await request.json() } catch { return 400 }`, luego narrowing manual con `typeof body.x === 'string' ? ... : default`. No se confía en el shape del cliente.
- **Anti-tampering de tenant:** toda entidad referenciada (service, professional, location) se re-valida con `.eq('business_id', business.id)` antes de usarse. Nunca confiar en IDs que llegan del cliente.
- **Errores de Postgres traducidos a dominio:** se inspecciona `insertErr?.code` (ej. `'23505'`, `'23P01'`) y se mapea a `'slot_taken'` (409). Patrón a replicar ante constraints/índices.
- Logging de fallas server-side con prefijo de módulo: `console.error('[booking/create] insert error:', ...)`.
- Efectos secundarios no críticos (emails, evento de Google Calendar) se ejecutan con `after()` de `next/server` para no demorar la respuesta. Cada uno envuelto en `try/catch` propio; si falla, se loguea y el flujo principal NO se rompe.
- `fetch` a la API + chequeo de `ok`; feedback con `toast` de `sonner` (`toast.error(...)`, `toast.success(...)`).
- Validación de formularios con `zod` + `zodResolver` (`@hookform/resolvers/zod`); errores inline vía `formState.errors` (ver `app/(auth)/register/page.tsx`).
- Estados de carga con `const [loading, setLoading] = useState(false)` para deshabilitar botones y evitar doble submit.

## Logging

- Solo `console.error` para fallas; prefijo `[modulo/accion]` (ej. `[booking/create]`, `[cancel]`). Extraer mensaje seguro: `e instanceof Error ? e.message : e`.
- Evitar `console.log` en API de producción (uso casi nulo en `app/api`).

## Comentarios

- Comentarios densos en **español** explicando el *por qué* de decisiones no obvias: carreras/concurrencia, constraints de DB, aislamiento por tenant, fail-closed de reCAPTCHA, uso de `after()`. Ver el bloque de cabecera de `app/api/booking/create/route.ts`.
- Secciones dentro de archivos grandes se separan con barras Unicode: `// ── Constants ───────`, `// ── Helpers ───────`.
- En `lib/types.ts` cada campo no trivial lleva comentario explicando semántica/origen (ej. `whatsapp` normalizado a `wa.me`, `google_refresh_token` secreto nunca al cliente).

## Diseño de Funciones

- Funciones de varios argumentos relacionados reciben **un objeto** con desestructuración (ej. `sendPendingPaymentEmail({ to, clientName, service, ... })`, `verifyRecaptcha({ token, slug })`). Preferir este patrón para >2 params.
- API: siempre `Response.json(...)`.
- Helpers de validación devuelven objetos discriminados `{ ok: boolean, reason?: ... }`.

## Diseño de Módulos

- Páginas: `export default async function`.
- Helpers de `lib/` y componentes: named exports (`export function createAdminClient()`, `export function cn()`).
- `page.tsx` es Server Component async: obtiene `supabase = await createClient()`, valida sesión con `supabase.auth.getUser()` → `redirect('/login')` si no hay user, obtiene `business` por `owner_id`, carga datos en paralelo con `Promise.all([...])` y pasa props al componente cliente. Ver `app/(dashboard)/clients/page.tsx`.
- Toda query del dashboard filtra por `.eq('business_id', business.id)` (aislamiento por tenant). Nunca omitir.
- `@/lib/supabase/server` → `createClient()` async, anon key + cookies, para Server Components/acciones autenticadas (RLS activo).
- `@/lib/supabase/client` → cliente de navegador para componentes `'use client'`.
- `@/lib/supabase/admin` → `createAdminClient()`, **service role**, server-only, bypassa RLS. Usar SOLO en route handlers donde el aislamiento se garantiza manualmente por slug/`business_id` (ej. booking público).
- `@/lib/supabase/middleware` → `updateSession`, refresh de sesión en `proxy.ts`.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Visión general del sistema

```text

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

- **Route groups** dividen las superficies sin afectar la URL: `(auth)`, `(dashboard)`, `(onboarding)` y la ruta dinámica pública `[slug]`.
- **Server Components por defecto:** las páginas (`page.tsx`) son async server components que leen Supabase directo; la interactividad se delega a componentes client co-ubicados (`*-client.tsx`).
- **Defensa en profundidad de tenant:** RLS en la base + filtro explícito por `business_id` en cada query. El service role solo vive en route handlers server-side.
- **Verticales:** la UI (terminología, menú, features) se adapta al rubro del negocio (`salud`, `belleza`, `general`) desde una única fuente de configuración.
- **No persistir optimista en flujos async:** pagos y webhooks esperan la confirmación de la fuente de verdad; los efectos secundarios best-effort van en `after()`.

## Capas

- Propósito: refrescar la sesión Supabase y proteger rutas del dashboard.
- Ubicación: `proxy.ts`, `lib/supabase/middleware.ts`.
- Corre en Edge Runtime sobre las rutas conocidas (incluidas todas las `/api/*`). El booking público (`/[slug]`) se saltea a propósito para que las credenciales del dueño no se filtren al flujo anónimo.
- Usado por: todo request que matchea el `matcher` del proxy.
- Propósito: render del dashboard, booking y onboarding.
- Ubicación: `app/(dashboard)/**`, `app/[slug]/**`, `app/(onboarding)/**`.
- Contiene: `page.tsx` (server, fetch de datos), `*-client.tsx` (interactividad), `layout.tsx` (sesión + chrome).
- Depende de: clientes Supabase, `lib/verticals`, componentes UI.
- Propósito: operaciones que no pueden confiar en el cliente (booking público, pagos, webhooks, cron, OAuth de Google/MP).
- Ubicación: `app/api/**`.
- Contiene: validación de entrada, anti-tampering de tenant, re-check de disponibilidad, integraciones externas.
- Usa: `lib/supabase/admin.ts` (service role), libs de integración (`lib/mercadopago`, `lib/email`, `lib/google-calendar`, `lib/recaptcha`).
- Propósito: lógica de negocio framework-agnostic y wrappers de integración.
- Ubicación: `lib/*.ts`.
- Contiene: verticales, límites de plan, planes, código de booking, terminología, helpers de WhatsApp/email/pago.
- Propósito: persistencia con aislamiento por tenant.
- Tablas clave: `businesses`, `services`, `professionals`, `locations`, `time_blocks`, `schedule_exceptions`, `appointments`, `clients`.
- Vistas públicas acotadas (ej. `public_professionals`) para no exponer datos sensibles a `anon`.
- Constraints anti doble-booking: índice único (011, mismo inicio) + exclusion constraint (013, solapamiento).

## Flujo de datos

### Reserva pública con seña (camino principal)

### Reserva sin seña

### Dashboard del dueño

- Estado de servidor: leído fresco en cada request (booking con `export const dynamic = 'force-dynamic'`).
- Estado de cliente: `react-hook-form` + `zod` para formularios; React Context para el vertical/terminología.
- Tema/paleta: `next-themes` + `data-palette`/`data-theme` en `<html>` vía `PaletteScript`.

## Abstracciones clave

- Propósito: adaptar terminología, menú y features según el tipo de negocio.
- Ejemplos: `lib/verticals.ts`, `lib/use-terminology.tsx`.
- Patrón: configuración declarativa (`VERTICALS`) resuelta por `resolveVertical(business)` y consumida vía Context.
- Propósito: elegir el plano de acceso correcto (sesión vs. anon vs. service role).
- Ejemplos: `lib/supabase/server.ts`, `client.ts`, `public.ts`, `admin.ts`, `middleware.ts`.
- Patrón: un factory por contexto; `admin` (service role) jamás llega al cliente.
- Propósito: que el cliente final no autenticado pueda reservar sin permisos de escritura directos.
- Ejemplos: `app/api/booking/create/route.ts`, `app/api/booking/availability/route.ts`.
- Patrón: route handler con service role que resuelve el tenant por slug y valida todo del lado del servidor.

## Entry points

- Ubicación: `app/layout.tsx`.
- Responsabilidades: fuentes, `ThemeProvider`, `Toaster`, atributos de paleta en `<html>`.
- Ubicación: `proxy.ts`.
- Dispara: refresh de sesión + guard sobre rutas conocidas; saltea el booking público.
- `app/(dashboard)/layout.tsx`: sesión, negocio, vertical, sidebar.
- `app/[slug]/layout.tsx`: metadata por negocio (favicon, título) y paleta pública.
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

### Confiar en datos del cliente para resolver el tenant o la duración

### Abrir una tabla entera a `anon` para la página pública

### Demorar la respuesta con efectos secundarios

## Manejo de errores

- Constraints de base traducidas a respuestas de dominio: `23505`/`23P01` → `slot_taken` (409).
- Efectos best-effort en `after()` con `try/catch` y `console.error` contextualizado.
- Redirecciones de guard en el middleware (`/login`, `/dashboard`, `/onboarding`).

## Concerns transversales

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| forjo-advisor | > Arquitecto senior de Forjo App. Dado el texto de una pregunta del GSD (gate, opciones, decisión de fase), lee el contexto del proyecto y responde solo si es técnica, o para y pregunta al usuario si es una decisión de negocio, tiene costo, requiere acción externa, o toca seguridad en producción. Triggers: cualquier pregunta del GSD que no querés responder vos, falsos positivos de gates (UI-SPEC innecesario, research redundante), decisiones de arquitectura de fase. | `.claude/skills/forjo-advisor/SKILL.md` |
| convenciones-forjo | > Contexto base de Forjo Gestión. Usar al arrancar cualquier tarea en este proyecto para no redescubrir el stack, la arquitectura multi-tenant, los verticales de negocio ni las convenciones. Triggers: cualquier trabajo sobre el dashboard, la página pública de booking, turnos, clientes, finanzas, onboarding, configuración por tipo de negocio, o dudas sobre estructura/stack/naming del proyecto. No incluye el detalle de pagos (ver skill mercadopago-suscripciones para eso). | `.claude/skills/convenciones-forjo/SKILL.md` |
| entrevistador-procesos | Entrevista al usuario para definir con claridad un proceso, workflow, automatización, skill, sistema o proyecto antes de construirlo. Úsala siempre que el usuario quiera planificar, diseñar, construir, crear, automatizar, documentar o mejorar algo complejo — antes de ponerte a ejecutar. También debe activarse cuando el usuario quiera crear una skill nueva, preparar un workflow, definir una estrategia, diseñar un sistema interno, estructurar un proyecto o convertir una tarea repetitiva en un proceso reutilizable. Si el usuario dice "quiero crear X", "necesito automatizar Y", "ayúdame a definir Z" o cualquier variante donde el proceso todavía no está completamente claro, activa esta skill en lugar de empezar a construir directamente. | `.claude/skills/entrevistador-procesos/SKILL.md` |
| humanizador | > Reescribe textos generados por IA para que suenen más naturales, humanos, directos y creíbles, eliminando frases genéricas, tono inflado, lenguaje corporativo vacío y patrones artificiales. Úsala siempre que el usuario quiera humanizar, naturalizar, limpiar o mejorar un texto para que no suene a IA. Activa esta skill cuando el usuario diga cosas como "humaniza este texto", "haz que no suene a IA", "hazlo más natural", "hazlo más humano", "quita el tono artificial", "reescríbelo como lo diría una persona", "hazlo menos corporativo", "hazlo más directo", "pásalo por el humanizador", "haz que parezca escrito por una persona" o cualquier variante. También debe activarse cuando el usuario pega un texto y pide que suene mejor, más real o menos robótico. Funciona con emails, posts de LinkedIn, guiones, mensajes comerciales, webs, propuestas, atención al cliente y cualquier texto destinado a ser leído por personas. | `.claude/skills/humanizador/SKILL.md` |
| instagram-a-web | "Convierte un perfil de Instagram en una web de marca personal profesional. Usa esta skill cuando el usuario quiera crear una web desde su Instagram, convertir su perfil en web, hacer una web de marca personal, o cualquier variación de generar un sitio web a partir de un perfil de Instagram. Triggers: 'convierte mi Instagram en web', 'web de marca personal', 'web desde mi Instagram', 'quiero una web como mi perfil', 'web para influencer', 'web para creador de contenido', 'landing de marca personal', 'web desde mi @'." | `.claude/skills/instagram-a-web/SKILL.md` |
| mercadopago-suscripciones | > Usar SIEMPRE que se toque cualquier cosa del flujo de pagos/suscripciones de MercadoPago en Forjo Gestión: crear o modificar la preapproval, el endpoint de checkout, el handler del webhook, la página de retorno (back_url), el manejo de plan_status / mp_subscription_id, reintentos de pago, MP_MODE, o el cobro de planes. Triggers: "suscripción", "preapproval", "MercadoPago", "MP", "webhook de pago", "checkout", "plan_status", "cobro", "payer_email", "init_point". Contiene el patrón correcto ya validado en producción y los errores que NO hay que volver a cometer. | `.claude/skills/mercadopago-suscripciones/SKILL.md` |
| optimizador-prompts | Transforma ideas desordenadas, prompts mal escritos, notas rápidas, dictados por voz o instrucciones incompletas en prompts claros, estructurados y listos para usar en herramientas de IA. Úsala siempre que el usuario quiera mejorar, ordenar, optimizar, reescribir o estructurar un prompt o una idea para convertirla en instrucción para una IA. Activa esta skill cuando el usuario diga cosas como "mejora este prompt", "conviértelo en un prompt", "ordena esta idea", "hazme un prompt para…", "optimiza esto para Claude / ChatGPT / Gemini / Midjourney / Sora / Claude Code / n8n / Make", "te voy a dictar una idea desordenada", o cualquier variante. No esperes que el usuario use la palabra exacta "prompt" — si hay una idea o instrucción que necesita ser estructurada para una IA, usa esta skill. | `.claude/skills/optimizador-prompts/SKILL.md` |
| supabase-multitenant-rls | > Usar SIEMPRE que se cree o modifique una tabla, una query, una policy de RLS, un route handler o una server action que toque datos de un negocio en Forjo Gestión. El objetivo es garantizar el aislamiento por tenant: un negocio NUNCA debe poder ver ni modificar datos de otro. Triggers: "tabla nueva", "migración", "RLS", "policy", "Supabase", "query", "business_id", "multi-tenant", "aislamiento", "página pública", "booking público", "anon key", "service role". Trabaja en conjunto con convenciones-forjo. | `.claude/skills/supabase-multitenant-rls/SKILL.md` |
| superpowers | > Activa un modo de trabajo riguroso y estructurado para proyectos complejos. Usa esta skill siempre que el usuario quiera crear, construir, modificar, diseñar o mejorar algo con varias partes — una aplicación, herramienta, automatización, sistema, documento complejo, estrategia o flujo de trabajo. También actívala cuando el usuario pida "hazlo todo" sin haber definido bien los requisitos, o cuando quiera revisar una solución antes de darla por terminada. Actívala especialmente con frases como "crea una app", "construye esto", "haz esta herramienta", "mejora este proyecto", "añade esta función", "arregla este problema", "diseña este sistema", "antes de construir piensa bien el plan". El objetivo es evitar que Claude se lance a ejecutar sin pensar: primero entender, planificar, detectar riesgos, definir criterios de calidad, y solo entonces construir. Si la tarea tiene más de un componente o podría salir mal de varias formas, usa esta skill. | `.claude/skills/superpowers/SKILL.md` |
| web-scrolling | "Genera una web profesional de una sola página con animaciones de scroll, parallax y diseño premium. Usa esta skill siempre que el usuario quiera crear una web, landing page, página de negocio, portfolio, o cualquier sitio web estático. Triggers: 'hazme una web', 'crea una web', 'web para mi negocio', 'landing page', 'necesito una página web', 'web para restaurante/clínica/gimnasio/estudio/peluquería', 'web con efectos', 'web con animaciones', 'web profesional', 'diseño web', 'quiero una web', 'página para mi empresa', 'sitio web'." | `.claude/skills/web-scrolling/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Generated by GSD from session_analysis. Run `/gsd-profile-user` to update.

| Dimension | Rating | Confidence |
|-----------|--------|------------|
| Communication | detailed-structured | HIGH |
| Decisions | fast-intuitive | MEDIUM |
| Explanations | concise | LOW |
| Debugging | diagnostic | MEDIUM |
| UX Philosophy | design-conscious | HIGH |
| Vendor Choices | opinionated | MEDIUM |
| Frustrations | instruction-adherence | LOW |
| Learning | example-driven | LOW |

**Directives:**

- **Communication:** Match a detailed-structured workflow: when the developer sends a numbered, sectioned brief, mirror that structure, read the named files first, restate scope, and confirm before applying. Honor explicit scope limits like 'no toques el diseño' literally.
- **Decisions:** Move quickly once the developer picks a direction; do not pad responses with extra option comparisons unless asked. When they reference an option label (e.g. 'Opción C'), execute that path directly.
- **Explanations:** Give a brief summary of the approach and any key decision (especially diagnoses or migrations) alongside the code, then stop. Avoid long conceptual lectures. Ask if more detail is wanted -- this preference is inferred from limited evidence.
- **Debugging:** When the developer reports a bug, diagnose the root cause first and state it briefly, then apply the fix in the same turn. Pair every fix with a one-line explanation of what was actually wrong.
- **UX Philosophy:** Treat UI fidelity and visual consistency as load-bearing. Match exact spacing, radius, color, and hover/transition specs when given; keep sibling components visually consistent; and when a reference design is provided, reproduce it faithfully rather than approximating.
- **Vendor Choices:** Use the libraries the developer names and respect his per-context tool choices; do not swap them out. Prefer zero-install or already-bundled options and flag any new dependency before adding it.
- **Frustrations:** Follow stated specs and reference designs exactly; when the developer says 'aplicalo tal cual' or 'solo X, no toques Y', treat it as a hard boundary and change nothing outside it. Low evidence -- confirm scope if a requested change risks touching adjacent code.
- **Learning:** When implementing, locate and mirror the existing in-repo pattern the developer references rather than introducing a new approach or explaining from first principles. Confirm which existing example to model on if more than one fits.

<!-- GSD:profile-end -->
