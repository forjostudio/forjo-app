# Phase 2: Configuración de Canchas - Research

**Researched:** 2026-06-30
**Domain:** Modelo de datos multi-tenant (Supabase/Postgres + RLS) + CRUD dashboard (Next.js 16 RSC + client) — auto-provisión de entidad reservable sobre el motor de espacio compartido v0.12
**Confidence:** HIGH (todo verificado contra el código real del repo; cero dependencias externas nuevas)

## Summary

La Phase 2 es **100% código de aplicación sobre esquema ya existente**: cero migraciones, cero columnas, cero tablas, cero RLS nueva. Las decisiones D-01..D-05 se sostienen contra el código real. El hallazgo central que habilita todo: **no existe ninguna tabla join `service_professionals` / `professional_services`** en el esquema [VERIFIED: grep supabase/migrations]. Un `appointment` referencia `professional_id` y `service_id` por separado (ambos nullable, `lib/types.ts:198-200`), y el booking elige cada uno independientemente. Por lo tanto **el linkeo 1:1 cancha↔agenda NO es una FK ni un join de DB — es una convención de aplicación**: la auto-provisión crea, en una transacción lógica, 1 `service` + 1 `professional` + N `spaces` + N `agenda_spaces`, y la app trata esa tupla como "una cancha".

El camino de booking ya lee la **duración** del `service` (`booking-core.ts:83-91`) y el **precio** del `service` vía `services(price)` en el flujo de pago (`payment/create`, `payment/webhook`, `payment/retry`). La seña que se cobra es business-level (`deposit_amount`), no del service. Esto valida D-01 fuerte: si la cancha ES un `service`, Phase 3 consume precio+duración sin cambiar la fuente. El acople de disponibilidad por espacio compartido ya está vivo y es agnóstico al rubro: tanto el read-path (`availability/route.ts:86-139`) como el write-path atómico (`book_slot_atomic`, migr. 042) resuelven los espacios vía `agenda_spaces` keyado por `professional_id`.

El trabajo de UI es **adaptar + migrar dentro de `SettingsClient`** (un único componente de 1808 líneas que ya contiene TODO el CRUD de services, professionals, spaces y agenda_spaces). La pantalla `/servicios` ya renderiza `SettingsClient` con `view="servicios"` pero hoy NO carga professionals/spaces/agendaSpaces (los pasa vacíos). La config de espacios vive hoy en `view="equipo"` (`/equipo/page.tsx`), que para canchas **redirige a /dashboard** — así que esa UI es hoy inalcanzable para un negocio de canchas. Migrarla a `/servicios` (D-03) es obligatorio, no opcional.

**Primary recommendation:** Implementar una función de auto-provisión client-side (browser client + RLS, patrón ya usado por todo `SettingsClient`) que inserte `service → professional → space(s) → agenda_spaces` en secuencia, cada fila con `business_id: business.id`, y exponer una UI de "Cancha" en `/servicios` que esconda la tupla. NO introducir server actions ni RPC nuevos: el patrón establecido del repo es browser-client + RLS WITH CHECK por tenant + UI optimista.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** El precio y la duración fija de la cancha viven en **`services`** (Opción A). Cada cancha = **1 fila en `services`** (que ya tiene `price` + `duration_minutes`) atada **1:1** a su agenda (`professionals`). **Cero columnas/tablas nuevas.** Reusa TODO el camino existente de booking / precio / seña / disponibilidad y el **anti-solape-por-duración** del motor → Phase 3 consume la cancha casi sin cambios. Trade-off aceptado: "cancha como service" es conceptualmente un poco indirecto, y hay que **forzar la relación 1:1 agenda↔service para canchas** (los services son normalmente m:n con professionals; el planner/researcher resuelve el mecanismo de linkeo).
- **D-02:** Crear una cancha es **una sola acción de UI** que auto-provisiona, por debajo: (1) un `Service` (nombre + precio + duración), (2) su agenda `professionals` (el "bucket" del motor), (3) su(s) `Space` + el mapeo `agenda_spaces`. El dueño ve y edita "una cancha"; la tupla es plomería. Toda fila auto-provisionada **setea `business_id`** (aislamiento por tenant).
- **D-03:** El manager de canchas vive en la pantalla **`/servicios` existente** (ya rotulada "Canchas" en el menú del vertical canchas), **adaptada**: campos de cancha (nombre + precio + duración) + mapeo de espacios + auto-agenda. La config de espacios/agenda que vivía en el **tab Equipo** (`settings-client.tsx` view="equipo") **migra acá**. NO se crea ruta nueva ni se toca el menú de Phase 1.
- **D-04:** **Auto 1:1 por defecto + compartir opcional.** Cada cancha nueva crea su **propio `Space` dedicado** automáticamente, sin que el dueño piense en "espacios". Un control **avanzado opcional** permite marcar "esta cancha **comparte espacio** con X" (caso F11 → {A,B,C}).
- **D-05:** **Soft-delete** (`active = false`, mismo patrón que `services` hoy). Hard-delete solo permitido si la cancha no tiene reservas.

### Claude's Discretion
- Validaciones exactas (precio > 0; duración > 0, en minutos; min/max o múltiplos; presets 30/60/90 vs input libre) — seguir los patrones de validación de `services`.
- Si el form de cancha reusa el componente de servicios existente o uno adaptado.
- Mecánica exacta del control "compartir espacio" (dropdown de canchas/espacios existentes, etc.).
- Etiquetado, orden y filtro activo/inactivo de la lista de canchas.
- Mecanismo concreto del linkeo 1:1 agenda↔service para canchas (a resolver en research/planning según cómo `services` se vincula hoy a `professionals`).

