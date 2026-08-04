# Phase 14: Cierre de backlog - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-04
**Phase:** 14-Cierre de backlog
**Areas discussed:** Cross-reference de todos, Ancho de botones (POLISH-04), RiskBadge (POLISH-05),
Clasificación de clientes (POLISH-07), Link de baja en serie cancelada (POLISH-06), Borrado de abonos
archivados (EXTRA-B), Tabs de Canchas (EXTRA-A)

---

## Cross-reference de todos pendientes

3 todos con score 0.9 matchearon la fase (todos nacidos de la UAT de Phase 13).

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Ninguno — solo los 4 POLISH | Los 3 todos siguen pendientes para una fase o milestone propio | |
| Tabs Activos/Desactivados en Canchas | Polish visual puro, molde ya en el repo (Phase 13 D-14) | ✓ |
| Borrar abonos archivados | Capacidad nueva; requiere decidir qué pasa con los turnos generados | ✓ |
| Finanzas mobile oculta el servicio | El propio todo pide resolverlo dentro del rediseño de Finanzas | |

**User's choice:** Foldear EXTRA-A (canchas) + EXTRA-B (borrar abonos archivados).
**Notes:** Se le avisó al usuario que EXTRA-B no es polish sino capacidad nueva con decisión de modelo
y probablemente migración; decidió incluirla igual. Queda marcado en CONTEXT.md para que el planner la
aísle en su(s) propio(s) plan(es). Finanzas mobile queda diferido al rediseño de Finanzas.

---

## Ancho de botones (POLISH-04) — criterio

El ROADMAP delegaba el criterio explícitamente a este discuss. Hoy conviven 2 patrones en el repo.

| Opción | Descripción | Selected |
|--------|-------------|----------|
| `w-full sm:w-auto` app-wide | Regla única; ya usada por abonos-client y appointments-client; verificable con grep | ✓ |
| Por contenedor, no por breakpoint | Full-width solo en contenedores estrechos por diseño (drawer, popover); auto en cards y toolbars | |
| Solo los casos marcados | Tocar únicamente Negocio → Cobros y dejar el resto | |

**User's choice:** `w-full sm:w-auto` app-wide.
**Notes:** Se eligió la regla única por sobre el juicio caso-por-caso.

---

## Ancho de botones (POLISH-04) — alineación en desktop

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Derecha (`justify-end`) | Convención de footer de formulario; ya la usan los diálogos | |
| Izquierda (`justify-start`) | Alineado con el contenido del card | |
| Vos decidís, caso por caso | Derecha en footers de form, izquierda en acciones sobre lista | ✓ |

**User's choice:** Discreción del planner.

---

## Ancho de botones (POLISH-04) — alcance tras el hallazgo del scout

Durante el scout se descubrió que los botones que el usuario reportó **no tienen `w-full`**: se estiran
porque `components/ui/card.tsx:15` es `flex flex-col`. Un grep-and-replace de `w-full` no los toca.
Se le presentó el hallazgo antes de escribir el CONTEXT.

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Sí, las dos causas | 10 `w-full` explícitos → `w-full sm:w-auto`; los estirados por `<Card>` → `self-start` | ✓ |
| Solo la causa 1 | Los 10 `w-full`; los de Negocio → Cobros quedan igual (o sea, el pedido original no se arregla) | |
| Solo la causa 2 | Los estirados por `<Card>`; se asumen intencionales los `w-full` explícitos | |

**User's choice:** Las dos causas.
**Notes:** Precedente identificado en el repo para la causa 2 — `settings-client.tsx:1568` ya usa
`className="self-start"` para exactamente este problema.

---

## RiskBadge "Alto" (POLISH-05)

