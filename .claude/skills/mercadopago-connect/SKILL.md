---
name: mercadopago-connect
description: >
  Usar SIEMPRE que se toque el flujo por el cual un NEGOCIO conecta su propia cuenta de
  MercadoPago para cobrar señas a sus clientes/pacientes (MercadoPago Connect / OAuth). Es
  DISTINTO de la suscripción con la que Forjo cobra sus planes (para eso ver la skill
  mercadopago-suscripciones). Triggers: "conectar cuenta MP", "OAuth", "MercadoPago
  Connect", "vincular Mercado Pago", "access token del negocio", "cobrar seña", "seña",
  "deposit", "preference de seña", "refresh token", "callback de MP", "business_secrets",
  "MP_CLIENT_ID". Contiene el patrón real ya en producción y los puntos frágiles a vigilar.
---

# MercadoPago Connect (OAuth) — cobro de señas en Forjo Gestión

Este flujo es cómo cada **negocio** conecta su **propia** cuenta de MercadoPago para
cobrarle señas a sus clientes/pacientes. Forjo actúa como aplicación OAuth (cliente
confidencial); el negocio autoriza y su access token se usa para crear el cobro **directo
en su cuenta**. Forjo NO retiene comisión ni custodia fondos: la seña entra 100% en la
cuenta del negocio (sin split, sin marketplace_fee, sin application_fee).

**No confundir con `mercadopago-suscripciones`**, que es el cobro de los PLANES de Forjo a
los negocios (usa el token de plataforma `MP_FORJO_ACCESS_TOKEN`, otro flujo). Este usa el
token DEL NEGOCIO obtenido por OAuth.

## Arquitectura del flujo (ya validada en producción)

### 1. Init — inicia la conexión
- Solo el dueño logueado. Genera `state = crypto.randomUUID()`, lo guarda en cookie
  httpOnly (`mp_oauth_state`, secure en prod, sameSite lax, maxAge ~600s) y redirige a la
  URL de autorización de MP.
- Si falta config (`MP_CLIENT_ID` / `MP_CLIENT_SECRET`) → redirigir con error, no romper.

### 2. Callback — recibe el code y lo canjea
- Validar `code`, `state`, y que `state` coincida con la cookie (protección CSRF). Si no
  coincide → fallar.
- Canjear el `code` por tokens: POST `api.mercadopago.com/oauth/token` con `client_id`,
  `client_secret`, `grant_type=authorization_code`, `code`, `redirect_uri`.
- Guardar `mp_user_id` en `businesses` (flag de conexión, no secreto) y los secretos
  (`mp_access_token`, `mp_refresh_token`, `mp_token_expires_at`) en `business_secrets`.
- Redirigir con `?mp=connected|error` y borrar la cookie de state.
- El `code` del redirect dura solo 10 minutos: canjearlo enseguida, no diferir.

### 3. Disconnect
- Nulear `mp_user_id` en `businesses` y los tres secretos en `business_secrets`.

### 4. Cobro de la seña
- POST `api.mercadopago.com/checkout/preferences` con `Authorization: Bearer <token DEL
  NEGOCIO>` (nunca el de plataforma). El token sale de `business_secrets` vía el resolver
  de token válido (que refresca si hace falta, ver abajo).
- La preference lleva `notification_url` = webhook por slug, `external_reference` =
  appointment.id, y expiración. **No escribir estado optimista**: el turno queda
  `pending_payment` hasta que el webhook confirme (mismo principio que la skill de
  suscripciones).

## Scope y refresh token (IMPORTANTE — precisión sobre la doc oficial)

- Los valores de `scope` en MP son: `offline_access`, `read`, `write`.
- **El `refresh_token` SOLO se emite si se pidió `offline_access` en la autorización.** Si
  la URL de autorización no manda `scope` explícito, se está dependiendo del grant default
  de MP (que suele devolver `offline_access read write`), pero eso es implícito y frágil.
  **Recomendación: incluir `scope=offline_access read write` explícito** en la URL de
  autorización, para garantizar que el refresh token siempre venga y no depender de un
  default que MP podría cambiar.
- El **access token dura ~180 días (6 meses)**; el `code` del redirect dura 10 minutos.
- **El refresh token es de un solo uso.** Cada refresh devuelve un access token nuevo Y un
  refresh token nuevo, y MP solo acepta el último generado. Por lo tanto: cada vez que se
  refresca, hay que **persistir el nuevo access + nuevo refresh + nueva expiración** sí o
  sí. Esa escritura es load-bearing: si falla, se pierde la conexión del negocio y hay que
  reconectar a mano.