### Deferred Ideas (OUT OF SCOPE)
- **Pricing por franja horaria (peak/off-peak)** — PRICING-FRANJA-01, v2.
- **Staff/profesionales en canchas** — STAFF-CANCHAS-01, v2.
- **Turnos fijos / abonos recurrentes** — diferido, milestone/fase propia.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CANCHA-01 | El dueño crea una cancha como entidad reservable con nombre, precio propio y duración fija, y le asocia uno o más espacios físicos | Auto-provisión `service`+`professional`+`space`+`agenda_spaces` (todos los inserts ya existen en `SettingsClient`: `addService` 356-366, `addProfessional` 487-512, `addSpace` 565-579, `toggleAgendaSpace` 596-622). El service aporta name+price+duration (`lib/types.ts:137-150`). |
| CANCHA-02 | El dueño edita y elimina canchas; cada cancha puede tener su propia duración (variable entre canchas) | Edit de service ya existe (`saveEditService` 403-420, edita `duration_minutes`+`price`). Duración variable ya soportada por el motor (anti-solape por duración, `book_slot_atomic` migr. 042). Soft-delete vía `active` (`toggleService` 380-383). |
| CANCHA-03 | La config de canchas reusa el motor de v0.12 (`spaces`/`agenda_spaces`) sin re-migrar; mapear cancha→espacios sigue acoplando la disponibilidad | El acople ya está vivo: `availability/route.ts:86-139` (read) + `book_slot_atomic` (write, migr. 042) resuelven espacios vía `agenda_spaces` keyado por `professional_id`. Mapear = insertar filas `agenda_spaces`; el motor las consume sin cambios. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Crear/editar/borrar cancha (CRUD) | Frontend Server (`/servicios/page.tsx` carga datos) + Browser Client (escrituras) | Database (RLS WITH CHECK) | Patrón establecido del dashboard: RSC fetchea por tenant, `SettingsClient` escribe con browser client + RLS. NO server actions. |
| Auto-provisión de la tupla (service+pro+space+agenda_space) | Browser Client (`SettingsClient`) | Database (RLS) | Todos los inserts ya viven client-side con RLS; la auto-provisión las orquesta en secuencia. |
| Aislamiento por tenant | Database (RLS por `business_id`) | Browser Client (filtro explícito `.eq('business_id', ...)` defensa en profundidad) | RLS ya existente en services/spaces/agenda_spaces; el cliente además filtra (patrón `deleteService` 371, `deleteProfessional` 545). |
| Acople de disponibilidad por espacio | Database/API (`book_slot_atomic` + `availability` service-role) | — | Ya vivo (motor v0.12); Phase 2 solo crea las filas `agenda_spaces` que el motor lee. NO se toca. |
| Lectura de precio/duración en booking | API/Database (`booking-core` lee service; payment lee `services(price)`) | — | Ya implementado; Phase 2 no lo modifica. La cancha-como-service hace que Phase 3 lo herede. |

## Standard Stack

Cero dependencias nuevas. Todo el trabajo usa lo ya presente:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.106.2 (en `package.json`) | Cliente Postgres/RLS (browser + server) | Ya es el cliente único del proyecto |
| `@supabase/ssr` | ^0.10.3 | Cliente SSR con cookies (RSC `page.tsx`) | Ya usado por todos los `page.tsx` del dashboard |
| Next.js | 16.2.7 | App Router, RSC, route handlers | Stack del proyecto (NO Next 14 — `proxy.ts`, breaking changes) |
| React | 19.2.4 | RSC + client components | Stack del proyecto |

### Supporting (componentes UI ya en `SettingsClient`)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `@/components/ui/{input,label,button,card,dialog,select}` | Form de cancha + lista + edición | Reusar el form de service existente (líneas 1186-1219 alta, 1224-1261 edición) |
| `@/components/crm/confirm-dialog` (`ConfirmDialog`) | Confirmación de borrado | Ya usado para borrar service/location (1785-1804); replicar para cancha |
| `sonner` (`toast`) | Feedback de éxito/error | Patrón en todo el archivo |
| `lucide-react` (`Plus, Trash2, Clock, DollarSign, Pencil, MapPin, Check`) | Iconografía | Ya importados (línea 21) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Browser client + RLS (patrón actual) | Server actions / RPC `provision_cancha` atómico | El repo NO usa server actions para este CRUD; introducir una rompería el patrón y el perfil del dev (vendor-choices: "no swap them out"). Una RPC SECURITY DEFINER daría atomicidad real pero exige migración (prohibido en esta fase, D-01). **Recomendación: secuencia client-side con rollback manual** (ver Pitfall 1). |

**Installation:** Ninguna. `npm install` no se ejecuta en esta fase.

**Version verification:** No aplica — sin paquetes nuevos.

## Package Legitimacy Audit

No se instalan paquetes externos en esta fase. Auditoría no requerida.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Hallazgos por pregunta de research

### Pregunta 1 — Vínculo `services` ↔ `professionals` HOY (clave de D-01/D-02)

**Hallazgo: NO existe tabla join. NO existe FK `service.professional_id`. Son independientes.** [VERIFIED: grep + lectura de schema]

- `grep professional_services|service_professionals` en todo el repo → **0 resultados** [VERIFIED: Grep].
- `services` (baseline `00000000000000_baseline.sql:560-571`): columnas `id, business_id, name, duration_minutes, price, description, active, created_at, location_id, location_ids`. **No hay `professional_id`** [VERIFIED: lectura].
- `professionals` (`baseline:488-501`): `id, business_id, name, photo_url, active, created_at, location_id, last_name, specialty, license_number, phone, email`. **No hay `service_id`** [VERIFIED].
- El vínculo se materializa **solo en el momento de la reserva**: `appointments.professional_id` + `appointments.service_id` (`lib/types.ts:198-200`, ambos `| null`). El booking elige service y professional por separado (`booking-core.ts:83-104`: valida cada uno contra `business_id` de forma independiente) [VERIFIED].

**Implicación para el linkeo 1:1 (D-01):** "forzar 1:1 agenda↔service para canchas" NO se hace con una constraint de DB (no hay dónde colgarla sin migración, prohibida en D-01). Se hace por **convención de aplicación**: la auto-provisión crea exactamente 1 service + 1 professional juntos, y la UI los presenta/edita como una sola "cancha". El bucket del motor es `professional_id` (ver `book_slot_atomic` `v_bucket`, migr. 042:144).

