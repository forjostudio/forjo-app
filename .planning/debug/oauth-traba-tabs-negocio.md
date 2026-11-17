---
status: diagnosed
trigger: "G-04-8 (WR-03, major): en `settings-client.tsx` el render (~L1013, `!== null`) y el efecto del OAuth (~L1113, por valor vacío) no comparten el criterio sobre `mp`/`google` en la URL. Hipótesis: con `?mp=` vacío o con `?tab=integraciones&mp=…` los cuatro tabs de Negocio quedan trabados en Integraciones y el comentario de L1106-1107 describe mal el comportamiento."
created: 2026-11-17T22:00:00Z
updated: 2026-11-17T22:45:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMADA (por lectura + experimento puro con el ejecutor real), con un matiz: son DOS caminos a la misma traba, no uno. `?mp=`/`?google=` vacíos ⇒ el criterio distinto (presencia en el render, verdad en el efecto). `?tab=integraciones&mp=…` ⇒ la regla 2 de `panelHistoryAction` (`from === to` ⇒ `'none'`) se come la limpieza, porque compara sólo el tab e ignora `drop`. Unificar el predicado cierra el primero y NO el segundo.
bug_class: Bohrbug (determinista: depende sólo de la URL de entrada).
next_action: ninguna (goal find_root_cause_only). El plan escribe primero los tests rojos de `## Resolution`.

## Symptoms

expected: con cualquier forma de la URL de vuelta del OAuth, los cuatro tabs de Negocio siguen respondiendo y el próximo toque limpia `mp`/`google`.
actual: (code review, sin medir en la app) con `?mp=` vacío o con `?tab=integraciones&mp=…` los tabs quedan clavados en Integraciones.
errors: ninguno (falla silenciosa).
reproduction: abrir `/negocio?mp=` o `/negocio?tab=integraciones&mp=connected` y tocar Datos / Cobros / Notificaciones.
started: Phase 4 (plan 04-02, D-09: el retorno del OAuth pasó a `applyPanelView` con `drop`).

## Eliminated

- hypothesis: "El próximo toque limpia la query (lo que dice el comentario de L1106-1107)."
  evidence: `alElegirTab` (L1029-1036) llama a `applyPanelView` SIN `drop`, y `panelViewUrl` (lib/panel-history.ts:409-428) sólo borra lo que viene en `drop` (default `[]`): todo toque conserva `mp`/`google`. El experimento lo muestra en los 4 tabs y en las 6 URLs trabadas.
  timestamp: 2026-11-17T22:30:00Z
- hypothesis: "Agenda comparte la traba (IN-03)."
  evidence: Agenda tiene el mismo criterio por verdad (`if (!g) return`, agenda-client.tsx:297-298), así que `/agenda?google=` deja el param en la URL. Pero ningún render de Agenda lee `google` (el grep de `useSearchParams|searchParams|'google'` sólo da L297 y L303, dentro del efecto). No hay nada que forzar ni tabs que trabar: el param queda colgado y nada más. IN-03 es otra cosa: el uso de `stale` con `param: 'google'`.
  timestamp: 2026-11-17T22:32:00Z

## Evidence

- timestamp: 2026-11-17T22:12:00Z
  checked: settings-client.tsx:1008-1128 (render, handler, reconciliación, efecto del OAuth).
  found: |
    L1013  vueltaDeOAuth = isNegocio && (get('mp') !== null || get('google') !== null)      ← PRESENCIA
    L1042  tabValue = isNegocio ? (vueltaDeOAuth ? 'integraciones' : tabNegocio.value) : …  ← fuerza Integraciones
    L1065  reconciliación: if (grupoDeTabs === null || vueltaDeOAuth) return                ← apagada mientras dure
    L1035  handler: from = tabResuelto.slug (= tabNegocio.slug, NO el tab que se muestra), sin `drop`
    L1110-1113  efecto: lee window.location; if (!mp && !google) return                    ← VERDAD ('' es falsy)
    L1127  applyPanelView({ cause: 'programmatic', from: params.get('tab'), to: 'integraciones', drop: ['mp','google'] })
    L1128  deps [isNegocio] ⇒ corre UNA vez por montaje; un toque no remonta (es pushState + ACTION_RESTORE, mismo árbol)
  implication: el único que puede borrar `mp`/`google` es un efecto de una sola corrida. Si esa corrida no escribe, nada más la borra mientras la pantalla siga montada.
