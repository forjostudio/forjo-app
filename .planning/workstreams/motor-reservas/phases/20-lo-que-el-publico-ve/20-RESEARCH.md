# Phase 20: Lo que el público ve — Research

**Researched:** 2026-09-03
**Domain:** Booking público (RSC + client component) sobre el mapeo franja↔servicio ya modelado (migr. 071) y configurable (Phase 19)
**Confidence:** HIGH (todo verificado leyendo el repo; cero dependencia de conocimiento externo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — La fase se PARTIÓ: público (20) y onboarding (21)**

El roadmap ya marcaba la fase original como candidata a partirse por tener tres superficies. Se
partió, y el corte no fue arbitrario: **los requisitos ya venían separados**. AGENDA-07 son los
criterios de booking público; AGENDA-08 es el del onboarding. La landing no estaba en ninguno de los
dos — se agregó como ampliación en el `discuss-phase 18`.

La costura real es el **verbo**: booking y landing **consumen** el mapeo y se lo muestran a un
anónimo; el onboarding lo **declara** durante el alta. Distinto momento, distinto actor, distinto
riesgo. La 20 queda del tamaño de la 19, que salió bien.

**D-02 — El vacío se resuelve en el SELECTOR, no en el calendario**

Un servicio que ninguna franja cubre queda **deshabilitado en el selector de servicios**, con el
motivo visible debajo ("Sin horarios disponibles" o equivalente). No se oculta y no se deja avanzar.

**Hay molde propio, en la misma pantalla:** el picker de consultorios ya hace exactamente esto
(`booking-client.tsx`, paso 3 — `disabled={!enabled}` + `{!enabled && <p>Sin horarios
disponibles</p>}`). Reusar ese patrón, no inventar uno.

**Por qué no ocultarlo:** el dueño no se enteraría de que su servicio quedó invisible. Es exactamente
el modo de falla que este milestone viene evitando — un estado mal configurado que se ve igual que
uno correcto (mismo criterio que AGENDA-06 con el chip "cualquiera").

**Por qué no dejarlo avanzar y explicar en el calendario:** hace que el cliente recorra dos pasos
para chocarse con una pared. El requisito pide que el vacío se explique, no que se explique tarde.

**D-03 — La landing NO cambia**

`lib/landing/derive.ts` sigue publicando la **unión** de `time_blocks` como "horarios de atención".

"Horarios de atención" significa *cuándo el negocio está abierto*, y la unión de sus franjas sigue
siendo exactamente eso aunque cada franja dé servicios distintos. El booking sigue siendo la fuente
de verdad de **qué** se puede reservar **cuándo**, que es donde el cliente decide de verdad.

Consistente con el D-02 del milestone (el estado neutro es el estado actual): cero cambio, cero
regresión. La landing es superficie de **marketing**, no de reservas, y pedirle el rigor del booking
sería contraproducente.

**Descartado y por qué:** listar por servicio (sección nueva en el renderer, y con muchos servicios
se vuelve una tabla larga en una página que debería vender); ocultar la sección si hay mapeo (le saca
información útil justo a los negocios que más la necesitan); cambiar el rótulo (cosmético).

### Claude's Discretion

El CONTEXT no abre una sección de discreción explícita. Lo que queda a criterio del planner (y este
research recomienda con trade-off explícito, sección "Architecture Patterns"):

- **De dónde sale el dato** para deshabilitar (RSC vs. fetch) — el CONTEXT no lo fija.
- **La copy exacta** del motivo (el CONTEXT dice "Sin horarios disponibles" *o equivalente*).
- **Si el filtro llega al calendario a nivel DÍA** (ver HALLAZGO-01: es criterio 1 de AGENDA-07, no
  contradice ningún D, pero el CONTEXT solo habló del selector).

### Deferred Ideas (OUT OF SCOPE)

- **El onboarding** → Phase 21 (AGENDA-08).
- **Una persona puede ocupar todos los cupos de una clase grupal** → sigue en
  `todos/pending/2026-08-16-...`. Su propio análisis pide **fase propia** y `secure-phase`: son cinco
  decisiones abiertas (qué identifica a una persona, bloqueo vs aviso, setting por negocio, si el
  control vive dentro del RPC atómico, y cómo no romper los abonos). ⚠ Vale saber que hoy, **desde la
  superficie pública anónima, alguien puede vaciar la agenda de un negocio sin costo**; el único
  freno es reCAPTCHA v3, que mide *bot*, no *duplicado*.
- **El gate de modo esquivable moviendo `services.business_id`** → `todos/pending/2026-08-18-...`, con
  el mecanismo ya corregido (el fix es un trigger, NO un `WITH CHECK`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENDA-07 | El cliente que elige un servicio ve **solo** los horarios donde ese servicio se da. Si un servicio no tiene ninguna franja que lo cubra, el vacío se explica en vez de mostrar un calendario mudo. | **Criterio 1 (slots):** ya cerrado server-side por la Phase 18 (`startTimesNotOffered` en `availability/route.ts:161-186`) — VERIFICADO. **Criterio 1 (días):** hueco abierto, ver HALLAZGO-01. **Criterio 2 (el vacío se explica):** `isServiceScheduled` de `lib/time-block-services.ts:111` + el molde del picker de consultorios (`booking-client.tsx:659-678`) + el dato del RSC vía `public_time_block_services` (migr. 071 §3, ya en prod). |
</phase_requirements>

## Summary

La fase está **mucho más cerca de lo que parece**, y el motivo es que la Phase 18 dejó preparado
casi todo el andamiaje a propósito. Los tres bloques que suelen ser el trabajo pesado ya existen y
están en producción: (1) la regla del comodín como **fuente única pura** en
`lib/time-block-services.ts`, con la función exacta que esta fase necesita — `isServiceScheduled` —
ya escrita y **ya testeada** (`test/time-block-services.test.ts:74-100`); (2) la **vista acotada
`public_time_block_services`**, creada por la migr. 071 §3 explícitamente *"para el RSC público de
la Phase 20"*, con `GRANT SELECT` a `anon` corregido por la migr. 072 y **ya aplicada a prod**
(verificado en `supabase/schema.sql:4356`); y (3) el **molde visual** del vacío, en la misma
pantalla, en el picker de consultorios del paso 3.

O sea: **esta fase no necesita migración nueva** (la próxima libre sigue siendo la 077), **no
necesita endpoint nuevo**, **no necesita dependencia nueva** y **no necesita reimplementar ninguna
regla**. El trabajo real es una query aditiva al `Promise.all` de `app/[slug]/page.tsx`, una prop
nueva a `BookingClient` (espejo exacto de `professionalServices`, migr. 059), y una derivación en el
paso 1 que copia línea por línea el patrón del paso 3.

Lo que sí aparece y el CONTEXT no cubrió: el criterio 1 de AGENDA-07 —*"ve solo los horarios donde
ese servicio se da"*— **está cerrado a nivel horario pero no a nivel día**. El endpoint oculta los
start-times, pero el calendario decide qué días son clickeables con `openDaysSet`, derivado del
`timeBlocks` **completo** del negocio (`booking-client.tsx:184`). Un servicio que solo se da los
martes sigue mostrando el lunes abierto y, al tocarlo, muestra la grilla vacía: un calendario mudo,
justo el síntoma que el requisito nombra. Se cierra con el mismo helper y sin tocar el server (ver
HALLAZGO-01), y hay una prueba algebraica de que **no cambia ni un slot visible** — solo apaga días.

**Primary recommendation:** Sumar `public_time_block_services` al `Promise.all` del RSC
(`app/[slug]/page.tsx:76-98`) y pasarlo como prop `timeBlockServices` a `BookingClient` — molde
literal de `professionalServices` (migr. 059). En el paso 1, derivar por servicio con
`isServiceScheduled(service.id, timeBlocks, timeBlockServices)` y renderizar la tarjeta deshabilitada
con el patrón del picker de consultorios. Cero migración, cero fetch extra, cero flash, cero
dependencia.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Leer el mapeo franja↔servicio para el anónimo | **Frontend Server (RSC)** `app/[slug]/page.tsx` | Database (vista `public_time_block_services`) | La página ya es `force-dynamic` y ya lee 7 fuentes en un `Promise.all`; el mapeo es la 8ª. El aislamiento lo da el `.eq('business_id', ...)` del RSC, igual que las otras 6 vistas `public_*` [VERIFIED: `app/[slug]/page.tsx:61-98`] |
| Interpretar la regla del comodín | **Shared lib pura** `lib/time-block-services.ts` | — | AGENDA-02 prohíbe reimplementarla. Cuatro capas la consumen ya (disponibilidad, backstop del create, panel Phase 19, y ahora el público) [VERIFIED: grep de consumidores] |
| Decidir qué servicio se puede elegir (habilitado/deshabilitado) | **Browser / Client** `booking-client.tsx` paso 1 | Frontend Server (le pasa las filas) | Es estado de UI puro sobre datos ya servidos por el RSC. Mismo tier donde ya vive el gate `capaces`/`showAny` de multi-staff [VERIFIED: `booking-client.tsx:138-167`] |
| Ocultar los horarios que el servicio no tiene | **API / Backend** `app/api/booking/availability/route.ts` | — | **Ya hecho** en la Phase 18 con `startTimesNotOffered`. Esta fase NO lo toca [VERIFIED: `availability/route.ts:161-186`] |
| Rechazar una reserva forjada fuera de franja | **API / Backend** `lib/booking-core.ts` | Database (RLS + migr. 076) | **Ya hecho** (backstop D-04, `service_not_scheduled`). Esta fase NO lo toca [VERIFIED: `lib/booking-core.ts:240-264`] |
| Publicar "horarios de atención" en la landing | **Frontend Server** `lib/landing/derive.ts` | — | **NO SE TOCA** (D-03). Es superficie de marketing; publica la unión de `time_blocks` y sigue siendo verdad [VERIFIED: `lib/landing/derive.ts:51-59`] |

## Standard Stack

### Core

**Ninguna librería nueva.** Todo lo que esta fase necesita ya está instalado y en uso en los archivos
que toca.

| Módulo | Versión / origen | Purpose | Why Standard |
|--------|------------------|---------|--------------|
| `lib/time-block-services.ts` | interno, migr. 071 / Phase 18 | La regla del comodín (fuente única) | AGENDA-02 lo exige explícitamente: cuatro capas tienen que interpretar la regla idéntico o derivan [VERIFIED: cabecera del módulo, `:3-28`] |
| `lib/staff-services.ts` | interno, migr. 057 / v0.25 | El molde del que salió el anterior; `bookableServices` ya se usa en el mismo `page.tsx` | Precedente vivo del mismo problema un nivel al lado [VERIFIED: `app/[slug]/page.tsx:9,141`] |
| `@supabase/ssr` (cliente público) | `^0.10.3` vía `lib/supabase/public.ts` | Leer vistas `public_*` con anon key sin cookies | Ya es el cliente del RSC público [VERIFIED: `app/[slug]/page.tsx:1,56`] |
| React 19 + Next 16.2.7 (App Router) | `package.json` | RSC + client component | Stack del proyecto [VERIFIED: `.claude/CLAUDE.md`] |
| `vitest` | `^4.1.9`, config `vitest.config.mts` | Tests | Suite existente, 279 líneas ya cubren este módulo [VERIFIED: `test/time-block-services.test.ts`] |

### Supporting

| Módulo | Purpose | When to Use |
|--------|---------|-------------|
| `cn()` de `@/lib/utils` | Componer clases condicionales de la tarjeta deshabilitada | Ya importado en `booking-client.tsx:18` |
| `resolveVertical` / `terminology` | Nombrar "servicio"/"prestación"/"cancha" en la copy | Ya importado en `booking-client.tsx:17`; el UI-SPEC de la 19 fija la regla de género (evitar el artículo antes de la interpolación) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Query nueva en el `Promise.all` del RSC | Endpoint nuevo `/api/booking/service-coverage` + fetch en cliente | Roundtrip extra, **flash** de tarjetas habilitadas→deshabilitadas, superficie pública nueva que auditar. Sin beneficio: la página ya es `force-dynamic` y ya paga 7 queries paralelas |
| Pasar las filas puente (`timeBlockServices`) | Pasar un `string[]` de ids sin cobertura, computado en el RSC | Menos bytes, pero **rompe el molde**: `professionalServices` ya viaja como filas y el cliente lo interpreta con el helper (`professionalsForService`, `:139`). Filas + helper mantiene UNA interpretación; ids precomputados crean un segundo lugar donde la regla se aplica. Además, el filtro por DÍA (HALLAZGO-01) necesita las filas, no el booleano |
| `isServiceScheduled` | `blocksForService(...).length > 0` inline | Es literalmente la implementación de `isServiceScheduled` (`:116`) — usar el helper nombrado documenta la intención y evita divergencia |

**Installation:**

```bash
# Nada. Cero paquetes nuevos en esta fase.
```

## Package Legitimacy Audit

**No aplica: esta fase no instala ningún paquete externo.** No hay `npm install`, no hay componente
de registry nuevo (el UI-SPEC de la Phase 19 ya dejó constancia de que `components.json →
"registries": {}` está vacío y verificado). El gate de legitimidad de paquetes queda en N/A por
ausencia de superficie.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| — | — | — | Sin paquetes que auditar |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                            ┌──────────────────────────────────────────┐
   Cliente anónimo  ───────▶│  GET /[slug]   (RSC, force-dynamic)      │
                            │  app/[slug]/page.tsx                      │
                            └───────────────┬──────────────────────────┘
                                            │ Promise.all (anon key, sin cookies)
                    ┌───────────────────────┼───────────────────────────────┐
                    ▼                       ▼                               ▼
        public_services            time_blocks                  public_professional_services
        public_professionals       schedule_exceptions           public_canchas
        locations                                          ▼ (LO QUE FALTA AGREGAR)
                                                    public_time_block_services   ← migr. 071 §3
                                                    (GRANT SELECT anon, migr. 072)   YA EN PROD
                    └───────────────────────┬───────────────────────────────┘
                                            │  props (filas planas, sin recomputar nada)
                                            ▼
                            ┌──────────────────────────────────────────┐
                            │  BookingClient  ('use client')            │
                            │                                           │
                            │  Paso 1 · Servicio                        │
                            │    isServiceScheduled(svc, blocks, bridge)│──┐
                            │    false ⇒ tarjeta disabled + motivo      │  │
                            │                                           │  │
                            │  Paso 2 · Profesional (capaces)           │  │ MISMA fuente
                            │  Paso 3 · Consultorio (molde del vacío)   │  │ lib/time-block-
                            │  Paso 3 · Calendario                      │  │ services.ts
                            │    openDaysSet ← time_blocks (HALLAZGO-01)│──┤ (AGENDA-02)
                            │           │ elegir día                    │  │
                            └───────────┼───────────────────────────────┘  │
                                        ▼                                  │
                    GET /api/booking/availability?serviceId=…              │
                    (service role · lee time_block_services directo)       │
                      startTimesNotOffered → `full` = horarios a ocultar ──┘
                                        │
                                        ▼  el cliente arma la grilla y resta `full`
                              Paso 4 · Datos → POST /api/booking/create
                                        │
                                        ▼
                              lib/booking-core → isServiceAllowedAt (backstop D-04)
                                        │  rechazo ⇒ 400 service_not_scheduled
                                        ▼  (copy ya existe: booking-client.tsx:420-431)
```

### Estructura de archivos (qué se toca y qué no)

```
app/[slug]/
├── page.tsx                 # +1 query al Promise.all, +1 prop a BookingClient
├── booking-client.tsx       # +1 prop, +1 derivación en paso 1, (opcional) filtro de días
└── canchas-booking-client.tsx   # NO SE TOCA — nunca manda serviceId (verificado :11,:237)

lib/
├── time-block-services.ts   # NO SE TOCA — ya exporta todo lo necesario
└── landing/derive.ts        # NO SE TOCA — D-03

supabase/migrations/         # NO SE TOCA — no hace falta migración (071/072 ya en prod)

test/
├── time-block-services.test.ts        # existe; isServiceScheduled ya cubierto (:74-100)
└── service-coverage-public.test.ts    # EL MOLDE a extender (mismo bug, eje staff)
```

### Pattern 1: La vista acotada `public_*` leída desde el RSC

**What:** El anónimo no lee la tabla puente (no tiene policy). Lee una VIEW `OWNER postgres`, sin
`security_invoker`, con `GRANT SELECT` (nunca `ALL`), y el aislamiento efectivo lo pone el
`.eq('business_id', ...)` del RSC.

**When to use:** Siempre que el booking público necesite un dato que vive en una tabla con RLS por
tenant. Es el patrón del repo desde la migr. 059 y el único aprobado tras el CR-01 de la Phase 18.

**Estado para esta fase:** ✅ **la vista ya existe y ya está en prod.** No hay migración que escribir.

```sql
-- Source: supabase/migrations/071_time_block_services.sql:144-151 (VERIFICADO en supabase/schema.sql:1426)
CREATE OR REPLACE VIEW "public"."public_time_block_services" AS
 SELECT "business_id", "time_block_id", "service_id"
   FROM "public"."time_block_services";
ALTER VIEW "public"."public_time_block_services" OWNER TO "postgres";

-- Source: supabase/migrations/072_public_views_read_only.sql:103-106 (VERIFICADO en schema.sql:4356)
REVOKE ALL ON TABLE "public"."public_time_block_services" FROM "anon";
GRANT SELECT ON TABLE "public"."public_time_block_services" TO "anon";
```

La propia migr. 071 lo escribió como intención declarada:

> *"Todavía NO tiene consumidor en esta fase: `/api/booking/availability` corre con service role y lee
> la tabla base directo; **la vista es para el RSC público de la Phase 20**."*
> — `071_time_block_services.sql:139-143` [VERIFIED: lectura directa del archivo]

### Pattern 2: Prop de mapeo + helper puro en el cliente (molde `professionalServices`)

**What:** El RSC pasa las **filas planas** de la vista; el client component interpreta con el helper
puro. Nunca un `.filter()` inline en el JSX (AGENDA-02).

**Example — el precedente exacto que hay que espejar:**

```tsx
// Source: app/[slug]/page.tsx:91-97 (VERIFICADO)
    // Vista pública acotada (migración 059): mapeo staff↔servicios (business_id, professional_id,
    // service_id), SIN abrir la tabla puente `professional_services` a anon (D-07). La consume
    // BookingClient con la regla del comodín (lib/staff-services) para gatear "Cualquiera" (≥2
    // capaces, D-02) y filtrar la lista al servicio elegido. Fail-safe: si la vista todavía no está
    // aplicada en la DB, el select devuelve []/error y el `|| []` lo neutraliza — el booking sigue
    // funcionando (sin la vista, "Cualquiera" simplemente no se gatea con precisión).
    supabase.from('public_professional_services').select('*').eq('business_id', business.id),
```

```tsx
// Source: app/[slug]/booking-client.tsx:31-34 (la prop, VERIFICADO)
  // Mapeo staff↔servicios (vista acotada public_professional_services, migr. 059). Se interpreta con
  // la regla del comodín (lib/staff-services): 0 filas para un profesional = capaz de todos. Sirve
  // para filtrar la lista de profesionales al servicio elegido y gatear "Cualquiera" (≥2 capaces).
  professionalServices: ProfessionalService[]
```

```tsx
// Source: app/[slug]/booking-client.tsx:138-140 (el consumo, VERIFICADO)
  const capaces = selectedService
    ? professionalsForService(selectedService.id, professionals, professionalServices)
    : professionals
```

El fail-safe del `|| []` es **doblemente importante acá**: con la puente vacía (o ilegible) la regla
del comodín devuelve "todo agendado" ⇒ ninguna tarjeta se deshabilita ⇒ el booking se comporta
exactamente como hoy. La degradación es hacia el estado actual, por construcción (D-02 del
milestone).

### Pattern 3: El molde del vacío — el picker de consultorios (D-02 manda copiarlo)

Este es el código **literal** que el CONTEXT ordena reusar, con números de línea reales:

```tsx
// Source: app/[slug]/booking-client.tsx:655-681 (VERIFICADO — paso 3, picker de consultorios)
        {step === 3 && needLocStep && !bookingLoc && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí el {locWord.toLowerCase()}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {bookableLocs.map(l => {
                const enabled = locHasBlocks(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => { setBookingLoc(l.id); setSelectedDate(undefined); setSelectedTime('') }}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                      enabled ? 'border-border bg-card hover:border-primary' : 'border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed'
                    )}
                  >
                    <p className="font-semibold">{l.name}</p>
                    {l.address && <p className="text-sm text-muted-foreground mt-0.5">{l.address}</p>}
                    {l.phone && <p className="text-xs text-muted-foreground mt-0.5">{l.phone}</p>}
                    {!enabled && <p className="text-xs text-muted-foreground mt-1">Sin horarios disponibles</p>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
```

Las tres piezas trasladables, exactas:

| Pieza | Valor literal |
|-------|---------------|
| Estado | `const enabled = locHasBlocks(l.id)` → pasa a ser `isServiceScheduled(service.id, timeBlocks, timeBlockServices)` |
| Deshabilitado | `disabled={!enabled}` sobre el `<button>` |
| Clases | `enabled ? 'border-border bg-card hover:border-primary' : 'border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed'` |
| Motivo | `{!enabled && <p className="text-xs text-muted-foreground mt-1">Sin horarios disponibles</p>}` |

Y así se ve **hoy** la tarjeta del paso 1 que hay que modificar (nótese que el `<button>` no tiene
`type` ni `disabled`, y que el `onClick` avanza a `setStep(2)` incondicionalmente):

```tsx
// Source: app/[slug]/booking-client.tsx:539-575 (VERIFICADO — paso 1, el selector de servicio)
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">Elegí tu servicio</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {services.map(service => (
                <button
                  key={service.id}
                  onClick={() => { setSelectedService(service); setBookingLoc(null); setSelectedDate(undefined); setSelectedTime(''); setStep(2) }}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    selectedService?.id === service.id
                      ? 'border-primary bg-primary/[0.06]'
                      : 'border-border bg-card hover:border-primary'
                  )}
                >
                  {/* … título + descripción a la izquierda; precio + duración a la derecha … */}
                </button>
              ))}
            </div>
          </div>
        )}
