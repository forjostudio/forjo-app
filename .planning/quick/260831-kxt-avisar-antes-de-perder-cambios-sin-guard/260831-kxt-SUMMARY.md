---
phase: quick-260831-kxt
plan: 01
subsystem: ui
tags: [next-app-router, onNavigate, beforeunload, dialog, agenda, dashboard]

requires:
  - phase: 19-el-panel
    provides: "hoursDirty — la bandera de cambios sin guardar del editor de horarios de Agenda"
  - phase: 14-cms-editor
    provides: "el precedente de beforeunload y el molde del diálogo de descartar en web-client.tsx"
provides:
  - "decideNavigation: la decisión pura allow/confirm del guard de salida, con test"
  - "UnsavedChangesProvider + useUnsavedChanges + useNavigationGuard: el guard compartido del panel"
  - "Los Link del sidebar (nav agrupado + Ayuda) y el logout consultan el guard antes de navegar"
  - "Agenda avisa antes de perder los horarios sin guardar, por navegación interna y por recarga/cierre"
affects: [agenda, sidebar, dashboard-layout, web-cms-editor]

tech-stack:
  added: []
  patterns:
    - "Guard de navegación del App Router vía la prop onNavigate del <Link> (Next 16.2.7)"
    - "Continuación opcional (proceed) en el guard para gestos que no son un push (logout)"
    - "Decisión extraída a helper puro en lib/ porque el runner corre en environment node sin jsdom"

key-files:
  created:
    - lib/unsaved-changes.ts
    - lib/unsaved-changes.test.ts
    - components/dashboard/unsaved-changes-guard.tsx
  modified:
    - app/(dashboard)/layout.tsx
    - components/dashboard/sidebar.tsx
    - app/(dashboard)/agenda/agenda-client.tsx

key-decisions:
  - "onNavigate del <Link> en vez de interceptar clicks en captura o envolver useRouter: onNavigate ya filtra Ctrl/Cmd+click, externos y download, y cubre el gesto que realmente se pierde (el click en el Link)"
  - "El diálogo se arma sobre @/components/ui/dialog con variant destructive, NO sobre components/crm/confirm-dialog.tsx: ese exige risk, renderiza RiskBadge y resuelve su peligro con useShellScope/--danger, que no existen fuera de .crm-shell"
  - "requestNavigation acepta una continuación opcional: el logout necesita signOut() antes del push, si no la sesión queda viva y el proxy rebota al dashboard"
  - "La bandera sucia vive en un ref, no en estado: el provider envuelve sidebar + página entera y un re-render por cada tecleo no compra nada"
  - "Escape, click afuera y el botón × equivalen a Seguir editando (la opción segura), nunca a descartar"
  - "El botón atrás del navegador queda fuera de alcance y DOCUMENTADO en el código, en vez de resuelto con el hack de history.pushState que desincroniza el router"

patterns-established:
  - "Guard de salida del panel: la página declara su bandera con useUnsavedChanges(dirty) y el nav consulta con useNavigationGuard() — una línea por pantalla para extenderlo"
  - "Lo que no se puede testear renderizado (environment node, sin jsdom) se extrae a una función pura en lib/ con su test co-ubicado"

requirements-completed: [UNSAVED-01, UNSAVED-02]

duration: 11min
completed: 2026-08-31
status: complete
---

# Quick 260831-kxt: Avisar antes de perder cambios sin guardar — Summary

**Agenda ya no descarta los horarios sin guardar en silencio: la navegación interna del panel abre un diálogo y recargar/cerrar la pestaña dispara el prompt nativo, los dos atados a la misma bandera que apaga el guardado.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-31T18:17:39Z
- **Completed:** 2026-08-31T18:28:40Z
- **Tasks:** 3/3
- **Files modified:** 6 (3 creados, 3 modificados)

## Qué se construyó

### `lib/unsaved-changes.ts` + su test (Task 1, TDD)

`decideNavigation({ dirty, href, currentPath })` → `'allow' | 'confirm'`. Tres reglas en orden: sin cambios
pendientes permite; el destino resuelto a su parte de ruta (lo que hay antes del primer `?` o `#`) igual a la
ruta actual permite; el resto pide confirmación. Sin React, sin `window`, sin imports.

Existe como módulo aparte porque el runner corre con `environment: 'node'` y el repo no tiene jsdom: el guard
renderizado no se puede cubrir con un test, pero el *qué se decide* sí. Mismo criterio que
`agenda-hours-payload.ts`. 8 casos, incluidos href con query y con hash.

### `components/dashboard/unsaved-changes-guard.tsx` (Task 2)

