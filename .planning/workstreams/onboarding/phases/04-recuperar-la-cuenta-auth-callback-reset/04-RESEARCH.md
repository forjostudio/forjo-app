# Phase 4: Recuperar la cuenta (`/auth/callback` + reset) - Research

**Researched:** 2026-07-16
**Domain:** Superficie de autenticación — Supabase Auth (GoTrue) + `@supabase/ssr` sobre Next.js 16 App Router
**Confidence:** HIGH en las decisiones núcleo (forma del callback, estado de prod, `signOut`); MEDIUM en rate limits de prod (no consultables sin Management API).

---

## Summary

La pregunta abierta de la fase (`token_hash` + `verifyOtp` **vs** `code` + `exchangeCodeForSession`) tiene una
respuesta **decidida y verificada en `node_modules/`**, no una opinión: **`@supabase/ssr` 0.10.3 fuerza
`flowType: "pkce"` y el caller NO puede pisarlo** (está después del spread de `options.auth` —
`createServerClient.js:33`, `createBrowserClient.js:40`). Con PKCE, `exchangeCodeForSession` exige un
`code_verifier` guardado en el navegador **que inició el flujo** (`GoTrueClient.js:1466-1470`, tira
`AuthPKCECodeVerifierMissingError` si falta). Los docs oficiales lo confirman textual: *"the code exchange
must be initiated on the same browser and device where the flow was started"*. Un link de recuperación se
abre desde una app de mail — casi nunca en el mismo navegador, y en mobile casi siempre en un **webview
in-app**. `exchangeCodeForSession` para mails **rompe hasta en el mismo dispositivo**.

→ **`token_hash` + `verifyOtp` es la única opción viable para los mails.** Es stateless: no depende de
ninguna cookie previa. Es lo que recomienda el doc oficial de Supabase para SSR.

**El costo, y es el hallazgo que el planner no puede ignorar:** `token_hash` **no llega solo**. El template
default usa `{{ .ConfirmationURL }}`, que pasa por `/auth/v1/verify` y vuelve con `?code=`. Para recibir
`token_hash` hay que **editar el href de los 2 templates en el Dashboard** → el checkpoint humano de la fase
crece. Esto **choca con el supuesto de CONTEXT** de que Phase 4 no toca templates (ver §Hallazgos, H-02).

**Segundo hallazgo, y este cambia el alcance:** **la confirmación de email YA ESTÁ ON en prod.**
Verificado read-only contra el endpoint público de settings: `mailer_autoconfirm: false`. Hay **3 usuarios,
0 sin confirmar**, y el más reciente confirmó con un click real (30s entre `created_at` y
`email_confirmed_at`). **D-15 no dispara** y no hay usuarios colgados. Pero eso significa que **el bug de
AUTH-06 está vivo en prod hoy**: `signUp()` no devuelve sesión y `register/page.tsx:57` empuja a
`/onboarding`, de donde el proxy lo rebota al login.

**Primary recommendation:** Un único `app/auth/callback/route.ts` con dispatch por parámetro
(`token_hash` → `verifyOtp` · `code` → `exchangeCodeForSession`), destino derivado **server-side de una
tabla por `type`** (sin parámetro de retorno reflejado → no hay open redirect que tapar), y las partes
puras (validación + tabla de destinos) extraídas a `lib/auth/callback.ts` para poder testearlas con Vitest.

---

## Hallazgos que el planner NO puede ignorar

> Ordenados por cuánto mueven el plan.

### H-01 — La confirmación de email YA está ON en prod. D-15 no dispara. [VERIFICADO]

Probe **read-only** al endpoint público de settings de prod (`GET /auth/v1/settings`, host
`tpvbjwqzskzkevepcwyb.supabase.co`). **No se modificó nada.**

| Dato | Valor | Lectura |
|------|-------|---------|
| `mailer_autoconfirm` | `false` | **Confirmación ON** (autoconfirm apagado = confirmar es obligatorio) |
| `disable_signup` | `false` | Altas abiertas |
| `external.google` | `false` | Confirma el checkpoint de Phase 5 |

Conteo vía `auth.admin.listUsers()` con service role (**lectura**):

- **Total usuarios: 3 · Sin confirmar: 0 · Con identidad Google: 0**
- Más reciente: `created 2026-07-13T15:00:44Z` → `confirmed 2026-07-13T15:01:14Z` → **30 segundos de gap =
  alguien abrió el mail y clickeó.** La confirmación no es teórica: está funcionando en prod.

**Consecuencias para el plan:**

1. **D-11 ya está cumplido en prod. No hay que prender nada.** El checkpoint humano **pierde** el ítem
   "`enable_confirmations` ON en prod".
2. **D-15 no dispara.** Cero usuarios colgados → **no hay trabajo manual en el Dashboard**. El plan no
   necesita una tarea de remediación.
3. **AUTH-06 no es preventivo: es un bug vivo en prod.** `register/page.tsx:47-58` hace `signUp()` →
   `toast.success(...)` → `router.push('/onboarding')`. Con confirmación ON, `signUp` **no devuelve
   sesión** → `updateSession` (`lib/supabase/middleware.ts:37,44-48`) matchea `/onboarding` como
   `isDashboardRoute`, ve `user === null` y **redirige a `/login`**. Es exactamente el rebote que el
   criterio 4 de la fase prohíbe, y hoy le pasa a todo el que se registra.
4. **Local diverge de prod** (`config.toml:226` → `enable_confirmations = false`). **D-23 estaba bien y
   ahora es más importante:** sin ese cambio, el local no reproduce el bug que AUTH-06 arregla.

### H-02 — `token_hash` obliga a editar los templates en Phase 4. CONTEXT asume que no. [VERIFICADO]

CONTEXT §specifics dice: *"el mail feo de Supabase en inglés es aceptable a propósito en esta fase"*, y
manda todo lo de templates a Phase 6 (MAIL-01).

**Eso se sostiene para el aspecto, pero NO para el link.** El template default es:

```html
<a href="{{ .ConfirmationURL }}">Reset Password</a>
```

`{{ .ConfirmationURL }}` expande a `{{ .SiteURL }}/auth/v1/verify?token=...&type=recovery&redirect_to=...`
→ pasa por GoTrue → redirige a `redirect_to` **con `?code=`** (porque nuestro cliente manda `code_challenge`,
ver H-03). **Nunca entrega `token_hash` a nuestra ruta.** [VERIFICADO: `resetPasswordForEmail` manda
`code_challenge` — `GoTrueClient.js:3502-3520`]

