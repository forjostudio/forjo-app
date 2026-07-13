# Convenciones de Código

**Fecha de análisis:** 2026-06-15

Proyecto: SaaS multi-tenant de turnos sobre **Next.js 16** (App Router) + **TypeScript** + **Supabase**. Stack de UI: shadcn/ui sobre Base UI, Tailwind v4, `react-hook-form` + `zod`, `sonner` para toasts, `date-fns` para fechas, `recharts` para gráficos. Sin Prettier configurado: el formato lo gobierna ESLint (`eslint-config-next`) y el estilo manual del equipo.

## Patrones de Naming

**Archivos:**
- Rutas y páginas: kebab-case según convención de App Router. Páginas de servidor en `page.tsx`; su contraparte cliente en `[seccion]-client.tsx` (ej. `app/(dashboard)/clients/page.tsx` + `clients-client.tsx`).
- Route handlers de API: siempre `route.ts` bajo `app/api/.../route.ts`.
- Módulos de `lib/`: kebab-case (`lib/google-calendar.ts`, `lib/plan-limits.ts`, `lib/use-terminology.tsx`).
- Componentes UI: kebab-case (`components/ui/button.tsx`, `components/dashboard/plan-banner.tsx`).

**Funciones:**
- camelCase para funciones y helpers (`timeToMinutes`, `createAdminClient`, `verifyRecaptcha`, `fichaNum`, `fmtSince`).
- Componentes React en PascalCase como default o named export (`ClientsPage`, `RegisterPage`, `ClientsClient`).
- Handlers HTTP exportados con el verbo en mayúscula que exige Next (`export async function POST(...)`, `GET`, etc.).

**Variables:**
- camelCase para variables locales (`requireDeposit`, `expiredHoldIds`, `reqStart`).
- UPPER_SNAKE_CASE para constantes a nivel de módulo (`SENTINEL`, `STATUS_DOT`, `FILTER_TABS`, `ALL_LETTERS`).
- Columnas de base de datos en snake_case (`business_id`, `client_name`, `expires_at`); se reflejan tal cual en los objetos que vienen de Supabase. La capa TS NO renombra a camelCase.

**Tipos:**
- `interface` PascalCase para entidades de dominio en `lib/types.ts` (`Business`, `Location`, `Client`, `Appointment`).
- `type` PascalCase para uniones y derivados locales (`StatusKey`, `FilterKey`, `FormData = z.infer<typeof schema>`).
- Campos de tipo en snake_case para coincidir con la fila de DB; opcionales marcados con `?` y `| null` cuando la columna es nullable.

## Estilo de Código

**Formato:**
- Sin Prettier ni `.editorconfig`. Estilo de facto observado:
  - **Sin punto y coma** al final de sentencias (ASI). Mantener.
  - Comillas **simples** en TS/TSX (`'use client'`, imports). Las comillas dobles aparecen solo en `lib/utils.ts` (residuo de scaffolding shadcn); preferir simples en código nuevo.
  - Indentación de 2 espacios.
- `tsconfig.json`: `"strict": true`, `target: ES2017`, `moduleResolution: bundler`, `jsx: react-jsx`.

**Linting:**
- `eslint.config.mjs` (flat config) compone `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`.
- Script: `npm run lint` (ejecuta `eslint`).
- No hay reglas custom más allá del preset de Next. Respetar reglas de Core Web Vitals (ej. usar `next/image`, `next/link`).

## Organización de Imports

**Orden observado (de facto, no forzado por linter):**
1. APIs de Next / React (`next/server`, `next/navigation`, `next/headers`, `react`).
2. Librerías de terceros (`date-fns`, `sonner`, `react-hook-form`, `zod`, `lucide-react`, `recharts`).
3. Internos por alias `@/` (`@/lib/...`, `@/components/...`).

**Alias de paths:**
- Único alias: `@/*` → raíz del repo (definido en `tsconfig.json`). Usar SIEMPRE `@/lib/...`, `@/components/...`; evitar rutas relativas profundas.

## Manejo de Errores

**Route handlers de API** (`app/api/**/route.ts`) — patrón canónico, ver `app/api/booking/create/route.ts`:
- Respuestas con `Response.json({ ok: boolean, ... }, { status })`. Forma estable: `{ ok: true, ... }` en éxito; `{ ok: false, error: '<codigo_snake>' }` en falla.
- Códigos de error como strings cortos en snake_case: `'bad_request'`, `'missing_fields'`, `'not_found'`, `'invalid_service'`, `'slot_taken'`, `'recaptcha_failed'`, `'insert_failed'`.
- Status HTTP coherentes: 400 (validación), 403 (reCAPTCHA), 404 (no existe), 409 (conflicto/slot tomado), 500 (insert/server).
- Parseo defensivo del body: `try { raw = await request.json() } catch { return 400 }`, luego narrowing manual con `typeof body.x === 'string' ? ... : default`. No se confía en el shape del cliente.
- **Anti-tampering de tenant:** toda entidad referenciada (service, professional, location) se re-valida con `.eq('business_id', business.id)` antes de usarse. Nunca confiar en IDs que llegan del cliente.
- **Errores de Postgres traducidos a dominio:** se inspecciona `insertErr?.code` (ej. `'23505'`, `'23P01'`) y se mapea a `'slot_taken'` (409). Patrón a replicar ante constraints/índices.
- Logging de fallas server-side con prefijo de módulo: `console.error('[booking/create] insert error:', ...)`.

