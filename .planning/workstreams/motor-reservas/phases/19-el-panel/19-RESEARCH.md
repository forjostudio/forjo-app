# Phase 19: El panel - Research

**Researched:** 2026-08-25
**Domain:** Panel del dueño (Next 16 App Router + client component) escribiendo la puente `time_block_services` con aislamiento por tenant, vía RPC transaccional de Postgres
**Confidence:** HIGH (todo lo del repo verificado leyendo el código; lo externo son 2 claims de docs oficiales)

---

## Summary

Esta fase **no descubre tecnología nueva**: no hay dependencias que instalar, no hay librería que
elegir, no hay patrón externo que copiar. Todo lo que hace falta ya existe en el repo — la tabla
puente (migr. 071), sus FK compuestas anti-cross-tenant (073), el helper puro de la regla del comodín
(`lib/time-block-services.ts`), el molde de chips toggleables (`settings-client.tsx:2777-2793`), el
molde de mapeo de errores de la base (`deleteService`, `settings-client.tsx:1280-1297`) y el molde de
función atómica (`book_slot_atomic`). La investigación, entonces, es **arqueología del write path** y
**detección de trampas**, no selección de stack.

Y aparecieron trampas caras. La más grande no está en la fase nueva sino en el estado que la fase
hereda: **`dayStates` se inicializa una sola vez y nunca vuelve a sincronizar con las props**
(`useState(() => ...)` en :254, sin `useEffect` que lo re-derive de `initialTimeBlocks` — verificado).
Hoy eso no molesta porque `saveHours()` borra todo y reinserta: los ids de la base se vuelven basura
igual y nadie los mira. En cuanto el guardado pase a **diff** (D-01), esos ids pasan a ser la clave de
correlación — y un segundo "Guardar horarios" sin reconciliar los ids devueltos por la base
**duplicaría** cada bloque creado en el primer guardado. La segunda trampa es de seguridad: en este
proyecto una función de Postgres nace **ejecutable por `anon` por dos vías independientes** (el default
de PostgreSQL + el `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon` del baseline, línea
3081), o sea que la 074 repite RA-05 si no revoca explícitamente.

Lo bueno: **PostgREST corre cada request en una transacción propia**, así que el "todo o nada" de D-04
sale gratis con un solo `supabase.rpc()` — no hace falta `BEGIN/COMMIT` en el cuerpo plpgsql ni una
segunda llamada. Y como el write path del panel corre con la sesión del dueño (anon key +
`authenticated` + RLS), la 074 puede ser **SECURITY INVOKER** (el default), que es estrictamente más
seguro que el único RPC que hoy existe en el schema.

**Primary recommendation:** migración **074** con **una** función `SECURITY INVOKER` que recibe el set
COMPLETO de bloques (todos los días, todos los consultorios) como `jsonb`, hace el diff contra la base
y **devuelve las filas resultantes** para que el cliente reconcilie los ids; `REVOKE EXECUTE FROM
PUBLIC, anon` + `GRANT EXECUTE TO authenticated` explícitos; el rechazo de la base mapeado a copy
propia por `error.code` + `message.includes(...)`, nunca interpolando el mensaje; y la regla "esta
franja es comodín" consumida de **dos funciones puras nuevas en `lib/time-block-services.ts`**, no
reimplementada en el componente.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Persistencia del mapeo — el problema central de la fase**

> **Contexto medido, no supuesto.** `saveHours()` (agenda-client.tsx:366-388) hoy hace **delete-all +
> reinsert** de `time_blocks`, y `time_block_services` es su hijo con `ON DELETE CASCADE` en las dos
> FK (verificado contra el catálogo: es el **único** hijo de `time_blocks`). Hasta la Phase 18 esto no
> molestaba a nadie porque la tabla no tenía hijos. La 18 le dio uno y **esta fase es la que hace que
> la gente lo llene**. Sin cambiar el guardado, cualquier mapeo que el dueño configure se borra solo
> al siguiente guardado de horarios — y el estado al que vuelve (comodín) es visualmente idéntico a
> "todavía no configuró nada". **AGENDA-05 no se puede cumplir sin resolver esto.**

- **D-01: Guardado por diff, conservando ids.** `saveHours()` deja de borrar todo: compara el estado
  local contra el de la base y hace UPDATE de los bloques que siguen, INSERT de los nuevos y DELETE
  sólo de los que el dueño realmente sacó. El dato ya está: `LocalBlock` carga el `id` (:173, :259).
  Es el único camino que preserva la identidad del bloque de verdad — el mapeo, y cualquier hijo
  futuro de `time_blocks`, quedan a salvo **por construcción** y no por una re-asociación que hay que
  acertar.
  - Descartado: re-mapear por `(día, inicio, fin)` tras el reinsert. La re-asociación es heurística y
    falla **en silencio** si el horario cambió en el mismo guardado — el modo de falla exacto que este
    milestone viene evitando.
  - Descartado: mover el mapeo a una clave que no dependa del id del bloque. Es re-migrar el modelo
    que la Phase 18 acaba de poner en producción, pierde las FK compuestas que cerraron WR-02 y
    desalinea el molde de `professional_services`.

- **D-02: La fila ES el bloque; el horario es un atributo.** Cambiarle el horario a un bloque que ya
  tiene servicios hace UPDATE sobre la misma fila y **el mapeo queda intacto**. Es lo que el dueño
  espera: corrió media hora la apertura, no re-declaró qué da. Coincide con cómo se edita hoy (se toca
  el input de un bloque existente, no se borra y se crea otro).

- **D-03: Un solo guardado, el botón "Guardar horarios" que ya existe.** Horarios y servicios se
  editan en la misma pantalla y se guardan juntos: un solo estado sucio, un solo "acordate de
  guardar", y ninguna ventana donde el mapeo apunte a un bloque que todavía no existe.
  - Descartado: guardado automático al elegir el servicio — choca con el resto de la pantalla, que es
    explícitamente "editá y después guardá", y sobre un bloque recién agregado no hay a qué mapear.
  - Descartado: botón propio para el mapeo — abre la puerta a que el dueño guarde uno y se olvide del
    otro, y el que se olvida es justo el que decide qué ve el público.

- **D-04: El guardado entero es TODO O NADA, vía RPC transaccional.** El diff de bloques y la escritura
  del mapeo van dentro de **una** función de Postgres, en una sola transacción. Es el molde que el
  proyecto ya usa para lo que no puede quedar a medias (`book_slot_atomic`, migr. 058). **Cuesta una
  migración nueva: la 074.** A cambio elimina de raíz el estado intermedio donde los horarios cambiaron
  pero el mapeo quedó viejo — un estado que **el público VE** a través de `/api/booking/availability`.

- **D-05: "Copiar a otros días" arrastra el mapeo.** `applyCopyDay` (:347) hoy copia horario, label,
  consultorio y cupo; ahora también los servicios asignados. Es el gesto central de un negocio de
  clases ("martes y jueves 15-16 cerámica" se carga una vez y se copia); copiar el horario sin qué se
  da convertiría el caso de uso del milestone en trabajo manual repetido.

- **D-06: Los días especiales quedan comodín, y se documenta.** Un día de `schedule_exceptions` no
  tiene mapeo posible y sigue ofreciendo todos los servicios. Es el comportamiento de hoy, es coherente
  con el backstop —que acepta lo que no cae en ninguna franja (AGENDA-04)— y es el caveat que la Phase
  18 ya aceptó como **RA-04**. Extenderlo es capacidad nueva y merece su propia fase.

- **D-07: Borrar un servicio mapeado avisa antes, con el número.** *"Este servicio está asignado a 4
  franjas. Si lo borrás, esas franjas vuelven a ofrecer cualquier servicio."* Importa porque la franja
  **no queda rota: queda comodín**, o sea que pasa a ofrecer **más** de lo que el dueño quería — al
  revés de lo que uno espera de un borrado, y en silencio.
  - Descartado: impedir el borrado mientras esté mapeado. Sería un gate nuevo sobre `services`, justo
    la clase de gate que este workstream ya tuvo que corregir tres veces (migr. 063/065/070).

**Dónde y cómo se asigna**

- **D-08: Segunda línea bajo la fila del bloque.** La fila de horarios queda como está
  (`[inicio] → [fin] [×]`) y debajo va una línea con los servicios como chips + un "+ Servicios". Se ve
  **sin abrir nada** (AGENDA-05) y no compite por el ancho de los inputs de hora, que a 375px ya se
  achican con `flex-1`.
  - Sinergia con D-12: sacar el stepper de cupo libera exactamente el espacio horizontal de esa fila.
  - Descartado: un botón que abre el modal existente — para saber qué se da habría que **abrir** algo,
    que es lo que AGENDA-05 prohíbe.
  - Descartado: inline junto a las horas — rompe la línea en mobile.

- **D-09: Chips toggleables con los servicios del negocio.** Cero clicks para VER el estado (los
  prendidos ya se leen), un click para cambiarlo, y hace evidente que "ninguno prendido" es un estado
  **válido** y no un campo sin llenar — que es exactamente lo que AGENDA-06 necesita.

- **D-10: Wrap con "ver todos (N)" después de ~2 filas de chips.** Un taller puede tener 8-10
  servicios. Los chips envuelven natural y se colapsan al pasar el umbral. El caso común (negocios de
  1-2 servicios, que es lo medido en la base) no paga nada. **El umbral exacto es detalle de UI-SPEC.**

- **D-11: Sólo los servicios ACTIVOS se ofrecen para asignar, pero desactivar uno NO borra su mapeo.**
  Mapear una franja a un servicio que nadie puede reservar no tiene sentido; pero si un servicio ya
  mapeado se desactiva, la fila de la puente sobrevive y el dueño lo reactiva y todo vuelve. **Queda
  para UI-SPEC:** si ese chip se sigue mostrando atenuado o desaparece.

- **D-12: Se pliega la limpieza de `time_blocks.capacity`** (todo pendiente). La columna no decide nada
  desde la migr. 068 y se escribe en la misma función que hay que reescribir entera. Arrastrarla al
  código nuevo la volvería a legitimar. **Incluye el input de cupo de la UI, no sólo el insert** —
  dejar un campo visible que no persiste nada sería peor que no tocar nada.

**Qué muestra la grilla, y cómo se lee "cualquiera"**