Provider + diálogo + dos hooks, espejando la forma de `lib/use-terminology.tsx`:

- `useUnsavedChanges(dirty)` — la llama la **página**. Sincroniza la bandera y **la apaga en el cleanup**, que es
  lo que garantiza que al salir de Agenda el panel entero vuelva a navegar sin fricción.
- `useNavigationGuard()` — la llama el **nav**. Devuelve `requestNavigation(href, proceed?)`, que retorna `true`
  si bloqueó. Delega la decisión en `decideNavigation`.
- El diálogo lo renderiza el **provider**, no cada página: es lo que permite que el sidebar (hermano de la
  página, no descendiente) dispare el aviso sin conocer nada del editor de horarios.

La bandera va en un **ref**, no en estado: el provider envuelve al sidebar y a la página entera, y con estado
cada encendido/apagado re-renderizaría el panel completo para nada.

### Cableado (Tasks 2 y 3)

- `app/(dashboard)/layout.tsx`: el provider envuelve el `<div className="min-h-screen">` que contiene `<Sidebar>`
  y `<main>`, dentro de `VerticalProvider`. Nada más del layout se movió.
- `components/dashboard/sidebar.tsx`: los `<Link>` del nav agrupado y el de "Ayuda" pasan por `onNavigate`; el
  botón "Cerrar sesión" pasa por el guard con `handleLogout` como continuación. Los dos `<a target="_blank">`
  ("Ver mi página" y forjo.studio) **no se tocaron**: abren pestaña nueva y no pierden la página.
- `app/(dashboard)/agenda/agenda-client.tsx`: `useUnsavedChanges(hoursDirty)`, el efecto de `beforeunload`
  espejando `web-client.tsx:371-384`, y el `<Link href="/servicios">` de la card de horarios pasando por el
  guard. No se tocó `saveHours`, ni el payload, ni el RPC, ni la grilla, ni el indicador visual existente.

## Verificación automatizada

| Gate | Resultado |
|------|-----------|
| `./node_modules/.bin/tsc --noEmit` | limpio (binario local — `npx tsc` es falso verde en este repo) |
| `npm test` (`vitest run`, pure + db) | 83 archivos, 1075 passed / 4 expected fail / 1 skipped |
| eslint archivos nuevos (`unsaved-changes.ts`, su test, el guard, `sidebar.tsx`) | 0, sin imprimir nada |
| eslint `agenda-client.tsx` | `1 problem (1 error, 0 warnings)` — el mismo D-13 preexistente (`Date.now()` en :1077) |
| eslint `app/(dashboard)/layout.tsx` | `1 problem (1 error, 0 warnings)` — preexistente, medido contra HEAD (ver Deviations) |
| `git status` sobre `phases/19-el-panel/` | limpio, sin cambios |
| Greps de contrato de las 3 tareas | todos con exit 0 |

**Cero hallazgos NUEVOS de eslint.**

## Verificación humana: PENDIENTE

El `human-check` de 14 puntos del plan **no se ejecutó ni se aprobó** — a propósito: fue escrito como
`human-check` y no como `checkpoint:human-verify` justamente porque `auto_advance: true` habría auto-aprobado un
checkpoint sin que nadie abriera el navegador (trampa ya documentada del proyecto). **Lo tiene que hacer una
persona, con `npm run dev` y sesión de dueño.** Resumen de lo que hay que probar:

*Navegación interna (1-10):* cambiar "Duración del turno" → tocar Turnos en el sidebar abre el diálogo y la
pantalla sigue siendo Agenda; "Seguir editando" conserva el valor y el indicador; "Salir sin guardar" navega **a
la sección que se tocó**; tocar "Agenda" estando en Agenda **no** abre el diálogo; después de guardar con éxito
**no** aparece; Escape y click afuera cierran sin navegar y sin descartar; en **375px** el drawer se cierra y el
diálogo aparece encima, con los dos botones ≥44px; con el foco arrancando en "Seguir editando" y sin escaparse
del modal; y en una pantalla sin cambios pendientes el sidebar navega exactamente como antes.

*Recarga / cierre (11-12):* F5 con cambios pendientes dispara el prompt nativo; después de guardar, no.

*Límite conocido (13):* F5 no, **atrás del navegador sí navega sin avisar** — verificar que se comporta como está
documentado, no que "funciona".

*No-regresión (14):* en **Mi web**, tocar el editor y apretar F5 → el prompt nativo de esa pantalla tiene que
seguir apareciendo igual que antes (su guard es propio y no se tocó).

## Límites conocidos (declarados, no defectos ocultos)

