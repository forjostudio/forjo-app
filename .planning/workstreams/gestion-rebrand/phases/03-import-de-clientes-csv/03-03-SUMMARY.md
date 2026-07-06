---
phase: 03-import-de-clientes-csv
plan: 03
subsystem: ui
tags: [csv, import, dialog, multipart, formdata, react, shadcn, next16]

# Dependency graph
requires:
  - phase: 03-02 (route handlers preview/confirm)
    provides: "POST /api/import/clients/preview → {ok, preview:{total,importables,duplicadas,errores:[{row,error}]}} y POST /api/import/clients/confirm → {ok, resumen:{importados,omitidos,fallidos}}"
  - phase: 02 (alta manual + export CSV + badge de origen)
    provides: "ORIGIN_BADGE (importado='Importado' variant secondary), header 2-col con Exportar/Nuevo cliente, patrón fetch/anti-doble-submit del alta"
provides:
  - "Botón 'Importar CSV' en el header de /clients (outline, grid 2-col junto a Exportar); 'Nuevo cliente' movido a fila primaria full-width"
  - "Dialog de import de 4 etapas (upload → preview → confirmando → resumen) que consume preview/confirm y refleja los importados con badge 'Importado'"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upload multipart desde el cliente: FormData + fetch SIN Content-Type manual (el browser setea el boundary)"
    - "File retenido en React state para re-postearlo a /confirm sin re-seleccionar (stateless re-upload; el server re-parsea el crudo)"
    - "Dialog multi-etapa: un DialogContent que swapea contenido por un stage local ('upload'|'preview'|'confirming'|'resumen') en vez de rutas/modales separados"
    - "Cierre bloqueado durante la escritura: onOpenChange ignora el close mientras stage==='confirming' (anti-abandono de write en vuelo)"

key-files:
  created: []
  modified:
    - app/(dashboard)/clients/clients-client.tsx

key-decisions:
  - "La preview solo tabula las FILAS CON ERROR: el endpoint /preview devuelve counts + errores:[{row,error}], NO los datos por fila de las válidas/duplicadas. Se muestran contadores (válidas/con error/duplicadas) + una tabla de errores con 'Fila N' + mensaje traducido. Fiel al contrato real del Plan 02, no una tabla inventada."
  - "IMPORT_ROW_ERROR mapea los códigos de validateClientBody a copy español: missing_fields='Falta el nombre o un contacto…' (el server no discrimina nombre vs contacto), invalid_phone='El teléfono no es válido.'"
  - "onImportDone re-fetchea la lista con order created_at ASC (mismo orden que el load inicial de page.tsx) para no alterar el clientNumberMap; los importados entran con su badge 'Importado' ya mapeado."
  - "'Cerrar' del resumen es outline (neutral): el flujo terminó, se reserva el único --primary para 'Confirmar import'."

patterns-established:
  - "El Dialog de import es su propio analog: reusa el molde del alta (open/onOpenChange+reset, fetch+setLoading+res.json().catch+toast, anti-doble-submit) sin componentes/deps nuevos."
  - "Marca de fila accesible: error = bg-destructive/10 + border-l-2 border-destructive + icono AlertCircle + texto (nunca solo hue) → sobrevive daltonismo, WCAG AA."

requirements-completed: [DATA-03]

# Metrics
duration: ~15min
completed: 2026-07-06
status: complete
---

# Phase 3 Plan 3: UI del import CSV (Dialog de 4 etapas) Summary

**El botón "Importar CSV" y el Dialog ancho de 4 etapas (upload → preview → confirmando → resumen) en `/clients`: sube el archivo a `/preview` (SC-1, nada se escribe), muestra contadores + las filas con error marcadas por fill+border+icono+texto, re-postea el mismo File a `/confirm` con anti-doble-submit y cierre bloqueado, y al cerrar el resumen re-fetchea la lista con los importados badge "Importado" — cerrando DATA-03 end-to-end con reuso puro del design system (cero componentes/deps de UI nuevas).**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-06
- **Tasks:** 2
- **Files modified:** 1 (`app/(dashboard)/clients/clients-client.tsx`)

