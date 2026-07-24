# Phase 8: Equipo — qué servicios hace cada profesional - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-24
**Phase:** 8-Equipo — qué servicios hace cada profesional
**Areas discussed:** Semántica del default, Dónde vive la UI, Cobertura sin nadie, Alcance de la migración 057, Sucursales y cobertura, Inactivos y borrados, Terminología y gateo de canchas, Turnos y abonos ya existentes

---

## Semántica del default

**Q1 — Un profesional al que NO le marcaste ningún servicio, ¿qué significa?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Comodín por persona | 0 filas = hace TODOS. Para limitar, se marcan los que sí hace. "No hace nada" = `active=false`. Sin precipicio: configurar a Ana no saca a Juan | ✓ |
| El mapeo manda a nivel negocio | Tabla vacía = todos hacen todo; con ≥1 fila manda el mapeo para todos. Más estricto, pero el primer guardado saca de la grilla a los no configurados | |
| Switch explícito por negocio | Opción "Usar mapeo de servicios" (off por default). Más control, un estado de config más que mantener | |

**Notas:** decisión central de la fase — define la query de las Phases 9 y 10 y elimina la necesidad de backfill en la 057.

**Q2 — Si el dueño desmarca el último servicio de un profesional, vuelve a comodín. ¿Cómo lo manejamos?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Avisar sin bloquear | Se guarda igual, con toast/nota explicando que vuelve a ofrecerse para todos | ✓ |
| Guardar en silencio | Menos ruido, pero el dueño puede creer que hizo lo contrario de lo que hizo | |
| No permitir cero | Ofrecer desactivar al profesional en su lugar. Evita el flip pero agrega una regla especial | |

**Q3 — Servicio NUEVO: ¿qué pasa con los profesionales que ya tenían mapeo?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Nadie lo hace hasta marcarlo | Arranca sin cobertura; la vista de STAFF-02 lo señala. El sistema no asume capacidades | ✓ |
| Se marca automático a los ya mapeados | Evita servicios huérfanos, pero asume capacidades no declaradas | |

**Q4 — ¿El mapeo restringe algo en el panel del dueño (alta manual, abonos)?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Solo público; el panel no restringe | El dueño sigue asignando a quien quiera; el mapeo alimenta Phases 9/10. Cero superficie nueva | ✓ |
| El panel filtra el selector por servicio | Más coherente, pero toca formularios del motor entregado y agrega riesgo de regresión | |

---

## Dónde vive la UI

**Q1 — ¿Dónde se edita el mapeo y dónde se ve la cobertura?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Editar en Equipo, ver en Servicios | Editor por profesional en /equipo (patrón agenda_spaces); cobertura por servicio en /servicios, solo lectura. Una sola superficie de escritura; el gateo de canchas sale gratis | ✓ |
| Editable de los dos lados | Más cómodo, pero dos superficies de escritura sobre la misma tabla y gateo explícito en /servicios | |
| Todo en Servicios | Un solo lugar, pero deja /equipo sin la info y obliga a gatear por vertical | |

**Notas:** pesó el dato del código — `/equipo` ya redirige en el vertical canchas; `/servicios` sirve a todos.

**Q2 — ¿Cómo se marca en la práctica?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Chips inline, guardado inmediato | Optimista con rollback + toast. Patrón ya probado de `toggleAgendaSpace` — cero componentes nuevos | ✓ |
| Dentro del modal "Editar profesional" | Más "formulario", pero esconde el panorama del equipo detrás de un click por persona | |

**Q3 — Un negocio con UN solo profesional, ¿ve el bloque?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Ocultarlo con menos de 2 | Con una persona el mapeo no aporta; aparece al sumar la segunda. Alineado con STAFF-03 | ✓ |
| Mostrarlo siempre | Consistencia visual, pero en la práctica solo genera servicios sin cobertura | |

---

## Cobertura sin nadie

**Q1 — En /servicios, ¿cómo se ve la cobertura?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Quién lo hace + aviso si nadie | Nombres bajo cada servicio + advertencia si no lo cubre nadie. Cubre STAFF-02 completo | ✓ |
| Solo el aviso de los sin cobertura | Más limpio, pero pierde la mitad de STAFF-02 | |
| Un resumen de cobertura aparte | Matriz servicios × profesionales. Claro con equipos grandes, pero componente nuevo desincronizado del CRUD | |

**Q2 — Un servicio que no cubre nadie, ¿qué pasa en la reserva pública? (lo implementa Phase 10)**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| No se ofrece | Coherente con el mapeo; evita el callejón de elegir un servicio sin horarios | ✓ |
| Se ofrece pero sin horarios | Menos mágico para el dueño, pero callejón sin salida para el cliente | |
| Se ofrece como hoy (cualquiera) | Cero regresión absoluta, pero rompe la promesa del mapeo donde importa | |

