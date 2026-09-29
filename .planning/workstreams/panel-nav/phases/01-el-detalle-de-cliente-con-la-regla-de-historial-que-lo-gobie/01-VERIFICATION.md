---
phase: 01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie
verified: 2026-09-29T17:03:39Z
status: human_needed
score: 2/5 criterios verificados estáticamente (0 fallidos · 3 present-behavior-unverified, a la UAT en celular del dueño)
covered_files:
  - ".planning/workstreams/panel-nav/REQUIREMENTS.md"
  - ".planning/workstreams/panel-nav/phases/01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie/01-01-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie/01-01-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie/01-02-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie/01-02-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie/CONTEXT.md"
  - ".planning/workstreams/panel-nav/phases/01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie/RESEARCH.md"
  - "app/(dashboard)/clients/clients-client.tsx"
  - "app/(dashboard)/clients/page.tsx"
  - "lib/panel-history.test.ts"
  - "lib/panel-history.ts"
  - "test/panel-history-clients.test.ts"
covered_digest: "v1:sha256:4a85e1cf9aff27767df079314d51049e8791cefda956f0ee6c037e70caca9bb6"
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "Criterio 1 — Finanzas → Clientes → abrir un cliente → el back vuelve al listado con la búsqueda y los tres filtros intactos (NAV-01)"
    test: "En un celular real: entrar a Finanzas, ir a Clientes por el menú hamburguesa, escribir algo en el buscador y activar los tres filtros (estado, profesional, obra social), abrir un cliente, y apretar el botón atrás del sistema."
    expected: "Vuelve al listado de Clientes (no a Finanzas), con el texto del buscador y los tres filtros exactamente como estaban. En DevTools, la entrada del detalle existe en el historial."
    why_human: "Es un invariante de transición: que `ClientsClient` NO se remonte al escribir/deshacer la entrada. Ningún test lo puede ver — vitest corre en `environment: 'node'`, sin jsdom ni navegador, y el `restoreReducer` de Next 16.2.7 (`node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js`) sí dispara `spawnDynamicRequests` en la travesía de historial: el argumento de que el estado sobrevive es estructural, no medido."
  - truth: "Criterio 3 — cerrar por el 'Volver' de mobile no deja entradas basura, y la fusión reemplaza en vez de empujar (NAV-05)"
    test: "En el celular: (a) abrir un cliente desde el listado y tocar 'Volver' → un solo atrás más tiene que sacar de Clientes; (b) borrar un cliente con el detalle abierto y mirar la URL y el atrás; (c) fusionar duplicados con la ficha del duplicado abierta, cerrar el modal y mirar la URL."
    expected: "(a) no hacen falta dos atrás para salir de Clientes; (b) después de borrar, la URL queda en `/clients` y el atrás sigue haciendo algo visible — nunca reaparece la ficha borrada; (c) la URL converge a `?c=<conservado>` sin agregar una entrada nueva."
    why_human: "Es la cadena diferimiento → reintento → consumo: la escritura queda pendiente por la regla 0 mientras el overlay tiene la entrada de arriba, y se reintenta cuando el `back()` del overlay asienta y cambia la identidad de `useSearchParams`. Los tests fijan la política y el cableado por separado; la SECUENCIA sólo se observa en un navegador."
  - truth: "Criterio 5 — con un overlay de Clientes abierto el back sigue cerrando el overlay y no navega (NAV-06)"
    test: "Con el detalle de un cliente abierto (`/clients?c=<id>`), abrir el drawer de importar CSV / el diálogo de borrar / el de fusionar y apretar atrás."
    expected: "Se cierra el overlay, no se cierra el detalle, no se cambia de sección, y no queda una entrada huérfana (el siguiente atrás vuelve al listado)."
    why_human: "Convivencia de dos pilas de entradas en el mismo stack (la del overlay y la del detalle). Es exactamente la cicatriz que el proyecto ya pagó tres veces; la prueba es el navegador, no el grep."
