# Phase 17 — Ítems fuera de alcance encontrados durante la ejecución

## 17-04

- **`finances-client.tsx:290` — error de ESLint PRE-EXISTENTE**
  `useEffect(() => { fetchData() }, [fetchData])` dispara `react-hooks/set-state-in-effect`.
  Verificado presente en `HEAD` antes de esta fase (línea 290 del archivo en `git show HEAD:`),
  a ~600 líneas del bloque que toca 17-04. **No se arregló**: está fuera del alcance del plan y
  arreglarlo es tocar el ciclo de fetch de toda la pantalla de Finanzas.

## 17-05

- **`agenda-client.tsx` — error de ESLint PRE-EXISTENTE `react-hooks/purity`**
  `const nowMs = Date.now()` dentro de un `useMemo` dispara `Cannot call impure function during
  render`. Verificado presente en `HEAD` **antes** de esta fase (línea 495 del archivo en
  `git show HEAD:`, dentro del `useMemo` de `overlapFullById`). 17-05 no lo introduce ni lo
  multiplica: el conteo de `Date.now()` en el archivo sigue siendo **1**, y ahora ese único reloj
  alimenta los dos cálculos en vez de uno. **No se arregló**: sacarlo implica mover el reloj a un
  `useState` + efecto o a un provider de tiempo, que es un cambio de ciclo de vida de toda la
  pantalla y está fuera del alcance del plan.

- **`agenda-client.tsx:1130` "Copiar horario" y el diálogo del roster de desktop** tienen el mismo
  problema de alto potencial que 17-02 resolvió en el editor de servicio. Declarados fuera de
  alcance por el propio plan 17-05. **Anotados, no tocados.**
