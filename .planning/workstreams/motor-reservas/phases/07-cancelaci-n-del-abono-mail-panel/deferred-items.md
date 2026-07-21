
## Plan 07-01 — fallos pre-existentes de la suite (fuera de alcance)

Detectados al correr `npx vitest run` completo durante la ejecución del Plan 07-01. Verificados como
PREVIOS al plan (baseline sin los archivos nuevos: 3 files failed / 4 tests failed). Intermitentes —
parecen contención sobre el Supabase local con los archivos corriendo en paralelo. NO tocados
(SCOPE BOUNDARY: solo se auto-arregla lo causado por el task).

- `test/abono-create.test.ts > 4 — la primera tanda (5 turnos) NO dispara ningún mail`
- `test/abono-generation.test.ts > 3 — es idempotente: la 2ª corrida no crea duplicados`
- `test/abono-generation.test.ts > 4 — saltea la fecha con schedule_exception closed=true (day_closed)`
