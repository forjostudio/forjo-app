# Phase 21: Lo que el negocio declara - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Que durante el **alta** se pueda declarar **qué servicios se dan en cada franja horaria**, para que un
negocio cuya franja *es* la clase (taller, estudio de danza, gimnasio) salga del onboarding con su
agenda real en vez de un "atiendo de 9 a 18" genérico que no lo describe. Cierra **AGENDA-08**.

Es el lado **DECLARA** del corte que hizo la D-01 de la Phase 20: booking y landing **consumen** el
mapeo y se lo muestran a un anónimo; el onboarding lo **declara** durante el alta. Distinto momento,
distinto actor, distinto riesgo.

**Superficie:** `app/(onboarding)/onboarding/page.tsx`, más la extracción del editor de chips desde
`app/(dashboard)/agenda/agenda-client.tsx` (ver D-05 — amplía el alcance de un archivo que declara el
ROADMAP; queda registrado a propósito).

**NO es de esta fase:** el modelo (Phase 18), el panel (Phase 19) y el consumo público (Phase 20) ya
existen. Acá no se crea ninguna tabla, vista ni endpoint: se escribe en `time_block_services`, que ya
está en producción desde la migr. 071.

</domain>

<decisions>
## Implementation Decisions

### A quién se le ofrece

- **D-01:** El alta **pregunta explícitamente** con un toggle en el paso Horarios (*"¿En cada franja
  hacés todos tus servicios, o cada franja es para algo puntual?"*). Si elige lo segundo, aparecen los
  chips por franja.
  **Por qué así y no por rubro ni por cantidad de servicios:** el discriminador real no es ninguno de
  esos dos. Una peluquería con 5 servicios que atiende 9-18 está perfectamente descrita por el
  comodín; un taller con 2 servicios no. Lo que distingue es **si la franja ES la clase**, y eso solo
  lo sabe el dueño. Un rubro nuevo "Clases/Talleres" se descartó porque un vertical arrastra
  terminología, menú y features propias (`lib/verticals.ts`) — es superficie grande y sería fase
  aparte. La condición "2+ servicios" se descartó por implícita y por discriminar mal.

- **D-02:** El toggle arranca **apagado** = todo comodín. Cero fricción para la mayoría, y coincide
  con la cero-regresión de D-02 del milestone: el que no toca nada sale exactamente igual que hoy.
  No bloquea el avance del paso.

- **D-03:** El toggle **no aplica al vertical `canchas`** — se oculta, igual que ya se oculta el paso
  Profesionales para ese rubro (`visibleSteps` en `page.tsx:427`). En canchas el servicio ya viene
  derivado de la cancha (migr. 043), así que mapear franja↔servicio sería redundante y confuso.

- **D-04:** El toggle es **control de UI, no modelo de datos**: solo revela los chips. Cada franja
  sigue pudiendo quedar en comodín por separado, así que un negocio puede declarar "lun-vie 9-18
  todo" + "sábado 10-12 solo yoga" sin pelear con el toggle.

### El editor

- **D-05:** Se **extrae el editor de chips** de `agenda-client.tsx` a un componente compartido y se usa
  en los dos lados (panel y alta). Ya resuelve chip comodín, colapso "Ver todos", congelado durante el
  guardado y accesibilidad (`role="status"` + `sr-only`).
  ⚠ **Esto amplía el alcance declarado del ROADMAP** (que dice solo `onboarding/page.tsx`). Se acepta
  a propósito: la alternativa era una segunda implementación de la misma pantalla, que es exactamente
  cómo el panel y el motor terminan diciendo cosas distintas sobre la misma franja — el modo de falla
  que AGENDA-02 existe para prevenir.
  — **Reversibility:** costly — volver atrás implica re-inlinear el componente en `agenda-client.tsx` y
  reescribir el del alta; son dos call sites de una pantalla con estado propio (colapso, congelado,
  accesibilidad), no un rename.

- **D-06:** La franja sin mapeo muestra un **chip "Cualquier servicio" explícito y activo**, igual que
  el panel. Así el vacío se lee como una respuesta y no como un olvido.
  **Por qué importa:** con el toggle prendido, una franja sin ningún chip marcado significa *todos los
  servicios* (regla del comodín, D-01 del milestone), que es contraintuitivo. El chip explícito es la
  forma que el panel ya encontró para comunicarlo, y reusarla evita una segunda interpretación de la
  regla.

### Qué pasa si queda mal configurado

- **D-07:** Si el dueño mapea franjas y deja un servicio **sin ninguna que lo cubra**, el alta muestra
  un **aviso no bloqueante** al pie del paso (ej. *"Yoga no se da en ninguna franja — no va a poder
  reservarse"*).
  **No bloquea** porque es un estado LEGAL: el dueño está a mitad de configurar (D-06 de la Phase 18).
  **Pero ahora tiene consecuencia pública real**, y eso cambió *ayer*: desde la Phase 20 ese servicio
  aparece deshabilitado con "Sin horarios disponibles" en el booking público. Antes era invisible.
  El dato sale de `isServiceScheduled` / `lib/time-block-services` — **no se reimplementa** (AGENDA-02).

- **D-08:** El mapeo **sobrevive a volver atrás**. Cada servicio lleva una **clave local estable** desde
  que se crea en el paso 2: renombrarlo conserva su mapeo (el chip cambia de texto), borrarlo saca sus
  chips, y agregar uno nuevo aparece sin mapear.
  **Por qué es una decisión y no un detalle:** en el alta los servicios **no tienen ID** hasta el submit
  final (son estado local: nombre, duración, precio), así que el mapeo no puede keyearse por
  `service_id`. La identidad local es la única forma de que el dueño que corrige un typo en el paso 2 no
  pierda el trabajo del paso 4.

### Resueltas al planificar (2026-09-11)

> Las dos preguntas abiertas que RESEARCH.md pidió cerrar antes de escribir los planes. Ambas
> confirmadas por el dueño; ambas coinciden con la recomendación del research.

- **D-09:** La clave local de D-08 es el **`uuid` generado en el cliente**: cada fila de servicio del
  paso 2 nace con `crypto.randomUUID()` y ese mismo `id` viaja en el `INSERT` a `services`, así que el
  payload del RPC se arma **antes** de que los servicios existan.
  **Por qué no correlacionar por índice:** PostgreSQL no garantiza el orden de `INSERT … RETURNING` con
  múltiples filas (Pitfall 1 de RESEARCH.md) — correlacionar por posición es un bug estructural, no un
  atajo. De paso arregla el `key={i}` del paso 2 (`page.tsx:696-698`).
  ⚠ Es el **único patrón sin precedente in-repo** de la fase (PK generada en el cliente). Fallback
  registrado por si el plan-check lo rechaza: `insert().select().single()` por servicio, molde exacto
  de `app/(dashboard)/settings/settings-client.tsx:1353-1355`.
  — **Reversibility:** reversible.

- **D-10:** Si el toggle de D-01 queda **apagado al finalizar el alta, se persiste comodín**, aunque el
  dueño haya mapeado antes. El mapeo sigue vivo en el estado del cliente (D-04: volver a prenderlo lo
  recupera), pero no se escribe.
  **Por qué:** es el principio que ya sostiene el panel — *lo que veo es lo que queda*
  (`lib/agenda-hours-payload.ts:150-153`). Persistir algo que la última pantalla no muestra es dato que
  se pierde sin ruido, al revés.
  — **Reversibility:** reversible.

### Claude's Discretion

- El **copy exacto** del toggle y del aviso. Hay precedente directo y caro de mirar: la Phase 17 de este
  mismo milestone fue mayormente copy, porque el editor metía los dos modos de cupo en la misma bolsa y
  el dueño no tenía con qué elegir.
- Cómo se resuelve la **clave local** de D-08 (índice, UUID de cliente, etc.) y el orden de escritura en
  el submit — ver `<code_context>` para la restricción dura.
- Ubicación visual exacta del toggle y del aviso dentro del paso Horarios.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### La regla del comodín (no reimplementarla — AGENDA-02)
- `lib/time-block-services.ts` — fuente ÚNICA de "qué servicios se dan en cada franja".
  Relevantes acá: `servicesOfBlock` (qué declara una franja — lo que pintan los chips),
  `isBlockWildcard` (si la franja es comodín — el chip de D-06) e `isServiceScheduled` /
  `hasScheduleCoverage` (si un servicio tiene cobertura — el aviso de D-07).
  Su cabecera documenta el contrato **D-16**: el caller filtra por `business_id` ANTES de llamar; el
  módulo no filtra por tenant ni por vigencia.

### Precedente directo a copiar
- `app/(dashboard)/agenda/agenda-client.tsx` — el editor de chips de la Phase 19: chip comodín
  (`:339`), colapso "Ver todos" (`:268`), congelado durante el guardado, accesibilidad (`:318`).
  Es el componente que D-05 manda extraer, no reescribir.
- `app/(dashboard)/agenda/page.tsx:60` — cómo el panel lee la puente
  (`time_block_services` acotada por `business_id`).

### El lado que consume lo que esta fase declara
- `.planning/workstreams/motor-reservas/phases/20-lo-que-el-publico-ve/20-CONTEXT.md` — D-01 (el corte
  por verbo que creó esta fase), D-02 (el vacío se resuelve en el selector) y D-05 (deshabilitar con
  motivo en vez de ocultar).
- `.planning/workstreams/motor-reservas/phases/20-lo-que-el-publico-ve/20-SUMMARY.md` (los dos) y
  `20-SECURITY.md` — qué quedó construido del lado público y con qué riesgos aceptados.
- `app/[slug]/booking-client.tsx` — el consumidor: dónde se ve el efecto de lo que el alta declare.

### El archivo a modificar
- `app/(onboarding)/onboarding/page.tsx` — los 4 pasos, `visibleSteps` (`:427`, cómo canchas oculta un
  paso — molde para D-03), el submit (`:353-388`) y el modelo N-bloques/día (cabecera, `:24`).

### Requisito y alcance
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — AGENDA-08 y la sección "Fuera de alcance".
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 21" — incluye una corrección verificada:
  el onboarding **NO** usa endpoint service-role para la agenda; escribe `time_blocks` directo con la
  sesión del dueño y la RLS vigente.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **El editor de chips de `agenda-client.tsx`** — lo que D-05 manda extraer. Maduro: comodín, colapso,
  congelado, accesibilidad.
- **`lib/time-block-services.ts`** — funciones puras, sin React ni Supabase, ya usadas por tres capas.
  Todo lo que el alta necesita preguntar ya está resuelto ahí.
- **El patrón de paso condicional por vertical** — `visibleSteps` (`page.tsx:427`) ya oculta
  Profesionales en canchas y renumera el stepper por POSICIÓN, no por `n`. D-03 se monta sobre eso.
- **`DayState` / `HourBlock`** (`page.tsx:26-35`) — el modelo N-bloques/día que ya soporta horario
  partido. Los chips cuelgan de cada bloque.

### Established Patterns
- El alta escribe **con la sesión del dueño y RLS**, nunca service-role (el único endpoint service-role
  es `slug-available`, y salió de la colisión de slug de v0.20).
- Todo el alta se escribe en **un solo submit al final** — no hay guardado incremental. Por eso el
  editor extraído tiene que tolerar que sus estados de "guardando" no apliquen acá.
- Los efectos best-effort del submit (logo, `linkLeadOnSignup`) **loguean y no rompen** el redirect al
  dashboard. Si el mapeo se escribe como paso aparte, decidir explícitamente si hereda ese criterio o
  si es parte del núcleo transaccional.

### Integration Points
- **`time_block_services`** — la tabla puente (migr. 071), ya en producción y ya escrita por el panel.
  Tres columnas NOT NULL: `business_id`, `time_block_id`, `service_id`.

### ⚠ Restricción dura para el planner
El submit actual inserta **sin `.select()`**:
- `services.insert(...)` (`page.tsx:353`) — no devuelve los `id` de los servicios creados.
- `time_blocks.insert(...)` (`page.tsx:388`) — no devuelve los `id` de las franjas creadas.

La puente necesita **los dos**. Escribir `time_block_services` obliga a que ambos inserts devuelvan
sus filas y a resolver la clave local de D-08 contra los IDs reales **después** de insertar. Es el
cambio estructural del plan; el resto es UI.

</code_context>

<specifics>
## Specific Ideas

- El caso que define la fase, del brief del milestone y en palabras del dueño:
  *"si alguien tiene que configurar que los martes y jueves de 15 a 16 da cerámica, no tiene forma"*.
  Ese negocio tiene que poder salir del alta con eso declarado.
- La UAT de la Phase 20 sembró un escenario que sirve de molde mental: Corte (6 días), Cerámica (solo
  martes), Yoga (sin franja), Masaje (sin staff). El alta tendría que poder producir las tres primeras
  filas sin pasar por el panel.
- El aviso de D-07 debería sonar a consecuencia, no a error de validación: lo que se le está diciendo
  al dueño es que **un cliente no va a poder reservar ese servicio**, no que llenó mal un campo.

</specifics>

<deferred>
## Deferred Ideas

- **Rubro nuevo "Clases/Talleres"** — surgió como opción para D-01 y se descartó por alcance: un
  vertical arrastra terminología, menú y features propias (`lib/verticals.ts`). Si más adelante hay
  suficientes negocios de clases, es candidato a fase propia y volvería a leer esta decisión.
- **Declarar cupo por clase desde el alta** — `services.capacity` existe desde v0.27 y sería el
  siguiente paso natural para un negocio de clases, pero es capacidad nueva, no parte de AGENDA-08.
- **El cruce con multi-staff** (franja por servicio **y** profesional) — ya estaba declarado fuera de
  alcance en REQUIREMENTS.md §"Fuera de alcance" (D-03 del milestone). Se suma después sin re-migrar.

### Reviewed Todos (not folded)
`todo.match-phase` devolvió 6 coincidencias, **ninguna foldeada**. Todas matchearon por palabras vacías
("del", "phase", "app", "agenda"), no por sustancia — ninguna es del onboarding:
- *"El gate de modo se esquiva moviendo `services.business_id` a otro negocio propio"* (0.9, security) —
  es del gate de modo de cupo, no del alta.
- *"El eje staff no tiene backstop server-side"* (0.9, security) — creado el 2026-09-11 por el
  secure-phase de la Phase 20; es del `create` del booking, no del alta.
- *"Una sola persona puede ocupar todos los cupos de una clase grupal"* (0.6, booking).
- *"Dos clases grupales a la misma hora comparten el espacio de `seat`"* (0.6, database).
- *"Un turno FUTURO marcado completado no tiene salida en el panel"* (0.6, frontend).
- *"El roster dice «Seña pendiente» también cuando el hold ya venció"* (0.6, ux).

</deferred>

---

*Phase: 21-Lo que el negocio declara*
*Context gathered: 2026-09-11*
