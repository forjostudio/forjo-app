# Phase 3: Impersonación Read-Only - Research

**Researched:** 2026-06-19
**Domain:** Vista de soporte read-only cross-tenant (service-role acotado por `business_id`) sobre Next.js 16 App Router + Supabase
**Confidence:** HIGH (todas las afirmaciones verificadas contra archivos reales del repo, con `path:line`)

## Summary

La arquitectura ya está cerrada en CONTEXT.md (D-01..D-15). Este research NO reabre decisiones: confirma cómo construir la sub-página de impersonación dentro de la arquitectura existente y mapea el trabajo concreto.

El hallazgo más importante (tarea D-13): **ningún `*-client.tsx` del dashboard es reusable tal cual bajo impersonación**. Los cuatro clientes operativos (`agenda-client`, `appointments-client`, `clients-client`, `settings-client`) son `'use client'` que se auto-fetchean Y auto-mutan vía el cliente browser de Supabase (`createClient()` de `@/lib/supabase/client`, anon key) y vía `fetch()` a route handlers de mutación. Reusarlos "alimentados con data read-only" NO los vuelve read-only: siguen teniendo botones que disparan `supabase.from(...).update/delete/insert(...)` y POSTs de mutación. La garantía read-only por construcción (D-02) exige que esos componentes NO se monten en la superficie de impersonación. Lo reusable de verdad son los **primitivos presentacionales puros** (`Card`, `Badge`, `Table`, `StatusBadge`) y el patrón de render server-side del `dashboard/page.tsx` (que SÍ es server component y solo presenta).

**Primary recommendation:** Construir la sub-página `/admin/negocios/[id]/ver` como RSC que lee TODO con `createAdminClient()` acotado por `.eq('business_id', id)` (calcando el patrón ya probado de `app/(crm)/admin/negocios/page.tsx` y `[id]/page.tsx`), y renderiza secciones operativas con **componentes de presentación read-only nuevos** (sin `'use client'` que mute, sin botones de acción, sin cliente browser Supabase). NO reusar los `*-client.tsx` del dashboard. Aplicar `PaletteScript` con la paleta del negocio impersonado + banner fijo. Auditar la entrada con `logAudit({ action: 'user.impersonate', risk: 'alto', ... })` desde la action que dispara la navegación.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Vista DEDICADA dentro de `/admin` (ej. `/admin/negocios/[id]/ver`), NO se reusa el dashboard real del cliente con su sesión. El operador sigue siendo él mismo (sesión admin); solo LEE datos de otro negocio. Descartada la opción A (cookie de impersonación + kill-switch global).
- **D-02:** Read-only POR CONSTRUCCIÓN. La superficie NO tiene NINGÚN write path (ni server action de mutación, ni route handler de escritura). Esa es LA garantía server-side; la UI deshabilitada NO es la garantía. Sin kill-switch.
- **D-03:** Lectura cross-tenant SIEMPRE vía service-role acotado: `createAdminClient()` + `.eq('business_id', ...)`. Nunca vía sesión del cliente ni confiando en IDs del request.
- **D-04:** Modelo = sub-página navegable, sin estado global. Sin cookie/flag persistente. Salir = navegar a otra parte del CRM. Sin auto-expiración.
- **D-05:** Alcance OPERATIVO: agenda/turnos, servicios, equipo, consultorios, configuración del negocio, contacto de clientes finales.
- **D-06:** EXCLUIDO: historia clínica (`clinical-history`) y finanzas (`finances`). NO se renderizan bajo impersonación.
- **D-07:** Motivo = texto libre obligatorio con mínimo de caracteres, dentro del `ConfirmDialog` nivel "VER". Va tal cual a `audit_log.reason`. Sin lista predefinida.
- **D-08:** Un registro por acceso al confirmar "VER" + motivo. Forma: `actor_id`, `action='impersonate'` (sugerido), `target_type='business'`, `business_id`, `risk='alto'`, `reason`, timestamp. Vía `logAudit()`.
- **D-09:** Cada entrada (incluidas re-entradas) re-pide motivo y genera una fila nueva. NO se audita por pantalla/sección.
- **D-10:** Entrada = acción "Ver como cliente" en la ficha de Phase 2 (`/admin/negocios/[id]`). Sin atajo desde el directorio en v1.
- **D-11:** Se puede impersonar negocios en CUALQUIER estado (activos, trial, vencidos, suspendidos). El estado se refleja en el banner.
- **D-12:** La vista usa la paleta/tema/fuente del negocio impersonado (vía `PaletteScript`). Banner amarillo "Estás viendo como X · solo lectura" fijo arriba con acción "Salir de la vista".
- **D-13:** Reusa componentes PRESENTACIONALES del dashboard alimentados con data read-only server-side. Componentes que hoy fetchean/mutan por sí mismos necesitan variante read-only por props o exclusión. (Mapeo = este research.)
- **D-14:** Disclaimer en el `ConfirmDialog` "VER" (acceso de soporte solo lectura, queda auditado con identidad + motivo, uso responsable de datos de terceros) + la auditoría de D-08.
- **D-15:** PII de clientes finales (nombre, teléfono, email) se muestra completo. Sin masking en v1.

### Claude's Discretion

