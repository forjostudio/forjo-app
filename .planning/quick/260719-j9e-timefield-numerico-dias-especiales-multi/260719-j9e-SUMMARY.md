---
quick_id: 260719-j9e
slug: timefield-numerico-dias-especiales-multi
date: 2026-07-19
status: complete
commit: cdbe979
---

# Summary: TimeField numérico + días especiales multi-select siempre activo

**Estado:** completo. Ejecutado inline (sin subagentes) por ser un cambio chico y
ya diseñado; se cumplieron las garantías de GSD (task dir, PLAN, SUMMARY, fila en
STATE, commit atómico en rama).

## Cambios

- **Nuevo:** `components/ui/time-field.tsx` — `TimeField` (input de hora numérico,
  reemplaza `type=time` nativo). Export `TimeField` + `normalizeTime`.
- **Editado:** `app/(dashboard)/agenda/agenda-client.tsx` — 4 inputs de hora →
  `TimeField`; import `Input` removido; días especiales siempre multi-select
  (toggle por tap, Shift = rango, botón "Limpiar" condicional, sin `excMulti`).
- **Editado:** `components/dashboard/nuevo-turno-form.tsx` — campo Hora → `TimeField`.

## Verificación

- `tsc --noEmit`: exit 0.
- `eslint` de los archivos tocados: limpio.
- Pendiente de validación mobile del usuario tras el deploy (teclado numérico al
  tocar la hora; días especiales seleccionando de a varios con tap).

## Commits

- `cdbe979` feat: TimeField numérico + días especiales multi-select siempre activo

## Nota

Rama `quick/260719-timefield-dias-especiales`. Merge/push a main = acción del
usuario (deploy a prod).
