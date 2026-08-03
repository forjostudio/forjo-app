---
phase: 13-borrado-de-servicio-preservando-historial
fixed_at: 2026-08-03T00:00:00Z
review_path: .planning/workstreams/motor-reservas/phases/13-borrado-de-servicio-preservando-historial/13-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 13: Code Review Fix Report

**Fixed at:** 2026-08-03
**Source review:** `13-REVIEW.md`
**Iteration:** 1
**Scope:** CR-01 + WR-01..WR-08 (IN-01..IN-05 fuera de alcance en esta pasada)

**Summary:**

- Findings in scope: 9
- Fixed: 9
- Skipped: 0

**Restricciones respetadas:**

- **Migración 065 NO tocada.** Ningún arreglo requirió un cambio de DB; no se escribió una migración
  066 ni se corrió nada contra producción. Todos los arreglos son de capa de aplicación o de tokens CSS.
- **El espejo de tres puntas del predicado NO se tocó** (`065_*.sql` §6.2 / `schema.sql` /
  `settings-client.tsx` `.or('status.is.null,…')`). Ninguna de las tres expresiones cambió, ni la rama
  `status IS NULL`.
- **Aislamiento por tenant:** no se quitó ningún `.eq('business_id', …)`; el rollback nuevo de
  `deleteCancha` filtra/setea `business_id` en cada escritura, igual que el resto del módulo.
- **`.crm-shell` se sigue renderizando igual:** los tokens nuevos se redeclaran dentro de `.crm-shell`
  con el mismo mix que el botón tenía cableado, así que el CRM queda byte-idéntico.

## Verification

| Check | Antes | Después |
|---|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit 0 | **exit 0** |
| `npx vitest run` | 843 passed / 4 failed / 1 skipped (848) | **849 passed / 3 failed / 1 skipped (853)** |
| `npx vitest run --no-file-parallelism` sobre los 3 archivos de abonos | 34/34 | **34/34** |
| `npx eslint` sobre los 7 archivos TS/TSX tocados | 10 errores (todos en `settings-client.tsx`) | **10 errores, mismos, mismas líneas** |
| `npm run build` | — | **OK** (verificación de las 2 hojas de estilo) |

- **+5 tests nuevos** (848 → 853 casos): 4 en `test/canchas-provision.test.ts` (CR-01) y 1 en
  `components/crm/confirm-dialog.test.tsx` (WR-06).
- Los 3 fallos restantes están **todos** dentro de `test/abono-create.test.ts`,
  `test/abono-cron.test.ts` y `test/abono-generation.test.ts`, y el conjunto que falla cambia entre
  corridas (4 en el baseline, 3 después, casos distintos) — es la contaminación cruzada documentada
  desde v0.24. Serializados pasan 34/34. **Ninguna regresión propia.**
- ESLint: sin hallazgos nuevos. Las 10 líneas son las mismas del baseline; la única que se movió es
  la de `Date.now` (699 → 732), por las líneas que agregué más arriba en el archivo.
- CSS: no lo cubren ni `tsc` ni vitest, así que se validó con un build real. En el bundle quedan
  `--danger-foreground` con los 5 valores esperados, `--danger-hover` en los 5 bloques y la utility
  `.hover\:bg-\[var\(--danger-hover\)\]:hover{background-color:var(--danger-hover)}`. El minificador
  además emite un fallback `--danger-hover: var(--destructive)` para navegadores sin `color-mix`
  (hover = color de reposo: nunca un contraste peor).

## Fixed Issues

### CR-01: `deleteCancha` podía destruir la agenda y dejar el servicio vivo

**Files modified:** `lib/canchas.ts`, `test/canchas-provision.test.ts`
**Commit:** `0b85f25`
**Status:** fixed — **requiere verificación humana** (cambio de orden + rollback con efectos en DB real)

**Qué se hizo (no es el parche sugerido en la review, es más fuerte):** la review proponía re-crear a
mano lo borrado. Antes de escribirlo verifiqué los FK reales en `supabase/schema.sql` y aparecieron dos
cosas que cambian el diagnóstico:

- `agenda_spaces.professional_id` es **ON DELETE CASCADE** (`schema.sql:1508`).
- `appointments.professional_id` es **NO ACTION** (`schema.sql:1563`) — o sea que **cualquier** turno de
  la agenda, incluso pasado o cancelado, rechaza el DELETE del professional con 23503.

Con eso, el arreglo principal es de **orden**, no de reparación: se eliminó el
`from('agenda_spaces').delete()` previo y el mapeo se va solo por el CASCADE.

**Cómo me convencí de que la tupla ya no puede quedar a medias.** Los únicos dos pasos destructivos son
el DELETE del professional y el del service, en ese orden. Caso por caso:

1. **La cancha tiene turnos (el caso más común, y el que más se ejecuta).** El primer DELETE se rechaza
   con 23503. Como el mapeo ya no se borra antes, **el CASCADE ni corre**: no se tocó una sola fila. Se
   devuelve `has_appointments`. Antes de este cambio este camino ya dejaba la cancha sin sus
   `agenda_spaces` (y por lo tanto sin el acople de disponibilidad del motor v0.12) **cada vez** que se
   intentaba borrar — un defecto que la review no había detectado porque asumía que después de la 065
   los turnos pasados no bloqueaban nada.
2. **Sin turnos pero con abono activo (el escenario exacto de CR-01).** El primer DELETE pasa; el
   segundo lo rechaza el trigger con P0001. Ahí sí corre el rollback: se re-inserta la agenda apuntando
   al **mismo** `service_id` y se re-apunta el mapeo, que es literalmente lo que `canchasFromData`
   necesita para volver a armar la tupla. El id del professional cambia, y eso es seguro **solo** acá:
   el DELETE anterior salió bien, y eso únicamente puede pasar si ninguna fila de `appointments` lo
   referenciaba (FK NO ACTION). Lo que sí se pierde es el puntero de un abono ya archivado
   (`abonos.professional_id` es SET NULL) — queda escrito en el comentario.
3. **Falla el propio rollback.** Se devuelve `rollback_failed`, un código nuevo y propio, y la UI le
   dice al dueño que recargue y revise. Es el único residuo, y es explícito en vez de silencioso.

No queda ningún camino en el que el service sobreviva sin su agenda. Se agregaron 4 tests que fijan
exactamente eso (rechazo del professional ⇒ 0 deletes de `agenda_spaces`/`services`/`spaces`; rechazo
del service ⇒ re-insert con el `service_id` correcto y el mapeo re-apuntado; `rollback_failed`).

**Por qué requiere verificación humana:** el argumento se apoya en que el CASCADE de `agenda_spaces` y
el NO ACTION de `appointments` se comportan en la base real como los declara `schema.sql`. Los tests
corren contra un mock. Conviene borrar una cancha con historial y otra con abono activo en local antes
de dar el punto por cerrado.

### WR-01: el copy de error empujaba a borrar el historial

**Files modified:** `components/dashboard/canchas-manager.tsx`
**Commit:** `dd9845b`

Se separó el motivo por código (`has_active_abono` / `has_appointments` / `rollback_failed`, que
`lib/canchas.ts` ya devuelve distinguidos desde CR-01) y **se sacó el "o borrá esos turnos primero"**:
esa es justo la acción destructiva e irreversible que la fase existe para volver innecesaria. La salida
que se ofrece es desactivar.

**Una precisión sobre la review:** afirmaba que "past and cancelled appointments no longer block
anything". Eso no es exacto — bloquean, por el FK NO ACTION de `appointments.professional_id`. Por eso
el copy nuevo dice "tiene reservas asociadas" y **no** "tiene reservas futuras": mandar al dueño a
buscar turnos futuros que no existen sería el mismo error que la review señala para el caso del abono.

### WR-02: un pre-check fallido se leía como "no hay nada que perder"

**Files modified:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `d6c8ef8`