human_verification:
  - test: "UAT en celular real — recorrido del bug: Finanzas → hamburguesa → Clientes (con buscador escrito y los 3 filtros puestos) → abrir un cliente → atrás."
    expected: "Vuelve al listado de Clientes con búsqueda y los tres filtros intactos."
    why_human: "Comportamiento del botón atrás del sistema + preservación de estado: no observable sin navegador."
  - test: "UAT — recargar con F5 la URL `/clients?c=<id>` y pegarla en otra pestaña del mismo dueño."
    expected: "Abre ese cliente, sin flash del listado."
    why_human: "El 'sin flash' es percepción visual; la derivación en sí ya está verificada estáticamente."
  - test: "UAT — pegar `/clients?c=<uuid-inexistente>` y `/clients?c=<id de un cliente de OTRO negocio>`."
    expected: "Resultado observable IDÉNTICO en los dos casos: el listado, sin ninguna señal de que el id exista."
    why_human: "Confirma en vivo lo que ya está probado por estructura (la resolución nunca consulta la base)."
  - test: "UAT — cerrar el detalle con 'Volver', borrar un cliente con el detalle abierto, y fusionar duplicados con la ficha del duplicado abierta."
    expected: "Sin entradas basura, sin ficha fantasma del borrado, y la URL convergiendo al conservado tras la fusión."
    why_human: "Secuencia asincrónica entre el `back()` del overlay y la reconciliación."
  - test: "UAT — con un overlay de Clientes abierto (importar CSV / borrar / fusionar), apretar atrás."
    expected: "Cierra el overlay y no navega."
    why_human: "Convivencia de las dos pilas de entradas."
  - test: "UAT — con el detalle abierto, navegar A → B y tocar 'Volver'."
    expected: "Decisión ① del plan: A→B EMPUJA, así que 'Volver' devuelve la ficha A, no el listado. Confirmar que ese comportamiento es el querido."
    why_human: "Es un cambio de semántica del botón 'Volver' respecto de hoy (antes cerraba el detalle siempre). Está declarado y justificado en el plan, pero lo valida el dueño."
  - test: "`npm run build` (rc=0) corrido por el dueño cuando el server de dev del puerto 80 esté bajado."
    expected: "rc=0, sin el error de `useSearchParams` sin `Suspense`."
    why_human: "El verificador NO lo corrió a propósito: `next build` escribe en `.next/`, el mismo directorio que usa el `next dev` que el dueño tiene levantado. El SUMMARY lo declara en rc=0 (01-01-SUMMARY.md:170); queda como claim no re-medido."
---

# Phase 1: El detalle de cliente, con la regla de historial que lo gobierna — Informe de verificación

**Goal:** Que abrir un cliente sea una navegación real —el back vuelve al listado de Clientes con su búsqueda y filtros intactos, y la URL del detalle se recarga y se comparte— gobernada por un único helper que decide cuándo empujar, cuándo reemplazar y cuándo consumir.

**Verificado:** 2026-09-29T17:03:39Z
**Status:** `human_needed` — **cero gaps, cero fallidos**; lo que falta es la UAT en celular que corre el dueño.
**Re-verificación:** No — verificación inicial.

## Resumen en una línea

El mecanismo existe, es puro, está cableado y **está protegido por tests que medí que se ponen rojos** (6 mutaciones, 6 rojos). No encontré ni un gap. Lo que **no** está probado es lo único que un navegador puede probar: el botón atrás de un celular.

---

## Logro del objetivo

### Criterios de éxito del ROADMAP

| # | Criterio | Status | Evidencia |
|---|---|---|---|
| 1 | El recorrido del bug queda cerrado (back → listado con búsqueda y 3 filtros) — NAV-01 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Mecanismo presente y cableado, pero el invariante es una transición que ningún test ejerce. Ver análisis abajo. |
| 2 | La URL del detalle es de verdad; id inexistente ≡ id de otro negocio; lecturas acotadas por `business_id` — NAV-02 | ✓ VERIFIED | `clients-client.tsx:536-542` + `page.tsx:19-33` + `lib/panel-history.ts:259-283` + test `lib/panel-history.test.ts:163` y `test/panel-history-clients.test.ts:222-229` (mutación 5 → rojo) |
| 3 | La regla push-vs-replace es observable: 'Volver' no deja basura, la fusión REEMPLAZA | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Política probada (`lib/panel-history.ts:111-139`, 65 casos) y cableado clavado (`test/panel-history-clients.test.ts:103-178`), pero la SECUENCIA diferimiento→reintento→consumo no la ejerce ningún test. |
| 4 | Hay una sola forma de hacerlo (módulo puro testeado + grep = 0 hits) — NAV-05 | ✓ VERIFIED | `grep -rE 'pushState\|replaceState\|history\.back' "app/(dashboard)/clients/"` → **rc=1, 0 hits** (medido). Módulo puro con 65 tests en `environment: 'node'`. Causa `filter` (T-3) expresable y testeada (`lib/panel-history.test.ts:117`). |
| 5 | No se rompe nada: overlays, unsaved-changes y cero cambio visual — NAV-06 | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Los 3 archivos intocables **no se tocaron** (git, abajo) y sus suites están verdes (35/35 medido). Cero cambio visual verificado por diff. La mitad "el back sigue cerrando el overlay" es runtime. |

