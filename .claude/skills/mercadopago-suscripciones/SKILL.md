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

Forjo Gestión cobra los planes con **suscripciones de MercadoPago vía `preapproval`
sin plan asociado y checkout redirect**. El cliente elige plan → se crea una
preapproval → se lo redirige al `init_point` de MP → vuelve por la `back_url`.
El cobro recurrente lo administra MP.

## Regla de oro (la más importante)

**Nunca escribir `plan_status` ni `mp_subscription_id` antes de que el webhook
confirme que la preapproval quedó `authorized`.** El webhook es la ÚNICA fuente de
verdad sobre si el cobro entró. Escribir estado de forma optimista (al crear la
preapproval, asumiendo que el pago va a salir bien) es un bug: si la tarjeta es
rechazada, el negocio queda en un estado "sucio" que bloquea los reintentos y obliga
a resetear a mano con SQL. Esto ya pasó y ya se arregló — no reintroducirlo.

## Flujo correcto, paso a paso

### 1. Endpoint que crea la preapproval (`app/api/subscription/create`)

- **Guard idempotente al inicio:** si el negocio ya está `plan_status === 'active'`
  con `mp_subscription_id`, NO crear otra preapproval (ya tiene suscripción activa).
  En cualquier otro estado (`trial`, `pending`, `cancelled`, `expired`) seguir de
  largo y crear una preapproval nueva, descartando cualquier intento pendiente viejo.
- Crear la preapproval en MP y redirigir al `init_point`. **No escribir nada de
  estado.** El negocio se queda en `trial`.
- Pasar SIEMPRE:
  - `external_reference`: el id del negocio (es el vínculo para el webhook).
  - `payer_email`: el email que viene del input del modal. NO reemplazarlo por un
    default. Debe coincidir con la cuenta de MP con la que el cliente se loguea en el
    checkout, o MP rechaza el pago ("payer_email mismatch").
  - `back_url`: la página de retorno (`/dashboard/suscripcion` o equivalente).
  - `status: "pending"`.
- Respetar `MP_MODE` (test/producción) con el helper existente (`isMPTestMode()`).

### 2. Handler del webhook (`app/api/subscription/webhook`)

- Topics a escuchar: `subscription_preapproval` (alta/actualización de la suscripción)
  y `payments` (pagos asociados). Para cobros recurrentes con pago autorizado también
  aplica `subscription_authorized_payment`.
- Al recibir el evento, hacer un **GET de la preapproval contra la API de MP** y
  recién si `status === 'authorized'` escribir `plan_status = 'active'` +
  `mp_subscription_id`, ubicando el negocio por `external_reference`.
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

## payer_email

`payer_email` es **requerido** al crear la preapproval. El cliente debe pagar logueado
con la cuenta de ese mismo email. El modal lo prellena con el email del usuario logueado
(Supabase auth) pero lo deja editable (input controlado, no readOnly) por si su cuenta de
MP usa otro email. El email final del input es el que se manda como `payer_email`.

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
- [ ] `external_reference` = id del negocio, presente en la creación y usado en el webhook.
- [ ] `payer_email` viene del input, no de un default.
- [ ] Guard idempotente en la creación (no duplicar suscripción si ya está active).
- [ ] El webhook responde 200/201.
- [ ] La página de retorno no persiste estado; polling + timeout-no-error.
- [ ] `MP_MODE` sigue funcionando en test y producción.
- [ ] Validación de firma `x-signature` (o flag de pendiente si no está).