```

⚠ **Un detalle que el molde del paso 3 no cubre:** la tarjeta del paso 1 tiene un tercer estado
(seleccionada, `border-primary bg-primary/[0.06]`). El `cn()` del paso 1 hoy es un ternario de dos
ramas; con `disabled` pasa a tres estados y hay que decidir la precedencia. Recomendación:
`disabled` gana sobre `selected` — un servicio sin cobertura no puede quedar seleccionado (el
`onClick` no corre), así que la rama seleccionada es inalcanzable y el orden correcto es
`!enabled → estilo apagado` primero.

### Anti-Patterns to Avoid

- **Reimplementar la regla del comodín en el JSX** (`bridge.filter(r => r.service_id === s.id).length > 0`): es una SEGUNDA interpretación. AGENDA-02 lo prohíbe explícitamente y la cabecera de `servicesOfBlock` lo nombra palabra por palabra [VERIFIED: `lib/time-block-services.ts:202-206`].
- **OCULTAR el servicio sin cobertura** (`services.filter(...)`): contradice D-02 y repite el modo de falla que el milestone viene cerrando. Ojo: es literalmente lo que hace hoy `bookableServices` en el eje staff — ver HALLAZGO-02.
- **Crear una migración nueva**: la vista ya existe. Escribir una 077 redundante duplica riesgo operativo (se aplican a mano) por cero beneficio.
- **Tocar `lib/landing/derive.ts`**: vetado por D-03. Verificado que hoy no consume la puente para nada (`groupHoursByDay` solo lee `day_of_week`/`start_time`/`end_time` de `time_blocks`, `:51-59`), así que no hay presión técnica para tocarlo.
- **Filtrar en el cliente el `full` que manda el server**: el cliente confía en `full` y nunca recomputa ocupación (D-06 del milestone). Esta fase no cambia ese contrato.
- **Poner `security_invoker` en una vista `public_*`**: con invocador `anon` leería 0 filas siempre y en silencio — indistinguible del comodín. (Regla dura del proyecto, tras CR-01.)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "¿Este servicio tiene alguna franja que lo dé?" | Un `.some()`/`.filter()` sobre la puente en el componente | `isServiceScheduled(serviceId, blocks, bridge)` — `lib/time-block-services.ts:111` | Es EXACTAMENTE esta pregunta, ya escrita y ya testeada. Implementada como `blocksForService(...).length > 0` para que las dos respuestas no puedan divergir (`:116`) |
| "¿En qué franjas se da este servicio?" (para filtrar días) | Un filtro propio con la lógica del comodín | `blocksForService(serviceId, blocks, bridge)` — `:87` | El bug que muerde es que el mapeo de OTRA franja no debe afectar a ésta; el helper filtra por `time_block_id` antes de mirar `service_id` y hay test dedicado (`test/time-block-services.test.ts:51`) |
| "¿Qué horarios NO ofrecer?" | Recomputarlo en el cliente | Ya lo hace el server: `startTimesNotOffered` → `full` | La docstring del helper documenta las DOS lecturas ingenuas que están mal (`:150-166`). El cliente no tiene por qué entrar ahí |
| Exponer el mapeo al anónimo | Abrir la tabla base a `anon`, o un endpoint nuevo | Vista `public_time_block_services` (ya creada, ya en prod) | El repo ya pagó el precio de improvisar acá: CR-01 (5 vistas escribibles por anon) se cerró con las migr. 072/073 |
| Copy del error de carrera | Un mensaje nuevo | `service_not_scheduled` ya tiene copy en `booking-client.tsx:420-431` | Cerrado en la Phase 19 (WR-07). No duplicar ni reescribir |

**Key insight:** la Phase 18 escribió la fuente única *anticipando* a esta fase — la cabecera del
módulo nombra a la Phase 20 como consumidor (`lib/time-block-services.ts:9-10`) y la migr. 071 creó
la vista *sin consumidor* para que esta fase no tuviera que migrar nada. Todo lo que esta fase
"invente" es, por definición, una divergencia de una regla que ya está escrita.

## Runtime State Inventory

**No aplica.** Esta fase no es un rename, refactor ni migración de datos: agrega una lectura y una
derivación de UI sobre datos que ya existen. No hay estado runtime que reconciliar.

Verificaciones puntuales que sí corresponden (y su resultado):

| Categoría | Hallazgo |
|-----------|----------|
| Datos almacenados | Ninguno se escribe ni se migra. `time_block_services` se lee, nunca se toca |
| Config de servicio vivo | Ninguna. Sin Vercel env vars nuevas, sin crons, sin webhooks |
| Estado registrado en el SO | Ninguno |
| Secretos / env vars | Ninguno nuevo. La vista se lee con la anon key ya presente |
| Artefactos de build | Ninguno. Sin dependencias nuevas ⇒ sin `npm install` |
| **Migraciones** | **Ninguna nueva.** 071 (vista) y 072 (grants) ya están en prod [VERIFIED: `supabase/schema.sql:1426,4356` + memoria del proyecto: "migr. 071-076 TODAS en producción, próxima libre: 077"] |

## Common Pitfalls

### Pitfall 1: Creer que hace falta una migración

**Qué sale mal:** El planner escribe una migración 077 para crear `public_time_block_services`.
**Por qué pasa:** El patrón del repo *sí* exige una vista acotada por cada mapeo expuesto al público
(059 para staff, 044 para canchas), y es razonable asumir que falta la de esta fase.
**Cómo evitarlo:** La 071 ya la creó, deliberadamente y sin consumidor, para no partir en dos
aplicaciones manuales lo que podía ir en una. Está verificada en `supabase/schema.sql:1426` y con el
`GRANT SELECT` correcto de la 072 en `:4356`.
**Señal temprana:** Si el plan incluye un archivo `supabase/migrations/077_*.sql`, revisar de nuevo.

### Pitfall 2: Leer la tabla base `time_block_services` desde el RSC público

**Qué sale mal:** `supabase.from('time_block_services')` con el cliente público devuelve `[]` en
silencio — la tabla no tiene policy `anon` (migr. 071 §1, a propósito).
**Por qué pasa:** El endpoint `availability` sí lee la tabla base (`route.ts:168`), y copiar esa
línea al RSC es natural. Pero el endpoint corre con **service role**, el RSC con **anon**.
**Cómo evitarlo:** Desde `app/[slug]/page.tsx` la fuente es siempre `public_time_block_services`.
**Señal temprana:** Todos los servicios quedan habilitados aunque el negocio tenga mapeo — el
resultado es indistinguible del comodín, que es el modo de falla más difícil de detectar en QA
superficial (el mismo que la 071 documenta como Pitfall 5).

### Pitfall 3: Confundir "generar la grilla" con "producir la lista de ocultos"

**Qué sale mal:** El planner lee la advertencia de `startTimesNotOffered` —*"filtrar los bloques está
mal, produce MENOS horarios ocultos"*— y concluye que el cliente tampoco puede filtrar bloques.
**Por qué pasa:** La advertencia es real, pero es sobre el **server**, que devuelve una lista de
ocultos. El cliente hace la operación inversa: **genera** la grilla.
**Cómo evitarlo:** Para el cliente, quedarse con `blocksForService(...)` **es** la operación
correcta, y además es demostrablemente equivalente al comportamiento actual:

> visible_hoy = starts(todas las franjas) − hidden, con hidden = starts(no-ofrecen) − starts(ofrecen)
> ⇒ visible_hoy = starts(ofrecen)  — que es exactamente lo que genera filtrar por `blocksForService`.

O sea: filtrar los bloques en el cliente **no cambia ni un slot visible**. Cambia solo qué días
aparecen abiertos (que es el punto de HALLAZGO-01).
**Señal temprana:** Si aparecen slots nuevos o desaparecen slots que hoy se ven, el filtro está mal
aplicado (probablemente ignorando los solapes).

### Pitfall 4: Deshabilitar el servicio sin bloquear el `onClick`

**Qué sale mal:** Se agrega el estilo apagado y el `<p>` del motivo, pero el `<button>` sigue
navegando al paso 2 (el `onClick` del paso 1 hace `setStep(2)` incondicionalmente, `:546`).
**Por qué pasa:** El molde del paso 3 pone `disabled={!enabled}` y `type="button"`; el paso 1 hoy no
tiene ninguno de los dos.
**Cómo evitarlo:** El `disabled` nativo del `<button>` ya cancela el `onClick` y da el estado de foco
correcto — no hace falta un guard adicional en el handler. Agregar también `type="button"` (el molde
lo tiene; sin él, dentro de un `<form>` el botón sería submit).
**Señal temprana:** Se puede llegar al calendario con un servicio deshabilitado.

### Pitfall 5: Romper el fail-safe de la puente vacía

**Qué sale mal:** Alguien escribe `if (timeBlockServices.length === 0) return false` o similar
"defensivo", y el día que la vista no responda **todos** los servicios quedan deshabilitados: agenda
apagada para todos los negocios.
**Por qué pasa:** Intuitivamente "sin datos" parece "sin cobertura".
**Cómo evitarlo:** La regla del comodín dice lo opuesto: **sin filas ⇒ todo agendado**. El helper ya
lo hace; no agregar guardas. El `|| []` del RSC es el fail-safe correcto y degrada al comportamiento
de hoy.
**Señal temprana:** Un negocio sin mapeo configurado ve servicios deshabilitados.

### Pitfall 6: Tocar `locHasBlocks` "de paso"

**Qué sale mal:** Al introducir un `serviceBlocks` derivado, se reemplaza `timeBlocks` por
`serviceBlocks` en todos los usos, incluido `locHasBlocks` (`:124`) — que decide qué consultorios se
ofrecen y **cuántos pasos tiene el wizard** (`needLocStep`, `:131`).
**Por qué pasa:** Búsqueda-y-reemplazo bienintencionada.
**Cómo evitarlo:** `locHasBlocks` responde una pregunta de **sede** ("¿este consultorio tiene
horarios?"), no de servicio. Cambiarla altera la aparición del paso 3 y no lo pide ningún requisito.
Dejarla intacta y anotarlo. (Además, la regla franja↔servicio es hoy **ciega a `location_id`** en el
server — WR-04 de la Phase 18, hoy inerte con 0 negocios multi-sede; hacerla location-aware solo en
el cliente crearía la divergencia que AGENDA-02 quiere evitar.)

### Pitfall 7: Next 16 — el prop drilling y `force-dynamic`

**Qué sale mal:** Se agrega la query en un `await` secuencial después del `Promise.all`, sumando
latencia serial a una página `force-dynamic` (sin caché por definición).
**Cómo evitarlo:** La query va **dentro** del `Promise.all` existente (`page.tsx:76-98`), como
elemento 8. Se paraleliza gratis. No se toca `export const dynamic = 'force-dynamic'` (`:37`) ni
`searchParams`/`params` (que en Next 16 son Promises y ya se `await`ean correctamente, `:54-55`).

## Code Examples

Patrones verificados contra el repo. **No son el plan** — son la referencia exacta que el planner
debe citar.

### La firma pública completa de `lib/time-block-services.ts`

```ts
// Source: lib/time-block-services.ts (VERIFICADO — el archivo entero, 271 líneas)
export type BlockWindow = { id: string; start_time: string; end_time: string }

