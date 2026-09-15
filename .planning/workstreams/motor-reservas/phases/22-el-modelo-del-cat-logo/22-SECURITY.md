---
phase: "22"
slug: "el-modelo-del-cat-logo"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-15"
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Esta es la **única fase del milestone v0.29 que abre una lectura nueva para un cliente anónimo**, y
la ROADMAP la declara `secure-phase` obligatorio. El registro se escribió en tiempo de planificación
(`register_authored_at_plan_time: true`, los cuatro planes traen `<threat_model>`) y se verificó
contra el Postgres local **en vivo** —interrogando `pg_class`, `pg_constraint`, `pg_policies` y
`information_schema`, y ejecutando escrituras anónimas reales— en vez de leer los `.sql`.

✅ **Alcance de la verificación: local en el momento de la auditoría — y la 078 se aplicó a
producción el mismo día (2026-09-15).** Los grants SELECT-only, la FK compuesta y la RLS que cierran
T-22-03/04/05/06/15/16/17 están ahora **efectivamente en prod**, no sólo escritos. La próxima
migración del repo es la **079**.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| `anon` (público sin sesión) → `public_service_categories` | el rol anónimo lee, de **cualquier** negocio, títulos de categoría escritos por el dueño, a través de una vista DEFINER | `id`, `business_id`, `name`, `sort_order` — títulos públicos por diseño, sin dato de cliente ni precio ni `created_at` |
| `anon` → `service_categories` (tabla base) | la tabla base no tiene policy `anon`; toda lectura o escritura anónima directa tiene que rebotar | ninguno (medido: 0 filas) |
| `anon` → `public_services` / `public_businesses` **redefinidas** | dos vistas que **ya están en producción** se reemplazan: sus permisos y su listado de columnas se vuelven a emitir | catálogo público de todos los tenants — la clase de CR-01 |
| dueño autenticado → `services.category_id` | escribe con anon key + RLS; el `category_id` lo pone el cliente y nada en la RLS valida a qué negocio pertenece | referencia cross-tenant potencial |
| `service_categories` (borrado) → `services` | borrar una categoría dispara una acción referencial sobre la tabla que contiene el catálogo vendible | `services.business_id` — si se nulea, el servicio deja de venderse en silencio |
| filas leídas por el anon → `groupCatalog` | la función pura recibe filas que llegaron por una lectura pública y no puede validar su origen | catálogo completo de un negocio |
| `name` de la categoría → `title` del grupo | texto escrito por el dueño que la Phase 24 va a renderizar para un visitante anónimo | texto libre del dueño |
| `supabase/schema.sql` → la próxima fase / el reviewer / el secure-phase | es el documento del que se lee "qué hay en la base" sin abrir las 78 migraciones | descripción del modelo — si miente, la próxima fase copia el molde equivocado |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-22-01 | Information Disclosure | `public_service_categories` legible por `anon` para todos los negocios | low | accept | Vista medida: expone exactamente `id, business_id, name, sort_order` — `created_at` queda afuera (`078:322-327`). Precedente ya aceptado: T-10-02 (059) y T-18-01 (071) | closed |
| T-22-02 | Information Disclosure (falla silenciosa) | la vista con `security_invoker` devolvería 0 filas a `anon` **siempre**, indistinguible de "este negocio no tiene categorías" | high | mitigate | `reloptions=(null)` + `owner=postgres` en las 3 vistas; control **positivo**: `SET LOCAL ROLE anon` → `filas_que_ve_el_anon=1` (`078:330`) | closed |
| T-22-03 | Elevation of Privilege | redefinir `public_services`/`public_businesses` re-emite permisos y **reabre CR-01**: vistas auto-actualizables y DEFINER ⇒ escritura anónima saltea la RLS y alcanza a todos los tenants | critical | mitigate | ACL crudo de `pg_class`: `anon=r/postgres`, `authenticated=r/postgres` en las **tres** (`078:336-340, 372-376, 412-416`). 5 escrituras anónimas reales (3 DELETE, 1 INSERT, 1 UPDATE) → las 5 `permission denied for view` | closed |
| T-22-04 | Tampering | un dueño autenticado apunta `services.category_id` a una categoría de **otro** negocio; la RLS sólo mira el `business_id` de la fila | high | mitigate | FK **compuesta** `services_category_same_tenant` medida rechazando el ajeno (`Key (category_id, business_id)=(…b, …b1) is not present`) + control positivo OK (`078:250-254`) | closed |
| T-22-05 | Denial of Service (pérdida de datos) | `ON DELETE SET NULL` **sin lista de columnas** nulea también `services.business_id` (nullable): el servicio sale de la RLS de su dueño y de `public_services` ⇒ **deja de venderse**, sin un solo error visible | critical | mitigate | `pg_get_constraintdef` → `… ON DELETE SET NULL (category_id)` (`078:254`) + medición **conductual** en transacción revertida: tras borrar la categoría → `existe=1`, `category_id_es_null=true`, `business_id=…b1` intacto, `visible_en_public_services=1` leído como rol `anon` | closed |
| T-22-06 | Elevation of Privilege | `anon` escribiendo `service_categories` — renombrar o reordenar los títulos del catálogo de cualquier negocio | high | mitigate | `relrowsecurity=true` + 4 policies por operación con predicado de tenant por `owner_id` (`078:158-187`). Medido: `anon` INSERT → `permission denied`; `authenticated` sin sesión → `violates row-level security policy`; `anon` SELECT sobre la tabla base → **0 filas** | closed |
| T-22-07 | Tampering (integridad del catálogo) | dos categorías con el mismo nombre en distinta capitalización dentro del mismo negocio dejarían dos títulos que el cliente lee como uno | medium | mitigate | `service_categories_name_uq … btree (business_id, lower(name))` (`078:197-198`); `'Color'` + `'COLOR'` → `duplicate key … Key (business_id, lower(name))=(…, color)` | closed |
| T-22-08 | Denial of Service (auto-infligido) | redefinir las dos vistas con un listado de columnas que no coincide rompe la redefinición, o saca una columna del camino de lectura pública y rompe el booking | medium | mitigate | `pg_get_viewdef`: `public_services` = 11 columnas viejas **en orden** + 2 al final, con `WHERE active = true` conservado; `public_businesses` = 22 + 2. Suite completa verde (1198 tests) | closed |
| T-22-09 | Denial of Service (auto-infligido) | aplicar la 078 a prod sin recargar el schema cache de PostgREST deja la vista nueva fuera de su cache | medium | mitigate | `NOTIFY pgrst, 'reload schema';` como última línea (`078:422`) + runbook en la cabecera (`078:96-135`). Fail-safe conocido: sin la vista la lectura devuelve vacío ⇒ el catálogo se ve **como hoy**, nunca vacío | closed |
| T-22-10 | Tampering (vector de inyección) | el `name` de la categoría es texto del dueño que termina renderizado para un visitante anónimo | medium | mitigate | La vista lo expone como `text` plano; `lib/service-categories.ts:275` propaga `title: c.name` como `string` y el módulo no construye marcado en ninguna línea. Restricción **heredada por la Phase 24** escrita en la cabecera (`:28-30`) | closed |
| T-22-11 | Denial of Service (auto-infligido) | un `groupCatalog` que descarta servicios apagaría el catálogo público entero, en silencio — el modo de falla exacto de CR-01 de la Phase 20, repetido en la 21 | high | mitigate | Camino por defecto = **identidad** (`lib/service-categories.ts:264-266`), sueltos nunca descartados (`:249-258, :280-286`); invariante de conservación sobre tabla de casos × 3 modos (`test/service-categories.test.ts:321-407`) | closed |
| T-22-12 | Tampering | persistir el orden desde la función de display borraría el arreglo manual del dueño al cambiar de modo (rompe CAT-06) | medium | mitigate | Un solo `.sort()` en todo el módulo, sobre copia (`:177-179`); test de ida y vuelta de modo + aserción de entrada intacta (`test:267, :294`) | closed |
| T-22-13 | Tampering (vector de inyección) | el `title` sale del `name` del dueño y termina en la página pública | medium | mitigate | Mismo control que T-22-10 | closed |
| T-22-14 | Information Disclosure | ninguna: el módulo no accede a datos ni filtra por tenant, y **no debe pretender que lo hace** | low | accept | Contrato explícito "el caller acota por `business_id` antes de llamar" en `lib/service-categories.ts:14-19` (molde de `lib/time-block-services.ts`). Filtrar por tenant acá daría una falsa sensación de aislamiento | closed |
| T-22-15 | Elevation of Privilege | (mismo vector que T-22-03, desde el plan de tests) reapertura de CR-01 | critical | mitigate | `test/isolation.test.ts:628-646` — DELETE anónimo contra **las dos** vistas redefinidas + supervivencia de las filas verificada aparte. Reconfirmado por medición directa del ACL | closed |
| T-22-16 | Tampering | un dueño apunta un servicio suyo a la categoría de otro negocio (los ids ajenos son públicos por diseño) | high | mitigate | `test/isolation.test.ts:709-735` + control positivo en `it` propio (`:737-757`). Se mide la **FK**, no la RLS — la RLS permitiría ese update | closed |
| T-22-17 | Denial of Service (pérdida de datos) | (mismo vector que T-22-05, desde el plan de tests) | critical | mitigate | `test/isolation.test.ts:759-809` — las 3 aserciones juntas (`:796-798`) + presencia en `public_services` leída por un anon puro (`:802-808`). La aserción sobre `business_id` es la única que distingue las dos implementaciones posibles | closed |
| T-22-18 | Information Disclosure (falla silenciosa) | (mismo vector que T-22-02, desde el plan de tests) | high | mitigate | `test/isolation.test.ts:667-680` — `toBeGreaterThanOrEqual(1)` + identidad de la fila. Control positivo que impide que el aislamiento se "logre" apagando la lectura | closed |
| T-22-19 | Spoofing (falso verde del propio test) | asertar aislamiento con el service-role, o con `.eq('business_id', …)` en un caso cross-tenant, produce un verde vacío | high | mitigate | Aserciones con `anonA`/`anonPublic()`; el cross-READ (`:682-689`) va **sin** `.eq('business_id')`; `seeded.admin` se usa sólo en siembra, limpieza y chequeo de efecto | closed |
| T-22-20 | Repudiation (documentación que miente) | un espejo que pierde los paréntesis de la cláusula de borrado describiría la variante que saca servicios de la venta, y la próxima fase lo copiaría como molde | medium | mitigate | `supabase/schema.sql:2269` con la subcadena literal `ON DELETE SET NULL (category_id)`, idéntica a lo que imprimió `pg_get_constraintdef` | closed |
| T-22-21 | Repudiation (documentación que miente) | espejar los GRANT con la forma vieja (permiso amplio a `anon`) documentaría como correcto justo lo que la migr. 072 desarmó | medium | mitigate | `schema.sql:4481-4483, 4499-4501, 4527-4529` en la forma de la 072; **0** ocurrencias de `GRANT ALL … TO "anon"` sobre las tres vistas. Ver caveat WR-05 abajo | closed |
| T-22-22 | Denial of Service (revisión imposible) | un `supabase db dump` en vez de la edición quirúrgica reordena 4524 líneas y vuelve el diff irrevisable | low | mitigate | Commit `004a6a2`: `148 / 3` en `schema.sql` (gate: ≥25 agregadas / ≤5 borradas) | closed |
| T-22-SC | Tampering (supply chain) | dependencias | low | accept | **Cero** paquetes nuevos: no hay `npm install` en esta fase. `git diff f50e064..HEAD -- package.json package-lock.json` vacío | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-01 | El anon lee títulos de categoría de **cualquier** negocio por `public_service_categories`. Es exposición **por diseño**: el `name` es el título que la Phase 24 pinta en la página de reservas, y la vista expone 4 columnas y nada más (verificado: `id, business_id, name, sort_order`; `created_at` queda afuera). Sin dato de cliente, precio ni ocupación. Mismo molde ya aceptado en T-10-02 (migr. 059) y T-18-01 (migr. 071). | Franco (dueño) — vía gate de `/gsd-secure-phase` | 2026-09-15 |
| AR-22-02 | T-22-14 | `lib/service-categories.ts` **no** filtra por tenant y no debe hacerlo: es una función pura que recibe filas que un tercero ya leyó. Agregarle un filtro por `business_id` daría una falsa sensación de aislamiento en un módulo que no puede validar el origen de sus datos. El aislamiento real vive en la FK compuesta, en la RLS y en el `.eq('business_id', …)` del caller — contrato escrito en la cabecera del módulo (`:14-19`). | Franco (dueño) — vía gate de `/gsd-secure-phase` | 2026-09-15 |
| AR-22-03 | T-22-SC | Superficie de supply chain sin cambios: la fase no instaló un solo paquete. Verificado con `git diff` vacío sobre `package.json` y `package-lock.json` en todo el rango de la fase. | Franco (dueño) — vía gate de `/gsd-secure-phase` | 2026-09-15 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-15 | 23 | 23 | 0 | gsd-security-auditor (ASVS L1, verificación L2/L3 en los dos vectores críticos) |