### Resolver de token válido (patrón correcto)
Antes de cobrar, chequear expiración: si hay `refresh_token` y el token vence pronto
(ej. < 24h), refrescar (`grant_type=refresh_token`) y persistir los tres valores nuevos.
Un token cargado manualmente (sin refresh_token) no se puede refrescar.

## Aislamiento por tenant (crítico — trabaja con supabase-multitenant-rls)

- Los tokens viven en `business_secrets` (PK `business_id`, RLS habilitada, policy
  owner-only: `business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())`).
- Connect/callback/disconnect usan el **session client** → el dueño solo conecta/desconecta
  SU negocio.
- El cobro resuelve el negocio y toma el token **de ese** `business_id`. El helper que lee
  los secretos usa service-role (bypassa RLS) pero es **server-only** y siempre keyed por
  `business_id` — NUNCA llamarlo bajo impersonación ni con un id que venga del cliente.

## Env vars

- `MP_CLIENT_ID` + `MP_CLIENT_SECRET`: la app de Forjo en el panel de devs de MP (OAuth:
  authorize + exchange + refresh). Ambos presentes = Connect configurado.
- `NEXT_PUBLIC_APP_URL`: base del `redirect_uri` (`/api/mercadopago/callback`). **Debe
  coincidir EXACTO con el redirect registrado en la app de MP**, o el OAuth rompe.
- (Distintas de este flujo: `MP_FORJO_ACCESS_TOKEN`/`_TEST` es de la suscripción;
  `MP_WEBHOOK_SECRET` valida la firma del webhook; `MP_MODE` test/producción.)

## Puntos frágiles a vigilar (deuda conocida — no reintroducir, ir cerrando)

1. **Refresh que falla en silencio.** Si el refresh falla, no caer en fallback mudo al
   token vencido: el cobro va a fallar sin recuperación ni alerta. Peor si `mp_user_id`
   sigue marcando "conectado" mientras los cobros fallan. Al detectar fallo de refresh:
   logear con severidad, idealmente marcar la conexión como caída y avisar al negocio para
   que reconecte. No dejar al dueño creyendo que cobra cuando no.
2. **Sin scope explícito.** Ver sección de scope: agregar `offline_access read write`.
3. **Tokens en texto plano en `business_secrets`.** La única protección hoy es RLS + el
   secreto del service-role. Es un token que puede cobrar en la cuenta del negocio. Evaluar
   cifrado a nivel app / KMS a futuro. Mientras tanto: RLS SIEMPRE ON, service-role key
   nunca expuesta.
4. **`GRANT ALL ... TO anon` sobre la tabla de secretos.** RLS lo tapa hoy, pero deja todo
   dependiendo de que RLS quede activa. Revisar si ese grant es necesario; si no, quitarlo.
5. **`auth.mercadopago.com.ar` hardcodeado** (AR-only). Si algún día se opera fuera de
   Argentina, hay que parametrizarlo.
6. **Token manual sin refresh_token**: si vence, rompe cobros sin recuperación. Contemplar
   aviso de reconexión.

## Lo que YA está bien hecho (no romper al refactorizar)

- `state` CSRF en cookie httpOnly + validación en el callback.
- Firma `x-signature` del webhook timing-safe y fail-closed.
- Secretos fuera del alcance de `anon` (RLS owner-only).
- Helper de secretos server-only, keyed por `business_id`, nunca bajo impersonación.
- Pago directo en la cuenta del negocio, sin que Forjo custodie fondos.
- Sin estado optimista: el turno queda `pending_payment` hasta que el webhook confirma.

## Checklist antes de cerrar un cambio de MP Connect

- [ ] El cobro usa el token DEL NEGOCIO (no el de plataforma).
- [ ] `state` validado contra la cookie en el callback (CSRF).
- [ ] Cada refresh persiste access + refresh + expiry nuevos (refresh es single-use).
- [ ] Fallo de refresh NO cae en fallback mudo; se logea y/o marca la conexión caída.
- [ ] `scope=offline_access read write` explícito en la URL de autorización.
- [ ] Secretos solo en `business_secrets` con RLS owner-only; helper server-only.
- [ ] `redirect_uri` coincide exacto con el registrado en la app de MP.
- [ ] Sin estado optimista: el turno espera al webhook.
