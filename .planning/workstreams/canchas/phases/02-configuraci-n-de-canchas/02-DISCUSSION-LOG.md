# Phase 2: Configuración de Canchas — Discussion Log

**Date:** 2026-06-30
*Human-reference only. No lo consumen los agentes downstream (researcher/planner/executor) — esos leen CONTEXT.md.*

## Áreas discutidas y decisiones

### 1. Modelo de precio + duración (decisión central, deferida por el ROADMAP)
- **Opciones presentadas:** (a) reusar `services`; (b) columnas nuevas en `professionals`; (c) tabla dedicada.
- **Elegido:** (a) reusar `services` [Recomendado].
- **Razón:** `services` ya tiene `price` + `duration_minutes` y RLS por tenant; el core de booking ya lee precio/duración del service → cero migración de esquema y Phase 3 consume la cancha casi sin cambios. Trade-off aceptado: forzar 1:1 agenda↔service para canchas. → D-01.

### 2. Ruta / UI de gestión de canchas
- **Opciones:** adaptar `/servicios` (ya "Canchas" en el menú) vs pantalla dedicada `/canchas`.
- **Elegido:** adaptar `/servicios` [Recomendado]. La config de espacios del tab Equipo (guardeado en Phase 1) migra acá. → D-03.

### 3. UX del mapeo cancha→espacios
- **Opciones:** auto 1:1 + compartir opcional vs espacios-primero explícito.
- **Elegido:** auto 1:1 + compartir opcional [Recomendado]. Esconde el motor para el caso común; soporta el sharing (F11→{A,B,C}) requerido por el criterio 3. → D-04.

### 4. Borrado de cancha con reservas futuras
- **Opciones:** soft-delete/desactivar vs bloquear.
- **Elegido:** soft-delete (`active=false`, patrón de services) [Recomendado]. → D-05.

## Claude's Discretion (no discutido — sigue patrones del repo)
Validaciones exactas, reuso del componente de form, mecánica del control "compartir espacio",
etiquetado/orden de la lista, mecanismo concreto del linkeo 1:1 agenda↔service.

## Deferred
Pricing por franja (v2), staff en canchas (v2), turnos fijos/recurrentes (fase propia).
