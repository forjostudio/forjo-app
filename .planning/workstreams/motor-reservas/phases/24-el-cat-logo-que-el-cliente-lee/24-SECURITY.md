---
phase: "24"
slug: "el-catalogo-que-el-cliente-lee"
status: verified
# threats_open = amenazas OPEN con severidad >= workflow.security_block_on (`high`)
threats_open: 0
asvs_level: 1
block_on: high
created: "2026-09-28"
register_authored_at_plan_time: partial
threats_total: 17
threats_closed: 17
---

# Phase 24 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.

Fase que **consume** superficie que ya existía. Toca **9 archivos** y ninguno bajo `supabase/`:
tres de producción del camino público y del preview, el módulo puro, y cuatro de test.

**Cero migraciones** (`supabase/migrations/*.sql` sigue en **41**), **cero `GRANT`/`REVOKE`**, **cero
rutas nuevas bajo `app/api/`**, **cero uso de service role**, **cero escrituras nuevas**, **cero
paquetes**. Las tres vistas que lee (`public_services`, `public_service_categories`,
`public_businesses`) se crean en la migración **078**, que esta fase **no tocó** — verificado, no
aceptado. ⇒ **NO se dispara la herencia de `secure-phase` de la Phase 22.**

## Registro mixto — por qué esta auditoría tuvo dos modos

`24-01-PLAN.md` y `24-02-PLAN.md` traen su `<threat_model>` escrito en tiempo de planificación: ahí
la auditoría **verifica mitigaciones**, no busca amenazas nuevas.

Pero la fase shipeó una **tercera superficie sin modelo de amenazas**: el plan **24-03** existe sólo
como `24-03-SUMMARY.md`, porque nació de un brief **durante la UAT** —la barra de chips que el dueño
pidió al ver su catálogo real— y nunca pasó por el planner. Esa superficie se modeló
**retroactivamente** acá (`T-24-12` … `T-24-16`).

> **Lección para las próximas.** Una decisión tomada en la UAT que agrega código llega al final del
> pipeline, donde ya no hay planner que le escriba el threat model. No es motivo para no tomarla —
> la barra de chips salió bien y CAT-09 quedó intacto — pero sí para acordarse de **modelarla en el
> `secure-phase`**, que es el único gate que todavía queda por delante.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| visitante anónimo → `public_service_categories` | Lectura nueva de esta fase con la anon key. La vista es una proyección **DEFINER sin `WHERE`** (`078:322-327`), así que el aislamiento efectivo lo pone el `.eq('business_id', …)` del call site | id, nombre y orden de las categorías del negocio |
| visitante anónimo → `public_businesses` | Dos columnas más en un select ya existente | `category_sort_mode`, `service_sort_mode` (enums acotados de presentación) |
| dueño autenticado → `service_categories` (tabla base) | El preview del panel lee la **tabla base** con el cliente de sesión: RLS + filtro explícito, las dos capas que exige la doctrina del repo | las categorías del propio negocio |
| texto del dueño → visitante anónimo | El `name` de categoría se pinta en el `<h3>` del grupo **y**, desde 24-03, en el rótulo del chip | texto libre sin tope de longitud |
| estado local del cliente → qué grupos se pintan | La barra de chips filtra en el navegador sobre el arreglo que ya mandó el servidor | una clave de grupo |

---

## Threat Register

### 24-01 — El camino público (registro escrito en tiempo de plan)

| Threat ID | Category | Severity | Disposition | Mitigation | Status |
|-----------|----------|----------|-------------|------------|--------|
| T-24-01 | Tampering (XSS) | medium | mitigate | `booking-client.tsx:705` `{group.title}` interpolado en JSX; cero `dangerouslySetInnerHTML` en los archivos de la fase; el módulo puro propaga `name` como `string` plano y nunca construye marcado. **Confirmado además en navegador real**: UAT Test 9 (categoría llamada `<script>alert(1)</script>` → se ve como texto plano) | closed |
| **T-24-02** | **Information Disclosure** | **high** | mitigate | `app/[slug]/page.tsx:128` — `.eq('business_id', business.id)` en la lectura. **Verificado por el orquestador y por el auditor por separado:** la vista es una proyección **sin `WHERE`** (`schema.sql`), así que ese filtro **es** el aislamiento. La tabla base tiene RLS con 4 policies de tenant y **ninguna para `anon`** (`078:158-188`), así que leerla con anon key no es alternativa. Respaldo ejecutado: `test/isolation.test.ts:674-688` | closed |
| T-24-03 | DoS (disponibilidad del catálogo) | medium | mitigate | Fail-safe direccional de tres eslabones: `\|\| []` en `page.tsx:196`, prop opcional (`booking-client.tsx:65`), `?? []` en el punto de consumo (`:227`). Ante el dato ausente el catálogo **se desagrupa, nunca se apaga** — el modo de falla que ya mordió dos veces en este repo (CR-01 Phase 20, y otra vez en la 21) | closed |
| T-24-04 | Tampering (integridad del orden) | medium | mitigate | Las dos columnas de modo en **los dos** selects (`page.tsx:68`, `web/page.tsx:55`) y el tercer argumento de `groupCatalog` como **objeto literal campo por campo** (`booking-client.tsx:227-230`). Barrido repo-wide propio: los tres call sites no-test usan objeto literal, **cero spreads** | closed |
| T-24-05 | Information Disclosure | low | mitigate | Lista de columnas **explícitas**, nunca `select('*')`; las dos agregadas ya las expone la vista y son enums de presentación | closed |
| T-24-06 | Elevation of Privilege | low | **accept** | Ver Accepted Risks (AR-24-01) | closed |

