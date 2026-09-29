---
status: diagnosed
trigger: "UAT mobile Phase 1 v0.30: en /clients, abrir cliente → atrás (vuelve al listado) → abrir modal Fusionar duplicados (#modal) → atrás (cierra modal) → atrás → aterriza en una FICHA de cliente en vez de salir de Clientes"
created: 2026-09-29
updated: 2026-09-29
---

## Current Focus

hypothesis: CONFIRMADA — una entrada `?c=<id>` queda ENTERRADA debajo de una entrada de ruta
  `/clients` cuando el usuario toca "Clientes" en el menú TENIENDO LA FICHA ABIERTA. El `<Link>` del
  sidebar empuja `/clients` encima de `/clients?c=<id>`; nada la colapsa nunca (D-01: panel-history
  no escucha popstate). Los 5 pasos reportados no crean la entrada: la DESENTIERRAN.
test: pila de historial real medida con CDP (Page.getNavigationHistory) contra el dev server
expecting: —
next_action: entregar el diagnóstico (modo find_root_cause_only; NO aplicar arreglo)

reasoning_checkpoint:
  hypothesis: "Un `<Link href='/clients'>` del sidebar pulsado con la ficha abierta empuja una entrada de ruta `/clients` ENCIMA de la entrada `?c=<id>` que `applyPanelView({cause:'user-open'})` había empujado. La entrada de ficha queda debajo y ningún mecanismo la colapsa."
  confirming_evidence:
    - "Medición S1 paso C: pila [3]/clients [4]/clients?c=...0001 [5]/clients — la ficha queda enterrada en [4]"
    - "Medición S1 paso 5: el 2do atrás tras cerrar el modal aterriza en [4] /clients?c=...0001 — el síntoma exacto"
    - "Medición repro.mjs (misma secuencia SIN el paso C): el paso 5 aterriza en /finances — correcto"
  falsification_test: "Si al ejecutar los 5 pasos partiendo de una pila sin `?c=` enterrado el back cayera igual en una ficha, la causa sería otra."
  fix_rationale: "El defecto es que una navegación de RUTA a la sección en la que ya estás no colapsa la subsección; el arreglo tiene que evitar que se apile o consumir la entrada propia."
  blind_spots: "No medí el camino exacto del dueño (no lo grabó); medí un camino que produce EXACTAMENTE el síntoma. Cualquier push de ruta `/clients` sobre un `?c=` produce lo mismo."
  candidate_causes:
    - "código: el sidebar empuja en vez de reemplazar/consumir al navegar a la sección activa"
    - "diseño/política: D-01 (no escuchar popstate) deja sin dueño a las entradas propias que quedan sepultadas por el router"
  and_gate: "sí — hacen falta DOS condiciones: (1) una entrada `?c=` empujada por panel-history y (2) un push de ruta encima de ella. Ninguna sola produce el bug."

## Symptoms

expected: en el paso 5 (segundo atrás tras cerrar el modal) el usuario sale de /clients hacia la sección anterior
actual: aterriza en la ficha de un cliente (`?c=<id>`)
errors: ninguno
reproduction: ver Evidence (escenario S1)
started: Phase 1 de v0.30 (panel-nav) — `lib/panel-history.ts` es nuevo

## Eliminated

- hypothesis: "H1 — `holding` queda rancio después de un atrás del navegador (el módulo no escucha popstate) y produce un `consume` extra"
  evidence: "`applyPanelView` (lib/panel-history.ts:369) LEE `window.history.state` en cada llamada; no hay ningún `holding` almacenado. El único estado persistido del módulo es `reconciliadoRef` (guarda de idempotencia). Medición: en los 3 escenarios cada `history.back()` movió el puntero EXACTAMENTE una entrada (S1 idx 6→5→4; S2 idx 5→4→3→2; repro idx 4→3→2). Cero `back()` extra."
  timestamp: 2026-09-29

