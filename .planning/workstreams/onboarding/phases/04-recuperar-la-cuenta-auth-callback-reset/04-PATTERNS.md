# Phase 4: Recuperar la cuenta (`/auth/callback` + reset) - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 11 (6 a crear · 5 a modificar · + config externa)
**Analogs found:** 8 / 11 (3 sin analog — ver §No Analog Found)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/auth/callback/route.ts` | route handler | request-response (redirect) | `app/api/google/callback/route.ts` | **estilo: exacto · función: parcial** |
| `lib/auth/callback.ts` | utility (puro) | transform | `lib/crm-reports.ts` / `lib/crm-pipeline.ts` | role-match |
| `lib/auth/callback.test.ts` | test | transform | `lib/crm-reports.test.ts` | exact |
| `test/proxy-auth-routes.test.ts` | test (regresión) | transform | — | **NO ANALOG** |
| `app/(auth)/(split)/layout.tsx` | layout | request-response | `app/(auth)/login/page.tsx:48-82` (fuente del markup) | **NO ANALOG estructural** |
| `app/(auth)/(split)/forgot-password/page.tsx` | page (client) | request-response | `app/(auth)/register/page.tsx` (form) | role-match |
| `app/(auth)/(split)/reset-password/page.tsx` | page (client) | request-response | `app/(auth)/register/page.tsx` (`.refine()`) | role-match |
| `app/(auth)/login/page.tsx` → `(split)/login/page.tsx` | page (client) | request-response | sí mismo (`git mv` + extracción) | self |
| `app/(auth)/register/page.tsx` | page (client) | request-response | sí mismo (D-12 cambia solo `onSubmit`) | self |
| `proxy.ts` | middleware (Edge) | request-response | sí mismo (2 listas) | self |
| `supabase/config.toml` | config | — | sí mismo | self |

**Estado "form → confirmación" (D-02/D-12) y cooldown 60s (D-05):** no existe analog directo. Ver §No Analog Found.

---

## Pattern Assignments

### `app/auth/callback/route.ts` (route handler, request-response)

**Analog:** `app/api/google/callback/route.ts` — **NO es modelo funcional** (es OAuth de integración), **SÍ es el modelo de estilo exacto**: mismo shape (GET → parse → validar → canjear → redirect), misma closure `fail()`, mismo logging.

**Imports pattern** (`app/api/google/callback/route.ts:1-3`):
```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode } from '@/lib/google-calendar'
```
→ Copiar tal cual, cambiando la 3ª línea por `import { parseCallbackParams, resolveDestination } from '@/lib/auth/callback'`.
**`@/lib/supabase/server` es el import correcto y ya está probado en este archivo.** Nunca `@/lib/supabase/admin`.

**Comentario de cabecera** (`google/callback/route.ts:5-6`) — el repo documenta el *por qué* del handler en español, arriba del `export`:
```typescript
// Callback del OAuth: valida el state (cookie), canjea el code por el refresh_token y lo
// guarda en el negocio del dueño logueado. Vuelve a /agenda con ?google=connected|error.
export async function GET(request: NextRequest) {
```

**Closure `fail()` + guard clause temprano** (`google/callback/route.ts:14-20`) — **el patrón exacto que pide D-18** (un solo destino de error, sin ramas dispersas):
```typescript
const fail = () => {
  const r = NextResponse.redirect(`${base}/agenda?google=error`)
  r.cookies.delete('g_oauth_state')
  return r
}

if (!code || !state || !saved || state !== saved) return fail()
```
→ Espejar con `INVALID_LINK_DEST` de `lib/auth/callback.ts` y `303` + `Referrer-Policy: no-referrer`.

**Error handling / logging** (`google/callback/route.ts:40-46`) — prefijo `[modulo/accion]`, **solo el `.message`, nunca la URL**:
```typescript
const { error } = await supabase
  .from('business_secrets')
  .upsert({ business_id: biz.id, google_refresh_token: tokens.refresh_token }, { onConflict: 'business_id' })
if (error) {
  console.error('[google/callback] guardar token falló:', error.message)
  return fail()
}
```
→ `console.error('[auth/callback] verifyOtp:', error.message)` (RESEARCH Pitfall 3: loguear `request.url` filtraría el `token_hash`).

**Divergencia obligatoria del analog** (el analog usa un patrón que esta fase NO debe copiar):
| El analog hace | Phase 4 debe hacer | Por qué |
|---|---|---|
| `NextResponse.redirect(\`${base}/...\`)` con `base` de `NEXT_PUBLIC_APP_URL` (L:8) | `new URL(dest, request.url)` | RESEARCH §Pattern 1. `request.url` no depende de una env var. |
| redirect con status default (307) | **`303` explícito** | 307 preserva el método; el navegador **debe** hacer GET (RESEARCH, `redirect.md:212-214`) |
| — | `res.headers.set('Referrer-Policy', 'no-referrer')` | Pitfall 3, capa 3 |

**Cliente Supabase — `lib/supabase/server.ts:11-26`** sirve tal cual (su `setAll` persiste las cookies que crea `verifyOtp`; en route handler `cookies()` es escribible → el `catch` de L:20-22 no dispara):
```typescript
cookies: {
  getAll() { return cookieStore.getAll() },
  setAll(cookiesToSet) {
    try {
      cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    } catch {
      // Server component — cookies set via middleware
    }
  },
},
```
→ **No escribir un cliente nuevo.**

---

### `lib/auth/callback.ts` (utility puro, transform)

**Analog:** `lib/crm-reports.ts` / `lib/crm-pipeline.ts` — módulos puros de `lib/`, named exports, sin Supabase ni `next/headers`, consumidos por route handlers/páginas y testeados con Vitest sin red. Es el patrón que RESEARCH §"Pieza testeable" nombra explícitamente.

**Convenciones a heredar:**
- Named exports (`export function parseCallbackParams`), nunca default.
- Constantes de módulo en `UPPER_SNAKE_CASE` (`ALLOWED_TYPES`, `DESTINATIONS`, `INVALID_LINK_DEST`).
- Retorno discriminado `{ ok: true, ... } | { ok: false }` — el patrón de helpers de validación del repo (`lib/booking-core.ts`, `lib/recaptcha.ts`).
- Secciones con barras Unicode (`// ── Helpers ────`) y comentarios en español explicando el *por qué*.

**El código concreto ya está escrito en RESEARCH §Code Examples** (`04-RESEARCH.md:907-939`) — el planner lo copia de ahí, no lo reinventa.

---

### `lib/auth/callback.test.ts` (test, transform)

**Analog:** `lib/crm-reports.test.ts` — **exacto**: test puro, sin creds, sin `skipIf`, fixtures locales.

**Imports + estructura** (`lib/crm-reports.test.ts:1-8`):
```typescript
import { describe, it, expect } from 'vitest'
import { mrrByPlan, arpa, funnel, churn, ranking, computeSnapshotRows } from '@/lib/crm-reports'
import type { BizRow } from '@/lib/crm-reports'
import { STAGES } from '@/lib/crm-pipeline'

// ── Fixtures ────────────────────────────────────────────────────────
// `now` fijo para determinismo (Pitfall 5: zona AR). 2026-06-18T12:00:00Z = mediodía UTC.
const NOW = new Date('2026-06-18T12:00:00.000Z')
```
→ Alias `@/`, `describe`/`it` en español, comentario que ancla el *por qué* a un Pitfall del RESEARCH.

**⚠ Contraste deliberado con `test/booking-public-regression.test.ts:20`** — ese archivo abre con:
```typescript
describe.skipIf(!hasSupabaseCreds)('booking público: no-regresión del core (rama seña)', () => {
```
**Los tests de esta fase NO deben usar `skipIf(!hasSupabaseCreds)` ni `test/env.ts`**: eso es la marca de un test que toca Supabase. `vitest.setup.ts:13` → `config({ path: '.env.local' })` = **PROD** (H-06). Un test de auth que toque red **crea usuarios en producción**. **Piezas puras, o nada.** El test correcto se parece a `crm-reports.test.ts`, no a `booking-public-regression.test.ts`.

**Test concreto ya escrito en RESEARCH §Code Examples** (`04-RESEARCH.md:943-975`).

---

### `app/(auth)/(split)/layout.tsx` (layout, request-response)

**Analog estructural: NINGUNO** — ver §No Analog Found. **Fuente del markup: `app/(auth)/login/page.tsx:48-82`** (se **extrae**, no se reescribe — D-07).

**Bloque a mover tal cual** (`login/page.tsx:48-82`), incluidos **los tres comentarios** (explican decisiones no obvias que se perderían en un rewrite):
```tsx
<div className="min-h-screen flex items-stretch bg-background text-foreground">
  {/* Panel izquierdo Bauhaus — bg-primary + formas geométricas (oculto en mobile) */}
  <div className="hidden md:flex flex-1 relative overflow-hidden bg-primary text-primary-foreground p-12 flex-col justify-between">
    <svg className="absolute inset-0 w-full h-full opacity-90" viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="420" cy="120" r="90" fill="rgba(255,255,255,.10)" />
      <rect x="60" y="430" width="120" height="120" fill="rgba(0,0,0,.12)" />
      <path d="M360 480 L470 480 L470 590 Z" fill="rgba(255,255,255,.08)" />
      <rect x="300" y="300" width="50" height="50" fill="rgba(255,255,255,.12)" />
    </svg>
    {/* Variante crema FULL y FIJA, sin swap dark/light: el panel es siempre bg-primary (naranja
        saturado de marca), así que nunca hay fondo claro posible. Va la "full" y no la crema
        bicolor (la de register): en esa, "gestión" es gris/topo — pensado para fondo neutro
        oscuro — y sobre el naranja se pierde. La full lleva "forjo" Y "gestión" en crema. */}
    <div className="relative">
      <Image src="/brand/forjo-gestion-lockup-crema-full.png" alt="Forjo Gestión" width={781} height={190} priority className="h-10 w-auto" />
    </div>
    <h2 className="relative font-[family-name:var(--font-heading)] font-black uppercase leading-none tracking-tight text-[clamp(30px,4vw,46px)]">
      Tu agenda,<br />clientes y<br />finanzas en<br />un solo lugar.
    </h2>
    {/* Crédito "hecho con Forjo Studio" — mismo copy/link que el footer de la página de reservas
        (app/[slug]/booking-client.tsx). El estilo NO se copia: aquel vive sobre fondo neutro y usa
        text-muted-foreground/foreground; acá el panel es bg-primary, así que va opacidad sobre
        primary-foreground. Sin la marca F del original: su rect rojo se pierde sobre el naranja. */}
    <p className="relative text-sm opacity-80">
      hecho con{' '}
      <a href="https://www.forjo.studio" target="_blank" rel="noopener noreferrer"
         className="font-[family-name:var(--font-archivo)] opacity-100 hover:opacity-80 transition-opacity">
        <span className="font-semibold">Forjo</span> Studio
      </a>
    </p>
  </div>

  {/* Columna derecha — formulario */}
  <div className="w-full md:w-[440px] flex items-center justify-center p-8 sm:p-10">
    <div className="w-full max-w-[340px]">
      {children}   {/* ← el único cambio: las páginas aportan solo el form */}
    </div>
  </div>
</div>
```
**El `<h2>` queda hard-coded en el layout** (D-08: el panel es identidad de marca, no copy contextual → las 3 pantallas dicen lo mismo).
**El layout es Server Component** (no lleva `'use client'`): no tiene interactividad. Solo `Image` de `next/image`. Las páginas hijas siguen siendo `'use client'`.

**Analog de layout que existe (para el shape del archivo):** `app/(dashboard)/layout.tsx:11` — `export default async function DashboardLayout({ children }: { children: React.ReactNode })`. **Solo se copia la firma**, no la lógica (el split layout no consulta Supabase ni tiene guards).

---

### `app/(auth)/(split)/forgot-password/page.tsx` (page client, request-response)

**Analog:** `app/(auth)/register/page.tsx` (form + zod + rhf) y `app/(auth)/login/page.tsx:87-123` (la columna del form del split).

**Imports pattern** (`login/page.tsx:1-14`) — el set exacto para una página de auth con form:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
```
→ **`Image` sale** (lo toma el layout). **`toast` probablemente también** (D-02/Pitfall 4: no hay error que mostrar en el camino feliz).

**Schema + tipo** (`login/page.tsx:16-21`):
```typescript
const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormData = z.infer<typeof schema>
```
→ `/forgot-password` = solo el campo `email`, mismo mensaje `'Email inválido'`.

**Setup del form** (`login/page.tsx:24-30`):
```typescript
const router = useRouter()
const [loading, setLoading] = useState(false)
const supabase = createClient()

const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
  resolver: zodResolver(schema),
})
```

**Campo + error inline + botón con loading** (`login/page.tsx:90-116`) — el markup exacto a espejar:
```tsx
<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" placeholder="tu@email.com" {...register('email')} />
    {errors.email && (
      <p className="text-destructive text-sm">{errors.email.message}</p>
    )}
  </div>
  <Button type="submit" className="w-full" disabled={loading}>
    {loading ? 'Ingresando...' : 'Entrar'}
  </Button>
