---
phase: 02-configuraci-n-de-canchas
verified: 2026-07-01T16:30:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Configuración de Canchas — Verification Report

**Phase Goal:** El dueño gestiona sus canchas desde el dashboard como entidad reservable unificada (nombre + precio propio + duración fija propia, variable entre canchas) mapeada a uno o más espacios físicos del motor v0.12, reusando el motor SIN re-migrar el core; reemplaza la UI genérica interina de config de espacios.
**Verified:** 2026-07-01T16:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `supabase db reset` replaya baseline + 040 + 041 + 042 + 043 sin error en PG17 local | VERIFIED (checkpoint humano aprobado) | Migración `043_professionals_service_id.sql` existe, es aditiva (`ADD COLUMN IF NOT EXISTS`), sin backfill ni policy nueva. El plan declaró réplica OK y el dueño aprobó el checkpoint. |
| 2 | `professionals` tiene columna nullable `service_id` (FK → services.id) tras 043 | VERIFIED | `supabase/migrations/043_professionals_service_id.sql` línea 36-37: `ADD COLUMN IF NOT EXISTS "service_id" uuid REFERENCES "public"."services"("id") ON DELETE SET NULL`. Sin `NOT NULL`. Sin policy nueva. Índice parcial `WHERE service_id IS NOT NULL`. `lib/types.ts` línea 119: `service_id?: string | null`. |
| 3 | `provisionCancha` inserta service + professional(service_id seteado) + space + agenda_space, todos con business_id, con rollback manual | VERIFIED | `lib/canchas.ts` lines 54-122 implementa la secuencia completa. `test/canchas-provision.test.ts` tests 1-4 verifican inserts por tabla con `business_id`, `service_id` en professional, y rollback en falla de space y de agenda_spaces — 15/15 tests PASS. |
| 4 | Reconstruir la tupla se hace por `professionals.service_id` (puntero estable), nunca por nombre | VERIFIED | `canchasFromData` (lib/canchas.ts líneas 127-144) empareja por `pro.service_id === service.id` (Map por id). Test "renombrar el service NO rompe el match" en `canchas-provision.test.ts` línea 205. |
| 5 | `deleteCancha` soft-deletea (active=false en service Y professional) o hard-deletea (borra tupla + espacios dedicados) con distinción | VERIFIED | `lib/canchas.ts` líneas 164-207. Soft: `update { active: false }` en ambos. Hard: borra agenda_spaces → professional → service → espacios dedicados (computed con `dedicatedSpaceIds`); FK 23503 → `has_appointments`. Tests cubre todos los casos incluido FK y compartidos (15/15 PASS). |
| 6 | En un negocio canchas, /servicios muestra el manager de canchas con alta (nombre + precio + duración fija propia), lista, edición, toggle activar/desactivar y borrado permanente con gate "ELIMINAR" | VERIFIED (checkpoint UI aprobado 2026-07-01) | `components/dashboard/canchas-manager.tsx` implementa todo. Wiring: `settings-client.tsx` líneas 1155-1170 renderiza `<CanchasManager>` cuando `isCanchas` (vertical canchas + view=servicios). `app/(dashboard)/servicios/page.tsx` carga professionals/spaces/agenda_spaces con `.eq('business_id')` y los pasa. UI aprobada por el dueño. |
| 7 | Dos canchas pueden tener duraciones distintas y cada una conserva la suya (D-01 + CANCHA-02) | VERIFIED (checkpoint aprobado) | Cada cancha = 1 fila en `services` con `duration_minutes` propio. `editCancha` actualiza solo el service de la cancha editada (`.eq('id', cancha.service.id)`). Sin columna global de duración. Checkpoint confirmado por el dueño. |
| 8 | El control "compartir espacio" (D-04) permite mapear a espacios existentes (F11→{A,B,C}); por defecto crea espacio dedicado 1:1 | VERIFIED | `canchas-manager.tsx` líneas 63-96: `sharedSpaceIds` state vacío por defecto → `provisionCancha` crea space dedicado. Control avanzado plegable (líneas 272-313) permite marcar espacios existentes → pasa `sharedSpaceIds`. Test "comparte espacio (F11→{A,B,C}): NO crea space, inserta 3 agenda_spaces" PASS. |
| 9 | `view='equipo'` (salud/belleza/general) sigue funcionando idéntico — cero regresión | VERIFIED | `settings-client.tsx` línea 1154-1286: el TabsContent value="services" es `isCanchas ? <CanchasManager> : <CRUD genérico>`. El TabsContent value="professionals" (línea 1289) queda intacto. Suite completa: **317/317 tests PASS** (subió de 302 a 317 por los 15 nuevos de canchas). |

