---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "05"
subsystem: testing
status: complete
tags: [uat, produccion, no-regresion, tabs, oauth, mercadopago, google-calendar, safari, android]

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "04-01..04-04: los tres grupos de tabs en la URL, el retorno del OAuth a Integraciones, Agenda por el helper, y B1 en la barra"
provides:
  - "## (g) en .planning/debug/tabs-en-la-url-medida.md: la no-regresión de la fase en una tanda, con la línea literal no-regresion (plan 04-05)"
  - "04-UAT-GUION.md: el guion de la UAT de la Phase 4 (bloques 0-9, 30 recorridos con Pasa si / Falla si)"
  - "04-UAT.md: la hoja del dueño, llenada por él en producción (974a131): 28 ✅, 2 ⚠, 0 ❌"
affects: [/gsd-verify-work 4 --ws panel-nav (marca MOB-08/MOB-09 y evalúa obs-1), MOB-08, MOB-09]

actuals:
  tokens: 9600
  tasks: 3
  commits: 3
plan_head_before: b4471c2f8b288f3296792d3c5f4557f644f814ea

tech-stack:
  added: []
  patterns:
    - "La UAT en el teléfono y en producción como único criterio de cierre: el ejecutor no sube nada, el orquestador sube main y el dueño anota con el commit desplegado"

key-files:
  created:
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-UAT-GUION.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-UAT.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-05-SUMMARY.md
  modified:
    - .planning/debug/tabs-en-la-url-medida.md

key-decisions:
  - "La FALLA de R-G3-10-primer-toque-atras-pronto en la sonda completa es el costo del camino 1 declarado el 2026-11-16 (misma tupla que en el 03-17 y el 04-04), no una regresión: P-8 no aplicó"
  - "El criterio 3 (OAuth real en producción) queda cubierto por tres ✅ del bloque 4 (4.2, 4.3, 4.4); 4.1 y 8.5 son ⚠ no corribles, sin línea de renuncia (no hizo falta)"
  - "obs-1 (scroll al inicio en el primer toque de un tab de Finanzas) se registra como observación y candidato a gap; no se diagnostica ni se arregla en este plan"

patterns-established:
  - "Un corte de la sonda por un ChunkLoadError del next dev de la sonda se re-corre sin cambios antes de llamarlo rojo"

requirements-completed: []

duration: 57 min de ejecución (11:44 → 12:41) + la UAT del dueño en producción (aprobada 17:30)
completed: 2026-11-17
---

# Phase 4 Plan 05: La no-regresión de la fase y la UAT del dueño en producción Summary

**La fase entera medida en verde en una tanda (sonda de la app 46/47 con la única FALLA declarada de G3-10, estática 18/18, pura 77/1804, completa 111/2111, tsc, build y criterio 5 en cero), un guion de 30 recorridos, y la UAT del dueño en `gestion.forjo.studio` sobre `974a131`: 28 ✅, 2 ⚠ no corribles, 0 ❌, OAuth real con tres ✅ — aprobada.**

## Performance

- **Duración:** 57 min de ejecución (2026-11-17, 11:44 → 12:41 hora de Argentina), con ~20 min de espera del turno de pantalla (lo tenía el Playwright del ERP); después, la UAT del dueño en producción, aprobada a las 17:30.
- **Tasks:** 3 de 3 (2 automáticos + el checkpoint bloqueante)
- **Archivos:** 1 modificado (el registro) y 2 creados (guion y hoja) antes de este SUMMARY

## Task 1 — la no-regresión en una tanda (`## (g)`)

