---
phase: 16-la-web-nace-como-borrador-skill-del-operador
plan: 02
subsystem: landing
tags: [landing, cms, draft, publish, script, service-role, operador]
requires:
  - lib/landing/write.ts (parseLandingConfigForWrite, landingWriteColumns — 16-01)
  - lib/landing/editor-draft.ts (diffConfigParts, ConfigPart — 16-01)
  - lib/landing/schema.ts (parseLandingConfig — validador fail-safe de LECTURA)
provides:
  - "scripts/setup-landing.ts: write path draft-only por defecto (SKILL-07)"
  - "--publish: flag booleano opt-in que escribe las dos columnas con el mismo objeto validado (D-03/D-03b)"
  - "--inspect: al_aire + pendiente_de_aprobacion + tiene_cambios_sin_publicar + partes_sin_publicar + nunca_publico (SKILL-08/D-05)"
  - "aviso de choque operador↔dueño pre-escritura (D-01/D-02)"
affects:
  - .claude/skills/forjo-web-builder/SKILL.md (plan 16-03 — documenta este contrato de CLI y el JSON de --inspect)
tech-stack:
  added: []
  patterns:
    - "Flag booleano por presencia de token exacto en argv (hasFlag) — getFlag() devuelve el argv siguiente y no sirve"
    - "Dos validadores OPUESTOS por dirección: fail-safe al LEER (parseLandingConfig), estricto al ESCRIBIR (parseLandingConfigForWrite)"
    - "La decisión de columnas NO vive inline en el script (no unit-testeable): la toma landingWriteColumns, que sí tiene tests"
key-files:
  created: []
  modified:
    - scripts/setup-landing.ts
decisions:
  - "El aviso de choque AVISA y NO ABORTA, y no se agregó ninguna confirmación interactiva al proceso Node: el checkpoint humano vive en el SKILL.md (paso 6) — cuando el proceso arranca, la escritura ya está aprobada. El repo no tiene una sola confirmación interactiva y no era el momento de inventar el patrón."
  - "readLandingState usa parseLandingConfig (fail-safe de lectura) a propósito: se está LEYENDO para comparar, y un config ya roto en la DB no debe tumbar el script — justo ahí es cuando el operador más necesita inspeccionar."
  - "Desviación declarada de D-01: la señal es diffConfigParts(draft, published).length > 0, no configsEqual crudo. Misma intención, mejor mecanismo (ver más abajo)."
  - "El mensaje de cierre por defecto NO imprime una URL de /<slug>: por defecto no hay nada nuevo que ver ahí (la web al aire, si la hay, es la VIEJA). El preview compartible por link está Out of Scope."
metrics:
  duration: ~25 min
  completed: 2026-07-13
  tasks: 3
  commits: 3
  tests_added: 0
  tests_total: 505 passed / 48 skipped
status: complete
---

# Phase 16 Plan 02: El script del operador escribe el borrador — Summary

`scripts/setup-landing.ts` dejó de publicar: por defecto escribe **solo** `landing_draft` (la web nace esperando la aprobación del dueño), `--publish` es opt-in explícito, el gate pasó al validador estricto de escritura, y el script avisa antes de pisar el trabajo sin publicar del dueño.

## Qué se construyó

### El script LEE el borrador (Task 1)

Hasta hoy `scripts/setup-landing.ts` escribía `landing_draft` **a ciegas y nunca la leía** — de ahí salían el aviso de choque imposible (D-01) y el `--inspect` incompleto (D-05). Tres piezas de plomería, todas de lectura:

- **`hasFlag(name)`** — flag booleano por presencia del token exacto en `argv`. `getFlag('publish')` no servía: devuelve el argv *siguiente*, así que `--publish --slug x` daría `'--slug'` (truthy por accidente) y `--publish` suelto al final daría `undefined` (falsy justo cuando el operador SÍ lo pidió).
- **`resolveBusiness` trae `landing_draft`** (`select` + cast). Único punto a tocar: `runInspect` y `runWrite` comparten el helper.
- **`readLandingState(biz)`** — deriva de las dos columnas crudas: `published` / `draft` / `nuncaPublico` / `borradorSinComparar` / `partes` / `tieneCambiosSinPublicar`. Es el motor del aviso de choque **y** del flag de `--inspect`: una sola fuente de verdad para los dos.
- **`formatPart(p)`** — `theme → tema`, `motion → movimiento`, secciones tal cual. Presentación: vive en el script, no en el módulo puro.