### Notas de la auditoría 2026-09-15

**Método.** Las dos verificaciones prioritarias se **midieron** contra el Postgres local en vivo, no
se leyeron del `.sql`:

1. **ACL crudo de `pg_class`** (que también cazaría un grant a `PUBLIC` que `role_table_grants` puede
   ocultar) → `anon=r/postgres` y `authenticated=r/postgres` en las tres vistas. `r` = SELECT y nada
   más. Cinco escrituras anónimas reales rebotaron con `permission denied for view`.
2. **Medición conductual del borrado** en transacción revertida, con un servicio real apuntando a una
   categoría real: tras borrar la categoría el servicio conserva su `business_id`, queda con
   `category_id` nulo y **sigue visible en `public_services`** leído como rol `anon`. Si la lista de
   columnas faltara, `business_id` habría quedado NULL y el servicio habría salido de la venta en
   silencio.

Suites re-corridas por el auditor: `Test Files 3 passed (3) · Tests 56 passed | 1 skipped (57)` (el
skip es el upload-gate de Storage, preexistente y ortogonal).

**Dos anotaciones sin impacto en el veredicto:**

- **`anon` posee `SELECT`/`REFERENCES`/`TRIGGER` sobre la tabla base `service_categories`**, heredado
  del `ALTER DEFAULT PRIVILEGES` de la migr. 073 (que sólo revoca `INSERT/UPDATE/DELETE/TRUNCATE`).
  El `22-01-SUMMARY.md:227-229` afirma que "`anon` nace sin ningún privilegio sobre la tabla" — eso
  es **inexacto**. La postura efectiva igual es correcta: medido, `anon` lee **0 filas** de la tabla
  base porque la RLS no tiene ninguna policy que lo alcance. El `22-04-SUMMARY.md` sí lo describe
  bien. No es superficie nueva de esta fase; es el patrón del repo.
- **WR-05 del code review** (el espejo de `schema.sql` omite los grants de tabla base de
  `service_categories`) toca la familia de T-22-21 **por omisión**, no por afirmación falsa: el
  vector declarado —espejar la forma vieja con permiso amplio— está cerrado. Queda como deuda de
  documentación, severidad medium, no bloqueante.
- **IN-01 del code review** queda cubierto **por medición** aunque el test no lo pruebe: el auditor
  verificó directamente que un `UPDATE` anónimo sobre `public_services` rebota y que `anon` lee 0
  filas de la tabla base. Es un hueco de cobertura de tests, no de seguridad.

---

## Pendiente operativo (no es una amenaza abierta, es el paso que pone las mitigaciones en efecto)

**CERRADO 2026-09-15: la migración 078 está aplicada en producción.** La auditoría midió contra el
Postgres local, y el mismo día la 078 se aplicó a prod, así que las mitigaciones verificadas están
efectivamente en efecto. La próxima migración del repo es la **079**. Las Phases 23 y 24 quedan
desbloqueadas para deploy.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-15