// "¿En qué franjas se da este servicio?"  ← la que necesita el filtro de DÍAS (HALLAZGO-01)
export function blocksForService<T extends { id: string }>(
  serviceId: string, blocks: T[], bridge: TimeBlockService[]): T[]

// "¿Este servicio tiene alguna franja que lo dé?"  ← LA FUNCIÓN DE ESTA FASE (D-06/AGENDA-07)
export function isServiceScheduled<T extends { id: string }>(
  serviceId: string, blocks: T[], bridge: TimeBlockService[]): boolean

// "¿Se puede tomar este servicio a esta hora?"  ← backstop del create (Phase 18, no se toca)
export function isServiceAllowedAt(
  serviceId: string, startMinutes: number, blocks: BlockWindow[], bridge: TimeBlockService[]): boolean

// "¿Qué horarios dejar de ofrecer?"  ← el endpoint de disponibilidad (Phase 18, no se toca)
export function startTimesNotOffered(
  serviceId: string, blocks: BlockWindow[], bridge: TimeBlockService[], durationMinutes: number): string[]

// "¿Qué servicios declara esta franja?" / "¿es comodín?"  ← el panel Phase 19 (no se toca)
export function servicesOfBlock(blockId: string, bridge: TimeBlockService[]): string[]
export function isBlockWildcard(blockId: string, bridge: TimeBlockService[]): boolean