**Score:** 2/5 verificados estáticamente · **3 present-behavior-unverified** · **0 FAILED** · 0 overrides.

> Leer el 2/5 como "la fase falla" sería un error. **Ningún criterio falló.** Tres criterios afirman comportamiento del historial del navegador y el proyecto no tiene —por decisión del milestone: sin jsdom, sin paquetes nuevos— forma de ejercerlos en la suite. Por eso caen a la UAT en celular, que es exactamente donde el ROADMAP los puso ("Observable en un celular real").

---

## Criterio 1 — por qué el listado conserva búsqueda y filtros (estructural)

La pregunta que pediste que conteste: **¿qué es estado de quién y qué se desmonta?**

| Pieza | Dónde | De quién es el estado |
|---|---|---|
| `search`, `filter`, `filterPro`, `filterInsurance` | `clients-client.tsx:245-248` | `useState` **de `ClientsClient`**, que es el componente que renderiza listado **y** detalle |
| El cliente abierto | `clients-client.tsx:536-542` | **Ya no es estado**: se DERIVA de `searchParams.get('c')`. El `useState<string \| null>` del selected murió (diff de `71457a5`) |
| La escritura del historial | `lib/panel-history.ts:358-396` | `window.history.pushState` / `replaceState` **parcheados por Next** |

La cadena que sostiene el criterio:

1. **No hay `router.push` / `router.replace`** en toda la pantalla (`grep 'useRouter\|router\.'` sobre `clients-client.tsx` → 0 hits). Esto es lo que evita el request RSC y el cambio de clave de segmento que remontaría la página.
2. Se escribe por el `pushState` **parcheado** (`node_modules/next/dist/client/components/app-router.js:252-262`): como el state es un objeto literal fresco (`panelViewState`, `lib/panel-history.ts:165-167`), **no** entra por la rama temprana `if (data?.__NA || data?._N) return originalPushState(...)` — la trampa silenciosa — y sí despacha `ACTION_RESTORE`.
3. Cambia la URL y `useSearchParams` sin volver al server: es el patrón oficial documentado en `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345` ("update the browser's history stack **without reloading the page**").
4. Como `ClientsClient` no se desmonta, sus cuatro `useState` de búsqueda/filtros sobreviven. **Nada se desmonta salvo `<ClientDetail>`**, que se remonta a propósito por `key={selected.id}` (`clients-client.tsx:925`) para resetear el sub-form.

**El límite honesto de este argumento:** en Next 16.2.7 el `restoreReducer` (`node_modules/next/dist/client/components/router-reducer/reducers/restore-reducer.js`) llama a `startPPRNavigation` + `spawnDynamicRequests` con `FreshnessPolicy.HistoryTraversal`. O sea: una travesía de historial **puede** disparar un request dinámico de RSC sobre `/clients`. Que ese refresco preserve el `CacheNode` y no remonte el componente cliente es lo esperado (mismo tree, misma posición) pero **no lo medí** — y es justo lo que la UAT observa. Por eso el criterio queda `PRESENT_BEHAVIOR_UNVERIFIED` y no `VERIFIED`.

---

## Criterio 2 — NAV-02 y el aislamiento por tenant (el punto con relevancia de seguridad)

**Veredicto: cerrado, y cerrado por estructura — no mitigado.**

