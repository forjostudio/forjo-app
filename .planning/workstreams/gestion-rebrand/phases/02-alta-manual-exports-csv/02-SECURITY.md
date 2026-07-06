---
phase: 02
slug: alta-manual-exports-csv
status: secured
threats_open: 0
threats_total: 14
threats_closed: 14
asvs_level: 1
created: 2026-07-06
---

# SECURITY.md — Fase 02: alta-manual-exports-csv

> **Nota post-secure (T-02-13, endurecido 2026-07-06):** el auditor cerró T-02-13 con el escaping
> RFC4180 declarado, pero observó (correctamente) que RFC4180 NO previene CSV formula injection.
> Se endureció en `fc482f4`: ambos exports ahora prefijan con `'` los campos que arrancan con
> `= + - @` (o tab/CR) — OWASP —, porque el CSV incluye datos de origen no confiable (ej. nombre de
> cliente de una reserva pública). Mitigación real, más allá de lo que el register exigía.

**Workstream:** gestion-rebrand
**ASVS Level:** 1
**block_on:** high
**Auditado:** 2026-07-06
**Resultado:** SECURED — 14/14 amenazas cerradas (11 mitigate + 3 accept)
**Register autorado en plan-time** (`register_authored_at_plan_time: true`)

Auditoría de verificación: cada mitigación declarada en los `<threat_model>` de 02-01/02/03-PLAN.md
se confirmó contra el código implementado (no contra la documentación). Los archivos de
implementación no se modificaron.

---

## Verificación de amenazas

### Plan 02-01 — migración 049 + type

| Threat ID | Categoría | Disposición | Evidencia |
|-----------|-----------|-------------|-----------|
| T-02-01 | Tampering | mitigate | `supabase/migrations/049_clients_origin.sql:34-35` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "origin"` aditivo; sin `DROP`/`ALTER` destructivo. grep confirma AUSENCIA de `CREATE POLICY` / `ENABLE ROW LEVEL SECURITY`: `clients` ya es RLS por `business_id`, la columna hereda el aislamiento. |
| T-02-02 | Elevation | mitigate | `02-01-PLAN.md:11` `autonomous: false` + `user_setup` (gate D-01); Task 3 = `checkpoint:human-verify gate="blocking-human"`. Cabecera de la migración (`049_...sql:28-30`) documenta: única validación autónoma = `supabase db reset` local, NUNCA `supabase db push`; staging/prod los aplica el usuario a mano. |
| T-02-03 | Tampering | accept | `049_clients_origin.sql:35` — `CHECK (origin IN ('reserva','manual','importado'))` rechaza valores inválidos a nivel DB; `DEFAULT 'reserva'` cubre inserts sin `origin`. Rationale confirmado contra el DDL (registrado abajo en Riesgos aceptados). |

### Plan 02-02 — alta manual

| Threat ID | Categoría | Disposición | Evidencia |
|-----------|-----------|-------------|-----------|
| T-02-04 | Spoofing | mitigate | `app/api/clients/create/route.ts:19-22` — `auth.getUser()` → sin `user` devuelve `401 unauthorized`. |
| T-02-05 | Tampering | mitigate | `route.ts:26-31` — `business` resuelto por `.eq('owner_id', user.id).single()`; `lib/clients-create.ts:47` fija `business_id: business.id`. El body nunca aporta `business_id`. Cliente anon+RLS (`route.ts:16` `createClient()` de `@/lib/supabase/server`). |
| T-02-06 | Tampering | mitigate | `lib/clients-create.ts:56` — `origin: 'manual'` fijado server-side dentro de `buildClientInsert`; el cliente no lo elige. Refuerzo en DB: CHECK de migr. 049. (Nota: `origin:'manual'` vive en `clients-create.ts`, no inline en el route — desviación documentada en 02-02-SUMMARY; el invariante se mantiene y está bajo test.) |
| T-02-07 | Elevation | mitigate | grep confirma AUSENCIA de `supabase/admin` / `createAdminClient` / `service_role` en `route.ts` y `lib/clients-create.ts`. Ambos usan anon+RLS. |
| T-02-08 | Information Disclosure | mitigate | `lib/clients-create.ts:46,53-55` — `insurance_*` solo se incluye en el insert si `resolveVertical(business).key === 'salud'`; en otros verticales se ignora aunque llegue en el body. `resolveVertical` expone `.key: VerticalKey` (`lib/verticals.ts:138,163`). |
| T-02-09 | Tampering | mitigate | `route.ts:34-39` — `try { await request.json() } catch { 400 bad_request }`; `lib/clients-create.ts:32-37` `validateClientBody` exige `name` + al menos un contacto → `missing_fields`. Narrowing defensivo por campo (`route.ts:41-46`). |

### Plan 02-03 — exports CSV

| Threat ID | Categoría | Disposición | Evidencia |
|-----------|-----------|-------------|-----------|
| T-02-10 | Spoofing | mitigate | `app/api/export/clients/route.ts:32-35` y `app/api/export/finances/route.ts:31-34` — ambos: `auth.getUser()` → sin `user` devuelve `401 unauthorized`. |
| T-02-11 | Information Disclosure | mitigate | Ambos endpoints re-derivan `business` por `.eq('owner_id', user.id).single()` (clientes `:39-44`, finanzas `:37-42`); toda query filtra `.eq('business_id', business.id)` (clientes `:47-51`; finanzas `:49,54,58`). Sin `business_id` de querystring. Anon+RLS como red de defensa. |
| T-02-12 | Elevation | mitigate | grep confirma AUSENCIA de `supabase/admin` / `service_role` en ambos route.ts. Ambos usan `createClient()` de `@/lib/supabase/server` (anon+RLS). |
| T-02-13 | Tampering | mitigate | Escaping RFC4180 en ambos: `esc = (v) => \`"${v.replace(/"/g,'""')}"\`` aplicado a TODOS los campos, header y body (clientes `:54,69,73`; finanzas `:99,103,106`). Cada campo va entre comillas dobles → Excel no interpreta `=`/`+`/`-`/`@` como fórmula. BOM UTF-8 (U+FEFF) emitido con la secuencia de escape TS `''`, NO el glifo pegado (clientes `route.ts:78`; finanzas `route.ts:111`), para acentos en Excel-AR. |
| T-02-14 | Information Disclosure | accept | `export/clients/route.ts:49,57` — el CSV incluye `insurance_*`, pero se filtra por `.eq('business_id', business.id)` del actor de la sesión: no cruza tenant, el dueño exporta sus propios clientes (dato ya visible en su panel). Rationale confirmado contra el código (registrado abajo). |

