---
phase: 02-configuraci-n-de-canchas
plan: 01
subsystem: data-layer
tags: [canchas, migracion, supabase, multi-tenant, lib]
status: complete
requires:
  - "motor v0.12 (spaces, agenda_spaces, book_slot_atomic — migr. 040-042)"
  - "vertical canchas (Phase 1)"
provides:
  - "professionals.service_id (puntero 1:1 cancha↔agenda, migr. 043)"
  - "lib/canchas.ts (provisionCancha, deleteCancha, canchasFromData)"
affects:
  - "Plan 02-02 (UI del manager de canchas consume esta capa)"
  - "Phase 3 (booking público de canchas)"
tech-stack:
  added: []
  patterns:
    - "capa pura con SupabaseClient inyectado (testeable con mock, sin DB real)"
    - "rollback manual en auto-provisión sin RPC (mismo nivel del dashboard)"
    - "puntero estable por columna FK (nunca emparejar por nombre)"
key-files:
  created:
    - "supabase/migrations/043_professionals_service_id.sql"
    - "lib/canchas.ts"
    - "test/canchas-provision.test.ts"
  modified:
    - "lib/types.ts (Professional.service_id)"
    - "supabase/schema.sql (columna + FK + índice parcial)"
decisions:
  - "D-06: el 1:1 cancha↔agenda se materializa con professionals.service_id (columna nueva nullable), NO reusando specialty"
  - "agenda_spaces se insertan row-a-row (mismo patrón que toggleAgendaSpace); el rollback vía FK CASCADE del professional limpia parciales"
  - "deleteCancha hard NO borra spaces compartidos ni el dedicado explícitamente (el CASCADE de professional→agenda_spaces limpia el puente; el space queda, decisión de no borrar espacios reusables)"
metrics:
  duration: "~15 min"
  completed: "2026-07-01"
  tasks: 3
  files: 5
---

# Phase 2 Plan 1: Base de datos + capa de datos de canchas — Summary

Migración aditiva 043 (`professionals.service_id`, puntero 1:1 a `services` de D-06) + `lib/canchas.ts`, capa pura y testeable que auto-provisiona, reconstruye y borra la tupla cancha (service + professional + space + agenda_spaces) con rollback manual y aislamiento por `business_id`.

## Qué se construyó

- **Migración 043** (`supabase/migrations/043_professionals_service_id.sql`): `ALTER TABLE professionals ADD COLUMN service_id uuid` nullable, FK → `services(id)` `ON DELETE SET NULL`, + índice btree **parcial** `WHERE service_id IS NOT NULL`. Aditiva, sin backfill, sin policy RLS nueva (hereda la RLS de `professionals`). Cabecera en español con el racional de D-06 (descartar reusar `specialty`) y los invariantes del workflow (validar SOLO con `supabase db reset` local; prod a mano + `NOTIFY pgrst`).
- **lib/types.ts**: `Professional.service_id?: string | null` — espejo de la columna, con comentario que aclara que es null en salud/belleza/general.
- **supabase/schema.sql**: regenerado a mano (columna en el `CREATE TABLE professionals`, FK `professionals_service_id_fkey`, índice `professionals_service_id_idx`), siguiendo el estilo del dump (patrón 037/039/042).
- **lib/canchas.ts** (capa pura, cliente inyectado):
  - `provisionCancha(client, businessId, input)`: secuencia service → professional(`service_id`) → space(s) → agenda_spaces. Espacio dedicado por defecto; `sharedSpaceIds` reusa espacios existentes (caso F11→{A,B,C}). Rollback manual en cada paso (borra lo anterior filtrando por `business_id`). Resultado discriminado `{ ok }`.
  - `canchasFromData(services, professionals, agendaSpaces)`: empareja `professional.service_id === service.id` (puntero estable, **nunca por nombre**), ignora agendas sin `service_id`.
  - `deleteCancha(client, businessId, cancha, { hard })`: soft por defecto (`active=false` en service **y** professional → sale del booking, D-05); hard borra agenda_spaces → professional → service, mapeando FK `23503` a `has_appointments`.