### `--inspect` muestra las DOS columnas (Task 2 — SKILL-08 / D-05)

La clave `landing_config` del `resumen` se reemplazó por cinco:

| Clave | Qué es |
|---|---|
| `al_aire` | `landing_config` crudo — lo que ve **cualquier visitante** en `/[slug]` ahora |
| `pendiente_de_aprobacion` | `landing_draft` crudo — lo que ve el **dueño** en su editor y NO salió al aire |
| `nunca_publico` | `true` → `/[slug]` todavía muestra la página de reservas simple |
| `tiene_cambios_sin_publicar` | el flag que dispara el aviso de D-01/D-02 |
| `partes_sin_publicar` | `string[]` ya pasado por `formatPart` (`["hero","gallery"]`) |

Se vuelcan los valores **crudos de la fila**, no los parseados: el operador tiene que ver lo que realmente hay en la DB, no una versión degradada por el validador fail-safe. Debajo del JSON va un renglón humano con los 4 casos (cambios sin publicar / borrador sin comparar / coinciden / no tiene web). Sigue **read-only**: cero `.update(`, cero `.upload(`.

El comentario que decía que re-correr la escritura *sobre-escribe* el config fue **reescrito** al contrato nuevo, no borrado.

### El write path escribe el borrador (Task 3 — SKILL-07 / D-01 / D-02 / D-03 / D-03b)

`runWrite(supabase, slug, configPath, publish)`. Orden final: resolver id → leer estado → **aviso de choque** → re-hostear imágenes → armar config → **gate estricto** → **pre-print de `--publish`** → UPDATE → cierre bifurcado.

- **Aviso de choque**, antes de subir **una sola imagen**: si el dueño tiene cambios sin publicar, imprime qué secciones difieren. **Avisa, no aborta** — y no se agregó ninguna confirmación interactiva al proceso Node (ver Decisiones).
- **Gate estricto**: `parseLandingConfig` (fail-safe de LECTURA, que degrada un `data` de sección inválido a `{}` **en silencio**) → `parseLandingConfigForWrite` (reject-on-invalid: `invalid_config` / `config_too_large`, `data` validado por tipo de sección, allowlist de protocolo en todas las URLs, tope de 256 KB). Config inválido → `process.exitCode = 1` y **cero UPDATE**. Es la clase de bug que cerró T-15-16, en el único write path que quedaba afuera.
- **UPDATE único**: `.update(landingWriteColumns(parsed.data, publish)).eq('id', businessId)`. Con `publish=false` la clave `landing_config` **ni existe** en el payload → la web al aire queda intacta. La decisión de columnas no se re-implementó inline: la toma el módulo puro de 16-01, que sí tiene tests.
- **Pre-print de `--publish`**: si nunca publicó, lo nombra como **GO-LIVE**; si ya hay web al aire, imprime sus secciones activas + `theme.preset` / `overrides.palette` — qué se está por reemplazar.
- **Cierre bifurcado**: por defecto, `✓ Borrador actualizado… NO se tocó lo publicado` + el comando exacto para publicar *solo si el dueño dio el OK*, **sin URL de preview** (no hay nada nuevo que ver en `/<slug>`). Con `--publish`, la URL de `/<slug>` como hoy.
- **El comentario de `f98ed6b` fue REEMPLAZADO, no borrado**: conserva el incidente real (escribir solo `landing_config` dejaba el borrador del dueño desincronizado con la web VIEJA y su botón "Publicar" **revertía** la web recién armada — pérdida de datos silenciosa, sin historial ni undo), explica que **sigue vigente en el camino `--publish`** (razón de D-03b) y agrega la bifurcación nueva y por qué el default cambió respecto de Phase 15.
- **Cabecera del archivo** actualizada (los dos modos + el `USO` con las tres formas del comando). El párrafo de **por qué es un script local y NO un endpoint web** (D10-01 / SKILL-04) se conservó **intacto**: es un invariante.