- **D-13: "La grilla" de AGENDA-05 es el EDITOR de horarios, no la vista semanal de turnos.** Los chips
  de D-08 ya cumplen el requisito. La vista semanal muestra turnos reales (cliente, estado, ocupación)
  y superponerle la configuración de la franja es información de otra naturaleza compitiendo por el
  mismo espacio.

- **D-14: Peso visual secundario** — chips neutros, texto chico, que no compitan con los inputs de
  hora. Coherente con que **el 100% de los negocios los va a ver vacíos el día del deploy**: si fueran
  llamativos, un estado que está bien se leería como algo que falta. Sin color por servicio (`services`
  no tiene columna de color; agregarla es capacidad nueva).

- **D-15: El encabezado de un día colapsado NO resume qué se da.** Sigue mostrando el rango horario.
  Resumir obligaría a colapsar 3 bloques con mapeos distintos en una línea, y ahí la síntesis miente
  fácil.

- **D-16: El estado vacío se muestra como un chip "Cualquier servicio".** Ocupa el lugar de un estado
  **declarado**, no de un hueco. Dice literalmente lo que significa y enseña la regla del comodín sin
  un texto de ayuda. Al prender el primer servicio real, ese chip desaparece — el cambio de estado es
  visible. **Queda para UI-SPEC:** si es clickeable o puramente informativo.
  - Descartado: texto atenuado — se lee como placeholder, la lectura exacta que AGENDA-06 evita.
  - Descartado: no mostrar nada — la capacidad se vuelve invisible y el dueño del taller nunca descubre
    que puede declarar qué se da.

- **D-17: Se vuelve a "cualquiera" apagando todos los chips**, y el chip "Cualquier servicio"
  **reaparece al instante**. Apagar todo se lee intuitivamente como "esta franja no da nada" y
  significa lo contrario: la ambigüedad se resuelve **mostrando el resultado**, no advirtiendo sobre
  él. Es lo que menos texto agrega y lo que sigue siendo cierto si alguien cambia la copy después.

**Deuda heredada de la Phase 18 que se cierra acá**

- **D-18: La copy de `service_not_scheduled` entra en ESTA fase.** Phase 18 aceptó **WR-07 con
  condición explícita** (`18-SECURITY.md` §9): el error no tiene copy en el cliente y cae en *"Error al
  confirmar. Intentá de nuevo."* — un reintento que nunca puede funcionar. Es inalcanzable hasta que
  exista la primera fila de mapeo, y **esta fase la crea**. Diferirlo a la Phase 20 dejaría una ventana
  donde el error ES alcanzable y no tiene mensaje, que es justo lo que la condición buscaba evitar.

- **D-19: WR-04 (`location_id`) NO se toca; se documenta el límite.** El bloque ya lleva su
  `location_id`, así que un dueño multi-sede **puede** mapear por sede sin problemas; lo que no filtra
  por sede es la **lectura** en la disponibilidad. Cerrarlo implica tocar el helper puro y los dos
  consumidores públicos que la Phase 18 acaba de asegurar con 0 amenazas abiertas, para un caso con **0
  negocios afectados** (medido). Se cierra cuando aparezca el primero.

### Claude's Discretion

- La firma del RPC de la 074, cómo se serializa el diff (JSON de bloques + mapeo), y el mapeo de sus
  rechazos a copy propia — **nunca interpolar el mensaje de la base** (T-14-25 / T-13-09).
- El umbral exacto de "ver todos" (D-10), si el chip "Cualquier servicio" es clickeable (D-16), y el
  tratamiento visual de un servicio desactivado que sigue mapeado (D-11). Van a UI-SPEC.
- Cómo se representa un bloque recién agregado (sin `id` todavía) en el payload del RPC.

> **Nota:** los tres ítems de UI ya fueron resueltos por `19-UI-SPEC.md` (aprobado 6/6). Ver §"Contrato
> de UI ya cerrado". Lo que sigue abierto y esta investigación cubre es la firma del RPC, la
> serialización del diff y el mapeo de rechazos.

### Deferred Ideas (OUT OF SCOPE)

- **Mapeo de servicios en los días especiales** (`schedule_exceptions`) — capacidad nueva: otra tabla
  puente, otro consumidor en la disponibilidad y otro en el backstop. Su propia fase.
- **Mostrar qué servicio corresponde a cada franja en la VISTA SEMANAL de turnos** — se decidió cerrar
  AGENDA-05 con el editor. Revisitar con datos de uso real.
- **Propagar `location_id` a la regla del comodín** (WR-04) — 0 negocios multi-sede medidos. Se cierra
  cuando aparezca el primero; toca el helper puro y los dos consumidores públicos.
- **Color por servicio** — `services` no tiene columna de color. Ayudaría a un taller con 8 talleres
  distintos; es capacidad nueva.

**Reviewed Todos (not folded):** `book_slot_atomic` ejecutable por `anon` (RA-05, preexistente desde
migr. 041 — candidato al milestone siguiente); gate de modo esquivable moviendo `services.business_id`
(territorio de `capacity_mode`, v0.27); flakiness de las suites de abono (infra de testing); turno
futuro marcado completado sin salida en el panel; "Seña pendiente" con el hold vencido en el roster.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descripción (REQUIREMENTS.md) | Soporte de esta investigación |
|----|-------------------------------|-------------------------------|
| **AGENDA-05** | El dueño asigna servicios a cada franja desde Agenda, y la grilla **muestra** qué se da en cada una sin abrir nada | §"El write path hoy" (dónde se rompe), §"Arquitectura recomendada" (RPC 074 + diff + reconciliación de ids), §"Contrato de datos del read path del panel" (las dos props que faltan en `agenda/page.tsx`), Pitfall P-01 (sin reconciliar ids el mapeo se duplica al segundo guardado) |
| **AGENDA-06** | Una franja sin servicios asignados se ve y se lee como **"cualquiera"**, no como un estado vacío | §"El default 'cualquiera' en la base" (0 filas ⇒ comodín, sin sentinel ni null), §"Funciones puras a agregar" (`servicesOfBlock` / `isBlockWildcard` en `lib/time-block-services.ts` — AGENDA-02 prohíbe reimplementar la regla en el componente) |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Leer bloques + puente + catálogo de servicios para pintar la línea | Frontend Server (RSC) | Database (RLS) | `app/(dashboard)/agenda/page.tsx` ya carga todo por `Promise.all` con `.eq('business_id')`; el UI-SPEC exige render sin fetch en cliente |
| Estado local del editor (chips prendidos, expandido, dirty) | Browser / Client | — | `agenda-client.tsx` es `'use client'`; D-03 fija "editá y después guardá" ⇒ el estado vive en React hasta el submit |
| Decidir "esta franja es comodín" | Shared pure lib (`lib/`) | — | AGENDA-02 lo manda: la regla vive en `lib/time-block-services.ts`, consumida idéntico por disponibilidad, backstop y panel |
| Escribir el diff de bloques + el mapeo, atómico | Database (RPC) | Browser (invoca) | D-04. PostgREST envuelve cada request en una transacción ⇒ un `supabase.rpc()` es todo-o-nada |
| Aislamiento por tenant del write | Database (RLS + FK compuestas 073) | Browser (`.eq('business_id')` explícito) | Regla dura de `supabase-multitenant-rls`: la RLS es la segunda capa, no la única |
| Contar franjas mapeadas para el aviso de borrado (D-07) | Browser (pre-check) | Database (el gate real) | Molde exacto de `openDeleteService` (`settings-client.tsx:1167-1225`): el pre-check es UX, no autoriza nada |
| Copy de `service_not_scheduled` (D-18) | Browser público (`booking-client.tsx`) | — | El código de error viaja; la copy es del cliente. Nunca interpolar el mensaje del server |

---

## Standard Stack

### Core

**Cero dependencias nuevas.** Todo sale del stack ya instalado y verificado en `package.json`:

| Librería | Versión (verificada en `package.json`) | Rol en esta fase | Por qué |
|----------|----------------------------------------|------------------|---------|
| `next` | `16.2.7` | RSC (`agenda/page.tsx`) + client component | Ya es el framework; nada de esta fase toca API de framework |
| `react` / `react-dom` | `19.2.4` | Estado local del editor | idem |
| `@supabase/supabase-js` | `^2.106.2` | `supabase.rpc(...)` desde el browser client | Ya presente; `.rpc()` ya se usa en `lib/booking-core.ts:499` |
| `@supabase/ssr` | `^0.10.3` | `createClient()` del RSC y del browser | Ya presente |
| `lucide-react` | `^1.17.0` | Iconos `Check` (ya importado :20) y `Asterisk` (nuevo, misma librería) | Única librería de iconos del proyecto |
| `sonner` | `^2.0.7` | Toasts de guardado / quitar inactivo | Ya presente |
| `vitest` | `^4.1.9` | Tests puros de las funciones nuevas | Ya presente; `npm test` = `vitest run` |

### Alternatives Considered

| En vez de | Se podría usar | Trade-off |
|-----------|----------------|-----------|
| RPC de Postgres (D-04) | 3 llamadas PostgREST separadas (delete / update / insert) desde el cliente | **Descartado por D-04 (locked).** Y con razón: entre la llamada 2 y la 3 el público VE un estado inconsistente vía `/api/booking/availability` |
| RPC de Postgres | Route handler autenticado (`app/api/agenda/hours`) con service-role | Mueve el aislamiento del tenant de la RLS al código del handler (más superficie, más chance de olvido). El RPC `SECURITY INVOKER` mantiene la RLS como paracaídas. **No recomendado** |
| `<button aria-pressed>` a mano | `Toggle` / `ToggleGroup` de shadcn | **Ninguno de los dos existe en `@/components/ui`** (verificado: 17 archivos, ninguno es toggle). El UI-SPEC prohíbe `npx shadcn add` en esta fase |

**Instalación:** ninguna. `npm install` no corre en esta fase.

---

## Package Legitimacy Audit

**No aplica: esta fase no instala ningún paquete externo.** La única dependencia nueva de código es un
icono (`Asterisk`) de `lucide-react ^1.17.0`, que ya está en `package.json` y ya se usa en el proyecto
(el archivo importa `Check`, `Users`, `Plus`, etc. de la misma librería en `agenda-client.tsx:20`).

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| — | — | — | Sin paquetes nuevos |

