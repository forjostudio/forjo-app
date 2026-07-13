# Estructura del codebase

**Fecha de análisis:** 2026-06-15

## Layout de directorios

```
forjo-app/
├── app/                      # App Router (Next.js 16): rutas, layouts, API
│   ├── (auth)/               # Route group: login, register
│   ├── (dashboard)/          # Route group: panel del dueño (rutas protegidas)
│   ├── (onboarding)/         # Route group: alta de negocio
│   ├── [slug]/               # Booking público por negocio (dinámico)
│   ├── api/                  # Route handlers server-side
│   ├── cancelar/[token]/     # Cancelación de turno por token (público)
│   ├── layout.tsx            # Layout raíz (fuentes, theme, toaster)
│   └── page.tsx              # Home / landing del SaaS
├── components/               # Componentes React reutilizables
│   ├── ui/                   # Primitivas shadcn/base-ui (button, card, dialog…)
│   ├── dashboard/            # Componentes del panel (sidebar, banners, paneles)
│   └── booking/              # Componentes del flujo de reserva pública
├── lib/                      # Lógica de dominio y wrappers de integración
│   └── supabase/             # Factories de cliente Supabase por contexto
├── proxy.ts                  # Middleware Edge (Next 16: se llama proxy, no middleware)
├── vercel.json               # Config de Vercel (cron diario)
├── next.config.ts            # Config de Next.js
├── components.json           # Config de shadcn
└── tsconfig.json             # TypeScript (alias @/* → raíz)
```

## Propósito de cada directorio

**`app/`:**
- Propósito: ruteo, layouts, páginas y route handlers (App Router).
- Contiene: route groups por superficie, ruta pública dinámica `[slug]`, y `api/`.
- Archivos clave: `app/layout.tsx`, `app/(dashboard)/layout.tsx`, `app/[slug]/page.tsx`.

**`app/(dashboard)/`:**
- Propósito: panel admin del dueño (protegido por sesión).
- Contiene: una carpeta por sección — `dashboard`, `appointments`, `agenda`, `clients`, `clinical-history`, `consultorios`, `equipo`, `finances`, `negocio`, `servicios`, `settings`.
- Patrón por sección: `page.tsx` (server, fetch + auth) y `*-client.tsx` (interactividad), p. ej. `clients/page.tsx` + `clients/clients-client.tsx`.

**`app/[slug]/`:**
- Propósito: página pública de reserva del negocio identificado por slug.
- Contiene: `page.tsx` (server, datos públicos acotados), `booking-client.tsx` (UI de reserva), `layout.tsx` (metadata/paleta), y subrutas `pago/*` y `turno/[token]`.

**`app/api/`:**
- Propósito: route handlers server-side.
- Subgrupos: `booking/` (availability, create), `payment/` (create, retry, webhook), `subscription/` (create, cancel, status, webhook), `mercadopago/` (OAuth), `google/` (OAuth + sync), `notify/`, `cron/`, `recaptcha/`, `admin/`.
- Cada endpoint vive en `<ruta>/route.ts`.

**`components/`:**
- Propósito: componentes reutilizables.
- `ui/`: primitivas de diseño (shadcn / base-ui). `dashboard/`: chrome del panel. `booking/`: vistas del flujo público.

**`lib/`:**
- Propósito: lógica framework-agnostic e integraciones.
- Archivos clave: `verticals.ts`, `use-terminology.tsx`, `plans.ts`, `plan-limits.ts`, `types.ts`, `mercadopago.ts`, `payment.ts`, `email.ts`, `google-calendar.ts`, `recaptcha.ts`, `whatsapp.ts`, `theme-config.ts`, `dashboard-widgets.ts`, `utils.ts`.

**`lib/supabase/`:**
- Propósito: un factory de cliente por contexto de acceso.
- Archivos: `server.ts` (sesión, RLS), `client.ts` (browser), `public.ts` (anon server), `admin.ts` (service role), `middleware.ts` (`updateSession`).

## Ubicaciones de archivos clave

**Entry points:**
- `app/layout.tsx`: layout raíz (fuentes, theme, toaster).
- `proxy.ts`: middleware Edge (refresh de sesión + guards).
- `app/(dashboard)/layout.tsx`: shell del panel (sesión, negocio, vertical, sidebar).
- `app/[slug]/page.tsx`: entrada del booking público.

**Configuración:**
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`.
- `vercel.json`: cron de limpieza (`/api/cron/cancel-expired`, diario).
- `components.json`: config de shadcn.

**Lógica core:**
- `lib/verticals.ts`: configuración de rubros (terminología, menú, features).
- `lib/supabase/*`: acceso a datos por contexto.
- `app/api/booking/create/route.ts`: creación de turno público (validación + tenant).
- `app/api/payment/webhook/[slug]/route.ts`: confirmación async de pagos.

**Tipos:**
- `lib/types.ts`: interfaces de dominio (`Business`, `PublicBusiness`, etc.).

## Convenciones de nombres

**Archivos:**
- Páginas y handlers del App Router: `page.tsx`, `layout.tsx`, `route.ts` (convención de Next 16).
- Componentes client co-ubicados de una página: `<seccion>-client.tsx` (ej. `finances-client.tsx`).
- Componentes y libs: `kebab-case.tsx` / `kebab-case.ts` (ej. `plan-banner.tsx`, `google-calendar.ts`).

**Directorios:**
- Route groups entre paréntesis: `(auth)`, `(dashboard)`, `(onboarding)` (no afectan la URL).
- Segmentos dinámicos entre corchetes: `[slug]`, `[token]`.
- Secciones del dashboard en inglés a nivel de ruta; algunas en español por rebrand (`negocio`, `servicios`, `equipo`, `consultorios`).

## Dónde agregar código nuevo

**Nueva sección del dashboard:**
- Página: `app/(dashboard)/<seccion>/page.tsx` (server component, validar sesión + negocio, filtrar por `business_id`).
- Interactividad: `app/(dashboard)/<seccion>/<seccion>-client.tsx`.
- Agregar el item al menú del/los vertical(es) correspondiente(s) en `lib/verticals.ts` y al `Sidebar` (`components/dashboard/sidebar.tsx`).

**Nuevo endpoint server-side:**
- `app/api/<area>/<accion>/route.ts`. Usar `lib/supabase/admin.ts` solo si hace falta service role; resolver el tenant explícitamente y filtrar por `business_id`.

**Nuevo componente:**
- Primitiva de diseño → `components/ui/`. Panel → `components/dashboard/`. Booking → `components/booking/`.

**Nueva lógica de dominio o integración:**
- `lib/<nombre>.ts` (mantener framework-agnostic si se usa en server y client, como `lib/verticals.ts`).

**Nuevo cliente Supabase:** no crear uno nuevo; usar el factory correcto en `lib/supabase/` según el contexto de acceso.

## Directorios especiales

**`.next/`:**
- Propósito: build de Next.js. Generado: Sí. Commiteado: No.

**`.planning/` y `.claude/`:**
- Propósito: tooling de GSD y artefactos de planificación/skills. Commiteado: ignorado (ver `.gitignore`).

**`Forjo Studio-handoff/`:**
- Propósito: assets de rebrand/diseño (favicons, screenshots, uploads). Generado: No (assets de diseño).

**`.vercel/`:**
- Propósito: metadata de proyecto de Vercel. Commiteado: No.

---

*Análisis de estructura: 2026-06-15*