| Afirmación | Evidencia |
|---|---|
| El id de la URL **no es autorización**: sólo SELECCIONA dentro de un conjunto que el server ya autorizó | `clients-client.tsx:538` — `clients.find(c => c.id === targetId) ?? null`. La lista `clients` viene de `page.tsx:20-23` con `.eq('business_id', business.id)` |
| Las lecturas siguen acotadas por `business_id` | `page.tsx:22`, `:26`, `:31` — las **tres** queries. Y `business` se resuelve por `owner_id` (`page.tsx:11-15`) |
| **Nunca** se consulta la base por el id de la URL | No hay ninguna query por `?c=` en la pantalla. `resolveViewParam` (`lib/panel-history.ts:259-283`) es pura y sólo compara strings |
| Un id inexistente y uno **de otro negocio** producen el mismo resultado observable | Los dos son "no está en la lista" → `resolvedTo = null` → `reconcile: true, cause: 'stale'` → se limpia la URL y se ve el listado. Test explícito: `lib/panel-history.test.ts:163` ("un id inexistente, uno de OTRO NEGOCIO y uno recién borrado son INDISTINGUIBLES") |
| El invariante está **clavado** contra la deriva | `test/panel-history-clients.test.ts:222-229` cuenta las tres apariciones de `.eq('business_id'` en `page.tsx`. **Medido:** si se le saca una, el test se pone rojo (mutación 5) |

**Superficie de escritura, que también revisé** (no estaba en el criterio, pero es donde un id de la URL podría hacer daño): `markStatus` (`clients-client.tsx:669-676`) y `deleteClient` (`:608-648`) usan `selectedId`, y `selectedId = view.selected = resolved?.id ?? null` (`:541`). O sea: **`selectedId` sólo puede ser un id que ya pasó por la lista filtrada por tenant.** Un `?c=<id ajeno>` deja `selectedId` en `null` y los dos handlers hacen `return` en su primera línea. No hay camino desde la URL a una escritura cross-tenant.

**Riesgo (b) del ROADMAP:** cerrado por D-03. No se agregó lectura por id en el server, así que no hay oracle de existencia que proteger con `notFound()`.

---

## Criterio 4 — la única forma de tocar el historial

```
$ grep -rE 'pushState|replaceState|history\.back' "app/(dashboard)/clients/"
  (sin salida, rc=1)
$ grep -rcE ... → clients-client.tsx:0 · page.tsx:0
```

**Cero hits, incluso contando comentarios.** Las cuatro escrituras pasan por el ejecutor:

| Cambio de vista | Call site | Causa declarada | Acción que decide el helper |
|---|---|---|---|
| Abrir un cliente | `clients-client.tsx:859` | `'user-open'` | `push` |
| "Volver" de mobile | `clients-client.tsx:936` (botón en `:1344-1345`, `lg:hidden` + `ChevronLeft`) | `'user-close'` | `consume` si la entrada es nuestra, si no `replace` |
| Borrar | `clients-client.tsx:645` | `'concurrent'` | `none` (regla 1) |
| Reconciliar (saneo / fusión) | `clients-client.tsx:589-594` | la que devuelve `resolveViewParam` (`'stale'` o `'programmatic'`) | `consume`/`replace` |
| Fusionar | `clients-client.tsx:700-704` | **ninguna, a propósito**: registra `mergedInto` y la URL converge después | — |

El módulo es puro y está testeado en `environment: 'node'` sin jsdom (`vitest.config.mts:48`, `lib/panel-history.test.ts` — 53 casos) y la causa `filter` de T-3 existe y tiene su test (`lib/panel-history.test.ts:117`) aunque la fase no la cablee. El `switch` cierra con `const _exhaustivo: never = cause` (`lib/panel-history.ts:136`): agregar una causa en la Phase 2 sin decidir su política **no compila**.

---

## C-1 — la carrera del borrado: ¿está cerrada, y los tests son honestos?

**Los tests NO son tautológicos. Lo medí con mutación: 6 degradaciones, 6 rojos, árbol restaurado.**

