---
phase: 21-lo-que-el-negocio-declara
verified: 2026-09-13T04:56:43Z
status: passed
score: 9/9 automatable truths verified (14/14 total truths closed by code+UAT, 0 failed)
covered_files: [".planning/workstreams/motor-reservas/REQUIREMENTS.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-01-PLAN.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-01-SUMMARY.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-02-PLAN.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-02-SUMMARY.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW-FIX.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-REVIEW.md", ".planning/workstreams/motor-reservas/phases/21-lo-que-el-negocio-declara/21-UAT.md", "app/(dashboard)/agenda/agenda-client.tsx", "app/(onboarding)/onboarding/page.tsx", "components/agenda/block-services-line.tsx", "lib/onboarding-agenda.ts", "supabase/migrations/077_duration_invariant.sql", "test/onboarding-agenda-rpc.test.ts", "test/onboarding-agenda.test.ts"]
covered_digest: "v1:sha256:b1e49e9e35127c038e2be990d702d6d5df0ad480515e3132b4cdddfc61154625"
behavior_unverified: 0
overrides_applied: 0
not_deployed:
  state: "NOTHING IN THIS REPORT IS DEPLOYED"
  local_migration: 077
  prod_migration: 076
  commits_ahead_of_origin: 44
  note: "Migración 077 está aplicada y verificada en el Postgres LOCAL únicamente (confirmado en vivo: 8 casos |db| de test/service-duration-invariant.test.ts en verde contra los CHECK reales y contra el guard `invalid_duration` del RPC). Producción sigue en 076 y `main` local está 44 commits adelante de `origin/main`. Un verde acá significa 'correcto en el árbol y en la base local', NO 'shipped'. El runbook de deploy (código primero, después la 077 a mano en el SQL editor) está en el SUMMARY del quick 260912-pm1 y en la cabecera del propio archivo de migración."
re_verification:
  previous_status: passed
  previous_score: "9/9 automatable truths verified (13/14 total truths closed)"
  reason: "El reporte anterior (2026-09-12T19:03:04Z) quedó rancio: cayeron 31e5008 (spacing del alta), 65c12e9/0b29132 (bookkeeping de UAT) y sobre todo el quick 260912-pm1 (9b63dbf..657e279), que reescribió internals de dos archivos cubiertos (`app/(onboarding)/onboarding/page.tsx`, `lib/onboarding-agenda.ts`) y agregó la migración 077. El covered_digest anterior (v1:sha256:c04450cb...) ya no matchea el árbol."
  gaps_closed:
    - "UAT item 8 (anuncio del lector de pantalla) — pasó de `blocked` a PASS con NVDA real instalado en la sesión de retest. Truth 12 queda CERRADA en sus dos mitades; ya no hay truth parcialmente verificada."
    - "G-21-11 (campos numéricos del paso 2 no vaciables + falta de aviso con Min. en 0) — cerrado por el quick 260912-pm1 (9b63dbf..b4c408e) y re-testeado en UAT test 11: PASS. Sale del bloque `advisory` de este reporte."
    - "G-21-10 / G-21-12 / G-21-13 — los tres re-testeados en celular real (UAT tests 10/12/13): PASS. 31e5008 ajustó además el aire superior pedido durante ese retest."
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "La corrida completa de `npx vitest run` de esta sesión salió en rojo: 5 tests fallados en 2 archivos `|db|` de abonos (`test/abono-create.test.ts` caso 7, `test/abono-generation.test.ts` casos 5b/5c/6/7). MEDIDO como flakiness de entorno, no regresión: la falla raíz es un `Test timed out in 5000ms` (el default de vitest) en un test DB-backed, y los otros cuatro son la cascada de la fila que ese timeout dejó sin limpiar (5c ve `slot_taken`, 7 cuenta 1 en vez de 0, 6 y el 7 de create vuelven a timeoutear contra el estado sucio; `purgeAbonos` aborta con `abono_has_future_turns`). Re-corridos los dos archivos SOLOS: 24/24 en verde, exit 0."
    category: other
    reason: "Fuera del alcance de la Phase 21: ninguno de los dos archivos es tocado por esta fase ni por el quick, los dos están sin modificar en el working tree, y 1149 passed + los 5 flakeados = 1154, exactamente el baseline esperado. No bloquea (evidence gate de re-verificación: no es un gap arrastrado ni un archivo modificado desde el reporte anterior, y la evidencia determinística que conseguí apunta a entorno). Lo que sí merece trabajo propio: esos tests DB-backed corren con el `testTimeout` default de 5s y no aíslan su estado, así que cualquier lentitud de la suite completa los tumba en cadena."
    evidence_status: "evidenced — full run: `Test Files 2 failed | 86 passed (88)`, `Tests 5 failed | 1149 passed | 4 expected fail | 1 skipped (1159)`. Aislados: `Test Files 2 passed (2)`, `Tests 24 passed (24)`, exit 0."
  - finding: "`toNumberOr` (el fix WR-03 de la fase) ya no se llama desde `app/(onboarding)/onboarding/page.tsx`: el quick lo metió detrás de `normalizeServiceDuration`/`normalizeServicePrice`. Sigue exportado y con suite propia (5 casos), y sus únicos consumidores de producción son ahora los dos normalizadores del mismo módulo."
    category: architectural
    reason: "Reubicación, no pérdida: la garantía de WR-03 ('un input vaciado no serializa NaN contra una columna NOT NULL') se cumple ahora en una capa más afuera y está probada dos veces — en `toNumberOr` y en `buildServiceRows`. Se anota porque el símbolo quedó como helper interno exportado: si mañana alguien lo borra por 'no lo usa nadie', se lleva los dos normalizadores."
    evidence_status: "evidenced — `toNumberOr` en el repo: definición en `lib/onboarding-agenda.ts:161`, llamadas en `:201` y `:218`, resto sólo en `test/onboarding-agenda.test.ts`. Ya no figura en el bloque de imports de `page.tsx` (líneas 20-33)."
