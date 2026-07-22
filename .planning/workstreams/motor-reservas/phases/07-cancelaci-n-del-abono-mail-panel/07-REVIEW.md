---
phase: 07-cancelaci-n-del-abono-mail-panel
reviewed: 2026-07-21T20:07:12Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - lib/abono-cancel.ts
  - lib/abono-cancel.test.ts
  - test/abono-cancel.test.ts
  - test/abono-cancel-email.test.ts
  - lib/email.ts
  - app/api/abonos/cancel/[token]/route.ts
  - app/abono/cancelar/[token]/page.tsx
  - app/abono/cancelar/[token]/abono-cancel-client.tsx
  - app/api/abonos/create/route.ts
  - app/api/abonos/cancel/route.ts
  - app/(dashboard)/abonos/page.tsx
  - app/(dashboard)/abonos/abonos-client.tsx
findings:
  critical: 1
  warning: 9
  info: 5
  total: 15
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-07-21T20:07:12Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Se revisaron las dos vías de baja del abono (link público por `cancel_token` y panel autenticado), el
motor compartido `lib/abono-cancel.ts`, los dos templates de mail nuevos y las superficies de UI.

**Lo que resiste el ataque:** el aislamiento por tenant. Cada escritura del motor lleva los dos `.eq`
(`business_id` + `abono_id`); la vía pública deriva el `businessId` de la fila resuelta por el token y
nunca de la request; la vía panel lo deriva de `owner_id` y re-lee el abono por `id + business_id`;
"no existe" y "es de otro negocio" devuelven el mismo 404. Se intentó forzar un cruce de tenant por
body, por token con formato inválido y por `abonoId` ajeno y no se encontró camino. El gate atómico
(`.neq('status','cancelled')` dentro del UPDATE) efectivamente serializa las bajas concurrentes.
`tsc --noEmit` limpio y 34/34 tests verdes (incluidos los 8 contra la DB local).

**Lo que no resiste:** el manejo del fallo PARCIAL. Si el UPDATE masivo de `appointments` falla
después de que la fila del abono ya quedó en `cancelled`, los turnos futuros quedan vivos para
siempre y **todo reintento reporta éxito** (el gate atómico lo corta antes de volver a intentar la
cancelación en masa). Es el único BLOCKER, pero es de integridad de datos y sin salida por UI.
Además hay una divergencia entre el número que informa el servidor y el que muestra la pantalla
pública, inyección de HTML en los dos mails nuevos, y una columna que carga autorización
(`abonos.cancel_token`) sin restricción de unicidad en la base.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: El fallo parcial de la baja deja turnos vivos para siempre y todo reintento miente "éxito"

**File:** `lib/abono-cancel.ts:204-221` (+ `lib/abono-cancel.ts:183-197`, `app/api/abonos/cancel/route.ts:95-107`, `app/api/abonos/cancel/[token]/route.ts:87-96`)

**Issue:**
La secuencia del motor no es atómica y el camino de recuperación está roto:

1. `(a)` voltea la fila `abonos` a `cancelled` + `cancelled_at`.
2. `(c)` cancela en masa los `appointments` futuros.

Si `(c)` falla (timeout de statement, error transitorio de PostgREST, trigger
`appointment_spaces_cleanup_trg` que revienta en una fila), el motor devuelve
`{ ok:false, error:'update_failed' }` **con la serie ya dada de baja**. El comentario de la línea 214
asume que "el caller decide si reintenta", pero el reintento es imposible: en la segunda llamada el
gate atómico `.neq('status','cancelled')` no matchea nada → rama `(b)` → `alreadyCancelled: true`.

Consecuencias reales, ninguna recuperable desde el producto:

- **Panel:** el reintento devuelve `200 { ok:true, alreadyCancelled:true }` y `abonos-client.tsx:171`
  muestra el toast "Abono dado de baja". La serie aparece en Archivados y los N turnos futuros siguen
  ocupando la agenda, confirmados.
