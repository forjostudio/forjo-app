---
phase: 17-superficie-y-polish
fixed_at: 2026-08-24T20:05:00Z
review_path: .planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fixed at:** 2026-08-24
**Source review:** `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-REVIEW.md`
**Iteration:** 1
**Alcance:** CR-01 + WR-01…WR-08 (sin `--all` ⇒ IN-01…IN-08 fuera de alcance, salvo lo que cayó
adentro de un fix ya en curso).

**Resumen:**
- Hallazgos en alcance: 9
- Arreglados: 9
- Salteados: 0

**Estado de las herramientas al cierre:**
- `./node_modules/.bin/tsc --noEmit` → exit **0**
- `npm run build` → **✓ Compiled successfully in 45s**
- `npx vitest run test/agenda-occupancy.test.ts` → **26/26** (eran 20/20)
- `eslint` sobre los tres archivos tocados → **12 hallazgos, todos pre-existentes**. Los DOS hallazgos
  NUEVOS que el review reportó quedaron cerrados: `jsx-a11y/role-supports-aria-props` (WR-08) ya no
  aparece. El `react-hooks/purity` del efecto de resincronización (IN-08) sigue: es Info, fuera de
  alcance. No se agregó ningún hallazgo nuevo (el `Date.now()` del pre-check de WR-06 disparaba uno,
  y por eso el helper se movió a scope de módulo).

---

## Fixed Issues

### CR-01: la clave de agrupamiento del panel no era la clave de conteo del motor

**Archivos:** `lib/agenda-occupancy.ts`, `app/(dashboard)/agenda/page.tsx`,
`app/(dashboard)/agenda/agenda-client.tsx`, `test/agenda-occupancy.test.ts`
**Commit:** `bb19fd8`

**Verificado contra la función INSTALADA** (`pg_proc.prosrc` del Postgres local, no la migración):
la rama `individual + group_class` de `book_slot_atomic` cuenta
`COALESCE(a.professional_id, sentinel) = v_bucket AND a.date = p_date AND a.time = p_time`,
**sin `service_id`**, y compara ese número contra `services.capacity` **del servicio que se reserva**.

**Reproducción, antes y después** (script sobre el módulo puro):

| Escenario | ANTES | DESPUÉS | Motor |
|---|---|---|---|
| Misma clase (cupo 6) en DOS agendas: A con 6 inscriptos, B con 3 | **1 fila** `9/6` → BADGE "lleno" | **2 filas**: A `6/6` lleno · B `3/6` | A llena · B con 3 lugares libres |
| Dos servicios grupales en la MISMA agenda y hora: Yoga 5 (cupo 6) + Pilates 3 (cupo 4) | 2 filas `5/6` y `3/4` (las dos dicen que hay lugar) | 2 filas `8/6` y `8/4`, las dos "lleno" | `v_occupied = 8` ⇒ rechaza las dos con `slot_full` |

**Qué se cambió, capa por capa:**
- **El select del server** (`agenda/page.tsx:41`): se agregó `professional_id`. El join
  `professionals(name)` no servía — trae el nombre para mostrar, no el id con el que se agrupa, y
  colapsa a `null` los turnos sin profesional, que en el motor son un bucket propio (el sentinel).
- **El tipo**: `OccupancyAppt.professional_id` + `AgendaAppt.professional_id`; se exportan
  `AGENDA_SENTINEL` y `bucketOf()` (literal byte-idéntico al `COALESCE` del motor).
- **La lógica** (`buildDayEntries`, tres pasadas): (1) lugares tomados por `date|HH:MM|bucket` sobre
  TODOS los turnos del día, sin mirar servicio ni modo — el `count(*)` literal del RPC, con la única
  diferencia deliberada de aplicar `occupiesSeat` (guarda de hold vivo, igual que `availability`);
  (2) una fila por `date|HH:MM|bucket|service_id`, que LEE el contador de la pasada 1 en vez de
  acumularlo; (3) marca `agendaAmbiguous` cuando dos filas del mismo servicio y hora viven en
  agendas distintas. La entrada suma `professionalId` y `agendaAmbiguous`.
- **El roster**: `rosterSlot` pasa a ser la KEY de la fila (antes eran fecha+hora+servicio, que ya no
  identifican una fila). El título y el `aria-label` suman el nombre de la agenda **sólo** cuando
  `agendaAmbiguous` — el caso de una sola agenda renderiza exactamente lo de antes.
