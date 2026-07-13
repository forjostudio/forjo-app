---
phase: 16-la-web-nace-como-borrador-skill-del-operador
plan: 01
subsystem: landing
tags: [landing, cms, draft, publish, pure-functions, tdd]
requires:
  - lib/landing/schema.ts (SECTION_TYPES, LandingConfig, landingConfigSchema)
  - lib/landing/editor-draft.ts (normalizeSections, canonical — privada)
  - lib/landing/write.ts (parseLandingConfigForWrite)
provides:
  - diffConfigParts(a, b): ConfigPart[] — el compare canónico POR PARTE (D-01/D-02/D-05)
  - type ConfigPart = SectionType | 'theme' | 'motion'
  - landingWriteColumns(config, publish) — la decisión draft-only vs draft+published (SKILL-07 / D-03 / D-03b)
affects:
  - scripts/setup-landing.ts (plan 16-02 — lo consume; este plan NO lo toca)
  - .claude/skills/forjo-web-builder/SKILL.md (plan 16-03)
tech-stack:
  added: []
  patterns:
    - "Lógica de decisión del script extraída a módulo PURO para que exista un unit test que agarre la regresión"
    - "Compare canónico (claves ordenadas) — nunca JSON.stringify crudo sobre objetos que vienen de jsonb"
key-files:
  created: []
  modified:
    - lib/landing/editor-draft.ts
    - lib/landing/write.ts
    - test/landing-editor-draft.test.ts
    - test/landing-write.test.ts
decisions:
  - "diffConfigParts normaliza AMBOS lados con normalizeSections antes de comparar: la materialización 5→8 secciones que hace el editor del dueño NO es un cambio suyo, y contarla como tal volvería ruido el aviso de choque (D-01/D-02) justo en el caso que viene a cubrir."
  - "canonical sigue PRIVADA: diffConfigParts la consume desde adentro del módulo en vez de exportarla (la opción (a) que el PATTERNS dejaba abierta). Menos superficie pública, mismo resultado."
  - "landingWriteColumns con publish=false NO incluye la clave landing_config ni como undefined: PostgREST manda las claves presentes del objeto."
  - "El camino --publish devuelve el MISMO objeto (identidad por referencia) en las dos claves — el invariante D-03b que evita que el botón Publicar del dueño revierta la web recién publicada (incidente f98ed6b)."
metrics:
  duration: ~15 min
  completed: 2026-07-13
  tasks: 2
  commits: 4
  tests_added: 18
  tests_total: 505 passed / 48 skipped
status: complete
---

# Phase 16 Plan 01: Capa pura del borrador del operador — Summary

`diffConfigParts` (qué partes del config difieren, con el compare canónico inmune al reordenamiento de claves del `jsonb`) y `landingWriteColumns` (la web del operador nace como borrador: el default NO escribe `landing_config`), las dos en módulos puros y con 18 tests nuevos que las cubren.

## Qué se construyó

### `diffConfigParts(a, b): ConfigPart[]` — `lib/landing/editor-draft.ts`

El motor del aviso de choque operador↔dueño (D-01/D-02) y del flag derivado de `--inspect` (D-05). Devuelve las partes que difieren —secciones en orden de `SECTION_TYPES`, después `'theme'`, después `'motion'`— con orden determinista.

Dos invariantes que el type-check NO agarra y que ahora tienen test:

1. **Compare canónico.** Reusa la función `canonical` **privada** del módulo (claves ordenadas antes de serializar). Un `JSON.stringify` crudo daría "distinto" siempre porque Postgres reordena las claves del `jsonb` → el aviso se volvería ruido que el operador aprende a ignorar. Test explícito con un config "de la DB" con las claves reordenadas a mano (`{ order, type, enabled }`), sin mock de Supabase.
2. **Normaliza los dos lados** (`normalizeSections`) antes de comparar. `buildLandingConfig` omite las secciones vacías (emite ~5) y el editor del dueño las materializa a las 8 con `enabled:false`. Sin normalizar, un dueño que solo abrió el editor y guardó —sin cambiar nada visible— dispararía el aviso con TODAS las secciones listadas. Test anti-falso-positivo con el config de 5 y el de 8 escritos **a mano** (derivarlo con `normalizeSections` no probaría nada).

`canonical` **sigue sin exportarse**: `diffConfigParts` la consume desde adentro del módulo. Es la opción (b) del 16-PATTERNS, y deja la superficie pública igual que antes.

### `landingWriteColumns(config, publish)` — `lib/landing/write.ts`

La decisión de SKILL-07, ahora unit-testeable:

- `publish=false` (default) → `{ landing_draft: config }`. La clave `landing_config` **no existe en el objeto**, ni siquiera como `undefined` (PostgREST manda las claves presentes; un `undefined` explícito es fuente de bugs). Es la assertion que mata **T-16-01**: el script pisando la web al aire de un negocio ya publicado.
- `publish=true` → las dos columnas con el **mismo objeto** (identidad por referencia, no un clon). Invariante **D-03b**: post-`--publish` `landing_draft === landing_config` byte a byte y `deriveEditorState` le muestra al dueño `✓ Publicado`, no un falso "Guardado — sin publicar" cuyo botón Publicar **revertiría** la web recién publicada. El comentario de cabecera preserva y cita el incidente del commit `f98ed6b`, que sigue vigente en ese camino.

