# Phase 7: Cancelación del abono (mail + panel) - Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 8 (4 nuevos + 4 modificados)
**Analogs found:** 8 / 8

## File Classification

| Archivo nuevo/modificado | Rol | Data flow | Analog más cercano | Calidad |
|---|---|---|---|---|
| `app/api/abonos/cancel/[token]/route.ts` (NUEVO) | route handler público | request-response | `app/api/cancel/[token]/route.ts` | exact |
| `app/abono/cancelar/[token]/page.tsx` (NUEVO) | page server (público, tenant-branded) | request-response | `app/cancelar/[token]/page.tsx` | exact |
| `app/abono/cancelar/[token]/abono-cancel-client.tsx` (NUEVO) | componente client | request-response | `app/cancelar/[token]/cancel-client.tsx` | exact |
| `lib/abono-cancel.ts` (NUEVO, helper compartido) | lib / lógica de dominio | batch (bulk update) | `lib/abono-generation.ts` | role+flow match |
| `app/api/abonos/cancel/route.ts` (NUEVO, vía panel) | route handler autenticado | request-response | `app/api/abonos/create/route.ts` | exact |
| `lib/email.ts` (MOD: 2 templates nuevos) | utility / integración | file-less I/O (HTTP a Resend) | `sendAbonoConfirmation` + `sendAdminNotification` (mismo archivo) | exact |
| `app/api/abonos/create/route.ts` (MOD: `cancelUrl`) | route handler autenticado | request-response | sí mismo (líneas 264-287) | exact |
| `app/(dashboard)/abonos/abonos-client.tsx` (MOD) | componente client | CRUD/UI | `app/(dashboard)/clients/clients-client.tsx` (tabs) + `components/dashboard/canchas-manager.tsx` (ConfirmDialog) | role match |
| `app/(dashboard)/abonos/page.tsx` (MOD) | page server dashboard | CRUD | sí mismo | exact |

**Decisión de mecanismo para la vía panel (pedida explícitamente):** el repo usa **route handlers** (`app/api/abonos/create/route.ts`) para las mutaciones autenticadas del dashboard de este dominio, no server actions. Las server actions solo se usan en `(crm)/admin/_actions.ts`. → **usar un route handler** `app/api/abonos/cancel/route.ts` (POST con `{ abonoId }` en el body), con el molde exacto de `abonos/create`: `createClient()` anon+RLS → `auth.getUser()` (401) → business por `owner_id` (404) → re-validar el abono por `id + business_id`.

---

## Pattern Assignments

### `app/api/abonos/cancel/[token]/route.ts` (route handler público, request-response)

**Analog:** `app/api/cancel/[token]/route.ts` (NO modificar ese archivo).

**Imports + cabecera doctrinal** (`app/api/cancel/[token]/route.ts:1-11`):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { sendClientCancelEmail, sendAdminNotification } from '@/lib/email'
import type { NextRequest } from 'next/server'

// Cancelación pública por TOKEN (no por id). El token impredecible resuelve el turno y su
// negocio → no confiamos en ningún parámetro del cliente para el aislamiento por tenant.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return Response.json({ ok: false, reason: 'invalid' }, { status: 400 })
```
Next 16: `params` es **Promise** y hay que `await`.

**Resolución por token + join de branding** (`:15-27`) — copiar el shape cambiando la tabla a `abonos`:
```typescript
  const supabase = createAdminClient()
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, date, time, status, client_name, ..., businesses(id, name, slug, primary_color, logo_url, notification_email)')
    .eq('cancel_token', token)
    .single()

  // Sin token válido → no se cancela nada (ni se revela si existe).
  if (!appt) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })
