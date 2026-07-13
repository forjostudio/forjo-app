# Preocupaciones del Codebase

**Fecha de análisis:** 2026-06-15

> SaaS multi-tenant de turnos sobre Next.js 16 (App Router) + Supabase (RLS, aislamiento por `business_id`) + MercadoPago. El foco de esta auditoría está en el aislamiento entre tenants y en la seguridad de pagos/webhooks.

---

## Deuda Técnica

**Política RLS de lectura pública demasiado amplia en `businesses` (CRÍTICO — ver también "Consideraciones de Seguridad"):**
- Problema: la policy base `public read businesses ... USING (true)` se crea en `supabase/schema.sql` (líneas 138-140) y NUNCA se reemplaza ni acota por columnas en ninguna migración posterior. Las migraciones siguientes le fueron agregando columnas con secretos a la misma tabla.
- Archivos: `supabase/schema.sql:138`, `supabase/migrations/001_payments_deposits_notifications.sql`, `supabase/migrations/021_google_calendar.sql`, `supabase/migrations/022_mp_oauth.sql`.
- Impacto: el rol `anon` puede hacer `SELECT *` sobre `businesses` y leer secretos de cualquier negocio. La app server-side solo selecciona columnas seguras (`app/[slug]/page.tsx:19-24`), pero RLS no impide que un atacante consulte el resto.
- Forma de resolverlo: reemplazar la policy `USING (true)` por una vista pública acotada (patrón ya usado para `professionals` en `007_professionals_extended.sql`) o, como mínimo, mover los secretos (`mp_access_token`, `mp_refresh_token`, `resend_api_key`, `recaptcha_secret_key`, `google_refresh_token`) a una tabla aparte `business_secrets` sin policy de lectura anon. Ver detalle en la sección de Seguridad.

**Inconsistencia entre `lib/plan-limits.ts` y `lib/plans.ts` / `lib/subscription-plans.ts`:**
- Problema: coexisten al menos tres fuentes de verdad para planes (`getPlanLimits` en `lib/plans.ts`, `SUBSCRIPTION_PLANS` en `lib/subscription-plans.ts`, helpers en `lib/plan-limits.ts`). Los nombres de plan (`basic`/`studio`/`pro`) están hardcodeados en varios endpoints (`app/api/admin/set-plan/route.ts:5`, `app/api/subscription/create/route.ts:6`).
- Archivos: `lib/plans.ts`, `lib/subscription-plans.ts`, `lib/plan-limits.ts`, `app/api/admin/set-plan/route.ts`, `app/api/subscription/create/route.ts`.
- Impacto: agregar o renombrar un plan exige tocar múltiples archivos; riesgo de que queden desincronizados.
- Forma de resolverlo: unificar en un único módulo de definición de planes y derivar de ahí límites, precios y validaciones.

**Uso de `any` en helpers de límites y en `mpFetch`:**
- Problema: `checkProfessionalLimit` / `checkLocationLimit` reciben `supabase: any` (`lib/plan-limits.ts:4,18`) y `mpFetch` devuelve `Promise<any>` (`lib/mercadopago.ts:120`), con `eslint-disable` explícito.
- Archivos: `lib/plan-limits.ts:3,17`, `lib/mercadopago.ts:119`.
- Impacto: se pierde type-safety justo en código que toca pagos y límites de facturación.
- Forma de resolverlo: tipar el cliente con `SupabaseClient` y definir tipos mínimos para las respuestas de MP que se consumen.

**Migraciones SQL aplicadas a mano, sin herramienta de migración:**
- Problema: el esquema vive como `schema.sql` base + archivos numerados en `supabase/migrations/` que se corren manualmente en orden (`001`...`022`). No hay registro en base de qué migración se aplicó.
- Archivos: `supabase/schema.sql`, `supabase/migrations/*`.
- Impacto: alto riesgo de drift entre entornos (dev/prod) y de olvidar una migración (ej. la `012`, que endurece el insert público, requiere coordinación manual con el deploy según su propio comentario `012_harden_public_insert.sql:18-20`).
- Forma de resolverlo: adoptar Supabase CLI migrations o una tabla de control de versiones de esquema.

---

## Bugs Conocidos / Comportamientos Frágiles