**Score:** 9/9 truths verified (0 present-behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/043_professionals_service_id.sql` | Migración aditiva: `ADD COLUMN service_id uuid nullable FK → services(id)` + índice | VERIFIED | Existe. `ADD COLUMN IF NOT EXISTS "service_id" uuid REFERENCES "public"."services"("id") ON DELETE SET NULL`. Índice parcial `WHERE service_id IS NOT NULL`. Sin policy RLS nueva. Sin backfill. |
| `lib/types.ts` | `Professional.service_id?: string | null` | VERIFIED | Línea 119: `service_id?: string \| null` con comentario en español sobre D-06. |
| `lib/canchas.ts` | Exporta `provisionCancha`, `deleteCancha`, `canchasFromData`; min 80 líneas | VERIFIED | 258 líneas. Named exports: `provisionCancha`, `canchasFromData`, `dedicatedSpaceIds`, `deleteCancha`, `editCancha`, `setCanchaActive`. Cliente inyectado (no importa createClient). Rollback manual documentado. |
| `test/canchas-provision.test.ts` | Tests de provisión + reconstrucción + rollback con client mock | VERIFIED | Existe. 15 tests en 5 describe blocks. Client mock completo (makeMockClient). Corre sin Supabase real. |
| `app/(dashboard)/servicios/page.tsx` | Carga professionals/spaces/agenda_spaces con `.eq('business_id')` y los pasa al SettingsClient | VERIFIED | Líneas 19-25: Promise.all carga 5 tablas. Pasa `initialProfessionals/initialSpaces/initialAgendaSpaces`. |
| `components/dashboard/canchas-manager.tsx` | Manager de canchas gateado por vertical; consume lib/canchas.ts | VERIFIED | 358 líneas. Importa `provisionCancha`, `canchasFromData`, `deleteCancha`, `editCancha`, `setCanchaActive`, `dedicatedSpaceIds` desde `@/lib/canchas`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/canchas.ts` | `043_professionals_service_id.sql` | `provisionCancha` escribe `professionals.service_id` | VERIFIED | Línea 73: `insert({ name: input.name, service_id: service.id, business_id: businessId })` |
| `lib/canchas.ts` | `lib/types.ts` | importa `Service`, `Professional`, `AgendaSpace` | VERIFIED | Línea 23: `import type { Service, Professional, AgendaSpace } from '@/lib/types'` |
| `app/(dashboard)/settings/settings-client.tsx` | `lib/canchas.ts` | form de alta llama `provisionCancha`; lista usa `canchasFromData`/`deleteCancha` | VERIFIED | Línea 12: `import { CanchasManager }`. El componente recibe el estado y lo pasa a CanchasManager que usa las 3 funciones. |
| `app/(dashboard)/servicios/page.tsx` | `app/(dashboard)/settings/settings-client.tsx` | pasa `initialProfessionals/initialSpaces/initialAgendaSpaces` | VERIFIED | Líneas 31-34 de `servicios/page.tsx`. |
| `app/(dashboard)/settings/settings-client.tsx` | `lib/verticals.ts` | `resolveVertical(business).key === 'canchas'` gatea el render | VERIFIED | Línea 165: `const isCanchas = resolveVertical(business).key === 'canchas'` |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `provisionCancha` orquesta 4 inserts con rollback | `npm test -- canchas-provision` | 15/15 PASS (267ms) | PASS |
| Suite completa sin regresión | `npm test` | 317/317 PASS (5.4s) | PASS |
| TypeScript compila sin errores | `npx tsc --noEmit` | 0 errores | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CANCHA-01 | 02-01, 02-02 | El dueño crea una cancha como entidad reservable con nombre, precio propio y duración fija, y le asocia uno o más espacios físicos | SATISFIED | `provisionCancha` crea la tupla service+professional+space+agenda_space. UI de alta con nombre+precio+duración+control de espacios. Checkpoint UI aprobado. |
| CANCHA-02 | 02-01, 02-02 | El dueño edita y elimina canchas; cada cancha puede tener su propia duración (variable entre canchas) | SATISFIED | `editCancha` actualiza solo el service de la cancha. `deleteCancha` soft/hard. Cada service tiene `duration_minutes` propio. Checkpoint UI aprobado. |
| CANCHA-03 | 02-01, 02-02 | La config de canchas reusa el motor de v0.12 (`spaces`/`agenda_spaces`) sin re-migrar; mapear cancha→espacios sigue acoplando la disponibilidad | SATISFIED | Sin migración nueva al motor (solo 043 sobre `professionals`). `agenda_spaces` se inserta/lee con el mismo schema de v0.12. `provisionCancha` crea filas en `agenda_spaces` por cada espacio. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (ninguno) | — | — | — | — |

Scan realizado en: `lib/canchas.ts`, `components/dashboard/canchas-manager.tsx`, `app/(dashboard)/servicios/page.tsx`, `supabase/migrations/043_professionals_service_id.sql`. Cero `TBD`/`FIXME`/`XXX`/`TODO`/`PLACEHOLDER`. Cero `return null` ni arrays hardcodeados vacíos que lleguen a render dinámico.

---

### Human Verification Required

Ninguna. Los checkpoints de UI (alta/edición/duración independiente/mapeo de espacios/soft-delete/toggle/regresión en otros verticales) fueron aprobados por el usuario el 2026-07-01.

---

### Gaps Summary

Sin gaps. Todos los must-haves verificados contra el código real. Suite completa verde (317/317).

---

_Verified: 2026-07-01T16:30:00Z_
_Verifier: Claude (gsd-verifier)_
