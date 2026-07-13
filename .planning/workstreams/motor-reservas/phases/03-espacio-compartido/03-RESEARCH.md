# Phase 3: Espacio Compartido - Research

**Researched:** 2026-06-29
**Domain:** Postgres concurrency (advisory locks + EXCLUDE/unique constraints) extended from per-bucket anti-overlap to per-physical-space anti-overlap, on a multi-tenant Supabase + Next.js 16 booking core.
**Confidence:** HIGH (todo el mecanismo está anclado en código del repo leído este sesión; cero dependencia nueva)

## Summary

Esta fase NO introduce librerías ni patrones nuevos: extiende el mecanismo atómico exacto que la Phase 2 ya entregó en `book_slot_atomic` (migr. 041, `SECURITY DEFINER` + `pg_advisory_xact_lock`) desde "anti-sobrecupo por slot+bucket" hacia "anti-solape por conjunto de espacios físicos". El modelo de datos es una tabla `spaces` (espacios físicos por negocio) + una tabla puente `agenda_spaces` (mapea cada agenda — fila de `professionals` — a sus espacios). La agenda sigue siendo el bucket existente (`COALESCE(professional_id, sentinel)`), así que NO se re-migra `capacity` ni se toca el modelo de bucket (D-02).

El corazón técnico: el RPC atómico debe, además del count-vs-capacity que ya hace, resolver vía la puente el conjunto de espacios que ocupa la agenda reservada, tomar un advisory lock por CADA `space_id` en **orden ascendente estable** (evita deadlock), y rechazar si existe CUALQUIER turno solapado en tiempo en CUALQUIER agenda que comparta uno de esos espacios. El re-check JS en `booking-core.ts` se extiende en paralelo (solo UX), y `/api/booking/availability` resuelve el bloqueo acoplado bidireccional sin exponer detalle interno (D-06). El respaldo de integridad de DB recomendado es una **tabla de proyección desnormalizada turno×espacio con su propio EXCLUDE gist** (un EXCLUDE sobre `appointments` NO puede ver la puente per-row), poblada por trigger desde el insert atómico.

**Primary recommendation:** Migración `042_spaces_and_coupled_exclusion.sql`: tablas `spaces` + `agenda_spaces` (RLS + policies por op WITH CHECK por tenant) + tabla de proyección `appointment_spaces` con EXCLUDE gist por `(space_id, tsrange)` poblada por trigger AFTER INSERT/DELETE en `appointments`. Extender `book_slot_atomic` in-place (no RPC nuevo) con lock por conjunto de espacios ordenado + chequeo anti-solape multi-bucket. Reusar `slot_taken` (no agregar `space_taken`). CONC-03 = test concurrente molde CONC-01.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Tabla `spaces` (espacios físicos por negocio) + tabla puente agenda↔espacio. Ambas son datos de tenant: RLS habilitada + policies por operación con `with check (business_id = ...)` + filtro por `business_id`. Descarta el modelo de "relaciones de exclusión explícitas entre agendas" (N² pares, no escala).
- **D-02:** Reusar `professionals` como eje de la agenda. Cada cancha y la F11 = una fila en `professionals`. El bucket de booking ya se keya por `COALESCE(professional_id, sentinel)`. Cero modelo nuevo de bucket. Mapeo ancla: predio=`business`; canchas A/B/C + F11 = 4 filas en `professionals`; espacios A/B/C = 3 filas en `spaces`; puente: cruzada A→{A}, B→{B}, C→{C}, F11→{A,B,C}.
- **D-03:** Capacity 1 + duración variable → conflicto por SOLAPE de tiempo (no por count de slot exacto). Extiende la lógica del EXCLUDE 013 a nivel de espacio físico. CONC-03 = test anti-solape concurrente.
- **D-04:** UI dentro del editor de agenda/settings existente (`settings-client.tsx` / `agenda-client.tsx`). NO pantalla nueva dedicada.
- **D-05:** Término genérico mínimo del eje de agenda ("Recurso/Cancha") — label-only, sin `VerticalKey` nuevo. "Cancha de fútbol" ya es un `type` del vertical `general`; el término debe resolverse para ese caso sin romper otros verticales.

### Claude's Discretion (LOCKED como atómico por roadmap/STATE)
- **Mecanismo atómico anti-conflicto-de-espacio:** chequeo atómico deliberado, NUNCA `count`/select suelto sin lock. Advisory lock por **conjunto de espacios** en **orden estable** (ej. space_id ordenado) para evitar deadlocks. Forma exacta (extender vs RPC nuevo, lock por espacio vs hash del set, join a la puente dentro del RPC `SECURITY DEFINER`) = discreción research/planner. La garantía real vive en la DB; el re-check JS es solo UX.
- **Auto-conflicto F11:** la reserva F11 ocupa {A,B,C} pero es UNA fila; el chequeo no debe contar la propia fila como 3 conflictos consigo misma.
- **Disponibilidad acoplada:** `/api/booking/availability` refleja el bloqueo cruzado bidireccional, manteniendo D-06 de Phase 2 (público ve libre/ocupado, no detalle interno).
- **Constraint a nivel de espacio:** evaluar EXCLUDE gist sobre proyección turno×espacio como respaldo además del advisory lock. Discreción; LOCKED solo que el respaldo NO puede ser un `count` suelto.
- **Migración:** aditiva, post-baseline, underscore, siguiente tras `041_…` (= `042_…`), RLS + policies por op WITH CHECK, sin exponer mapeo/ocupación viva a `anon` más allá de D-06. Validar `supabase db reset` local (PG17) antes de prod; prod a mano + `NOTIFY pgrst, 'reload schema';`.
- **Reúso del core:** chequeo de espacio + insert en el mismo punto atómico que reusan booking público (service-role) y alta manual (Phase 1).
- **Validación de entrada y errores:** mismo estilo defensivo; código de conflicto de espacio (reusar `slot_taken` o `space_taken`) = discreción. Forma `{ ok, error }` snake_case.