| # | Mutación aplicada | Test que se puso rojo | Resultado |
|---|---|---|---|
| 1 | En `deleteClient`, `cause: 'concurrent'` → `'programmatic'` | `(a) el borrado declara la causa del commit concurrente — ES C-1` | 🔴 1 failed / 11 passed |
| 2 | Reemplazar la llamada del borrado por `window.history.replaceState({...}, '', '/clients')` | `(a)`, `(b) el borrado no escribe historial a mano`, `(f) cero mutaciones crudas` | 🔴 3 failed / 9 passed |
| 3 | En `applyPanelView`, `panelViewState(...)` → `{ ...window.history.state, ...panelViewState(...) }` | `(a) el helper nunca compone el state por propagación` | 🔴 1 failed / 64 passed |
| 4 | Neutralizar la regla 0 (`if (false && overlayOwnsTop) …`) | 8 casos entre los dos archivos, incl. `post-borrado, con el diálogo todavía consumiendo su entrada: no escribe nada (C-1)` | 🔴 8 failed / 57 passed |
| 5 | Sacar un `.eq('business_id', business.id)` de `page.tsx` | `(i) las tres queries del server siguen acotadas por tenant` | 🔴 1 failed / 11 passed |
| 6 | Reintroducir un `setSelectedId` | `(g) no sobrevive ninguna segunda fuente de verdad` | 🔴 1 failed / 11 passed |

> Comando base: `npx vitest run --project pure test/panel-history-clients.test.ts lib/panel-history.test.ts`. Baseline limpio: **65 passed / 2 archivos, 301ms**. Cada mutación se restauró desde una copia en el scratchpad y el árbol quedó limpio (`git status --porcelain` sobre `app/(dashboard)/clients/` y `lib/` → vacío).

**Por qué los dos archivos de test hacen falta** (y la crítica que sobrevive): `lib/panel-history.test.ts` fija la POLÍTICA; `test/panel-history-clients.test.ts` fija que el CALL SITE declara la causa correcta, leyendo el fuente por REGIÓN (`recorte`, `:65-80`) con los comentarios descontados (`sinComentarios`, `:44-49`) y afirmando primero que la región no está vacía (`expect(region.length).toBeGreaterThan(0)`) — la regla de honestidad que evita el barrido que pasa por vacío. La mutación 1 prueba que sin el segundo archivo C-1 se degradaría en verde.

**El mecanismo de cierre de C-1, medido pieza por pieza:**

1. **Dos candados independientes** en el helper: la regla 0 (`overlayOwnsTop → none`, `lib/panel-history.ts:99`) y la regla 1 (`cause === 'concurrent' → none`, `:105`). Si mañana el marcador del overlay cambia de nombre y la regla 0 queda inerte, la regla 1 sigue de pie.
2. **La premisa es real:** los 4 diálogos de la pantalla (`clients-client.tsx:946`, `:962`, `:992`, `:1039`) son `<Dialog>`, y `components/ui/dialog.tsx:33` llama `useOverlayHistory`. El overlay **sí** es dueño de la entrada de arriba mientras corre el borrado.
3. **La cobertura de `hayOverlayAbierto` (`clients-client.tsx:552`) está completa:** los cuatro flags corresponden exactamente a los cuatro `<Dialog>` del archivo. No encontré un quinto overlay sin cubrir.
4. **El reintento existe y su disparador es genuino:** el efecto depende de `searchParams` (`:602`), y su identidad cambia con la URL canónica — que en Next **incluye el hash** (`node_modules/next/dist/client/components/router-reducer/create-href-from-url.js:11-12`, `includeHash = true`) y se memoiza sobre `canonicalUrl` (`app-router.js:115-120`). Como los overlays empujan con hash (`lib/overlay-history.ts:71-80`), cuando su `back()` asienta **llega el aviso**. Esto lo verifiqué contra la versión instalada, no contra el comentario del código.
5. **El invariante duro no depende del saneo:** aunque la reconciliación fallara, el detalle se resuelve contra `clients` y el cliente borrado ya no está ahí (`:629` + `:538`) → la ficha fantasma no puede aparecer. Lo que el saneo limpia es la URL, que es cosmético. Ese razonamiento es correcto y está bien colocado.

**Lo que queda abierto de C-1** (y por eso el criterio 3 no es VERIFIED): la composición `resolveViewParam → panelHistoryAction` que los tests miden (`lib/panel-history.test.ts:245-260`) es una **reimplementación** de lo que hace el efecto, no el efecto. Comparé las dos: coinciden (misma causa, mismo `from`, mismo `to`). Pero el ORDEN real —efecto que corre al bajar el flag, regla 0 que difiere, `back()` del overlay que asienta, efecto que reintenta y consume— sólo se observa en un navegador.