- **test/canchas-provision.test.ts** (10 tests, client mock, sin DB): happy path dedicado + compartido, rollback en falla de space y de agenda_spaces, rollback que no borra espacios compartidos, reconstrucción por `service_id` (robusta al renombrar), ignora sin puntero, soft-delete en ambos, hard-delete con FK 23503.

## Verificación

- `npx tsc --noEmit`: limpio.
- `npm test -- canchas-provision`: **10/10 verde** (client mock, no toca la DB del usuario).
- `npm run lint`: **cero issues nuevos** en `lib/canchas.ts` / `test/canchas-provision.test.ts` (los 590 problemas del repo son pre-existentes y fuera de scope).
- `supabase db reset` + `npm test` (suite completa): **DIFERIDOS al usuario** (ver abajo) — el usuario está corriendo Supabase local en otro editor; correr el reset destruiría su estado y la suite completa seedea contra su DB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] agenda_spaces se insertan row-a-row en vez de en batch**
- **Found during:** Task 2 (GREEN)
- **Issue:** El primer draft insertaba las filas de `agenda_spaces` en un solo `.insert(array)`. El patrón establecido del repo (`toggleAgendaSpace` en settings-client.tsx) inserta una fila por vez, y la reconstrucción/rollback es más limpia así.
- **Fix:** Loop row-a-row (`for space_id of spaceIds`), rompe al primer error. El rollback del `professional` limpia parciales vía FK CASCADE.
- **Files:** `lib/canchas.ts`
- **Commit:** `6771731`

### Decisión de diseño (no desviación)

- **hard-delete no borra el space:** `deleteCancha({hard})` borra `agenda_spaces` (el puente) + `professional` + `service`, pero NO borra el/los `space(s)`. Un espacio físico puede ser reusable/compartido y borrarlo tendría efectos cruzados; el puente que lo acopla a esta agenda se elimina, que es lo necesario para desacoplar la cancha. La UI de Plan 02 puede ofrecer borrar espacios huérfanos aparte si hace falta.

## Known Stubs

Ninguno. La capa está completa y wired contra la columna real 043. La UI que la consume es Plan 02-02 (fuera de scope de este plan).

## ⚠️ USER SETUP — pasos manuales pendientes (correr vos, NO los corrió el executor)

El executor **no** corrió `supabase db reset` ni la suite completa porque estás con Supabase local abierto en otro editor. Corré esto cuando termines con tu sesión de Supabase:

### 1. Validar la migración 043 en local (PG17)

```powershell
cd "c:\Users\franc\Desktop\Forjo Studio\forjo-app"
supabase db reset
```

Esto replaya baseline + 040 + 041 + 042 + **043** en orden. Debe terminar sin error. (⚠️ DESTRUCTIVO: recrea la DB local — corrélo solo cuando no estés usando esa DB.)

### 2. Correr la suite completa (regresión, 302+ tests)

```powershell
npm test
```

Debe seguir verde (cero regresión). Necesita tus 3 creds de Supabase en el entorno; los tests de aislamiento seedean data contra tu Supabase local, por eso no los corrió el executor.

### 3. Aplicar 043 a PROD (a mano, coordinado con el deploy)

En **Supabase Dashboard → SQL Editor** (proyecto prod `gestion.forjo.studio`), pegar y ejecutar el contenido de `supabase/migrations/043_professionals_service_id.sql`, y después:

```sql
NOTIFY pgrst, 'reload schema';
```

(Refresca el schema cache de PostgREST para que la columna nueva sea visible por la API.) NO usar `supabase db push`; la aplicación a prod es manual, coordinada con el deploy del código que consume la columna (Plan 02).

## Threat Flags

Ninguno nuevo. La columna 043 es aditiva sobre `professionals` (ya RLS por `business_id`), sin superficie cross-tenant nueva; todos los writes de `lib/canchas.ts` setean/filtran `business_id`.

## Self-Check: PASSED

- FOUND: supabase/migrations/043_professionals_service_id.sql
- FOUND: lib/canchas.ts
- FOUND: test/canchas-provision.test.ts
- FOUND: lib/types.ts service_id
- FOUND: supabase/schema.sql service_id
- FOUND commits: f7372ff, 0077637, 6771731