### 24-02 — El preview del panel (registro escrito en tiempo de plan)

| Threat ID | Category | Severity | Disposition | Mitigation | Status |
|-----------|----------|----------|-------------|------------|--------|
| T-24-07 | Information Disclosure | medium | mitigate | `web/page.tsx:145-150` lee la **tabla base** con el cliente de **sesión** y `.eq('business_id', …)`: RLS + filtro explícito, las **dos** capas que exige `supabase-multitenant-rls`. Un gate prohíbe que el panel lea la vista DEFINER | closed |
| T-24-08 | Information Disclosure | medium | mitigate | `web/page.tsx:55`: columnas explícitas, sin `select('*')` | closed |
| T-24-09 | Tampering (integridad del preview) | medium | mitigate | `test/preview-booking-parity.test.ts` caso (4) **CORRIÓ en la auditoría** (4 passed, 0 skipped): siembra con service-role y lee por los dos caminos reales con los **dos roles** reales, asertando primero que ambas lecturas trajeron filas. Los dos call sites pasan la prop | closed |
| T-24-10 | DoS (disponibilidad del preview) | low | mitigate | `\|\| []` + prop opcional + `?? []` | closed |
| T-24-11 | Elevation of Privilege | low | **accept** | Ver Accepted Risks (AR-24-02) | closed |

### 24-03 — La barra de chips (registro **RETROACTIVO**, construido en esta auditoría)

| Threat ID | Category | Severity | Disposition | Mitigation | Status |
|-----------|----------|----------|-------------|------------|--------|
| T-24-12 | Tampering (XSS) | medium | mitigate | El rótulo del chip es el `name` de categoría en un elemento **nuevo**: `booking-client.tsx:669` `{chip.title}` interpolado en JSX, con `chip.title` saliendo de `g.title` (string plano). El gate de `dangerouslySetInnerHTML` corre sobre el archivo entero, así que cubrió el elemento nuevo sin cambios. ⚠ Ver "Lo que no se verificó" | closed |
| T-24-13 | Information Disclosure | medium | mitigate | **El filtro no puede revelar nada que el catálogo no mostrara, por construcción:** `filterCatalogGroups` es un `filter` sobre el arreglo **que ya mandó el servidor** — sin fetch, sin fuente propia, devuelve un subconjunto o la misma referencia. Y `catalogChips` deriva todo de `groups`, sólo de los que tienen título; como `groupCatalog` omite las categorías **sin servicios**, una categoría vacía nunca llega a ser chip | closed |
| T-24-14 | DoS (disponibilidad del catálogo) | medium | mitigate | Una clave desconocida o forjada devuelve el **catálogo entero**, nunca `[]` (`service-categories.ts:483-484`, testeado). Y el estado tiene **un solo camino de escritura** (`setCatalogChip` desde el onClick), inicializado en `ALL_GROUPS_KEY`: cero lecturas de `searchParams`, `localStorage`, `sessionStorage` o `location.hash`, así que una clave crafteada no tiene por dónde entrar — y si entrara, caería en la rama segura | closed |
| T-24-15 | Tampering (identidad de grupo) | low | mitigate | Fuente única `catalogGroupKey`, usada por el chip **y** por la `key` de React del envoltorio. Si divergieran, el chip filtraría a cero grupos en silencio | closed |
| T-24-16 | Elevation of Privilege / superficie nueva | low | **accept** | Ver Accepted Risks (AR-24-03) | closed |

**Los otros dos cambios de 24-03 se modelaron y se descartaron explícitamente**, en vez de inventarles
amenazas: el `min-w-0 break-words` del nombre y el `text-sm` → `text-lg` del título son cambios de
clases de Tailwind sobre texto **que ya venía interpolado y ya se renderizaba ahí**. No cruzan ningún
trust boundary.

### Transversal

