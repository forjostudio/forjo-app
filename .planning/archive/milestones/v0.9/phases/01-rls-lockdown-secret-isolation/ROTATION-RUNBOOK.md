# Runbook de rotación de claves — D-06 = ROTAR

> Acción **operativa** del usuario, **fuera del repo**. No bloquea el código de la fase, pero
> es **urgente**: las claves listadas abajo estuvieron comprometidas.

## Por qué hay que rotar

La app estuvo desplegada en la URL pública de Vercel con secretos reales en la base mientras
las policies `USING(true)` (`"public read businesses"`, etc.) exponían la fila entera de
`businesses` al rol `anon`. Como la página pública `/[slug]` usa la anon key (respeta RLS),
cualquiera podía pegarle al REST de Supabase con `select=mp_access_token,...` y sacar las
credenciales de **todos** los negocios. El fix de la fase (026 + 027 + 028) cierra el agujero
hacia adelante, pero **no invalida las claves que ya se filtraron**: siguen siendo válidas
hasta que se roten en la consola de cada proveedor.

> Cerrar la RLS no rota las claves. Si una credencial salió a internet, hay que regenerarla.

## Checklist de rotación

Marcá cada ítem cuando lo completes. Tras rotar **cada** clave, verificá que el flujo
correspondiente sigue funcionando (ver "Verificar").

### Secretos per-negocio (filtrados por la RLS — vivían en `businesses`, hoy en `business_secrets`)

Estos son **por negocio**: hay que rotarlos para **cada negocio** que tuvo la credencial cargada.

- [X] **MercadoPago — `mp_access_token` / `mp_refresh_token`**
  - Regenerar: re-hacer el OAuth de **MercadoPago Connect** por negocio (el dueño re-conecta
    su cuenta MP desde Settings → Pagos), o regenerar las credenciales de la aplicación en el
    panel de MercadoPago Developers (cuenta de la app Forjo) si aplica.
  - Actualizar: el nuevo `access_token`/`refresh_token` se guarda en `business_secrets`
    (lo escribe el flujo de re-conexión; o a mano vía el dashboard de Forjo / SQL editor de
    Supabase sobre `business_secrets`).
  - Verificar: un **pago de seña** de prueba confirma el turno y manda el email.

- [X] **Google Calendar — `google_refresh_token`**
  - Regenerar: re-hacer el OAuth de Google Calendar por negocio (el dueño re-conecta desde
    Agenda/Settings). **Revocar** el token viejo en la cuenta Google del dueño
    (myaccount.google.com → Seguridad → Accesos de terceros) para invalidarlo.
  - Actualizar: el nuevo `refresh_token` se guarda en `business_secrets` (lo escribe la
    re-conexión).
  - Verificar: una reserva confirmada crea el evento en el calendario.

- [X] **Resend — `resend_api_key`**
  - Regenerar: crear una **API key nueva** en el panel de Resend y **borrar** la vieja.
  - Actualizar: el nuevo valor en `business_secrets` (dashboard de Forjo → Settings, o SQL
    editor sobre `business_secrets`).
  - Verificar: llega un email de confirmación de turno.

- [X] **reCAPTCHA — `recaptcha_secret_key`**
  - Regenerar: en el admin de Google reCAPTCHA, regenerar el **par de claves** del sitio
    (site key + secret key). La **site key** es pública (sigue en `businesses.recaptcha_site_key`);
    la **secret key** es la comprometida.
  - Actualizar: nueva `recaptcha_secret_key` en `business_secrets`; nueva `recaptcha_site_key`
    en `businesses` (es pública por diseño).
  - Verificar: el reCAPTCHA del booking público valida sin error.

### Secretos globales (por precaución del brief — no filtrados por esta RLS, pero los logueaba SEC-03)

Los setup-plans los pasaban por query string → quedaron en logs. Regenerarlos por las dudas.

- [ ] **`ADMIN_SECRET`**
  - Regenerar: generar un valor nuevo (string aleatorio fuerte).
  - Actualizar: **Vercel → Project → Settings → Environment Variables** (todos los entornos
    que lo usen) y re-deploy.
  - Verificar: las rutas admin que lo exigen siguen autenticando.

- [ ] **`CRON_SECRET`**
  - Regenerar: generar un valor nuevo (string aleatorio fuerte).
  - Actualizar: **Vercel env vars** y re-deploy. Confirmar que el cron diario
    (`cancel-expired`) sigue corriendo con el nuevo valor.
  - Verificar: el cron diario ejecuta sin 401.

## Notas

- Esto es **acción del usuario fuera del repo** (consolas de MercadoPago, Google, Resend,
  reCAPTCHA y Vercel). No hay cambio de código asociado.
- No bloquea el deploy del código de la fase, pero **hacelo pronto**: hasta rotar, las claves
  filtradas siguen sirviendo a un atacante.
- Cubre SEC-01 criterio 5 (decisión de rotación, D-06, resuelta y documentada).