human_verification:
  - test: "Con el negocio semilla en local, a 375px: paso Horarios con 3 servicios cargados y el toggle apagado no muestra ni chips ni aviso."
    expected: "Ninguna línea de chips ni aviso al pie visible con el toggle en No."
    why_human: "Es render de un client component; el runner corre en environment:'node' y no monta JSX."
    uat_outcome: pass
  - test: "Prender el toggle, marcar 'Cerámica' sólo en el martes. Mirar el aviso al pie del paso Horarios."
    expected: "'Yoga' y 'Masaje' nombrados en el aviso, en gris (text-muted-foreground), sin ícono ni color de error."
    why_human: "Tono visual y color no verificables por grep; sólo se probó que el texto y el nodo role=\"status\" existen."
    uat_outcome: pass
  - test: "Con el aviso en pantalla, click en Finalizar."
    expected: "El botón está habilitado y el alta termina (redirect a dashboard)."
    why_human: "El gate estructural (handleFinish no referencia el aviso) está probado por grep/awk; que el click realmente funcione en el navegador no lo prueba ningún test."
    uat_outcome: pass
  - test: "Cerrar los 7 días del paso Horarios."
    expected: "El aviso desaparece (string vacío) en vez de listar los dos servicios del catálogo."
    why_human: "Cubierto por unit test + prueba de mutación a nivel de función pura; falta la confirmación de que el string vacío efectivamente no deja un hueco visual ni texto residual en el DOM."
    uat_outcome: pass
  - test: "Crear/editar un negocio de rubro 'canchas' y entrar al paso Horarios."
    expected: "Ni el toggle ni el aviso ni la línea de chips aparecen; el paso Horarios se sigue mostrando igual que siempre."
    why_human: "canMapServicesInVertical() está correctamente cableado en código, pero el render condicional en el navegador no está probado por ningún test (environment:'node')."
    uat_outcome: pass
  - test: "Comparar visualmente el panel de Agenda (dashboard) antes/después de la extracción del editor de chips: colapso, foco visible, área táctil de 44px, congelado durante el guardado."
    expected: "Cero diferencia de comportamiento o layout frente al estado anterior a la Fase 21."
    why_human: "El diff textual (comment-stripped) del bloque movido a components/agenda/block-services-line.tsx es idéntico salvo imports (confirmado en 21-REVIEW.md punto 1), pero la equivalencia VISUAL en el navegador no la puede afirmar un test en environment:'node'."
    uat_outcome: pass
  - test: "Abrir el alta en http://192.168.x.x:3000 (LAN, sin HTTPS) desde el celular, paso 2 (Servicios)."
    expected: "La pantalla renderiza con normalidad (no queda en blanco)."
    why_human: "WR-02 (randomUUID ausente en contexto inseguro) se corrigió y se probó por mutación que la rama de fallback SE EJECUTA con un doble de Crypto sin randomUUID, pero la confirmación end-to-end en el dispositivo real sigue siendo UAT, como el propio REVIEW-FIX declara."
    uat_outcome: pass
    uat_note: "Probado en celular real sobre http://192.168.0.7:3000 (contexto inseguro). El bloqueo inicial ('no funcionan los botones') era allowedDevOrigins de next dev, no código de la fase."
  - test: "Con un lector de pantalla (VoiceOver/NVDA), enfocar el switch '¿Cada franja es para un servicio puntual?'."
    expected: "Se anuncia la pregunta completa junto con el estado (encendido/apagado), no sólo 'Sí/No, switch'."
    why_human: "WR-04 se corrigió (aria-labelledby en vez de aria-pressed) y el lint confirma que el único diagnóstico nuevo desapareció, pero el anuncio real de un lector de pantalla no lo prueba ningún test."
    uat_outcome: pass
    uat_note: "CERRADO CON NVDA REAL. Estaba `blocked` en el reporte anterior por falta de lector de pantalla en el entorno; se instaló NVDA en Windows y se escuchó el anuncio: el switch se lee con su pregunta completa más el estado, no sólo con el valor. Evidencia OÍDA, no inferida del lint."
  - test: "Vaciar el campo de hora de inicio o fin de un bloque en el paso Horarios y tocar Finalizar (o cambiar de paso)."
    expected: "El error 'Completá la hora de inicio y la de fin.' aparece pegado debajo de los inputs de esa franja, no en otro lugar de la pantalla."
    why_human: "isValidBlockTime está wireado antes de la comparación de orden (confirmado en el código), pero la posición visual del mensaje de error no la prueba ningún test de este repo."
    uat_outcome: pass
  - test: "[incidental, G-21-10] Paso 1 (Tu negocio), mobile: posición del botón 'Cerrar sesión' respecto del logo."
    expected: "El botón no se superpone al lockup de Forjo."
    why_human: "Layout responsive a ~390px en un dispositivo real."
    uat_outcome: pass
    uat_note: "Re-testeado en celular real tras 670f7b2; el aire superior adicional pedido durante el retest se aplicó en 31e5008."
  - test: "[incidental, G-21-11] Paso 2 (Servicios), mobile: borrar con el teclado el 0 de Precio y el valor de Min."
    expected: "El campo se vacía con backspace; vacío toma el default al salir y un 0 explícito queda en 5 con aviso inline."
    why_human: "El runner corre en environment:'node': no hay DOM, así que la parte de teclado —que es literalmente la queja— no la puede probar ningún test de este repo."
    uat_outcome: pass
    uat_note: "Re-testeado tras el quick 260912-pm1 (9b63dbf..b4c408e)."
  - test: "[incidental, G-21-12] Paso 1, mobile: desplegable de Rubro."
    expected: "Las opciones se leen completas y el panel no desborda el viewport."
    why_human: "Ancho de un popup anclado, en un dispositivo real."
    uat_outcome: pass
  - test: "[incidental, G-21-13] Paso Horarios, mobile: ancho de los inputs de hora."
    expected: "La hora se lee completa (9:00 a.m. / 6:00 p.m.), sin recortar el sufijo AM/PM."
    why_human: "Depende del locale de 12h del navegador real; no reproducía en escritorio a 24h."
    uat_outcome: pass