</form>
```

**Encabezado de la columna del form** (`login/page.tsx:87-88`) — el patrón h1+subtítulo que D-09 replica:
```tsx
<h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Iniciá sesión</h1>
<p className="text-muted-foreground text-sm mt-1.5 mb-6">Entrá a tu panel de Forjo Gestión</p>
```
→ D-09: `Recuperá tu cuenta` + `Te mandamos un link para crear una contraseña nueva`.

**Link secundario bajo el form** (`login/page.tsx:118-123`) — el bloque donde D-04 inserta "¿Olvidaste tu contraseña?", y el modelo del "Volver al login" de D-02:
```tsx
<p className="text-center text-sm text-muted-foreground mt-5">
  ¿No tenés cuenta?{' '}
  <Link href="/register" className="text-primary font-medium hover:underline">
    Creá tu negocio
  </Link>
</p>
```

**⚠ Divergencia obligatoria — `onSubmit` NO copia el patrón del analog.** `login/page.tsx:32-45` hace `if (error) { toast.error(...); return }`. **`/forgot-password` NO puede tener esa rama** (Pitfall 4 / D-02 / D-14: cualquier rama sobre el resultado reintroduce el oráculo de enumeration). Forma correcta en `04-RESEARCH.md:585-588`.

---

### `app/(auth)/(split)/reset-password/page.tsx` (page client, request-response)

**Analog:** `app/(auth)/register/page.tsx` — **es el dueño del `.refine()` que D-03 espeja.**

**Schema con confirmación** (`register/page.tsx:17-26`) — **copiar quitando `email`**:
```typescript
const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>
```

**Los dos campos de contraseña** (`register/page.tsx:93-116`) — markup a copiar tal cual:
```tsx
<div className="space-y-2">
  <Label htmlFor="password">Contraseña</Label>
  <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
  {errors.password && (
    <p className="text-destructive text-sm">{errors.password.message}</p>
  )}