**Packages removed due to [SLOP] verdict:** ninguno.
**Packages flagged as suspicious [SUS]:** ninguno.

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────────────────────────────────────────┐
   Dueño (sesión)     │  app/(dashboard)/agenda/page.tsx   [RSC, anon+RLS]   │
   ────────────────▶  │  Promise.all:                                        │
                      │   • time_blocks        .eq(business_id) ✔ existe     │
                      │   • services (active)  .eq(business_id) ✔ NO TOCAR   │
                      │   • locations          ✔ existe                      │
                      │   • time_block_services  ✘ FALTA  ← query nueva      │
                      │   • serviceCatalog (todos, order created_at) ✘ FALTA │
                      └───────────────────────────┬──────────────────────────┘
                                                  │ props (server-rendered)
                                                  ▼
                      ┌──────────────────────────────────────────────────────┐
                      │  agenda-client.tsx  ['use client']                   │
                      │                                                      │
                      │  dayStates ← useState(initializer)  ⚠ NUNCA re-sync  │
                      │    LocalBlock { id?, start, end, label, location_id, │
                      │                 service_ids: string[]  ← NUEVO }     │
                      │                                                      │
                      │  BlockServicesLine ─┬─ isBlockWildcard()  ┐ funciones│
                      │                     └─ servicesOfBlock()  ┘ PURAS    │
                      │                        (lib/time-block-services.ts)  │
                      │                                                      │
                      │  [Guardar horarios] ──▶ validateBlocks()              │
                      └───────────────────────────┬──────────────────────────┘
                                                  │ UN solo supabase.rpc()
                                                  │ payload = SET COMPLETO
                                                  │ (todos los días,
                                                  │  todos los consultorios)
                                                  ▼
        ┌──────────────────────────────────────────────────────────────────────────┐
        │  migr. 074 · save_agenda_blocks(p_business_id, p_blocks jsonb)           │
        │  SECURITY INVOKER  ⇒ la RLS del dueño aplica adentro                     │
        │  ── PostgREST envuelve la llamada en UNA transacción ────────────────    │
        │   1. guard: el negocio es del auth.uid()                                 │
        │   2. DELETE time_blocks del negocio que NO están en el payload           │
        │        └─▶ CASCADE limpia su time_block_services (única FK hija)         │
        │   3. UPDATE los que traen id  (día/horas/label/location; NO capacity)    │
        │   4. INSERT los que no traen id  → RETURNING id                          │
        │   5. por bloque: DELETE los service_id que salieron                      │
        │                  INSERT los que entraron (ON CONFLICT DO NOTHING)        │
        │   6. RETURN QUERY el set final  ← el cliente reconcilia los ids          │
        │  error ⇒ RAISE ... USING ERRCODE='P0001' ⇒ ROLLBACK de TODO              │
        └───────────────────────────┬──────────────────────────────────────────────┘
                                    │ filas resultantes
                                    ▼
                      setDayStates(reconciliar ids)   ⚠ OBLIGATORIO (P-01)
                      setHoursDirty(false)


   ── El read path que esto alimenta (NO se toca en esta fase) ─────────────────────
   Cliente público ──▶ GET /api/booking/availability?serviceId=…
                        └─ lee time_blocks + time_block_services (service-role,
                           .eq('business_id') explícito) ──▶ startTimesNotOffered()
   Cliente público ──▶ POST /api/booking/create
                        └─ lib/booking-core.ts (backstop, fail-closed)
                           ──▶ isServiceAllowedAt() ──▶ error 'service_not_scheduled'
                                                        └─▶ D-18: copy nueva en
                                                            booking-client.tsx
```

### Component Responsibilities

| Archivo | Responsabilidad en esta fase | Estado |
|---------|------------------------------|--------|
| `app/(dashboard)/agenda/page.tsx` | Sumar 2 queries al `Promise.all` (:28): `time_block_services` y el catálogo completo de servicios | **modificar** |
| `app/(dashboard)/agenda/agenda-client.tsx` | `LocalBlock` + `service_ids`; `BlockServicesLine`/`ServiceChip` (fuera del componente, como `OccupancyBadge`); `saveHours()` reescrita a RPC; `applyCopyDay()` copia el mapeo; borrar el stepper; `hoursDirty` | **modificar (el grueso)** |
| `lib/time-block-services.ts` | 2 funciones puras nuevas: `servicesOfBlock`, `isBlockWildcard` | **extender** |
| `test/time-block-services.test.ts` | Casos de las 2 funciones nuevas, con control negativo | **extender** |
| `supabase/migrations/074_*.sql` | La función transaccional + sus grants | **crear** |
| `supabase/schema.sql` | Regenerar tras aplicar la 074 (patrón del repo) | **regenerar** |
| `app/(dashboard)/settings/settings-client.tsx` | `delInfo` gana el campo `blocks`; `delDescription` concatena la frase de D-07 | **modificar (chico)** |
| `app/[slug]/booking-client.tsx` | Rama `service_not_scheduled` en la cadena de :394-407 | **modificar (2 líneas)** |
| `lib/types.ts` | Nada obligatorio (`TimeBlockService` ya existe, :180-184). Opcional: quitar/anotar `TimeBlock.capacity` | opcional |

---

### El write path HOY — dónde exactamente se rompe

`saveHours()` (`agenda-client.tsx:366-390`), verbatim del comportamiento medido:

```ts
async function saveHours() {
  if (!validateBlocks()) { toast.error('Corregí los errores antes de guardar'); return }
  setSavingHours(true)
  await supabase.from('time_blocks').delete().eq('business_id', business.id)   // ← borra TODO
  const toInsert = []
  dayStates.forEach((ds, day) => {
    if (!ds.enabled) return
    ds.blocks.forEach(b => {
      if (activeLocations.length > 0 && !b.location_id) return                  // ← drop silencioso
      toInsert.push({ business_id, day_of_week: day, start_time, end_time,
                      label: b.label || null, location_id: b.location_id || null,
                      capacity: b.capacity || 1 })                              // ← D-12 lo saca
    })
  })
  if (toInsert.length > 0) {
    const { error } = await supabase.from('time_blocks').insert(toInsert)
    if (error) { toast.error('Error al guardar horarios'); setSavingHours(false); return }
  }
  await supabase.from('businesses').update({ default_slot_duration, buffer_minutes }).eq('id', business.id)
  setSavingHours(false); toast.success('Horarios guardados')
}
```

Cuatro hechos verificados que el planner necesita:

1. **El `.delete()` es POR NEGOCIO, no por consultorio** — borra los bloques de todos los consultorios.
   Y `dayStates` (:254-262) se construye desde `initialTimeBlocks` **sin filtrar por location**, así
   que el reinsert los repone todos. **Consecuencia dura para el diff: el payload del RPC tiene que ser
   el set COMPLETO** (todos los días, todos los consultorios). Si el planner arma el payload sólo con
   el consultorio activo (`activeLoc`), el paso 2 del RPC ("borrar los que no están en el payload")
   **borraría los bloques de los otros consultorios** — regresión silenciosa que sólo aparece en un
   negocio multi-sede.
2. **El drop silencioso de `!b.location_id`** cuando hay consultorios cargados: hoy esos bloques
   desaparecen en cada guardado. Con diff pasa a ser un DELETE explícito — mismo efecto neto. Conservar
   la regla, pero escribirla en el **constructor del payload** (cliente), no adentro del RPC.
3. **`await` sin chequear `error` en el `.delete()` y en el `.update()` de `businesses`.** El único
   error que hoy se mira es el del `insert`. El código nuevo debería mirar todos.
4. **El `update` de `businesses` (slot duration + buffer) queda FUERA de la transacción** si el RPC
   sólo cubre bloques+mapeo. Hoy ya está fuera, así que no es regresión. **Decisión para el planner:**
   plegarlo al RPC (un solo round-trip, "Guardar horarios" verdaderamente atómico) o dejarlo aparte
   (RPC más chico y más fácil de razonar). Recomendación: **dejarlo aparte** y correrlo *después* del
   RPC exitoso — `businesses.default_slot_duration` no participa de ninguna invariante con la puente.

---

### Pattern 1: La firma del RPC (D-04 · discreción de Claude)

**Qué:** una función `plpgsql` `SECURITY INVOKER` que recibe el set completo como `jsonb` y devuelve el
set resultante.
**Cuándo:** al hacer click en "Guardar horarios", después de `validateBlocks()`.

```sql
-- supabase/migrations/074_save_agenda_blocks.sql
CREATE OR REPLACE FUNCTION "public"."save_agenda_blocks"(
  "p_business_id" uuid,
  "p_blocks"      jsonb   -- [{ id, day_of_week, start_time, end_time, label, location_id, service_ids[] }]
) RETURNS TABLE("id" uuid, "day_of_week" integer, "start_time" time, "end_time" time,
                "label" text, "location_id" uuid, "service_ids" uuid[])
  LANGUAGE "plpgsql"
  SECURITY INVOKER               -- ⚠ INVOKER, no DEFINER: la RLS del dueño aplica adentro
  SET "search_path" TO 'public'
AS $$
...
$$;