## Tareas y commits

| Task | Nombre | Commit |
|------|--------|--------|
| 1 | El script LEE el borrador — `hasFlag`, `landing_draft`, `readLandingState`, `formatPart` | `2d3f2a9` |
| 2 | `--inspect` vuelca `al_aire` y `pendiente_de_aprobacion` por separado | `8c1a372` |
| 3 | Write path: gate estricto, aviso de choque y `--publish` opt-in | `cb60220` |

## Verificación

```
npx tsc --noEmit                                      → 0
npm test                                              → 505 passed | 48 skipped — 0 regresiones
npx eslint scripts/setup-landing.ts                   → 0 problemas

rg -c "\.update\(" scripts/setup-landing.ts           → 1   (una sola escritura en todo el script)
rg -n  "\.update\("                                   → .update(landingWriteColumns(parsed.data, publish))
rg -c "\.eq\('id', businessId\)"                      → 1   (nunca por slug — Pitfall 6 / T-10-07)
rg -c "hasFlag\('publish'\)"                          → 1
rg -c "parseLandingConfigForWrite"                    → 5
rg -c "landingWriteColumns"                           → 3
rg -c "diffConfigParts"                               → 3
rg -c "El dueño tiene cambios sin publicar"           → 2   (inspect + write)
rg -c "node:readline|inquirer"                        → 0   (cero confirmación interactiva)
rg -c "al_aire|pendiente_de_aprobacion|nunca_publico|tiene_cambios_sin_publicar|partes_sin_publicar" → las 5 claves presentes

git diff --name-only (3 commits)                      → solo scripts/setup-landing.ts
git diff package.json package-lock.json               → vacío (cero deps npm nuevas)
```

Cero archivos nuevos, cero migraciones, cero endpoints, cero superficie web.

**Verificación de operador (va al UAT de fin de fase, `/gsd:verify-work 16` — requiere `.env.local` con service-role y un negocio real):** las 5 corridas del `<verification>` del plan (negocio publicado sin `--publish` → su `/[slug]` no cambia; el dueño publica desde su editor; `--inspect` distingue al aire vs pendiente; el aviso lista las partes correctas; `--publish` sobre un negocio nuevo = GO-LIVE y el editor abre en `✓ Publicado`).

## Deviations from Plan

### 1. [Declarada en el plan] La señal de D-01 es `diffConfigParts`, no `configsEqual` crudo

Ya venía declarada por el plan y por 16-01; queda registrada acá y **escrita en el comentario de `readLandingState`**, para que nadie la "simplifique" de vuelta. D-01 dice textual *"detecta si `landing_draft` ≠ `landing_config` con `configsEqual`"*. La intención se cumple al pie de la letra; el mecanismo es `diffConfigParts(draft, published).length > 0` = `configsEqual` **por parte** + normalización previa de ambos lados. Por qué no es opcional: `buildLandingConfig` omite las secciones vacías (~5) y el editor del dueño las materializa a las 8 al guardar → con `configsEqual` crudo, un dueño que solo abrió el editor y guardó **sin cambiar nada visible** dispararía el aviso. Un aviso que grita en el caso limpio es un aviso que el operador aprende a ignorar. Y D-02 pide **qué** partes difieren, que un booleano no da.

### 2. Comentarios reformulados para no envenenar las assertions de fuente

Dos comentarios que escribí mencionaban literalmente `hasFlag('publish')` y los nombres de las libs de prompt descartadas (`readline`/`inquirer`). Eso hacía que los `rg -c` del `<verification>` contaran **2** llamadas al flag y **1** import de confirmación interactiva donde en realidad hay 1 y 0. Reformulé los dos comentarios preservando el significado. Sin cambio de comportamiento.

## Deferred Issues

