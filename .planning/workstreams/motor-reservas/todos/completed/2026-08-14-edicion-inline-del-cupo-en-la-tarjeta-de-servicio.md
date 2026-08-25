---
status: completed
completed: 2026-08-24
closed_by: v0.27 Phase 17
created: 2026-08-14T00:00:00.000Z
title: "Edición inline del cupo en la tarjeta de servicio (+/− y guardar, sin abrir el modal)"
area: ux
source: UAT Phase 15 (2026-08-14)
files:
  - app/(dashboard)/settings/settings-client.tsx
---

## Pedido

El dueño, probando la UAT de la Phase 15:

> "hay forma de poner ahí mismo un selector de +- con el cupo y un botón de guardar? Para no tener que
> entrar al modal de edición."

En la lista de `/servicios`, poder subir o bajar el cupo desde la propia tarjeta y guardar, sin abrir
"Editar servicio".

## Por qué NO es polish (y por qué no entra en la Phase 16)

**POLISH-08 ya cubre el badge de modo** en la tarjeta — eso sí es presentación y ya está planificado.
Lo de acá es distinto: es **edición inline**, o sea capacidad nueva. Cambia el patrón de interacción
de la pantalla, que hoy es *ver en la lista, editar en el modal*. Meterlo de contrabando en una fase
de polish sería exactamente el tipo de scope creep que este workstream viene evitando.

## Lo que hay que decidir antes de construirlo

1. **¿Solo el cupo, o el modo también?** Si el modo se puede cambiar inline, la tarjeta tiene que
   mapear el rechazo del gate de CUPO-08 (`P0001` + código de dominio) a copy propia — el mismo
   patrón que el modal ya implementa. Si es solo el cupo, no dispara el trigger y es mucho más barato.
2. **¿Guarda con botón o al perder el foco?** El repo usa validación `onBlur` en formularios, pero un
   guardado silencioso en una lista es distinto de un campo de formulario.
3. **El CHECK de coherencia manda:** `individual ⇒ cupo 1`, los otros dos `⇒ cupo >= 2`. Un `+/−` en
   la tarjeta de un servicio `individual` no tiene sentido (su cupo es 1 por definición), así que el
   control solo aplica a `group_class` y `simultaneous_resource` — y no puede bajar de 2.
4. **Bajar el cupo con turnos futuros vivos** deja ese slot sobre-cupo. Está registrado como
   **T-15-31** (`accept`) en `15-01-PLAN.md`: el gate cubre el cambio de *modo*, no la baja del
   *número*. Poner el control a un click de distancia hace ese caso mucho más probable — si se
   construye, conviene decidir acá qué pasa (rechazar / avisar / dejar pasar).

## Alcance

Fase propia o parte de un ciclo de UX de `/servicios`. Toca solo el panel autenticado: no toca el
motor, ni la migración, ni el aislamiento por tenant.