---

## Riesgos aceptados

- **T-02-03 (valor `origin` inválido)** — Aceptado. El `CHECK (origin IN ('reserva','manual','importado'))`
  de la migración 049 rechaza cualquier valor fuera de los tres permitidos a nivel de base de datos, y el
  `DEFAULT 'reserva'` cubre inserts que no especifican `origin`. No requiere validación adicional en app.
  El rationale se sostiene: el CHECK existe en el DDL implementado (`049_clients_origin.sql:35`).

- **T-02-14 (obra social en el CSV de clientes)** — Aceptado. El CSV de clientes incluye las columnas
  `obra_social` / `nro_obra_social`, pero lo descarga el propio dueño acotado a su negocio: la query
  filtra `.eq('business_id', business.id)` con el tenant re-derivado de la sesión (owner_id), y el dato ya
  es visible en el panel del dueño. No cruza a otro tenant. El rationale se sostiene: no hay `business_id`
  de querystring y la query está filtrada por el negocio del actor (`export/clients/route.ts:39-51`).

---

## Unregistered Flags

Ninguna. Los tres SUMMARY.md (02-01/02/03) no declaran sección `## Threat Flags`: no apareció superficie
de ataque nueva durante la implementación que no esté ya mapeada al register autorado en plan-time.

---

## Verificaciones ejecutadas

- `grep -rn "supabase/admin|createAdminClient|SERVICE_ROLE|service_role"` sobre los 3 endpoints +
  `lib/clients-create.ts` → NO MATCH (confirma T-02-07 y T-02-12 en todos los entry points).
- `grep "## Threat Flags"` sobre el directorio de la fase → No matches (sin flags sin registrar).
- `origin: 'reserva' | 'manual' | 'importado'` presente en `lib/types.ts:179`.
- `resolveVertical` devuelve `{ key: VerticalKey, ... }` (`lib/verticals.ts:137-138,163-169`) → el gate
  `.key === 'salud'` de `buildClientInsert` es válido.
