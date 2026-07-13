# Deferred Items — Phase 01 (RLS Lockdown + Secret Isolation)

Out-of-scope discoveries logged during execution. NOT fixed in the discovering plan.

## From plan 01-02 (2026-06-15)

- **`app/(dashboard)/settings/settings-client.tsx` — 7 TS2339/TS2551 errors** reading secret
  fields off `Business` (`mp_access_token` x2, `resend_api_key` x2, `resend_from`,
  `recaptcha_secret_key` x2 at lines 541, 547, 567, 568, 573, 577, 583).
  - **Cause:** plan 01-01 removed the 7 secret fields from the `Business` interface
    (`lib/types.ts`); settings-client still references them. Not touched by 01-01 or 01-02.
  - **Disposition:** belongs to the dashboard/settings repoint plan in this phase (read
    presence/booleans via getBusinessSecrets / D-05). Out of scope for 01-02 (payment readers).
  - **Impact on 01-02:** none — the 4 payment files (lib/payment.ts, webhook, create, retry)
    compile clean under `tsc --noEmit`; the project-wide typecheck has these 7 unrelated errors.

## UI: pantallas de cancelación desde email no toman el theme de la app
- Detectado: smoke test post-olas-2 (2026-06-16) por el usuario.
- Síntoma: las pantallas de cancelación abiertas desde el link del email no aplican el theme/paleta de la app.
- Naturaleza: cosmético, NO seguridad. Fuera de scope del milestone de hardening v0.9.
- Acción: arreglo de detalle posterior (backlog UI). No bloquea SEC-01 ni el lanzamiento.
