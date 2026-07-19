# Roadmap: Forjo App — Resiliencia de MercadoPago Connect (workstream `mp-connect`)

> Workstream **nuevo** `mp-connect`. Cubre **v0.23 Resiliencia de MercadoPago Connect** (Phases 1-2). Numeración de fases del workstream desde **Phase 1**. PROJECT.md compartido en `.planning/PROJECT.md` (sección "Current Milestone (workstream `mp-connect`)"); requirements en `.planning/workstreams/mp-connect/REQUIREMENTS.md`. Aplican las skills `mercadopago-connect` (patrón real del OAuth del negocio) y `supabase-multitenant-rls` (aislamiento por tenant).

## Overview

Un fallo de refresh del token OAuth **del negocio** (MercadoPago Connect / cobro de señas a sus clientes) hoy degrada en silencio: `getValidMpAccessToken` (`lib/payment.ts:40-64`) devuelve el token vencido cuando MP rechaza el refresh (líneas 47-50) y no detecta si falla la persistencia del token rotado single-use (`.update()` de 54-61 sin chequeo de error). Encima el dashboard marca "Conectado" solo por `mp_user_id` (`settings-client.tsx`), un flag que nunca se limpia ante fallo → el dueño cree que puede cobrar cuando la conexión está caída. Es el punto frágil #1 de la skill `mercadopago-connect`.

Este milestone hace que ese fallo **deje de ser mudo**: la conexión caída se **detecta** (el resolver no cobra con un token vencido ni con uno rotado sin persistir), se **persiste** de forma durable (flag `mp_connection_status` en `businesses`), se **loguea** con el motivo real, se **limpia** al reconectar por OAuth, y se **avisa** en el dashboard con acceso al flujo de reconexión existente. NO toca el flujo de suscripciones de los planes de Forjo (token de plataforma, otro flujo). El aislamiento por tenant queda intacto (RLS + `business_id` / `owner_id`) y la migración es idempotente y **no se aplica automáticamente** por el flujo — su orden se coordina con el deploy.

El faseo va por superficie y riesgo: primero el backend de integridad de pagos (detección + persistencia + log + limpieza al reconectar), que pasa por **secure-phase** por tocar integridad de pagos + tokens + RLS; después el aviso en el dashboard (UI), que depende de la columna y de la lógica de escritura de la Phase 1.

## Phases

**Phase Numbering:**

- Integer phases: Planned milestone work (numeración desde Phase 1 — workstream nuevo)
- Decimal phases (1.1, 1.2): Urgent insertions (marked with INSERTED)

### Milestone v0.23 — Resiliencia de MercadoPago Connect

- [ ] **Phase 1: Detección y estado de conexión caída** - El resolver de token deja de caer en fallback mudo (refresh rechazado o token rotado sin persistir → conexión caída, no cobra), el estado se persiste durable en `businesses` (migración 053 idempotente, sin aplicar), se loguea el motivo real y la reconexión OAuth limpia el flag
- [ ] **Phase 2: Aviso de reconexión en el dashboard** - El dashboard refleja el estado real: con la conexión caída muestra un aviso de reconexión (con acceso al flujo OAuth existente) en vez de un "Conectado" engañoso

## Phase Details

### Phase 1: Detección y estado de conexión caída

**Goal**: Que un fallo de refresh del token OAuth del negocio deje de degradar en silencio: cuando MP rechaza el refresh o falla la persistencia del token rotado single-use, la conexión se trata como **caída** — no se intenta cobrar la seña con un token vencido/no persistido — y ese estado se persiste de forma durable, se loguea con el motivo real y se limpia cuando el dueño reconecta por OAuth. Es el corazón del milestone: toca integridad de pagos, tokens y RLS, y **pasa por secure-phase**.

**Depends on**: Nothing (first phase)

**Requirements**: MPCONN-01, MPCONN-02, MPCONN-03, MPCONN-05, MPCONN-06

