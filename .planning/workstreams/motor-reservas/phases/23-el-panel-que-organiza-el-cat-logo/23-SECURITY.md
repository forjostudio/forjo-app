---
phase: "23"
slug: "el-panel-que-organiza-el-cat-logo"
status: verified
# threats_open = amenazas OPEN con severidad >= workflow.security_block_on (`high`)
threats_open: 0
asvs_level: 1
block_on: high
created: "2026-09-21"
register_authored_at_plan_time: true
threats_total: 57
threats_closed: 57
---

# Phase 23 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.

Fase de **panel**: escrituras del dueño autenticado sobre sus propios datos, con la anon key y su
sesión. Cero rutas nuevas bajo `app/api/`, cero uso de `createAdminClient` / service role, cero
`dangerouslySetInnerHTML`, cero migraciones nuevas (`supabase/migrations/*.sql` sigue en **41**) y cero
paquetes nuevos (`package.json` / `package-lock.json` no aparecen en el diff de la fase).

El registro se escribió **en tiempo de planificación**: los 11 `*-PLAN.md` traen su bloque
`<threat_model>`. Esta es la **primera** auditoría de la fase.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| dueño autenticado (browser) → `service_categories` | 5 escrituras con la anon key y la sesión del dueño; la RLS de la migr. 078 (4 policies por `owner_id`) es la primera capa y el `.eq('business_id', …)` la segunda | nombre y orden de categorías del negocio |
| dueño autenticado (browser) → `services.category_id` | la RLS le permite escribir **su** fila; nada en la policy mira a qué negocio pertenece el **valor** que escribe — lo ataja la FK compuesta | id de categoría (referencia cross-tenant potencial) |
| escritura **multi-fila** de orden → N filas de `service_categories` / `services` | una lista de ids que sale del estado del cliente decide qué filas se tocan | `sort_order` de N filas del mismo tenant |
| Postgres → la pantalla del dueño | el texto del error trae nombres de tabla, de constraint y detalles del esquema | metadatos del esquema |
| texto del dueño (`name`, `description`) → visitante anónimo | lo que se escribe acá termina renderizado en `/[slug]` y en la web de marca, para alguien sin sesión | texto libre (superficie de XSS almacenado) |
| dedo del dueño → `services.capacity` / `capacity_mode` | en mobile, texto inerte adyacente a un control de escritura: un toque corregido por el navegador escribiría el cupo | escalar de cupo |

---

## Threat Register

Las **56 amenazas únicas** de los 11 planes más `T-23-SC` (transversal, declarada una vez por plan).

**Colisión de IDs resuelta:** `23-11-PLAN.md` reusa `T-23-49/50/51`, que ya existían en
`23-10-PLAN.md`. Son amenazas **distintas** (las de 23-11 son sobre el documento de contrato, no sobre
el código). Las de 23-11 quedan renumeradas a **T-23-54/55/56**; las de 23-10 conservan su numeración
porque son las que tocan código.

### 23-01 — el organizador

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-01 | Tampering | `persistCategoryOrder` renumerando filas de otro negocio | high | mitigate | `categorias-manager.tsx:402` `.eq('id', id).eq('business_id', …).select('id')` fila por fila; `:406-408` cero filas = fallo explícito | closed |
| T-23-02 | Tampering | `category_id` forjado apuntando a otro tenant | high | mitigate | FK compuesta `078_service_categories.sql:251-254`; **test ejecutado** `test/isolation.test.ts:709` + control positivo `:737` | closed |
| T-23-03 | Spoofing / Tampering | `business_id` forjado en el insert de categoría | high | mitigate | `categorias-manager.tsx:277` toma `business.id` de la prop server-side (`servicios/page.tsx:11`); policy `WITH CHECK` `078:175-177` | closed |
| T-23-04 | Information Disclosure | texto crudo de Postgres en pantalla | medium | mitigate | `lib/catalog-panel.ts:246-251` ramifica **sólo por `code`**, nunca recibe el texto | closed |
| T-23-05 | Tampering (falla silenciosa) | reorden parcial dejando la pantalla desincronizada | medium | mitigate | `categorias-manager.tsx:410-421` relee las filas reales + `:422` copy propia | closed |
| T-23-06 | Tampering (XSS) | `name` de categoría leído por un anónimo | medium | mitigate | interpolación JSX; cero `dangerouslySetInnerHTML` en los 8 archivos de la fase | closed |
| T-23-07 | Tampering | doble submit sobre alta y reorden | low | mitigate | `:269`, `:388`, `:880-881` | closed |

