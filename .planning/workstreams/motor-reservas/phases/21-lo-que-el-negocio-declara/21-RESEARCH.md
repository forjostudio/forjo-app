# Phase 21: Lo que el negocio declara — Research

**Researched:** 2026-09-11
**Domain:** Onboarding multi-paso (React client component) + write path multi-tabla bajo RLS del dueño
**Confidence:** HIGH (todo lo estructural se verificó leyendo el repo; la única incógnita externa está acotada y resuelta con evidencia — ver §Assumptions Log)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A quién se le ofrece**

- **D-01:** El alta **pregunta explícitamente** con un toggle en el paso Horarios (*"¿En cada franja
  hacés todos tus servicios, o cada franja es para algo puntual?"*). Si elige lo segundo, aparecen los
  chips por franja.
  **Por qué así y no por rubro ni por cantidad de servicios:** el discriminador real no es ninguno de
  esos dos. Una peluquería con 5 servicios que atiende 9-18 está perfectamente descrita por el
  comodín; un taller con 2 servicios no. Lo que distingue es **si la franja ES la clase**, y eso solo
  lo sabe el dueño. Un rubro nuevo "Clases/Talleres" se descartó porque un vertical arrastra
  terminología, menú y features propias (`lib/verticals.ts`) — es superficie grande y sería fase
  aparte. La condición "2+ servicios" se descartó por implícita y por discriminar mal.

- **D-02:** El toggle arranca **apagado** = todo comodín. Cero fricción para la mayoría, y coincide
  con la cero-regresión de D-02 del milestone: el que no toca nada sale exactamente igual que hoy.
  No bloquea el avance del paso.

- **D-03:** El toggle **no aplica al vertical `canchas`** — se oculta, igual que ya se oculta el paso
  Profesionales para ese rubro (`visibleSteps` en `page.tsx:427`). En canchas el servicio ya viene
  derivado de la cancha (migr. 043), así que mapear franja↔servicio sería redundante y confuso.

- **D-04:** El toggle es **control de UI, no modelo de datos**: solo revela los chips. Cada franja
  sigue pudiendo quedar en comodín por separado, así que un negocio puede declarar "lun-vie 9-18
  todo" + "sábado 10-12 solo yoga" sin pelear con el toggle.

**El editor**

- **D-05:** Se **extrae el editor de chips** de `agenda-client.tsx` a un componente compartido y se usa
  en los dos lados (panel y alta). Ya resuelve chip comodín, colapso "Ver todos", congelado durante el
  guardado y accesibilidad (`role="status"` + `sr-only`).
  ⚠ **Esto amplía el alcance declarado del ROADMAP** (que dice solo `onboarding/page.tsx`). Se acepta
  a propósito: la alternativa era una segunda implementación de la misma pantalla, que es exactamente
  cómo el panel y el motor terminan diciendo cosas distintas sobre la misma franja — el modo de falla
  que AGENDA-02 existe para prevenir.
  — **Reversibility:** costly — volver atrás implica re-inlinear el componente en `agenda-client.tsx` y
  reescribir el del alta; son dos call sites de una pantalla con estado propio (colapso, congelado,
  accesibilidad), no un rename.

- **D-06:** La franja sin mapeo muestra un **chip "Cualquier servicio" explícito y activo**, igual que
  el panel. Así el vacío se lee como una respuesta y no como un olvido.
  **Por qué importa:** con el toggle prendido, una franja sin ningún chip marcado significa *todos los
  servicios* (regla del comodín, D-01 del milestone), que es contraintuitivo. El chip explícito es la
  forma que el panel ya encontró para comunicarlo, y reusarla evita una segunda interpretación de la
  regla.

**Qué pasa si queda mal configurado**

- **D-07:** Si el dueño mapea franjas y deja un servicio **sin ninguna que lo cubra**, el alta muestra
  un **aviso no bloqueante** al pie del paso (ej. *"Yoga no se da en ninguna franja — no va a poder
  reservarse"*).
  **No bloquea** porque es un estado LEGAL: el dueño está a mitad de configurar (D-06 de la Phase 18).
  **Pero ahora tiene consecuencia pública real**, y eso cambió *ayer*: desde la Phase 20 ese servicio
  aparece deshabilitado con "Sin horarios disponibles" en el booking público. Antes era invisible.
  El dato sale de `isServiceScheduled` / `lib/time-block-services` — **no se reimplementa** (AGENDA-02).

- **D-08:** El mapeo **sobrevive a volver atrás**. Cada servicio lleva una **clave local estable** desde
  que se crea en el paso 2: renombrarlo conserva su mapeo (el chip cambia de texto), borrarlo saca sus
  chips, y agregar uno nuevo aparece sin mapear.
  **Por qué es una decisión y no un detalle:** en el alta los servicios **no tienen ID** hasta el submit
  final (son estado local: nombre, duración, precio), así que el mapeo no puede keyearse por
  `service_id`. La identidad local es la única forma de que el dueño que corrige un typo en el paso 2 no
  pierda el trabajo del paso 4.

### Claude's Discretion

- El **copy exacto** del toggle y del aviso. Hay precedente directo y caro de mirar: la Phase 17 de este
  mismo milestone fue mayormente copy, porque el editor metía los dos modos de cupo en la misma bolsa y
  el dueño no tenía con qué elegir.
- Cómo se resuelve la **clave local** de D-08 (índice, UUID de cliente, etc.) y el orden de escritura en
  el submit — ver `<code_context>` para la restricción dura.
- Ubicación visual exacta del toggle y del aviso dentro del paso Horarios.

### Deferred Ideas (OUT OF SCOPE)

- **Rubro nuevo "Clases/Talleres"** — surgió como opción para D-01 y se descartó por alcance: un
  vertical arrastra terminología, menú y features propias (`lib/verticals.ts`). Si más adelante hay
  suficientes negocios de clases, es candidato a fase propia y volvería a leer esta decisión.
- **Declarar cupo por clase desde el alta** — `services.capacity` existe desde v0.27 y sería el
  siguiente paso natural para un negocio de clases, pero es capacidad nueva, no parte de AGENDA-08.
- **El cruce con multi-staff** (franja por servicio **y** profesional) — ya estaba declarado fuera de
  alcance en REQUIREMENTS.md §"Fuera de alcance" (D-03 del milestone). Se suma después sin re-migrar.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción | Research Support |
|----|-------------|------------------|
| **AGENDA-08** | *"El onboarding deja declarar la agenda real de un negocio de clases desde el día uno, en vez de pedirle un horario genérico que no describe su negocio."* [VERIFIED: `.planning/workstreams/motor-reservas/REQUIREMENTS.md:86-87`] | §Architecture Patterns · Pattern 1 (el write path se reemplaza por el RPC `save_agenda_blocks`, que YA escribe el mapeo) · Pattern 2 (extracción del editor de chips) · Pattern 3 (clave local de D-08) · Pattern 4 (gateo por vertical) · Pattern 5 (aviso de cobertura) |

</phase_requirements>

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

Directivas accionables extraídas de `AGENTS.md`, `.claude/CLAUDE.md` y las skills del proyecto. El
planner debe verificar cumplimiento de cada una.

| # | Directiva | Fuente | Cómo aplica a esta fase |
|---|-----------|--------|--------------------------|
| C-01 | **Next.js 16, NO 14.** Consultar `node_modules/next/dist/docs/` antes de asumir comportamiento. Middleware = `proxy.ts`. | `AGENTS.md`, `.claude/CLAUDE.md` | **No aplica en la práctica:** esta fase no introduce ninguna API de Next. `app/(onboarding)/onboarding/page.tsx:1` es `'use client'` [VERIFIED: `app/(onboarding)/onboarding/page.tsx:1` — `'use client'`] y todo el trabajo es React + `@supabase/supabase-js`. Si el planner agrega un route handler, ahí sí corresponde el lookup. |
| C-02 | **Aislamiento por tenant no negociable**: RLS + `.eq('business_id', …)` explícito. La RLS es la segunda capa, nunca la única. | `.claude/CLAUDE.md`, skill `supabase-multitenant-rls` §"Principio: defensa en profundidad" | El alta escribe con la sesión del dueño. El `business_id` que viaja SIEMPRE es el del negocio recién creado por esta sesión, nunca del cliente. El RPC de la migr. 074 ya hace el guard de autoría. |
| C-03 | **Service role SOLO server-side**, jamás en client. | `.claude/CLAUDE.md` §Restricciones arquitectónicas | El onboarding es client: usa `@/lib/supabase/client`. El único endpoint service-role del alta es `slug-available`, y no se toca. |
| C-04 | **Sin migraciones nuevas salvo que la fase lo pida.** Migraciones numeradas, aplicadas a mano y en orden. Próxima libre: **077**. | `.claude/CLAUDE.md` + `.planning/.../STATE.md` (071-076 en prod) | **Esta fase NO necesita migración.** Todo lo que escribe ya existe en producción. Ver §Don't Hand-Roll. |
| C-05 | **Usar `Edit`, no `Write`, sobre archivos existentes.** Cambiar solo lo necesario. | `CLAUDE.md` global §3 | `onboarding/page.tsx` (931 líneas) y `agenda-client.tsx` (1916 líneas) se editan quirúrgicamente. |
| C-06 | **Errores de dominio en snake_case**, logging con prefijo `[modulo/accion]`, nunca `console.log` en producción. | `.claude/CLAUDE.md` §Manejo de Errores | El alta ya usa `console.error('[onboarding/logo]', …)` y `console.error('[onboarding/link-lead]', …)`. El mapeo hereda el mismo prefijo. |
| C-07 | **Touch targets ≥ 44×44px**, contraste WCAG AA, focus visible, sin hover como único feedback. | `CLAUDE.md` global §Accesibilidad | El chip extraído **ya cumple** (`min-h-11 min-w-11` + `focus-visible:ring-2`). Al extraerlo no se puede perder. |
| C-08 | **No agregar dependencias sin flaggearlo.** Preferir lo ya bundleado. | `CLAUDE.md` global §Vendor Choices | Esta fase **no agrega ni una dependencia**. Ver §Package Legitimacy Audit. |
| C-09 | **Reutilizar el patrón in-repo referenciado** en vez de introducir uno nuevo. | `CLAUDE.md` global §Learning | Todo lo que necesita esta fase ya está escrito en `agenda-client.tsx`, `agenda-hours-payload.ts` y `time-block-services.ts`. |

---

## Summary

**El hallazgo que reescribe el plan: la "restricción dura" del CONTEXT ya no existe.** El CONTEXT
(`21-CONTEXT.md:169-176`) declara como cambio estructural que ambos inserts del submit tienen que
pasar a devolver sus filas con `.select()`, porque la puente necesita los dos `id`. Eso era cierto
cuando se escribió, pero **la Phase 19 ya resolvió exactamente ese problema del lado de la base**: la
migr. **074** creó el RPC `save_agenda_blocks(p_business_id uuid, p_blocks jsonb)`, que en **una sola
transacción** inserta las franjas, escribe `time_block_services` y **devuelve las filas resultantes
con sus `service_ids`** — y está aplicado en producción. El alta no tiene que hacer
`time_blocks.insert(...).select()` ni correlacionar nada: tiene que **dejar de usar
`time_blocks.insert`** y llamar al mismo RPC que ya usa el panel. Eso convierte el paso más peligroso
del plan (dos inserts sin transacción + correlación en el cliente) en una llamada atómica con backstop
de validación en la base.

**Lo que sí queda como problema real de correlación son los `service_id`**, y ese no lo resuelve el
RPC: los servicios tienen que existir **antes** de armar el payload. Acá sí hace falta `.select()`
sobre `services` — y la policy existe (`business member access` es `FOR ALL`, así que la SELECT del
dueño funciona), con precedente directo en `settings-client.tsx:1353-1355`. Pero **no se puede
correlacionar por índice**: el orden de `INSERT … RETURNING` con múltiples filas **no está garantizado
por PostgreSQL** (los maintainers lo dijeron explícitamente). La recomendación es eliminar la
correlación de raíz generando el `uuid` del servicio en el cliente, que además es la forma más simple
de cumplir D-08 (la clave local **es** el id final).

**El resto es UI y es casi todo extracción, no invención.** El editor de chips de `agenda-client.tsx`
(`BlockServicesLine` + `ServiceChip`, `:186-368`) es un componente puro sobre props que ya delega la
regla del comodín al módulo puro y ya resuelve colapso, congelado y accesibilidad. Su único
acoplamiento al panel es el tipo `ServiceCatalogItem` (`id`/`name`/`active`), que el alta puede
fabricar desde su estado local. El aviso de D-07 se alimenta con `hasScheduleCoverage` pasándole
**filas sintéticas** — patrón que el panel ya usa literalmente en `isDraftBlockWildcard`
(`agenda-client.tsx:195-200`).

**Primary recommendation:** Reemplazar `time_blocks.insert(...)` por `supabase.rpc('save_agenda_blocks', { p_business_id, p_blocks })` reutilizando `buildSaveHoursPayload` de `lib/agenda-hours-payload.ts`; generar los `uuid` de servicio en el cliente para que la clave local de D-08 sea el id real y desaparezca toda correlación; extraer `BlockServicesLine`/`ServiceChip` a `components/agenda/block-services-line.tsx` sin cambiar su contrato; y alimentar el aviso de D-07 con `hasScheduleCoverage` sobre filas sintéticas. **Cero migraciones, cero dependencias nuevas.**

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Declarar el mapeo franja↔servicio durante el alta (UI) | Browser / Client | — | `onboarding/page.tsx` es `'use client'`; todo el wizard vive en estado local hasta el submit. |
| Regla del comodín (qué declara una franja, si un servicio tiene cobertura) | Módulo puro compartido (`lib/`) | Browser | AGENDA-02 lo fija: fuente única, sin React ni Supabase. Se consume igual desde el client del alta que desde el motor. |
| Persistencia atómica de franjas + mapeo | Database (RPC `save_agenda_blocks`) | Browser (payload) | La migr. 074 puso el todo-o-nada en la base a propósito: PostgREST envuelve cada request en una transacción. El browser solo arma el estado deseado. |
| Aislamiento por tenant en la escritura | Database (RLS + guard de autoría + FK compuestas) | Browser (`business_id` explícito) | El RPC es `SECURITY INVOKER`, así que la RLS aplica adentro; el guard `not_your_business` y las FK compuestas de la migr. 073 son las capas 2 y 3. |
| Alta de servicios/profesionales | Browser → Database (RLS) | — | Insert directo con la sesión del dueño, como hoy. |
| Consumo público del mapeo declarado | Frontend Server (RSC) + API | Database (vista `public_time_block_services`) | **Ya construido en la Phase 20.** Esta fase no lo toca. |

⚠ **Nada de esta fase pertenece al tier API/route handler.** Si un plan propone crear un endpoint
para escribir el mapeo, está en el tier equivocado: el write path correcto ya existe en la base y el
único endpoint del alta (`slug-available`) existe por otra razón (la colisión de slug de v0.20).

---

## Standard Stack

### Core

Esta fase **no agrega una sola dependencia**. Todo lo que necesita ya está instalado y en producción.

| Librería | Versión | Propósito | Por qué es la estándar acá |
|----------|---------|-----------|----------------------------|
| `@supabase/supabase-js` | `^2.106.2` | Insert de `services`/`professionals` + `rpc('save_agenda_blocks')` con la sesión del dueño | Es el cliente que el alta ya usa vía `@/lib/supabase/client` [VERIFIED: `app/(onboarding)/onboarding/page.tsx:6` — `import { createClient } from '@/lib/supabase/client'`] |
| `react` | `19.2.4` | Estado local del wizard | Ya en uso |
| `lucide-react` | `^1.17.0` | Iconos (`Check`, `Asterisk`) del chip extraído | Es el `iconLibrary` declarado en `components.json` |

### Supporting (módulos internos que actúan como librería)

| Módulo | Propósito | Cuándo usarlo |
|--------|-----------|---------------|
| `lib/time-block-services.ts` | Regla del comodín (fuente única, AGENDA-02) | `isBlockWildcard` → el chip de D-06 · `servicesOfBlock` → los chips marcados · `hasScheduleCoverage` → el aviso de D-07 |
| `lib/agenda-hours-payload.ts` | Contrato del payload/retorno del RPC | `buildSaveHoursPayload(days, { hasLocations })` para armar `p_blocks` desde los días del alta |
| `app/(dashboard)/agenda/agenda-client.tsx` | Origen de `BlockServicesLine` + `ServiceChip` | Es lo que D-05 manda **extraer**, no reescribir |
| `lib/verticals.ts` | `VerticalKey` y terminología por rubro | Gate de D-03 (`vertical === 'canchas'`) |

### Alternatives Considered

| En vez de | Se podría usar | Trade-off |
|-----------|----------------|-----------|
| `rpc('save_agenda_blocks')` | `time_blocks.insert(...).select()` + `time_block_services.insert(...)` (lo que asume el CONTEXT) | **Rechazado.** Dos escrituras sin transacción: si la segunda falla, el negocio sale del alta con agenda comodín — un estado visualmente idéntico a "no configuré nada", que es el modo de falla que la migr. 074 existe para cerrar. Además re-implementa el diff y pierde el backstop de validación (`invalid_block`). |
| Generar el `uuid` del servicio en el cliente | Bulk `insert().select()` y correlacionar por **índice** | **Rechazado por evidencia externa:** el orden de `INSERT … RETURNING` no está garantizado (ver §Common Pitfalls · Pitfall 1). |
| Generar el `uuid` del servicio en el cliente | Bulk `insert().select('id, name')` y correlacionar por **nombre** | Viable **solo** si se impone unicidad de nombre en el paso 2 — superficie de producto nueva (validación + copy) que nadie pidió. Se puede tomar como fallback conservador. |
| Generar el `uuid` del servicio en el cliente | Un `insert().select().single()` **por servicio** (molde `settings-client.tsx:1353-1355`) | Fallback de menor novedad: cero patrones nuevos, N round-trips (N ≤ ~10 en un alta). Pierde atomicidad del alta de servicios, que hoy tampoco existe. |
| Componente extraído compartido (D-05) | Segunda implementación de los chips en el alta | **Prohibido por D-05 + AGENDA-02.** Dos interpretaciones de la misma regla es el modo de falla que el milestone entero viene evitando. |
| Un `<Switch>` de shadcn para el toggle de D-01 | — | **No existe `switch.tsx` en `@/components/ui`** [VERIFIED: `ls components/ui` → `avatar badge button calendar card dialog drawer input label password-input select separator shell-scope sonner table tabs textarea` — no hay `switch`]. El patrón in-repo es un botón `role="switch"` + `aria-checked` (`app/(dashboard)/web/_sections/section-forms.tsx:255-273`). |

**Installation:**

```bash
# Ninguna. Esta fase no instala nada.
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| — | — | — | — | — | — | **N/A — la fase no instala ningún paquete externo** |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

La fase se resuelve enteramente con dependencias ya presentes en `package.json` y con módulos
internos del repo. El gate de legitimidad no aplica. Si un plan propone instalar algo, eso es señal
de que se desvió del alcance.

---

## Architecture Patterns

### System Architecture Diagram

```
                          ┌──────────────────────────────────────────────┐
   Dueño (navegador)      │   app/(onboarding)/onboarding/page.tsx       │
   sesión authenticated   │   'use client' — estado local, 4 pasos       │
          │               └──────────────────────────────────────────────┘
          │                                   │
          ▼                                   ▼
   ┌───────────────┐              ┌──────────────────────────┐
   │ Paso 2        │              │ Paso 4 — Horarios        │
   │ Servicios     │─── clave ───▶│  dayStates[] (N bloques) │
   │ (nombre,      │    local     │   + toggle D-01          │◀── gate D-03 (vertical)
   │  dur, precio) │    D-08      │   + chips por franja     │
   └───────────────┘              │   + aviso D-07 (no bloq.)│
          │                       └──────────────────────────┘
          │                                   │
          │      regla del comodín (AGENDA-02, filas SINTÉTICAS con claves locales)
          │                                   │
          │                       ┌───────────▼──────────────┐
          │                       │ lib/time-block-services  │
          │                       │ isBlockWildcard          │
          │                       │ servicesOfBlock          │
          │                       │ hasScheduleCoverage      │
          │                       └──────────────────────────┘
          │
          ▼  handleFinish()  ── UN SOLO SUBMIT, sin transacción global ──
   ┌──────────────────────────────────────────────────────────────────────┐
   │ 1. businesses.insert().select().single()          ← ya existe (:310) │
   │ 2. [best-effort] upload logo                      ← ya existe        │
   │ 3. services.insert([... con id generado ...])     ← CAMBIA (:356)    │
   │ 4. professionals.insert(...)                      ← sin cambios      │
   │ 5. rpc('save_agenda_blocks', {p_business_id,      ← REEMPLAZA (:388) │
   │        p_blocks: buildSaveHoursPayload(...)})       ATÓMICO           │
   │ 6. [best-effort] linkLeadOnSignup                 ← ya existe        │
   │ 7. router.push('/dashboard')                                         │
   └──────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼  (una transacción de PostgREST)
   ┌──────────────────────────────────────────────────────────────────────┐
   │ save_agenda_blocks — SECURITY INVOKER, GRANT a authenticated         │
   │  guard autoría → normaliza payload → DELETE diff → INSERT/UPDATE     │
   │  franja → sincroniza time_block_services → RETURN set + service_ids  │
   └──────────────────────────────────────────────────────────────────────┘
        │ RLS time_blocks / time_block_services  +  FK compuestas (073)
        ▼
   ┌────────────┐   ┌──────────┐   ┌─────────────────────┐
   │ time_blocks│   │ services │   │ time_block_services │  ← la puente (migr. 071)
   └────────────┘   └──────────┘   └─────────────────────┘
                                       │
                                       ▼ (lo consume la Phase 20, ya construido)
                        public_time_block_services → /[slug] booking
```

### Recommended Project Structure

```
app/(onboarding)/onboarding/
└── page.tsx                       # EDITAR: toggle D-01, chips por franja, aviso D-07, submit
components/agenda/
└── block-services-line.tsx        # NUEVO: BlockServicesLine + ServiceChip + ServiceCatalogItem
app/(dashboard)/agenda/
└── agenda-client.tsx              # EDITAR: borrar las definiciones locales, importar del nuevo módulo
lib/
├── time-block-services.ts         # SIN CAMBIOS (AGENDA-02: no se toca la regla)
└── agenda-hours-payload.ts        # SIN CAMBIOS (el contrato del payload ya sirve)
test/
└── onboarding-agenda-payload.test.ts   # NUEVO (opcional): el mapeo clave-local → payload, puro
```

⚠ **`components/agenda/` es un directorio nuevo.** El repo ya tiene `components/dashboard/` y
`components/crm/` [VERIFIED: `.claude/CLAUDE.md` §Convenciones cita `components/dashboard/plan-banner.tsx`],
así que la convención kebab-case por dominio se respeta. El planner puede también ubicarlo en
`components/dashboard/` si prefiere no crear carpeta; lo que **no** puede hacer es dejarlo dentro de
`app/(dashboard)/agenda/`, porque el onboarding no vive en ese route group.

---

### Pattern 1 — El write path de la agenda es el RPC, no dos inserts

**What:** El submit deja de escribir `time_blocks` a mano y llama a `save_agenda_blocks`, el mismo RPC
que usa el panel desde la Phase 19.

**Por qué es correcto y no una optimización:**

1. **Ya escribe la puente.** [VERIFIED: `supabase/migrations/074_save_agenda_blocks.sql:110` — firma
   verbatim: `CREATE OR REPLACE FUNCTION "public"."save_agenda_blocks"("p_business_id" "uuid", "p_blocks" "jsonb") RETURNS TABLE("id" "uuid", "day_of_week" integer, "start_time" time without time zone, "end_time" time without time zone, "label" "text", "location_id" "uuid", "service_ids" "uuid"[])`]
2. **Es atómico.** PostgREST envuelve cada request en una transacción, así que cualquier `RAISE`
   revierte la llamada entera. Esto **elimina el fallo parcial** que la priority question 2 planteaba
   como problema abierto: ya no existe el estado "franjas sí, mapeo no". [CITED: `supabase/migrations/074_save_agenda_blocks.sql:24-27`]
3. **Es invocable por el dueño recién creado.** [VERIFIED: `supabase/migrations/074_save_agenda_blocks.sql:325-327` — verbatim:
   `REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") FROM PUBLIC;` /
   `REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") FROM "anon";` /
   `GRANT EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") TO "authenticated";`]
   El usuario del alta ya está autenticado (`supabase.auth.getUser()` en `page.tsx:295`).
4. **Corre con la RLS del dueño.** [VERIFIED: `supabase/migrations/074_save_agenda_blocks.sql:112` — verbatim: `    SECURITY INVOKER`]
5. **Está en producción y en `schema.sql`.** [VERIFIED: `supabase/schema.sql:561` y `:4116-4117` contienen
   la función y sus REVOKE — el dump está regenerado, o sea que la migración se aplicó.]
6. **Efecto colateral gratis:** el alta deja de escribir `capacity: 1` en `time_blocks`
   (`page.tsx:383`), cumpliendo D-12 del milestone sin trabajo extra. El RPC omite la columna a
   propósito y la base pone su `DEFAULT 1`. [VERIFIED: `supabase/schema.sql:1494` — verbatim: `    "capacity" smallint DEFAULT 1 NOT NULL,`]

**Cómo se arma el payload:** reutilizando `buildSaveHoursPayload` sin tocarla. En el alta
`hasLocations` es **siempre `false`** (el onboarding no maneja sedes), así que ningún bloque se
descarta y todos viajan con `location_id: null`.

```ts
// Source: lib/agenda-hours-payload.ts:161-185 (firma y semántica verbatim del módulo)
// Los días del alta (DayState) tienen {enabled, blocks[{start_time,end_time}]}.
// AgendaDayDraft exige además label/location_id/service_ids por bloque — se adaptan acá.
import { buildSaveHoursPayload } from '@/lib/agenda-hours-payload'

const p_blocks = buildSaveHoursPayload(
  dayStates.map(ds => ({
    enabled: ds.enabled,
    blocks: ds.blocks.map(b => ({
      // sin `id`: el RPC lo trata como INSERT (`id: null` ⇒ INSERT; con id ⇒ UPDATE)
      start_time: b.start_time,
      end_time: b.end_time,
      label: '',
      location_id: '',
      service_ids: serviceIdsFor(b),   // los uuid REALES de los servicios ya insertados
    })),
  })),
  { hasLocations: false },
)

const { data, error } = await supabase.rpc('save_agenda_blocks', {
  p_business_id: business.id,
  p_blocks,
})
```

**Manejo de error:** el panel ya tiene el clasificador y la copy
(`classifySaveHoursError` en `agenda-client.tsx:433-456`, `SAVE_HOURS_REJECT_COPY` en `:468-474`).
Los códigos de dominio que puede devolver el RPC son, verbatim:
`'not_your_business'` [VERIFIED: `074:149`], `'invalid_payload'` [VERIFIED: `074:159`],
`'invalid_block'` [VERIFIED: `074:207`] y `'block_not_found'` [VERIFIED: `074:246`], todos con
`ERRCODE = 'P0001'`. En el alta **`block_not_found` es inalcanzable** (todos los bloques van sin
`id`), y `not_your_business` también (el negocio se acaba de crear en esta sesión) — el planner debe
decidir si extrae el clasificador a un módulo compartido o escribe un manejo más chico para el alta.

**Decisión que el planner tiene que tomar explícitamente (priority question 2):** ¿el mapeo es
best-effort como el logo y `linkLeadOnSignup`, o es núcleo?

| | Best-effort (logueá y seguí) | Núcleo (fallá el submit) |
|---|---|---|
| Precedente | `[onboarding/logo]` (`page.tsx:335-347`) y `[onboarding/link-lead]` (`page.tsx:397-401`), ambos con `try/catch` propio que **no rompe** el redirect [VERIFIED: `app/(onboarding)/onboarding/page.tsx:331-334` — comentario verbatim: `// Best-effort: el negocio ya existe, así que un fallo del upload/update se` / `// loguea y NO rompe el redirect al dashboard (mismo criterio que linkLeadOnSignup, T-04-09).`] | El insert de `businesses` sí tira (`if (bizError) throw bizError`, `page.tsx:326`) |
| Consecuencia si falla | El negocio queda **sin horarios** (no solo sin mapeo): el RPC es la única escritura de `time_blocks` | El dueño ve "Error al crear el negocio" con el negocio ya creado — el alta no es re-entrante |

**Recomendación:** los horarios **no** son best-effort — hoy tampoco lo son de hecho (si
`time_blocks.insert` falla, el negocio sale sin agenda igual, solo que en silencio). Lo correcto es
**chequear el error del RPC y avisar con copy honesta**, sin tirar: el negocio ya existe, así que
tirar deja al dueño peor. Copy sugerida: *"Creamos tu negocio pero no pudimos guardar los horarios.
Entrá a Agenda y cargalos."* + `router.push('/dashboard')`. Es el mismo criterio que el panel ya usa
cuando el UPDATE de duración falla después de un RPC exitoso (`agenda-client.tsx:916-920`).

---

### Pattern 2 — La clave local de D-08 es el `uuid` final del servicio

**What:** Cada fila de servicio del paso 2 nace con `id: crypto.randomUUID()`, y ese mismo `id` viaja
en el `INSERT` a `services`.

**When to use:** es la respuesta recomendada a la discreción que CONTEXT delegó ("cómo se resuelve la
clave local de D-08").

**Por qué:**

- **Elimina la correlación**, que es la única clase de bug estructural que quedaba (ver Pitfall 1).
  No hay que leer nada de vuelta: el `service_ids` del payload del RPC se puede armar **antes** de que
  los servicios existan.
- **Cumple D-08 literalmente:** renombrar el servicio no toca el id ⇒ el mapeo sobrevive; borrarlo
  saca sus chips (se filtra por id); agregar uno nuevo aparece sin mapear.
- **Arregla de paso un bug latente:** hoy las filas del paso 2 se renderizan con `key={i}`
  [VERIFIED: `app/(onboarding)/onboarding/page.tsx:696-698` — verbatim: `{services.map((service, i) => (` / `                  <div` / `                    key={i}`]
  y `removeService(i)` filtra por índice (`page.tsx:170-172`). Con id estable, la key pasa a ser el id
  y React deja de reusar estado entre filas distintas al borrar una del medio.
- **`crypto.randomUUID()` ya se usa en el repo** [VERIFIED: `lib/landing/editor-upload.ts:58` —
  `const uuid = globalThis.crypto.randomUUID()`; también `app/api/google/connect/route.ts:20` y
  `app/api/mercadopago/connect/route.ts:15`].
- **La columna lo admite:** `services.id` tiene default, no es generated-always
  [VERIFIED: `supabase/schema.sql:1362` — verbatim: `    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,`].
  Y **no hay trigger `BEFORE INSERT` sobre `services`** que pueda interferir: los únicos triggers de la
  tabla son `services_block_delete_trg` (BEFORE DELETE) y `services_block_mode_change_trg`
  (BEFORE UPDATE OF capacity_mode) [VERIFIED: `supabase/schema.sql:1853` y `:1857`].

**Riesgo y su acotación:** un id generado en el cliente podría colisionar con un id existente → error
`23505` de la PK. Con UUIDv4 la probabilidad es despreciable, y el fallo es ruidoso (el insert
rebota), nunca silencioso ni cross-tenant: la policy de INSERT sigue exigiendo que el `business_id`
sea del dueño. **No hay precedente in-repo de PK generada en el cliente** — es el único patrón nuevo
que introduce esta fase, y el planner debería anotarlo como decisión visible (§Open Questions Q1).

**Fallback conservador si se rechaza:** `insert().select().single()` **por servicio**, molde exacto de
`app/(dashboard)/settings/settings-client.tsx:1353-1355`:

```ts
// Source: app/(dashboard)/settings/settings-client.tsx:1353-1355
const { data, error } = await supabase.from('services')
  .insert({ name, duration_minutes, price, location_ids: location_ids.length ? location_ids : null, capacity_mode, capacity, business_id: business.id })
  .select().single()
```

Ese precedente **prueba en producción** lo que la priority question 1 pedía verificar: `.select()`
después de un insert sobre `services` con la sesión del dueño devuelve la fila.

---

### Pattern 3 — Las policies de SELECT existen: `FOR ALL` sin `FOR` explícito

**What:** La respuesta directa a la priority question 1a, con las policies verbatim.

`services`:
```sql
-- Source: supabase/schema.sql:2425-2427 (verbatim)
CREATE POLICY "business member access" ON "public"."services" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));
```

`time_blocks`:
```sql
-- Source: supabase/schema.sql:2401-2403 (verbatim)
CREATE POLICY "business access" ON "public"."time_blocks" USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));

-- Source: supabase/schema.sql:2555 (verbatim)
CREATE POLICY "public read time_blocks" ON "public"."time_blocks" FOR SELECT USING (true);
```

**Lectura:** una policy sin cláusula `FOR` es `FOR ALL`, así que su `USING` cubre SELECT. El dueño ve
sus `services` y sus `time_blocks`; encima `time_blocks` tiene lectura pública irrestricta (dato
relevante para seguridad, no para esta fase). **La premisa de bloqueo del CONTEXT ("si falta la policy
de SELECT, `.select()` vuelve vacío y el plan entero se cae") queda descartada por evidencia.**
[VERIFIED: las tres policies citadas arriba, leídas en `supabase/schema.sql` esta sesión.]

La puente tiene sus 4 policies por operación, con nombres verbatim
`"time_block_services tenant select"`, `"time_block_services tenant insert"`,
`"time_block_services tenant update"`, `"time_block_services tenant delete"`
[VERIFIED: `supabase/migrations/071_time_block_services.sql:110-129`], y además FK compuestas que
rechazan en la base cualquier fila cross-tenant:

```sql
-- Source: supabase/schema.sql:1937 y :1942 (verbatim)
    ADD CONSTRAINT "tbs_block_same_tenant" FOREIGN KEY ("time_block_id", "business_id") REFERENCES "public"."time_blocks"("id", "business_id") ON DELETE CASCADE;
    ADD CONSTRAINT "tbs_service_same_tenant" FOREIGN KEY ("service_id", "business_id") REFERENCES "public"."services"("id", "business_id") ON DELETE CASCADE;
```

---

### Pattern 4 — Extracción del editor de chips (D-05): qué se mueve y qué no

**Respuesta a la priority question 3.** Los dos componentes son **puros sobre props** y no leen ningún
estado del panel: no usan hooks, no tocan Supabase, no leen `business`.

| Símbolo | Líneas en `agenda-client.tsx` | Props | ¿Aplica en el alta? |
|---------|------------------------------|-------|---------------------|
| `CHIPS_COLLAPSED_MAX = 6` | `:183` | — | Sí, tal cual |
| `DRAFT_BLOCK_ID = '__draft__'` + `isDraftBlockWildcard(serviceIds)` | `:194-200` | — | Sí, tal cual (es el adaptador a la función pura) |
| `ServiceChip` | `:201-250` | `label, selected, inactive?, ariaLabel?, disabled?, onToggle` | Sí. `inactive`/`ariaLabel` quedan **sin uso** en el alta (no hay servicios de baja durante el alta) — se pasan `undefined`, no se borran del contrato |
| `BlockServicesLine` | `:260-368` | `serviceIds, catalog, groupLabel, expanded, disabled?, onToggleExpanded, onToggleService` | Sí |
| `ServiceCatalogItem` | `:71-75` | `{ id: string; name: string; active: boolean }` | Sí — el alta lo **fabrica** desde su estado local |

`ServiceCatalogItem` verbatim:
```ts
// Source: app/(dashboard)/agenda/agenda-client.tsx:71-75
export type ServiceCatalogItem = {
  id: string
  name: string
  active: boolean
}
```

**Qué del panel NO aplica en el alta:**

| Estado del panel | Por qué no aplica |
|------------------|-------------------|
| `disabled` = congelado durante el guardado (`savingHours`) | El alta **no tiene guardado incremental**: todo se escribe en el submit final. El congelado sí tiene un análogo — el flag `loading` del submit (`page.tsx:293` / `:892`) — y **conviene pasarlo**, por la misma razón que en el panel: si el dueño toca un chip mientras el submit está en vuelo, ese toque no llega a la base y se pierde sin ruido. |
| `inactive` (servicio dado de baja que sigue mapeado, D-11) | Durante el alta **no existe** un servicio inactivo: los servicios se crean en el mismo submit. Se pasa `active: true` siempre. **No borrar la prop** del componente extraído: el panel la necesita. |
| `hoursDirty` / "Cambios sin guardar" | El alta no tiene ese indicador ni lo necesita: el submit es la única salida del wizard. |
| Estado de colapso keyeado por consultorio | El alta no tiene consultorios. La clave `${day}-${idx}` alcanza [VERIFIED: `app/(dashboard)/agenda/agenda-client.tsx:1532` — verbatim: `expanded={expandedChips.has(`${day}-${idx}`)}`]. |
| Gate 2 del UI-SPEC (catálogo vacío ⇒ una sola línea guía, no un empty state por franja) | **Sí aplica y con más fuerza:** en el alta el catálogo vacío es el estado por defecto del paso 2 si el dueño lo omitió. Con el toggle prendido y 0 servicios no hay nada que mapear. [CITED: `.planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-SPEC.md:321`] |

**Regla de extracción:** mover el código **sin editar su cuerpo**. Cualquier cambio de comportamiento
durante la extracción es una regresión del panel que la UAT de la Phase 19 ya aprobó cuatro veces
(el `gap-y-0` deliberado, el `role="status"` fuera del flujo, el "los marcados nunca se colapsan").
El planner debería pedir un diff que sea literalmente *cortar-y-pegar + cambiar imports*.

---

### Pattern 5 — El gateo por vertical (D-03) se monta sobre `visibleSteps`

**Respuesta a la priority question 4.** El patrón real, verbatim:

```ts
// Source: app/(onboarding)/onboarding/page.tsx:416-433
  const steps = [
    { n: 1, label: 'Tu negocio' },
    { n: 2, label: 'Servicios' },
    { n: 3, label: 'Profesionales' },
    { n: 4, label: 'Horarios' },
  ]

  const visibleSteps = vertical === 'canchas'
    ? steps.filter(s => s.n !== 3)
    : steps

  const currentIndex = Math.max(0, visibleSteps.findIndex(s => s.n === step))
  const isLastStep = currentIndex === visibleSteps.length - 1
```

Tres cosas que el planner tiene que entender de este código antes de tocarlo:

1. **`n` es el identificador canónico del paso; la numeración visible es la POSICIÓN.** El render
   keyea contra `step === 4`, no contra la posición. [VERIFIED: `app/(onboarding)/onboarding/page.tsx:427`
   y el comentario de `:423-430`.]
2. **El gate de D-03 NO es un paso oculto, es un control oculto.** El toggle vive *dentro* del paso 4,
   que en canchas **sí se muestra** (canchas necesita horarios). Así que D-03 no se implementa
   filtrando `steps`: se implementa con un booleano derivado del mismo estado, p. ej.
   `const canMapServices = vertical !== 'canchas'`, y con eso se decide si se renderiza el toggle, los
   chips y el aviso.
3. **El gate se evalúa contra el estado local `vertical`**, no contra `resolveVertical(business)`: en
   el alta el negocio todavía no existe cuando se pinta el paso 4. Es exactamente lo que hace
   `visibleSteps`.

**Cero regresión por construcción:** si el gate se olvidara, canchas quedaría igual en comodín (0 filas
en la puente), así que el gate es de claridad de producto, no de corrección del motor.
[CITED: `.planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-SPEC.md:170`]

---

### Pattern 6 — El aviso de D-07 se alimenta con filas sintéticas

**Respuesta a la priority question 5.** Las firmas exactas, verbatim del módulo:

```ts
// Source: lib/time-block-services.ts:249, :268, :144, :111
export function servicesOfBlock(blockId: string, bridge: TimeBlockService[]): string[]
export function isBlockWildcard(blockId: string, bridge: TimeBlockService[]): boolean
export function hasScheduleCoverage<T extends { id: string }>(serviceId: string, blocks: T[], bridge: TimeBlockService[]): boolean
export function isServiceScheduled<T extends { id: string }>(serviceId: string, blocks: T[], bridge: TimeBlockService[]): boolean
```

```ts
// Source: lib/types.ts:180-184 (verbatim)
export interface TimeBlockService {
  business_id: string
  time_block_id: string
  service_id: string
}
```

**El contrato D-16, verbatim de la cabecera del módulo:**

> `⚠ Contrato D-16 — el caller filtra ANTES de llamar: ninguna función de este módulo filtra por`
> `negocio ni por vigencia. El caller —route handler, RSC o el core del booking— ya acotó las filas`
> `por business_id antes de invocar.`
> [VERIFIED: `lib/time-block-services.ts:21-24`]

En el alta el contrato se cumple **trivialmente**: todas las filas son de un solo negocio (el que se
está creando), así que no hay nada que filtrar. Se pasa `business_id: ''` en las filas sintéticas,
igual que hace el panel.

**Cuál usar para el aviso: `hasScheduleCoverage`, NO `isServiceScheduled`.** El módulo lo documenta
como trampa que ya mordió una vez:

> `⚠ LA TRAMPA, que ya mordió una vez (CR-01 del code review de la Phase 20): blocksForService`
> `FILTRA blocks, así que con CERO franjas devuelve [] y isServiceScheduled da false para **todo**`
> `servicio.` [VERIFIED: `lib/time-block-services.ts:126-129`]

En el alta el caso de cero franjas es **alcanzable en un click**: el dueño puede cerrar los 7 días.
Con `isServiceScheduled` el aviso diría que *todos* los servicios quedan sin horario; con
`hasScheduleCoverage` no dice nada, que es lo correcto (la pregunta no tiene sujeto).
⚠ El CONTEXT (`21-CONTEXT.md:82` y `:112`) nombra a `isServiceScheduled` — **el planner debe usar
`hasScheduleCoverage`**, y anotar la corrección.

**El patrón de filas sintéticas ya existe en el repo**, verbatim:

```ts
// Source: app/(dashboard)/agenda/agenda-client.tsx:194-200
const DRAFT_BLOCK_ID = '__draft__'
function isDraftBlockWildcard(serviceIds: string[]): boolean {
  return isBlockWildcard(
    DRAFT_BLOCK_ID,
    serviceIds.map(id => ({ business_id: '', time_block_id: DRAFT_BLOCK_ID, service_id: id })),
  )
}
```

**Cómo se extiende al aviso del alta** (funciones puras, testeables sin DB — buen candidato a vivir en
un helper propio del onboarding en vez de inline en el JSX):

```ts
// Filas sintéticas de TODA la grilla del alta, keyeadas por la clave local del bloque.
// `blockKey` tiene que ser estable mientras el bloque exista (p. ej. `${day}-${idx}`; si el planner
// prefiere, un uuid local por bloque, misma lógica que el uuid por servicio de D-08).
const draftBlocks = dayStates.flatMap((ds, day) =>
  ds.enabled ? ds.blocks.map((b, idx) => ({ id: `${day}-${idx}`, ...b })) : [],
)
const draftBridge: TimeBlockService[] = draftBlocks.flatMap(b =>
  (b.service_ids ?? []).map(sid => ({ business_id: '', time_block_id: b.id, service_id: sid })),
)

// El aviso de D-07: servicios con nombre cargado que ninguna franja cubre.
const sinCobertura = services
  .filter(s => s.name.trim())
  .filter(s => !hasScheduleCoverage(s.id, draftBlocks, draftBridge))
```

**Copy:** discreción de Claude, pero con la restricción que fija `<specifics>` del CONTEXT — tiene que
sonar a **consecuencia**, no a error de validación. El precedente público de la Phase 20 dice
`'Sin horarios disponibles'` [VERIFIED: `app/[slug]/booking-client.tsx:630` — verbatim:
`                      {!scheduled ? 'Sin horarios disponibles' : 'Sin profesional disponible'}`], así
que el aviso del alta debería anticipar **esa misma frase** para que el dueño reconozca el efecto
cuando lo vea en su página pública.

---

### Anti-Patterns to Avoid

- **Escribir `time_block_services` desde el cliente con `.insert()`.** Existe el RPC y es atómico.
  Un insert suelto a la puente reintroduce el fallo parcial que la migr. 074 cerró, y además
  duplica la lógica de sincronización (borrar los que salieron / insertar los que entraron).
- **Correlacionar servicios insertados por índice del array devuelto.** Ver Pitfall 1.
- **Reimplementar la regla del comodín** con un `.filter(r => r.time_block_id === …)` inline en el
  JSX del alta. Prohibido explícitamente por AGENDA-02, y el módulo lo dice con nombre y apellido.
  [CITED: `lib/time-block-services.ts:254-257`]
- **Usar `isServiceScheduled` para el aviso.** Apaga el aviso al revés con cero franjas (CR-01).
- **Crear un endpoint/route handler para escribir el mapeo.** Rompe C-03/§Architectural Map y no
  resuelve nada que el RPC no resuelva mejor.
- **Cambiar el cuerpo de `BlockServicesLine`/`ServiceChip` "de paso" al extraerlos.** Regresión
  directa del panel.
- **Crear una migración.** No hace falta ninguna. Si el plan la propone, algo se desvió.
- **Bloquear "Finalizar" por el aviso de D-07.** D-07 dice explícitamente no bloqueante, y el estado
  es legal (D-06 de la Phase 18).
- **Filtrar por tenant dentro de `lib/time-block-services.ts`.** El contrato D-16 lo prohíbe y da la
  razón: falsa sensación de aislamiento en un módulo que recibe filas de un tercero.

---

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Escribir franjas + mapeo sin estado intermedio | Dos `.insert()` encadenados con manejo de fallo parcial | `supabase.rpc('save_agenda_blocks', …)` (migr. 074, en prod) | Una transacción de PostgREST; todo-o-nada gratis; backstop de validación en la base |
| Armar el JSON de franjas | Un `.flatMap()` nuevo en el submit | `buildSaveHoursPayload()` (`lib/agenda-hours-payload.ts:161`) | Ya normaliza `''` → `null`, dedupe de `service_ids` y el contrato exacto que el RPC espera |
| Validar hora `'HH:MM'` | Un regex nuevo | `isValidBlockTime()` (`lib/agenda-hours-payload.ts:135`) | El `<input type="time">` se puede **vaciar** y `'' < '09:00'` pasa la comparación de orden que hoy usa `validateHours()` (`page.tsx:284-297`) — bug real ya diagnosticado en el panel |
| "¿Esta franja es comodín?" | `serviceIds.length === 0` | `isBlockWildcard` vía el adaptador `isDraftBlockWildcard` | AGENDA-02: una sola interpretación de la regla |
| "¿Este servicio tiene cobertura?" | Un `.some()` sobre el mapeo | `hasScheduleCoverage` | La guarda de cero franjas (CR-01) no es obvia y ya se olvidó una vez |
| Chips, colapso, accesibilidad | Una segunda versión para el alta | Extraer `BlockServicesLine` (D-05) | Pantalla con estado propio ya pasada por UI-REVIEW y UAT |
| Traducir errores del RPC | `toast.error(error.message)` | `classifySaveHoursError` + `SAVE_HOURS_REJECT_COPY` (`agenda-client.tsx:433-474`) | El mensaje de Postgres trae nombres de tabla y constraint — nunca cruza a la pantalla |
| Toggle booleano | Instalar `@radix-ui`/shadcn `switch` | Botón `role="switch"` + `aria-checked` (molde `app/(dashboard)/web/_sections/section-forms.tsx:255-273`) | No hay `switch.tsx` en `components/ui` y el repo ya resolvió esto dos veces |
| Id estable por fila | `key={i}` + índices | `crypto.randomUUID()` por servicio | Ver Pattern 2 |

**Key insight:** esta fase es, casi entera, **plomería entre piezas que ya existen**. El milestone
v0.28 gastó tres fases construyendo el modelo, el helper puro, el RPC atómico y el editor visual. El
riesgo de la Phase 21 no es técnico, es de disciplina: cada vez que el plan escriba código nuevo en vez
de llamar a algo existente, está creando la segunda interpretación que AGENDA-02 vino a prohibir.

---

## Runtime State Inventory

> Se incluye porque D-05 es una extracción (refactor) y porque el submit cambia su write path. Esta
> fase **no** renombra ni migra datos.

| Categoría | Encontrado | Acción requerida |
|-----------|-----------|------------------|
| **Datos almacenados** | Ninguno que cambie de forma. `time_block_services` ya existe y ya tiene el shape final (3 columnas NOT NULL). Los negocios existentes no se tocan. | **Ninguna.** Sin backfill, sin migración de datos. |
| **Config de servicios vivos** | Ninguna. El alta no configura nada fuera de Supabase. | Ninguna |
| **Estado registrado en el SO** | Ninguno. | Ninguna |
| **Secretos / env vars** | Ninguno nuevo. El alta usa las mismas `NEXT_PUBLIC_SUPABASE_*` de siempre. | Ninguna |
| **Artefactos de build** | Ninguno. No hay paquete que reinstalar. | Ninguna |
| **⚠ Estado en código que sí se mueve** | `BlockServicesLine`, `ServiceChip`, `ServiceCatalogItem`, `CHIPS_COLLAPSED_MAX`, `DRAFT_BLOCK_ID`, `isDraftBlockWildcard` salen de `agenda-client.tsx`. **`ServiceCatalogItem` está `export`ado y lo importa `app/(dashboard)/agenda/page.tsx`** (se pasa como prop `serviceCatalog`, `agenda-client.tsx:487`). | Re-exportar desde `agenda-client.tsx` o actualizar el import de `page.tsx`. **El planner debe verificar con `grep` quién más importa `ServiceCatalogItem` antes de mover el tipo** — un import roto es un fallo de `tsc`, barato, pero hay que buscarlo. |

**Nada encontrado en 5 de 6 categorías — verificado leyendo la migr. 071/074 (cero backfill declarado
explícitamente) y el `package.json` (cero dependencias nuevas).**

---

## Common Pitfalls

### Pitfall 1 — Correlacionar los servicios insertados por índice

**Qué sale mal:** `services.insert(rows).select()` devuelve un array; el plan asume
`data[i]` ↔ `rows[i]` y arma el mapeo con eso. Si el orden difiere, **los chips quedan mapeados al
servicio equivocado** — y el síntoma no es un error: es un negocio que sale del alta diciendo que los
martes da Yoga cuando quiso decir Cerámica.

**Por qué pasa:** PostgreSQL **no garantiza** el orden de salida de `INSERT … RETURNING` con
múltiples filas. Los maintainers lo rechazaron explícitamente como garantía documentada ("row order
is never guaranteed without an ORDER BY"), y dejaron abierta la puerta a que optimizaciones futuras
(inserción paralela) rompan la correspondencia léxica con la lista `VALUES`.
[CITED: https://www.postgresql.org/message-id/19445.1350482182%40sss.pgh.pa.us · https://www.postgresql.org/message-id/CAMsr%2BYEn5TOuhv_tTwY70S1zXf8jCQ-uixU8aOs4OQs7kojf6Q%40mail.gmail.com]

**Cómo evitarlo:** generar el `uuid` en el cliente (Pattern 2) ⇒ no hay nada que correlacionar. Si se
elige el fallback, insertar **de a uno** con `.select().single()`.

**Señales de alarma:** cualquier línea del plan con la forma `data[i].id` o
`insertedServices.map((s, i) => …)`. Y un test que "pasa" con 1 solo servicio: el bug necesita ≥2 para
manifestarse, y necesita mala suerte para manifestarse siempre.

---

### Pitfall 2 — `PGRST202`: el RPC no expuesto se ve como error de red

**Qué sale mal:** el alta llama al RPC y falla con un mensaje genérico; el dueño reintenta para
siempre.

**Por qué pasa:** PostgREST cachea el schema. Si la función existe pero no se corrió
`NOTIFY pgrst, 'reload schema';`, cada llamada devuelve `PGRST202` ("Could not find the function … in
the schema cache"). [CITED: `supabase/migrations/074_save_agenda_blocks.sql:86-91`]

**Cómo evitarlo:** en esta fase **no aplica en producción** (la 074 ya está aplicada y `schema.sql`
está regenerado, `supabase/schema.sql:561`). Pero **sí aplica en local**: si el entorno de desarrollo
no corrió `supabase db reset` desde la 074, el alta va a fallar ahí. El planner debería incluir esa
verificación en el setup del ejecutor.

**Señales de alarma:** `code === 'PGRST202'`. El panel ya lo clasifica y loguea el diagnóstico real
(`agenda-client.tsx:452-454`, `:880-883`) — el alta debería heredar esa rama.

---

### Pitfall 3 — La `<input type="time">` vacía llega a la base como `''`

**Qué sale mal:** el dueño borra una hora; `validateHours()` del alta compara
`b.end_time <= b.start_time`, que con `start_time === ''` da `false` (cualquier cadena no vacía ordena
después de `''`), así que el bloque pasa el filtro. Del otro lado, `(v_item->>'start_time')::time`
revienta con `22007 invalid input syntax for type time: ""` **antes** de que el backstop
`invalid_block` pueda correr, y el dueño se come un error crudo de la base.

**Por qué pasa:** la validación actual del alta (`page.tsx:284-297`) es la **misma** que tenía el panel
antes del fix, y solo valida orden, no forma. [CITED: `lib/agenda-hours-payload.ts:120-133`]

**Cómo evitarlo:** usar `isValidBlockTime()` en `validateHours()`. Es un import de una línea y la
función ya tiene suite.

**Señales de alarma:** un `catch` en el submit que muestra "Error al crear el negocio" con un error
clase `22*` en consola.

---

### Pitfall 4 — Extraer el componente y perder un detalle que la UAT ya aprobó

**Qué sale mal:** durante la extracción alguien "limpia" el `gap-y-0`, mueve el `role="status"` dentro
del flujo, o cambia el umbral de colapso. El panel regresiona en accesibilidad o en layout, y nadie lo
nota porque la fase es del onboarding.

**Por qué pasa:** los tres detalles tienen comentarios que explican por qué son contraintuitivos —
`gap-y-0` porque los botones de 44px ya separan las filas (`agenda-client.tsx:255-258`), el
`role="status"` fuera del flujo porque como item de flex consumiría su gap y correría la fila
(`:316-325`), y los marcados que nunca se colapsan porque AGENDA-05 exige ver qué se da sin abrir nada
(`:293-294`).

**Cómo evitarlo:** extracción **literal**. El plan debería declarar como criterio de verificación que
el diff del componente extraído sea solo imports.

**Señales de alarma:** el diff de `components/agenda/block-services-line.tsx` no es idéntico al bloque
borrado de `agenda-client.tsx`.

---

### Pitfall 5 — El toggle de D-01 apagado borra el trabajo del dueño

**Qué sale mal:** el dueño prende el toggle, mapea cuatro franjas, lo apaga por curiosidad, y el mapeo
desaparece.

**Por qué pasa:** si el toggle se implementa como "control de datos" en vez de "control de UI", apagarlo
limpia los `service_ids`. **D-04 lo prohíbe explícitamente:** *"El toggle es control de UI, no modelo
de datos: solo revela los chips."*

**Cómo evitarlo:** el toggle solo decide si se **renderiza** la línea de chips. El estado
`service_ids` por bloque vive aparte y sobrevive. ⚠ **Pero eso crea la pregunta inversa:** si el
dueño apaga el toggle con mapeo cargado, ¿qué se envía en el submit? Ver §Open Questions Q2 — es la
única ambigüedad real que deja el CONTEXT.

**Señales de alarma:** un `setDayStates(... service_ids: [] ...)` dentro del handler del toggle.

---

### Pitfall 6 — El alta omitida deja el toggle sin nada que mostrar

**Qué sale mal:** el dueño usa "Omitir por ahora" en el paso Servicios (`page.tsx:899-906`), llega a
Horarios, prende el toggle y ve una línea de chips vacía por cada franja — hasta 14 líneas mudas.

**Por qué pasa:** el gating del alta es relajado a propósito (D-02 de la Phase 7): ningún paso salvo
Negocio bloquea el avance.

**Cómo evitarlo:** replicar el **Gate 2** del UI-SPEC de la Phase 19 — con catálogo vacío, ni toggle ni
chips; una sola línea explicativa. En el alta la línea puede además invitar a volver al paso 2 (el
wizard sí tiene "Atrás", a diferencia del panel que linkea a `/servicios`).
[CITED: `.planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-SPEC.md:319-330`]

**Señales de alarma:** el toggle es clickeable con `services.filter(s => s.name.trim()).length === 0`.

---

### Pitfall 7 — Borrar un servicio del paso 2 deja chips huérfanos

**Qué sale mal:** el dueño mapea "Cerámica" al martes, vuelve al paso 2 y borra Cerámica. El
`service_ids` del martes sigue conteniendo ese id; el payload del RPC lo manda; la FK compuesta
`tbs_service_same_tenant` rebota con `23503` y **el guardado entero de la agenda se revierte** (es
todo-o-nada).

**Por qué pasa:** D-08 dice "borrarlo saca sus chips", pero eso hay que **implementarlo**: el
componente `BlockServicesLine` solo pinta lo que está en `catalog`, así que visualmente el chip
desaparece — pero el id sigue en el estado del bloque.

**Cómo evitarlo:** o bien limpiar los `service_ids` en `removeService()`, o bien filtrar contra el
catálogo vigente al armar el payload. **Las dos, idealmente** (la primera es la UX, la segunda es el
backstop). Es el mismo criterio de defensa en profundidad que el proyecto aplica a todo.

**Señales de alarma:** `classifySaveHoursError` devolviendo `'reload'` (mapea `23503` a esa rama,
`agenda-client.tsx:440`) en un alta donde el dueño acaba de borrar un servicio.

---

## Code Examples

### El submit reescrito (esqueleto — los valores vienen de los archivos citados)

```ts
// Source del RPC y su firma: supabase/migrations/074_save_agenda_blocks.sql:110
// Source del payload builder: lib/agenda-hours-payload.ts:161
// Source del precedente de insert: app/(onboarding)/onboarding/page.tsx:356-372 (lo que se reemplaza)

// 3. Servicios — con id generado en el cliente (Pattern 2). `id` es también la clave local de D-08.
const serviciosAInsertar = services
  .filter(s => s.name.trim())
  .map(s => ({
    id: s.id,                    // uuid local, estable desde el paso 2
    name: s.name,
    duration_minutes: s.duration_minutes,
    price: s.price,
    business_id: business.id,    // SIEMPRE el del negocio de esta sesión, nunca del cliente
  }))
const { error: svcErr } = await supabase.from('services').insert(serviciosAInsertar)
if (svcErr) { /* … */ }

// 5. Agenda + mapeo, en UNA transacción.
const idsVigentes = new Set(serviciosAInsertar.map(s => s.id))   // backstop del Pitfall 7
const p_blocks = buildSaveHoursPayload(
  dayStates.map(ds => ({
    enabled: ds.enabled,
    blocks: ds.blocks.map(b => ({
      start_time: b.start_time,
      end_time: b.end_time,
      label: '',
      location_id: '',
      service_ids: canMapServices ? (b.service_ids ?? []).filter(id => idsVigentes.has(id)) : [],
    })),
  })),
  { hasLocations: false },
)
const { error: agendaErr } = await supabase.rpc('save_agenda_blocks', {
  p_business_id: business.id,
  p_blocks,
})
if (agendaErr) {
  console.error('[onboarding/agenda]', agendaErr.code)
  toast.error('Creamos tu negocio, pero no pudimos guardar los horarios. Entrá a Agenda y cargalos.')
  // NO se tira: el negocio ya existe y el alta no es re-entrante.
}
```

⚠ Los nombres de campo de `services` (`name`, `duration_minutes`, `price`, `business_id`) están
verificados contra el DDL: `supabase/schema.sql:1362-1373`, verbatim
`    "name" "text" NOT NULL,` / `    "duration_minutes" integer NOT NULL,` / `    "price" numeric(10,2) NOT NULL,` / `    "business_id" "uuid",`.
`capacity` y `capacity_mode` **no se escriben**: tienen defaults coherentes con el CHECK
(`'individual'` + `1`), verbatim `    "capacity_mode" "text" DEFAULT 'individual'::"text" NOT NULL,` /
`    "capacity" smallint DEFAULT 1 NOT NULL,` — igual que hoy.

### El toggle de D-01 (molde in-repo)

```tsx
// Source: app/(dashboard)/web/_sections/section-forms.tsx:255-273 (molde exacto, copy adaptada)
// "no hay Switch en @/components/ui — mismo patrón segmentado que settings. Touch target ≥ 44px."
<button
  type="button"
  role="switch"
  aria-checked={perFranja}
  aria-pressed={perFranja}
  onClick={() => setPerFranja(v => !v)}
  className={cn(
    'inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    perFranja ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
  )}
>
  {perFranja ? 'Sí' : 'No'}
</button>
```

### Cómo el panel lee la puente (para el read-path del dashboard, sin cambios en esta fase)

```ts
// Source: app/(dashboard)/agenda/page.tsx:60 (verbatim)
supabase.from('time_block_services').select('business_id, time_block_id, service_id').eq('business_id', business.id),
```

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---------------|----------------|---------------|----------------------|
| `time_blocks.insert()` + `.delete()` desde el cliente | RPC `save_agenda_blocks` (una transacción, diff, devuelve el set) | migr. **074**, Phase 19 (v0.28) | **El cambio central del plan.** El CONTEXT fue escrito sin contemplarlo |
| Cupo en `time_blocks.capacity` | Cupo en `services.capacity`; la columna del bloque ya no decide | migr. **068**, v0.27 | El alta debe **dejar de escribir** `capacity: 1` (`page.tsx:383`) — sale gratis al usar el RPC (D-12) |
| Servicio sin franja = invisible en el público | Servicio sin franja = deshabilitado con `'Sin horarios disponibles'` | Phase 20 (v0.28) | Es la razón de existir del aviso de D-07 |
| Vistas `public_*` con `GRANT ALL` a `anon` | `GRANT SELECT` (las seis vistas) | migr. **072** | No aplica acá (el alta no lee vistas públicas), pero explica por qué la 071 tiene una corrección escrita en su cabecera |
| Funciones nuevas ejecutables por `anon` por default | `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM "anon"` | migr. **074** §3 | Si el planner propusiera una función nueva (no debería), necesitaría `GRANT` explícito |

**Deprecado / desactualizado:**

- **La "restricción dura" de `21-CONTEXT.md:169-176`** — describe un problema que la migr. 074 ya
  resolvió. Sigue siendo cierta la mitad de `services` (ahí sí hacen falta los ids), no la de
  `time_blocks`.
- **`21-CONTEXT.md:82` y `:112` nombran `isServiceScheduled`** para el aviso — corresponde
  `hasScheduleCoverage` (ver Pattern 6).
- **Las líneas que cita el CONTEXT tienen drift:** dice `services.insert(...)` en `:353`; la línea real
  es **`:356`** [VERIFIED: `grep -n "from('services').insert"` → `356`]. `time_blocks.insert` en
  `:388` sí coincide. El planner debe re-verificar las líneas antes de editar.

---

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|-------|---------|--------------------|
| A1 | `crypto.randomUUID()` está disponible en todos los navegadores objetivo del alta (requiere secure context: HTTPS o localhost). No se midió el soporte real del parque de usuarios. | Pattern 2 | El alta rompe en un navegador viejo o en un origen no seguro. Mitigación barata: `globalThis.crypto?.randomUUID?.() ?? fallback`, como hace `lib/landing/editor-upload.ts`. |
| A2 | Insertar `services` con un `id` provisto por el cliente no viola ninguna política ni constraint del proyecto. Verificado contra el DDL y los triggers, **no** ejecutado contra una base. | Pattern 2 | Si algo lo rechaza, el fallback (insert por servicio con `.select().single()`) está documentado y es de menor novedad. |
| A3 | El aviso de D-07 se computa solo sobre los servicios con `name.trim()` no vacío (las filas vacías se ignoran, igual que hace `handleFinish`). Es una interpretación razonable, no una decisión escrita en el CONTEXT. | Pattern 6 | El dueño ve un aviso sobre una fila que ni cargó. |
| A4 | `ServiceCatalogItem` solo lo importa `app/(dashboard)/agenda/page.tsx`. Se leyó ese archivo, **no** se corrió un grep exhaustivo del repo. | Runtime State Inventory | Un import roto ⇒ fallo de `tsc`, detectado en el primer build. Barato. |
| A5 | El entorno local del ejecutor tiene las migraciones hasta la 076 aplicadas (`supabase db reset`). No se verificó el estado de la base local en esta sesión. | Pitfall 2 | El alta falla con `PGRST202` en desarrollo y se diagnostica como bug del plan. |
| A6 | La UAT de esta fase se puede correr en local con el negocio semilla; no se verificó que el seed (`supabase/seed.sql`) permita crear un negocio NUEVO desde el alta sin chocar con el slug del seed. | Open Questions | Fricción de UAT, no de código. |

---

## Open Questions

1. **¿Se acepta generar el `uuid` del servicio en el cliente?** — ✅ **RESUELTA 2026-09-11: SÍ.** Confirmado por el dueño al planificar; ver **D-09** en `21-CONTEXT.md`. El fallback queda registrado ahí por si el plan-check lo rechaza.
   - Lo que sabemos: es el camino que elimina la correlación, cumple D-08 literalmente y arregla el
     `key={i}` del paso 2. La columna lo admite y no hay trigger que interfiera.
   - Lo que no está claro: es el **único patrón sin precedente in-repo** que introduce esta fase.
   - Recomendación: tomarlo, y dejar registrado el fallback (insert por servicio con
     `.select().single()`, molde `settings-client.tsx:1353-1355`) por si el plan-check lo rechaza.
     Es una decisión de una línea que cambia la forma de todo el submit — conviene resolverla **antes**
     de escribir los planes, no durante.

2. **Si el dueño apaga el toggle de D-01 con mapeo ya cargado, ¿qué se persiste?** — ✅ **RESUELTA 2026-09-11: se persiste COMODÍN.** Confirmado por el dueño al planificar; ver **D-10** en `21-CONTEXT.md`.
   - Lo que sabemos: D-04 dice que el toggle es control de UI y que el estado sobrevive al apagado.
     D-02 dice que el toggle arranca apagado = todo comodín.
   - Lo que no está claro: las dos cosas juntas no determinan el submit. Si el toggle está apagado al
     finalizar, ¿se manda el mapeo que quedó en el estado (el dueño "declaró" y después ocultó) o se
     manda comodín (lo que la pantalla le está mostrando)?
   - Recomendación: **enviar comodín** — el principio del panel es *"lo que veo es lo que queda"*
     (`lib/agenda-hours-payload.ts:150-153`), y persistir algo que la pantalla no muestra es la
     definición de dato que se pierde sin ruido, al revés. El esqueleto de §Code Examples ya lo
     implementa así (`canMapServices ? … : []`). **Es una decisión de producto: confirmarla con el
     dueño antes de planificar.**

3. **¿El mapeo es parte del núcleo del submit o best-effort?**
   - Lo que sabemos: los precedentes best-effort del alta (logo, `linkLeadOnSignup`) existen porque el
     negocio **ya está creado** y bloquear el redirect empeora la situación.
   - Lo que no está claro: con el RPC, mapeo y horarios son la misma escritura — no se pueden separar.
   - Recomendación: chequear el error, avisar con copy honesta, **no tirar**. Ver Pattern 1.

4. **¿Dónde vive el componente extraído?**
   - Lo que sabemos: no puede quedar en `app/(dashboard)/agenda/`; el repo tiene
     `components/dashboard/` y `components/crm/` como precedentes de agrupación por dominio.
   - Recomendación: `components/agenda/block-services-line.tsx`. Es discreción del planner; lo único
     no negociable es que salga del route group del dashboard.

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|-------------|---------------|------------|---------|----------|
| Migraciones 071/073/074 en **producción** | El write path del mapeo | ✓ | 071-076 aplicadas (registrado en `STATE.md` del workstream y confirmado porque `supabase/schema.sql:561` contiene la función) | — |
| Migraciones 071/073/074 en **local (PG17)** | Ejecutar y UATear la fase | ⚠ sin verificar en esta sesión | — | `supabase db reset` antes de ejecutar (ver A5 / Pitfall 2) |
| `@supabase/supabase-js` | Todo el write path | ✓ | `^2.106.2` (`package.json`) | — |
| Vitest | Tests puros del mapeo (opcional) | ✓ | Configurado en `vitest.config.mts`, `npm test` → `vitest run` | — |
| Paquetes externos nuevos | — | N/A | — | — |

**Dependencias faltantes sin fallback:** ninguna.
**Dependencias faltantes con fallback:** el estado de la base local — resuelto con `supabase db reset`.

---

## Security Domain

> `security_enforcement: true`, `security_asvs_level: 1` [VERIFIED: `.planning/config.json` —
> `"security_enforcement": true`, `"security_asvs_level": 1`]. **Relevancia declarada por el ROADMAP:
> Media.**

### Applicable ASVS Categories

| Categoría ASVS | Aplica | Control estándar en esta fase |
|----------------|--------|-------------------------------|
| V2 Authentication | sí (heredado) | `supabase.auth.getUser()` antes de escribir (`page.tsx:295-296`); el RPC exige rol `authenticated` |
| V3 Session Management | no | Lo resuelve `@supabase/ssr` + `proxy.ts`; la fase no lo toca |
| V4 Access Control | **sí — el eje central** | RLS por `business_id` en `services`, `time_blocks` y `time_block_services` + guard de autoría `not_your_business` dentro del RPC + FK compuestas `tbs_block_same_tenant` / `tbs_service_same_tenant` (migr. 073). Tres capas independientes. |
| V5 Input Validation | sí | El backstop vive **en la base** (`invalid_payload`, `invalid_block`, `day 0..6`, `start < end`); el cliente valida para dar feedback, no para defender. Agregar `isValidBlockTime` cierra el hueco del `''`. |
| V6 Cryptography | no | Nada de cripto. `crypto.randomUUID()` es generación de id, no un secreto |

### Known Threat Patterns para este stack

| Patrón | STRIDE | Mitigación estándar |
|--------|--------|---------------------|
| Payload forjado con `time_block_id` de otro negocio (los ids de `time_blocks` son **públicos**: `public read time_blocks` con `USING (true)`) | Tampering / Elevation | El RPC filtra por `business_id` en cada WHERE/INSERT **además** de la RLS; ya cubierto y testeado (`test/agenda-save-blocks-rpc.test.ts`, casos 5 y 6). En el alta el vector es igual de realizable que en el panel, y la mitigación es la misma porque es el mismo RPC |
| Payload con `service_id` de otro negocio (`public_services` los expone) | Tampering | FK compuesta `tbs_service_same_tenant` — rechazo en la base, no en el cliente |
| `business_id` ajeno en el parámetro del RPC | Elevation of Privilege | `RAISE EXCEPTION 'not_your_business'` (074:149) + RLS por INVOKER |
| Service role filtrado al bundle del cliente | Information Disclosure | **N/A por construcción**: el alta usa `@/lib/supabase/client` (anon key). Si un plan propone service-role acá, es un blocker |
| Escritura anónima al mapeo | Elevation | `REVOKE EXECUTE … FROM "anon"` sobre el RPC (074:326) + la puente no tiene policy `anon` (071) |
| Mensaje crudo de Postgres en la UI (nombres de tabla/constraint) | Information Disclosure | `classifySaveHoursError` devuelve un código de dominio; la copy la pone el call site |

**Riesgo preexistente que esta fase NO toca y NO empeora:** `book_slot_atomic` ejecutable por `anon`
(RA-05, severidad alta, del milestone anterior). Esta fase no agrega ninguna función ni ningún grant.
[CITED: `.planning/workstreams/motor-reservas/REQUIREMENTS.md:122-127`]

**Nota para `secure-phase`:** el ROADMAP no marca `secure-phase` obligatorio para la Phase 21 (solo lo
hizo para la 18). La superficie nueva es cero — se reusa un write path ya auditado en la Phase 19
(`19-SECURITY.md`, T-19-05 a T-19-10). El planner puede proponer un `secure-phase` liviano centrado en
un solo punto: **que el `business_id` que viaja al RPC salga siempre de `business.id` de esta sesión y
nunca del estado del formulario.**

---

## Sources

### Primary (HIGH confidence) — leídos en esta sesión

- `supabase/migrations/074_save_agenda_blocks.sql` (completo) — firma, modo de seguridad, códigos de error, grants, runbook
- `supabase/migrations/071_time_block_services.sql` (completo) — DDL de la puente, 4 policies, vista acotada
- `supabase/schema.sql` — policies `:2401-2403`, `:2425-2427`, `:2555`, `:2606-2618`; DDL `services` `:1361-1377`, `time_blocks` `:1485-1496`, `time_block_services` `:869-873`; FK compuestas `:1937`, `:1942`; función `:561`, `:4116-4117`; triggers `:1853`, `:1857`
- `app/(onboarding)/onboarding/page.tsx` — submit `:293-410`, `visibleSteps` `:416-433`, paso 4 `:806-880`, paso 2 `:675-700`, handlers `:164-240`
- `app/(dashboard)/agenda/agenda-client.tsx` — `ServiceCatalogItem` `:71-75`, `CHIPS_COLLAPSED_MAX` `:183`, `isDraftBlockWildcard` `:194-200`, `ServiceChip` `:201-250`, `BlockServicesLine` `:260-368`, `classifySaveHoursError` `:433-456`, `SAVE_HOURS_REJECT_COPY` `:468-474`, `toggleBlockService` `:740-753`, `saveHours` `:841-925`, call site `:1528-1536`
- `lib/time-block-services.ts` (completo) — contrato D-16, las 8 funciones puras
- `lib/agenda-hours-payload.ts` (completo) — tipos y builders del payload/retorno
- `lib/types.ts:180-184` — `TimeBlockService`
- `app/(dashboard)/agenda/page.tsx:40-90` — read path del panel
- `app/(dashboard)/settings/settings-client.tsx:1335-1372` — precedente `insert().select().single()` sobre `services`
- `app/[slug]/booking-client.tsx:555-640` — el consumidor público y su copy
- `app/(dashboard)/web/_sections/section-forms.tsx:238-273` — el toggle `role="switch"`
- `.planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-SPEC.md` — gates de visibilidad, umbral, empty state, copy
- `.planning/workstreams/motor-reservas/phases/19-el-panel/19-PATTERNS.md` — clasificación de archivos de la Phase 19
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md`, `.../STATE.md`, `.../phases/21-.../21-CONTEXT.md`
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas duras 1-4
- `package.json`, `vitest.config.mts`, `test/env.ts`, `.planning/config.json`

### Secondary (MEDIUM confidence)

- postgresql.org mailing list — orden de `INSERT … RETURNING` no garantizado
  (https://www.postgresql.org/message-id/19445.1350482182%40sss.pgh.pa.us ·
  https://www.postgresql.org/message-id/CAMsr%2BYEn5TOuhv_tTwY70S1zXf8jCQ-uixU8aOs4OQs7kojf6Q%40mail.gmail.com)

### Tertiary (LOW confidence)

- Ninguna afirmación de este documento se apoya solo en búsqueda web sin confirmar contra el repo.

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — no hay stack nuevo; todo verificado contra `package.json` y los imports reales
- **Architecture / write path:** HIGH — el RPC, su firma, su modo de seguridad y sus grants se leyeron verbatim de la migración y están confirmados en `schema.sql`
- **RLS / policies:** HIGH — las policies se citaron verbatim de `schema.sql`
- **Extracción del componente (D-05):** HIGH — los dos componentes se leyeron enteros; son puros sobre props
- **Correlación de servicios:** MEDIUM-HIGH — la evidencia negativa (el orden no está garantizado) es de fuente primaria de PostgreSQL; la solución recomendada (uuid en el cliente) no tiene precedente in-repo y es la única pieza que requiere decisión (Q1)
- **Pitfalls:** HIGH — cinco de los siete están documentados con nombre propio en comentarios del repo (CR-01, P-01, P-03, `22007`, `PGRST202`)
- **Copy y UX:** MEDIUM — es discreción de Claude por diseño; el UI-SPEC de la Phase 19 fija los límites

**Research date:** 2026-09-11
**Valid until:** 2026-10-11 (30 días — el dominio es in-repo y estable; se invalida si aparece una migración 077+ que toque `time_blocks`, `services` o `time_block_services`)
