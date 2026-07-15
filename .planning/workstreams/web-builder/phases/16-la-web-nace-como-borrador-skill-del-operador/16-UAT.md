---
status: complete
phase: 16-la-web-nace-como-borrador-skill-del-operador
source: [16-VERIFICATION.md]
started: 2026-07-13T18:10:00Z
updated: 2026-07-14T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. `--inspect` contra un negocio real muestra borrador y publicado por separado
expected: El JSON trae `al_aire` y `pendiente_de_aprobacion` como claves separadas, con las 7 claves de estado, y el renglón humano coincide con el estado real de la fila.
result: pass
note: "Las 7 claves presentes y el aviso corresponde a la forma correcta (cambios sin publicar, parte: tema). Nit cosmético de copy: el aviso dice 'Secciones que difieren' pero lista `tema`, que es una parte (tema/movimiento), no una sección."

### 2. El write path en runtime: default no publica, `--publish` sí
expected: |
  - Script SIN `--publish` sobre un negocio YA publicado → `/[slug]` sigue mostrando la web VIEJA; `--inspect` posterior muestra la nueva en `pendiente_de_aprobacion`.
  - Sobre un negocio que NUNCA publicó → `/[slug]` sigue mostrando la reserva simple.
  - Con `--publish` → la web sale al aire y el editor del dueño abre en `✓ Publicado` (no en un falso "sin publicar").
result: pass
note: |
  Probado end-to-end contra estudio-test (prod). Default: escribió solo landing_draft, aviso de choque imprimió sin abortar, /[slug] intacto, --inspect mostró el cambio en pendiente_de_aprobacion. --publish: pre-print correcto, landing_config + landing_draft actualizados, /[slug] pasó a mostrar la web nueva, editor en "Todo guardado". SC1 + SC2 verificados.
  Hallazgo separado (NO fase 16): la preview del editor /web renderiza la paleta default del preset (cyan) mientras el público aplica el override primary custom (#7c3aed → violeta). Vive en el editor CMS + renderer (v0.16 fases 13-15). Anotado en .planning/todos/pending/2026-07-14-editor-cms-no-refleja-primary-override-custom.md

### 3. Coherencia editorial del SKILL.md leído como el agente operador
expected: Ninguna instrucción residual lleva a publicar por default ni a reconstruir el payload desde `al_aire` cuando hay borrador.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