- timestamp: 2026-11-17T22:14:00Z
  checked: lib/panel-history.ts:79-148 (`panelHistoryAction`) y 953-997 (`applyPanelView`).
  found: la regla 2 (`if (from === to) return 'none'`, L112) corre ANTES del switch y no sabe nada de `drop`; `applyPanelView` devuelve antes de armar la URL si la acción es `'none'` (L976).
  implication: una limpieza cuyo tab ya es el pedido (`?tab=integraciones&mp=…`) no se escribe nunca, aunque la URL cambiaría.
- timestamp: 2026-11-17T22:16:00Z
  checked: Base UI con el `<Tabs value={tabValue}>` forzado (TabsTab.js:112-118).
  found: tocar Integraciones es no-op (`active`); los otros tres llaman `onValueChange`, pero como `tabValue` no deja de ser 'integraciones' mientras `mp`/`google` estén, la pantalla nunca cambia.
  implication: "los cuatro tabs muertos" es literal: uno no hace nada, tres escriben la URL sin cambiar la pantalla.
- timestamp: 2026-11-17T22:18:00Z
  checked: qué URLs emite el backend (app/api/mercadopago/callback/route.ts:17,74; app/api/google/callback/route.ts:15-18,52; app/api/google/connect/route.ts:13-14).
  found: sólo `/negocio?mp=connected|error` y `{/negocio|/agenda}?google=connected|error`, siempre sin `tab` y nunca vacíos.
  implication: los dos caminos rotos sólo se alcanzan con una URL pegada, guardada o editada. Una vez adentro, la propia traba fabrica más URLs rotas (`?mp=connected&tab=cobros`).
- timestamp: 2026-11-17T22:30:00Z
  checked: experimento PURO `.planning/debug/probes/g04-7-8-puro.mjs` (el `applyPanelView`/`resolveTab` REALES; render, efecto y handler copiados tal cual; un commit después de cada paso). Expectativa escrita antes; coincidió en todos los casos.
  found: |
    URL de entrada                              | renderiza     | efecto del OAuth                          | toques Datos / Cobros / Notif. / Integr. / Datos
    /negocio?mp=connected  (el del backend)     | Integraciones | replace → /negocio?tab=integraciones      | sano: replace /negocio · push · replace · replace · consume; la pantalla sigue al toque
    /negocio?tab=cobros&mp=connected            | Integraciones | replace → /negocio?tab=integraciones      | sano (igual que arriba)
    /negocio?mp=                                | Integraciones | sale sin escribir ('' falsy)              | none · push ?mp=&tab=cobros · replace ?mp=&tab=notificaciones · no-op · consume → ?mp= ; muestra SIEMPRE Integraciones
    /negocio?google=                            | Integraciones | sale sin escribir                         | idéntico a ?mp=
    /negocio?tab=integraciones&mp=connected     | Integraciones | applyPanelView → 'none' (regla 2), mp queda | replace → ?mp=connected · push ?mp=connected&tab=cobros · replace · no-op · consume ; muestra SIEMPRE Integraciones
    /negocio?tab=integraciones&google=connected | Integraciones | 'none' (regla 2)                          | idéntico al anterior
    /negocio?tab=integraciones&mp=              | Integraciones | sale sin escribir                         | Datos: replace → ?mp= y cae en el caso ?mp=
    /agenda?google=                             | (no lee google) | sale sin escribir                       | sin traba: sólo queda ?google= colgado
    (/settings?…mp=…: isNegocio = false ⇒ ni el predicado ni el efecto corren: sin traba)
  implication: confirma la hipótesis en los dos caminos. En `?mp=` el toque a Datos es `none` y no `replace` porque el `from` del handler es el tab de la URL (null) y no el que se muestra: es un tercer desacuerdo, que cae solo cuando el efecto limpia siempre.
