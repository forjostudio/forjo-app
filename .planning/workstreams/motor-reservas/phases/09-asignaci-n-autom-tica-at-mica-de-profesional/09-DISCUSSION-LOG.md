# Phase 9 — Discussion Log

**Date:** 2026-07-25
**Mode:** discuss (default)
**Phase:** Asignación automática atómica de profesional (backend puro; ASIGN-02/03/04)

> Registro humano de la discusión (auditoría/retro). NO lo consumen los agentes downstream — eso es `09-CONTEXT.md`.

## Áreas presentadas (gray areas)

El usuario eligió discutir las **4** áreas propuestas. Muchas decisiones ya venían lockeadas desde el roadmap/milestone (asignación dentro del RPC, estrategia menos-turnos, candidatos server-side, cero regresión, sede D-13, cupo-por-solape = v0.26).

### 1. Desempate del balanceo
- Opciones: **Determinístico por orden de alta (Rec.)** · Round-robin · Aleatorio.
- **Elegido:** Determinístico por orden de alta (`created_at` asc). Reproducible + self-balancing, cero estado. → **D-01**

### 2. Qué cuenta como "carga del día"
- Opciones: **Todos los turnos activos, día completo (Rec.)** · Solo del servicio pedido · Solo confirmados (sin holds).
- **Elegido:** Todos los turnos NO cancelados, día completo, cualquier servicio, incluye abonos + holds vigentes. → **D-02**

### 3. Sede en el conteo de carga
- Opciones: **Carga total en todas las sedes (Rec.)** · Solo la sede de esta reserva.
- **Elegido:** Total en todas las sedes (una persona = una agenda). Los candidatos igual se acotan por sede (D-13). → **D-03**

### 4. Alcance del lock / concurrencia
- Opciones: **Por negocio + horario de inicio (Rec.)** · Por negocio + servicio + horario · Que lo defina research.
- **Elegido:** Por `(business_id + horario de inicio)`, correctness-first; research valida el key exacto sin degradar `slot_full`/`slot_taken`. → **D-04**

## Deferred / redirigido
- ASIGN-01 + ASIGN-05 (UI "cualquiera" + mostrar profesional) → Phase 10.
- Cupo por solape (todo `capacity>1`) → v0.26, milestone aparte, mismo RPC (coordinar orden de migraciones).

## Claude's Discretion (a research/planner)
- Firma del RPC / sentinel de "cualquiera"; mecánica exacta del advisory-lock key; forma de la query SQL de candidatos (paridad con `lib/staff-services.ts`).
