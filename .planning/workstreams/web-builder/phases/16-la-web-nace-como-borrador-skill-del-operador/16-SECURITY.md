---
phase: 16
slug: la-web-nace-como-borrador-skill-del-operador
status: verified
threats_open: 0
asvs_level: 2
created: 2026-07-14
---

# Phase 16 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Verified against code AS-IS at HEAD (post code-review-fix `9b919af..35bdc14`), not SUMMARY claims.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| máquina del operador (Node, service-role) → fila `businesses` | El script `scripts/setup-landing.ts` bypassa RLS por diseño. La única frontera es el checkpoint humano del SKILL.md. Invariante v0.10 (D10-01 / SKILL-04): NO se mueve a un endpoint web, NO se le agrega auth. | `landing_config` / `landing_draft` (jsonb: copy, URLs públicas de Storage, tema) |
| operador (`--publish`) → público (`/[slug]`) | Escribir `landing_config` pone contenido delante de TODO visitante sin deploy (`force-dynamic`). Camino directo operador → producción. | config del landing publicado |
| editor del dueño (`landing_draft`) ↔ script del operador (`landing_draft`) | Dos escritores sobre la misma columna. Riesgo de pisar el trabajo sin publicar del dueño en silencio (CR-01 con roles invertidos). | borrador del landing |
| payload JSON del operador → `businesses.landing_config` (jsonb) | El `data` de cada sección viaja al render y a cualquier sink futuro. Un `javascript:` en `map_url` no puede llegar a la DB (gate estricto). | payload de secciones + URLs |
| SKILL.md → agente operador (Claude Code) | La doc ES el flujo ejecutable. Una instrucción desactualizada acá es un bug de producto ejecutado por un agente con service-role. | instrucciones de flujo |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-16-01 | Tampering | `lib/landing/write.ts` → `landingWriteColumns` (capa pura) | mitigate | Default `publish=false` retorna `{ landing_draft }` sin la clave `landing_config` (`write.ts:140`). Unit-testeado: `Object.keys === ['landing_draft']` y `'landing_config' in r === false` (`test/landing-write.test.ts:323,330`). | closed |
| T-16-01 | Tampering | `scripts/setup-landing.ts` → `runWrite` `.update()` (capa script) | mitigate | Única escritura DB: `.update(landingWriteColumns(parsed.data, publish)).eq('id', businessId)` (`setup-landing.ts:703-706`). La otra `.update(` (`:468`) es `createHash().update(buffer)`, no una escritura DB. Con `publish=false` la clave `landing_config` no viaja → web al aire intacta. | closed |
| T-16-02 | Tampering (pérdida silenciosa) | `lib/landing/editor-draft.ts` → `diffConfigParts` (capa pura) | mitigate | Compare canónico vía `canonical` PRIVADA (`editor-draft.ts:214,344,348`); `canonical` no se exporta. Inmune al reordenamiento de claves del jsonb. Tests presentes (`test/landing-editor-draft.test.ts`, 15 refs a `diffConfigParts`). | closed |
| T-16-02 | Tampering (pérdida silenciosa) | `scripts/setup-landing.ts` → aviso de choque | mitigate | `readLandingState(biz)` (`:544`) corre en el paso 2, ANTES de subir imágenes; `avisoDeChoque` imprime qué partes difieren (`:559-560`). Avisa, no aborta. Distingue "presente pero roto" de "ausente" y avisa ante duda (`readLandingState:190-228`). | closed |
| T-16-03 | Tampering (falso positivo) | `lib/landing/editor-draft.ts` → `diffConfigParts` | mitigate | `normalizeSections` sobre AMBOS lados antes de comparar (`editor-draft.ts:331-332`): la materialización 5→8 secciones no cuenta como cambio del dueño. Test anti-falso-positivo presente. | closed |
| T-16-03 | Tampering (config inválido persistido) | `scripts/setup-landing.ts` → GATE de `runWrite` | mitigate | Gate estricto `parseLandingConfigForWrite` (`:640`); `!parsed.ok` → `console.error` + `process.exitCode=1` + `return` sin UPDATE (`:641-647`). PRE-GATE con placeholders antes de subir a Storage (`:582-592`). `data` por tipo (variantes `Strict`, sin `.catch`), allowlist de protocolo. | closed |
| T-16-04 | Tampering (invariante del editor) | `lib/landing/write.ts` → `landingWriteColumns(cfg,true)` | mitigate | `publish=true` retorna el MISMO objeto en las dos claves (`write.ts:139`). Unit-testeado con `toBe`: `r.landing_config === r.landing_draft` (`test/landing-write.test.ts:348-350`). Post-`--publish` `deriveEditorState` muestra `✓ Publicado`. | closed |
| T-16-04 | Elevation of Privilege (operador → producción) | `scripts/setup-landing.ts` → flag `--publish` | mitigate | `hasFlag('publish')` = token exacto en argv (`:98-100,779`), opt-in, nunca inferido. Pre-print de qué web se reemplaza / GO-LIVE antes del UPDATE (`:649-677`). | closed |
| T-16-04b | Elevation of Privilege (operador → producción) | `.claude/skills/forjo-web-builder/SKILL.md` § paso 7 | mitigate | `--publish` en sub-sección propia con regla dura "solo con el OK explícito del dueño" (`SKILL.md:334-345`), reforzada en el guardrail "La web NACE COMO BORRADOR" (`:384-387`). | closed |
| T-16-05 | Elevation of Privilege (service-role) | `scripts/setup-landing.ts` → `createClient(serviceKey)` | mitigate | Script local en Node fuera del runtime web (sin `'use server'`); UPDATE por `.eq('id', businessId)`, nunca por slug (`:706`). Cero endpoints/rutas/migraciones nuevos en el rango de la fase (verificado con `git diff --name-only`). Cabecera-invariante intacta (`:1-8`). | closed |
| T-16-06 | Information Disclosure | `scripts/setup-landing.ts` → salida de `--inspect` | accept | Ver Accepted Risks Log (R-16-01). El `select` no trae columnas de secretos (`:114-116`); el config nunca contiene campos sensibles (guardrail SKILL.md `:378`). Riesgo bajo, contenido en la máquina del operador. | closed |
| T-16-07 | Denial of Service (auto-infligido) | `lib/landing/write.ts` → `MAX_CONFIG_BYTES` | mitigate | `MAX_CONFIG_BYTES = 256*1024` aplicado en `parseLandingConfigForWrite` sobre el config normalizado (`write.ts:67,100-102`). Payload gigante rebota con `config_too_large`. | closed |
| T-16-02b | Tampering (pérdida silenciosa, puerta de atrás) | `.claude/skills/forjo-web-builder/SKILL.md` § MODO EDICIÓN | mitigate | Reconstruye SIEMPRE desde `pendiente_de_aprobacion`, fallback a `al_aire` solo si es `null` (`SKILL.md:104-106`). `from-published` = 0 ocurrencias (D-04b descartado, verificado). | closed |
| T-16-08 | Tampering (checkpoint degradado) | `.claude/skills/forjo-web-builder/SKILL.md` § paso 6 | mitigate | Aviso de choque colgado del checkpoint bloqueante, con las 4 formas del copy espejando `avisoDeChoque` del script (`SKILL.md:268-282`); "el checkpoint vive ACÁ, no en el script" (`:288-291`). También en el checkpoint acotado del MODO EDICIÓN (`:129-138`). | closed |
| T-16-09 | Spoofing / Repudiation (falsa expectativa) | `.claude/skills/forjo-web-builder/SKILL.md` § frontmatter + intro + paso 8 | mitigate | El `description` ya no promete "preview viva en `/[slug]`" → "COMO BORRADOR … esperando la aprobación del dueño" (`:3-8`). OUTPUT bifurcado: por defecto sin URL pública, explícito "No inventes un link de preview" (`:347-363`). | closed |
| T-16-10 | Denial of Service (skill rota) | `.claude/skills/forjo-web-builder/SKILL.md` § frontmatter | mitigate | Los 5 triggers de activación conservados verbatim (`:9-12`; grep de los 5 = presentes). Frontmatter YAML válido (`name` + `description`). | closed |
| T-16-11 | Information Disclosure | `.claude/skills/forjo-web-builder/SKILL.md` § guardrails | mitigate | "NUNCA campos sensibles en el config ni en la vista `public_businesses`" (`:378`) y "Re-host OBLIGATORIO de imágenes … nunca … CDN de IG" (`:379-380`) intactos. | closed |
| T-16-SC | Tampering (supply chain) | npm installs | mitigate | Cero paquetes nuevos en toda la fase. `package.json` / `package-lock.json` NO tocados en el rango `6147b92~1..HEAD` (verificado). El cambio `randomUUID`→`createHash` es intra-`node:crypto`. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Code-Review-Fix Verification (`9b919af..35bdc14`)