- timestamp: 2026-11-17T22:34:00Z
  checked: los comentarios de L1104-1107 contra lo medido.
  found: L1106-1107 («si alguien pegara `?tab=integraciones&mp=…`, el helper no escribe (la vista ya es la pedida) y la query queda hasta el próximo toque»): la primera mitad es cierta, la segunda no. Ningún toque la limpia; sólo un remontaje (salir de la sección y volver) o una recarga, que vuelve a correr el efecto. L1104-1105 («la segunda [corrida del modo estricto] ya ve la URL limpia… el toast sale UNA vez»): en el camino `?tab=integraciones&mp=connected` la URL no se limpia, así que en dev el toast sale DOS veces. En prod no pasa: no hay doble corrida.
  implication: el comentario describe un borde benigno donde hay una traba.
- timestamp: 2026-11-17T22:36:00Z
  checked: por qué la suite no lo vio.
  found: el único caso de pila del OAuth (test/panel-tabs.test.ts:291-300, D-09) usa la URL del backend (`?mp=connected`, sin `tab`) y llama a `applyPanelView` directo con `from: null`. El gate (g) (L564-576) audita que el efecto llame al helper con `drop`, pero no compara su guarda con el predicado del render. Ningún test cruza "lo que el render fuerza" con "lo que el efecto limpia".
  implication: no había gate para esta clase de defecto (dos predicados sobre el mismo hecho).

## Resolution

root_cause: |
  El hecho «hay un retorno del OAuth pendiente» está decidido en dos lugares con criterios distintos, y el que limpia es un efecto de una sola corrida que puede no escribir. El render fuerza Integraciones y apaga la reconciliación mientras `mp` o `google` estén PRESENTES (L1013, `!== null`). El único que los borra es el efecto del OAuth (deps `[isNegocio]`, una corrida por montaje). Ese efecto: (a) sale con valores vacíos, porque la guarda es por verdad (L1113); y (b) aun con un valor, delega en `applyPanelView`, cuya regla 2 devuelve `'none'` cuando el tab ya es `integraciones`, porque compara `from`/`to` e ignora el `drop` (lib/panel-history.ts:112, :976). Como el handler del tab nunca pasa `drop` (L1035), ningún toque sana la URL. Los cuatro tabs quedan muertos (uno no-op y tres que escriben sin cambiar la pantalla) hasta un remontaje o una recarga.
  AND-gate: SÍ. La traba necesita las tres condiciones a la vez: el render forzando por presencia, el limpiador único declinando (por la guarda o por la regla 2) y el handler sin `drop`.
criterio_unico: |
  Una sola pregunta, sobre la URL ACTUAL y por PRESENCIA: «¿`mp` o `google` están en la query?» (`URLSearchParams.has`, equivalente al `!== null` del render). La usan los tres consumidores: lo que se muestra (L1042), el corte de la reconciliación (L1065) y la guarda del efecto (L1113). Y la escritura de la limpieza se decide por «la URL cambia» (`panelViewUrl(...)` distinto de la actual), no por `from !== to`. Hoy el render tiene el criterio correcto y el efecto es el que se desvía, dos veces. El lugar natural es una función pura en `lib/panel-tabs.ts`, junto a `TABS_NEGOCIO` (es configuración de la pantalla). La escritura que no pasa por la regla 2 va en `lib/panel-history.ts`, junto al ejecutor (es el helper de limpieza que propone IN-03).
