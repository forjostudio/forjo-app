# Phase 5: Entrar con Google - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Alta e inicio de sesión con Google (OAuth) sobre el `/auth/callback` que construyó la Phase 4 — **reusándolo, no reescribiéndolo**. Resuelve el caso borde del mismo email con dos métodos (contraseña + Google) hacia **una sola cuenta**. El hand-off al onboarding se **verifica, no se construye** (AUTH-04): `onboarding/page.tsx` ya resuelve `getUser()` y crea el negocio para un usuario autenticado sin negocio.

**Fuera de scope:** rediseño visual de login/register (se tocaron recién en un quick), cambios al wizard de onboarding (v0.14 lo cerró), y los mails branded (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Account linking (AUTH-05) — LA decisión del milestone
- **D-01:** **Unificar en una sola cuenta.** Cuando entra un Google con un email que ya existe como cuenta de contraseña (o al revés), se **vincula** a la cuenta existente → una sola cuenta, ambos métodos entran, negocio y datos intactos. NO se bloquea el cruce.
- **D-02:** La decisión es segura **porque confirm-email está ON en prod (H-01)**: toda cuenta de contraseña ya está verificada, así que no existe el vector de account takeover (que requiere un mail no verificado que un atacante pueda plantar). Si algún día se apagara confirm-email, esta decisión hay que re-evaluarla — el linking automático sobre mail no verificado es takeover.

### Botón de Google
- **D-03:** El botón **"Continuar con Google" va en login Y en register**. Google OAuth es el mismo flujo para alta y login (nuevo se registra, recurrente inicia sesión); AUTH-03 pide las dos cosas. Sin rediseño visual de las pantallas — se suma el botón al layout existente.

### UX del caso borde
- **D-04:** **Vínculo silencioso.** Cuando el cruce se resuelve con éxito (entra con Google y cae en su cuenta existente), el usuario cae directo en su destino (dashboard si tiene negocio, onboarding si no) **sin mensaje** sobre identidades vinculadas. Estándar de auth de consumo: menos fricción.
- **D-05:** **Nunca un error opaco (AUTH-05 criterio 4).** Si por algún motivo el cruce NO se puede resolver (error de Supabase, o el caso que el research destape en el orden inverso), el usuario ve un **mensaje claro que le dice qué hacer** ("entrá con tu contraseña" / "ya tenés cuenta con Google"), nunca una pantalla muerta ni un toast genérico. Mismo principio que la Phase 4 aplicó en todo el flujo de reset.

### Se arrastra de la Phase 4 (no re-discutido)
- **D-06:** Sin wildcard de previews en la allowlist del Dashboard (D-20 de Phase 4) → auth **no anda en previews de Vercel**, tampoco acá. El botón de Google se prueba en local y en prod, no en preview.
- **D-07:** El callback endurecido de Phase 4 (open-redirect cerrado por DESTINATIONS, token leak mitigado, cliente anon) se reusa **tal cual**. Phase 5 es su único punto de extensión declarado: suma `oauth` al Set `ALLOWED_TYPES`, una fila `oauth: '/dashboard'` a `DESTINATIONS`, y la rama `code`→`exchangeCodeForSession` en el paso 2 del route — **sin tocar los pasos 1, 3 ni 4**.

### Claude's Discretion
- La mecánica exacta de OAuth (scopes de Google, `state`/PKCE, el `initiate` del flujo) la resuelve el planner con lo que devuelva el research.
- Ubicación exacta del botón dentro del card, divisor "o", iconografía de Google: seguir el design system existente (shadcn base-nova, lucide) sin inventar.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El callback que Phase 5 reusa (NO reescribir)
- `lib/auth/callback.ts` — módulo puro: `ALLOWED_TYPES` (Set cerrado, Phase 5 suma `oauth`), `DESTINATIONS` (Phase 5 agrega 1 fila), `INVALID_LINK_DEST`, `parseCallbackParams`, `resolveDestination`. Las líneas 20-28 documentan textualmente el punto de extensión.
- `app/auth/callback/route.ts` §paso 2 (L45-51) — el ÚNICO punto de extensión: acá suma la rama `code`→`exchangeCodeForSession`. Explica por qué Phase 4 usó `token_hash`/`verifyOtp` (H-03: el webview de Gmail no tiene el code_verifier) — OAuth SÍ vuelve al navegador de origen, por eso puede usar `code`/PKCE.
- `.planning/workstreams/onboarding/phases/04-recuperar-la-cuenta-auth-callback-reset/04-SECURITY.md` — el contrato de amenazas de Phase 4. Verificar que el endurecimiento del callback siga en pie con la rama OAuth (mismo open-redirect T-04-01, mismo token/state leak T-04-02).

### El hand-off que Phase 5 verifica (NO construir)
- `app/(onboarding)/onboarding/page.tsx` — ya resuelve `getUser()` y crea el negocio para un usuario autenticado sin negocio. AUTH-04 es verificar este carril con un usuario que llegó por Google, no un flujo nuevo. ⚠ Ojo con el bug de slug-collision bajo RLS anotado en memoria (`onboarding-slug-collision-rls`), aunque es del milestone de onboarding, no de esta fase.

### Las pantallas donde va el botón
- `app/(auth)/(split)/login/page.tsx` — login (movido al split en Phase 4). Acá va el botón de Google.
- `app/(auth)/register/page.tsx` — register (quedó fuera del split, D-10 de Phase 4). Acá también va el botón.

### Requirements
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — AUTH-03 (alta+login con Google), AUTH-04 (hand-off al onboarding, verificar), AUTH-05 (una sola cuenta, comportamiento predecible).

### Credenciales OAuth que ya existen (reusar, no crear)
- `client_secret_*.apps.googleusercontent.com.json` (raíz del repo) — credenciales OAuth de Google que HOY usa Google Calendar. El checkpoint humano agrega el redirect URI del callback de Supabase a ESTAS credenciales, no crea unas nuevas.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`/auth/callback` completo (Phase 4):** el canje token→sesión, la tabla de destinos, el scrub del token, el Referrer-Policy. Phase 5 extiende, no duplica.
- **Layout split `(auth)/(split)` + panel Bauhaus:** login ya vive ahí; el botón de Google hereda el chrome.
- **Patrón de error de `/register` (Phase 4, fix D-14):** detectar `error.code` de Supabase y no filtrar existencia — el mismo criterio aplica si el linking devuelve un error que hay que mapear a un mensaje claro (D-05).
- **`lib/supabase/client.ts` / `server.ts`:** `signInWithOAuth` sale del cliente browser; el callback usa el server client (anon + cookies) que ya está.

### Established Patterns
- **Route lists del Edge (Phase 4):** `/auth/callback` ya está en `MAINT_EXEMPT` y `KNOWN_PREFIXES`, fuera de `isAuthRoute` (D-06). El OAuth reusa esa config — probablemente sin cambios, verificar en research.
- **Anti open-redirect estructural:** destino server-side de una tabla cerrada, nunca del input. La fila `oauth` sigue ese patrón.

### Integration Points
- `signInWithOAuth({ provider: 'google', options: { redirectTo: <callback> } })` en el botón → Google → vuelve a `/auth/callback?code=...` → rama nueva `exchangeCodeForSession`.
- Supabase Dashboard: provider de Google habilitado con client ID/secret (checkpoint humano).

</code_context>

<specifics>
## Specific Ideas

- El research DEBE verificar (NO asumir) la mecánica de linking de Supabase: (a) que el vínculo automático ocurra **solo con mail verificado**; (b) el comportamiento en **los dos órdenes** (contraseña→Google y Google→contraseña); (c) qué identidad/metadata manda cuando las dos existen. La decisión D-01 es "unificar"; el research confirma CÓMO Supabase lo implementa y si hay que tocar config (`enable_manual_linking` u otra).
- Reusar el flujo `code`/PKCE para OAuth (a diferencia del `token_hash` de Phase 4): OAuth vuelve al navegador que inició el flujo, así que el code_verifier existe (al revés del webview de Gmail en los mails).

</specifics>

<deferred>
## Deferred Ideas

None — la discusión se mantuvo dentro del scope de la fase. Otros providers (Apple, etc.) no se mencionaron y quedarían para una fase propia si alguna vez se piden.

</deferred>

---

## Checkpoint humano (autonomous: false)

Setup externo tuyo, necesario para que el botón exista y se pueda probar:
1. **Google Cloud** — agregar el redirect URI del callback de Supabase a las credenciales OAuth que ya existen (`client_secret_*.json`, hoy de Calendar).
2. **Dashboard de Supabase** — habilitar el provider de Google con el client ID/secret.

Sin esto el botón no puede probarse ni tiene sentido existir. Va en el/los plan(es) como checkpoint bloqueante, igual que el Dashboard de Phase 4.

## Threat note — correr /gsd:secure-phase

OAuth + account linking. Riesgos a cubrir: **account takeover por linking sobre mail no verificado** (mitigado por H-01, pero verificar que siga cierto), qué identidad manda si las dos existen, `state`/PKCE en el reuso del callback, y el mismo open-redirect de Phase 4 sobre el retorno del OAuth. Comparte superficie con Phase 4 — verificar que el callback endurecido allá siga endurecido acá.

---

*Phase: 05-entrar-con-google*
*Context gathered: 2026-07-17*