1. **El botón atrás/adelante del navegador no está cubierto.** El App Router de Next 16 no expone ninguna API de
   bloqueo de navegación para `popstate`, y el truco de empujar una entrada falsa al history con `pushState`
   desincroniza el historial del router. `beforeunload` tampoco lo cubre (atrás es navegación client-side). Está
   escrito en el docblock del guard para que el próximo que lea no lo descubra a los golpes.
2. **La bandera es estado sucio por gesto, no por diff.** Prender un chip y volver a apagarlo la deja encendida,
   así que **el diálogo puede aparecer aunque el estado final sea idéntico al inicial**. Es el comportamiento que
   el indicador ya tenía desde la fase 19; cambiarlo exige comparar contra un baseline de `dayStates` +
   `hoursConfig`, que es alcance nuevo.

## Deviations from Plan

**1. [Rule 3 - Baseline mal medido] El gate de eslint de la Task 2 asumía que `app/(dashboard)/layout.tsx` salía en 0**

- **Found during:** Task 2, al correr el gate.
- **Issue:** El gate pedía `eslint` en 0 sobre los tres archivos (guard, sidebar, layout). `layout.tsx` da
  `1 problem (1 error, 0 warnings)`: un `react-hooks/purity` por `Date.now()` en el cálculo de `daysLeft`
  (línea que este plan no toca). El plan sólo había medido el baseline de `agenda-client.tsx`.
- **Fix:** Se midió el baseline real corriendo eslint sobre la versión de `layout.tsx` en HEAD **antes** del
  cambio: mismo `1 problem (1 error, 0 warnings)`, misma regla, misma línea. El gate se aplicó como
  "cero hallazgos NUEVOS" (que es lo que el plan declara en `<verification>` §2), no como "cero hallazgos".
  El error preexistente **no se arregló**: es la misma clase de D-13 y está fuera de alcance por constraint.
- **Files modified:** ninguno por esta desviación.
- **Commit:** 1460f25

Ninguna otra desviación: cero dependencias nuevas, cero migraciones, cero cambios en `saveHours` / payload / RPC
/ indicador visual, y la fase 19 sin tocar.

## Threat model

Las seis amenazas del plan se mantienen como estaban planteadas:

- **T-kxt-01 (Repudiation, mitigada):** es la razón de la tarea. Cerrada por las dos vías, ambas atadas a
  `hoursDirty`, la misma bandera que apaga el guardado ⇒ guardado exitoso = ni diálogo ni prompt.
- **T-kxt-02 (EoP en el logout, mitigada):** el `onClick` conserva `handleLogout` completo y lo pasa como
  continuación; nunca se empuja `/login` sin `signOut()`.
- **T-kxt-03 (DoS por bandera pegada, mitigada):** cleanup del `useEffect` del hook al desmontar + apagado
  explícito del ref antes de ejecutar la continuación.
- **T-kxt-04 / 05 / 06 (accept):** `saveHours` y su RPC intactos; el copy del diálogo es fijo y no interpola
  ningún dato; no se tocó auth, RLS, `business_id`, queries ni rutas públicas.

Sin superficie de seguridad nueva: todo el cambio es navegación client-side detrás de la sesión del dueño.

## Follow-ups

- **Botón atrás/adelante del navegador:** sigue sin avisar. Revisar cuando Next publique una API de bloqueo de
  navegación para el App Router.
- **Extender el guard a otras pantallas:** `/web` (que hoy tiene sólo su `beforeunload` y cuyo propio comentario
  dice que le falta justo esta mitad), `/servicios`, `/negocio` y `/settings`. Ahora es una línea por pantalla.
  Excluido acá por constraint de alcance.
- **Estado sucio por diff en vez de por gesto:** eliminaría los falsos positivos del punto 2 de límites conocidos.
- **`react-hooks/purity` preexistente en `app/(dashboard)/layout.tsx:35`** (`Date.now()` en `daysLeft`): misma
  clase que D-13 en `agenda-client.tsx`. Anotado, no arreglado.

## Commits

| Task | Commit | Descripción |
|------|--------|-------------|
| 1 (RED) | `21a6359` | test: decisión del guard de salida, en rojo |
| 1 (GREEN) | `505667a` | feat: `decideNavigation`, la decisión pura del guard |
| 2 | `1460f25` | feat: guard de salida compartido del panel |
| 3 | `3d45d89` | feat: Agenda avisa antes de perder los horarios sin guardar |

## TDD Gate Compliance

Task 1 corrió el ciclo completo: commit `test(...)` con la suite en rojo (módulo inexistente, 0 tests
ejecutables) antes del commit `feat(...)` que la puso en verde (8/8). Sin fase REFACTOR: no hizo falta.
