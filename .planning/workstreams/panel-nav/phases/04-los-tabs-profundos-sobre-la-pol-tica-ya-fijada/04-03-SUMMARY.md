---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "03"
subsystem: ui
status: complete
tags: [history, tabs, composicion, cdp, decision-del-dueno, residuo]

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "04-02: /negocio y /settings con el tab en ?tab=, el OAuth reconciliado, R-T-negocio-por-mas (C-1) en OK"
provides:
  - "la composición de los tabs con los dos niveles MEDIDA en la app real: seis R-C-* en OK contra la pila derivada (composicion medida: como-se-derivo)"
  - "04-DECISION-COMPOSICION.md con la decisión del dueño: B1"
  - "D-01 precisado, fechado 2026-11-17, debajo del criterio 1 de la Phase 4 (ROADMAP) y de MOB-08 (REQUIREMENTS), con el texto original intacto"
  - "el residuo que queda con B1 (sólo C-5, el sidebar de escritorio) declarado en los cuatro lugares: docblock de lib/panel-tabs.ts, §(e) del registro, RESIDUO ACEPTADO debajo de MOB-08 y la entrada 21 de .planning/WINDOWS.md"
affects: [04-04 (se ejecuta: B1), 04-05 (UAT del dueño en el teléfono), la sonda de la app]

actuals:
  tokens: 10400
  tasks: 3
  commits: 4
plan_head_before: 1c7a374b12739490f55a152075d6a682be7d635a

tech-stack:
  added: []
  patterns:
    - "Una decisión del dueño que amplía la fase se toma con los números medidos a la vista y queda en un documento con la línea literal que el plan siguiente lee como precondición"

key-files:
  created:
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-DECISION-COMPOSICION.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-03-SUMMARY.md
  modified:
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/ROADMAP.md
    - .planning/workstreams/panel-nav/REQUIREMENTS.md
    - lib/panel-tabs.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Composición: decisión B1 del dueño (2026-11-17). El 04-04 cierra en la barra C-2, C-3, C-4 y el hueco de la ficha ?c=; C-5 (sidebar de escritorio) queda declarado como residuo"
  - "D-01 precisa el criterio 1 y MOB-08: donde dice «el atrás vuelve al tab anterior» vale «al tab por defecto», fechado y sin reescribir el texto"

patterns-established:
  - "El residuo de una decisión se escribe en los mismos cuatro lugares que usó la Phase 3 (docblock, registro, precisión del requisito, WINDOWS.md por el CLI)"

requirements-completed: []

duration: 2 sesiones (task 1 en la anterior; task 3 y cierre en ésta)
completed: 2026-11-17
---

# Phase 4 Plan 03: La composición con la Phase 3, medida, decidida (B1) y declarada Summary

**Los seis recorridos de composición dieron exactamente la pila que el research había derivado (con un tab o una ficha arriba, la barra apila o reemplaza en vez de subir o colapsar, y nunca expulsa del sitio); el dueño eligió B1, así que el 04-04 lo cierra en la barra y sólo C-5, del sidebar de escritorio, queda declarado como residuo.**

## Performance

- **Completado:** 2026-11-17
- **Tasks:** 3 de 3 (el task 2 fue el checkpoint del dueño)
- **Archivos:** 7 (1 nuevo de código cero: `04-DECISION-COMPOSICION.md`; `lib/panel-tabs.ts` sólo comentario)

## La medición (task 1)

Seis `R-C-*` con la pila DERIVADA como `esperado`, commiteados en `b47555d` antes de correr y no tocados
después; una corrida por el turno (`next dev` propio en el 3031, Chrome `157.0.8103.52`, gesto `interfaz`,
modo estricto), rc 0. Los seis en `OK`: **`composicion medida: como-se-derivo`**. Detalle en
`.planning/debug/tabs-en-la-url-medida.md` §(e).