```
Pitfall E documentado en el analog (`:17-19`): el join anidado `businesses(...)` **no puede** traer `business_secrets`; los secretos van por `getBusinessSecrets(business.id)` aparte.
Para abonos, el join a los datos del cliente NO está en la tabla (no hay `client_name`): traer `clients(name, email)` por join, más `services(name)`, `day_of_week`, `start_time`, `status`.

**Estados no-activos** (`:29-43`) — D-08/D-06 recortan esto: se conserva SOLO el branch `cancelled`; **NO** se copian `past` ni `too_late` (la regla de 24 h no aplica a la baja de serie):
```typescript
  if (appt.status === 'cancelled') {
    return Response.json({ ok: false, reason: 'already_cancelled' })   // D-05 idempotencia
  }
```

**Error de update → 500 + log con prefijo de módulo** (`:52-57`):
```typescript
  if (error) {
    console.error(`[cancel] error cancelando turno ${appt.id}:`, error.message)
    return Response.json({ ok: false, reason: 'error' }, { status: 500 })
  }
```
Usar prefijo `[abonos/cancel]`.

**Mails best-effort con AWAIT (no `after()`)** (`:59-120`) — el analog documenta por qué se hace `await` en el cancel público:
```typescript
  // Email: AWAIT (en serverless, sin await el fetch a Resend se corta al hacer return).
  const secrets = business?.id ? await getBusinessSecrets(business.id) : null
  if (appt.client_email && business) {
    try { await sendClientCancelEmail({ ... , resendApiKey: secrets?.resend_api_key, resendFrom: secrets?.resend_from }) }
    catch (e) { console.error(`[cancel] email cliente FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e) }
  }
  if (business?.notification_email) {
    try { await sendAdminNotification({ to: business.notification_email, ... , cancelled: true }) }
    catch (e) { console.error(`[cancel] aviso al dueño FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e) }
  }
  return Response.json({ ok: true })
```
D-13/D-14: **UN** mail al cliente + **UN** aviso al dueño, nunca uno por turno cancelado.

**No copiar:** el bloque de Google Calendar (`:69-76`). Hallazgo del CONTEXT: los turnos de abono no crean eventos gcal (`lib/abono-generation.ts` no llama a `createCalendarEvent`).

---

### `app/abono/cancelar/[token]/page.tsx` (page server pública)

**Analog:** `app/cancelar/[token]/page.tsx` (59 líneas, copiar entero y adaptar).

**Estructura completa** (`:1-11`, `:19-29`, `:42-58`):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { PaletteScript } from '@/components/palette-script'
import { CancelClient } from './cancel-client'

export const metadata = { title: 'Cancelar turno' }

export default async function CancelarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()
  const { data: appt } = await supabase.from('appointments')
    .select('date, time, status, client_name, services(name), businesses(name, slug, primary_color, logo_url, theme, palette, font)')
    .eq('cancel_token', token).single()
```
El select del business SIEMPRE trae `theme, palette, font` (los consume `PaletteScript`).

**Token inválido → pantalla genérica sin revelar nada** (`:20-29`):
```typescript
  if (!appt) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">Link inválido</h1>
          <p className="text-muted-foreground">Este enlace de cancelación no es válido o el turno ya no existe.</p>
        </div>
      </main>
    )
  }
```

**Derivación del estado inicial server-side + render** (`:33-57`) — para el abono el estado se reduce a `'active' | 'cancelled'` (D-08):
```typescript
  const initialState: 'active' | 'cancelled' | 'past' | 'too_late' =
    appt.status === 'cancelled' ? 'cancelled' : ... : 'active'

  return (
    <>
      <PaletteScript palette={business?.palette} theme={business?.theme} font={business?.font} />
      <CancelClient token={token} ... accent={(business?.primary_color && business.primary_color.trim()) || '#d94a2b'} initialState={initialState} />
    </>
  )
```
Acá además hay que calcular server-side el **preview D-03/D-11**: `count` y `lastDate` de los turnos futuros de la serie → ver el helper compartido de abajo, y pasarlos como props.

---

### `app/abono/cancelar/[token]/abono-cancel-client.tsx` (componente client)

**Analog:** `app/cancelar/[token]/cancel-client.tsx` (147 líneas — copiar shell completo).