- hypothesis: "H2 — doble consumo entre panel-history y overlay-history (riesgo (c) del ROADMAP)"
  evidence: "Escenario S2 medido: overlay abierto ENCIMA de una entrada `?c=` → pila [4]?c=A [5]?c=A#modal; atrás → vuelve a [4] con la ficha VIVA y `state={frjView:'c'}`; atrás → [3]/clients; atrás → [2]/finances. Un consumo por gesto, la marca del overlay respetada, cero competencia."
  timestamp: 2026-09-29

## Evidence

- timestamp: 2026-09-29
  checked: "Los 5 pasos literales del reporte, contra el dev server del puerto 80, midiendo la pila con CDP Page.getNavigationHistory (Chrome headless, 390x844)"
  found: "NO reproducen. [2]/finances [3]/clients [4]?c=A → atrás → [3] → modal (trunca [4]) → [4]#modal → atrás → [3] → atrás → [2]/finances ✅"
  implication: "La causa NO está en los 5 pasos: está en el estado de la pila ANTES de ellos."

- timestamp: 2026-09-29
  checked: "Escenario S1 — ficha abierta + tocar 'Clientes' en el menú hamburguesa"
  found: "El `<Link href='/clients'>` (components/dashboard/sidebar.tsx:143-145) empuja una entrada NUEVA: [3]/clients [4]/clients?c=...0001 [5]/clients. La ficha queda ENTERRADA en [4]. Después, los 5 pasos: [6]?c=...0002 → atrás [5] → modal trunca [6] y empuja [6]#modal → atrás [5] → atrás → **[4] /clients?c=...0001** = la ficha. SÍNTOMA REPRODUCIDO."
  implication: "Root cause confirmada. Diferencial limpio: la ÚNICA diferencia con el run que pasa es ese paso C."

- timestamp: 2026-09-29
  checked: "components/dashboard/sidebar.tsx:141 — `const active = pathname === item.href`"
  found: "Con la URL `/clients?c=A`, `usePathname()` devuelve `/clients` ⇒ el link 'Clientes' se pinta ACTIVO (bg-primary, aria-current='page') y aun así navega y EMPUJA. En mobile la ficha es full-screen y el listado está oculto (`showDetail && 'hidden lg:flex'`, clients-client.tsx:723-725), así que tocar 'Clientes' en el menú es un camino de primera clase para volver al listado."
  implication: "El gesto que entierra la entrada es natural, no exótico. Y no es exclusivo de Clientes: la Phase 2 (tabs de Negocio/Configuración/Finanzas) hereda el mismo agujero."

- timestamp: 2026-09-29
  checked: "lib/panel-history.ts — inventario de escrituras"
  found: "Ninguna causa del helper puede escribir `?c=` sobre una entrada de ruta ajena: `programmatic`/`filter` → replace sobre la entrada actual (que ya es `?c=`), `stale`/`user-close` → consume o replace a `/clients`, `concurrent` → none. `resolveViewParam` deriva `resolvedTo` de `viewParam`, así que `programmatic` es imposible con la URL limpia."
  implication: "La entrada enterrada NO la produce panel-history: la produce el router. panel-history simplemente no tiene mecanismo para recuperarla (es D-01)."

## Resolution

root_cause: |
  DOS condiciones simultáneas (AND-gate):
  (1) `applyPanelView({cause:'user-open'})` empuja una entrada `?c=<id>` propia
      (lib/panel-history.ts:393, call site app/(dashboard)/clients/clients-client.tsx:859); y
  (2) el `<Link href="/clients">` del sidebar (components/dashboard/sidebar.tsx:143-145), pulsado
      MIENTRAS esa entrada es la de arriba, empuja una entrada de RUTA `/clients` encima.
  La entrada de ficha queda sepultada y nadie la colapsa: `lib/panel-history.ts` sólo consume la
  entrada de arriba y sólo desde un gesto de la pantalla ("Volver" / saneo), y por D-01 no escucha
  `popstate` ni reescribe historial ajeno. Al volver atrás hasta esa profundidad, la URL reaparece
  con `?c=` y el detalle se RE-ABRE.
fix: "no aplicado (modo diagnóstico)"
verification: "no aplicado"
files_changed: []
