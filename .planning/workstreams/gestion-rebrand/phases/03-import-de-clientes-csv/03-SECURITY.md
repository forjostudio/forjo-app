---
phase: 03
slug: import-de-clientes-csv
status: secured
threats_open: 0
threats_total: 13
threats_closed: 13
asvs_level: 1
created: 2026-07-06
---

# SECURITY.md — Phase 03: Import de clientes CSV (workstream gestion-rebrand)

**Auditor:** gsd-security-auditor
**Fecha:** 2026-07-06
**ASVS Level:** 1
**block_on:** high
**Disposición:** SECURED — 13/13 amenazas cerradas (12 mitigate + 1 accept)

Este documento verifica que cada mitigación declarada en el `<threat_model>` de los 3 PLAN.md
(03-01/02/03) exista efectivamente en el código implementado. Evidencia = grep/lectura del
código, no la palabra del ejecutor. Los archivos de implementación son READ-ONLY para este audit.

---

## Verificación de amenazas — mitigate

| Threat ID | Categoría | Componente | Evidencia (archivo:línea) |
|-----------|-----------|------------|---------------------------|
| T-03-01 | Tampering | `unescapeFormulaGuard` (des-escapado del prefijo `'`) | `lib/clients-import.ts:61-63` — `v.startsWith("'") && /^[=+\-@\t\r]/.test(v.slice(1))`. Conjunto de caracteres IDÉNTICO al `esc()` del export (`app/api/export/clients/route.ts:59` → `/^[=+\-@\t\r]/`) → acoplado, round-trip lossless. O'Brien no se toca (el char siguiente no matchea). |
| T-03-02 | Tampering | Header rígido del CSV | `lib/clients-import.ts:47-55` `CANONICAL_HEADER` + `:100-101` `validHeader = CANONICAL_HEADER.every(...)` → si falta una obligatoria, `rows:[]`. Handlers responden `invalid_header` 400: `preview/route.ts:66-68`, `confirm/route.ts:62-64`. La recuperación de colapso Excel (`:93-98`) re-parsea pero sigue validando `CANONICAL_HEADER.every` → no relaja el header. |
| T-03-03 | Spoofing/EoP | Test de insert (falso-verde) | `test/clients-import.test.ts` usa `ownerAnon` (anon-key autenticado como dueño) con guard anti-falso-verde (molde `test/manual-client.test.ts`); jamás service-role para las aserciones de escritura. 20/20 verde en aislamiento (verify del plan 03-01). |
| T-03-04 | EoP/Tampering | Insert del confirm (tenant) | `confirm/route.ts:32-37` negocio por `.eq('owner_id', user.id)`; `buildClientInsert` fija `business_id: business.id` (`lib/clients-create.ts:61`). El `form.get('file')` es lo ÚNICO que se lee del multipart — business_id/origin NUNCA del CSV/body. anon+RLS (`@/lib/supabase/server`) + `with check` = defensa en profundidad. |
| T-03-05 | DoS | Upload gigante | `preview/route.ts:20,56-58` y `confirm/route.ts:18,52-54` — `MAX_BYTES = 2*1024*1024`; `file.size > MAX_BYTES` → 413 ANTES de `file.text()`/parseo. |
| T-03-06 | DoS | Expansión por filas | `preview/route.ts:21,71-73` y `confirm/route.ts:19,65-67` — `MAX_ROWS = 2000`; `rows.length > MAX_ROWS` → 400 `too_many_rows` antes de dedup/insert. |
| T-03-07 | Tampering | Preview manipulada por el cliente | `confirm/route.ts:60-84` RE-PARSEA (`parseCsv`) + RE-CLASIFICA (`classifyRows`) el archivo crudo — no consume conteos ni filas de la preview. La UI re-postea el `File` retenido en state, no "las filas que vio" (`clients-client.tsx:343-345`). Preview no es autoritativa (no escribe). |
| T-03-08 | Tampering | Header/origen falso | Header rígido (ver T-03-02); la columna `origen` del CSV se ignora en `classifyRows` (nunca se lee `raw.origen`) y `origin='importado'` se fuerza server-side en `buildClientInsert(business, fila, 'importado')` (`confirm/route.ts:94-107`, `lib/clients-create.ts:57,69`). Extensión `.csv` validada antes de parsear (`preview:59-61` / `confirm:55-57`). |
| T-03-09 | DoS | CSV malformado / crash del parser | `try/catch` alrededor de `formData()` (`preview:45-49` / `confirm:41-45`); try/catch global en preview (`:24,103-108`) → JSON 500, no HTML. papaparse tolerante. Fallo de batch → contado en `fallidos`, no rompe el response (`confirm/route.ts:117-127`). |
| T-03-10 | InfoDisclosure/EoP | Uso de service-role | Grep en `app/api/import/**`: `admin`/`service-role`/`createAdminClient`/`SERVICE_ROLE` aparecen SOLO en comentarios; ambos handlers usan `createClient()` de `@/lib/supabase/server` (anon+RLS). `preview/route.ts:26`, `confirm/route.ts:23`. |
| T-03-11 | Tampering | Preview client-side como fuente de verdad | La UI valida `.csv`/≤2MB solo para UX (`clients-client.tsx` etapa upload); el confirm re-postea el File crudo → server re-valida (ver T-03-07). La UI nunca envía las filas de la preview al confirm. |
| T-03-12 | DoS | Doble submit del confirm | `clients-client.tsx:339-341` `onImportConfirm` retorna si `importStage === 'confirming'` + setea `confirming`; botón `disabled` durante confirming (`:1296`); cierre del Dialog bloqueado (`:277-278` `onImportOpenChange` ignora close si `confirming`). |
| T-03-13 | InfoDisclosure | Render de valores importados (fórmula) | `clients-client.tsx:1238-1240,1250-1251,1267` — `f.nombre`/`f.telefono`/`f.email`/errores se renderizan como children JSX → React escapa por default. Cero `dangerouslySetInnerHTML` en el archivo. Badge origen usa mapeo existente (`variant="secondary"`). |