### Deferred Ideas (OUT OF SCOPE)
- Vertical "canchas/deportes" completo (nuevo `VerticalKey` con menú/types/copy propios).
- Entidad `resource`/`agenda` genérica separada de `professionals`.
- Modelo de "exclusión explícita entre agendas" (pares sin entidad espacio).
- Constraint DB de respaldo a nivel espacio (si no se implementa, queda como hardening futuro — el mínimo es el chequeo atómico con lock). **Nota de research: ver Pitfall 6 — se RECOMIENDA implementarlo en esta fase porque es barato y es el único backstop real; sin él, un bug en el lock = sobre-reserva de espacio silenciosa.**
- GCAL-GROUP-01, WAIT-01, CANCEL-REOPEN-01 (v2).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ESPACIO-01 | Modelar agendas como recursos con espacio(s) físico(s) asociado(s) | Migración `042`: tablas `spaces` + puente `agenda_spaces` (§Standard Stack / Migración). UI en `settings-client.tsx` (D-04). Tipos `Space` + mapeo en `lib/types.ts`. |
| ESPACIO-02 | Exclusión acoplada bidireccional (F11↔3 cruzadas) | Chequeo anti-solape multi-bucket en `book_slot_atomic` (write path) + disponibilidad acoplada en `/api/booking/availability` (read path). Ambos sentidos caen de resolver "qué agendas comparten un espacio del set" simétricamente (Pattern 2 + Pattern 4). |
| ESPACIO-03 | Chequeo "¿todos los espacios libres?" + insert atómico | Extensión de `book_slot_atomic`: advisory lock por conjunto de espacios ordenado + chequeo de solape + insert, todo en una transacción `SECURITY DEFINER` (Pattern 1). Backstop EXCLUDE gist sobre proyección (Pattern 3). |
| CONC-03 | Test anti-conflicto-de-espacio concurrente | Extender `test/concurrency.test.ts` con molde CONC-01: dos altas en paralelo sobre agendas que comparten espacio → exactamente 1 ok + 1 rechazo; verificación independiente del estado de la DB (§Validation / CONC-03). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Modelo de espacios + mapeo agenda↔espacio | Database / Storage | API (RLS-enforced read) | Datos de tenant con aislamiento por `business_id`; RLS es la red de seguridad. |
| Exclusión acoplada atómica (write) | Database (`book_slot_atomic` SECURITY DEFINER) | — | La garantía de concurrencia SOLO es correcta dentro de una transacción Postgres con advisory lock; JS no puede darla (TOCTOU). |
| Anti-tampering tenant + re-check UX | API / Backend (`booking-core.ts`) | Database | El core re-valida entidades por `business_id` antes del RPC; el re-check de espacio es UX, no autoridad. |
| Disponibilidad acoplada (read) | API / Backend (`/api/booking/availability`) | Database | Service-role resuelve espacios + solapes y colapsa a libre/ocupado (D-06); nunca expone el detalle. |
| Config de espacios (alta + mapeo) | Frontend Server (`settings/page.tsx`) + Client (`settings-client.tsx`) | Database | Patrón existente: page.tsx carga por `business_id`, client edita. |
| Terminología "Recurso/Cancha" | Frontend (lib/verticals + use-terminology) | — | Label-only, resuelto por vertical/type; cero impacto en datos. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL (vía Supabase) | 17 (local) / prod gestionado | EXCLUDE gist + `pg_advisory_xact_lock` + `tsrange` + `btree_gist` | Ya es la autoridad de integridad del repo (011/013/041); cero dependencia nueva. [VERIFIED: repo — migr. 041 usa `pg_advisory_xact_lock`/`gist`] |
| `@supabase/supabase-js` | ^2.106.2 | Cliente JS para `.rpc('book_slot_atomic', …)` y queries de disponibilidad | Ya en uso por el core. [VERIFIED: package.json] |
| Vitest | ^4.1.9 | Suite de concurrencia (CONC-03) contra Supabase local | Ya instalado; `npm run test` = `vitest run`. [VERIFIED: package.json scripts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.4.3 | (Opcional) validación del form de alta/mapeo de espacios en el client | Si el plan agrega validación de formulario tipo `react-hook-form` para el editor de espacios. [VERIFIED: package.json] |
| `vaul` / shadcn `@/components/ui` | ^1.1.2 / ^4.10.0 | Drawer/panel del editor de espacios (mismo lenguaje visual que el roster de Phase 2) | UI de mapeo agenda→espacios dentro de settings (D-04). [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extender `book_slot_atomic` in-place | RPC nuevo `book_space_slot_atomic` | Un RPC nuevo duplica el count-vs-capacity y el insert; el core tendría que decidir cuál llamar (¿el negocio tiene espacios?) → branch frágil. **Recomendado: extender in-place** — el RPC ya recibe `p_business_id`+`p_professional_id`; agrega el chequeo de espacios condicionado a "si la agenda tiene filas en la puente". Un negocio sin espacios mapeados pasa por el mismo código sin overhead (la subconsulta a la puente devuelve 0 filas → sin lock de espacio, sin chequeo). Cero regresión cupos/individual. |
| Backstop = EXCLUDE gist sobre proyección turno×espacio | Solo advisory lock (sin backstop DB) | Sin backstop, un bug en la derivación del lock = sobre-reserva silenciosa de espacio (peor que sobrecupo: el constraint 013 no aplica cross-bucket). El backstop es barato. **Recomendado: implementar el backstop** (Pitfall 6). |
| Lock por cada `space_id` ordenado | Lock por hash del set completo de espacios | Un solo lock por el set entero (hash de `{A,B,C}`) NO serializa contra una reserva que pelea solo `{B}`: hashes distintos → no comparten lock → carrera. **Recomendado: lock por espacio individual en orden ascendente** (Pitfall 2). |

**Installation:** Ninguna. Esta fase NO agrega paquetes npm. Todo el mecanismo es SQL (migración `042`) + extensión de TS existente.

**Version verification:** No aplica — no se instalan paquetes. `btree_gist` (necesario para combinar `business_id`/`space_id` con `=` y `tsrange` con `&&` en un EXCLUDE) YA está habilitado en el repo: el EXCLUDE 013 del baseline lo usa. [VERIFIED: repo — baseline.sql:649 usa `EXCLUDE USING gist (business_id WITH =, … tsrange … WITH &&)`].

## Package Legitimacy Audit

> No aplica: esta fase no instala paquetes externos. El stack (Postgres, supabase-js, Vitest, zod, vaul, shadcn) ya está presente y verificado en `package.json`. Verdict global: N/A — sin instalaciones.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                  ┌─────────────────────────────────────────────────────┐
   PÚBLICO        │  app/api/booking/create  (service-role, tenant=slug) │
   (anon) ───────▶│  app/api/appointments/create (anon+RLS, tenant=owner)│
   ADMIN          └───────────────────────────┬─────────────────────────┘
   (sesión)                                    │  ambos callers
                                               ▼
                          ┌──────────────────────────────────────────┐
                          │  lib/booking-core.ts  createAppointmentCore│
                          │  · anti-tampering service/pro/loc por biz  │
                          │  · re-check solape (bucket) [UX]           │
                          │  · re-check ESPACIO (nuevo) [UX]  ◀── NEW   │
                          │  · libera holds vencidos                   │
                          └───────────────────┬────────────────────────┘
                                              │ .rpc()
                                              ▼
                    ┌────────────────────────────────────────────────────┐
                    │  book_slot_atomic  (SECURITY DEFINER, 1 transacción) │
                    │  1. lock slot+bucket (existente)                     │
                    │  2. resolver espacios de la agenda vía agenda_spaces │ ◀── NEW
                    │  3. lock por CADA space_id en orden ASC (anti-dead)  │ ◀── NEW
                    │  4. count vs capacity (existente, cupos)             │
                    │  5. ¿algún turno SOLAPADO en agenda hermana que      │ ◀── NEW
                    │     comparta un espacio del set?  → RAISE space_taken│
                    │  6. INSERT appointment (seat/is_group)               │
                    │       └─ trigger → INSERT N filas appointment_spaces │ ◀── NEW
                    │          (backstop EXCLUDE gist por space_id×tsrange)│
                    └────────────────────────────────────────────────────┘
                                              │
   PÚBLICO  ──────▶  app/api/booking/availability  (service-role)
   (read)            · resuelve espacios de la agenda consultada           ◀── NEW
                     · busca solapes en agendas hermanas (comparten espacio)◀── NEW
                     · colapsa a busy/full (D-06: libre/ocupado, sin detalle)

   tablas tenant:  spaces (A,B,C)   agenda_spaces (professional_id ↔ space_id)
                   appointment_spaces (proyección turno×espacio, backstop)
```

### Recommended Project Structure
```
supabase/migrations/
└── 042_spaces_and_coupled_exclusion.sql   # spaces + agenda_spaces + appointment_spaces
                                            # + trigger + EXCLUDE backstop
                                            # + redefinición book_slot_atomic
                                            # + RLS/policies por op WITH CHECK
lib/
├── booking-core.ts        # + re-check de espacio (UX) antes del RPC
├── types.ts               # + interface Space, AgendaSpace (mapeo)
└── verticals.ts           # + término "resource/resources" en VerticalTerminology (label-only)
app/api/booking/
└── availability/route.ts  # + bloqueo acoplado por espacio
app/(dashboard)/settings/
├── page.tsx               # + carga spaces + agenda_spaces por business_id
└── settings-client.tsx    # + UI alta de espacios + mapeo agenda→espacios (D-04)
test/
├── concurrency.test.ts    # + CONC-03 (anti-conflicto-de-espacio concurrente)
└── helpers/booking-fixtures.ts  # + seedSpace / seedAgendaSpace helpers
```

### Pattern 1: Extender `book_slot_atomic` con lock por conjunto de espacios (write path, ESPACIO-03)

**What:** Dentro de la MISMA función `SECURITY DEFINER`, después del lock slot+bucket existente, resolver el set de espacios de la agenda y tomar un advisory lock por cada uno en orden ascendente; luego chequear solape cross-bucket; luego insert.

**When to use:** Es el único punto de write atómico. Aplica a TODA reserva (público + manual). Para una agenda SIN espacios mapeados, el set es vacío → se comporta exactamente como hoy (cero overhead, cero regresión).

**Example (esqueleto SQL — sobre el cuerpo actual de migr. 041):**
```sql
-- Source: extensión de supabase/migrations/041_time_blocks_capacity_and_seat.sql (repo)
-- ... tras el PERFORM pg_advisory_xact_lock(slot+bucket) existente ...

-- (NEW) Resolver el conjunto de espacios que ocupa la agenda reservada (vía la puente).
--   p_professional_id es la agenda (cada cancha / la F11 = una fila en professionals).
--   Si la agenda no tiene espacios mapeados, este array queda vacío → sin lock ni chequeo.
DECLARE
  v_space_ids uuid[];
BEGIN
  SELECT array_agg(asp.space_id ORDER BY asp.space_id)   -- ORDEN ESTABLE (anti-deadlock, Pitfall 2)
    INTO v_space_ids
    FROM agenda_spaces asp
   WHERE asp.business_id = p_business_id
     AND asp.professional_id = p_professional_id;

  -- (NEW) Lock por CADA espacio en orden ascendente. Dos reservas que pelean subconjuntos
  -- solapados ({A,B} vs {B,C}) toman B en el mismo orden global → no se cruzan → sin deadlock.
  IF v_space_ids IS NOT NULL THEN
    FOREACH v_sid IN ARRAY v_space_ids LOOP
      PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0));
    END LOOP;

    -- (NEW) ¿Hay algún turno SOLAPADO en tiempo en CUALQUIER agenda que comparta uno de
    -- estos espacios? Se cruza appointments → agenda_spaces (por professional_id de cada turno)
    -- y se exige intersección de espacios + solape de rango. SE EXCLUYE la propia agenda
    -- reservada para no contar la F11 contra sí misma (Pitfall 4 / auto-conflicto F11).
    IF EXISTS (
      SELECT 1
        FROM appointments a
        JOIN agenda_spaces other ON other.business_id = p_business_id
                                 AND other.professional_id = COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
       WHERE a.business_id = p_business_id
         AND a.status IN ('confirmed','pending_payment')
         AND a.date = p_date
         AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
             <> COALESCE(p_professional_id, '00000000-0000-0000-0000-000000000000'::uuid)   -- excluye self
         AND other.space_id = ANY (v_space_ids)                                              -- comparte ≥1 espacio
         AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes,30)))
             && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration)) -- solape de tiempo
    ) THEN
      RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';  -- ver Error code (reusar slot_taken)
    END IF;
  END IF;

  -- ... sigue el count vs capacity + INSERT existentes (sin cambio) ...