**El endpoint público de creación de turnos no valida el estado del plan del negocio:**
- Síntomas: un negocio con `plan_status` en `expired` o `cancelled` sigue aceptando reservas públicas con normalidad.
- Archivos: `app/api/booking/create/route.ts` (no consulta `plan_status` en ningún punto).
- Disparador: dejar de pagar la suscripción y seguir compartiendo el link público `/[slug]`.
- Workaround: ninguno en código; depende de gating manual.

**El webhook de seña aprobada no compara el monto pagado contra la seña esperada:**
- Síntomas: en `app/api/payment/webhook/[slug]/route.ts` el webhook confía en `payment.status === 'approved'` y en `external_reference` para confirmar el turno, pero no compara `payment.transaction_amount` contra `deposit_amount` del turno/negocio.
- Archivos: `app/api/payment/webhook/[slug]/route.ts:79-99`.
- Disparador: un pago aprobado por un monto distinto al de la seña confirmaría igual el turno.
- Workaround: la preferencia la arma el server (`lib/payment.ts createDepositPreference`), lo que reduce el riesgo, pero el webhook no es la última línea de defensa que debería ser.

**Bucket fijo por `SENTINEL` para turnos sin profesional puede sobre-bloquear:**
- Síntomas: cuando no se elige profesional, todos los turnos caen al mismo bucket `00000000-...` y compiten entre sí por solapamiento, aunque el negocio tenga varios profesionales que podrían atender en paralelo.
- Archivos: `app/api/booking/create/route.ts:8,91,109`, índices `supabase/migrations/011_no_double_booking.sql`, `supabase/migrations/013_no_overlap.sql`.
- Disparador: negocios con varios profesionales que dejan la asignación "sin preferencia".
- Workaround: forzar elección de profesional; revisar la lógica de capacidad por recurso.

---

## Consideraciones de Seguridad

**[CRÍTICO] Exposición de secretos de cada negocio al rol `anon` vía RLS:**
- Riesgo: la policy `public read businesses USING (true)` (`supabase/schema.sql:139`) permite que cualquiera con la `anon key` pública (que viaja al browser) lea TODAS las columnas de `businesses`, incluyendo: `mp_access_token` y `mp_refresh_token` (token de cobro de MercadoPago del negocio), `resend_api_key` (envío de emails), `recaptcha_secret_key` (anti-spam) y `google_refresh_token` (acceso a su Google Calendar).
- Archivos: `supabase/schema.sql:138-140`; columnas sensibles en `supabase/migrations/001_payments_deposits_notifications.sql:9,14,16`, `021_google_calendar.sql:4`, `022_mp_oauth.sql:4`.
- Mitigación actual: ninguna a nivel base. La app solo lee columnas seguras (`app/[slug]/page.tsx:19-24`), pero eso NO restringe lo que `anon` puede consultar directamente contra PostgREST.
- Recomendaciones:
  1. Reemplazar `public read businesses` por una vista `public_businesses` con solo columnas públicas (`id, slug, name, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, ...`) y `GRANT SELECT` a `anon`, siguiendo el patrón de `public_professionals` (`007_professionals_extended.sql:20-29`).
  2. `DROP POLICY "public read businesses"` para que la tabla deje de ser legible por `anon`.
  3. Idealmente mover los secretos a una tabla `business_secrets` separada con RLS solo-dueño.
  4. **Rotar** todos los tokens/keys que pudieron quedar expuestos (MP, Resend, reCAPTCHA, Google) una vez cerrado el agujero.

**[CRÍTICO] `services` y `business_hours` también legibles enteros por `anon`:**
- Riesgo: las policies `public read services` y `public read hours` (`supabase/schema.sql:144-149`) usan `USING (true)`. `services` incluye `price` (aceptable), pero el patrón de tabla-entera-abierta es el mismo que llevó al problema de `businesses`: cualquier columna sensible que se agregue después queda expuesta.
- Archivos: `supabase/schema.sql:144-149`.
- Mitigación actual: hoy no hay columnas sensibles en esas tablas.
- Recomendaciones: acotar a vistas públicas o, como mínimo, documentar la prohibición de agregar columnas sensibles a tablas con policy `USING (true)`.