- **Entorno:** 11:44, dentro de la ventana de los canarios [01:00, 23:30]; pila local arriba (no hizo falta `supabase start`); `negocio-prueba` en `trial|true`; sin `next dev` del dueño vivo (P-7 no aplicó); `Chrome/157.0.8103.52`, node `v24.15.0`, gesto `interfaz`.
- **Sonda de la app:** 47 medidos, 46 en `OK` (los doce `R-T-*`, `R-C-5`, `R-C-6`, los cuatro `R-B1-*` y todo lo de la Phase 3); cinco retirados no corren. Única `FALLA`: `R-G3-10-primer-toque-atras-pronto` (`atras_siguiente: sale`, esperado `avisa`), con la tupla idéntica a la del 03-17 y el 04-04.
- **Sonda estática:** 18/18. **Pura:** 77 archivos / 1804 + 3 expected-fail (piso 77/1764). **Completa** (`npm test`, carril `db`, 12:00): 111/111 archivos, 2111 + 4 expected-fail + 1 skipped (piso 2110).
- **`tsc --noEmit`:** cero `error TS`. **eslint** archivo por archivo (15 tocados desde `85c99ae`): ningún problema nuevo.
- **Build:** rc 0, 64/64 páginas, cero avisos de `useSearchParams` sin `<Suspense>`.
- **Criterio 5 crudo:** vacío. **Bloqueado desde `85c99ae`:** diff vacío; huella de `next.config.ts` `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`.
- Línea literal: `no-regresion (plan 04-05): sonda de la app 46/47 en OK, estatica 18/18, pura 77/1804, completa 111/2111, tsc limpio, build ok, criterio 5 en cero`.
- Gates: el primero da **rc 1, sólo por la FALLA declarada de G3-10** (ver desvíos); el segundo (`(g)` en su lugar, la línea, los cuatro cierres, fuentes limpias) en verde.

## Task 2 — el guion y la hoja

- `04-UAT-GUION.md`: bloques 0-9, 30 recorridos `1.1`..`8.5`, cada uno con «Pasa si» y «Falla si»; T-1 ruta por ruta (`/servicios`, `/equipo`, `/consultorios`); el OAuth real con la regla del bloque 4; los residuos declarados (C-5, D-03, G3-10) escritos como «expectativa nueva — no es regresión».
- `04-UAT.md`: fecha, motores y commit desplegado vacíos; tabla sin filas. Gate rc 0.

## Task 3 — el checkpoint bloqueante (la UAT en producción)

- **Deploy:** el orquestador subió `main` en `974a131` (CI success, Vercel success). El dueño anotó en `04-UAT.md` (commit `7917c5d`, del orquestador): fecha `2026-11-17`, motores Android Chrome 157.0.8103.78 · iPhone Safari 18.7.8 · escritorio Chrome, commit desplegado `974a131`.
- **Resultado:** 30 filas — **28 ✅, 2 ⚠, 0 ❌**. T-1 con sus tres filas (5.1, 5.2, 5.3 ✅). Bloque 4 con tres ✅ (4.2 conectar MercadoPago de verdad en un negocio de prueba; 4.3 Google desde Integraciones; 4.4 Google desde Agenda). Las dos ⚠: **4.1** y **8.5** no corribles porque MercadoPago acepta directo con el reconocimiento facial y no hay pantalla donde cancelar.
- **Recibo automático del checkpoint** (re-corrido en esta continuación): `filas=30 · T-1=3 · OAuth ✅=3 · renuncia=0 · commit desplegado=1 · fecha=1` → rc 0.
- **Respuesta del dueño (2026-11-17):** «si, doy por aprobado».

## Observaciones del dueño (fuera del «pasa si», copiadas de `04-UAT.md`)

- **obs-1 — candidato a gap para `/gsd-verify-work 4 --ws panel-nav`.** El primer toque de un tab de Finanzas (Ventas o Egresos) hace scroll al inicio de la página; después no vuelve a pasar. Visto en Android Chrome (1.3, 2.1, 3.2) y en escritorio (2.3), ya con el código desplegado (`974a131`); no reportado en Safari (8.2). Acotado por el dueño a Finanzas: no pasa en los tabs de Negocio ni de Configuración. Sin diagnosticar.
- **obs-2.** Al desconectar y volver a conectar MercadoPago, conecta directo sin pasar por la pantalla de MercadoPago. Sin diagnosticar; hipótesis: MP saltea su consentimiento cuando la cuenta ya autorizó la app y hay sesión abierta (comportamiento de MP, no del panel).
- **obs-3 — fuera de alcance.** El OAuth de MercadoPago abre la web de MP y no la app móvil. No es navegación del panel; idea a evaluar aparte.

