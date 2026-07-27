# Phase 11: Cierre de backlog - Research

**Researched:** 2026-07-27
**Domain:** Pulido de UI + un setting de negocio (Next.js 16 App Router + Supabase RLS multi-tenant). NO toca el motor de reservas.
**Confidence:** HIGH (todo anclado en el código real leído; cero teoría genérica)

## Summary

Fase de pulido: 5 ítems chicos e independientes, ninguno toca `book_slot_atomic` ni el contrato de disponibilidad. Cuatro son de UI/copy puro (POLISH-01, POLISH-02, POLISH-03, EXTRA-A) y uno agrega un setting de negocio con migración (EXTRA-B). Cada recomendación está anclada a archivo+línea y a la construcción actual.

Hallazgos que cambian el planeamiento respecto a lo que dice el CONTEXT:
1. **POLISH-02 NO es la regla `exhaustive-deps`.** El `npm run lint` real tira un **ERROR** (no warning) de la regla nueva **`react-hooks/set-state-in-effect`** en `clients-client.tsx:497`. El `// eslint-disable-line` que ya está en `:508` silencia OTRA regla (`exhaustive-deps`), no ésta. La forma idiomática mínima es el **patrón `key`** para resetear el sub-form al cambiar de cliente, eliminando el efecto entero.
2. **EXTRA-B: cambiar solo el `useState` inicial de `selectedPro` (línea 50) es INERTE.** El paso 2 del booking siempre exige un tap (cada tarjeta llama `setStep(3)`), así que el valor inicial no cambia comportamiento observable hoy. Para que "any vs choose" sea un feature real hay que decidir DÓNDE se manifiesta la preselección (orden/prominencia de la tarjeta "Cualquiera" en el paso 2). Lo dejo como decisión de diseño ASSUMED para que el planner/discuss la cierre — ver Assumptions Log A1.
3. **EXTRA-A: `deleteProfessional` (`settings-client.tsx:573`) NO captura el error** — es un `delete` fire-and-forget con borrado optimista de la lista. Si el profesional tiene turnos (FK 23503) el borrado falla en la DB pero la UI lo saca igual. Le falta el manejo del 23503 que sí tienen `deleteService`/`deleteLocation`.
4. **POLISH-03: las 2 pantallas ya coinciden en el borde** (`border-l-4` + `borderLeftColor: accent`, idénticas). El único diverge entre gemelas es el color de texto del logo-fallback (`text-white` vs `accentText`), que está FUERA del scope de POLISH-03 (D-03).

**Primary recommendation:** Ejecutar los 4 ítems de UI/copy tal cual (anclados abajo), y para EXTRA-B tratar la migración 061 + wiring como lo mecánico y la semántica de "preselección" como una micro-decisión de diseño a confirmar antes de codear el paso 2.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| POLISH-01 chip por estado | Browser / Client (`abonos-client.tsx`) | — | Presentación pura sobre `status` que ya llega en el payload |
| POLISH-02 quitar set-state-in-effect | Browser / Client (`clients-client.tsx`) | — | Refactor de render de un client component; sin red ni DB |
| POLISH-03 borde gemelas | Browser / Client (2 cancel-clients) | — | Solo verificación de consistencia visual |
| EXTRA-A copy de toasts | Browser / Client (`settings-client`, `canchas-manager`) | — | Solo strings; el FK 23503 (DB) ya protege el historial |
| EXTRA-B default del selector | Database (migr. 061) + Frontend Server (`[slug]/page.tsx`) + Client (`booking-client.tsx`) | Panel (`settings-client.tsx`) | Columna nueva en `businesses` que viaja server-side hasta el booking + toggle en Ajustes |

## Standard Stack

No se agrega ninguna dependencia. Todo se resuelve con lo ya instalado:

| Pieza | Ubicación | Uso en esta fase |
|-------|-----------|------------------|
| `Badge` (shadcn/cva) | `components/ui/badge.tsx` | Chip de estado POLISH-01 (variants `destructive`/`secondary`) |
| Tokens semánticos CSS | `app/globals.css` (`--destructive`, `--warning`, `--crm-success`) | Color del chip sin hex sueltos |
| `react-hooks` (eslint-plugin) | via `eslint-config-next` 16.2.7 | Regla `set-state-in-effect` (POLISH-02) |
| Cliente browser Supabase | `lib/supabase/client.ts` | Persistir el setting EXTRA-B (`businesses.update`) |
| Migración SQL numerada | `supabase/migrations/061_*.sql` | Columna `public_selector_default` |
| `.impeccable` hook | `.impeccable/`, `app/[slug]/.impeccable/` | Finding `side-tab` (POLISH-03) |

**Instalación:** ninguna. `npm install` no se toca.

## Package Legitimacy Audit

No aplica: esta fase no instala ningún paquete externo. (Sección requerida solo cuando hay instalaciones.)

---