**Webhook de seña (`/api/payment/webhook/[slug]`) sin validación de firma `x-signature`:**
- Riesgo: a diferencia del webhook de suscripción (`app/api/subscription/webhook/route.ts:18-54`, que SÍ valida HMAC `x-signature` fail-closed), el webhook de seña por slug NO valida firma. Confía en consultar el pago a MP por `paymentId`.
- Archivos: `app/api/payment/webhook/[slug]/route.ts:10-66`.
- Mitigación actual: re-consulta el pago a la API de MP con el token del negocio antes de confirmar, lo que evita confirmar pagos inexistentes. Pero un atacante puede forzar procesamiento repetido / enumerar `paymentId` y disparar trabajo (re-fetch, posibles emails) sin firma.
- Recomendaciones: aplicar la misma verificación `verifyMPSignature` que el webhook de suscripción. Hay deuda de duplicación: extraer el verificador a `lib/mercadopago.ts` y usarlo en ambos webhooks.

**Endpoints admin protegidos solo por secreto compartido en header (y uno por query string):**
- Riesgo: `app/api/admin/set-plan/route.ts:11` y `app/api/admin/setup-plans/route.ts:16-18` se autentican con `ADMIN_SECRET`. En `setup-plans` el secreto puede ir por **query string** (`?secret=...`), lo que lo deja en logs de acceso/historial. Ambos usan comparación `!==` (no timing-safe).
- Archivos: `app/api/admin/set-plan/route.ts:9-13`, `app/api/admin/setup-plans/route.ts:15-19`.
- Mitigación actual: comparación contra env var; `set-plan` exige header.
- Recomendaciones: no aceptar el secreto por query string; usar comparación en tiempo constante (`crypto.timingSafeEqual`); considerar mover `setup-plans` a un script fuera del runtime web.

**`SUPABASE_SERVICE_ROLE_KEY` correctamente usada solo server-side (OK, con caveat):**
- Riesgo: `lib/supabase/admin.ts` instancia el cliente con service role. Está importado solo desde route handlers (`/api/booking/create`, webhooks, cron, recaptcha) — correcto. El caveat es que, al bypassear RLS, TODA query con service role debe filtrar explícitamente por `business_id`/`slug`.
- Archivos: `lib/supabase/admin.ts`, consumidores en `app/api/**`.
- Mitigación actual: los handlers resuelven el negocio por `slug` y filtran por `business_id` en cada query (ej. `app/api/booking/create/route.ts:47-52,66-71,79-84`). Bien aplicado.
- Recomendaciones: mantener la disciplina; agregar un test que pruebe el aislamiento con datos de dos negocios (checklist de la skill `supabase-multitenant-rls`).

**reCAPTCHA permisivo cuando el negocio no configuró secret:**
- Riesgo: `verifyRecaptcha` devuelve `ok: true` (configured:false) si el negocio no tiene `recaptcha_secret_key` (`lib/recaptcha.ts:27-30`). Para flujos sin seña, eso deja la creación de turnos sin anti-spam.
- Archivos: `lib/recaptcha.ts:26-30`, `app/api/booking/create/route.ts:56-62`.
- Mitigación actual: queda rastro en logs; el flujo con seña usa el pago como gate.
- Recomendaciones: para negocios sin reCAPTCHA, aplicar al menos rate-limiting por IP en `/api/booking/create`.

---

## Cuellos de Botella de Performance

**Re-chequeo de disponibilidad trae todos los turnos del día y filtra en JS:**
- Problema: `app/api/booking/create/route.ts:96-101` hace `SELECT` de todos los `appointments` del día/negocio en estados activos y calcula el solapamiento + buffer en memoria. Funciona, pero escala con la cantidad de turnos del día.
- Archivos: `app/api/booking/create/route.ts:96-117`.
- Causa: el filtro de solapamiento se calcula en JS; el índice anti-doble-booking (`011`/`013`) es el respaldo atómico, no el filtro primario.
- Camino de mejora: verificar índice sobre `appointments(business_id, date, status)`.

**Trabajo pesado en webhooks resuelto con `after()` (bien) pero sin reintentos:**
- Problema: los webhooks responden 200 y procesan en `after()` (`app/api/payment/webhook/[slug]/route.ts:29-35`, `app/api/subscription/webhook/route.ts:75-81`). Si el procesamiento falla dentro de `after()`, se loguea pero no hay reintento ni cola.
- Archivos: ambos webhooks.
- Causa: no hay capa de jobs/cola.
- Camino de mejora: persistir eventos entrantes (idempotencia + reproceso) en una tabla `webhook_events`.

---

## Áreas Frágiles