Para recibir `token_hash` el href tiene que ser [CITED: supabase.com/docs/guides/auth/passwords]:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a>
```

**Separación limpia que el planner debería adoptar:**

| Fase | Qué toca del template | Por qué |
|------|----------------------|---------|
| **Phase 4** | **Solo el `href`** (mecánica del link) | Sin esto el flujo no funciona. Sigue en inglés y feo. |
| **Phase 6** | Idioma, marca, remitente, HTML | MAIL-01/02 intactos, sin pérdida de alcance. |

→ **El checkpoint humano de Phase 4 SUMA:** editar el href de **Reset password** y **Confirm signup** en
Dashboard → Auth → Email Templates. **Neteando con H-01** (que le saca el ítem de `enable_confirmations`),
el checkpoint queda del mismo tamaño, pero con **otro contenido**. El planner tiene que escribirlo con los
2 templates adentro o **la fase no cierra**.

### H-03 — `@supabase/ssr` fuerza PKCE. No es configurable. [VERIFICADO en node_modules]

```js
// node_modules/@supabase/ssr/dist/main/createServerClient.js:28-36
auth: {
  ...options?.auth,
  flowType: "pkce",        // ← DESPUÉS del spread: el caller NO puede pisarlo
  autoRefreshToken: false,
  detectSessionInUrl: false,
  ...
}
```

Idéntico en `createBrowserClient.js:35-42`. **No existe la salida "usá implicit flow y listo".** Todo
`resetPasswordForEmail`/`signUp` que salga de `lib/supabase/client.ts` va a mandar `code_challenge`.

Y el canje exige el verifier del mismo navegador:

```js
// node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:1465-1471
async _exchangeCodeForSession(authCode) {
  const storageItem = await getItemAsync(this.storage, `${this.storageKey}-code-verifier`);
  const [codeVerifier, redirectType] = (storageItem ?? '').split('/');
  if (!codeVerifier && this.flowType === 'pkce') {
    throw new AuthPKCECodeVerifierMissingError();
  }
```

[CITED: supabase.com/docs/guides/auth/sessions/pkce-flow] — *"the code exchange must be initiated on the
same browser and device where the flow was started."*

**Por qué esto mata `code` para los mails, incluso en el mismo celular:** Gmail/Outlook abren los links en
un **webview in-app**, que **no comparte cookies** con el Chrome/Safari donde el usuario pidió el reset. El
verifier vive en una cookie de nuestro dominio (storage de `ssr` = cookies) → el webview no la tiene →
`AuthPKCECodeVerifierMissingError`. No es un caso borde: es el camino feliz de mobile.

### H-04 — Un `layout.tsx` en `(auth)` rompe D-10. Hace falta un route group anidado. [VERIFICADO]

`app/(auth)/` hoy tiene **solo** `login/` y `register/` — **no existe `layout.tsx`**. D-07 pide layout
compartido para login+forgot+reset; **D-10 prohíbe que `/register` lo herede**. Un `app/(auth)/layout.tsx`
envuelve **todos** los hijos del grupo → **arrastra `/register` al split y viola D-10**.

**Solución (URLs no cambian):**

```
app/(auth)/
├── (split)/
│   ├── layout.tsx          ← panel Bauhaus, extraído de login/page.tsx:48-82 (D-07/D-08)
│   ├── login/page.tsx      ← se mueve
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
└── register/page.tsx       ← queda AFUERA del split. D-10 respetado.
```

`/auth/callback` **no vive acá**: `(auth)` es route group (no aporta URL), y el callback necesita el path
literal `/auth/callback` → **`app/auth/callback/route.ts`**, carpeta nueva.

### H-05 — El UAT local está bloqueado hoy: Docker abajo. Y `[inbucket]` está deprecado. [VERIFICADO]

| Chequeo | Resultado |
|---------|-----------|
| `docker info` | **DOWN** — Docker Desktop no está corriendo |
| `curl 127.0.0.1:54324` (capturador de mails) | **000** (sin respuesta) |
| `curl 127.0.0.1:54321/auth/v1/health` | **000** (sin respuesta) |
| `config.toml:105-108` | `[inbucket] enabled = true`, `port = 54324` — **encendido en config** |
| `supabase status` (CLI 2.109.1) | `WARN: config section [inbucket] is deprecated. Please use [local_smtp] instead.` |

**Buena noticia:** el capturador **NO está apagado a propósito** (a diferencia de `studio`, `storage`,
`analytics`, que sí tienen `enabled = false`). Está `enabled = true`. **El UAT local es posible** — solo
requiere prender Docker Desktop y `npx supabase start`. **No es un blocker; es un pre-requisito del UAT
que el plan debe escribir explícito.**

- **URL del capturador: `http://127.0.0.1:54324`** (interfaz web, lee todos los mails locales).
- **Deprecación:** `[inbucket]` sigue funcionando (el CLI lo parsea y avisa). Como D-23 **ya obliga a tocar
  `config.toml`**, es el momento barato de renombrar a `[local_smtp]` y sacar el warning. **Opcional, no
  bloqueante** — si se hace, verificar el nombre de las claves contra el CLI 2.109.1 antes de commitear
  [NO VERIFICADO: no confirmé el shape exacto de `[local_smtp]`].

### H-06 — Cuidado: `vitest.setup.ts` carga `.env.local` = PROD. [VERIFICADO]

`vitest.setup.ts:13` hace `config({ path: '.env.local' })` y **`.env.local` apunta a prod**
(`tpvbjwqzskzkevepcwyb.supabase.co`, verificado). La línea 20 lo pisa con `.env.test.local` (gitignored)
**si existe**. **Los tests de auth de esta fase NO deben tocar Supabase** — que sean **puros** (ver
§Validation Architecture). Un test de integración que llame `signUp` contra `.env.local` **crea usuarios en
producción**.

### H-07 — D-16 tiene un desvío no contemplado: `/suspendido`. [VERIFICADO]

`app/(dashboard)/layout.tsx:23` → `if (!business) redirect('/onboarding')` — **D-16 confirmado**. Pero la
línea 31 agrega: `if (planStatus === 'suspended') redirect('/suspendido')`. Un dueño con plan suspendido que
resetea su contraseña **cae en `/suspendido`, no en `/dashboard`**. Es correcto y deseable — pero el
criterio de UAT no debería escribirse como "siempre termina en el panel".

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entrada y pantallas del reset (AUTH-01)**

- **D-01:** El link de recuperación se pide en una **página propia `/forgot-password`** (no dialog, no estado inline del login).
- **D-02:** Tras pedir el link, **el form se reemplaza por un estado "revisá tu mail" en el mismo card**: muestra a qué dirección se mandó + link "Volver al login". **Restricción de seguridad (NO negociable):** el mensaje es **idéntico exista o no la cuenta** (user enumeration).
- **D-03:** La contraseña nueva se setea en una **página propia `/reset-password`** con **dos campos: contraseña + confirmar contraseña**. Espeja el `/register` actual (`confirmPassword` con `.refine()` de zod).
- **D-04:** El link **"¿Olvidaste tu contraseña?"** va **debajo del botón "Entrar", arriba del link de registro**.
- **D-05:** Desde el estado "revisá tu mail" se puede **reenviar, con cooldown de 60s**. Motivo load-bearing: Supabase rate-limitea los mails (local: `email_sent = 2` por hora; prod lo gobierna el Dashboard).
- **D-06:** **`/forgot-password` es accesible con sesión activa** — NO se suma a `isAuthRoute`. Es el único camino para cambiar la contraseña.

**Layout y copy**

- **D-07:** `/forgot-password` y `/reset-password` usan el **layout split del login** vía **layout compartido del route group**.
- **D-08:** El panel naranja lleva **el mismo headline del login** en las 3 pantallas split (identidad de marca, no copy contextual).
- **D-09:** Copy de `/forgot-password`: **h1 "Recuperá tu cuenta"** + subtítulo **"Te mandamos un link para crear una contraseña nueva"**.
- **D-10:** El layout compartido cubre **solo login + forgot + reset**. **`/register` NO se migra al split.**

**Política de confirmación de email (AUTH-06)**

- **D-11:** **`enable_confirmations` = ON en prod: confirmar el mail es un GATE REAL.** `signUp` NO devuelve sesión.
- **D-12:** Tras "Crear cuenta gratis", **el card se reemplaza por un estado "revisá tu mail"** + reenviar con cooldown 60s. **Muere el `router.push('/onboarding')` + toast** de `register/page.tsx:56-57`.
- **D-13:** El link de confirmación cae, vía `/auth/callback` (`type=signup`), **derecho en `/onboarding`**.
- **D-14:** Registrarse con un **email que ya tiene cuenta** devuelve la **respuesta idéntica** a un alta nueva.
- **D-15:** **Si el research encuentra la confirmación OFF en prod, se prende** (checkpoint humano). El research **reporta cuántos usuarios sin confirmar hay en prod**.

**Después del reset (AUTH-02)**

- **D-16:** Tras setear la contraseña nueva, cae en **`/dashboard`**; si no tiene negocio el guard existente lo manda al onboarding.
- **D-17:** Al cambiar la contraseña **se cierran todas las otras sesiones menos la actual**. Precio aceptado: **cubrir con copy**.
- **D-18:** Link **vencido, ya usado, o entrada a `/reset-password` sin link** → cae en **`/forgot-password` en estado de error** ("Ese link ya venció o ya se usó. Pedí uno nuevo.") con el campo Email listo. **Nunca un rebote al login con toast.**
- **D-19:** **Vencimiento del link: 1 hora** — default de Supabase (`otp_expiry = 3600`), **no se toca**.

**Redirect URLs, previews y proxy**

- **D-20:** **Allowlist de Redirect URLs = solo prod + local.** **NO se allowlistean las previews con wildcard.** **Consecuencia asumida:** auth **no anda en preview** → UAT **en local + re-verificación en prod**.
- **D-21:** **`/auth` se suma a `MAINT_EXEMPT`** (`proxy.ts:21`). **`/forgot-password` y `/reset-password` NO se eximen.**
- **D-22:** Las **3 rutas nuevas entran a `KNOWN_PREFIXES`** (`proxy.ts:40-55`). **PERO `/forgot-password` y `/reset-password` NO se suman a `isAuthRoute`** (`lib/supabase/middleware.ts:31`) para preservar D-06.
- **D-23:** **`enable_confirmations = true` también en local** (`supabase/config.toml`).

### Claude's Discretion

- **Forma exacta de `/auth/callback`** — `token_hash` + `verifyOtp` vs `code` + `exchangeCodeForSession`. Restricción fija (D-13 + ROADMAP): el handler rutea `recovery`/`signup`/`oauth` y Phase 5 lo reusa **sin reescribirlo**. Decidir también una ruta vs subrutas. → **Resuelto en §Decisión.**
- **Cómo se elimina el token de la URL** tras el canje. → **Resuelto en §Pitfall 3.**
- **Copy exacto** de: estado "revisá tu mail" (D-02, D-12), aviso de link vencido (D-18), cartel de sesiones cerradas (D-17), h1/subtítulo de `/reset-password`.
- **Forma del layout compartido** del route group `(auth)` sin romper `/register`. → **Resuelto en H-04.**
- **Mecánica del cooldown de 60s** (D-05) y si se comparte helper con el card de register (D-12).
- **Validación de la contraseña nueva** (D-03): mínimo 6 (`minimum_password_length = 6`); validación inline onBlur de Phase 2 (D-08).

### Deferred Ideas (OUT OF SCOPE)

- **Pantalla de "cambiar contraseña" dentro del panel** — fase propia.
- **Unificar `/register` al layout split del login** — rediseño de login/register **explícitamente fuera de scope** en REQUIREMENTS.
- **Mail de bienvenida propio por Resend** — capacidad nueva, ni MAIL-01 ni esta fase.
- **NO se construye Google/OAuth** (Phase 5 — el callback se deja preparado). **NO se brandean los mails** (Phase 6). **NO se toca el wizard de onboarding.**

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **AUTH-01** | Un dueño que olvidó su contraseña puede pedir un link de recuperación desde el login, poniendo su email. | `resetPasswordForEmail(email, { redirectTo })` — firma verificada (`GoTrueClient.d.ts:2037-2040`). Mitigación de enumeration: **ignorar el `error` de retorno** para la UI (§Pitfall 4). Cooldown 60s por `email_sent = 2/h` (`config.toml:199`). |
| **AUTH-02** | Con ese link, el dueño setea una contraseña nueva y entra a su panel. | `verifyOtp({ token_hash, type: 'recovery' })` (§Decisión) → sesión en cookies → `/reset-password` → `updateUser({ password })` → `signOut({ scope: 'others' })` (D-17, verificado `types.d.ts:1566`) → `/dashboard` (guard `layout.tsx:23` verificado, ojo H-07). |
| **AUTH-06** | El registro es honesto sobre la confirmación. | **H-01: confirmación ON en prod, verificado.** El bug está vivo. `signUp({ email, password, options: { emailRedirectTo } })` → estado "revisá tu mail" (D-12) → link `type=signup` → `/onboarding` (D-13). |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pedir el link de recuperación | Browser / Client | GoTrue | El PKCE challenge se genera en el cliente; y es un form interactivo con cooldown (D-05). |
| Canje del token → sesión | **API / Route Handler (Node)** | GoTrue | Debe escribir cookies `httpOnly` de sesión. **Nunca en el cliente.** |
| Validar destino (anti open redirect) | **API / Route Handler** | — | Es control de seguridad: **jamás** en el cliente. |
| Setear la contraseña nueva | Browser / Client | GoTrue | `updateUser` requiere la sesión ya establecida por el callback. Form con validación inline (D-03). |
| Cerrar otras sesiones (D-17) | Browser / Client | GoTrue | `signOut({scope:'others'})` sobre la sesión actual, junto al `updateUser`. |
| Refresh de sesión / guards | Frontend Server (Edge, `proxy.ts`) | — | Ya existe; solo se suman prefijos (D-21, D-22). |
| Allowlist de Redirect URLs | **Supabase Dashboard** | — | Checkpoint humano. Es la defensa de fondo (D-20). |
| Mecánica del link del mail | **Supabase Dashboard (templates)** | — | **Checkpoint humano — ver H-02.** |

---

## Decisión: la forma de `/auth/callback`

> **Esto es una recomendación decidida, no un menú.**

### Veredicto

**Una sola ruta — `app/auth/callback/route.ts` — con dispatch por parámetro presente:**

| Parámetro entrante | Método | Flujo | Fase |
|--------------------|--------|-------|------|
| `token_hash` + `type` | `verifyOtp({ token_hash, type })` | `recovery`, `signup` | **Phase 4** |
| `code` | `exchangeCodeForSession(code)` | `oauth` | **Phase 5 (suma la rama)** |
| ninguno | — | error → `/forgot-password?error=invalid` | Phase 4 |

### Por qué `token_hash` y no `code` (evidencia, no memoria)

| Evidencia | Fuente | Estado |
|-----------|--------|--------|
| `ssr` fuerza `flowType: "pkce"`, no pisable | `node_modules/@supabase/ssr/dist/main/createServerClient.js:33` y `createBrowserClient.js:40` | [VERIFICADO] |
| `exchangeCodeForSession` exige `code_verifier` de storage; si falta tira `AuthPKCECodeVerifierMissingError` | `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:1465-1471` | [VERIFICADO] |
| El verifier se guarda en el navegador que **inició** el flujo, con sufijo `/recovery` | `.../lib/helpers.js:241-251` (`getCodeChallengeAndMethod`) | [VERIFICADO] |
| *"the code exchange must be initiated on the same browser and device where the flow was started"* | [CITED: supabase.com/docs/guides/auth/sessions/pkce-flow] | [CITED] |
| `verifyOtp({ token_hash, type })` no toca storage → stateless, cross-device | `types.d.ts:697-702` (`VerifyTokenHashParams` = solo `token_hash` + `type`) | [VERIFICADO] |
| El doc oficial de SSR usa `token_hash` + `verifyOtp` y template con `{{ .TokenHash }}` | [CITED: supabase.com/docs/guides/auth/passwords] | [CITED] |

**El clavo en el ataúd de `code`:** las apps de mail abren links en **webview in-app**, que no comparte
cookies con el navegador del usuario. `code` fallaría en el camino feliz de mobile, no en un borde.

### Cómo Phase 5 suma `oauth` sin reescribir

Los mecanismos **divergen en el canje** (`verifyOtp` vs `exchangeCodeForSession` — OAuth **sí** necesita
`code`+PKCE, y ahí el verifier **sí existe**: el mismo navegador arrancó el flujo) pero **convergen en todo
lo demás**: validación de entrada, tabla de destinos, manejo de error, y borrado del token de la URL.

→ **Estructurar el handler en 4 pasos, con el paso 2 como el único punto de extensión:**

```
1. PARSE + VALIDAR        (compartido — no cambia en Phase 5)
2. CANJEAR                ← ÚNICO switch. Phase 4: rama token_hash.
                            Phase 5: AGREGA la rama `code`. No toca 1, 3 ni 4.
3. RESOLVER DESTINO       (compartido — Phase 5 agrega 1 fila: 'oauth' → '/dashboard')
4. REDIRECT + SCRUB       (compartido — no cambia en Phase 5)
```

**Una ruta, no subrutas.** Motivos: (a) D-13 y el ROADMAP fijan "un handler que rutea tres flujos";
(b) los pasos 1/3/4 son idénticos — subrutas los duplicarían y el **endurecimiento anti-open-redirect se
desincronizaría** entre copias, que es justo lo que la threat note de Phase 5 pide evitar
(*"verificar que el callback endurecido allá siga endurecido acá"*); (c) una sola URL en la allowlist del
Dashboard (D-20 pide allowlist mínima).

> **Nota:** el doc oficial usa **dos** rutas (`/auth/confirm` para mails, `/auth/callback` para OAuth). Se
> **descarta a propósito**: D-13 + ROADMAP fijan una sola, y el dispatch por parámetro la satisface sin
> perder nada. La divergencia con el doc es de **organización de archivos**, no de mecánica: las llamadas
> a `verifyOtp`/`exchangeCodeForSession` son idénticas a las del doc.

### Pieza testeable

Extraer los pasos **1** y **3** a **`lib/auth/callback.ts`** como funciones **puras** (sin Supabase, sin
`next/headers`): `parseCallbackParams(searchParams)` y `resolveDestination(type)`. Es lo que hace que la
allowlist y el ruteo por tipo sean **unit-testeables sin red** (§Validation Architecture) — y respeta el
patrón del repo (`lib/crm-reports.ts`, `lib/booking-core` puros + testeados).

### Tabla de destinos (paso 3) — derivada server-side, sin reflejar nada

| `type` | Destino | Decisión |
|--------|---------|----------|
| `recovery` | `/reset-password` | D-03 |
| `signup` | `/onboarding` | D-13 |
| `oauth` *(Phase 5)* | `/dashboard` | — |
| inválido / ausente / error | `/forgot-password?error=invalid_link` | D-18 |

**Phase 4 NO acepta parámetro `next`/`redirect_to` propio.** Los destinos están fijados por D-13/D-16/D-18
→ **no hace falta reflejar nada**. La mejor defensa contra open redirect es **no tener superficie**: si no
hay parámetro que reflejar, no hay bug que introducir. Si Phase 5 necesitara "volver a donde estabas",
que valide contra path relativo (§Pitfall 2) — pero **no se construye especulativamente acá**.

---

## Standard Stack

**Cero dependencias nuevas.** Todo sale de lo ya instalado.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | **0.10.3** [VERIFICADO: `node_modules`] | `createServerClient` con cookies para el route handler | Ya es el estándar del repo (`lib/supabase/server.ts`) |
| `@supabase/supabase-js` / `@supabase/auth-js` | **2.106.2** [VERIFICADO: `node_modules`] | `verifyOtp`, `resetPasswordForEmail`, `updateUser`, `signOut` | Idem |
| `next` | **16.2.7** [VERIFICADO: `package.json:29`] | Route handler + `NextResponse.redirect` | — |
| `zod` | ^4.4.3 | Schemas de los forms | Patrón del repo (`register/page.tsx:17-24`) |
| `react-hook-form` + `@hookform/resolvers` | ^7.77 / ^5.4 | Forms | Idem |
| `vitest` | **^4.1.9** [VERIFICADO: `package.json:58`] | Tests de las piezas puras | 30+ archivos de test ya en el repo |

### Firmas verificadas (contra `node_modules/`, NO de memoria)

```ts
// @supabase/auth-js/dist/module/GoTrueClient.d.ts:2037-2040   [VERIFICADO]
resetPasswordForEmail(email: string, options?: {
  redirectTo?: string
  captchaToken?: string
}): Promise<{ data: {}; error: null } | { data: null; error: AuthError }>
// ⚠ NO existe `emailRedirectTo` acá: es `redirectTo`. En signUp/resend SÍ es `emailRedirectTo`.

// GoTrueClient.d.ts:1161 + lib/types.d.ts:697-704               [VERIFICADO]
verifyOtp(params: VerifyOtpParams): Promise<AuthResponse>
interface VerifyTokenHashParams { token_hash: string; type: EmailOtpType }
type EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email' | (string & {})
// ⚠ `VerifyTokenHashParams` NO acepta `options.redirectTo`. El destino lo decide NUESTRO handler.

// GoTrueClient.d.ts:765                                          [VERIFICADO]
exchangeCodeForSession(authCode: string): Promise<AuthTokenResponse>   // ← Phase 5

// GoTrueClient.d.ts:1609                                         [VERIFICADO]
updateUser(attributes: UserAttributes, options?: { emailRedirectTo?: string }): Promise<UserResponse>

// GoTrueClient.d.ts:1935 + lib/types.d.ts:1555-1567             [VERIFICADO]
signOut(options?: SignOut): Promise<{ error: AuthError | null }>
type SignOut = { scope?: 'global' | 'local' | 'others' }
```

### D-17 es implementable: `scope: 'others'` existe [VERIFICADO]

Doc del propio paquete (`GoTrueClient.d.ts:1930-1933`):

> `@example Sign out of all other sessions, keep the current one`
> `const { error } = await supabase.auth.signOut({ scope: 'others' })`

Y `types.d.ts:1560-1565`: *"Others means all other sessions except the current one. **When using others,
there is no sign-out event fired on the current session!**"* → exactamente D-17: cierra las otras, **no**
mata la actual. **D-17 no necesita alternativa.**

⚠ **Trampa de orden:** `updateUser({ password })` **primero**, `signOut({ scope: 'others' })` **después**.
Al revés, la sesión actual podría quedar sin token válido para autorizar el `updateUser`.
⚠ [NO VERIFICADO] Si GoTrue **ya** revoca las otras sesiones por sí solo al cambiar la contraseña
(`secure_password_change = false`, `config.toml:228`), el `signOut({scope:'others'})` sería redundante pero
**inofensivo**. **Verificar en el UAT** (criterio: sesión en otro navegador queda muerta), no asumir.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `token_hash` + `verifyOtp` | `code` + `exchangeCodeForSession` | **Descartado (H-03):** rompe cross-device y en webviews in-app de mail. Ahorra el cambio de template (H-02) a cambio de romper el camino feliz de mobile. |
| Una ruta con dispatch | Dos rutas (`/auth/confirm` + `/auth/callback`, el patrón del doc) | **Descartado:** viola D-13/ROADMAP, duplica el endurecimiento, y suma URL a la allowlist (D-20). |
| Destino derivado de `type` | Parámetro `next` validado | **Descartado en Phase 4:** superficie de open redirect sin beneficio (los destinos son fijos). |
| Flujo implicit (fragmento) | — | **Imposible:** `ssr` fuerza PKCE (H-03) y el servidor no puede leer un fragmento `#`. |

---

## Package Legitimacy Audit

**No aplica: esta fase NO instala ningún paquete externo.** Todo el trabajo se hace con dependencias ya
presentes en `package.json` y verificadas en `node_modules/` (`@supabase/ssr` 0.10.3, `@supabase/supabase-js`
2.106.2, `next` 16.2.7, `zod`, `react-hook-form`, `vitest` 4.1.9).

**Paquetes removidos por veredicto [SLOP]:** ninguno.
**Paquetes marcados [SUS]:** ninguno.

---

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────────────┐
   (D-06: accesible    │  /forgot-password        [Client]        │
    CON sesión)        │  form email → resetPasswordForEmail(     │
                       │    email, { redirectTo: <APP>/auth/      │
                       │             callback?type=recovery })    │
                       │  ── SIEMPRE muestra "revisá tu mail" ────┼── D-02/D-14: mismo
                       │     (ignora el error → anti-enumeration) │   mensaje exista o no
                       └───────────────┬──────────────────────────┘
                                       │ POST /auth/v1/recover
                                       ▼
                          ┌────────────────────────┐
                          │  GoTrue (Supabase)     │
                          │  genera TokenHash,     │
                          │  manda el mail         │
                          └───────────┬────────────┘
                                      │  ⚠ H-02: el href del TEMPLATE debe ser
                                      │  /auth/callback?token_hash={{ .TokenHash }}
                                      │  &type=recovery  (NO {{ .ConfirmationURL }})
                                      ▼
   ╔═══════════════════════════════════════════════════════════════════════╗
   ║  app/auth/callback/route.ts   [Route Handler · Node · anon+cookies]   ║
   ║  ┌─ 1. PARSE + VALIDAR ────────────── lib/auth/callback.ts (PURO) ──┐ ║
   ║  │     token_hash? type ∈ {recovery,signup}?                        │ ║
   ║  └──────────────────────┬───────────────────────────────────────────┘ ║
   ║  ┌─ 2. CANJEAR ─────────▼──────────── ÚNICO punto de extensión ─────┐ ║
   ║  │   token_hash → verifyOtp()          ← Phase 4                    │ ║
   ║  │   code       → exchangeCodeForSession()  ← Phase 5 AGREGA acá    │ ║
   ║  └──────────────────────┬───────────────────────────────────────────┘ ║
   ║              ok ────────┤──────── error (vencido/usado/ausente)       ║
   ║  ┌─ 3. DESTINO ─────────▼──────────── lib/auth/callback.ts (PURO) ──┐ ║
   ║  │   recovery→/reset-password · signup→/onboarding                  │ ║
   ║  │   error →/forgot-password?error=invalid_link      (D-18)         │ ║
   ║  └──────────────────────┬───────────────────────────────────────────┘ ║
   ║  ┌─ 4. REDIRECT + SCRUB ▼─────────────────────────────────────────┐   ║
   ║  │   NextResponse.redirect(URL LIMPIA)  ← token FUERA de la barra │   ║
   ║  │   + Set-Cookie (sesión)  + Referrer-Policy: no-referrer        │   ║
   ║  └────────────────────────────────────────────────────────────────┘   ║
   ╚═══════════════╤═══════════════════════════════╤═══════════════════════╝
                   │ 303 + cookies de sesión       │ 303 (sin sesión)
                   ▼                               ▼
   ┌──────────────────────────────┐   ┌──────────────────────────────────┐
   │ /reset-password   [Client]   │   │ /forgot-password (estado ERROR)  │
   │ 2 campos (D-03)              │   │ "Ese link ya venció o ya se usó" │
   │ 1. updateUser({password})    │   │ + campo Email listo    (D-18)    │
   │ 2. signOut({scope:'others'}) │   └──────────────────────────────────┘
   │    (D-17 · orden importa)    │
   └──────────────┬───────────────┘
                  ▼  router.push('/dashboard')
   ┌───────────────────────────────────────────────────────────┐
   │ (dashboard)/layout.tsx  [Server · guard YA EXISTE]        │
   │  !user → /login · !business → /onboarding  (D-16, L:23)   │
   │  plan_status==='suspended' → /suspendido   (H-07, L:31)   │
   └───────────────────────────────────────────────────────────┘

   ── proxy.ts (Edge) intercepta TODO lo de arriba ──
      MAINT_EXEMPT   +'/auth'                      (D-21)
      KNOWN_PREFIXES +'/auth' +'/forgot-password' +'/reset-password'   (D-22)
      isAuthRoute    SIN CAMBIOS  ← preserva D-06. NO tocar.
```

### Recommended Project Structure

```
app/
├── auth/callback/route.ts        # NUEVO — path literal, fuera de todo route group
└── (auth)/
    ├── (split)/                  # NUEVO route group anidado (H-04)
    │   ├── layout.tsx            # panel Bauhaus (D-07/D-08) ← extraído de login:48-82
    │   ├── login/page.tsx        # MOVIDO desde (auth)/login
    │   ├── forgot-password/page.tsx   # NUEVO (D-01, D-02, D-05, D-09, D-18)
    │   └── reset-password/page.tsx    # NUEVO (D-03, D-17)
    └── register/page.tsx         # SIN MOVER — D-10. Solo cambia onSubmit (D-12).
lib/
└── auth/callback.ts              # NUEVO — parse + destinos, PURO y testeable
```

### Pattern 1: Route handler del callback (mecánica verificada)

```ts
// app/auth/callback/route.ts
// Fuentes: supabase.com/docs/guides/auth/passwords (verifyOtp+token_hash)
//          node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'   // anon + cookies. NUNCA admin.
import { parseCallbackParams, resolveDestination } from '@/lib/auth/callback'

export async function GET(request: NextRequest) {
  const parsed = parseCallbackParams(request.nextUrl.searchParams)  // puro, testeable

  const fail = () =>
    NextResponse.redirect(new URL('/forgot-password?error=invalid_link', request.url), 303)

  if (!parsed.ok) return fail()   // D-18: nunca al login con toast

  const supabase = await createClient()

  // Paso 2 — ÚNICO punto de extensión. Phase 5 agrega la rama `code`.
  const { error } = await supabase.auth.verifyOtp({
    token_hash: parsed.token_hash,
    type: parsed.type,            // 'recovery' | 'signup'
  })

  if (error) {
    console.error('[auth/callback] verifyOtp:', error.message)  // ⚠ nunca loguear el token
    return fail()                 // vencido / ya usado (D-18, D-19)
  }

  // Paso 4 — redirect a URL LIMPIA: el token sale de la barra y del Referer.
  const res = NextResponse.redirect(new URL(resolveDestination(parsed.type), request.url), 303)
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
```

**Por qué `NextResponse.redirect` y no `redirect()`:** el doc de Next 16 avisa que `redirect()` **lanza** y
debe ir **fuera** de `try/catch` [CITED: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md:50-52`].
`NextResponse.redirect` no lanza y **permite adjuntar headers/cookies a la misma respuesta** — que es
justo lo que necesita el callback (`Set-Cookie` de la sesión + `Referrer-Policy`).

**Por qué `303` y no el 307 default:** 307 **preserva el método**
[CITED: `.../redirect.md:212-214`]. Acá el navegador **debe** hacer GET del destino. 303 lo garantiza.

**`cookies()` es escribible en route handlers** → `lib/supabase/server.ts` sirve tal cual: su `setAll`
(líneas 15-24) persiste las cookies de sesión que crea `verifyOtp`. **No hay que escribir un cliente nuevo.**

### Pattern 2: `/forgot-password` anti-enumeration (D-02, D-14)

```ts
// El error se IGNORA a propósito para la UI. Ver Pitfall 4.
await supabase.auth.resetPasswordForEmail(data.email, {
  redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
})
setSent(true)   // SIEMPRE. Exista o no la cuenta. D-02.
```

### Anti-Patterns to Avoid

- **Service role en el callback:** `lib/supabase/admin.ts` bypassa RLS. El callback lo alcanza un **anónimo
  desde un link de mail**. Va con `lib/supabase/server.ts` (anon + cookies). [Skill `supabase-multitenant-rls`]
- **Reflejar `next`/`redirect_to` sin validar:** open redirect. En Phase 4 directamente **no existe el param**.
- **Loguear la URL completa del callback:** mete el `token_hash` en los logs de Vercel. Loguear solo
  `error.message`.
- **`redirect()` adentro de `try/catch`:** lanza `NEXT_REDIRECT` y el catch se lo come. [CITED: `redirect.md:50-52`]
  Ya mordió a este repo — ver la nota en `(dashboard)/layout.tsx:27-29` y la memoria `confirmdialog-no-redirect-gotcha`.
- **Sumar `/forgot-password` a `isAuthRoute`:** viola D-06 y deja sin salida al que tiene sesión y no
  recuerda la contraseña.
- **Un `layout.tsx` directo en `(auth)/`:** arrastra `/register` al split y viola D-10 (H-04).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canje de token → sesión | Parsear el JWT / pegarle a `/auth/v1/verify` a mano | `supabase.auth.verifyOtp({token_hash,type})` | Maneja expiración, single-use, rotación de refresh token y el `Set-Cookie` correcto. |
| Escribir cookies de sesión | `res.cookies.set('sb-...')` a mano | `createServerClient` + `setAll` (`lib/supabase/server.ts`) | El doc del paquete avisa: implementar mal `getAll`/`setAll` **"will cause significant and difficult to debug authentication issues"** [VERIFICADO: `createServerClient.d.ts`]. |
| Expiración del link | Tabla propia de tokens + TTL | `otp_expiry = 3600` de GoTrue (D-19) | Ya existe, ya es single-use, ya está probado. |
| Validar la contraseña | Regex propio | `zod` + `minimum_password_length = 6` de GoTrue | GoTrue rechaza igual server-side; zod da el error inline (D-03). |
| Cerrar otras sesiones | Borrar refresh tokens por SQL | `signOut({ scope: 'others' })` | Existe y es exactamente D-17 [VERIFICADO: `types.d.ts:1566`]. |
| Anti-enumeration | Lógica "¿existe el mail?" | **No preguntar nunca** + mensaje fijo (D-02) | Cualquier rama condicional reintroduce el oráculo. |

**Key insight:** casi todo lo de esta fase **ya está resuelto adentro de GoTrue**. El código propio se
reduce a: **rutear, validar el destino, y no filtrar información**. Cada línea de auth hecha a mano es
superficie de ataque nueva en la única superficie donde un bug **entrega la cuenta entera**.

---

## Common Pitfalls

### Pitfall 1: El template default nunca entrega `token_hash` → el flujo "no anda" y nadie sabe por qué
**Qué sale mal:** se implementa `verifyOtp`, se testea, se deploya, y el link del mail cae en
`/forgot-password?error=invalid_link` **siempre**.
**Por qué pasa:** `{{ .ConfirmationURL }}` pasa por `/auth/v1/verify` y vuelve con `?code=`, no con
`?token_hash=`. El handler no encuentra `token_hash` → falla el parse → error. **El código está bien; el
template está mal.**
**Cómo evitarlo:** H-02 — el checkpoint humano **debe** editar el href de los 2 templates **antes** del UAT.
**Señal temprana:** el error es `invalid_link` en el parse (paso 1), **no** un error de `verifyOtp` (paso 2).
Loguear distinto cada paso hace el diagnóstico obvio en 5 segundos.

### Pitfall 2: Open redirect por el parámetro de retorno
**Qué sale mal:** `?next=https://evil.com` → el callback autentica y redirige al atacante **con la sesión ya
creada**.
**Por qué pasa:** `new URL(next, request.url)` con `next` absoluto **ignora la base** y devuelve el dominio
del atacante. Validar con `startsWith('/')` tampoco alcanza: **`//evil.com` empieza con `/`** y el navegador
lo lee como protocol-relative.
**Cómo evitarlo:** **Phase 4 no acepta el param.** Destino de la tabla por `type`. Si Phase 5 lo necesita:
`next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')`, y **testear los tres bypasses**.
**Señales:** cualquier `searchParams.get('next')` que llegue a un `redirect` sin pasar por la función pura.

### Pitfall 3: Fuga del `token_hash` (URL / `Referer` / logs)
**Qué sale mal:** el token queda en la barra, se comparte en un screenshot, o aparece en los logs de Vercel.
**Por qué pasa:** viaja en la query string, que es lo que se loguea y lo que va en `Referer`.
**Cómo evitarlo (las 4 capas, todas baratas):**
1. **El callback nunca renderiza HTML** — solo 303. Sin subrecursos no hay request saliente que lleve
   `Referer`. Es la mitigación principal.
2. **Redirect a URL limpia**: el destino (`/reset-password`) **no lleva el token**. Sale de la barra en el
   mismo request.
3. **`Referrer-Policy: no-referrer`** en la respuesta del callback (defensa en profundidad).
4. **Loguear `error.message`, nunca `request.url`.**
**Residual aceptado:** Vercel loguea el path de la request → el `token_hash` queda en los logs de acceso.
**Mitigado por diseño:** es **single-use** (`verifyOtp` lo quema) y **vence en 1h** (D-19). Un token de los
logs ya está consumido. **Documentarlo en `/gsd:secure-phase` como riesgo aceptado, no ignorado.**

### Pitfall 4: User enumeration por el `error` de `resetPasswordForEmail`
**Qué sale mal:** `if (error) toast.error(...)` → el atacante distingue mail existente de inexistente.
**Por qué pasa:** el reflejo de todo dev es mostrar el error.
**Cómo evitarlo:** **descartar el `error` para la UI** y mostrar el estado "revisá tu mail" **siempre**
(D-02). Loguearlo server-side si se quiere, nunca mostrarlo.
**Señal:** cualquier rama en el `onSubmit` de `/forgot-password` que dependa del resultado.
⚠ **Ojo con el rate limit como oráculo lateral:** con `email_sent = 2/h`, el 3er intento devuelve error de
rate limit — que **también** puede diferenciar. El cooldown de 60s (D-05) lo tapa en la UI.

### Pitfall 5: `/reset-password` alcanzable sin sesión válida
**Qué sale mal:** si la página no exige sesión, `updateUser({password})` corre con la sesión de **quien sea**
→ el atacante logueado cambia... su propia contraseña (no la de otro, porque `updateUser` usa el JWT). El
riesgo real es más chico de lo que suena, **pero** una `/reset-password` que se renderiza sin sesión da una
pantalla muerta (viola el criterio 2).
**Cómo evitarlo:** `/reset-password` verifica `getUser()`; sin usuario → `/forgot-password?error=invalid_link`
(D-18). **No** agregarla a `isDashboardRoute` del proxy: el redirect iría a `/login`, que es justo el "error
opaco" que D-18 prohíbe. **El guard va en la página, no en el proxy.**

### Pitfall 6: Las tres listas del proxy (D-21/D-22) — verificado línea por línea
Leí `proxy.ts` y `lib/supabase/middleware.ts` completos. **Son 3 listas + 1 matcher. No hay una cuarta.**

| # | Lista | Archivo:línea | Efecto exacto | Qué se suma |
|---|-------|---------------|---------------|-------------|
| 1 | `MAINT_EXEMPT` | `proxy.ts:21` | Si NO matchea y hay mantenimiento → **503 HTML**. Match: `pathname === p \|\| startsWith(p+'/')` (L:64) | **`'/auth'`** (D-21). `/forgot-password` y `/reset-password` **NO**. |
| 2 | `KNOWN_PREFIXES` | `proxy.ts:40-55` | Si NO matchea (y no es `/`) → **`NextResponse.next()` sin `updateSession`** (L:77-79) → **la cookie de sesión no se refresca** | **`'/auth'`, `'/forgot-password'`, `'/reset-password'`** (D-22) |
| 3 | `isAuthRoute` | `lib/supabase/middleware.ts:31` | `user && isAuthRoute` → **redirect a `/dashboard`** (L:50-54) | **NADA.** Tocarla rompe D-06. |
| — | `config.matcher` | `proxy.ts:84-88` | Excluye `_next/static`, `_next/image`, `favicon.ico` e imágenes | **Nada**: `/auth/callback` ya matchea. **No es una 4ª lista.** |

**Verificaciones puntuales:**
- `'/auth'` en `MAINT_EXEMPT` cubre `/auth/callback` por el `startsWith(p + '/')` de la L:64. ✔
- `isDashboardRoute` (`middleware.ts:32-42`) **no** matchea ninguna ruta nueva → **sin rebote a `/login`**. ✔
  **D-06 se preserva solo**: alcanza con **no tocar** `isAuthRoute`.
- **La trampa real:** `KNOWN_PREFIXES` e `isAuthRoute` viven en **archivos distintos** (`proxy.ts` vs
  `lib/supabase/middleware.ts`). El reflejo de "agrego la ruta a las listas de auth" toca las dos y **rompe
  D-06 sin que ningún test lo note** (el bug es: "con sesión abierta, /forgot-password me tira al
  dashboard"). **D-22 ya lo anticipó. El plan debe decir explícitamente NO TOCAR `isAuthRoute`.**

### Pitfall 7: `additional_redirect_urls` local está mal (typo preexistente)
`config.toml:163` → `additional_redirect_urls = ["https://127.0.0.1:3000"]` — **`https`**, pero
`site_url` (L:159) es **`http://127.0.0.1:3000`**. El local no corre TLS (`[api.tls] enabled = false`, L:28).
Esa entrada **no matchea nada útil hoy**. Como el `redirectTo` del callback debe estar allowlisteado,
**hay que agregar `http://127.0.0.1:3000/auth/callback`** (y ojo: `localhost` ≠ `127.0.0.1` para el matcher).
**Definir con qué host se hace el UAT local y ser consistente**, o el link vuelve rebotado.

---

## Runtime State Inventory

> Esta fase **no** es un rename/refactor, pero **sí** cambia config de servicios vivos y estado de Auth.
> Se completa por eso.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `auth.users` en prod: **3 usuarios, 0 sin confirmar** [VERIFICADO read-only] | **Ninguna.** D-15 no dispara. Sin migración, sin toques a mano. |
| **Live service config** | (a) **Redirect URLs** en Dashboard (D-20) — no está en git; (b) **Email templates** (`Reset password`, `Confirm signup`) — href debe cambiar (**H-02**); (c) `enable_confirmations` prod: **YA ON** (H-01) | (a) y (b) → **checkpoint humano**. (c) → **nada**. |
| **OS-registered state** | **Ninguno** — verificado: la fase no toca Task Scheduler, pm2 ni crons (`vercel.json` sigue con su cron diario, sin relación). | Ninguna |
| **Secrets/env vars** | **Ninguno nuevo.** El callback usa `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, ya presentes en Vercel. **`SUPABASE_SERVICE_ROLE_KEY` NO se usa en esta fase.** | Ninguna |
| **Build artifacts** | **Ninguno** — sin cambios de deps, sin regenerar `schema.sql` (no hay migración). | Ninguna |
| **Config versionada** | `supabase/config.toml`: `enable_confirmations` (L:226 `false`→`true`, D-23); `additional_redirect_urls` (L:163, Pitfall 7); `[inbucket]`→`[local_smtp]` (H-05, opcional) | Edición de código + `npx supabase stop && start` para que tome |

**Punto clave:** **esta fase NO tiene migración SQL.** No toca `public.*` ni RLS. El estado que cambia vive
en el **Dashboard de Supabase** (config externa) y en `config.toml` (versionado).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + npm | build/test | ✓ | — | — |
| `@supabase/ssr` | callback | ✓ | 0.10.3 [VERIFICADO] | — |
| `@supabase/supabase-js` | todo el flujo | ✓ | 2.106.2 [VERIFICADO] | — |
| Vitest | tests | ✓ | 4.1.9 [VERIFICADO] | — |
| Supabase CLI | UAT local | ✓ | 2.109.1 [VERIFICADO] | — |
| **Docker Desktop** | **Supabase local (UAT)** | **✗ ABAJO** [VERIFICADO: `docker info` falla] | — | **Prender Docker Desktop → `npx supabase start`.** Sin esto **no hay UAT local**. |
| **Capturador de mails** | **Ver el mail de reset (UAT)** | **✗ (por Docker)** — pero `enabled = true` en config (L:106) | — | Se levanta con `supabase start`. **URL: `http://127.0.0.1:54324`** |
| Supabase prod | verificación final | ✓ | `tpvbjwqzskzkevepcwyb` | — |
| Preview de Vercel | — | **N/A por decisión** (D-20) | — | **Auth no anda en preview. UAT = local + prod.** |

**Faltantes sin fallback:** ninguno.
**Faltantes con fallback:** Docker Desktop / capturador de mails — **se resuelven prendiendo Docker**. El
plan debe incluirlo como **paso 0 explícito del UAT**, no darlo por sentado.

---

## Validation Architecture

**Framework detectado — la nota de `.claude/CLAUDE.md` que dice "No detectado / no hay framework de tests"
está DESACTUALIZADA.** [VERIFICADO]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **Vitest 4.1.9** [VERIFICADO: `package.json:58`] |
| Config file | `vitest.config.mts` (`environment: 'node'`, `tsconfigPaths()`, `react()`) [VERIFICADO] |
| Setup file | `vitest.setup.ts` — carga `.env.local` (**PROD**) y luego `.env.test.local` si existe (**⚠ H-06**) |
| Quick run command | `npx vitest run lib/auth/` |
| Full suite command | `npm test` (= `vitest run`) |
| Suite existente | 30+ archivos (`lib/*.test.ts`, `test/*.test.ts`, `app/(crm)/**/*.test.ts`) |
| Gate de CI | `tsc --noEmit` + `vitest run` (memoria: cierre de v0.11) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-02 | `parseCallbackParams` rechaza `type` fuera de `{recovery,signup}` | unit | `npx vitest run lib/auth/callback.test.ts` | ❌ Wave 0 |
| AUTH-02 | `parseCallbackParams` rechaza `token_hash` ausente/vacío | unit | idem | ❌ Wave 0 |
| AUTH-02 | `resolveDestination('recovery') === '/reset-password'` (D-18/D-03) | unit | idem | ❌ Wave 0 |
| AUTH-06 | `resolveDestination('signup') === '/onboarding'` (D-13) | unit | idem | ❌ Wave 0 |
| AUTH-02 | **Open redirect:** si Phase 5 suma `next`, rechaza `//evil.com`, `https://evil.com`, `/\evil.com` | unit | idem | ❌ Wave 0 |
| AUTH-02 | **Regresión de proxy:** `/forgot-password` ∈ `KNOWN_PREFIXES` **y** ∉ `isAuthRoute` (D-06/D-22) | unit | `npx vitest run test/proxy-auth-routes.test.ts` | ❌ Wave 0 |
| AUTH-01 | Schema zod de `/forgot-password` (email válido) | unit | `npx vitest run lib/auth/` | ❌ Wave 0 |
| AUTH-02 | Schema zod de `/reset-password` (min 6 + `.refine()` match, D-03) | unit | idem | ❌ Wave 0 |
| AUTH-01 | **Llega el mail de recuperación** | **manual (UAT)** | — inbucket `:54324` | manual |
| AUTH-02 | **Link → contraseña nueva → adentro del panel** | **manual (UAT)** | — | manual |
| AUTH-02 | **Contraseña vieja no sirve; la nueva sí** | **manual (UAT)** | — | manual |
| AUTH-02 | **D-17: otra sesión queda muerta, la actual sobrevive** | **manual (UAT)** | — 2 navegadores | manual |
| AUTH-02 | **Link vencido/reusado → `/forgot-password` en error** (D-18) | **manual (UAT)** | — clickear 2 veces | manual |
| AUTH-06 | **Registro → "revisá tu mail" → link → `/onboarding`** | **manual (UAT)** | — | manual |

**Por qué tan poco automatizado, y por qué está bien:** el valor de esta fase está en **GoTrue + config del
Dashboard + el mail**, que no son testeables sin red ni sin secretos. Lo que **sí** se automatiza es
**exactamente donde vive el riesgo de seguridad propio**: la validación de entrada, la tabla de destinos, y
la regresión de las listas del proxy. **Todo puro, todo sin red, todo sin credenciales.**

> ⚠ **H-06 — regla dura:** **ningún test de esta fase toca Supabase.** `vitest.setup.ts:13` carga
> `.env.local` = **prod**. Un test que llame `signUp`/`resetPasswordForEmail` **crea usuarios y quema la
> cuota de mails en producción**. Piezas puras, o nada.

### Sampling Rate

- **Por commit de tarea:** `npx vitest run lib/auth/ test/proxy-auth-routes.test.ts`
- **Por merge de wave:** `npm test` + `npx tsc --noEmit`
- **Phase gate:** suite completa verde **antes** de `/gsd:verify-work`, y **`/gsd:secure-phase` es
  obligatorio** (superficie de auth).

### Wave 0 Gaps

- [ ] `lib/auth/callback.ts` — **extraer las piezas puras primero**; sin esto no hay nada testeable
- [ ] `lib/auth/callback.test.ts` — cubre AUTH-02 (parse + destinos + open redirect)
- [ ] `test/proxy-auth-routes.test.ts` — regresión D-06/D-22 (la trampa de las 3 listas)
- [ ] Framework install: **no hace falta** — Vitest 4.1.9 ya está

### UAT: cómo se corre (input del plan, no sorpresa — D-20)

**Auth NO anda en previews de Vercel (D-20).** Secuencia obligada:

1. **Paso 0 — prender Docker Desktop** (hoy está abajo, H-05) → `npx supabase start`
2. `config.toml`: `enable_confirmations = true` (D-23) + arreglar `additional_redirect_urls` (Pitfall 7)
3. **Editar los 2 templates locales** — H-02 aplica **también** en local. En local los templates se
   versionan vía `[auth.email.template.*]` con `content_path` (`config.toml:247-249` muestra el patrón
   comentado) → **ventaja: el href queda en el repo y el UAT local no depende del Dashboard**.
   [NO VERIFICADO: no confirmé el nombre exacto de las claves `recovery`/`confirmation`; verificar contra
   CLI 2.109.1 al planear]
4. UAT completo en local, leyendo los mails en **`http://127.0.0.1:54324`**
5. **Checkpoint humano** en el Dashboard de prod (Redirect URLs + href de los 2 templates)
6. **Re-verificación en prod** post-deploy — con **una cuenta de prueba**, no con las 3 reales (H-01)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| **V2 Authentication** | **sí — es el núcleo** | GoTrue: token single-use, `otp_expiry=3600` (D-19), `minimum_password_length=6`. **Nada hecho a mano.** |
| **V3 Session Management** | **sí** | Cookies vía `@supabase/ssr` (`httpOnly`, `SameSite`); `signOut({scope:'others'})` (D-17); rotación de refresh token (`config.toml:171`) |
| **V4 Access Control** | sí (acotado) | Guard de `/reset-password` en la página (Pitfall 5); guards del panel ya existen (`layout.tsx:23`) |
| **V5 Input Validation** | **sí** | `zod` en los forms + `parseCallbackParams` puro (allowlist de `type`, **nunca reflejar**) |
| **V6 Cryptography** | no (delegado) | PKCE/JWT/hashing 100% dentro de GoTrue. **Cero cripto propia.** |
| **V7 Error Handling / Logging** | **sí** | `console.error('[auth/callback] ...')` con `error.message` **solo**; **nunca `request.url`** (Pitfall 3) |

### Known Threat Patterns for Next.js 16 + Supabase Auth

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Open redirect** en el retorno del callback | Tampering / Spoofing | **No aceptar el param** (Phase 4). Destino de tabla por `type`. Allowlist del Dashboard sin wildcard (D-20). |
| **Fuga del `token_hash`** (URL / `Referer` / logs) | Information Disclosure | 303 sin HTML + URL limpia + `Referrer-Policy: no-referrer` + no loguear la URL (Pitfall 3) |
| **Reset sin sesión válida del token** | Elevation of Privilege | `verifyOtp` es la **única** fuente de sesión; `/reset-password` exige `getUser()` (Pitfall 5) |
| **User enumeration** en forgot/register | Information Disclosure | Respuesta idéntica (D-02, D-14); descartar el `error` (Pitfall 4); cooldown tapa el oráculo de rate limit (D-05) |
| **Reuso / expiración del link** | Replay | Single-use de GoTrue + `otp_expiry=3600` (D-19) → `/forgot-password?error=invalid_link` (D-18) |
| **Service role alcanzable desde un link de mail** | Elevation of Privilege | Callback usa **anon + cookies** (`lib/supabase/server.ts`). **Nunca `admin.ts`.** |
| **Account takeover por mail no verificado** | Spoofing | **Ya mitigado: confirmación ON en prod (H-01).** Phase 5 lo hereda resuelto. |
| **Sesión del intruso sobrevive al reset** | Elevation of Privilege | `signOut({ scope: 'others' })` (D-17) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/auth-helpers-nextjs` | **`@supabase/ssr`** | 2024 (deprecado) | Todo tutorial con `auth-helpers` **no aplica**. El repo ya usa `ssr`. ✔ |
| Implicit flow (`#access_token`) | **PKCE forzado por `ssr`** | `ssr` ≥ 0.x | El servidor **no puede** leer fragmentos → **el callback server-side exige `token_hash`** (H-03). |
| `{{ .ConfirmationURL }}` | **`{{ .TokenHash }}` + ruta propia** | Recomendación SSR actual | **H-02: template change obligatorio.** |
| `middleware.ts` | **`proxy.ts`** | Next 16 | Ya aplicado en el repo. [VERIFICADO: `proxy.ts` en la raíz] |
| `cookies.get/set/remove` | **`getAll`/`setAll`** | `ssr` 0.5+ | `get/set/remove` marcados `@deprecated` [VERIFICADO: `createServerClient.d.ts`]. `lib/supabase/server.ts` ya usa `getAll`/`setAll`. ✔ |

**Deprecado / desactualizado:**
- **`.claude/CLAUDE.md` §Frameworks: "No detectado. No hay framework de tests"** → **FALSO.** Vitest 4.1.9
  + 30+ archivos de test + `npm test` en CI. **Debería corregirse** (fuera de scope de esta fase).
- **`config.toml` `[inbucket]`** → deprecado a favor de `[local_smtp]` (CLI 2.109.1). Sigue funcionando (H-05).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Los rate limits de mail de **prod** (`email_sent`/hora) no son consultables sin Management API token; se asume que el Dashboard tiene el default (~4/h en free tier), distinto del local (`2/h`) | D-05 / Pitfall 4 | Bajo. El cooldown de 60s (D-05) protege igual. **Si el UAT en prod tira rate limit, es esto** — y se mira en el Dashboard, no se adivina. |
| A2 | El nombre exacto de las claves de `[auth.email.template.recovery]` / `.confirmation` con `content_path` en **CLI 2.109.1** no fue verificado (solo se vio el patrón comentado de `invite`, `config.toml:247-249`) | Validation Architecture §UAT paso 3 | Bajo. Se confirma en 1 min contra el config reference al planear. Si no existe, el UAT local edita el template desde el Studio local — **pero Studio está `enabled = false`** (L:95) → habría que prenderlo. |
| A3 | El shape exacto de la sección `[local_smtp]` que reemplaza `[inbucket]` no fue verificado | H-05 | Nulo. `[inbucket]` **funciona** (solo warnea). El rename es opcional. |
| A4 | Se asume que GoTrue **no** revoca las otras sesiones por sí solo al cambiar la contraseña (por eso D-17 necesita el `signOut({scope:'others'})` explícito). `secure_password_change = false` (L:228) | Standard Stack §D-17 | Nulo en la práctica: si GoTrue ya las revoca, el `signOut` es **redundante pero inofensivo**. **Se verifica en el UAT** (2 navegadores). |
| A5 | Se asume que los 3 usuarios de prod son cuentas reales/de prueba del dueño y que la re-verificación en prod se hará con una cuenta nueva de prueba | Validation Architecture §UAT paso 6 | Bajo. Confirmar con el usuario antes de tocar prod. |

---

## Open Questions

1. **¿El href de los templates se edita en Phase 4 o se adelanta MAIL-01?**
   - **Lo que sabemos:** el cambio de href es **obligatorio** para que el flujo funcione (H-02). El
     branding (idioma, marca, remitente) es Phase 6 y **no** es obligatorio acá.
   - **Lo que no está claro:** si el usuario prefiere aprovechar el viaje al Dashboard y brandear ya.
   - **Recomendación:** **NO adelantar.** Cambiar **solo el href** en Phase 4. Mantiene el alcance de
     MAIL-01 intacto (que era justo lo que el ROADMAP quería preservar) y deja el checkpoint de Phase 4
     chico y mecánico. **Es un ítem para el checkpoint humano, no una decisión de código.**

2. **`localhost` vs `127.0.0.1` en la allowlist local** (Pitfall 7)
   - **Lo que sabemos:** `site_url = http://127.0.0.1:3000`; la entrada de `additional_redirect_urls` tiene
     un typo (`https`). El matcher de Supabase es literal por host.
   - **Recomendación:** estandarizar en **`127.0.0.1`** (que ya es el `site_url`) y agregar
     `http://127.0.0.1:3000/auth/callback`. Documentar que el UAT local se abre en `127.0.0.1:3000`, **no**
     en `localhost:3000`, o el link vuelve rebotado.

3. **¿El plan mueve `login/page.tsx` a `(auth)/(split)/`?** (H-04)
   - **Lo que sabemos:** es la forma limpia de cumplir D-07 sin violar D-10. La URL `/login` **no cambia**.
   - **Lo que no está claro:** si mover un archivo recién tocado (quick `260716-ide`) genera fricción de
     merge.
   - **Recomendación:** hacerlo — el repo está en `main` limpio y sin ramas en juego para este workstream.
     Es `git mv` + extraer el panel; el diff se lee bien.

---

## Code Examples

### `lib/auth/callback.ts` — las piezas puras (el corazón testeable)

```ts
// Puro: sin Supabase, sin next/headers, sin red. Testeable con Vitest sin credenciales (H-06).
// Fuente del set de tipos: node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:704 [VERIFICADO]
import type { EmailOtpType } from '@supabase/supabase-js'

// Allowlist CERRADA. `EmailOtpType` incluye `(string & {})` → acepta cualquier string.
// Por eso NO se confía en el tipo: se valida contra este Set en runtime.
const ALLOWED_TYPES = new Set<string>(['recovery', 'signup'])   // Phase 5: + 'oauth'

const DESTINATIONS: Record<string, string> = {
  recovery: '/reset-password',   // D-03
  signup: '/onboarding',         // D-13
  // oauth: '/dashboard',        // ← Phase 5 agrega 1 fila. No reescribe nada.
}

export const INVALID_LINK_DEST = '/forgot-password?error=invalid_link'   // D-18

export type ParsedCallback =
  | { ok: true; token_hash: string; type: EmailOtpType }
  | { ok: false }

export function parseCallbackParams(params: URLSearchParams): ParsedCallback {
  const token_hash = params.get('token_hash')
  const type = params.get('type')
  if (!token_hash || !type) return { ok: false }
  if (!ALLOWED_TYPES.has(type)) return { ok: false }
  return { ok: true, token_hash, type: type as EmailOtpType }
}

export function resolveDestination(type: string): string {
  return DESTINATIONS[type] ?? INVALID_LINK_DEST   // nunca refleja input
}
```

### `lib/auth/callback.test.ts` — Wave 0

```ts
import { describe, it, expect } from 'vitest'
import { parseCallbackParams, resolveDestination, INVALID_LINK_DEST } from '@/lib/auth/callback'

const sp = (s: string) => new URLSearchParams(s)

describe('parseCallbackParams', () => {
  it('acepta recovery con token_hash', () => {
    expect(parseCallbackParams(sp('token_hash=abc&type=recovery')))
      .toEqual({ ok: true, token_hash: 'abc', type: 'recovery' })
  })
  it('rechaza type fuera de la allowlist', () => {
    // 'oauth' todavia NO: lo suma Phase 5. Este test es el recordatorio.
    for (const t of ['oauth', 'magiclink', 'email_change', 'invite', '../../etc'])
      expect(parseCallbackParams(sp(`token_hash=abc&type=${t}`)).ok).toBe(false)
  })
  it('rechaza token_hash ausente o vacio', () => {
    expect(parseCallbackParams(sp('type=recovery')).ok).toBe(false)
    expect(parseCallbackParams(sp('token_hash=&type=recovery')).ok).toBe(false)
  })
})

describe('resolveDestination', () => {
  it('mapea los tipos conocidos', () => {
    expect(resolveDestination('recovery')).toBe('/reset-password')   // D-03
    expect(resolveDestination('signup')).toBe('/onboarding')         // D-13
  })
  it('nunca refleja input desconocido', () => {
    for (const evil of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)'])
      expect(resolveDestination(evil)).toBe(INVALID_LINK_DEST)       // D-18
  })
})
```

### `register/page.tsx` — el cambio de AUTH-06 (D-12)

```ts
// ANTES (register/page.tsx:47-58) — MIENTE: con confirmación ON (H-01) no hay sesión,
// y el proxy rebota /onboarding → /login (middleware.ts:37,44-48).
const { error } = await supabase.auth.signUp({ email: data.email, password: data.password })
if (error) { toast.error(error.message); setLoading(false); return }
toast.success('Cuenta creada. Revisá tu email para confirmarla.')
router.push('/onboarding')   // ← ESTO ES EL BUG. Muere acá.
router.refresh()

// DESPUÉS (D-12 + D-14)
const { error } = await supabase.auth.signUp({
  email: data.email,
  password: data.password,
  options: { emailRedirectTo: `${window.location.origin}/auth/callback?type=signup` },  // D-13
})
if (error) { toast.error(error.message); setLoading(false); return }
setSent(data.email)   // card → estado "revisá tu mail". Sin push. Sin toast. D-12.
// D-14: mail ya existente → Supabase devuelve el MISMO shape con confirmación ON → misma pantalla.
```

⚠ **No perder el `useEffect` de `?plan=`** (`register/page.tsx:38-43`): escribe
`localStorage.forjo_intended_plan` y **sobrevive** al cambio (el usuario vuelve al mismo navegador desde el
mail → localStorage intacto). **Verificar en el UAT** que el plan siga aplicándose post-confirmación.

---

## Sources

### Primary (HIGH confidence)

- **`node_modules/@supabase/ssr@0.10.3`** — `createServerClient.js:28-36` (flowType pkce forzado),
  `createBrowserClient.js:35-42`, `createServerClient.d.ts` (deprecación de get/set/remove, getAll/setAll)
- **`node_modules/@supabase/auth-js@2.106.2`** — `GoTrueClient.d.ts:765,1161,1609,1935,2037`;
  `GoTrueClient.js:1465-1471,3502-3529`; `lib/helpers.js:241-251`; `lib/types.d.ts:697-704,1555-1567`
- **`node_modules/next@16.2.7/dist/docs/`** — `01-app/03-api-reference/04-functions/redirect.md:11,50-52,203-214`;
  `01-app/01-getting-started/15-route-handlers.md:45,124`
- **Prod, read-only** — `GET /auth/v1/settings` (`mailer_autoconfirm: false`) + `auth.admin.listUsers()`
  (3 usuarios / 0 sin confirmar). **Nada modificado.**
- **Repo** — `proxy.ts:21,40-55,64,74-79,84-88`; `lib/supabase/middleware.ts:31,32-42,44-54`;
  `lib/supabase/server.ts`; `app/(dashboard)/layout.tsx:15,23,31`; `app/(auth)/register/page.tsx:17-24,38-43,47-58`;
  `supabase/config.toml:95,106-108,116,159,163,182,199,226,228,234,247-249`; `package.json`;
  `vitest.config.mts`; `vitest.setup.ts:13,20`
- **CLI local** — `supabase --version` → 2.109.1; `supabase status` → warning de `[inbucket]` deprecado;
  `docker info` → down

### Secondary (MEDIUM confidence)

- [CITED: supabase.com/docs/guides/auth/passwords] — flujo SSR de reset: `token_hash` + `verifyOtp`,
  template con `{{ .TokenHash }}`
- [CITED: supabase.com/docs/guides/auth/sessions/pkce-flow] — *"the code exchange must be initiated on the
  same browser and device where the flow was started"*
- [CITED: supabase.com/docs/guides/auth/redirect-urls] — el matcher de la allowlist es **glob**
  (`*`, `**`, `?`, separadores `.` y `/`) → **corrobora D-20**: los globs sobre-matchean
- [github.com/orgs/supabase/discussions/28655] — "Not able to reset password through PKCE flow in NextJS":
  corrobora el modo de falla de H-03 en el campo

### Tertiary (LOW confidence)

- WebSearch general sobre PKCE + recovery — usado **solo** para corroborar; toda afirmación load-bearing
  quedó respaldada por `node_modules/` o doc oficial

---

## Metadata

**Confidence breakdown:**

- **Forma del callback:** **HIGH** — leído en el código fuente instalado + confirmado por doc oficial. La
  imposibilidad de `code` para mails es **estructural** (`ssr` fuerza PKCE y no es pisable), no una opinión.
- **Estado de prod (H-01):** **HIGH** — probe read-only al endpoint de settings + conteo real de usuarios.
- **`signOut({scope:'others'})` (D-17):** **HIGH** — tipo + doc del propio paquete instalado.
- **Trampas del proxy (D-21/D-22):** **HIGH** — los 3 archivos leídos enteros; las 3 listas mapeadas con
  línea y efecto; confirmado que no hay una cuarta.
- **Template change (H-02):** **HIGH** en que es necesario; **MEDIUM** en el href exacto (el `next=` del
  ejemplo del doc no aplica: nuestro handler deriva el destino de `type`).
- **Entorno local (H-05):** **HIGH** — capturador `enabled = true`, puerto 54324; Docker abajo hoy.
- **Rate limits de prod:** **LOW** — no consultables sin Management API (A1).
- **Standard stack:** **HIGH** — cero deps nuevas, todas las versiones verificadas en `node_modules/`.

**Research date:** 2026-07-16
**Valid until:** ~2026-08-15 (30 días). Las afirmaciones ancladas a `node_modules/` valen mientras no se
suba `@supabase/ssr` ni `@supabase/supabase-js`. **H-01 es un snapshot de prod: revalidar si pasa tiempo o
si alguien toca el Dashboard.**

---

*Phase: 4 — Recuperar la cuenta (`/auth/callback` + reset)*
*Researched: 2026-07-16*
</content>
</invoke>
