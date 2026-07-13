---
phase: 01-reconciliaci-n-de-horarios
verified: 2026-07-03T00:00:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification_status: approved
human_verification_note: "Checkpoint DROP en prod APROBADO por el usuario — migración 046 aplicada + smoke checks OK"
---

# Phase 01: Reconciliación de Horarios — Verification Report

**Phase Goal:** Unificar la fuente de horarios en `time_blocks` (canónica) para que lo que se carga en el onboarding llegue al panel de agenda y al booking público, y que el agente de WhatsApp muestre lo mismo; eliminar `business_hours` sin regresión.
**Verified:** 2026-07-03
**Status:** passed
**Re-verification:** No — verificación inicial
**Requirements:** SCHED-01, SCHED-02

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El paso "Horarios de atención" del onboarding inserta en `time_blocks` (no en `business_hours`) | VERIFIED | `onboarding/page.tsx` líneas 278–293: `supabase.from('time_blocks').insert(timeBlocksToInsert)` con `business_id: business.id`, `day_of_week`, `start_time`, `end_time`, `label: null`, `location_id: null`, `capacity: 1` |
| 2 | Los horarios cargados en el onboarding llegan al panel de agenda y al booking público | VERIFIED | Panel/booking ya leen `time_blocks` (sin tocar); onboarding ahora escribe en la misma tabla. Fuente única unificada. |
| 3 | La UI del paso permite cargar horario partido (varios bloques por día) | VERIFIED | Estado `DayState[]` con `blocks: HourBlock[]`; funciones `addBlock`/`removeBlock`/`updateBlock`; botón "Agregar bloque" en el render del Step 4 (línea 641–647) |
| 4 | Un día sin bloques queda cerrado (no se inserta nada para ese día) | VERIFIED | `dayStates.flatMap((ds, day) => ds.enabled ? ds.blocks.map(...) : [])` — días desactivados no producen filas; "Cerrado" mostrado en la UI |
| 5 | El endpoint del agente (`/api/agent/context`) deriva los horarios de `time_blocks`, no de `business_hours` | VERIFIED | `app/api/agent/context/route.ts` líneas 35–37: `supabase.from('time_blocks').select('day_of_week, start_time, end_time').eq('business_id', business.id)` |
| 6 | El shape del HANDOFF hacia el bot (`hours[]` = 7 días con `ranges HH:MM`) se preserva idéntico | VERIFIED | `mapTimeBlocks` en `lib/agent-context.ts` devuelve `DayHours[]` (7 entradas, `ranges: [{open, close}]` en HH:MM). 4 tests en `lib/agent-context.test.ts` cubren horario partido, días cerrados, null-tolerancia. |
| 7 | La tabla `business_hours` y la vista `public_business_hours` dejan de existir (migración aplicada) | VERIFIED | Migración `046_drop_business_hours.sql` existe con `DROP VIEW IF EXISTS public.public_business_hours`, `DROP POLICY IF EXISTS ...`, `DROP TABLE IF EXISTS public.business_hours` (todos idempotentes). Checkpoint humano APROBADO: DROP aplicado en prod. |
| 8 | `supabase/schema.sql` no contiene `business_hours` ni `public_business_hours` | VERIFIED | Grep en `supabase/schema.sql` → 0 coincidencias |
| 9 | `lib/types.ts` no contiene la interfaz `BusinessHour`; `TimeBlock` intacto | VERIFIED | Grep de `BusinessHour` en `lib/` → 0 referencias. `interface TimeBlock` presente (líneas 81–94 de `lib/types.ts`) |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Descripción | Status | Detalle |
|----------|-------------|--------|---------|
| `app/(onboarding)/onboarding/page.tsx` | Paso de horarios que escribe `time_blocks` con soporte de horario partido | VERIFIED | Contiene `from('time_blocks').insert(...)` con el shape correcto; estado `DayState[]` + `addBlock`/`removeBlock` |
| `lib/agent-context.ts` | Mapeo puro `time_blocks → hours[]` del HANDOFF | VERIFIED | `mapTimeBlocks(rows: TimeBlockRow[])` agrupa por `day_of_week`, produce 7 días con ranges HH:MM; sin referencias a `business_hours` |
| `app/api/agent/context/route.ts` | Endpoint que lee `time_blocks` y devuelve `hours[]` | VERIFIED | `from('time_blocks').select('day_of_week, start_time, end_time').eq('business_id', ...)` |
| `supabase/migrations/046_drop_business_hours.sql` | DROP idempotente de vista + policy + tabla | VERIFIED | Los 3 `DROP IF EXISTS` en el orden correcto (vista → policy → tabla); header con contexto y advertencias |
| `lib/types.ts` | Sin `interface BusinessHour`; `TimeBlock` intacto | VERIFIED | 0 referencias a `BusinessHour`; `interface TimeBlock` intacta |

---

### Key Link Verification

