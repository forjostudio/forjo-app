---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-09-12T00:27:49.878Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 21 | unrun-verify | app/(onboarding)/onboarding/page.tsx |  | UAT visual del aviso de D-07 en el paso Horarios (5 pasos) pendiente: modo end-of-phase | open |  | 2026-09-12T00:27:49.878Z |  |

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
  }
]
````
