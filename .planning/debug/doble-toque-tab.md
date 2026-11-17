---
status: diagnosed
trigger: "G-04-7 (WR-02, minor): los dos `alElegirTab` (finances-client.tsx ~L275-281, settings-client.tsx ~L1029-1036) deciden la causa (push / replace / consumir) con el tab del último render, no con `window.location` al momento del toque. Hipótesis del revisor: un doble toque rápido, o dos tabs en rápida sucesión antes del re-render, duplica entradas (Ventas sobre Ventas) o hace dos `back()` desde el default."
created: 2026-11-17T22:00:00Z
updated: 2026-11-17T22:40:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMADA (por lectura + experimento puro con el ejecutor real). El `from` de `alElegirTab` es un cierre del último commit; entre la escritura de un toque y el commit de la transición un segundo toque decide sobre hechos viejos. Además hay un segundo defecto, independiente del `from`: dos `consume` seguidos antes de que el navegador procese el primer `back()`.
bug_class: Concurrency (violación de orden: el handler lee una copia del render mientras la fuente de verdad —`location`/`history.state`— ya cambió). Determinista dado el orden de eventos; el tamaño de la ventana depende del costo del render de la transición y NO se midió en la app.
next_action: ninguna (goal find_root_cause_only). El plan escribe primero los tests rojos de `## Resolution`.

## Symptoms

expected: tocar dos veces seguidas el mismo tab, o dos tabs en rápida sucesión, deja la pila igual que un toque deliberado (sin Ventas encima de Ventas ni dos `back()` desde el default).
actual: (code review, sin medir en la app) el segundo toque decide con el `from` del último render.
errors: ninguno (falla silenciosa: entradas de más en la pila o un retroceso de más).
reproduction: en `/finances` tocar Ventas dos veces muy rápido (o Ventas y enseguida Egresos) antes de que el tab cambie en pantalla; después apretar atrás.
started: Phase 4 (los tabs pasaron a la URL, plan 04-01/04-02).

## Eliminated

- hypothesis: "Base UI ignora el segundo toque porque el tab ya quedó activo."
  evidence: `TabsTab.onClick` corta con `if (active || disabled) return` (node_modules/@base-ui/react/esm/tabs/tab/TabsTab.js:112-118) y `TabsList.onTabActivation` compara `newValue !== value` (tabs/list/TabsList.js:74-77); los dos `active`/`value` salen del `value` CONTROLADO del último commit (`<Tabs value={txTab}>`, finances-client.tsx:1088; `<Tabs value={tabValue}>`, settings-client.tsx:2505). Hasta el commit el tab tocado no está activo y el segundo toque vuelve a llamar `onValueChange(value, { reason: 'none' })` (REASONS.none === 'none', internals/reason-parts.js:1), que pasa el filtro del handler.
  timestamp: 2026-11-17T22:20:00Z
- hypothesis: "El tab tiene un estado local que se actualiza síncrono con el toque."
  evidence: no hay `useState` del tab (lo fija el gate (b) de test/panel-tabs.test.ts:499-507); el `<Tabs>` es controlado y el `setValue` interno de Base UI es `setValueIfUncontrolled` (node_modules/@base-ui/utils/esm/useControlled.js:34-38), inerte en modo controlado. La única fuente es `useSearchParams()`.
  timestamp: 2026-11-17T22:20:00Z

## Evidence

- timestamp: 2026-11-17T22:05:00Z
  checked: el handler en las dos pantallas.
  found: finances-client.tsx:275-281 y settings-client.tsx:1029-1036 pasan `from: tabResuelto.slug` (dos veces cada uno: a `panelTabCause` y a `applyPanelView`). `tabResuelto` = `resolveTab({ param: searchParams.get(TAB_PARAM) })` con `searchParams = useSearchParams()` (finances L215-217; settings L1008-1019).
  implication: el `from` es el del último render que hizo commit, no el de la URL.