### 23-02 — los dos campos del formulario

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-08 | Tampering | `category_id` de otro negocio por el selector | high | mitigate | lectura `servicios/page.tsx:35` con `business_id`; escritura `settings-client.tsx:1650`; FK `078:251-254` | closed |
| T-23-09 | Tampering | `description` larga o con marcado roto | low | **accept** | tope sólo de cliente (`maxLength={120}`); ver Accepted Risks | closed (aceptado) |
| T-23-10 | Tampering (XSS) | `description` + nombre de categoría a un anónimo | medium | mitigate | interpolación JSX | closed |
| T-23-11 | Information Disclosure | rechazo crudo de Postgres por el toast | medium | mitigate | `:1476`, `:1655-1668` copy fija; nunca `error.message` | closed |
| T-23-12 | Tampering | doble submit con dos columnas más | low | mitigate | `:1444`, `:3383` | closed |

### 23-03 — arrastre, renombrar, borrar

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-13 | Tampering | reorden por arrastre con ids de otro negocio | high | mitigate | el arrastre **no tiene mutador propio**: `:497` → `:441` → `:387`, un solo camino de escritura | closed |
| T-23-14 | Tampering | drop de un chip en una categoría de otro tenant | high | mitigate | `:511` → `assignServiceCategory:630`, escritura única `:633` con `business_id`; FK `078:251-254` | closed |
| T-23-15 | Tampering | renombrar con un id ajeno | high | mitigate | `saveRename:322` `.eq('business_id', …).select('id')` + `:334-339` | closed |
| T-23-16 | DoS (pérdida de datos) | borrar una categoría dejando servicios fuera de venta | high | mitigate | `078:254` `ON DELETE SET NULL ("category_id")` con lista de columnas; `isolation.test.ts:759-797` asierta las 3 propiedades | closed |
| T-23-17 | Information Disclosure | rechazo del renombrado filtrando constraint | medium | mitigate | `:324-326` por código | closed |
| T-23-18 | Tampering (falla silenciosa) | arrastre parcialmente fallido | medium | mitigate | hereda `:410-422` | closed |
| T-23-19 | Tampering | doble submit por gesto repetido | low | mitigate | `:314`, `:388` | closed |

### 23-04 — modos de orden

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-20 | DoS (pérdida de datos) | el cambio de modo materializando el orden y destruyendo el arreglo manual | high | mitigate | los dos handlers escriben **una sola columna**: `categorias-manager.tsx:592` y `settings-client.tsx:1995`; `sort_order` sólo se escribe en `:402` y `:464` | closed |
| T-23-21 | Tampering | `persistServiceOrder` renumerando servicios ajenos | high | mitigate | `:464` `.eq('business_id', …).select('id')`, `:467` cero filas = fallo; **exactamente dos mutadores de orden** en la fase | closed |
| T-23-22 | Tampering | reorden reenviando la fila entera y pisando un precio | high | mitigate | el payload es literalmente `{ sort_order }` en `:402` y `:464` | closed |
| T-23-23 | Tampering (falla silenciosa) | reorden de servicios desincronizado | medium | mitigate | `:471-479` relectura con el mismo doble orden del RSC | closed |
| T-23-24 | Information Disclosure | rechazo del CHECK del enum de modo | low | mitigate | whitelist `:584` y `:1989`; copy fija | closed |
| T-23-25 | Tampering | doble submit sobre el selector de modo | low | mitigate | `:583`, `:1988`, `:1068` | closed |

### 23-05 — la descripción pública

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-26 | Tampering (XSS almacenado) | `ServiceDescription` pintando texto del dueño a un anónimo | medium | mitigate | `service-description.tsx:105` hijo JSX; **test real ejecutado** `service-description.test.tsx:54-59` exige `&lt;script&gt;` | closed |
| T-23-27 | Information Disclosure | la tarjeta pública | low | **accept** | sin lectura nueva: `description` ya viajaba por `public_services` | closed (aceptado) |
| T-23-28 | Tampering (integridad UI) | "Ver más" eligiendo el servicio / control anidado reubicado | low | mitigate | `booking-client.tsx:634` cierra el botón, `:640` monta el toggle como **hermano** | closed |

