# Phase 2: MP Webhook Signature + Amount Check - Research

**Researched:** 2026-06-16
**Domain:** MercadoPago webhook security (HMAC `x-signature` validation + payment amount verification) on Next.js 16 route handlers, MercadoPago Connect/OAuth flow
**Confidence:** HIGH

## Summary

Esta fase endurece el webhook de seña `app/api/payment/webhook/[slug]/route.ts` (SEC-02) con dos controles: (1) validar la firma `x-signature` fail-closed reusando el `verifyMPSignature` ya probado del webhook de suscripción —extrayéndolo a `lib/mercadopago.ts`—; y (2) comparar el monto pagado (`transaction_amount`, traído de MP) contra la seña esperada (`deposit_amount`) en centavos enteros antes de confirmar el turno. No hay paquetes nuevos: `crypto` es built-in de Node y `NextRequest` ya se importa en ambos webhooks. El riesgo técnico #1 era saber qué secreto valida la firma en el flujo Connect (cuentas conectadas por OAuth) — **resuelto: es el secreto de webhook de la APLICACIÓN de Forjo, no un secreto por cuenta conectada**, así que `getMPWebhookSecret()` sirve tal cual.

La extracción de `verifyMPSignature` es mecánicamente limpia: su única dependencia (`getMPWebhookSecret`) ya vive en el archivo destino, y `crypto` + el tipo `NextRequest` son importables en `lib/`. El verificador ya es fail-closed (secreto ausente → `false`), ya hace `timingSafeEqual` con guard de longitud, y ya espera recibir un `dataId` ya resuelto como parámetro. El único cuidado real es la **fuente de `data.id`**: MP lo manda en el query string para notificaciones de pago (confirmado en docs oficiales), igual que en suscripción; el webhook de seña hoy lo lee SOLO del body — hay que cambiarlo a query-string-primero o toda llamada real de MP fallará la firma (fail-closed → deposits dejan de confirmarse).

La comparación de monto es directa porque `transaction_amount` (Float, en unidad bruta de moneda — ej. `1500.00` ARS, NO centavos) y `deposit_amount` (`DECIMAL(10,2)`) están en la misma unidad; ambos se llevan a centavos enteros con `Math.round(x*100)` y se comparan con `===` exacto (D-01).

**Primary recommendation:** Extraer `verifyMPSignature` a `lib/mercadopago.ts` con la misma firma `(request: NextRequest, dataId: string | null | undefined): boolean`, importarlo en ambos webhooks, resolver `data.id` en el webhook de seña con `searchParams.get('data.id') ?? searchParams.get('id') ?? body.data?.id`, rechazar 401 fail-closed antes de `after()`, y dentro del branch `approved` comparar `Math.round(payment.transaction_amount*100) === Math.round(appt.deposit_amount*100)` — si no coincide, NO confirmar, setear `payment_status='amount_mismatch'`, loguear, y saltarse email + Google Calendar.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Comparación **exacta en centavos enteros**: `Math.round(payment.transaction_amount * 100) === Math.round(appt.deposit_amount * 100)`. Cualquier diferencia (de más o de menos) cuenta como monto incorrecto. Se usa el `transaction_amount` traído de MP (`GET /v1/payments/{id}`, ya se hace en el handler), NUNCA un monto del body del webhook. Se evita comparar floats directos.
- **D-02:** Si el monto no coincide (firma válida, pago `approved`, pero monto ≠ esperado): **NO confirmar el turno**. Queda en `pending_payment` (no se cancela), `payment_status = 'amount_mismatch'` + `console.error('[payment/webhook] monto incorrecto', { paymentId, expected, paid })`. Distingue "intentó pagar con monto incorrecto" de "nunca intentó pagar" (`payment_status` nulo). No se manda email de confirmación ni se crea evento de Google Calendar.
- **D-03:** Extraer `verifyMPSignature` a `lib/mercadopago.ts` (donde ya vive `getMPWebhookSecret`) con la misma firma `(request, dataId)`, e importarlo en AMBOS webhooks (seña + suscripción). El de suscripción solo cambia el import — su comportamiento no cambia. Elimina la duplicación.
- **D-04:** Fail-closed: sin `MP_WEBHOOK_SECRET[_TEST]` o firma inválida → `401`, antes de tocar nada (no procesar en `after()`).
- **D-05:** `data.id` para el manifest se resuelve del **query string primero** (`searchParams.get('data.id') ?? searchParams.get('id')`), con fallback al `body.data.id`, lowercased — exactamente como el webhook de suscripción.

### Claude's Discretion
- Nombre exacto del valor de `payment_status` para el mismatch (`'amount_mismatch'` propuesto) y si conviene un comentario en español denso explicando el porqué. El planner/executor lo definen siguiendo convenciones.