- timestamp: 2026-11-17T22:08:00Z
  checked: cuándo cambia `useSearchParams` después de un `pushState` (node_modules/next/dist/client/components/app-router.js:233-262 y 112-124).
  found: el parche de Next despacha `ACTION_RESTORE` adentro de `startTransition` y LUEGO llama al `pushState` original; `useSearchParams` sale de `state.canonicalUrl` del router (useMemo L116-124), que se actualiza recién cuando esa transición hace commit. `window.location` y `history.state` cambian síncronos en el `pushState`.
  implication: hay una ventana [pushState → commit de la transición] en la que la URL ya dice el tab nuevo y el render (y el handler) todavía el viejo.
- timestamp: 2026-11-17T22:10:00Z
  checked: con qué closure corre el handler en esa ventana.
  found: Base UI guarda `onValueChange` con `useStableCallback` (node_modules/@base-ui/utils/esm/useStableCallback.js:21-36): el trampolín llama al callback que se instaló en el insertion effect del ÚLTIMO commit. TabsRoot.onValueChange (tabs/root/TabsRoot.js:94-101) llama al `onValueChangeProp` de ese commit.
  implication: confirma la closure vieja: el `from` del segundo toque es el de antes del primero.
- timestamp: 2026-11-17T22:25:00Z
  checked: experimento PURO `.planning/debug/probes/g04-7-8-puro.mjs` (el `applyPanelView` REAL contra una historia simulada; `location` síncrono, el render sólo con `commit()`, `back()` en cola hasta `procesar()`). Expectativa escrita antes (ver la versión anterior de Current Focus); coincidió en los 8 casos.
  found: |
    from del RENDER (hoy):
      E1 Turnos→Ventas x2 sin commit: push, push  :: [/dashboard, /finances, /finances?tab=ventas, /finances?tab=ventas]
      E2 Turnos→Ventas→Egresos sin commit: push, push :: [/dashboard, /finances, /finances?tab=ventas, /finances?tab=egresos]
      E3 Ventas→Turnos x2 antes del recorrido: consume, consume :: backs=2 → aterriza en /dashboard
      E4 Ventas→Turnos x2, recorrido hecho sin commit: consume, replace :: estado de /finances = {"frjView":null} (se borró frjUnder)
    from de window.location (el fix de WR-02):
      E1 push, none (2 entradas) · E2 push, replace (2 entradas) · E4 consume, none (frjUnder intacto)
      E3 consume, consume :: backs=2  ← el fix de WR-02 SOLO NO lo cierra
  implication: E1/E2/E4 son el `from` viejo; E3 es otro defecto: `history.back()` es asíncrono, así que ni `location` ni `history.state` cambian hasta el recorrido, `holding` sigue en `true` y el segundo toque vuelve a consumir.
- timestamp: 2026-11-17T22:28:00Z
  checked: por qué la suite no lo vio.
  found: el `tocar` del simulador (test/panel-tabs.test.ts:177-183) dice ser "EXACTAMENTE lo que hace el handler del tab en la pantalla" pero toma `desde` de `window.location.search`, no del render. El simulador prueba la versión ARREGLADA, las pantallas corren la otra. Además el `back()` del simulador (L160-163) es síncrono, así que E3 no se puede expresar.
  implication: "why not caught" = el espejo del handler en el test divergió del handler real y ningún gate ata los dos.

## Resolution

root_cause: |
  Los dos `alElegirTab` deciden con `from: tabResuelto.slug`, que viene de `useSearchParams()` del último commit. El `pushState` de un toque cambia `location`/`history.state` al instante, pero el render (y el handler) recién se actualizan cuando hace commit la transición `ACTION_RESTORE` que el parche de Next despacha en `startTransition`. Un segundo toque en esa ventana pasa el filtro de Base UI, porque `active`/`value` también son los del último commit, y decide sobre un `from` viejo. Resultado: E1 empuja dos veces el mismo `?tab=` (la regla 2 queda salteada), E2 empuja dos veces donde corresponde empujar y después reemplazar (el atrás desde Egresos cae en Ventas, en contra de D-01), y E4 hace un `replace` espurio sobre la entrada de la sección que le borra `frjUnder`.
  Hay un segundo defecto, independiente del `from`. Un doble toque al tab por defecto antes de que el navegador procese el primer `history.back()` consume dos veces, porque `holding` se lee de `history.state` y ese estado tampoco cambia hasta el recorrido (E3: backs=2, se sale de la sección). Leer `window.location` no lo arregla; hace falta una guarda de "consumo en vuelo".
