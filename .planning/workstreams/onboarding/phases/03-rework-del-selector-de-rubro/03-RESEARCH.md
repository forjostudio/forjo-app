# Phase 3: Rework del selector de rubro - Research

**Researched:** 2026-07-04
**Domain:** Modelo de datos de verticales (Forjo) + UI de onboarding/settings + migración SQL de backfill (Supabase/Postgres) + display público de booking
**Confidence:** HIGH (todo verificado contra el código del repo con `file:line`; sin dependencias externas nuevas)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** El selector muestra exactamente **4 rubros = los 4 `VerticalKey`**: Salud, Belleza/Estética/Spa, General, Canchas. El label de belleza pasa de "Belleza y Estética" a **"Belleza/Estética/Spa"**.
- **D-02:** Elegir un rubro **sigue siendo obligatorio** para crear el negocio (paso "Negocio", `canGoNext` step 1). Se elige el RUBRO (vertical), no un subtipo.
- **D-03:** El campo personalizable es **OPCIONAL**. Si queda vacío, la página de reservas muestra el **label del rubro como fallback**. Hoy el booking hace `{business.type && <p>…}` (`booking-client.tsx:401`): cambia a mostrar `type` **o** el label del vertical si `type` está vacío.
- **D-04:** El campo está **SIEMPRE visible** (no depende de "Otro"). Corrige el bug actual del onboarding.
- **D-05:** Label del campo: **"¿A qué se dedica tu negocio?"**. Leyenda debajo: **"Así aparecerá en tu página de reservas"**.
- **D-06:** **Placeholders por rubro** (patrón "Ej: …"): Salud → `Ej: Lic. en Psicología, Kinesiólogo`; Belleza/Estética/Spa → `Ej: Barbería, Masajista, Depilación`; General → `Ej: Lavaautos, Tatuajes, Fotógrafo`; Canchas → `Ej: Canchas de fútbol`.
- **D-07:** **Rubro elegido → columna `vertical`**. **Texto libre → columna `type`**. `resolveVertical` ya prefiere `vertical` (`lib/verticals.ts:163`). La lógica de auto-ocultar Profesionales en canchas del onboarding (Phase 2 D-03, hoy `getVerticalKeyByType(type)`) debe pasar a keyear el **rubro/vertical elegido** directamente.
- **D-08:** **Limpiar los subtipos granulares** (`VERTICALS[key].types`). ANTES de limpiarlos, **backfillear la columna `vertical` desde `type`** para negocios existentes (derivando con `getVerticalKeyByType` / `LEGACY_TYPE_VERTICAL`). El `type` guardado de negocios existentes **NO se toca**.
- **D-09:** **Reemplazar** el selector actual de Configuración → Negocio (`settings-client.tsx:242-262`, grupo + toggle "Otro" + dropdown de subtipos) por el **mismo selector nuevo** (4 rubros + campo libre siempre visible + placeholder por rubro + leyenda).

### Claude's Discretion
- Mecánica exacta de la migración de backfill de `vertical` (nueva migración SQL numerada; validar con `supabase db reset` local; aplicar a prod a mano).
- Consumidores de `ALL_BUSINESS_TYPES` (comentario `lib/verticals.ts:184`): mapear dónde se usa y decidir adaptar/quitar.
- Si conviene un helper nuevo en `lib/verticals.ts` para los placeholders por rubro y para el label del rubro (fallback booking).
- Comportamiento de `getVerticalKeyByType` / `LEGACY_TYPE_VERTICAL` una vez vaciados los `types`.
- Forma exacta del control en la UI (Select 4 rubros + Input texto libre) respetando Bauhaus + estados; mobile-first.

### Deferred Ideas (OUT OF SCOPE)
- Renombrar el paso/terminología del vertical más allá de esto (fuera de alcance, como Phase 2).
- **Sugerencia de rubro por IA:** esta fase la mapea y decide adaptar/quitar, pero NO construye una sugerencia nueva.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Research Support |
|----|-------------|------------------|
| ONB-RUBRO-01 | Selector de rubro a 4 opciones + campo personalizable siempre visible con sugerencia por rubro + leyenda, en el **onboarding** (paso "Tu negocio"). Reemplaza subtipos y el "Otro" roto. | §UI control (onboarding `page.tsx:467-483`), §Placeholders helper, §Callers `getVerticalKeyByType` (auto-hide canchas `page.tsx:380`) |
| ONB-RUBRO-02 | El **mismo selector** en la **configuración del dashboard**; el texto libre se muestra como categoría del negocio en booking; el rubro resuelve el vertical sin regresión. | §UI control (settings `settings-client.tsx:1090-1119`), §Backfill migration (047), §Booking display fallback (booking-client:401 + canchas-booking-client:331), §Regression surface |
</phase_requirements>

