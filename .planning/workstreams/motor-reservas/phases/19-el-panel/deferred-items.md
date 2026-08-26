# Deferred items — Phase 19 (el panel)

## `react-hooks/purity` preexistente en `agenda-client.tsx` (detectado en 19-04)

- **Qué:** `eslint` marca **error** `Cannot call impure function during render` en `const nowMs = Date.now()`
  dentro del `useMemo` de la ocupación de la vista semanal.
- **Preexistente:** sí — está en `HEAD:app/(dashboard)/agenda/agenda-client.tsx:543`, o sea antes de
  este plan. Fuera del diff de 19-04.
- **Por qué NO se arregla acá:** vive en la **vista semanal de turnos**, que D-13 declara fuera de
  alcance de la Phase 19. Tocarla para pasar un gate de lint sería salirse del alcance.
- **Consecuencia:** `npm run lint` no puede dar exit 0 sobre este archivo hasta que se arregle. El
  gate real de 19-04/19-05 es `eslint` acotado **sin errores nuevos** en el diff.
- **Fix sugerido:** pasar el "ahora" como dependencia del memo (o calcularlo en un `useState`
  inicializador / `useEffect`) en vez de llamarlo durante el render.