---

## NAV-06 — los tres intocables

| Archivo | Último commit que lo tocó | ¿Lo tocó la fase? |
|---|---|---|
| `lib/overlay-history.ts` | `ed4d986` (2026-09-28, quick `260928-seo`) | **No** |
| `lib/unsaved-changes.ts` | `505667a` (2026-08-31) | **No** |
| `components/dashboard/unsaved-changes-guard.tsx` | `1460f25` (2026-08-31) | **No** |

Los 5 commits de la fase (`ea9ab22`, `71457a5`, `9c52a94`, `483c36f`, `efcf9dd`) tocan exactamente: `lib/panel-history.ts` (nuevo), `lib/panel-history.test.ts` (nuevo), `test/panel-history-clients.test.ts` (nuevo), `app/(dashboard)/clients/page.tsx`, `app/(dashboard)/clients/clients-client.tsx` y planning. Nada más.

**Suites verdes (medido):** `npx vitest run --project pure test/overlay-history.test.ts lib/unsaved-changes.test.ts` → **35 passed / 2 archivos**.

**Candado contra la deriva del marcador:** `test/panel-history-clients.test.ts:256-266` exige que el literal `frjOverlay` siga existiendo en los dos módulos. Es la guarda correcta para una duplicación deliberada de literal.

---

## Cero cambio visual (criterio 5)

El diff de `71457a5` sobre `clients-client.tsx`, descontando comentarios, **no toca ni un nodo JSX ni una clase**. Lo único que cambia dentro del render son dos cuerpos de handler:

- `onClick={() => setSelectedId(client.id)}` → `onClick={() => applyPanelView({ cause: 'user-open', … })}` (`:859`)
- `onBack={() => setSelectedId(null)}` → `onBack={() => applyPanelView({ cause: 'user-close', … })}` (`:936`)

`showDetail = selectedId !== null` sigue igual (`:715`), el split `lg:w-80` sigue en `:723`, y el "Volver" `lg:hidden` con `ChevronLeft` sigue en `:1344-1345`. **No se agregó la ✕** que el criterio 3 menciona y que C-3 documenta como inexistente: correcto, está fuera de alcance por instrucción explícita.

---

## Artefactos requeridos

| Artefacto | Existe | Sustantivo | Cableado | Datos fluyen | Status |
|---|---|---|---|---|---|
| `lib/panel-history.ts` | ✓ 396 líneas | ✓ 9 exports, tabla de 4 acciones × 6 causas | ✓ importado en `clients-client.tsx:27-31` y usado en 4 call sites | ✓ lee `window.history.state` real | ✓ VERIFIED |
| `lib/panel-history.test.ts` | ✓ 356 líneas | ✓ 53 casos, 0 skips | ✓ corre en el carril `pure` | — | ✓ VERIFIED |
| `test/panel-history-clients.test.ts` | ✓ 277 líneas | ✓ 12 casos, 0 skips, con guardas de no-vacío | ✓ lee los fuentes reales | ✓ mutación → rojo (6/6) | ✓ VERIFIED |
| `app/(dashboard)/clients/page.tsx` | ✓ | ✓ `<Suspense fallback={null}>` en `:42-49` | ✓ envuelve al consumidor de `useSearchParams` | ✓ 3 queries con `.eq('business_id')` | ✓ VERIFIED |
| `app/(dashboard)/clients/clients-client.tsx` | ✓ | ✓ detalle derivado de la URL, 4 declaraciones, tabla `mergedInto` | ✓ | ✓ resuelve contra la lista del server | ✓ VERIFIED |

## Key links

