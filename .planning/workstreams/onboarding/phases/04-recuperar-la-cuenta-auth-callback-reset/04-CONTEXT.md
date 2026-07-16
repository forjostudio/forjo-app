# Phase 4: Recuperar la cuenta (`/auth/callback` + reset) - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Que un dueño que olvidó su contraseña vuelva a entrar solo, sin escribirle a nadie — construyendo en
el camino **`/auth/callback`**, la ruta de intercambio de código por sesión que hoy NO existe y que la
Phase 5 va a reusar tal cual. Incluye cerrar la coherencia del alta (AUTH-06): que lo que el usuario ve
al registrarse coincida con lo que Auth realmente hace.

**Requirements:** AUTH-01, AUTH-02, AUTH-06.

**Superficies que toca:**

1. **`/auth/callback`** (route handler nuevo) — rutea **tres** flujos: `recovery` (esta fase),
   `signup` (esta fase, ver D-11) y `oauth` (Phase 5 lo suma sin reescribir el handler).
2. **`/forgot-password`** y **`/reset-password`** (páginas nuevas) — pedir el link y setear la
   contraseña nueva.
3. **`app/(auth)/login/page.tsx`** — link "¿Olvidaste tu contraseña?" (D-04) + layout compartido (D-07).
4. **`app/(auth)/register/page.tsx`** — AUTH-06: el alta deja de mentir (D-12), pasa a estado
   "revisá tu mail". **NO se rediseña visualmente** (fuera de scope, ver D-10).
5. **`proxy.ts`** — `KNOWN_PREFIXES`, `isAuthRoute` y `MAINT_EXEMPT` (D-21, D-22).
6. **`supabase/config.toml`** — `enable_confirmations = true` en local, para paridad con prod (D-23).
7. **Config externa (checkpoint humano, `autonomous: false`)** — Dashboard de Supabase: allowlist de
   Redirect URLs (D-20) + `enable_confirmations` ON en prod (D-11).

**Fuera de scope:** NO se construye Google/OAuth (Phase 5 — el callback se deja preparado, no se
implementa el proveedor). NO se brandean los mails (Phase 6 — esta fase usa la plantilla fea de
Supabase en inglés a propósito). NO se rediseña login/register (declarado fuera de scope en
REQUIREMENTS; se tocaron recién en el quick `260716-ide`). NO se construye una pantalla de "cambiar
contraseña" en el panel (idea diferida). NO se toca el wizard de onboarding.

**Naturaleza del riesgo: ALTO — es LA superficie de autenticación.** No es RLS/multi-tenant, pero un
agujero acá **entrega cuentas enteras**, no filtra datos. Correr `/gsd:secure-phase` es obligatorio.
Riesgos que el threat model tiene que cubrir (del ROADMAP §Phase 4): **open redirect** vía el parámetro
de retorno del callback (allowlist, nunca reflejar lo que venga); **fuga del token de recovery** en la
URL / `Referer` / logs; que el reset **exija sesión válida del token** (si no, cualquiera setea la
contraseña de cualquiera); **user enumeration** en "olvidé mi contraseña" (respuesta idéntica exista o
no el mail — ver D-02 y D-14); y **reuso/expiración** del link (D-18, D-19).

</domain>

<decisions>
## Implementation Decisions

### Entrada y pantallas del reset (AUTH-01)

- **D-01:** El link de recuperación se pide en una **página propia `/forgot-password`** (no dialog, no
  estado inline del login). Tiene URL propia → linkeable desde soporte o un mail, respeta 1 CTA por
  pantalla, y es el patrón que el usuario espera.
- **D-02:** Tras pedir el link, **el form se reemplaza por un estado "revisá tu mail" en el mismo
  card** (no toast, no pantalla nueva): muestra a qué dirección se mandó + link "Volver al login". El
  usuario no queda con un form que invita a reenviar en loop.
  **Restricción de seguridad (NO negociable):** el mensaje es **idéntico exista o no la cuenta** —
  si varía, el flujo se convierte en un oráculo de quién tiene cuenta en Forjo (user enumeration).
