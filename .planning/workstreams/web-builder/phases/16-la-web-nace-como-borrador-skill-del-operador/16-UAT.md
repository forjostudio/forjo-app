---
status: testing
phase: 16-la-web-nace-como-borrador-skill-del-operador
source: [16-VERIFICATION.md]
started: 2026-07-13T18:10:00Z
updated: 2026-07-13T18:10:00Z
---

## Current Test

number: 1
name: `--inspect` contra un negocio real muestra borrador y publicado por separado
expected: |
  `npm run setup:landing -- --inspect <slug>` (con `.env.local` + service-role) devuelve un JSON con las 7 claves
  (`al_aire`, `pendiente_de_aprobacion`, `nunca_publico`, `tiene_cambios_sin_publicar`, `partes_sin_publicar`,
  `publicado_roto`, `borrador_roto`) y el renglón humano de abajo coincide con el estado real de la fila
  (una de las 4 formas del aviso, o uno de los 3 mensajes de cierre).
awaiting: user response

## Tests

### 1. `--inspect` contra un negocio real muestra borrador y publicado por separado
expected: El JSON trae `al_aire` y `pendiente_de_aprobacion` como claves separadas, con las 7 claves de estado, y el renglón humano coincide con el estado real de la fila.
result: [pending]

### 2. El write path en runtime: default no publica, `--publish` sí
expected: |
  - Script SIN `--publish` sobre un negocio YA publicado → `/[slug]` sigue mostrando la web VIEJA; `--inspect` posterior muestra la nueva en `pendiente_de_aprobacion`.
  - Sobre un negocio que NUNCA publicó → `/[slug]` sigue mostrando la reserva simple.
  - Con `--publish` → la web sale al aire y el editor del dueño abre en `✓ Publicado` (no en un falso "sin publicar").
result: [pending]

### 3. Coherencia editorial del SKILL.md leído como el agente operador
expected: Ninguna instrucción residual lleva a publicar por default ni a reconstruir el payload desde `al_aire` cuando hay borrador.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
