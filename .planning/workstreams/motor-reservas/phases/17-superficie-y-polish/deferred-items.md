# Phase 17 — Ítems fuera de alcance encontrados durante la ejecución

## 17-04

- **`finances-client.tsx:290` — error de ESLint PRE-EXISTENTE**
  `useEffect(() => { fetchData() }, [fetchData])` dispara `react-hooks/set-state-in-effect`.
  Verificado presente en `HEAD` antes de esta fase (línea 290 del archivo en `git show HEAD:`),
  a ~600 líneas del bloque que toca 17-04. **No se arregló**: está fuera del alcance del plan y
  arreglarlo es tocar el ciclo de fetch de toda la pantalla de Finanzas.