END;
```

**Por qué el lock va ANTES del chequeo de solape:** si chequeás solape y después tomás el lock, dos reservas pueden leer "libre" antes de que ninguna inserte (TOCTOU). El lock por espacio serializa a las reservas que comparten ese espacio; recién con el lock tomado el `EXISTS` es autoritativo.

### Pattern 2: Re-check de espacio en `booking-core.ts` (UX, antes del RPC)

**What:** Replicar el chequeo de solape de espacio en JS, como rechazo temprano de UX, igual que el re-check de bucket actual. NO es la autoridad.

**When to use:** Solo para devolver `slot_taken` rápido sin entrar al RPC. La autoridad es el RPC (Pattern 1).

**Example:**
```typescript
// Source: extensión de lib/booking-core.ts (repo) — tras el re-check sameBucket existente
// Resolver espacios de la agenda reservada y de las agendas hermanas (mismo business).
// Si la agenda no tiene espacios mapeados → skip (comportamiento individual/cupos intacto).
const { data: mySpaces } = await supabase
  .from('agenda_spaces')
  .select('space_id')
  .eq('business_id', business.id)
  .eq('professional_id', proId ?? SENTINEL)   // ⚠ ver Pitfall 1: bucketización consistente
if (mySpaces && mySpaces.length > 0) {
  const spaceIds = mySpaces.map(s => s.space_id)
  // agendas hermanas que comparten ≥1 espacio (excluye la propia agenda)
  const { data: siblings } = await supabase
    .from('agenda_spaces')
    .select('professional_id')
    .eq('business_id', business.id)
    .in('space_id', spaceIds)
    .neq('professional_id', proId ?? SENTINEL)
  const siblingBuckets = new Set((siblings || []).map(s => s.professional_id))
  // ¿algún clash YA traído (mismo date) cae en una agenda hermana y solapa en tiempo?
  const spaceClash = (clashes || []).some(a =>
    siblingBuckets.has(a.professional_id ?? SENTINEL) && overlaps(a)
    && (a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)
  )
  if (spaceClash) return { ok: false, error: 'slot_taken', status: 409 }
}
```

### Pattern 3: Backstop de integridad = proyección turno×espacio + EXCLUDE gist (ESPACIO-03)

**What:** Una tabla `appointment_spaces (appointment_id, business_id, space_id, slot tsrange, status)` con UNA fila por (turno × espacio que ocupa). EXCLUDE gist garantiza que no haya dos filas con el mismo `space_id` y rangos solapados. Poblada por trigger desde `appointments`.

**Why this and NOT an EXCLUDE on `appointments`:** un EXCLUDE constraint opera sobre filas de UNA tabla y NO puede hacer join a la puente en su predicado por fila. La reserva F11 es UNA fila de `appointments` mapeada a {A,B,C} vía la puente — un gist sobre `appointments` no puede expandir esa fila a 3 espacios. La proyección desnormaliza ese fan-out: la F11 produce 3 filas en `appointment_spaces` (una por A, B, C), cada cruzada produce 1. El EXCLUDE entonces sí ve "espacio B ocupado por la F11 a las 20" vs "espacio B reservado por cruzada B a las 20" como dos filas con el mismo `space_id` y rangos solapados → choca (23P01). [VERIFIED: semántica de Postgres EXCLUDE — opera por tupla de una tabla; el repo ya usa este patrón single-table en 013]

**Example:**
```sql
-- Source: nuevo en migr. 042; molde del EXCLUDE 013 (baseline.sql:649) llevado a la proyección
CREATE TABLE public.appointment_spaces (
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  business_id    uuid NOT NULL,
  space_id       uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  slot           tsrange NOT NULL,
  PRIMARY KEY (appointment_id, space_id)
);
ALTER TABLE public.appointment_spaces ENABLE ROW LEVEL SECURITY;
-- EXCLUDE: mismo business + mismo espacio + rangos solapados ⇒ rechazo (23P01 → slot_taken).
-- status que ocupa: el trigger SOLO inserta filas para turnos confirmed/pending_payment y las
-- borra al cancelar/expirar (espejo del WHERE de 013).
ALTER TABLE public.appointment_spaces
  ADD CONSTRAINT appointment_spaces_no_overlap
  EXCLUDE USING gist (business_id WITH =, space_id WITH =, slot WITH &&);
