---
created: 2026-08-16T00:00:00.000Z
title: "Una sola persona puede ocupar todos los cupos de una clase grupal"
area: booking
source: UAT Phase 15, test 2 (2026-08-16) — "encontré algo para futuro"
files:
  - app/[slug]/booking-client.tsx
  - lib/booking-core.ts
  - supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
---

## El hallazgo

**Palabras del dueño:** *"pude sacar todos los cupos del mismo turno con el mismo nombre, celular y
mail."*

Desde la página pública, una misma persona puede reservar **los N lugares** de una clase grupal
repitiendo el formulario con los mismos datos. El motor cuenta ocupantes, no personas distintas: para
`book_slot_atomic` son N reservas legítimas que no superan el cupo.

## Por qué no es un bug del motor

El cupo funciona **exactamente como se diseñó** — v0.27 no introdujo esto y no lo empeora. Es una
capacidad que nunca existió: **no hay noción de "un lugar por persona"**. Aparece ahora porque los
cupos grupales recién se vuelven declarables y usables de verdad.

## Por qué importa

En una clase grupal el cupo **es el inventario**. Que una persona pueda vaciarlo:

- **Sin mala intención:** alguien reserva "para mí y mis dos amigas" tres veces con sus propios datos
  y el negocio no sabe que son tres personas distintas o la misma.
- **Con mala intención:** desde la superficie pública **anónima**, alguien bloquea la agenda entera de
  un negocio sin costo. Hoy el único freno es reCAPTCHA v3, que mide *bot*, no *duplicado*.

El segundo caso es de **disponibilidad**, y la superficie es la misma que v0.9 endureció. Vale
evaluarlo con `secure-phase` cuando se planifique.

## Lo que hay que decidir

1. **¿Qué identifica a una persona?** Mail, teléfono, o los dos. Ninguno está verificado hoy en el
   booking público: se tipean.
2. **¿Es un bloqueo o un aviso?** "Ya tenés un lugar en este horario" puede ser un rechazo duro o una
   confirmación extra. Un rechazo duro rompe el caso legítimo de reservar para otro.
3. **¿Y si el negocio SÍ quiere permitirlo?** Un profesor puede querer que una madre anote a sus dos
   hijos. Huele a setting por negocio o por servicio, no a regla global.
4. **Dónde vive el control.** Si es una garantía real tiene que estar **dentro del RPC atómico** —
   chequear antes de insertar es una carrera, la misma lección de la Phase 9. Si es solo UX, el
   re-check JS alcanza y hay que decir que es solo UX.
5. **Cruce con abonos:** una serie recurrente genera turnos por el mismo cliente en el mismo horario
   por definición. Cualquier regla de unicidad tiene que exceptuarlos o los rompe.

## Alcance

Capacidad nueva, no polish. Fase propia dentro del workstream. Toca la superficie pública anónima y
posiblemente el RPC ⇒ **`secure-phase` recomendado**.