**Mecanismo recomendado para el 1:1 (a resolver explícitamente en el plan):** El problema real es **¿cómo recupera la app la tupla?** Hoy no hay columna que ligue el service a su professional. Opciones, en orden de preferencia:

1. **[RECOMENDADO] Emparejamiento por convención + carga conjunta, sin columna nueva.** La cancha se presenta como la fila de `service`; su agenda es el `professional` creado en el mismo acto. Para reconstruir la tupla al listar/editar/borrar, emparejar **por nombre idéntico** (el professional se crea con `name = service.name`) NO es robusto (renombrar rompe el match). **El gap real:** sin una columna de enlace, la app no puede saber con certeza qué professional pertenece a qué service. **El planner DEBE resolver esto.** Sub-opciones sin migración:
   - **1a. Cargar todo y emparejar por orden/heurística** — frágil, no recomendado.
   - **1b. [RECOMENDADO] Usar `professionals.specialty` (o `license_number`) como puntero al `service.id`.** La columna ya existe, es texto, no se usa en el vertical canchas (no hay "especialidad" de una cancha). Guardar `specialty = service.id` da un FK lógico sin migrar. La UI de canchas no muestra specialty. **Esto es un [ASSUMED] sobre semántica de columnas reusables — el planner/usuario debe confirmar que reusar `specialty` como puntero es aceptable, o elegir otra columna libre.** Ver Assumptions Log A1.
   - **1c. Modelar la cancha como la fila de `professional`, y el `service` como satélite emparejado por la misma técnica inversa** — equivalente, peor (el precio/duración viven en service, que es el eje de D-01).

2. **Alternativa descartada (viola D-01):** agregar `services.professional_id` (1 columna + 1 índice). Es lo más limpio y robusto, pero **D-01 dice "cero columnas/tablas nuevas"**. **RIESGO/DECISIÓN PARA EL PLANNER:** si el emparejamiento sin columna resulta demasiado frágil en la práctica, esta es la mínima desviación de D-01 que lo resuelve de raíz. Flaggeado para que el usuario decida (ver Open Questions Q1).

> **Esta es la mayor incertidumbre técnica de la fase.** D-01 lockea "cancha = service" y "1:1 agenda↔service", pero el esquema actual no tiene cómo expresar ese 1:1 sin alguna columna de enlace. El planner debe lockear UNA de las sub-opciones (1b reuso de columna existente, o aceptar la mínima migración de 1 columna) en discuss/plan antes de ejecutar.

### Pregunta 2 — Patrón de auto-provisión (D-02)

**Hallazgo: HOY se crean con inserts secuenciales del browser client + RLS, UI optimista, sin transacción ni RPC.** [VERIFIED: lectura de `settings-client.tsx`]

Cada entidad tiene su propio insert client-side, todos seteando `business_id: business.id`:
- `addService` (`settings-client.tsx:356-366`): `supabase.from('services').insert({ name, duration_minutes, price, location_ids, business_id }).select().single()` [VERIFIED].
- `addProfessional` (`487-512`): `supabase.from('professionals').insert({ ...proToPayload(newPro), business_id }).select().single()` [VERIFIED].
- `addSpace` (`565-579`): `supabase.from('spaces').insert({ name, business_id }).select().single()` [VERIFIED].
- `toggleAgendaSpace` (`596-622`): `supabase.from('agenda_spaces').insert({ business_id, professional_id, space_id })` con rollback optimista en error [VERIFIED].

**`business_id` se setea explícito en cada insert**, pero la autoridad de tenant es la RLS WITH CHECK (la columna es NOT NULL y la policy valida que `business_id ∈ negocios del owner`). Comentario del propio código: *"el business_id se pasa porque la columna es NOT NULL, pero la policy lo valida (no es superficie falsificable)"* (`settings-client.tsx:555-556`) [CITED: settings-client.tsx:553-556].

**NO hay transacción ni RPC de provisión.** Cada insert es autocommit independiente.

**Patrón recomendado para crear service+professional+space+agenda_space (D-02):**

```typescript
// Auto-provisión de una cancha (browser client + RLS). Secuencia con rollback manual:
// cada insert es autocommit, así que NO hay atomicidad real — si un paso falla, se revierten
// los anteriores borrándolos. Defensa en profundidad: business_id en cada fila (RLS lo valida).
async function provisionCancha(input: { name: string; price: number; duration: number; sharedSpaceIds?: string[] }) {
  // 1. Service (eje de precio+duración, D-01)
  const { data: svc, error: e1 } = await supabase.from('services')
    .insert({ name: input.name, price: input.price, duration_minutes: input.duration, business_id: business.id })
    .select().single()
  if (e1 || !svc) { toast.error('Error al crear la cancha'); return }

  // 2. Professional (agenda/bucket del motor). specialty = svc.id → puntero lógico 1:1 (ver Q1, A1).
  const { data: pro, error: e2 } = await supabase.from('professionals')
    .insert({ name: input.name, specialty: svc.id, business_id: business.id })
    .select().single()
  if (e2 || !pro) {
    await supabase.from('services').delete().eq('id', svc.id).eq('business_id', business.id) // rollback
    toast.error('Error al crear la cancha'); return
  }

  // 3. Space dedicado (D-04: auto 1:1 por defecto) — salvo que comparta espacios existentes.
  let spaceIds = input.sharedSpaceIds ?? []
  if (spaceIds.length === 0) {
    const { data: sp, error: e3 } = await supabase.from('spaces')
      .insert({ name: input.name, business_id: business.id })
      .select().single()
    if (e3 || !sp) { /* rollback pro + svc */ ; return }
    spaceIds = [sp.id]
  }

  // 4. agenda_spaces: mapear la agenda a su(s) espacio(s).
  const rows = spaceIds.map(space_id => ({ business_id: business.id, professional_id: pro.id, space_id }))
  const { error: e4 } = await supabase.from('agenda_spaces').insert(rows)
  if (e4) { /* rollback space (si dedicado) + pro + svc */ ; return }
  // éxito → actualizar estado local optimista (services, professionals, spaces, agendaSpaces)
}
```

