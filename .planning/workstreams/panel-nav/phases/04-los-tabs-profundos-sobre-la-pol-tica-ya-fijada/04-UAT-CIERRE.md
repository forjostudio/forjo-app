---
status: complete
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-UAT.md, 04-VERIFICATION.md, 04-REVIEW.md]
started: 2026-11-17T15:55:00Z
updated: 2026-11-17T21:30:00Z
---

## Current Test

[testing complete]

## Nota de forma

La UAT de la fase **ya se corrió**: el dueño ejecutó `04-UAT-GUION.md` en su teléfono, en escritorio y en un
iPhone, **en producción** sobre el commit `974a131` (2026-11-17), y la anotó en `04-UAT.md` (30 filas: 28 ✅,
2 ⚠, 0 ❌; aprobada: «si, doy por aprobado»). Este archivo la traduce al formato del template —un ítem por
criterio de éxito del ROADMAP con la evidencia del dueño citada por recorrido— y registra los gaps que el
dueño decidió cerrar dentro de la fase (**opción B, 2026-11-17**, frente a la verificación `human_needed` y al
code review `04-REVIEW.md`). `04-UAT.md` es la hoja del dueño y no se toca.

## Tests

### 1. Los tabs son destinos y se componen con los dos niveles (criterio 1 + PRECISADO D-01)
expected: en `/negocio` y `/settings` cada tab no-default vive en `?tab=`; el atrás desde un tab vuelve al tab por defecto y el siguiente sale según cómo se entró (Phase 3); con un tab abierto, tocar la barra termina igual que sin el tab (B1)
result: pass
source: 04-UAT.md 1.1, 1.2, 1.4, 2.2, 2.3, 3.1, 3.3, 3.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.3, 8.4 (todos ✅)

### 2. T-1 respetado: `/servicios`, `/equipo` y `/consultorios` no se mueven (criterio 2)
expected: las tres rutas sin `?tab=`, sin tabs nuevos, con su contenido y su atrás de siempre, verificadas a mano ruta por ruta
result: pass
source: 04-UAT.md 5.1, 5.2, 5.3 (✅ los tres)

### 3. T-2 reconciliado: el OAuth no pierde su tab (criterio 3)
expected: volver del OAuth real de MercadoPago y de Google aterriza en Integraciones con `/negocio?tab=integraciones` limpia y un toast; desde Agenda vuelve a `/agenda` limpia
result: pass
source: 04-UAT.md 4.2, 4.3, 4.4 (✅); 4.1 y 8.5 ⚠ no corribles (MercadoPago acepta directo con el reconocimiento facial: no hay rama de cancelar)

### 4. Finanzas, con su botón de alta coherente (criterio 4)
expected: en `/finances` Turnos·Ventas·Egresos viven en la URL y el botón de alta sigue al tab visible en todos los caminos de entrada (Más, la tarjeta de Inicio, el sidebar, URL recargada), en Android, escritorio e iPhone
result: pass
source: 04-UAT.md 1.3, 2.1, 2.3, 3.2, 6.1, 8.2 (✅). Ver el test 6 (obs-1) para el salto de scroll observado en el mismo camino.

### 5. Cero dialecto nuevo y cero regresión (criterio 5)
expected: los tres grupos de tabs escriben historial sólo por el helper; cero regresión sobre lo verificado (overlays, aviso de cambios sin guardar de Agenda, aviso de salida de Inicio)
result: pass
source: 04-UAT.md 6.1, 6.2, 6.3 (✅); 04-VERIFICATION.md (barrido crudo en cero; diff vacío sobre lo bloqueado); `## (g)` de `.planning/debug/tabs-en-la-url-medida.md` (sonda 46/47, la única FALLA es el costo declarado `R-G3-10`)

### 6. El primer toque de un tab de Finanzas no mueve la página (obs-1)
expected: tocar Ventas o Egresos por primera vez después de entrar a Finanzas cambia el tab sin mover el scroll de la página, igual que los toques siguientes y que los tabs de Negocio y Configuración
result: issue
reported: "Al entrar la primera vez por nueva pestaña, cuando voy a finanzas>ventas, el primer tacto hace un scroll hacia el inicio de la página, después no pasa mas" · «Acá está el mismo scroll hacia el inicio de la página la primer vez que tocas Ventas» (escritorio) · «Lo del scroll es solo en Finanzas>Ventas» · «tambien tocando Egresos está ese scroll, es algo de Finanzas»
severity: minor
source: 04-UAT.md obs-1 (Android Chrome 157 y escritorio Chrome; no reportado en Safari 18.7.8 en el 8.2)

### 7. Un doble toque rápido en un tab no duplica entradas del historial (code review WR-02)
expected: tocar dos veces seguidas el mismo tab, o dos tabs en rápida sucesión, deja la pila igual que un toque deliberado (sin Ventas encima de Ventas ni dos `back()` desde el default)
result: issue
reported: "Code review 04-REVIEW.md WR-02 (confirmado por lectura en 04-VERIFICATION.md): los dos `alElegirTab` (finances-client.tsx:275-281, settings-client.tsx:1029-1036) deciden con el tab del último render, no con la URL real del momento del toque. El dueño decidió cerrarlo en la fase (opción B, 2026-11-17)."
severity: minor

