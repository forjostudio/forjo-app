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
