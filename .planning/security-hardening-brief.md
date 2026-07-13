# Brief de Milestone — Security Hardening (pre-launch)

> Documento de entrada para `/gsd-new-project --auto`. Describe el milestone, sus
> requisitos y el desglose de fases para endurecer la seguridad de Forjo App
> antes del primer cliente. Basado en la auditoría `/gsd-map-codebase`
> (`.planning/codebase/CONCERNS.md`, 2026-06-15).

---

## Contexto del proyecto

Forjo App es un SaaS multi-tenant de gestión de turnos sobre **Next.js 16 (App Router) +
Supabase (RLS, aislamiento por `business_id`) + MercadoPago**. La app está en
desarrollo, sin clientes ni difusión pública todavía. El middleware vive en
`proxy.ts` (no `middleware.ts`). El despliegue objetivo es Vercel
(`gestion.forjo.studio`, plan Hobby con cron diario).

Una auditoría de codebase detectó varios agujeros de aislamiento entre tenants y
debilidades en webhooks de pago y endpoints admin. Ya se resolvió un crítico (la
policy RLS `public read businesses USING(true)` que exponía secretos al rol
`anon`). Este milestone agrupa el resto del trabajo de hardening necesario antes
de salir a producción con clientes reales.

## Objetivo del milestone

Cerrar los agujeros de aislamiento multi-tenant restantes, endurecer los webhooks
de pago y los endpoints admin, y dejar cobertura de tests automatizada que impida
regresiones de seguridad. Es pre-requisito para el lanzamiento.

**Versión objetivo:** v0.9 (endurecimiento pre-lanzamiento)

## Requisitos

- **SEC-01** — Ningún rol `anon` puede leer columnas sensibles de `businesses`,
  `services` ni `business_hours`. Las tablas con secretos no son legibles por
  `anon`; lo público se expone solo vía vistas acotadas.
- **SEC-02** — Ambos webhooks de MercadoPago validan firma `x-signature`
  (fail-closed). El webhook de seña además compara el monto pagado
  (`transaction_amount`) contra la seña esperada (`deposit_amount`).
- **SEC-03** — Los endpoints admin se autentican solo por header HTTP, con
  comparación en tiempo constante (`crypto.timingSafeEqual`), sin aceptar el
  secreto por query string.
- **SEC-04** — El endpoint público de creación de turnos rechaza reservas si el
  negocio tiene `plan_status` en `expired` o `cancelled`.
- **TEST-01** — Existe una suite de tests automatizada que cubre el aislamiento
  multi-tenant (lectura/escritura cruzada entre dos negocios) y los dos webhooks
  de pago, ejecutable en CI.

## Fases

### Fase 1 — RLS lockdown de tablas públicas
**Goal:** Eliminar el patrón `USING(true)` en `services` y `business_hours`
(gemelo del ya resuelto en `businesses`) y mover los secretos de `businesses` a
una tabla `business_secrets` con RLS solo-dueño.
**Requisitos:** SEC-01
**Notas de implementación:**
- Seguir el patrón de vista pública ya usado para `professionals`
  (`public_professionals`, `007_professionals_extended.sql`).
- Secretos a aislar: `mp_access_token`, `mp_refresh_token`, `resend_api_key`,
  `recaptcha_secret_key`, `google_refresh_token`.
- **Ítem condicional:** si la app estuvo desplegada en la URL pública de Vercel
  con secretos reales cargados, rotar las claves reales afectadas (reCAPTCHA,
  Resend, ADMIN_SECRET, CRON_SECRET; MP y Google solo si son de cuenta real).
  Si solo corrió en localhost, no aplica.
**Criterio de éxito:** El rol `anon` no puede `SELECT` columnas sensibles de
`businesses`/`services`/`business_hours`; la app pública sigue funcionando
leyendo las vistas acotadas.

