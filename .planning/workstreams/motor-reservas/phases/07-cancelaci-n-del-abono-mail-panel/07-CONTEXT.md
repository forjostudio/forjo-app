# Phase 7: Cancelación del abono (mail + panel) - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Baja de la **serie completa** del abono por dos vías consistentes: link en el mail (cliente,
resuelto por `abonos.cancel_token`) y panel del negocio (dueño autenticado). La baja frena la
generación forward (el cron ya solo procesa `status='active'`) y cancela en masa los turnos futuros
de la serie. Cubre ABONO-04 y ABONO-05.

**NO incluye:** editar/reprogramar una serie viva, reactivar una serie dada de baja, alta pública
del abono, ni nada del cobro / flujo pagá-o-liberá (v0.25).

</domain>

<decisions>
## Implementation Decisions

### Efecto de la baja sobre los turnos ya generados (ABONO-05, criterio 4)
- **D-01 (LOCKED):** La baja **cancela TODOS los turnos futuros** de la serie (los que tienen
  `abono_id` de ese abono), poniéndolos en `status='cancelled'` para que liberen el horario. NO se
  dejan turnos fantasma en la agenda.
- **D-02 (frontera):** "Futuros" = `date >= hoy` (fecha AR, UTC-3) **inclusive**. El turno de hoy más
  tarde también se cancela. Se compara por `date`, sin lógica de hora — igual que filtra la agenda.
