# Requirements: Forjo App — v0.23 "Resiliencia de MercadoPago Connect" (workstream `mp-connect`)

> Workstream nuevo `mp-connect`. Cubre la resiliencia del token OAuth **del negocio** (MercadoPago
> Connect / cobro de señas), NO el flujo de suscripciones de los planes de Forjo (token de plataforma,
> no se toca). Aplican las skills `mercadopago-connect` y `supabase-multitenant-rls`. PROJECT.md
> compartido en `.planning/PROJECT.md`. Numeración de fases del workstream desde Phase 1.

## Contexto (diagnóstico verificado en código, sesión 2026-07-19)

Hoy `getValidMpAccessToken` ([lib/payment.ts:40-64](../../../lib/payment.ts)) tiene dos fallbacks
silenciosos: si el refresh es rechazado por MP devuelve el token vencido (líneas 47-50), y si falla la
persistencia del token rotado no lo detecta (el `.update()` de líneas 54-61 no chequea el error). El
`refresh_token` de MP es single-use → si esa escritura falla, la conexión queda rota sin aviso. Además
el dashboard marca "conectado" solo por `mp_user_id` ([settings-client.tsx:699](../../../app/(dashboard)/settings/settings-client.tsx),
render 1589-1599), que nunca se limpia ante fallo → el dueño cree que puede cobrar cuando la conexión
está caída. Es el punto frágil #1 de la skill `mercadopago-connect`.

## v0.23 Requirements

### Detección y estado de conexión (MPCONN)

- [x] **MPCONN-01**: Si MP rechaza el refresh del `refresh_token`, el resolver NO sigue con un token
  vencido: trata la conexión como caída y no intenta cobrar con ese token.

- [x] **MPCONN-02**: Si falla la persistencia del token rotado (access + refresh + expiry nuevos) tras
  un refresh exitoso, también se trata la conexión como caída — no se deja un `refresh_token`
  single-use consumido sin persistir el nuevo.

- [ ] **MPCONN-03**: El estado de conexión se persiste de forma durable (flag en `businesses`,
  propuesta `mp_connection_status text default 'connected'`), distinguiendo "conectado y sano" de
  "conexión caída". Migración numerada e idempotente en `supabase/migrations/` (propuesta 053), NO
  aplicada por el flujo — se coordina el orden con el deploy. Aislamiento por tenant intacto.

- [x] **MPCONN-05**: Una reconexión OAuth exitosa (callback) limpia el flag → vuelve a "sano".

- [x] **MPCONN-06**: Cuando un cobro de seña no puede hacerse por token inválido/conexión caída, se
  loguea server-side con severidad el motivo real; sin fallo mudo.

### Dashboard (MPCONN)

- [x] **MPCONN-04**: El dashboard refleja el estado real: si la conexión está caída (flag en error con
  `mp_user_id` presente), muestra un aviso claro de reconexión ("Tu conexión con MercadoPago se
  interrumpió, reconectá tu cuenta para seguir cobrando señas") con acceso al flujo OAuth existente,
  en lugar de mostrar "Conectado".

## Out of Scope

- **Flujo de suscripciones de Forjo** (token de plataforma `MP_FORJO_ACCESS_TOKEN`) — otro flujo, no se toca.
- **Cifrado de los tokens en `business_secrets`** (deuda #3 de la skill) — ítem aparte, no este milestone.
- **Reintento automático de cobros** fallidos — acá solo se detecta/persiste/avisa, no se reintenta.
- **Notificación por mail al negocio** de la caída — v0.23 avisa en el dashboard; el mail queda para futuro.
- **`scope=offline_access read write` explícito** en la URL de autorización (deuda #2 de la skill) —
  candidato a sumar; evaluar en discuss-phase, no comprometido aún.

## Traceability

| REQ-ID | Phase |
|--------|-------|
| MPCONN-01 | Phase 1 |
| MPCONN-02 | Phase 1 |
| MPCONN-03 | Phase 1 |
| MPCONN-04 | Phase 2 |
| MPCONN-05 | Phase 1 |
| MPCONN-06 | Phase 1 |