- **D-03:** La contraseña nueva se setea en una **página propia `/reset-password`** con **dos campos:
  contraseña + confirmar contraseña**. Espeja el `/register` actual (que ya usa `confirmPassword` con
  el `.refine()` de zod) — mismo patrón, mismos mensajes.
- **D-04:** El link **"¿Olvidaste tu contraseña?"** va **debajo del botón "Entrar", arriba del link de
  registro** (zona de links secundarios agrupada), no en la fila del label Contraseña.
- **D-05:** Desde el estado "revisá tu mail" se puede **reenviar, con cooldown de 60s** ("Reenviar en
  45s"). **Motivo load-bearing:** Supabase rate-limitea los mails (local: `email_sent = 2` por hora en
  `[auth.rate_limit]`; prod lo gobierna el Dashboard) — sin cooldown el usuario quema su cuota en dos
  clicks nerviosos y deja de recibir mails sin entender por qué.
- **D-06:** **`/forgot-password` es accesible con sesión activa** — NO se suma a la regla `isAuthRoute`
  del proxy que hoy rebota a `/dashboard` a quien entra a `/login` o `/register`. Motivo: **es el único
  camino para cambiar la contraseña** (no existe pantalla de "cambiar contraseña" en el panel).
  Rebotarlo dejaría sin salida al que tiene la sesión abierta en el celu y no se acuerda la contraseña.

### Layout y copy (identidad visual)

- **D-07:** `/forgot-password` y `/reset-password` usan el **layout split del login** (panel Bauhaus
  naranja `bg-primary` + lockup crema FULL + columna de form), vía **layout compartido del route group**
  en vez de duplicar el markup del panel en 3 archivos. Motivo: el recorrido login → olvidé → nueva
  contraseña → login se siente una sola cosa.
- **D-08:** El panel naranja lleva **el mismo headline del login** ("Tu agenda, clientes y finanzas en
  un solo lugar.") en las 3 pantallas split. El panel es **identidad de marca, no copy contextual** →
  se define una vez en el layout compartido y las páginas solo aportan el form.
- **D-09:** Copy de `/forgot-password`: **h1 "Recuperá tu cuenta"** + subtítulo **"Te mandamos un link
  para crear una contraseña nueva"**. Sigue el voseo y la estructura del login (imperativo + subtítulo
  que anticipa qué va a pasar). Habla de *la cuenta*, no de *la contraseña*: es lo que el usuario cree
  que perdió.
- **D-10:** El layout compartido cubre **solo login + forgot + reset**. **`/register` NO se migra al
  split** y queda como está (card centrado): el rediseño visual de login/register está declarado fuera
  de scope en REQUIREMENTS. La inconsistencia visual login↔register queda **anotada como idea diferida**
  (ver `<deferred>`), no se resuelve acá.

### Política de confirmación de email (AUTH-06) — decisión de producto del usuario

- **D-11:** **`enable_confirmations` = ON en prod: confirmar el mail es un GATE REAL.** `signUp` NO
  devuelve sesión; el usuario no entra hasta confirmar.
  **Razón del usuario (textual):** *"tiene que haber una confirmación para que no se creen cuentas con
  mails random además de mails de otro"*.
  **Esto invierte la recomendación inicial** y es la decisión correcta: sin confirmación, el mail de un
  usuario de contraseña **nunca queda verificado**, que es exactamente el vector de account takeover que
  el ROADMAP marcó para la Phase 5 (me registro con el mail de otro y me apropio de su cuenta cuando
  entra por Google). Confirmando, la Phase 5 hereda el problema ya resuelto.
  **Corrección de un error mío durante la discusión:** llegué a afirmar que con `enable_confirmations`
  OFF "Supabase igual manda el mail feo". **Es falso.** Con el flag OFF, Supabase **NO manda ningún mail
  de confirmación** y el usuario queda auto-confirmado. Son la misma perilla: no existe "mail de
  confirmación que no bloquee". Esa corrección es la que llevó a esta decisión.