### Fase 2 — Firma y monto en webhooks de pago
**Goal:** Extraer el verificador de firma a `lib/mercadopago.ts` y aplicarlo en
el webhook de seña (hoy sin firma), y comparar el monto pagado contra la seña
esperada.
**Requisitos:** SEC-02
**Notas de implementación:**
- El webhook de suscripción (`app/api/subscription/webhook/route.ts`) ya valida
  HMAC `x-signature` fail-closed; reusar esa lógica.
- El webhook de seña a endurecer es `app/api/payment/webhook/[slug]/route.ts`.
- Extraer `verifyMPSignature` a `lib/mercadopago.ts` para eliminar la duplicación
  y usarlo en ambos webhooks.
**Criterio de éxito:** El webhook de seña rechaza firmas inválidas (fail-closed);
un pago aprobado por un monto distinto al de la seña no confirma el turno.

### Fase 3 — Endurecer endpoints admin
**Goal:** Quitar la aceptación del secreto por query string en `setup-plans`,
usar comparación en tiempo constante en ambos endpoints admin, y evaluar sacar
`setup-plans` del runtime web.
**Requisitos:** SEC-03
**Notas de implementación:**
- Afecta `app/api/admin/set-plan/route.ts` y `app/api/admin/setup-plans/route.ts`.
- Reemplazar comparación `!==` por `crypto.timingSafeEqual`.
- `setup-plans` no debe leer el secreto desde `?secret=` (queda en logs).
**Criterio de éxito:** Los endpoints admin solo aceptan el secreto por header,
con comparación timing-safe; el secreto no aparece en logs de acceso.

### Fase 4 — Gating de plan en booking público
**Goal:** El endpoint público `/api/booking/create` consulta `plan_status` y
rechaza la reserva si el negocio está vencido o cancelado.
**Requisitos:** SEC-04
**Notas de implementación:**
- Hoy `app/api/booking/create/route.ts` no consulta `plan_status` en ningún punto.
**Criterio de éxito:** Un negocio con `plan_status` en `expired`/`cancelled` no
acepta reservas públicas por el link `/[slug]`.

### Fase 5 — Tests de aislamiento multi-tenant
**Goal:** Introducir un runner de tests (Vitest) y escribir tests de aislamiento
multi-tenant y de los dos webhooks de pago.
**Requisitos:** TEST-01
**Notas de implementación:**
- No existe suite de tests en el repo hoy.
- Priorizar: aislamiento (dos negocios, intento de lectura/escritura cruzada) y
  los dos webhooks de MP.
- Apoyarse en la skill del proyecto `supabase-multitenant-rls` (incluye checklist
  de aislamiento).
- Va última a propósito: tener los fixes de las fases 1–4 hechos da el
  comportamiento correcto contra el cual escribir los tests.
**Criterio de éxito:** La suite corre en CI; los tests de aislamiento confirman
que la lectura/escritura cruzada entre tenants falla; los dos webhooks tienen
cobertura.

## Orden y dependencias

Las fases 1 → 2 → 3 → 4 son independientes entre sí y pueden reordenarse por
urgencia. La fase 5 va al final, ya que los tests se escriben contra el
comportamiento correcto que dejan las fases anteriores.

## Fuera de scope (backlog para v2)

Estos ítems son robustez o deuda técnica, no agujeros de seguridad, y no bloquean
el lanzamiento:

- Tabla `webhook_events` para idempotencia fuerte de webhooks (procesar cada
  evento de pago una sola vez).
- Rate-limiting por IP en `/api/booking/create` para negocios sin reCAPTCHA.
- Unificar las tres fuentes de verdad de planes (`lib/plans.ts`,
  `lib/subscription-plans.ts`, `lib/plan-limits.ts`).
- Adoptar Supabase CLI migrations o una tabla de control de versiones de esquema.
- Tipar `mpFetch` / adoptar el SDK oficial de MercadoPago.
- Centralizar la lógica de expiración de turnos (hoy replicada en tres lugares).