</div>
<div className="space-y-2">
  <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
  <Input id="confirmPassword" type="password" placeholder="••••••••" {...register('confirmPassword')} />
  {errors.confirmPassword && (
    <p className="text-destructive text-sm">{errors.confirmPassword.message}</p>
  )}
</div>
```

**Guard de sesión (Pitfall 5):** la página es `'use client'` → el guard va con `getUser()` en un `useEffect` + redirect a `INVALID_LINK_DEST`, **no** en el proxy. **No hay analog client-side de este guard en el repo** (todos los guards del repo son server: `(dashboard)/layout.tsx:15,23`). El planner lo diseña; anotarlo como pieza sin precedente.

**⚠ Orden en el submit** (RESEARCH §D-17): `updateUser({ password })` **primero**, `signOut({ scope: 'others' })` **después**.

---

### `app/(auth)/register/page.tsx` (MODIFICAR — D-12)

**El diff exacto ya está en `04-RESEARCH.md:979-997`.** Lo que el planner debe preservar del archivo actual:

**`useEffect` del `?plan=`** (`register/page.tsx:37-43`) — **NO TOCAR, no perder**:
```typescript
// Capture intended plan from landing CTAs (?plan=basic|studio|pro)
useEffect(() => {
  const plan = new URLSearchParams(window.location.search).get('plan')
  if (plan && ['basic', 'studio', 'pro'].includes(plan)) {
    localStorage.setItem('forjo_intended_plan', plan)
  }
}, [])
```

**Lo que muere** (`register/page.tsx:56-58`):
```typescript
toast.success('Cuenta creada. Revisá tu email para confirmarla.')
router.push('/onboarding')   // ← EL BUG (H-01: confirmación ON en prod → sin sesión → proxy rebota a /login)
router.refresh()
```
→ `setSent(data.email)`. **`router` y `useRouter` quedan huérfanos** tras el cambio → sacarlos o `eslint` (`core-web-vitals`) marca el unused.

**Lo que se conserva:** el card centrado (`register/page.tsx:62-79`), el lockup tinta/crema con swap y su comentario (L:65-71), el link "¿Ya tenés cuenta?" (L:121-126). **D-10: `/register` NO se mueve ni se rediseña.**

---

### `proxy.ts` (middleware Edge, request-response)

**Analog:** sí mismo. **Dos listas, dos ediciones distintas.**

**`MAINT_EXEMPT`** (`proxy.ts:19-21`) — D-21 suma `'/auth'`. El comentario que explica la lista hay que **extenderlo**, no borrarlo:
```typescript
// Rutas que NUNCA se cortan por mantenimiento: /api (webhooks de MercadoPago +
// crons) y /admin + /login para que el super-admin pueda entrar y apagar el switch.
const MAINT_EXEMPT = ['/api', '/admin', '/login']
```
El match de L:64 (`pathname === p || pathname.startsWith(p + '/')`) hace que `'/auth'` cubra `/auth/callback`. ✔

**`KNOWN_PREFIXES`** (`proxy.ts:40-55`) — D-22 suma `'/auth'`, `'/forgot-password'`, `'/reset-password'`. **El comentario de `/admin` (L:49-51) es el precedente exacto de por qué se agregan** — mismo modo de falla:
```typescript
const KNOWN_PREFIXES = [
  '/login',
  '/register',
  ...
  // CRM super-admin (Pitfall 3 / D3): sin este prefijo, /admin cae en el
  // NextResponse.next() de abajo y NO pasa por updateSession → la cookie de
  // sesion queda stale y getUser() en el layout puede devolver null intermitente.
  '/admin',
  '/api',
  '/_next',
]
```
→ Escribir un comentario del mismo estilo para el bloque nuevo, citando D-22.

---

### `lib/supabase/middleware.ts` — **NO MODIFICAR**

**`isAuthRoute`** (`lib/supabase/middleware.ts:31`):
```typescript
const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
```
**Esta línea NO se toca** (D-06 / D-22 / RESEARCH Pitfall 6). `isDashboardRoute` (L:32-42) tampoco matchea ninguna ruta nueva → **D-06 se preserva solo**.

**El plan debe decir explícitamente "NO TOCAR `isAuthRoute`"**, porque el reflejo de "agrego las rutas de auth a las listas de auth" toca las dos y rompe D-06 sin que nada falle en rojo (síntoma: con sesión abierta, `/forgot-password` tira al dashboard).

---

## Shared Patterns

### Elección del cliente Supabase por superficie
**Sources:** `lib/supabase/client.ts` · `lib/supabase/server.ts`
**Apply to:** todas las superficies de la fase

| Superficie | Import | Excerpt |
|---|---|---|
| `/forgot-password`, `/reset-password`, `/register` (client) | `@/lib/supabase/client` | `const supabase = createClient()` — sync, sin `await` (`login/page.tsx:26`) |
| `app/auth/callback/route.ts` (Node) | `@/lib/supabase/server` | `const supabase = await createClient()` — **async, con `await`** (`google/callback/route.ts:22`) |
| `lib/supabase/admin.ts` | **PROHIBIDO en esta fase** | RESEARCH §Anti-Patterns |

### Manejo de errores en route handlers
**Source:** `app/api/google/callback/route.ts:14-20,40-46`
**Apply to:** `app/auth/callback/route.ts`
- Closure `fail()` con **un solo** destino de error, definida arriba del flujo.
- Guard clauses tempranas (`if (!x) return fail()`), sin `else`.
- `console.error('[modulo/accion] qué falló:', error.message)` — **solo el message**.
- **Nunca `redirect()` de `next/navigation` en un route handler**: lanza `NEXT_REDIRECT` y no permite adjuntar headers. Precedente en el repo: comentario de `(dashboard)/layout.tsx:27-29` + memoria `confirmdialog-no-redirect-gotcha`.

### Comentarios que explican el *por qué* (convención dura del repo)
**Sources:** `login/page.tsx:57-60,67-70` · `proxy.ts:49-51` · `(dashboard)/layout.tsx:27-29` · `vitest.setup.ts:3-12`
**Apply to:** todos los archivos nuevos
Comentarios densos **en español**, ancla a la decisión (`D-xx`) o al Pitfall del RESEARCH, y explican la alternativa descartada. Secciones con barras Unicode (`// ── Fixtures ────`).

