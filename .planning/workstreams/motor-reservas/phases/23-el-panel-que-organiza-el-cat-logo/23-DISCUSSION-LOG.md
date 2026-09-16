# Phase 23: El panel que organiza el catálogo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 23-El panel que organiza el catálogo
**Areas discussed:** Dónde vive el organizador, Cómo se asigna la categoría, Cómo se guarda el reorden, Orden de servicios dentro

---

## Selección de áreas

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Dónde vive el organizador | Card inline / diálogo / sub-vista + dónde caen los 2 selectores de modo | ✓ |
| Cómo se asigna la categoría | Select en el form / arrastrar en el organizador / los dos | ✓ |
| Cómo se guarda el reorden | Escritura de N filas: cliente / server action / RPC con migración | ✓ |
| Orden de servicios dentro | Si esta fase da UI para ordenar servicios a mano | ✓ |

**Elección:** las cuatro.

---

## Dónde vive el organizador

### Q1 — ¿Cómo aparece el organizador de categorías en /servicios?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Card propia arriba del listado | Siempre visible, molde CanchasManager. Costo: /servicios ya es larga y suma bloque permanente | |
| Card colapsable | Colapsada por default con el conteo en el header. Respeta que cero categorías es el estado de TODOS los negocios hoy | ✓ |
| Diálogo desde un botón | Todo el CRUD + drag en un Dialog. Riesgo: drag y controles dentro de overlays ya mordieron en mobile | |
| Vos decidís | — | |

### Q2 — ¿Dónde van los dos selectores de modo de orden?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Cada uno donde actúa | Categorías en la Card; servicios arriba de la lista de servicios | ✓ |
| Los dos en la Card | Juntos, como "cómo se lee mi catálogo". Costo: el de servicios queda escondido tras el colapso | |
| En la config del negocio | Coherente con que son columnas de `businesses`. Costo: rompe el ciclo de feedback | |
| Vos decidís | — | |

### Q3 — ¿Qué ve el dueño al entrar, según si ya tiene categorías?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Siempre colapsada + conteo | Predecible, la pantalla mide siempre lo mismo | |
| Colapsada si vacía, abierta si hay | El estado de la Card refleja si la función está en uso | ✓ |
| Colapsada + recuerda la elección | localStorage. Costo: estado por navegador, no por cuenta | |
| Vos decidís | — | |

### Q4 — Borrar una categoría (`ON DELETE SET NULL`): ¿cómo se comunica?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Confirmación con el conteo | Dice cuántos servicios quedan sin categoría y que siguen a la venta | ✓ |
| Confirmación genérica | Más simple, cero query extra. Costo: la duda queda viva | |
| Sin confirmación + deshacer | Costo: deshacer tendría que recrear la categoría Y reasignar los servicios | |
| Vos decidís | — | |

**Notas:** el precedente estructural (`components/dashboard/canchas-manager.tsx`) se verificó antes de
preguntar: ya es un bloque extraído de `settings-client.tsx` y renderizado dentro de esta misma vista,
así que "sale a componente propio" no se discutió — se dio por sentado.

---

## Cómo se asigna la categoría a un servicio

### Q1 — ¿Dónde asigna el dueño la categoría?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| En el form del servicio | Select con "Sin categoría" en alta + edición. Un solo camino de escritura | |
| Arrastrando en el organizador | Como forjo-tiendas. Costo: duplica el catálogo en pantalla | |
| Los dos caminos | Máxima comodidad. Costo: dos caminos sobre el mismo dato, dos veces la superficie de bug | ✓ |
| Vos decidís | — | |

### Q2 — ¿Dónde pasa el arrastre sin duplicar el catálogo?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| La lista de abajo se agrupa | Un solo catálogo en pantalla. Costo: toca la región más cargada del archivo | |
| Chips dentro de la Card | Arrastre contenido, cero riesgo sobre la lista existente. Costo: nombres en dos lugares | |
| Zona de sueltos + chips | Ídem + grupo "Sin categoría" al final para asignar en lote | |
| Vos decidís | — | ✓ |

**Decisión de Claude:** *Zona de sueltos + chips*. El grupo de sueltos es lo que hace posible asignar
en lote (sin él no hay de dónde arrastrar) y hace visible el estado que CAT-02 declara válido y
permanente; mantener el arrastre fuera de la lista existente deja intacta la región más peleada de
`settings-client.tsx` (la tarjeta de servicio, con su invariante de 32px de G-04).

### Q3 — Arrastrar no funciona en mobile ni con teclado. ¿Cómo asigna en mobile?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| El Select del form alcanza | El arrastre es atajo de desktop; el Select es el camino universal | |
| Chip con menú "Mover a…" | Asignar en lote funciona igual en mobile. Costo: un tercer camino de escritura | ✓ |
| Vos decidís | — | |