-- ⚠ OBLIGATORIO (ver Pitfall P-02): la función nace ejecutable por anon por DOS vías.
REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"(uuid, jsonb) FROM "anon";
GRANT  EXECUTE ON FUNCTION "public"."save_agenda_blocks"(uuid, jsonb) TO "authenticated";
```

**Por qué `SECURITY INVOKER` y no `DEFINER`:** el único RPC no-trigger del schema hoy es
`book_slot_atomic`, que es `SECURITY DEFINER` con `GRANT ALL ... TO anon` — y eso es exactamente el
riesgo aceptado **RA-05** (*"`book_slot_atomic` es ejecutable por `anon` y saltea todos los controles
del route handler"*). Copiar ese molde acá crearía una segunda RA-05, esta vez sobre la **configuración
del negocio**. Con `INVOKER` la RLS de `time_blocks`, `time_block_services` y `businesses` aplica
adentro de la función y el peor caso de un payload forjado es "no hace nada".

**El guard explícito igual va** (regla del proyecto: la RLS es la segunda capa, no la única):

```sql
IF p_business_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = p_business_id AND b.owner_id = auth.uid())
THEN RAISE EXCEPTION 'not_your_business' USING ERRCODE = 'P0001';
END IF;
```

**Serialización del diff — recomendación:** *el estado deseado completo, no el delta*. El cliente manda
lo que quiere que quede; el RPC calcula el diff contra la base. Razones:
- El cliente no tiene forma confiable de saber qué cambió (`dayStates` no guarda el estado original).
- Un delta calculado en el cliente puede quedar viejo si otra pestaña guardó en el medio; el estado
  deseado es idempotente.
- Es exactamente la semántica de hoy ("lo que ves es lo que queda"), sin cambiar el modelo mental.

**Cómo se representa un bloque nuevo** (la tercera pregunta de discreción): `id: null` en el JSON. El
RPC bifurca por `id IS NULL` → INSERT; si no → UPDATE. **No** usar un uuid sintético generado en el
cliente: un uuid inventado que colisione con un bloque ajeno haría que el UPDATE apunte a otra fila
(la RLS lo frena, pero el fallo sería mudo).

**El RETURN es obligatorio, no cosmético.** Ver Pitfall P-01.

### Pattern 2: Mapeo de rechazos de la base a copy propia

**Qué:** traducir `error.code` + `error.message` a un código de dominio, y de ahí a copy — nunca
interpolar el mensaje.
**Molde exacto en el repo:** `deleteService` (`settings-client.tsx:1280-1297`):

```ts
// Source: app/(dashboard)/settings/settings-client.tsx:1282-1292
if (error) {
  // Mapeo del rechazo del gate de la migr. 065 (molde: lib/booking-core.ts — message primero,
  // code después). Dos messages distintos sobre el mismo ERRCODE P0001 para poder distinguir...
  if (error.code === 'P0001' && error.message?.includes('service_has_future_appointments')) return { ok: false, error: 'has_future_appointments' }
  if (error.code === 'P0001' && error.message?.includes('service_has_active_abono'))         return { ok: false, error: 'has_active_abono' }
  if (error.code === '23503') return { ok: false, error: 'has_future_appointments' }
  return { ok: false, error: 'unknown' }
}
```

Tabla de rechazos que la 074 puede producir, y su copy (todas propias del cliente):

| Señal de la base | Causa real | Copy sugerida |
|---|---|---|
| `P0001` + `not_your_business` | payload con otro `business_id` | `No se pudieron guardar los horarios. Recargá la página y probá de nuevo.` |
| `23503` (FK violation) | `tbs_block_same_tenant` / `tbs_service_same_tenant` de la 073: bloque o servicio de otro negocio | idem (mismo síntoma para el dueño) |
| `PGRST202` (function not found) | **la 074 no está aplicada en prod, o se aplicó sin `NOTIFY pgrst, 'reload schema'`** | genérica + `console.error` con prefijo `[agenda/save-hours]` para que el síntoma sea diagnosticable |
| `23514` (`time_blocks_capacity_positive`) | no debería ocurrir: la 074 no toca `capacity` | genérica |
| cualquier otro | red, RLS, etc. | `No se pudieron guardar los horarios. Revisá tu conexión y probá de nuevo.` (copy del UI-SPEC) |

**Prohibido** (T-14-25 / T-13-09): `toast.error(error.message)` o cualquier interpolación del mensaje de
Postgres en la UI.

### Pattern 3: Funciones puras nuevas en `lib/time-block-services.ts` (AGENDA-02)

El helper de la Phase 18 responde *"¿en qué franjas se da el servicio X?"*. El panel necesita la
pregunta **inversa**: *"¿qué servicios declara la franja Y?"* y *"¿esta franja es comodín?"*. Esas dos
respuestas **no pueden vivir en el componente** — AGENDA-02 y el propio encabezado del módulo lo
prohíben explícitamente:

> *"el panel de configuración de la Phase 19: qué franjas cubren cada servicio"* — `lib/time-block-services.ts:9-10`

```ts
// Source: propuesta para lib/time-block-services.ts (mismo contrato D-16: el caller filtra por tenant)

/** Los service_id que declara esta franja. Array VACÍO = franja comodín (D-01). */
export function servicesOfBlock(blockId: string, bridge: TimeBlockService[]): string[] {
  return bridge.filter((r) => r.time_block_id === blockId).map((r) => r.service_id)
}

/** ¿Esta franja es comodín? Sí ⟺ no tiene ninguna fila en la puente. */
export function isBlockWildcard(blockId: string, bridge: TimeBlockService[]): boolean {
  return !bridge.some((r) => r.time_block_id === blockId)
}
```

Mismo molde que `lib/agenda-occupancy.ts` con la ocupación: *"la UI sólo PINTA lo que un módulo puro
decide"*.

> ⚠ `isBlockWildcard` tiene que mirar **todas** las filas de la puente, incluidas las de servicios
> **inactivos** — el motor tampoco distingue. Una franja cuyo único mapeo es a un servicio desactivado
> **NO es comodín**, y el UI-SPEC lo dice explícito: *"si queda uno inactivo mapeado, la franja no es
> comodín y el chip no se muestra — porque el motor tampoco la trata como comodín"*.

### Pattern 4: El chip toggleable (molde ya en producción)

`settings-client.tsx:2777-2793` (`/equipo`, Phase 8) y `components/crm/tag-chip.tsx:42-64` (botón
externo 44px + pill interno). El UI-SPEC ya fijó el contrato exacto y **diverge del molde de `/equipo`
en el color**, con razón medida: `text-primary` a 12px sobre `--background` falla WCAG AA en 3 de las 5
paletas (red 3.54:1, green 3.59:1, yellow 2.36:1). Usar el tratamiento neutro del UI-SPEC.

### Anti-Patterns to Avoid

- **Reimplementar la regla del comodín en el componente.** Es literalmente lo que AGENDA-02 prohíbe y
  lo que la cabecera de `lib/time-block-services.ts:11-13` explica por qué duele.
- **`SECURITY DEFINER` en la 074.** Crea una segunda RA-05 sobre la configuración del negocio.
- **Payload del RPC limitado al consultorio activo.** Borraría los bloques de los otros consultorios.
- **Autosave al togglear un chip.** D-03 lo descartó; además sobre un bloque recién agregado no hay a
  qué mapear (no tiene id).
- **`toast.error(error.message)`.** T-14-25 / T-13-09.
- **Dejar `capacity` como campo oculto en `LocalBlock`.** D-12: *"un valor que no se ve y no decide nada
  es exactamente lo que D-12 vino a sacar"*.
- **`router.refresh()` como sustituto de reconciliar los ids.** No funciona: `dayStates` usa
  `useState(initializer)` y no se re-deriva de las props (ver P-01).

---

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|---|---|---|---|
| "¿Esta franja es comodín?" | Un `.filter().length === 0` inline en el JSX | `isBlockWildcard()` en `lib/time-block-services.ts` | AGENDA-02. Tres capas tienen que interpretar la regla idéntico o derivan (es el motivo escrito en la cabecera del módulo) |
| Atomicidad del guardado | `BEGIN` / `COMMIT` explícitos en el cuerpo plpgsql, o un flag de rollback manual | Un solo `supabase.rpc()` | PostgREST ya envuelve cada request en una transacción; un `RAISE` revierte todo [VERIFIED: docs.postgrest.org] |
| Rechazar filas cross-tenant | Endurecer el predicado de las 4 policies de la puente | Las **FK compuestas** `tbs_block_same_tenant` / `tbs_service_same_tenant` (migr. 073) | Ya están en producción y la 073 lo declara "molde a copiar en la Phase 19": *"la base pasa a rechazar la fila cross-tenant sin que ningún consumidor tenga que acordarse"* |
| Contar franjas mapeadas para D-07 | Contar en el cliente sobre datos ya cargados | Una 5ª query `count` en `openDeleteService`, fail-closed a `'error'` | El UI-SPEC lo exige ("no se cuenta en el cliente ni se estima") y el molde WR-02 ya está escrito: sin dato no se ofrece la acción |
| Área táctil de 44px sin engordar el pill | `padding` extra en el pill | Botón externo `min-h-11 min-w-11` + `<span h-7>` interno | Molde `tag-chip.tsx:42-64`, ya en producción |
| Parsear `'HH:MM'` a minutos | Otra copia de `toMinutes` | La que ya está en el módulo puro | RA-08 ya registró 3+6 copias como deuda; no sumar la séptima |

**Key insight:** el 90% de esta fase es **cablear cosas que ya existen** en el orden correcto. Cada vez
que aparezca la tentación de escribir lógica nueva, la pregunta es "¿cuál de los tres moldes ya
escritos (helper puro / RPC atómico / mapeo de error) cubre esto?".

---

## El default "cualquiera" en la base (AGENDA-06)

Pregunta directa del brief: *¿cómo se representa una franja sin asignar después de la Phase 18?*

**Respuesta: por AUSENCIA de filas. No hay sentinel, no hay `NULL`, no hay flag.**

Verificado contra `supabase/migrations/071_time_block_services.sql:82-87`:

```sql
CREATE TABLE IF NOT EXISTS "public"."time_block_services" (
  "business_id"    uuid NOT NULL REFERENCES businesses(id)   ON DELETE CASCADE,
  "time_block_id"  uuid NOT NULL REFERENCES time_blocks(id)  ON DELETE CASCADE,
  "service_id"     uuid NOT NULL REFERENCES services(id)     ON DELETE CASCADE,
  PRIMARY KEY ("time_block_id", "service_id")
);
```

Las tres columnas son `NOT NULL`. La tabla **no tiene ninguna columna más** (ni `created_at`). O sea:
el único estado posible de "esta franja no restringe nada" es **cero filas con ese `time_block_id`**.
La regla vive en el helper puro, nunca en la base (`071:17-21`).

**Lo que esto implica, punto por punto:**

| Superficie | Implicación |
|---|---|
| **Grilla / display** | "Comodín" no se puede leer de una columna: se computa. De ahí `isBlockWildcard(blockId, bridge)`. El chip "Cualquier servicio" se renderiza si y sólo si esa función da `true` |
| **Write path** | Volver a comodín = **DELETE de todas las filas** de esa franja. No hay "escribir el estado vacío". Es lo que hace D-17 al apagar el último chip |
| **Bloque nuevo (sin id)** | Nace comodín automáticamente: se inserta el bloque y no se inserta ninguna fila en la puente |
| **Cero backfill** | `071:55-58`: *"el día que esto se aplique TODOS los negocios tienen 0 filas ⇒ todas las franjas son comodín ⇒ nada cambia"*. Confirma el §Specifics del CONTEXT: **el estado por defecto es el estado de TODOS** |
| **Franja huérfana** (`time_blocks.business_id IS NULL`) | Nunca puede recibir mapeo (la FK compuesta con nulo no matchea) ⇒ queda comodín para siempre. Medido en local: **0 franjas huérfanas sobre 9**. Aceptado como RA-02 |
| **Borrar un servicio** | `ON DELETE CASCADE` en `service_id` ⇒ las franjas que lo tenían como **único** mapeo vuelven a comodín solas. **Ese es el motivo de existir de D-07** |
| **Desactivar un servicio** | La fila **sobrevive** (`active` es de `services`, no de la puente) ⇒ la franja **sigue restringida**. D-11 + el chip `· inactivo` del UI-SPEC |

---

## Contrato de datos del read path del panel

`app/(dashboard)/agenda/page.tsx:28` — el `Promise.all` actual carga 7 sets. Faltan **2**:

| Dato | Estado hoy | Qué hacer |
|---|---|---|
| `time_blocks` | ✔ `select('*')` con `id`, `.eq('business_id')`, `.order('day_of_week').order('start_time')` | nada |
| `services` | ✔ `select('*').eq('business_id', …).eq('active', true)` — **sin `order`** | **NO TOCAR.** Lo consume `NuevoTurnoForm`; meterle inactivos sería una regresión del alta manual |
| `locations` | ✔ | nada |
| **`time_block_services`** | ✘ | **query nueva**: `.select('business_id, time_block_id, service_id').eq('business_id', business.id)` (mismo shape que leen `availability/route.ts:167-170` y `booking-core.ts:249-252`) |
| **catálogo de servicios para los chips** | ✘ | **prop nueva** (`serviceCatalog`): `.select('id, name, active').eq('business_id', business.id).order('created_at')` — **sin** filtro de `active`, porque es lo único que puede nombrar a un servicio inactivo que sigue mapeado (D-11) |

Molde exacto del catálogo: `app/(dashboard)/servicios/page.tsx:22` ya hace
`.from('services').select('*').eq('business_id', business.id).order('created_at')`.

**El orden importa:** el UI-SPEC fija `created_at` ascendente y prohíbe reordenar por seleccionados. El
`services` que hoy recibe `agenda/page.tsx` **no tiene `order`**, así que no sirve como catálogo ni
aunque se le sacara el filtro.

---

## Cómo la disponibilidad pública consume el mapeo (NO romper esto)

Dos consumidores, los dos ya asegurados por la Phase 18 con `threats_open: 0`. Esta fase **no los
toca** — se documentan para que el planner no los rompa por accidente.

**1. `/api/booking/availability` (route handler, service-role)** — `availability/route.ts:160-185`:
- lee `time_blocks` con `select('id, start_time, end_time')` (`id` es lo que cruza contra la puente)
- lee `time_block_services` con `.eq('business_id', business.id)` explícito **aunque el cliente sea
  service-role** (la RLS no aplica ahí)
- llama `startTimesNotOffered(serviceId, blocks, bridge, duration)` → array de horarios a **OCULTAR**
- **fail-safe deliberado:** si la lectura falla, el array queda vacío y se ofrece de más (el backstop
  del `create` es la autoridad). Pero se loguea — degradar mudo no está permitido (WR-01)

**2. `POST /api/booking/create` → `lib/booking-core.ts:218-266` (backstop)**:
- gateado por `enforceServiceWindow`; **fail-CLOSED** (opuesto al de arriba): NaN en `dow`/`startMin`, o
  error en cualquiera de las dos queries ⇒ `service_not_scheduled` 400 (fix CR-02)
- usa `service.id` **re-validado por `business_id`**, nunca el `serviceId` que mandó el cliente
- `isServiceAllowedAt(...)` decide

**3. `public_time_block_services` (vista acotada, migr. 071 §3)** — creada, `GRANT SELECT` desde la
072, **sin consumidor todavía**. Es para el RSC público de la **Phase 20**. No tocarla acá.

**Lo que esta fase le cambia al read path:** nada estructural. Le cambia **los datos**: hasta hoy la
puente tiene 0 filas en producción y los dos consumidores caen siempre por el camino comodín. En cuanto
el panel escriba la primera fila, esas ramas empiezan a morder de verdad — y por eso D-18 trae acá la
copy de `service_not_scheduled` (WR-07, aceptado *"con la condición de que la Phase 19 no se dé por
cerrada sin ella"*).

---

## Aislamiento por tenant — el molde a espejar

La skill `supabase-multitenant-rls` es obligatoria acá. Lo que el repo ya hace, verificado:

**Escritura del panel = browser client (anon key + sesión) + `.eq('business_id')` explícito + RLS.**
Ejemplo canónico y el hermano más cercano de esta fase — `toggleProfessionalService`
(`settings-client.tsx:1739-1776`), que escribe la **otra** tabla puente del proyecto:

```ts
// Source: app/(dashboard)/settings/settings-client.tsx:1744-1749
const { error } = await supabase
  .from('professional_services')
  .delete()
  .eq('business_id', business.id)      // ← defensa en profundidad; la RLS ya acota
  .eq('professional_id', professionalId)
  .eq('service_id', serviceId)