## Task Commits

1. **Task 1: la no-regresión en una tanda** — `f852a95` (docs: `(g)`)
2. **Task 2: el guion y la hoja vacía** — `974a131` (docs)
3. **Task 3: checkpoint** — `7917c5d` (docs: la hoja llena por el dueño, commiteada por el orquestador)

`git rev-list --count b4471c2..HEAD` = 3 antes de este SUMMARY.

## Deviations from Plan

### Gate no satisfecho tal cual, sin regla de PARAR

**1. La primera corrida de la sonda de la app se cortó por un `ChunkLoadError` y se re-corrió sin cambios**
- **Found during:** Task 1, paso 1
- **Issue:** la primera corrida (11:45 → 11:59) midió 42 recorridos en `OK` y se cortó en el control de `R-B1-turnos` (`no hay un destino visible de la barra para /appointments`). El log del `next dev` de la sonda mostró `Uncaught ChunkLoadError … at NegocioPage`: la página no hidrató en esa carga. Fallo del servidor de desarrollo de esa corrida, no de la app ni del instrumento.
- **Fix:** ninguno; re-corrida idéntica (12:05 → 12:34), completa. Ningún `esperado` se tocó.
- **Committed in:** `f852a95` (anotado en `(g)`).

**2. El primer gate del task 1 da rc 1 por la FALLA declarada de G3-10**
- El gate exige `medidos = coinciden`; la sonda da 47/46. La única `FALLA` es `R-G3-10-primer-toque-atras-pronto`, el costo del camino 1 que el dueño declaró el 2026-11-16 (`veredicto G3-10: otro`), con su `esperado` intacto a propósito y la misma tupla que en el 03-17, el quick `261116-t5o` y la re-medición con control del 04-04. El resto del gate cumple. **P-8 no aplicó**: no hay nada en rojo que no sea ese costo declarado.

**3. Variante de sólo transporte de los gates**
- Como en el 04-04, los gates corrieron con un único cambio de transporte desde Git Bash (misma semántica, mismos contadores y umbrales); ningún umbral ni literal se cambió.

---

**Total deviations:** 3, ninguna con cambio de código ni de alcance. **Impact:** ninguno; el gate de la no-regresión no contemplaba la FALLA declarada de G3-10.

## Issues Encountered

- ~20 min de espera del turno de pantalla (Playwright del ERP) antes de la segunda corrida; ninguna corrida se cortó por el turno.
- La sonda levantó su `next dev` en el 3031 y lo cerró al salir; el de forjo-landing en el 3000 no se tocó.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin superficie nueva. T-04-29 (recibo con filas que el ejecutor no escribió; OAuth con ✅ reales), T-04-30 (push sólo del orquestador), T-04-31 (4.2 en un negocio de prueba: «Es de prueba, no hay reales»), T-04-32 (P-8 evaluado con la línea literal) y T-04-33 (no se mató ni reseteó nada) cumplidos.

## Next Phase Readiness

- Listo para `/gsd-verify-work 4 --ws panel-nav`: ahí se marcan MOB-08 y MOB-09 con lo que el dueño anotó (no se marcaron en este plan) y se evalúa obs-1 como gap.
- El supuesto `unclassified` de MOB-08/MOB-09 sigue declarado hasta la verificación.
- `7917c5d` y este SUMMARY quedan locales; este plan no subió nada.

## Self-Check: PASSED

- FOUND: `.planning/debug/tabs-en-la-url-medida.md` con `## (g)` (L976) y la línea `no-regresion (plan 04-05): …` (L1070)
- FOUND: `04-UAT-GUION.md` y `04-UAT.md` (30 filas, fecha, motores, commit desplegado `974a131`)
- FOUND commits: `f852a95`, `974a131`, `7917c5d` (`git rev-list --count b4471c2..HEAD` = 3)
- Recibo del checkpoint rc 0
- STATE.md, state.json, ROADMAP.md, REQUIREMENTS.md y `04-UAT.md`: sin cambios en esta continuación