// "¿Qué franjas vuelven a comodín si borro este servicio?"  ← aviso de borrado Phase 19 (no se toca)
export function blocksBecomingWildcard(
  serviceId: string, bridge: Pick<TimeBlockService,'time_block_id'|'service_id'>[]): string[]
```

**Respuesta directa a la pregunta del research focus #2:** el helper que responde *"¿qué franjas
cubren este servicio?"* **ya existe** (`blocksForService`) y el que responde *"¿tiene alguna?"*
también (`isServiceScheduled`). La dirección inversa —*"¿qué servicios cubre esta franja?"*— es
`servicesOfBlock`, y la usa el panel de la Phase 19. **No hay nada que derivar.** El índice de DB que
sirve la dirección que esta fase necesita también existe: `time_block_services_by_service (service_id,
time_block_id)`, migr. 071 §2, creado explícitamente *"para la disponibilidad y las Phases 19/20"*.

Genericidad relevante: `blocksForService`/`isServiceScheduled` son genéricas sobre `T extends { id:
string }`, así que aceptan `TimeBlock[]` completo (lo que el cliente ya tiene) **sin cast**
[VERIFIED: `lib/time-block-services.ts:87-91`, y la docstring `:82-85` explica que es a propósito].

### El tipo de la fila puente

```ts
// Source: lib/types.ts:179-183 (VERIFICADO)
export interface TimeBlockService {
  business_id: string
  time_block_id: string
  service_id: string
}
```

Espejo exacto de las 3 columnas de la vista. **No hace falta un tipo nuevo** ni un `PublicTimeBlockService`
(a diferencia de `PublicCancha`, que sí difiere de su tabla base porque oculta `service_id`).

### Cómo filtra HOY el endpoint por servicio (coherencia obligatoria)

```ts
// Source: app/api/booking/availability/route.ts:161-186 (VERIFICADO)
  let notOffered: string[] = []
  if (svc && serviceIdParam) {
    const { data: tbsRaw, error: tbsErr } = await supabase
      .from('time_block_services')            // tabla base: acá corre con SERVICE ROLE
      .select('business_id, time_block_id, service_id')
      .eq('business_id', business.id)         // aislamiento explícito aunque bypasee RLS
    if (tbsErr) console.error('[booking/availability] error leyendo time_block_services:', tbsErr.message)
    notOffered = startTimesNotOffered(
      serviceIdParam,
      (capBlocks || []) as BlockWindow[],     // franjas del NEGOCIO para ese day_of_week
      (tbsRaw || []) as TimeBlockService[],
      Number(svc.duration_minutes) || 30,
    )
  }