```

Su comentario de cabecera dice literalmente el criterio: *"Escritura por el browser client con RLS +
`.eq('business_id')` (defensa en profundidad), **NUNCA service-role**"*.

**Cómo se traslada al RPC de la 074:**

| Capa | Cómo se cumple |
|---|---|
| Rol | `authenticated` (browser client con la sesión del dueño). **Nunca** service-role, nunca `anon` |
| RLS | `SECURITY INVOKER` ⇒ las policies de `time_blocks` (`business access`, `tenant insert`, `tenant update`) y las 4 de `time_block_services` aplican adentro |
| `.eq('business_id')` explícito | `p_business_id` es parámetro y **todos** los `WHERE`/`INSERT` del cuerpo lo llevan |
| Pertenencia cruzada | Las FK compuestas de la 073 rechazan `(bloque de A, servicio de B)` en la base |
| Guard de autoría | `EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id AND owner_id = auth.uid())` ⇒ `RAISE ... P0001` |
| Grants | `REVOKE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated` |

**Dato que sube el riesgo y hay que tener presente:** `time_blocks` tiene la policy
`public read time_blocks FOR SELECT USING (true)` (schema.sql:2379) — o sea que **los ids de las
franjas de cualquier negocio son públicos**. La 073 lo dice: *"los ids ajenos son PÚBLICOS"*. Un payload
forjado con el `time_block_id` de otro tenant es un ataque **realizable**; lo que lo frena es la
combinación FK compuesta + RLS + guard, no la oscuridad del id.

---

## Common Pitfalls

### P-01 — El editor nunca re-sincroniza con la base ⇒ el segundo guardado DUPLICA

**Qué sale mal:** el dueño toca "Guardar horarios" dos veces seguidas y termina con cada bloque nuevo
duplicado (y su mapeo repartido entre las dos copias).

**Por qué pasa:** `dayStates` se inicializa con `useState(() => ...)` (`agenda-client.tsx:254-262`) y
**no hay ningún `useEffect` que lo re-derive de `initialTimeBlocks`** — verificado: el único `useEffect`
del archivo (:209) es de otro tema. Hoy no molesta porque el delete-all+insert vuelve basura todos los
ids en cada guardado y nadie los mira. Con diff, un bloque insertado en el guardado #1 sigue teniendo
`id: undefined` en el estado local ⇒ el guardado #2 lo vuelve a INSERTAR.

**Cómo evitarlo (obligatorio):** el RPC **devuelve** las filas resultantes y `saveHours()` escribe los
ids de vuelta en `dayStates` antes de bajar `savingHours`. Necesita una clave de correlación estable
entre el payload y el retorno — la más simple: que el RPC devuelva las filas **en el mismo orden del
array de entrada** (con `WITH ORDINALITY` sobre el `jsonb_array_elements`), o que el cliente mande un
`tmp_key` por bloque que el RPC eche de vuelta.

**`router.refresh()` NO alcanza:** re-ejecuta el RSC y actualiza las props, pero el inicializador de
`useState` ya corrió y nunca vuelve a correr.

**Señal temprana:** guardar dos veces sin recargar y ver el mismo horario dos veces en la grilla.

---

### P-02 — La función nueva nace ejecutable por `anon`, por DOS vías

**Qué sale mal:** la 074 queda invocable por cualquiera con la anon key pública (que está en el bundle
del navegador), repitiendo RA-05 pero sobre la configuración del negocio.

**Por qué pasa:** dos defaults se suman.
1. PostgreSQL concede `EXECUTE` a `PUBLIC` por defecto en toda función nueva.
   [CITED: postgresql.org/docs/17/ddl-priv.html — *"EXECUTE privilege for functions and procedures"*]
2. El baseline del proyecto tiene
   `ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon"`
   (`supabase/migrations/00000000000000_baseline.sql:3081`) — **verificado, sigue vigente**: la migr.
   073 revocó los defaults de escritura sólo sobre **TABLES**, nunca sobre **FUNCTIONS**.

**Cómo evitarlo:** los tres statements de grant del §Pattern 1, dentro de la 074.

**Con `SECURITY INVOKER` el daño de un olvido es acotado** (la RLS frena a `anon`, que no tiene ninguna
policy sobre `time_blocks tenant insert`), pero el `REVOKE` es igual obligatorio: es la misma clase de
agujero que la 073 acaba de cerrar y dejarlo abierto sería regresión de la postura de seguridad.

**Señal temprana:** `SELECT proacl FROM pg_proc WHERE proname='save_agenda_blocks';` con `anon=X/` en la
lista.

---

### P-03 — El payload por consultorio borra los otros consultorios

**Qué sale mal:** un negocio con 2 sedes guarda los horarios de la sede A y pierde los de la sede B.

**Por qué pasa:** la UI del editor opera **por consultorio activo** (`dayBlocks` filtra por `activeLoc`
en :904), pero el guardado de hoy es **por negocio** (`.delete().eq('business_id')` + `dayStates`
completo). Si el planner arma el payload con `dayBlocks` en vez de `dayStates`, el paso "borrar los que
no están en el payload" arrasa con lo demás.

**Cómo evitarlo:** construir el payload desde `dayStates` **entero** (7 días × todos los bloques,
todos los consultorios), aplicando el filtro `if (activeLocations.length > 0 && !b.location_id) return`
que hoy existe en :377.