- **La suite**: casos 17→22. Los DOS discriminantes tiran de puntas opuestas y se verificaron por
  mutación: sacar el `bucket` de la clave del grupo pone en rojo el 17 (vuelve el `9/6`); meter el
  `service_id` en el eje del conteo pone en rojo el 4, el 18 y el 20. No hay un solo eje que deje
  verdes a los dos — que es la prueba de que son dos ejes.

**Semántica confirmada con el dueño y escrita en el header del módulo:** agrupar para mostrar ≠ el
eje con el que se cuenta. Dos servicios en la misma agenda y hora muestran el MISMO ocupado contra su
propio cupo. Es feo y es verdad.

**Del review, IN-07 punto 1 y 2 quedaron cerrados de paso** (son los agujeros de cobertura que este
mismo fix crea/expone): "dos agendas, mismo servicio y hora" (caso 17) y `occupied > capacity`
(caso 21, alcanzable por WR-06). Los puntos 3 y 4 de IN-07 (fail-open de `expires_at` inválido,
`key.slice` en `computeOverlapFull`) NO se tocaron: no son consecuencia de ningún fix aplicado.

---

### WR-01: `saveCapacityInline` cantaba éxito sin verificar filas escritas

**Archivo:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `2bbb5e3`
**Fix aplicado:** `.select('id')` + chequeo de filas, siguiendo el patrón que `deleteService`
documenta 140 líneas más arriba en el mismo archivo (no se inventó uno nuevo). Cero filas sin error
⇒ mismo desenlace que un rechazo: toast fijo y el número vuelve al valor anterior.

---

### WR-02: `savingCapacityId` era global y dos guardados se pisaban

**Archivo:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `ddf037f`
**Fix aplicado:** el estado pasa a `ReadonlySet<string>`; cada tarjeta agrega y saca SU id. El
call-site usa `savingCapacityIds.has(s.id)`. El comentario que afirmaba «una tarjeta = un request en
vuelo» ahora describe lo que el estado garantiza, y dice por qué.

---

### WR-03: ids `cap-mode-help-*` duplicados en el DOM

**Archivo:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `8d5254c`
**Fix aplicado:** `useId()` por instancia + helper `helpId(key)`. Los dos extremos del canal
(`aria-describedby` del botón e `id` del bloque) salen de la misma función, así que no pueden
divergir. **El `sr-only` que verificó `secure-phase` sigue ahí y ahora resuelve dentro de su propia
instancia** — que era exactamente lo que un gate de presencia no podía ver.

---

### WR-04: el roster mostraba el valor crudo de la base como estado

**Archivo:** `app/(dashboard)/agenda/agenda-client.tsx`
**Commit:** `d0bee4a`
**Fix aplicado:** `statusLabel` completo (`completed`/`cancelled`/`pending`) con fallback `'Otro'`,
nunca el valor crudo; `statusChip` gana una rama propia para `completed` (azul, el mismo color que
`appointments-client` ya usa para ese estado) en vez del gris de "otro".
**Decisión tomada, y por qué NO se siguió la letra del review:** no se importó el diccionario de
`appointments-client`. Ahí `pending_payment` se llama "Pendiente de pago" y en la agenda "Seña
pendiente" — la copy que la UAT miró cuatro veces. Unificar los dos textos es una decisión de
producto, no una limpieza de code-review.

---

### WR-05: una clase pasada con todos los turnos completados se pintaba como cancelada

**Archivo:** `app/(dashboard)/agenda/agenda-client.tsx`
**Commit:** `84ddc05`
**Fix aplicado:** el estado de la fila deja de salir de `occupied > 0`. Si no hay ocupantes y TODOS
los miembros están `completed`, la fila usa el chip de `completed` y el badge muestra
`N asistieron` (mismo molde, mismos tokens y misma altura que `OccupancyBadge`, para que la fila no
se mueva) en vez de `0/N`. El `aria-label` dice lo mismo con palabras.

---

### WR-06: el cupo inline se podía bajar por debajo de los inscriptos, sin aviso

**Archivo:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `be73c4a`
**Fix aplicado:** el aviso va **en la escritura**, como pedía el review. Sólo cuando el número BAJA
(subirlo no puede dejar a nadie afuera y no paga ni una consulta) corre un pre-check que calcula el
máximo de lugares tomados en un horario futuro de ese servicio, **por el eje del motor**
(`bucket|date|time`, con la guarda de hold vivo). Si supera el cupo nuevo, `ConfirmDialog` (riesgo
medio, sin type-to-confirm: es reversible) con la consecuencia escrita.
- **FAIL-CLOSED:** si el pre-check no pudo contar, se pregunta igual, con el texto que dice que no lo
  pudimos verificar.