- Estructura exacta de archivos/rutas dentro de `app/(crm)/admin/negocios/[id]/` para la sub-página.
- Forma concreta de la capa de lectura read-only (lib/helper de SELECT service-role scoped por `business_id`) y qué queries exactas alimentan cada sección.
- Qué componentes presentacionales se reusan tal cual vs. requieren variante read-only (D-13).
- Nombre exacto del `action` string (sugerido `impersonate`) y el `risk` ('alto').
- Cero paquetes npm nuevos (confirmado Phase 1/2).

### Deferred Ideas (OUT OF SCOPE)

- Revisión legal formal de impersonación (cláusula en términos / base de consentimiento) → acción del operador FUERA de esta fase.
- Incluir historia clínica y/o finanzas en la vista → requiere base legal; fuera de v1 (D-06).
- Gate de consentimiento registrado por negocio → v2.
- Masking de PII de clientes finales → no en v1 (D-15).
- Atajo de impersonación desde el directorio + modo persistente con auto-expiración → descartados (D-04/D-10).
- Auditoría por pantalla/sección → descartada (D-09).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IMP-01 | "Ver como cliente" read-only con garantía SERVER-SIDE de que ningún write ocurre | Read-only-by-construction: la sub-página es un RSC que SOLO lee con `createAdminClient()`; NO se montan los `*-client.tsx` del dashboard (que sí mutan) ni se exponen server actions de mutación en el árbol `/admin/negocios/[id]/ver`. Verificación en §3. |
| IMP-02 | Doble confirmación + motivo obligatorio + auditoría de cada acceso | `ConfirmDialog` ya soporta `confirmWord="VER"` + `requireReason` (verificado, §5). `logAudit()` ya acepta `action/risk/businessId/reason` sin migración (§6). |
| IMP-03 | Scope estricto por `business_id` (cero fuga cross-tenant) + banner "Estás viendo como X · solo lectura" + salir | Capa de lectura acotada por `.eq('business_id', id)`/`.eq('id', id)` calcando `negocios/page.tsx` (§2). `PaletteScript` para fidelidad visual (§4). Banner = componente nuevo de presentación. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Resolver e impersonar negocio (lectura cross-tenant) | API/Backend (RSC con service-role) | — | `businesses` no tiene policy "is_admin lee todo"; la lectura cross-tenant va con service-role tras el guard del layout (calca `negocios/[id]/page.tsx:41-49`) |
| Garantía read-only | API/Backend (ausencia de write paths) | UI (refuerzo) | D-02: la garantía es que NO existe forma de mutar en el árbol; la UI sin botones es refuerzo, no la garantía |
| Auditoría del acceso | API/Backend (`logAudit` service-role) | — | `audit_log` solo lo escribe el service-role (031), no falsificable |
| Doble confirmación + motivo | UI (`ConfirmDialog` client) | — | Reduce error humano del operador legítimo; NO autoriza |
| Fidelidad visual (paleta del negocio) | Browser (script en `<html>`) | — | `PaletteScript` setea `data-palette/theme/font` antes de pintar |
| Render de secciones operativas | API/Backend (RSC presenta) | — | Data ya cargada server-side; presentación pura sin self-fetch |

## Standard Stack

Cero paquetes nuevos (confirmado en CONTEXT.md Discretion y verificado: la fase reusa todo lo ya instalado). Stack relevante: Next.js 16.2.7 (App Router, RSC, `params` Promise), React 19.2.4, `@supabase/supabase-js` (service-role admin client), `zod ^4`, `@base-ui/react` (vía `@/components/ui/dialog`), `lucide-react`, `sonner`.

**Installation:** ninguna.

## Package Legitimacy Audit

No aplica — esta fase no instala paquetes externos. (Discretion: "Cero paquetes npm nuevos".)

## Architecture Patterns

### System Architecture Diagram

```
Ficha Phase 2 (/admin/negocios/[id], client)
  │  click "Ver como cliente"
  ▼
ConfirmDialog nivel "VER"  ──(type "VER" + motivo ≥ N chars + disclaimer)──►  onConfirm(reason)
  │
  ▼
Server Action  startImpersonation({ businessId, reason })   [app/(crm)/admin/_actions.ts]
  │  1) requireAdmin()        ← LANZA si no admin (guard server-side, no confía en el dialog)
  │  2) zod.parse(input)      ← businessId uuid + reason min length
  │  3) logAudit({ action:'user.impersonate', risk:'alto', businessId, reason, actorId })
  │  4) redirect(`/admin/negocios/${businessId}/ver`)   ← navega (D-04)
  ▼
Sub-página RSC  /admin/negocios/[id]/ver/page.tsx
  │  - requireAdmin() (re-valida en el loader, Pitfall 2 de Phase 1)
  │  - createAdminClient() (service-role)
  │  - lee businesses por .eq('id', id)  +  secciones por .eq('business_id', id)   (D-03)
  │  - EXCLUYE clinical-history y finances  (D-06)
  ▼
Render:
  PaletteScript(palette/theme/font del negocio impersonado)   ← D-12, fidelidad visual
  + Banner fijo "Estás viendo como {name} · solo lectura" + "Salir de la vista"
  + Componentes de PRESENTACIÓN read-only (nuevos), alimentados por props
      └─ sin 'use client' que mute · sin cliente browser Supabase · sin botones de acción
```