## POLISH-02 — `set-state-in-effect` en `clients-client.tsx`

### El error real (verificado con `npx eslint`)

`npm run lint` sobre `app/(dashboard)/clients/clients-client.tsx` tira **1 error + 1 warning**:

```
497:5  error  Calling setState synchronously within an effect can trigger cascading renders
              Avoid calling setState() directly within an effect   react-hooks/set-state-in-effect
 24:50 warning 'TrendingUp' is defined but never used              @typescript-eslint/no-unused-vars
```
`[VERIFIED: npx eslint local]`

- La regla es **`react-hooks/set-state-in-effect`** (severidad **error**, no warning), incorporada en el `eslint-plugin-react-hooks` que trae `eslint-config-next@16.2.7`. NO es `exhaustive-deps`.
- El `// eslint-disable-line` que ya vive en `clients-client.tsx:508` silencia `exhaustive-deps` (dep faltante `selected`), **no** silencia `set-state-in-effect`. Por eso el error sigue apareciendo.
- Hay un warning extra de `TrendingUp` sin usar (`:24`). No es POLISH-02, pero conviene sacarlo en el mismo plan para dejar el archivo 100% limpio (verificable: `npx eslint` sin salida).

### El efecto ofensor (código real, `:494-508`)

```tsx
const selected = clients.find(c => c.id === selectedId) ?? null   // :467 — DERIVADO en render
...
useEffect(() => {
  if (!selected) return
  setNotes(selected.notes || '')          // :497 ← el error
  setEditMode(false)
  setHistoryExpanded(false)
  setEditForm({ name: selected.name, phone: selected.phone || '', email: ..., insurance_name: ..., insurance_number: ..., preferences: ... })
}, [selectedId]) // eslint-disable-line   // :508
```

Qué hace: al cambiar `selectedId`, resetea el sub-form de edición del cliente (notes, editForm) y colapsa editMode/historyExpanded. Estados involucrados: `notes` (`:192`), `editMode` (`:190`), `historyExpanded` (`:198`), `editForm` (`:191`). El `editForm` se edita después con `setEditForm(f => ...)` en `:861-873`; `notes` se autoguarda con debounce en `handleNotesChange` (`:511-519`).

### Recomendación mínima: patrón `key` (remount) — HIGH

