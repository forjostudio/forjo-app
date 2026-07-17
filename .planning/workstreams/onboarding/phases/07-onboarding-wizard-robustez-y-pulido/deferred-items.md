# Deferred items — Phase 07 (out of scope)

Issues pre-existentes en `app/(onboarding)/onboarding/page.tsx`, presentes en el base 5fec7f5 ANTES de este plan. NO causados por 07-01. Fuera del scope de esta fase (regla de scope boundary + regla 3 "no limpiar código alrededor del cambio").

- **`react-hooks/set-state-in-effect` (error)** — L125 `setSlug(slugified)` dentro del `useEffect([name])` que deriva el slug del nombre. Es el patrón de derivación original del wizard, sin tocar. Refactor = mover la derivación a un handler/useMemo; riesgoso y ajeno a ONB-01..04.
- **`@typescript-eslint/no-unused-vars` (warning)** — L13 `Badge` importado y nunca usado. Import muerto pre-existente.

`npx tsc --noEmit` pasa limpio. `npx eslint` sobre el archivo reporta SOLO estos dos items pre-existentes; el código nuevo de 07-01 (checkSlug via fetch, handleLogout, botón de salida, picker de logo) no agrega ningún problema de lint nuevo.
