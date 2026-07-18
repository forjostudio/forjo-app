# Phase 4: Ventana de reserva pública - Research

**Researched:** 2026-07-18
**Domain:** Multi-tenant scheduling constraint (booking window) — Next.js 16 App Router + Supabase (view/RLS) + client date-fns calendar + server backstop
**Confidence:** HIGH (todo verificado leyendo el código real del repo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** El límite tiene **3 modos mutuamente excluyentes**: (a) días de anticipación (rolling — N días desde hoy), (b) fecha límite fija (hasta un DD/MM/YYYY exacto), (c) sin límite.
- **D-02:** Default = **30 días** (modo rolling) para TODOS los negocios en la migración (arregla el bug de reservas a años; no hay clientes reales → sin riesgo).
- **D-03 (discreción del planner):** el schema exacto queda a criterio del research/planner. Sugerencia: `businesses.max_advance_days` (int, nullable) + `businesses.max_advance_date` (date, nullable); ambos null = sin límite; definir prioridad si conviven.
- **D-04:** Un control en Ajustes (cerca de la config de reservas/horarios) que expone los 3 modos: input numérico en días + toggle "sin límite" + opción de fecha exacta.
- **D-05:** Al llegar al tope: deshabilitar los días fuera de ventana + capar la navegación de mes + mostrar texto **"Reservas hasta el DD/MM"** cerca del calendario. En los DOS calendarios.
- **D-06:** Cambiar el límite afecta **solo reservas nuevas**: los turnos ya reservados más allá de la ventana quedan intactos.
- **D-07:** El cálculo usa **hora Argentina** (`America/Argentina/Buenos_Aires`, UTC-3 sin DST).
- **D-08 (locked por roadmap):** enforcement en 3 capas — los 2 calendarios públicos capan (UX), `booking/create` valida server-side (backstop anti-tampering), disponibilidad es capa opcional.

### Claude's Discretion
- Schema exacto (columnas vs mode enum) y prioridad si conviven días + fecha (D-03).
- **Cómo llega el valor al calendario público sin abrir una lectura ancha de `businesses` a `anon`** (el research lo confirma — ver §1).
- Código de error del backstop (ej. `date_out_of_window`) siguiendo el patrón de errores del route.
- Forma exacta del control (radio de modos, toggle, date-picker) siguiendo el design system.

### Deferred Ideas (OUT OF SCOPE)
- **Anticipación mínima** (no reservar dentro de las próximas X horas) — espejo del máximo, fuera de v0.22.
- **Ventana por servicio** — se eligió global por negocio.
- El alta manual autenticada (`app/api/appointments/create`) NO se limita — la ventana es exclusiva del flujo público.
- El aviso por mail del alta manual es Phase 5, no esta.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOOK-WINDOW-01 | El dueño configura en Ajustes la anticipación máxima (global por negocio) | §2 (schema: 2 columnas nullable en `businesses`, default 30) + §6 (control en tab Cobros del hub Negocio, patrón `saveDeposit`) |
| BOOK-WINDOW-02 | Los DOS calendarios públicos capan navegación de mes + deshabilitan días fuera de ventana | §3 (cutoff efectivo AR + cap del botón "mes siguiente" + `disabled` por día) en `booking-client.tsx` y `canchas-booking-client.tsx` |
| BOOK-WINDOW-03 | El servidor rechaza reserva pública fuera de ventana (backstop anti-tampering); el alta manual NO se limita | §4 (validación en `app/api/booking/create` antes del insert de client, error `date_out_of_window`; `appointments/create` es otro archivo → exento) |
</phase_requirements>

## Summary

La fase agrega un límite de anticipación de reserva (global por negocio, 3 modos) que se propaga del `businesses` al público y se enforcea en 3 capas. **El punto delicado es el read-path**: la página pública `app/[slug]/page.tsx` NO lee la tabla `businesses` — lee la **vista acotada `public_businesses`** con el cliente `createPublicServerClient()` (anon, sin cookies). Esa vista fue creada en la migración 026 justamente para cerrar una fuga de secretos entre tenants. Para que el valor de la ventana llegue al calendario hay que agregar la(s) columna(s) **a la vista `public_businesses` además de a la tabla**, y al `.select()` de `page.tsx`. Agregar la columna solo a la tabla NO alcanza (la vista no la tendría y el select fallaría). Y **nunca** hay que cambiar `page.tsx` para leer `businesses` directo — eso reabriría el agujero de 026.

El backstop server es sencillo: `app/api/booking/create/route.ts` YA lee `businesses` directo con **service-role** (línea 52-54), así que basta sumar las columnas a ese select y validar antes de insertar. El alta manual (`app/api/appointments/create`) es un archivo distinto que NO se toca → queda exento automáticamente (BOOK-WINDOW-03).

Los dos calendarios son componentes client gemelos con un calendario mensual custom (NO react-day-picker) que ya usan `date-fns`. El cap se implementa computando una **fecha de corte efectiva en hora AR** y sumándola a la condición `disabled` de cada día + deshabilitando el botón "mes siguiente" cuando el mes mostrado alcanza/supera el mes del corte. Existe un patrón establecido de hora AR con offset literal `-03:00` (`lib/crm-metrics.ts`) — clave para el backstop, porque el server corre en **UTC** en Vercel y `new Date()` puede desfasar el día hasta 3 horas.

**Primary recommendation:** Migración 052 con dos columnas nullable (`max_advance_days int DEFAULT 30`, `max_advance_date date`) + `CREATE OR REPLACE VIEW public_businesses` agregando ambas al final + `.select` de `page.tsx` + backstop en `booking/create` + cap en los dos clients con un helper compartido `effectiveBookingCutoff(business)` en hora AR. Un solo dato que fluye del negocio al público, enforced en UI y server.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Configurar la ventana (dueño) | Frontend Server (SSR) / Browser | Database | El control vive en settings-client (browser, anon+RLS) y persiste en `businesses` con la sesión del dueño; misma superficie que deposit/theme |
| Propagar el valor al público | Frontend Server (SSR) | Database (vista) | `page.tsx` (server component) lee `public_businesses` y pasa la prop al client; la vista acota columnas |
| Capar el calendario (UX) | Browser | — | Cómputo de cutoff + `disabled` en los client components; puro render, no autoridad |
| Rechazar fecha fuera de ventana (autoridad) | API / Backend | — | `app/api/booking/create` (service-role) es la fuente de verdad anti-tampering; el cliente no es de confianza |
| Aislamiento del dato entre tenants | Database (vista + grants) | — | La vista owner-run expone solo columnas no sensibles; anon nunca toca `businesses` directo |

## Standard Stack

No se agregan dependencias. Todo el trabajo usa lo ya presente.

### Core (ya en el repo)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `date-fns` | `^4.4.0` | Cómputo/formato de la fecha de corte y comparación de días/meses | Ya importado en ambos calendarios `[VERIFIED: booking-client.tsx L5, canchas-booking-client.tsx L17]` |
| `@supabase/supabase-js` + `@supabase/ssr` | `^2.106 / ^0.10` | Read-path (vista pública) y backstop (service-role) | Patrón establecido del proyecto `[VERIFIED: page.tsx, route.ts]` |

**Helpers `date-fns` a agregar a los imports de los calendarios (todos existen en date-fns v4):**
- `addDays` — computar `hoy + max_advance_days`.
- `isAfter` — día > corte.
- `parseISO` — parsear `max_advance_date` (string `yyyy-mm-dd`) a Date.
- Ya importados y reutilizables: `startOfDay`, `startOfMonth`, `isSameMonth`, `isBefore`, `format`, `addMonths`.

**Installation:** N/A — cero paquetes nuevos.

## Package Legitimacy Audit

**No aplica.** Esta fase no instala paquetes externos. Todo (date-fns, supabase, next) ya está en `package.json` y verificado en producción. No hay superficie de slopsquatting.

## Architecture Patterns

### System Architecture Diagram

```
CONFIG (dueño, autenticado)
  settings-client.tsx (browser, anon key + RLS)
    └─ supabase.from('businesses').update({ max_advance_days | max_advance_date }).eq('id', business.id)
         │  (patrón saveDeposit; escribe EXACTAMENTE una columna, nulea la otra — 3 modos)
         ▼
  ┌─────────────────────────────┐
  │ businesses (tabla, RLS)     │  ← columnas nuevas: max_advance_days int DEFAULT 30, max_advance_date date
  └─────────────────────────────┘
         │                                   │
         │ (vista owner-run, acota columnas) │ (service-role, lee tabla directo)
         ▼                                   ▼
  public_businesses (VIEW)            app/api/booking/create (POST público)
         │  GRANT SELECT anon                │  select(...max_advance_days, max_advance_date)
         ▼                                   │
  app/[slug]/page.tsx                        │  ┌─ BACKSTOP: cutoff AR; si date > cutoff → 400 date_out_of_window
   createPublicServerClient() (anon)         │  └─ (antes del insert de client / antes de createAppointmentCore)
   .from('public_businesses').select(...)    │
         │  prop business (PublicBusiness)   │
         ▼                                   ▼
  BookingClient / CanchasBookingClient   createAppointmentCore (intacto)
   ├─ cutoff = effectiveBookingCutoff(business)  (hora AR)
   ├─ botón "mes siguiente" disabled si calMonth ≥ mes(cutoff)
   ├─ día disabled si startOfDay(d) > cutoff
   └─ texto "Reservas hasta el DD/MM" (si cutoff != null)

FUERA DE SCOPE (exento): app/api/appointments/create (alta manual autenticada) — archivo distinto, no se toca
```

### Pattern 1: Read-path acotado por vista (NO leer `businesses` con anon)
**What:** El público lee `public_businesses` (vista sin WHERE, owner-run, expuesta a anon con solo columnas no sensibles), NO la tabla.
**When to use:** Siempre que el flujo público necesite un dato de `businesses`.
**Example:**
```typescript
// Source: app/[slug]/page.tsx L45-47 (VERIFIED)
const { data: business } = await supabase
  .from('public_businesses')
  .select('id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, landing_config, max_advance_days, max_advance_date') // ← agregar las 2 al final
  .eq('slug', slug)
  .single()
```
**Precedente:** `landing_config` ya se agregó a la vista después de 026 (migración 030 en `_migrations-archive`) → hay precedente exacto de `CREATE OR REPLACE VIEW public_businesses` sumando una columna.

### Pattern 2: Helper compartido de cutoff en hora AR
**What:** Una sola función que, dado el business, devuelve la fecha de corte efectiva (o null = sin límite), usada por ambos calendarios y por el backstop.
**When to use:** UI (client) y backstop (server) deben coincidir bit a bit.
**Example (recomendado — `lib/booking-window.ts` nuevo):**
```typescript
// Zona AR fija (UTC-3 sin DST), offset literal — mismo patrón que lib/crm-metrics.ts (AR_OFFSET='-03:00')
import { addDays, startOfDay, parseISO } from 'date-fns'

// "Hoy" en AR, robusto aunque el server corra en UTC (Vercel). Devuelve un Date a medianoche AR.
export function todayInAR(): Date {
  const now = new Date()
  // desplazar a AR restando 3h y truncar al día
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return startOfDay(new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate())))
}

// Fecha de corte efectiva (inclusive). null = sin límite. Precedencia D-03: fecha fija > días rolling.
export function effectiveBookingCutoff(b: { max_advance_days?: number | null; max_advance_date?: string | null }): Date | null {
  if (b.max_advance_date) return startOfDay(parseISO(b.max_advance_date))         // modo (b)
  if (b.max_advance_days && b.max_advance_days > 0) return startOfDay(addDays(todayInAR(), b.max_advance_days)) // modo (a)
  return null                                                                      // modo (c) sin límite
}
```
> **Nota:** el planner puede afinar `todayInAR` reusando el patrón exacto de `lib/crm-metrics.ts` (offset `-03:00`). Lo importante: **no usar `new Date()` crudo en el server** para "hoy" (desfase UTC de hasta 3h → un cliente que reserva 23:30 AR vería el corte corrido un día).

### Pattern 3: Cap del calendario mensual custom
**What:** Sumar el corte a la lógica de días deshabilitados y al botón de mes.
**Example (booking-client.tsx — mismo cambio en canchas-booking-client.tsx):**
```typescript
// cutoff computado una vez (useMemo) del business
const cutoff = useMemo(() => effectiveBookingCutoff(business), [business])
const cutoffMonth = cutoff ? startOfMonth(cutoff) : null

// Botón "mes siguiente" (booking L561-568 / canchas L419-426): sumar disabled
disabled={cutoffMonth != null && !isBefore(startOfMonth(calMonth), cutoffMonth)}
//   ↑ cuando el mes mostrado ya alcanzó/superó el mes del corte, no se puede avanzar

// Día (booking L577-580 / canchas L435-438): sumar a la condición existente
const disabled = !inMonth || isPast || !isOpen || (cutoff != null && isAfter(startOfDay(d), cutoff))
```

### Anti-Patterns to Avoid
- **Leer `businesses` directo con anon en `page.tsx`:** reabre la fuga de secretos que 026 cerró. SIEMPRE por la vista.
- **Agregar la columna solo a la tabla y al select de `page.tsx` sin tocar la vista:** el select contra `public_businesses` fallaría (la vista no tiene la columna). La vista es obligatoria.
- **Usar `new Date()` como "hoy" en el backstop server:** desfase UTC-3. Usar el helper AR.
- **Tocar `appointments/create` o `createAppointmentCore`:** el alta manual queda exenta; el core es compartido y no debe conocer la ventana.
- **Rechazar la reserva DESPUÉS de insertar el `client` row:** deja clients huérfanos. Validar antes (§4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Hoy" en AR | Cálculo ad-hoc por componente | Helper compartido `todayInAR()` (offset `-03:00`, patrón `lib/crm-metrics.ts`) | Consistencia UI/server; el server corre en UTC |
| Cutoff efectivo de los 3 modos | Lógica duplicada en cada client + route | `effectiveBookingCutoff(business)` en `lib/` | Un solo lugar de verdad; evita drift entre UI y backstop |
| Exponer el dato al público | Nueva vista / endpoint | Extender `public_businesses` existente | Ya es el read-path acotado, ya tiene grants a anon |
| Aritmética de fechas/meses | Comparaciones manuales de strings | `date-fns` (`addDays`, `isAfter`, `startOfMonth`, `isBefore`) | Ya importado, correcto con bordes de mes |

**Key insight:** El 90% del riesgo de esta fase está en dos cosas triviales de olvidar: (1) agregar la columna a la **vista** (no solo a la tabla), y (2) computar "hoy" en **hora AR** en el server. Ambas ya tienen patrón establecido en el repo.

## Runtime State Inventory

> Fase aditiva (nuevas columnas + UI + validación). No es rename/refactor. Igual se audita el estado runtime por rigor.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `businesses` gana 2 columnas; migración con `DEFAULT 30` backfillea las filas existentes a 30 días (D-02) | Migración 052 (code + data en un `ALTER TABLE ADD COLUMN ... DEFAULT 30`) |
| Live service config | **PostgREST schema cache**: tras aplicar la migración en prod hay que `NOTIFY pgrst, 'reload schema';` para que `public_businesses` sirva las columnas nuevas (patrón repo, ver 043) | Ejecutar el NOTIFY al aplicar a mano en prod |
| OS-registered state | Ninguno — no hay tasks/crons nuevos (el cron diario existente no cambia) | None |
| Secrets/env vars | Ninguno — `max_advance_*` NO es secreto (es config pública, va a la vista a propósito) | None |
| Build artifacts | `supabase/schema.sql` queda desactualizado tras la migración (dump del baseline) | Regenerar `schema.sql` post-migración (patrón repo: 037/039/042/043) |

## Common Pitfalls

### Pitfall 1: Columna en la tabla pero no en la vista
**What goes wrong:** Se agrega `max_advance_days` a `businesses`, se pone en el `.select` de `page.tsx`, pero se olvida `CREATE OR REPLACE VIEW`. El select contra `public_businesses` tira error (columna inexistente en la vista) y la página pública 500ea o el campo llega `undefined`.
**Why it happens:** La vista es un intermediario invisible; el mental model "es una columna de businesses" ignora que el público no lee la tabla.
**How to avoid:** La migración 052 DEBE incluir `CREATE OR REPLACE VIEW public_businesses` con las 2 columnas nuevas al final del select. Verificar con `supabase db reset` local.
**Warning signs:** `column public_businesses.max_advance_days does not exist` en logs; campo `undefined` en el client.

### Pitfall 2: "Hoy" en UTC en el backstop
**What goes wrong:** Un cliente reserva a las 23:30 hora AR (= 02:30 UTC del día siguiente). Con `max_advance_days=30`, el server calcula el corte desde el día UTC (ya "mañana") → acepta/rechaza un día de más o de menos vs lo que el calendario mostró.
**Why it happens:** Vercel corre en UTC; `new Date()` server ≠ día AR.
**How to avoid:** Helper `todayInAR()` con offset `-03:00`, usado tanto en el client como en el server.
**Warning signs:** Discrepancia UI-vs-server en el borde del día; tests que fallan cerca de medianoche.

### Pitfall 3: Rechazo tardío → clients huérfanos
**What goes wrong:** El route inserta un `client` (L86) ANTES de `createAppointmentCore`. Si la validación de ventana se hace después del insert, cada intento fuera de ventana deja un `client` basura.
**Why it happens:** Copiar el chequeo al lado del core sin mirar el orden.
**How to avoid:** Validar la ventana temprano, **después de resolver `business` y antes del insert de `client`** (idealmente justo tras el gate de `plan_status`, L66-68, donde `date` ya está parseado).
**Warning signs:** Crecimiento de filas `clients` sin turno asociado.

### Pitfall 4: Los dos modos conviven en la DB
**What goes wrong:** El UI escribe `max_advance_days` sin nulear `max_advance_date` (o viceversa) → quedan los dos y la precedencia decide silenciosamente.
**Why it happens:** Update parcial.
**How to avoid:** El save del control siempre escribe las DOS columnas: el modo activo con su valor, la otra en `null`. Precedencia definida (fecha > días) como red de seguridad, no como comportamiento esperado.

## Code Examples

### Migración 052 (esqueleto — validar con `supabase db reset` local)
```sql
-- Source: patrón repo (043_professionals_service_id.sql, VERIFIED)
-- 052 — businesses.max_advance_days / max_advance_date: ventana de reserva pública (BOOK-WINDOW-01)
ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "max_advance_days" integer DEFAULT 30,  -- D-02: 30 para todos (backfill por DEFAULT)
  ADD COLUMN IF NOT EXISTS "max_advance_date" date;                -- modo fecha fija; null si no se usa

-- Extender la vista pública acotada (Pitfall 1). Columnas nuevas al FINAL (regla CREATE OR REPLACE VIEW).
CREATE OR REPLACE VIEW public_businesses AS
  SELECT id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address,
         instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key,
         default_slot_duration, buffer_minutes, created_at, landing_config,
         max_advance_days, max_advance_date   -- ← nuevas
  FROM businesses;
GRANT SELECT ON public_businesses TO anon, authenticated;  -- idempotente
-- prod (a mano): NOTIFY pgrst, 'reload schema';  + regenerar supabase/schema.sql
```
> Nota: `max_advance_days` NO es NOT NULL (nullable) para soportar "sin límite" seteando null desde el UI, aunque el DEFAULT sea 30. `max_advance_date` nullable siempre.

### Backstop en `app/api/booking/create/route.ts`
```typescript
// 1) sumar columnas al select existente (L52-54, VERIFIED):
.select('id, name, slug, address, require_deposit, deposit_amount, deposit_expiry_hours, buffer_minutes, primary_color, logo_url, plan_status, max_advance_days, max_advance_date')

// 2) validar TEMPRANO (tras el gate de plan_status L66-68, antes del insert de client L86):
const cutoff = effectiveBookingCutoff(business)            // hora AR, helper compartido
if (cutoff && isAfter(startOfDay(parseISO(date)), cutoff)) {
  return Response.json({ ok: false, error: 'date_out_of_window' }, { status: 400 })
}
```
- **Error code:** `date_out_of_window`, status **400** (validación de input, consistente con `missing_fields`/`invalid_service` que son 400; no es un conflicto de slot → no 409). El client puede mapear a un toast genérico; no necesita copy dedicado porque la UI ya impide llegar acá (el backstop es anti-tampering).
- **Exención del alta manual:** `app/api/appointments/create/route.ts` es un archivo separado y NO se toca → BOOK-WINDOW-03 (el dueño carga con cualquier anticipación) se cumple sin código extra.

### Texto público "Reservas hasta el DD/MM" (D-05)
```tsx
// Cerca del calendario, gateado por cutoff. En ambos clients, debajo del card del calendario
// (después de </div> del calendario, antes del bloque de Horario):
{cutoff && (
  <p className="mt-2 text-xs text-muted-foreground text-center">
    Reservas hasta el {format(cutoff, 'dd/MM')}
  </p>
)}
```

### Tipos (`lib/types.ts`, interface Business — sección Scheduling L38-41)
```typescript
// Scheduling
default_slot_duration?: number | null
buffer_minutes?: number | null
// Ventana de reserva pública (BOOK-WINDOW). Ambos null = sin límite; date > days si conviven.
max_advance_days?: number | null   // modo rolling (default 30 en DB)
max_advance_date?: string | null   // modo fecha fija, ISO yyyy-mm-dd
```
> `PublicBusiness = Omit<Business, 'notification_email'>` → hereda ambas columnas automáticamente `[VERIFIED: types.ts L103]`. El valor solo llega al runtime si está en la vista + el select de page.tsx.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Público lee `businesses` entero con anon | Vista `public_businesses` acotada (owner-run) | Migración 026 (SEC-01, v0.9) | Todo dato público nuevo va por la vista, no la tabla |
| Vista con set fijo de columnas | Vista extendida por `CREATE OR REPLACE` cuando se suma un dato público | Migración 030 (landing_config) | Precedente directo para 052 |
| Calendario react-day-picker | Calendario mensual custom con `date-fns` | v0.12 motor-reservas | El cap se hace a mano en la condición `disabled`, no en props de una lib |

**Deprecated/outdated:** N/A para esta fase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La precedencia "fecha fija > días rolling" si conviven es aceptable (los 3 modos son mutuamente excluyentes en el UI, así que en la práctica no conviven) | §2/Pitfall 4 | Bajo — el UI nulea la columna inactiva; la precedencia es solo red de seguridad. Confirmar en discuss si el usuario prefiere "más restrictivo gana" |
| A2 | Ubicar el control en la tab **Cobros** del hub Negocio (junto a seña) es la lectura correcta de "cerca de config de reservas/horarios" (D-04) | §6 | Bajo — es discreción de diseño; el planner/UI-spec puede elegir Configuración u otra tab sin afectar la lógica |
| A3 | Status 400 + `date_out_of_window` es el código correcto siguiendo el patrón del route | §4 | Bajo — es discreción explícita (D-03); cualquier código snake_case coherente sirve |
| A4 | El corte es **inclusive** (con `max_advance_days=30` se puede reservar hasta hoy+30 inclusive) | §3 | Medio — define el borde exacto; confirmar semántica con el usuario en planning (¿30 días incluye el día 30?) |

**Todas las claims de infraestructura (read-path, vista, service-role, date-fns, tipos, migración) están VERIFIED leyendo el código real — no hay assumptions ahí.**

## Open Questions (RESOLVED en planning 2026-07-18)

1. **¿El corte es inclusive o exclusive?** (A4) → **RESOLVED: inclusive.** hoy+N es reservable; se
   deshabilita solo lo estrictamente posterior (`isAfter(day, cutoff)` estricto). Operacionalizado en 04-01.

2. **¿"Más restrictivo gana" vs "fecha fija gana" si convivieran ambas?** (A1) → **RESOLVED: fecha > días.**
   El UI escribe una sola columna (nulea la inactiva); la precedencia es red de seguridad, no comportamiento
   esperado. Operacionalizado en 04-01/04-02.

3. **Ubicación exacta del control en Ajustes** (A2) → **RESOLVED: tab Cobros del hub Negocio**, junto a la
   seña, reusando el patrón `saveDeposit`. Operacionalizado en 04-02.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI local (`supabase db reset`) | Validar migración 052 sobre el baseline | ✓ | configurado (MEMORY: infra-testing-roadmap) | — |
| PostgreSQL 17 local | Replay del baseline + migraciones | ✓ | PG17 | — |
| Vitest | Tests de la lógica de ventana | ✓ | presente (283+ tests en repo) | — |
| date-fns | Cómputo de fechas | ✓ | ^4.4.0 | — |

**Missing dependencies with no fallback:** ninguna.
**Nota de deploy:** la migración se aplica **a mano** en prod (invariante del proyecto: no push remoto), coordinada con el deploy + `NOTIFY pgrst` + regen de `schema.sql`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (presente, 283+ tests) |
| Config file | `vitest.config.*` (repo tiene infra de testing) |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOK-WINDOW-03 | Fecha fuera de ventana → `date_out_of_window` (público) | unit (helper) + integration (route) | `npx vitest run lib/booking-window.test.ts` | ❌ Wave 0 |
| BOOK-WINDOW-03 | Alta manual NO limitada por ventana | integration | `npx vitest run` (appointments/create sin cambios → test de no-regresión) | ❌ Wave 0 |
| BOOK-WINDOW-01 | Migración: default 30 + columnas en vista | migration | `supabase db reset` (local) | Manual/local |
| BOOK-WINDOW-02 | Cutoff efectivo por modo (días/fecha/sin límite) en hora AR | unit | `npx vitest run lib/booking-window.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/booking-window.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** suite verde + `supabase db reset` local verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `lib/booking-window.test.ts` — cubre `effectiveBookingCutoff` (3 modos) y `todayInAR` (borde de medianoche AR/UTC) — BOOK-WINDOW-02/03
- [ ] Test de integración del backstop en `app/api/booking/create` (fecha fuera de ventana → 400 `date_out_of_window`) — BOOK-WINDOW-03
- [ ] Test de no-regresión: `appointments/create` acepta fecha lejana (exención) — BOOK-WINDOW-03

## Security Domain

> `security_enforcement` habilitado (default). Multi-tenant es el core value del proyecto.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Aislamiento por tenant: la vista `public_businesses` es owner-run y expone solo columnas no sensibles; el backstop resuelve el negocio por slug (service-role) y no confía en IDs del cliente |
| V5 Input Validation | yes | `date` parseado defensivamente; la ventana se valida server-side (backstop) independientemente de lo que mande el cliente |
| V1 Data Protection | yes | `max_advance_*` es dato público por diseño (no secreto) — se agrega a la vista deliberadamente; ningún secreto se expone |
| V6 Cryptography | no | — |

### Known Threat Patterns for {Next.js público + Supabase RLS}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cliente manipula la request para reservar fuera de ventana | Tampering | Backstop server en `booking/create` (BOOK-WINDOW-03), no se confía en la UI |
| Reabrir la fuga de secretos de 026 al leer `businesses` con anon | Information Disclosure | Mantener el read-path por la vista `public_businesses`; NUNCA leer la tabla con anon |
| Exponer una columna sensible al sumarla a la vista | Information Disclosure | Solo se agregan `max_advance_days`/`max_advance_date` (config pública, análoga a `buffer_minutes`); revisión de que no entre nada más |
| Backstop rechaza tras insertar client (orphan) | (integridad de datos) | Validar antes del insert de `client` |

**Secure-phase gate (del roadmap) verificará:** (a) el server capa la fecha en el flujo público aunque la UI se saltee; (b) el alta manual autenticada queda exenta sin abrir bypass del anti-doble-booking; (c) la migración no filtra columnas sensibles de `businesses` a anon.

## Sources

### Primary (HIGH confidence)
- `app/[slug]/page.tsx` L40-118 — read-path vía `public_businesses` con `createPublicServerClient()`; comentario explícito de 026 [VERIFIED]
- `app/api/booking/create/route.ts` L48-150 — service-role, select de `businesses`, orden de insert client → core [VERIFIED]
- `app/[slug]/booking-client.tsx` L5, L147-152, L553-600 — calendario custom, `addMonths` sin tope, condición `disabled` de día [VERIFIED]
- `app/[slug]/canchas-booking-client.tsx` L17, L124-129, L411-458 — gemelo del cap [VERIFIED]
- `supabase/_migrations-archive/026_public_businesses_view.sql` — creación de la vista + DROP de la policy abierta [VERIFIED]
- `supabase/schema.sql` L675-698 — vista `public_businesses` vigente (con `landing_config`), owner-run [VERIFIED]
- `supabase/migrations/043_professionals_service_id.sql` — patrón `ALTER TABLE ADD COLUMN` + notas de aplicación a mano/regen schema [VERIFIED]
- `lib/types.ts` L1-54, L103 — interface Business (sección Scheduling) + `PublicBusiness = Omit<...>` [VERIFIED]
- `lib/crm-metrics.ts` L32-33 — patrón de hora AR con offset literal `-03:00` [VERIFIED]
- `app/(dashboard)/settings/settings-client.tsx` L711-759, L1538-1560 — patrón `saveDeposit` (update de businesses + toast), tab Cobros [VERIFIED]
- Migraciones existentes: última = `051_landing_assets_gate_entitlement.sql` → próxima = **052** [VERIFIED via Glob]

### Secondary (MEDIUM confidence)
- Skill `supabase-multitenant-rls` (reglas de aislamiento; no re-leída en esta sesión, consistente con lo verificado en código)

### Tertiary (LOW confidence)
- Ninguna. Toda afirmación de infraestructura está verificada contra el código.

## Metadata

**Confidence breakdown:**
- Read-path / vista / schema: HIGH — leído el código y las migraciones reales
- Cap del calendario: HIGH — leídos ambos clients y sus condiciones `disabled`
- Backstop / error code: HIGH (mecánica) / MEDIUM (código exacto = discreción D-03)
- Hora AR: HIGH — patrón establecido en `lib/crm-metrics.ts`
- Ubicación del control en Ajustes: MEDIUM — discreción de diseño (A2)

**Research date:** 2026-07-18
**Valid until:** ~2026-08-17 (30 días; stack estable, sin dependencias fast-moving)