### 8. Volver del OAuth con `?mp=` vacío o con `?tab=integraciones&mp=…` no traba los tabs de Negocio (code review WR-03)
expected: con cualquier forma de la URL de vuelta del OAuth, los cuatro tabs de Negocio siguen respondiendo y el próximo toque limpia `mp`/`google`
result: issue
reported: "Code review 04-REVIEW.md WR-03 (confirmado por lectura en 04-VERIFICATION.md): el render (settings-client.tsx:1013, `!== null`) y el efecto del OAuth (L1113, por valor vacío) no comparten el criterio; el comentario de L1106-1107 describe mal lo que pasa. El dueño decidió cerrarlo en la fase (opción B, 2026-11-17)."
severity: major

### 9. B1 después de una recarga con un tab abierto (code review WR-04, a medir)
expected: recargar con un tab abierto y después tocar Inicio en la barra termina igual que sin recargar (Inicio con `#salir`, el atrás avisa)
result: issue
reported: "Code review 04-REVIEW.md WR-04 — SIN MEDIR: la marca `frjView` sobrevive a la recarga y el `back()` del `consume-view-then-navigate` cae en un documento distinto, sin `popstate`, y se perdería el segundo paso (Inicio → termina en Negocio/Datos). El dueño decidió cerrarlo en la fase (opción B, 2026-11-17): medir primero; si no reproduce, declararlo descartado con el número."
severity: major

## Summary

total: 9
passed: 5
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-04-6
  truth: "El primer toque de un tab de Finanzas (Ventas o Egresos) cambia el tab sin mover el scroll de la página"
  status: failed
  reason: "User reported: el primer toque de Ventas/Egresos scrollea al inicio de la página (Android y escritorio); después no pasa más; sólo Finanzas"
  severity: minor
  test: 6
  artifacts: []
  missing: []
  hypothesis: "04-REVIEW.md WR-01 — el `<Suspense fallback={null}>` nuevo de app/(dashboard)/finances/page.tsx:26 deja pendiente el scroll de la navegación de entrada (no hay nodo del DOM para consumirlo); el pushState del primer tab dispara ACTION_RESTORE y el layout ejecuta scrollTop = 0. Negocio/Configuración no lo muestran porque sus tabs están arriba de todo. SIN MEDIR: confirmar con CDP bajo con-turno antes de arreglar. Arreglarlo toca el gate test/panel-tabs.test.ts:400 y el caso (e)."
- gap_id: G-04-7
  truth: "Un doble toque rápido en un tab no duplica entradas del historial"
  status: failed
  reason: "Code review WR-02: el `from` de panelTabCause sale del render, no de window.location al momento del toque"
  severity: minor
  test: 7
  artifacts: [app/(dashboard)/finances/finances-client.tsx, app/(dashboard)/settings/settings-client.tsx]
  missing: []
- gap_id: G-04-8
  truth: "Volver del OAuth con `?mp=` vacío o con `?tab=integraciones&mp=…` no traba los tabs de Negocio"
  status: failed
  reason: "Code review WR-03: criterio distinto entre el render (L1013) y el efecto del OAuth (L1113) de settings-client.tsx"
  severity: major
  test: 8
  artifacts: [app/(dashboard)/settings/settings-client.tsx]
  missing: []
- gap_id: G-04-9
  truth: "B1 sigue andando después de recargar con un tab abierto"
  status: failed
  reason: "Code review WR-04, sin medir"
  severity: major
  test: 9
  artifacts: [lib/panel-history.ts, lib/panel-branch.ts, components/dashboard/unsaved-changes-guard.tsx]
  missing: []

## Deferred Follow-Ups

- test: 3
  idea: "obs-2: «al desconectar la cuenta y volver a conectarla, conecta direcamente, no pasa por mercadopago» — probablemente comportamiento de MercadoPago (saltea el consentimiento si la cuenta ya autorizó la app); a confirmar fuera de esta fase"
  deferred_at: 2026-11-17
- test: 3
  idea: "obs-3: «tampoco me cierra que no me lleve a la app movil, lo hace por una web» — el OAuth de MP abre la web de MP, no la app; fuera del alcance de la navegación del panel"
  deferred_at: 2026-11-17
- test: 5
  idea: "04-REVIEW.md IN-01 (condición de «subsección nuestra arriba» duplicada en unsaved-changes-guard.tsx:219 y panel-branch.ts:1528), IN-02 (router.refresh() en ?tab=integraciones podría re-aplicar el scroll, mismo mecanismo que WR-01 — conviene mirarlo junto con G-04-6), IN-03 (Agenda limpia ?google= con param 'google' y causa stale)"
  deferred_at: 2026-11-17
