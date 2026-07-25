# Phase 10: Reservar con "cualquiera" desde la página pública - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

La capacidad que entregó la Phase 9 (asignación automática atómica dentro de `book_slot_atomic`) se vuelve **visible y usable para el cliente final** en la página pública `/[slug]`:

1. Elegido el servicio, el cliente puede elegir un **profesional específico** o la opción **"Cualquiera"** (ASIGN-01).
2. Con "Cualquiera", la grilla de horarios refleja al **equipo entero**: un horario está libre si **algún** profesional capaz lo tiene libre, y deja de ofrecerse cuando ninguno tiene lugar (DISP-01, DISP-03).
3. Elegido un profesional específico, la grilla es la de **esa agenda**, idéntica a hoy — cero regresión para el negocio de un solo profesional (DISP-02).
4. Al confirmar una reserva hecha con "Cualquiera", el cliente ve **quién le tocó** en la pantalla de confirmación y en el mail (ASIGN-05).

**Frontend + endpoint público (UI hint: yes).** Requisitos: **ASIGN-01, ASIGN-05, DISP-01, DISP-02, DISP-03**. El backend de asignación ya existe (Phase 9); esta fase lo **expone**. No cambia el motor `book_slot_atomic`.

**Superficie pública y anónima.** Los dos calendarios públicos (`booking-client.tsx` y su gemelo `canchas-booking-client.tsx`) son **gemelos**: tocar uno sin el otro es la regresión clásica de este workstream. Canchas NO lleva "cualquiera" (SC5).
</domain>

<decisions>
## Implementation Decisions

### Selector público de profesional (discutido)
- **D-01 (default del selector):** cuando el negocio tiene **2+ profesionales capaces** del servicio, el paso "Profesional" viene con **"Cualquiera" preseleccionado**. Es la intención de la feature (reparto de carga, máxima disponibilidad, menos fricción) y **coincide con el default actual del código** (`selectedPro` arranca en `'none'` en `booking-client.tsx:45`) — el cambio es semántico: `'none'`/"sin preferencia" pasa a leerse/mostrarse como **"Cualquiera"** y a significar "asignación across-staff". El cliente con preferencia igual elige un profesional.
- **D-02 (gating por cantidad):** la opción "Cualquiera" **se muestra solo cuando hay 2+ profesionales capaces** del servicio elegido. Con **≤1 capaz** (o negocio sin profesionales nombrados = sentinel) se **oculta** y el flujo se comporta **como hoy**. La cuenta de "capaces" respeta la **regla del comodín** de Phase 8 (`lib/staff-services.ts`: 0 filas en `professional_services` = capaz de todo).
- **D-03 (presentación + copy):** "Cualquiera" se presenta como una **tarjeta arriba de la lista** de profesionales, tratada como una opción más (misma UI que elegir un profesional), con **copy "Cualquiera"** y **sub-texto "El primero disponible"**. No es un toggle separado — mínima fricción, consistente con el step actual.

### Confirmación del profesional asignado (discutido)
- **D-04 (ASIGN-05 — cuándo mostrar):** el nombre del profesional se muestra en la **pantalla de confirmación** (`turno/[token]`) y en el **mail de confirmación** **siempre que haya un profesional asignado** — tanto si el cliente eligió específico como si fue por "Cualquiera" (trato **uniforme**, ej. "Te atiende: [Nombre]"). Si el negocio **no tiene profesionales nombrados** (sentinel), no se muestra nada. El nombre sale del **turno ya creado** (misma tabla `appointments`, mismo tenant), nunca del front.