`delInfo` pasó a `{…} | 'error' | null`. Si falla cualquiera de las tres queries se loguea con el
prefijo del módulo y se setea `'error'`; el diálogo gana un cuarto estado con copy propio y
`hideConfirm` queda en true. Fail-closed: sin dato no se ofrece la acción destructiva.

### WR-03: dos modales seguidos podían mostrar los números del servicio anterior

**Files modified:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `44b8d99`
**Status:** fixed — **requiere verificación humana** (lógica de concurrencia)

Token de generación en un `useRef`: `openDeleteService` lo incrementa al entrar y descarta el commit si
cambió mientras esperaba los tres round-trips. Además se invalida al cerrar el diálogo, para que una
respuesta tardía no escriba sobre un modal ya cerrado. Cubre también el re-check del backstop de
`onConfirm`, que pasa por la misma función.

### WR-04: el modal bloqueado ofrecía "Desactivar" en servicios ya desactivados

**Files modified:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `1f1217e`

`secondaryAction` ahora exige `delService.active`. En el tab "Desactivados" el botón ya no aparece, y la
descripción del estado bloqueado cambia a un texto que dice la verdad ("ya está desactivado y no se
ofrece más: vas a poder eliminarlo cuando no le queden turnos futuros ni abonos activos") en vez de
recomendar una acción que no hace nada.

### WR-05: `--danger-foreground` no seguía al theme y caía debajo de AA

**Files modified:** `app/globals.css`, `app/themes.css`
**Commit:** `4f1c9b8`

**No se aplicó el arreglo sugerido: medido, empeora las cosas.** La review proponía
`--danger-foreground: var(--destructive-foreground)`. Antes de aplicarlo comprobé dos cosas:
`--destructive-foreground` **no está mapeado en `@theme`** (no existe `--color-destructive-foreground`)
y no lo consume nadie — `Button variant="destructive"` usa `bg-destructive/10 text-destructive`, no un
relleno sólido. O sea, son valores que nunca se validaron contra nada. Midiéndolos:

| theme | `--danger` | fg actual | ratio | fg sugerido por la review | ratio |
|---|---|---|---|---|---|
| modern (claro) | `#e5484d` | `#fbf3e3` | 3.55 ❌ | `#ffffff` | 3.91 ❌ |
| modern (oscuro) | `#e5484d` | `#1a1714` | 4.56 ✅ | `#ffffff` | **3.91 ❌ (regresión)** |
| spa (claro) | `#c0876b` | `#fbf3e3` | 2.75 ❌ | `#fbf7f2` | 2.85 ❌ |
| spa (oscuro) | `#c0876b` | `#1a1714` | 5.88 ✅ | `#fbf7f2` | **2.85 ❌ (regresión)** |

Seguir `--destructive-foreground` habría roto dos pares que hoy pasan y no habría arreglado ninguno de
los que fallan. En vez de eso, cada theme declara su propio `--danger-foreground` junto a su
`--destructive`, con valores medidos y tomados de la propia paleta del theme. Detalle que lo simplifica:
los bloques `.dark[data-theme=…]` **no** redeclaran `--destructive`, así que un solo valor por theme
cubre claro y oscuro.

| theme | `--danger` | `--danger-foreground` | ratio |
|---|---|---|---|
| forjo claro | `#b23a26` | `#fbf3e3` (sin cambios) | 5.40 ✅ |
| forjo oscuro | `#e05c43` | `#1a1714` (sin cambios) | 4.91 ✅ |
| modern | `#e5484d` | `#0f1623` (su propio fondo dark) | 4.63 ✅ |
| spa | `#c0876b` | `#221f25` (su propio fondo dark) | 5.36 ✅ |
| cyber | `#ff2e7e` | `#0a0410` (su propio casi-negro) | 5.73 ✅ |

`.crm-shell` sigue redeclarando el par a `--crm-danger*` en su propio elemento, así que gana por
herencia y el CRM no se mueve.

### WR-06: el hover del botón destructivo tiraba el par de dark debajo de AA

**Files modified:** `app/globals.css`, `app/themes.css`, `components/crm/confirm-dialog.tsx`,
`components/crm/confirm-dialog.test.tsx`
**Commit:** `7563e5e`

Confirmado midiendo el mix en OkLCh: `color-mix(in oklch, #e05c43, black 10%)` = `#c34f39`, que contra
`#1a1714` da **3.82:1** (la review estimaba ~4.2). El `brightness-110` sugerido tampoco sirve como
regla general: aclara siempre, y en claro (crema sobre rojo oscuro) eso *baja* el contraste. Se tomó la
alternativa que la propia review dejaba entre paréntesis — un token `--danger-hover` por bloque — con
una regla explícita: **el hover mueve la superficie en dirección contraria al foreground con el que se
lee**. Se declara pegado a `--danger-foreground` para que no se puedan desincronizar.

| theme | reposo | hover | ratio reposo | ratio hover |
|---|---|---|---|---|
| forjo claro | `#b23a26` | `#9a3120` (negro 10%) | 5.40 | **6.71** ✅ |
| forjo oscuro | `#e05c43` | `#e6725b` (blanco 12%) | 4.91 | **5.88** ✅ |
| modern | `#e5484d` | `#eb6362` (blanco 12%) | 4.63 | **5.60** ✅ |
| spa | `#c0876b` | `#c8957c` (blanco 12%) | 5.36 | **6.23** ✅ |
| cyber | `#ff2e7e` | `#ff558d` (blanco 12%) | 5.73 | **6.68** ✅ |
| crm | `#e85c3f` | `#ca4f35` (negro 10%) | 3.15 | 4.07 — **sin cambios** |

El CRM conserva exactamente el mix que el botón tenía cableado, así que se ve igual (sus ratios son
preexistentes y quedan fuera del alcance de este finding). El componente ya no calcula color: pasó a
`hover:bg-[var(--danger-hover)]`, con un test que lo fija.

### WR-07: `lib/types.ts` documentaba un `ON DELETE RESTRICT` que la 065 invirtió

**Files modified:** `lib/types.ts`
**Commit:** `f129206`

Comentario reescrito: SET NULL desde la 065, la orfandad de generación la evita el gate
`services_block_delete_trg`, los archivados se desacoplan y conservan `service_name`.

### WR-08: la acción secundaria del modal era fire-and-forget

**Files modified:** `components/crm/confirm-dialog.tsx`, `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `bb162bb`

El botón secundario tiene ahora su propio `secLoading` (+ ref): se deshabilita mientras corre, bloquea
el cierre del diálogo y el botón de confirmar, muestra spinner y **atrapa el rechazo** (log con prefijo
de módulo + toast) en vez de tragárselo. Del lado del caller, `toggleService` devuelve `boolean` y la
acción secundaria solo cierra si realmente se desactivó — antes cerraba siempre, dejando un toast de
error al lado de un diálogo desaparecido, justo lo contrario de la convención "NO optimista: capturamos
el error real" que el mismo commit había introducido dos funciones más arriba.

## Notas de ejecución

- **No se usó git worktree.** Las reglas del proyecto prohíben crear junction/symlink/copia de
  `node_modules`, y un worktree nace sin `node_modules` ni `.env*` — no se habrían podido correr `tsc`,
  vitest ni el build, que son verificación obligatoria acá. Además, el modo de falla documentado es que
  `git worktree remove` siga el junction y destruya el `node_modules` real. Se trabajó sobre el árbol
  principal, con un commit atómico por finding.
- Nunca se usó `npx tsc` (falso verde): siempre `./node_modules/.bin/tsc --noEmit`.
- El árbol de trabajo queda con las mismas modificaciones sin commitear que había al empezar
  (`.claude/skills/humanizador/SKILL.md`, `.planning/workstreams/motor-reservas/config.json` y dos
  archivos de caché de research). No las tocó este pase.

---

_Fixed: 2026-08-03_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