| De | A | Vía | Status |
|---|---|---|---|
| Click en un cliente | entrada nueva + `useSearchParams` actualizado + detalle abierto | `applyPanelView({cause:'user-open'})` → `push` → `pushState` con state fresco (`lib/panel-history.ts:393`) | ✓ WIRED (efecto en el navegador → UAT) |
| `?c=<id>` | cliente seleccionado, o listado si no resuelve | `resolveViewParam` sobre `clients.find(...)` (`clients-client.tsx:538-541`) | ✓ WIRED |
| Borrado + `<Dialog>` cerrándose | cero escrituras de historial en ese commit | regla 0 + causa `concurrent` (`clients-client.tsx:645`, `lib/panel-history.ts:99,105`) | ✓ WIRED |
| Fusión con el modal abierto | detalle en el conservado + URL convergiendo con `replace` | `mergedInto` (`clients-client.tsx:700-704`) + efecto de reconciliación (`:573-602`) | ✓ WIRED (secuencia → UAT) |

## Spot-checks ejecutados

| Chequeo | Comando | Resultado | Status |
|---|---|---|---|
| Criterio 4 (grep) | `grep -rE 'pushState\|replaceState\|history\.back' "app/(dashboard)/clients/"` | rc=1, 0 hits | ✓ PASS |
| Suites de la fase | `npx vitest run --project pure test/panel-history-clients.test.ts lib/panel-history.test.ts` | 65 passed / 2 archivos | ✓ PASS |
| Suites de NAV-06 | `npx vitest run --project pure test/overlay-history.test.ts lib/unsaved-changes.test.ts` | 35 passed / 2 archivos | ✓ PASS |
| Mutación ×6 | ver tabla de C-1 | 6 rojos / 6 mutaciones | ✓ PASS |
| Lint de los archivos de la fase | `./node_modules/.bin/eslint <5 archivos>` | rc=0, salida vacía | ✓ PASS |
| Migraciones | `ls supabase/migrations` | última = `079_…`, cero nuevas → la próxima libre sigue siendo la **080** | ✓ PASS |
| Paquetes nuevos | `git diff HEAD~5 -- package.json package-lock.json` | sin cambios | ✓ PASS |
| `npm run build` | **NO ejecutado a propósito** | `next build` escribiría en el mismo `.next/` que usa el `next dev` del puerto 80 que el dueño tiene levantado | ? SKIP → UAT |

> Tomo como dadas tus mediciones: `./node_modules/.bin/tsc --noEmit` → 0 `error TS`; `npx vitest run` → 1460 passed / 100 archivos. No las repetí y no medí nada que las contradiga.
>
> `npm run lint` global: **rc=1 por deuda PREEXISTENTE** de `react-hooks` en archivos ajenos a esta fase. Lo medible de la fase es eslint sobre sus 5 archivos: **rc=0, 0 problemas**.

## Cobertura de requisitos

| Requisito | Descripción | Status | Evidencia |
|---|---|---|---|
| **NAV-01** | Abrir un cliente empuja entrada; el back vuelve al listado con búsqueda y filtros | ⚠️ PRESENTE, comportamiento a UAT | Mecanismo completo (`:859` → `push`); el estado del listado sobrevive por construcción; falta la observación en celular. ⚠ Nota de forma: el requisito dice "ruta propia" y se implementó en la **query** (`?c=`) — es **D-03**, decisión cerrada del dueño, no una desviación |
| **NAV-02** | URL recargable/compartible; id inexistente o de otro negocio no filtra nada | ✓ SATISFECHO | Ver sección Criterio 2. Es el único punto de seguridad de la fase y está cerrado por estructura |
| **NAV-05** | Una sola forma: helper compartido que decide push vs replace | ✓ SATISFECHO | `lib/panel-history.ts` + grep 0 hits + `never` exhaustivo + causa `filter` lista para T-3 |
| **NAV-06** | No rompe Bug A ni el guard de cambios sin guardar | ⚠️ PRESENTE, comportamiento a UAT | Los 3 intocables sin tocar (git), sus suites verdes (35/35), cero cambio visual (diff). La mitad "el back sigue cerrando el overlay" es runtime |

**Huérfanos:** ninguno. REQUIREMENTS.md mapea NAV-01/02/05/06 a la Phase 1 y los 4 están declarados en `01-01-PLAN.md`.

## Anti-patrones

| Archivo | Patrón | Severidad | Impacto |
|---|---|---|---|
| — | `TBD` / `FIXME` / `XXX` / `HACK` / `PLACEHOLDER` en los 5 archivos de la fase | — | **Ninguno encontrado.** (Los hits de `TODO` son la palabra española "TODO/TODOS" dentro de comentarios: `test/panel-history-clients.test.ts:223`, `clients-client.tsx:68`) |