| Threat ID | Category | Severity | Disposition | Mitigation | Status |
|-----------|----------|----------|-------------|------------|--------|
| T-24-SC | Tampering (supply chain) | low | **accept** | `git diff --name-only <base>..HEAD -- package.json package-lock.json` **vacío**. Sin candidatos que auditar | closed |

*Sólo las amenazas open con severidad >= `high` cuentan para `threats_open`.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-24-01 | T-24-06 | Permisos de la vista pública. La fase **no toca migraciones ni `GRANT`/`REVOKE`** (verificado: 41 migraciones, diff vacío bajo `supabase/`); los permisos de la 078 (`REVOKE ALL` + `GRANT SELECT` a `anon`/`authenticated`, `GRANT ALL` sólo a `service_role`) quedan intactos. No hay nada que esta fase pueda haber aflojado. | Franco | 2026-09-28 |
| AR-24-02 | T-24-11 | El gate de entitlement del CMS (`if (!business.has_web_custom) return <WebUpsell/>`) cae **antes** del `Promise.all` donde vive la lectura nueva. La fase no lo movió ni agrega superficie de escritura. | Franco | 2026-09-28 |
| AR-24-03 | T-24-16 | La barra de chips es **estado local de un client component**: cero queries, cero endpoints, cero migraciones, cero paquetes, cero componentes nuevos de `components/ui`. El diff de 24-03 son cuatro archivos, dos de ellos de test. | Franco | 2026-09-28 |
| AR-24-04 | T-24-SC | Cero paquetes nuevos en toda la fase. No corresponde tabla de legitimidad. | Franco | 2026-09-28 |

---

## Lo que NO se verificó (declarado, no escondido)

- **T-24-12 — XSS del rótulo del chip, en navegador real.** Se verificó la ruta de código y el gate
  de texto (ASVS L1 = presencia de la mitigación). La UAT **sí** probó un payload real en el
  **`<h3>` del grupo** (Test 9: `<script>alert(1)</script>` → texto plano), lo que cierra T-24-01 con
  evidencia de navegador, pero **el rótulo del chip es un elemento distinto** y no tuvo su propio
  caso con payload. Comparten `chip.title`/`group.title` y el mismo camino de interpolación, así que
  el riesgo residual es bajo — pero no es lo mismo que haberlo visto.
  > *Corrección al reporte del auditor:* dijo que *"ninguno de los tests de la UAT es un caso de XSS
  > explícito con payload"*. El Test 9 lo es. Lo que falta es sólo el del chip.
- **La suite completa** la midió el orquestador (97 files / 1365 passed, exit 0); el auditor corrió
  los tres archivos relevantes (70 + 4 = 74 passed) y no re-derivó el total.

---

## Hallazgos preexistentes — estado

Los **cuatro writes sin `.eq('business_id', …)`** que encontró la auditoría de la Phase 23 **siguen
abiertos y sin tocar**: `app/(dashboard)/settings/settings-client.tsx:1526` (`services.update`),
`:1840`, `:1849`, `:1875` (`professionals.update`), todos con `.eq('id', …)` como único filtro.

**Esta fase NO los introdujo ni los modificó** — `git log <base>..HEAD -- settings-client.tsx` está
**vacío**. Son de junio 2026. Su contención real hoy es la RLS de `services`/`professionals`: una
sola capa donde la doctrina del repo pide dos. Se repiten acá con la misma disciplina que en la fase
anterior, para que no se pierdan entre auditorías.

**Observación de alcance, por transparencia:** en la ventana de commits de la fase también entró
`components/dashboard/categorias-manager.tsx`, por el **quick `260928-hby`** (la zona "Sin categoría"
del organizador). Se revisó su diff: es puramente de render y copy en el panel autenticado, sin tocar
queries ni policies. No pertenece a ninguno de los tres planes de la fase 24 y no abre superficie.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-28 | 17 | 17 | 0 | gsd-security-auditor (opus) + verificación independiente del orquestador |

**Ejecutado durante la auditoría** (no se tomó por buena la evidencia reportada):
`catalog-public` + `service-categories` → 70 passed · `preview-booking-parity` → **4 passed, NO
skipeado** (credenciales presentes, el caso pegó contra la base real con los dos roles de lectura).

**Verificado por el orquestador, por separado del auditor:** que la vista `public_service_categories`
es una proyección sin `WHERE`, que `page.tsx:128` lleva el `.eq('business_id', …)`, que el preview
lee la tabla base con el cliente de sesión, y que los tres call sites de `groupCatalog` usan objeto
literal.

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] La superficie sin modelo de origen (24-03) tiene registro retroactivo
- [x] Riesgos aceptados documentados (AR-24-01 … AR-24-04)
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Approval:** verified 2026-09-28
