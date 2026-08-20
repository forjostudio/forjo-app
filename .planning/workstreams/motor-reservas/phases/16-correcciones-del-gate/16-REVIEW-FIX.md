---
phase: 16-correcciones-del-gate
fixed_at: 2026-08-20T15:35:00Z
review_path: .planning/workstreams/motor-reservas/phases/16-correcciones-del-gate/16-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 8
skipped: 3
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-08-20 (hora AR de las mediciones: 12:10–12:34)
**Source review:** `16-REVIEW.md` (2026-08-19, 2 CRITICAL · 5 WARNING · 4 INFO)
**Iteration:** 1

**Resumen:**

- Hallazgos en alcance: **7** (CR-01, CR-02, WR-01…WR-05) **+ IN-02**, que el dueño mandó a arreglar
  junto con CR-01 por ser la misma raíz.
- Arreglados: **8** (los 7 en alcance + IN-02).
- Salteados: **3** (IN-01, IN-03, IN-04 — fuera de alcance por decisión, sin `--all`).
- Estado de las suites al cierre: `npx vitest run test/capacity-mode-change-gate.test.ts
  test/service-delete-gate.test.ts` → **31 passed | 1 expected fail (32)**. `tsc --noEmit` → **0**.
- La 070 se editó **EN SITIO** (no hay 071) y quedó **re-aplicada al Postgres LOCAL**, verificada por
  INSTALACIÓN contra `pg_proc.prosrc`. **Nada se tocó en producción** (sigue en 069).

---

## Lo que había que resolver antes de tocar nada: la contradicción del comentario

`lib/appointment-time.ts` afirmaba que la 070 replicaba en SQL "exactamente" a `isPastAppointment`, y
**prohibía** sumarle la duración del turno de un lado solo. El fix de CR-01 hace justamente eso.

**La objeción no era correcta, y la resolución es que los dos lados contestan preguntas distintas:**

| | Pregunta que contesta | Corte correcto |
|---|---|---|
| `isPastAppointment` (UI, /turnos) | *"¿esto se lo muestro al dueño como pasado?"* | el **INICIO** — a las 14:01 el turno de las 14:00 va a "Pasados" |
| Los dos gates de servicio | *"¿esta fila todavía ocupa la agenda?"* | el **FIN** — un turno en curso SÍ la ocupa, y su tramo restante es reservable |

La divergencia es del mismo tipo que la que la fase ya documenta para `completed` (T-16-04): dos
predicados parecidos, distintos a propósito, cada uno correcto para su pregunta. Y **no reabre el gap
G4**: lo que G4 pedía era que un turno de HOY ya terminado dejara de trabar hasta la medianoche, y eso
sigue cerrado — el turno de 14:00 de 30′ deja de trabar a las 14:30. La ventana entre los dos criterios
es, como máximo, la duración de un turno.

El comentario de `lib/appointment-time.ts` quedó reescrito con ese criterio (y sin prohibir lo que el
código ahora hace); el de `lib/types.ts` también. **Sólo comentarios: no se cambió comportamiento en
`lib/`.**

---

## Fixed Issues

### CR-01 + IN-02: los dos gates miden contra el FIN del turno

**Archivos:** `supabase/migrations/070_service_gates_direction_and_time_precision.sql`,
`supabase/schema.sql`, `lib/appointment-time.ts`
**Commit:** `1e96b55`

El predicado de los dos gates pasa a la **misma expresión con la que el EXCLUDE gist 013/041 define el
intervalo que un turno ocupa** (la misma que usan `book_slot_atomic` y los gates espejo de 042, 058,
062, 063 y 064):

```sql
AND (a."date" + a."time" + make_interval(mins => COALESCE(a."duration_minutes", 30))) > v_now
```

`v_today` + `v_now_time` se reemplazan por un único `v_now timestamp` en hora AR.

**Decisión sobre `duration_minutes` NULL: `COALESCE(..., 30)`, y no fail-closed.** La columna es
nullable, pero el 30 **no es un número inventado acá**: es el que la constraint 013 —el invariante que
estos gates protegen— ya le aplica **a esa misma fila**. Un gate con otro valor estaría en desacuerdo
con la constraint sobre la misma fila, y un fail-closed ("duración nula ⇒ sigue ocupando") devolvería
el gap G4 por la ventana para esas filas (bloquearían todo el día). Medido: hoy hay **0 filas** con
duración nula en local.

**Medición (Postgres local, transacción + `ROLLBACK`, hora AR 12:16):**

```
(A) modo:    clase EN CURSO (arrancó hace 1h, dura 4h)  => BLOQUEA -> service_mode_has_future_appointments
(B) modo:    hoy 00:00 +30' (ya terminó)                => PASA (el gate NO bloquea)
(C) modo:    hoy 23:59 (no llegó)                       => BLOQUEA -> service_mode_has_future_appointments
(D) borrado: turno EN CURSO (hace 2h, dura 4h)          => BLOQUEA -> service_has_future_appointments
(E) borrado: hoy 00:30 +30' (ya terminó)                => BORRA (el gate NO bloquea)
(F) borrado: hoy 23:58 (no llegó)                       => BLOQUEA -> service_has_future_appointments
```

