# Diferidos del quick 261006-flm

Hallazgos FUERA del alcance de este quick (no los causó este cambio). No se tocaron.

## 1 · eslint preexistente en `agenda-client.tsx` (`react-hooks/purity`)

`Date.now()` dentro del `useMemo` de `entriesByDate` / `overlapFullById`. Línea **853 en HEAD**, 883
después de este quick (sólo porque agregué líneas arriba). Confirmado preexistente con
`git show HEAD:"app/(dashboard)/agenda/agenda-client.tsx" | grep -n "const nowMs = Date.now()"`.
Es el único problema que reporta eslint en los archivos tocados, y no es de este trabajo.

## 2 · La copy del diálogo del guard habla sólo de horarios

`components/dashboard/unsaved-changes-guard.tsx`: *"Tenés cambios en los horarios que todavía no
guardaste"*. El guard también cubre `/web` (el editor CMS ya llamaba `useUnsavedChanges` desde antes
de este quick), así que ahí la frase nombra la pantalla equivocada. **Preexistente**, y el plan
prohíbe tocar la copy. Si se arregla, conviene que la pantalla declare de qué habla en vez de poner
un texto genérico.

## 3 · Mutación cruda de historial en Agenda

`app/(dashboard)/agenda/agenda-client.tsx:290` — `window.history.replaceState(null, '', '/agenda')`
para limpiar el `?google=` del OAuth. Pasa `null`, así que BORRA cualquier marca custom de la entrada
actual (la del sentinel incluida). Hoy es inofensivo: corre una sola vez en el mount y sólo con ese
parámetro en la URL, o sea antes de que pueda haber nada sucio. Queda anotado porque es la única
escritura de historial del panel que no pasa por ningún helper.

## 4 · Documentos de planificación desactualizados

- `.planning/workstreams/panel-nav/REQUIREMENTS.md` **T-3** (:124) sigue afirmando que *"Agenda es la
  única pantalla que usa `useUnsavedChanges`"*. Es falso desde antes de este quick: `/web` también lo
  usa. El docblock del código ya quedó corregido.
- El cuerpo de **D-01** (:24-34) sigue citando como hecho la premisa caduca ("el truco de empujar una
  entrada falsa desincroniza el historial del router"). La enmienda ya existe más abajo en el mismo
  archivo (la tabla de no-objetivos: *"D-01 se mantiene para el historial de RUTAS y se relaja para el
  estado de UI"*), pero el cuerpo no la refleja.
