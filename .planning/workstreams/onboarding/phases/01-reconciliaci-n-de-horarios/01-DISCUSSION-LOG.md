# Phase 1: Reconciliación de horarios — Discussion Log

**Date:** 2026-07-03
*Human-reference only. No lo consumen los agentes downstream — leen CONTEXT.md.*

## Áreas discutidas y decisiones

### 1. Tabla canónica de horarios (central)
- **Opciones:** `time_blocks` como fuente única / `business_hours` como fuente / vista-sync.
- **Elegido:** `time_blocks` [Recomendado] → es el modelo operativo del motor v0.12, más rico (split, capacity). business_hours se elimina. → D-01.

### 2. Migración de datos existentes
- **Opciones:** backfill business_hours→time_blocks / sin migración (re-cargan).
- **Elegido (input del usuario):** SIN migración — "no hay clientes, si queda todo en 0 no hay problema" → cutover limpio, sin backfill. → D-02. Habilita además dropear business_hours ya (D-03).

### 3. Display en landing/agente desde time_blocks
- **Opciones:** todos los rangos del día / un solo open/close (min-max).
- **Elegido:** todos los rangos [Recomendado] → refleja horario partido real (ej. "Lun 9-12 y 15-19"). → D-05.

### 4. Onboarding: simple vs horario partido
- **Opciones:** 1 ventana/día simple / permitir horario partido.
- **Elegido (input del usuario):** permitir horario partido en el onboarding + **botón "Omitir/agregar más tarde"**. → D-04 (split, Phase 1) + D-06 (skip formal = ONB-01, Phase 2).

## Resuelto por Claude / diferido
- DROP de business_hours DESPUÉS de migrar los 3 lectores (orden obligatorio). Número de migración a coordinar (045 existe en otra rama).
- Backfill descartado (no hay data).
- Skip general de pasos + repaso de flujo → Phase 2.