| Recorrido | Medido | Lo que ve el dueño |
|---|---|---|
| `R-C-2` celular `Más → Negocio → Cobros → Inicio` | `[/dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard]`, aviso `no` | el atrás desde Inicio vuelve a Cobros; el aviso de salida no está |
| `R-C-3` celular `… → Cobros → Turnos` | `[/dashboard, /mas, /negocio, /appointments]` | dos escalones de más antes de Inicio |
| `R-C-4` celular `… → Cobros → Más` | `[…, /negocio?tab=cobros, /mas]` | Más se apila sobre el tab |
| `R-C-5` escritorio `Inicio → Negocio → Cobros → Finanzas` (sidebar) | `[/dashboard, /negocio, /finances]` | el atrás desde Finanzas cae en Negocio |
| `R-C-6` escritorio `… → Cobros → Inicio` (sidebar) | `[/dashboard, /negocio, /negocio?tab=cobros, /dashboard]` | el residuo de escritorio de la Phase 3, con el tab abajo |
| `R-C-ficha` celular `Inicio → Clientes → ficha → Inicio` | `[/dashboard, /clients, /clients?c=*, /dashboard]`, aviso `no` | el síntoma de `R-C-2`, que ya existía hoy sin declarar |

Mecanismo confirmado: la entrada de arriba lleva `{"frjView":"tab"}` (o `"c"`) sin `frjUnder`, así que
`masDebajo`/`raizDebajo` dan falso y la decisión cae en `panelNavMode`. C-1 ya estaba medido en el 04-02
(`R-T-negocio-por-mas` OK).

## La decisión del dueño (task 2)

**checkpoint:decision — respuesta del dueño: B1 (2026-11-17).** Literal: «B1», sin línea de porqué.
Escrita en `04-DECISION-COMPOSICION.md` con la línea `decision del dueno sobre la composicion: B1`.

## Qué se declaró y dónde (task 3)

- **D-01 precisado** debajo del criterio 1 de la Phase 4 en `ROADMAP.md` y debajo de MOB-08 en
  `REQUIREMENTS.md` («⚠ PRECISADO el 2026-11-17 (D-01 de la Phase 4), no contradicho»): «al tab **por
  defecto**», con el ejemplo `Datos → Cobros → Integraciones → Cobros → atrás ⇒ Datos`. Texto original
  intacto; MOB-08 y MOB-09 siguen `- [ ]`.
- **El residuo con B1: sólo C-5** (escritorio, sidebar: el atrás desde Finanzas cae en Negocio). Escrito
  con fecha 2026-11-17 en: (1) el docblock `// ── EL RESIDUO DE LA COMPOSICIÓN CON LOS DOS NIVELES …` de
  `lib/panel-tabs.ts` (sólo comentario: el fuente sin comentarios es igual al del 04-02); (2)
  `### El residuo, declarado (decisión B1 del dueño)` al final de §(e) del registro; (3) «⚠ RESIDUO
  ACEPTADO el 2026-11-17 (decisión B1 del dueño)» debajo de MOB-08, con la regla para la UAT; (4) la
  entrada **21** (`unmet-truth`, fase 4, `lib/panel-tabs.ts`) de `.planning/WINDOWS.md`, por el CLI
  (`open_count` 18 → 19, `total_count` 20 → 21).
- En los cuatro lugares queda escrito que C-2, C-3, C-4 y la ficha `?c=` los cierra el 04-04, y que el
  tercer retroceso encadenado (tab → sección → Más → Inicio) **no está medido**: lo mide el 04-04
  (`R-B1-inicio`).

Verify del task 3 (variante con el fuente base por archivo, ver Desvíos):

```
decision=[B1] (A, B1 o B2) lineas=1 (1) · secciones del documento=5 (5) · criterio 1 original intacto=1 (1) y precisado=1 (1) · MOB-08 precisado=1 (1) residuo en MOB-08=1 (1) · MOB-08/09 marcados=0 (0) trazabilidad Pending=2 (2) · panel-tabs sin comentarios=igual (igual) residuo en el docblock=1 (1) · entrada de WINDOWS de la fase 4=1 (>=1) · residuo en el registro=1 (1) · codigo de la app cambiado desde el 04-02=[] (vacio) · milestone en STATE intacto=1 (>=1) · 04-04-SUMMARY coherente con la decision=si
rc=0
```