- **D-03 (aviso previo — obligatorio):** Antes de confirmar, **las dos vías muestran el conteo** de
  turnos que se van a cancelar y **la fecha del último turno cancelado** (ej. "se cancelan 7 turnos
  futuros, el último el 15/09"). La decisión es informada, no un click a ciegas.
- **D-04 (terminal):** `status='cancelled'` es **terminal**. NO hay reactivación. Si el cliente
  vuelve, el dueño crea un abono nuevo (el alta ya existe y es rápida). Los turnos cancelados NO se
  resucitan bajo ninguna vía.
- **D-05 (idempotencia):** Volver a ejecutar la baja sobre una serie ya cancelada no vuelve a
  disparar mails ni a tocar turnos; devuelve el estado ya-cancelado.

### Política temporal (ambas vías)
- **D-06 (LOCKED — sin regla de 24h):** La regla `too_late` (24h) del cancel de turno suelto
  **NO aplica** a la baja de serie. Se cancela todo lo futuro incluido el turno de hoy, **por las dos
  vías**. Razón: no tiene sentido trabar la baja de una serie indefinida por un turno puntual, y el
  alta manual del dueño tampoco chequea horario (coherente con D-06′ de Phase 6).
- **D-07 (sin asimetría):** Cliente y dueño se comportan **igual** en el efecto sobre los turnos. La
  única diferencia es el canal de autorización (token vs sesión del dueño). Esto cumple el criterio
  del roadmap de "consistencia entre mail y panel" con el mismo código de baja compartido.
- **D-08 (estados no-activos):** Abrir el link cuando la serie ya no está activa muestra **mensaje
  específico según el estado** — "este turno fijo ya fue dado de baja" (`cancelled`) — sin botón de
  acción. Mismo criterio que el cancel de turno, que distingue `cancelled`/`past`/`too_late`.
- **D-09 (token sin vencimiento):** El `cancel_token` (uuid, ya existe en migr. 054) **no caduca** ni
  se rota tras usarse. El link deja de operar **por estado**, no por vencimiento — así la página
  informativa post-baja sigue funcionando.

### Página pública de baja (ABONO-04)
- **D-10 (ruta — Claude's discretion, resuelta):** **Ruta NUEVA** `app/abono/cancelar/[token]/` +
  `POST /api/abonos/cancel/[token]`. **NO** se mete branching condicional en `/cancelar/[token]` ni
  en `POST /api/cancel/[token]`, que ya están probados en prod para turnos sueltos (cero riesgo de
  regresión sobre un flujo crítico vivo). Se copia el shell/patrón de esa página: resolución por
  token con **service role server-side**, `PaletteScript` con la paleta del tenant, `page.tsx` server
  + `*-client.tsx`.
- **D-11 (contenido pre-confirmación):** Negocio (branding/paleta del tenant), servicio, día/hora
  fijos ("todos los martes a las 20:00"), **conteo** de turnos a cancelar y **fecha del último turno
  que se cancela**. NO se lista fecha por fecha (con ventana de 8 semanas la lista es larga en mobile).
- **D-12 (post-confirmación):** Pantalla de éxito + **link a la página pública del negocio**
  (`/[slug]`) por si quiere reservar suelto — mismo patrón que el cancel de turno actual.
- **D-13 (aviso al dueño):** Cuando el **cliente** da de baja, se manda mail a
  `businesses.notification_email` (patrón `sendAdminNotification`) indicando quién dio de baja, el
  día/hora fijo y cuántos turnos se cancelaron. Además la serie queda marcada como cancelada en el
  panel.

### Mails (política anti-avalancha)
- **D-14 (LOCKED):** La baja manda **UN solo mail de baja de serie** al cliente y **UN aviso** al
  dueño. **NUNCA** un mail por turno cancelado (cancelar 7 turnos ≠ 7 mails). Coherente con D-08 de
  Phase 6 (un mail al crear, no uno por turno generado). Template nuevo en `lib/email.ts` siguiendo
  el patrón de `sendAbonoConfirmation` / `sendClientCancelEmail` (branding por tenant, `resolveSender`).
  - **ENMENDADA 2026-07-22** — el aviso al dueño es un **recibo de algo que le OCURRIÓ**, no de algo
    que él ejecutó: por la vía del panel la baja la ejecuta él mismo, así que avisarle sería
    redundante. Queda por vía: **cliente** (link público) → mail al cliente **+** aviso al dueño;
    **dueño** (panel) → **solo** mail al cliente. Lo que sigue **LOCKED e intacto** es el
    anti-avalancha: UN mail por baja, NUNCA uno por turno cancelado — la enmienda solo precisa el
    destinatario según la vía. Origen: UAT de la fase, test 11 (`07-UAT.md`, sección `## Gaps`,
    entrada `resolved_by_decision`) + decisión del usuario del 2026-07-22. El **CÓDIGO no cambia**:
    ya hace exactamente esto. La enmienda ALINEA D-14 con **D-13**, que ya decía "cuando el
    **cliente** da de baja, se manda mail a `notification_email`" — D-13 nunca prometió el aviso al
    dueño por la vía del panel.
- **D-15 (baja por el dueño → mail al cliente SIEMPRE):** Cuando el dueño da de baja desde el panel,
  el cliente **siempre** recibe el mail de baja de serie (si tiene email cargado). Sin checkbox
  opt-in: el cliente tenía un fijo semanal reservado y que desaparezca sin aviso es peor que un mail
  de más. Esto mantiene las dos vías 100% consistentes también en notificaciones.
  - **ENMENDADA 2026-07-22** — se cae la afirmación de **paridad total de notificaciones** entre las
    dos vías; lo que sigue **en pie** es el núcleo de D-15: el cliente recibe SIEMPRE su mail cuando
    el dueño da de baja (si tiene email cargado, sin opt-in). Criterio: el aviso al dueño es un
    recibo de algo que le OCURRIÓ, y por el panel la baja la ejecuta él mismo, así que avisarle sería
    redundante. Por vía: **cliente** → mail al cliente **+** aviso al dueño; **dueño** → **solo** mail
    al cliente. Origen: UAT de la fase, test 11 (`07-UAT.md`, sección `## Gaps`, entrada
    `resolved_by_decision`) + decisión del usuario del 2026-07-22. El **CÓDIGO no cambia**: ya hace
    lo correcto. La enmienda ALINEA D-15 con **D-13**, que acotaba el aviso al dueño a la vía del
    cliente.
- **D-16 (`cancelUrl` del mail de alta):** `sendAbonoConfirmation` ya acepta `cancelUrl` (opcional,
  sin uso en v0.24). Esta fase lo **llena** en `app/api/abonos/create/route.ts` con la URL de la
  ruta de D-10, y el template renderiza el botón de "cancelar suscripción".
- **D-17 (cliente sin email):** El detalle del abono en el panel expone un botón **"Copiar link de
  baja"** para que el dueño lo mande por WhatsApp. Cubre el caso frecuente en canchas (cliente sin
  mail) y también sirve si el cliente perdió el mail. NO se construye endpoint de reenvío de mail.

### UX de la baja en el panel (ABONO-05)
- **D-18 (ubicación):** El botón "Dar de baja" vive **solo dentro del detalle** del abono (el
  Dialog desktop / Drawer mobile que ya existe en `app/(dashboard)/abonos/abonos-client.tsx`). NO va
  en la tarjeta del listado: es fricción deliberada para una acción destructiva, y en el detalle ya
  está el contexto (día/hora, último turno, sesiones X de N).
- **D-19 (confirmación):** Diálogo de confirmación que dice exactamente qué va a pasar: "Se cancelan
  N turnos futuros, el último el DD/MM. Esta acción no se puede deshacer." Sin escribir-para-confirmar
  (fricción excesiva para una acción rutinaria del negocio), pero tampoco sin confirmación.
- **D-20 (listado):** Se agrega un **filtro/tab "Archivados"** en `/abonos` que incluye
  **`cancelled` + `completed`**. La vista principal queda **solo con series vivas** (`active`).
  Hoy `visibleAbonos` filtra `cancelled` y deja `completed` en la lista principal → esto cambia:
  `completed` se mueve a Archivados.
- **D-21 (abonos `completed`):** Un finito que llegó a sus N sesiones **SÍ se puede dar de baja** con
  el mismo botón y el mismo flujo — sirve para cancelar de un saque los turnos futuros que le queden.
  `completed` → `cancelled`.

### Seguridad / aislamiento
- **D-22:** El `cancel_token` resuelve el abono **y su tenant** server-side con service role; NO se
  confía en ningún parámetro del cliente para el aislamiento (patrón exacto de
  `app/api/cancel/[token]/route.ts`). Sin token válido → 404 genérico, sin revelar si existe.
- **D-23:** La baja por panel es acción autenticada del dueño; el abono se re-valida por
  `business_id`/`owner_id` antes de tocar nada (nunca por id que viene del cliente).
- **D-24:** La cancelación en masa de turnos **debe estar acotada por `abono_id` AND `business_id`**
  — nunca puede tocar turnos de otra serie ni de otro tenant. Esto es lo que verifica el secure-phase.
- **D-25 (nota para el threat model):** D-17 hace que el `cancel_token` viaje al browser del dueño
  (para copiarlo). Es aceptable — el dueño es owner de la serie — pero el planner debe asegurarse de
  que el token **solo** se exponga en el detalle de un abono del propio negocio, nunca en un listado
  público ni en una vista compartida.

### Claude's Discretion
- Nombre exacto de la función de baja compartida y dónde vive (`lib/abono-cancel.ts` vs helper en
  `lib/abono-generation.ts`) — lo importante es que **ambas vías llamen al mismo código**.
- Forma exacta del template del mail de baja y el copy final.
- Cómo se calcula el conteo/última fecha para el preview (query directa vs helper reusado del panel,
  que ya calcula `lastTurnoDates`).
- Si el filtro "Archivados" es tab, toggle o select — mientras respete el patrón visual de `/abonos`.
- Manejo de turnos de la serie ya cancelados individualmente: no deben contarse en el preview.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos + contexto de fase
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — ABONO-04, ABONO-05 + Out of Scope de v0.24.
- `.planning/workstreams/motor-reservas/ROADMAP.md` §Phase 7 — goal, criterios de éxito y nota de seguridad.
- `.planning/workstreams/motor-reservas/phases/06-modelo-del-abono-alta-manual-generaci-n-forward/06-CONTEXT.md`
  — decisiones vigentes de Phase 6 (D-01..D-10 + revisiones D-06′/D-07′/D-09′). El modelo de datos y
  la política de mails de esta fase se apoyan ahí.

### Skills de dominio (LEER)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — aislamiento de la baja (token y panel).
- `.claude/skills/convenciones-forjo/SKILL.md` — stack, verticales, naming, patrón de rutas/migraciones.

### Código a reusar / tocar (verificado en la sesión)
- `app/api/cancel/[token]/route.ts` — **patrón base** del cancel por token: resolución por
  `cancel_token` con service role, estados (`cancelled`/`past`/`too_late`), mail al cliente + aviso
  al dueño, `getBusinessSecrets`. La baja de serie lo copia SIN modificarlo.
- `app/cancelar/[token]/page.tsx` + `cancel-client.tsx` — shell de la página pública de cancelación
  (`PaletteScript`, branding por tenant, estados). Modelo para `app/abono/cancelar/[token]/`.
- `supabase/migrations/054_abonos.sql` — `abonos.cancel_token` (uuid, ya existe), `status`
  (`active`|`cancelled`|`completed`), `cancelled_at`, `appointments.abono_id`, RLS owner-only.
  **NO hace falta migración nueva** para lo decidido acá.
- `lib/email.ts` — `sendAbonoConfirmation` (ya tiene el param `cancelUrl` sin uso, D-16),
  `sendClientCancelEmail`, `sendAdminNotification`, `resolveSender`, `renderEmailHeader`.
- `app/api/abonos/create/route.ts` — acá se llena el `cancelUrl` del mail de alta.
- `app/(dashboard)/abonos/abonos-client.tsx` — listado + detalle (Dialog/Drawer), `visibleAbonos`,
  `lastTurnoDates`, `turnoCounts`. Acá van D-17/D-18/D-19/D-20.
- `app/(dashboard)/abonos/page.tsx` — carga server-side de abonos/counts; hay que sumar los archivados.
- `app/api/cron/cancel-expired/route.ts` — el cron ya filtra `status='active'`, así que la baja
  **frena la generación sin tocarlo**. Verificar, no modificar.
- `lib/abono-generation.ts` — motor de generación forward; referencia para acotar por `abono_id`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `abonos.cancel_token` **ya existe** (uuid con default en migr. 054) → **sin migración nueva**
  para esta fase, salvo que el planner encuentre un motivo fuerte.
- `sendAbonoConfirmation({ ..., cancelUrl })` ya tiene el hueco reservado para el link (D-16) y el
  template omite el botón cuando viene vacío.
- El cron `cancel-expired` **ya solo procesa `status='active'`** → el criterio 3 del roadmap ("deja
  de generar turnos futuros") se cumple con el cambio de estado, sin tocar el cron.
- `app/(dashboard)/abonos/abonos-client.tsx` ya tiene el detalle en Dialog/Drawer, `turnoCounts` y
  `lastTurnoDates` — la UI de baja se enchufa ahí, no se construye de cero.

### Established Patterns
- Cancel por token = service role server-side, `.eq('cancel_token', token)`, 404 genérico si no
  matchea, efectos de mail best-effort con `try/catch` + `console.error('[modulo/accion]')`.
- Página pública de tenant = `page.tsx` server (resuelve datos) + `*-client.tsx` (interactividad) +
  `PaletteScript` con paleta/tema/fuente del negocio.
- Respuestas `Response.json({ ok, ... })` con códigos snake_case y status HTTP coherentes.

### Integration Points
- Nueva ruta pública `app/abono/cancelar/[token]/` + `app/api/abonos/cancel/[token]/route.ts`.
- Server action / endpoint de baja desde el panel (autenticado por `owner_id`).
- Cancelación en masa de `appointments WHERE abono_id = ? AND business_id = ? AND date >= hoy`.
- `lib/email.ts`: template nuevo de "baja de serie" (cliente) + aviso al dueño.

### Hallazgo relevante
- Los turnos generados por abono **NO crean eventos de Google Calendar** (`lib/abono-generation.ts`
  no llama a `createCalendarEvent`, a diferencia de `app/api/appointments/create/route.ts`). Por lo
  tanto la baja masiva **no** tiene que borrar eventos de gcal. Si eso cambiara en el futuro, la baja
  tendría que limpiarlos.

</code_context>

<specifics>
## Specific Ideas

La baja tiene que ser **una sola verdad**: el mismo código de "dar de baja la serie" corre para el
cliente (token) y para el dueño (panel), con la única diferencia de cómo se autoriza. Nada de dos
implementaciones que puedan divergir en el efecto sobre los turnos.

Es una acción **destructiva e irreversible**, así que el usuario siempre ve el número antes de
apretar: cuántos turnos se cancelan y hasta qué fecha.

</specifics>

<deferred>
## Deferred Ideas

- **Reactivar un abono dado de baja** — descartado explícitamente (D-04). Si aparece la necesidad,
  es capacidad nueva: requiere decidir qué pasa con los turnos ya cancelados y regenerar la ventana.
- **Registrar quién dio de baja** (`cancelled_by`: cliente vs dueño) — se dejó fuera; requeriría una
  columna nueva (migración 056). Candidato si se necesita auditoría del abono más adelante.
- **Reenviar el mail de alta al cliente** desde el panel — se resolvió con "copiar link" (D-17); el
  endpoint de reenvío queda para más adelante si hace falta.
- **Cancelar una ocurrencia suelta de la serie sin dar de baja el abono** — hoy se hace con el flujo
  de turno existente desde la agenda; una UI dedicada dentro del detalle del abono sería capacidad nueva.
- **v0.25 — flujo semanal "pagá la seña o liberá el horario"** y **cobro recurrente automático**
  (heredados de Phase 6, siguen fuera de v0.24).
- **Contador de sesiones restantes por turnos cumplidos** (pedido en UAT de Phase 6) — sigue diferido.

</deferred>

---

*Phase: 7-Cancelación del abono (mail + panel)*
*Context gathered: 2026-07-21*