React recomienda, para "resetear estado cuando cambia una prop/selección", **cambiar el `key` del subárbol** en vez de sincronizar con un efecto (https://react.dev/reference/react/useState#resetting-state-with-a-key). `[CITED: react.dev]`

Extraer el panel de detalle/edición a un subcomponente (ej. `<ClientDetail client={selected} ... />`) y montarlo con `key={selectedId}`:

```tsx
{selected && (
  <ClientDetail
    key={selected.id}          // ← al cambiar de cliente, React remonta ⇒ estados vuelven a su init
    client={selected}
    isSalud={isSalud}
    isBelleza={isBelleza}
    ...
  />
)}
```

Dentro de `ClientDetail`, los `useState` se inicializan de `client` (`useState(() => client.notes || '')`, `useState(false)` para editMode/historyExpanded, `useState(() => ({ name: client.name, ... }))`), y el `useEffect` + su `eslint-disable-line` **se borran**. Al cambiar `selectedId` el remount por `key` reproduce EXACTO el reset actual, sin set-state-in-effect y sin renders en cascada. Es el patrón idiomático y el que menos lógica nueva agrega.

**Alternativa considerada (derivar en render):** no encaja bien acá porque `notes`/`editForm` son estado **editable** (el usuario tipea encima), no derivado puro — derivar en render rompería la edición. El patrón `key` es el correcto para "estado editable que debe resetearse al cambiar de entidad".

**Alternativa considerada (mover a handler):** llamar el reset dentro del `onClick` que setea `selectedId` en la lista de clientes. Funciona pero hay que cubrir TODOS los puntos que cambian `selectedId` (lista + merge + import) y es más frágil ante nuevos callers. `key` centraliza el reset en un solo lugar.

**Verificable:** `npx eslint "app/(dashboard)/clients/clients-client.tsx"` sin errores + Clientes se comporta idéntico (búsqueda `:186`, filtros `:187-189`, alta `:214-215`, edición `:521-540`, autosave de notes `:511-519`, sin renders en cascada).

---

## EXTRA-B — Default del selector público configurable por negocio

### Estado actual del selector (código real)

`app/[slug]/booking-client.tsx`:
- **`:50`** — `const [selectedPro, setSelectedPro] = useState<Professional | null | 'none'>('none')`. Arranca en `'none'`.
- **`:121-130`** — `capaces` = profesionales que saben el servicio (`professionalsForService`); `showAny = capaces.length >= 2` (gate D-02 de Phase 10); `isAny = selectedPro === 'none' && showAny`.
- **`:502-536`** — Paso 2 "¿Con quién querés atenderte?": si `showAny`, tarjeta **"Cualquiera / El primero disponible"** arriba de la lista; si `capaces.length === 0`, tarjeta "Sin preferencia" (fallback sentinel); después la lista de `capaces`. **Cada tarjeta llama `setStep(3)` en su `onClick`** (`:509`, `:525`, `:540`).
- **`:470`** — Paso 1 → siempre `setStep(2)`. El paso 2 nunca se auto-saltea.
- **`:349-350`** — al reservar: `professionalId: isAny ? null : proId`, `anyProfessional: isAny`. El server/RPC 058 es la autoridad de a quién le toca (D-08 intacto).

`app/[slug]/page.tsx`:
- **`:63`** — el `.select('id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, landing_config, max_advance_days, max_advance_date')` sobre `businesses` — acá se agrega la columna nueva.
- **`:153-161`** — `<BookingClient business={business as unknown as PublicBusiness} ... />`. El `business` completo ya viaja como prop; la columna nueva llega gratis una vez que está en el `select` y en el tipo `PublicBusiness`.

### ⚠ Hallazgo clave: la migración es mecánica, la semántica NO

Cambiar `:50` a `useState(business.public_selector_default === 'choose' ? null : 'none')` **no cambia nada observable**, porque el paso 2 siempre exige tap. `null` y `'none'` producen el mismo paso 2 (ninguna tarjeta tiene estado "seleccionada"; todas solo avanzan). Para que "any preseleccionado vs elegí" sea un feature real hay que decidir **dónde se manifiesta la preselección**. Opciones (todas preservan D-06=any igual a hoy y D-02/gate intacto):

- **Opción A (recomendada, mínima y coherente con D-06/D-07):** el setting controla el **orden/prominencia** de la tarjeta "Cualquiera" en el paso 2. `'any'` → tal cual hoy (Cualquiera primero, byte-idéntico ⇒ cero cambio para quien no toca el setting, D-06). `'choose'` → la tarjeta "Cualquiera" se muestra **después** de la lista de `capaces` (o con menor prominencia), de modo que el cliente ve primero a las personas; "Cualquiera" sigue disponible con ≥2 capaces (D-07). Wiring: condicionar el orden del bloque `:507-519` vs `:537-553` por `business.public_selector_default`. `selectedPro` inicial: `'none'` para any, `null` para choose (por consistencia semántica, aunque el efecto visible lo da el orden).
- **Opción B:** `'any'` auto-saltea el paso 2 (Cualquiera preseleccionado ⇒ directo a paso 3); `'choose'` muestra el paso 2. **Descartada:** rompe D-06 (hoy `'any'` SÍ muestra el paso 2 con la tarjeta Cualquiera; auto-saltear sería un cambio de comportamiento para los negocios actuales).
- **Opción C:** agregar estado visual "seleccionado" (ring) a la tarjeta Cualquiera cuando `'any'`. **Descartada:** hoy no existe ese estilo en el paso 2; agregarlo también cambia lo que ve un negocio 'any' actual (viola D-06).

→ **A** es la única que deja `'any'` idéntico a hoy. Queda como decisión de diseño a confirmar (Assumptions Log A1); el resto del wiring es determinista.

### Migración 061 (idempotente, a mano)

Última migración en el repo = `060_public_professionals_exclude_canchas.sql`; última en prod = **060** → la próxima es **061**. (Nota: `STATE.md` menciona "próxima 057", está desactualizado respecto al directorio real.)

Molde: las columnas de settings de `businesses` (`require_deposit` bool DEFAULT false `:436`, `default_slot_duration` int DEFAULT 60 `:441`, `max_advance_days` int DEFAULT 30 `:460`, `abono_window_weeks` int DEFAULT 8 + CHECK `:462-463`). Un default de booking encaja como **columna de primera clase** (D-05), no como blob.

```sql
-- 061_public_selector_default.sql
-- EXTRA-B (Phase 11): default del paso "Profesional" de la reserva pública, por negocio.
-- 'any'    = "Cualquiera" es el default (comportamiento de Phase 10 D-01) ← DEFAULT, cero regresión.
-- 'choose' = sin preselección; "Cualquiera" sigue disponible con ≥2 capaces (D-02/D-07).
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS public_selector_default text NOT NULL DEFAULT 'any';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_public_selector_default_chk'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_public_selector_default_chk
      CHECK (public_selector_default IN ('any', 'choose'));
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
```
`[VERIFIED: supabase/schema.sql businesses table]` para el molde de columnas.

- `NOT NULL DEFAULT 'any'` ⇒ todas las filas existentes y nuevas nacen en `'any'` (D-06, cero cambio de comportamiento). `[CITED: patrón de require_deposit/max_advance_days en schema.sql]`
- CHECK envuelto en `DO $$ ... pg_constraint` para que sea **idempotente** (re-correr no falla). Espeja el estilo de constraint de `abono_window_weeks` (`schema.sql:463`).
- Validación local: `npx supabase db reset` (replay 001→061 en PG17 local) y confirmar columna + CHECK en `\d businesses`. Aplicación a prod = **A MANO**, coordinada con deploy, + `NOTIFY pgrst, 'reload schema'`. NUNCA por GSD.
- `schema.sql` se edita **quirúrgicamente** (agregar la columna + el CONSTRAINT en el bloque `businesses`), no por dump (el CLI reordena el archivo — nota histórica STATE 06).

### Superficie pública: no exponer de más

La columna es un flag de presentación del propio negocio, no dato sensible. Viaja por el `select` de `page.tsx:63` (server-side, con el cliente público que ya resuelve el tenant por slug) y llega como parte de `business` a `BookingClient`. **No** toca `public_professionals`/`public_professional_services` ni el contrato `{ ok, busy, full }` de availability (D-08). Agregar `public_selector_default` al string del `.select()` (`:63`) y al tipo `PublicBusiness` (`lib/types.ts`) — es todo lo que hace falta para el wiring de lectura.

### Toggle en el panel (Ajustes/Negocio)

Patrón de persistencia de un setting de business (verificado): `supabase.from('businesses').update({ ... }).eq('id', business.id)` con el cliente browser anon+RLS (owner-only por RLS). Ejemplos reales: `require_deposit` (`settings-client.tsx:865`, checkbox en `:1752-1756`), `abono_window_weeks` (`abonos-client.tsx:232`), theme/palette/font (`:230-247`).

Recomendación: control de dos opciones (radio/segmented, porque es enum `'any'|'choose'`) en la sección de **reservas/seña** de `settings-client.tsx`, junto al bloque `require_deposit` (`:1750-1756`) que es el molde más cercano de un toggle de booking. Persistir con `supabase.from('businesses').update({ public_selector_default: value }).eq('id', business.id)` + `toast`. La sección exacta → planner (D-05), pero anclada a ese bloque. Copy sugerido: *"Cuando reservan, ¿preseleccionar 'Cualquiera'?"* — "Sí (recomendado)" = `any` / "No, que elijan un profesional" = `choose`.

---

## POLISH-01 — Chip por estado en Archivados de Abonos

### Estado actual (código real)

`app/(dashboard)/abonos/abonos-client.tsx`:
- **`:35`** — `status: 'active' | 'cancelled' | 'completed'` en `AbonoRow`.
- **`:22`** — `import { Badge } from '@/components/ui/badge'` ya está importado.
- **`:280`** — tab `'archivados'`; **`:298-339`** — el `.map` que rinde cada serie. Hoy cada `<li>` muestra un `<Badge variant="secondary">` con el conteo de turnos (`:327-330`) y, si hay salteadas, un `<Badge variant="destructive">` (`:331-333`). **No hay chip que distinga cancelada de completada** — de ahí que se vean idénticas (POLISH-01).
- **`:92-96`** — `isAbonoActivo`: `'completed'` es flag del **motor de generación** (la serie terminó de generar), no un estado de negocio. El chip "Completado" se muestra igual, pero **no re-interpretar** esa lógica (D-01).

### Patrón a espejar + recomendación

El `Badge` (`components/ui/badge.tsx:11-22`) tiene variants `default/secondary/destructive/outline/ghost/link` — **no hay variant `success`**. Tokens semánticos disponibles: `--destructive` (`globals.css:89/130`), `--warning` (ámbar), `--crm-success` (= `var(--chart-4)`, verde, pero namespaced a CRM).

Hay un patrón hermano ya en el repo: `StatusBadge` en `appointments-client.tsx:56-62` que rinde exactamente "Cancelado"/"Completado" — **pero usa clases Tailwind hardcodeadas** (`bg-red-500/20 text-red-400`, `bg-blue-500/20 text-blue-400`, `:26-32`), que NO son la paleta semántica que pide D-01 ("no hex sueltos"). Por eso **no** conviene copiar ese molde acá.

Recomendación (HIGH), reusando `Badge` + tokens semánticos:
- **Cancelado** → `<Badge variant="destructive">Cancelado</Badge>` — el variant `destructive` es exactamente el "muted/destructive suave" que pide D-01 (`bg-destructive/10 text-destructive`, `:15-16`), token semántico, cero hex.
- **Completado** → `<Badge variant="secondary">Completado</Badge>` — "neutral", token semántico (`bg-secondary text-secondary-foreground`, `:13-14`). D-01 acepta "success/neutral"; `secondary` es la opción mínima que no introduce un verde que no es token de primera clase en el dashboard. (Si el planner/UI prefiere el verde, usar `style={{ color: 'var(--crm-success)' }}` como hace el CRM, pero es más scope.)

Wiring: en el `.map` (`:298-339`), agregar el chip de estado en el bloque `flex flex-col items-end` (`:322-334`), junto al Badge de conteo. Puede mostrarse solo en `tab === 'archivados'` (donde viven cancelled+completed) o incondicional por `status`; el CONTEXT lo pide para Archivados (SC1). Es aditivo — no toca `isAbonoActivo` ni la semántica del `status`.

**Verificable:** visual (se distingue cancelada de completada sin abrir el detalle). Sin cambio de comportamiento; las suites de abonos siguen verdes.

---

## POLISH-03 — Borde lateral acentuado de las 2 pantallas de cancelación

### Comparación (código real)

- `app/cancelar/[token]/cancel-client.tsx:85` — `<div className="rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5" style={{ borderLeftColor: accent }}>`
- `app/abono/cancelar/[token]/abono-cancel-client.tsx:136` — `<div className="rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5" style={{ borderLeftColor: accent }}>`

**Son idénticas en el borde** (`rounded-md border border-border border-l-4 p-4 ... borderLeftColor: accent`). POLISH-03 = confirmar consistencia (D-03): **ya coinciden entre sí y con el patrón app-wide** (booking/confirmación/cancelación usan el mismo `border-l-4` + accent). No hay nada que cambiar en el borde.

### Divergencia detectada (FUERA de scope POLISH-03)

Las gemelas difieren en el **logo-fallback**, no en el borde:
- `cancel-client.tsx:74` — `style={{ backgroundColor: accent }}` + clase `text-white` (color de texto hardcodeado).
- `abono-cancel-client.tsx:125` — `style={{ backgroundColor: accent, color: accentText }}` (color derivado por luminancia WCAG, IN-05 de Phase 07).

Esto es un tema de **contraste**, no del borde. D-03 acota POLISH-03 al borde y ordena **NO tocar** el endurecimiento/contraste de esas pantallas públicas. → Documentar como observación; **no** arreglar bajo POLISH-03 (si se quisiera unificar el `accentText` en la pantalla de turno, es un ítem aparte, no esta fase).

### Aceptar el finding `side-tab` sin aflojar nada

El hook de diseño (`.impeccable/hook.cache.json`) emite findings `side-tab:<línea>` para el `border-l-4` acentuado (verificado: el mismo finding aparece p.ej. en `lib/email.ts`). D-03: **aceptar como intencional** (es el patrón de marca app-wide), documentarlo, y si hace falta acallar el hook usar la vía **reviewable acotada** de impeccable a esos 2 archivos — **NO** un `disable` a lo bruto ni cambiar el diseño.

Mecánica: el hook guarda estado en `.impeccable/` (root) y `app/[slug]/.impeccable/` (`hook.cache.json`, findings por archivo/línea). La aceptación se hace por la vía de config de la skill `impeccable` (invocarla acotada a `app/cancelar/[token]/cancel-client.tsx` y `app/abono/cancelar/[token]/abono-cancel-client.tsx`), registrando el finding `side-tab` como intencional con la justificación de marca. No editar reglas globales de eslint ni borrar el borde. El planner debe delegar el "cómo exacto" a la skill impeccable en modo reviewable sobre esos 2 paths.

### No aflojar el endurecimiento público (verificado que NO se toca)

Ninguno de los retoques de POLISH-03 toca: 404 genérico, token no adivinable, número informado por el servidor, `noindex`, ni el contraste por luminancia. La pantalla de abono deriva `accentText` server-side (IN-05); el flujo de cancelación pega a `/api/cancel/${token}` (`cancel-client.tsx:36`) sin exponer datos antes de validar el token. POLISH-03 es solo verificación visual del borde → cero superficie de seguridad tocada.

---

## EXTRA-A — Copy de los toasts de borrado bloqueado (FK 23503)

### Las 3 strings actuales (verificadas)

| Ubicación | String actual | Maneja 23503 |
|-----------|---------------|--------------|
| `settings-client.tsx:403` (servicio) | `'No se puede eliminar: el servicio tiene turnos asociados. Desactivalo en vez de borrarlo.'` | Sí (`:402`) |
| `settings-client.tsx:738` (sede) | `` `No se puede eliminar: el ${locWord} tiene turnos asociados. Desactivalo en vez de borrarlo.` `` | Sí (`:737`) |
| `components/dashboard/canchas-manager.tsx:181` (cancha) | `'No se puede eliminar: la cancha tiene turnos asociados. Desactivala en su lugar.'` | Sí (vía `res.error === 'has_appointments'`, `:180`) |

### ⚠ `deleteProfessional` (`settings-client.tsx:573`) NO maneja el 23503

```tsx
async function deleteProfessional(id: string) {
  await supabase.from('professionals').delete().eq('id', id).eq('business_id', business.id)  // ← sin capturar error
  setProfessionals(prev => prev.filter(p => p.id !== id))   // ← borrado optimista igual falle el FK
  setAgendaSpaces(prev => prev.filter(a => a.professional_id !== id))
  toast.success('Profesional eliminado')                    // ← miente si el FK bloqueó
}
```

Diferencia con `deleteService`/`deleteLocation`: esos capturan `const { error }` y ramifican por `error.code === '23503'`. `deleteProfessional` es fire-and-forget: si el profesional tiene turnos, el `DELETE` falla en la DB (FK) pero la UI lo saca de la lista y muestra "eliminado". D-04 pide **revisarlo**: conviene alinearlo al patrón (capturar error, ramificar 23503, no mutar el estado si falló). Nota: puede haber más de un FK sobre `professionals` (turnos, `professional_services` migr.057 con CASCADE, `agenda_spaces` con CASCADE) — el que bloquea es el de `appointments` (sin CASCADE); mantener el mensaje genérico "tiene turnos asociados".

### Copy recomendado (solo copy, D-04)

Aplicar a los 3 (servicio/sede/cancha) + `deleteProfessional`, adaptando el sustantivo (`el servicio` / `el ${locWord}` / `la cancha` / `el profesional`) y el género de "Desactivalo/Desactivala". Texto de referencia del CONTEXT (ajustable):

> *"No se puede eliminar: tiene turnos asociados, incluidos pasados y cancelados (cancelar no los borra). Desactivalo para dejar de ofrecerlo y conservar el historial, o borrá esos turnos primero."*

NO cambiar el comportamiento: el FK 23503 protege el historial de Finanzas; el soft-disable (`toggleService`/`toggleLocation`, `active`/`is_active`) es la vía correcta y ya existe. Solo se mejora el copy + se le agrega a `deleteProfessional` el manejo que le falta.

---

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Chip de estado (POLISH-01) | Un `<span>` con clases de color ad-hoc | `Badge variant="destructive"/"secondary"` | Ya existe, tokens semánticos, cero hex (D-01) |
| Reset de form al cambiar cliente (POLISH-02) | Otro `useEffect` con setState | Patrón `key={selectedId}` (remount) | Idiomático React, sin cascading renders |
| Persistir el setting (EXTRA-B) | Endpoint/route nuevo | `supabase.from('businesses').update().eq('id', business.id)` (browser, RLS) | Patrón ya usado por require_deposit/abono_window_weeks |
| Silenciar `side-tab` (POLISH-03) | `eslint-disable` global / borrar el borde | Config reviewable de impeccable acotada a los 2 archivos | D-03: aceptar como intencional sin aflojar diseño ni seguridad |
| Aislamiento del setting público | Abrir tabla puente a anon | Columna en `businesses`, ya viaja por el select público del slug | No agrega superficie; D-08 intacto |

**Key insight:** los 5 ítems se resuelven reusando patrones existentes del repo; el único artefacto nuevo es la columna 061. Nada toca `book_slot_atomic`, `createAppointmentCore`, ni el contrato de disponibilidad (D-08).

## Common Pitfalls

### Pitfall 1: creer que POLISH-02 es `exhaustive-deps`
**Qué sale mal:** agregar `selected` a las deps o tocar el `eslint-disable-line` de `:508` — no apaga el error real.
**Por qué:** el error es `react-hooks/set-state-in-effect` (`:497`), regla distinta. **Cómo evitar:** eliminar el efecto con el patrón `key`, no manipular deps. **Señal temprana:** `npx eslint` sigue mostrando `set-state-in-effect` después del cambio.

### Pitfall 2: EXTRA-B "listo" solo con la migración + `useState` inicial
**Qué sale mal:** se cablea la columna y el `useState(...)`, pero el usuario no ve ninguna diferencia entre 'any' y 'choose'.
**Por qué:** el paso 2 siempre exige tap; el valor inicial es inerte. **Cómo evitar:** cerrar la semántica de preselección (Opción A: orden/prominencia de la tarjeta Cualquiera) antes de codear. **Señal temprana:** en QA, 'choose' y 'any' rinden el paso 2 idéntico.

### Pitfall 3: tocar una pantalla de cancelación sin la gemela
**Qué sale mal:** las 2 divergen (regresión clásica del workstream). **Cómo evitar:** POLISH-03 las trata juntas; hoy el borde ya coincide, así que la acción es *verificar*, no editar. **Señal temprana:** diff que toca solo uno de los 2 archivos.

### Pitfall 4: unificar `text-white`/`accentText` bajo POLISH-03
**Qué sale mal:** se cambia el contraste del logo-fallback creyendo que es "consistencia". **Por qué:** D-03 acota POLISH-03 al borde y prohíbe tocar el endurecimiento/contraste. **Cómo evitar:** dejarlo como observación fuera de scope.

## Runtime State Inventory

> Fase mayormente greenfield-de-UI + 1 columna. Igual se audita por EXTRA-B (migración).

| Categoría | Ítems | Acción |
|-----------|-------|--------|
| Stored data | `businesses.public_selector_default` (nueva, migr. 061). Filas existentes ← `DEFAULT 'any'` automático. | Migración a mano en prod + `NOTIFY pgrst`. Sin backfill manual (el DEFAULT cubre). |
| Live service config | Ninguna. El setting no toca crons, webhooks ni servicios externos. | None — verificado (EXTRA-B es presentación, D-08). |
| OS-registered state | None — no hay tasks/procesos con estado. | None. |
| Secrets/env vars | None — no se agregan secrets ni env vars. | None. |
| Build artifacts | `schema.sql` regenerado quirúrgicamente tras la 061. | Editar el bloque `businesses` a mano (no dump). |

## Code Examples

Todos los ejemplos anclados arriba (patrón `key` POLISH-02, migración 061 EXTRA-B, chip POLISH-01, copy EXTRA-A). No se agregan patrones de fuentes externas — es código propio del repo.

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto |
|---------------|----------------|---------------|---------|
| setState-en-useEffect para sincronizar estado con una selección | Derivar en render / patrón `key` para resetear | React 18/19 + `react-hooks/set-state-in-effect` (error en eslint-config-next 16) | POLISH-02: el efecto de `:495` ahora es error de lint, no estilo |

**Deprecado/obsoleto:** el `useEffect` de reset (`clients-client.tsx:495-508`) — reemplazar por remount con `key`.

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|-------|---------|--------------------|
| A1 | EXTRA-B se manifiesta como **orden/prominencia de la tarjeta "Cualquiera" en el paso 2** (Opción A); solo cambiar el `useState` inicial es inerte | EXTRA-B | Si el usuario esperaba auto-saltear el paso 2 (Opción B) el feature no cumple; cerrar en discuss/plan antes de codear |
| A2 | "Completado" usa `Badge variant="secondary"` (neutral) en vez de un verde | POLISH-01 | Bajo: D-01 acepta "success/neutral"; si quieren verde, cambio de 1 línea (`var(--crm-success)`) |
| A3 | El FK que bloquea `deleteProfessional` es el de `appointments` (sin CASCADE); `professional_services`/`agenda_spaces` caen por CASCADE | EXTRA-A | Bajo: el mensaje genérico "tiene turnos asociados" es correcto igual; verificable en `db reset` local |

## Open Questions (RESOLVED)

1. **Semántica exacta de la preselección EXTRA-B (A1).**
   - Qué sabemos: `'any'` debe quedar idéntico a hoy (D-06); `'choose'` = sin preselección con "Cualquiera" disponible (D-07); no toca el motor (D-08).
   - Qué falta: dónde se ve el cambio (orden de la tarjeta vs auto-saltear vs highlight).
   - **RESOLVED:** Opción A (orden/prominencia de la tarjeta "Cualquiera"), confirmada por el usuario y lockeada en CONTEXT D-05. `'any'` → tarjeta arriba (byte-idéntico); `'choose'` → debajo de la lista, sin ocultarla. Implementado por 11-04 (helper puro `anyCardPlacement`).

2. **`deleteProfessional`: ¿alinear el 23503 en esta fase o solo el copy?**
   - Qué sabemos: hoy no captura el error (bug latente: "eliminado" mentiroso).
   - **RESOLVED:** SÍ se incluye el fix (mismo patrón de `deleteService`) además de los 3 copys — CONTEXT D-04. Implementado por 11-02 Task 2.

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|-------------|---------------|-----------|---------|----------|
| Supabase CLI local | Validar migr. 061 (`db reset`) | ✓ (baseline replayable, STATE) | PG17 local | — |
| eslint (`npm run lint`) | POLISH-02 | ✓ | eslint 9 + eslint-config-next 16.2.7 | — |
| vitest | Regresión abonos/booking | ✓ | `vitest.config.mts` | — |
| Skill `impeccable` | Aceptar finding `side-tab` (POLISH-03) | ✓ | `.impeccable/` presente | Comentario documentado in-code |

**Sin dependencias faltantes.** Todo el toolchain necesario ya está en el repo.

## Validation Architecture

### Test Framework
| Propiedad | Valor |
|-----------|-------|
| Framework | vitest (`"test": "vitest run"`), config `vitest.config.mts` |
| Quick run | `npx eslint "app/(dashboard)/clients/clients-client.tsx"` (POLISH-02) |
| Full suite | `npm test` (regresión) + `npx supabase db reset` (migr. 061) |

### Requisitos → Test Map
| Req | Comportamiento | Tipo | Comando / método | ¿Existe? |
|-----|----------------|------|------------------|----------|
| POLISH-02 | lint limpio, Clientes idéntico | lint + manual | `npx eslint <archivo>` ⇒ sin errores | ✅ (regla ya activa) |
| POLISH-01 | chip distingue cancelada/completada | visual | Abrir tab Archivados | manual |
| POLISH-03 | 2 pantallas coinciden en el borde | visual + estático | diff de las 2 clases (ya coinciden) | ✅ |
| EXTRA-A | copy correcto en los 4 borrados | visual | Intentar borrar con turnos ⇒ toast nuevo | manual |
| EXTRA-B (DB) | default `'any'` en todas las filas | DB | `db reset` + `SELECT public_selector_default` ⇒ `'any'` | ❌ Wave 0 (agregar aserción) |
| EXTRA-B (UI) | 'any' preserva Phase 10; 'choose' no preselecciona | unit | Extraer `initialSelectedPro(setting)` puro y testearlo | ❌ Wave 0 (no hay component-test harness) |

### Sampling
- **Por task:** `npx eslint` sobre el archivo tocado (POLISH-02) / `npm test` para los que tocan booking.
- **Merge de wave:** `npm test` completo verde + `db reset` limpio (061).
- **Gate de fase:** suite verde + lint limpio antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] EXTRA-B: como el setting no toca el RPC/route (D-08) y NO hay infra de component-testing (los tests son DB/route level: `booking-cualquiera-public.test.ts`, `staff-services.test.ts`), la parte UI ('choose' no preselecciona) se valida **manualmente** salvo que el planner **extraiga una función pura** `initialSelectedPro(setting): 'none' | null` (o el resolver de orden del paso 2) → unit test barato sin DOM. Recomendado para tener aserción automática.
- [ ] EXTRA-B: aserción DB de que un tenant recién seedeado lee `public_selector_default === 'any'` (encaja en `helpers/booking-fixtures`, patrón `booking-cualquiera-public.test.ts`).
- [ ] Resto (POLISH-01/03, EXTRA-A): sin tests nuevos; son visuales/copy y las suites existentes de abonos/booking actúan de guarda de regresión.

