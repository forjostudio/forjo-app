# Phase 21: Lo que el negocio declara - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-11
**Phase:** 21-lo-que-el-negocio-declara
**Areas discussed:** A quién se le ofrece, Dónde vive en el flujo, Qué pasa si lo saltea, Cuánto editor reusar

---

## A quién se le ofrece

| Option | Description | Selected |
|--------|-------------|----------|
| Preguntarlo explícito | Toggle en el paso Horarios: "¿En cada franja hacés todos tus servicios, o cada franja es para algo puntual?". Barato, sin rubro nuevo, sin magia. | ✓ |
| A todos, siempre visible | Chips bajo cada franja para cualquier rubro, precargados en comodín. Un solo flujo sin ramas. | |
| Rubro nuevo "Clases/Talleres" | Un quinto vertical; el mapeo aparece solo ahí. | |
| Solo si cargó 2+ servicios | Aparece automático con más de un servicio, sin preguntar. | |

**User's choice:** Preguntarlo explícito (→ D-01)
**Notes:** El análisis que llevó acá: el discriminador real no es el rubro ni la cantidad de servicios.
Una peluquería con 5 servicios que atiende 9-18 está bien descrita por el comodín; un taller con 2
servicios no. Lo que distingue es si **la franja ES la clase**, y eso solo lo sabe el dueño — por eso
preguntarlo gana sobre inferirlo. El rubro nuevo se descartó por arrastrar terminología, menú y
features (`lib/verticals.ts`): superficie de fase aparte.

---

## Qué hace el toggle con los datos

| Option | Description | Selected |
|--------|-------------|----------|
| Solo revela los chips | Control de UI, no modelo de datos. Cada franja sigue pudiendo quedar en comodín por separado. | ✓ |
| Activa y desmarca todo | Las franjas arrancan sin nada marcado y el dueño elige uno por uno. | |

**User's choice:** Solo revela los chips (→ D-04)
**Notes:** Preserva el caso mixto ("lun-vie 9-18 todo" + "sábado 10-12 solo yoga"). La alternativa
además era ambigua: una franja sin marcar queda en comodín igual, así que "desmarcar todo" no
comunicaba lo que parecía comunicar.

---

## Default del toggle

| Option | Description | Selected |
|--------|-------------|----------|
| Apagado = todo comodín | Cero fricción; el que no toca nada sale igual que hoy. | ✓ |
| Sin elegir, obliga a decidir | El paso no avanza hasta responder. | |

**User's choice:** Apagado (→ D-02)
**Notes:** Coincide con la cero-regresión de D-02 del milestone. La opción bloqueante sumaba una
barrera obligatoria en el alta para la mayoría a la que no le aplica.

---

## Canchas

| Option | Description | Selected |
|--------|-------------|----------|
| No, se oculta en canchas | El servicio ya viene derivado de la cancha (migr. 043); mapear sería redundante. | ✓ |
| Sí, igual que el resto | Un solo flujo sin ramas por rubro. | |
| Decidílo vos al planificar | Dejarlo abierto para el researcher. | |

**User's choice:** Se oculta en canchas (→ D-03)
**Notes:** Mismo criterio con el que `visibleSteps` (`page.tsx:427`) ya oculta el paso Profesionales
para ese rubro.

---

## Cuánto editor reusar

| Option | Description | Selected |
|--------|-------------|----------|
| Extraer el del panel | Sacar el editor de chips de `agenda-client.tsx` a un componente compartido. Toca un segundo archivo, fuera del alcance del ROADMAP. | ✓ |
| Versión simple propia del alta | Chips básicos escritos para el onboarding; respeta el alcance de un solo archivo. | |

**User's choice:** Extraer el del panel (→ D-05)
**Notes:** Se aceptó ampliar el alcance a propósito. La alternativa era una segunda implementación de
la misma pantalla — exactamente el modo de falla que AGENDA-02 existe para prevenir (dos
interpretaciones de la regla del comodín terminan en panel y motor diciendo cosas distintas sobre la
misma franja).

---

## Aviso de servicio sin cobertura

| Option | Description | Selected |
|--------|-------------|----------|
| Sí, aviso no bloqueante | Texto al pie: "Yoga no se da en ninguna franja — no va a poder reservarse". | ✓ |
| No avisa nada | El dueño lo descubre después en el panel. | |
| Sí, y bloquea el avance | No deja terminar el alta hasta cubrir todos los servicios. | |

**User's choice:** Aviso no bloqueante (→ D-07)
**Notes:** No bloquea porque es un estado LEGAL (D-06 de la Phase 18: el dueño está a mitad de
configurar). Lo que cambió el cálculo es que **ahora tiene consecuencia pública real**: desde la Phase
20 (cerrada el día anterior a esta discusión) ese servicio aparece deshabilitado con "Sin horarios
disponibles" en el booking. Antes era invisible, y por eso antes no habría justificado el aviso.

---

## Cómo se comunica el comodín

| Option | Description | Selected |
|--------|-------------|----------|
| Chip "Cualquier servicio" explícito | Como ya hace el panel: el vacío se lee como respuesta, no como olvido. | ✓ |
| Texto de ayuda debajo | Los chips arrancan sin marcar y una línea lo explica. | |
| Decidílo vos al planificar | Dejarlo abierto. | |

**User's choice:** Chip explícito (→ D-06)
**Notes:** Reusa la solución que el panel ya encontró para el mismo problema, evitando una segunda
interpretación de la regla.

---

## Volver atrás al paso Servicios

| Option | Description | Selected |
|--------|-------------|----------|
| Se mantiene por identidad local | Clave local estable por servicio: renombrar conserva el mapeo, borrar saca sus chips, agregar aparece sin mapear. | ✓ |
| Se resetea al tocar servicios | Cualquier cambio en el paso 2 limpia el mapeo. | |
| Decidílo vos al planificar | Dejarlo abierto. | |

**User's choice:** Identidad local (→ D-08)
**Notes:** Surgió de una restricción real del código: en el alta los servicios **no tienen ID** hasta
el submit final, así que el mapeo no puede keyearse por `service_id`. La opción de resetear castigaba
a quien corrige un typo y probablemente lo hiciera abandonar el mapeo.

---

## Claude's Discretion

- Copy exacto del toggle y del aviso (con el precedente de la Phase 17 de este milestone, que fue
  mayormente copy por la misma clase de problema).
- Cómo se resuelve técnicamente la clave local de D-08 y el orden de escritura en el submit.
- Ubicación visual del toggle y del aviso dentro del paso Horarios.

## Deferred Ideas

- Rubro nuevo "Clases/Talleres" — descartado por alcance en D-01; candidato a fase propia.
- Declarar cupo por clase desde el alta (`services.capacity`, v0.27) — capacidad nueva, no AGENDA-08.
- El cruce con multi-staff — ya estaba fuera de alcance en REQUIREMENTS.md (D-03 del milestone).

## Nota de proceso

No se usó el chequeo "¿más preguntas o siguiente área?" entre áreas: se recorrieron las cuatro
seleccionadas y se ofreció profundizar al final. El usuario eligió cerrar y escribir el CONTEXT.
