# Deferred Items — Phase 01 vertical-canchas

Hallazgos fuera del scope de esta fase (no introducidos por estos cambios). NO fixeados.

## Lint pre-existente (repo-wide)

`npm run lint` reporta ~460 errores + ~130 warnings en archivos NO tocados por esta fase.
Verificado contra `git diff HEAD~1 HEAD`: solo se modificaron `lib/verticals.ts` y
`lib/landing/seo.ts`, ambos limpios de lint. Ejemplos de los pre-existentes:

- `components/dashboard/upcoming-appointments.tsx:66` — `react-hooks/preserve-manual-memoization`
  (React Compiler: manual memoization could not be preserved).
- `design_handoff_forjo_rebrand/preview/app.js:145` — `'ST_BG' is assigned a value but never used`.

Estos son ruido de lint heredado del repo (incluye assets de handoff de diseño y patrones de
memoization del React Compiler). Fuera del scope de Phase 01 (solo presentación de verticales).
Los archivos tocados por esta fase pasan tsc + lint sin errores.
