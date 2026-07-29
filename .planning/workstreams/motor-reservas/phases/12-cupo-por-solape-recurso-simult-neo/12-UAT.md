---
status: testing
phase: 12-cupo-por-solape-recurso-simult-neo
source: [12-03-SUMMARY.md]
started: 2026-07-29T00:00:00Z
updated: 2026-07-29T00:00:00Z
---

## Current Test

number: 1
name: Segmented control de modo + campo de cupo condicional
expected: |
  En /servicios, al editar un servicio aparece el segmented control "Clase grupal /
  Recurso simultáneo" con microcopy que explica la diferencia. Al elegir "Recurso
  simultáneo" aparece el campo de cupo ("Cuántos a la vez").
awaiting: user response

## Contexto

El checkpoint bloqueante del Plan 12-03 fue **auto-aprobado** por el orquestador
(`workflow.auto_advance = true`). Ningún humano ejercitó el editor ni la agenda en un
navegador. La verificación de fase quedó en `human_needed` por esto: CUPO-01 tiene su
mitad de código y persistencia confirmada por el verificador, pero su mitad visual no.

**Setup:** Supabase LOCAL corriendo con la migración 062 aplicada (Plan 12-01) + `npm run dev`.
Login del negocio de prueba: `test@forjo.local` / `Forjo1234!`.

## Tests

### 1. Segmented control de modo + campo de cupo condicional
expected: En /servicios, editar un servicio muestra el segmented control "Clase grupal / Recurso simultáneo" + microcopy. Al elegir "Recurso simultáneo" aparece el campo de cupo. Poner cupo 2 y guardar.
result: [pending]

### 2. Persistencia del modo y el cupo (CUPO-01)
expected: Reabrir ese mismo servicio — "Recurso simultáneo" y cupo 2 siguen seleccionados.
result: [pending]

### 3. Modo grupal sin campo de cupo (cero regresión del editor)
expected: Editar un servicio dejándolo "Clase grupal" — el campo de cupo NO aparece y el resto del editor funciona igual que antes.
result: [pending]

### 4. Indicador "lleno" por solape en la agenda (D-11)
expected: En la agenda, cargar 2 turnos escalonados que se pisen sobre el servicio simultáneo de cupo 2 (ej. 16:00 y 16:15, duración 30). Se ven como filas individuales y ambos muestran el indicador de lleno al alcanzar el cupo en el intervalo solapado — NO un contador "8/15".
result: [pending]
note: El plan ejemplificaba el copy como "2/2 camillas"; lo implementado dice "2/2 lleno" (con "2 de 2 a la vez" en el title), porque "camillas" es terminología de un rubro y D-10 manda labels fijos. Ratificar o corregir el copy en esta prueba.

### 5. Clase grupal existente sin regresión visual
expected: Una clase grupal existente sigue mostrando su roster/contador "8/15" al clickear el chip, sin cambios.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
