# Fase 3: Impersonación Read-Only - Mapa de Patrones

**Mapeado:** 2026-06-19
**Archivos analizados:** 6 nuevos + 2 modificados
**Analogs encontrados:** 8 / 8 (cobertura total — fase de integración sobre patrones internos ya probados)

> Nota: RESEARCH.md ya auditó el read layer y los `*-client.tsx` del dashboard con citas `path:line`. Este mapa NO re-litiga decisiones; asigna por archivo el analog exacto a calcar y el excerpt concreto. Donde RESEARCH y archivo coinciden, lo confirmé contra el archivo real (ver §verificación).

---

## File Classification

| Archivo nuevo/modificado | Rol | Data Flow | Analog más cercano | Calidad |
|--------------------------|-----|-----------|--------------------|---------|
| `app/(crm)/admin/_actions.ts` → `startImpersonation` (modificar/añadir) | server action | event-driven (audit + redirect, NO muta negocio) | `app/(crm)/admin/_actions.ts:46-69` (`changePlan`) | exact |
| `app/(crm)/admin/negocios/[id]/ver/page.tsx` (nuevo) | route / RSC loader | request-response (read-only) | `app/(crm)/admin/negocios/[id]/page.tsx:39-54` (ficha loader) | exact |
| `lib/impersonation.ts` (nuevo, Discretion) | service / read-helper | CRUD (solo R), service-role scoped | `app/(crm)/admin/negocios/[id]/page.tsx:41-49` + `app/(dashboard)/*/page.tsx` loaders | role-match |
| `app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx` (nuevo) | component (presentación pura) | transform (props→render) | `app/(dashboard)/dashboard/page.tsx:148-187` (render inline RSC) | role-match |
| Renderers read-only por sección (turnos/servicios/equipo/consultorios/clientes/negocio) (nuevos) | component (presentación pura) | transform (props→render) | `app/(dashboard)/dashboard/page.tsx:148-187` + primitivos `@/components/ui/*` | role-match |
| `components/crm/impersonation-banner.tsx` (nuevo) | component (presentación) | transform (props→render) | `components/crm/status-badge.tsx` (presentacional puro) + `app/(crm)/layout.tsx:47` (shell) | partial |
| `app/(crm)/admin/negocios/[id]/ficha-client.tsx` (modificar: botón + dialog "VER") | component (client) | request-response (dispara action) | `ficha-client.tsx:299-323` (invocación `ConfirmDialog`→action) | exact |
| `app/(crm)/admin/_actions.schemas.ts` → `startImpersonationSchema` (añadir) | validation schema | transform | `_actions.schemas.ts` (schemas existentes Phase 2) | exact |

**EXCLUIDO (D-06):** NO mapear renderers para `clinical-history` ni `finances`.

---

## Pattern Assignments

### `startImpersonation` en `app/(crm)/admin/_actions.ts` (server action, audit+redirect)

**Analog:** `app/(crm)/admin/_actions.ts:46-69` (`changePlan`).

**Patrón obligatorio del archivo** (cabecera `_actions.ts:16-30`): toda action sigue el mismo orden — `requireAdmin()` PRIMERA línea (es endpoint POST invocable directo, el layout NO la protege, Pitfall 2) → `schema.parse(input)` → service-role → `logAudit()` con action code EXACTO que reconoce el visor.

**Diferencia clave vs. las 6 actions de Phase 2:** `startImpersonation` NO muta `businesses`. Solo audita + `redirect()`. No lleva `admin.from(...).update(...)` ni `revalidatePath`. Es la única action del árbol de impersonación (D-02: cero write paths).

**Imports a calcar** (`_actions.ts:1-6`):
```typescript
'use server'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
// + redirect de 'next/navigation' (NO createAdminClient — no muta nada)
```

**Estructura a calcar** (de `changePlan` `:46-65`, quitando el update):
```typescript
export async function startImpersonation(input: unknown): Promise<void> {
  const actor = await requireAdmin()                       // :47 — guard en la action (Pitfall 2)
  const { businessId, reason } = startImpersonationSchema.parse(input)  // :48 — input no confiable
  await logAudit({
    actorId: actor.id,                                     // requireAdmin devuelve el user (:14 admin-guard)
    action: 'user.impersonate',                            // §6 RESEARCH: alinea con auditoria-client.tsx:67
    targetType: 'business',
    targetId: businessId,
    businessId,
    risk: 'alto',                                          // D-08
    reason,                                                // D-07: texto libre va tal cual a audit_log.reason
  })
  redirect(`/admin/negocios/${businessId}/ver`)            // D-04: navegar, sin estado global
}
```