---

## Accepted Risks Log — accept

| Threat ID | Categoría | Componente | Rationale (verificado) |
|-----------|-----------|------------|------------------------|
| T-03-SC | Tampering (supply-chain) | `npm install papaparse` | **ACEPTADO (D-05, aprobado por el usuario en discuss-phase).** Verificado en código: `package.json` pinea `papaparse@5.5.4` (dependency) y `@types/papaparse@5.5.2` (devDependency) SIN caret — evita saltos de major. `node_modules/papaparse/package.json` NO tiene scripts `postinstall`/`preinstall` (grep confirmado). Legitimidad: mholt/PapaParse, ~11.5M dl/sem. El flag `SUS` del seam es falso positivo `too-new` (documentado en 03-RESEARCH). Riesgo residual: bajo, aceptado por approval previo + pin exacto + ausencia de scripts de instalación. |

---

## Bug-fixes de la UAT (verificados como NO-debilitantes)

Los 3 fixes aplicados durante la UAT endurecen; ninguno rompe una mitigación:

- **(a) Recuperación de colapso Excel** (`lib/clients-import.ts:93-98`): re-parsea el CSV que Excel
  (locale ES/AR) colapsa a una columna, pero DESPUÉS sigue validando `CANONICAL_HEADER.every` →
  el header rígido (T-03-02/08) queda intacto.
- **(b) `isValidEmail`** (`lib/clients-create.ts:34-38,46`): `validateClientBody` ahora rechaza
  emails sin formato con el código `invalid_email` → validación por fila MÁS estricta, no más laxa.
  El label UI está mapeado con fallback (`clients-client.tsx:80,83`).
- **(c) `/preview` devuelve `filas`** (`preview/route.ts:99-100`): son las filas VÁLIDAS del propio
  CSV del dueño, derivadas server-side tras auth+tenant+dedup contra los clientes del propio negocio
  (sin cruce de tenant). El preview sigue SIN `.insert/.update/.delete` (SC-1 intacto), sigue
  anon+RLS, y el `try/catch` global (`:24,103-108`) protege el path multipart (refuerza T-03-09).

---

## Unregistered Flags

Ninguno. Los 3 SUMMARY.md no contienen una sección `## Threat Flags` (traen `## Threat Mitigations
Applied`, autorreporte del ejecutor, no aceptado como evidencia). No apareció superficie de ataque
nueva sin mapear: los únicos endpoints nuevos (`preview`/`confirm`) están cubiertos por T-03-04..10;
la dep nueva (papaparse) por T-03-SC; la UI por T-03-11..13.

---

## Resultado

**SECURED — 13/13 amenazas cerradas.** El flujo más sensible del milestone (import CSV) mantiene el
aislamiento por tenant (business_id de sesión, anon+RLS, cero service-role), la integridad del
round-trip anti-fórmula (des-escapado acoplado al export + render escapado por React), y las
defensas DoS (2MB/2000 filas antes de tocar la DB). Sin gaps. Apto para shipear.
