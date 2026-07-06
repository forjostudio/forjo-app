# Phase 3: Import de clientes CSV - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning (research a nivel plan-phase RECOMENDADO — ver `<deferred>`/nota)
**Source:** discuss-phase (decisiones técnicas vía skill `forjo-advisor`; la librería CSV la aprobó el usuario)

<domain>
## Phase Boundary

**El único flujo con backend delicado del milestone** (DATA-03), aislado en su propia fase. El dueño
importa clientes desde un CSV con un flujo seguro:
**upload → preview/validación (NADA se escribe) → confirmar → insertar solo válidos, deduplicados,
con `origin='importado'` → resumen (importados / omitidos / fallidos).**

Consume la columna `origin` que introdujo la Fase 2 (migr. 049, ya en prod) y cierra el round-trip con
el export de clientes de la Fase 2.

**Riesgo dominante:** aislamiento por tenant (un CSV NUNCA puede escribir en otro negocio) + correctitud
del parseo (el export usa comillas RFC4180 → parseo robusto obligatorio). Por eso el ROADMAP recomienda
**research a nivel plan-phase** (parseo / validación / dedup / aislamiento) antes de escribir el plan.
</domain>

<decisions>
## Implementation Decisions

Resueltas por el advisor (técnicas) + gate de usuario (librería CSV). El "cómo" técnico profundo
(batch insert, edge cases de parseo, anon+RLS vs service-role) lo investiga el researcher.

### D-01 — Formato/columnas del CSV
- **Header RÍGIDO = el del export de la Fase 2** (round-trip): `nombre,telefono,email,origen,notas,obra_social,nro_obra_social`.
- **Obligatorias:** `nombre` + **al menos un contacto** (`telefono` o `email`) — mismo criterio que el alta manual (D-02 Fase 2).
- La columna `origen` del CSV se **ignora** y se fuerza `origin='importado'` server-side (el CSV no elige origen; el CHECK de migr.049 igual lo rechazaría).
- Columnas extra se ignoran. **Mapeo flexible de columnas (CSVs de otras herramientas) = DIFERIDO a v2.**

### D-02 — Criterio de deduplicación
- **Reusar el criterio existente** de la feature "Fusionar duplicados" (`clients-client.tsx` L260-269):
  **email en minúsculas** + **teléfono solo-dígitos** (`replace(/\D/g,'')`). Una fila del CSV es duplicado
  si matchea un cliente existente del negocio por cualquiera de los dos.
- **Duplicado → OMITIR (v1)**, contado en "omitidos" del resumen. **ACTUALIZAR el cliente existente = DIFERIDO a v2.**
- La dedup también aplica **dentro del propio CSV** (dos filas iguales → una sola).

### D-03 — Parseo + aislamiento (política; mecanismo → research)
- **Route handler autenticado** en `app/api/...` (fuente de verdad = server), **NO** server action.
- **`business_id` SIEMPRE de la sesión** (negocio resuelto por `owner_id`), **NUNCA del CSV** (SC-2): un CSV
  con un `business_id` ajeno no puede escribir en otro tenant. Defensa en profundidad (RLS + filtro explícito).
- **Al confirmar, el server RE-PARSEA el archivo** — no confía en la preview del cliente (la preview es solo UX).
- Mecanismo exacto (anon+RLS como el alta de la Fase 2 vs service-role acotado como booking; batch insert;
  manejo de errores por fila) → lo decide el **research**. Lean: anon+RLS por defensa en profundidad.

### D-04 — Escala/robustez
- **Tope conservador v1: ≤ ~2.000 filas y ≤ 2 MB de archivo** (dentro del payload ~4.5 MB y el timeout de
  Vercel Hobby). Si el archivo excede, error claro **antes** de parsear.
- El research afina los números exactos contra los límites reales de Vercel Hobby (payload/timeout de funciones).

### D-05 — Librería de parseo CSV (APROBADA por el usuario — dep nueva)
- **Usar `papaparse`** (~45 KB, RFC4180 robusto, battle-tested). **Es una dependencia NUEVA** — flaggeada y
  **aprobada por el usuario** en discuss-phase.
- Rationale del gate: el export de la Fase 2 usa comillas RFC4180; un parser naíf (split por coma) se rompe con
  campos entre comillas. El parseo es la parte riesgosa de esta fase → un parser battle-tested elimina esa clase de bugs.
- **Solo `papaparse`** — no sumar otras deps (xlsx, etc.); el import es CSV, no Excel.