**Q3 — ¿Dónde se avisa que un servicio quedó sin cobertura?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| En los dos lados | Badge en /servicios + aviso al desmarcar en /equipo al último que lo ofrecía | ✓ |
| Solo en Servicios | Más simple, pero el hueco puede pasar semanas sin detectarse | |

---

## Alcance de la migración 057

**Q1 — ¿La 057 crea alguna superficie pública para el mapeo?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Sin acceso anon, como agenda_spaces | Solo tabla + RLS (4 policies por op). La Phase 10 resuelve server-side. Cero superficie pública nueva | ✓ |
| Incluir ya la vista pública acotada | Menos toques manuales a prod, pero define hoy una superficie que la Phase 10 quizá no use así | |
| Decidirlo en la Phase 10 | Flexible, pero garantiza un segundo toque manual a prod en el mismo milestone | |

**Q2 — ¿Dónde vive la regla del comodín?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Helper puro con tests, ya en Phase 8 | Módulo único (`lib/staff-services.ts`) con tests vitest; lo consumen UI, RPC (P9) y grilla pública (P10) | ✓ |
| Solo la UI ahora; la regla en Phase 9 | Fase más chica, pero la regla nace dentro del RPC (SQL, difícil de testear aislado) | |

---

## Sucursales y cobertura

**Q1 — ¿La cobertura se evalúa global o por sede?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Global por negocio | Mapeo de 2 ejes, sin sede. La sucursal la resuelven los time_blocks | ✓ |
| Cobertura por sede | Más preciso multi-sede, pero mete un tercer eje y multiplica la UI | |

**Q2 — (insumo Phase 9) Con "cualquiera" en la sucursal A, ¿puede tocar alguien de la B?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| No: el candidato debe ser de esa sede | Candidatos = capaz + de la sede (sin sede asignada vale para todas) | ✓ |
| Sí, la sede no filtra candidatos | Más simple en el RPC, pero puede asignar a alguien que no está ahí | |
| Decidirlo en la Phase 9 | Se deja abierto para el discuss de la Phase 9 | |

---

## Turnos y abonos ya existentes

**Q1 — Marcás que Juan ya no hace color, con turnos viejos y un abono en curso.**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Nada, todo queda intacto | El histórico no se reescribe; el abono sigue con su profesional fijo. Consistente con D-04 | ✓ |
| Intacto pero con aviso | Más informado, pero suma query y cartel en un flujo de config | |

---

## Inactivos y borrados

**Q1 — Desactivás al único profesional que hacía color.**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Filas intactas, cobertura solo cuenta activos | Reactivar lo devuelve tal cual; el criterio `active = true` espeja `public_professionals` | ✓ |
| Filas intactas y cobertura cuenta a todos | Más simple, pero mostraría "lo hace Juan" con Juan invisible al público | |
| Borrar el mapeo al desactivar | Estado más simple, pero reactivar deja a la persona como comodín | |

**Q2 — ¿Y al BORRAR un servicio o un profesional con mapeo?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| CASCADE en la DB, sin confirmación extra | Igual que `deleteSpace`/`deleteProfessional` con agenda_spaces; el borrado ya tiene su confirmación | ✓ |
| CASCADE + avisar en la confirmación | Más transparente, pero el mapeo es barato de rehacer | |

---

## Terminología y gateo de canchas

**Q1 — ¿Cómo se comporta el bloque según el rubro?**

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Oculto en canchas, copy por terminología | Ni editor ni cobertura en canchas (gateo explícito); en el resto, copy vía `term.resource` | ✓ |
| Oculto en canchas, copy único | Menos piezas, pero rompe la consistencia de terminología del panel | |

---

## Claude's Discretion

Ninguna decisión se delegó explícitamente con "vos decidí". Quedan a criterio del planner/executor,
por ser detalle técnico y no zona gris de producto: nombre y columnas exactas de la tabla puente,
índices (incluido el inverso para la cobertura y la Phase 9), firma y ubicación del helper de D-12, y
la descomposición en planes/waves.

## Deferred Ideas

- Filtrar el selector de profesional por capacidad en el panel (alta manual / abonos).
- Cobertura por sede (tercer eje profesional × servicio × sede).
- Avisar al guardar si hay abonos activos con ese profesional y servicio.
- Vista pública acotada del mapeo (`public_professional_services`) — solo si la Phase 10 la necesita.
- "Cualquiera" en el alta manual y en abonos (ya diferido en REQUIREMENTS.md).
- Estrategia de asignación configurable y preferencia de profesional del cliente (ya diferidos).
- **Todo revisado y NO plegado:** "Cupo por solape: capacity > 1 no controla turnos escalonados" —
  fuera de alcance por REQUIREMENTS.md §Out of Scope, va a v0.26.
