# Requirements: Forjo App — v0.24 "Turnos fijos / Abonos recurrentes" (workstream `motor-reservas`)

> Continúa el workstream `motor-reservas` (v0.12 Phases 1-3, v0.22 Phases 4-5, ambos shipped).
> v0.24 arranca en **Phase 6**. Capacidad NUEVA sobre el motor de reservas: abonos semanales (turno
> fijo recurrente). Toca el núcleo de integridad anti-doble-booking (constraints 011/013, cupos,
> espacio compartido) → **secure-phase obligatorio**. Aplican las skills `convenciones-forjo` y
> `supabase-multitenant-rls`. PROJECT.md compartido en `.planning/PROJECT.md`.

## Contexto / decisiones de scope (discuss milestone 2026-07-20)

- **Solo reserva, sin cobro.** El abono bloquea el mismo slot cada semana; el cobro lo maneja el negocio
  aparte. El **cobro recurrente automático** (MP preapproval por cliente) es un milestone FUTURO — pero
  el **modelo de datos del abono se diseña extensible** para sumarlo sin re-migrar (sofisticar el dato
  ahora es barato; la UI/scope se mantiene simple).
- **Alta manual por el dueño** (no pública en v1).
- **Recurrencia semanal** (mismo día y hora cada semana). No quincenal/mensual en v1.
- **Indefinido hasta cancelar.** El cliente puede cancelar la suscripción desde un **link en el mail**
  (como el cancel de turno actual); el dueño la da de baja desde el panel.

## v0.24 Requirements

### Abonos recurrentes (ABONO)

- [ ] **ABONO-01**: El dueño crea un abono semanal desde el panel para un cliente: cliente + servicio
  (o cancha) + profesional/consultorio (según vertical) + día de la semana + hora, **indefinido hasta
  cancelar**. Reusa el pipeline de alta de turno existente (validación, anti-tampering de tenant).

- [ ] **ABONO-02**: El sistema **genera los turnos del abono hacia adelante** (ventana rolling de N
  semanas), cada uno como un `appointment` real que **respeta la integridad anti-doble-booking**
  (constraints 011/013), **cupos/capacity** y **exclusión por espacio compartido** (canchas). Si una
  ocurrencia choca con un turno existente, un día cerrado o una excepción de horario, se maneja sin
  romper el resto de la serie (saltear la ocurrencia y/o avisar — el comportamiento exacto se cierra en
  discuss-phase). Cada turno generado queda **vinculado al abono** (para poder cancelar la serie).

- [ ] **ABONO-03**: El **modelo de datos del abono es extensible** para sumar cobro recurrente automático
  a futuro (entidad/campos que no obliguen a re-migrar cuando se agregue el cobro), pero v0.24 **NO cobra**.

- [ ] **ABONO-04**: El cliente recibe un **mail** (patrón del mail de confirmación actual) con un link
  para **cancelar la suscripción**: un token que da de baja la **serie completa** (deja de generar
  turnos futuros). Análogo al cancel-token de turno actual, pero a nivel abono.

- [ ] **ABONO-05**: El dueño puede **dar de baja el abono desde el panel** (deja de generar; el manejo de
  los turnos futuros ya generados —cancelarlos o dejarlos— se define en discuss-phase).

- [ ] **ABONO-06**: La **generación forward es automática** y extiende la ventana con el tiempo, corriendo
  en el **cron diario existente** de Vercel (Hobby: NO agregar crons más frecuentes que diario). El alta
  del abono genera la primera tanda; el cron mantiene la ventana hacia adelante.

## Out of Scope

- **Cobro recurrente automático** (MP preapproval / suscripción del cliente) — milestone futuro; v0.24 deja el modelo preparado, no lo construye.
- **Recurrencia no-semanal** (quincenal, mensual, custom) — v1 solo semanal.
- **Alta pública del abono por el cliente** (desde `/[slug]`) — v1 solo el dueño desde el panel.
- **Lista de espera / waitlist** si un slot del abono está ocupado — fuera de scope.
- **Cambiar/reprogramar un abono** (editar día/hora de una serie viva) — evaluar a futuro; v1 = crear + dar de baja.

## Traceability

| REQ-ID | Phase |
|--------|-------|
| ABONO-01 | — |
| ABONO-02 | — |
| ABONO-03 | — |
| ABONO-04 | — |
| ABONO-05 | — |
| ABONO-06 | — |