| From | To | Via | Status | Detalle |
|------|----|-----|--------|---------|
| `app/(onboarding)/onboarding/page.tsx` | `time_blocks` (tabla) | `supabase.from('time_blocks').insert(...)` con `business_id: business.id` | WIRED | Líneas 278–293 |
| `app/api/agent/context/route.ts` | `time_blocks` (tabla) | `supabase.from('time_blocks').select('day_of_week, start_time, end_time').eq('business_id', ...)` | WIRED | Líneas 35–37 |
| `app/api/agent/context/route.ts` | `lib/agent-context.ts` | `import { mapTimeBlocks, mapServices }` + `hours: mapTimeBlocks(hours)` | WIRED | Líneas 2, 53 |
| `supabase/migrations/046_drop_business_hours.sql` | `supabase/schema.sql` | Schema regenerado refleja ausencia de `business_hours` | WIRED | Grep en schema.sql → 0 referencias |

---

### Prohibition Verification

| Prohibición | Status | Evidencia |
|-------------|--------|-----------|
| Ningún path del onboarding escribe `business_hours` tras el cambio | VERIFIED | Grep en `app/` → 0 referencias al string `business_hours` |
| No se toca el motor de agenda (`availability` / `book_slot_atomic`) | VERIFIED | Estos archivos no aparecen en los planes ni fueron modificados |
| No se agregan pasos ni campos nuevos al onboarding | VERIFIED | El onboarding sigue teniendo 4 pasos; solo cambió el modelado del Step 4 |
| Ningún path del agente lee `business_hours` tras el cambio | VERIFIED | Grep en `lib/` → solo 2 comentarios explicativos (no-código); grep en `app/` → 0 referencias |
| No se toca `time_blocks` ni el motor | VERIFIED | Confirmado por grep y revisión de los planes |
| No se hace backfill de datos `business_hours → time_blocks` | VERIFIED | Migración 046 solo hace DROP, sin INSERT/COPY |

---

### Requirements Coverage

| Requirement | Plan | Descripción | Status | Evidencia |
|-------------|------|-------------|--------|-----------|
| SCHED-01 | 01-01 | Horarios del onboarding llegan al panel/booking | SATISFIED | `time_blocks.insert` en `handleFinish`; panel/booking ya leen `time_blocks` |
| SCHED-02 | 01-02, 01-03 | Landing y agente muestran mismos horarios; fuente única sin divergencia | SATISFIED | Agente migrado a `time_blocks`; `business_hours` dropeada; schema limpio; 0 divergencia posible |

---

### Anti-Patterns Found

| File | Patrón | Severidad | Notas |
|------|--------|-----------|-------|
| `lib/landing/derive.ts` | Comentario `// NO de business_hours` | Info | Comentario explicativo, no código; correcto |
| `components/landing/hours.tsx` | Comentario `// NO de business_hours` | Info | Comentario explicativo, no código; correcto |

Sin blockers ni warnings. Los comentarios en landing son intencionalmente explicativos de la migración.

---

### Behavioral Spot-Checks

Step 7b: Las verificaciones de comportamiento clave son cubiertas por el test suite de `lib/agent-context.test.ts` (8 tests: `mapTimeBlocks` × 4 + `mapServices` × 4). El onboarding es un componente client que no tiene entry point runnable sin servidor.

| Comportamiento | Verificación | Status |
|----------------|-------------|--------|
| `mapTimeBlocks([])` → 7 días con ranges vacíos | `lib/agent-context.test.ts` it "devuelve 7 entradas en orden domingo..sábado" | VERIFIED via test |
| Horario partido: 2 bloques mismo día → 2 ranges | `lib/agent-context.test.ts` it "agrupa por day_of_week y recorta a HH:MM (horario partido)" | VERIFIED via test |
| Día sin bloques → `ranges: []` | `lib/agent-context.test.ts` it "un día sin bloques queda cerrado" | VERIFIED via test |
| `mapTimeBlocks(null/undefined)` → tolerante | `lib/agent-context.test.ts` it "tolera input null/undefined → 7 días con ranges vacíos" | VERIFIED via test |
| 0 referencias vivas a `business_hours` en app/lib/components | Grep repo-wide | VERIFIED — 0 hits |
| Migración 046 tiene DROP TABLE IF EXISTS business_hours | Lectura del archivo | VERIFIED |

---

### Human Verification

**Checkpoint DROP en prod (Task 3 del Plan 03):** APROBADO por el usuario.

El usuario confirmó "aprobado" tras aplicar la migración `046_drop_business_hours.sql` en prod y ejecutar los smoke checks:
- Landing pública muestra horarios (ya leía `time_blocks`)
- Endpoint `/api/agent/context?slug=...` devuelve `hours[]` sin error
- Alta nueva en el onboarding con horario partido aparece en el panel de agenda
- `business_hours` y `public_business_hours` ya no existen en prod

---

### Gaps Summary

Sin gaps. Todos los must-haves están verificados en el código real.

---

_Verified: 2026-07-03_
_Verifier: Claude (gsd-verifier)_
_Human checkpoint: APROBADO (DROP prod + smoke checks OK)_