## Accomplishments
- **Header reestructurado (UI-SPEC "Header placement"):** fila secundaria `grid grid-cols-2` con "Exportar CSV" + "Importar CSV" (ambos `outline`, round-trip CSV emparejado); "Nuevo cliente" pasa a fila primaria propia `w-full` (CTA dominante, ya no apretado en un grid de 3 celdas a 320px). "Importar CSV" con icono `Upload` y SIN `gap-*` manual (hereda el del Button).
- **Dialog de import de 4 etapas** (`sm:max-w-2xl`, título `Importar ${term.clients.toLowerCase()}` respetando el vertical):
  - **Upload:** dropzone `border-2 border-dashed` + `<input type="file" accept=".csv,text/csv">` visually-hidden disparado por "Elegir archivo"; guard client-side (`.csv` + ≤2MB) con error inline `text-destructive`; archivo elegido muestra nombre+tamaño + `X` con `aria-label="Quitar archivo"` + focus-visible ring; "Continuar" POSTea FormData a `/preview` con `Loader2`.
  - **Preview (SC-1):** intro "Todavía no se guardó nada." + contadores (`Badge` outline/destructive/secondary) + tabla de filas con error (desktop `Table`, mobile filas apiladas `divide-y`) marcadas `bg-destructive/10 border-l-2 border-destructive` + `AlertCircle` + mensaje; empty state (importables===0) deshabilita "Confirmar import".
  - **Confirmando:** re-POST del MISMO File a `/confirm`; `stage='confirming'` + botón disabled "Importando..." + `Loader2`; cierre (Escape/outside) bloqueado por `onImportOpenChange`.
  - **Resumen (SC-4):** 3 tiles `text-2xl font-bold` (Importados/Omitidos/Fallidos, fallidos en `text-destructive` solo si >0) + helper condicional; "Cerrar" (outline) re-fetchea la lista → importados con badge "Importado".

## Task Commits

Cada tarea commiteada atómicamente (commits normales CON hooks):

1. **Task 1: Header — botón "Importar CSV" (grid 2-col) + "Nuevo cliente" full-width** — `c32fe35` (feat)
2. **Task 2: Dialog de import — 4 etapas (upload/preview/confirmando/resumen)** — `5776a57` (feat)

## Files Created/Modified
- `app/(dashboard)/clients/clients-client.tsx` (MODIFICADO) — imports de lucide (`Upload`, `AlertCircle`, `CheckCircle2`, `Loader2`) + Table family; tipos `ImportPreview`/`ImportResumen`/`ImportRowError` + `IMPORT_ROW_ERROR` + `IMPORT_MAX_BYTES`; estado del flujo (`importOpen`, `importStage`, `importFile`, `importPreview`, `importResumen`, `importLoading`, `importInputRef`); handlers (`resetImport`, `onImportOpenChange`, `onImportFileSelect`, `clearImportFile`, `onImportPreview`, `onImportConfirm`, `onImportDone`); header reestructurado; Dialog de 4 etapas.

## Decisions Made
- **La preview tabula solo las filas CON ERROR (no una tabla de todas las filas):** el contrato real de `/preview` (Plan 02) devuelve `preview:{ total, importables (count), duplicadas (count), errores:[{row,error}] }` — NO los datos por fila (nombre/teléfono/email) de las válidas ni las duplicadas. Se respetó ese contrato: contadores para el resumen global + una tabla de las filas con error (`Fila N` + mensaje traducido, con el tratamiento accesible del UI-SPEC). Es la lectura fiel del dato disponible, no una tabla de columnas Nombre·Teléfono·Email que el server no provee.
- **Copy por código de error** (`IMPORT_ROW_ERROR`): `missing_fields` se muestra como "Falta el nombre o un contacto (teléfono o email)." porque `validateClientBody` colapsa ambos casos en un solo código (no discrimina cuál falta); `invalid_phone` → "El teléfono no es válido."
- **Re-fetch con `order created_at ASC`** en `onImportDone`, igual que el load inicial de `page.tsx`, para no alterar el `clientNumberMap` (que hace fallback a índice de carga).
- **"Cerrar" del resumen = `outline`** (neutral): el flujo terminó, se mantiene el único gasto de `--primary` en "Confirmar import".