### Claude's Discretion / para el research
- Slug/estructura de los route handlers (ej. `app/api/import/clients/preview` + `.../confirm`, o uno con acción).
- Formato exacto del error por fila en la preview + el shape del resumen (importados/omitidos/fallidos).
- Estrategia de batch insert (tamaño de lote) y manejo de fallo parcial (transacción vs best-effort por lote).
- Cómo se pasa el archivo de preview → confirm (re-upload vs token/cache server-side) — con la regla dura de RE-PARSEAR en confirm.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap
- `.planning/workstreams/gestion-rebrand/REQUIREMENTS.md` — DATA-03.
- `.planning/workstreams/gestion-rebrand/ROADMAP.md` §"Phase 3" — Goal + Success Criteria 1–4 + las 5 phase-level decisions (incl. "research a nivel plan-phase RECOMENDADO").

### Aislamiento por tenant (crítico)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — RLS + `business_id` de la sesión, service-role solo server-side y solo cuando hace falta, defensa en profundidad. El import es el flujo más sensible del milestone.
- `.claude/skills/convenciones-forjo/SKILL.md` — route handlers, Response.json, naming.

### Round-trip con la Fase 2 (contrato de datos)
- Export de clientes de la Fase 2: `app/api/export/clients/route.ts` — el header `nombre,telefono,email,origen,notas,obra_social,nro_obra_social` y el escaping RFC4180 (`esc`) son el CONTRATO que el import debe leer de vuelta. `lib/clients-create.ts` — `validateClientBody` / `isValidPhone` / `buildClientInsert` (la validación + el insert con `origin` que el import puede reusar).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/export/clients/route.ts` (Fase 2) — el header canónico + el escaping RFC4180. El import lee ESE formato de vuelta (round-trip). `app/api/clients/create/route.ts` + `lib/clients-create.ts` — el patrón de alta autenticada (anon+RLS, `business_id` de sesión, `validateClientBody`, `isValidPhone`, `buildClientInsert` con `origin`). El import puede reusar `validateClientBody`/`isValidPhone` por fila y `buildClientInsert` con `origin='importado'`.
- `app/(dashboard)/clients/clients-client.tsx` L260-269 — el **criterio de dedup existente** (email minúsculas + teléfono solo-dígitos) a reusar. Y la pantalla de Clientes donde probablemente viva el botón/flujo de import (junto a "Nuevo cliente" / "Exportar CSV").
- `lib/whatsapp.ts` — normalización de teléfono (wa.me / dígitos) si hace falta un helper compartido para el dedup.

### Established Patterns
- **Aislamiento:** todo route handler resuelve `business` por `owner_id` de la sesión y filtra por `business_id`. El import NO acepta `business_id` del CSV/cliente.
- **Route handlers autenticados** en `app/api`; `Response.json({ ok, ... })`; errores snake_case.
- **Migraciones:** la columna `origin` (049) ya está en prod — el import solo la consume (`importado`), NO necesita migración nueva.

### Integration Points / NUEVO en esta fase
- **Upload de archivo:** NO hay patrón de multipart/`request.formData()` en ningún route handler → es nuevo (Next 16). El research define el manejo del upload + límites.
- **`papaparse`:** dependencia NUEVA a instalar (aprobada). `package.json` cambia (a diferencia de las Fases 1 y 2 que fueron cero-deps).
- Nuevos route handlers de import (preview + confirm) + UI de import (upload → preview con errores marcados → confirmar → resumen) en la pantalla de Clientes.
</code_context>

<specifics>
## Specific Ideas
- **Round-trip real:** exportás clientes en la Fase 2 → los volvés a importar → mismo header, sin romperse (RFC4180). Es el caso de prueba estrella.
- La preview marca las filas con error de validación (nombre faltante, sin contacto, teléfono no numérico) ANTES de escribir nada (SC-1).
- El resumen post-confirm: importados / omitidos (duplicados) / fallidos (validación) — con conteos (SC-4).
- `papaparse` es la única dep nueva; el import es CSV puro (no Excel/xlsx).
</specifics>

<deferred>
## Deferred Ideas
- **Mapeo flexible de columnas** (importar CSVs con headers arbitrarios de otras herramientas) — v2. v1 exige el header del export.
- **ACTUALIZAR clientes existentes en el import** (en vez de omitir el duplicado) — v2. v1 omite.
- **Import de finanzas** — no está en el roadmap (el export de finanzas es solo salida).
- **Imports grandes (>2.000 filas)** / procesamiento asíncrono / cola — v2 si aparece la necesidad (Vercel Hobby limita).
</deferred>

---

*Phase: 3-Import de clientes CSV*
*Context gathered: 2026-07-06 (decisiones técnicas vía forjo-advisor; librería CSV aprobada por el usuario)*
*NOTA: research a nivel plan-phase RECOMENDADO (ROADMAP) — parseo/validación/dedup/aislamiento antes del plan.*
