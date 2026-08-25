# Requirements — v0.28 La agenda por servicio

> Workstream `motor-reservas`, **Phases 18-20**. Milestone anterior: **v0.27 Cupo unificado por
> servicio** (shipped 2026-08-24), archivado en `.planning/milestones/`.

## Contexto

### El problema, en una línea

`time_blocks` sabe decir *"atiendo de tal hora a tal hora"* y **no sabe decir** *"a esta hora doy
cerámica"*. La tabla es `business_id + day_of_week + start_time + end_time` y **no tiene servicio**.

Alcanza para una peluquería, donde cualquier servicio entra en cualquier franja. **No alcanza** para un
taller, un estudio de danza, un gimnasio o cualquier negocio **donde la franja ES la clase**.

Palabras del dueño, en la UAT de la Phase 15:

> *"El servicio es la condición principal de los horarios, sobre todo en los rubros de clases grupales.
> Si alguien tiene que configurar que los martes y jueves de 15 a 16 da cerámica, y de 17 a 18 da corte
> y confección, no tiene forma de configurar eso en el sistema."*

### Es el mismo defecto que v0.27, un nivel más arriba

v0.27 sacó el cupo de `time_blocks` **porque el bloque no sabía a qué servicio correspondía**. Trató el
síntoma —*dónde vive el número*— y dejó la causa intacta: **el bloque no sabe qué se da en él.**

Y despejó el camino: desde la migración **068**, `time_blocks.capacity` ya no decide nada, así que la
tabla quedó reducida a lo que siempre debió ser —la declaración de **cuándo** se atiende—. El paso
natural es que también declare **qué**.

## Decisiones tomadas antes de planificar

- **D-01 — Tabla puente con la regla del comodín, no una columna.** Molde: `professional_services`
  (migr. 057, v0.25), en producción y con su helper puro `lib/staff-services.ts`.
  **0 filas mapeadas = la franja sirve para cualquier servicio.**
  Cubre los dos casos reales sin inventar nada: *"martes 15-16 cerámica"* (una fila) y *"mañanas: corte
  y color, no alisado"* (dos filas). Una columna `service_id` obligaría a duplicar bloques superpuestos
  para el segundo caso.

- **D-02 — El cutover es gratis y la cero regresión es POR CONSTRUCCIÓN.** El día que se aplique la
  migración, **todos** los negocios tienen 0 filas ⇒ todas las franjas son comodín ⇒ nada cambia. Es la
  misma jugada que `individual` en v0.27, y por el mismo motivo: el estado neutro es el estado actual.

- **D-03 — La franja declara QUÉ, no QUIÉN.** El cruce con multi-staff (*"martes 15-16 cerámica con
  Ana"*) queda **fuera**. El *quién* ya lo resuelve `professional_services` desde v0.25: si Ana es la
  única que hace cerámica, el sistema ya la asigna. Agregar la dimensión profesional a la franja
  triplica el modelo y toca la asignación automática del RPC, que es el núcleo anti-doble-booking. Se
  puede sumar después **sin re-migrar**.

- **D-04 — El onboarding entra**, fusionado con el booking público en la Phase 20. Es donde más se nota
  el defecto: hoy a un taller se le pide declarar un horario que no describe su negocio, así que la
  capacidad existiría pero el negocio nuevo arrancaría igual mal configurado.

## Requisitos

### El modelo y el motor (Phase 18) — `secure-phase` obligatorio

- [x] **AGENDA-01** — Una franja horaria puede declarar **qué servicios** se dan en ella, vía tabla
      puente. **0 filas = cualquier servicio** (comodín), que es el comportamiento vigente y el estado
      de todos los negocios el día de la migración.

- [x] **AGENDA-02** — La regla del comodín vive en **un helper puro** con tests, nunca reimplementada
      en cada consumidor. Molde exacto: `lib/staff-services.ts`.

- [ ] **AGENDA-03** — `/api/booking/availability` respeta la regla: pedir horarios para un servicio
      devuelve **solo** las franjas donde ese servicio se da (más todas las de comodín). El endpoint ya
      recibe `serviceId` desde v0.27 (15-04).

- [x] **AGENDA-04** — **Cero regresión** para los negocios con franjas genéricas —que hoy son todos— y
      para canchas, abonos, cupos grupales, multi-staff y espacio compartido.

### El panel (Phase 19)

- [ ] **AGENDA-05** — El dueño asigna servicios a cada franja desde Agenda, y la grilla **muestra** qué
      se da en cada una sin abrir nada.

- [ ] **AGENDA-06** — Una franja sin servicios asignados se ve y se lee como **"cualquiera"**, no como
      un estado vacío o roto.

### El booking público y el onboarding (Phase 20)

- [ ] **AGENDA-07** — El cliente que elige un servicio ve **solo** los horarios donde ese servicio se
      da. Si un servicio no tiene ninguna franja que lo cubra, el vacío se explica en vez de mostrar un
      calendario mudo.

- [ ] **AGENDA-08** — El onboarding deja declarar la agenda real de un negocio de clases desde el día
      uno, en vez de pedirle un horario genérico que no describe su negocio.

## Fuera de alcance

- **El cruce con multi-staff** (franja por servicio **y** profesional) — D-03. Se suma después sin
  re-migrar.

- **Dropear `time_blocks.capacity`** — sigue conservada desde v0.27; borrarla es una migración
  destructiva sin beneficio.

- **Los 9 todos pendientes del workstream**, incluidos los dos de seguridad. El de severidad **alta**
  (`book_slot_atomic` ejecutable por `anon`) es candidato al milestone siguiente y **no** se mezcla acá:
  es otro eje y otro riesgo.

## Traceability

| Req | Fase | Estado |
|-----|------|--------|
| AGENDA-01 | Phase 18 | Complete |
| AGENDA-02 | Phase 18 | Complete |
| AGENDA-03 | Phase 18 | Pending |
| AGENDA-04 | Phase 18 | Complete |
| AGENDA-05 | Phase 19 | Pending |
| AGENDA-06 | Phase 19 | Pending |
| AGENDA-07 | Phase 20 | Pending |
| AGENDA-08 | Phase 20 | Pending |

## Riesgo

**Phase 18 toca la disponibilidad pública**, que es la superficie que decide qué se le ofrece a un
cliente anónimo. `secure-phase` **obligatorio**. Precedente directo: en v0.25 la Phase 10 tuvo que crear
una vista acotada (`public_professional_services`, migr. 059) para exponer un mapeo a `anon` sin abrir
la tabla entera — **este milestone necesita exactamente lo mismo** y conviene mirar esa migración antes
de escribir la nueva.

⚠ **Y hay un pendiente de seguridad VIVO que toca la misma superficie:** `book_slot_atomic` es
ejecutable por `anon` y saltea la ventana de reserva, el gate de plan y el reCAPTCHA, que viven **solo**
en el route handler (`todos/pending/2026-08-18-book-slot-atomic-es-ejecutable-por-anon.md`, severidad
alta, pre-existente desde la migr. 041). **No es de este milestone**, pero cualquier control que la
Phase 18 ponga solo en el handler hereda el mismo agujero — tenerlo presente al decidir dónde vive la
regla del comodín.