- **D-12:** Tras "Crear cuenta gratis", **el card se reemplaza por un estado "revisá tu mail"** (mismo
  patrón que D-02): "Te mandamos un mail a tu@email.com. Confirmá tu cuenta para entrar." + reenviar con
  cooldown 60s. **Muere el `router.push('/onboarding')` + toast "Revisá tu email para confirmarla"** de
  `register/page.tsx:56-57`: sin sesión, el proxy lo rebotaría al login — **esa es exactamente la
  deshonestidad que AUTH-06 pide arreglar**.
- **D-13:** El link de confirmación del mail cae, vía `/auth/callback` (`type=signup`), **derecho en
  `/onboarding`**. Es un usuario recién creado sin negocio: el wizard es lo único que puede hacer, y el
  callback ya le dio sesión. No se le pide la contraseña que acaba de inventar.
- **D-14:** Registrarse con un **email que ya tiene cuenta** devuelve la **respuesta idéntica** a un
  alta nueva (el mismo "revisá tu mail") — se mantiene la ofuscación que Supabase hace por default con
  confirmación ON. Coherente con D-02 y con la razón de D-11: **el registro no puede ser un oráculo**
  para averiguar el mail de otro. El despistado que ya tenía cuenta está cubierto por el
  "¿Ya tenés cuenta? Iniciar sesión" que ya vive en el card.
- **D-15:** **Si el research encuentra la confirmación OFF en prod, se prende** (checkpoint humano).
  Las cuentas existentes ya están auto-confirmadas (se crearon con el flag OFF), así que prender el flag
  **solo afecta a las altas nuevas** → riesgo bajo, sin migración ni tocar `auth.users` a mano. El
  research igual **reporta cuántos usuarios sin confirmar hay en prod**; si aparece alguno colgado, se
  resuelve a mano en el Dashboard.

### Después del reset: destino, sesión y links muertos (AUTH-02)

- **D-16:** Tras setear la contraseña nueva, cae en **`/dashboard`**, y si no tiene negocio **el guard
  que ya existe lo manda al onboarding**.
  **Verificado contra código (no asumido):** `app/(dashboard)/layout.tsx:23` hace
  `if (!business) redirect('/onboarding')` y cubre todas las páginas del panel (mismo patrón repetido en
  `dashboard/page.tsx:39`, `agenda`, `clients`, `settings`, etc.). **No se duplica esa lógica en una
  pantalla de auth.**
- **D-17:** Al cambiar la contraseña **se cierran todas las otras sesiones menos la actual** (signOut de
  alcance global antes de cerrar el flujo). Motivo: es lo único que hace que "recuperar la cuenta" sirva
  cuando alguien te la robó — si no, el intruso se queda adentro con su sesión y el dueño cree que lo
  echó. Precio aceptado: el olvidadizo tiene que volver a entrar en el celu → **cubrir con copy** que lo
  explique.
