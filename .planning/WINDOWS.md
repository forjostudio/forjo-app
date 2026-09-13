---
schema_version: 1
open_count: 5
waived_count: 0
fixed_count: 0
total_count: 5
last_updated: 2026-09-13T06:14:15.130Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 21 | unrun-verify | app/(onboarding)/onboarding/page.tsx |  | UAT visual del aviso de D-07 en el paso Horarios (5 pasos) pendiente: modo end-of-phase | open |  | 2026-09-12T00:27:49.878Z |  |
| 2 | quick | unrun-verify | app/(onboarding)/onboarding/page.tsx |  | el vaciado de Min. y Precio con el teclado en el paso 2 del alta no se pudo probar: el runner corre sin DOM (environment node) | open |  | 2026-09-12T23:26:54.315Z |  |
| 3 | quick | unrun-verify | components/dashboard/canchas-manager.tsx |  | el vaciado de Duracion en alta y edicion de canchas quedo como human-check sin correr: sin DOM en el runner | open |  | 2026-09-12T23:26:55.027Z |  |
| 4 | quick | unrun-verify | app/(dashboard)/settings/settings-client.tsx |  | el vaciado y la normalizacion onBlur de los cuatro campos de Ajustes > Servicios quedo como human-check sin correr: sin DOM en el runner | open |  | 2026-09-12T23:26:55.683Z |  |
| 5 | quick | unrun-verify | app/(dashboard)/web/web-client.tsx |  | quick 260913-3tv: los 4 human-check del preview (servicio sin franja deshabilitado, staff filtrado, wizard de canchas, widget que no se reinicia al tipear) NO se corrieron — el runner es environment:node y auto_advance los auto-aprobo | open |  | 2026-09-13T06:14:15.130Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "21",
    "file": "app/(onboarding)/onboarding/page.tsx",
    "line": null,
    "description": "UAT visual del aviso de D-07 en el paso Horarios (5 pasos) pendiente: modo end-of-phase",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T00:27:49.878Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "app/(onboarding)/onboarding/page.tsx",
    "line": null,
    "description": "el vaciado de Min. y Precio con el teclado en el paso 2 del alta no se pudo probar: el runner corre sin DOM (environment node)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T23:26:54.315Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "components/dashboard/canchas-manager.tsx",
    "line": null,
    "description": "el vaciado de Duracion en alta y edicion de canchas quedo como human-check sin correr: sin DOM en el runner",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T23:26:55.027Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "app/(dashboard)/settings/settings-client.tsx",
    "line": null,
    "description": "el vaciado y la normalizacion onBlur de los cuatro campos de Ajustes > Servicios quedo como human-check sin correr: sin DOM en el runner",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T23:26:55.683Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "app/(dashboard)/web/web-client.tsx",
    "line": null,
    "description": "quick 260913-3tv: los 4 human-check del preview (servicio sin franja deshabilitado, staff filtrado, wizard de canchas, widget que no se reinicia al tipear) NO se corrieron — el runner es environment:node y auto_advance los auto-aprobo",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-13T06:14:15.130Z",
    "resolved_at": null
  }
]
````