### Forms de auth
**Source:** `app/(auth)/login/page.tsx:16-30,89-117` · `app/(auth)/register/page.tsx:17-24`
**Apply to:** `/forgot-password`, `/reset-password`
`react-hook-form` + `zodResolver` · `Label` siempre visible + `Input` de `@/components/ui` · error inline `<p className="text-destructive text-sm">` · `useState(loading)` + `disabled={loading}` + texto que cambia (`{loading ? 'Ingresando...' : 'Entrar'}`).

### Tests puros
**Source:** `lib/crm-reports.test.ts:1-8`
**Apply to:** `lib/auth/callback.test.ts`, `test/proxy-auth-routes.test.ts`
`import { describe, it, expect } from 'vitest'` · alias `@/` · fixtures locales · **sin `skipIf`, sin `test/env.ts`, sin red** (H-06).

---

## No Analog Found

| File / Pattern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/(auth)/(split)/layout.tsx` — **route group anidado** | layout | request-response | **No existe ningún route group anidado en el repo.** Los 4 grupos (`(auth)`, `(crm)`, `(dashboard)`, `(onboarding)`) son de primer nivel. `(auth)` **no tiene `layout.tsx`**; los 4 layouts que existen (`app/layout.tsx`, `(crm)`, `(dashboard)`, `[slug]`) son de grupo/segmento simple. **H-04 es correcto y sin precedente: el planner construye el patrón, no lo copia.** Usar RESEARCH §Recommended Project Structure como spec. |
| **Estado "form → confirmación"** (D-02, D-12) | component pattern | — | No existe. Lo más cercano: `components/dashboard/plan-banner.tsx:32-35` — máquina de estados por `useState<ConfirmState>` con estado inicial derivado (`'idle' \| 'confirming' \| 'active' \| 'timeout'`), que **valida el enfoque** (`useState` de un estado, no un flag booleano suelto) pero **no es copiable**: es polling de un webhook, no un swap de UI post-submit. Se usa **dos veces** (forgot + register) → RESEARCH lo deja a discreción si se comparte helper. |
| **Cooldown de 60s** (D-05) | hook / utility | — | No existe ningún countdown en el repo. Único `setInterval`: `plan-banner.tsx:44-61` — **útil solo por su higiene de cleanup**, que el cooldown debe copiar: `let cancelled = false` + `return () => { cancelled = true; clearInterval(id) }`. La mecánica del countdown es diseño nuevo. |
| `test/proxy-auth-routes.test.ts` | test (regresión) | transform | **Ningún test del repo asierta sobre configuración de código** (verificado: cero `readFileSync` en los 35 archivos de test). **Blocker concreto para el planner:** `MAINT_EXEMPT` (`proxy.ts:21`) y `KNOWN_PREFIXES` (`proxy.ts:40`) **no están exportados** → hoy son inasertables. Opciones: (a) exportarlos de `proxy.ts` e importarlos en el test (mínimo, pero importar `proxy.ts` arrastra `@/lib/supabase/public`); (b) extraer las listas a `lib/auth/route-lists.ts` (puro, importable por `proxy.ts` y por el test) — **coherente con el patrón `lib/` puro del repo y recomendado**; (c) leer el archivo con `readFileSync` (sin precedente, frágil). **Decisión del planner.** El lado `isAuthRoute` (D-06) es igual de inasertable: vive inline en `lib/supabase/middleware.ts:31`. |
| **Guard de sesión client-side** en `/reset-password` (Pitfall 5) | page guard | — | Todos los guards del repo son **server** (`(dashboard)/layout.tsx:15,23,31`; `google/callback/route.ts:23-24`). No hay precedente de `getUser()` + redirect en un client component. |
| Templates de mail + Redirect URLs | config externa | — | No versionado (Dashboard). **Checkpoint humano** (H-02). En local, `config.toml` §`[auth.email.template.*]` con `content_path` (patrón comentado en L:247-249) — **[NO VERIFICADO por research: A2]**. |

---

## Metadata

**Analog search scope:** `app/`, `lib/`, `test/`, `proxy.ts`, `vitest.setup.ts`, `vitest.config.mts`
**Files scanned:** 14 leídos · route groups, layouts y 35 archivos de test enumerados
**Pattern extraction date:** 2026-07-16