**Action code:** usar `'user.impersonate'` (NO `'impersonate'` a secas). El visor ya mapea `'user.impersonate'`→"Impersonó negocio" (`auditoria-client.tsx:67`); con `'impersonate'` mostraría el código crudo. Dentro de Discretion.

---

### `app/(crm)/admin/negocios/[id]/ver/page.tsx` (RSC loader read-only)

**Analog:** `app/(crm)/admin/negocios/[id]/page.tsx:39-54` (ficha Phase 2) para guard + read scoped; `app/(dashboard)/layout.tsx:40` para `PaletteScript`.

**Patrón de lectura cross-tenant** (`[id]/page.tsx:39-54`):
```typescript
export default async function VerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()                          // RE-valida en el loader (Pitfall 2 — no confía en layout)
  const { id } = await params                   // Next 16: params es Promise (:39 ficha lo hace igual)
  const admin = createAdminClient()             // service-role: businesses NO tiene policy "is_admin lee todo"

  const { data: business } = await admin
    .from('businesses')
    .select('id, name, slug, plan, plan_status, palette, theme, font')  // §4: palette/theme/font para D-12
    .eq('id', id)                               // D-03: scope estricto por id
    .maybeSingle()
  if (!business) notFound()                     // :54 ficha hace notFound() igual
  // ... loadImpersonationData(id) → render
}
```

**Comentario de aislamiento a calcar** (`[id]/page.tsx:9-19`): el id viene de la URL (cliente) pero NO es autorización — la garantía es `requireAdmin`. Al cliente cruzan SOLO columnas no sensibles. NUNCA tokens ni el cliente admin.

**Diferencia obligatoria vs. dashboard real:** `app/(dashboard)/layout.tsx:17-21` resuelve `business` por `.eq('owner_id', user.id)`. La sub-página NO usa eso (resolvería el negocio del operador). Resuelve por `.eq('id', id)` / `.eq('business_id', id)` (D-03).

**Aplicación de paleta** (`app/(dashboard)/layout.tsx:40`):
```typescript
<PaletteScript palette={business.palette} theme={business.theme} font={business.font} />
```
Punto de diseño abierto (Pitfall 4 RESEARCH): el contenedor de `/ver` NO debe aplicar `dark crm-shell` (que fuerza `app/(crm)/layout.tsx:47`) y SÍ `PaletteScript` del negocio. Resolver en plan.

---

### `lib/impersonation.ts` (capa de lectura read-only centralizada — Discretion)

**Analog:** loaders del dashboard (`agenda/page.tsx:28-39`, `appointments/page.tsx:18-35`, `clients/page.tsx:18-32`, `servicios/page.tsx:14-17`, `equipo/page.tsx:14`, `consultorios/page.tsx:14`) re-emitidos con `admin` en vez de `supabase`.

**Forma propuesta:** `loadImpersonationData(businessId: string)` crea `createAdminClient()` UNA vez, devuelve `{ business, appointments, services, professionals, locations, clients, timeBlocks, scheduleExceptions }` con todas las queries en `Promise.all`, cada una `.eq('business_id', businessId)`. Centralizar el scope en un solo lugar evita olvidar el filtro (Pitfall 2 RESEARCH / skill `supabase-multitenant-rls`).

**Queries exactas por sección** (verificadas, fuente en §2 RESEARCH):

| Sección | Tabla(s) + SELECT | Fuente |
|---------|-------------------|--------|
| Negocio (header) | `businesses .select('id,name,slug,plan,plan_status,palette,theme,font').eq('id', id)` | `[id]/page.tsx:43-49` |
| Agenda | `time_blocks .order('day_of_week')`; `locations .order('created_at')`; `schedule_exceptions .order('date')`; `appointments .select('id,date,time,status,client_name,duration_minutes,location_id,services(name),professionals(name)').gte('date',weekStart).neq('status','cancelled')` | `agenda/page.tsx:28-39` |
| Turnos | `appointments .select('*, professionals(name), services(name,price,duration_minutes)')`; `professionals .eq('active',true)`; `services .eq('active',true)`; `time_blocks` | `appointments/page.tsx:18-35` |
| Clientes | `clients .order('created_at')`; `appointments .select('*, services(name,price)')`; `professionals .select('id,name').eq('active',true)` (D-15: PII completa) | `clients/page.tsx:18-32` |
| Servicios | `services .order('created_at')`; `locations .order('created_at')` | `servicios/page.tsx:14-17` |
| Equipo | `professionals .order('created_at')` | `equipo/page.tsx:14` |
| Consultorios | `locations .order('created_at')` | `consultorios/page.tsx:14` |
| Config/Negocio | `businesses` (datos). **NO** llamar `getBusinessSecrets` (Open Q1 / nota scope §1: solo presencia conectado/desconectado, nunca el valor del secreto) | `settings/page.tsx:23` (lo que NO se replica) |

