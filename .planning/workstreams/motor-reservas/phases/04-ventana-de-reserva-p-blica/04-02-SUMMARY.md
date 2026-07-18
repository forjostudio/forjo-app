---
phase: 04-ventana-de-reserva-p-blica
plan: 02
subsystem: dashboard / settings
tags: [booking-window, settings, dashboard, businesses-update]
status: complete
requires:
  - "04-01: columnas businesses.max_advance_days/max_advance_date + interface Business extendida"
provides:
  - "app/(dashboard)/settings/settings-client.tsx — control de ventana de reserva (windowForm + saveWindow) en la tab Cobros"
affects:
  - "Plan 03 (cap de calendarios) y Plan 04 (backstop) consumen el valor que este control persiste"
tech-stack:
  added: []
  patterns:
    - "Settings update: setState + supabase.from('businesses').update(payload).eq('id', business.id) + toast (patrón saveDeposit)"
    - "3 modos mutuamente excluyentes: escribir la columna del modo activo y nulear la otra (Pitfall 4)"
key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
decisions:
  - "Selector de modos con radios nativos (accent-primary) consistentes con el checkbox del bloque Seña; inputs condicionales por modo"
  - "Modo inicial derivado con precedencia fecha > días, espejando effectiveBookingCutoff del helper 04-01"
metrics:
  tasks: 2
  files_created: 0
  files_modified: 1
  completed: 2026-07-18
status_line: "Control de ventana de reserva en Ajustes → Cobros: 3 modos (días/sin límite/fecha) que persisten una sola columna de businesses y nulean la otra"
---

# Phase 4 Plan 02: Control de ventana de reserva en Ajustes — Summary

Superficie de dashboard con la que el dueño configura la ventana de reserva pública (BOOK-WINDOW-01). Vive en Ajustes → tab **Cobros**, junto a la config de Seña, reusando el patrón `saveDeposit` (setState + `supabase.from('businesses').update(...)` + toast). Expone los 3 modos mutuamente excluyentes de D-01 y al guardar escribe una sola columna nuleando la otra (Pitfall 4).

## What Was Built

### Task 1 — Estado + handler saveWindow (commit `b29b7ac`)
- `windowForm` (`mode: 'dias' | 'sin_limite' | 'fecha'`, `days`, `date`) inicializado desde la prop `business`: modo derivado con precedencia `max_advance_date` → 'fecha', luego `max_advance_days > 0` → 'dias', si no → 'sin_limite'. `days` default `business.max_advance_days ?? 30`; `date` = `business.max_advance_date ?? ''`.
- `savingWindow` para el estado de carga.
- `saveWindow()`: calcula el payload según el modo — `dias` → `{ max_advance_days: days>=1, max_advance_date: null }`, `sin_limite` → `{ null, null }`, `fecha` → `{ null, date }`. Validación cliente antes de persistir (días entero ≥ 1; fecha no vacía → `toast.error` y aborta). Luego `update(payload).eq('id', business.id)` + toast éxito/error. `depositForm`/`saveDeposit` intactos.

### Task 2 — Card "Ventana de reserva" en la tab Cobros (commit `f89bfa4`)
- Nueva `<Card className="p-6 space-y-4">` después de la Card de Seña y antes de la de limpieza, consistente en padding/tipografía (`font-semibold text-sm`) con las Cards hermanas.
- Título con icono `CalendarDays` + copy de ayuda (`text-xs text-muted-foreground`) aclarando que limita solo la reserva pública, no la carga manual.
- `<fieldset>` con 3 radios mutuamente excluyentes (`name="window_mode"`, `accent-primary`): días / sin límite / fecha exacta. Cada radio con su `<Label htmlFor>`.
- Inputs condicionales al modo activo: `Input type="number" min={1}` para días, `Input type="date"` para la fecha de corte (inclusive). Ancho completo en mobile (`w-full sm:w-40/52`).
- Botón `Guardar` → `saveWindow`, deshabilitado durante `savingWindow`.

## Verification

| Comando | Resultado |
|---------|-----------|
| `grep saveWindow && grep "max_advance_date: null"` | OK-SAVE |
| `npx tsc --noEmit` (filtrado a settings-client.tsx) | OK-TSC (0 errores nuevos) |
| `grep "Ventana de reserva"` | OK-UI |
| `npx eslint app/(dashboard)/settings/settings-client.tsx` | 10 errores pre-existentes (react-hooks/purity por `Date.now` en L333/L448, ajenos al cambio); 0 nuevos en las líneas agregadas |

Verificación manual (checkpoint humano de la fase, no de este plan): abrir Ajustes → Cobros, alternar los 3 modos, guardar, refrescar y confirmar persistencia; confirmar que "sin límite" deja ambas columnas en null.

## Deviations from Plan

Ninguna. El plan se ejecutó tal cual. No hubo Rule 1/2/3 auto-fixes ni gates de autenticación.

## Deferred Issues

- **Lint pre-existente (fuera de scope):** 10 errores `react-hooks/purity` por `Date.now()` en `uploadLogo`/upload de fotos (L333, L448, etc.), ya presentes en `main` antes de este plan. No introducidos por 04-02. Candidatos a una limpieza de lint dedicada.

## Threat Mitigations (del threat_model)

- **T-04-05 (Tampering/EoP):** `saveWindow` usa `.eq('id', business.id)` + la RLS owner-only de `businesses`; el update solo toca `max_advance_days`/`max_advance_date` (no `plan_status` ni columnas sensibles).
- **T-04-06 (integridad de config):** el save escribe una columna y nulea la otra según el modo (Pitfall 4); nunca deja las dos seteadas. La precedencia fecha > días del helper queda solo como red de seguridad.
- **T-04-SC (installs):** cero dependencias nuevas; solo componentes ya presentes del design system + icono `CalendarDays` de lucide (ya instalado).

## Known Stubs

Ninguno. El control es funcional y persiste contra `businesses`.

## Self-Check: PASSED
- Archivo modificado: app/(dashboard)/settings/settings-client.tsx ✓
- Commits: b29b7ac ✓, f89bfa4 ✓