- **Vía pública:** el reintento devuelve `already_cancelled` y la pantalla dice "Este turno fijo ya
  fue dado de baja" — el cliente cree que liberó su horario semanal y no lo liberó.
- **El cron no lo arregla:** solo procesa abonos `status='active'`, así que esos turnos quedan
  huérfanos de forma permanente. Tampoco se manda ningún mail (ni al cliente ni al dueño), así que
  nadie se entera.

Esto rompe de frente el invariante que la fase declara ("la baja cancela los turnos futuros de la
serie") y además viola la promesa de idempotencia: `alreadyCancelled` hoy significa "la fila está en
cancelled", no "el efecto ya se aplicó".

**Fix:** hacer que la rama `alreadyCancelled` termine de aplicar el efecto (es idempotente: si no
quedó nada pendiente cancela 0 filas) y seguir informando al caller que NO re-dispare mails. Así el
reintento repara el estado en vez de taparlo:

```ts
// (b) El UPDATE no volteó nada: ya estaba cancelada, o el par (abonoId, businessId) no existe.
if (!flipped || flipped.length === 0) {
  const { data: existing } = await supabase
    .from('abonos').select('id, status')
    .eq('id', abonoId).eq('business_id', businessId).maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }

  // La serie YA estaba en 'cancelled', pero una baja anterior pudo morir DESPUÉS de voltear la fila
  // y ANTES de cancelar los turnos. Se re-aplica la cancelación en masa (idempotente: si no quedó
  // nada futuro, afecta 0 filas) para que el reintento REPARE el estado en vez de reportar un éxito
  // falso. Se sigue devolviendo alreadyCancelled: el caller NO re-dispara mails (D-05/D-14).
  const { error: sweepErr } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('business_id', businessId)
    .eq('abono_id', abonoId)
    .gte('date', cutoff)
    .neq('status', 'cancelled')
  if (sweepErr) {
    console.error(`[abonos/cancel] barrido de reparación FALLÓ (abono ${abonoId}):`, sweepErr.message)
    return { ok: false, error: 'update_failed' }
  }
  return { ok: true, alreadyCancelled: true, cancelledCount: 0, lastDate: null }
}
```

Alternativa equivalente (más invasiva): mover las dos escrituras a un RPC `SECURITY DEFINER` con
`business_id` + `abono_id` como parámetros para que corran en una sola transacción. Sea cual sea el
camino, hace falta un test que simule el fallo de `(c)` y asierte que un segundo intento deja 0
turnos futuros vivos.

### Warnings

#### WR-01: La pantalla pública descarta el `cancelledCount` del servidor y muestra el preview viejo (y se contradice sola)

**File:** `app/abono/cancelar/[token]/abono-cancel-client.tsx:57-68`, `:108-113`

**Issue:** `POST /api/abonos/cancel/[token]` devuelve `{ ok:true, cancelledCount, lastDate }` con el
efecto REAL y el cliente lo tira (`const data = await res.json()` solo se usa para ramificar). La
vista `done` sigue renderizando `cancelledCount` / `lastDate` del preview server-rendered al cargar
la página. Dos síntomas:

- Si entre el render y el click alguien cancela un turno de la serie (dueño desde el panel, cron,
  otro flujo), la pantalla de éxito informa un número que nunca ocurrió. El panel sí respeta la regla
  ("El servidor es la autoridad del número", `abonos-client.tsx:169-171`); acá se rompe el mismo
  invariante D-03/D-11 que la fase declara.
- En la rama `already_cancelled` (línea 61-63) se pasa a `view='cancelled'` **sin limpiar el bloque
  de detalle**: la pantalla queda diciendo "Este turno fijo ya fue dado de baja" arriba y "Se cancelan
  N turnos futuros" abajo, al mismo tiempo.

**Fix:** guardar el resultado del servidor en estado y usarlo en la vista `done`; en
`already_cancelled` forzar el conteo a 0.

```tsx
const [result, setResult] = useState<{ count: number; lastDate: string | null } | null>(null)
// …
if (data.ok) {
  setResult({ count: Number(data.cancelledCount ?? 0), lastDate: data.lastDate ?? null })
  setView('done')
} else if (data.reason === 'already_cancelled') {
  setResult({ count: 0, lastDate: null })
  setView('cancelled')
}
// …
const shownCount = result ? result.count : cancelledCount
const shownLast  = result ? result.lastDate : lastDate
```

#### WR-02: Inyección de HTML en los dos mails nuevos de baja (input anónimo → inbox del dueño)

**File:** `lib/email.ts:506-522`, `:539`, `:629-645`, `:677-679`

**Issue:** `sendAbonoCancelledEmail` y `sendAbonoCancelledAdminNotification` interpolan sin escapar
`clientName`, `service`, `dayLabel`, `businessName`, `clientPhone` y `clientEmail` dentro del HTML.
`clients.name` es **atacante-controlable desde la superficie anónima**: `app/api/booking/create/route.ts:35`
toma `clientName` del body sin sanitizar ni acotar y lo inserta tal cual en `clients`
(`route.ts:99-103`). Cadena completa: alguien reserva público con
`name = 'Juan<a href="https://phishing.tld">Actualizá tu cobro</a>'` → el dueño arma un abono para ese
cliente (el dedupe de `abonos/create` reusa la fila existente por teléfono/email) → el cliente da de
baja por el link → `sendAbonoCancelledAdminNotification` renderiza el markup inyectado **en el mail
del dueño** (`:677` `${clientName}`, `:678` `${clientPhone}`, `:679` `${clientEmail}`).

No es XSS de navegador (los clientes de mail no ejecutan script, y la pantalla pública sí escapa
porque React interpola como texto), pero sí es inyección de contenido/links en un mensaje que el
dueño lee como confiable, y además rompe el layout con cualquier `<` legítimo. El patrón es sistémico
(`sendAdminNotification` ya lo tiene), pero esta fase agrega dos instancias nuevas.

**Fix:** helper compartido en `lib/email.ts` y aplicarlo a todo valor dinámico que entre al HTML
(mínimo, a los templates nuevos):

```ts
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
// rows.push({ label: 'Servicio', value: esc(servicio) })
// <div …>${esc(clientName)}</div>
```

Complementario (defensa en profundidad): acotar `clientName` en `booking/create` con
`.slice(0, 120)` como ya se hace con `notes`.

#### WR-03: `abonos.cancel_token` no tiene índice único — la credencial de la vía pública no está garantizada por la base

**File:** `app/api/abonos/cancel/[token]/route.ts:59-65`, `app/abono/cancelar/[token]/page.tsx:35-41` (raíz: `supabase/migrations/054_abonos.sql`)

**Issue:** `appointments.cancel_token` sí tiene `CREATE UNIQUE INDEX appointments_cancel_token_idx`
(schema.sql:1042), pero `abonos.cancel_token` se creó solo como `uuid NOT NULL DEFAULT
gen_random_uuid()`, sin unicidad ni índice. Las dos superficies públicas resuelven la serie con
`.eq('cancel_token', token).maybeSingle()`: la unicidad de la credencial descansa en la suerte del
default, no en una constraint. Si por un backfill, un import o un `UPDATE` manual futuro dos series
compartieran token, `maybeSingle()` devuelve error → `data` null → "Link inválido" (falla cerrada,
que es lo bueno), pero el modelo de autorización queda sin respaldo en la base. Secundario: cada
click de link es un seq scan sobre `abonos`.

**Fix:** migración nueva (056) coordinada con el deploy:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "abonos_cancel_token_idx"
  ON "public"."abonos" ("cancel_token");
```

#### WR-04: `previewAbonoCancellation` se traga el error de DB y devuelve 0 — el aviso previo obligatorio degrada en silencio

**File:** `lib/abono-cancel.ts:138-142` (consumido en `app/abono/cancelar/[token]/page.tsx:74-81`)

**Issue:** ante cualquier error de la query el preview devuelve `{ count: 0, lastDate: null }`, que es
indistinguible del caso legítimo "no hay turnos futuros". La pantalla pública entonces oculta el
bloque "Se cancelan N turnos" (`abono-cancel-client.tsx:108`) y el usuario confirma una acción
**destructiva e irreversible** sin el aviso previo que D-03/D-11 declaran obligatorio. Degradar
"limpio" acá no es informativo: es esconder información que decide el consentimiento.

**Fix:** distinguir el fallo del cero y que la UI lo diga.

```ts
export type AbonoCancelSummary = { count: number; lastDate: string | null; unknown?: boolean }
// …
if (error) {
  console.error('[abonos/cancel] preview error:', error.message)
  return { count: 0, lastDate: null, unknown: true }
}
```
En el cliente, con `unknown` mostrar "No pudimos calcular cuántos turnos se van a cancelar. Se dan de
baja TODOS los turnos futuros de esta serie." en vez de omitir el dato.

#### WR-05: Las dos vías justifican lo contrario sobre `after()`; la pública manda 2 mails en el request path sin timeout

**File:** `app/api/abonos/cancel/[token]/route.ts:115-166` vs `app/api/abonos/cancel/route.ts:121-143` (+ `lib/email.ts:61-72`)

**Issue:** la ruta pública afirma "en serverless el fetch a Resend se corta al hacer return si no se
espera" y `await`ea DOS POST a Resend en serie dentro del handler; la ruta del panel, del mismo plan,
usa `after()` para el mismo mail. Las dos afirmaciones no pueden ser ciertas: `after()` existe
justamente para esto en Next 16 y está soportado en Vercel. Con el `await`, y como `resendSend` no
tiene ningún `AbortSignal`/timeout, una degradación de Resend cuelga la respuesta hasta el límite de
la función: el usuario ve "No pudimos dar de baja el turno fijo. Probá de nuevo" **para una baja que
sí se ejecutó**, y al reintentar cae en `already_cancelled`. Sumado a CR-01, la pantalla pública
tiene dos formas distintas de mentir sobre el resultado.

**Fix:** unificar el criterio (usar `after()` en las dos vías, como ya hace el panel) y ponerle
timeout al POST a Resend:

```ts
const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(10_000), // no colgamos el request path por un proveedor lento
})
```

#### WR-06: El preview del panel se deriva de una query sin filtro de fecha ni límite

**File:** `app/(dashboard)/abonos/page.tsx:38-43`, `:55-82`

**Issue:** se traen **todos** los `appointments` con `abono_id` no nulo y no cancelados del negocio,
de toda la historia, sin `.gte('date', …)` ni `.limit()`/`.range()`, y de ese set en memoria salen
`futureTurnoCounts` / `lastFutureDates`, que son el número que el `ConfirmDialog` le muestra al dueño
antes de una acción irreversible. Con abonos indefinidos ese set crece sin techo; si PostgREST aplica
su tope de filas (`db-max-rows`), el recorte es **silencioso** y el diálogo subestima el alcance de la
baja — exactamente el drift que el comentario de la línea 68-74 dice querer evitar.

**Fix:** separar los dos usos y acotar el que alimenta el preview.

```ts
const cutoff = todayISOInAR()
// …
supabase
  .from('appointments')
  .select('abono_id, date')
  .eq('business_id', business.id)
  .not('abono_id', 'is', null)
  .neq('status', 'cancelled')
  .gte('date', cutoff),          // el preview solo necesita el futuro