Punto clave del diagrama: **no hay ninguna flecha de escritura** que salga de la sub-página. Esa ausencia ES la garantía IMP-01.

### Recommended Project Structure

```
app/(crm)/admin/negocios/[id]/
├── page.tsx                 # ficha Phase 2 (existe) — agregar botón "Ver como cliente"
├── ficha-client.tsx         # ficha client (existe) — agregar ConfirmDialog "VER" + motivo
└── ver/                     # NUEVO — sub-página de impersonación (D-01)
    ├── page.tsx             # RSC: requireAdmin + createAdminClient + lee por business_id + render
    └── impersonation-view.tsx  # componente de presentación read-only (sin mutación)

components/crm/
├── impersonation-banner.tsx # NUEVO — banner fijo amarillo + "Salir de la vista" (D-12)
└── (read-only renderers)    # NUEVOS si hace falta: agenda/turnos/servicios/equipo/consultorios/config

lib/
└── impersonation.ts (o crm-read.ts)  # NUEVO (Discretion) — helper de SELECT service-role scoped
```

La server action `startImpersonation` vive en `app/(crm)/admin/_actions.ts` (mismo archivo que las 6 actions de Phase 2, mismo patrón).

### Pattern 1: RSC con service-role acotado por business_id (capa de lectura read-only)

**What:** El loader de la sub-página lee con `createAdminClient()` (bypassa RLS) pero SIEMPRE acotado por el `business_id` impersonado. Calca exactamente el patrón ya probado en Phase 2.
**When to use:** Toda lectura de la sub-página de impersonación.
**Example:**
```typescript
// Source: app/(crm)/admin/negocios/[id]/page.tsx:39-54 (patrón real a calcar)
export default async function VerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()                    // re-valida en el loader (Pitfall 2)
  const { id } = await params             // Next 16: params es Promise
  const admin = createAdminClient()

  const { data: business } = await admin
    .from('businesses')
    .select('id, name, slug, plan, plan_status, palette, theme, font, ...')
    .eq('id', id)                         // D-03: scope estricto
    .maybeSingle()
  if (!business) notFound()

  // Secciones operativas, todas acotadas por business_id (D-03), en paralelo:
  const [{ data: appointments }, { data: services }, ...] = await Promise.all([
    admin.from('appointments').select('...').eq('business_id', id)...,
    admin.from('services').select('*').eq('business_id', id)...,
    // ...
  ])
  // render read-only
}
```

### Pattern 2: Componente de presentación read-only por props

**What:** Render sin `'use client'` que mute, sin cliente browser Supabase, sin botones de acción. Reusa primitivos puros (`Card`, `Badge`, `Table`, `StatusBadge`).
**When to use:** Cada sección operativa renderizada bajo impersonación.
**Example:**
```typescript
// Source: app/(dashboard)/dashboard/page.tsx:148-187 — patrón de presentación pura
// (server component que SOLO mapea data a <Card>/<Badge>, sin cliente browser ni mutación).
// La sub-página de impersonación replica ESTE estilo, NO los *-client.tsx que mutan.
```

### Anti-Patterns to Avoid