**Helper de fecha local (sin date-fns en la superficie pública)** (`:5-12`):
```typescript
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['enero', 'febrero', ...]
function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAYS[dt.getDay()]} ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`
}
```
`DAYS` sirve también para el "todos los martes" (D-11) desde `day_of_week`.

**Máquina de estados + fetch al endpoint** (`:27-56`):
```typescript
const [view, setView] = useState<'active' | 'cancelled' | ... | 'done'>(initialState)
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)

async function confirmCancel() {
  setLoading(true); setError(null)
  try {
    const res = await fetch(`/api/cancel/${token}`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) setView('done')
    else if (data.reason === 'already_cancelled') setView('cancelled')
    else if (data.reason === 'not_found') setError('Este enlace de cancelación no es válido.')
    else setError('No pudimos cancelar el turno. Probá de nuevo en unos minutos.')
  } catch { setError('No pudimos conectar. Revisá tu conexión e intentá de nuevo.') }
  finally { setLoading(false) }
}
```

**Header de marca + card + botón acentuado** (`:66-104`) — copiar tal cual (clases y `style={{ backgroundColor: accent }}`):
```tsx
<main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
  <div className="w-full max-w-sm">
    <div className="flex items-center justify-center gap-3 mb-6">
      {logoUrl ? (<img src={logoUrl} alt={businessName} className="w-10 h-10 rounded-lg object-cover" />)
        : (<div className="w-10 h-10 rounded-lg flex items-center justify-center text-white ..." style={{ backgroundColor: accent }}>{businessName.charAt(0).toUpperCase()}</div>)}
      <span className="font-semibold">{businessName}</span>
    </div>
    <div className="rounded-xl border border-border bg-card p-6">
      <h1 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">{heading}</h1>
      <div className="rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5" style={{ borderLeftColor: accent }}> ... </div>
      <button onClick={confirmCancel} disabled={loading}
        className="w-full rounded-md py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: accent }}>{loading ? 'Cancelando...' : 'Sí, cancelar turno'}</button>