## Summary

Esta fase es un **rework de datos + UI de bajo-medio riesgo (regresión, no aislamiento)** sobre un modelo que ya soporta el destino: `businesses.vertical` (columna `text DEFAULT 'general'`, sin CHECK — baseline L184) y `businesses.type` (columna `text` nullable — baseline L165) ya existen, y `resolveVertical` (`lib/verticals.ts:163-174`) **ya prefiere la columna `vertical`** sobre derivar de `type`. El cambio es: guardar el **rubro (VerticalKey) en `vertical`** y el **texto libre en `type`**, vaciar los arrays `VERTICALS[*].types`, y backfillear `vertical` desde `type` para las filas viejas antes de vaciar.

**Hallazgo clave (des-riesga la Discretion #2):** `ALL_BUSINESS_TYPES` (`lib/verticals.ts:185`) es **código muerto** — grep de todo el repo devuelve **cero importadores**. La "sugerencia de rubro por IA" descrita en el comentario `lib/verticals.ts:184` **no existe en el código**: `lib/anthropic.ts` (cliente Haiku) no se usa para clasificar rubros en ninguna route/onboarding/settings (el único `getAnthropicClient`/`AI_MODEL` no está wireado a rubros). Recomendación: **BORRAR** `ALL_BUSINESS_TYPES` junto con los `types` (D-08) — no hay que adaptar ni preservar ninguna sugerencia.

El backfill se expresa como **SQL puro** (CASE mapping): `LEGACY_TYPE_VERTICAL` + `VERTICALS[*].types` son mapas string→VerticalKey planos que SQL replica 1:1. No hay lógica más rica que un CASE. Como `vertical` tiene `DEFAULT 'general'` y la mayoría de las filas ya se crean con `vertical` seteado (onboarding `page.tsx:293`, settings `settings-client.tsx:278`), el universo real de filas con `vertical` NULL es mínimo (casi sin data en prod — Phase 2 CONTEXT D-01); igual el backfill es el seguro y garantiza que ninguna fila quede sin resolver tras vaciar los `types`.

**Primary recommendation:** Migración **047** (aditiva, `UPDATE ... WHERE vertical IS NULL` con CASE sobre `type`) → luego vaciar `types` + borrar `ALL_BUSINESS_TYPES` + agregar 2 helpers a `lib/verticals.ts` (`RUBRO_PLACEHOLDERS` y `getVerticalLabel`) → reemplazar el Select en onboarding y settings por 4 rubros + Input libre → agregar fallback al label del rubro en **ambos** booking clients (401 y 331) → re-keyear el auto-hide de canchas a la VerticalKey elegida.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Elegir rubro (vertical) en el alta | Client (onboarding `'use client'`) | DB (`businesses.vertical`) | El wizard es client-side; persiste vía Supabase browser client con RLS por owner |
| Elegir rubro en settings | Client (`settings-client.tsx`) | DB (`businesses.vertical`) | Mismo patrón; update sobre `.eq('id', business.id)` |
| Resolver vertical (menú/terminología/features) | Lib puro (`lib/verticals.ts`) | — | `resolveVertical` framework-agnostic, consumido en server (`layout.tsx`, `[slug]/page.tsx`) y client (`use-terminology`) |
| Backfill de `vertical` para filas viejas | DB (migración SQL 047) | — | Data migration one-shot; el CASE replica el mapping TS |
| Mostrar categoría del negocio en booking | Client (`booking-client.tsx`, `canchas-booking-client.tsx`) | Lib (`getVerticalLabel` fallback) | Presentación; el dato (`type` o label) viene del server component |
| Placeholder por rubro | Lib (`RUBRO_PLACEHOLDERS` en `verticals.ts`) | Client (Input) | Fuente única declarativa, consumida por ambas superficies |

## Standard Stack

**No se instalan paquetes nuevos.** Todo el trabajo usa el stack ya presente. No aplica tabla de versiones ni instalación.

| Herramienta | Rol en esta fase | Referencia |
|-------------|------------------|-----------|
| shadcn `Select` + `Input` + `Label` | Control del selector (4 rubros) + campo libre | `@/components/ui/{select,input,label}` (ya importados en onboarding y settings) |
| `lib/verticals.ts` (framework-agnostic) | `VerticalKey`, `VERTICALS`, `resolveVertical`, helpers nuevos | `lib/verticals.ts:1-186` |
| Supabase migration SQL numerada | Backfill de `vertical` (047) | `supabase/migrations/` (baseline v0.13 + 040-046) |
| Vitest `^4.1.9` | Test unitario opcional del mapping de backfill (`getVerticalKeyByType`) | `test/*.test.ts`, `npm run test` |

## Package Legitimacy Audit

**N/A — esta fase no instala paquetes externos.** Todo el trabajo es sobre código y esquema existentes (edición de `lib/verticals.ts`, dos client components, una migración SQL, dos booking clients). No hay superficie de package legitimacy.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │        lib/verticals.ts  (fuente única)        │
                    │  VerticalKey · VERTICALS(label/terminology/    │
                    │  menu/features) · resolveVertical (vertical>>) │
                    │  [NUEVO] RUBRO_PLACEHOLDERS · getVerticalLabel │
                    └───────────────┬──────────────────────────────┘
        ┌───────────────────────────┼──────────────────────────────────┐
        │ (escribe vertical+type)    │ (lee: label/terminology/menu)     │ (fallback label)
        ▼                            ▼                                   ▼
┌───────────────┐          ┌──────────────────┐             ┌────────────────────────┐
│ ONBOARDING     │          │ DASHBOARD readers │             │ BOOKING público         │
│ page.tsx       │          │ layout · sidebar  │             │ booking-client:401      │
│ Select 4 rubros│          │ use-terminology   │             │ canchas-booking:331     │
│ + Input libre  │          │ agenda · equipo   │             │ type || getVerticalLabel│
│ auto-hide canch│          │ (leen vertical)   │             │  (D-03 fallback)        │
└───────┬────────┘          └──────────────────┘             └────────────────────────┘
        │ INSERT {vertical: rubro, type: libre}
        ▼
┌──────────────────────────────────────────────────────────┐
│  businesses  (vertical text DEFAULT 'general' · type text) │
│  ◄── migración 047: UPDATE vertical FROM type (CASE)  ──── │
└──────────────────────────────────────────────────────────┘
```

Trazá el caso principal: el usuario elige un rubro → se escribe en `businesses.vertical`; escribe (o no) el texto libre → `businesses.type`. Todos los readers del panel resuelven vía `resolveVertical` (que ya prioriza `vertical`). El booking muestra `type` o, si vacío, `getVerticalLabel(vertical)`.

### Pattern 1: Fuente única declarativa en `lib/verticals.ts`
**What:** Los placeholders por rubro y el label-para-fallback viven como mapas/función en `lib/verticals.ts` (mismo lugar que `VERTICALS`, `TYPE_GROUPS`), no hardcodeados en cada componente.
**When to use:** Cuando dos superficies (onboarding + settings) y un tercer consumidor (booking fallback) necesitan el mismo dato derivado de `VerticalKey`.
**Example:**
```typescript
// Source: patrón de lib/verticals.ts:177-186 (TYPE_GROUPS / ALL_BUSINESS_TYPES)
// [ASSUMED] shape recomendado — el planner define exactitud

// Placeholder por rubro (D-06). Fuente única; onboarding y settings lo consumen.
export const RUBRO_PLACEHOLDERS: Record<VerticalKey, string> = {
  salud: 'Ej: Lic. en Psicología, Kinesiólogo',
  belleza: 'Ej: Barbería, Masajista, Depilación',
  general: 'Ej: Lavaautos, Tatuajes, Fotógrafo',
  canchas: 'Ej: Canchas de fútbol',
}

// Label del rubro (para fallback en booking cuando `type` está vacío, D-03).
export function getVerticalLabel(business: { vertical?: string | null; type?: string | null }): string {
  return resolveVertical(business).label   // resolveVertical ya prefiere `vertical`
}
```
Nota: `getVerticalLabel` reusa `resolveVertical` (ya prefiere `vertical`, cae a `type`), así que devuelve el label correcto incluso para filas viejas sin `vertical` seteado. El label de belleza cambia a **"Belleza/Estética/Spa"** en `VERTICALS.belleza.label` (`lib/verticals.ts:66`) — ese cambio se propaga automáticamente al selector, al fallback y al hint del panel.

### Pattern 2: Select de 4 rubros (VerticalKey) reemplazando `TYPE_GROUPS`
**What:** El `Select` deja de iterar `TYPE_GROUPS` (grupos + subtipos anidados) y pasa a 4 `SelectItem` planos con `value = VerticalKey`.
**When to use:** Onboarding (`page.tsx:467-483`) y settings (`settings-client.tsx:1090-1119`).
**Example:**
```typescript
// Source: mirror de app/(onboarding)/onboarding/page.tsx:468-482
// value = VerticalKey directo (ya no `${grupo}:::${subtipo}`)
<Select value={vertical} onValueChange={v => setVertical(v as VerticalKey)}>
  <SelectTrigger><SelectValue placeholder="Elegí tu rubro" /></SelectTrigger>
  <SelectContent>
    {(Object.keys(VERTICALS) as VerticalKey[]).map(k => (
      <SelectItem key={k} value={k}>{VERTICALS[k].label}</SelectItem>
    ))}
  </SelectContent>
</Select>
{/* Campo libre SIEMPRE visible (D-04/D-05) */}
<Label>¿A qué se dedica tu negocio?</Label>
<Input value={type} onChange={e => setType(e.target.value)}
       placeholder={RUBRO_PLACEHOLDERS[vertical]} />
<p className="text-xs text-muted-foreground">Así aparecerá en tu página de reservas</p>
```

### Anti-Patterns to Avoid
- **Backfill destructivo:** NO tocar `businesses.type` de filas existentes (D-08 lo prohíbe explícitamente). La migración solo escribe `vertical`, y solo donde falta.
- **`supabase db push` en CI:** las migraciones se aplican a prod **a mano** y coordinadas con el deploy (CLAUDE.md constraint + Vercel Hobby). El `db reset` local solo valida; NO empujar a prod desde CI.
- **Re-derivar el vertical desde `type` en la UI nueva:** una vez que `vertical` es el input primario, NO llamar `getVerticalKeyByType(type)` para decidir el vertical (el `type` ahora es texto libre y no matchea ningún array vaciado → siempre daría `'general'`). Keyear directo por la VerticalKey elegida (afecta D-07 auto-hide canchas).
- **Hardcodear placeholders en cada componente:** viola la fuente única; usar `RUBRO_PLACEHOLDERS`.
- **Dejar CHECK constraint implícito:** `vertical` NO tiene CHECK en el baseline (L184); NO agregar uno en esta fase (fuera de scope y arriesga romper filas legacy).

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|-------------|------------------|---------|
| Resolver el vertical de un negocio | Lógica ad-hoc en la UI | `resolveVertical(business)` (`verticals.ts:163`) | Ya prefiere `vertical`, cae a `type` legacy — cero regresión garantizada |
| Mapear `type` legacy → vertical en el backfill | Un parser nuevo | CASE SQL que replica `VERTICALS[*].types` + `LEGACY_TYPE_VERTICAL` | El mapping es plano string→key; SQL lo expresa 1:1 |
| Label del rubro para el fallback de booking | String literal por rubro en cada client | `getVerticalLabel()` (reusa `resolveVertical().label`) | Un solo lugar; el rename de belleza se propaga solo |
| Placeholder por rubro | Ternario/switch en cada Input | `RUBRO_PLACEHOLDERS[vertical]` | Fuente única declarativa; ambas superficies idénticas |

**Key insight:** El modelo de datos ya está preparado (columna `vertical` con default + `resolveVertical` con precedencia correcta). El 80% del riesgo se neutraliza reusando `resolveVertical` en lugar de escribir cualquier resolución nueva.

## Runtime State Inventory

> Fase de rework de datos/UI con una data migration (backfill de `vertical`). Inventario explícito:

| Categoría | Items encontrados | Acción requerida |
|-----------|-------------------|------------------|
| **Stored data** | `businesses.vertical` (text DEFAULT 'general', baseline L184, sin CHECK) y `businesses.type` (text nullable, baseline L165). Filas existentes pueden tener `vertical` NULL si se crearon antes de que el default/insert lo setearan. | **Data migration (047):** `UPDATE businesses SET vertical = CASE ... END WHERE vertical IS NULL`. `type` NO se toca (D-08). |
| **Live service config** | Ninguna. El vertical no vive en n8n/Datadog/UI externa — es una columna Postgres. | Ninguna. |
| **OS-registered state** | Ninguna. No hay tareas/procesos que embeban el rubro. | Ninguna. |
| **Secrets/env vars** | Ninguna. El rubro no es secreto ni env var. | Ninguna. |
| **Build artifacts** | Ninguno. `lib/verticals.ts` es TS compilado por Next; vaciar los `types` no deja artefactos stale (no hay egg-info/binarios). | Ninguna. |

**Nada en categorías Live/OS/Secrets/Build:** verificado por grep — el rubro/vertical solo vive en la columna `businesses` y en `lib/verticals.ts`. La única "runtime state cache" es la fila de Postgres, cubierta por la migración 047.

## Common Pitfalls

### Pitfall 1: Filas con `vertical` NULL tras vaciar los `types`
**What goes wrong:** Si se vacían `VERTICALS[*].types` **antes** del backfill, una fila con `vertical=NULL` y `type='Peluquería'` cae por `getVertical(type)` → `getVerticalKeyByType` recorre arrays vacíos → `LEGACY_TYPE_VERTICAL['Peluquería']` no existe → **`'general'`** (fallback), perdiendo su vertical real (belleza).
**Why it happens:** Orden incorrecto entre la migración de datos y el cambio de código.
**How to avoid:** **Orden estricto:** (1) migración 047 backfillea `vertical` en prod → (2) recién ahí se despliega el código con los `types` vacíos. Como la app queda desplegada con ambos a la vez, el backfill debe correr **antes o durante** el deploy coordinado. La red de seguridad: el CASE del backfill usa los strings literales (no depende del código), así que aunque el código nuevo ya esté, la fila queda con `vertical` correcto en DB.
**Warning signs:** Un negocio existente cuyo menú/terminología cambia a "General" tras el deploy.

### Pitfall 2: Auto-hide de canchas dejando de funcionar (regresión Phase 2 D-03)
**What goes wrong:** El onboarding oculta el paso Profesionales cuando `getVerticalKeyByType(type) === 'canchas'` (`page.tsx:380`). Con `type` ahora texto libre, `getVerticalKeyByType('Canchas de fútbol libre')` → arrays vacíos → `'general'` → el paso Profesionales **reaparece** en canchas.
**Why it happens:** El auto-hide keyea por `type` en vez de por la VerticalKey elegida.
**How to avoid:** Cambiar `page.tsx:380` (y `page.tsx:293`, `487`, `493`) para keyear por la nueva state `vertical` (VerticalKey elegida) en vez de `getVerticalKeyByType(type)`. Ídem en settings `settings-client.tsx:246` (init del grupo pasa a leer `business.vertical` directo).
**Warning signs:** En canchas el wizard vuelve a mostrar 4 pasos.

### Pitfall 3: Solo se arregla un booking client
**What goes wrong:** Se agrega el fallback en `booking-client.tsx:401` pero no en `canchas-booking-client.tsx:331` (o viceversa), dejando el vertical canchas sin subtítulo de categoría cuando `type` está vacío.
**Why it happens:** El display de categoría está duplicado en dos archivos (líneas casi idénticas).
**How to avoid:** Aplicar el fallback `{(business.type || getVerticalLabel(business)) && <p>…{business.type || getVerticalLabel(business)}</p>}` en **ambos**: `booking-client.tsx:401` y `canchas-booking-client.tsx:331`. (Como `getVerticalLabel` siempre devuelve algo, el guard se puede simplificar a mostrar siempre el subtítulo.)
**Warning signs:** El booking de una cancha sin `type` no muestra categoría; el genérico sí.

### Pitfall 4: `settings-client.tsx` — código huérfano tras el rework
**What goes wrong:** Al reemplazar el selector viejo quedan helpers/estado sin uso (`OTRO_TYPE` L28, `predefinedTypes` L30, `typeIsOtro` L248, `typeSelectValue` L249, `onTypeChange` L251-264, `initTypeGroup` L244-247) → warnings de ESLint / código muerto.
**Why it happens:** El selector viejo tiene bastante andamiaje de "grupo + Otro".
**How to avoid:** Al reemplazar, remover todo el andamiaje del toggle "Otro". El nuevo estado es solo `vertical: VerticalKey` (init `business.vertical ?? 'general'`) + `type: string` (el `bizForm.type` que ya existe). `saveBusiness` (L266-288) ya escribe `type` y `vertical` — el `vertical = typeGroup` (L278) pasa a `vertical = <state vertical>`.
**Warning signs:** `npm run lint` marca variables sin usar.

## Code Examples

### Backfill migration 047 (SQL puro, aditiva, no destructiva)
```sql
-- Source: mapping derivado de lib/verticals.ts:43,67,88,106 (VERTICALS[*].types)
--         + lib/verticals.ts:129-135 (LEGACY_TYPE_VERTICAL)
-- Migración 047 — backfill de businesses.vertical desde type ANTES de vaciar los `types`.
-- Aditiva: solo escribe `vertical` donde falta; NO toca `type`. Aislada por fila (sin cross-tenant).
-- Aplicar a prod A MANO, coordinada con el deploy del código que vacía los `types`.

UPDATE public.businesses
SET vertical = CASE type
  -- salud (VERTICALS.salud.types + legacy salud)
  WHEN 'Médico' THEN 'salud'
  WHEN 'Psicólogo' THEN 'salud'
  WHEN 'Kinesiólogo' THEN 'salud'
  WHEN 'Odontólogo' THEN 'salud'
  WHEN 'Nutricionista' THEN 'salud'
  WHEN 'Centro médico' THEN 'salud'
  WHEN 'Psicología' THEN 'salud'
  WHEN 'Odontología' THEN 'salud'
  WHEN 'Kinesiología' THEN 'salud'
  -- belleza (VERTICALS.belleza.types + legacy 'Estética')
  WHEN 'Peluquería' THEN 'belleza'
  WHEN 'Barbería' THEN 'belleza'
  WHEN 'Centro de estética' THEN 'belleza'
  WHEN 'Manicura' THEN 'belleza'
  WHEN 'Spa' THEN 'belleza'
  WHEN 'Estética' THEN 'belleza'
  -- canchas (VERTICALS.canchas.types)
  WHEN 'Cancha de fútbol' THEN 'canchas'
  WHEN 'Cancha de pádel' THEN 'canchas'
  WHEN 'Cancha de tenis' THEN 'canchas'
  WHEN 'Cancha de básquet' THEN 'canchas'
  -- general (VERTICALS.general.types) + cualquier otro / 'Otro' / texto libre / NULL
  ELSE 'general'
END
WHERE vertical IS NULL;
```
Notas de derivación:
- El `ELSE 'general'` cubre exactamente los `VERTICALS.general.types` (`Estudio de tatuajes`, `Entrenador personal`, `Clases particulares`, `Lavadero de autos`, `Veterinaria`, `Taller mecánico`, `Estudio de fotografía`), el `'Otro'` de cada grupo, cualquier texto libre viejo, y `type IS NULL` → todos resuelven a `'general'`, idéntico al fallback de `getVerticalKeyByType` (`verticals.ts:146`). **Correcto por diseño.**
- `WHERE vertical IS NULL` evita pisar filas que ya tienen `vertical` seteado (onboarding/settings ya lo escriben — `page.tsx:293`, `settings-client.tsx:278`). Si se quisiera re-derivar por seguridad total podría omitirse el WHERE, pero eso **pisaría** verticales elegidos manualmente en settings → **mantener el `WHERE vertical IS NULL`**.
- Post-condición: **ninguna fila queda con `vertical` NULL** (el CASE es total: todo cae en `ELSE 'general'`). Verificable con `SELECT count(*) FROM businesses WHERE vertical IS NULL;` → debe dar 0.

### Verificación local antes de prod
```powershell
# Windows/PowerShell. Valida que la migración aplica limpio sobre el baseline v0.13.
supabase db reset      # replaya baseline + 040..047; falla si el SQL rompe
npm run test           # opcional: si se agrega test unitario del mapping
```

### Test unitario opcional del mapping (defensa contra drift)
```typescript
// Source: patrón de test/*.test.ts (Vitest). getVerticalKeyByType es puro → fácil de testear.
import { getVerticalKeyByType } from '@/lib/verticals'
// Congela el contrato de mapping ANTES de vaciar los types (documenta el CASE de la migración 047).
expect(getVerticalKeyByType('Peluquería')).toBe('belleza')   // ⚠ dará 'general' DESPUÉS de vaciar types
```
⚠ **Advertencia sobre este test:** una vez vaciados los `VERTICALS[*].types` (D-08), `getVerticalKeyByType('Peluquería')` devolverá `'general'` (los arrays quedan vacíos, y 'Peluquería' no está en `LEGACY_TYPE_VERTICAL`). El test que valide el mapping granular **solo tiene sentido ANTES** del vaciado, o debe testear únicamente los strings de `LEGACY_TYPE_VERTICAL` (que se conservan) + los 4 VerticalKey. El valor real del test es congelar el **CASE de la migración**, no el código post-vaciado.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `type` = subtipo granular que resuelve el vertical vía `getVerticalKeyByType` | `vertical` = fuente de resolución; `type` = texto libre de display | Esta fase (D-07) | `type` deja de ser semántico para el sistema; pasa a puro label público |
| Selector de subtipos anidados (`TYPE_GROUPS` grupo+items) + toggle "Otro" | 4 rubros planos + campo libre siempre visible | Esta fase (D-01/D-09) | Onboarding y settings unificados; se elimina el bug del "Otro" |
| `getVerticalKeyByType(type)` para todo (auto-hide, hints) | Keyear por la VerticalKey elegida directa | Esta fase (D-07) | El auto-hide de canchas y los hints leen `vertical`, no derivan de `type` |

**Deprecated/outdated tras esta fase:**
- `ALL_BUSINESS_TYPES` (`verticals.ts:185`): **código muerto ya hoy** (cero importadores) → borrar.
- `VERTICALS[*].types` (arrays de subtipos): vaciar (D-08). `getVerticalKeyByType` y `LEGACY_TYPE_VERTICAL` **se conservan** como fallback para filas sin `vertical`, pero su cobertura se reduce a los strings de `LEGACY_TYPE_VERTICAL` + los 4 VerticalKey (tras el backfill ninguna fila real depende de ellos).
- Andamiaje "Otro" en settings (`OTRO_TYPE`, `predefinedTypes`, `typeIsOtro`, `typeSelectValue`, `onTypeChange`): remover.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Shape recomendado de `RUBRO_PLACEHOLDERS` (Record) y `getVerticalLabel` (reusa `resolveVertical`) | Code Examples / Pattern 1 | Bajo — el planner ajusta la firma; la fuente de datos (VERTICALS/resolveVertical) es verificada |
| A2 | El universo de filas con `vertical IS NULL` en prod es mínimo (casi sin data — Phase 2 CONTEXT D-01) | Backfill migration | Bajo — el backfill es total (CASE con ELSE); cubre cualquier volumen |
| A3 | El guard `{business.type && …}` se puede simplificar a "mostrar siempre" porque `getVerticalLabel` nunca devuelve vacío | Pitfall 3 | Bajo — verificado: `resolveVertical().label` siempre existe para los 4 VerticalKey |

**Nota:** No hay assumptions sobre package legitimacy, compliance, retención o seguridad — esta fase no toca esas áreas. Los mappings `type→vertical` del backfill están **verificados** (`[VERIFIED: lib/verticals.ts:43,67,88,106,129-135]`), no asumidos.

## Open Questions

1. **¿Re-derivar `vertical` con `WHERE vertical IS NULL` o sin WHERE?**
   - Lo que sabemos: onboarding/settings ya escriben `vertical`; algunas filas pueden tener un `vertical` elegido manualmente distinto del que derivaría el `type`.
   - Lo que no está claro: si existe alguna fila con `vertical` seteado "mal" que convenga corregir.
   - Recomendación: **usar `WHERE vertical IS NULL`** (no pisar elecciones manuales). Riesgo prácticamente nulo dado que casi no hay data.

2. **¿Borrar `ALL_BUSINESS_TYPES` en esta fase o dejarlo?**
   - Lo que sabemos: es código muerto (cero importadores, grep confirmado).
   - Recomendación: **borrarlo** junto con los `types` (D-08). No hay sugerencia de IA que preservar — el comentario `verticals.ts:184` describe una feature que nunca se construyó.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (local) | Validar migración 047 con `db reset` | ✓ (configurado, MEMORY: infra-testing-roadmap) | — | Aplicar a mano en prod (patrón vigente) |
| Vitest | Test opcional del mapping | ✓ | `^4.1.9` | — |
| Node/npm | Build + lint | ✓ | — | — |

**Sin dependencias faltantes.** El único "external" es aplicar la migración a prod, que es un paso manual coordinado (constraint del proyecto, no una herramienta).

## Security Domain

> `security_enforcement: true` (config.json). Riesgo real de esta fase: **BAJO-MEDIO (regresión, no aislamiento)** — CONTEXT §domain lo confirma.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No se toca auth |
| V3 Session Management | no | No se toca sesión |
| V4 Access Control | sí (leve) | El update de `businesses` en settings/onboarding sigue con `.eq('id', business.id)` del owner autenticado (RLS por `business_id` vigente). El backfill 047 es un `UPDATE` global admin-side (service-role vía migración), aislado por fila — no expone datos cross-tenant. |
| V5 Input Validation | sí | El texto libre de `type` es **input de usuario que se renderiza público** en booking. React escapa por defecto (JSX `{business.type}`) → sin XSS. NO usar `dangerouslySetInnerHTML`. |
| V6 Cryptography | no | Sin cripto |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS vía texto libre `type` mostrado en `/[slug]` booking | Tampering / Info disclosure | Render con JSX interpolado (auto-escape de React). Ya es el patrón vigente (`booking-client.tsx:401`). NO introducir `dangerouslySetInnerHTML`. Opcional: `type.trim()` + límite de longitud al guardar. |
| Cambio de `vertical` de otro tenant | Elevation / Tampering | El update está scoped a `business.id` del owner (RLS). El selector solo edita el negocio propio — patrón vigente, sin cambio. |
| Backfill pisa data de tenants equivocados | Tampering | El `UPDATE ... WHERE vertical IS NULL` opera por fila sobre la columna derivada del propio `type` de cada fila — no cruza tenants. Aditivo. |

**Nota de seguridad:** el `type` libre expuesto en booking es **data pública ya acotada** (el booking ya muestra `business.type` hoy). No se abre ninguna superficie nueva. La única recomendación defensiva es validar/trimear el texto libre al guardar (longitud razonable) para evitar layout-breaking o payloads largos, pero no es un requisito de aislamiento.

## Sources

### Primary (HIGH confidence)
- `lib/verticals.ts:1-186` — `VerticalKey`, `VERTICALS` (labels+types), `getVerticalKeyByType`, `resolveVertical` (prefiere `vertical`), `TYPE_GROUPS`, `ALL_BUSINESS_TYPES`, `LEGACY_TYPE_VERTICAL`.
- `app/(onboarding)/onboarding/page.tsx:16,286-303,380-382,467-498` — Select actual (`TYPE_GROUPS`), insert de `type`+`vertical`, auto-hide canchas, hints por vertical.
- `app/(dashboard)/settings/settings-client.tsx:25,28-30,242-288,1084-1119` — andamiaje "Otro" (`OTRO_TYPE`, `predefinedTypes`, `typeIsOtro`, `onTypeChange`), `saveBusiness` (escribe `type`+`vertical`), Select actual.
- `app/[slug]/booking-client.tsx:401` y `app/[slug]/canchas-booking-client.tsx:331` — ambos muestran `{business.type && <p>…}` como categoría (los dos necesitan el fallback D-03).
- `supabase/migrations/00000000000000_baseline.sql:165,184` — `businesses.type text` (nullable), `businesses.vertical text DEFAULT 'general'` (sin CHECK).
- `supabase/migrations/` — última migración `046_drop_business_hours.sql` → **próxima = 047**.
- `lib/types.ts:6-7` — `Business.type: string | null`, `Business.vertical?: string | null`.
- Grep de todo el repo: `ALL_BUSINESS_TYPES` → **1 archivo (solo su definición)**, cero importadores → código muerto.
- `lib/use-terminology.tsx`, `lib/agent-context.ts`, `components/dashboard/sidebar.tsx:83`, `lib/landing/derive.ts:25` — readers verificados: ninguno lee `type` como subtipo semántico (terminology sale del vertical resuelto; sidebar/booking muestran `type` como display; landing `derive.ts:25` es `section.type`, no `business.type`; agent-context no toca type/vertical).
- `.planning/config.json` — `nyquist_validation: false` (skip Validation Architecture), `security_enforcement: true`.

### Secondary (MEDIUM confidence)
- Ninguna — todo se verificó directo contra el código, sin fuentes web.

### Tertiary (LOW confidence)
- Ninguna.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sin paquetes nuevos; todo verificado en el repo.
- Backfill/migración: HIGH — mapping derivado 1:1 de `verticals.ts`; columna y número de migración verificados en baseline y filesystem.
- Callers/regresión: HIGH — grep exhaustivo de `getVerticalKeyByType`/`resolveVertical`/`ALL_BUSINESS_TYPES`/`.type`/`.vertical`; cada reader inspeccionado.
- UI: HIGH — líneas exactas de los dos Select y los dos booking clients localizadas.

**Research date:** 2026-07-04
**Valid until:** 2026-08-03 (30 días — código estable; el único vector de invalidación es que otra sesión toque `lib/verticals.ts` o el esquema de `businesses`).
