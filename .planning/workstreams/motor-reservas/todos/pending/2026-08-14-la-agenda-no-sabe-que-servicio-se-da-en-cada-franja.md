---
created: 2026-08-14T00:00:00.000Z
title: "La agenda no sabe qué servicio se da en cada franja — el rubro clases no se puede configurar"
area: database
source: Observación del dueño durante la UAT de la Phase 15 (2026-08-14)
files:
  - supabase/migrations/041_time_blocks_capacity_and_seat.sql
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/api/booking/availability/route.ts
  - app/[slug]/booking-client.tsx
---

## El hallazgo

Palabras del dueño:

> "el servicio es la condición principal de los horarios, sobre todo en los rubros de clases
> grupales. Por ejemplo, si alguien en agenda tiene que configurar que los martes y jueves de 15 a 16
> da cerámica, y de 17 a 18 da corte y confección, no tiene forma de configurar eso en el sistema.
> Como que la sección agenda queda para poner las franjas horarias genéricas pero para algunos rubros
> no les sirve el sistema, o se complica configurarlo."

**Tiene razón, y es un defecto de modelo, no de UI.** `time_blocks` es
`business_id + day_of_week + start_time + end_time` y **no tiene `service_id`**. La agenda solo sabe
expresar *"atiendo de tal hora a tal hora"*. Eso alcanza para una peluquería —donde cualquier servicio
se puede dar en cualquier franja— y **no alcanza** para un taller, un estudio de danza, un gimnasio o
cualquier negocio donde la franja **es** la clase.

## Por qué esto importa ahora

Es **el mismo defecto que v0.27 atacó, un nivel más arriba.** El todo original
(`2026-07-30-el-cupo-vive-en-dos-lugares…`) decía "el bloque no sabe a qué servicio corresponde" y lo
tratamos como un problema de *dónde vive el cupo*. La observación del dueño muestra la consecuencia de
**producto**: si el bloque no sabe el servicio, **el negocio no puede declarar su agenda real**.

Y v0.27 dejó el camino despejado: `time_blocks.capacity` **ya dejó de decidir** (migr. 068), así que
la tabla quedó reducida a lo que siempre debió ser — la declaración de *cuándo* se atiende. El paso
natural es que también declare *qué*.

## Forma probable (no decidida)

`time_blocks.service_id` nullable:
- **NULL** = franja genérica, capaz de cualquier servicio ⇒ **comportamiento de hoy, cero regresión**.
- **con valor** = franja dedicada a ese servicio ⇒ el booking público solo ofrece ese servicio ahí, y
  ese servicio solo se ofrece en sus franjas.

El nullable es lo que hace el cutover gratis, igual que `individual` lo fue en v0.27.

## Lo que hay que pensar antes de planificarlo

1. **¿Una franja, un servicio, o varios?** "Martes 15-16 cerámica" es 1:1, pero una peluquería puede
   querer "mañanas: corte y color, no alisado". Si es N:M hace falta tabla puente, no una columna.
2. **La disponibilidad pública cambia de forma.** Hoy el cliente elige servicio y después ve horarios;
   con franjas dedicadas, el conjunto de horarios **depende** del servicio — que es justamente lo que
   la Phase 15 ya empezó a habilitar al mandar `serviceId` a `/api/booking/availability`.
3. **El cruce con multi-staff.** Hoy la franja es del negocio, no del profesional. "Martes 15-16
   cerámica **con Ana**" es otra dimensión más. Decidir si entra o queda afuera.
4. **El onboarding de estos rubros** es donde más se nota: hoy se les pide declarar un horario que no
   describe su negocio.
5. **Cero regresión obligatoria** para los negocios que hoy usan franjas genéricas — que son todos.

## Alcance

**Milestone propio, no una fase.** Toca el modelo de agenda, la grilla pública, la disponibilidad, el
panel y el onboarding. Es capacidad nueva y abre un rubro que hoy el sistema no atiende bien.

Relacionado: `2026-07-30-el-cupo-vive-en-dos-lugares-y-falta-el-modo-individual.md` (cerrado por
v0.27) — mismo defecto de modelo, visto desde el cupo en vez de desde la agenda.