Se auditó cada una de las 6 correcciones del code-review contra la instrucción "si un fix DEBILITÓ una mitigación, escalar". Ninguna debilita una mitigación declarada; todas la refuerzan o son neutrales:

| Fix | Efecto sobre las mitigaciones |
|-----|-------------------------------|
| CR-01 (passthrough de URLs ya hosteadas en `rehostImage`) | NO debilita T-16-11: acota al prefijo del bucket propio (`setup-landing.ts:416-426`); una URL del CDN de IG SIGUE siendo rechazada con error explícito. Refuerza el MODO EDICIÓN (T-16-02b ejecutable). |
| WR-01 (key de Storage = sha256 del contenido + upsert) | Refuerza T-16-02: la re-escritura idempotente deja de envenenar el aviso de choque con diffs espurios por URLs. |
| WR-02 (sharp que falla ABORTA + PRE-GATE antes de subir) | Refuerza T-16-03: elimina el path que subía bytes arbitrarios a un bucket público y gatea antes de tocar Storage. |
| WR-03 (columna "presente pero rota" ≠ "ausente" → avisa) | Refuerza T-16-02: un borrador roto ya no se pisa sin aviso. |
| WR-04 (SKILL.md documenta las 4 formas del aviso) | Refuerza T-16-08: el checkpoint humano ya no queda con lista vacía. |
| WR-05 (`--inspect` correcto cuando no hay borrador) | Refuerza T-16-09: deja de afirmar "coinciden" sobre un estado que no existe. |

Sin hallazgos de debilitamiento → no procede ESCALATE.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-16-01 | T-16-06 | La salida de `--inspect` vuelca `al_aire` (`landing_config`) y `pendiente_de_aprobacion` (`landing_draft`) en la terminal: copy, URLs públicas de Storage y tema. El `select` de `resolveBusiness` (`setup-landing.ts:114-116`) NO trae ninguna columna de secretos (sin refresh tokens de Google, sin tokens de MP). El config nunca contiene campos sensibles (guardrail de la SKILL.md, `:378`). Es información no sensible y queda contenida en la máquina del operador (frontera de confianza de la fase). Riesgo residual: bajo. | plan `<threat_model>` 16-02 (disposición `accept`) | 2026-07-14 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-14 | 18 | 18 | 0 | gsd-security-auditor (Claude) |

*17 `mitigate` verificados en código + 1 `accept` documentado (R-16-01). Register contado por fila declarada en los 3 `<threat_model>` (T-16-01..04 verificados en dos capas: función pura + script).*

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-14