---

# Phase 21: Lo que el negocio declara — Verification Report

**Phase Goal:** Que un negocio de clases pueda declarar su agenda real **desde el alta**, en vez de que
se le pida un horario genérico que no describe su negocio y tenga que corregirlo después en el panel.

**Verified:** 2026-09-13T04:56:43Z
**Status:** passed
**Re-verification:** Yes — tercera pasada. El reporte anterior (`passed`, 2026-09-12T19:03:04Z) quedó
rancio cuando aterrizó el quick `260912-pm1`, que **reescribió los internals de dos archivos cubiertos**.
Las 9 truths automatizables se re-verificaron desde cero contra el árbol ACTUAL; ninguna se arrastró.

> ⚠ **Nada de esto está deployado.** La migración 077 está aplicada y verificada en el Postgres
> **LOCAL** únicamente; producción sigue en **076**, y `main` está **44 commits adelante** de
> `origin/main`. Un verde en este reporte significa "correcto en el árbol y en la base local", no
> "shipped". El orden de deploy no es libre: primero el código, después la 077 completa y de una sola
> vez en el SQL editor (runbook en el SUMMARY del quick y en la cabecera de la migración).

## Goal Achievement

El goal está alcanzado en sus dos mitades, y esta vez sin asteriscos. La mitad funcional/datos se
re-midió en vivo contra el Supabase local. La mitad visual/UX —que ningún test de este repo
(`vitest`, `environment: 'node'`) puede ejercitar— quedó **cerrada por completo**: `21-UAT.md` es
`status: complete` con **13/13 pass, 0 issues, 0 skipped, 0 blocked**. El único ítem que el reporte
anterior dejó formalmente sin verificar (el anuncio del lector de pantalla) se cerró con **NVDA real**,
no inferido del lint. **Ya no hay ninguna truth parcialmente verificada.**

### Lo interesante: el quick `260912-pm1` movió dos truths de lugar sin romper ninguna

Esto no es una nota al pie. El quick entró a cerrar G-21-11 y terminó reescribiendo el borde por donde
pasan los datos de dos truths de esta fase. **Las truths siguen ciertas, pero dos de ellas las cumple
código distinto del que verifiqué la primera vez.** Auditado leyendo el código, no el commit message:

| Qué cambió | Truth afectada | Antes (lo que verifiqué el 12/09) | Ahora | Veredicto |
|---|---|---|---|---|
| El estado del paso 2 tipa `duration_minutes`/`price` como **`string`**, no `number` (`page.tsx:78-95`) | 5 | `Service.duration_minutes: number`; el input era estado numérico controlado | Texto crudo en el estado; el número se produce en dos capas: `onBlur` (a la vista) y `buildServiceRows` (al payload) | ✓ **RELOCADA, no roto.** La truth habla del **`id`**, que es `string` desde siempre y no se tocó |
| El filtro + la coerción del insert salieron de `handleFinish` y entraron a **`buildServiceRows`** (`lib/onboarding-agenda.ts:237`) | 5, 6 | `esServicioVigente` se aplicaba inline en el submit; `id: s.id` escrito a mano en el `.map()` | `buildServiceRows(services, business.id)` filtra por el MISMO `esServicioVigente`, conserva `id: s.id` y deriva `business_id` del argumento | ✓ **RELOCADA y REFORZADA.** Lo que antes era una expresión suelta en un client component (no testeable: el runner no monta JSX) ahora es función pura con 4 casos propios, incluido *"conserva el uuid de entrada (Pitfall 1)"* y *"el business_id sale del argumento, nunca de la fila"* |
| `toNumberOr` (el fix WR-03 de esta fase) dejó de llamarse desde `page.tsx` | — | Llamado en cada `onChange` | Vive detrás de `normalizeServiceDuration`/`normalizeServicePrice` | ✓ **RELOCADA.** La garantía se cumple una capa más afuera y está probada dos veces. Anotado en `advisory` porque quedó como helper interno exportado |
| Migración **077**: CHECK en `services.duration_minutes > 0`, CHECK `NOT VALID` en `appointments`, y guard `invalid_duration` dentro de `book_slot_atomic` | — (fuera de las truths) | La invariante "un servicio dura >0" sólo vivía en la memoria de cada formulario | Vive en Postgres | ✓ **NO TOCA ninguna truth de la fase.** No cambia `save_agenda_blocks`, ni `time_block_services`, ni RLS, ni ningún filtro por `business_id`. Los 4 casos `\|db\|` del RPC de la agenda corren igual de verdes contra la base con la 077 puesta |