Vive en el módulo puro y no inline en `scripts/setup-landing.ts` precisamente para que exista este test: el script no es unit-testeable (side-effects, `process.argv`, service-role).

## Tareas y commits

| Task | Nombre | Gate | Commit |
|------|--------|------|--------|
| 1 | diffConfigParts — tests (RED) | RED | `6147b92` |
| 1 | diffConfigParts — implementación (GREEN) | GREEN | `ad20de6` |
| 2 | landingWriteColumns — tests (RED) | RED | `c2e3ca0` |
| 2 | landingWriteColumns — implementación (GREEN) | GREEN | `c24718c` |

Ninguna de las dos tareas necesitó REFACTOR (las funciones son de ~15 líneas; el peso está en el comentario del POR QUÉ, que es convención del repo).

## TDD Gate Compliance

Ambas tareas cumplen la secuencia completa: `test(...)` con el test fallando por la función inexistente → `feat(...)` con la implementación mínima. El RED de la Task 1 falló con `TypeError: diffConfigParts is not a function` en los 12 tests; el de la Task 2, en los 6. Ningún test pasó inesperadamente antes de la implementación.

## Verificación

```
npx tsc --noEmit                                   → 0
npm test                                           → 505 passed | 48 skipped (37 files) — 0 regresiones
npx eslint lib/landing/{write,editor-draft}.ts test/landing-{write,editor-draft}.test.ts → 0
rg -c "export function diffConfigParts|export type ConfigPart" lib/landing/editor-draft.ts → 2
rg -c "export function landingWriteColumns" lib/landing/write.ts                          → 1
rg -c "^export function canonical|^export const canonical" lib/landing/editor-draft.ts    → 0 (privada)
git diff --name-only (4 commits)  → solo los 4 archivos del plan
git diff package.json             → vacío (cero deps nuevas)
```

`git diff --name-only` **no** lista `scripts/setup-landing.ts` ni `.claude/skills/forjo-web-builder/SKILL.md` (son 16-02 y 16-03). Cero archivos nuevos, cero migraciones, cero superficie web.

## Deviations from Plan

Ninguna. El plan se ejecutó tal cual está escrito.

## Threat Mitigations (del `<threat_model>` del plan)

| Threat | Estado | Cómo |
|--------|--------|------|
| T-16-01 (el script pisa lo publicado) | mitigado | `Object.keys(landingWriteColumns(cfg,false))` === `['landing_draft']` + `'landing_config' in r === false`, dos tests |
| T-16-02 (pérdida silenciosa del borrador del dueño) | mitigado | `diffConfigParts` sobre el compare canónico; test del reorden de claves del `jsonb` |
| T-16-03 (falso positivo → aviso ignorado) | mitigado | normalización de ambos lados; test anti-falso-positivo 5 vs 8 secciones |
| T-16-04 (invariante del editor tras `--publish`) | mitigado | test `toBe` de identidad por referencia en las dos claves |
| T-16-05 (elevación de privilegio) | mitigado | el plan no toca el script ni abre superficie: solo funciones puras (sin Supabase, sin React, sin `'use server'`) |
| T-16-SC (supply chain) | mitigado | cero `npm install`; `git diff package.json` vacío |

## Threat Flags

Ninguno. Los dos módulos son puros y no introducen endpoints, rutas de auth, acceso a archivos ni cambios de schema.

## Known Stubs

Ninguno.

## Notas para los planes siguientes

- **16-02 (`scripts/setup-landing.ts`)** consume las dos funciones. Recordar del 16-PATTERNS: el `select` de `resolveBusiness` **no trae `landing_draft`** hoy — hay que agregarlo (lo necesitan tanto el compare de D-01 como el `--inspect` de D-05), y `getFlag()` no sirve para un flag booleano (`--publish` necesita un `hasFlag`).
- **Lint pre-existente (fuera de alcance):** `npm run lint` en el repo arroja 48 problemas en archivos que este plan no toca (`app/(dashboard)/*`, `app/(crm)/*`, `.claude/skills/instagram-a-web/*.js`). Es ruido previo, no una regresión de esta fase. Los 4 archivos tocados acá pasan `eslint` limpios.

## Self-Check: PASSED

- `lib/landing/editor-draft.ts` — FOUND (modificado, `diffConfigParts` + `ConfigPart` exportados)
- `lib/landing/write.ts` — FOUND (modificado, `landingWriteColumns` exportado)
- `test/landing-editor-draft.test.ts` — FOUND (12 tests nuevos)
- `test/landing-write.test.ts` — FOUND (6 tests nuevos)
- Commits `6147b92`, `ad20de6`, `c2e3ca0`, `c24718c` — FOUND en `git log`
</content>
</invoke>
