# Decisión del dueño sobre la composición de los tabs con los dos niveles — 2026-11-17

**Resuelve** el checkpoint del task 2 del plan `04-03`: qué hacer con los gestos de la barra (y del
sidebar) cuando hay una subsección nuestra abierta arriba —un tab de `/negocio`, `/settings` o
`/finances`, o la ficha `?c=` de un cliente—. No toca D-01 ni D-02 de la Phase 4 (cómo se mueven los
tabs entre sí) ni ninguna de las decisiones de la Phase 3 (`03-DECISION-UAT.md`,
`03-DECISION-UAT-2.md`, `03-DECISION-UAT-3.md`): las tres siguen en pie.

## Qué apareció

El plan `04-03` midió en la app real la composición que el research había DERIVADO del código sin medir
(A1). Los `esperado` eran la pila derivada, commiteados en `b47555d` (`test(04-03)`) antes de correr, y
no se tocaron después. Medido con `next dev` propio en el 3031, Chrome `157.0.8103.52`, gesto `interfaz`,
modo estricto. Registro completo: `.planning/debug/tabs-en-la-url-medida.md` § `(e)`.

| Recorrido | Sin el tab (Phase 3) | Medido con el tab arriba | Lo que ve el dueño |
|---|---|---|---|
| `R-C-2` celular `Más → Negocio → Cobros → Inicio` | colapsa a `[/dashboard]`, aviso armado | `[/dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard]`, aviso `no` | el atrás desde Inicio vuelve a Cobros; el aviso de salida no está (el síntoma de `G2-1` por otro camino) |
| `R-C-3` celular `… → Cobros → Turnos` | `[/dashboard, /appointments]` | `[/dashboard, /mas, /negocio, /appointments]` | desde Turnos el atrás pasa por Negocio y Más antes de Inicio |
| `R-C-4` celular `… → Cobros → Más` | sube a Más | `[…, /negocio?tab=cobros, /mas]` | Más se apila arriba del tab; el atrás vuelve a Cobros |
| `R-C-5` escritorio `Inicio → Negocio → Cobros → Finanzas` (sidebar) | `[/dashboard, /finances]` | `[/dashboard, /negocio, /finances]` | el atrás desde Finanzas cae en Negocio en vez de Inicio |
| `R-C-6` escritorio `… → Cobros → Inicio` (sidebar) | empuja (residuo de escritorio ya declarado) | `[/dashboard, /negocio, /negocio?tab=cobros, /dashboard]` | lo mismo que hoy sin el tab |
| `R-C-ficha` celular `Inicio → Clientes → ficha → Inicio` | — (nunca medido) | `[/dashboard, /clients, /clients?c=*, /dashboard]`, aviso `no` | el mismo síntoma de `R-C-2`, que ya existía hoy sin declarar |

Los seis en `OK` contra la derivación: `composicion medida: como-se-derivo`. El mecanismo quedó a la vista
en la marca de la entrada de arriba: `{"frjView":"tab"}` (o `{"frjView":"c"}`), sin `frjUnder`, así que
`masDebajo` y `raizDebajo` dan falso y la regla 0 de `panelBranchPlan` devuelve lo de `panelNavMode`. Los
seis son degradación segura: ningún atrás expulsó del sitio. C-1 (el criterio 1 tal cual) ya estaba medido
en el 04-02 (`R-T-negocio-por-mas` OK) y no depende de esta decisión.

## La decisión: B1 — CERRAR EL HUECO EN LA BARRA

decision del dueno sobre la composicion: B1

Respuesta literal del dueño en el checkpoint del 2026-11-17: «B1» (sin línea de porqué adicional).

Con una subsección nuestra arriba, el gesto de la barra la **consume primero** y recién después decide
con la pila real, así que termina igual que sin la subsección. Lo hace el plan `04-04` con un séptimo
miembro del plan de la rama (`consume-view-then-navigate`), con su sonda en rojo antes del código.

## El costo, declarado

- **El `04-04` toca el plan de la rama:** `lib/panel-history.ts` (el miembro nuevo y el hecho
  `vistaArriba` en `panelBranchPlan`, en una regla nueva y aditiva), `lib/panel-branch.ts` (la rama del
  ejecutor que consume y re-decide) y `components/dashboard/unsaved-changes-guard.tsx` (declara el miembro
  y degrada a la regla de rutas). Es código de la Phase 3 que costó tres rondas de UAT: la Phase 3 tiene
  que seguir en `OK` en la sonda de la app y en las suites, y el dueño lo verifica en el teléfono (04-05).
- **Cierra C-2, C-3, C-4 y la ficha `?c=`** (los cuatro de la barra). Los `R-C-2`, `R-C-3`, `R-C-4` y
  `R-C-ficha` quedan `obsoleto` apuntando a sus `R-B1-*`, con su `esperado` intacto.
- **C-5 queda declarado como residuo** (2026-11-17): en escritorio, `Inicio → Negocio → Cobros → Finanzas`
  por el sidebar deja `[/dashboard, /negocio, /finances]` y el atrás desde Finanzas cae en **Negocio** en
  vez de Inicio. Un escalón más, nunca una expulsión. El sidebar no tiene el hook y cerrarlo reabre la
  enmienda de MOB-07 (B2, descartada). Escrito en los cuatro lugares: el docblock de `lib/panel-tabs.ts`,
  `### El residuo, declarado` al final de `(e)` en el registro, el «RESIDUO ACEPTADO» debajo de MOB-08 en
  `REQUIREMENTS.md` y su entrada en `.planning/WINDOWS.md`.
- C-6 (escritorio, `… → Cobros → Inicio` por el sidebar) no es nuevo: es el residuo de escritorio de la
  Phase 3 (entrada 16 de `.planning/WINDOWS.md`), ahora con el tab abajo. Queda como está.

## Lo que esta decisión NO cambia

- C-1 y el criterio 1 de la Phase 4: los tabs ya lo cumplen sin esta decisión.
- La política de la Phase 3 fuera de los gestos con una subsección arriba: `panelNavMode` y las reglas
  existentes de `panelBranchPlan` quedan intactas (el arreglo del 04-04 es aditivo).
- Desktop: con B1 no cambia nada a ≥1024 px (la barra está oculta y su `handleNavigate` no corre). MOB-07
  y su enmienda (D-05 de la Phase 3) quedan intactos.

## Sin medir

- **El tercer retroceso encadenado** (tab → sección → Más → Inicio), que es lo que B1 hace en
  `Más → Negocio → Cobros → tocar Inicio`: la Phase 3 nunca encadenó tres. Lo mide el 04-04
  (`R-B1-inicio`) antes de darlo por bueno.
- Todo lo medido es Chrome de **escritorio**. Chrome de Android y Safari de iOS no están medidos: los
  cierra el 04-05 en el teléfono del dueño.
