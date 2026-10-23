---
schema_version: 1
open_count: 13
waived_count: 0
fixed_count: 2
total_count: 15
last_updated: 2026-10-23T22:49:48.940Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 21 | unrun-verify | app/(onboarding)/onboarding/page.tsx |  | UAT visual del aviso de D-07 en el paso Horarios (5 pasos) pendiente: modo end-of-phase | open |  | 2026-09-12T00:27:49.878Z |  |
| 2 | quick | unrun-verify | app/(onboarding)/onboarding/page.tsx |  | el vaciado de Min. y Precio con el teclado en el paso 2 del alta no se pudo probar: el runner corre sin DOM (environment node) | open |  | 2026-09-12T23:26:54.315Z |  |
| 3 | quick | unrun-verify | components/dashboard/canchas-manager.tsx |  | el vaciado de Duracion en alta y edicion de canchas quedo como human-check sin correr: sin DOM en el runner | open |  | 2026-09-12T23:26:55.027Z |  |
| 4 | quick | unrun-verify | app/(dashboard)/settings/settings-client.tsx |  | el vaciado y la normalizacion onBlur de los cuatro campos de Ajustes > Servicios quedo como human-check sin correr: sin DOM en el runner | open |  | 2026-09-12T23:26:55.683Z |  |
| 5 | quick | unrun-verify | app/(dashboard)/web/web-client.tsx |  | quick 260913-3tv: los 4 human-check del preview (servicio sin franja deshabilitado, staff filtrado, wizard de canchas, widget que no se reinicia al tipear) NO se corrieron — el runner es environment:node y auto_advance los auto-aprobo | open |  | 2026-09-13T06:14:15.130Z |  |
| 6 | 24 | unrun-verify | app/[slug]/booking-client.tsx |  | UAT visual de los 10 puntos del plan 24-01 sin correr (human_verify_mode: end-of-phase); cubre el backstop de CAT-10 (nombre largo a ~432px) y el control negativo de cero categorias en pantalla real | open |  | 2026-09-23T04:05:46.228Z |  |
| 7 | 02 | stub | components/dashboard/panel-bottom-nav.tsx |  | El 5o destino de la barra apunta a /mas, ruta que todavia no existe: 404 hasta el plan 02-02 (estado intermedio declarado de la fase) | fixed |  | 2026-10-08T23:26:16.870Z | 2026-10-08T23:56:52.800Z |
| 8 | 02 | lint-warning | app/(dashboard)/layout.tsx | 62 | react-hooks/purity preexistente (Date.now en render) — eslint rc 1 sobre el layout; diferido por alcance, ver deferred-items.md | open |  | 2026-10-08T23:26:17.647Z |  |
| 9 | 02 | unrun-verify | app/(dashboard)/mas/mas-client.tsx |  | UAT visual de los 9 puntos del plan 02-02 sin correr (inventario rubro por rubro en 4 cuentas, nombre de >=40 caracteres, scroll hasta la firma, logout fallando, 2 pasadas de contraste y los 5 aria-labelledby con lector de pantalla): el runner es environment:node, sin jsdom ni Playwright | open |  | 2026-10-08T23:57:00.625Z |  |
| 10 | 02 | unrun-verify | components/dashboard/panel-top-bar.tsx |  | UAT visual de los 9 puntos del human-check del plan 02-03 sin correr (no hay boton de menu en mobile, el header de 2 lineas cambiando con la terminologia del rubro, Inicio en la raiz, el detalle de cliente diciendo Clientes/Pacientes, nombre de >=40 caracteres truncando, el header orientando a mitad de un formulario largo, la UAT de v0.30 repetida DESDE LA BARRA con los dos recorridos que no son bugs, el sidebar de desktop identico con su logout, y la banda de 900px): el runner es environment:node, sin jsdom ni Playwright | open |  | 2026-10-09T00:15:38.795Z |  |
| 11 | 02 | unrun-verify | app/(dashboard)/mas/mas-client.tsx |  | GUION CONSOLIDADO de la UAT de la Phase 2 en celular real (reemplaza como lista unica a las entradas 9 y 10): bloques A a E de 02-04-SUMMARY.md — los 5 items irreducibles (franja de gestos en iPhone con notch, teclado en Android Chrome E iOS Safari, botones de alta de Finanzas y footers de Negocio/Configuracion alcanzables, las 3 pasadas de contraste forjo-claro/spa-clay/modern-amber, y la UAT de v0.30 repetida DESDE LA BARRA), el inventario rubro por rubro con el eje de las 5 familias tipograficas, el header de 2 lineas con la terminologia del rubro, cero boton de menu en mobile, la banda de 900px y el desktop >=1024px con su logout, el lector de pantalla, los DOS recorridos que NO son bugs, y el meta viewport de /dashboard y /admin que este plan no pudo medir sin sesion | open |  | 2026-10-09T00:56:56.376Z |  |
| 12 | 3 | unmet-truth | lib/panel-branch.ts |  | El sentinel de salida se arma estando en la raiz haya o no haya historia debajo: con una seccion debajo de Inicio el segundo atras vuelve a esa seccion en vez de salir, y el copy del aviso queda optimista (declarado, sin API confiable para preguntar si hay algo debajo) | fixed |  | 2026-10-14T04:06:47.600Z | 2026-10-23T22:49:19.278Z |
| 13 | 3 | unrun-verify | .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-04-SUMMARY.md |  | GUION DE LA UAT DE LA PHASE 3 EN CELULAR REAL, PENDIENTE: los 21 recorridos de 03-04-SUMMARY.md (bloques A a I) en Android Chrome Y en iPhone Safari, con pestana nueva y recarga. Cierra los tres supuestos que ninguna sonda puede cerrar: A1 (el orden del efecto que escribe la marca contra la escritura del router; si esta mal, D-03 y el criterio 2 degradan a apilar EN SILENCIO), A2 (que no haya otro commit del router en vuelo) y A11 (Safari/iOS y Chrome Android reales: todo lo medido fue Chrome de escritorio headless). Es el unico criterio que cierra la fase: su modo de falla es silencioso y no lo ve tsc, ni la suite, ni el build. Las casillas de MOB-04, MOB-05 y MOB-06 en REQUIREMENTS.md siguen SIN marcar hasta que esto se verifique | open |  | 2026-10-14T04:34:23.581Z |  |
| 14 | 3 | unrun-verify | .planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-2.md |  | GUION DE LA RONDA 2 DE LA UAT DE LA PHASE 3 EN CELULAR REAL (reemplaza como lista unica a la entrada 13, cuyo texto quedo obsoleto: decia pendientes los 21 recorridos en Android Chrome Y en iPhone Safari, y Android SI se corrio el 2026-10-15 con 16 pasados, 5 fallados -items 7, 8, 15, 19, 20- y una colision de diseno en el bloque H). Lo que falta, y nada mas: (1) ANDROID -los 5 fallos arreglados en los planes 03-05/03-06/03-07, la colision H bajo la decision (a), la parte de overlay del item 20 que nunca se midio por no haber overlays en Inicio, y la regresion dirigida de los items 1-5, 10-13, 16 y 21 con el motivo medido de cada uno (los 1-5 se verifican MIRANDO LA URL porque su modo de falla es silencioso: con el sentinel enterrado el atras aterriza en una entrada de la raiz con hash que se ve igual que Inicio); (2) IPHONE SAFARI -los 21 items completos, porque en Safari NADA de esta fase se verifico. NO vuelven en Android: 6 y 18 (plegados en 7 y 19), 9 (mutuamente excluyente por construccion con la rama nueva), 14 y 17 (/agenda es destino de la barra). Cierra A1 (el orden del efecto que escribe la marca contra la escritura del router), A2 (que no haya otro commit del router en vuelo) y A11 (los dos motores reales). Las casillas de MOB-04, MOB-05 y MOB-06 siguen SIN marcar hasta que esto pase; MOB-06 le debe SOLO iPhone, porque su bloque de regresion en Android ya paso | open |  | 2026-10-23T22:49:37.119Z |  |
| 15 | 3 | unmet-truth | lib/panel-branch.ts |  | RESIDUO ACEPTADO de la decision (a) del dueno (2026-10-15), que reemplaza a la entrada 12 -ya marcada como arreglada-: el sentinel de salida ahora se arma SOLO si no hay nada nuestro debajo, asi que el caso de la seccion debajo de Inicio quedo cerrado. Lo que sigue en pie: si la entrada que quedo debajo de la raiz es AJENA (otro sitio, no una pantalla nuestra) no hay API confiable para saberlo -history.length cuenta tambien las entradas de adelante- y el aviso va a aparecer igual, con el segundo atras saliendo del panel sin mas. Declarado y aceptado con el mismo criterio con el que v0.30 acepto el caso de entrada directa (medido en E-7). El invariante que importa se sostiene: el gesto hace algo visible en los dos casos. Escrito en lib/panel-branch.ts, en .planning/debug/pila-de-dos-niveles-medida.md, debajo de MOB-05 en REQUIREMENTS.md y en el bloque I de 03-04-SUMMARY.md | open |  | 2026-10-23T22:49:48.940Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "21",
    "file": "app/(onboarding)/onboarding/page.tsx",
    "line": null,
    "description": "UAT visual del aviso de D-07 en el paso Horarios (5 pasos) pendiente: modo end-of-phase",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T00:27:49.878Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "app/(onboarding)/onboarding/page.tsx",
    "line": null,
    "description": "el vaciado de Min. y Precio con el teclado en el paso 2 del alta no se pudo probar: el runner corre sin DOM (environment node)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T23:26:54.315Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "components/dashboard/canchas-manager.tsx",
    "line": null,
    "description": "el vaciado de Duracion en alta y edicion de canchas quedo como human-check sin correr: sin DOM en el runner",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T23:26:55.027Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "app/(dashboard)/settings/settings-client.tsx",
    "line": null,
    "description": "el vaciado y la normalizacion onBlur de los cuatro campos de Ajustes > Servicios quedo como human-check sin correr: sin DOM en el runner",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-12T23:26:55.683Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "quick",
    "file": "app/(dashboard)/web/web-client.tsx",
    "line": null,
    "description": "quick 260913-3tv: los 4 human-check del preview (servicio sin franja deshabilitado, staff filtrado, wizard de canchas, widget que no se reinicia al tipear) NO se corrieron — el runner es environment:node y auto_advance los auto-aprobo",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-13T06:14:15.130Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "24",
    "file": "app/[slug]/booking-client.tsx",
    "line": null,
    "description": "UAT visual de los 10 puntos del plan 24-01 sin correr (human_verify_mode: end-of-phase); cubre el backstop de CAT-10 (nombre largo a ~432px) y el control negativo de cero categorias en pantalla real",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-23T04:05:46.228Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "stub",
    "phase": "02",
    "file": "components/dashboard/panel-bottom-nav.tsx",
    "line": null,
    "description": "El 5o destino de la barra apunta a /mas, ruta que todavia no existe: 404 hasta el plan 02-02 (estado intermedio declarado de la fase)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-08T23:26:16.870Z",
    "resolved_at": "2026-10-08T23:56:52.800Z"
  },
  {
    "id": 8,
    "kind": "lint-warning",
    "phase": "02",
    "file": "app/(dashboard)/layout.tsx",
    "line": 62,
    "description": "react-hooks/purity preexistente (Date.now en render) — eslint rc 1 sobre el layout; diferido por alcance, ver deferred-items.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T23:26:17.647Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "app/(dashboard)/mas/mas-client.tsx",
    "line": null,
    "description": "UAT visual de los 9 puntos del plan 02-02 sin correr (inventario rubro por rubro en 4 cuentas, nombre de >=40 caracteres, scroll hasta la firma, logout fallando, 2 pasadas de contraste y los 5 aria-labelledby con lector de pantalla): el runner es environment:node, sin jsdom ni Playwright",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T23:57:00.625Z",
    "resolved_at": null
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "components/dashboard/panel-top-bar.tsx",
    "line": null,
    "description": "UAT visual de los 9 puntos del human-check del plan 02-03 sin correr (no hay boton de menu en mobile, el header de 2 lineas cambiando con la terminologia del rubro, Inicio en la raiz, el detalle de cliente diciendo Clientes/Pacientes, nombre de >=40 caracteres truncando, el header orientando a mitad de un formulario largo, la UAT de v0.30 repetida DESDE LA BARRA con los dos recorridos que no son bugs, el sidebar de desktop identico con su logout, y la banda de 900px): el runner es environment:node, sin jsdom ni Playwright",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-09T00:15:38.795Z",
    "resolved_at": null
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "app/(dashboard)/mas/mas-client.tsx",
    "line": null,
    "description": "GUION CONSOLIDADO de la UAT de la Phase 2 en celular real (reemplaza como lista unica a las entradas 9 y 10): bloques A a E de 02-04-SUMMARY.md — los 5 items irreducibles (franja de gestos en iPhone con notch, teclado en Android Chrome E iOS Safari, botones de alta de Finanzas y footers de Negocio/Configuracion alcanzables, las 3 pasadas de contraste forjo-claro/spa-clay/modern-amber, y la UAT de v0.30 repetida DESDE LA BARRA), el inventario rubro por rubro con el eje de las 5 familias tipograficas, el header de 2 lineas con la terminologia del rubro, cero boton de menu en mobile, la banda de 900px y el desktop >=1024px con su logout, el lector de pantalla, los DOS recorridos que NO son bugs, y el meta viewport de /dashboard y /admin que este plan no pudo medir sin sesion",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-09T00:56:56.376Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "unmet-truth",
    "phase": "3",
    "file": "lib/panel-branch.ts",
    "line": null,
    "description": "El sentinel de salida se arma estando en la raiz haya o no haya historia debajo: con una seccion debajo de Inicio el segundo atras vuelve a esa seccion en vez de salir, y el copy del aviso queda optimista (declarado, sin API confiable para preguntar si hay algo debajo)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-10-14T04:06:47.600Z",
    "resolved_at": "2026-10-23T22:49:19.278Z"
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "3",
    "file": ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-04-SUMMARY.md",
    "line": null,
    "description": "GUION DE LA UAT DE LA PHASE 3 EN CELULAR REAL, PENDIENTE: los 21 recorridos de 03-04-SUMMARY.md (bloques A a I) en Android Chrome Y en iPhone Safari, con pestana nueva y recarga. Cierra los tres supuestos que ninguna sonda puede cerrar: A1 (el orden del efecto que escribe la marca contra la escritura del router; si esta mal, D-03 y el criterio 2 degradan a apilar EN SILENCIO), A2 (que no haya otro commit del router en vuelo) y A11 (Safari/iOS y Chrome Android reales: todo lo medido fue Chrome de escritorio headless). Es el unico criterio que cierra la fase: su modo de falla es silencioso y no lo ve tsc, ni la suite, ni el build. Las casillas de MOB-04, MOB-05 y MOB-06 en REQUIREMENTS.md siguen SIN marcar hasta que esto se verifique",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-14T04:34:23.581Z",
    "resolved_at": null
  },
  {
    "id": 14,
    "kind": "unrun-verify",
    "phase": "3",
    "file": ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-2.md",
    "line": null,
    "description": "GUION DE LA RONDA 2 DE LA UAT DE LA PHASE 3 EN CELULAR REAL (reemplaza como lista unica a la entrada 13, cuyo texto quedo obsoleto: decia pendientes los 21 recorridos en Android Chrome Y en iPhone Safari, y Android SI se corrio el 2026-10-15 con 16 pasados, 5 fallados -items 7, 8, 15, 19, 20- y una colision de diseno en el bloque H). Lo que falta, y nada mas: (1) ANDROID -los 5 fallos arreglados en los planes 03-05/03-06/03-07, la colision H bajo la decision (a), la parte de overlay del item 20 que nunca se midio por no haber overlays en Inicio, y la regresion dirigida de los items 1-5, 10-13, 16 y 21 con el motivo medido de cada uno (los 1-5 se verifican MIRANDO LA URL porque su modo de falla es silencioso: con el sentinel enterrado el atras aterriza en una entrada de la raiz con hash que se ve igual que Inicio); (2) IPHONE SAFARI -los 21 items completos, porque en Safari NADA de esta fase se verifico. NO vuelven en Android: 6 y 18 (plegados en 7 y 19), 9 (mutuamente excluyente por construccion con la rama nueva), 14 y 17 (/agenda es destino de la barra). Cierra A1 (el orden del efecto que escribe la marca contra la escritura del router), A2 (que no haya otro commit del router en vuelo) y A11 (los dos motores reales). Las casillas de MOB-04, MOB-05 y MOB-06 siguen SIN marcar hasta que esto pase; MOB-06 le debe SOLO iPhone, porque su bloque de regresion en Android ya paso",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-23T22:49:37.119Z",
    "resolved_at": null
  },
  {
    "id": 15,
    "kind": "unmet-truth",
    "phase": "3",
    "file": "lib/panel-branch.ts",
    "line": null,
    "description": "RESIDUO ACEPTADO de la decision (a) del dueno (2026-10-15), que reemplaza a la entrada 12 -ya marcada como arreglada-: el sentinel de salida ahora se arma SOLO si no hay nada nuestro debajo, asi que el caso de la seccion debajo de Inicio quedo cerrado. Lo que sigue en pie: si la entrada que quedo debajo de la raiz es AJENA (otro sitio, no una pantalla nuestra) no hay API confiable para saberlo -history.length cuenta tambien las entradas de adelante- y el aviso va a aparecer igual, con el segundo atras saliendo del panel sin mas. Declarado y aceptado con el mismo criterio con el que v0.30 acepto el caso de entrada directa (medido en E-7). El invariante que importa se sostiene: el gesto hace algo visible en los dos casos. Escrito en lib/panel-branch.ts, en .planning/debug/pila-de-dos-niveles-medida.md, debajo de MOB-05 en REQUIREMENTS.md y en el bloque I de 03-04-SUMMARY.md",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-23T22:49:48.940Z",
    "resolved_at": null
  }
]
````