(A) es CR-01 cerrado; (D) es IN-02 cerrado; (B)/(C) son los casos 13 y 14 del test, que **siguen
comportándose igual** que antes del fix.

**Verificación por INSTALACIÓN** (`pg_proc.prosrc`, no leyendo el archivo): las dos funciones tienen
`tiene_corte_por_fin > 0` y `tiene_predicado_viejo = 0` y `tiene_v_now_time = 0`. El archivo se aplicó
**dos veces** (re-corribilidad confirmada, exit 0 las dos).

**`supabase/schema.sql`:** espejado a mano y en cirugía — `git diff --numstat` dio **16 añadidas / 13
borradas** (el umbral que delata un `db dump` es >60/>40). Comparados los dos cuerpos normalizados
(sin comentarios ni espacios) contra los del archivo de la migración: **idénticos**.

---

### CR-02: el pre-check del modal de borrado espeja el predicado nuevo

**Archivos:** `app/(dashboard)/settings/settings-client.tsx`, `test/service-delete-gate.test.ts`,
`supabase/migrations/070_...sql` (el bullet que afirmaba "esta fase no toca una sola línea de `.tsx`")
**Commit:** `e3aa64d`

El corte nuevo **no se puede escribir como filtro de PostgREST** (compara, por fila, contra una
expresión calculada). Así que el pre-check pasa a **dos queries**:

- **(a)** días **posteriores** a hoy (`.gt('date', today)`) — ahí la fecha decide sola;
- **(b)** los de **HOY** traídos enteros (`date, time, duration_minutes`), con el corte resuelto en JS
  en segundos, con la misma aritmética y el mismo `?? 30`.

`nowInAR()` reemplaza al `toLocaleDateString` suelto. Si PostgREST paginara la respuesta de hoy
(`count > filas`), **fail-closed**: se cuentan todas (bloquea de más, nunca de menos), mismo criterio
que el estado `'error'` que ya tenía el modal.

**El aviso (a) del review —"hay que correrlo"— se corrió**: el caso **14** nuevo de
`service-delete-gate.test.ts` replica las queries del modal (mismo molde y misma limitación declarada
que el caso 11: la suite no renderiza React) y asierta que **pre-check y gate coinciden en los dos
lados del corte de hoy**. **MUTATION-TESTED:** con el pre-check viejo (`gte('date', today)`) el caso se
pone en rojo con `expected 1 to be +0` — literalmente el bug reportado.

