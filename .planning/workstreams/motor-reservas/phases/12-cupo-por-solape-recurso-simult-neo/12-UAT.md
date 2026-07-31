---
status: complete
phase: 12-cupo-por-solape-recurso-simult-neo
source: [12-03-SUMMARY.md]
started: 2026-07-29T00:00:00Z
updated: 2026-07-30T00:00:00Z
---

## Resultado

**5/5 PASS** — ejecutada por el usuario en el navegador contra el Supabase local
(migraciones 040..064) el 2026-07-30. Ningún paso falló.

Salieron 4 observaciones que NO son fallas de los criterios de aceptación: son mejoras
y un hallazgo de modelo. Capturadas como todos, ver "Observaciones" al final.

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
result: pass

### 2. Persistencia del modo y el cupo (CUPO-01)
expected: Reabrir ese mismo servicio — "Recurso simultáneo" y cupo 2 siguen seleccionados.
result: pass

### 3. Modo grupal sin campo de cupo (cero regresión del editor)
expected: Editar un servicio dejándolo "Clase grupal" — el campo de cupo NO aparece y el resto del editor funciona igual que antes.
result: pass

### 4. Indicador "lleno" por solape en la agenda (D-11)
expected: En la agenda, cargar 2 turnos escalonados que se pisen sobre el servicio simultáneo de cupo 2 (ej. 16:00 y 16:15, duración 30). Se ven como filas individuales y ambos muestran el indicador de lleno al alcanzar el cupo en el intervalo solapado — NO un contador "8/15".
result: pass
note: El plan ejemplificaba el copy como "2/2 camillas"; lo implementado dice "2/2 lleno" (con "2 de 2 a la vez" en el title), porque "camillas" es terminología de un rubro y D-10 manda labels fijos. Ratificar o corregir el copy en esta prueba.

### 5. Clase grupal existente sin regresión visual
expected: Una clase grupal existente sigue mostrando su roster/contador "8/15" al clickear el chip, sin cambios.
result: pass

## Summary

total: 5
passed: 5
issues: 0

## Observaciones (no son fallas — capturadas como todos)

Surgieron de la UAT del 2026-07-30. Ninguna incumple un criterio de aceptación de la fase.

1. **Falta indicador de modo en la LISTA de servicios.** Las tarjetas de `/servicios` no dicen si
   un servicio es grupal o simultáneo; hay que abrir el editor para saberlo.
   → `todos/pending/2026-07-30-indicador-de-modo-en-la-lista-de-servicios.md`

2. **No existe "Individual"** — el segmented control obliga a elegir entre grupal y simultáneo, así
   que un corte de pelo para una persona se muestra como "Clase grupal", que es mentira.

3. **El cupo vive en dos lugares** (`time_blocks.capacity` para grupal, `services.capacity` para
   simultáneo). Observación del usuario: el cupo debería ser por servicio, no por agenda.
   → 2 y 3 son el MISMO problema de modelo: `todos/pending/2026-07-30-el-cupo-vive-en-dos-lugares-y-falta-el-modo-individual.md`

4. **La ocupación grupal no se ve en la grilla**, solo al abrir el turno; el simultáneo sí muestra
   su badge en el chip. Inconsistencia nueva, NO regresión (el grupal se comporta igual que antes,
   que es lo que exigía el paso 5).
   → `todos/pending/2026-07-30-ocupacion-grupal-no-visible-en-la-grilla-de-la-agenda.md`