- **NO** se acotó el badge a `Math.min(occupied, capacity)`: eso esconde el problema.
- El número del pre-check es un **PISO** declarado: la consulta se acota al `service_id` para no
  traerse la agenda entera del negocio, y el motor cuenta el bucket completo. Cuando avisa, el
  problema es seguro.
- `onSave` pasa de `boolean` a `'saved' | 'rejected' | 'cancelled'`: que el dueño diga que no NO es
  un rechazo de la base, así que no pinta el control de rojo ni dispara el toast de error.
- El helper del pre-check vive a scope de módulo a propósito: lee el reloj, y adentro del cuerpo del
  componente eso agregaba un hallazgo nuevo de `react-hooks/purity`.

---

### WR-07: sin `try/finally`, un rechazo dejaba la tarjeta congelada en "Guardando…"

**Archivo:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `36eb5b2`
**Fix aplicado:** el cuerpo de `saveCapacityInline` va en `try/catch/finally` — el mismo criterio que
`addService` ya tenía escrito en este archivo. `handleSave` del control también atrapa, para no
depender de que su `onSave` esté bien escrito. El toast del rechazo pasa a constante única
(`CAPACITY_SAVE_FAILED_MESSAGE`): tres desenlaces, un solo texto fijo.

---

### WR-08: el rechazo se comunicaba solo por color

**Archivo:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `6f1c71c`
**Fix aplicado:** `aria-invalid` se mueve del `<span role="group">` (rol que no lo soporta) al
`<input>`, con `aria-describedby` a un texto `No se guardó` con `role="status"` pegado al control. El
borde rojo se conserva; ya no está solo. Ocupa el lugar que deja la unidad "lugares" en mobile —misma
maniobra de ancho que ya hace el botón Guardar, y son estados excluyentes (al rechazar, `revert()`
corre ANTES de marcar, así que la fila no está sucia y el botón no está montado).
**Reproducido y medido:** `jsx-a11y/role-supports-aria-props` pasó de 1 hallazgo a 0.

---

## Skipped Issues

Ninguno.

---

## No-negociables: verificación de no-regresión

| Invariante | Cómo se verificó | Estado |
|---|---|---|
| D-06 (foco del modal) | `capacityFocusedRef.current` = **3** · `onInputFocus={` = **1** | intacto |
| G-04 (32px de exclusión táctil) | la fila sigue siendo `<div className="flex items-center gap-x-2 gap-y-1 py-6 …">`, HERMANA de la línea de datos, con su corolario escrito | intacto |
| Dos clases a la misma hora = DOS filas | caso 4 y caso 18 de la suite (`gs` = 2, rosters de 5 y 3) | intacto |
| El roster filtra por servicio | caso 4 (`yoga.appts` = 2, `pilates.appts` = 1) y caso 20 (`yoga.appts` = 2 con un turno de otro servicio en el bucket) | intacto |
| Aislamiento por tenant | 16 `.eq('business_id', business.id)` en settings; la consulta NUEVA del pre-check de WR-06 también lo lleva | intacto |
| `components/ui/`, `package.json`, `package-lock.json`, `lib/verticals.ts` | `git diff --stat c07e3da..HEAD --` sobre los cuatro ⇒ **vacío** | byte-idénticos |
| Sin dependencias nuevas | `package.json` sin cambios | ok |
| Sin migración ni cambio de DB | sólo lecturas (`pg_proc.prosrc`) | ok |
| Dev server en :3000 | `HTTP 200` en `/login` después del build | sirviendo |

**Cambio de layout introducido, acotado a propósito:** la fila de la agenda gana un renglón con el
nombre de la agenda **sólo** cuando `agendaAmbiguous` es true (dos filas del mismo servicio y hora en
agendas distintas). En todo escenario que las cuatro rondas de UAT ejercitaron —un negocio con una
sola agenda— la marca es `false` y la fila renderiza byte-idéntico. Es el único caso que necesita
mirarse en la quinta ronda, y necesita un negocio con dos profesionales dictando la misma clase.

---

_Fixed: 2026-08-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