### Deferred Ideas (OUT OF SCOPE)
- Tabla `webhook_events` para idempotencia fuerte → backlog v2.
- Validación anti-replay del `ts` de la firma (rechazar timestamps viejos con ventana de tolerancia) → no pedido; hardening opcional, fuera del criterio de éxito de SEC-02. (Ver "Open Questions" abajo para una nota.)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-02 | Ambos webhooks de MercadoPago validan firma `x-signature` (fail-closed). El webhook de seña además compara `transaction_amount` contra `deposit_amount`. | Secreto de firma confirmado application-level (sirve `getMPWebhookSecret`); `data.id` de query string confirmado en docs MP; `transaction_amount` confirmado Float en unidad bruta (mismo unit que `deposit_amount` DECIMAL(10,2)) → comparación en centavos enteros válida; extracción de `verifyMPSignature` confirmada sin romper imports. |

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **Next.js 16, NO 14:** breaking changes; consultar `node_modules/next/dist/docs/` antes de asumir comportamiento. Middleware = `proxy.ts`. `after()` se importa de `next/server` (ya en uso en ambos webhooks).
- **Service role solo en server:** el webhook usa `createAdminClient()` (bypassa RLS) y resuelve el tenant por `slug`. No cambia en esta fase.
- **Manejo de errores del repo:** logging server-side con prefijo `[modulo/accion]` (`console.error('[payment/webhook] ...')`); extraer mensaje seguro `e instanceof Error ? e.message : e`. Webhooks NO usan `Response.json({ok})` — usan `new Response('OK'|'Invalid signature', { status })` (patrón propio de webhooks, ver suscripción).
- **Comentarios densos en español** explicando el porqué (seguridad, fail-closed, concurrencia) — convención del repo, especialmente en código de pagos.
- **Dev env Windows + PowerShell** — cualquier comando del plan debe usar sintaxis PowerShell, no bash.
- **Anti-tampering de tenant:** nunca confiar en datos del cliente/body para montos ni IDs sensibles — el monto se toma del payment traído de MP, el tenant del slug.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Validar firma `x-signature` (HMAC) | Shared Lib (`lib/mercadopago.ts`) | Route Handler (call site) | La verificación HMAC es lógica framework-agnostic reutilizable por ambos webhooks; el route handler resuelve los inputs (`data.id`) y decide el 401. |
| Resolver `data.id` del request | Route Handler | — | Depende del request específico (query string vs body); cada webhook lo resuelve en su call site. |
| Traer el payment de MP (`GET /v1/payments/{id}`) | Route Handler (`payment/webhook`) | — | Ya se hace; usa el token per-negocio (Connect) resuelto vía `getValidMpAccessToken`. |
| Comparar monto pagado vs esperado | Route Handler (`payment/webhook`) | — | Lógica de dominio específica del flujo de seña; el `deposit_amount` ya está en la fila del turno. |
| Persistir `amount_mismatch` / `confirmed` | Database (`appointments`) vía service role | Route Handler | Escritura keyed por `appointmentId`, dentro de `after()`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `crypto` (Node built-in) | Node runtime | HMAC-SHA256 + `timingSafeEqual` para validar firma | Ya en uso en el webhook de suscripción; built-in, sin dependencia externa. [VERIFIED: codebase `app/api/subscription/webhook/route.ts:1`] |
| `next/server` (`NextRequest`, `after`) | Next 16.2.7 | Tipo del request + ejecución diferida post-respuesta | Ya en uso en ambos webhooks. [VERIFIED: codebase] |
| `@/lib/supabase/admin` (`createAdminClient`) | — | Lectura/escritura service-role del turno | Ya en uso en el handler. [VERIFIED: codebase] |
| `@/lib/mercadopago` (`getMPWebhookSecret`, destino de `verifyMPSignature`) | — | Fuente del secreto por `MP_MODE` + verificador extraído | Ya exporta `getMPWebhookSecret`; destino natural de la extracción. [VERIFIED: codebase `lib/mercadopago.ts:21`] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/lib/payment` (`getValidMpAccessToken`) | — | Token MP per-negocio para `GET /v1/payments/{id}` | Ya en uso (§69 del handler); no cambia. [VERIFIED: codebase] |
| `@/lib/business-secrets` (`getBusinessSecrets`) | — | Secretos del tenant (MP token, Resend, Google) | Ya en uso; no cambia. [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `crypto` built-in HMAC | SDK oficial de MercadoPago (`mercadopago` npm) | El repo NO usa el SDK (decisión existente, ver AGENTS/CLAUDE.md: MP se llama por `fetch` directo). Adoptar el SDK está explícitamente en backlog v2. NO introducir en esta fase. |

**Installation:** Ninguna. No se instalan paquetes nuevos — `crypto` y `next/server` ya están disponibles.

## Package Legitimacy Audit

No aplica: esta fase no instala paquetes externos. Usa únicamente `crypto` (built-in de Node) y módulos ya presentes en el repo (`next/server`, `@/lib/*`). Sin superficie de slopsquatting.

## Architecture Patterns

### System Architecture Diagram

```text
MercadoPago (cuenta conectada del negocio, vía Connect/OAuth)
        │  POST /api/payment/webhook/{slug}?data.id=<paymentId>&type=payment
        │  headers: x-signature: "ts=<unix>,v1=<hex hmac>"  +  x-request-id
        │  body: { type:'payment', data:{ id:<paymentId> } }   (sólo el id, no el monto)
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ POST handler  (app/api/payment/webhook/[slug]/route.ts, runtime Node)     │
│                                                                           │
│  1. parse body (try/catch → 200 si falla, no se procesa)                  │
│  2. resolver dataId = searchParams('data.id') ?? searchParams('id')       │
│                         ?? body.data.id              ← D-05 (NUEVO)        │
│  3. verifyMPSignature(request, dataId)  ← import de lib/mercadopago        │
│        secreto = getMPWebhookSecret()  (MP_MODE → SECRET / SECRET_TEST)    │
│        manifest = "id:<id.lower>;request-id:<x-request-id>;ts:<ts>;"      │
│        HMAC-SHA256 == v1  (timingSafeEqual, fail-closed)                  │
│     └─ inválida / secreto ausente / header ausente → 401  (ANTES de after)│
│  4. válida → Response 200  +  after(processWebhook(slug, paymentId))      │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ after() (la respuesta 200 ya se envió)
                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ processWebhook(slug, paymentId)                                           │
│  • business + secrets (business_secrets, service role)                    │
│  • mpToken = getValidMpAccessToken(...)  (token per-negocio Connect)      │
│  • payment = GET /v1/payments/{paymentId}  (Bearer mpToken)               │
│  • appt = appointments where id = payment.external_reference              │
│                                                                           │
│  if payment.status === 'approved':                                        │
│     if appt.status !== 'pending_payment' → return (idempotencia)          │
│     ┌── NUEVO: amount check (D-01/D-02) ──────────────────────────────┐  │
│     │ paidCents = round(payment.transaction_amount * 100)             │  │
│     │ expCents  = round(appt.deposit_amount * 100)                    │  │
│     │ if paidCents !== expCents:                                      │  │
│     │    update appt: payment_status='amount_mismatch'  (NO confirma) │  │
│     │    console.error('[payment/webhook] monto incorrecto', {...})   │  │
│     │    return  → sin email, sin Google Calendar                     │  │
│     └─────────────────────────────────────────────────────────────────┘  │
│     update appt: status='confirmed', deposit_paid, payment_status='paid'  │
│     → email confirmación + notif admin + Google Calendar (best-effort)    │
│  else if status in [rejected,cancelled,refunded,charged_back]: cancela    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```text
lib/
└── mercadopago.ts        # + verifyMPSignature (extraído; junto a getMPWebhookSecret)
app/api/
├── payment/webhook/[slug]/route.ts   # import verifyMPSignature; +data.id query; +amount check
└── subscription/webhook/route.ts     # solo cambia el import (borra la copia inline)
```

### Pattern 1: Extract-and-reuse del verificador HMAC (D-03 / ARCHITECTURE §Pattern 3)
**What:** Mover `verifyMPSignature` (hoy inline en `subscription/webhook/route.ts:18-54`) a `lib/mercadopago.ts` con `export`, importarlo en ambos webhooks.
**When:** Ahora — su única dependencia (`getMPWebhookSecret`) ya está en el destino.
**Example (firma a preservar exactamente):**
```typescript
// Source: codebase app/api/subscription/webhook/route.ts:18 (VERIFIED, validado en prod)
// En lib/mercadopago.ts, agregar:
import crypto from 'crypto'
import type { NextRequest } from 'next/server'
// getMPWebhookSecret ya está en este archivo.

export function verifyMPSignature(request: NextRequest, dataId: string | null | undefined): boolean {
  const secret = getMPWebhookSecret()
  if (!secret) { console.error('MP_WEBHOOK_SECRET no configurado — webhook rechazado'); return false }
  const signature = request.headers.get('x-signature')
  const requestId = request.headers.get('x-request-id')
  if (!signature) return false
  let ts: string | undefined; let v1: string | undefined
  for (const part of signature.split(',')) {
    const idx = part.indexOf('='); if (idx === -1) continue
    const key = part.slice(0, idx).trim(); const val = part.slice(idx + 1).trim()
    if (key === 'ts') ts = val; else if (key === 'v1') v1 = val
  }
  if (!ts || !v1) return false
  const id = dataId ? String(dataId).toLowerCase() : undefined
  let manifest = ''
  if (id) manifest += `id:${id};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`
  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  const a = Buffer.from(computed, 'hex'); const b = Buffer.from(v1, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
```
**Imports en lib/:** `import crypto from 'crypto'` y `import type { NextRequest } from 'next/server'` son válidos en `lib/mercadopago.ts` (es código server-only, runtime Node — el módulo ya hace `fetch` y lee `process.env`). El `import type` no agrega runtime. [VERIFIED: codebase — el verificador ya usa exactamente estos imports en el route handler de Node; `lib/mercadopago.ts` no es `'use client'`.]

### Pattern 2: Resolución de `data.id` query-string-primero (D-05 / Pitfall 8)
**What:** En el webhook de seña, resolver `data.id` igual que el de suscripción.
**When:** Antes de llamar `verifyMPSignature` y antes de `after()`.
**Example:**
```typescript
// Source: codebase app/api/subscription/webhook/route.ts:57-68 (VERIFIED)
const dataIdQuery = request.nextUrl.searchParams.get('data.id')
  ?? request.nextUrl.searchParams.get('id')
let body: { type?: string; data?: { id?: string } }
try { body = await request.json() } catch { return new Response('OK', { status: 200 }) }
if (!verifyMPSignature(request, dataIdQuery ?? body.data?.id)) {
  return new Response('Invalid signature', { status: 401 })
}
```
> Nota Next 16: el patrón actual del handler de seña lee el body ANTES de chequear nada (§16). El nuevo orden debe ser: leer `searchParams` (sincrónico, `request.nextUrl`), leer body, verificar firma → 401, recién después `after()`. `params` (el `slug`) es `Promise` en Next 16 y se await como ya se hace (§26).

### Pattern 3: Comparación de monto en centavos enteros (D-01/D-02 / Pitfall 10 / Anti-Pattern 4)
**What:** Dentro del branch `payment.status === 'approved'`, después del guard de idempotencia (`appt.status === 'pending_payment'`) y ANTES del `update` a `confirmed`.
**Example:**
```typescript
// Source: derivado de codebase + D-01 (ASSUMED naming 'amount_mismatch' — Claude's discretion)
const paidCents = Math.round(Number(payment.transaction_amount) * 100)
const expectedCents = Math.round(Number(appt.deposit_amount || 0) * 100)
if (paidCents !== expectedCents) {
  await supabase.from('appointments')
    .update({ payment_status: 'amount_mismatch' })   // NO confirma; queda pending_payment
    .eq('id', appointmentId)
  console.error('[payment/webhook] monto incorrecto', { paymentId, expected: expectedCents, paid: paidCents })
  return  // sin email, sin Google Calendar
}
// ... sigue el update a 'confirmed' + efectos best-effort
```

### Anti-Patterns to Avoid
- **Confiar en el monto del body del webhook:** el body sólo trae `data.id`, NUNCA el monto. Comparar siempre contra `payment.transaction_amount` del `GET /v1/payments/{id}` ya traído (§76-79). (Anti-Pattern 4.)
- **Pasar `body.data.id` solo a `verifyMPSignature`:** MP manda `data.id` en query string para pagos; ignorar el query string hace fallar TODA llamada real (fail-closed → deposits no confirman). (Pitfall 8.)
- **Fail-open `if (signature) verify`:** estructurar como ladder de `return false` temprano; sólo una firma completa y válida pasa. (Pitfall 9.)
- **Comparar floats directos (`transaction_amount === deposit_amount`):** `1500.00 !== 1499.999...`; usar `Math.round(x*100)`. (Pitfall 10.)
- **Duplicar el verificador inline en el webhook de seña:** extraer una vez a `lib/`, importar en ambos. (Anti-Pattern 3.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validar firma HMAC del webhook | Un verificador nuevo en el handler de seña | `verifyMPSignature` extraído de suscripción | Ya validado en prod; manifest, lowercasing, `timingSafeEqual` con guard de longitud y fail-closed ya resueltos. Reescribir reintroduce los bugs que el de suscripción ya evitó. |
| Comparación constante de buffers | `a === b` o loop manual | `crypto.timingSafeEqual` (con guard de longitud previo) | Evita side-channel de timing; el guard `a.length !== b.length` evita el throw de `RangeError`. |
| Fuente del secreto por modo | Leer `process.env.MP_WEBHOOK_SECRET` directo | `getMPWebhookSecret()` | Ya respeta `MP_MODE` (`_TEST` vs prod); un mismatch test/prod produce "firmas válidas rechazadas". |

**Key insight:** El 90% de esta fase es reuso disciplinado de código ya probado. El riesgo no está en escribir lógica nueva sino en (a) la fuente correcta de `data.id` y (b) la unidad correcta del monto — ambas resueltas abajo con docs oficiales.

## Runtime State Inventory

> No es una fase de rename/refactor de strings ni de migración de datos. Es código nuevo + extracción de una función. Aun así, se verifican las categorías relevantes:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `appointments.payment_status` (TEXT DEFAULT 'unpaid') — se le agrega un valor nuevo `'amount_mismatch'`. NO requiere migración (columna TEXT libre, no es enum). `appointments.deposit_amount` DECIMAL(10,2) ya existe. | Ninguna migración. Sólo un valor de dato nuevo en una columna existente. |
| Live service config | El secreto de webhook (`MP_WEBHOOK_SECRET[_TEST]`) está configurado en MP "Your integrations" a nivel APLICACIÓN de Forjo. El webhook de seña usa ese MISMO secreto (confirmado: la firma de notificaciones de cuentas conectadas se valida con el secreto de la app, no por cuenta). NO hay que dar de alta un secreto por negocio. | Ninguna. Verificar que `MP_WEBHOOK_SECRET` (y `_TEST`) estén seteados en Vercel/`.env.local` (precondición operativa, no de código). |
| OS-registered state | Ninguno. | Ninguna. |
| Secrets/env vars | `MP_WEBHOOK_SECRET`, `MP_WEBHOOK_SECRET_TEST` (ya consumidos por `getMPWebhookSecret`). No se renombran ni agregan. | Ninguna. |
| Build artifacts | Ninguno. | Ninguna. |

**Importante (precondición de deploy):** Si `MP_WEBHOOK_SECRET` no estuviera configurado para el modo actual, el webhook de seña pasaría de "acepta todo" a "rechaza todo" (fail-closed por diseño, D-04). El plan debe incluir un checkpoint de verificación de que el secreto está seteado en el entorno objetivo ANTES de deployar — de lo contrario los deposits dejan de confirmarse en silencio. (Ya documentado en memoria [[webhook-mp-signature]].)

## Common Pitfalls

### Pitfall 1: `data.id` desde el body en vez del query string (fail-closed → todo rechazado)
**What goes wrong:** El handler de seña hoy lee `data.id` sólo del body. MP firma el manifest con el `data.id` del **query string**; si verificás con el del body (o lo omitís), el HMAC no coincide y TODA llamada real de MP da 401 → los deposits dejan de confirmarse en silencio.
**Why it happens:** "Reusar la función" oculta que los *inputs* difieren por ruta.
**How to avoid:** Resolver `searchParams.get('data.id') ?? searchParams.get('id') ?? body.data?.id`, lowercased dentro del verificador (ya lo hace). [CITED: mercadopago.com.br/developers/.../webhooks — "Parameters with the `_url` suffix come from query params"; manifest `id:[data.id_url];...`]
**Warning signs:** El webhook empieza a devolver 401 a llamadas reales; turnos pagados quedan en `pending_payment`.

### Pitfall 2: Secreto test vs prod cruzado
**What goes wrong:** Validar con `MP_WEBHOOK_SECRET` en modo test (o `_TEST` en prod) → "firmas válidas rechazadas", síntoma idéntico al de Pitfall 1.
**Why it happens:** Dos secretos, un solo punto de lectura mal configurado.
**How to avoid:** Usar `getMPWebhookSecret()` (ya keyea por `MP_MODE`). Verificar el modo en el deploy. [VERIFIED: codebase `lib/mercadopago.ts:21-26`] [CITED: github.com/mercadopago/sdk-nodejs/discussions/318 — falla prod-only por secreto]

### Pitfall 3: Comparar floats directos / unidad equivocada
**What goes wrong:** `transaction_amount === deposit_amount` con floats puede rechazar pagos válidos (`1500.00 !== 1499.9999`) o dejar pasar un monto mal representado.
**Why it happens:** `transaction_amount` es Float JSON en unidad bruta de moneda; `deposit_amount` es DECIMAL.
**How to avoid:** `Math.round(x*100)` en ambos lados, comparar enteros con `===` (D-01). Ambos están en pesos enteros/decimales (NO centavos), confirmado abajo. [CITED: mercadopago.com.ar/developers/en/reference — `transaction_amount` Float, valor bruto ej. `24.50`, no centavos]
**Warning signs:** Un pago de $1 confirma un turno con seña mayor; o pagos correctos quedan en `amount_mismatch`.

### Pitfall 4: Fail-open en header ausente
**What goes wrong:** `if (signature) { verify }` sin `else reject` deja pasar requests sin `x-signature`.
**How to avoid:** Ladder de `return false` temprano (el verificador ya lo hace: `if (!signature) return false`, secreto ausente → `false`). 401 en rechazo. (Pitfall 9.)

### Pitfall 5: Romper el orden del handler (body antes de verificar / `after()` antes de 401)
**What goes wrong:** Verificar dentro de `after()` significa que el 200 ya se envió y un request forjado igual disparó trabajo. O leer el body y procesar antes del 401.
**How to avoid:** Orden estricto: resolver `searchParams` → parsear body → `verifyMPSignature` → 401 si falla → recién `Response 200` + `after()`. Mirror del webhook de suscripción.

## Code Examples

### Verificar firma antes de procesar (handler de seña, nuevo orden)
```typescript
// Source: codebase subscription/webhook/route.ts:56-84 adaptado a la firma slug (VERIFIED)
import { verifyMPSignature } from '@/lib/mercadopago'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const dataIdQuery = request.nextUrl.searchParams.get('data.id')
    ?? request.nextUrl.searchParams.get('id')

  let body: { type?: string; data?: { id?: string } }
  try { body = await request.json() } catch { return new Response('OK', { status: 200 }) }

  // Fail-closed: rechazar ANTES de tocar nada (D-04). No procesar en after() si la firma es inválida.
  if (!verifyMPSignature(request, dataIdQuery ?? body.data?.id)) {
    return new Response('Invalid signature', { status: 401 })
  }

  if (body.type !== 'payment' || !body.data?.id) {
    return new Response('OK', { status: 200 })
  }

  const { slug } = await params
  const paymentId = String(body.data.id)
  after(async () => {
    try { await processWebhook(slug, paymentId) }
    catch (e) { console.error('[payment/webhook]', e instanceof Error ? e.message : e) }
  })
  return new Response('OK', { status: 200 })
}
```

### Subscription webhook tras la extracción (solo cambia el import)
```typescript
// Borrar el verifyMPSignature inline (líneas 12-54) y agregar:
import { verifyMPSignature } from '@/lib/mercadopago'
// El resto del archivo no cambia. La llamada ya pasa (request, dataIdQuery ?? body.data?.id).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Webhook de seña sin firma (procesa cualquier POST `type:'payment'`) | Firma `x-signature` HMAC fail-closed | Esta fase (SEC-02) | Requests forjados se rechazan con 401 antes de cualquier trabajo. |
| Confirmar turno sólo con `status==='approved'` | + comparación de monto en centavos enteros | Esta fase (SEC-02) | Un `approved` por monto distinto NO confirma; queda `amount_mismatch`. |
| `verifyMPSignature` duplicado inline en suscripción | Extraído a `lib/mercadopago.ts`, importado por ambos | Esta fase (D-03) | Una sola fuente de verdad; no drift. |

**Deprecated/outdated:** Nada que deprecar. El SDK oficial de MP sigue fuera de scope (backlog v2); seguir con `fetch` directo + `crypto` built-in.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El valor `'amount_mismatch'` para `payment_status` es nuevo y aceptable en la columna TEXT (no hay CHECK/enum que lo restrinja). | Pattern 3 / Runtime State | BAJO — `payment_status` es `TEXT DEFAULT 'unpaid'` (schema.sql:84), sin enum. Si hubiera un CHECK constraint no visto, el update fallaría. El planner puede confirmar con un grep de `CHECK` sobre `payment_status` en migraciones. Es Claude's Discretion (D, naming). |
| A2 | `payment.transaction_amount` siempre viene presente y numérico en un pago `approved` de seña simple (un solo pago, sin cuotas/parciales). | Pattern 3 | BAJO-MEDIO — para un pago aprobado de Checkout Pro de monto único, `transaction_amount` es el monto bruto. Si MP devolviera `null`/parcial en algún caso raro, `Number(null)*100 = 0 !== expected` → caería en `amount_mismatch` (fail-safe: no confirma de más). El default `Number(payment.transaction_amount)` ante `undefined` da `NaN`; `Math.round(NaN)` = `NaN`, y `NaN !== expectedCents` es `true` → también cae en mismatch (seguro). Conviene un comentario explícito. |

**Nota sobre A2 y null:** `transaction_amount` puede ser `null` en estados no terminales, pero la comparación sólo corre dentro de `status === 'approved'`, donde para un pago de monto único está poblado. El comportamiento ante `NaN`/`0` es fail-safe (no confirma), alineado con D-02.

## Open Questions

1. **Anti-replay del `ts` (deferido, no bloqueante)**
   - What we know: MP firma con `ts` (timestamp). Hoy ni suscripción ni seña validan que el `ts` sea reciente; un atacante con un par `(manifest, v1)` capturado podría reenviarlo. La firma sí evita forjar requests nuevos sin el secreto.
   - What's unclear: la ventana de tolerancia razonable (MP no la fija dura; comúnmente se usan 5 min). MP reintenta webhooks legítimos durante horas, así que una ventana muy corta rompería reintentos válidos.
   - Recommendation: **NO implementar en esta fase** (CONTEXT lo defiere explícitamente; fuera del criterio de éxito de SEC-02). La idempotencia por status-guard (`appt.status === 'pending_payment'`) ya limita el daño de un replay (no re-confirma). Si se quisiera, va junto con la tabla `webhook_events` (backlog v2).

2. **¿Existe un CHECK constraint sobre `appointments.payment_status`?** (verificación rápida del executor)
   - What we know: en `schema.sql` es `TEXT DEFAULT 'unpaid'`, sin CHECK visible. Se usan valores `'paid'`, `'unpaid'`.
   - Recommendation: el executor hace un grep de `payment_status` + `CHECK` en `supabase/migrations/` antes de asumir que `'amount_mismatch'` es aceptable. (Riesgo bajo: el grep de research no encontró ningún CHECK.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `MP_WEBHOOK_SECRET` (prod) | Validación de firma en modo production | Asumido configurado en Vercel (consumido por `getMPWebhookSecret`) | — | **Sin fallback**: ausente → webhook fail-closed (rechaza todo). Verificar antes de deploy. |
| `MP_WEBHOOK_SECRET_TEST` | Validación de firma en modo test | Asumido configurado en `.env.local` | — | **Sin fallback** en modo test. |
| Node `crypto` | HMAC + timingSafeEqual | ✓ (built-in, runtime Node) | — | — |
| Token MP per-negocio (`business_secrets.mp_access_token`) | `GET /v1/payments/{id}` | ✓ (ya en uso) | — | El handler ya corta si falta (`secrets.mp_access_token`). |

**Missing dependencies with no fallback:**
- `MP_WEBHOOK_SECRET[_TEST]` debe existir para el modo activo. Es precondición operativa, no de código — el plan debe incluir un checkpoint de verificación pre-deploy (PowerShell: `echo $env:MP_WEBHOOK_SECRET` localmente / verificar en Vercel env). Sin esto, el endurecimiento convierte "acepta todo" en "rechaza todo" y los deposits dejan de confirmarse.

## Validation Architecture

> El repo NO tiene framework de tests hoy (confirmado en CLAUDE.md y brief). El runner Vitest se introduce en **Fase 5 (TEST-01)**, no en esta fase. La cobertura de tests de los webhooks (firma válida pasa / tampered 401 / underpaid no confirma / `data.id` de query string) es deliverable de Fase 5, escrita contra el comportamiento que esta fase establece.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Ninguno hoy — Vitest se agrega en Fase 5 |
| Config file | none — Wave 0 de Fase 5 |
| Quick run command | `npm run lint` (única validación automatizada disponible en esta fase) |
| Full suite command | n/a (Fase 5) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-02 | Firma inválida/ausente → 401 sin trabajo | unit (verifier) | (Fase 5) | ❌ Wave 0 (Fase 5) |
| SEC-02 | Firma válida (manifest con `data.id` de query) → pasa | unit | (Fase 5) | ❌ Wave 0 (Fase 5) |
| SEC-02 | `transaction_amount` ≠ `deposit_amount` → NO confirma, `amount_mismatch` | unit (mock `mpFetch`) | (Fase 5) | ❌ Wave 0 (Fase 5) |

### Sampling Rate
- **Per task commit:** `npm run lint` + `npx tsc --noEmit` (verifica que la extracción no rompió tipos/imports).
- **Per wave merge:** build de Next (`npm run build`) para confirmar que ambos webhooks compilan tras el cambio de import.
- **Phase gate:** verificación manual con el simulador de webhooks de MP (test mode) — firma válida confirma un turno de prueba; un POST sin firma da 401.

### Wave 0 Gaps
- Para ESTA fase: ninguno (no se introduce test infra aquí). La verificación es lint + tsc + build + prueba manual con el simulador MP.
- Tests automatizados de webhook → responsabilidad de Fase 5 (TEST-01).

## Security Domain

`security_enforcement` está activo (es un milestone de seguridad). Esta fase ES un control de seguridad.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | El webhook no autentica usuarios; autentica el ORIGEN via HMAC. |
| V3 Session Management | no | Sin sesión en webhooks. |
| V4 Access Control | no (indirecto) | El tenant se resuelve por slug; no cambia en esta fase. |
| V5 Input Validation | yes | Parseo defensivo del body (try/catch), no confiar en montos/IDs del body; el monto se toma del payment traído de MP. |
| V6 Cryptography | yes | HMAC-SHA256 + `crypto.timingSafeEqual` (constant-time). NUNCA hand-roll; reusar el verificador validado. |
| V9 Communication / Webhooks (verificación de firma) | yes | Validar firma `x-signature` fail-closed con el secreto de la aplicación; rechazar 401 si inválida/ausente. |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Webhook forjado (atacante descubre la URL y POSTea `approved`) | Spoofing | Firma HMAC fail-closed (esta fase). |
| Pago por monto menor confirma turno (pagar $1 una seña de $1500) | Tampering / Elevation | Comparar `transaction_amount` (de MP) vs `deposit_amount` en centavos enteros; mismatch → no confirma (esta fase). |
| Replay de una notificación legítima capturada | Tampering / Replay | Parcial: idempotencia por status-guard (`pending_payment`) limita el daño. Anti-replay por `ts` deferido a v2. |
| Timing side-channel en comparación de firma | Information Disclosure | `crypto.timingSafeEqual` con guard de longitud (ya en el verificador). |
| Secreto cruzado test/prod → fail-closed total | DoS (auto-inflingido) | `getMPWebhookSecret()` keyea por `MP_MODE`; checkpoint de env pre-deploy. |

## Sources

### Primary (HIGH confidence)
- Codebase (read directo, 2026-06-16): `app/api/subscription/webhook/route.ts` (verifyMPSignature validado), `app/api/payment/webhook/[slug]/route.ts` (handler a endurecer), `lib/mercadopago.ts` (getMPWebhookSecret, MP_MODE, mpFetch), `lib/payment.ts` (getValidMpAccessToken), `app/api/mercadopago/callback/route.ts` (Connect/OAuth — secretos a business_secrets), `supabase/migrations/001_payments_deposits_notifications.sql` (deposit_amount DECIMAL(10,2)), `supabase/schema.sql:84` (payment_status TEXT DEFAULT 'unpaid').
- `.planning/research/PITFALLS.md` (pitfalls 8-10), `.planning/research/ARCHITECTURE.md` (§Pattern 3, §Anti-Pattern 4), `.planning/security-hardening-brief.md` (§Fase 2), `.claude/skills/mercadopago-suscripciones/SKILL.md`.

### Secondary (MEDIUM confidence — docs oficiales MP, verificadas contra el patrón del repo)
- [MercadoPago Webhooks docs](https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks) — secreto **per aplicación**; `data.id` desde query string (`_url`); manifest `id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];`; lowercasing si alfanumérico; body de pago trae sólo `data.id`.
- [Payment notifications](https://www.mercadopago.com.mx/developers/en/docs/checkout-pro/payment-notifications.md) — `data.id` en query string Y body; detalle completo vía GET.
- [Payments API reference](https://www.mercadopago.com.ar/developers/en/reference/online-payments/checkout-pro/get-payment/get) — `transaction_amount` Float, valor bruto de moneda (ej. `24.50`), no centavos.
- [Webhooks Secret Signature announcement](https://www.mercadopago.com.pe/developers/en/news/2024/01/11/Webhooks-Notifications-Simulator-and-Secret-Signature) — secreto generado en "Your integrations".
- [sdk-nodejs Discussion #318](https://github.com/mercadopago/sdk-nodejs/discussions/318) — falla prod-only por mismatch de secreto test/prod.

### Tertiary (LOW confidence)
- Ninguna que afecte criterios de éxito.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sin paquetes nuevos; todo built-in/ya presente.
- Architecture (extracción + call sites): HIGH — código de referencia leído directo, extracción mecánica.
- Secreto de firma en Connect: HIGH — confirmado per-aplicación en docs oficiales MP + coherente con el flujo Connect del repo (la app usa su client_id/secret, las cuentas conectadas dan tokens de acceso pero la firma de webhook es de la app).
- `data.id` de query string: HIGH — docs oficiales MP + patrón ya probado en suscripción.
- Unidad de `transaction_amount`: HIGH — docs oficiales (Float, monto bruto, no centavos) + coherente con `deposit_amount` DECIMAL(10,2) y el `unit_price` enviado a la preferencia.
- Pitfalls: HIGH — derivados del research previo del milestone + docs.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (estable; MP podría cambiar formato de webhook, revisar si pasan >30 días)