```
El trigger AFTER INSERT en `appointments` expande la agenda a sus espacios (lookup en `agenda_spaces`) e inserta las filas de proyección; AFTER UPDATE de `status` a cancelled/expired las borra. El INSERT de la proyección dentro del MISMO statement del insert atómico hace que el EXCLUDE sea el respaldo: si el advisory lock fallara, el insert de proyección choca con 23P01 y aborta la transacción.

> **Recortabilidad (fase final del milestone):** el backstop (Pattern 3 + trigger) es el candidato natural a recortar si la fase crece. Sin él, ESPACIO-03 sigue cumplido por el advisory lock (Pattern 1) — pero se pierde la red de seguridad. Si se recorta, documentarlo como hardening futuro (ya previsto en `<deferred>`). El planner debería plantearlo como un plan separado al final para poder cortar limpio.

### Pattern 4: Disponibilidad acoplada bidireccional (read path, ESPACIO-02)

**What:** En `/api/booking/availability`, además del bucket de la agenda consultada, traer los turnos de las agendas hermanas (las que comparten ≥1 espacio con la consultada) y marcar como ocupado todo slot que solape con ellos. Bidireccional cae solo: si consulto la F11, sus hermanas son {cruzada A, B, C}; si consulto la cruzada B, su hermana incluye la F11 (ambas comparten B).

**Example:**
```typescript
// Source: extensión de app/api/booking/availability/route.ts (repo)
// Tras resolver `bucket` (agenda consultada): traer las agendas hermanas por espacio compartido.
const { data: mySpaces } = await supabase
  .from('agenda_spaces').select('space_id').eq('business_id', business.id).eq('professional_id', bucket)