**`npm run lint` (repo completo) sale con exit 1 — PREEXISTENTE, fuera de alcance.** 48 problemas (36 errores, 12 warnings) en archivos que este plan **no toca**: `app/(dashboard)/*`, `app/(crm)/*`, `design_handoff_forjo_rebrand/preview/app.js`, `lib/clients-import.ts`, `.claude/skills/instagram-a-web/*.js`. Es exactamente el mismo recuento que documentó el 16-01-SUMMARY antes de este plan: **cero regresión**. `scripts/setup-landing.ts` pasa `eslint` limpio (0 problemas). El acceptance criterion "`npm run lint` exit 0" no se puede cumplir sin tocar ~20 archivos ajenos al plan, lo que viola el scope boundary del ejecutor. Queda anotado para un `/gsd:quick` de limpieza de lint aparte.

## Threat Mitigations (del `<threat_model>` del plan)

| Threat | Estado | Cómo |
|--------|--------|------|
| T-16-01 (el script pisa lo publicado) | mitigado | Una **sola** `.update(` en todo el script, y su argumento es `landingWriteColumns(parsed.data, publish)`. Con `publish=false` la clave `landing_config` no existe en el payload (unit-testeado en 16-01). |
| T-16-02 (pérdida silenciosa del trabajo del dueño) | mitigado | `readLandingState` + `diffConfigParts` corren **antes de subir una sola imagen**; el script imprime qué partes difieren. El operador decide en el checkpoint humano del SKILL.md. |
| T-16-03 (config hostil/inválido persistido) | mitigado | Gate = `parseLandingConfigForWrite` (reject-on-invalid). `invalid_config` / `config_too_large` → `exitCode = 1` y **cero UPDATE**. |
| T-16-04 (operador → producción) | mitigado | `--publish` opt-in por token exacto (`hasFlag`); pre-print de qué web se reemplaza (o GO-LIVE). |
| T-16-05 (service-role) | mitigado / **no debilitado** | Sigue siendo un script local en Node, fuera del runtime web. Cero endpoints, cero Server Actions. UPDATE por `.eq('id', businessId)`, nunca por slug. El párrafo de cabecera que declara el invariante se conservó intacto. |
| T-16-06 (disclosure en la terminal de `--inspect`) | accept (del plan) | El config nunca contiene campos sensibles; el `select` no trae ninguna columna de secretos. Sin cambios respecto de lo aceptado en el plan. |
| T-16-07 (DoS auto-infligido por config gigante) | mitigado | `MAX_CONFIG_BYTES = 256 KB` dentro del gate estricto: un payload inflado rebota con `config_too_large` en vez de persistirse. |
| T-16-SC (supply chain) | mitigado | **Cero `npm install`.** `git diff package.json package-lock.json` vacío. `hasFlag` son 3 líneas de `argv`; el prompt interactivo se descartó explícitamente. |

## Threat Flags

Ninguno. El plan no introduce endpoints, rutas de auth, acceso a archivos nuevo ni cambios de schema. El único acceso a Storage (`rehostImage`) no se tocó.

## Known Stubs

Ninguno.

## Notas para 16-03 (SKILL.md)

- El contrato de CLI final son **tres** formas: `--inspect <slug>` (read-only) · `--slug --config` (escribe el **BORRADOR**) · `--slug --config --publish` (borrador + **AL AIRE**).
- El JSON de `--inspect` ya no tiene la clave `landing_config`: el modo edición (D-04) debe leer **`pendiente_de_aprobacion`** y caer a **`al_aire`** solo si el borrador es `null`.
- El **checkpoint humano del paso 6 del SKILL.md es el único gate**: el script imprime el aviso de choque pero **no bloquea**. Si el SKILL.md no cuelga el aviso de ese checkpoint, D-01 queda a medias.
- El script ya imprime, en el camino por defecto, el comando exacto con `--publish` para publicar *solo si el dueño dio el OK*. El SKILL.md debería usar ese mismo copy.

## Self-Check: PASSED

- `scripts/setup-landing.ts` — FOUND (modificado; único archivo del plan)
- Commits `2d3f2a9`, `8c1a372`, `cb60220` — FOUND en `git log`
- Cero archivos borrados en los 3 commits (`git diff --diff-filter=D HEAD~3 HEAD` vacío)
</content>
</invoke>
