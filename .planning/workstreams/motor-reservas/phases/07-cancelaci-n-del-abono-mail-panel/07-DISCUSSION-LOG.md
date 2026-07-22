# Phase 7: Cancelación del abono (mail + panel) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 7-Cancelación del abono (mail + panel)
**Areas discussed:** Turnos futuros ya generados, Política temporal de la baja, Página pública de baja (mail), UX de la baja en el panel, Abonos 'completed', Link en el mail de alta

---

## Turnos futuros ya generados

**Pregunta:** ¿Qué pasa con los turnos futuros de la serie ya en la agenda?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Cancelar todos los futuros | Borrón y cuenta nueva; destructivo, sin aviso | |
| Dejarlos todos en pie | Solo frena la generación; deja hasta 8 semanas de turnos fantasma | |
| Cancelar todos + avisar | Cancela los futuros mostrando el conteo antes de confirmar | ✓ |
| Vos decidís | Discreción de Claude | |

**Pregunta:** ¿Qué mails se mandan si la baja cancela 7 turnos?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Un solo mail de baja de serie | UN mail resumen al cliente + UN aviso al dueño | ✓ |
| Un mail por turno cancelado | Reusa sendClientCancelEmail por turno = 7 mails | |
| Sin mail en la baja | Baja silenciosa | |

**Pregunta:** ¿Qué turnos entran en "futuros"?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Desde hoy inclusive | `date >= hoy`; cancela también el turno de hoy más tarde | ✓ |
| Desde mañana | `date > hoy`; respeta el turno de hoy | |
| Desde ahora (fecha+hora) | Compara date+time contra el momento actual (UTC-3) | |

**Pregunta:** ¿Se puede reactivar una serie dada de baja?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| No — baja terminal | `cancelled` es terminal; si vuelve, se crea un abono nuevo | ✓ |
| Sí — reactivable desde el panel | El dueño la vuelve a 'active' y el cron la reanuda | |

**Notas:** Los turnos cancelados nunca se resucitan.

---

## Política temporal de la baja

**Pregunta:** ¿Aplica la regla de 24h (`too_late`) del cancel de turno suelto?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Sin límite, pero el turno <24h sobrevive | Baja libre; los turnos dentro de 24h quedan en pie | |
| Sin límite y cancela todo | Ignora la regla de 24h; cancela incluso el de esta noche | ✓ |
| Mismo límite que el turno | La baja por mail se rechaza si el próximo turno cae en <24h | |

**Pregunta:** ¿La regla aplica igual al dueño que al cliente?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| El dueño no tiene límite | El dueño es autoridad sobre su agenda | ✓ |
| Misma regla para ambos | Mismo código, cero divergencia | |

**Notas:** Ambas respuestas convergen: no hay regla temporal por ninguna vía, así que las dos vías
quedan igualmente consistentes (que es lo que pide el criterio 4 del roadmap).

**Pregunta:** ¿Qué ve el cliente si la serie ya no está activa?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Mensaje según el estado | Distingue cancelled / completed, sin botón | ✓ |
| Link inválido genérico | Mismo cartel para todo estado no-activo | |

**Pregunta:** ¿El cancel_token caduca?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| No caduca | Vive con el abono; el link deja de operar por estado | ✓ |
| Se invalida al usarse | Se rota/anula tras la baja | |

---

## Página pública de baja (mail)

**Pregunta:** ¿Dónde vive la página de baja?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Ruta nueva /abono/[token] | Página y endpoint propios; no toca el flujo de turno suelto | (resuelta por Claude) |
| Reusar /cancelar/[token] | Branching condicional en la página ya probada | |
| Vos decidís | Discreción de Claude | ✓ |

**Resolución de Claude:** ruta nueva `app/abono/cancelar/[token]/` + `POST /api/abonos/cancel/[token]`,
para no meter branching condicional en `/cancelar/[token]`, que ya corre en prod con turnos sueltos.