let siblingBuckets: string[] = []
if (mySpaces?.length) {
  const { data: sib } = await supabase
    .from('agenda_spaces').select('professional_id')
    .eq('business_id', business.id).in('space_id', mySpaces.map(s => s.space_id))
    .neq('professional_id', bucket)
  siblingBuckets = [...new Set((sib || []).map(s => s.professional_id as string))]
}
// `appts` ya trae todos los turnos del día del negocio (sin filtrar por bucket todavía).
// Los turnos en una agenda HERMANA que solapan en tiempo bloquean el slot de la agenda consultada,
// independientemente de la capacity (la exclusión de espacio es siempre 1-a-la-vez por espacio).
// Se agregan a `busy` (no a `full`): es un bloqueo por solape, no por cupo lleno.
const siblingBusy = (appts || [])
  .filter(a => siblingBuckets.includes(a.professional_id ?? SENTINEL))
  .filter(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)
  .map(a => ({ time: a.time, status: a.status, expires_at: a.expires_at, duration_minutes: a.duration_minutes }))
// merge en busy; D-06 intacto: la respuesta sigue siendo { ok, busy, full }, sin conteo ni detalle.
```
**D-06 (no-leak):** la respuesta NO cambia de forma — sigue `{ ok, busy, full }`. El público no puede inferir QUÉ agenda hermana bloqueó el slot ni cuántos espacios hay. El test CUPOS-02 existente (que asierta `Object.keys(body).sort() === ['busy','full','ok']`) sigue verde.

### Anti-Patterns to Avoid
- **EXCLUDE gist directo sobre `appointments` con join a la puente:** imposible — un EXCLUDE no puede referenciar otra tabla por fila. Usar la proyección (Pattern 3).
- **Un solo advisory lock por hash del set completo de espacios:** no serializa contra reservas que pelean subconjuntos parciales. Lock por espacio individual ordenado (Pitfall 2).
- **`count(*) < 1` suelto como chequeo de espacio sin lock:** TOCTOU → doble reserva del mismo espacio. LOCKED en CONTEXT: nunca count suelto.
- **Mezclar `professional_id NULL` y la sentinela entre reservas/queries del mismo bucket:** rompe la bucketización (Pitfall 1). Usar siempre `COALESCE(professional_id, sentinel)` byte-idéntico.
- **Marcar el solape de espacio en `full` en vez de `busy`:** `full` significa "cupo lleno" (D-06 / cupos); el bloqueo por espacio es un solape, va en `busy` (el client lo trata como `conflict`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serialización de reservas concurrentes que pelean un espacio | Mutex en Node / flag en memoria | `pg_advisory_xact_lock` por espacio (ya en el repo) | Vercel es multi-instancia; un mutex de Node no cruza procesos. El lock de Postgres es global al cluster y se libera al fin de la transacción. [VERIFIED: comentario migr. 041:84-88] |
| Respaldo de integridad ante solape de espacio | Re-leer y comparar en app | EXCLUDE gist sobre proyección turno×espacio | El constraint DB es atómico y no bypasseable; el código app tiene ventanas de carrera. [VERIFIED: repo usa 013 EXCLUDE como backstop hoy] |
| Anti-tampering de la agenda/espacio | Confiar en el `professionalId`/spaceId del cliente | Re-validar por `business_id` en el core + RLS WITH CHECK | Patrón establecido del repo (booking-core re-valida service/pro/loc por business_id). [VERIFIED: lib/booking-core.ts:83-104] |
| Traducción de choque de constraint a error de dominio | Parsear strings de error a mano | `rpcErr.code === '23505' / '23P01'` + `message.includes(...)` | Patrón ya implementado en booking-core. [VERIFIED: lib/booking-core.ts:230-242] |

**Key insight:** TODA la integridad de concurrencia de esta fase es una extensión 1:1 de mecanismos que el repo ya usa y testea (advisory lock, EXCLUDE gist, traducción de constraint). El riesgo no está en inventar nada nuevo — está en derivar la clave del lock y el predicado de solape EXACTAMENTE consistentes entre las 4 superficies (RPC lock, RPC EXISTS, backstop EXCLUDE, availability).

## Runtime State Inventory

> Esta fase es aditiva (tablas + columnas + función nuevas), NO un rename/refactor. Aun así, hay estado que el planner debe contemplar:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Ninguna fila preexistente de espacios (tablas nuevas). Los `professionals` existentes que pasen a ser "canchas" no requieren migración de datos — siguen siendo filas normales; solo se les agrega mapeo en `agenda_spaces`. | Ninguna migración de datos. El backfill de `appointment_spaces` para turnos FUTUROS ya existentes es opcional (negocios nuevos al rubro canchas no tendrán turnos previos); si un negocio ya tuviera turnos, el trigger solo cubre inserts NUEVOS — documentar que el backstop aplica a reservas creadas tras la migración. |
| Live service config | Ninguna. No hay config externa (n8n/Datadog/etc.) que referencie espacios. | Ninguna. |
| OS-registered state | Ninguna. | Ninguna. |
| Secrets/env vars | Ninguna nueva. El RPC se ejecuta con los clientes Supabase existentes (anon+RLS y service-role). | Ninguna. |
| Build artifacts | Ninguno. `supabase/schema.sql` queda desactualizado tras aplicar `042` a prod → regenerar (patrón del repo: ver MEMORY, schema.sql se regenera tras cada migración prod). | Regenerar `schema.sql` tras aplicar `042` (paso post-deploy, igual que 037/039). |

**Nothing found in category:** Live service config, OS-registered state, Secrets — None (verificado: la fase solo toca DB + TS del repo).

## Common Pitfalls

### Pitfall 1: Bucketización inconsistente entre lock, EXISTS, backstop y availability
**What goes wrong:** Si el lock keya por `professional_id` crudo pero el `EXISTS` o el backstop usan `COALESCE(professional_id, sentinel)` (o al revés), dos reservas del mismo espacio no comparten lock → sobre-reserva.
**Why it happens:** El bucket "sin profesional" se representa con la sentinela `00000000-0000-0000-0000-000000000000`. La puente `agenda_spaces` debería keyar por `professional_id` real (las canchas SIEMPRE tienen professional_id; la sentinela es para agendas sin profesional, que normalmente no tienen espacios).
**How to avoid:** Decidir explícitamente: ¿la sentinela puede tener espacios? Recomendado NO — `agenda_spaces.professional_id` es NOT NULL FK a `professionals`. El caso ancla (canchas) siempre tiene professional_id real. Documentar que el mapeo de espacios solo aplica a agendas con profesional concreto.
**Warning signs:** Test CONC-03 flaky (a veces 2 ok); o un negocio con sentinela + espacios.

### Pitfall 2: Deadlock entre dos reservas que pelean subconjuntos de espacios
**What goes wrong:** Reserva X pelea {A,B}, reserva Y pelea {B,C}. Si X bloquea A→B y Y bloquea C→B en órdenes distintos, se cruzan: deadlock (Postgres aborta una con 40P01).
**Why it happens:** Locks tomados en orden distinto por transacciones distintas.
**How to avoid:** Tomar los locks SIEMPRE en orden ascendente de `space_id` (`ORDER BY asp.space_id` en el `array_agg`). Así ambas toman B en la misma posición del orden global → nunca cruzadas. (LOCKED en CONTEXT: "orden estable, ej. space_id ordenado".)
**Warning signs:** Errores `40P01 deadlock detected` en logs bajo carga; tests concurrentes con 3+ agendas que comparten espacios cruzados.

### Pitfall 3: Auto-conflicto de la F11 contra sí misma
**What goes wrong:** El `EXISTS` cuenta la propia fila de la F11 (o, si la F11 ya tiene la reserva en proceso, su propia proyección) como conflicto → rechaza la reserva contra sí misma.
**Why it happens:** La F11 ocupa {A,B,C}; sin excluir la propia agenda, "¿hay turno en agenda que comparta A?" se responde con la propia F11.
**How to avoid:** En el `EXISTS`, excluir `COALESCE(a.professional_id,sentinel) <> COALESCE(p_professional_id,sentinel)` (la agenda reservada). En el backstop, la proyección de la F11 entra DESPUÉS del chequeo (insert), y el EXCLUDE solo choca contra OTRAS filas (distinto appointment_id) — la propia F11 no genera 3 conflictos consigo misma porque cada uno de sus espacios aparece una sola vez.
**Warning signs:** No se puede reservar la F11 nunca; o la 2ª F11 a otra hora se rechaza incorrectamente.

### Pitfall 4: El backstop no refleja cancelaciones/expiraciones
**What goes wrong:** Un turno se cancela o su seña expira, pero su fila en `appointment_spaces` queda → el espacio sigue "ocupado" para siempre.
**Why it happens:** El EXCLUDE solo debe contar `confirmed`/`pending_payment` (espejo del WHERE de 013). La proyección no tiene el WHERE por status — debe gestionarse por trigger.
**How to avoid:** Trigger AFTER UPDATE OF status en `appointments`: si pasa a `cancelled`/expirado, DELETE de sus filas en `appointment_spaces`. El core ya libera holds vencidos (los pasa a `cancelled`) ANTES del RPC → el trigger los limpia. Alternativa más simple: incluir `status` en la proyección y condicionar el EXCLUDE — pero un EXCLUDE no tiene WHERE sobre columna mutable sin reinsertar; el DELETE por trigger es más limpio.
**Warning signs:** Slot bloqueado tras cancelar; disponibilidad muestra ocupado un horario libre.

### Pitfall 5: Disponibilidad acoplada rompe el caso cupos (grupal)
**What goes wrong:** Una agenda hermana grupal (capacity>1) con 1/N ocupado bloquea el slot de la agenda consultada por "solape", cuando la exclusión de espacio debería ser independiente del cupo.
**Why it happens:** Confundir la lógica de cupo (count vs capacity, va a `full`) con la de espacio (solape 1-a-la-vez, va a `busy`).
**How to avoid:** El bloqueo por espacio (Pattern 4) marca `busy` SIEMPRE que haya un turno hermano solapado, sin importar capacity — porque un espacio físico no se "comparte" como un cupo: si la cancha B está reservada, está reservada. Mantener separados los dos caminos: `full` (cupo, mismo bucket) y `busy` (solape, incluido el cross-bucket por espacio).
**Warning signs:** El test CUPOS-02 existente se rompe; un slot grupal parcial desaparece por el camino de espacio.

### Pitfall 6: Saltarse el backstop EXCLUDE confiando solo en el advisory lock
**What goes wrong:** Si la derivación de la clave del lock tiene un bug (ej. olvida un espacio del set), dos reservas no se serializan y ambas confirman → sobre-reserva de espacio SIN que ningún constraint la frene (el 013 es por bucket, no cross-bucket).
**Why it happens:** El advisory lock es app-logic dentro del RPC; un error de lógica no lo detecta nadie. El EXCLUDE de la proyección es declarativo y atómico.
**How to avoid:** Implementar el backstop (Pattern 3) en esta fase. Es barato (tabla + trigger + EXCLUDE) y es la ÚNICA red de seguridad real. CONTEXT lo deja como discreción pero la recomendación de research es: implementarlo (solo recortar si la fase crece demasiado, y documentar).
**Warning signs:** Confiar en que "el lock alcanza" sin un test que fuerce el camino del backstop.

## Code Examples

### Migración 042 — tablas + RLS + policies por op (estilo 040/041)
```sql
-- Source: molde de migr. 040 (INSERT WITH CHECK por tenant) + 041 (RLS hardening time_blocks)
-- 1) spaces: espacios físicos por negocio (A, B, C).
CREATE TABLE public.spaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
-- policies por operación, WITH CHECK por tenant (regla 3 de la skill supabase-multitenant-rls)
CREATE POLICY "spaces tenant select" ON public.spaces FOR SELECT
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY "spaces tenant insert" ON public.spaces FOR INSERT
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY "spaces tenant update" ON public.spaces FOR UPDATE
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
CREATE POLICY "spaces tenant delete" ON public.spaces FOR DELETE
  USING (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));