Contexto aportado en la pregunta: la causa que describe el ROADMAP (`--crm-danger` sin resolver fuera
de `.crm-shell`) **ya se arregló** en Phase 13 (gap 13-05 #1, indirección `--danger`).

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Relleno de peligro en los DOS shells | `alto` pasa a `bg-[var(--danger)]` sin dot; un solo componente; **el CRM cambia de aspecto** | ✓ |
| Subir el punto, no rellenar | Pill oscuro + borde teñido + dot más grande; el CRM se sigue viendo igual | |
| Ya está resuelto — solo verificar | Cerrar POLISH-05 con verificación visual y cero código | |

**User's choice:** Relleno de peligro en los dos shells.
**Notes:** Decisión consciente de **pisar** la restricción del ROADMAP §Phase 14 ("sin alterar cómo se
ve el badge dentro del CRM"). Se prioriza mantener un componente único y resolver que hoy la variante
`medio` (pill amarillo relleno) pesa visualmente más que `alto`.

---

## Clasificación de clientes (POLISH-07) — regla para 0 turnos

| Opción | Descripción | Selected |
|--------|-------------|----------|
| 0 turnos ⇒ 'Nueva' siempre | Fix de 1 línea; "Pausa" pasa a significar "vino y dejó de venir" | ✓ (modificada) |
| 0 turnos ⇒ 'Nueva' solo si el alta es reciente | Necesita `created_at` y un umbral nuevo que hoy no existe | |

**User's choice:** `"Nuevo" siempre. En masculino`
**Notes:** El usuario aceptó la regla **y** sumó un pedido de copy: pasar la clasificación a masculino.
Se verificó en `lib/verticals.ts` que todos los verticales usan sustantivo masculino
(`Cliente`/`Paciente`), así que no hay conflicto por rubro — eso habilitó cerrarlo en los 8 labels.

---

## Clasificación de clientes (POLISH-07) — umbral de "Pausa"

Se detectó una discrepancia: el status usa 45 días (`:406`), el copy de sugerencia usa 60 (`:150`,
"más de 2 meses") y REQUIREMENTS.md describe el tab como ">2 meses sin venir".

| Opción | Descripción | Selected |
|--------|-------------|----------|
| No, fuera de scope | POLISH-07 arregla solo el caso de 0 turnos; la discrepancia queda diferida | |
| Sí, unificar en 60 días | Constante única; coincide con el copy y con REQUIREMENTS.md | ✓ |
| Sí, unificar en 45 días | Nadie cambia de tab, pero hay que reescribir el copy | |

**User's choice:** Unificar en 60 días.
**Notes:** Efecto aceptado — los clientes con 46-60 días sin venir salen del tab "Pausa".

---

## Clasificación de clientes (POLISH-07) — alcance del masculino

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Los 8 labels de clasificación | `STATUS_LABEL` + `FILTER_TABS`; no toca "Todas las obras sociales" | ✓ |
| Solo 'Nuevas' → 'Nuevos' | Alcance mínimo, pero deja la pantalla mezclada | |

**User's choice:** Los 8 labels.

---

## Link de baja en serie cancelada (POLISH-06) — alcance en UI

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Botón + texto de ayuda | Se oculta el bloque entero; no queda copy huérfano | ✓ |
| Solo el botón | Deja el párrafo describiendo una acción inexistente | |
| Bloque + estado vacío | Agrega una línea explicativa; redundante con lo que el detalle ya muestra arriba | |

**User's choice:** Botón + texto de ayuda.

---

## Link de baja en serie cancelada (POLISH-06) — gate server-side

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Sí, 404 genérico server-side | Un `.neq('status','cancelled')` sobre una query ya scopeada; el endpoint es la autoridad | ✓ |
| No, solo la UI | Phase 14 quedaría 100% front, sin superficie de API que revisar | |

**User's choice:** Gate server-side.
**Notes:** Alineado con el patrón del workstream (el servidor no confía en el cliente) y con WR-07/D-25
de Phase 07 (la credencial sale on-demand, nunca en el payload del listado).

---

## Borrado de abonos archivados (EXTRA-B) — qué pasa con los turnos

Dato aportado en la pregunta: `appointments.abono_id` **ya está en `ON DELETE SET NULL`** desde la
migración 054, así que el camino conservador no necesita migrar el FK.

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Conservar los turnos, soltar el puntero | El FK ya hace SET NULL solo; precedente de Phase 13 (HIST-03) | ✓ |
| Borrar también los turnos futuros no cancelados | Más agresivo; abre la pregunta de si se avisa al cliente | |

**User's choice:** Conservar los turnos.
**Notes:** El tercer camino del todo original (borrar todo, incluidos los pasados) ni se presentó — el
propio todo lo descartaba por romper Finanzas retroactivamente.

---

## Borrado de abonos archivados (EXTRA-B) — dónde vive el gate

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Trigger en la base + pre-check en la UI | Migración 066 calcada del gate de Phase 13 (065); la base es la autoridad | ✓ |
| Solo server-side en el handler | Sin migración, pero se aparta del patrón que Phase 13 acaba de establecer | |

**User's choice:** Trigger en la base + pre-check en la UI.
**Notes:** Introduce la migración **066** en una fase que de otro modo sería 100% front. Se aplica a
mano en prod (última en prod = 065).

---

## Tabs Activos/Desactivados en Canchas (EXTRA-A)

| Opción | Descripción | Selected |
|--------|-------------|----------|
| Extraer a componente compartido | Tercera aparición del patrón; evita que vuelvan a divergir | ✓ |
| Copiar el molde tal cual | Plan de un solo archivo, sin riesgo de regresión sobre Servicios | |

**User's choice:** Extraer a componente compartido.
**Notes:** Riesgo aceptado — el refactor toca `settings-client.tsx`, código que acaba de shippear en
Phase 13 (13-03, D-14). Cero regresión visual en Servicios es requisito.

---

## Claude's Discretion

- **Alineación en desktop** de los botones desestirados (D-03) — derecha en footers de form, izquierda
  en cards de configuración, caso por caso.
- **Lista exacta** de `<Button>` hijos directos de `<Card>` que hoy se estiran — el planner la audita;
  las líneas citadas en CONTEXT.md son ejemplos verificados, no un inventario cerrado.
- **Nombre y API** del componente compartido de píldoras (EXTRA-A).
- **Código de error / status exacto** del endpoint de POLISH-06, dentro de la forma
  `{ ok:false, error:'<snake>' }` del proyecto y respetando el 404 genérico.

## Deferred Ideas

- **Finanzas en mobile oculta el nombre del servicio** — se resuelve dentro del rediseño de Finanzas
  ("Cashflow → Actividad estilo MercadoPago"), no como parche suelto.
- **Alineación de botones como regla dura de sistema de diseño** — hoy queda caso por caso (D-03).
- **Suavizar/quitar el borde lateral acentuado app-wide** — heredado de Phase 11 (D-03); se mantiene
  el patrón.
- **Follow-ups del motor de cupos** (los 3 todos del 2026-07-30) — revisados, no foldeados: son
  continuación de Phase 12, no polish.
</content>
