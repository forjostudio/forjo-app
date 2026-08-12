---
status: testing
phase: 15-modelo-de-cupo-unificado
source: [15-VERIFICATION.md]
started: 2026-08-12T22:10:00Z
updated: 2026-08-12T22:10:00Z
---

## Current Test

number: 1
name: El editor de servicios guarda los tres modos sin rebotar contra el CHECK
expected: |
  Los cuatro pasos guardan sin error — nunca el toast genérico "Error al guardar".
  Paso 1 queda en Individual · paso 2 muestra el campo de cupo en 2 · paso 3 persiste 10 ·
  paso 4 vuelve a persistir cupo 1.
awaiting: user response

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
result: [pending]

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
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
