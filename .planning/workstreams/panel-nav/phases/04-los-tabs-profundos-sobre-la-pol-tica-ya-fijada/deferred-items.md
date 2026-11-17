# Phase 4 — lo encontrado fuera de alcance

## Deferred Items

- Finanzas desborda en horizontal a 390 px (17-25 px de más)
  status: open
  **Qué:** en un documento que nace en `/finances` con el viewport del teléfono (390×844, `mobile: true`), el
  documento mide 407-415 px de ancho (`document.documentElement.scrollWidth`). Es lo que dejó el viewport
  visual desplazado respecto del de layout en la sonda (`(0,37)` y `(0,55)`).
  **Dónde se midió:** `R-T-finanzas-url-pegada`, plan 04-01, task 2 (`.planning/debug/tabs-en-la-url-medida.md`
  `## (b)`, la línea «el viewport visual no es el de layout»).
  **Por qué no se tocó:** es layout de la pantalla, no routing; la Phase 4 es «cero pixel nuevo». No es causado
  por este plan (el tab en la URL no cambia el ancho del contenido). Candidato a un quick de polish mobile.

- eslint de `finances-client.tsx`: `react-hooks/set-state-in-effect` preexistente
  status: open
  **Qué:** el `useEffect(() => { fetchData() }, [fetchData])` (era la L383 en `85c99ae`) llama a un setState
  adentro del efecto. Estaba antes de la fase y el plan 04-01 no lo toca.