**Caveat de atomicidad (Pitfall 1):** sin RPC/transacción, una falla parcial deja filas huérfanas. El rollback manual mitiga pero no garantiza (si el rollback falla, queda basura). Para esta fase es aceptable (mismo nivel de garantía que el resto del `SettingsClient`), pero el plan debe incluir el rollback explícito en cada paso. Una RPC `SECURITY DEFINER` daría atomicidad real **pero exige migración** (prohibida en D-01).

### Pregunta 3 — Pantalla `/servicios` a adaptar (D-03)

**Hallazgo: `/servicios/page.tsx` renderiza `SettingsClient` con `view="servicios"`, pero NO carga professionals/spaces/agenda_spaces.** [VERIFIED]

- `/servicios/page.tsx` (29 líneas, leído completo): carga solo `services` + `locations`, y pasa `initialProfessionals={[]}`, sin `initialSpaces`/`initialAgendaSpaces` (default `[]`) [VERIFIED].
- `SettingsClient` con `view="servicios"` mapea a `tabValue='services'` (`SECTION_TAB`, línea 144) → renderiza solo el `TabsContent value="services"` (líneas 1150-1262): lista de services + form de alta (nombre/min/precio/consultorios) + dialog de edición + soft-delete vía `toggleService` + `ConfirmDialog` de borrado [VERIFIED].
- La config de **espacios + mapeo agenda_spaces vive en el `TabsContent value="professionals"`** (líneas 1339-1441), que se renderiza con `view="equipo"`, NO con `view="servicios"` [VERIFIED].

**Qué hay que adaptar / migrar para canchas (D-03):**

1. **`/servicios/page.tsx` debe cargar también `professionals`, `spaces`, `agenda_spaces`** (hoy los pasa vacíos). Patrón a copiar: `/equipo/page.tsx:22-26` (mismo `Promise.all` con `.eq('business_id', business.id)`). Sin esto, la UI de cancha no puede mostrar/mapear espacios.
2. **El render de cancha** (cuando `resolveVertical(business).key === 'canchas'`): el form de alta debe disparar `provisionCancha` (no `addService` solo); la lista debe mostrar "canchas" (terminología ya da `service→Cancha`, `services→Canchas` vía `term`, `settings-client.tsx:160` resuelve `term`). El control "compartir espacio" (D-04) es un add-on opcional en el form.
3. **Migrar el bloque de espacios/mapeo** (hoy en el tab `professionals`, líneas 1343-1441) para que sea alcanzable desde `view="servicios"` en canchas. Discreción del dev: reusar el bloque tal cual condicionándolo por vertical, o extraerlo a un sub-componente.
4. **`/equipo/page.tsx` ya redirige a `/dashboard` para canchas** (`equipo/page.tsx:18`) — así que la UI de espacios en `view="equipo"` es **inalcanzable hoy para canchas**. Por eso migrarla a `/servicios` es obligatorio (no hay regresión: nadie de canchas la ve hoy). Para salud/belleza/general, `view="equipo"` sigue intacto (NO tocar ese camino).