**Notas:** con tres superficies escribiendo `services.category_id`, se anotó como restricción dura que
las tres pasen por **una sola** función de escritura.

---

## Cómo se guarda el reorden

### Q1 (primera pasada, sólo categorías)

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Un solo upsert multi-fila | Atómico, cero migraciones, precedente `agenda-client.tsx:801` | |
| RPC transaccional (migr. 080) | Molde `save_agenda_blocks`. Costo: rompe el "cero migraciones" | |
| N updates con Promise.all | Portar forjo-tiendas tal cual. Costo: no atómico | |
| Vos decidís | — | ✓ |

**Notas:** no se cerró en esta pasada. Se identificó que la respuesta dependía del área 4 — si los
servicios también se reordenan, el `upsert` deja de ser inocente porque `services` tiene `name`,
`duration_minutes` y `price` NOT NULL sin default, y reenviar la fila entera desde el cliente permite
pisar un precio con dato viejo. Se cerró el área 4 primero y se volvió.

### Q2 (segunda pasada, con los dos ejes en juego)

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| RPC único (migr. 080) | Atómico en los dos ejes, el cliente manda sólo ids. Costo: migración manual en prod + `NOTIFY pgrst` | |
| Mixto sin migración | Categorías por upsert atómico; servicios por N updates de sólo `sort_order`. Costo: el eje servicios no es atómico | |
| N updates en los dos ejes | Uniforme y simple. Costo: ninguno de los dos es atómico | |
| Vos decidís | — | ✓ |

**Decisión de Claude:** *Mixto sin migración*. Acá la atomicidad protege una propiedad cosmética y
auto-reparable (el orden de display), no un invariante de integridad — al revés que en
`save_agenda_blocks`, donde una escritura a medias cambia la disponibilidad real. Cero migraciones deja
la fase como un deploy de app puro, sin paso manual en prod ni la trampa del `NOTIFY pgrst`. El
requisito duro del roadmap ("un solo camino que no pueda renumerar filas de otro negocio") se cumple
con un único mutador compartido por eje. Dos condiciones solidarias: el eje servicios escribe **sólo**
`sort_order`, y un fallo parcial no puede quedar silencioso (re-lectura + aviso). El RPC queda
documentado como upgrade con condición de disparo.

---

## Orden de servicios dentro de la categoría

### Q1 — ¿Esta fase da UI para ordenar servicios a mano?

| Opción | Descripción | Seleccionada |
|--------|-------------|--------------|
| Sí, mismo mecanismo | Drag + ▲/▼ dentro del grupo. 'custom' es el DEFAULT de la base: sin esto, el modo por default es el único que no se puede arreglar | ✓ |
| No: sólo alfabético o precio | Fase más chica, ningún requisito queda sin cumplir. Costo: el selector diría "personalizado" sin ofrecer personalizar | |
| No, y se renombra el modo | Rotular 'custom' como "Como los cargaste". Cero promesa incumplida, cero migración | |
| Vos decidís | — | |

**Notas:** se verificó contra `lib/service-categories.ts` que con `service_sort_mode='custom'` y todos
los `sort_order` en 0, el comparador `porOrden` devuelve 0 y el sort estable preserva el orden de
entrada — o sea el default actual es seguro, pero inmodificable sin esta UI.

---

## Claude's Discretion

- **Forma del arrastre** (área 2, Q2) → zona de sueltos + chips. Razonamiento en CONTEXT.md D-06.
- **Camino de escritura del orden** (área 3, Q2) → mixto sin migración. Razonamiento en CONTEXT.md D-09/D-10.
- **CAT-11, la descripción corta** → el usuario delegó las dos decisiones (dónde va el campo y si el
  tope de 120 es duro o blando). Guía recomendada escrita en CONTEXT.md §Claude's Discretion: campo
  espejado en alta y edición, tope duro con `maxLength` y contador visible desde el arranque.

---

## Deferred Ideas

- Subcategorías (dos niveles) — ya fuera de alcance en REQUIREMENTS.
- Modo de orden por categoría en vez de por negocio — fuera de alcance del milestone.
- RPC transaccional de reordenamiento (migr. 080) — diferido **con condición de disparo**: se
  implementa si aparece un reporte real de orden guardado a medias.
- Recordar el estado abierto/cerrado de la Card por usuario — descartado por ser estado por navegador.
- Arrastre táctil real para mover servicios entre categorías en mobile — el menú "Mover a…" cubre el
  caso; un arrastre táctil necesitaría una librería que el repo evita a propósito.

### Todos revisados y no incorporados

Los 4 matches del cross-reference son falsos positivos por keywords genéricas (motor de reservas y
backstops de seguridad de milestones anteriores). Detalle en CONTEXT.md `<deferred>`.
