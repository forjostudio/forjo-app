# Deferred items — Phase 15

Hallazgos fuera del alcance de los planes de esta fase. **No se arreglan acá.**

## 1. `settings-client.tsx` — 10 errores de ESLint PREEXISTENTES (plan 15-02, Task 1)

`./node_modules/.bin/eslint "app/(dashboard)/settings/settings-client.tsx"` sale **1** con 10 errores.
**Ninguno** está en las líneas que toca el plan 15-02: probado copiando la versión de `HEAD` a un
archivo temporal en el mismo directorio y linteándola → **los mismos 10 errores, mismo exit 1**.

Son reglas del React Compiler que el repo todavía no pasa en este archivo:

| Regla | Líneas (versión post-15-02) |
|---|---|
| `react-hooks/set-state-in-effect` | 350, 364 |
| `react-hooks/immutability` | 372 (×2), 373 (×2), 385, 394 |
| `react-hooks/purity` (`Date.now` en render) | 518, 770 |

Todas caen en el bloque de tema/paleta y en las subidas de logo/foto — cero relación con el cupo.
El `<verify>` del Task 1 encadenaba `tsc && eslint`, así que el `LINT_OK` no se puede emitir; el gate
real (`tsc --noEmit` exit 0) sí se cumple.

**Candidato a limpieza propia**, no a un parche dentro de una fase de motor de reservas.

## 2. Dos casos de las suites de abonos sin timeout explícito (plan 15-05, verificación de cierre)

`test/abono-create.test.ts > 7 — indefinido: sin totalOccurrences ...` y
`test/abono-cron.test.ts > 5 — aislamiento por tenant: cada abono genera solo en su propio business ...`
caen con `Test timed out in 5000ms` **según cuántas suites entren en la misma corrida**:

- corrida de las **12** suites del `<verification>` → **12/12 verdes** (114 passed, exit 0);
- corrida de las **14** (las 12 + `concurrency` + `capacity-mode-change-gate`) → esos **dos** casos
  cortan por timeout;
- corridos **aislados** → pasan.

Es el trap ya registrado en `15-CONTEXT.md §code_context`: contra el Supabase local el runner tarda
~2.16 s solo en llegar al root, y **los 5000 ms por defecto no alcanzan**. Los dos casos son de la
Phase 14 y no llevan el `}, 20000)` que sí llevan los gates. **No es una regresión de la Phase 15**:
ninguno de los dos toca cupo ni `book_slot_atomic`, y el plan 15-05 no modificó código de `app/`,
`lib/` ni `supabase/`.

**Arreglo:** agregarles el timeout explícito por caso, como ya lo tienen las suites de gates. Es una
limpieza de la suite de abonos, no de esta fase.