- **Montar un `*-client.tsx` del dashboard bajo impersonación.** Todos auto-mutan (ver Don't Hand-Roll y §1). Romperían D-02.
- **Pasarle data al `*-client.tsx` "para que solo lea".** El componente igual tiene `supabase.from(...).update(...)` y `fetch('/api/.../delete')` cableados a botones. La data de entrada no desactiva esos paths.
- **Usar el cliente browser de Supabase en la sub-página.** Corre como la sesión del OPERADOR (anon key + cookies del operador) y RLS lo filtraría por SUS negocios, no por el impersonado → o fuga, o cero datos. La única vía correcta es service-role acotado (D-03).
- **Exponer una server action de mutación importable en el árbol `/ver`.** Aunque no haya botón, una action `'use server'` es un endpoint POST invocable directo (Pitfall 2). No declarar ninguna en esta superficie.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Doble confirmación type-to-confirm + motivo | Dialog nuevo | `ConfirmDialog` con `confirmWord="VER"` + `requireReason` | Ya soporta exactamente este nivel (`confirm-dialog.tsx:48-54`, `218-254`); focus trap/Escape/portal resueltos |
| Aplicar paleta del negocio sin flash | Script inline a mano | `PaletteScript` | `palette-script.tsx:8-37`; ya valida el shape y evita flash |
| Auditar el acceso | INSERT a mano | `logAudit()` | `lib/audit.ts:29`; service-role, best-effort, no falsificable |
| Guard server-side | Check inline | `requireAdmin()` | `lib/admin-guard.ts:14`; lanza forbidden/unauthorized |
| Lectura cross-tenant | Cliente nuevo | `createAdminClient()` + `.eq('business_id', id)` | patrón probado en `negocios/page.tsx`, `[id]/page.tsx` |
| Badge de estado del negocio | Badge nuevo | `StatusBadge` | `components/crm/status-badge.tsx` (puro presentacional) |

**Key insight:** la pieza más cara de reescribir mal sería un "dashboard read-only" reusando los `*-client.tsx`. No reusarlos: construir renderers de presentación nuevos y delgados sobre data ya cargada. Es menos código y la única forma de cumplir D-02.

---

## §1 (D-13) Mapeo de componentes — el output central

Auditoría sección por sección de `app/(dashboard)/`. Clasificación: **(a) presentacional puro** (recibe data por props, sin self-fetch ni mutación → reusable) vs **(b) self-fetch/self-mutate** (usa cliente browser Supabase, `fetch()` de mutación, o botones de acción → NO reusable; requiere render read-only nuevo).

| Sección (D-05) | page.tsx (loader) | Client component | Clase | Evidencia (path:line) |
|----------------|-------------------|------------------|-------|------------------------|
| Dashboard (panel) | `dashboard/page.tsx` | NINGUNO (render inline en el RSC) | **(a) presentacional** | `dashboard/page.tsx:106-189` mapea data a `<Card>/<Badge>/<UpcomingAppointments>` sin cliente browser ni mutación. Patrón a calcar. |
| Agenda | `agenda/page.tsx` | `agenda-client.tsx` | **(b) muta** | `agenda-client.tsx:6` importa cliente browser; `:68` `createClient()`; `:232/244/248/272/326/336/344` `delete/insert/update/upsert`; `:83/92` `fetch('/api/google/...')` |
| Turnos | `appointments/page.tsx` | `appointments-client.tsx` | **(b) muta** | `appointments-client.tsx:7` cliente browser; `:94` `createClient()`; `:193` `update({status})`; `:226` `fetch('/api/notify/cancel')`; `:271` `fetch('/api/appointments/delete')` |
| Clientes | `clients/page.tsx` | `clients-client.tsx` | **(b) muta** | `clients-client.tsx:7` cliente browser; `:118` `createClient()`; `:284/304/361` `update`; `:373/374` `update/delete`; `:321/344` `fetch('/api/appointments/delete')` |
| Servicios | `servicios/page.tsx` | `settings-client.tsx` (view="servicios") | **(b) muta** | `settings-client.tsx:8` cliente browser; `:352/361/366/372` services `update/delete/insert`; `:323` storage upload |
| Equipo | `equipo/page.tsx` | `settings-client.tsx` (view="equipo") | **(b) muta** | `settings-client.tsx:425/434/450` professionals `update`; `:402` storage upload |
| Consultorios | `consultorios/page.tsx` | `settings-client.tsx` (view="consultorios") | **(b) muta** | mismo `settings-client.tsx` (locations editables) |
| Negocio | `negocio/page.tsx` | `settings-client.tsx` (view="negocio") | **(b) muta** | `settings-client.tsx:178/187/195/272/295/327/337` businesses `update`; logo upload |
| Configuración | `settings/page.tsx` | `settings-client.tsx` | **(b) muta** | toda la batería de updates de arriba + `:208/572/630` `fetch('/api/subscription/cancel' | '/api/mercadopago/disconnect' | '/api/appointments/cleanup-expired')` |
| ~~Historia clínica~~ | `clinical-history/page.tsx` | `clinical-history-client.tsx` | **EXCLUIDO (D-06)** | NO renderizar |
| ~~Finanzas~~ | `finances/page.tsx` | `finances-client.tsx` | **EXCLUIDO (D-06)** | NO renderizar |

**Conclusión del mapeo (alto valor para el plan):**

- **0 de los `*-client.tsx` operativos son reusables tal cual.** Los 4 (`agenda-client`, `appointments-client`, `clients-client`, `settings-client`) son clase (b): todos importan `@/lib/supabase/client` y mutan, además de POSTear a route handlers de mutación. Pasarles data read-only NO los vuelve seguros.
- **Reusables de verdad (clase a):** primitivos `@/components/ui/*` (`Card`, `Badge`, `Table`, `Input` solo-display), `@/components/crm/status-badge`, `@/components/dashboard/upcoming-appointments` (recibe `appointments` por props y solo presenta — verificar que no traiga acciones), y el ESTILO de render del `dashboard/page.tsx`.
- **Trabajo concreto del plan:** crear renderers de presentación read-only por sección (turnos, servicios, equipo, consultorios, config/negocio, clientes) que tomen la data ya cargada server-side y la pinten con primitivos puros. NO derivar de los `*-client.tsx`. Tarea por sección operativa, todas alimentadas por el loader RSC de `/ver/page.tsx`.

> **Nota de scope (no actúo, solo señalo):** el alcance D-05 lista "configuración del negocio" como visible. La sección Configuración del dashboard muestra **secretos del propio dueño** (vía `getBusinessSecrets`, `settings/page.tsx:23`) — tokens MP/Google/Resend. Bajo impersonación el operador NO debería ver secretos crudos (no son necesarios para soporte y son material sensible). Recomendación para el planner/discuss: renderizar config en read-only mostrando solo PRESENCIA (booleano "conectado/desconectado"), nunca el valor del secreto, como ya hace el dashboard para Google (`agenda/page.tsx:23` pasa solo el booleano). Esto NO contradice ninguna decisión locked; la afino para no introducir una fuga.

---

## §2 Capa de lectura read-only — queries por sección

`app/(dashboard)/layout.tsx:17-21` resuelve `business` por `.eq('owner_id', user.id).single()`. La sub-página de impersonación **NO usa eso** (resolvería el negocio del operador). Resuelve por id de URL con service-role: `.eq('id', id)` para el negocio y `.eq('business_id', id)` para cada colección (D-03).

Queries exactas que alimentan cada sección operativa (calcadas de los loaders del dashboard, a re-emitir en `/ver/page.tsx` con `admin` en vez de `supabase`):

| Sección | Tabla(s) y SELECT (fuente verificada) |
|---------|----------------------------------------|
| Negocio (header/contexto) | `businesses` `.eq('id', id)` — incluir `palette, theme, font` para D-12 (`palette-script` los necesita) + `name, slug, plan, plan_status, ...` |
| Agenda | `time_blocks` `.order('day_of_week')`; `locations` `.order('created_at')`; `schedule_exceptions` `.order('date')`; `appointments` `select('id,date,time,status,client_name,duration_minutes,location_id,services(name),professionals(name)') .gte('date', weekStart) .neq('status','cancelled')` — fuente `agenda/page.tsx:28-39` |
| Turnos | `appointments` `select('*, professionals(name), services(name,price,duration_minutes)')`; `professionals .eq('active',true)`; `services .eq('active',true)`; `time_blocks` — fuente `appointments/page.tsx:18-35` |
| Clientes | `clients` `.order('created_at')`; `appointments select('*, services(name,price)')`; `professionals select('id,name').eq('active',true)` — fuente `clients/page.tsx:18-32` (D-15: PII completa) |
| Servicios | `services .order('created_at')`; `locations .order('created_at')` — fuente `servicios/page.tsx:14-17` |
| Equipo | `professionals .order('created_at')` — fuente `equipo/page.tsx:14` |
| Consultorios | `locations .order('created_at')` — fuente `consultorios/page.tsx:14` |
| Config/Negocio | `businesses` (datos del negocio). **NO** llamar `getBusinessSecrets` (ver nota de scope §1). |

**Forma del helper propuesto (Discretion):** un módulo `lib/impersonation.ts` con una función `loadImpersonationData(businessId: string)` que crea `createAdminClient()` una vez y devuelve `{ business, appointments, services, professionals, locations, clients, timeBlocks, scheduleExceptions }` con todas las queries en `Promise.all`, cada una acotada por `business_id`. Centralizar el scope en un solo lugar reduce el riesgo de olvidar el `.eq('business_id', ...)` en una query suelta (checklist de la skill `supabase-multitenant-rls`).

---

## §3 Read-only-by-construction — verificación

- **Estructura de route groups verificada:** el CRM vive en `app/(crm)/` con `app/(crm)/layout.tsx` como guard (`layout.tsx:22-29`: `requireAdmin` inline vía `app_metadata`, `redirect('/dashboard')` si no admin). La sub-página `/ver` debe vivir bajo `app/(crm)/admin/negocios/[id]/ver/` → hereda ese guard de layout. ✓
- **Pitfall 2 (Phase 1) confirmado vigente:** `lib/admin-guard.ts:6-13` documenta que una server action/route handler invocada directo NO pasa por el layout. Mitigación aquí: (1) llamar `requireAdmin()` en el loader de `/ver/page.tsx` (no confiar solo en el layout); (2) **no declarar ninguna server action de mutación** en este árbol. La única action involucrada (`startImpersonation`) NO muta datos de negocio — solo `logAudit` + `redirect`.
- **No hay layout compartido que filtre una action de escritura:** `app/(crm)/layout.tsx` solo monta shell + `requireAdmin`; no importa ni expone actions. Las 6 actions de mutación viven en `app/(crm)/admin/_actions.ts` y son las de Phase 2 (`changePlan`, `suspendBusiness`, etc.) — ninguna se invoca desde `/ver`. ✓
- **El cliente browser NO debe aparecer en `/ver`:** confirmado que `@/lib/supabase/client.ts:3-8` crea cliente con anon key (RLS activo, sesión del operador). Si se montara ahí, no leería el negocio impersonado. Por construcción, `/ver` usa solo `createAdminClient()` server-side. ✓

**Garantía IMP-01 resumida:** read-only no se logra bloqueando writes, sino por **ausencia de writes** en la superficie — ningún `*-client.tsx` que mute, ninguna server action de mutación, ningún cliente browser. Esa es la garantía server-side (D-02).

---

## §4 PaletteScript (D-12)

`components/palette-script.tsx:8-37`: recibe `{ palette, theme, font, primary? }` y emite un `<script>` que setea `document.documentElement.dataset.palette/theme/font` antes de pintar (sin flash). Defaults: `palette='red'`, `theme` se omite si es `'forjo'`, `font` se omite si es `'auto'`.

- **Datos que necesita:** columnas `palette`, `theme`, `font` de `businesses` — **verificadas existentes**: `palette` (migración `006_palette.sql:9`, default `'red'`), `theme`/`font` (migración `014_theme_font.sql`, `font` default `'auto'`), reflejadas en `schema.sql:117-119`. El SELECT de `/ver/page.tsx` debe incluirlas explícitamente.
- **Cómo aplicarlas:** el dashboard real lo hace en `app/(dashboard)/layout.tsx:40`: `<PaletteScript palette={business.palette} theme={business.theme} font={business.font} />`. La sub-página hace lo mismo con el negocio impersonado.
- **Conflicto con el shell CRM dark (Pitfall 5):** el layout `(crm)` fuerza `dark crm-shell` scopeado (`app/(crm)/layout.tsx:47`) y NO setea `data-theme/data-font` (los hereda del default Forjo) ni `PaletteScript` (es per-business). La sub-página `/ver` quiere lo OPUESTO: la paleta del cliente, NO el shell dark del CRM. El plan debe decidir cómo "salir" del shell dark del CRM en `/ver` (ej. la vista impersonada se monta dentro del route group `(crm)` para heredar el guard, pero su contenedor NO aplica `dark crm-shell` y SÍ aplica `PaletteScript` del negocio). Señalado como punto de diseño para el planner; no contradice ninguna decisión locked (D-12 pide explícitamente la paleta del negocio, "no shell CRM dark").

---

## §5 ConfirmDialog "VER" + motivo (D-07/D-14)

`components/crm/confirm-dialog.tsx` YA soporta el nivel requerido sin tocar el componente base:

- **Nivel "VER":** props `confirmWord="VER"` (type-to-confirm exacto, case-sensitive — `:89`, `:218-236`) + `requireReason` (textarea de motivo obligatorio — `:49`, `:238-254`). El gating se deriva en `computeConfirmState` (`:81-99`): `canConfirm = wordOk && reasonOk && !loading`.
- **Motivo mínimo (D-07 "mínimo de caracteres"):** el componente actual valida `reason.trim().length > 0` (`:90`). Para exigir un mínimo (ej. ≥ 10 chars y evitar "a"), hay DOS opciones sin romper el contrato:
  1. Validar el mínimo en `onConfirm`/la server action (zod `z.string().min(N)`) — preferido, porque la garantía real es server-side (consistente con el patrón del proyecto).
  2. Si se quiere feedback inline, extender `computeConfirmState`/props con un `reasonMinLength`. El componente es LOCKED por UI-SPEC; preferir opción 1 y, si se toca el dialog, hacerlo como extensión retrocompatible. **Señalar a discuss/planner** que el mínimo de caracteres exige una de estas dos.
- **Disclaimer (D-14):** se pasa vía la prop `description` (`:46`, `:215`) — copy: "Acceso de soporte en modo solo lectura. Queda auditado con tu identidad y el motivo. Uso responsable de datos de terceros." (verbatim a definir por UI-SPEC/operador).
- **Cableado en la ficha Phase 2 (D-10):** el patrón de invocación está en `ficha-client.tsx:299-335` — se declara `<ConfirmDialog open={...} onOpenChange={...} ... onConfirm={async () => { await action(...) }} />` y un `<Button onClick={() => setOpen(true)}>`. Para "Ver como cliente": agregar un botón en la sección Acciones (o zona dedicada), un `useState` `verOpen`, y un `<ConfirmDialog confirmWord="VER" requireReason risk="alto" onConfirm={async (reason) => { await startImpersonation({ businessId: data.id, reason: reason! }) }} />`. **Verificado:** `onConfirm` ya recibe `(reason?: string)` (`:54`, `:195`).

Ruta real de la ficha Phase 2 confirmada: `app/(crm)/admin/negocios/[id]/page.tsx` + `ficha-client.tsx`. ✓

---

## §6 Audit wiring (D-08) — sin migración nueva

- **`logAudit()` signature** (`lib/audit.ts:29`, input `AuditInput` `:8-19`): `{ actorId, action, targetType, targetId?, businessId?, risk, reason?, metadata? }`. Service-role, best-effort. Encaja exacto: `logAudit({ actorId: actor.id, action: 'user.impersonate', targetType: 'business', targetId: businessId, businessId, risk: 'alto', reason })`.
- **`requireAdmin()` signature** (`lib/admin-guard.ts:14`): `Promise<User>` — devuelve el `user`, cuyo `.id` es el `actorId`.
- **`audit_log` schema** (`031_crm_audit_log.sql:25-40`): columnas `actor_id, action, target_type, target_id (text), business_id (uuid), risk (check 'alto'/'medio'/'bajo'), reason (text), metadata (jsonb), created_at`. **`action='user.impersonate'` + `risk='alto'` + `reason` caben sin migración nueva.** ✓ Verificado que la última migración relevante a audit es `033_audit_actor_nullable.sql` (actor nullable) — ninguna toca el shape que necesitamos. Esta fase NO requiere migración (confirmado vs. CONTEXT.md).

> **Corrección importante para el planner (action code):** CONTEXT.md D-08 sugiere `action='impersonate'`, pero el **visor de auditoría ya mapea `'user.impersonate'` → "Impersonó negocio"** (`auditoria-client.tsx:67`) y el ejemplo de la migración 031 también usa `'user.impersonate'` (`031:30`). Si se usa `'impersonate'` a secas, el visor mostraría el código crudo en vez del label legible (`auditoria-client.tsx:73-74` cae al `?? action`). **Recomendación: usar `action='user.impersonate'`** para alinear con el visor existente. Esto está dentro de la Discretion ("Nombre exacto del action string... sugerido impersonate") — no contradice una decisión locked, la afina hacia el código ya soportado. `risk='alto'` ya está confirmado por D-08 y por el label existente.

---

## Common Pitfalls

### Pitfall 1: Reusar los `*-client.tsx` del dashboard "en modo solo lectura"
**What goes wrong:** se montan componentes que tienen `supabase.from(...).update/delete` y `fetch('/api/.../delete')` cableados a botones → el operador puede mutar datos del negocio impersonado. Rompe IMP-01/D-02.
**Why:** los 4 clients operativos son clase (b) (§1). La data read-only de entrada no desactiva los write paths internos.
**How to avoid:** construir renderers de presentación nuevos, server-side, sin cliente browser ni botones de acción.
**Warning signs:** cualquier import de `@/lib/supabase/client` o `'use client'` con `fetch`/`update` dentro del árbol `/ver`.

### Pitfall 2: Olvidar `.eq('business_id', id)` en una query con service-role
**What goes wrong:** `createAdminClient()` bypassa RLS; una query sin el filtro lee TODOS los negocios → fuga cross-tenant (el riesgo más caro del proyecto).
**Why:** sin RLS de respaldo, el filtro explícito es la ÚNICA barrera (skill `supabase-multitenant-rls`: defensa en profundidad; con service-role solo queda el filtro de la app).
**How to avoid:** centralizar todas las lecturas en un helper (`lib/impersonation.ts`) donde el `business_id` se aplica una sola vez por colección; revisar query por query en el plan.
**Warning signs:** un `admin.from('appointments').select(...)` sin `.eq('business_id', id)`.

### Pitfall 3: `params` tratado como objeto sincrónico (Next 16)
**What goes wrong:** `const { id } = params` sin await → error de runtime.
**Why:** Next 16 hace `params` un Promise (verificado en `negocios/[id]/page.tsx:39` y su comentario `:11`).
**How to avoid:** `const { id } = await params`.

### Pitfall 4: El shell CRM dark "se come" la paleta del negocio
**What goes wrong:** la sub-página hereda `dark crm-shell` del layout `(crm)` y el operador ve el negocio en oscuro/amarillo CRM, no como lo ve el cliente (rompe el objetivo de D-12).
**Why:** `app/(crm)/layout.tsx:47` fuerza `dark crm-shell` a todo el subtree.
**How to avoid:** ver §4 — el contenedor de `/ver` no aplica `dark crm-shell` y sí `PaletteScript` del negocio. Punto de diseño para el planner.

### Pitfall 5: Mínimo de caracteres del motivo solo en el cliente
**What goes wrong:** se valida `min length` en el dialog pero no en la action → un POST directo registra un motivo basura o vacío.
**Why:** el dialog es refuerzo, no garantía (mismo principio que `requireAdmin`).
**How to avoid:** `z.string().min(N)` en el schema de `startImpersonation` (§5).

## State of the Art

No aplica — fase de integración sobre patrones internos ya establecidos (Phase 1/2). Sin tecnología externa cuyo "estado del arte" haya cambiado.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `components/dashboard/upcoming-appointments.tsx` es presentacional puro (recibe `appointments` por props, sin mutar) | §1 | Bajo — si trae acciones, se excluye y se renderiza inline. Verificar al planear. |
| A2 | Un mínimo de motivo de ~10 chars satisface "mínimo de caracteres" (D-07) sin número exacto definido por el operador | §5 | Bajo — el número exacto lo fija el operador; afecta solo la constante `N`. |

**Nota:** A1/A2 son LOW-risk y no bloquean el plan. Todo lo demás está VERIFICADO contra archivos reales.

## Open Questions (RESOLVED)

Ambas se resolvieron en los PLAN.md (dentro de Claude's Discretion del CONTEXT.md); quedan documentadas acá para trazabilidad.

1. **¿La sección Configuración bajo impersonación muestra presencia de secretos o nada?**
   - Qué sabemos: el dashboard real le muestra al dueño sus secretos crudos (`settings/page.tsx:23` `getBusinessSecrets`).
   - Qué no está claro: D-05 dice "configuración del negocio" visible, pero mostrar tokens crudos al operador es una fuga innecesaria.
   - **RESOLVED:** render read-only de config mostrando solo PRESENCIA (conectado/desconectado), nunca el valor; `/ver` NO llama `getBusinessSecrets`. Adoptado en 03-01 (prohibición en `lib/impersonation.ts`) y 03-02 (renderer de config).

2. **¿`action='user.impersonate'` (recomendado) vs `'impersonate'` (sugerido en D-08)?**
   - Qué sabemos: el visor ya mapea `'user.impersonate'` (§6).
   - **RESOLVED:** usar `'user.impersonate'` (lo mapea `auditoria-client.tsx:67`); con `'impersonate'` a secas el visor mostraría el código crudo. Adoptado en 03-01 (`startImpersonation`).

## Environment Availability

No aplica — la fase es 100% código/UI sobre el stack ya instalado; sin dependencias externas nuevas (sin tools/servicios/CLI a probar). Sin migración nueva (§6).

## Security Domain

Superficie MÁS sensible del milestone (impersonación cross-tenant). `security_enforcement` activo por defecto.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V1 Architecture | yes | Read-only por construcción (ausencia de write paths, D-02); service-role server-only |
| V4 Access Control | yes | `requireAdmin()` en layout `(crm)` + re-validado en el loader `/ver` (Pitfall 2); `is_admin` desde JWT `app_metadata`, no columna de negocio |
| V5 Input Validation | yes | `zod`: `businessId` `z.uuid()`, `reason` `z.string().min(N)` en `startImpersonation` |
| V7 Errors & Logging | yes | `logAudit({ action:'user.impersonate', risk:'alto', reason })` por acceso (D-08); service-role, no falsificable (031) |
| V8 Data Protection | yes | Scope estricto `.eq('business_id', id)` con service-role (D-03); EXCLUIR clinical-history/finances (D-06); NO exponer secretos del negocio (Open Q1); PII de clientes mostrada completa y auditada (D-15) |

### Known Threat Patterns for esta superficie

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Fuga cross-tenant (service-role sin filtro) | Information Disclosure | `.eq('business_id', id)` en TODA query; helper centralizado (Pitfall 2) |
| Write bajo sesión impersonada | Tampering | Sin write paths en `/ver` (D-02); sin `*-client.tsx` que muten; sin server action de mutación |
| Acceso de no-admin a `/ver` | Elevation of Privilege | `requireAdmin()` en layout + loader (no confiar solo en el layout, Pitfall 2) |
| Acceso sin motivo / no auditado | Repudiation | `requireReason` + `z.string().min(N)` server-side + `logAudit` por entrada (D-08/D-09) |
| Exposición de secretos del negocio | Information Disclosure | NO llamar `getBusinessSecrets` en `/ver`; presencia, no valor (Open Q1) |

## Code Examples

### Server action de entrada (auditar + navegar, sin mutar datos de negocio)
```typescript
// Source: patrón calcado de app/(crm)/admin/_actions.ts:46-69 (requireAdmin → parse → logAudit)
// NUEVA action en app/(crm)/admin/_actions.ts. NO muta businesses: solo audita y redirige.
const startImpersonationSchema = z.object({
  businessId: z.uuid(),
  reason: z.string().trim().min(10),     // D-07: mínimo de caracteres, validado server-side
})

export async function startImpersonation(input: unknown): Promise<void> {
  const actor = await requireAdmin()                 // Pitfall 2: guard en la action
  const { businessId, reason } = startImpersonationSchema.parse(input)

  await logAudit({
    actorId: actor.id,
    action: 'user.impersonate',                       // §6: alinea con el visor existente
    targetType: 'business',
    targetId: businessId,
    businessId,
    risk: 'alto',
    reason,
  })

  redirect(`/admin/negocios/${businessId}/ver`)       // D-04: navegar, sin estado global
}
```

### Loader de la sub-página (lectura acotada + paleta)
```typescript
// Source: calca app/(crm)/admin/negocios/[id]/page.tsx:39-54 + app/(dashboard)/layout.tsx:40
export default async function VerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  const { id } = await params
  const admin = createAdminClient()

  const { data: business } = await admin
    .from('businesses')
    .select('id, name, slug, plan, plan_status, palette, theme, font')
    .eq('id', id)
    .maybeSingle()
  if (!business) notFound()

  // ... Promise.all de secciones operativas, todas .eq('business_id', id) ...

  return (
    <>
      <PaletteScript palette={business.palette} theme={business.theme} font={business.font} />
      <ImpersonationBanner businessName={business.name} planStatus={business.plan_status} />
      {/* renderers de presentación read-only alimentados por la data cargada */}
    </>
  )
}
```

## Sources

### Primary (HIGH confidence) — archivos del repo verificados con path:line
- `lib/admin-guard.ts` (`requireAdmin`), `lib/audit.ts` (`logAudit` + `AuditInput`), `lib/supabase/admin.ts`/`client.ts`
- `components/crm/confirm-dialog.tsx`, `components/palette-script.tsx`
- `app/(crm)/layout.tsx`, `app/(crm)/admin/_actions.ts`, `_actions.schemas.ts`, `negocios/page.tsx`, `negocios/[id]/page.tsx`, `[id]/ficha-client.tsx`, `auditoria/auditoria-client.tsx`
- `app/(dashboard)/layout.tsx`, `dashboard/page.tsx`, `agenda|appointments|clients|servicios|equipo|consultorios|negocio|settings/page.tsx` + sus `*-client.tsx`
- `supabase/migrations/031_crm_audit_log.sql`, `006_palette.sql`, `014_theme_font.sql`, `schema.sql:117-119`
- Skills: `supabase-multitenant-rls/SKILL.md`, `convenciones-forjo/SKILL.md`
- CONTEXT.md (D-01..D-15), REQUIREMENTS.md (IMP-01..03), STATE.md

### Secondary / Tertiary
- Ninguna — research 100% basado en el codebase y los artefactos de fase. Cero claims `[ASSUMED]` de alto riesgo (solo A1/A2, LOW).

## Metadata

**Confidence breakdown:**
- Mapeo de componentes (D-13): HIGH — clasificación verificada con grep de mutaciones por archivo:línea.
- Capa de lectura / scope: HIGH — calca patrón ya probado en Phase 2.
- Auditoría sin migración: HIGH — schema 031 + visor verificados; corrección de action code documentada.
- ConfirmDialog/PaletteScript: HIGH — props y comportamiento leídos del componente real.
- Shell dark vs paleta del negocio (§4): MEDIUM — punto de diseño abierto para el planner (no bloqueante).

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (estable; depende solo de código interno que cambia poco entre fases)