## Security Domain

> `security_enforcement` activo. Fase de bajo riesgo (UI + 1 columna de presentación), pero se audita porque toca una pantalla pública y una migración.

### Categorías ASVS aplicables

| ASVS | Aplica | Control estándar |
|------|--------|------------------|
| V4 Access Control | sí | La escritura del setting EXTRA-B usa browser client + RLS owner-only (`.eq('id', business.id)`), patrón de require_deposit; ningún negocio escribe el setting de otro |
| V5 Input Validation | sí | CHECK `IN ('any','choose')` en la 061 blinda el enum en la DB; el toggle solo emite esos 2 valores |
| V6 Cryptography | no | No se toca token/cripto (POLISH-03 no altera el token de cancelación) |
| V1 Architecture (tenant isolation) | sí | La columna viaja por el select público del slug (server-side, tenant resuelto por slug); no abre tablas puente a anon; D-08 mantiene el contrato de disponibilidad |

### Amenazas del stack

| Patrón | STRIDE | Mitigación |
|--------|--------|------------|
| Setting escrito cross-tenant | Elevation/Tampering | RLS WITH CHECK por owner + `.eq('id', business.id)` (patrón existente) |
| Valor de enum inválido en `public_selector_default` | Tampering | CHECK constraint en migr. 061 (fail-closed a nivel DB) |
| Aflojar el endurecimiento de las pantallas públicas de cancelación | Info Disclosure | POLISH-03 NO toca 404 genérico/token/número del servidor/noindex/contraste (D-03) — verificado que es solo el borde |