**Success Criteria** (what must be TRUE):

  1. Cuando MP rechaza el refresh del `refresh_token`, `getValidMpAccessToken` NO devuelve el token vencido: no se intenta cobrar la seña con ese token y la conexión se trata como caída (MPCONN-01).
  2. Cuando el refresh es exitoso pero falla la persistencia del token rotado (access + refresh + expiry nuevos), la conexión también se marca caída — no queda un `refresh_token` single-use consumido sin que su reemplazo se haya guardado (MPCONN-02).
  3. El estado de conexión queda persistido de forma durable en `businesses` (flag `mp_connection_status`, "sano" vs "caído") mediante una migración numerada idempotente (propuesta 053) que NO se aplica automáticamente por el flujo — su orden se coordina con el deploy — y que preserva el aislamiento por tenant (RLS + `business_id`) sin exponer nada a `anon` (MPCONN-03).
  4. Una reconexión OAuth exitosa (callback `app/api/mercadopago/callback/route.ts`) vuelve a marcar la conexión del negocio como sana (limpia el flag a "conectado"), y solo la de SU negocio (MPCONN-05).
  5. Ningún cobro de seña falla de forma muda: cuando no puede hacerse por token inválido / conexión caída, queda un log server-side con severidad indicando el motivo real (MPCONN-06).

**Plans**: TBD

**Security/Integrity relevance**: Fase **security-sensitive** (pasa por secure-phase). Toca el resolver de token del cobro de señas (integridad de pagos), la rotación single-use del `refresh_token` (una escritura fallida sin detectar deja la conexión rota) y una tabla de tenant (`businesses`). Invariantes a sostener: (a) NO cobrar nunca con un token vencido/no persistido — el "fallback mudo" actual es exactamente el bug a cerrar; (b) el flag `mp_connection_status` vive en `businesses` bajo RLS, keyed por `business_id`/`owner_id` — un negocio no puede leer ni cambiar el estado de conexión de otro, y `anon` no lo ve; (c) NO tocar el flujo de suscripciones de los planes (token de plataforma `MP_FORJO_ACCESS_TOKEN`, otro flujo); (d) la migración 053 es idempotente y NO se aplica por el flujo — checkpoint humano coordina migración + deploy (baseline: última aplicada 052 de v0.22 → la próxima es 053). Aplican las skills `mercadopago-connect` y `supabase-multitenant-rls`. El secure-phase gate verifica: cero cobro con token inválido (MPCONN-01/02), aislamiento por tenant del flag (MPCONN-03/05), y que el log no filtre secretos de token.

### Phase 2: Aviso de reconexión en el dashboard

**Goal**: Que el dueño vea en el dashboard el estado **real** de su conexión con MercadoPago: cuando está caída, un aviso claro de reconexión con acceso al flujo OAuth existente, en lugar del "Conectado" engañoso que hoy se muestra solo por `mp_user_id`. Consume el flag y la lógica de escritura que dejó la Phase 1.

**Depends on**: Phase 1 (necesita la columna `mp_connection_status` y la lógica que la escribe/limpia)

**Requirements**: MPCONN-04

**Success Criteria** (what must be TRUE):

  1. Con la conexión sana (flag "conectado" y `mp_user_id` presente), el dashboard sigue mostrando "Conectado" igual que hoy (cero regresión).
  2. Con la conexión caída (flag en error y `mp_user_id` presente), el dashboard muestra en lugar de "Conectado" un aviso claro de reconexión ("Tu conexión con MercadoPago se interrumpió, reconectá tu cuenta para seguir cobrando señas").
  3. El aviso de reconexión da acceso al flujo OAuth de reconexión ya existente, sin obligar a desvincular la cuenta primero.
  4. El estado que ve el dueño es el de SU negocio: el dashboard lo lee del `business` resuelto por `owner_id` (aislamiento por tenant), sin reflejar el estado de conexión de otro negocio.

**Plans**: TBD

**UI hint**: yes

**Security/Integrity relevance**: Superficie de dashboard (`settings-client.tsx`), autenticada y acotada al negocio del dueño. Riesgo bajo: no redefine constraints ni el flujo público; lee el flag `mp_connection_status` del `business` ya resuelto por `owner_id` (RLS activa, anon key). Debe mantener el aislamiento por tenant (nunca leer/mostrar el estado de otro negocio) y NO exponer secretos de token en la UI — solo el estado sano/caído. El aviso reusa el flujo OAuth de reconexión existente sin abrir un camino nuevo.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Detección y estado de conexión caída | 0/? | Not started | - |
| 2. Aviso de reconexión en el dashboard | 0/? | Not started | - |
