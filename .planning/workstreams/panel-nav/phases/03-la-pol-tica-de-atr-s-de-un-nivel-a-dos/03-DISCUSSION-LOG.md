# Phase 3: La política de atrás, de un nivel a dos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-13
**Phase:** 3-La política de atrás, de un nivel a dos
**Areas discussed:** MOB-05, el atrás desde Más cuando no viniste de Inicio, cómo se pasa de una
sección de Más a otra, si hace falta mostrar que estás dentro de Más

---

## Lo que NO se preguntó, y por qué

Antes de abrir la discusión se verificó qué estaba ya cerrado, para no re-preguntar:

| Ya decidido | Dónde |
|---|---|
| **Más es una ruta** (`/mas`), no una hoja de overlay | Phase 2 — cierra el camino (iii) de los tres que el ROADMAP dejaba abiertos |
| La **forma** del aviso de MOB-05: efímero, sin modal ni botones | UI-SPEC Phase 2, **O-3** |
| Su **copy, posición, tokens, capa, movimiento y a11y** | UI-SPEC Phase 2, **§13** |
| La regla de la **constante única** (duración visible = ventana lógica) | UI-SPEC Phase 2, §13 |
| **Entrar directo a una ruta** sigue saliendo del panel | v0.30, aceptado y documentado |
| Las tres marcas de historial y la regla 0 | `lib/panel-history.ts`, intacto |

También se verificó que el pedido de julio del dueño —*"preferiría que te frene"*— era sobre
**horarios sin guardar en Agenda**, no sobre salir desde Inicio. Son cosas distintas y se le dijo,
para que decidiera MOB-05 sin creer que ya lo había pedido.

---

## Área 1 — MOB-05: la guarda de salida en Inicio

**Pregunta:** en Inicio, ¿el atrás tiene que frenarte antes de sacarte del panel?

**Lo que se le puso sobre la mesa, medido:**

- A favor: cuesta **un solo toque extra**, no bloquea, usa infraestructura que ya corre en producción
  (`lib/dirty-history.ts` y su ciclo sentinel), cero dependencia nueva.
- En contra: absorber significa **dos toques de atrás siempre** para salir desde Inicio; la condición
  que lo haría natural —app instalada— **no existe** (cero `manifest`, cero `display-mode`); y el
  argumento más fuerte, del propio ROADMAP: **en Inicio no hay nada que perder** (no hay formulario,
  ni borrador, ni cambios sin guardar — esos ya los cubre `dirty-history` donde sí importan).

| Opción | Resultado |
|---|---|
| **Descartarlo con motivo escrito** (recomendada) | no elegida |
| **Implementarlo con el aviso efímero** | ✅ **elegida** |
| Implementarlo y decidir con el pulgar durante la UAT | no elegida |

**Nota:** el dueño eligió contra la recomendación, con el costo a la vista. Queda registrado como
decisión informada, no como omisión. → **D-01**

---

## Área 2 — El atrás desde Más cuando no viniste de Inicio

**Pregunta:** estás en Turnos (lo abriste desde la barra), tocás Más, y después atrás. ¿Dónde caés?

| Opción | Consecuencia | Resultado |
|---|---|---|
| **Devuelve a Turnos** (recomendada) | el atrás deshace el último movimiento; la pila tiene 3 escalones en ese recorrido | ✅ **elegida** |
| Siempre a Inicio | política más simple de razonar; Turnos desaparece sin que nadie lo cierre | no elegida |
| Que Más no deje entrada (reemplaza) | rompe MOB-04: sin entrada propia, "desde una sección vuelve a Más" es imposible | listada sólo para descartarla con motivo |

**Consecuencia registrada:** "dos niveles" pasa a significar la profundidad de **Más y sus secciones**,
no un techo de la pila. El texto de MOB-04 y el criterio 1 necesitan esa precisión. → **D-02**

---

## Área 3 — Cómo se pasa de una sección de Más a otra

**Pregunta:** estás en Finanzas (abierta por Más) y tocás Más. ¿Qué pasa?

Es el gesto **más común** del modelo nuevo: así se va de una sección de Más a otra.

| Opción | Pila final | Salir cuesta | Resultado |
|---|---|---|---|
| **Sube un nivel, sin apilar** (recomendada) | `Inicio → Más → Configuración` | 2 atrás | ✅ **elegida** |
| Apila siempre | `Inicio → Más → Finanzas → Más → Configuración` | 4 atrás, pasando por Finanzas | no elegida |
| La sección nueva pisa a la anterior | mínima | — | no elegida: el atrás desde una sección caería en Inicio, que es justo lo que MOB-04 arregla |

**Nota:** no inventa un concepto nuevo — es la misma regla que el repo ya aplica desde v0.30 cuando se
toca el destino en el que ya se está (NAV-08, `consumeOwnedPanelEntry`). → **D-03**

---

## Área 4 — ¿Hace falta mostrar que estás "dentro de Más"?

**Pregunta:** ¿la pantalla tiene que mostrar que estás dentro de la rama de Más?

**El riesgo que se le planteó, sin suavizar:** dos pantallas que se ven igual se comportan distinto —
en Turnos el atrás cae en Inicio, en Finanzas cae en Más— y hoy nada en pantalla lo dice.

**El argumento de método que se le dio:** ésta es la fase más riesgosa del milestone. Si además cambia
algo visible, la UAT tiene que separar *"¿la política funciona?"* de *"¿el indicador nuevo ayuda?"*, y
eso ensucia justo la verificación que más importa.

| Opción | Gate de diseño | Resultado |
|---|---|---|
| **Nada nuevo por ahora** (recomendada) | no lo reabre | ✅ **elegida** |
| Que "Más" quede iluminado en la barra | ⚠ lo reabre | no elegida |
| Un "volver a Más" en el header | ⚠ lo reabre | no elegida |
| Un breadcrumb | ⚠ lo reabre | no elegida |

**Queda vivo como ítem de UAT**, no enterrado: si el dueño se pierde en el teléfono, vuelve con
evidencia y entra por `/gsd-ui-phase`. → **D-04**

---

## Scope creep

Ninguno. La discusión se mantuvo dentro del dominio de la fase en las cuatro áreas.

---

*Discussion log — Phase 3, 2026-10-13*
