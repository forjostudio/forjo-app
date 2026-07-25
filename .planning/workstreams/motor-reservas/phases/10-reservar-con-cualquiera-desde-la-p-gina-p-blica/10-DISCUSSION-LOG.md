# Phase 10 — Discussion Log

**Date:** 2026-07-25
**Phase:** 10 — Reservar con "cualquiera" desde la página pública
**Mode:** discuss (4 decisiones directas — el usuario tiene perfil fast-intuitive/design-conscious)

Fase de UI pública. El backend de asignación ya lo dejó Phase 9; acá se decide solo la UX del selector y la confirmación. Las zonas técnicas (agregación de disponibilidad across-staff, vista acotada de capaces) y de seguridad (contrato `{ok,busy,full}`, servidor autoridad, gemelos canchas) están LOCKED por el roadmap → van a research/planner, no se preguntaron.

## Decisiones

### 1. Default del selector "Profesional" (negocio 2+ pros)
- **Opciones:** "Cualquiera" preseleccionado (rec.) · Sin preselección (elegí)
- **Elegido:** **"Cualquiera" preseleccionado** → D-01
- **Nota:** coincide con el default actual del código (`selectedPro='none'`); el cambio es semántico ('none' → "Cualquiera" = across-staff).

### 2. Mostrar "Cualquiera" con un solo profesional capaz
- **Opciones:** Ocultarla si hay ≤1 capaz (rec.) · Mostrarla siempre
- **Elegido:** **Ocultarla si hay ≤1 capaz** (aparece solo con 2+) → D-02
- **Nota:** cuenta de capaces respeta la regla del comodín de Phase 8.

### 3. Presentación + copy de "Cualquiera"
- **Opciones:** Tarjeta arriba "Cualquiera" (rec.) · Tarjeta "Sin preferencia" · Control separado (toggle)
- **Elegido:** **Tarjeta arriba de la lista, copy "Cualquiera" + sub-texto "El primero disponible"** → D-03

### 4. Cuándo mostrar el profesional asignado (ASIGN-05)
- **Opciones:** Siempre que haya profesional (rec.) · Solo cuando fue "cualquiera"
- **Elegido:** **Siempre que haya profesional asignado** (uniforme, "Te atiende: [Nombre]"); sentinel sin pros nombrados = no muestra nada → D-04

## Ideas diferidas
- Default del selector configurable por el dueño (setting) → Phase 11 (POLISH) / backlog.
- Nudge "no hay lugar con [X] pero sí con Cualquiera" → fuera de scope.

## Claude's discretion (a research/planner)
- Cómo agregar disponibilidad across-staff en `/api/booking/availability` respetando `{ok,busy,full}` (D-06).
- Cómo servir la lista de capaces por servicio sin abrir la tabla puente (vista acotada, D-07).
- Cómo leer/mostrar el `appointments.professional_id` asignado en confirmación + mail.
</content>
