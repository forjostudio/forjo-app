---
schema_version: 1
open_count: 10
waived_count: 0
fixed_count: 1
total_count: 11
last_updated: 2026-10-09T00:56:56.376Z
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
  }
]
````
