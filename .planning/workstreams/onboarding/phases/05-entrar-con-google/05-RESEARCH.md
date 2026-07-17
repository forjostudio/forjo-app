# Phase 5: Entrar con Google - Research

**Researched:** 2026-07-17
**Domain:** OAuth (Google) + account linking sobre `@supabase/ssr` (flowType PKCE) en Next.js 16
**Confidence:** HIGH (mecánica de linking y flujo OAuth verificados contra docs oficiales de Supabase; sin dependencias nuevas)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Unificar en una sola cuenta. Google con un email que ya existe como cuenta de contraseña (o al revés) se **vincula** a la cuenta existente → una sola cuenta, ambos métodos entran, negocio y datos intactos. NO se bloquea el cruce.
- **D-02:** La decisión es segura **porque confirm-email está ON en prod (H-01)**: toda cuenta de contraseña ya está verificada → no existe el vector de account takeover. Si algún día se apagara confirm-email, re-evaluar.
- **D-03:** Botón "Continuar con Google" en login **Y** en register. Mismo flujo para alta y login. Sin rediseño visual.
- **D-04:** Vínculo silencioso. Cruce resuelto con éxito → el usuario cae directo en su destino, **sin mensaje** sobre identidades vinculadas.
- **D-05:** Nunca un error opaco (AUTH-05 criterio 4). Si el cruce NO se puede resolver, mensaje claro que dice qué hacer, nunca pantalla muerta ni toast genérico.
- **D-06:** Sin wildcard de previews en la allowlist del Dashboard → auth **no anda en previews de Vercel**. Se prueba en local y en prod.
- **D-07:** El callback endurecido de Phase 4 se reusa **tal cual**. Único punto de extensión: sumar `oauth` a `ALLOWED_TYPES`, una fila `oauth: '/dashboard'` a `DESTINATIONS`, y la rama `code`→`exchangeCodeForSession` en el paso 2 del route — sin tocar los pasos 1, 3 ni 4. *(Ver Hallazgo Crítico #2: el research corrige la sub-cláusula de `ALLOWED_TYPES`.)*

### Claude's Discretion
- Mecánica exacta de OAuth (scopes de Google, `state`/PKCE, el `initiate` del flujo) → la resuelve el planner con este research.
- Ubicación exacta del botón dentro del card, divisor "o", iconografía de Google → seguir el design system existente (shadcn base-nova, lucide) sin inventar.

### Deferred Ideas (OUT OF SCOPE)
- Otros providers (Apple, Facebook, etc.) — fase propia si se piden (AUTH-OAUTH-02, ya diferido).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-03 | Una persona puede crear su cuenta e iniciar sesión con Google, sin contraseña | `signInWithOAuth({ provider:'google', options:{ redirectTo } })` desde el browser client + rama `code`→`exchangeCodeForSession` en `/auth/callback` (§Architecture Patterns, §Code Examples) |
| AUTH-04 | Un usuario que entra por Google por primera vez cae en el onboarding y crea su negocio | **VERIFICAR, no construir.** `app/(dashboard)/layout.tsx:23` ya hace `if (!business) redirect('/onboarding')`. Con `DESTINATIONS.oauth = '/dashboard'`, el usuario nuevo (sin negocio) cae en /dashboard → el layout lo rebota a /onboarding. El recurrente (con negocio) queda en /dashboard. **Un solo destino sirve para los dos casos.** |
| AUTH-05 | Mismo email en dos métodos → una sola cuenta, comportamiento predecible, nunca duplicado ni error opaco | Supabase hace **automatic linking por defecto**, gateado por email verificado (§Hallazgo Crítico #1). No requiere cambio de config. El orden inverso (register/password sobre cuenta Google) tiene un borde de UX que hay que cubrir (§Common Pitfalls, Pitfall 4) |
</phase_requirements>

## Summary

Esta fase es **más config externa + una rama de ~10 líneas en el route, que código nuevo**. Toda la mecánica pesada (state anti-CSRF, PKCE, el linking de identidades, el gate de email verificado) la maneja Supabase/GoTrue; el trabajo del repo es (a) un botón que llama `signInWithOAuth`, (b) una rama `code`→`exchangeCodeForSession` en el callback ya endurecido, (c) una fila en `DESTINATIONS`, y (d) el checkpoint humano de habilitar el provider en Google Cloud + Dashboard de Supabase. No se instala **ninguna dependencia nueva**: `@supabase/ssr` y `@supabase/supabase-js` ya exponen las dos APIs que hacen falta.

La decisión del milestone (D-01, unificar) coincide con el **comportamiento por defecto** de Supabase: cuando entra un Google cuyo email ya existe como cuenta de contraseña **confirmada**, GoTrue **vincula automáticamente** la identidad Google al usuario existente — mismo `user.id`, mismo `owner_id`, negocio intacto. El gate de seguridad (auto-link solo sobre email verificado) ya está garantizado por confirm-email ON en prod (H-01/D-02). No hay que tocar `enable_manual_linking` (ese flag es para la API de *manual* linking desde un usuario logueado, un feature distinto; hoy `false` en `config.toml` y está bien).

El único ajuste fino sobre el diseño anticipado en el CONTEXT: la rama del route debe branchear por la **presencia del parámetro `code`**, no por un `type=oauth` que atraviese `parseCallbackParams`. OAuth vuelve con `?code=...` y sin `type`, así que la sub-cláusula de D-07 "sumar `oauth` a `ALLOWED_TYPES`" es innecesaria y hasta contraproducente (metería un `type` que `verifyOtp` no entiende). Lo que sí es necesario es la fila `DESTINATIONS.oauth`. Ver Hallazgo Crítico #2.

**Primary recommendation:** Branchear el route por `code` (OAuth) vs `token_hash` (mail); `exchangeCodeForSession(code)` con el cliente anon+cookies existente; destino server-side `DESTINATIONS.oauth = '/dashboard'` (el dashboard layout rutea nuevo→onboarding / recurrente→dashboard); botón `signInWithOAuth` con `redirectTo` **hardcodeado** al `/auth/callback` de cada entorno; confiar en el automatic linking por defecto sin tocar config de linking; y una ruta de error OAuth propia (no reusar `/forgot-password?error=invalid_link`) para cumplir D-05.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Iniciar OAuth (`signInWithOAuth`) | Browser client (`'use client'`) | — | Redirige el navegador a Google y **guarda el `code_verifier` PKCE en cookie**; tiene que salir del navegador que después vuelve |
| Canje `code`→sesión (`exchangeCodeForSession`) | API / route handler server (Node) | — | Lee el `code_verifier` de la cookie (mismo navegador) y setea las cookies de sesión; cliente anon, nunca service role |
| Account linking (identidad Google ↔ usuario existente) | GoTrue (Supabase Auth) | — | Lo resuelve el backend de Auth, gateado por email verificado; el repo no toca esto |
| Ruteo post-login (nuevo→onboarding / recurrente→dashboard) | Frontend server (SSR layout) | — | `app/(dashboard)/layout.tsx` ya decide por presencia de `business` |
| Alta del negocio para el usuario Google | Frontend server + DB (RLS) | — | `onboarding/page.tsx` ya maneja "autenticado sin negocio"; AUTH-04 lo verifica |
| Config del provider (client_id/secret, redirect URIs) | Dashboard de Supabase + Google Cloud | `config.toml` (espejo local) | Checkpoint humano; el secret nunca en git |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | `^0.10.3` (instalado) | `createBrowserClient` (`signInWithOAuth`) y `createServerClient` (`exchangeCodeForSession`) | Ya es el patrón de auth del repo; PKCE forzado y `code_verifier` en cookie es justo lo que hace funcionar el canje server-side [VERIFIED: package.json / CLAUDE.md] |
| `@supabase/supabase-js` | `^2.106.2` (instalado) | API `auth.signInWithOAuth` / `auth.exchangeCodeForSession` | SDK base ya presente [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | `^1.17.0` (instalado) | Ícono en el botón (o SVG de marca Google) | Sistema de íconos del proyecto; lucide **no** trae el logo oficial multicolor de Google → si se quiere el glifo de marca, inline SVG (ver Pitfall 5) |
| `@/components/ui/button` | shadcn base-nova | El botón "Continuar con Google" (`variant="outline"`) | Design system existente (D-03: sin rediseño) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `exchangeCodeForSession` en un route handler | Manejar OAuth con `detectSessionInUrl` client-side | Rompe el modelo SSR del repo (cookies server-side) y el endurecimiento de Phase 4; descartado |
| Un destino `oauth` separado apuntando a `/onboarding` | `oauth: '/dashboard'` (recomendado) | `/dashboard` ya rutea ambos casos vía el layout; apuntar a `/onboarding` rompería al usuario recurrente (lo mandaría a re-onboardear) |

**Installation:**
```bash
# Ninguna. @supabase/ssr y @supabase/supabase-js ya están en package.json.
```

**Version verification:** No aplica package nuevo. Las APIs `signInWithOAuth` y `exchangeCodeForSession` viven en la versión ya instalada de `@supabase/supabase-js@^2.106.2` [VERIFIED: CLAUDE.md stack + node_modules].

## Package Legitimacy Audit

**No se instala ningún package externo en esta fase.** Toda la funcionalidad usa APIs de dependencias ya presentes y auditadas (`@supabase/ssr`, `@supabase/supabase-js`). Audit N/A.

## Architecture Patterns

### System Architecture Diagram

```text
                         (browser — mismo navegador de principio a fin)
  [Login / Register]
   Botón "Continuar con Google"
        │  supabase.auth.signInWithOAuth({ provider:'google',
        │       options:{ redirectTo: <APP>/auth/callback } })
        │  → GoTrue setea code_verifier PKCE en COOKIE del host de la app
        ▼
  ┌──────────────────────────┐   302    ┌───────────────────────────────┐
  │ GoTrue /authorize        │ ───────▶ │ Google consent screen         │
  │ (genera state + PKCE)    │          │ (usuario elige cuenta)        │
  └──────────────────────────┘          └───────────────┬───────────────┘
        ▲                                                │ redirect con ?code (de Google)
        │                                                ▼
        │                         ┌──────────────────────────────────────────┐
        │                         │ https://<ref>.supabase.co/auth/v1/callback│
        │  valida state +         │  · valida state (anti-CSRF)                │
        │  linking de identidad   │  · AUTOMATIC LINKING si el email ya existe │
        │                         │    y está verificado → mismo user.id       │
        │                         └───────────────┬──────────────────────────┘
        │                                         │ 302 a redirectTo con ?code (de Supabase)
        ▼                                         ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │ app/auth/callback/route.ts  (Node, cliente ANON + cookies)        │
  │  paso 1 parse → ¿hay `code`?                                       │
  │     SÍ → paso 2b exchangeCodeForSession(code)  ← RAMA NUEVA P5     │
  │            (lee code_verifier de la cookie del mismo navegador)    │
  │     NO → paso 2a verifyOtp(token_hash,type)    ← Phase 4 intacto   │
  │  paso 3 dest = resolveDestination('oauth') = '/dashboard'         │
  │  paso 4 303 a URL limpia + Referrer-Policy:no-referrer            │
  └───────────────────────────────┬──────────────────────────────────┘
                                  ▼
                    app/(dashboard)/layout.tsx  (SSR)
                    getUser() → business?
                       sin business → redirect('/onboarding')   (AUTH-04 nuevo)
                       con business → /dashboard                (recurrente)
```

### Pattern 1: Branch por `code` en el route (extensión del paso 2)
**What:** El route detecta OAuth por la presencia de `?code=` y lo canjea con `exchangeCodeForSession`; el path de mail (`token_hash`+`type`) queda **igual**.
**When to use:** Toda vuelta de OAuth. Es la única rama nueva (D-07).
**Example:** ver §Code Examples.

### Pattern 2: Destino server-side desde tabla cerrada (se mantiene T-04-01)
**What:** Tras el canje exitoso, el destino sale de `DESTINATIONS['oauth']`, nunca de un parámetro. El `redirectTo` que viaja a Google apunta **siempre** al `/auth/callback` fijo, no al destino final.
**When to use:** Siempre. Es la mitigación estructural de open-redirect de Phase 4, extendida a OAuth.

### Pattern 3: `redirectTo` hardcodeado por entorno
**What:** El botón calcula `redirectTo` desde el origin de la app (`${window.location.origin}/auth/callback`) o una env, **no** desde ningún input del usuario. Ese valor debe estar en la allowlist del Dashboard (D-06: sin wildcard).
**When to use:** En el `signInWithOAuth` del botón.

### Recommended Project Structure
```
app/
├── auth/callback/route.ts       # + rama `code` (paso 2b). NO se mueve ni reescribe
├── (auth)/(split)/login/page.tsx# + botón Google
├── (auth)/register/page.tsx     # + botón Google (mismo componente)
components/auth/
└── google-button.tsx            # NUEVO: componente compartido login+register (client)
lib/auth/
└── callback.ts                  # + fila DESTINATIONS.oauth. (Ver Hallazgo #2 sobre ALLOWED_TYPES)
```

### Anti-Patterns to Avoid
- **Mandar el destino final como `redirectTo` a Google:** reintroduce open-redirect. `redirectTo` es SIEMPRE `/auth/callback`; el destino real se deriva server-side.
- **Usar el service-role client en el canje:** el callback lo alcanza un usuario anónimo; service role bypassa RLS (T-04-04). Usar `@/lib/supabase/server` (anon+cookies).
- **Apuntar `DESTINATIONS.oauth` a `/onboarding`:** rompe al usuario recurrente. `/dashboard` deja que el layout rutee.
- **Reusar `/forgot-password?error=invalid_link` para el fallo de OAuth:** es el "error opaco" que D-05 prohíbe en este contexto (habla de recuperación de contraseña, no de Google). Usar una ruta de error propia (ver Pitfall 3).
- **Tocar `enable_manual_linking`:** no participa del automatic linking; cambiarlo no hace nada para D-01 y abre una superficie (manual linking beta) que la fase no usa.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vincular la identidad Google a la cuenta existente | Lógica propia de "buscar user por email y mergear" | Automatic linking de GoTrue (por defecto) | El merge manual sobre email es exactamente el vector de takeover; GoTrue lo gatea por email verificado [CITED: supabase.com/docs/guides/auth/auth-identity-linking] |
| Anti-CSRF del round-trip OAuth | Un `state` propio | El `state` que genera y valida GoTrue | Ya viene resuelto server-side; reinventarlo agrega bugs |
| PKCE `code_verifier` | Guardarlo en localStorage a mano | `@supabase/ssr` lo pone en cookie | La cookie es lo que hace que el canje funcione server-side en el navegador de origen |
| Detectar "usuario nuevo sin negocio" | Un flag/columna nueva | `app/(dashboard)/layout.tsx` (`!business → /onboarding`) | Ya existe y es lo que verifica AUTH-04 |

**Key insight:** En auth social, casi todo lo "difícil" (linking, state, PKCE, gate de verificación) es responsabilidad del proveedor de identidad. El código de la app se limita a iniciar el flujo y canjear el código. Cualquier cosa que parezca que hay que "resolver el linking a mano" es una señal de estar peleando contra el default seguro.

## Common Pitfalls

### Pitfall 1: Pérdida del `code_verifier` PKCE
**What goes wrong:** `exchangeCodeForSession` falla con "code verifier" / "invalid request" porque el canje corre en un navegador/host distinto del que inició el flujo.
**Why it happens:** El `code_verifier` lo guarda `signInWithOAuth` en una **cookie del host de la app**. Si el botón usa `origin` A pero el callback resuelve en host B, la cookie no cruza.
**How to avoid:** A diferencia del webview de Gmail de Phase 4 (H-03), OAuth **vuelve al navegador de origen**, así que el verifier SÍ existe — siempre que app y callback compartan host. Mantener `redirectTo = ${window.location.origin}/auth/callback` y no mezclar `localhost`/`127.0.0.1` (ver Pitfall 2).
**Warning signs:** Canje que falla solo en local, o solo la primera vez tras cambiar de host.

### Pitfall 2: `localhost` vs `127.0.0.1` (el que mordió el UAT de Phase 4)
**What goes wrong:** El canje cae en error y la sesión no se setea, aunque Google haya autenticado bien.
**Why it happens:** Hay **dos ejes de host distintos** y es fácil confundirlos:
1. Host de la **app** (Next dev): Phase 4 fijó `localhost:3000` porque `request.url` en `next dev` reporta `localhost` y la cookie de sesión es por host (`config.toml:159-169`). El `code_verifier` vive acá.
2. Host del **callback de Supabase local**: `http://127.0.0.1:54321/auth/v1/callback` — este va en Google Cloud como "Authorized redirect URI" y es un host separado, no entra en conflicto con el de la app.
**How to avoid:** `site_url = http://localhost:3000` y `additional_redirect_urls` con `http://localhost:3000/auth/callback` (ya están en `config.toml:159-170`). El `redirectTo` del botón usa el mismo `localhost:3000`. El redirect URI de Google Cloud usa `127.0.0.1:54321` (para el local de Supabase) **y** el de prod. Son axes independientes.
**Warning signs:** "el reset/login anda entrando por un host y no por el otro" — mismo síntoma que Phase 4.

### Pitfall 3: Fallo de OAuth cayendo en un error opaco (rompe D-05)
**What goes wrong:** Si `exchangeCodeForSession` falla (o Google devuelve `?error=access_denied` porque el usuario canceló), reusar el `fail()` de Phase 4 lo manda a `/forgot-password?error=invalid_link` — un mensaje sobre *recuperación de contraseña* que no tiene nada que ver.
**Why it happens:** `fail()` está diseñado para el flujo de mail (D-18), no para OAuth.
**How to avoid:** Rama de error OAuth propia → redirigir a `/login?error=oauth` (o `/register?...`) y que la pantalla muestre un mensaje claro ("No pudimos entrar con Google, probá de nuevo o entrá con tu email"). También contemplar `?error=` de Google en la query del callback (cancelación del consent). Esto es una **tarea nueva**, no cubierta por el `fail()` existente.
**Warning signs:** Cancelar el consent de Google y terminar en una pantalla de "link inválido".

### Pitfall 4: El orden inverso (register/password sobre una cuenta Google) — borde de UX de AUTH-05
**What goes wrong:** Un usuario que ya tiene cuenta **solo con Google** va al form de `/register`, tipea su email + una contraseña. GoTrue devuelve una **respuesta ofuscada** (anti-enumeration): NO crea contraseña, NO manda mail, y `register/page.tsx` muestra "Revisá tu mail" — un mail que **nunca llega**. Dead-end suave.
**Why it happens:** Supabase ofusca la existencia de cuenta a propósito; `signUp` sobre un user existente no linkea una contraseña. [CITED: github.com/orgs/supabase/discussions — signup sobre email existente devuelve user ofuscado sin mail]. La forma correcta de *agregar* contraseña a una cuenta OAuth es `updateUser({ password })` **estando logueado** — fuera de scope de esta fase.
**How to avoid:** El **camino feliz de D-01 es al revés**: el usuario con cuenta Google que quiere entrar usa el **botón de Google** (o, si tiene contraseña, la contraseña). El linking bidireccional real ocurre cuando el **email confirmado ya existe y se entra por Google** (auto-link). El caso "quiero setear una contraseña sobre mi cuenta Google desde register" no se puede resolver sin filtrar existencia; documentarlo como **limitación conocida** y decidir en discuss si se agrega copy en `/register` ("¿Te registraste con Google? Entrá con Google") — pero eso roza el oráculo de enumeration que D-14/T-04-17 cerró. **Recomendación:** no tocar el anti-enumeration; cubrir el caso común (login con Google funciona siempre) y dejar el sub-caso raro como riesgo aceptado documentado.
**Warning signs:** Usuario reporta "me registré con Google, quise poner contraseña y nunca me llegó el mail".

### Pitfall 5: El botón sin el glifo de marca Google
**What goes wrong:** `lucide-react` no incluye el logo oficial multicolor de Google; usar un ícono genérico desluce o incumple los brand guidelines de Google Sign-In.
**How to avoid:** Inline SVG del logo "G" oficial dentro del `Button variant="outline"`, respetando el espaciado del design system. No instalar un paquete de íconos de marca.

### Pitfall 6: Slug-collision bajo RLS en onboarding (pre-existente, NO de esta fase)
**What goes wrong:** Un usuario Google nuevo llega a onboarding y elige un slug; el check de disponibilidad (`onboarding/page.tsx:113-123`, `.eq('slug',...).single()`) puede reportar "disponible" para un slug que ya existe en **otro tenant** que RLS le oculta, y el insert falla por el unique constraint.
**Why it happens:** Bug ya anotado en memoria (`onboarding-slug-collision-rls`), del milestone de onboarding, no de Phase 5.
**How to avoid:** Fuera de scope. Solo **flag**: un usuario que entra por Google usa exactamente el mismo carril de onboarding, así que dispara el mismo bug — no lo introduce Phase 5, pero AUTH-04 lo va a rozar en el UAT. No arreglarlo acá salvo que el planner lo suba de scope explícitamente.

## Code Examples

### `signInWithOAuth` desde el botón (client)
```typescript
// components/auth/google-button.tsx  — 'use client'
// Source: supabase.com/docs/guides/auth/social-login/auth-google (server-side / PKCE)
'use client'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export function GoogleButton() {
  const supabase = createClient()
  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // redirectTo SIEMPRE al callback fijo, nunca al destino final (anti open-redirect T-04-01).
        // origin del navegador → mismo host que tiene el code_verifier en cookie (Pitfall 1/2).
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    // signInWithOAuth redirige el navegador; no hay `data` que manejar acá.
  }
  return (
    <Button type="button" variant="outline" className="w-full" onClick={signIn}>
      {/* inline SVG del glifo Google (Pitfall 5) */}
      Continuar con Google
    </Button>
  )
}
```

### Rama `code` en el route (paso 2b — la ÚNICA extensión)
```typescript
// app/auth/callback/route.ts  — dentro del GET, ANTES del parse de token_hash.
// Source: supabase.com/docs/guides/auth/social-login/auth-google + server.ts existente
const code = request.nextUrl.searchParams.get('code')
if (code) {
  // Cliente ANON + cookies (el mismo de siempre): lee el code_verifier de la cookie
  // del navegador que inició el flujo y setea las cookies de sesión. NUNCA service role (T-04-04).
  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // NO reusar fail() (habla de recuperación de contraseña, D-05). Error OAuth propio.
    console.error('[auth/callback] exchangeCodeForSession:', error.message) // nunca la URL ni el code
    return NextResponse.redirect(new URL('/login?error=oauth', request.url), 303)
  }
  const dest = resolveDestination('oauth')           // '/dashboard' desde DESTINATIONS
  const res = NextResponse.redirect(new URL(dest, request.url), 303)
  res.headers.set('Referrer-Policy', 'no-referrer')  // capa de scrub, igual que el path de mail
  return res
}
// … acá sigue el paso 1/2a existente (parseCallbackParams → verifyOtp) SIN cambios.
```

### La única línea de `DESTINATIONS`
```typescript
// lib/auth/callback.ts
const DESTINATIONS: Record<string, string> = {
  recovery: '/reset-password',
  signup: '/onboarding',
  oauth: '/dashboard',   // ← Phase 5. El layout de (dashboard) rutea nuevo→/onboarding, recurrente→/dashboard.
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `code` + `type` en el link de mail (implicit/legacy) | PKCE (`flowType:'pkce'`) forzado por `@supabase/ssr` | @supabase/ssr | El canje necesita el `code_verifier` en cookie → por eso OAuth (mismo navegador) usa `code` y el mail (webview) usó `token_hash` en Phase 4 |
| Linkear identidades a mano | Automatic linking por email verificado (default) | GoTrue moderno | D-01 se cumple sin código de linking |
| `enable_manual_linking` como "el flag del linking" | Es solo para `linkIdentity` (manual, beta) desde user logueado | — | No tocar; irrelevante para D-01 |

**Deprecated/outdated:**
- Cualquier tutorial que muestre `getSessionFromUrl` / hash-based OAuth client-side: no aplica al modelo SSR+cookies del repo.

## Runtime State Inventory

No aplica en sentido estricto (no es rename/refactor). Pero por tratarse de auth, el inventario de estado externo que la fase toca es:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Live service config | Provider Google en el Dashboard de Supabase (client_id/secret) — **no está en git** | Checkpoint humano: habilitar |
| Live service config | Redirect URIs en Google Cloud OAuth (credenciales que hoy usa Calendar, `client_secret_*.json`) | Checkpoint humano: agregar el URI del callback de Supabase (prod + local) |
| Live service config | Allowlist de Redirect URLs del Dashboard de Supabase | Agregar `https://gestion.forjo.studio/auth/callback` (ya debería estar de Phase 4) + local; sin wildcard (D-06) |
| Secrets/env vars | `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` (solo para el espejo local en `config.toml`) | Setear en `.env` local si se quiere UAT local; en prod vive en el Dashboard |
| Stored data | Identidades en `auth.identities` — el auto-link agrega una fila `provider='google'` al user existente | Ninguna migración; lo maneja GoTrue |

**Nada en:** Build artifacts, OS-registered state — verificado, no aplica.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La allowlist de Redirect URLs de prod ya contiene `https://gestion.forjo.studio/auth/callback` desde Phase 4 | Runtime State / Config | Bajo — si falta, el botón falla en prod hasta agregarlo; es parte del checkpoint humano igual |
| A2 | Las credenciales OAuth existentes (`client_secret_*.json`, de Calendar) sirven como client_id/secret del provider Google de Supabase sin crear unas nuevas | Config / External Setup | Medio — si el "OAuth consent screen" o los scopes de esas credenciales no permiten el uso por Supabase, habría que crear un client OAuth nuevo. **Confirmar con el dueño en el checkpoint.** |
| A3 | El `origin` del navegador en prod es `https://gestion.forjo.studio` (único host, sin el problema localhost/127) | Pitfall 2 | Bajo — prod es single-host (comentario `config.toml:169`) |

## Open Questions

1. **¿`ALLOWED_TYPES` recibe `oauth` o no?** (Hallazgo Crítico #2, abajo)
   - Lo que sabemos: OAuth vuelve con `?code=`, sin `type`. `resolveDestination('oauth')` no consulta `ALLOWED_TYPES` (solo `DESTINATIONS`). `parseCallbackParams` valida el `type` **del path de mail**.
   - Lo que no está claro: el comentario en `callback.ts:20-21` y el test `callback.test.ts:32-40` anticipan que Phase 5 "suma oauth a `ALLOWED_TYPES`". Funcionalmente NO hace falta y sería contraproducente.
   - Recomendación: **NO** agregar `oauth` a `ALLOWED_TYPES`; branchear por `code`. Actualizar el comentario y agregar un test `resolveDestination('oauth')==='/dashboard'`. El test que asierta que `type=oauth` se rechaza en el parse queda **válido y correcto** (un `?token_hash=x&type=oauth` fabricado no debe ir a `verifyOtp`). Reconciliar en discuss porque roza la letra de D-07.

2. **¿UAT local o solo prod?** (Hallazgo Crítico #5, abajo)
   - Lo que sabemos: Google OAuth local es posible con `[auth.external.google]` en `config.toml` + `skip_nonce_check=true` + credenciales Google reales + `127.0.0.1:54321/auth/v1/callback` en Google Cloud.
   - Lo que no está claro: si el dueño quiere agregar el URI local a las credenciales de Calendar (superficie extra) o prefiere UAT solo-prod con una cuenta descartable (como el T-04-22 de Phase 4).
   - Recomendación: **UAT prod-first** con cuenta Google descartable para el cross-test de linking; local opcional si el dueño acepta el setup extra.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/ssr` | signInWithOAuth / exchangeCodeForSession | ✓ | ^0.10.3 | — |
| `@supabase/supabase-js` | API de auth | ✓ | ^2.106.2 | — |
| Provider Google en Dashboard Supabase | AUTH-03 (que el botón funcione) | ✗ (checkpoint) | — | **Sin fallback** — bloquea prueba y sentido del botón |
| Redirect URI en Google Cloud | round-trip OAuth | ✗ (checkpoint) | — | **Sin fallback** |
| Supabase CLI local (`supabase start`) | UAT local opcional | ✓ (baseline replayable, memoria `infra-testing-roadmap`) | PG17 | UAT prod-first |

**Missing dependencies with no fallback:**
- Provider Google + Redirect URI (checkpoint humano bloqueante). Sin esto AUTH-03 no se puede ni probar.

**Missing dependencies with fallback:**
- Setup de Google OAuth local: fallback = UAT en prod con cuenta descartable.

## Security Domain

### Hallazgos por pregunta crítica

**#1 — Mecánica de account linking (LA pregunta).**
- **Auto-link por defecto, SÍ.** Cuando entra un Google cuyo email ya existe como cuenta de contraseña **confirmada**, GoTrue vincula la identidad Google al user existente (mismo `user.id`), no duplica ni tira error. [CITED: supabase.com/docs/guides/auth/auth-identity-linking]
- **Gate de seguridad:** el auto-link **requiere email verificado**. Doc textual: *"It would also be an insecure practice to automatically link an identity to a user with an unverified email address since that could lead to pre-account takeover attacks."* Además, al linkear, GoTrue *"remove any other unconfirmed identities linked to an existing user."* [CITED: idem]. → D-02 se sostiene: confirm-email ON (H-01, `enable_confirmations=true` en `config.toml:237` + prod) elimina el vector.
- **`enable_manual_linking`:** es para la API de *manual* linking (`linkIdentity`) desde un user logueado; **NO** gobierna el auto-link. Default `false`, y **no hay que cambiarlo** para D-01. [CITED: idem]
- **Orden inverso (Google primero, luego register con password):** GoTrue devuelve respuesta ofuscada, sin mail, sin setear password (anti-enumeration). Ver Pitfall 4. La vía correcta de agregar password a una cuenta OAuth es `updateUser({ password })` logueado (fuera de scope).
- **Qué metadata manda:** el user existente conserva su `user.id`/`owner_id`; la identidad Google se **agrega** (fila en `auth.identities`). `getUser()` sigue devolviendo el mismo user → `businesses.owner_id` intacto (el corazón de D-01). Para un user Google nuevo, `user_metadata` trae name/avatar de Google, pero onboarding no los lee (pide los datos del negocio de cero) → sin impacto downstream.

**#2 — La extensión del callback.** Confirmado: el `code` **NO** va en `ALLOWED_TYPES` (ese Set valida el `type` del path de otp/mail). El route debe branchear por presencia de `code` → `exchangeCodeForSession(code)`; el path `token_hash`+`type` queda intacto. `exchangeCodeForSession` funciona porque `@supabase/ssr` guardó el `code_verifier` PKCE en cookie y OAuth vuelve al **navegador de origen** (a diferencia del webview de Gmail que forzó `token_hash` en Phase 4, H-03). Ver Open Question #1 sobre la letra de D-07.

**#3 — Seguridad compartida con Phase 4.** El endurecimiento de Phase 4 se mantiene para la rama OAuth:
- **Open-redirect (T-04-01):** el `redirectTo` de `signInWithOAuth` está hardcodeado al `/auth/callback` fijo (no input de usuario) y **debe** estar en la allowlist del Dashboard (D-06, sin wildcard). El destino final sigue derivándose server-side de `DESTINATIONS`. Cerrado.
- **`state`/PKCE anti-CSRF:** los maneja GoTrue; el repo no los toca. Cerrado por diseño del proveedor.
- **Cliente anon (T-04-04):** el canje usa `@/lib/supabase/server` (anon+cookies), nunca service role. Cerrado.
- **Token/URL leak (T-04-02):** loguear solo `error.message`, nunca el `code` ni la URL; 303 a URL limpia + `Referrer-Policy:no-referrer` en la rama OAuth también.

**#4 — Config / external setup (checkpoint humano).**
- **Google Cloud:** agregar como *Authorized redirect URI* a las credenciales OAuth existentes: **prod** = `https://<project-ref>.supabase.co/auth/v1/callback`; **local** (si se hace UAT local) = `http://127.0.0.1:54321/auth/v1/callback`. [CITED: supabase.com/docs/guides/auth/social-login/auth-google] El `<project-ref>` sale del Dashboard de Supabase.
- **Dashboard de Supabase:** Authentication → Providers → Google → enable + pegar client ID/secret. **Dashboard-only:** client_id/secret de prod. **Reproducible en `config.toml`:** `[auth.external.google] enabled=true / client_id / secret=env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET) / skip_nonce_check=true` (este último *required for local sign in with Google*, comentado en `config.toml:358-359`).
- **Allowlist de Redirect URLs (Dashboard):** el `redirectTo` de la app (`.../auth/callback`) debe estar; prod ya de Phase 4, local ya en `config.toml:170`.

**#5 — Reproducibilidad del UAT.** Google OAuth **no** tiene un provider "fake" local: para probar contra `supabase start` hacen falta credenciales Google reales + el URI `127.0.0.1:54321` en Google Cloud + `skip_nonce_check=true`. Es factible pero suma superficie. **Honesto:** lo más simple es **UAT prod-first** con una cuenta Google descartable (y una segunda cuenta email/password con el mismo address para el cross-test de linking) — encaja con el patrón de riesgo aceptado T-04-22 de Phase 4. Local queda como opción si el dueño acepta el setup.

### Applicable ASVS Categories (nivel 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | OAuth 2.0 + PKCE vía GoTrue; email verificado como gate de linking |
| V3 Session Management | yes | Cookies de sesión seteadas por `exchangeCodeForSession` (anon client, `@supabase/ssr`); rotación de refresh token ya activa (`config.toml:178`) |
| V4 Access Control | yes | Destino server-side desde `DESTINATIONS`; RLS por `business_id` intacto (el user linkeado conserva `owner_id`) |
| V5 Input Validation | yes | `code`/`error` de la query tratados como input no confiable; nunca reflejados al redirect |
| V6 Cryptography | no (delegado) | PKCE/state los genera GoTrue; no se hand-rollea nada |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pre-account takeover por auto-link sobre email no verificado | Spoofing/EoP | confirm-email ON (H-01); GoTrue no linkea identidades sin verificar [CITED] |
| Open redirect en el retorno de OAuth | Tampering | `redirectTo` fijo + destino de `DESTINATIONS`; allowlist sin wildcard (T-04-01) |
| CSRF del round-trip OAuth | Spoofing | `state` de GoTrue |
| Fuga del `code` en logs/Referer | Info Disclosure | log solo `error.message`; 303 URL limpia + `Referrer-Policy:no-referrer` (T-04-02) |
| Service role en el canje | EoP | cliente anon+cookies (T-04-04) |
| Error OAuth opaco (viola D-05) | — (UX/repudiation) | ruta de error OAuth propia con mensaje claro (Pitfall 3) |

> **Correr `/gsd:secure-phase`** al cerrar la fase: comparte superficie con Phase 4; verificar T-04-01/-02/-04 sobre la rama OAuth + el nuevo threat del error opaco.

## Sources

### Primary (HIGH confidence)
- supabase.com/docs/guides/auth/auth-identity-linking — automatic vs manual linking, gate de email verificado, pre-account-takeover
- supabase.com/docs/guides/auth/social-login/auth-google — flujo server-side, redirect URI `https://<ref>.supabase.co/auth/v1/callback`, `redirectTo`, Dashboard vs config.toml
- Código del repo (leído): `app/auth/callback/route.ts`, `lib/auth/callback.ts`, `lib/auth/route-lists.ts`, `app/(dashboard)/layout.tsx:23` (routing AUTH-04), `app/(onboarding)/onboarding/page.tsx`, `supabase/config.toml` (`enable_manual_linking=false`, `enable_confirmations=true`, host localhost, `[auth.external]`), `lib/supabase/{client,server}.ts`, `04-SECURITY.md` (T-04-01..22)

### Secondary (MEDIUM confidence)
- github.com/orgs/supabase/discussions (signup sobre email existente → respuesta ofuscada, sin mail; `updateUser({password})` para agregar password a cuenta OAuth) — WebSearch, coherente con la doc de linking

### Tertiary (LOW confidence)
- supabase.com/docs/guides/local-development/managing-config — estructura de `[auth.external.google]` en config.toml (el detalle de `skip_nonce_check` se confirmó contra el comentario ya presente en `config.toml:358-359`, no contra la doc)

## Metadata

**Confidence breakdown:**
- Account linking (D-01/AUTH-05): HIGH — doc oficial explícita + gate de email verificado ya activo en el repo
- Callback extension (`code`/PKCE): HIGH — doc oficial + código existente que documenta el porqué del `token_hash` de Phase 4
- Routing AUTH-04: HIGH — verificado en `layout.tsx:23`
- Config externa: MEDIUM — mecánica clara; la reutilización de las credenciales de Calendar (A2) necesita confirmación del dueño en el checkpoint
- Orden inverso / UAT local: MEDIUM — comportamiento documentado pero con matices de versión/UX

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 (30 días — auth de Supabase es estable; revisar si se actualiza `@supabase/ssr` mayor)