**Lo que NO cambió** (verificado símbolo por símbolo, no asumido): `newServiceId`, `esServicioVigente`,
`franjaServiceIdsVigentes`, `shouldMapServices`, `canMapServicesInVertical`, `servicesWithoutCoverage`,
`buildOnboardingAgendaPayload`, `onboardingDraftBlocks`, la llamada a `save_agenda_blocks`, la ausencia
de `.select()` en el insert de `services`, el markup del switch, y `validateHours`. El insert sigue sin
round-trip y sigue mandando `id: s.id`.

`31e5008` se auditó hunk por hunk: **7 inserciones / 3 borrados, 4 de las inserciones son comentario**.
Los tres cambios reales son clases de Tailwind (`p-4 pt-3 sm:pt-4`, `mt-0 sm:mt-8`, `mb-1`→`mb-3`).
Cero props, cero handlers, cero lógica. Behavior-neutral, confirmado por el diff.

### Observable Truths

| # | Truth | Status | Evidence (re-corrida sobre el árbol ACTUAL) |
|---|-------|--------|--------------------------------------|
| 1 | Una franja declarada en el alta (toggle on + servicio marcado) termina siendo fila real en `time_block_services`, apuntando al servicio correcto | ✓ VERIFIED | `npx vitest run test/onboarding-agenda-rpc.test.ts` caso (a) corrió **en vivo contra el Supabase local en esta sesión**, tagueado `\|db\|`, sin skip. Los 4 casos `\|db\|` en verde **con la migración 077 ya aplicada en esa misma base** |
| 2 | El onboarding ya no escribe `time_blocks` a mano; la única escritura es `supabase.rpc('save_agenda_blocks', ...)`, así que franjas+mapeo entran en una sola transacción de PostgREST | ✓ VERIFIED | `grep -n save_agenda_blocks` → 3 hits, el único ejecutable en `page.tsx:560` con `p_business_id: business.id` (tenant de la sesión, no del form). `timeBlocksToInsert` = **0** ocurrencias; `capacity: 1` = **0** (D-12: el RPC omite la columna, aplica el default de la base) |
| 3 | Un negocio que nunca toca el toggle se guarda exactamente como antes — comodín en todo, puente vacía | ✓ VERIFIED | Caso `\|db\|` (b) *"toggle APAGADO al finalizar: las franjas se crean y la puente queda vacía (D-10)"* + el caso puro D-10, los dos verdes en vivo |
| 4 | El toggle apagado al finalizar persiste comodín en TODAS las franjas aunque el estado local tenga un mapeo cargado, y ese mapeo sigue vivo en memoria | ✓ VERIFIED | Caso puro *"con el toggle APAGADO todas las franjas viajan en comodín, aunque el estado tenga mapeo (D-10)"* verde; el handler en `page.tsx:1092` sigue siendo `onClick={() => setPerFranja(v => !v)}` — no toca `dayStates` |
| 5 | Cada servicio del paso 2 nace con un id estable generado en el cliente que es el MISMO `services.id` insertado — renombrar preserva el mapeo, sin correlación por posición | ✓ VERIFIED **(lo cumple código nuevo)** | `newServiceId()` en `page.tsx:146` (inicializador lazy) y `:227`. El insert en `:498-506` es `buildServiceRows(services, business.id)` → `supabase.from('services').insert(filasDeServicios)`, **sin `.select()`** (leído completo). `buildServiceRows` (`lib/onboarding-agenda.ts:237-255`) devuelve `id: s.id` literal; el caso *"conserva el uuid de entrada (el mapeo del paso 4 lo referencia — Pitfall 1)"* es NUEVO y está verde. El PK del cliente sobrevive un INSERT real bajo la sesión del dueño (caso `\|db\|` a) |
| 6 | CR-01: la línea de chips, el aviso D-07 y el payload persistido ya no pueden discrepar sobre la misma franja cuando a un servicio mapeado se le vacía el nombre | ✓ VERIFIED **(un borde lo cumple código nuevo)** | `esServicioVigente` (`lib/onboarding-agenda.ts:52`) es el criterio único en los tres bordes: **payload** (ahora dentro de `buildServiceRows:252` en vez de inline en el submit), **chips** (`page.tsx:630` → `chipCatalog`, y `:1176` → `serviceIds={franjaServiceIdsVigentes(b.service_ids, chipCatalogIds)}`, ids filtrados), **aviso** (`servicesWithoutCoverage:375`). Los 3 casos de regresión CR-01 verdes por nombre esta sesión |
| 7 | El editor de chips existe exactamente una vez en el repo, compartido por panel y onboarding | ✓ VERIFIED | `components/agenda/block-services-line.tsx` = 243 líneas, exporta `ServiceCatalogItem` (:28) y `BlockServicesLine` (:129). `grep -rn "function BlockServicesLine"` en todo el repo → **1 sola definición**, la del componente. Panel: import en `agenda-client.tsx:34`, call site `:1304`. Onboarding: import `page.tsx:19`, call site `:1175` |
| 8 | El gate que decide si el mapeo se persiste (`vertical`, `perFranja`, `servicesFailed`) es una regla única, testeable y no invertible (WR-05) | ✓ VERIFIED | `shouldMapServices()` en `lib/onboarding-agenda.ts:94`, usado textual en `handleFinish` (`page.tsx:556`). Su tabla de verdad de 8 filas verde por nombre esta sesión, más *"el gate y el payload son la MISMA decisión"* y el caso `canMapServicesInVertical` |
| 9 | La guarda de cero franjas de D-07 usa `hasScheduleCoverage` (la que tiene el guard), nunca el `isServiceScheduled` crudo | ✓ VERIFIED | `grep -vE "^\s*(\*\|//\|/\*)" lib/onboarding-agenda.ts \| grep -c isServiceScheduled` = **0**. `hasScheduleCoverage` importado en `:30` y usado en `:375`. Caso *"con los SIETE días cerrados no avisa de nada (la guarda del negocio sin franjas, CR-01)"* verde |
| 10 | El toggle, la línea de chips y la línea guía se ocultan bien para el vertical `canchas` (se esconde el control, no el paso) | ✓ VERIFIED (code + UAT) | `canMapServicesInVertical(vertical)` gatea los tres sitios de render: `page.tsx:627` → `canMapServices`, `:641` → `showServicesToggle`, `:1107` línea guía, `:1174` chips. **UAT test 5: PASS** |
| 11 | El panel (`agenda-client.tsx`) se comporta y se ve idéntico después de extraer el editor de chips | ✓ VERIFIED (code + UAT) | Call site intacto en `:1304`, mismas props; `tsc` exit 0 sin una sola línea de salida; diagnósticos de eslint idénticos al baseline. **UAT test 6: PASS** — colapso, foco visible, 44px y el congelado durante el guardado comparados lado a lado |
| 12 | El toggle y los chips se leen y se usan bien en mobile (375px), y el switch se anuncia correctamente a la tecnología asistiva | ✓ VERIFIED (code + UAT) — **las DOS mitades** | Mobile: **UAT tests 1 y 2 PASS a 375px**. AT: markup canónico WAI-ARIA — `role="switch"` + `aria-checked={perFranja}` + `aria-labelledby="per-franja-label"` (`page.tsx:1089-1091`); el único `aria-pressed` que queda (`:1120`) está en el `<button>` de día, rol button, pre-existente y válido. `jsx-a11y/role-supports-aria-props` no dispara. **UAT test 8: PASS con NVDA real** — el anuncio se OYÓ, ya no se infiere del lint. Esta es la truth que el reporte anterior dejaba a medias |
| 13 | El error de hora vacía se renderiza pegado a los inputs que lo causaron | ✓ VERIFIED (code + UAT) | `validateHours()` en `page.tsx:402-418` corre `!isValidBlockTime(start) \|\| !isValidBlockTime(end)` **antes** de la comparación `end <= start`, y escribe `error` sobre el bloque mismo. **UAT test 9: PASS** |
| 14 | `newServiceId()` degrada bien (sin pantalla en blanco) en un origen inseguro (`http://` LAN) | ✓ VERIFIED (code + UAT) | Tres casos verdes esta sesión: con `randomUUID`, **sin** `randomUUID` (devuelve un v4 válido), y sin `crypto` en absoluto. **UAT test 7: PASS en celular real** sobre `http://192.168.0.7:3000`; el "no funcionan los botones" inicial era `allowedDevOrigins` de `next dev`, no código de la fase |