## Deviations from Plan

None - plan ejecutado tal cual. Dos ajustes de implementación (no cambian contrato ni comportamiento observable):
- El plan mencionaba columnas "Nombre·Teléfono·Email·Estado" en la preview; el contrato real de `/preview` no expone esos valores por fila (solo counts + errores). Se implementó la tabla con lo que el endpoint SÍ devuelve (filas con error: `Fila N` + Estado), lo cual es exactamente el dato disponible — el plan ya anticipaba esto en su `read_first` ("los shapes reales de /preview y /confirm … por si el executor ajustó nombres").
- Los `gap-1.5` que introduje inicialmente en dos spans de icono→texto se corrigieron a `gap-1` (múltiplo de 4) para respetar el guardrail duro del UI-SPEC.

## Issues Encountered
- **Warnings eslint transitorios entre tasks:** tras Task 1, eslint subió a 23 problemas (21 `no-unused-vars` warnings) porque los imports/estado se agregaron antes de que Task 2 los usara. Se verificó que NO había errores nuevos ni parse errors (solo el `set-state-in-effect` pre-existente en deferred-items). Task 2 resolvió todos los warnings transitorios → vuelta exacta al baseline **2 problemas (1 error, 1 warning)**.

## Baseline eslint
- **Antes:** 2 problemas (1 error `set-state-in-effect` L349 [deferred-items] + 1 warning `TrendingUp` unused).
- **Después:** 2 problemas (1 error `set-state-in-effect` [ahora L495 por las líneas agregadas] + 1 warning `TrendingUp` unused). **Sin regresión.**

## User Setup Required
None - sin configuración de servicio externo.

## Threat Mitigations Applied
- **T-03-11 (Tampering, preview como fuente de verdad):** la UI nunca manda "las filas que vio"; "Confirmar import" re-postea el File CRUDO retenido en state a `/confirm`, que re-parsea+re-valida (D-03, Plan 02). El guard client-side (`.csv`/≤2MB) es solo feedback; el server re-valida autoritativamente.
- **T-03-12 (DoS, doble submit del confirm):** anti-doble-submit — `stage='confirming'` → botón disabled + "Importando..." + `onImportConfirm` retorna temprano si `stage==='confirming'`; el Dialog no cierra (Escape/outside bloqueados) durante la escritura.
- **T-03-13 (InfoDisclosure, render de importados):** React escapa el render por default; los conteos y los mensajes de error se muestran como texto. El badge de origen usa el mapeo existente ("Importado" = secondary), sin re-mapear.

## Next Phase Readiness
- DATA-03 cerrado end-to-end: exportás (Fase 2) → reimportás (esta UI + endpoints del Plan 02) → resumen + badge "Importado". Phase 3 completa (3/3 plans).
- Human-check visual pendiente (`human_verify_mode=end-of-phase`): correr el flujo real en `/clients` — exportar, reimportar el mismo archivo, ver preview con contadores + filas con error, confirmar, ver resumen y los importados con badge "Importado".

## Self-Check: PASSED

- Archivo modificado: `app/(dashboard)/clients/clients-client.tsx` — presente, contiene "Importar CSV".
- Commits: `c32fe35`, `5776a57` — ambos en el árbol.
- Grep contrato: `Importar CSV`, `setImportOpen`, `api/import/clients/preview`, `api/import/clients/confirm`, `aria-label="Quitar archivo"`, `accept=".csv`, `variant="secondary"` — todos presentes.
- `tsc --noEmit` verde; eslint sin regresión (baseline 2 = post 2).
- `--primary`/`bg-primary` no aparece en el flujo import fuera del CTA default; dedup L406 intacta; badge "Importado" (secondary) sin re-mapear.

---
*Phase: 03-import-de-clientes-csv*
*Completed: 2026-07-06*