### Locked desde el milestone/roadmap (no re-discutir)
- **D-05 (servidor = autoridad):** el cliente puede mandar "sin profesional", pero el servidor asigna. **Nunca** aceptar un `professionalId` pre-elegido por el front como si fuera la asignación, ni confiar en un `professionalId` que no pertenezca al negocio del slug. El anti-tampering de tenant existente queda **intacto**.
- **D-06 (contrato de disponibilidad acotado):** `/api/booking/availability` pasa a **agregar** disponibilidad de varias agendas, pero mantiene el contrato ya vigente `{ ok, busy, full }` — el público **NO** ve cuántos lugares quedan, ni **qué profesional** está ocupado a qué hora, ni la agenda interna del negocio, más allá de lo que ya expone hoy. La agregación across-staff no puede filtrar nada nuevo.
- **D-07 (lista de capaces vía vista acotada):** la lista de profesionales capaces por servicio se sirve por una **vista acotada** al estilo `public_professionals` / `public_services` (patrón migr. 027), **nunca** abriendo la tabla puente `professional_services` a `anon`.
- **D-08 (DISP-02 cero regresión):** elegido un profesional específico, la disponibilidad es la de **esa agenda**, byte-idéntica a hoy. Negocio de un solo profesional se comporta exactamente como hoy.
- **D-09 (gemelos):** `canchas-booking-client.tsx` sigue igual que hoy (elegir la cancha, **sin** "cualquiera"). Los dos calendarios públicos son gemelos — cualquier cambio de patrón compartido se evalúa en ambos para no regresionar canchas (SC5).
- **D-10 (guards intactos):** la **ventana de reserva** (v0.22) y el gating de **`plan_status`** (SEC-04) siguen aplicando sin cambios en el camino nuevo.

### Claude's Discretion
- **Cómo agregar disponibilidad across-staff** en `/api/booking/availability` manteniendo el contrato acotado (unión de los slots libres de los profesionales capaces; un horario libre si al menos uno lo tiene) → research/planner. Hoy el endpoint ya bucketea por `professional_id` con `SENTINEL` para "sin preferencia" + lógica `siblingBusy` de espacio compartido — evaluar si "Cualquiera" reusa/extiende ese bucketing o suma una rama de agregación.
- **Cómo se sirve la lista de profesionales capaces por servicio** al front (¿nueva vista pública `public_professional_services` acotada? ¿derivar de `public_professionals` + el mapeo? ¿el `page.tsx` ya trae lo necesario?) sin exponer la tabla puente → research (respetando D-07).
- **Cómo leer el profesional asignado** para mostrarlo (de la fila `appointments.professional_id` del turno creado por Phase 9) y resolver su nombre en confirmación + mail → research/planner. La intención "cualquiera" hacia el `create` ya existe del lado backend (Phase 9: `autoAssign` / sentinel).
- Detalles finos de UI de la tarjeta "Cualquiera" (iconografía, cómo se ve seleccionada) → planner/UI-SPEC, respetando D-03.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alcance y criterios de la fase
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 10" — goal, 5 success criteria, y la nota de Security/Integrity (contrato acotado, servidor = autoridad, gemelos, guards v0.22/SEC-04).
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — ASIGN-01, ASIGN-05, DISP-01, DISP-02, DISP-03.

### Las superficies a modificar (frontend público)
- `app/[slug]/booking-client.tsx` — el flujo público de reserva (4 pasos: Servicio · Profesional · Fecha y hora · Tus datos). `selectedPro: Professional | null | 'none'` (default `'none'`), el step 2 "Profesional", y el fetch a `/api/booking/availability` con `professionalId`. **Acá vive el selector y la grilla.**
- `app/[slug]/canchas-booking-client.tsx` — el **gemelo** de canchas. NO lleva "cualquiera"; verificar cero regresión (D-09/SC5).
- `app/[slug]/page.tsx` — server component: carga `public_services` y `public_professionals` (vistas acotadas, migr. 027) en paralelo y las pasa a ambos clients. Punto donde sumar (si hace falta) el insumo de "qué profesional es capaz de qué servicio".
- `app/[slug]/turno/[token]/page.tsx` — pantalla de confirmación del turno (ASIGN-05: mostrar "Te atiende: [Nombre]").
- `lib/email.ts` — templates de mail branded (`brandEmail`); el mail de confirmación es donde va el nombre del profesional (ASIGN-05).