**Pregunta:** ¿Qué muestra la página antes de confirmar?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Resumen + conteo de turnos | Branding, servicio, día/hora fijo y conteo | |
| Resumen + lista de fechas | Además lista fecha por fecha | |
| Solo el resumen | Sin conteo | |

**Respuesta del usuario (texto libre):** "Resumen + conteo de turno + fecha del último turno cancelado."
→ conteo **más** la fecha del último turno que se cancela, sin listar fecha por fecha.

**Pregunta:** ¿Cómo se entera el dueño cuando el cliente da de baja?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Mail al dueño + visible en el panel | Aviso a notification_email + serie marcada en /abonos | ✓ |
| Solo visible en el panel | Sin mail | |

**Pregunta:** ¿Qué ve el cliente después de confirmar?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Confirmación + link a reservar | Patrón del cancel de turno actual | ✓ |
| Solo confirmación | Mensaje de éxito y nada más | |

---

## UX de la baja en el panel

**Pregunta:** ¿Dónde vive la acción?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Solo en el detalle del abono | Dentro del Dialog/Drawer existente; fricción deliberada | ✓ |
| En la tarjeta del listado también | Menú (…) por fila | |

**Pregunta:** ¿Qué confirmación pide?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Diálogo con el conteo | "Se cancelan N turnos, el último el DD/MM. No se puede deshacer." | ✓ |
| Escribir para confirmar | Tipear el nombre del cliente | |
| Sin confirmación | Click directo con toast | |

**Pregunta:** ¿Qué pasa con los cancelados en el listado?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Filtro con "Dados de baja" | Toggle/tab para ver los cancelados | ✓ (ampliado) |
| Desaparecen (como hoy) | Comportamiento actual | |
| Listados juntos con badge | Al final de la misma lista | |

**Nota:** ampliado luego a **"Archivados" = cancelled + completed** (ver área siguiente).

**Pregunta:** ¿Se le avisa al cliente cuando el dueño da de baja?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Sí, siempre | Mismo mail de baja de serie que la vía del cliente | ✓ |
| Opt-in con checkbox | Como el aviso opt-in del alta manual de v0.22 | |
| No, baja silenciosa | El dueño avisa por su cuenta | |

---

## Abonos 'completed'

**Pregunta:** ¿Un finito que llegó a N sesiones se puede dar de baja?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| No hace falta — ya terminó | 'completed' es terminal; los turnos se cancelan uno a uno | |
| Sí, con el mismo botón | Sirve para cancelar de un saque los futuros que le quedan | ✓ |

**Pregunta:** ¿Dónde se ven los 'completed' en /abonos?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| En activos, con badge | Como hoy | |
| Junto a los dados de baja | Filtro "Archivados" = completed + cancelled | ✓ |

---

## Link en el mail de alta

**Pregunta:** ¿Qué pasa si el cliente no tiene email cargado?

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Copiar link desde el panel | Botón "Copiar link de baja" en el detalle, para WhatsApp | ✓ |
| Solo por mail | Sin email, la baja la hace el dueño | |
| Copiar link + reenviar mail | Suma endpoint de reenvío | |

---

## Claude's Discretion

- Ruta/estructura de la página pública de baja (resuelta: ruta nueva, ver arriba).
- Nombre y ubicación de la función de baja compartida entre ambas vías.
- Copy y template exacto del mail de baja de serie.
- Cómo se calcula el conteo y la fecha del último turno para el preview.
- Forma visual del filtro "Archivados" (tab / toggle / select).
- Exclusión del conteo de turnos de la serie ya cancelados individualmente.

## Deferred Ideas

- Reactivar un abono dado de baja (descartado explícitamente).
- Registrar quién dio de baja (`cancelled_by`) — requeriría migración 056.
- Endpoint de reenvío del mail de alta al cliente.
- UI para cancelar una ocurrencia suelta desde el detalle del abono.
- v0.25: flujo semanal pagá-o-liberá y cobro recurrente automático.
- Contador de sesiones restantes por turnos cumplidos (heredado del UAT de Phase 6).