Sin stubs, sin retornos vacíos, sin props huecas. La única función que toca `window` está aislada (`applyPanelView`) y devuelve la acción efectiva para que el call site sepa si la escritura ocurrió o quedó diferida.

## Auditoría de calidad de los tests

| Archivo | Req | Activos | Skipped | Circular | Nivel de aserción | Veredicto |
|---|---|---|---|---|---|---|
| `lib/panel-history.test.ts` | NAV-05 | 53 | 0 | No | Valor (`toBe('push'/'replace'/'consume'/'none')`, `toEqual`) | ✓ Sólido |
| `test/panel-history-clients.test.ts` | NAV-01/02/05/06 | 12 | 0 | No | Valor sobre el fuente, con guarda de no-vacío antes de cada aserción negativa | ✓ Sólido — **verificado por mutación**, no por lectura |

**Procedencia de los valores esperados:** no circular. Los esperados son la política declarada en el ROADMAP/CONTEXT, escritos a mano; nada se genera corriendo el sistema bajo prueba.

**La crítica que dejo anotada** (no es un gap, es el límite del método): el caso compuesto de `lib/panel-history.test.ts:245-260` reimplementa el encadenado del efecto en vez de ejecutarlo. Si mañana el efecto cambia el `from` o la causa que le pasa al ejecutor, esa suite sigue verde — lo que lo cubre es el barrido por región del otro archivo, que es texto. Es lo máximo alcanzable sin jsdom, y el milestone prohíbe jsdom.

## Cobertura de decisiones

`check.decision-coverage-verify` devolvió `could-not-parse` (el CONTEXT.md usa prosa con encabezados `### C-n`, no un bloque `<decisions>` parseable). **No bloquea.** Verifiqué a mano las decisiones que importan:

| Decisión | ¿Honrada? | Evidencia |
|---|---|---|
| **D-01** historia honesta: cero intercepción de `popstate`, cero entradas falsas | ✓ | `grep 'popstate'` sobre `app/(dashboard)/clients/` y `lib/panel-history.ts` → 0 hits |
| **D-03** el detalle en la query, no en `/clients/[id]` | ✓ | No existe `app/(dashboard)/clients/[id]`; `VIEW_PARAM = 'c'` (`clients-client.tsx:56`) |
| **C-2** `<Suspense>` con el molde del repo | ✓ | `page.tsx:42-49` |
| **C-3** en desktop el detalle no se cierra, y no se arregla acá | ✓ | No se agregó ✕; el único cierre sigue siendo el `lg:hidden` de `:1344` |
| Cero migraciones / cero paquetes | ✓ | Última migración `079`; sin cambios en `package*.json` |

## Advisory (nuevo alcance, sin evidencia determinística)

No aplica — verificación inicial, no re-verificación. No levanté ningún hallazgo nuevo fuera del contrato de la fase.

## Lo que queda a cargo del dueño

La fase **no se puede cerrar con lo que una máquina puede medir**: el milestone es el botón atrás de un celular. Queda a tu cargo, en un teléfono real (`allowedDevOrigins` ya tiene la IP de LAN, `next.config.ts:51` — ⚠ sin commitear todavía):

1. Finanzas → hamburguesa → Clientes (con buscador escrito y los 3 filtros puestos) → abrir cliente → **atrás**.
2. F5 sobre `/clients?c=<id>` y la misma URL pegada en otra pestaña.
3. `?c=<inexistente>` y `?c=<id de otro negocio>` → mismo resultado, sin diferencia.
4. "Volver", borrado con el detalle abierto, fusión de duplicados con la ficha del duplicado abierta.
5. Back con un overlay abierto (importar CSV / borrar / fusionar).
6. **A→B → "Volver"**: por la decisión ① del plan, devuelve la ficha A, no el listado. Confirmá que ese comportamiento es el que querés.
7. `npm run build` con el dev server bajado (el SUMMARY lo declara rc=0; yo no lo re-medí para no pisarle el `.next/` al server del puerto 80).

---

_Verificado: 2026-09-29T17:03:39Z_
_Verificador: Claude (gsd-verifier)_