**Score:** **9/9 automatable truths verified, 0 failed.** Con el UAT completo, **14/14 truths cerradas**
(era 13/14). Las 5 que el código sólo podía verificar estructuralmente están las 5 confirmadas en
pantalla. **0 truths present-behavior-unverified**: las transiciones de estado que importan (el mapeo
que llega a la puente, el comodín del toggle apagado, el PK del cliente que sobrevive el INSERT) las
ejercita un test `|db|` contra una base real, no un grep.

### Prohibitions (judgment tier — resueltas por el UAT, no por presencia)

| Prohibition | Source | Disposition | Evidence |
|-------------|--------|-------------|----------|
| La extracción de los chips no debe degradar lo que el panel ya tenía aprobado (44px, foco visible, live region fuera del flex, umbral de colapso) | 21-01 | ✓ HELD | UAT test 6 PASS — comparado en pantalla, no por grep |
| El alta no debe persistir un mapeo que la última pantalla no mostró, ni descartar en silencio uno que sí | 21-01 | ✓ HELD | Caso D-10 verde + el caso CR-01 de los tres bordes verde. El borde del payload cambió de lugar (`buildServiceRows`) pero usa el MISMO `esServicioVigente` |
| El toggle no debe tocar el modelo de datos: apagarlo revela menos, nunca borra el mapeo local | 21-01 | ✓ HELD | `setPerFranja(v => !v)` sigue siendo todo el handler; `dayStates` intacto (`page.tsx:1092`, leído) |
| El aviso de cobertura no debe bloquear el final del alta | 21-02 | ✓ HELD | Cuerpo de `handleFinish` (`:420-640`): **0** referencias a `sinCobertura`/`avisoSinCobertura` (awk sobre el rango). El botón sigue con su único `disabled={loading}` (`:1258`). UAT test 3 PASS |
| El aviso no debe presentarse como error de formulario | 21-02 | ✓ HELD | `<p role="status" className="text-xs text-muted-foreground">` en `page.tsx:1217` — sin ícono, sin color destructivo. UAT test 2 PASS sobre el tono |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components/agenda/block-services-line.tsx` | Editor de chips compartido, exporta `BlockServicesLine`/`ServiceCatalogItem` | ✓ VERIFIED | 243 líneas, sin cambios desde el reporte anterior; ambos exports presentes; consumido por panel **y** onboarding |
| `lib/onboarding-agenda.ts` | Traductor puro | ✓ VERIFIED | **376 líneas, 16 exports** (eran 12): los 12 anteriores intactos + `DEFAULT_SERVICE_MINUTES`, `normalizeServiceDuration`, `normalizeServicePrice`, `buildServiceRows` del quick. Sigue sin importar React ni Supabase (sólo `@/lib/agenda-hours-payload` y `@/lib/time-block-services`) |
| `app/(onboarding)/onboarding/page.tsx` | Id por servicio, `service_ids` por franja, toggle, chips, aviso D-07, submit por RPC | ✓ VERIFIED | 1267 líneas. Todos los símbolos cableados y re-localizados tras el quick + `31e5008`: `newServiceId` :146/:227, `perFranja` :160, `canMapServices` :627, `showServicesToggle` :641, `sinCobertura` :657, `buildServiceRows` :498, `BlockServicesLine` :1175, aviso :1217, RPC :560 |
| `app/(dashboard)/agenda/agenda-client.tsx` | Importa el componente extraído en vez de definirlo | ✓ VERIFIED | Import :34, call site :1304, cero definiciones locales. **Sin tocar por el quick** |
| `test/onboarding-agenda-rpc.test.ts` | Tracer end-to-end contra el Supabase local | ✓ VERIFIED, RE-CORRIDO EN VIVO | 4 tests `\|db\|` en verde contra la base real esta sesión, ninguno skipeado |
| `test/onboarding-agenda.test.ts` | Suite del traductor puro | ✓ VERIFIED, RE-CORRIDO EN VIVO | **46 tests `\|pure\|`** enumerados por nombre con `--reporter=verbose` (eran 33; +13 del quick: normalizadores + `buildServiceRows`, incluidas 2 pruebas de propiedad) |
| `supabase/migrations/077_duration_invariant.sql` | (del quick, no de la fase) Invariante de duración en la base | ✓ VERIFIED EN LOCAL, **NO EN PROD** | Existe; espejado en `supabase/schema.sql` (`invalid_duration` presente 1 vez en cada archivo). Los 8 casos `\|db\|` de `test/service-duration-invariant.test.ts` verdes contra los CHECK reales y contra el guard del RPC. **Prod sigue en 076** |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `page.tsx` submit | `lib/onboarding-agenda.ts` | `buildOnboardingAgendaPayload(dayStates, { mapServices: shouldMapServices(...), liveServiceIds })` | ✓ WIRED | `page.tsx:552-559`; `liveServiceIds` sale de `filasDeServicios.map(s => s.id)` — los ids que REALMENTE se insertaron |
| `page.tsx` submit | `lib/onboarding-agenda.ts` | **`buildServiceRows(services, business.id)`** (link NUEVO del quick) | ✓ WIRED | `page.tsx:498` → insert en `:506`. Único borde texto→número del catálogo |
| `lib/onboarding-agenda.ts` | `lib/agenda-hours-payload.ts` | delega en `buildSaveHoursPayload(days, { hasLocations: false })` | ✓ WIRED | `:29` import, `:284` llamada. Sin reimplementar el shape del payload |
| `page.tsx` | `components/agenda/block-services-line.tsx` | `<BlockServicesLine serviceIds={franjaServiceIdsVigentes(...)} …>` | ✓ WIRED | `:1175-1176` (ids filtrados por CR-01, no crudos) |
| `agenda-client.tsx` | `components/agenda/block-services-line.tsx` | import, call site intacto | ✓ WIRED | `:34`, `:1304` |
| `page.tsx` | `save_agenda_blocks` RPC (migr. 074) | `supabase.rpc('save_agenda_blocks', { p_business_id: business.id, p_blocks })` | ✓ WIRED, DB-VERIFIED | `:560`; confirmado por la corrida `\|db\|` en vivo |
| `lib/onboarding-agenda.ts` | `lib/time-block-services.ts` (`hasScheduleCoverage`) | import directo, sólo la función con guard | ✓ WIRED | `isServiceScheduled` fuera de comentarios = 0 |
| `app/(dashboard)/settings/settings-client.tsx` | `lib/onboarding-agenda.ts` | `DEFAULT_SERVICE_MINUTES`, `normalizeServiceDuration`, `normalizeServicePrice` (fan-out NUEVO del quick) | ✓ WIRED | `settings-client.tsx:25`. Fuera de las truths de la fase, pero ahora el módulo de la fase lo consumen **dos** superficies |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `p_blocks` al RPC | `dayStates` | `useState` local, mutado por interacción (`toggleBlockService`, `updateBlock`) | Sí — traducido por función pura y testeada; sin fallback estático | ✓ FLOWING |
| Filas de `time_block_services` post-submit | resultado del RPC | `save_agenda_blocks` (migr. 074) | Sí — la puente se leyó de vuelta con un admin client independiente en la corrida en vivo | ✓ FLOWING |
| Texto del aviso D-07 | `sinCobertura` | `servicesWithoutCoverage(services, dayStates)` en `page.tsx:657` — estado real del wizard, no mockeado | Sí | ✓ FLOWING |
| `filasDeServicios` al insert de `services` | `services` | Estado del paso 2 (ahora **texto crudo**), filtrado y coercionado por `buildServiceRows`, ids de `newServiceId()` | Sí — `id` es el PK del cliente, sin round-trip de `.select()`. Un campo vaciado cae al default en el borde, **nunca `null` contra una columna NOT NULL** (caso propio verde) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suite completa del workspace (corrida UNA vez, no filtrada por truth) | `npx vitest run` | `Test Files 2 failed \| 86 passed (88)`; `Tests 5 failed \| 1149 passed \| 4 expected fail \| 1 skipped (1159)`, exit 1 | ⚠️ ver abajo — **los 5 fallos son flakiness de entorno en tests de abonos, ajenos a esta fase** |
| Los 2 archivos fallados, aislados | `npx vitest run test/abono-generation.test.ts test/abono-create.test.ts` | `Test Files 2 passed (2)`, `Tests 24 passed (24)`, exit 0 | ✓ PASS — confirma flake, no regresión |
| Tests de la Phase 21 existen y pasan, enumerados por nombre | `npx vitest run test/onboarding-agenda-rpc.test.ts test/onboarding-agenda.test.ts --reporter=verbose` | `Test Files 2 passed (2)`, `Tests 50 passed (50)`; los 4 casos `\|db\|` corrieron en vivo, ninguno skipeado | ✓ PASS |
| La invariante de la 077 está en la base local (no sólo en el archivo) | `npx vitest run test/service-duration-invariant.test.ts --reporter=verbose` | `8 passed (8)`: CHECK de `services` rechaza 0 y negativos, `appointments` rechaza 0 y ACEPTA NULL, `book_slot_atomic` con `p_duration` 0 y NULL falla con `invalid_duration` y **sin dejar fila**, más el humo positivo | ✓ PASS (local) |
| Sin regresión de TypeScript (binario invocado directo — `npx tsc` siempre sale 0 en este repo) | `./node_modules/.bin/tsc --noEmit` | **exit 0, cero líneas de salida.** Los 4 errores de `.next/dev/types/validator.ts` que el pedido anticipaba no aparecieron en esta corrida; el filtro `^\.next/` deja 0 de todas formas | ✓ PASS |
| Diagnósticos de lint sobre los 4 archivos de la fase, contra el baseline | `npx eslint -f json <4 files>` | Exactamente **3**, los mismos 3 pre-existentes: `agenda-client.tsx:853 react-hooks/purity`, `page.tsx:13 @typescript-eslint/no-unused-vars` (`Badge`), `page.tsx:203 react-hooks/set-state-in-effect` (era :195, corrió 8 líneas). `jsx-a11y/role-supports-aria-props` ausente | ✓ PASS — cero diagnóstico nuevo |
| Una sola definición de `BlockServicesLine` en todo el repo | `grep -rn "function BlockServicesLine" --include=*.tsx .` | 1 hit: `components/agenda/block-services-line.tsx:129` | ✓ PASS |
| El working tree es lo que se verificó | `git status --porcelain -- app lib components supabase test` | vacío | ✓ PASS |
| Estado de deploy | `git rev-list --count origin/main..main`; `ls supabase/migrations \| tail` | **44**; última migración en disco = **077**, última en prod = **076** | ℹ️ NO DEPLOYADO (ver el aviso de arriba) |

**Sobre el rojo de la suite completa.** No lo absorbo ni lo escalo: lo medí. El fallo raíz es
`Test timed out in 5000ms` en `test/abono-generation.test.ts` caso 5b (el default de `testTimeout` de
vitest, en un test DB-backed). Ese timeout deja una ocurrencia sin limpiar, y de ahí sale la cascada:
5c ve un `slot_taken` que no esperaba, el 7 cuenta 1 fila donde esperaba 0, el 6 y el caso 7 de
`abono-create` vuelven a timeoutear contra el estado sucio y `purgeAbonos` aborta con
`abono_has_future_turns`. Aislados, los dos archivos dan **24/24 verde, exit 0**. Aritmética que cierra:
**1149 passed + 5 flakeados = 1154**, exactamente el baseline esperado — el contenido de la suite es el
que debe ser. Ninguno de los dos archivos lo toca esta fase ni el quick, los dos están limpios en el
working tree, y no son un gap arrastrado del reporte anterior. Queda en `advisory`, no en `gaps`.

### Probe Execution

No aplica — esta fase no tiene `scripts/*/tests/probe-*.sh` y ninguno se declaró en los planes.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AGENDA-08 | 21-01, 21-02 | El onboarding deja declarar la agenda real de un negocio de clases desde el alta | ✓ SATISFIED | Camino de datos probado en vivo contra la base local (una franja declarada llega a `time_block_services` con el servicio correcto); camino de UI confirmado por el UAT **completo** (13/13 PASS). `REQUIREMENTS.md:86` lo marca `[x]` y `:112` `Complete`. **Satisfecho en el árbol y en local; no deployado** |

Sin requirements huérfanos: `REQUIREMENTS.md` mapea sólo AGENDA-08 a la Phase 21, y la 21 es la última
fase del roadmap de este workstream.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/(onboarding)/onboarding/page.tsx` | 13 | `Badge` importado, nunca usado | ℹ️ Info | Pre-existente (IN-01 en `21-REVIEW.md`), deliberadamente fuera del alcance del fix |
| `app/(onboarding)/onboarding/page.tsx` | 203 | `react-hooks/set-state-in-effect` (derivación del slug) | ℹ️ Info | Pre-existente, intacto; sólo corrió de línea (:195 → :203) |
| `app/(dashboard)/agenda/agenda-client.tsx` | 853 | `react-hooks/purity` (`Date.now`) | ℹ️ Info | Pre-existente, en el panel, ajeno a esta fase |
| `lib/onboarding-agenda.ts` | 161 | `toNumberOr` exportado pero sin consumidores fuera del propio módulo | ℹ️ Info | Reubicación del fix WR-03; anotado en `advisory` para que nadie lo borre por "no lo usa nadie" |

**Cero markers de deuda** (`TBD`/`FIXME`/`XXX`) en los 4 archivos de implementación, en los 2 de test
y en la migración 077: `grep -nE "TBD\|FIXME\|XXX"` sobre los 7 archivos → sin hits. Sin placeholders
nuevos, sin handlers vacíos, sin datos vacíos hardcodeados alimentando el render. `IN-02`…`IN-05` de
`21-REVIEW.md` siguen documentados como diferidos a propósito en `21-REVIEW-FIX.md`.

### Human Verification — CERRADA, 13/13

`21-UAT.md` es `status: complete`: **total 13, passed 13, issues 0, pending 0, skipped 0, blocked 0.**

| # | Item | Outcome |
|---|------|---------|
| 1 | Toggle apagado a 375px: ni chips ni aviso | ✓ pass |
| 2 | El aviso nombra los servicios sin cobertura, en gris, sin estilo de error | ✓ pass |
| 3 | Finalizar sigue habilitado con el aviso en pantalla | ✓ pass |
| 4 | Siete días cerrados ⇒ el aviso no dice nada | ✓ pass |
| 5 | El vertical `canchas` oculta toggle/chips/línea guía | ✓ pass |
| 6 | El panel se ve idéntico después de extraer los chips | ✓ pass |
| 7 | Origen inseguro (`http://` LAN): el paso 2 renderiza en celular real | ✓ pass |
| 8 | El lector de pantalla anuncia la pregunta del switch + su estado | ✓ **pass — con NVDA real**. Estaba `blocked` (sin lector en el entorno); se instaló NVDA en Windows y se OYÓ el anuncio. Cierra WR-04 con evidencia escuchada, no inferida del lint. **Es el ítem que convierte la truth 12 de parcial en completa** |
| 9 | El error de hora vacía queda pegado a sus propios inputs | ✓ pass |
| 10 | (incidental G-21-10) El botón de salida no pisa el lockup en mobile | ✓ pass |
| 11 | (incidental G-21-11) Min. y Precio se vacían con el teclado; 0 avisa | ✓ pass |
| 12 | (incidental G-21-12) El desplegable de Rubro no aprieta ni desborda | ✓ pass |
| 13 | (incidental G-21-13) Los inputs de hora muestran el sufijo AM/PM completo | ✓ pass |

### Hallazgos incidentales del UAT — los 4 RESUELTOS

| Gap | Severity | State | Detalle |
|-----|----------|-------|---------|
| G-21-10 | cosmetic | ✓ resolved | Botón de salida pisando el lockup centrado a ~390px — cerrado por `670f7b2`, aire superior ajustado en `31e5008`, re-testeado en celular real |
| G-21-12 | cosmetic | ✓ resolved | Popup de Rubro apretando "Belleza/Estética/Spa" y desbordando el viewport — cerrado por `670f7b2` |
| G-21-13 | cosmetic | ✓ resolved | Inputs de hora recortando el sufijo AM/PM en locale de 12h — cerrado por `670f7b2` |
| G-21-11 | major | ✓ **resolved** | Campos numéricos del paso 2 no vaciables + falta de aviso con Min. en 0 — cerrado por el quick `260912-pm1` (`9b63dbf..b4c408e`) y re-testeado: PASS. **Era el único `OPEN` del reporte anterior** |

G-21-11 se cerró más allá del síntoma reportado: el fix no se quedó en el paso 2 del alta sino que
unificó las **tres** superficies que escriben `services` (alta, panel de canchas, Ajustes → Servicios)
detrás de un normalizador puro, y subió la invariante "un servicio dura más de 0 minutos" a Postgres
(migración 077, con guard `invalid_duration` en `book_slot_atomic`). El propio SUMMARY del quick
documenta que el doble-booking silencioso vía `p_duration = 0` quedó **medido** contra la base local
(turno creado encima de otro, cero errores, con las dos piezas de la 077 revertidas), no argumentado.
Nada de eso toca ninguna truth de la Phase 21 — lo registro porque amplía lo que hay que deployar.

### Gaps Summary

**Sin gaps.** Las 9 truths automatizables se re-verificaron contra el árbol actual con comandos
ejecutados en esta sesión: la suite completa una sola vez (88 archivos; 1149 passed + 5 flakes de
entorno medidos y descartados = 1154), los dos archivos de test de la fase enumerados por nombre
(50 passed, 4 de ellos `|db|` en vivo), la invariante de la 077 contra la base local (8 `|db|`),
`tsc --noEmit` por el binario directo (exit 0, sin salida) y eslint sobre los 4 archivos de la fase
(3 diagnósticos, los 3 pre-existentes).

El dato que importa de esta pasada no es el verde, es **dónde** está el verde: el quick `260912-pm1`
reubicó el borde de datos de las truths 5 y 6 (el filtro `esServicioVigente` y la coerción del insert
pasaron de una expresión suelta dentro de un client component a `buildServiceRows`, función pura con
4 casos propios). Las truths siguen ciertas y quedaron **mejor** probadas que cuando las verifiqué la
primera vez — lo que antes era imposible de testear (el runner no monta JSX) ahora tiene suite. El
`Service.duration_minutes`/`price` pasaron de `number` a `string`, pero la truth 5 habla del `id`, que
es `string` desde el primer día y no se tocó. La migración 077 no roza ninguna truth: no cambia
`save_agenda_blocks`, ni la puente, ni RLS, ni un solo filtro por `business_id`.

Dos cosas se reportan abiertas en vez de taparse, ninguna bloqueante:
1. **Los 5 tests de abonos que flakean en la corrida completa** — medidos como cascada de un timeout de
   5s en un test DB-backed sin aislamiento de estado; verdes en aislamiento. Ajenos a esta fase, pero
   la suite va a seguir dando rojos intermitentes hasta que esos tests suban su `testTimeout` o limpien
   lo que siembran.
2. **Nada está deployado.** Migración 077 sólo en local, prod en 076, `main` 44 commits adelante de
   `origin/main`. Este reporte certifica el árbol y la base local; no certifica producción.

---

_Verified: 2026-09-13T04:56:43Z_
_Verifier: Claude (gsd-verifier)_
