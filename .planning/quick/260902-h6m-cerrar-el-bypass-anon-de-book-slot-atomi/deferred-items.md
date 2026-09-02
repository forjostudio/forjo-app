# Deferred items — quick 260902-h6m

## `test/shell-scope.test.ts` — flake de timeout bajo carga (PREEXISTENTE, fuera de alcance)

**Caso:** `anti-fuga EXHAUSTIVA: el proveedor se monta SOLO donde está registrado (WR-A3)`

- Falla con `Test timed out in 5000ms` **sólo** dentro de la corrida completa (`npm test`), donde
  tardó 10479 ms en el baseline y 9331 ms después del fix.
- Aislado pasa **13/13** en 611 ms (baseline) y 2.22 s (post-fix).
- **Es preexistente:** falló EXACTAMENTE igual en el baseline tomado *antes* de crear un solo archivo
  de este quick task.
- **No tiene relación con este cambio:** es un test PURO que escanea `app/` con `fs` buscando dónde se
  monta un provider. No toca la base, no toca `book_slot_atomic`, no toca privilegios.

**Causa aparente:** el caso escanea el árbol de archivos con un `testTimeout` de 5 s y la corrida
completa lo ejecuta en paralelo con 83 suites más (incluido el carril `db`, que es I/O pesado). El
presupuesto de 5 s no le alcanza bajo esa carga.

**Arreglo sugerido (NO aplicado acá — fuera del alcance de este quick task):** darle un timeout
explícito al caso, como ya hacen las suites DB-backed del repo (`}, 30_000)`).