**Trabajo diferido / best-effort:**
- Efectos secundarios no críticos (emails, evento de Google Calendar) se ejecutan con `after()` de `next/server` para no demorar la respuesta. Cada uno envuelto en `try/catch` propio; si falla, se loguea y el flujo principal NO se rompe.

**Cliente (componentes `'use client'`):**
- `fetch` a la API + chequeo de `ok`; feedback con `toast` de `sonner` (`toast.error(...)`, `toast.success(...)`).
- Validación de formularios con `zod` + `zodResolver` (`@hookform/resolvers/zod`); errores inline vía `formState.errors` (ver `app/(auth)/register/page.tsx`).
- Estados de carga con `const [loading, setLoading] = useState(false)` para deshabilitar botones y evitar doble submit.

## Logging

**Framework:** `console` nativo (no hay logger estructurado).

**Patrones:**
- Solo `console.error` para fallas; prefijo `[modulo/accion]` (ej. `[booking/create]`, `[cancel]`). Extraer mensaje seguro: `e instanceof Error ? e.message : e`.
- Evitar `console.log` en API de producción (uso casi nulo en `app/api`).

## Comentarios

**Cuándo comentar:**
- Comentarios densos en **español** explicando el *por qué* de decisiones no obvias: carreras/concurrencia, constraints de DB, aislamiento por tenant, fail-closed de reCAPTCHA, uso de `after()`. Ver el bloque de cabecera de `app/api/booking/create/route.ts`.
- Secciones dentro de archivos grandes se separan con barras Unicode: `// ── Constants ───────`, `// ── Helpers ───────`.
- En `lib/types.ts` cada campo no trivial lleva comentario explicando semántica/origen (ej. `whatsapp` normalizado a `wa.me`, `google_refresh_token` secreto nunca al cliente).

**JSDoc/TSDoc:** No se usa. La documentación vive en comentarios de línea en español.

## Diseño de Funciones

**Tamaño:** Helpers chicos y puros arriba del archivo (`timeToMinutes`, `fmtSince`, `getApptPrice`). Los route handlers pueden ser largos (lineales, paso a paso) priorizando legibilidad del flujo sobre fragmentación.

**Parámetros:**
- Funciones de varios argumentos relacionados reciben **un objeto** con desestructuración (ej. `sendPendingPaymentEmail({ to, clientName, service, ... })`, `verifyRecaptcha({ token, slug })`). Preferir este patrón para >2 params.

**Valores de retorno:**
- API: siempre `Response.json(...)`.
- Helpers de validación devuelven objetos discriminados `{ ok: boolean, reason?: ... }`.

## Diseño de Módulos

**Exports:**
- Páginas: `export default async function`.
- Helpers de `lib/` y componentes: named exports (`export function createAdminClient()`, `export function cn()`).

**Patrón de página (Server Component) → cliente:**
- `page.tsx` es Server Component async: obtiene `supabase = await createClient()`, valida sesión con `supabase.auth.getUser()` → `redirect('/login')` si no hay user, obtiene `business` por `owner_id`, carga datos en paralelo con `Promise.all([...])` y pasa props al componente cliente. Ver `app/(dashboard)/clients/page.tsx`.
- Toda query del dashboard filtra por `.eq('business_id', business.id)` (aislamiento por tenant). Nunca omitir.

**Clientes de Supabase (no mezclar):**
- `@/lib/supabase/server` → `createClient()` async, anon key + cookies, para Server Components/acciones autenticadas (RLS activo).
- `@/lib/supabase/client` → cliente de navegador para componentes `'use client'`.
- `@/lib/supabase/admin` → `createAdminClient()`, **service role**, server-only, bypassa RLS. Usar SOLO en route handlers donde el aislamiento se garantiza manualmente por slug/`business_id` (ej. booking público).
- `@/lib/supabase/middleware` → `updateSession`, refresh de sesión en `proxy.ts`.

**Barrel files:** No se usan. Imports directos a cada módulo.

**Constantes de dominio compartidas:** Centralizar en `lib/` (`lib/plans.ts`, `lib/theme-config.ts`, `lib/verticals.ts`). No hardcodear montos de planes ni colores: leerlos de la fuente de configuración.

---

*Análisis de convenciones: 2026-06-15*