Toda query lleva `.eq('business_id', businessId)` salvo el `businesses` que lleva `.eq('id', businessId)`.

---

### Renderers de presentación read-only (impersonation-view + por sección)

**Analog:** `app/(dashboard)/dashboard/page.tsx:148-187` — render inline en el RSC que SOLO mapea data a `<Card>/<CardHeader>/<CardContent>/<Badge>` sin cliente browser ni mutación. Calcar ESTE estilo.

**Primitivos reusables tal cual (clase a, RESEARCH §1):** `@/components/ui/*` (`Card`, `Badge`, `Table`, `Input` solo-display), `@/components/crm/status-badge`, `@/components/dashboard/upcoming-appointments` (verificar A1: que no traiga acciones).

**Excerpt de estilo a calcar** (`dashboard/page.tsx:148-182`):
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
    <CardTitle className="text-base">Agenda de hoy</CardTitle>
  </CardHeader>
  <CardContent>
    {!todayAppointments || todayAppointments.length === 0 ? (
      <p className="text-muted-foreground text-sm py-4 text-center">No hay turnos para hoy</p>
    ) : (
      <div className="space-y-2">
        {todayAppointments.map(appt => (
          <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            {/* ... solo display, sin onClick de mutación ... */}
            <Badge className={`text-xs ${STATUS_COLORS[appt.status]}`} variant="outline">
              {STATUS_LABELS[appt.status]}
            </Badge>
          </div>
        ))}
      </div>
    )}
  </CardContent>
</Card>
```

**ANTI-PATRÓN crítico (Pitfall 1 RESEARCH):** NO derivar de los `*-client.tsx` del dashboard. Los 4 (`agenda-client`, `appointments-client`, `clients-client`, `settings-client`) son clase (b) — importan `@/lib/supabase/client` y mutan (`update/delete/insert`) + POSTean a route handlers. Pasarles data read-only NO los vuelve seguros. Construir renderers NUEVOS, delgados, sin `'use client'` que mute, sin cliente browser, sin botones de acción. Esa ausencia de write paths ES la garantía D-02.

**Warning sign a vigilar en el árbol `/ver`:** cualquier import de `@/lib/supabase/client` o `'use client'` con `fetch`/`update`.

---

### `components/crm/impersonation-banner.tsx` (banner fijo — D-12)

**Analog:** `components/crm/status-badge.tsx` (presentacional puro, para el estilo de componente) + comportamiento de referencia del mock (`crm-design/Forjo Consola CRM (offline).html`, banner amarillo).

**Props:** `{ businessName: string; planStatus: string | null }`. Render: banner amarillo fijo arriba "Estás viendo como {businessName} · solo lectura" + acción "Salir de la vista" (un `<Link>` que navega a otra parte del CRM — D-04, salir = navegar, NO apagar estado).

**Importante:** el read-only del mock es no-op visual (pointerEvents). En el build la garantía es server-side por construcción (RESEARCH §3), NO el banner. El banner es feedback, no la garantía. El estado del negocio (incl. `suspended`) se refleja aquí (D-11).

---

### Modificación de `ficha-client.tsx` (botón "Ver como cliente" + ConfirmDialog "VER")

**Analog:** `ficha-client.tsx:299-323` — invocación existente de `ConfirmDialog` (nivel "SUSPENDER" muestra el patrón `confirmWord` + `risk='alto'`).

**Patrón de cableado a calcar** (`ficha-client.tsx:311-323`, dialog "SUSPENDER"):
```tsx
<ConfirmDialog
  open={suspendOpen}
  onOpenChange={setSuspendOpen}
  title="Suspender negocio"
  description="..."
  confirmWord="SUSPENDER"
  risk="alto"
  confirmLabel="Suspender"
  onConfirm={async () => { await suspendBusiness({ businessId: data.id }) }}
/>
```

**Para "Ver como cliente"** (D-07/D-10/D-14): añadir botón en la zona de Acciones, un `useState verOpen`, y:
```tsx
<ConfirmDialog
  open={verOpen}
  onOpenChange={setVerOpen}
  title="Ver como cliente"
  description="Acceso de soporte en modo solo lectura. Queda auditado con tu identidad y el motivo. Uso responsable de datos de terceros."  // D-14 disclaimer (copy final por UI-SPEC)
  confirmWord="VER"
  requireReason                          // D-07: motivo obligatorio (textarea, confirm-dialog.tsx:49,238-254)
  risk="alto"
  confirmLabel="Ver como cliente"
  onConfirm={async (reason) => { await startImpersonation({ businessId: data.id, reason: reason! }) }}  // onConfirm ya recibe (reason?) — confirm-dialog.tsx:54,195