-- 2) agenda_spaces: puente professional(agenda) ↔ space. NOT NULL FKs (Pitfall 1: no sentinela).
CREATE TABLE public.agenda_spaces (
  business_id     uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  space_id        uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, space_id)
);
ALTER TABLE public.agenda_spaces ENABLE ROW LEVEL SECURITY;
-- mismas 4 policies por op (select/insert/update/delete) WITH CHECK por tenant (omitidas por brevedad).
-- ⚠ NO se da read a anon a agenda_spaces ni a spaces: el bloqueo acoplado lo computa el endpoint
--   availability con service-role (D-06). Si el client público necesitara los nombres de canchas,
--   eso lo sirve el page.tsx público con service-role, NO una policy anon sobre estas tablas.
```
**Aplicación:** `supabase db reset` local (PG17) para validar; prod a mano coordinado con el deploy + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca el schema cache); regenerar `schema.sql`. [CITED: patrón documentado en 040/041 headers + MEMORY infra-testing-roadmap]

### Terminología "Recurso/Cancha" (D-05, label-only)
```typescript
// Source: extensión de lib/verticals.ts (repo) — agregar al interface y a cada vertical
export interface VerticalTerminology {
  // ... client, appointment, service, location existentes ...
  resource: string    // eje de la agenda: salud/belleza="Profesional", canchas="Cancha"
  resources: string
}
// general.terminology gana resource:'Profesional' por defecto; el type "Cancha de fútbol"
// resuelve a "Cancha". Como el término depende del `type` (no solo del VerticalKey), la
// resolución NO puede vivir solo en VERTICALS[key] — se necesita un override por type.
```
**Decisión para el planner (no LOCKED, recomendación):** `VerticalTerminology` se resuelve hoy por `VerticalKey`, pero "Cancha de fútbol" es un `type` DENTRO de `general`. Dos opciones:
1. Override por type: un mapa `TYPE_TERMINOLOGY_OVERRIDE: Record<string, Partial<VerticalTerminology>>` con `'Cancha de fútbol': { resource:'Cancha', resources:'Canchas' }`, aplicado en `resolveVertical`/`getVertical` tras spread del vertical. **Recomendado** — mínimo, no rompe los otros verticales, label-only.
2. Default genérico `resource:'Recurso'` para `general` (sin override por type) — más simple pero el dueño de canchas ve "Recurso", no "Cancha". Peor UX.
[ASSUMED — la resolución exacta por type es discreción de planner; ninguna ruta toca datos]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Anti-doble-booking por slot exacto (índice 011) | Capacity-aware (índice 011 + seat) | Phase 2 / migr. 041 | Esta fase construye encima sin re-migrar capacity. |
| Anti-solape por bucket (EXCLUDE 013) | EXCLUDE 013 condicionado a `NOT is_group` | Phase 2 / migr. 041 | El anti-solape por bucket sigue para cupo 1; esta fase agrega el anti-solape por ESPACIO como capa adicional (no toca 013). |
| Insert directo autocommit | `book_slot_atomic` RPC | Phase 2 / migr. 041 | Único punto de write atómico; esta fase lo extiende. |

**Deprecated/outdated:**
- `.planning/codebase/TESTING.md` está DESACTUALIZADO (dice "NO hay framework de tests"). La realidad: Vitest ^4.1.9 instalado, `npm run test` = `vitest run`, suite en `test/*.test.ts` + `lib/*.test.ts` (~283-301 tests). El planner debe ignorar la afirmación de TESTING.md y usar el molde real de `test/concurrency.test.ts`. [VERIFIED: package.json + test/ dir]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La resolución del término "Cancha" por `type` (no por VerticalKey) se hace con un override por type en `resolveVertical` | Code Examples / Terminología | Bajo — label-only, no toca datos ni integridad; si el planner elige otra ruta, mismo resultado visual. |
| A2 | `agenda_spaces.professional_id` es NOT NULL (la sentinela no tiene espacios) | Migración / Pitfall 1 | Medio — si un negocio quisiera mapear espacios a la agenda "sin profesional", habría que permitir sentinela; el caso ancla (canchas) siempre tiene professional_id real, así que el riesgo es teórico. Confirmar con el dueño si existe el caso. |
| A3 | El backstop por trigger gestiona cancelaciones con DELETE de la proyección (vs WHERE por status en el EXCLUDE) | Pitfall 4 | Bajo — ambas rutas funcionan; el DELETE por trigger es más limpio en Postgres. |
| A4 | Conteo de tests ~283-301 (no leído exacto este sesión) | State of the Art | Ninguno — solo contexto; el planner corre `npm run test` para el número real. |

**Si esta tabla queda vacía:** no aplica — hay 4 assumptions, todas de bajo/medio riesgo y ninguna toca la integridad de concurrencia (que está 100% anclada en código verificado).

## Open Questions

1. **¿La sentinela (agenda "sin profesional") puede tener espacios?**
   - What we know: El caso ancla (canchas) siempre usa professional_id real (cada cancha = una fila en `professionals`).
   - What's unclear: Si algún negocio futuro querría acoplar espacios a la agenda genérica.
   - Recommendation: `agenda_spaces.professional_id` NOT NULL (A2). Si aparece el caso, es una extensión aditiva. No bloquea esta fase.

2. **¿Backstop (Pattern 3) dentro de esta fase o diferido?**
   - What we know: CONTEXT lo deja como discreción; `<deferred>` lo lista como "hardening futuro si no se implementa".
   - What's unclear: Apetito de riesgo del dueño para la fase final del milestone.
   - Recommendation: Implementarlo (Pitfall 6) — barato y único backstop real. Plan separado al final para poder recortar limpio si la fase crece. El advisory lock solo YA cumple ESPACIO-03 funcionalmente.

3. **¿El término "Cancha" se resuelve por `type` o se agrega un default genérico "Recurso" a `general`?**
   - What we know: D-05 pide label-only sin VerticalKey nuevo; "Cancha de fútbol" es un type de `general`.
   - Recommendation: Override por type (A1, opción 1). Mejor UX para el rubro canchas sin tocar otros verticales.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI local (PG17) | Validar migr. 042 con `supabase db reset` | ✓ (configurado, baseline replayable) | PG17 | — |
| Vitest | CONC-03 | ✓ | ^4.1.9 | — |
| `btree_gist` extension | EXCLUDE gist sobre `(business_id, space_id, tsrange)` | ✓ (ya usado por 013) | — | — |
| Supabase service-role + anon creds (`.env.local` / CI) | Tests de concurrencia (skipIf sin creds) | ✓ (suite ya corre) | — | Tests se skipean sin creds (molde existente) |

**Missing dependencies with no fallback:** Ninguna.
**Missing dependencies with fallback:** Tests de concurrencia se auto-skipean sin las 3 creds de Supabase (patrón `describe.skipIf(!hasSupabaseCreds)` ya en `concurrency.test.ts`).

## Security Domain

> `security_enforcement` activo (no hay `false` explícito). Aislamiento por tenant = no negociable en este proyecto.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sí | Alta manual = `supabase.auth.getUser()` → 401 sin sesión (route existente). Público = service-role tenant-por-slug. Sin cambio. |
| V3 Session Management | no | No se toca la sesión. |
| V4 Access Control | sí | RLS habilitada + policies por op WITH CHECK en `spaces`/`agenda_spaces`/`appointment_spaces` por `business_id` (owner_id=auth.uid()). El RPC `SECURITY DEFINER` re-impone `p_business_id` internamente. NO read anon a las tablas de espacios (D-06). |
| V5 Input Validation | sí | Parseo defensivo del body (molde repo) + anti-tampering: `professionalId`/`spaceId` re-validados por `business_id` antes de usarse; nunca confiar en ids del cliente. |
| V6 Cryptography | no | No aplica. |

### Known Threat Patterns for Supabase RLS + booking concurrency

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mapear/leer espacios de otro tenant (cross-tenant) | Tampering / Information Disclosure | RLS WITH CHECK por `business_id` en `spaces`/`agenda_spaces` + filtro explícito `.eq('business_id', …)` en toda query (defensa en profundidad). |
| Acoplar disponibilidad cross-tenant (reservar espacio de otro negocio) | Tampering | El RPC filtra `agenda_spaces` por `p_business_id`; el lock y el EXISTS son por business. Un `space_id` de otro negocio no aparece en el set de la agenda. |
| Sobre-reserva de espacio bajo concurrencia (TOCTOU) | Tampering | Advisory lock por espacio ordenado + EXCLUDE gist backstop (Pattern 1 + 3). NUNCA count suelto. |
| Inferir ocupación/cantidad de espacios desde el público | Information Disclosure | Respuesta de availability se mantiene `{ ok, busy, full }` sin detalle (D-06); tablas de espacios sin read anon. |
| `space_taken`/`slot_taken` que filtre qué agenda bloqueó | Information Disclosure | Error genérico `slot_taken` 409 sin payload de detalle; el público solo sabe "ocupado". |

## Sources

### Primary (HIGH confidence)
- `lib/booking-core.ts` (repo) — `createAppointmentCore`: anti-tampering, re-check, llamada al RPC, traducción de constraint.
- `supabase/migrations/041_time_blocks_capacity_and_seat.sql` (repo) — `book_slot_atomic` (advisory lock + count + insert), índice 011 capacity-aware, EXCLUDE 013 condicionado a `NOT is_group`.
- `supabase/migrations/00000000000000_baseline.sql` (repo) — `appointments_no_double_booking` (línea 797), `appointments_no_overlap` EXCLUDE gist (línea 649), `public_professionals` view (546).
- `supabase/migrations/040_appointments_clients_insert_with_check.sql` (repo) — patrón policy INSERT WITH CHECK por tenant.
- `app/api/booking/availability/route.ts` (repo) — cómo se computa busy/full, sentinela, D-06 no-leak.
- `app/api/booking/create/route.ts` + `app/api/appointments/create/route.ts` (repo) — los dos callers del core.
- `test/concurrency.test.ts` + `test/helpers/booking-fixtures.ts` (repo) — molde CONC-01/02 + fixtures (seedOneTenant, seedTimeBlock) para CONC-03.
- `lib/types.ts`, `lib/verticals.ts`, `lib/use-terminology.tsx` (repo) — dominio + terminología.
- `.claude/skills/supabase-multitenant-rls/SKILL.md` (repo) — reglas RLS/policies por op/WITH CHECK.

### Secondary (MEDIUM confidence)
- `package.json` (repo) — Vitest ^4.1.9, scripts test, sin paquetes nuevos.
- CONTEXT.md de Phase 2 y 3 (repo) — decisiones LOCKED.

### Tertiary (LOW confidence)
- Ninguna fuente externa consultada — toda la guía está anclada en código del repo. La semántica de Postgres (EXCLUDE single-table, advisory lock ordering anti-deadlock) es conocimiento estándar verificado contra el uso real del repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — cero paquetes nuevos; todo el mecanismo ya existe en el repo y fue leído este sesión.
- Architecture: HIGH — extensión 1:1 de `book_slot_atomic`/EXCLUDE/availability ya verificados; los 4 puntos de consistencia están identificados.
- Pitfalls: HIGH — derivados de los invariantes documentados en migr. 041 (bucketización, sentinela, advisory lock) + semántica Postgres estándar (deadlock ordering, EXCLUDE single-table).
- Terminología: MEDIUM — la ruta exacta de resolución por type es discreción del planner (A1).

**Research date:** 2026-06-29
**Valid until:** 2026-07-29 (stack estable; re-validar solo si cambia `book_slot_atomic` o el modelo de bucket antes de planificar).