```

`notOffered` se suma a `full`, y el cliente esconde esos start-times. Puntos de coherencia que el
planner tiene que respetar:

1. **El endpoint solo se consulta después de elegir un día** (`handleDateSelect`, `:224-315`). Por eso
   no sirve para poblar el selector del paso 1: en ese momento no hay fecha y no hay request.
2. **El endpoint razona sobre las franjas de UN `day_of_week`**; el selector razona sobre **todas**
   las franjas del negocio. Son preguntas distintas sobre la misma fuente — y por eso son coherentes
   por construcción: si `isServiceScheduled` es `false`, entonces para **todo** día
   `startTimesNotOffered` oculta la grilla entera. No hay estado donde el selector diga "sin horarios"
   y el calendario ofrezca algo.
3. **El endpoint es blind a `location_id`** (lee `time_blocks` del negocio filtrando solo por
   `business_id` + `day_of_week`, `:105-109`). El selector debe ser igual de blind para no divergir.

### El fetch del cliente (para ubicar el punto 1 de arriba)

```ts
// Source: app/[slug]/booking-client.tsx:290-307 (VERIFICADO)
      const params = new URLSearchParams({ slug: business.slug, date: dateStr })
      if (proId) params.set('professionalId', proId)
      else if (isAny) { params.set('any', '1'); params.set('serviceId', selectedService.id) }
      if (!isAny) params.set('serviceId', selectedService.id)
      const res = await fetch(`/api/booking/availability?${params.toString()}`, { cache: 'no-store' })
```

### El precedente de "computar cobertura en el RSC" (eje staff)

```tsx
// Source: app/[slug]/page.tsx:136-141 (VERIFICADO)
  // Gap UAT Phase 10: un servicio que NINGÚN profesional nombrado hace NO debe ofrecerse (hoy caía al
  // fallback "Sin preferencia" y se reservaba contra el sentinel). Filtramos la lista SOLO para el
  // selector de reserva con staff (BookingClient), aplicando la regla del comodín + la guarda de modo
  // sentinel (0 profesionales nombrados → todos los servicios, sin regresión). El catálogo del
  // LandingRenderer (superficie de marketing) NO se toca: sigue mostrando el catálogo completo.
  const staffBookableServices = bookableServices(services || [], professionals || [], professionalServices || [])