```
El bloque de detalle (`:85-90`) es donde van los campos D-11: servicio, "todos los martes 20:00", conteo y última fecha.

**Éxito con link al booking del negocio** (`:107-119`) — cubre D-12 sin inventar nada:
```tsx
{view === 'done' && (<>
  <p className="text-sm text-muted-foreground mb-4">Listo, tu turno fue cancelado. ...</p>
  {businessSlug && (<a href={`/${businessSlug}`} className="block w-full rounded-md py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ backgroundColor: accent }}>Reservar otro turno</a>)}
</>)}
```

---

### `lib/abono-cancel.ts` (helper compartido, batch)

**Analog:** `lib/abono-generation.ts` — mismo contrato: **función pura respecto del cliente Supabase**, rol-agnóstica, sin crear su propio cliente.

**Firma rol-agnóstica** (`lib/abono-generation.ts:44-58`) — clave para que las dos vías (service-role por token, anon+RLS por panel) llamen el mismo código:
```typescript
export type GenerateAbonoInput = {
  // Rol-agnóstico: el motor lo usa tal cual lo recibe (service-role en el cron, anon+RLS en el alta
  // autenticada). No crea su propio cliente.
  supabase: SupabaseClient
  business: BusinessForGeneration
  abono: AbonoForGeneration
  ...
}
export async function generateAbonoOccurrences(input: GenerateAbonoInput): Promise<GenerateAbonoResult>
```
→ `cancelAbonoSeries({ supabase, businessId, abonoId, today })` que devuelve `{ ok, alreadyCancelled, cancelledCount, lastDate }`.

**Scoping por `abono_id` + `business_id` (D-24)** — patrón exacto de las queries del motor (`:183-191` lectura, `:216-220` update):
```typescript
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('business_id', business.id)
      .eq('abono_id', abono.id)
      .eq('date', date)
      .neq('status', 'cancelled')
```
```typescript
      // UPDATE acotado por id + business_id (tenant, T-06-07)
      await supabase.from('appointments').update({ abono_id: abono.id })
        .eq('id', result.appointmentId).eq('business_id', business.id)
```
El bulk de la baja combina ambos:
```typescript
await supabase.from('appointments').update({ status: 'cancelled' })
  .eq('business_id', businessId).eq('abono_id', abonoId)
  .gte('date', todayStr).neq('status', 'cancelled')
```
(el `.neq('status','cancelled')` es lo que hace que el preview y el efecto coincidan — Claude's Discretion del CONTEXT: los ya cancelados no se cuentan).

**Update de la fila del abono** — patrón de `app/api/abonos/create/route.ts:250-258`:
```typescript
  await supabase.from('abonos')
    .update({ generated_until: toDate, skipped_occurrences: ..., ...(completed ? { status: 'completed' } : {}) })
    .eq('id', abono.id)
    .eq('business_id', business.id)
```
→ `.update({ status: 'cancelled', cancelled_at: new Date().toISOString() })`. Columnas confirmadas en `supabase/migrations/054_abonos.sql`: `status CHECK IN ('active','cancelled','completed')`, `cancel_token uuid NOT NULL DEFAULT gen_random_uuid()`, `cancelled_at timestamptz`. **Sin migración nueva.**

**Conteo/preview** — reusar el molde de `countAbonoAppointments` (`app/api/abonos/create/route.ts:303-315`):
```typescript
  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('abono_id', abonoId)
    .neq('status', 'cancelled')
```

**"Hoy" en hora AR (D-02)** — fuente ÚNICA de verdad, ya existe: `lib/booking-window.ts:31-35`:
```typescript
export function todayInAR(): Date {
  const now = new Date()
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000) // pared-reloj AR en campos UTC
  return new Date(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate())
}
```
y el `toISODate` local que ya está duplicado idéntico en `app/api/abonos/create/route.ts:72-77` y `app/api/cron/cancel-expired/route.ts:55`:
```typescript
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```
**Nunca** `new Date().toISOString().slice(0,10)` para el corte (el server corre en UTC en Vercel).

---

### `app/api/abonos/cancel/route.ts` (vía panel, autenticado)

**Analog:** `app/api/abonos/create/route.ts` — molde exacto de mutación autenticada del dashboard.

**Auth gate + tenant por `owner_id`** (`:79-98`):
```typescript
export async function POST(request: Request) {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin (T-06-11).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: el negocio se resuelve por owner_id de la sesión, no por un id del cliente.
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, slug, primary_color, logo_url, whatsapp, notification_email')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
```

**Parseo defensivo del body** (`:100-113`):
```typescript
  let raw: unknown
  try { raw = await request.json() } catch { return Response.json({ ok: false, error: 'bad_request' }, { status: 400 }) }
  const body = (raw ?? {}) as Record<string, unknown>
  const abonoId = typeof body.abonoId === 'string' && body.abonoId.trim() ? body.abonoId.trim() : ''
```

**Anti-tampering: re-validar la entidad por `business_id` antes de tocar nada (D-23)** (`:143-152`):
```typescript
    const { data: pro } = await supabase.from('professionals')
      .select('id, service_id').eq('id', professionalId).eq('business_id', business.id).maybeSingle()
    if (!pro) return Response.json({ ok: false, error: 'invalid_professional' }, { status: 400 })
```

**Mail best-effort en `after()`** (`:264-287`) — en la vía panel SÍ va `after()` (no `await`), a diferencia del cancel público:
```typescript
  if (clientEmail) {
    const abonoId = abono.id as string
    after(async () => {
      try {
        const secrets = await getBusinessSecrets(business.id)
        await sendAbonoConfirmation({ to: clientEmail, ..., resendApiKey: secrets.resend_api_key, resendFrom: secrets.resend_from })
      } catch (e) {
        console.error(`[abonos/create] email alta abono FALLÓ (abono ${abonoId}):`, e instanceof Error ? e.message : e)
      }
    })
  }
  return Response.json({ ok: true, abonoId: abono.id, generated: ..., skipped: ... })
```
D-15: el mail al cliente sale SIEMPRE (si tiene email), sin checkbox.

---

### `lib/email.ts` (2 templates nuevos: baja de serie al cliente + aviso al dueño)

**Analog:** `sendAbonoConfirmation` (`lib/email.ts:335-443`) — es el template hermano y usa el mismo vocabulario ("turno fijo semanal").

**Firma con objeto desestructurado + branding por tenant** (`:335-364`):
```typescript
export async function sendAbonoConfirmation({
  to, clientName, service, dayLabel, time, businessName, businessSlug,
  primaryColor, logoUrl, whatsapp, cancelUrl, resendApiKey, resendFrom,
}: {
  to: string; clientName: string; service: string
  dayLabel: string // ej. "todos los lunes" (derivado de day_of_week por el caller)
  time: string; businessName: string; businessSlug: string
  primaryColor?: string | null; logoUrl?: string | null; whatsapp?: string | null
  cancelUrl?: string | null
  resendApiKey?: string | null; resendFrom?: string | null
})
```

**Preámbulo obligatorio de todo template** (`:367-376`):
```typescript
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const hora = time.slice(0, 5)
  const accent = (primaryColor && primaryColor.trim()) || '#d94a2b'
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  const headerInner = renderEmailHeader(businessName, logoUrl)
```

**Envío + log** (`:435-442`):
```typescript
  await resendSend(key, {
    from, to: [to],
    subject: `Tu turno fijo quedó agendado — ${businessName}`,
    html,
    text: `¡Hola ${clientName}! ...`,
  })
  console.log(`📧 Confirmación de abono enviada a ${to}`)
```
Siempre `html` + `text`.

**Botón condicional (patrón para el `cancelUrl` de D-16)** (`:372`, `:419-421`):
```typescript
  const cancel = cancelUrl && cancelUrl.trim() ? cancelUrl.trim() : ''
```
```html
${cancel ? `<table cellpadding="0" cellspacing="0" style="margin:16px 0 0;"><tr><td style="border-radius:8px;background:${accent};">
  <a href="${cancel}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Cancelar turno fijo</a>
</td></tr></table>` : ''}
```
Ya está implementado — D-16 solo requiere **pasar** `cancelUrl` desde `abonos/create` (`${process.env.NEXT_PUBLIC_APP_URL}/abono/cancelar/${abono.cancel_token}`; el `cancel_token` ya viene en el `.select(...)` del insert, línea 201).

**Aviso al dueño — analog:** `sendAdminNotification` (`:445-491`), header oscuro `#1a1714` + eyebrow + badge con flag booleano:
```typescript
  const statusLabel = cancelled ? '❌ Turno cancelado' : (pending ? '⏳ Pendiente de pago' : '✅ Pago confirmado')
  const badgeBg = cancelled ? '#fee2e2' : (pending ? '#fef3c7' : '#dcfce7')
  const badgeColor = cancelled ? '#991b1b' : (pending ? '#92400e' : '#166534')
  const subject = cancelled ? `❌ Turno cancelado — ${clientName} · ${fecha} ${hora} hs` : ...
```
El aviso de baja de serie es un template NUEVO (no un flag más en `sendAdminNotification`, que está atado a `date`/`price`/`deposit` de un turno suelto), pero copia header/badge/tabla de detalle.

---

### `app/(dashboard)/abonos/abonos-client.tsx` (MOD: D-17..D-21)

**Analog A — ConfirmDialog destructivo:** `components/dashboard/canchas-manager.tsx:345-356`
```tsx
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
...
<ConfirmDialog
  open={!!delCancha}
  onOpenChange={o => { if (!o) setDelCancha(null) }}
  title="¿Eliminar cancha?"
  description={delDescription}
  confirmWord="ELIMINAR"
  risk="alto"
  confirmLabel="Eliminar"
  destructive
  onConfirm={confirmDelete}
/>
```
**D-19 dice sin escribir-para-confirmar** → omitir `confirmWord` (el componente soporta el nivel "simple", ver `components/crm/confirm-dialog.tsx:46`: *"undefined ⇒ nivel simple (botón habilitado de entrada)"*). Usar `risk="alto"`, `destructive`, `confirmLabel="Dar de baja"`, y en `description` el copy de D-19 con N y fecha. `onConfirm: (reason?) => Promise<void>` — si tira, el dialog queda abierto y muestra toast (`confirm-dialog.tsx:212-225`); el guard anti doble-submit ya está resuelto adentro.

**Analog B — tabs de filtro:** `app/(dashboard)/clients/clients-client.tsx:49`, `:187`, `:686-699`
```tsx
const FILTER_TABS: { key: FilterKey; label: string }[] = [ ... ]
const [filter, setFilter] = useState<FilterKey>('all')
...
{FILTER_TABS.map(t => (
  <button key={t.key} onClick={() => setFilter(t.key)}
    className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
      filter === t.key ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground')}>
    {t.label}
  </button>
))}
```
Píldoras, no `<Tabs>`. D-20 cambia el memo existente (`abonos-client.tsx:103`):
```typescript
const visibleAbonos = useMemo(() => abonos.filter((a) => a.status !== 'cancelled'), [abonos])
```
→ `active` en la vista principal, `cancelled` + `completed` bajo "Archivados".

**Analog C — mutación desde el client + refresh:** mismo archivo, `:113-125`
```typescript
async function saveWindow() {
  ...
  setSavingWindow(true)
  const { error } = await supabase.from('businesses').update({ abono_window_weeks: weeks }).eq('id', business.id)
  setSavingWindow(false)
  if (error) toast.error('Error al guardar')
  else toast.success('Ventana de generación guardada')
}
```
Para la baja: `fetch('/api/abonos/cancel', { method:'POST', ... })` → `toast.success` → `router.refresh()` (el patrón de refresco ya está en `:337`: `onCreated={() => router.refresh()}`).

**Dónde enchufar D-17/D-18:** el `body` del detalle (`:263-305`) y su render Dialog/Drawer (`:307-325`):
```tsx
return isDesktop ? (
  <Dialog open onOpenChange={(open) => { if (!open) close() }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle className="capitalize">{title}</DialogTitle></DialogHeader>
      {body}
    </DialogContent>
  </Dialog>
) : (
  <Drawer open onOpenChange={(open) => { if (!open) close() }}>
    <DrawerContent>
      <DrawerHeader><DrawerTitle className="capitalize">{title}</DrawerTitle></DrawerHeader>
      <div className="overflow-y-auto px-4 pb-6">{body}</div>
    </DrawerContent>
  </Drawer>
)
```
`AbonoRow` (`:29-41`) hay que ampliarlo con `cancel_token: string` (D-17) — y el CONTEXT D-25 exige que ese token viaje **solo** en esta vista del propio negocio.

**Formato de fecha en el panel** (`:278`) — date-fns con locale es, distinto de la superficie pública:
```tsx
{format(parseISO(lastDate), "EEE d 'de' MMM", { locale: es })}
```

---

### `app/(dashboard)/abonos/page.tsx` (MOD: cargar archivados)

**Analog:** sí mismo. La query ya trae **todos** los estados (`:26-30`) — no filtra por `status`:
```typescript
    supabase
      .from('abonos')
      .select('id, day_of_week, start_time, status, total_occurrences, generated_until, skipped_occurrences, created_at, clients(name), services(name), professionals(name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false }),
```
→ el único cambio es **agregar `cancel_token`** al select (D-17). El filtrado por estado vive en el client (D-20).

**Conteo en memoria ya acotado por tenant** (`:48-55`) — molde para cualquier agregado nuevo:
```typescript
  const turnoCounts: Record<string, number> = {}
  const lastTurnoDates: Record<string, string> = {}
  for (const r of apptRows || []) {
    const { abono_id: id, date } = r as { abono_id: string | null; date: string | null }
    if (!id) continue
    turnoCounts[id] = (turnoCounts[id] ?? 0) + 1
    if (date && (!lastTurnoDates[id] || date > lastTurnoDates[id])) lastTurnoDates[id] = date
  }
```
Para el preview D-03 en el panel conviene derivar acá `futureTurnoCounts` / `lastFutureDate` en el mismo loop (comparando `date >= todayStr` con `todayInAR()`), en vez de una query nueva — las fechas son ISO, comparar strings alcanza.

---

## Shared Patterns

### Aislamiento por tenant (D-22/D-23/D-24)
**Fuentes:** `app/api/cancel/[token]/route.ts:7-10`, `app/api/abonos/create/route.ts:10-14`, `.claude/skills/supabase-multitenant-rls/SKILL.md`
**Aplica a:** los 2 route handlers + el helper compartido.
- Vía token: `createAdminClient()` (service role) y el **token es la única autorización**; sin match → 404 genérico.
- Vía panel: `createClient()` anon+RLS, tenant por `owner_id`; **service role PROHIBIDO** salvo `getBusinessSecrets(business.id)` dentro del `after()`.
- Toda query/UPDATE lleva `.eq('business_id', ...)`, incluso con service role.

### Formato de respuesta y errores
**Fuente:** `app/api/abonos/create/route.ts` (`{ ok, error }`) vs `app/api/cancel/[token]/route.ts` (`{ ok, reason }`).
**Ojo:** el analog público usa `reason` (`not_found`, `already_cancelled`, `too_late`, `error`) y el autenticado usa `error` (`unauthorized`, `bad_request`, `missing_fields`, `not_found`, `insert_failed`). Mantener cada vía con la clave de su analog para no romper el molde del client que la consume.

### Logging
**Fuente:** `app/api/cancel/[token]/route.ts:53`, `app/api/abonos/create/route.ts:204,284`
```typescript
console.error(`[abonos/cancel] email cliente FALLÓ (abono ${abonoId}):`, e instanceof Error ? e.message : e)
```
Prefijo `[modulo/accion]`, mensaje seguro con el ternario `instanceof Error`.

### Comentarios en español explicando el porqué
**Fuente:** cabeceras de `lib/abono-generation.ts:4-26`, `app/api/abonos/create/route.ts:8-31`, `supabase/migrations/054_abonos.sql:1-32`.
Todo archivo nuevo de esta fase abre con un bloque que enuncia: qué hace, qué NO hace, y las decisiones no obvias (acá: por qué NO hay regla de 24 h, por qué un solo mail, por qué el scoping doble `abono_id`+`business_id`, por qué no se toca gcal).

### Formato de tiempo/fecha
- Server/lib: `todayInAR()` de `@/lib/booking-window` + `toISODate` local. Comparación lexicográfica de `'yyyy-MM-dd'`.
- Panel: `format(parseISO(d), "EEE d 'de' MMM", { locale: es })` de date-fns.
- Público: helper `fmtDate` local con arrays `DAYS`/`MONTHS` (sin date-fns).
- Hora: siempre `t.slice(0, 5)`.

---

## No Analog Found

| Archivo / capacidad | Rol | Data flow | Razón |
|---|---|---|---|
| Botón "Copiar link de baja" (D-17) | UI client | — | **No existe ningún `navigator.clipboard` en el repo** (grep sobre `app/`, `components/`, `lib/`: 0 matches). Implementar de cero: `await navigator.clipboard.writeText(url)` dentro de un handler, con `toast.success('Link copiado')` / `toast.error(...)` de `sonner` (patrón de feedback ya usado en `abonos-client.tsx:123-124`), y fallback si `navigator.clipboard` no está disponible (contexto no seguro). Botón `<Button variant="outline" size="sm">` con icono de `lucide-react` (`Copy`/`Link`), coherente con el resto del detalle. |

---

## Metadata

**Analog search scope:** `app/api/`, `app/(dashboard)/`, `app/cancelar/`, `lib/`, `components/ui/`, `components/dashboard/`, `components/crm/`, `supabase/migrations/`
**Archivos leídos en profundidad:** 11
**Pattern extraction date:** 2026-07-21