Además: `eslint lib/panel-tabs.ts` rc 0 y `vitest run test/panel-tabs.test.ts` 53/53.

## Para el orquestador

- **Con B1, el `04-04` SE EJECUTA antes del `04-05`.** `04-04-SUMMARY.md` NO existe (a propósito: si
  existiera, execute-phase lo saltearía por `has_summary` y B1 no se haría).
- Sus dos precondiciones están en disco: `decision del dueno sobre la composicion: B1` en
  `04-DECISION-COMPOSICION.md` y `composicion medida: como-se-derivo` en el registro.
- No hace falta `--gaps` (eso era para B2).

## Task Commits

1. **Task 1: la composición, medida** — `b47555d` (test: la sonda con los seis R-C-*), `9d4f37a` (docs: §(e))
2. **Task 2: checkpoint:decision** — sin commit; respuesta del dueño: B1 (2026-11-17)
3. **Task 3: la decisión escrita, D-01 precisado y el residuo declarado** — `70b1fd8` (docs: `04-DECISION-COMPOSICION.md`), `1b6901f` (docs: ROADMAP, REQUIREMENTS, docblock, registro, WINDOWS)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante del instrumento] El verify del task 3 no puede dar `igual` en Windows**
- **Found during:** Task 3
- **Issue:** el verify pasa el fuente de `lib/panel-tabs.ts` del 04-02 (`git show 57ade78:…`) como
  argumento de `node -e`. Ese fuente tiene comillas dobles (L10-11: `"NO decide qué se muestra"`) y
  saltos de línea; el pasaje de argumentos de Git Bash a un proceso de Windows lo trunca a 100 caracteres y
  se come el argumento siguiente (medido: `argc 1 [ 100 ]` con dos argumentos pasados). El resultado
  `DISTINTO` no era un cambio de código: con el mismo recorte aplicado a los dos fuentes leídos de
  archivo, el `diff` da vacío.
- **Fix:** se corrió el mismo verify con un único cambio de transporte: el fuente base va a un archivo
  temporal (`mktemp`) y el `node -e` lo lee con `readFileSync`; la función de recorte y la comparación
  son las del plan, sin tocar. Con eso, `panel-tabs sin comentarios=igual` y rc 0. El plan no se editó.
- **Files modified:** ninguno del repo (la variante vive en el scratchpad de la sesión).
- **Commit:** —

---

**Total deviations:** 1 auto-fixed (instrumento del gate en Windows). **Impact:** ninguno sobre el
alcance; el 04-04 y el 04-05 tienen gates con la misma forma (`node -e` + fuente por argumento) y les
pasará lo mismo si su fuente base tiene comillas dobles.

## Issues Encountered

Ninguno además del desvío. `windows append` no tocó STATE.md, state.json ni el ROADMAP (verificado con
`git diff`: el único cambio del ROADMAP es la precisión escrita a mano).

## Known Stubs

Ninguno: este plan no cambia código de la aplicación.

## Threat Flags

Ninguno: sin superficie nueva (documentos y un comentario).

## Next Phase Readiness

- El 04-04 (B1) puede arrancar: precondiciones en disco, `R-C-2/3/4/ficha` listos para pasar a
  `obsoleto` apuntando a sus `R-B1-*` con su `esperado` intacto.
- Pendiente fuera de la sonda: Chrome de Android y Safari de iOS (04-05, teléfono del dueño). MOB-08 y
  MOB-09 siguen sin marcar; el supuesto `unclassified` de los dos sigue declarado.

## Self-Check: PASSED

- FOUND: `.planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-DECISION-COMPOSICION.md`
- FOUND: `lib/panel-tabs.ts` con el docblock del residuo (1 línea con `EL RESIDUO DE LA COMPOSICI`)
- ABSENT (correcto con B1): `04-04-SUMMARY.md`
- FOUND commits: `b47555d`, `9d4f37a`, `70b1fd8`, `1b6901f` (`git rev-list --count 1c7a374..HEAD` = 4 antes de este SUMMARY)