```

⚠ **Ojo con el orden de composición:** la prop `services` que recibe `BookingClient` **ya viene
filtrada** por `bookableServices`. La derivación de esta fase se aplica sobre esa lista ya filtrada,
no sobre `services` crudo. Es decir: un servicio que ningún profesional hace **sigue ocultándose**
(no llega ni a la lista), mientras que uno que ninguna franja cubre **se mostrará deshabilitado**.
Dos tratamientos distintos para dos estados análogos — ver HALLAZGO-02.

### Lo que la landing hace hoy y NO se toca (D-03)

```ts
// Source: lib/landing/derive.ts:51-59 (VERIFICADO)
export function groupHoursByDay(timeBlocks: TimeBlock[]): Map<number, string[]> {
  const byDay = new Map<number, string[]>()
  for (const b of timeBlocks) {
    const range = `${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)}`
    byDay.set(b.day_of_week, [...(byDay.get(b.day_of_week) ?? []), range])
  }
  return byDay
}
```

Ni `derive.ts` ni el `LandingRenderer` reciben o consumen la puente. **No apareció ninguna razón
técnica para tocarlo** — D-03 queda intacto y sin presión.

## Hallazgos (lo que el CONTEXT no cubrió)

### HALLAZGO-01 — El calendario sigue mudo a nivel DÍA (criterio 1 de AGENDA-07)

**Qué encontré.** El criterio 1 dice *"ve solo los horarios donde ese servicio se da"*. A nivel
**horario** está cerrado por la Phase 18. A nivel **día** no: qué días son clickeables lo decide

```ts
// Source: app/[slug]/booking-client.tsx:183-184, 204-211 (VERIFICADO)
  const openDaysSet = useMemo(() => new Set(timeBlocks.map(b => b.day_of_week)), [timeBlocks])
  const isDayOpen = (d: Date) => {
    const ds = format(d, 'yyyy-MM-dd')
    const g = globalExcByDate.get(ds)
    if (g) return !g.closed
    return openDaysSet.has(d.getDay()) || locSpecialDates.has(ds)
  }
