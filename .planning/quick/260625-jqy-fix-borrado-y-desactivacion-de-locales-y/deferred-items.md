# Deferred items — quick 260625-jqy

Pre-existing ESLint errors en `app/(dashboard)/settings/settings-client.tsx` (NO causados por este task; 10 errores idénticos en el baseline antes de los cambios). Regla nueva de Next.js `react-hooks/set-state-in-effect` + "value cannot be modified":

- 150:5 — `setConfigTab('integraciones')` dentro de useEffect (aviso OAuth MP)
- 161:19 — `useEffect(() => setMounted(true), [])`
- 169 / 170 — `applyTheme`/`applyFont` modifican `document.documentElement.dataset` (value cannot be modified)
- 178:5, 187:5 — `document.documentElement.dataset.palette = ...` en selectTheme/selectPalette
- 327:44 — logo upload
- 442:30 — proLabels

Out of scope (SCOPE BOUNDARY): solo se arreglan issues causados por el task actual. Estos son violaciones preexistentes de reglas nuevas de react-hooks; no se tocan acá.