fix: (no aplica: goal find_root_cause_only)
verification: lectura + experimento puro reproducible (`node .planning/debug/probes/g04-7-8-puro.mjs`). No se midió en la app: el camino del backend ya está medido sano (R-T-negocio-oauth-mp en `.planning/debug/tabs-en-la-url-medida.md`), y los caminos rotos dependen sólo de la URL, sin carrera.
red_tests: |
  (1) ROJO HOY — pila con el `applyPanelView` REAL, en el bloque "una entrada AJENA…" de test/panel-tabs.test.ts. Un ayudante `volverDelOAuth()`, molde de `sanear`, que haga EXACTAMENTE el efecto (lea `window.location.search`, con la misma guarda y la misma llamada). Para que el espejo no diverja (la lección de G-04-7), conviene que guarda y render llamen al MISMO predicado exportado y que el ayudante lo use.
      for (const url of ['/negocio?mp=', '/negocio?google=', '/negocio?tab=integraciones&mp=connected',
                         '/negocio?tab=integraciones&google=connected', '/negocio?tab=integraciones&mp=']) {
        const { pila, actual } = montarHistoria([{ url: '/afuera', state: null }, { url, state: { __NA: true } }])
        volverDelOAuth()
        const q = new URLSearchParams(window.location.search)
        expect(`${url}: ${q.has('mp') || q.has('google')}`).toBe(`${url}: false`)   // hoy: true en las 5
        expect(actual().url).toBe('/negocio?tab=integraciones')                        // hoy: la URL de entrada
        expect(pila.entradas).toHaveLength(2)
        expect(pila.retrocesos).toBe(0)
        expect(tocar(TABS_NEGOCIO, 'business')).toBe('replace')                        // y Datos responde
        expect(actual().url).toBe('/negocio')
      }
    Con `/negocio?mp=connected` y `/negocio?tab=cobros&mp=connected` el mismo cuerpo ya da verde: sirven de control.
    Variante sin espejo: `applyPanelView({ cause: 'programmatic', param: TAB_PARAM, from: 'integraciones', to: 'integraciones', drop: ['mp', 'google'] })` sobre `/negocio?tab=integraciones&mp=connected` hoy devuelve 'none' y deja `mp`. Este test fija el arreglo DENTRO del helper; si el plan elige arreglarlo en el efecto (el truco `from: null`), no sirve.
  (2) ROJO HOY — candado de fuente, en el bloque (g):
      expect(settings).not.toContain("get('mp') !== null")                 // el render no lleva su propio criterio
      expect(efecto).not.toContain('if (!mp && !google) return')            // el efecto tampoco
      // y los dos llaman al mismo predicado (nombre a elección del plan), p. ej.:
      expect(settings.split('vueltaDeOAuthPendiente(').length - 1).toBe(2)
      expect(settingsCrudo).not.toContain('la query queda hasta el próximo toque')   // el comentario que miente
fix_direction: |
  (no vinculante) a) un predicado puro por presencia, en `lib/panel-tabs.ts`, que usen el render (L1013) y la guarda del efecto (L1113); b) que la limpieza escriba siempre que cambie la URL: el truco del review (`from: desde === 'integraciones' ? null : desde`; `programmatic` siempre reemplaza) o un helper de limpieza en `lib/panel-history.ts` que reemplace siempre y respete la regla 0 (IN-03); c) complementario, no sustituto: que `alElegirTab` pase `drop: ['mp', 'google']` cuando `isNegocio`. Solo no alcanza: en `?mp=` el toque a Datos sigue en `none` (from null = to null); d) corregir el comentario de L1104-1107. Agenda no necesita cambio por este gap: su `?google=` vacío queda colgado sin efecto visible.
oracle_type: specified (criterio 3 del ROADMAP + D-09/D-10: la URL de vuelta queda en `?tab=integraciones` limpia y los tabs responden)
files_changed: []