### El endpoint a extender
- `app/api/booking/availability/route.ts` — contrato `{ ok, busy, full }`, bucketing por `professional_id` con `SENTINEL`, y `siblingBusy` (espacio compartido v0.12). Acá se implementa la agregación across-staff respetando D-06.

### Insumos de Phases 8 y 9 (el backend ya hecho)
- `lib/staff-services.ts` — regla del comodín / cobertura (0 filas = capaz de todo); fuente para decidir **qué profesionales listar** y **cuántos capaces hay** (D-02) y **cuáles agregar** en disponibilidad (DISP-01).
- `.planning/workstreams/motor-reservas/phases/09-asignaci-n-autom-tica-at-mica-de-profesional/09-CONTEXT.md` y `09-RESEARCH.md` — cómo Phase 9 asigna "cualquiera" (`autoAssign` + UUID centinela, el pro queda en `appointments.professional_id`), que es lo que Phase 10 muestra.
- `.planning/workstreams/motor-reservas/phases/08-equipo-qu-servicios-hace-cada-profesional/08-CONTEXT.md` — `professional_services` (mapeo staff↔servicios, sin columna de sede = cobertura global) y el patrón de **vista pública acotada** para no exponer la tabla puente a `anon` (D-07).
- `supabase/migrations/027*` (o la que crea `public_professionals`/`public_services`) — patrón de vista acotada a replicar si hace falta exponer capacidad por servicio.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **El scaffolding del selector YA existe:** `booking-client.tsx` tiene el step "Profesional" y `selectedPro` con estado `'none'`. "Cualquiera" es en gran parte re-etiquetar/re-significar `'none'` + gatear su visibilidad (D-02), no construir un selector nuevo.
- **El endpoint YA bucketea por profesional** (`availability/route.ts`: `SENTINEL`, `bucket`, `siblingBusy`). La agregación across-staff se apoya en esa mecánica existente en vez de reescribirla.
- **Las vistas públicas acotadas YA existen** (`public_professionals`, `public_services`, leídas en `page.tsx`) — el patrón para exponer "capaz de qué servicio" sin abrir la tabla puente.
- **El nombre del profesional en confirmación/mail** reusa el turno ya creado; el mail branded (`brandEmail` en `lib/email.ts`) ya es theme-aware.

### Established Patterns
- Página pública fuera de la sesión (el `proxy.ts` excluye `/[slug]`); lectura anon vía vistas acotadas + service-role en los route handlers con tenant resuelto por slug.
- Los dos calendarios públicos son **gemelos** — cambios de patrón compartido se aplican a ambos o se regresiona canchas.

### Integration Points / Tests a espejar
- `test/booking-public-regression.test.ts`, `test/canchas-booking.test.ts`, `test/staff-assignment.test.ts` (Phase 9) — la regresión del booking público y canchas + la asignación "cualquiera". La verificación de esta fase debe cubrir DISP-01/02/03 (grilla agregada vs. por-agenda) y ASIGN-05 (nombre en confirmación/mail) sin romper canchas.
</code_context>

<specifics>
## Specific Ideas

- Copy del selector: tarjeta **"Cualquiera"** + sub-texto **"El primero disponible"**, arriba de la lista de profesionales.
- Confirmación/mail: **"Te atiende: [Nombre]"** siempre que haya un profesional asignado.
- Regla dura de negocio: un horario con "Cualquiera" está libre si **al menos un** profesional capaz lo tiene libre; desaparece cuando **ninguno** tiene lugar (DISP-01/03).
</specifics>

<deferred>
## Deferred Ideas

- **Default del selector configurable por el dueño** (que el negocio elija si arranca en "Cualquiera" o en "elegí profesional"): es una capacidad nueva (un setting), candidata a **Phase 11 (POLISH)** / backlog — no Phase 10. Por ahora el default es fijo (D-01).
- **Nudge "no hay lugar con [X] pero sí con Cualquiera"** cuando el cliente elige un profesional específico sin disponibilidad: fuera de scope de esta fase.

---

*Phase: 10-Reservar con "cualquiera" desde la página pública*
*Context gathered: 2026-07-25*
</content>
</invoke>