```

`openDaysSet` sale del `timeBlocks` **completo del negocio**, sin noción de servicio. Escenario real
del milestone (el que motivó la fase): cerámica los martes 15-16. Un cliente que elige cerámica ve
lunes, miércoles, jueves y viernes **abiertos y clickeables**; toca uno, se dispara el fetch, y la
grilla vuelve vacía. Eso **es** el calendario mudo que el requisito nombra — solo que corrido un
nivel: en vez de un calendario mudo entero, un calendario con días mudos.

**Por qué el D-02 no lo cubre.** El D-02 resuelve el caso *"ninguna franja lo cubre"* (servicio
totalmente huérfano) en el selector. Este es el caso *"algunas franjas lo cubren"*, que el D-02 no
contempla porque el selector, correctamente, deja ese servicio **habilitado**.

**El fix, y por qué es barato y seguro.** Con la prop de la puente ya en el cliente, alcanza con
derivar las franjas del servicio elegido y usar **esa** lista para los días y para la grilla:

```ts
// Propuesta (NO implementada) — la derivación única de la que cuelgan openDaysSet y `weekly`
const serviceBlocks = useMemo(
  () => (selectedService ? blocksForService(selectedService.id, timeBlocks, timeBlockServices) : timeBlocks),
  [selectedService, timeBlocks, timeBlockServices],
)
```

- Sobre los **slots** es un **no-op demostrable** (ver Pitfall 3: `starts(todas) − full = starts(ofrecen)`).
- Sobre los **días** apaga exactamente los que no tenían nada que ofrecer.
- **No toca el server**, no toca el contrato del endpoint, no toca `full`.
- ⚠ **Los horarios especiales quedan afuera del filtro**: `locSpecialDates` y `globalExcByDate` viven
  en `schedule_exceptions`, no en `time_blocks`, y el backstop del `create` los **acepta** a propósito
  (D-04: "esta fase no introduce validación general de ventana"). Filtrarlos sería una regresión de
  disponibilidad (AGENDA-04). El filtro se aplica **solo** a la rama `openDaysSet` / `weekly`.
- ⚠ **No tocar `locHasBlocks`** (ver Pitfall 6).

**Recomendación:** incluirlo como tarea propia de la fase, marcada como cierre del criterio 1 de
AGENDA-07. No contradice ningún D; el CONTEXT simplemente no lo consideró porque discutió el estado
"servicio sin ninguna franja". Si el planner prefiere no ampliar alcance, la alternativa honesta es
declararlo diferido **por escrito** — no dejarlo implícito.

### HALLAZGO-02 — Dos estados análogos con dos tratamientos opuestos

**Qué encontré.** "Servicio que ningún profesional hace" → **se oculta** (`bookableServices` en
`page.tsx:141`, gap UAT Phase 10). "Servicio que ninguna franja cubre" → **se deshabilita con motivo**
(D-02 de esta fase). Son el mismo tipo de estado (servicio no reservable por falta de cobertura) con
dos respuestas de producto opuestas.

**Por qué importa.** El argumento del D-02 —*"si se oculta, el dueño no se entera"*— aplica **igual**
al eje staff. Y un negocio puede caer en los dos a la vez: el de staff gana (el servicio ni llega a la
lista), así que la explicación de la fase 20 nunca se vería. El panel ya avisa del caso staff
(`settings-client.tsx:2622-2625`: *"Nadie lo ofrece — asignalo en Equipo"*), lo cual mitiga, pero la
superficie pública sigue siendo inconsistente.

**Recomendación:** **NO** cambiar `bookableServices` en esta fase (es capacidad nueva, riesgo de
regresión de un fix ya UAT-eado, y está fuera de AGENDA-07). Registrarlo como todo/idea diferida:
*"unificar el tratamiento público de los dos ejes de cobertura (staff y franja)"*. Es exactamente el
tipo de deriva que el milestone viene cerrando.

### HALLAZGO-03 — Cero deuda pendiente de la Phase 19 que bloquee esta fase

Verificado que las dos condiciones que la Phase 19 arrastraba están cerradas:
- **WR-07** (copy de `service_not_scheduled`): implementada en `booking-client.tsx:420-431`, con el
  texto exacto que fija el 19-UI-SPEC Bloque D (`Ese horario ya no se ofrece para este servicio.
  Recargá la página y elegí otro.`).
- **WR-04** (regla ciega a `location_id`): sigue abierta pero **inerte** (0 negocios multi-sede) y se
  mantiene igual en esta fase por coherencia con el server. No bloquea.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `time_blocks` declara solo el CUÁNDO; cualquier servicio en cualquier franja | Puente `time_block_services` + regla del comodín en helper puro | migr. 071 (v0.28, Phase 18) | El público ya no ve color a las 10 si color es de tarde |
| El público lee tablas base con anon key | Vistas acotadas `public_*`, `GRANT SELECT`, owner postgres, **sin** `security_invoker` | migr. 059 → endurecido por 072/073 tras CR-01 | Vista de esta fase ya creada y ya endurecida |
| `time_blocks.capacity` decidía el cupo | `services.capacity` es la fuente única | migr. 068 (v0.27) | Liberó a `time_blocks` para declarar el QUÉ — precondición de esta fase |
| `book_slot_atomic` ejecutable por `anon` | Revocado | migr. 076 (2026-09-02) | La superficie pública que esta fase toca ya está endurecida |

**Deprecado / no usar:**
- `GRANT ALL` en vistas `public_*` — vector real explotado (CR-01), cerrado por 072/073.
- Leer `business_hours` para horarios públicos — `derive.ts:32-34` documenta que la fuente real es
  `time_blocks`.

## Verification / Tests

`workflow.nyquist_validation` está en **`false`** en `.planning/config.json` [VERIFIED: lectura del
archivo], así que la sección de arquitectura de validación completa no corresponde. Igual dejo el
inventario, porque la pregunta #6 del research focus lo pide explícitamente y el planner necesita
saber **dónde extender en vez de inventar**.

**Framework:** `vitest ^4.1.9`, config en `vitest.config.mts`, setup en `vitest.setup.ts`.
**Comandos:** `npm test` (`vitest run`) · `npm run test:watch`.
**Skip graceful:** `test/env.ts` exporta `hasSupabaseCreds` (las 3 vars); los tests contra DB se
`describe.skipIf(!hasSupabaseCreds)`.

| Archivo | Qué cubre hoy | Relevancia para la Phase 20 |
|---------|---------------|------------------------------|
| `test/time-block-services.test.ts` (279 líneas) | Las 7 funciones puras. **`isServiceScheduled` ya tiene su suite** (`:74-100`): comodín, control negativo (todas mapeadas y ninguna marca ⇒ `false`), y "una comodín entre mapeadas vuelve a agendar todo" | **La regla ya está congelada.** No hace falta test nuevo del helper. Si el planner agrega uno, que sea del **consumo**, no de la regla |
| `test/service-coverage-public.test.ts` (110 líneas) | **EL MOLDE EXACTO.** Mismo bug, eje staff: verifica contra la DB local, leyendo las MISMAS vistas acotadas que el RSC, que un servicio sin cobertura no es reservable. 3 casos: (a) sin cobertura, (b) comodín, (c) 0 profesionales | El archivo a **espejar** para el eje franja: leer `public_time_block_services` con la anon key y verificar que el RSC obtiene el mapeo y que la derivación da `false` para el servicio huérfano |
| `test/availability-service-window.test.ts` (201 líneas) | El endpoint aplicando la regla en sus 3 ramas, 7 casos, con franjas solapadas | Contexto de coherencia. **No se toca** (el endpoint no cambia). Sirve como control de no-regresión |
| `test/booking-service-window-backstop.test.ts` | El backstop del `create` (400 `service_not_scheduled`, cero filas) | **No se toca** |
| `test/isolation.test.ts` (`:349-478`) | `time_block_services` + su vista pública: 7 casos, incluida la escritura anónima rechazada | ⚠ **Regla dura del proyecto:** este archivo cubre toda tabla/vista nueva. Esta fase **no crea ninguna**, así que no requiere ampliación — pero si el planner terminara agregando una, es obligatorio |
| `test/helpers/booking-fixtures.ts` (`:243-260`) | `seedTimeBlockService(...)` ya existe | El planner **no necesita escribir fixtures**: sembrar el mapeo ya está resuelto |

**Recomendación de cobertura mínima para la fase:** un archivo nuevo espejo de
`service-coverage-public.test.ts` que, contra la DB local, siembre un mapeo parcial y verifique
(a) que `public_time_block_services` es legible con **anon key** y devuelve las filas del negocio,
(b) que `isServiceScheduled` sobre esas filas da `false` para el servicio huérfano y `true` para el
mapeado, y (c) el control de no-regresión con la puente vacía (todos `true`). El caso (a) es el que
de verdad muerde: es el único que detecta el Pitfall 2 y el fallo silencioso de PostgREST sin
`NOTIFY pgrst, 'reload schema'`.

## Security Domain

`workflow.security_enforcement` está en **`true`**, ASVS nivel 1 [VERIFIED: `.planning/config.json`].

**Postura de la fase:** riesgo **BAJO-MEDIO**. No se abre ninguna superficie nueva: se **consume** una
vista que ya existe, ya está grantada y ya está cubierta por tests de aislamiento. No hay endpoint
nuevo, no hay escritura, no hay input del usuario que llegue al server.

### Categorías ASVS aplicables

| ASVS Category | Aplica | Control estándar |
|---------------|--------|------------------|
| V2 Authentication | no | Superficie anónima por diseño; no hay sesión |
| V3 Session Management | no | El `proxy.ts` excluye `/[slug]` a propósito (no filtrar credenciales del dueño al flujo anónimo) |
| V4 Access Control | **sí** | RLS por tenant en `time_block_services` (4 policies, migr. 071 §1) + vista acotada con `GRANT SELECT` (072) + `.eq('business_id', business.id)` en el RSC. **Los tres ya existen** |
| V5 Input Validation | **sí (indirecto)** | El único input es el `slug` de la URL, ya resuelto contra `public_businesses`. El `serviceId` que viaja al endpoint ya se re-valida por `business_id` (`availability/route.ts:56-60`) |
| V6 Cryptography | no | Sin secretos ni criptografía en esta fase |
| V7 Error Handling / Logging | **sí** | Precedente WR-01 de la Phase 18: **degradar está bien, degradar MUDO no.** Si la lectura de la vista falla, el `|| []` degrada al comodín (correcto) pero **tiene que quedar un `console.error` con prefijo `[modulo/accion]`** — si no, es indistinguible de "el dueño no configuró nada". Es exactamente el síntoma de una migración aplicada sin `NOTIFY pgrst, 'reload schema'` |

### Patrones de amenaza para este stack

| Patrón | STRIDE | Mitigación estándar (estado) |
|--------|--------|------------------------------|
| Escritura anónima vía vista auto-actualizable (CR-01) | Tampering / Elevation | `REVOKE ALL` + `GRANT SELECT` en la vista — **ya aplicado** (072) y cubierto por `isolation.test.ts` |
| Vista nueva nace escribible por `anon` (`pg_default_acl`) | Elevation | Cerrado por la 073. **Esta fase no crea vistas**, así que no reabre el vector |
| Lectura cross-tenant del mapeo | Information Disclosure | `.eq('business_id', business.id)` en el RSC (mismo mecanismo que las otras 6 vistas). La vista **no** filtra por sí sola — el contrato D-16 del helper también lo dice explícitamente |
| Enumeración de servicios de otro negocio desde el cliente | Information Disclosure | El RSC ya acota por `business.id` resuelto por `slug`; el cliente recibe solo filas de ese negocio. Nada nuevo |
| Bypass del selector (cliente forjado que reserva un servicio sin franja) | Tampering | **Ya cerrado**: backstop `isServiceAllowedAt` en `lib/booking-core.ts` → 400 `service_not_scheduled`. El selector es **UX**, nunca el control |
| Reserva masiva anónima (vaciar la agenda) | Denial of Service | ⚠ **Abierto y conocido**, fuera de alcance (todo `2026-08-16`, pide fase propia). Esta fase no lo agrava ni lo mitiga |

**Nota para `secure-phase`:** el eje generalizable que salió del milestone —*"controles que existen
SOLO en el route handler mientras la base expone el mismo camino sin ellos"*— ya fue barrido para
funciones (migr. 076) y para vistas (072/073). Esta fase no agrega ni funciones ni vistas.

## Environment Availability

Esta fase no introduce dependencias externas nuevas. Las que usa ya son las del proyecto:

| Dependency | Required By | Available | Notas |
|------------|------------|-----------|-------|
| Node + npm | build / tests | ✓ | Stack del proyecto |
| Supabase local (PG17) | tests contra DB (`hasSupabaseCreds`) | ✓ (configurado) | Baseline replayable con `supabase db reset`; los tests skipean limpio si faltan las 3 creds |
| Migraciones 071/072 en prod | la vista que lee el RSC | ✓ **ya aplicadas** | Verificado en `supabase/schema.sql:1426,4356` + memoria del proyecto |

**Missing dependencies with no fallback:** ninguna.
**Missing dependencies with fallback:** ninguna.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Las migr. 071/072 están aplicadas **en producción** (no solo en local) | Pattern 1 / Environment | Si la vista no estuviera en prod, el `|| []` degradaría al comodín en silencio y la fase no tendría efecto visible. Fuente: memoria del proyecto (`v028-agenda-por-servicio`: *"Migr. 071-076 TODAS en producción"*) + `schema.sql` reflejado. **Mitigación barata:** el plan puede incluir un check de humo (leer la vista con anon key contra prod) antes de dar la fase por cerrada |
| A2 | Ningún negocio en prod tiene hoy filas en `time_block_services` que dejen un servicio huérfano | Pitfalls / UAT | Si ya las hubiera, el deploy de esta fase deshabilitaría tarjetas de golpe. Es el comportamiento **deseado** (AGENDA-07), pero conviene saberlo antes de la UAT. No verificado en esta sesión (requiere consultar prod) |
| A3 | El `<button>` con `disabled` alcanza para bloquear la navegación en el paso 1 | Pitfall 4 | Riesgo bajo: es el mismo mecanismo que ya funciona en el paso 3 con `locHasBlocks` |

Todo lo demás en este documento está `[VERIFIED]` por lectura directa de los archivos citados, con
número de línea.

## Open Questions (RESOLVED)

1. **(RESOLVED) ¿El filtro de días entra en esta fase? (HALLAZGO-01)**
   - Lo que sabemos: es criterio 1 de AGENDA-07, el fix usa el mismo helper y la misma prop, y es
     demostrablemente no-op sobre los slots visibles.
   - Lo que no estaba claro: el CONTEXT solo habló del selector (D-02), así que no estaba locked.
   - Recomendación: **incluirlo**, como tarea separada y con su propio criterio de verificación.
   - Resolución: el usuario decidió **incluirlo**. Registrado como **D-04** en `20-CONTEXT.md` e
     implementado en el Plan `20-02` (Task 2, `serviceBlocks`).

2. **(RESOLVED) ¿Se unifica el tratamiento del eje staff? (HALLAZGO-02)**
   - Lo que sabemos: hoy uno oculta y el otro deshabilitará; el argumento del D-02 aplica a los dos.
   - Lo que no estaba claro: cambiar `bookableServices` toca un fix ya UAT-eado (gap Phase 10).
   - Recomendación: **NO** en esta fase. Registrar como idea diferida.
   - Resolución: el usuario decidió **unificar ahora**, aceptando explícitamente el costo (modifica
     comportamiento ya UAT-eado). Registrado como **D-05** en `20-CONTEXT.md` — la decisión de producto
     sobreescribe la recomendación de este research — e implementado en los Plans `20-01` (Task 1/2) y
     `20-02` (Task 1/3), con el cambio tratado como regresión candidata y verificado aparte del eje
     franja.

3. **(RESOLVED) Copy exacta del motivo.**
   - El CONTEXT dice "Sin horarios disponibles" *o equivalente*, y ese es el literal del molde
     (`:675`). El 19-UI-SPEC exige voseo rioplatense y terminología por vertical
     (`resolveVertical(business).terminology`), evitando el artículo antes de la interpolación.
   - Recomendación: **usar el literal del molde** (`Sin horarios disponibles`) — no menciona
     "servicio", así que no necesita interpolar terminología y es idéntico al que el cliente ya ve un
     paso más adelante. Coherencia gratis.
   - Sub-pregunta: ¿el motivo necesita `role="status"` o basta el texto? El molde del paso 3 no lo
     tiene; el aviso de cobertura del panel sí (`settings-client.tsx:2622`). Como acá el texto está
     **dentro** del botón deshabilitado (que el lector de pantalla anuncia como tal), el molde alcanza.
   - Resolución: adoptado el literal del molde para el motivo de franja ("Sin horarios disponibles") y
     un segundo literal distinguible para el motivo de staff ("Sin profesional disponible", D-05), sin
     `role="status"` adicional — implementado en el Plan `20-02` (Task 1). Esta fase corrió con
     `--skip-ui` (no hubo `ui-phase`); el molde citado alcanzó como contrato visual.

4. **(RESOLVED, informativo) ¿Hay que avisarle al dueño desde el panel que un servicio quedó sin
   franjas?**
   - El panel de la Phase 19 ya tiene el aviso D-06 y `isServiceScheduled` existe para eso. Fuera del
     alcance declarado de la 20 (que es la superficie pública). Solo verificar en la UAT que el dueño
     tiene **alguna** forma de enterarse antes de que el cliente vea la tarjeta apagada.
   - Resolución: confirmado fuera de alcance — sin acción en esta fase. El Plan `20-02` Task 3 (UAT
     humana) incluye un paso que confirma que el aviso del panel de la Phase 19 sigue visible para el
     dueño.

## Sources

### Primary (HIGH confidence) — lectura directa del repo, en esta sesión

- `lib/time-block-services.ts` (271 líneas, íntegro) — firma pública, regla del comodín, contrato D-16
- `app/[slug]/page.tsx` (205 líneas, íntegro) — `Promise.all`, vistas `public_*`, gateo por vertical
- `app/[slug]/booking-client.tsx` — `:1-200` (props, derivaciones), `:224-340` (días/slots/fetch),
  `:380-490` (copy de errores), `:536-700` (pasos 1/2/3)
- `app/api/booking/availability/route.ts` — `:95-190` (la rama de la agenda por servicio)
- `supabase/migrations/071_time_block_services.sql` (íntegro) — tabla, RLS, índice inverso, vista
- `supabase/migrations/072_public_views_read_only.sql:102-106` — los grants correctos
- `supabase/schema.sql:1426,4356` — confirmación de que la vista y su `GRANT SELECT` están reflejados
- `lib/types.ts:170-195` — `TimeBlockService`
- `lib/landing/derive.ts` (106 líneas) — confirmación de que D-03 no tiene presión técnica
- `app/(dashboard)/settings/settings-client.tsx:2612-2628` — copy del aviso de cobertura (eje staff)
- `test/time-block-services.test.ts`, `test/service-coverage-public.test.ts`,
  `test/availability-service-window.test.ts`, `test/env.ts` — inventario de verificación
- `.planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-SPEC.md:433-480, 521-545` —
  vocabulario visual, contrato de copy, contrato con el read-path
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md:75-90` — texto de AGENDA-07
- `.planning/config.json` — `nyquist_validation: false`, `security_enforcement: true`