**Señal temprana:** medida directa — en un negocio con 2 consultorios, guardar desde el tab A y
verificar que los bloques del tab B siguen ahí.

---

### P-04 — `applyCopyDay` comparte la referencia del array de servicios

**Qué sale mal:** se copia martes a jueves y viernes; togglear un chip del jueves cambia también el del
viernes.

**Por qué pasa:** `applyCopyDay` (:356) hoy copia campos escalares con spread implícito
(`{ start_time: b.start_time, ... }`). Un `service_ids: b.service_ids` **comparte la referencia**.

**Cómo evitarlo:** `service_ids: [...b.service_ids]`. Ya está anotado como riesgo #2 del UI-SPEC.

---

### P-05 — Aplicar la 074 sin `NOTIFY pgrst, 'reload schema'`

**Qué sale mal:** el código deployado llama a una función que PostgREST no expone ⇒ `PGRST202` en cada
guardado de horarios.

**Por qué pasa:** PostgREST cachea el schema. La cabecera de la 071 (`071:70-74`) ya documenta este modo
de falla para la tabla y la vista.

**Cómo evitarlo:** el runbook de la 074 incluye `NOTIFY pgrst, 'reload schema';` y la verificación
posterior. Y el cliente mapea `PGRST202` a copy propia con un `console.error` diagnosticable — sin eso,
el síntoma es indistinguible de "problema de red".

---

### P-06 — Quitar `capacity` del payload y creer que hay que resetear la columna

**Qué sale mal:** el UPDATE del RPC setea `capacity = 1` "para limpiar", y en un negocio que tenía
bloques con cupo > 1 se pierde un dato histórico sin motivo.

**Por qué es un no-problema si se hace bien:** `time_blocks.capacity` es
`smallint DEFAULT 1 NOT NULL` con `CHECK (capacity >= 1)` (schema.sql:1334-1335). **Omitirla del INSERT
es seguro** (entra el default) y **omitirla del UPDATE también** (la fila conserva su valor). D-12 pide
dejar de **escribirla**, no reescribirla a mano. La columna ya no decide nada desde la 068
(`lib/types.ts:109-114`).

**Detalle verificado para la limpieza de la UI:** el import de `Minus` (:20) **NO se puede borrar** —
además del stepper (:949) hay un segundo uso en :1038. El UI-SPEC ya pide verificarlo; acá queda
resuelto: **el import se queda**.

---

### P-07 — Reimplementar la regla del comodín en el JSX

**Qué sale mal:** el panel y el motor divergen; una franja se pinta comodín y el público no la ve así
(o al revés). Es exactamente el modo de falla que el módulo puro existe para prevenir.

**Cómo evitarlo:** las dos funciones puras del §Pattern 3, con sus casos en
`test/time-block-services.test.ts`. El estándar del workstream es el **control negativo por cada caso
comodín** (el test file lo declara en su cabecera: *"los casos con la puente VACÍA son el camino
comodín, o sea el comportamiento de HOY — pasan aunque la regla no exista"*).

---

### P-08 — El pre-check de borrado que cuenta 0 por error

**Qué sale mal:** el diálogo de D-07 dice "0 franjas" cuando en realidad la query falló, y el dueño
borra un servicio mapeado a 4 franjas sin enterarse.

**Por qué pasa:** `count` vuelve `null` ante error, y un `?? 0` lo vuelve indistinguible de "no hay
nada". Es literalmente WR-02 de la Phase 15, ya documentado en `settings-client.tsx:1150-1155`.

**Cómo evitarlo:** el 5º count entra en el mismo `Promise.all` (:1174-1200) y en el mismo guard de
error (:1205-1209) ⇒ cualquier fallo cae en `delInfo = 'error'` y el botón "Eliminar" no se ofrece
(`hideConfirm`, :3393). **No agregar una rama nueva de fail-open.**

Query: `.from('time_block_services').select('time_block_id', { count: 'exact', head: true })
.eq('business_id', business.id).eq('service_id', s.id)`.

---

### P-09 — El error de bloque queda separado de sus inputs

**Qué sale mal:** al insertar la línea de chips en el wrapper `div.space-y-1` (:923), el mensaje
`block.error` (:977-979) queda debajo de los chips en vez de pegado a los inputs de hora.

**Cómo evitarlo:** el UI-SPEC lo fija — la línea de servicios es el **tercer** hijo, **después** de
`block.error`. Está en el spec pero es el detalle que más fácil se pierde al editar JSX anidado.

---

### P-10 — `validateBlocks()` no valida el mapeo, y no tiene por qué

**Qué NO hacer:** agregar una validación tipo "esta franja no tiene servicios". Es **el estado válido
por defecto del 100% de los negocios** (AGENDA-06). Cualquier error, warning o asterisco sobre una
franja comodín contradice el requisito de la fase.

`validateBlocks()` (:314-341) sigue validando sólo horas y solapamientos. Nada más entra ahí.

---

## Code Examples

### Leer la puente en el RSC (molde exacto de los dos consumidores públicos)

```ts
// Source: app/api/booking/availability/route.ts:167-170 (mismo shape en lib/booking-core.ts:249-252)
const { data: tbsRaw, error: tbsErr } = await supabase
  .from('time_block_services')
  .select('business_id, time_block_id, service_id')
  .eq('business_id', business.id)
if (tbsErr) console.error('[agenda/page] error leyendo time_block_services:', tbsErr.message)
```

### Consumir la regla del comodín sin reimplementarla

```ts
// Source: app/api/booking/availability/route.ts:179-184 — el molde de uso del helper puro
notOffered = startTimesNotOffered(
  serviceIdParam,
  (capBlocks || []) as BlockWindow[],
  (tbsRaw || []) as TimeBlockService[],
  Number(svc.duration_minutes) || 30,
)
```

### Toggle de una puente con rollback optimista (referencia, NO el patrón de esta fase)

```ts
// Source: app/(dashboard)/settings/settings-client.tsx:1766-1775
const row: ProfessionalService = { business_id: business.id, professional_id: professionalId, service_id: serviceId }
setProfessionalServices(prev => [...prev, row])
const { error } = await supabase.from('professional_services').insert(row)
if (error) {
  setProfessionalServices(prev => prev.filter(r => !(r.professional_id === professionalId && r.service_id === serviceId)))
  toast.error('No se pudo guardar el cambio. Revisá tu conexión y probá de nuevo.')
}
```

> ⚠ **Este molde NO se copia para el toggle de chips de esta fase.** `/equipo` escribe al instante;
> D-03 fija "editá y después guardá". El toggle acá sólo muta `dayStates` y prende `hoursDirty`. Se
> incluye porque es el hermano más cercano del *write path de una tabla puente* y su comentario de
> cabecera es la fuente del criterio de aislamiento.

### RAISE en plpgsql con código de dominio (molde del schema)

```sql
-- Source: supabase/schema.sql:582,587 (services_block_delete) y :315,420 (book_slot_atomic)
RAISE EXCEPTION 'service_has_future_appointments' USING ERRCODE = 'P0001';
```

---

## Migraciones

**Pregunta del brief: ¿esta fase necesita una migración?**
**Respuesta: SÍ — una, la 074, y sólo por D-04.** No hay ningún cambio de esquema: la tabla puente, sus
índices, sus 4 policies, sus FK compuestas y su vista pública ya están. Lo único que la 074 agrega es
**la función transaccional**.

| Ítem | Valor | Verificación |
|---|---|---|
| Próximo número libre | **074** | `ls supabase/migrations/` termina en `073_tenant_integrity_and_default_privs.sql` |
| Contenido | 1 `CREATE OR REPLACE FUNCTION` + 2 `REVOKE` + 1 `GRANT` | — |
| Cambios de esquema (tablas/columnas/índices/policies) | **ninguno** | La puente ya existe (071), sus FK compuestas también (073) |
| Idempotencia | `CREATE OR REPLACE` + los grants son idempotentes | Regla del `migrations/README.md` |
| Destructiva | no | idem |
| Validación | `supabase db reset` LOCAL (PG17) replaya baseline → 074 | Runbook de las 071/072/073 |
| Aplicación a prod | **A MANO**, coordinada con el deploy, + `NOTIFY pgrst, 'reload schema';` | `071:68-75` |
| Post-aplicación | Regenerar `supabase/schema.sql` | Patrón del repo (042/057/059/071) |

**⚠ Estado de las 071/072/073 en producción — CONFIRMAR CON EL OPERADOR ANTES DE PLANIFICAR EL DEPLOY.**
Hay evidencia contradictoria en los artefactos:
- `18-VERIFICATION.md:152` dice: *"las migraciones 071 y 072 NO están aplicadas a producción (prod
  sigue en la 070)"*.
- `18-SECURITY.md` §9 (posterior) dice: *"Pendiente operativo: aplicar la migr. 073 a producción junto
  con el deploy (**las 071 y 072 ya están**)"*.
- La memoria del proyecto dice que las tres están en prod.

**Sin la 071/073 aplicadas, la 074 no puede funcionar** (no hay tabla que escribir ni FK que valide).
El planner debería incluir un **checkpoint de verificación en prod** antes del deploy de esta fase, no
asumir. Consulta de verificación:

```sql
SELECT to_regclass('public.time_block_services') IS NOT NULL AS tabla_071,
       EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tbs_block_same_tenant') AS fk_073;
```