- **D-18:** Link **vencido, ya usado, o alguien entra a `/reset-password` sin link** → cae en **la misma
  `/forgot-password` en estado de error**, con el aviso arriba ("Ese link ya venció o ya se usó. Pedí uno
  nuevo.") y el campo Email listo. El error y la solución en la misma pantalla, en un click. **Nunca un
  rebote al login con toast** — eso es el "error opaco" que el criterio 2 de la fase prohíbe.
- **D-19:** **Vencimiento del link: 1 hora** — el default de Supabase (`otp_expiry = 3600`), **no se
  toca**. El dueño pide el link y lo usa en el momento; el que lo dejó vencer tiene la salida en un click
  (D-05 + D-18). Una perilla menos que se puede desincronizar entre local y prod.

### Redirect URLs, previews y proxy (infraestructura)

- **D-20:** **Allowlist de Redirect URLs = solo prod + local.** `gestion.forjo.studio` + localhost.
  **NO se allowlistean las previews de Vercel con wildcard.** Motivo: la allowlist **es** la defensa
  contra el open redirect en la superficie donde un agujero entrega cuentas; el wildcard de Supabase es
  glob y los globs sobre-matchean. **Consecuencia asumida:** auth **no anda en preview** → el UAT de esta
  fase (y de la Phase 5) se hace **en local y se re-verifica en prod**, repitiendo el dolor que ya pegó
  con reCAPTCHA en el UAT de Phase 14. Esto es un **input para cómo se planea el UAT**, no una sorpresa.
- **D-21:** **`/auth` se suma a `MAINT_EXEMPT`** en `proxy.ts:21` (hoy `['/api', '/admin', '/login']`).
  Motivo: con la app en mantenimiento, el kill switch devuelve 503 a todo lo demás → **un link de
  recuperación o confirmación quemaría su token contra una pantalla de mantenimiento**, y los links
  vencen en 1h (D-19). El callback siempre canjea el token y deja la sesión.
  **`/forgot-password` y `/reset-password` NO se eximen**: si el sistema está caído no hay a dónde
  entrar igual, y mostrar la pantalla de mantenimiento es lo honesto (además, `/reset-password` escribe
  en la base, y el mantenimiento existe para que nadie escriba).
- **D-22:** Las **3 rutas nuevas entran a `KNOWN_PREFIXES`** (`proxy.ts:40-55`) para que la sesión se
  refresque bien — hoy caerían en el `NextResponse.next()` que existe para que el booking público
  `/[slug]` nunca vea las credenciales del dueño. **PERO `/forgot-password` y `/reset-password` NO se
  suman a `isAuthRoute`** (`lib/supabase/middleware.ts:31`), para preservar D-06.
  **Son dos listas distintas con efectos distintos y hay que tocarlas distinto** — es el detalle que se
  pasa por alto y reaparece como bug intermitente.
- **D-23:** **`enable_confirmations = true` también en local** (`supabase/config.toml` §`[auth.email]`,
  hoy `false`). Motivo: el flag queda **versionado y documentado en el repo**, no solo en un Dashboard
  que nadie ve; y es la única forma de probar el gate y el link de confirmación sin tocar prod. **El
  research debe confirmar que el capturador de mails local esté andando** (el usuario tiene varios
  servicios de Supabase local apagados en Windows — ver Constraints del proyecto).

### Claude's Discretion (a resolver en research/planning)

- **Forma exacta de `/auth/callback`** — el ROADMAP la marcó como decisión de fase; el usuario la dejó
  explícitamente a research/discreción. Lo que hay que resolver: **`token_hash` + `verifyOtp` vs `code` +
  `exchangeCodeForSession` (PKCE)**. Con `@supabase/ssr` el patrón oficial para links de mail difiere del
  de OAuth (el default `{{ .ConfirmationURL }}` pasa por `/auth/v1/verify` y puede volver con fragmento
  `#access_token`, que el servidor **no puede leer**). **Restricción fija (D-13 + ROADMAP):** el handler
  rutea `recovery` / `signup` / `oauth` y la Phase 5 lo reusa **sin reescribirlo**. Decidir también si el
  ruteo por tipo va en una ruta o en subrutas, contemplando desde ya el `state`/PKCE de la Phase 5.
- **Cómo se elimina el token de la URL** tras el canje (redirect que lo saque de la barra, del `Referer`
  y de los logs) — es una de las amenazas nombradas en el ROADMAP; la mecánica es del planner.
- **Copy exacto** de: el estado "revisá tu mail" (D-02, D-12), el aviso de link vencido (D-18), el
  cartel que explica que se cerraron las otras sesiones (D-17), y el h1/subtítulo de `/reset-password`
  (el de `/forgot-password` está fijo en D-09).
- **Forma del layout compartido** del route group `(auth)` (D-07/D-08) sin romper el `/register` actual,
  que NO usa el split (D-10) — el route group hoy contiene las dos.
- **Mecánica del cooldown de 60s** (D-05) y si se comparte helper entre `/forgot-password` y el card de
  register (D-12), que tienen el mismo patrón.
- **Validación de la contraseña nueva** (D-03): mínimo 6 es lo que exige Supabase hoy
  (`minimum_password_length = 6`); seguir el patrón de validación inline onBlur de Phase 2 (D-08 de esa
  fase).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Superficies a modificar (núcleo de la fase)
- `app/(auth)/login/page.tsx` — el split Bauhaus (panel `bg-primary` + lockup crema FULL + columna de
  440px), `signInWithPassword`, y el bloque de links secundarios donde va "¿Olvidaste tu contraseña?"
  (D-04, líneas ~118-123). El layout compartido (D-07/D-08) sale de acá.
- `app/(auth)/register/page.tsx` — `signUp()` en la línea 47 y el
  `toast.success('Cuenta creada. Revisá tu email para confirmarla.')` + `router.push('/onboarding')` de
  las líneas 56-57: **eso es lo que AUTH-06 rompe y reemplaza** (D-12). Ojo con el `useEffect` que
  captura `?plan=` en localStorage (líneas 38-43) — no se pierde al cambiar el flujo. **NO rediseñar**
  (D-10).
- `proxy.ts` — `MAINT_EXEMPT` (línea 21, D-21) y `KNOWN_PREFIXES` (líneas 40-55, D-22). Son dos listas
  distintas; leer los comentarios que explican por qué `/[slug]` queda afuera.
- `lib/supabase/middleware.ts` — `updateSession`: `isAuthRoute` (línea 31) e `isDashboardRoute`
  (líneas 32-42). **`/forgot-password` y `/reset-password` NO van a `isAuthRoute`** (D-06, D-22).
- `supabase/config.toml` §`[auth]`, `[auth.email]`, `[auth.rate_limit]` — `enable_confirmations = false`
  hoy (→ `true`, D-23), `otp_expiry = 3600` (D-19), `minimum_password_length = 6`, `email_sent = 2`
  por hora (D-05), `site_url` + `additional_redirect_urls` (D-20).

### Clientes de Supabase (elegir el plano de acceso correcto)
- `lib/supabase/client.ts` — cliente de navegador, el que usan login/register hoy (`'use client'`).
- `lib/supabase/server.ts` — `createClient()` async con cookies; el patrón para el route handler del
  callback (**NO usar el admin/service-role acá**).
- `lib/supabase/middleware.ts` — cómo se setean las cookies de sesión en el Edge.

### Guard verificado del que depende D-16
- `app/(dashboard)/layout.tsx:23` — `if (!business) redirect('/onboarding')`: cubre todo el panel.
  **Verificado, no asumido.** Mismo patrón en `app/(dashboard)/dashboard/page.tsx:39` y en `app/page.tsx`
  (líneas 16-17: `if (business) redirect('/dashboard')` / `redirect('/onboarding')`).

### Destino del alta y del reset
- `app/(onboarding)/onboarding/page.tsx` — resuelve `getUser()` y crea el negocio para un usuario
  autenticado sin negocio. **Es el destino de D-13 y no se toca en esta fase** (v0.14 lo cerró).

### Roadmap / requirements / estado
- `.planning/workstreams/onboarding/ROADMAP.md` §"Phase 4" — goal, los 4 criterios de éxito, el
  checkpoint humano y **la threat note completa** (open redirect, fuga del token, enumeration, reuso).
- `.planning/workstreams/onboarding/ROADMAP.md` §"Phase 5" y §"Phase 6" — qué hereda cada una de esta
  fase (el callback tal cual; el peso de MAIL-01).
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — AUTH-01, AUTH-02, AUTH-06 + §"Out of Scope"
  (rediseño visual de login/register **explícitamente excluido**) + §"Decisiones abiertas".
- `.planning/workstreams/onboarding/STATE.md` — §Blockers/Concerns: los checkpoints humanos del
  milestone y por qué esta superficie exige `/gsd:secure-phase`.

### Fases previas del workstream (decisiones que siguen vigentes)
- `.planning/workstreams/onboarding/phases/02-rework-ux-del-onboarding/02-CONTEXT.md` — D-01 (solo
  "Negocio" es obligatorio), D-07/D-08 (labels siempre visibles, validación inline onBlur) — el patrón
  de UX que heredan las pantallas nuevas.
- `.planning/workstreams/onboarding/phases/03-rework-del-selector-de-rubro/03-CONTEXT.md` — patrón de
  migración + convenciones del workstream.

### Skills / convenciones
- Skill `convenciones-forjo` — stack, naming, patrón Server/Client component, manejo de errores.
- Skill `supabase-multitenant-rls` — aplica al elegir el cliente de Supabase del callback (**server con
  cookies, NUNCA service role en un flujo que viene de un link de mail**).
- `CLAUDE.md` (UI/UX) — labels visibles, feedback inline, estados hover/focus/active, touch targets
  ≥44px (ojo con el link de D-04), mobile-first 375px, microcopy de errores ("qué pasó + cómo resolverlo").
- `AGENTS.md` — **Next.js 16, NO 14**: consultar `node_modules/next/dist/docs/` antes de asumir
  comportamiento de route handlers, cookies o redirects. El middleware es `proxy.ts`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Estado de partida (verificado con grep, no asumido)
- **Cero infraestructura de auth más allá de password:** `resetPasswordForEmail`,
  `exchangeCodeForSession`, `verifyOtp`, `auth.updateUser`, `signInWithOAuth`, `emailRedirectTo` →
  **0 ocurrencias en todo el repo**. Todo lo de esta fase se construye de cero.
- `app/(auth)/` contiene **solo** `login/page.tsx` y `register/page.tsx`. **No existe `app/auth/`.**
- Los callbacks que existen (`app/api/google/callback`, `app/api/mercadopago/callback`) son de
  **integraciones** (Calendar, MP) — otro flujo, otro propósito. **No son modelo para `/auth/callback`**,
  pero sí sirven como referencia de estilo de route handler (parseo defensivo, `Response.json`, logging
  con prefijo `[modulo/accion]`).

### Reusable Assets
- **El patrón "form → estado de confirmación"** que fija D-02 se reusa tal cual en el card de register
  (D-12): son la misma pantalla conceptual ("andá a tu mail"). Un solo patrón, dos usos.
- **El split Bauhaus del login** (`login/page.tsx:48-82`: SVG de formas geométricas, lockup crema FULL,
  crédito "hecho con Forjo Studio") ya está resuelto y comentado — se **extrae** al layout compartido
  (D-07), no se reescribe. **Leer los comentarios**: explican por qué va el lockup FULL y no el bicolor
  (el "gestión" gris se pierde sobre `bg-primary`) y por qué el estilo del crédito no se copia del
  booking.
- **El `.refine()` de zod para confirmar contraseña** ya existe en `register/page.tsx:21-24` → D-03 lo
  espeja.
- **Patrones de form ya establecidos:** `react-hook-form` + `zodResolver`, errores inline vía
  `formState.errors`, `useState(loading)` para deshabilitar el botón y evitar doble submit, `toast` de
  `sonner`. Las pantallas nuevas no inventan nada.

### Established Patterns
- Route handlers: `Response.json({ ok, ... })`, códigos de error en snake_case, parseo defensivo del
  input, `console.error('[modulo/accion]: ...')`. El callback debería seguirlo.
- Server Components async para páginas; `'use client'` solo donde hay interactividad.
- El proxy corre en **Edge Runtime**; los route handlers en Node.

### Integration Points
- **`proxy.ts` es el punto de integración más delicado y tiene DOS trampas ya identificadas** (D-21,
  D-22): las rutas nuevas no están en ninguna de las tres listas, y cada lista tiene un efecto distinto.
- El callback es el **punto de reuso de la Phase 5**: se diseña para tres flujos aunque hoy se estrenen
  dos (D-13 + Claude's Discretion).
- `app/(onboarding)/onboarding/page.tsx` es el destino de D-13 — ya maneja "autenticado sin negocio".

### Security / Isolation (relevancia: ALTA — es la superficie de auth)
- **No es aislamiento multi-tenant, es control de cuentas.** Un agujero acá no filtra datos entre
  negocios: **entrega la cuenta entera** (y con ella su negocio). Por eso `/gsd:secure-phase` es
  obligatorio y no opcional.
- **El callback NUNCA debe usar el service role** (`lib/supabase/admin.ts`): es un endpoint alcanzado
  desde un link de mail por un usuario anónimo. Va con el cliente server + cookies.
- **La allowlist de Redirect URLs es la defensa contra el open redirect** — D-20 la mantiene mínima a
  propósito. Cualquier parámetro de retorno debe validarse contra una allowlist propia, **nunca
  reflejarse tal cual**.
- **D-02 y D-14 son mitigaciones de user enumeration**, no decisiones de copy: si el mensaje varía según
  exista o no la cuenta, el flujo se vuelve un oráculo.
- **D-11 (confirmación ON) es una mitigación que la Phase 5 hereda**: sin mail verificado, el account
  linking automático es un vector de takeover.

</code_context>

<specifics>
## Specific Ideas

- **La razón de D-11, en palabras del usuario:** *"tiene que haber una confirmación para que no se creen
  cuentas con mails random además de mails de otro. Suma la confirmación, no importa que sea el feo de
  supabase, lo corregimos en la siguiente fase."* → **el mail feo de Supabase en inglés es aceptable a
  propósito en esta fase**; brandearlo es Phase 6 (MAIL-01) y no es motivo para bloquear nada acá.
- Copy exacto de `/forgot-password`: **"Recuperá tu cuenta"** + **"Te mandamos un link para crear una
  contraseña nueva"** (D-09).
- El panel naranja **dice lo mismo en las 3 pantallas** — es marca, no copy contextual (D-08).
- El error de link vencido y su solución **en la misma pantalla, en un click** (D-18) — nada de rebotes
  con toast que desaparece.
- Aceptado explícitamente: **auth no anda en las previews de Vercel** (D-20). Se prefiere una allowlist
  chica y un UAT más incómodo antes que un glob en la superficie de auth.

</specifics>

<deferred>
## Deferred Ideas

- **Pantalla de "cambiar contraseña" dentro del panel** — hoy no existe; el único camino es
  `/forgot-password` (por eso D-06 lo deja accesible con sesión activa). Es una capacidad nueva del
  panel → fase propia, no se construye acá.
- **Unificar `/register` al layout split del login** — la inconsistencia visual login↔register es real
  y quedó a la vista en esta discusión (D-07/D-10), pero el rediseño de login/register está
  **explícitamente fuera de scope** en REQUIREMENTS (se tocaron recién en el quick `260716-ide`). No se
  re-litiga acá.
- **Mail de bienvenida propio por Resend** ("tu cuenta está lista") — surgió al aclarar que el
  `Confirm signup` de Supabase Auth **no es** un mail de bienvenida. Sería un mail nuestro disparado
  desde el código, o sea una **capacidad nueva** → ni MAIL-01 ni esta fase.

### Notas que heredan otras fases

- **→ Phase 6 (MAIL-01):** con D-11, **el mail de confirmación existe, es obligatorio para entrar, y
  hasta la Phase 6 llega en inglés con "powered by Supabase"** — o sea que MAIL-01 **mantiene su peso**
  (no se degrada ni se cae del milestone, que es lo que habría pasado con la confirmación apagada). El
  hallazgo que el ROADMAP pedía hacer viajar, viajó.
- **→ Phase 5 (AUTH-05, account linking):** D-11 le da **piso verificado**. Con el mail confirmado, el
  linking automático deja de ser el regalo de cuentas que la threat note describe. La Phase 5 sigue
  teniendo que decidir y **probar los dos órdenes** (contraseña→Google y Google→contraseña), pero ya no
  desde un email no verificado.
- **→ Phase 5 (UAT):** D-20 (sin previews) **también** aplica al UAT de Google. Planificarlo desde el
  arranque en local + prod, no descubrirlo a mitad de fase.
- **→ Phase 5 (callback):** el handler se construye acá para **tres** flujos. La Phase 5 **suma `oauth`,
  no reescribe** — y debe verificar que el endurecimiento del callback (open redirect) siga en pie.

### Reviewed Todos (not folded)
None — `todo.match-phase 4` devolvió 0 matches.

</deferred>

---

*Phase: 4-Recuperar la cuenta (`/auth/callback` + reset)*
*Context gathered: 2026-07-16*