/>
```
El componente `ConfirmDialog` ya soporta este nivel SIN tocarlo: `confirmWord="VER"` (type-to-confirm exacto, `:218-236`) + `requireReason` (`:238-254`), gating en `computeConfirmState` (`:81-99`). NO modificar el componente base (LOCKED por UI-SPEC).

---

### `startImpersonationSchema` en `_actions.schemas.ts` (validación)

**Analog:** schemas existentes de Phase 2 (`_actions.schemas.ts`, importados en `_actions.ts:8-14`).

```typescript
const startImpersonationSchema = z.object({
  businessId: z.uuid(),
  reason: z.string().trim().min(10),   // D-07: mínimo de caracteres, validado SERVER-SIDE (Pitfall 5)
})
```
El mínimo del motivo va en el schema server-side (la garantía real), no solo en el dialog. A2: N≈10 es asunción LOW-risk; el operador fija el número exacto.

---

## Shared Patterns

### Guard server-side
**Source:** `lib/admin-guard.ts:14` (`requireAdmin()` → `Promise<User>`)
**Apply to:** `startImpersonation` (primera línea) Y el loader `/ver/page.tsx` (re-valida, no confía en el layout — Pitfall 2). El layout `app/(crm)/layout.tsx:22-29` ya guardea el subtree, pero una action/route invocada directo NO pasa por él.

### Lectura cross-tenant (service-role acotado)
**Source:** `lib/supabase/admin.ts` (`createAdminClient()`) + patrón `[id]/page.tsx:41-49`
**Apply to:** TODA lectura de `/ver` (centralizada en `lib/impersonation.ts`). Regla no negociable: `.eq('business_id', id)` en cada query (Pitfall 2: service-role bypassa RLS, el filtro es la ÚNICA barrera). NUNCA el cliente browser (`@/lib/supabase/client.ts:3-8` corre como sesión del operador → fuga o cero datos).

### Auditoría del acceso
**Source:** `lib/audit.ts:29` (`logAudit`, input `AuditInput` `:8-19`) — service-role, best-effort, no falsificable (`031_crm_audit_log.sql:25-40`)
**Apply to:** `startImpersonation` únicamente (D-08: un registro por acceso, al confirmar VER+motivo; D-09: cada re-entrada = fila nueva). Sin migración nueva: `action='user.impersonate'` + `risk='alto'` + `reason` caben en el schema 031.

### Aplicación de paleta del negocio
**Source:** `components/palette-script.tsx:8-37` + uso en `app/(dashboard)/layout.tsx:40`
**Apply to:** loader `/ver/page.tsx` con `palette/theme/font` del negocio impersonado (D-12). Requiere incluir esas 3 columnas en el SELECT de `businesses` (verificadas: `006_palette.sql`, `014_theme_font.sql`, `schema.sql:117-119`).

### Doble confirmación + motivo
**Source:** `components/crm/confirm-dialog.tsx:48-54, 218-254` (`confirmWord` + `requireReason`)
**Apply to:** botón "Ver como cliente" en `ficha-client.tsx`. Reduce error humano del operador legítimo; NO autoriza (la autorización es `requireAdmin` server-side).

---

## No Analog Found

Ninguno. Todos los archivos nuevos tienen analog interno (fase de integración sobre Phase 1/2). Los renderers read-only por sección no tienen un analog 1:1 que se reuse tal cual (los `*-client.tsx` son clase (b) inservibles), pero SÍ tienen analog de ESTILO: el render inline de `dashboard/page.tsx:148-187` + primitivos `@/components/ui/*`. Se construyen nuevos por diseño (D-02), no por falta de patrón.

---

## Metadata

**Scope de búsqueda de analogs:** `app/(crm)/admin/**`, `app/(dashboard)/**`, `lib/`, `components/crm/**`, `components/palette-script.tsx`, `supabase/migrations/`.
**Verificación contra archivos reales:** `[id]/page.tsx:1-70` (loader+aislamiento), `_actions.ts:1-75` (patrón action+changePlan), `ficha-client.tsx:290-339` (invocación ConfirmDialog), `dashboard/page.tsx:140-189` (render presentacional puro) — todos confirmados, coinciden con las citas de RESEARCH.md.
**Fecha:** 2026-06-19
