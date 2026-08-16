---
status: passed
phase: 15-modelo-de-cupo-unificado
source: [15-VERIFICATION.md]
started: 2026-08-12T22:10:00Z
updated: 2026-08-12T22:10:00Z
---

## Current Test

number: —
name: UAT de cierre de fase — booking público + gate de CUPO-08
expected: |
  Los cinco pasos se comportan como se describe. El 3 prueba CUPO-07 de punta a punta
  (grilla pública + book_slot_atomic) y el 4 prueba que el gate está vivo y que su
  mensaje no se filtra a la pantalla.
awaiting: —  (UAT completa, 2/2 pass)

## Prerrequisitos

- `npm run dev` levantado contra el Supabase **LOCAL** (la 068 ya está aplicada ahí).
- La **068 NO está en producción** — esta UAT es contra local, nunca contra prod.

## Tests

### 1. El editor de servicios guarda los tres modos (plan 15-02, Task 1)

En `/servicios` del dev local:

1. Crear un servicio nuevo **sin tocar el cupo** → tiene que quedar en **Individual**.
2. Abrirlo y elegir **Clase grupal** → el campo de cupo tiene que aparecer en **2** (no en 1: el CHECK
   de coherencia rechaza `group_class` con cupo 1, y el guard de 15-02 existe para que eso no pase).
3. Subir el cupo a **10** y guardar.
4. Volverlo a **Individual** y guardar → el cupo vuelve a **1**.

expected: los cuatro pasos guardan sin error. Si alguno tira "Error al guardar", el guard del editor
no está haciendo su trabajo y el CHECK lo está rebotando.
result: **pass con 3 observaciones** (2026-08-16). Los cuatro pasos guardan. El dueño verificó además
el gate de CUPO-08 en vivo sin que estuviera en el guion: al pasar un servicio con turnos futuros a
`Recurso simultáneo`, el panel mostró **copy propia** — *"No se puede cambiar cómo se ocupa el cupo:
el servicio tiene turnos futuros reservados. Cancelalos o esperá a que pasen, y volvé a intentar."* —
y **no** el error crudo de la base. Eso cierra por observación humana la mitad de UI de CUPO-08.

Observaciones levantadas, las tres derivadas a todos (ninguna bloquea el test):
1. **El campo "Cuántos lugares" no se puede editar con el teclado** — normalización ansiosa en
   `onChange` reescribe el valor en la misma tecla. → `2026-08-16-editor-de-servicios-input-de-cupo-y-boton-guardar.md`
2. **El gate bloquea de más** — rechaza el cambio de modo en cualquier dirección, pero `individual` →
   grupal/simultáneo es provablemente seguro (los turnos existentes son `is_group = false` y siguen
   bajo el EXCLUDE). → `2026-08-16-el-gate-de-cambio-de-modo-bloquea-de-mas.md`
3. **El `+` del alta debería ser un "Guardar" al final del formulario** — hoy la acción de confirmar
   está antes que la mitad de los campos. → mismo todo que (1).

### 2. UAT de cierre de fase — booking público + gate de CUPO-08 (plan 15-05, Task 3)

1. Crear un servicio → queda **Individual**.
2. Editarlo a **Clase grupal** con cupo **2**, después subirlo a **10**.
3. Reservarlo desde la página pública `/[slug]`: el **mismo horario** tiene que aceptar **más de una
   reserva**, y recién desaparecer de la grilla **cuando se llena**. Es la prueba de que el cupo ahora
   sale del servicio y no del bloque.
4. Con **un turno futuro vivo**, intentar volverlo a **Individual** → el panel tiene que mostrar
   **copy propia**, nunca el texto crudo del error de la base (`P0001` / el código de dominio).
5. Cancelar ese turno y repetir el paso 4 → ahora **sí** guarda.

expected: los cinco pasos se comportan como se describe. El 3 y el 4 son los que importan: el 3
prueba CUPO-07 de punta a punta (grilla pública + `book_slot_atomic`) y el 4 prueba que el gate de
CUPO-08 está vivo **y** que su mensaje no se filtra a la pantalla.
result: **pass** (2026-08-16) — *"Todo ok"*. CUPO-07 verificado de punta a punta desde la página
pública y el gate de CUPO-08 mostrando copy propia, no el error crudo.

**1 bug encontrado, derivado a todo (no bloquea la fase):** no se pudo borrar un servicio cuyo único
turno era de **ese mismo día a hora ya pasada**. Causa verificada: los gates de las migr. **065**
(`:255`) y **068** (`:42`) comparan `a."date" >= v_today` — **solo la fecha, ignorando la hora**. Es el
mismo bug que la Phase 13 arregló en la UI (gap **G4**, resuelto con
`lib/appointment-time.ts::isPastAppointment`) y que **nunca cruzó al SQL**: por eso la UI muestra el
turno en "Pasados" mientras la base lo cuenta como futuro. → `2026-08-16-el-gate-de-cambio-de-modo-bloquea-de-mas.md`

**2 observaciones más:**
- *"con UN solo turno futuro no debería haber problema de pasarlo a individual"* — **evaluado y
  descartado.** El número no importa: un turno creado en modo grupal nace `is_group = true` y queda
  fuera del EXCLUDE **para siempre**; el EXCLUDE solo compara pares donde ambos son `false`, así que
  una reserva nueva a hora solapada pero distinta no la cruza ni la caza el conteo por hora de inicio
  exacta. Un solo turno alcanza para abrir el agujero — eso *es* R-1, y ese sentido del gate tiene que
  seguir bloqueando. Registrado en el todo del gate.
- *"pude sacar todos los cupos del mismo turno con el mismo nombre, celular y mail"* — capacidad que
  nunca existió (no hay noción de "un lugar por persona"), no una regresión.
  → `2026-08-16-una-persona-puede-ocupar-todos-los-cupos-de-una-clase.md`

**Fuera del alcance de la fase:** flash de la paleta por defecto al loguearse (a confirmar en prod).
→ `.planning/todos/pending/2026-08-16-flash-de-paleta-por-defecto-al-loguearse.md`

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
