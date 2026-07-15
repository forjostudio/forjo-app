---
phase: 16-la-web-nace-como-borrador-skill-del-operador
verified: 2026-07-13T18:00:00Z
status: passed
human_verification_resolved: 2026-07-14 (UAT 3/3 pass — ver 16-UAT.md)
score: 12/12 must-haves verified (code-level)
behavior_unverified: 0
overrides_applied: 0
re_verification: false
human_verification:
  - test: "`npm run setup:landing -- --inspect <slug>` contra un negocio real (`.env.local` con service-role) y confirmar que el JSON trae `al_aire` y `pendiente_de_aprobacion` por separado, con el renglón humano correcto debajo."
    expected: "El JSON tiene las 7 claves (`al_aire`, `pendiente_de_aprobacion`, `nunca_publico`, `tiene_cambios_sin_publicar`, `partes_sin_publicar`, `publicado_roto`, `borrador_roto`) y el renglón de abajo coincide con el estado real de la fila (una de las 4 formas del aviso, o uno de los 3 mensajes de cierre)."
    why_human: "Requiere Supabase real con service-role y una fila `businesses` real; no ejecutable en el sandbox de verificación estática. Explícitamente diferido a UAT por el propio plan 16-02 (Task 2 `<human-check>`)."
  - test: "Correr el script SIN `--publish` sobre un negocio YA publicado → confirmar que `/[slug]` sigue mostrando la web VIEJA y que `--inspect` posterior muestra la nueva en `pendiente_de_aprobacion`. Repetir sobre un negocio que NUNCA publicó → `/[slug]` sigue mostrando la reserva simple. Repetir con `--publish` → la web sale al aire y el editor del dueño abre en `✓ Publicado`."
    expected: "SC1/SC2/SC3 del ROADMAP se cumplen en runtime real: el default nunca toca `landing_config`, `--publish` publica y el editor del dueño no queda en un falso `sin publicar`."
    why_human: "Requiere Supabase real + un negocio de prueba + navegar `/[slug]` y `/web`. Explícitamente diferido a UAT por el plan 16-02 (Task 3 `<human-check>`). La garantía a nivel de código (unit tests de `landingWriteColumns` + único call-site) es fuerte pero no reemplaza la corrida end-to-end contra una fila real."
  - test: "Leer `.claude/skills/forjo-web-builder/SKILL.md` de punta a punta como si fueras el agente operador que la va a ejecutar: ¿queda alguna instrucción que lleve a publicar sin querer, o a reconstruir el payload desde lo publicado?"
    expected: "Ninguna instrucción residual lleva a publicar por default ni a partir de `al_aire` cuando hay borrador."
    why_human: "Revisión de coherencia editorial/instruccional deferida a UAT por el plan 16-03 (Task 2 `<human-check>`). El verificador ya leyó el archivo completo y no encontró contradicciones (ver tabla de Requirements Coverage), pero el plan la marcó explícitamente como ítem de UAT, no de gate automatizado."
---

# Phase 16: La web nace como borrador (skill del operador) — Verification Report

**Phase Goal:** La web que arma el operador con la skill queda esperando la aprobación del dueño en vez de salir cruda al público. `scripts/setup-landing.ts` escribe `landing_draft`; publicar sigue siendo una decisión del dueño desde su panel.

