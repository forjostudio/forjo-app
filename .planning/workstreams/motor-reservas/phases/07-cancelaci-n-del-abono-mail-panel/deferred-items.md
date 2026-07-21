
## Plan 07-01 — fallos pre-existentes de la suite (fuera de alcance)

Detectados al correr `npx vitest run` completo durante la ejecución del Plan 07-01. Verificados como
PREVIOS al plan (baseline sin los archivos nuevos: 3 files failed / 4 tests failed). Intermitentes —
parecen contención sobre el Supabase local con los archivos corriendo en paralelo. NO tocados
(SCOPE BOUNDARY: solo se auto-arregla lo causado por el task).

- `test/abono-create.test.ts > 4 — la primera tanda (5 turnos) NO dispara ningún mail`
- `test/abono-generation.test.ts > 3 — es idempotente: la 2ª corrida no crea duplicados`
- `test/abono-generation.test.ts > 4 — saltea la fecha con schedule_exception closed=true (day_closed)`

Confirmado en el gate post-merge de las Waves 1 y 2: con `npx vitest run --no-file-parallelism` la
suite da 683 passed / 1 skipped, 0 fallos. Es contención del runner contra el Supabase local, no código.

## Wave 2 — override del gate `ui.safety-gate` (aprobado por el usuario)

El gate bloqueante de UI marcó "UI files changed but no UI-SPEC.md exists for Phase 07". Se resolvió
como **override**, no como deuda a saldar con `/gsd:ui-phase`:

- Las 4 pantallas tocadas (`app/abono/cancelar/[token]/{page,abono-cancel-client}.tsx`,
  `app/(dashboard)/abonos/{page,abonos-client}.tsx`) son copias declaradas de analogs vivos en
  producción. `abono-cancel-client.tsx` replica `app/cancelar/[token]/cancel-client.tsx` clase por
  clase — el plan lo exige para que el branding del tenant se vea idéntico al cancel de turno suelto.
  El panel reusa ConfirmDialog, píldoras de filtro y tokens del dashboard.
- No hay superficie de diseño nueva, así que la fase no pidió UI-SPEC en discuss ni en plan: produjo
  `07-PATTERNS.md` (mapa a los analogs) en su lugar. En este workstream solo la Phase 1 tiene UI-SPEC.
- Un UI-SPEC generado a esta altura se redactaría contra el código ya escrito en vez de guiarlo.

Si en algún momento se quiere cobertura real sobre lo implementado, la herramienta correcta es
`/gsd:ui-review 07` (auditoría retroactiva de 6 pilares), no `/gsd:ui-phase`.
