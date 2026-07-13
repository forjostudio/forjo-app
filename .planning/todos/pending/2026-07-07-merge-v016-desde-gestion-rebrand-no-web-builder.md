---
created: 2026-07-07T00:00:00.000Z
title: "MERGE v0.16 — el código vive en gsd/gestion-rebrand, NO en gsd/web-builder (stale)"
area: ops
milestone: web-builder
resolves_at: milestone-merge
files:
  - .planning/workstreams/web-builder/STATE.md
  - .planning/config.json (workstream pointer)
---

## Problem (leer ANTES de mergear el milestone v0.16)

El milestone v0.16 (workstream `web-builder`, Phases 11-14) se está ejecutando sobre la rama
**`gsd/gestion-rebrand`**, NO sobre `gsd/web-builder`. Dos trampas operativas que un merge
ingenuo rompe:

1. **Rama equivocada como fuente.** `gsd/gestion-rebrand` ⊇ `gsd/web-builder` (a 2026-07-07:
   gestion-rebrand está 253 commits adelante, web-builder 0). Los planes Y el código de Phase 11
   se commitearon en `gsd/gestion-rebrand` (`907a9f7`,`55d5b26`,`5aae090`,`89d6305`,`0c6acd3`).
   `gsd/web-builder` quedó **stale** — NO tiene nada de v0.16. Mergear/comparar contra
   `gsd/web-builder` PIERDE todo el milestone. La rama fuente del merge es `gsd/gestion-rebrand`.
   Causa raíz: `git.branching_strategy: "none"` → execute-phase no crea ni cambia de rama, trabaja
   sobre la que esté checkouteada.

2. **El pointer de workstream hay que setearlo a mano antes de ejecutar.** `.planning/workstreams/active`
   apuntaba a `gestion-rebrand` (milestone v0.15, ya archivado). El flag `--ws web-builder` de los
   comandos GSD **solo scopea una llamada suelta**; los subagentes (gsd-executor, etc.) resuelven
   STATE/ROADMAP por el **pointer activo**. Si no se corre `gsd-tools query workstream set web-builder`
   ANTES de execute/secure/review, los subagentes escriben en el workstream equivocado.
   → Antes de CUALQUIER `/gsd:*-phase N --ws web-builder`: `workstream set web-builder`.

## Solution / checklist de merge

- [ ] Confirmar rama fuente = `gsd/gestion-rebrand` (o la que contenga los commits de las 4 fases), NO `gsd/web-builder`.
- [ ] Antes de correr fases 12-14: `node .claude/gsd-core/bin/gsd-tools.cjs query workstream set web-builder`.
- [ ] Al cerrar el milestone, decidir qué hacer con `gsd/web-builder` stale (borrar o re-basear) para no confundir sesiones futuras.
- [ ] Recordar: artefactos GSD bajo `.planning/` están gitignored (SUMMARY/VERIFICATION/REVIEW/SECURITY/este todo) — solo STATE.md y ROADMAP.md están trackeados (force-add histórico). El código y los docs de skill/scripts SÍ se commitean normal.

## Notes

- Memoria relacionada: `web-builder-v016-milestone`. Milestone previo (pointer viejo): `gestion-rebrand` (archivado v0.15).