**Verified:** 2026-07-13T18:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | El operador corre la skill sobre un negocio y la web armada NO aparece en `/[slug]`: aparece en el editor del dueño como borrador sin publicar (y el negocio que nunca publicó sigue mostrando su reserva simple). | ✓ VERIFIED (code) | `landingWriteColumns(config, false)` → `{ landing_draft: config }`, clave `landing_config` no existe ni como `undefined` (`lib/landing/write.ts:133-141`, tests `landing-write.test.ts:326-330` con `'landing_config' in r === false`). `runWrite` tiene **una sola** llamada `.update(` sobre la tabla `businesses` (`scripts/setup-landing.ts:703-706`) y su argumento es `landingWriteColumns(parsed.data, publish)` — no hay ruta que escriba `landing_config` sin `--publish`. `app/[slug]/page.tsx:56` lee SOLO `business.landing_config` (nunca `landing_draft`), así que el borrador estructuralmente no puede aparecer en público. Full runtime confirmation queda para UAT (ver Human Verification #2). |
| SC2 | El dueño revisa esa web en su editor y, al publicarla, recién ahí sale al aire — cerrando el circuito operador → dueño → público. | ✓ VERIFIED (code, Phase 15 + no regresión) | El publish desde el editor del dueño es responsabilidad de Phase 15 (`PUB-04`, ya "Complete" en REQUIREMENTS.md) y no fue tocado por Phase 16 (`git diff --name-only` de los commits de fase = solo `scripts/setup-landing.ts` + `SKILL.md`). El camino `--publish` del operador replica el mismo invariante: `landingWriteColumns(config, true)` devuelve el MISMO objeto en las dos claves (`toBe`, tests líneas 340-350), evitando que el botón "Publicar" del dueño revierta la web recién publicada (D-03b, incidente `f98ed6b`). Suite completa 553/553 verde — cero regresión detectada en `test/landing-write.test.ts` / `test/landing-editor-draft.test.ts` (los guardianes de Phase 15). |
| SC3 | `--inspect` muestra borrador y publicado por separado, de modo que el operador sabe qué está al aire y qué quedó pendiente de aprobación. | ✓ VERIFIED (code) | `runInspect` (`scripts/setup-landing.ts:305-390`) vuelca `al_aire` (= `landing_config` crudo) y `pendiente_de_aprobacion` (= `landing_draft` crudo) como claves separadas, más `nunca_publico`, `tiene_cambios_sin_publicar`, `partes_sin_publicar`, `publicado_roto`, `borrador_roto`. Sigue read-only: cero `.update(`/`.upload(` en `runInspect`. Runtime confirmation contra un negocio real queda para UAT (ver Human Verification #1). |

### Observable Truths (PLAN must_haves, code-level)

| # | Truth (plan) | Status | Evidence |
|---|-------|--------|----------|
| 1 (16-01) | `diffConfigParts(a,b)` dice EXACTAMENTE qué partes difieren, inmune al reordenamiento de claves del jsonb. | ✓ VERIFIED | `lib/landing/editor-draft.ts:330-355`, exportada, usa `canonical` privada + `normalizeSections` en ambos lados. 12 tests en `test/landing-editor-draft.test.ts` incluyendo reorden de claves y anti-falso-positivo 5-vs-8-secciones. |
| 2 (16-01) | `publish=false` → payload de UPDATE con SOLO `landing_draft`, nunca `landing_config`. | ✓ VERIFIED | `lib/landing/write.ts:133-141` + test `'landing_config' in r === false`. |
| 3 (16-01) | `publish=true` → las DOS columnas con el MISMO objeto (identidad). | ✓ VERIFIED | Test `toBe` en `landing-write.test.ts:340-350`. |
| 4 (16-02) | Script sin flags NO toca `/[slug]`: solo escribe `landing_draft`. | ✓ VERIFIED | Ver SC1. |
| 5 (16-02) | Script con `--publish` sale al aire: dos columnas, mismo objeto validado. | ✓ VERIFIED | `runWrite` paso 10, `landingWriteColumns(parsed.data, publish)`; `hasFlag('publish')` es opt-in por token exacto (`scripts/setup-landing.ts:98-100,778-779`). |
| 6 (16-02) | Aviso de choque pre-escritura: avisa, no aborta. | ✓ VERIFIED (lectura de código) | `runWrite` paso 3 (`scripts/setup-landing.ts:559-560`): `if (aviso) console.log(aviso)` sin `process.exitCode`, el flujo continúa a los pasos 4-10. `avisoDeChoque` centralizada, 4 formas (borrador roto / publicado roto / nunca publicó / partes que difieren), compartida por `--inspect` y `runWrite`. |
| 7 (16-02) | Config inválido ABORTA (invalid_config/config_too_large), no degrada a `{}`. | ✓ VERIFIED | Gate `parseLandingConfigForWrite` (`lib/landing/write.ts:71-105`, reject-on-invalid, variantes `Strict` sin `.catch`) + PRE-GATE con placeholders antes de subir imágenes (`scripts/setup-landing.ts:576-592`) + gate real post-imágenes (`:640-647`), ambos con `process.exitCode=1; return` — cero UPDATE. |
| 8 (16-02) | `--inspect` distingue al aire vs pendiente. | ✓ VERIFIED | Ver SC3. |
| 9 (16-03) | El operador entiende, sin leer código, que la web nace como borrador. | ✓ VERIFIED | Guardrail no-negociable "La web NACE COMO BORRADOR" (`SKILL.md:384-387`), intro reformulada con el circuito operador→dueño→público (`SKILL.md:25-27`). |
| 10 (16-03) | MODO EDICIÓN reconstruye SIEMPRE desde el borrador, fallback a publicado solo si NULL. | ✓ VERIFIED | `SKILL.md:104-112`, regla dura explícita + POR QUÉ. Cero mención de `--from-published` (grep = 0). |
| 11 (16-03) | Checkpoint humano muestra el aviso de choque cuando aplica. | ✓ VERIFIED | `SKILL.md:268-282`, tabla de las 4 formas EXACTAS del aviso (copiadas verbatim del script — confirmado por comparación línea a línea contra `avisoDeChoque` en `scripts/setup-landing.ts:274-300`). |
| 12 (16-03) | El operador sabe que `--publish` existe y solo se usa con OK del dueño. | ✓ VERIFIED | Subsección propia `SKILL.md:334-345`, "Regla dura" + guardrail. |

**Score:** 12/12 truths verified a nivel de código y tests automatizados. 0 behavior-unverified (todas las truths de control de flujo se confirmaron leyendo el código fuente real, no solo grep). 3 ítems de runtime E2E (contra Supabase real) quedan en Human Verification porque los propios PLAN.md los marcaron explícitamente como `<human-check>` diferidos a UAT — no porque el código presente dudas.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/landing/editor-draft.ts` | `diffConfigParts` + `ConfigPart` exportados, `canonical` privada | ✓ VERIFIED | 2 exports nuevos confirmados por grep; `canonical` sigue sin exportar (grep = 0). |
| `lib/landing/write.ts` | `landingWriteColumns` exportada | ✓ VERIFIED | 1 export confirmado; comentario cita `f98ed6b`. |
| `scripts/setup-landing.ts` | write path draft-only + `--publish` + aviso + `--inspect` extendido | ✓ VERIFIED | Todos los símbolos presentes y wireados (ver tabla de truths). |
| `.claude/skills/forjo-web-builder/SKILL.md` | flujo alineado al contrato borrador/publicado | ✓ VERIFIED | 4 puntos reescritos + guardrail nuevo + triggers de activación intactos. |
| `test/landing-editor-draft.test.ts`, `test/landing-write.test.ts` | cobertura de las 2 funciones puras | ✓ VERIFIED | 100 tests pasando entre los dos archivos (`npx vitest run` confirmado localmente). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `scripts/setup-landing.ts` | `lib/landing/write.ts` | `parseLandingConfigForWrite` + `landingWriteColumns` | ✓ WIRED | Ambos importados y usados en `runWrite` (gate real + UPDATE). |
| `scripts/setup-landing.ts` | `lib/landing/editor-draft.ts` | `diffConfigParts` | ✓ WIRED | Usado dentro de `readLandingState`, consumido por `avisoDeChoque` y `--inspect`. |
| `scripts/setup-landing.ts` (`resolveBusiness`) | `businesses.landing_draft` | SELECT trae la columna | ✓ WIRED | `select(...)` incluye `landing_draft` (`scripts/setup-landing.ts:114-116`); cast del tipo la incluye. |
| `.claude/skills/forjo-web-builder/SKILL.md` (MODO EDICIÓN) | `scripts/setup-landing.ts --inspect` | lee `pendiente_de_aprobacion`, cae a `al_aire` solo si NULL | ✓ WIRED | Confirmado línea a línea, ver truth #10. |
| `.claude/skills/forjo-web-builder/SKILL.md` (paso 6) | aviso de choque del script | copy idéntico | ✓ WIRED | Confirmado línea a línea contra `avisoDeChoque` (post-fix WR-04). |
| `app/[slug]/page.tsx` | `businesses.landing_config` | SOLO lee la columna publicada, nunca `landing_draft` | ✓ WIRED | `grep landing_config\|landing_draft app/[slug]/page.tsx` → solo `landing_config` aparece (línea 47 select, línea 56 parse). Este es el enlace estructural que hace SC1/SC2 verdaderas en runtime. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite completa sin regresión | `npx vitest run` | 553/553 passed (37 archivos) | ✓ PASS |
| `diffConfigParts` + `landingWriteColumns` targeted | `npx vitest run test/landing-write.test.ts test/landing-editor-draft.test.ts` | 100/100 passed | ✓ PASS |
| Type-check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Lint de archivos tocados | `npx eslint scripts/setup-landing.ts lib/landing/write.ts lib/landing/editor-draft.ts` | 0 errores | ✓ PASS |
| Una sola escritura DB real (no confundir con `createHash().update()`) | `grep -n "\.update(" scripts/setup-landing.ts` | línea 468 es `createHash(...).update(buffer)` (hash, no DB); línea 705 es la única `.from('businesses').update(...)` | ✓ PASS (el acceptance criterion literal del plan — "exactamente 1 match de `\.update\(`" — cuenta 2 por el nuevo `createHash().update()` agregado en el fix WR-01; confirmado por lectura que solo hay UNA escritura real a la DB) |
| Cero deps nuevas | `git diff main package.json package-lock.json` | vacío | ✓ PASS |
| Cero markers de deuda sin resolver | grep `TBD\|FIXME\|XXX` en archivos tocados | 0 matches reales (2 falsos positivos: "TODO" como palabra española, no marcador) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| SKILL-07 | 16-01, 16-02, 16-03 | El script escribe el BORRADOR, no lo publicado | ✓ SATISFIED | `landingWriteColumns` default-draft-only + único call-site en `runWrite` + `--publish` opt-in explícito. |
| SKILL-08 | 16-02, 16-03 | El operador inspecciona borrador y publicado por separado | ✓ SATISFIED | `--inspect` con `al_aire`/`pendiente_de_aprobacion` + doc alineada. |

**Nota (no bloqueante):** `.planning/workstreams/web-builder/REQUIREMENTS.md` todavía tiene las casillas de SKILL-07/SKILL-08 sin marcar (`[ ]`) y la tabla de Traceability las lista como "Pending" (líneas 37-38, 68-69), aunque `ROADMAP.md` línea 65 ya marca la Phase 16 completa con fecha `2026-07-13`. Es un desfasaje de housekeeping documental — no afecta la evaluación funcional del código, que sí satisface ambos requisitos — pero debería corregirse en el próximo `docs-update` o al cerrar la fase para no arrastrar el checkbox desactualizado a Phase 17.

### Anti-Patterns Found

Ninguno bloqueante. Se revisaron los 4 archivos de código tocados (`scripts/setup-landing.ts`, `lib/landing/write.ts`, `lib/landing/editor-draft.ts`) más `SKILL.md`:
- Cero `TBD`/`FIXME`/`XXX`.
- Cero stubs (`return null`/`return {}` que no sea un caso de negocio legítimo).
- Cero handlers vacíos.
- El único hallazgo Critical + los 5 Warning del code-review de fase (`16-REVIEW.md`) fueron los 6 fixeados y confirmados en `16-REVIEW-FIX.md` — verificados presentes en el código actual (passthrough de URLs en `rehostImage`, key sha256, sharp aborta en vez de degradar, PRE-GATE antes de subir, distinción roto/ausente en `readLandingState`, las 4 formas del aviso documentadas en SKILL.md, mensaje "no hay borrador" corregido en `--inspect`).
- 3 hallazgos Info (`IN-01` aliasing de objeto, `IN-02` `getFlag` consume el token siguiente a ciegas, `IN-03` error de DB reportado como "slug no existe") quedaron explícitamente fuera de scope (`fix_scope: critical_warning`) y siguen abiertos — no son bloqueantes, todos degradan a un abort seguro sin pérdida de datos.

### Human Verification Required

Los 3 ítems abajo fueron marcados como `<human-check>` explícitamente en los PLAN.md de la fase (16-02 Task 2, 16-02 Task 3, 16-03 Task 2) y diferidos a UAT — no son dudas del verificador sobre el código, sino verificaciones de runtime contra una base de datos real que el propio diseño de la fase excluyó del gate automatizado.

#### 1. `--inspect` contra un negocio real

**Test:** Correr `npm run setup:landing -- --inspect <slug>` contra un negocio real (`.env.local` con service-role).
**Expected:** El JSON trae `al_aire` y `pendiente_de_aprobacion` por separado, y el renglón humano de abajo coincide con el estado real de la fila.
**Why human:** Requiere Supabase real y una fila `businesses` real; no ejecutable en el sandbox de verificación estática.

#### 2. Las 3 corridas de escritura contra un negocio real

**Test:** (a) sin `--publish` sobre un negocio ya publicado → `/[slug]` no cambia; (b) sin `--publish` sobre un negocio que nunca publicó → `/[slug]` sigue con la reserva simple; (c) con `--publish` → sale al aire y el editor del dueño abre en `✓ Publicado`.
**Expected:** SC1/SC2/SC3 del ROADMAP se confirman en runtime real.
**Why human:** Requiere Supabase real + navegar `/[slug]` y `/web` de un negocio de prueba. La garantía a nivel de código (tests unitarios + único call-site verificado) es fuerte, pero el propio plan la marcó como ítem de UAT.

#### 3. Lectura de coherencia de la SKILL.md como agente operador

**Test:** Leer `SKILL.md` de punta a punta como si fueras el agente operador que la va a ejecutar.
**Expected:** Ninguna instrucción residual lleva a publicar sin querer o a reconstruir desde lo publicado.
**Why human:** Revisión editorial deferida a UAT por el plan. El verificador ya hizo esta lectura y no encontró contradicciones (ver tabla de truths #9-#12), pero el plan la marcó explícitamente como ítem de UAT, no de gate automatizado.

### Gaps Summary

Ninguno a nivel de código. Los 6 hallazgos Critical/Warning del code-review de fase fueron corregidos y verificados en el código actual. La única discrepancia encontrada es documental (REQUIREMENTS.md sin actualizar los checkboxes de SKILL-07/08), no funcional. El status queda en `human_needed` únicamente porque el propio diseño de la fase (3 `<human-check>` en los PLAN.md) reserva la confirmación runtime contra Supabase real para el UAT de fin de fase — el código, los tests automatizados y el enlace estructural `/[slug]` → solo `landing_config` dan evidencia fuerte de que el goal se cumple, pero no reemplazan esa corrida real.

---

_Verified: 2026-07-13T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
