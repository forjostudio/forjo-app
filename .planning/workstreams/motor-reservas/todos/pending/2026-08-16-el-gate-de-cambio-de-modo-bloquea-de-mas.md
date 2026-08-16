---
created: 2026-08-16T00:00:00.000Z
title: "El gate de cambio de modo bloquea de más: pasar de individual a grupal/simultáneo es seguro"
area: database
source: UAT Phase 15, test 1 (2026-08-16) — observación del dueño, verificada contra el código
files:
  - supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
  - supabase/schema.sql
---

## El hallazgo

**Palabras del dueño:** *"si quiero pasar a recurso simultáneo un servicio me hace cancelar los turnos
siguientes, no sé si hace falta eso técnicamente."*

**No hace falta en ese sentido.** El gate `services_block_mode_change` rechaza **cualquier** cambio de
modo con turnos futuros vivos, sin mirar la **dirección**. El riesgo que vino a cerrar (R-1) solo
existe en algunas.

## Por qué la dirección importa

Un turno nace `is_group = true` **solo si el servicio no era `individual`** al crearse
(`v_is_group := (v_svc_cap > 1)`, y el CHECK fija `individual ⇒ capacity = 1`). Y `is_group = true` es
exactamente lo que lo saca del EXCLUDE gist 013 (`041: AND NOT is_group`).

| Cambio | Estado de los turnos que ya existen | ¿Peligro? |
|---|---|---|
| `individual` → `group_class` / `simultaneous_resource` | `is_group = false` ⇒ **siguen bajo el EXCLUDE**, y además se cuentan contra el cupo nuevo | **No** |
| `group_class` / `simultaneous_resource` → `individual` | `is_group = true` ⇒ fuera del EXCLUDE, y el gate espejo deja de cubrirlos (exige que el servicio esté en `simultaneous_resource`) | **Sí — este ES R-1** |
| `group_class` ⇄ `simultaneous_resource` | cambia el **eje de conteo** (hora de inicio ⇄ solape): un conjunto hoy legal puede volverse ilegal | **Sí** |

O sea: el caso que el dueño encontró —`individual` → simultáneo— es **la fila segura**, y es
justamente la que el gate está bloqueando sin necesidad. Y es el cambio más frecuente, porque
`individual` es el default de todo servicio nuevo.

## Estrechamiento propuesto

Sumar al predicado: **rechazar solo cuando `OLD.capacity_mode <> 'individual'`**. El resto del gate
—filtro de tenant explícito, la rama `status IS NULL`, el código de dominio fijo— **no se toca**.

## Y hay un TERCER problema en el mismo predicado: compara solo la FECHA, no la hora

**Encontrado por el dueño en la UAT (2026-08-16):** intentó borrar un servicio cuyo único turno era de
**ese mismo día a las 14:00**, ya pasado, y el gate lo rechazó. Su intuición fue correcta: *"tal vez
hay que esperar un tiempo más"* — hay que esperar a **mañana**.

Los **dos** gates usan el mismo predicado, y ninguno mira la hora:

```sql
v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
...  AND a."date" >= v_today
```

- `services_block_delete` (migr. **065**, `:255`)
- `services_block_mode_change` (migr. **068**, `:42`)

**Ya arreglamos este mismo bug una vez, en la UI.** Es el gap **G4 de la Phase 13**: el tab "Pasados"
de Turnos comparaba solo `date` y un turno de hoy a hora pasada nunca caía ahí. Se resolvió con
`lib/appointment-time.ts::isPastAppointment`, que **sí** considera la hora. **El fix nunca cruzó al
SQL**, así que hoy la UI muestra el turno en "Pasados" mientras la base lo sigue contando como futuro.

**Fix:** comparar `(a.date + a.time)` —o el fin del turno, `+ duration_minutes`— contra el `now()` de
Argentina, en vez de `a.date` contra la fecha sola. Ojo: `appointments.time` y `duration_minutes`
pueden ser NULL en filas viejas; la rama defensiva tiene que **cerrar** el gate ante NULL, no abrirlo
(misma lógica que la rama `status IS NULL` que ya existe).

⚠ **Es un cambio permisivo:** después del fix, un turno de hoy ya pasado deja de bloquear. Para el
borrado de servicio es exactamente lo que HIST-01..03 quiso (los turnos pasados sobreviven por el
snapshot). Para el cambio de modo también es seguro: una fila pasada no puede recibir un solape
futuro. Pero **el alta manual está exenta de la ventana de reserva**, así que en teoría se puede
crear un turno en el pasado — evaluarlo en el threat model, no asumirlo.

## Juntarlo con R-15-A, que vive en el MISMO predicado

`15-SECURITY.md` registró un segundo residual sobre esta misma función: **marcar `completed` un turno
futuro abre el gate** (el `NOT IN ('cancelled','completed')` lo deja fuera del `EXISTS`). Efecto hoy
inerte y sin camino de vuelta en la UI; el cierre barato es excluir solo `'cancelled'`.

**Las dos cosas tocan el mismo `IF EXISTS`. Se resuelven en una sola pasada, no en dos.**

## Cómo hacerlo

⚠ **Es un gate de seguridad que acaba de pasar auditoría** (`SECURED 32/32`) y que cierra el riesgo
residual R-1 de v0.26. No es un ajuste de taquito:

1. Migración **069** (la 068 ya está en producción).
2. `secure-phase` sobre el cambio — el register nuevo tiene que demostrar que estrechar el gate **no**
   reabre R-1 en las direcciones peligrosas.
3. Test de integración por dirección, con el molde de `test/capacity-mode-change-gate.test.ts`: las
   seguras pasan, las peligrosas siguen rechazando. Con **control negativo**, que es el estándar del
   workstream.

## Alcance

Fase propia chica, o el primer plan de la Phase 16. Mejora concreta de UX —hoy el dueño tiene que
cancelar turnos para hacer algo que es inocuo— sin aflojar la garantía.