fix: (no aplica: goal find_root_cause_only)
verification: lectura de Next 16.2.7 + Base UI 1.5.0 + experimento puro reproducible (`node .planning/debug/probes/g04-7-8-puro.mjs`). NO medido en la app: ni el tamaño real de la ventana (depende del render de la transición) ni si dos `back()` encolados en Chrome bajan dos entradas (Chromium calcula el offset desde la entrada pendiente; derivado, no medido).
red_tests: |
  (1) ROJO HOY — gate de fidelidad, en el bloque (f) de test/panel-tabs.test.ts, para `[settings, finanzas]`:
      const cuerpo = cuerpoDe(fuente, 'function alElegirTab(', '): void {')
      expect(cuerpo).not.toBe('')
      expect(cuerpo).not.toContain('tabResuelto.slug')        // hoy: 2 apariciones en cada pantalla
      expect(cuerpo).toContain('window.location.search')       // o el nombre del helper compartido
    Si el plan extrae el `from` a un helper puro (p. ej. `tabEnLaUrlActual({ grupo, search })` en lib/panel-tabs.ts), el `tocar` del simulador tiene que llamar al MISMO helper (así el espejo no puede volver a divergir).
  (2) ROJO HOY y SIGUE ROJO con sólo el fix de WR-02 — pila con back asíncrono:
      `montarHistoria` gana una opción `{ backAsincrono: true }` en la que `back()` sólo cuenta y encola (`pila.retrocesos++`), y un `procesar()` aplica la cola (y dispara el `popstate` si la guarda lo escucha: el stub de `window` necesita `addEventListener`).
      it('doble toque al default antes del recorrido: UN solo retroceso', () => {
        const { pila, actual, procesar } = montarHistoria([
          { url: '/dashboard', state: null },
          { url: '/finances', state: { frjUnder: '/dashboard' } },
          { url: '/finances?tab=ventas', state: { frjView: 'tab' } },
        ], { backAsincrono: true })
        expect(tocar(TABS_FINANZAS, 'appointments')).toBe('consume')
        expect(tocar(TABS_FINANZAS, 'appointments')).toBe('none')   // hoy: 'consume'
        expect(pila.retrocesos).toBe(1)                             // hoy: 2
        procesar()
        expect(actual().url).toBe('/finances')                      // hoy: '/dashboard'
      })
  (3) Guardas de regresión (verdes en cuanto el handler y `tocar` compartan el `from` de la URL), sin `commit` entre toques:
      Turnos→Ventas x2 ⇒ ['push','none'] y 2 entradas; Turnos→Ventas→Egresos ⇒ ['push','replace'] y el atrás cae en /finances;
      Ventas→Turnos x2 con el recorrido ya hecho ⇒ ['consume','none'] y `actual().state` sigue `{ frjUnder: '/dashboard' }`.
    E1/E2 NO pueden quedar rojos en un test puro hoy sin extraer antes el handler: el defecto vive en la closure del componente y el runner es `environment: 'node'`. El rojo de E1/E2 es el (1).
fix_direction: |
  (no vinculante) a) que el `from` salga de `window.location.search` en el momento del toque, con un helper puro compartido por las dos pantallas y por el `tocar` del simulador; b) una guarda de consumo en vuelo en `lib/panel-history.ts` (no en la pantalla): después de un `consume`, cualquier otra escritura o consumo se descarta hasta el próximo `popstate`. `consumeOwnedPanelEntry` (el menú, NAV-08) y el «Volver» de clientes tienen la misma forma y les conviene la misma guarda.
oracle_type: specified (D-01/D-02 y la regla 2 de `panelHistoryAction` fijan la pila esperada)
files_changed: []