### 23-06 — el chip en cualquier modo

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-29 | Tampering | más modos de arrastre = más llamadas a la escritura | medium | mitigate | sigue habiendo **un solo** update de la columna, en `assignServiceCategory:633` | closed |
| T-23-30 | DoS (pérdida del orden manual) | drop en modo no personalizado renumerando desde el orden visible (CAT-06, D-11 one-way) | high | mitigate | `catalog-panel.ts:214-217` devuelve `'place'` sólo con `canPlace`; `:541` corta antes de cualquier `persistServiceOrder`; la asignación escribe `max + 1` y no renumera | closed |
| T-23-31 | Tampering (falla silenciosa) | drop en el propio grupo escribiendo algo invisible | low | mitigate | no-op por grupo en `:520` y `:538`, antes de cualquier `await` | closed |

### 23-07 / 23-08 — la tarjeta del panel

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-32 | Tampering (XSS) | renglón de descripción en la tarjeta | low | mitigate | hijo JSX | closed |
| T-23-33 | Tampering | write path nuevo desde la tarjeta | low | mitigate | `from('services')` sigue en **6** líneas; `openEditService(` con **2** call sites | closed |
| T-23-34 | Repudiation (contrato) | Phase 24 reintroduciendo el defecto del recorte | low | mitigate | `ROADMAP.md:852` con la invariante literal | closed |
| T-23-35 | Information Disclosure | precio y duración duplicados en el markup | low | mitigate | `:2941`/`:2942` con `hidden … sm:block`: una copia visible por viewport | closed |
| T-23-36 | Tampering | camino de escritura nuevo | low | mitigate | `from('services')` = 6, aperturas = 2 | closed |
| T-23-37 | DoS (usabilidad) | reabrir el desborde de 375px o los toques errados | medium | mitigate | todo el layout nuevo con prefijo `sm:`; `:863` `py-6 sm:py-0` intacto | closed |

### 23-09 — la caja del cupo

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-38 | Tampering | escritura del cupo por un toque corregido por el navegador (G-04) | medium | mitigate | `:863` `py-6 sm:py-0` — el padding **nunca** se saca de mobile (1 sola ocurrencia de cada uno) | closed |
| T-23-39 | DoS (usabilidad, WR-03) | contenido por debajo de los botones y salto atrás en el foco | high | mitigate | el gate vive en el **envoltorio** `:2999`; la fila sigue **derivada**: `:2854` `leftRows` + `:2858` `Math.max(3, leftRows)` | closed |
| T-23-40 | DoS (usabilidad) | reabrir el desborde de 375px (G-02) | medium | mitigate | `:2999` `flex flex-col gap-2 sm:flex-row`. ⚠ los números de la sonda no se re-midieron en la auditoría (son píxeles de navegador); cubierto por la UAT 30/30 | closed |
| T-23-41 | Information Disclosure | duplicar datos ya visibles en el markup | low | **accept** | 3 gates de viewport, una copia visible por vez | closed (aceptado) |
| T-23-42 | Tampering | camino de escritura nuevo sobre `services` | low | mitigate | `from('services')` = 6, aperturas = 2 | closed |