```
y para `turnoCounts` usar un `select('abono_id', { count: 'exact', head: true })` por serie o una
vista agregada, en vez de traer todas las filas al server component.

#### WR-07: Todos los `cancel_token` del negocio viajan al browser en cada carga de /abonos

**File:** `app/(dashboard)/abonos/page.tsx:35`, `app/(dashboard)/abonos/abonos-client.tsx:41-47`, `:142-153`

**Issue:** D-17 justifica que el dueño pueda **copiar** el link de baja de una serie, pero la
implementación manda el `cancel_token` de **todas** las series (activas y archivadas) en el payload
RSC de la página, en cada render, aunque el dueño nunca abra un detalle. Esos tokens quedan en el HTML
serializado, en la caché del navegador/bfcache y en cualquier captura de DOM (session replay, reporte
de errores, screenshot de soporte, impersonación). Es una superficie mucho más ancha que la que D-17
pedía, y el token no rota ni vence (D-09), así que una fuga es permanente.

**Fix:** no mandar el token con el listado; resolverlo on-demand cuando el dueño toca "Copiar link de
baja", con un endpoint autenticado acotado por sesión:

```ts
// app/api/abonos/[id]/cancel-link/route.ts (GET) — auth por sesión, negocio por owner_id,
// select('cancel_token').eq('id', id).eq('business_id', business.id)
```
y en `copyCancelLink` hacer el fetch antes de escribir al clipboard. Quitar `cancel_token` del select
de `page.tsx` y del tipo `AbonoRow`.

#### WR-08: No hay ni un test a nivel de RUTA — el invariante estrella de la fase (D-14 bajo carrera) queda sin cubrir

**File:** `test/abono-cancel.test.ts` (cobertura del motor), `test/abono-cancel-email.test.ts` (cobertura de templates)

**Issue:** los tests cubren muy bien el motor y los templates, pero ninguno ejercita
`app/api/abonos/cancel/route.ts` ni `app/api/abonos/cancel/[token]/route.ts`. Queda sin verificar
justo lo que la fase declara crítico:

- **D-14 / T-07-15 bajo concurrencia:** que dos `POST` simultáneos sobre el mismo token produzcan UN
  solo mail. Lo que hoy se testea (Tests 12/13) es que *la función de mail* hace un POST cuando se la
  llama una vez — eso no prueba nada sobre el anti-avalancha; el gate que lo garantiza es de la ruta +
  motor.
- `401` sin sesión, `404` con `abonoId` de otro tenant, `400` con body inválido en la vía panel.
- Que la rama `already_cancelled` **no** llame a `sendAbonoCancelled*`.

**Fix:** agregar `test/abono-cancel-routes.test.ts` importando los handlers y mockeando
`@/lib/email` + los clientes Supabase, con al menos: (a) `Promise.all([POST(req), POST(req)])` sobre
el mismo token contra la DB local → un solo `sendAbonoCancelledEmail`; (b) abono ajeno → 404 y cero
escrituras; (c) sin sesión → 401.

#### WR-09: El Test 5 de los mails asegura una cobertura que no tiene

**File:** `test/abono-cancel-email.test.ts:109-119`

**Issue:** el test se llama "sin lastDate (undefined o null)" y hace dos envíos, pero
`capturedPayload(fetchMock)` lee siempre `mock.calls[0]` (`:64-67`), o sea **solo el caso `null`**. El
caso `undefined` nunca se asierta: si el template rompiera con `undefined` (p. ej. cambiando
`lastDate && lastDate.trim()` por `lastDate.trim()`), el test seguiría verde. Falsa confianza sobre un
camino que el motor produce de verdad (`lastDate: null` viaja como prop opcional).

**Fix:**

```ts
function payloadAt(fetchMock: Mock, i: number) {
  return JSON.parse((fetchMock.mock.calls[i][1] as { body: string }).body)
}
// …
for (const i of [0, 1]) {
  const { html, text } = payloadAt(fetchMock, i)
  expect(html).not.toContain('Último turno cancelado')
  expect(text).not.toContain('Último turno cancelado')
  expect(html).toContain('Turnos cancelados')
}
```

### Info

#### IN-01: `DAY_LABELS` duplicado en 4 archivos con fallbacks divergentes

**File:** `app/api/abonos/cancel/[token]/route.ts:42`, `app/api/abonos/cancel/route.ts:35`, `app/abono/cancelar/[token]/page.tsx:10`, `app/api/abonos/create/route.ts:48`

**Issue:** la misma constante copiada 4 veces, y encima con comportamientos distintos ante un `dow`
inválido: la ruta pública deja `dayLabel = ''` y la del panel usa `'los días'` (`route.ts:117`). El
mail de una misma baja diría cosas distintas según la vía.

**Fix:** exportar `abonoDayLabel(dow: number): string` desde `lib/abono-cancel.ts` (o un
`lib/abono-labels.ts`) y consumirla en los cuatro lugares.

#### IN-02: `fmtDate` / `toISODate` duplicados pese al comentario de "acá queda centralizado"

**File:** `lib/abono-cancel.ts:66-83`, `app/api/abonos/create/route.ts:72-77`, `lib/email.ts:32-38`, `app/abono/cancelar/[token]/abono-cancel-client.tsx:10-14`

**Issue:** el docblock de `todayISOInAR` dice "Mismo `toISODate` que ya viven duplicados en
app/api/abonos/create y en el cron; acá queda centralizado", pero las copias siguen ahí (la de
`create/route.ts` no se tocó). Lo mismo con `fmtDate`, que existe en tres archivos.

**Fix:** hacer efectiva la centralización — `create/route.ts` y el cron deben importar
`todayISOInAR()`; mover `fmtDate` a un `lib/format-date.ts` compartido (la copia del client component
puede quedar si se quiere evitar el locale en el bundle, pero conviene documentarlo con una nota, no
con silencio).

#### IN-03: `console.log` con el email del destinatario (PII) en producción

**File:** `lib/email.ts:577`, `:701`

**Issue:** `console.log('📧 Baja de turno fijo enviada a ${to}')` y `'🔔 Aviso … enviado a ${to}'`
escriben direcciones de mail de clientes finales en los logs de Vercel. La convención del proyecto
dice explícitamente "Evitar `console.log` en API de producción" y la app maneja datos de salud en el
vertical `salud` (Ley 25.326).

**Fix:** bajar a `console.error` solo en el path de fallo, o loguear sin PII:
`console.log('[abonos/cancel] mail de baja enviado (abono ${abonoId})')`.

#### IN-04: La página pública de baja no declara `noindex`

**File:** `app/abono/cancelar/[token]/page.tsx:6`

**Issue:** `metadata = { title: 'Cancelar turno fijo' }` sin `robots`. La URL contiene la credencial y
la página muestra el nombre del cliente, el servicio y el horario. Si el link se filtra a un lugar
crawleable (foro, historial compartido, captura), un buscador puede indexar la URL con el token
adentro. La ruta hermana `/cancelar/[token]` tiene el mismo hueco.

**Fix:**

```ts
export const metadata = { title: 'Cancelar turno fijo', robots: { index: false, follow: false } }
```

#### IN-05: Texto blanco sobre el color primario del negocio (contraste no garantizado)

**File:** `app/abono/cancelar/[token]/abono-cancel-client.tsx:120-127`, `:135-141`, `:150-156`

**Issue:** los tres CTA usan `text-white` sobre `style={{ backgroundColor: accent }}`, donde `accent`
es `businesses.primary_color`, editable por el dueño. Con un primario claro (amarillo, lima, pastel)
el botón principal de una acción destructiva queda por debajo de 4.5:1 — el checklist de calidad del
proyecto lo marca como no negociable.

**Fix:** derivar el color de texto del fondo, p. ej. con `color-mix`/luminancia calculada en el
server, o usar `color: oklch(from var(--accent) …)`; como mínimo, aplicar un borde/outline visible en
`:focus-visible` que no dependa del acento.

---

_Reviewed: 2026-07-21T20:07:12Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
