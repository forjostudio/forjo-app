---
name: mercadopago-suscripciones
description: >
  Usar SIEMPRE que se toque cualquier cosa del flujo de pagos/suscripciones de
  MercadoPago en Forjo Gestión: crear o modificar la preapproval, el endpoint de
  checkout, el handler del webhook, la página de retorno (back_url), el manejo de
  plan_status / mp_subscription_id, reintentos de pago, MP_MODE, o el cobro de planes.
  Triggers: "suscripción", "preapproval", "MercadoPago", "MP", "webhook de pago",
  "checkout", "plan_status", "cobro", "payer_email", "init_point". Contiene el patrón
  correcto ya validado en producción y los errores que NO hay que volver a cometer.
---

# MercadoPago — Suscripciones en Forjo Gestión

Forjo Gestión cobra los planes con **un `preapproval_plan` POR NEGOCIO y el link
del plan** (desde 2026-10, mismo patrón que webs-cms). El cliente elige tier → se
crea (o reusa) el plan del negocio → se lo redirige al `init_point` del plan → paga
logueado con **la cuenta de MP que quiera** → vuelve por la `back_url`. El cobro
recurrente lo administra MP.

> ⚠ **El modelo viejo (preapproval con `payer_email`) está RETIRADO.** Exigía que el
> email coincidiera con la cuenta de MP que paga ("Tu e-mail no coincide con el de
> la suscripción") y obligaba a pedirlo en el modal. NO volver a pedir el email. Las
> secciones de abajo que hablan de `payer_email` / `external_reference` describen las
> suscripciones VIEJAS, que el webhook sigue reconociendo.
>
> - El plan se guarda en `businesses.mp_plan_id_active` (columna admin, migr. 080:
>   el trigger la revierte si la escribe el dueño → se escribe con service role).
> - Se reusa si está `active` y su monto es el del tier elegido; si no, plan nuevo.
> - La suscripción que nace del link NO trae `external_reference`: el webhook busca
>   el negocio por `external_reference` (viejas) → `mp_subscription_id` →
>   `mp_plan_id_active`.
> - Los cobros de estas suscripciones llegan por `subscription_authorized_payment`
>   (GET `/authorized_payments/{id}`), NO por `payment` con external_reference. Ese
>   topic tiene que estar activo en el webhook de la app en el panel de MP.
> - El `plan` (tier) lo escribe el webhook al `authorized`, derivado del monto que MP
>   confirma (`tierForAmount`), nunca de lo que mandó el cliente.

## Regla de oro (la más importante)

**Nunca escribir `plan_status` ni `mp_subscription_id` antes de que el webhook
confirme que la preapproval quedó `authorized`.** El webhook es la ÚNICA fuente de
verdad sobre si el cobro entró. Escribir estado de forma optimista (al crear la
preapproval, asumiendo que el pago va a salir bien) es un bug: si la tarjeta es
rechazada, el negocio queda en un estado "sucio" que bloquea los reintentos y obliga
a resetear a mano con SQL. Esto ya pasó y ya se arregló — no reintroducirlo.

## Flujo correcto, paso a paso

### 1. Endpoint que crea la suscripción (`app/api/subscription/create`)

- **Guard idempotente al inicio:** si el negocio ya está `plan_status === 'active'`
  con `mp_subscription_id`, NO arrancar otra (ya tiene suscripción activa).
  En cualquier otro estado (`trial`, `pending`, `cancelled`, `expired`) seguir de
  largo.
- Crear o reusar el `preapproval_plan` del negocio y devolver su `init_point`. Lo
  único que se escribe es `mp_plan_id_active` (con service role): es el vínculo para
  el webhook, NO estado de pago. **Nunca `plan_status` ni `mp_subscription_id`.**
- El plan lleva `back_url` (`/dashboard?subscription=success`) y el monto del tier
  en `auto_recurring`. NO lleva `payer_email`.
- Respetar `MP_MODE` (test/producción): `mpFetch` usa el token de la plataforma
  según el modo.

### 2. Handler del webhook (`app/api/subscription/webhook`)

- Topics a escuchar: `subscription_preapproval` (alta/actualización de la suscripción),
  `subscription_authorized_payment` (cobros de las suscripciones del plan) y `payment`
  (cobros de las suscripciones viejas, con external_reference).
- Al recibir el evento, hacer un **GET de la preapproval contra la API de MP** y
  recién si `status === 'authorized'` escribir `plan_status = 'active'` +
  `mp_subscription_id` + `plan` (tier por monto), ubicando el negocio con
  `businessForSubscription` (external_reference → mp_subscription_id → mp_plan_id_active).
- Si el estado NO es authorized, no escribir nada.
- Si MP cancela una suscripción (cobros recurrentes fallidos), bajar el `plan_status`.
- **Responder siempre HTTP 200/201.** Si no, MP reintenta o pierde la notificación.

### 3. Página de retorno / back_url

- El webhook puede tardar segundos en llegar. En ese rato el cliente ya pagó pero el
  negocio puede verse todavía como `trial`. Resolver eso SOLO en la UI, **sin
  persistir estado nuevo en la base**.
- Sembrar el estado inicial desde el server. Si ya está `active` (webhook llegó antes
  del redirect), mostrar éxito directo sin polling.
- Si sigue en `trial`: mostrar "Estamos confirmando tu pago…" y hacer polling corto
  (cada ~3s) a un endpoint de solo lectura (`/api/subscription/status`) hasta que pase
  a `active`. Cleanup del interval al desmontar y al cortar.
- **Timeout (~30-40s) NO es un error.** Mostrar un mensaje tranquilo: el pago puede
  tardar en acreditarse, que NO reintente (un reintento genera cobro duplicado), que
  refresque en unos minutos.

## payer_email (retirado)

Ya no se pide ni se manda. El modal tiene un solo paso ("Elegir" → link del plan) y el
dueño paga con la cuenta de MP que quiera. Si alguna vez hiciera falta volver a crear
una `preapproval` directa, ahí sí `payer_email` es obligatorio y tiene que ser el de la
cuenta que paga — por eso se cambió a plan.

## Reintentos de cobros recurrentes (cuotas) — los maneja MP solo

Esto es DISTINTO del alta inicial. Cuando un cobro mensual futuro falla, MP reintenta:
hasta 4 intentos dentro de una ventana de 10 días por cuota, y tras 3 cuotas con pagos
rechazados da de baja la suscripción automáticamente y notifica al vendedor por email.
No hay que reintentar nada a mano: solo escuchar el webhook y bajar el `plan_status` si
MP cancela.

## Pendiente de seguridad (recordar al tocar el webhook)

El webhook escribe `plan_status='active'` ante un POST. Hay que **validar la firma
`x-signature`** que manda MercadoPago; sin eso, alguien que descubra la URL podría
falsificar un request y activarse un plan sin pagar. Si todavía no está implementado,
avisar y proponer agregarlo.

## Checklist antes de dar por cerrado un cambio de pagos

- [ ] El endpoint de creación NO escribe `plan_status` ni `mp_subscription_id`.
- [ ] El estado activo se escribe SOLO en el webhook, con `status === 'authorized'`.
- [ ] `mp_plan_id_active` se guarda con service role y el webhook encuentra al negocio por él.
- [ ] El modal NO pide email de MP.
- [ ] `subscription_authorized_payment` activo en el webhook de la app (panel de MP).
- [ ] Guard idempotente en la creación (no duplicar suscripción si ya está active).
- [ ] El webhook responde 200/201.
- [ ] La página de retorno no persiste estado; polling + timeout-no-error.
- [ ] `MP_MODE` sigue funcionando en test y producción.
- [ ] Validación de firma `x-signature` (o flag de pendiente si no está).