### 23-10 — toggle, scroll del diálogo y la guarda del borrador

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-43 | Tampering | escritura del modo de cupo al apilar el toggle junto al explicador | high | mitigate | región `:589-638`: `onClick`/`role=`/`tabIndex` = **0**; el `id` sólo ancla `aria-describedby` (`:527` ↔ `:595`) | closed |
| T-23-44 | Tampering | patch que separa modo de cupo y rebota contra el CHECK de la migr. 068 | medium | mitigate | `capacityModePatch` se llama **una sola vez** (`:535`) y manda los dos juntos (`lib/panel-draft.ts:78-80`) | closed |
| T-23-45 | Repudiation (a11y) | la descripción accesible del diálogo resolviendo al formulario de alta (WR-03 de Phase 17) | medium | mitigate | `:462-463` `useId()` por instancia; `:1234-1235` dos ids separados para las dos instancias montadas | closed |
| T-23-46 | DoS (usabilidad) | romperle el scroll a los ~15 diálogos del panel | high | mitigate | `components/ui/dialog.tsx` **no aparece** en el diff de la fase (último toque `1ad8d8c`, 2026-08-10); el arreglo va por caller `:3291`/`:3313` | closed |
| T-23-47 | DoS (usabilidad) | perder el mínimo cero y dejar Guardar fuera del viewport a 375x667 | medium | mitigate | `:3291` `grid-rows-[auto_minmax(0,1fr)_auto]` + `:3313` `min-h-0 overflow-y-auto [scrollbar-gutter:stable]` | closed |
| T-23-48 | Information Disclosure | etiqueta recortada rompiendo el ancla accesible | low | mitigate | región `:460-650`: cero `truncate` / `line-clamp` / `text-ellipsis` | closed |
| T-23-49 | DoS (usabilidad — encierro) | huella mal normalizada marcando sucio un formulario intacto y encerrando al dueño | high | mitigate | el **mismo objeto** inicializa el borrador y produce la huella (`:1609-1610`, `:1897-1898`, `:2185-2186`); la huella reusa los 4 normalizadores y ordena las sedes (`panel-draft.ts:153-167`). UAT test 27 (los 4 falsos positivos) pass | closed |
| T-23-50 | DoS (usabilidad — sin salida) | que la guarda alcance a la ✕ o al Guardar | high | mitigate | `panel-draft.ts:116` mira **exactamente** `'outside-press'` y `'escape-key'`; `:122` cierra en todo lo demás. UAT test 26(d) pass | closed |
| T-23-51 | Tampering (pérdida de trabajo) | descarte silencioso del borrador — el gap G-23-25 en sí | medium | mitigate | `panel-draft.ts:118` `details.cancel()` antes de avisar; cableado en los **tres** diálogos (`:3273`, `:3743`, `:4060`) | closed |
| T-23-52 | DoS (usabilidad) | avisos apilados ante clicks repetidos | low | mitigate | `:1576` `toast.warning(…, { id: UNSAVED_CHANGES_TOAST_ID })` | closed |
| T-23-53 | Tampering | camino de escritura nuevo sobre `services`/`locations`/`professionals` | low | mitigate | `from('services')` = 6; sin caminos nuevos en las otras dos; `locToPayload` compartido entre guardado (`:2202`) y huella (`panel-draft.ts:178-184`). ⚠ el conteo literal "3/3/6" del plan no se pudo reproducir (el plan no especifica el método); la sustancia sí se verificó | closed |

### 23-11 — el contrato escrito (renumeradas)

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-54 *(era T-23-49)* | Repudiation | contrato describiendo un layout que no existe; la próxima fase reabre WR-03 | medium | mitigate | `23-UI-SPEC.md:894` "La fila de las acciones se DERIVA, no se fija"; `:897` nombra **WR-03** | closed |
| T-23-55 *(era T-23-50)* | DoS (documentación) | edición mal anclada comiéndose una sección de ~900 líneas | medium | mitigate | 21 secciones `## `, todas únicas; `Checker Sign-Off` aparece 1 vez | closed |
| T-23-56 *(era T-23-51)* | Tampering | el plan tocando código por error | low | mitigate | los 3 commits `docs(23-11)` tocan **sólo** `.planning/**/*.md` | closed |

### Transversal

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-SC | Tampering (supply chain) | dependencias npm | low | accept (mitigate en 23-03) | `package.json` y `package-lock.json` **no aparecen** en el diff de la fase; arrastre nativo HTML5, cero librería de drag-and-drop; `supabase/migrations/*.sql` = **41**, sin migraciones nuevas | closed (aceptado) |