**Triple fuente de cancelación de turnos vencidos (cron vs. limpieza manual vs. inline):**
- Archivos: `app/api/cron/cancel-expired/route.ts`, `app/api/appointments/cleanup-expired/route.ts`, y la liberación inline en `app/api/booking/create/route.ts:119-160`.
- Por qué es frágil: la lógica de "qué cuenta como vencido" está replicada en tres lugares; un cambio en la regla exige tocarlos todos y mantener consistencia.
- Modificación segura: centralizar la condición de expiración en un helper compartido.

**Lista de rutas protegidas hardcodeada en el middleware:**
- Archivos: `lib/supabase/middleware.ts:32-37`.
- Por qué es frágil: `isDashboardRoute` enumera rutas a mano y NO incluye `/agenda` ni `/clinical-history` (que existen como páginas). Esas páginas hoy dependen del redirect del layout `(dashboard)` (`app/(dashboard)/layout.tsx:13-23`), no del middleware. Si alguien agrega una ruta protegida y olvida el layout, queda expuesta.
- Modificación segura: gating por grupo de rutas `(dashboard)` o por matcher de middleware, no por lista manual.

**Manejo de errores de email best-effort y silencioso:**
- Archivos: `app/api/payment/webhook/[slug]/route.ts:109-139`, `app/api/booking/create/route.ts:137-159,254-277`, `app/api/cron/cancel-expired/route.ts:37-59`.
- Por qué es frágil: los fallos de envío se loguean (algunos se persisten en `email_sent`/`email_error`) pero no se reintentan; un cliente puede quedar sin confirmación sin que nadie lo note salvo revisando logs.
- Modificación segura: superficie de monitoreo de `email_error` en el panel del dueño.

---

## Límites de Escalabilidad

**Cron de Vercel limitado a frecuencia diaria en plan Hobby:**
- Capacidad actual: el proyecto documenta (memoria del usuario, `vercel-hobby-cron-limit`) que en plan Hobby un cron más frecuente que diario rompe el deploy. El diseño asume cron cada 15 min para liberar holds vencidos.
- Límite: en Hobby, los holds vencidos se liberan solo 1 vez/día por el cron; entremedio dependen de la liberación inline en `/api/booking/create` (`:119-160`).
- Camino de escalado: plan Vercel Pro para cron sub-diario, o mover la expiración a un cron de la propia base (pg_cron en Supabase).

---

## Dependencias en Riesgo

**Integración MercadoPago acoplada a endpoints REST sin SDK tipado:**
- Riesgo: `mpFetch` (`lib/mercadopago.ts:120`) llama a la API de MP con `fetch` crudo y `any`. Cambios en la API de MP no se detectan en compilación.
- Impacto: rupturas silenciosas en cobros/suscripciones.
- Plan de migración: tipar las respuestas consumidas o adoptar el SDK oficial de MP.

---

## Características Críticas Faltantes

**Sin enforcement de límites de plan en el alta real (solo chequeo previo):**
- Problema: `checkProfessionalLimit` / `checkLocationLimit` (`lib/plan-limits.ts`) calculan `canAdd`, pero el enforcement depende de que cada caller lo consulte; no hay constraint en base ni gate centralizado.
- Bloquea: garantizar que un negocio no supere los límites de su plan por una ruta no cubierta.

**Sin tabla de idempotencia para webhooks:**
- Problema: la idempotencia del webhook de seña se basa en el estado del turno (`pending_payment`), no en el `paymentId` ya procesado.
- Bloquea: garantía fuerte de "procesar cada evento de pago una sola vez".

---

## Brechas de Cobertura de Tests

**No se detectó suite de tests automatizada:**
- Qué no está testeado: no se encontraron archivos `*.test.*` / `*.spec.*` ni configuración de runner (Jest/Vitest/Playwright) en el repo. Todo el aislamiento multi-tenant, los webhooks de pago y la lógica de doble-booking carecen de cobertura automatizada.
- Archivos: todo `app/api/**` y `supabase/migrations/**`.
- Riesgo: una regresión en RLS o en un webhook de pago puede romper aislamiento de tenants o cobros sin que nada lo detecte antes de prod.
- Prioridad: Alta — priorizar tests de aislamiento (dos negocios, intentar leer/escribir cruzado) y de los dos webhooks de MP.

---

*Auditoría de preocupaciones: 2026-06-15*