### Secondary (MEDIUM confidence)

- Memoria del proyecto `v028-agenda-por-servicio` — estado de las migraciones en prod, reglas duras
  sobre vistas `public_*`, cierre de WR-07. Cruzado contra `schema.sql` donde fue posible.

### Tertiary (LOW confidence)

- Ninguna. **Esta investigación no usó búsqueda web ni fuentes externas**: el dominio es 100% interno
  al repo y toda afirmación tiene archivo y línea.

## Project Constraints (from CLAUDE.md)

| Directiva | Cómo la respeta esta fase |
|-----------|---------------------------|
| **Next.js 16, NO 14** — consultar `node_modules/next/dist/docs/` antes de asumir comportamiento; middleware = `proxy.ts` | La fase no toca routing, middleware ni APIs de Next. `params`/`searchParams` como Promise ya están correctamente `await`eados (`page.tsx:54-55`) y no se modifican |
| **Aislamiento por tenant no negociable** (RLS + `business_id`) | Toda query nueva lleva `.eq('business_id', business.id)`; se lee la vista acotada, jamás la tabla base con anon |
| **Service role SOLO en route handlers** | El RSC público usa `createPublicServerClient()` (anon, sin cookies). Cero uso de `createAdminClient` en esta fase |
| **Migraciones numeradas, aplicadas a mano y en orden** | **No hay migración nueva.** Próxima libre sigue siendo la 077 |
| **Vercel Hobby: cron diario** | Sin crons |
| **No usar `Write` sobre archivos existentes** (regla global del usuario) | El plan debe usar `Edit` en `page.tsx` y `booking-client.tsx` — son cambios quirúrgicos sobre archivos de 205 y 1004 líneas |
| **Comentarios densos en español explicando el POR QUÉ** | El código nuevo debe explicar el fail-safe del comodín y por qué el dato viene del RSC. Es la convención dominante en los dos archivos |
| **Errores como `{ ok: false, error: 'codigo_snake' }`, copy del cliente nunca del server** | No hay errores nuevos; `service_not_scheduled` ya tiene su copy |
| **Windows + PowerShell** | Los comandos de verificación del plan deben ser PowerShell-compatibles (`npm test`, `npx tsc --noEmit` — ⚠ trampa conocida del repo: `npx tsc` puede salir 0 espuriamente) |
| **UI/UX: touch targets ≥44px, contraste WCAG AA, estados focus visibles** | El molde del paso 3 ya trae `focus-visible:ring-3 focus-visible:ring-ring/50`. ⚠ El estado deshabilitado usa `opacity-60` — el UI-SPEC debe verificar que el texto del motivo siga pasando contraste AA en los dos temas |
| **GSD workflow enforcement** | Este es research; los cambios salen por `/gsd:execute-phase` |

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — cero dependencias nuevas; todos los módulos verificados con línea
- Arquitectura (de dónde sale el dato): **HIGH** — la vista existe, está grantada, está en el schema
  reflejado, y la migr. 071 declara por escrito que es para esta fase
- Coherencia con el endpoint: **HIGH** — leído el código de las tres ramas del endpoint
- Pitfalls: **HIGH** — todos derivados de código leído o de incidentes documentados del propio repo
  (CR-01, WR-01, WR-04, WR-07, gap UAT Phase 10)
- HALLAZGO-01 (días mudos): **HIGH** sobre el diagnóstico (código leído), **MEDIUM** sobre si entra
  en alcance (decisión de producto, no técnica)
- A1 (migraciones en prod): **MEDIUM** — memoria + schema reflejado, sin consulta directa a prod

**Research date:** 2026-09-03
**Valid until:** ~2026-10-03 (dominio 100% interno; solo se invalida si alguien toca
`booking-client.tsx`, `page.tsx` o `lib/time-block-services.ts` antes de planificar)