*Status: open · closed · open — below `high` threshold (non-blocking)*
*Sólo las amenazas open con severidad >= `high` cuentan para `threats_open`.*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-23-01 | T-23-09 | El tope de 120 caracteres de `description` es **control de cliente** (`maxLength` en `:3232` y `:3347`); `schema.sql:1417` la declara `text` sin CHECK. El dueño es quien escribe y es su propio contenido; el riesgo real es de layout, no de seguridad, y el XSS lo ataja T-23-10 (interpolación JSX). Declarado como open question 4 en 23-01 y aceptado en 23-02. | Franco (dueño del proyecto) | 2026-09-21 |
| AR-23-02 | T-23-27 | La tarjeta pública **no gana ninguna lectura nueva**: `description` ya viajaba por `public_services` desde antes de este milestone. El plan 23-05 sólo cambia cómo se recorta. | Franco | 2026-09-21 |
| AR-23-03 | T-23-41 | Precio y duración se duplican en el markup, pero con tres gates de viewport (`:2941`, `:2942`, `:2999`) exactamente una copia es visible por vez. No es información que el dueño no esté viendo ya en su propia pantalla. | Franco | 2026-09-21 |
| AR-23-04 | T-23-SC | Cero paquetes nuevos en toda la fase. No hay candidatos que auditar, así que no corresponde tabla de legitimidad. | Franco | 2026-09-21 |
| AR-23-05 | **hallazgo nuevo** (fuera del registro) | `saveEditService` (`:1639`) **no tiene pre-chequeo de bajada de cupo**, mientras que el camino hermano `saveCapacityInline` (`:1726-1733`) sí llama `maxFutureSeatsOf` + `askCapacityDowngrade` y es fail-closed. Bajar el cupo desde el diálogo deja lugares reservados afuera sin avisar (`9/6 lleno` en la agenda, `slot_full` en el motor). **Severidad `medium`**, por debajo del umbral `high`: no es pérdida de datos (ningún turno se borra; `capacity` es un escalar restaurable), es reversible y auto-evidente, y no cruza el límite de tenant. **No se mitigó** porque un `ConfirmDialog` ahí anidaría modales, que el CLAUDE.md del proyecto prohíbe. Ver Follow-Ups. | Franco | 2026-09-21 |

---

## Hallazgos fuera del alcance de esta fase

Barriendo los hermanos de la escritura que el code review arregló (**WR-06**, el `.eq('business_id', …)`
que le faltaba a `saveEditLocation`, commit `dbee8e9`), la auditoría encontró **cuatro escrituras del
mismo archivo que siguen sin el filtro**. Verificado de forma independiente con `git blame`: las cuatro
son de **junio de 2026** y **ninguna la introdujo ni la tocó la Phase 23**, así que no son amenazas de
esta fase — pero contradicen la convención documentada del proyecto ("ninguna query del dashboard lo
omite") y quedan registradas acá para que no se pierdan.

| Línea | Escritura | Blame |
|-------|-----------|-------|
| `settings-client.tsx:1526` | `from('services').update({ location_ids, location_id: null }).eq('id', id)` | `339bfe9c` 2026-06-13 |
| `settings-client.tsx:1840` | `from('professionals').update({ photo_url: url }).eq('id', editingPro.id)` | `6bc9135b` 2026-06-09 |
| `settings-client.tsx:1849` | `from('professionals').update({ photo_url: null }).eq('id', editingPro.id)` | `e8a7eb40` 2026-06-09 |
| `settings-client.tsx:1875` | `from('professionals').update({ photo_url: url }).eq('id', created.id)` | `6bc9135b` 2026-06-09 |

Hoy las contiene la RLS, igual que contenía a `saveEditLocation` antes de WR-06. Candidatas a un
`/gsd-quick` de defensa en profundidad, **fuera de esta fase**.

---

## Follow-Ups

| # | Item | Origen |
|---|------|--------|
| 1 | Pre-chequeo de bajada de cupo en el diálogo de edición. **No requiere anidar modales**: alcanza una línea de aviso inline dentro del diálogo (el número de inscriptos vivos junto al campo, o el Guardar mostrando el conteo cuando el número baja). | AR-23-05 |
| 2 | Sumar `.eq('business_id', business.id)` a las 4 escrituras preexistentes de la tabla de arriba. | auditoría, fuera de alcance |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-21 | 57 | 57 | 0 | gsd-security-auditor (opus) + verificación independiente del orquestador |

**Suites ejecutadas durante la auditoría** (no se tomó por buena la evidencia reportada):
`test/isolation.test.ts` → 31 passed / 1 skipped · `catalog-panel` + `panel-draft` +
`service-description` + `categorias-manager` → 110 passed.

**Dos reservas declaradas por el auditor**, registradas en vez de ocultadas: los números de la sonda de
T-23-40 (píxeles de navegador, no re-medibles por grep — cubiertos por la UAT 30/30) y el conteo
literal "3/3/6" de T-23-53 (el plan no especifica el método de conteo; la sustancia sí se verificó).

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log (AR-23-01 … AR-23-05)
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Approval:** verified 2026-09-21
