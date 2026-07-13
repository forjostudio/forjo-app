# Stack Tecnológico

**Fecha de análisis:** 2026-06-15

## Lenguajes

**Primario:**
- TypeScript `^5` — todo el código de la app (`app/`, `lib/`, `components/`, `proxy.ts`). `strict: true` activado en `tsconfig.json`.

**Secundario:**
- SQL (PostgreSQL) — esquema y migraciones en `supabase/migrations/*.sql` y `supabase/schema.sql`.
- CSS — estilos globales y tokens de diseño en `app/globals.css` (Tailwind v4 con `@tailwindcss/postcss`).

## Runtime

**Entorno:**
- Node.js (sin versión fijada: no hay `.nvmrc` ni `.node-version`). Despliegue en Vercel.
- Edge Runtime para el middleware: `proxy.ts` corre `updateSession` sobre rutas conocidas (incluidas todas las `/api/*`).

**Gestor de paquetes:**
- npm (lockfile `package-lock.json` presente).
- Lockfile: presente.

## Frameworks

**Core:**
- Next.js `16.2.7` (App Router) — NO es Next 14. Hay breaking changes respecto a versiones viejas (APIs, convenciones, estructura). Consultar `node_modules/next/dist/docs/` antes de asumir comportamiento. El middleware se llama `proxy.ts` (raíz), no `middleware.ts`.
- React `19.2.4` + React DOM `19.2.4` — React Server Components activados (`rsc: true` en `components.json`).

**UI:**
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

**Formularios y validación:**
- `react-hook-form` `^7.77.0` + `@hookform/resolvers` `^5.4.0`.
- `zod` `^4.4.3` — esquemas de validación.

**Fechas:**
- `date-fns` `^4.4.0`. La app maneja zona fija de Argentina (`America/Argentina/Buenos_Aires`, UTC-3 sin DST).

**Testing:**
- No detectado. No hay framework de tests (jest/vitest/playwright) ni archivos `*.test.*` / `*.spec.*` en el repo.

**Build/Dev:**
- ESLint `^9` + `eslint-config-next` `16.2.7` (config en `eslint.config.mjs`).
- `next-env.d.ts` autogenerado; `tsconfig.tsbuildinfo` para builds incrementales.

## Dependencias clave

**Críticas:**
- `@supabase/supabase-js` `^2.106.2` — cliente Postgres/Auth (admin y público).
- `@supabase/ssr` `^0.10.3` — clientes Supabase con cookies para SSR (server, browser, middleware).
- `next` `16.2.7` — framework completo (App Router, route handlers, RSC).

**Integraciones externas:**
- `resend` `^6.12.4` — emails transaccionales (aunque `lib/email.ts` hace POST crudo a `api.resend.com`, no usa el SDK).
- `@anthropic-ai/sdk` `^0.100.1` — sugerencias/clasificación con IA (modelo `claude-haiku-4-5`). Degrada elegante sin API key.
- MercadoPago — sin SDK; se llama vía `fetch` directo a `api.mercadopago.com` (ver `lib/mercadopago.ts`, `lib/payment.ts`).
- Google Calendar — sin SDK; OAuth + REST vía `fetch` (ver `lib/google-calendar.ts`).
- reCAPTCHA v3 — verificación vía `fetch` a `google.com/recaptcha/api/siteverify` (ver `lib/recaptcha.ts`).

## Configuración

**Entorno:**
- Variables en `.env.local` (presente en raíz — contiene configuración de entorno; NO se leyó su contenido).
- Toggle de entornos MercadoPago: `MP_MODE` (`test` | `production`, default `production`).
- Variables públicas con prefijo `NEXT_PUBLIC_` (URL de app, Supabase URL/anon key, reCAPTCHA site key, plans unlimited).
- Secretos server-only: service role key de Supabase, tokens de MercadoPago, client secrets de Google/MP, API keys de Resend/Anthropic, secretos de cron/admin.

**Build:**
- `next.config.ts` — configuración mínima (sin opciones custom).
- `postcss.config.mjs` — pipeline de Tailwind v4.
- `vercel.json` — cron diario (`0 3 * * *`) a `/api/cron/cancel-expired`. Vercel Hobby NO permite crons más frecuentes que diario.
- `tsconfig.json` — alias de import `@/*` → raíz del proyecto.

**Archivos sensibles presentes (no leídos):**
- `.env.local` — configuración de entorno.
- `client_secret_*.apps.googleusercontent.com.json` — credenciales OAuth de Google (en raíz; verificar que esté en `.gitignore`).

## Requisitos de plataforma

**Desarrollo:**
- Windows + VS Code + Claude Code. Terminal PowerShell (sintaxis distinta a bash).
- Node.js + npm. Supabase como Postgres (local o remoto).

**Producción:**
- Vercel (`gestion.forjo.studio`). DNS en Cloudflare con wildcard. Org de GitHub: `forjostudio`.
- Plan Vercel Hobby: límite de cron a una ejecución diaria.

---

*Análisis de stack: 2026-06-15*