## Sources

### Primary (HIGH confidence)
- Código real leído: `clients-client.tsx`, `abonos-client.tsx`, `booking-client.tsx`, `[slug]/page.tsx`, `cancel-client.tsx`, `abono-cancel-client.tsx`, `settings-client.tsx`, `canchas-manager.tsx`, `badge.tsx`, `appointments-client.tsx`, `schema.sql`, `eslint.config.mjs`, `.impeccable/hook.cache.json`, `supabase/migrations/` (hasta 060).
- `npx eslint` sobre `clients-client.tsx` — regla `react-hooks/set-state-in-effect` confirmada como error.
- react.dev — "Resetting state with a key" (patrón POLISH-02).

### Secondary (MEDIUM)
- CONTEXT.md D-01..D-08, REQUIREMENTS.md (POLISH-01/02/03), STATE.md.

## Metadata

**Confidence breakdown:**
- POLISH-02: HIGH — error de lint reproducido en vivo; patrón `key` es doctrina React.
- POLISH-01: HIGH — Badge + tokens verificados; patrón hermano (StatusBadge) leído.
- POLISH-03: HIGH — clases de las 2 pantallas comparadas byte a byte; finding `side-tab` visto en la cache real.
- EXTRA-A: HIGH — 3 strings + `deleteProfessional` leídos; gap del 23503 confirmado.
- EXTRA-B: HIGH en la mecánica (migración/wiring anclados) / MEDIUM en la semántica de preselección (A1, decisión de diseño abierta).

**Research date:** 2026-07-27
**Valid until:** ~30 días (fase estable; el único movimiento posible es el número de migración si otra fase mete una antes de la 061).