**Nota de citación en el CONTEXT:** D-04 cita `supabase/migrations/058_book_slot_atomic.sql` como molde.
**Ese archivo no existe.** `book_slot_atomic` se define en `041_time_blocks_capacity_and_seat.sql` y se
redefine en 042/054/058/061/062/063/064/068/069/**070** (la más reciente). La 058 se llama
`058_professional_auto_assignment.sql`. El molde a leer es la **070** (última versión vigente) o el
cuerpo en `supabase/schema.sql:213-528`.

---

## Testing

`workflow.nyquist_validation` está en **`false`** en `.planning/config.json` ⇒ no corresponde la sección
de Validation Architecture. Lo que sigue es el estado real del testing en esta área.

**Infra:** Vitest `^4.1.9`, `environment: 'node'`, `vite-tsconfig-paths` para el alias `@/*`,
`vitest.setup.ts` carga `.env.local`. Comando: `npm test` (= `vitest run`).

**Suite existente relevante:**

| Archivo | Tipo | Qué congela |
|---|---|---|
| `test/time-block-services.test.ts` | **puro (sin DB)** | Los 16 casos de la regla del comodín, con control negativo por cada caso comodín. **Es el archivo a extender** |
| `test/agenda-occupancy.test.ts` | puro | El molde de "módulo puro + suite exhaustiva" que el CONTEXT cita como referencia |
| `test/availability-service-window.test.ts` | integración (DB local) | El read path de la disponibilidad contra la puente |
| `test/booking-service-window-backstop.test.ts` | integración (DB local) | El backstop del `create` + `service_not_scheduled` |
| `test/isolation.test.ts` (:349-428) | integración | El aislamiento de la puente y de su vista pública |
| `test/service-delete-gate.test.ts` | integración | El gate de borrado de servicios (contexto de D-07) |
| `test/helpers/booking-fixtures.ts` (:242-262) | helper | `seedTimeBlockService()` — sembrar una fila de la puente |

**Funciones puras que conviene extraer para que la fase sea testeable sin base:**

| Función | Dónde | Por qué vale la pena |
|---|---|---|
| `servicesOfBlock(blockId, bridge)` | `lib/time-block-services.ts` | AGENDA-02 la exige fuera del componente; testeable con las factories `block()`/`map()` que el test file ya tiene |
| `isBlockWildcard(blockId, bridge)` | `lib/time-block-services.ts` | idem. Caso mordedor: franja con **un solo mapeo a un servicio inactivo** ⇒ `false` |
| `buildSaveHoursPayload(dayStates, activeLocations, businessId)` | nuevo (`lib/agenda-hours-payload.ts` o local exportado) | Encierra las 3 reglas que hoy están enterradas en `saveHours`: el set es completo (P-03), se descartan los bloques sin `location_id` cuando hay consultorios (:377), y `capacity` no viaja (D-12). Testeable con objetos planos |
| `reconcileBlockIds(dayStates, rpcResult)` | idem | Cierra P-01 con un test en vez de con cuidado. Caso mordedor: **guardar dos veces sin recargar no puede duplicar nada** |

**Nota de infra ya conocida (no es de esta fase):** con la suite completa hay contención contra la misma
DB local. `--no-file-parallelism` da 77 archivos / 1013 passed. Está registrado como todo de `testing`.

**Consumidor faltante de la Phase 18:** `isServiceScheduled` sigue sin caller (RA-09, *"dead code
temporal"* — se aceptó *"hasta la Phase 19"*). El CONTEXT resolvió el aviso de cobertura por otro
camino (D-07 usa un `count` de la base, no el helper), así que **RA-09 probablemente sobreviva a esta
fase**. Vale anotarlo, no forzar un uso artificial.

---

## Contrato de UI ya cerrado (no re-derivar)

`19-UI-SPEC.md` está **aprobado 6/6** y sus specs están LOCKED. Lo que el planner necesita saber sin
volver a abrirlo:

- **4 bloques, 3 archivos.** A: la línea de servicios (`agenda-client.tsx`, NUEVO). B: la fila pierde el
  stepper (`agenda-client.tsx:941-965`, SE BORRA). C: `delDescription`
  (`settings-client.tsx:1233-1247`, SE AMPLÍA). D: rama `service_not_scheduled`
  (`booking-client.tsx:394-407`, SE AGREGA).
- **Cero componentes nuevos en `@/components/ui`.** Dos funciones locales en `agenda-client.tsx`
  (`ServiceChip`, `BlockServicesLine`), hermanas de `OccupancyBadge` (:110-145) y **definidas fuera del
  componente** para no recrearse en cada render.
- **Prohibido `npx shadcn add`** y prohibido agregar dependencias.
- **Gate de vertical:** la línea no se renderiza si `resolveVertical(business).key === 'canchas'`.
  Precedente en el repo: `settings-client.tsx:955` (`isCanchas`) y `equipo/page.tsx:18`.
- **Terminología:** `resolveVertical(business).terminology.services` (`'Servicios'` / `'Prestaciones'` /
  `'Canchas'` — verificado en `lib/verticals.ts:50,74,95,115`). **No existe la forma singular**, de ahí
  la excepción declarada del chip "Cualquier servicio" literal.
- **Umbral de "ver todos" = 6 chips** (los marcados nunca se colapsan). **Chip "Cualquier servicio" =
  informativo, no clickeable.** **Servicio inactivo mapeado = se muestra marcado, `border-dashed`,
  sufijo `· inactivo`.**
- **`hoursDirty` cubre 6 mutadores:** `toggleDay`, `addBlock`, `removeBlock`, `updateBlock`,
  `applyCopyDay`, el toggle de chips. *"Un indicador de estado sucio que miente es peor que no
  tenerlo."*

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Directiva | Fuente | Cómo afecta a esta fase |
|---|---|---|
| **Next 16, NO 14.** Consultar `node_modules/next/dist/docs/` antes de asumir comportamiento del framework. Middleware = `proxy.ts` | `AGENTS.md`, `.claude/CLAUDE.md` | Esta fase **no toca API de framework**: es un client component + un RSC que ya existen. No hay nada que verificar en los docs de Next para este alcance |
| **Aislamiento por tenant no negociable.** Toda query/policy/route que toque datos de un negocio lo garantiza (RLS + `business_id`) | `.claude/CLAUDE.md` | El write path de la 074 y las 2 queries nuevas del RSC |
| **Migraciones SQL numeradas, aplicadas a mano y en orden** | `.claude/CLAUDE.md` | La 074 no se aplica por el flujo GSD |
| **Vercel Hobby: cron máximo diario** | `.claude/CLAUDE.md` | No aplica (esta fase no agrega crons) |
| **Dev env Windows + PowerShell** | `.claude/CLAUDE.md` | Los comandos del plan van en sintaxis PowerShell, no bash |
| **Errores como `{ ok:false, error:'<codigo_snake>' }`**; códigos de Postgres traducidos a dominio | `.claude/CLAUDE.md` §Conventions | El mapeo de rechazos de la 074 |
| **Comentarios densos en español explicando el POR QUÉ** | `.claude/CLAUDE.md` §Conventions | `saveHours()` reescrita y la cabecera de la 074 tienen que estar al nivel de la 071/073 |
| **`.eq('business_id', business.id)` en toda query del dashboard** | `.claude/CLAUDE.md` §Module design | Las 2 queries nuevas del `Promise.all` |
| **`@/*` como único alias; nada de rutas relativas profundas** | `.claude/CLAUDE.md` | Imports de las funciones puras nuevas |
| **Usar Edit, nunca Write, sobre archivos existentes** (cambio < 80%) | `~/.claude/CLAUDE.md` §3 | `agenda-client.tsx` tiene 1344 líneas: `saveHours()` se reescribe con Edit, no el archivo entero |
| **Touch targets ≥ 44×44; contraste WCAG AA; focus visible** | `~/.claude/CLAUDE.md` §UI | Ya materializado por el UI-SPEC |
| **Reutilizar el componente existente antes de crear uno nuevo** | `~/.claude/CLAUDE.md` §UI | El UI-SPEC lo cierra: 0 componentes nuevos de `@/components/ui` |
| **Skills obligatorias:** `supabase-multitenant-rls` + `convenciones-forjo` | `.claude/CLAUDE.md` §Project Skills | Leer antes de escribir la 074 y el write path |
| **Todo output al usuario en español** | preferencia registrada | Copy, comentarios, mensajes de commit |

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---|---|---|---|
| El cupo lo decide `time_blocks.capacity` | El cupo lo decide `services.capacity` para los 3 modos | migr. **068** (v0.27) | Habilita D-12: la columna no decide nada y sale de la UI y del write path |
| Las vistas `public_*` con `GRANT ALL` (escribibles por `anon`) | `GRANT SELECT` exclusivamente, **nunca** `security_invoker` | migr. **072** | Regla dura si en el futuro esta línea de trabajo crea otra vista. Esta fase no crea ninguna |
| La pertenencia al tenant en una puente se confía a las policies | FK **compuestas** contra `(id, business_id)` de los padres | migr. **073** | Ya cubre la puente. *"Molde a copiar en la Phase 19 y en cualquier puente nueva"* |
| Los defaults de escritura de `anon` sobre relaciones futuras | Revocados para TABLES | migr. **073** | **NO cubre FUNCTIONS** ⇒ P-02 sigue vivo |
| Franja = sólo "cuándo se atiende" | Franja puede declarar "qué se da" | migr. **071** (Phase 18) | Es el modelo que esta fase vuelve configurable |

**Deprecado / a no propagar:**
- `time_blocks.capacity` — se conserva por compatibilidad; **nadie la lee para decidir** desde la 068.
- El bloque de `GRANT ALL` de la 071 §3 — la propia migración lo marca: *"NO copiar este bloque de
  GRANT como molde: usar `GRANT SELECT`"*.
- `saveHours()` con delete-all + reinsert — esta fase lo retira.

---

## Assumptions Log

| # | Claim | Sección | Riesgo si está mal |
|---|---|---|---|
| A1 | Las migraciones 071/072/073 **están** aplicadas en producción (memoria + `18-SECURITY.md` §9 dicen que sí; `18-VERIFICATION.md` dice que no) | §Migraciones | La 074 falla al aplicarse y el panel escribe contra una tabla inexistente. **Mitigación: verificar en prod antes de deployar (query provista)** |
| A2 | El baseline `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon` sigue vigente en el Postgres de **producción** (verificado en el archivo del repo; no medido contra prod) | Pitfall P-02 | Si ya estuviera revocado, el `REVOKE` de la 074 es un no-op inofensivo. Riesgo asimétrico hacia el lado seguro |
| A3 | `time_block_services` sigue siendo el **único** hijo de `time_blocks` (el CONTEXT lo declara verificado contra el catálogo; confirmado en `schema.sql` — sólo `time_block_services_time_block_id_fkey` y `tbs_block_same_tenant` referencian `time_blocks`) | §El default "cualquiera" | Si apareciera otro hijo, el diff de D-01 igual lo protege por construcción |
| A4 | El editor no tiene que sincronizar contra escrituras concurrentes de otra pestaña / del agente WhatsApp (last-write-wins es aceptable) | §Pattern 1 | Dos pestañas abiertas del mismo dueño: la última pisa. Es el comportamiento de hoy; no es regresión |
| A5 | `resolveVertical(business).key === 'canchas'` es el gate correcto y no hay verticales nuevos previstos | §Contrato de UI | Es lo que el UI-SPEC ya fijó y lo que `settings-client.tsx:955` usa |

---

## Open Questions

1. **¿El `update` de `businesses` (slot duration + buffer) entra al RPC?**
   - Qué sabemos: hoy está fuera de cualquier transacción con los bloques (`saveHours` :387) y ni
     siquiera chequea `error`.
   - Qué no está claro: si D-04 ("el guardado entero es todo o nada") lo abarca.
   - Recomendación: **dejarlo fuera** y correrlo después del RPC exitoso, chequeando `error`.
     `default_slot_duration` no participa de ninguna invariante con la puente, y meterlo agranda la
     firma del RPC sin cerrar ningún estado inconsistente observable por el público.

2. **¿La clave de correlación entre el payload y el retorno del RPC?**
   - Qué sabemos: hace falta sí o sí (P-01).
   - Opciones: (a) `WITH ORDINALITY` y devolver en el orden del array de entrada; (b) un `tmp_key` por
     bloque que el RPC eche de vuelta.
   - Recomendación: **(b)**, más explícita y robusta a que alguien reordene el payload. Cuesta una
     columna más en el `RETURNS TABLE`.

3. **¿El RPC devuelve también el mapeo, o sólo los bloques?**
   - Recomendación: **también el mapeo** (`service_ids uuid[]` por bloque). Cierra la ventana en que el
     estado local del mapeo se cree distinto del persistido, y cuesta un `array_agg`.

4. **¿RA-09 (`isServiceScheduled` sin consumidor) se cierra en esta fase?**
   - Qué sabemos: se aceptó "hasta la Phase 19", pero D-07 resolvió el aviso con un `count` de la base,
     no con el helper.
   - Recomendación: **no forzar un uso artificial.** Anotarlo como riesgo aceptado que se traslada, o
     dejarlo para la Phase 20 (que sí explica al público el vacío de cobertura).

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node + npm | build / tests | ✓ | según el entorno del dev | — |
| Supabase CLI (Postgres local PG17) | `supabase db reset` para validar la 074 | ✓ (configurado, commit `9e4c0c0`) | — | — |
| Acceso al SQL editor de Supabase **prod** | aplicar la 074 a mano + `NOTIFY pgrst` | ✓ (el operador) | — | ninguno: **es un checkpoint humano obligatorio** |
| Vitest | tests de las funciones puras | ✓ | `^4.1.9` | — |
| Vercel | deploy | ✓ | Hobby | — |

**Dependencias faltantes sin fallback:** ninguna de código.
**Acción externa obligatoria (bloqueante para el cierre de la fase):** aplicar la 074 a producción a
mano, coordinada con el deploy, + `NOTIFY pgrst, 'reload schema';` + regenerar `supabase/schema.sql`.
Y antes: **confirmar que 071/072/073 están en prod** (A1).

---

## Security Domain

`workflow.security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: high`.
**`secure-phase` corresponde**: esta fase escribe sobre el mapeo que la superficie pública consume, y
crea una función invocable desde el cliente.

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar en esta fase |
|---|---|---|
| V2 Authentication | sí (indirecto) | `supabase.auth.getUser()` en el RSC + `redirect('/login')` (ya existe, `agenda/page.tsx:10-11`). El RPC valida `auth.uid()` |
| V3 Session Management | no directo | Lo maneja `proxy.ts` + `@supabase/ssr`; esta fase no lo toca |
| **V4 Access Control** | **sí — el eje de la fase** | RLS (071 §1, 4 policies) + `.eq('business_id')` explícito + FK compuestas (073) + `SECURITY INVOKER` + guard `owner_id = auth.uid()` + `REVOKE EXECUTE FROM anon` |
| **V5 Input Validation** | **sí** | El payload `jsonb` viene del cliente: el RPC no puede confiar en `business_id`, `time_block_id` ni `service_id`. Validación por la base (FK compuestas + RLS), no por confianza. `validateBlocks()` cubre la forma horaria |
| V6 Cryptography | no | Esta fase no genera ni maneja secretos |
| V7 Error Handling / Logging | sí | Copy propia por código de error, **nunca** el mensaje de Postgres (T-14-25 / T-13-09). `console.error('[agenda/save-hours] …')` con el prefijo de módulo |

### Patrones de amenaza conocidos para este stack

| Patrón | STRIDE | Mitigación estándar |
|---|---|---|
| Payload forjado con `time_block_id` de otro tenant (los ids **son públicos** vía `public read time_blocks`) | Tampering | FK compuesta `tbs_block_same_tenant` (073) ⇒ `23503`. + RLS + `p_business_id` en todos los `WHERE` |
| Payload forjado con `service_id` de otro tenant | Tampering / Elevation | FK compuesta `tbs_service_same_tenant` (073). Es la variante **no inerte**: convertiría una franja propia en "mapeada a un servicio ajeno" ⇒ deja de ofrecer los propios (medido y documentado en `073:53-59`) |
| Payload con `p_business_id` de otro negocio | Elevation of Privilege | Guard `owner_id = auth.uid()` + `SECURITY INVOKER` ⇒ la RLS filtra igual |
| **Función nueva ejecutable por `anon`** | Elevation of Privilege | `REVOKE EXECUTE FROM PUBLIC, anon` + `GRANT TO authenticated` (P-02). Precedente vivo: RA-05 |
| Mensaje de Postgres filtrado a la UI (nombres de tabla/constraint) | Information Disclosure | Mapeo por `error.code` + `message.includes(...)` a códigos de dominio; copy propia |
| Guardado a medias visible por el público vía `/api/booking/availability` | Tampering / Repudiation | D-04: transacción única |
| Borrado de un servicio que deja franjas comodín **sin aviso** | (no es una amenaza técnica sino de integridad de intención) | D-07: aviso con el número, pre-check fail-closed |
| Payload gigante (DoS por muchos bloques) | Denial of Service | Riesgo bajo: el editor está acotado a 7 días × N bloques por consultorio y la RLS acota el alcance. Anotar, no gatear |

**Migración con relevancia de seguridad:** la 074 crea una función invocable desde el cliente ⇒ va con
runbook y con la verificación de `proacl` post-aplicación.

---

## Sources

### Primary (HIGH confidence) — código del repositorio, leído en esta sesión
- `app/(dashboard)/agenda/agenda-client.tsx` — `saveHours` :366-390, `applyCopyDay` :347-364, `LocalBlock` :173, `dayStates` :254-262, fila del bloque :920-995, stepper :941-968, botón guardar :1003-1007, `Minus` :20/:949/:1038, `validateBlocks` :314-341
- `app/(dashboard)/agenda/page.tsx` — el `Promise.all` :28-56
- `lib/time-block-services.ts` — las 4 funciones puras + el contrato D-16
- `app/api/booking/availability/route.ts` :90-185 — el read path público
- `lib/booking-core.ts` :205-266 — el backstop fail-closed
- `app/[slug]/booking-client.tsx` :380-415 — la cadena de errores donde entra D-18
- `app/(dashboard)/settings/settings-client.tsx` — `openDeleteService` :1167-1225, `delDescription` :1233-1247, `deleteService` :1280-1297, `toggleProfessionalService` :1739-1776, chips :2740-2800, `isCanchas` :955
- `app/(dashboard)/servicios/page.tsx` — el molde del catálogo completo de servicios
- `supabase/migrations/071_time_block_services.sql` (íntegra), `073_tenant_integrity_and_default_privs.sql` (íntegra)
- `supabase/migrations/00000000000000_baseline.sql:3080-3083` — los default privileges de FUNCTIONS
- `supabase/schema.sql` — `time_blocks` DDL :1325-1336, policies :2225/:2379/:2430/:2436, `book_slot_atomic` :213-250, `RAISE EXCEPTION` :315-644, grants :4195-4197
- `lib/types.ts` — `TimeBlock` :99-117, `TimeBlockService` :180-184, `Service` :198-223
- `lib/verticals.ts` — `terminology.services` :50/:74/:95/:115
- `test/time-block-services.test.ts`, `test/helpers/booking-fixtures.ts:242-262`
- `components/crm/tag-chip.tsx:42-64`
- `package.json`, `vitest.config.mts`, `.planning/config.json`, `supabase/migrations/README.md`

### Primary (HIGH confidence) — artefactos de planificación
- `19-CONTEXT.md`, `19-UI-SPEC.md` (aprobado 6/6)
- `18-SECURITY.md` §9 (WR-07 con condición, WR-04, RA-05/RA-08…RA-11), `18-PATTERNS.md`, `18-VERIFICATION.md`
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`

### Secondary (HIGH confidence) — documentación oficial externa
- [PostgREST — Transactions](https://docs.postgrest.org/en/v12/references/transactions.html) — *"Every request to an API resource runs inside a transaction… Any database failure will result in a rollback… you can also RAISE an error inside a function to cause a rollback… If the transaction doesn't fail, it will always end in a COMMIT."* [VERIFIED: docs oficiales]
- [PostgreSQL 17 — 5.8 Privileges](https://www.postgresql.org/docs/17/ddl-priv.html) — *"For other types of objects, the default privileges granted to PUBLIC are as follows: … EXECUTE privilege for functions and procedures"* [VERIFIED: docs oficiales]

### Tertiary (LOW confidence)
- Ninguna. No hubo claim que dependiera de una sola búsqueda web sin confirmar.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — cero dependencias nuevas; todas las versiones leídas de `package.json`
- Write path actual y dónde se rompe: **HIGH** — líneas exactas leídas, no inferidas
- Read path público: **HIGH** — los dos consumidores leídos íntegros
- Modelo de datos y el default "cualquiera": **HIGH** — DDL + cabecera de la 071 + FK de la 073
- Aislamiento por tenant: **HIGH** — molde vivo (`toggleProfessionalService`) + las 4 policies + las FK compuestas
- Pitfalls P-01 / P-02 / P-03: **HIGH** — los tres medidos contra el código, no supuestos
- Estado de las 071/072/073 en producción: **LOW** — evidencia contradictoria (A1). **Requiere confirmación del operador**
- Firma exacta del RPC: **MEDIUM** — es discreción de Claude; la recomendación está fundada pero el planner puede afinarla

**Research date:** 2026-08-25
**Valid until:** 2026-09-24 (30 días — stack estable, sin dependencias externas que se muevan). Se
invalida antes si se aplica cualquier migración nueva o si se toca `agenda-client.tsx`.