⚠ Sobre el aviso (b) del review ("si CR-01 cambia el gate de modo, el espejo tiene que seguir al de
BORRADO"): ya no aplica, porque por decisión del dueño **los dos gates** quedaron con el corte por FIN
(IN-02). El espejo sigue al de borrado y los dos dicen lo mismo.

---

### WR-01: el caso 5 vuelve a medir el guard de no-cambio

**Archivo:** `test/capacity-mode-change-gate.test.ts`
**Commit:** `ea10d88`

Re-anclado a `group_class` como modo de ORIGEN (mismo re-anclaje que ya tenían los casos 1/2/3), y el
rename manda `capacity_mode: 'group_class'`.

**MUTATION-TESTED como pide el review:** con la función instalada **sin** el guard
`IS NOT DISTINCT FROM`, el caso 5 pasa a **rojo** (`expected { code: 'P0001', … } to be null`); con el
guard restaurado, verde. La versión vieja del caso pasaba con el gate mutado — o sea que había dejado
de medir lo único que dice medir.

---

### WR-02: la copy del rechazo de modo deja de prometer una salida que no existe

**Archivos:** `app/(dashboard)/settings/settings-client.tsx`, todo nuevo del workstream
**Commit:** `53b481f`

Se eligió **la opción (b) del review: arreglar la COPY** y registrar la capacidad que falta, porque
darle la acción al turno `completed` no es un `||`: `RowActions` es un componente a nivel módulo que no
recibe el "ahora" AR, y cancelar un turno marcado como completado **lo saca de Finanzas** (Finanzas, el
export CSV y la ficha del cliente filtran `.neq('status','cancelled')`). Eso es una decisión de
producto, no un fix de review.

La copy ahora dice la verdad sobre los tres motivos de rechazo (turnos vivos, turno futuro
`completed` sin salida en el panel, abono activo tras WR-05).

**Registrado:** `.planning/workstreams/motor-reservas/todos/pending/2026-08-20-un-turno-completed-futuro-no-tiene-salida-en-el-panel.md`,
con las tres opciones evaluadas (cancelar / desmarcar / nada), el efecto en Finanzas y el ⛔ explícito
de **no** sacar `completed` del gate (reabriría R-15-A).

---

### WR-03: los helpers de modo exigen la fila

**Archivo:** `test/helpers/booking-fixtures.ts`
**Commit:** `53bba88`

`seedGroupClassService` y `seedSimultaneousService` suman `.select('id')` y tiran si el UPDATE no
matcheó exactamente 1 fila, igual que `patchService`. Corridas **las 7 suites** que usan estos helpers
(gates, concurrency, staff-services, booking-cualquiera-public, canchas-provision, landing-derive):
**115 passed | 1 expected fail**.

---

### WR-04: el guard de medianoche deja de voltear los dos archivos enteros

**Archivos:** `test/capacity-mode-change-gate.test.ts`, `test/service-delete-gate.test.ts`
**Commit:** `113eaa7`

Se tomó la **opción (b)** del review, no la (a), y el motivo es el fix de CR-01: derivar las horas de
`AR_NOW ± 10′` haría que el turno "pasado" del caso 13 **todavía no haya terminado** (arrancó hace 10
minutos, dura 30), así que bloquearía y pondría en rojo justamente los casos que asiertan que el cambio
pasa. La opción (a) es incompatible con el corte por FIN.

Implementación: `it.skipIf(FUERA_DE_VENTANA)` en los casos del reloj (13/14 en modo; 12/13/14 en
borrado) + un **canario siempre activo** (prueba pura, sin DB) que se pone en rojo con la hora AR, la
ventana y qué casos se saltearon. La decisión de "no skipear en silencio" se conserva; lo que baja es
el radio de daño.

**Verificado simulando la ventana** (GUARD_WINDOW estrechado a mano): **2 failed (los dos canarios) |
24 passed | 1 expected fail | 5 skipped**, en vez de los dos archivos enteros en rojo. Dentro de la
ventana: 31 passed | 1 expected fail.

Nota de contexto: la ronda de fixes corrió a las **12:10–12:34 AR**, o sea lejos de la franja 23:30–01:00.

---

### WR-05: el gate de modo bloquea la salida de `individual` con un abono ACTIVO

**Archivos:** `supabase/migrations/070_...sql`, `supabase/schema.sql`, `lib/types.ts`,
`test/capacity-mode-change-gate.test.ts`
**Commit:** `d88f746`

El guard de dirección lleva adentro, **antes del `RETURN NEW`**, el mismo bloque de abono activo que el
gate de BORRADO tiene desde la 065, con el **mismo código de dominio** del gate de modo (el panel mapea
por substring; no se inventa uno nuevo).

**Caso 15 nuevo**, con contrapeso (archivada la serie, la misma dirección pasa y queda escrita).
**MUTATION-TESTED:** sin el bloque en la función instalada, el caso 15 se pone en rojo; restaurado,
verde.

---

## Skipped Issues

### IN-01: el caso 7 del gate de borrado deja de discriminar después de las 15:00 AR

**Archivo:** `test/service-delete-gate.test.ts:222-224`
**Motivo:** fuera de alcance (Info; no se pasó `--all`).
**Nota:** el fix propuesto (mover el turno a `FUTURE_TIME_TODAY`) sigue siendo válido y **barato**, y
con el corte por FIN la frontera del caso se corrió de las 15:00 a las 15:30. El caso **no falla nunca**
(el estado `completed` lo saca del conteo igual): lo que pasa es que media jornada por día es
tautológico.

### IN-03: la mitad load-bearing del argumento de GATE-01 no la prueba ningún test

**Archivo:** `test/capacity-mode-change-gate.test.ts` (caso 8)
**Motivo:** fuera de alcance (Info). Requiere un caso nuevo que llame a `book_slot_atomic` dos veces
tras el cambio de modo y espere `slot_full` en la segunda — es cobertura nueva, no una corrección.

### IN-04: nota de proceso (la 070 no está en prod)

**Motivo:** no es un hallazgo accionable en código. Su recomendación —no aplicar la 070 hasta cerrar
CR-01 y CR-02— **quedó cumplida**: los dos están cerrados y prod sigue en 069. El runbook actualizado
(`16-RUNBOOK-070.md`) es el que habilita la aplicación.

---

## Lo que NO se hizo, a propósito

- **No se tocó producción.** Ni `db push`, ni `link`, ni `repair`. Prod sigue en **069**; la 070 se
  aplica a mano cuando el dueño lo decida, con el runbook actualizado.
- **No se creó una migración 071.** La 070 se editó en sitio por decisión del dueño: está aplicada al
  local pero **nunca estuvo en prod**, así que no hay riesgo de orden.
- **No se corrió la suite completa.** Sólo las dos suites del gate (y, para WR-03, las 7 que usan los
  helpers tocados). Las fallas flaky pre-existentes de las suites de abono no se tocaron ni se
  investigaron.
- **No se cambió comportamiento en `lib/`.** Los dos archivos de `lib/` tocados son **comment-only**.

---

_Fixed: 2026-08-20_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
