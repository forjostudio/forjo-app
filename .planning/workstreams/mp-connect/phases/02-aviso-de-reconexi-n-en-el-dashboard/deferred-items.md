# Deferred Items — Phase 02

## Pre-existing eslint errors (out of scope)

`app/(dashboard)/settings/settings-client.tsx` ya arrastra **10 errores** de las reglas
`react-hooks/*` del React Compiler (`set-state-in-effect`, `immutability`, `purity`) en código
NO tocado por este plan (líneas de theme/effects/`Date.now`, ~180/194/202/224/348/463).

- Confirmado idéntico count (10 errores) en el baseline `HEAD` linteado in-place.
- Mis cambios (import `TriangleAlert`, `MpLogo`, lógica `mpConnected`/`mpConnectionError`, card de
  tres estados) NO agregan ningún error nuevo. `tsc --noEmit` pasa (exit 0).
- Fuera del scope de MPCONN-04. Candidato a limpieza aparte (migración a patrones React Compiler).