**Patrón de validación de services a replicar** (Claude's Discretion las validaciones exactas): el alta actual usa `min={5} step={5}` para duración y `min={0} step={100}` para precio (`settings-client.tsx:1195,1199`); el guard es `if (!newService.name) return`. Para canchas: precio > 0 y duración > 0 (los presets 30/60/90 son discreción).

### Pregunta 4 — Camino de precio/duración en booking (valida D-01)

**Hallazgo: la DURACIÓN sale del service; el PRECIO del service se usa en el flujo de pago; la seña es business-level.** D-01 validado. [VERIFIED]

- **Duración:** `booking-core.ts:83-91` selecciona `duration_minutes` del `service` filtrado por `business_id`, y la pasa al RPC como `p_duration` (`252`). Comentario explícito: *"De acá sale la duración real (no se confía en nada del cliente)"* [VERIFIED]. `availability/route.ts` también usa `duration_minutes` (del appointment, que lo heredó del service) para el solapamiento.
- **Precio:** NO se usa en `booking-core.ts` (la seña usa `deposit_amount`). El precio del service se lee en el **camino de pago**: `payment/create:30` (`services(name, price)`), `payment/webhook:160-161,174,206` (`servicePrice` para el registro de venta y el email), `payment/retry:19` [VERIFIED].
- **Seña:** `deposit_amount` es business-level (`businesses.deposit_amount`, `booking-core` usa `requireDeposit`/`depositExpiryHours`; `payment/create:43` lee `business.deposit_amount`) [VERIFIED]. **La seña NO es el precio de la cancha** — son cosas distintas.

**Implicación para Phase 3:** la cancha-como-service significa que Phase 3 obtiene precio (`service.price`) y duración (`service.duration_minutes`) de la misma fuente que cualquier service, sin cambios en booking-core ni availability. **El "precio mostrado/asociado a la reserva" (ALQUILER-04) = `service.price`** — exactamente lo que `payment/webhook` ya lee.

**RIESGO MENOR para el planner (no bloquea D-01):** el precio de la cancha solo viaja al flujo de pago **cuando hay seña** (`require_deposit=true`). Si un negocio de canchas NO cobra seña, el `service.price` no se materializa hoy en ninguna venta/email (el booking sin seña no registra precio). Phase 3 debe decidir si el precio de la cancha se muestra/registra aun sin seña. Es scope de Phase 3, pero conviene anotarlo. Ver Open Questions Q2.

### Pregunta 5 — RLS / aislamiento (security relevance Medio)

**Hallazgo: `services` tiene UNA policy `USING` (sin WITH CHECK por op); `spaces`/`agenda_spaces` tienen 4 policies por op WITH CHECK. Todas aíslan por `business_id ∈ negocios del owner`. NO hace falta RLS nueva.** [VERIFIED]

- **`services`** (`baseline:1227-1229`): `CREATE POLICY "business member access" ON services USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))`. **Es una sola policy `FOR ALL` con `USING` y SIN `WITH CHECK` explícito** [VERIFIED]. En Postgres, una policy `FOR ALL` sin `WITH CHECK` usa la expresión de `USING` también como check de INSERT/UPDATE — así que el INSERT de un service con `business_id` ajeno **sí se rechaza** (el `business_id` debe estar en los negocios del owner). El aislamiento se sostiene, aunque el estilo difiere del patrón de 4-policies del milestone seguridad. **NO requiere cambio para esta fase** (los services ya existían y funcionan; agregar canchas no cambia su RLS).
- **`professionals`** (`baseline:1221-1223`): mismo patrón `USING` de una policy [VERIFIED].
- **`spaces`** (`042:55-71`): 4 policies por op (select/insert/update/delete) con WITH CHECK en insert/update, predicado `owner_id = auth.uid()` [VERIFIED].
- **`agenda_spaces`** (`042:90-106`): idénticas 4 policies por op [VERIFIED].

**Conclusión de seguridad:** D-01 NO agrega tablas → **cero RLS nueva**. El único requisito del secure-phase es que **cada insert de la auto-provisión setee `business_id`** (la RLS lo valida; el código ya lo hace en todos los inserts existentes). Un negocio NO puede crear/mapear canchas o espacios de otro tenant porque las 4 policies de `spaces`/`agenda_spaces` (y la `USING` de `services`/`professionals`) lo rechazan a nivel DB.

**Exposición a `anon`:** NINGUNA en esta fase. `spaces`/`agenda_spaces` NO tienen policy anon (D-06, `042:54,87`). Existe la vista `public_services` (`baseline:577-592`, expone `name, duration_minutes, price, ...` de services activos) — **pero esa exposición es de Phase 3** (booking público), NO de Phase 2. Phase 2 es 100% dashboard autenticado. El secure-phase debe verificar que Phase 2 **no agregue** ninguna exposición anon nueva (no debería: todo corre por browser client autenticado + RLS).

**Defensa en profundidad ya presente:** los deletes filtran explícito por `business_id` además de RLS (`deleteService:371`, `deleteProfessional:545`, `deleteSpace:583`). Replicar ese patrón en cualquier delete de cancha.

### Pregunta 6 — Acople de disponibilidad (awareness de Phase 3)

**Hallazgo: el acople por espacio ya está vivo en read-path y write-path, keyado por `professional_id` vía `agenda_spaces`. Solo documentar.** [VERIFIED]

- **Write-path (autoridad atómica):** `book_slot_atomic` (migr. 042:126-238). Resuelve `v_space_ids` de la agenda reservada vía `agenda_spaces` (filtrado por `professional_id` crudo, `162-165`), toma un advisory lock por cada `space_id` en orden ascendente (anti-deadlock, `170-172`), y rechaza con `slot_taken` cualquier turno solapado en una **agenda hermana que comparta ≥1 espacio** (`179-195`). Excluye la self-agenda (auto-conflicto F11, `187-188`). Backstop declarativo: `appointment_spaces` + EXCLUDE gist (`273-298`) [VERIFIED].
- **Read-path (espejo UX):** `availability/route.ts:86-139`. Con service-role resuelve los espacios de la agenda consultada, encuentra agendas hermanas que comparten espacio, y mergea sus turnos vivos a `busy` (NUNCA a `full`, Pitfall 5) [VERIFIED]. La forma de la respuesta NO cambia (`{ ok, busy, full }`, D-06).
- **Re-check UX en core:** `booking-core.ts:143-174` hace el mismo chequeo de espacio compartido como rechazo temprano (no autoritativo) [VERIFIED].

**Para Phase 2:** crear las filas `agenda_spaces` (vía la auto-provisión y el control "compartir espacio") es **todo lo que hace falta** para que el motor acople la disponibilidad. El caso F11→{A,B,C} se modela como: cancha F11 = 1 agenda mapeada a {A,B,C}; cada cruzada = 1 agenda mapeada a {su espacio}. Reservar F11 bloquea A,B,C; reservar una cruzada bloquea F11 (bidireccional, por simetría del set). **No se implementa nada del motor en Phase 2** — solo se generan los datos que ya consume.

## Recommended Project Structure

```
app/(dashboard)/servicios/
├── page.tsx                  # ADAPTAR: cargar también professionals/spaces/agenda_spaces (hoy vacíos)
app/(dashboard)/settings/
├── settings-client.tsx       # ADAPTAR: render de "cancha" cuando vertical=canchas;
│                             #   provisionCancha(); migrar bloque de espacios a view=servicios
│                             #   (discreción: extraer un sub-componente CanchasManager)
lib/
├── verticals.ts              # YA LISTO (Phase 1): terminology service→Cancha, menú con 'servicios' sin 'equipo'
├── types.ts                  # YA LISTO: Service, Professional, Space, AgendaSpace
```

**Recomendación de organización:** dado que `SettingsClient` ya tiene 1808 líneas, considerar **extraer la lógica de canchas a un componente dedicado** (`components/dashboard/canchas-manager.tsx` o similar) que reciba los mismos props y se renderice condicionalmente cuando `view="servicios"` y `vertical=canchas`. Mantiene `SettingsClient` legible y aísla el camino canchas del de services genéricos (sin tocar salud/belleza/general). Discreción del dev (D-03 dice "adaptada"; el cómo es libre).

## Architecture Patterns

### Pattern 1: Browser-client + RLS + UI optimista (patrón establecido del dashboard)
**What:** Las escrituras del dashboard usan `createClient()` (browser, anon key + cookies, RLS activa), actualizan estado local optimista y muestran toast. NO server actions.
**When to use:** Todo el CRUD de cancha (crear/editar/borrar/mapear).
**Example:**
```typescript
// Source: settings-client.tsx:596-622 (toggleAgendaSpace — con rollback optimista)
const row: AgendaSpace = { business_id: business.id, professional_id, space_id }
setAgendaSpaces(prev => [...prev, row])           // optimista
const { error } = await supabase.from('agenda_spaces').insert(row)
if (error) {
  setAgendaSpaces(prev => prev.filter(a => !(a.professional_id === professional_id && a.space_id === space_id))) // rollback
  toast.error('Error al actualizar el mapeo')
}
```

### Pattern 2: RSC carga por tenant → client component interactivo
**What:** El `page.tsx` (server) hace `auth.getUser()` → `redirect('/login')`, resuelve business por `owner_id`, carga datos con `Promise.all([...])` filtrando `.eq('business_id', business.id)`, y pasa props al client.
**When to use:** `/servicios/page.tsx` (adaptar para cargar professionals/spaces/agenda_spaces).
**Example:**
```typescript
// Source: equipo/page.tsx:22-26 — copiar este Promise.all a servicios/page.tsx
const [{ data: professionals }, { data: spaces }, { data: agendaSpaces }] = await Promise.all([
  supabase.from('professionals').select('*').eq('business_id', business.id).order('created_at'),
  supabase.from('spaces').select('*').eq('business_id', business.id).order('created_at'),
  supabase.from('agenda_spaces').select('*').eq('business_id', business.id),
])
```

### Pattern 3: Soft-delete vía toggle de `active` + ConfirmDialog para hard-delete
**What:** Desactivar = `update({ active: false })`; borrar = `delete()` con manejo de FK 23503 (turnos asociados → sugerir desactivar).
**When to use:** Borrado de cancha (D-05).
**Example:**
```typescript
// Source: settings-client.tsx:367-383 (deleteService + toggleService)
const { error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id)
if (error?.code === '23503') toast.error('Tiene turnos asociados. Desactivala en vez de borrarla.')
```
**Nota para canchas:** un borrado de cancha debe borrar la tupla completa (service + professional + spaces dedicados + agenda_spaces). Los `agenda_spaces` caen por FK CASCADE al borrar professional o space (`042:81-82`). Pero borrar el `professional` con turnos asociados puede fallar por FK → preferir soft-delete (`active=false` en service Y professional) para canchas con reservas. El plan debe definir el orden de borrado y el rollback.

### Anti-Patterns to Avoid
- **Emparejar cancha↔agenda por nombre:** frágil (renombrar rompe el match). Usar un puntero estable (`service.id` en una columna del professional, o decidir la columna de enlace). Ver Q1.
- **Insertar sin `business_id`:** la RLS lo rechazaría, pero el código del repo SIEMPRE lo setea explícito (defensa en profundidad). Mantener.
- **Server actions / RPC nuevo:** rompe el patrón del repo y (si fuera RPC) exige migración prohibida en D-01.
- **Tocar el camino `view="equipo"` de salud/belleza/general:** la migración de la UI de espacios a `/servicios` es SOLO para canchas; el resto sigue usando `view="equipo"` intacto.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Acople de disponibilidad por espacio | Un nuevo chequeo de conflicto | `book_slot_atomic` + `availability` (motor v0.12) ya lo hacen | Ya atómico, anti-deadlock, con backstop declarativo. Solo crear `agenda_spaces`. |
| Anti-solape por duración variable | Lógica de solapamiento propia | EXCLUDE constraint 013 + EXISTS del RPC | Ya soportado; la duración variable por cancha es exactamente su caso de uso. |
| CRUD de service/professional/space/agenda_space | Forms/inserts nuevos | Los métodos ya en `SettingsClient` (`addService`, `addProfessional`, `addSpace`, `toggleAgendaSpace`) | Ya escritos, con RLS + optimista + toast. La auto-provisión los orquesta. |
| Aislamiento por tenant | Checks manuales en cada query | RLS de `services`/`spaces`/`agenda_spaces` + filtro `.eq('business_id')` | Ya vigente. |

**Key insight:** Phase 2 es **orquestación de piezas existentes**, no construcción nueva. El 90% del código que se necesita ya está en `SettingsClient`; el trabajo es (a) orquestar la auto-provisión, (b) resolver el linkeo 1:1, (c) mover la UI de espacios a `/servicios` para canchas.

## Runtime State Inventory

> Phase 2 es greenfield de features (no rename/refactor/migración de datos). Igual se audita el estado runtime por completitud, dado que toca datos de tenant.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Negocios canchas existentes (si los hay) que hayan creado espacios/agendas vía el `view="equipo"` interino de Phase 1 — **PERO** `/equipo` redirige a `/dashboard` para canchas (`equipo/page.tsx:18`), así que en la práctica ningún negocio canchas pudo crear espacios por esa vía. Probable: **ninguno** (verificar en data real antes de asumir). | Si existieran agendas/espacios huérfanos creados antes del redirect, migrarlos al modelo cancha o limpiarlos. Probablemente N/A. |
| Live service config | None — sin servicios externos (n8n/Datadog/etc.) tocados por esta fase. | None. |
| OS-registered state | None — sin tareas programadas/procesos con estado. | None. |
| Secrets/env vars | None — no se agregan ni renombran secretos. | None. |
| Build artifacts | None — sin paquetes nuevos ni binarios. | None. |

**Nada que migrar en datos** salvo el caso improbable de agendas/espacios huérfanos pre-redirect (verificar contra prod; casi seguro vacío porque la UI era inalcanzable para canchas).

## Common Pitfalls

### Pitfall 1: Auto-provisión sin atomicidad → filas huérfanas
**What goes wrong:** La secuencia service→professional→space→agenda_space son 4 inserts autocommit. Si el paso 3 falla, quedan un service y un professional huérfanos (una "media cancha").
**Why it happens:** El browser client no abre transacción; cada `.insert()` commitea solo. No hay RPC de provisión (lo evitamos para no migrar).
**How to avoid:** Rollback manual explícito en cada paso (borrar lo creado antes si el siguiente falla, filtrando por `business_id`). Ver el snippet de la Pregunta 2. Aceptar el riesgo residual (mismo nivel que el resto del dashboard).
**Warning signs:** Canchas que aparecen en la lista sin espacio mapeado, o professionals sin su service.

### Pitfall 2: Linkeo 1:1 frágil al renombrar
**What goes wrong:** Si la tupla se reconstruye emparejando por `name`, renombrar la cancha (cambia `service.name` pero no `professional.name`) rompe el match → la edición/borrado tocan la fila equivocada o ninguna.
**Why it happens:** No hay columna de enlace en el esquema (Q1).
**How to avoid:** Usar un puntero estable por id (ej. `professional.specialty = service.id`, columna libre en canchas) decidido en el plan. NUNCA emparejar por nombre mutable.
**Warning signs:** Editar una cancha no persiste, o borrar una borra otra.

### Pitfall 3: Cargar professionals/spaces como "Equipo" en canchas (leak)
**What goes wrong:** Listar `professionals` con label "Equipo" en un negocio canchas expone las agendas-cancha como si fueran staff. `/equipo/page.tsx:18` ya lo previene con un redirect, con el comentario *"cargar /equipo en un negocio canchas listaría las canchas como 'Equipo' — leak de datos, no solo estético"* [CITED: equipo/page.tsx:15-18].
**Why it happens:** El professional es el bucket de la cancha, no un empleado.
**How to avoid:** En `/servicios` para canchas, presentar las agendas SIEMPRE como "Canchas" (terminología `term.resource='Cancha'`). No exponer campos de staff (specialty/license/phone/email) en la UI de cancha — y si se usa `specialty` como puntero al service.id, NO mostrarlo.

### Pitfall 4: Romper el camino `view="equipo"` de los otros verticales
**What goes wrong:** Al migrar la UI de espacios a `/servicios`, si se quita o condiciona mal el bloque del tab `professionals`, salud/belleza/general pierden su config de espacios compartidos (motor v0.12 que también usan, ej. SERVICIOS-ESPACIO-01 futura).
**Why it happens:** El bloque de espacios (líneas 1343-1441) hoy sirve a TODOS los verticales vía `view="equipo"`.
**How to avoid:** La migración a `/servicios` debe ser **aditiva y condicionada por vertical=canchas**. NO remover el bloque de `view="equipo"`; el resto de verticales lo siguen usando. Probar regresión en un negocio salud/belleza.

### Pitfall 5: Confundir precio-de-cancha con seña
**What goes wrong:** Asumir que el `service.price` es lo que se cobra al reservar. La seña es `business.deposit_amount` (business-level), distinta del precio de la cancha.
**Why it happens:** Ambos son montos en el flujo de reserva.
**How to avoid:** El precio de la cancha (`service.price`) es el "precio de lista" (lo que cuesta alquilar); la seña (`deposit_amount`) es el adelanto para confirmar. Phase 2 solo setea `service.price`. Phase 3 decide cómo se muestra/registra (Open Questions Q2).

## Code Examples

### Crear cancha (auto-provisión) — ver snippet completo en Pregunta 2
```typescript
// Orquesta los inserts ya existentes en SettingsClient, cada uno con business_id.
// Source: composición de settings-client.tsx:356-366 / 487-512 / 565-579 / 596-622
```

### Editar duración/precio de una cancha
```typescript
// Source: settings-client.tsx:403-420 (saveEditService) — ya edita duration_minutes y price
const { error } = await supabase.from('services')
  .update({ name, duration_minutes, price })
  .eq('id', svcId).eq('business_id', business.id)  // defensa en profundidad
```

### Soft-delete de cancha
```typescript
// Source: settings-client.tsx:380-383 (toggleService) + 367-379 (deleteService con FK 23503)
await supabase.from('services').update({ active: false }).eq('id', svcId).eq('business_id', business.id)
// (idealmente también professionals.active=false para que la agenda salga del booking)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Servicio genérico + profesional separado (salud/belleza) | Cancha = 1 service + 1 professional emparejados 1:1 (convención de app) | Phase 2 (esta) | El service deja de ser m:n con professionals para el vertical canchas; es 1:1 por convención. |
| Config de espacios en tab "Equipo" (`view="equipo"`) | Config de espacios en `/servicios` para canchas (D-03) | Phase 2 (esta) | Solo para canchas; salud/belleza/general siguen en `view="equipo"`. |

**Deprecated/outdated:**
- La UI de espacios en `view="equipo"` para canchas: **inalcanzable hoy** (redirect en `equipo/page.tsx:18`). Se reemplaza por la de `/servicios`. NO se elimina del código (otros verticales la usan).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Reusar una columna existente del `professional` (ej. `specialty` o `license_number`, no usadas en el vertical canchas) como puntero estable al `service.id` para materializar el 1:1 sin migrar. | Pregunta 1 (opción 1b), Pitfall 2 | Si reusar una columna semánticamente ajena se considera inaceptable, el linkeo 1:1 necesita otra solución (otra columna libre, o aceptar 1 columna nueva = mínima desviación de D-01). **El usuario/planner debe confirmar la columna de enlace antes de ejecutar.** |
| A2 | Ningún negocio canchas existente tiene espacios/agendas huérfanos creados vía el `view="equipo"` interino (porque `/equipo` redirige a `/dashboard` para canchas). | Runtime State Inventory | Si existieran (creados antes del redirect de Phase 1), habría datos a migrar/limpiar. Verificar contra prod antes de asumir vacío. |

## Open Questions

1. **¿Cómo se materializa el 1:1 cancha↔agenda sin columna de enlace nueva?**
   - What we know: no hay join ni FK service↔professional; D-01 prohíbe columnas/tablas nuevas; el motor keya por `professional_id`.
   - What's unclear: qué columna estable enlaza el service con su professional para reconstruir la tupla al editar/borrar.
   - Recommendation: lockear en discuss/plan la opción 1b (reusar `professionals.specialty` como `service.id`) — o, si se la juzga demasiado hacky, aceptar la **mínima** desviación de D-01: agregar `services.canchas_professional_id` (1 columna nullable + índice). Decisión de negocio/arquitectura → el usuario decide. Es la única incertidumbre que puede tocar D-01.

2. **(Awareness Phase 3) ¿Se muestra/registra el precio de la cancha cuando NO hay seña?**
   - What we know: el `service.price` solo viaja al flujo de pago si `require_deposit=true`. Un booking sin seña no registra precio hoy.
   - What's unclear: si canchas sin seña deben mostrar/registrar el precio igual (ALQUILER-04).
   - Recommendation: resolver en discuss de Phase 3 (no bloquea Phase 2). Anotado para no sorprender al planner de Phase 3.

## Environment Availability

> Phase 2 es cambio de código/UI sobre esquema existente. Sin dependencias externas nuevas (sin tools, servicios, runtimes adicionales). Supabase local (PG17) ya configurado para validar migraciones — pero esta fase NO migra. **SKIPPED: no external dependencies introduced.**

## Validation Architecture

> El proyecto tiene Vitest configurado (302/302 tests del milestone v0.12, ver `.claude` memory). `nyquist_validation` no está marcado `false` → sección incluida.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (presente en el repo; suite v0.12 = 302 tests) |
| Config file | `vitest.config.*` (verificar nombre exacto en raíz al planear) |
| Quick run command | `npx vitest run <archivo>` (confirmar script en package.json) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CANCHA-01 | Auto-provisión crea service+professional+space+agenda_space con business_id; rollback en falla parcial | unit (lógica de provisión, mockeando el client) | `npx vitest run <test-canchas-provision>` | ❌ Wave 0 |
| CANCHA-02 | Editar duración de una cancha no afecta a otra; soft-delete via active | unit | `npx vitest run <test-canchas-edit>` | ❌ Wave 0 |
| CANCHA-03 | Mapear cancha→espacios genera filas agenda_spaces correctas (1:1 default + compartido) | unit | `npx vitest run <test-agenda-spaces-map>` | ❌ Wave 0 |
| (aislamiento) | Insert con business_id ajeno se rechaza | integration (RLS, contra Supabase local) | `supabase db reset` + test RLS | ❌ Wave 0 (si se hace integration) |

### Sampling Rate
- **Per task commit:** `npx vitest run <archivo tocado>`
- **Per wave merge:** `npx vitest run` (suite completa)
- **Phase gate:** suite verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Tests de la lógica de auto-provisión (orquestación + rollback) — la lógica es client-side; extraerla a una función pura testeable (ej. en `lib/`) facilita el test sin DOM. **Recomendación: extraer `provisionCancha` a `lib/canchas.ts` para testearla aislada.**
- [ ] Tests del emparejamiento de la tupla (reconstruir cancha desde service+professional) — depende de A1/Q1.
- [ ] (Opcional) Test de RLS de aislamiento contra Supabase local (patrón del milestone seguridad).

*Nota: gran parte del CRUD reusa código ya cubierto por la suite v0.12; el foco de Wave 0 es la lógica NUEVA (provisión + emparejamiento).*

## Security Domain

> `security_enforcement` enabled (absent = enabled). Security relevance de la fase: **Medio**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Sin cambios de auth; el dashboard ya exige `auth.getUser()`. |
| V3 Session Management | no | Sin cambios. |
| V4 Access Control | **yes** | RLS por `business_id` en services/professionals/spaces/agenda_spaces (aislamiento por tenant). Filtro `.eq('business_id')` defensa en profundidad. |
| V5 Input Validation | yes | Validar precio > 0, duración > 0 (patrón de services). zod no se usa en este CRUD (es client directo); validación manual como el resto de `SettingsClient`. |
| V6 Cryptography | no | Sin crypto. |

### Known Threat Patterns for {Next.js RSC + Supabase RLS}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crear/mapear cancha o espacio de otro tenant (cross-tenant write) | Tampering / Elevation | RLS WITH CHECK por `business_id` (spaces/agenda_spaces 4-policies; services/professionals policy USING). El insert con business_id ajeno se rechaza a nivel DB. |
| Auto-provisión deja filas huérfanas (media cancha) | (Integrity) | Rollback manual en cada paso (Pitfall 1). |
| Exposición de config interna (precio/espacios) a `anon` | Information Disclosure | Phase 2 NO agrega exposición anon; `spaces`/`agenda_spaces` sin policy anon (D-06). La vista pública es de Phase 3. Secure-phase verifica que no se agregue ninguna lectura anon. |
| Leak de canchas como "Equipo" | Information Disclosure | Presentar agendas-cancha como "Canchas", no exponer campos de staff; redirect de `/equipo` ya vigente. |

## Sources

### Primary (HIGH confidence — código real del repo)
- `lib/types.ts` (Service, Professional, Space, AgendaSpace, Appointment) — modelo de datos.
- `supabase/migrations/00000000000000_baseline.sql` (services 560-571, professionals 488-501, policies 1221-1229, public_services 577-592) — esquema + RLS.
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` — spaces/agenda_spaces/book_slot_atomic/appointment_spaces.
- `app/(dashboard)/settings/settings-client.tsx` (1808 líneas) — CRUD de services/professionals/spaces/agenda_spaces.
- `app/(dashboard)/servicios/page.tsx` — pantalla a adaptar.
- `app/(dashboard)/equipo/page.tsx` — patrón de carga de spaces/agenda_spaces + redirect canchas.
- `lib/booking-core.ts` — lectura de duración del service + acople de espacio (re-check UX).
- `app/api/booking/availability/route.ts` — acople de disponibilidad por espacio (read-path).
- `app/api/payment/{create,webhook,retry}` — lectura de `services(price)` en el flujo de pago.
- `lib/verticals.ts` (canchas 104-124) — terminología + menú (servicios sin equipo).

### Secondary (MEDIUM confidence)
- `.claude` memory (cupos-grupales / canchas-vertical-pivot) — contexto del motor v0.12 y del pivot canchas.

### Tertiary (LOW confidence)
- Ninguna. Todo verificado contra código.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sin paquetes nuevos; todo el stack ya en uso, verificado en package.json/imports.
- Architecture / linkeo: HIGH en hallazgos (no hay join, verificado por grep), MEDIUM en la **recomendación** del mecanismo 1:1 (A1 es un [ASSUMED] que el usuario debe confirmar — única incertidumbre real).
- Auto-provisión: HIGH — todos los inserts existen y fueron leídos; el riesgo de atomicidad está documentado.
- RLS/seguridad: HIGH — policies leídas directamente del baseline y migr. 042.
- Acople de disponibilidad: HIGH — RPC y availability leídos completos.
- Pitfalls: HIGH — derivados del código real y de los comentarios del propio repo.

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (esquema estable; revalidar si se aplica una migración nueva al motor o a services antes de planear).
