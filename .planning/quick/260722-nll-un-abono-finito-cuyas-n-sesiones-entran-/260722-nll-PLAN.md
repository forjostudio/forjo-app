---
quick_id: 260722-nll
slug: un-abono-finito-cuyas-n-sesiones-entran-
date: 2026-07-22
status: planned
type: execute
workstream: motor-reservas
phase_ref: 07-cancelaci-n-del-abono-mail-panel
autonomous: true
files_modified:
  - "app/(dashboard)/abonos/abonos-client.tsx"
must_haves:
  truths:
    - "Un abono finito cuyas N sesiones se generaron enteras al crearlo aparece en el tab Activos mientras esos N turnos estén por delante"
    - "Un abono con status 'completed' y CERO turnos futuros va a Archivados"
    - "Una serie dada de baja (cancelled) va a Archivados, igual que antes"
    - "Un abono 'active' se comporta EXACTAMENTE igual que antes del cambio"
    - "El contador del tab y la lista que se renderiza no pueden discrepar: salen del mismo predicado"
  artifacts:
    - path: "app/(dashboard)/abonos/abonos-client.tsx"
      provides: "helper único isAbonoActivo(a, futureCounts) consumido por visibleAbonos y tabCounts"
      contains: "function isAbonoActivo"
  key_links:
    - from: "visibleAbonos (useMemo del listado)"
      to: "isAbonoActivo"
      via: "llamada con (a, futureTurnoCounts)"
      pattern: "isAbonoActivo\\(a, futureTurnoCounts\\)"
    - from: "tabCounts (useMemo del contador)"
      to: "isAbonoActivo"
      via: "la MISMA llamada — si divergen, el tab dice 'Activos (1)' con la lista vacía"
      pattern: "isAbonoActivo\\(a, futureTurnoCounts\\)"
---

<objective>
El panel archiva un abono finito en el mismo momento de crearlo cuando sus N sesiones entran enteras
en la ventana de generación: el alta genera las N ocurrencias de una, la serie pasa a
`status: 'completed'` y el tab la manda a Archivados con sus N turnos todavía en el futuro.

Se arregla **solo la UI**: `completed` deja de leerse como "terminado" y pasa a leerse como lo que
es — "el motor ya no tiene que extender esta serie". Una serie con turnos por delante sigue siendo
trabajo pendiente del dueño y se queda en Activos.

Purpose: que el dueño no pierda de vista abonos vivos que su cliente tiene reservados.
Output: un helper de predicado único en `abonos-client.tsx`, consumido por el filtro y por el
contador, más los dos comentarios doctrinales que hoy justifican el comportamiento viejo. 1 commit.
</objective>

<context>
El diagnóstico **ya está cerrado**. No lo re-investigues, no re-evalúes la solución: el usuario ya
decidió la fórmula. Cada tarea trae archivo, línea y el cambio exacto.

@app/(dashboard)/abonos/abonos-client.tsx
@.claude/skills/convenciones-forjo/SKILL.md

**Por qué `completed` no significa "terminado"** (`lib/types.ts:278`, D-07′): es un flag **del motor
de generación**. Quiere decir "esta serie finita ya juntó sus N sesiones, el cron no la extiende
más". El cron filtra por `.eq('status','active')` justamente para dejar de escanear series
terminadas, y `lib/abono-cancel.ts:208` deja pasar `completed` a la baja a propósito (D-21). Para el
backend el flag es correcto y **necesario**. El defecto es que la UI lo reusó como estado de negocio.

**Fórmula decidida por el usuario** (elegida por blast radius mínimo — solo cambia el
comportamiento de `completed`; las `active` quedan idénticas):

```
Activos    = status === 'active'  ||  (status === 'completed' && turnosFuturos > 0)
Archivados = el resto  (cancelled, y completed sin turnos futuros)
```

El dato de turnos futuros **ya está en el componente**: prop `futureTurnoCounts: Record<string,
number>` (declarada en la línea 102, desestructurada en la 110, hoy solo la usa el preview del
ConfirmDialog de baja). No hace falta ninguna query nueva.
</context>

<constraints>
- **NO se toca la semántica del `status`.** Fuera de alcance y prohibido modificar:
  `app/api/abonos/create/route.ts`, `app/api/cron/cancel-expired/route.ts`, `lib/abono-cancel.ts`,
  `lib/types.ts`, y `app/(dashboard)/abonos/page.tsx`. El único archivo del diff es
  `app/(dashboard)/abonos/abonos-client.tsx`.
- **NO** agregar chips ni estados nuevos a las filas del listado: se evaluó aparte y quedó fuera.
- **NO** tocar la línea "Estado: Todas las sesiones asignadas" del detalle (~línea 401). Para una
  serie que ahora se queda en Activos esa línea es información útil: le dice al dueño que no se van
  a generar más sesiones.
- **Comandos de verificación (regla dura del proyecto):** usar SIEMPRE los binarios locales
  `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint`, `./node_modules/.bin/vitest`.
  **NUNCA `npx tsc`**: resuelve un paquete equivocado del registry que SIEMPRE sale exit 0 (falso
  verde). Ya provocó una verificación inválida en este proyecto.
- NO agregar dependencias. NO correr `npm install` ni `npm ci`.
- Comentarios en español explicando el *por qué*, según la convención del repo.
- Un solo commit para la Tarea 1 (código + comentarios van juntos: dejar los comentarios viejos en
  un commit intermedio deja el archivo mintiendo sobre sí mismo).
</constraints>

<tasks>

<task type="auto">
  <name>Tarea 1: predicado único isAbonoActivo + rewire de los dos memos + doctrina escrita</name>
  <files>app/(dashboard)/abonos/abonos-client.tsx</files>
  <action>
**(a) Helper de módulo `isAbonoActivo`.** Definirlo a nivel módulo (fuera del componente, junto a los
otros helpers puros como `hhmm` y `skipReasonES`, es decir por encima de `interface Props`), con esta
firma exacta:

`function isAbonoActivo(a: AbonoRow, futureCounts: Record<string, number>): boolean`

Semántica: devuelve `true` si `a.status` es `'active'`; si es `'completed'`, devuelve `true` solo
cuando `(futureCounts[a.id] ?? 0) > 0`; para cualquier otro status devuelve `false`. El `?? 0` no es
opcional: una serie que no figura en el record no tiene turnos futuros contados y debe archivarse.

Arriba del helper, un comentario en español que explique la distinción — **generadas ≠ dictadas**:
`status` es un flag del motor de generación, no un estado de negocio; `'completed'` significa que la
serie finita ya juntó sus N sesiones y el cron dejó de extenderla (D-07′), NO que esas sesiones ya
ocurrieron. Un finito cuyas N ocurrencias entran enteras en la ventana nace `'completed'` con sus N
turnos por delante, y esos turnos son trabajo pendiente del dueño; por eso se archiva recién cuando
no le queda ninguno. Dejar dicho también que el backend NO cambia: el cron sigue filtrando por
`'active'` para no reescanear series terminadas y la baja sigue aceptando `'completed'` (D-21).

**(b) `visibleAbonos` (~líneas 128-131) y `tabCounts` (~líneas 132-135).** Los dos deben resolver la
pertenencia al tab **llamando al helper**, nunca comparando `a.status` por su cuenta: si el filtro y
el contador divergen, el tab muestra "Activos (1)" sobre una lista vacía. Ambas llamadas se escriben
igual: `isAbonoActivo(a, futureTurnoCounts)`.

- `visibleAbonos`: sigue siendo un `abonos.filter(...)` que devuelve los que pertenecen al tab
  actual — el helper decide "activo", y el tab `'archivados'` se queda con el complemento.
  Dependencias del memo: `[abonos, tab, futureTurnoCounts]`.
- `tabCounts`: `activos` = cantidad de abonos para los que el helper da `true`; `archivados` sigue
  siendo `abonos.length - activos`. Dependencias del memo: `[abonos, futureTurnoCounts]`.

`futureTurnoCounts` entra a las dos listas de dependencias (regla de react-hooks; además es la
entrada real del predicado).

**(c) Los dos comentarios doctrinales que hoy describen el comportamiento viejo.** Los dos quedan
falsos con este cambio y hay que reescribirlos en el mismo commit:

1. El de `type AbonoTab` (~líneas 51-52). Hoy dice que bajo Archivados vive lo que "ya no genera
   turnos (cancelled) o ya asignó todas sus sesiones (completed)". La segunda mitad deja de ser
   cierta: a Archivados va lo cancelado y lo que ya no tiene turnos por delante.
2. El de `visibleAbonos` (~líneas 123-127). Hoy justifica el comportamiento viejo con "un finito que
   ya asignó sus N sesiones no es trabajo pendiente del dueño" — que es exactamente el defecto.
   Reemplazarlo por la doctrina nueva, sin repetir lo que ya explica el comentario del helper:
   la vista principal es de series con trabajo por delante, el predicado es único y compartido con
   el contador a propósito, y las `active` se comportan igual que antes (el cambio toca solo a
   `completed`).

Lo que NO se toca en este archivo: `copyCancelLink`, `confirmCancel`, el bloque de la ventana de
generación, el chip de turnos de la fila (~líneas 304-311), el detalle del abono y su línea "Todas
las sesiones asignadas" (~401), y la prop `turnoCounts` (que cuenta turnos ASIGNADOS y es otra cosa
que `futureTurnoCounts`).
  </action>
  <verify>
    <automated>./node_modules/.bin/tsc --noEmit</automated>
    <automated>./node_modules/.bin/eslint "app/(dashboard)/abonos/abonos-client.tsx"</automated>
    <automated>grep -cE 'isAbonoActivo\(a, futureTurnoCounts\)' "app/(dashboard)/abonos/abonos-client.tsx"  # debe imprimir 2: el filtro y el contador comparten el predicado</automated>
    <automated>grep -cE 'function isAbonoActivo' "app/(dashboard)/abonos/abonos-client.tsx"  # debe imprimir 1: un solo predicado, no dos copias</automated>
    <automated>grep -cE '\[abonos, tab, futureTurnoCounts\]|\[abonos, futureTurnoCounts\]' "app/(dashboard)/abonos/abonos-client.tsx"  # debe imprimir 2: futureTurnoCounts en las dos listas de dependencias</automated>
  </verify>
  <done>
`tsc --noEmit` y `eslint` en exit 0. El helper existe una sola vez y se lo invoca exactamente 2
veces, con la misma forma, desde `visibleAbonos` y desde `tabCounts`. Los dos memos declaran
`futureTurnoCounts` en sus dependencias. Los comentarios de `AbonoTab` y de `visibleAbonos`
describen la regla nueva (generadas ≠ dictadas) y ya no la vieja.
  </done>
</task>

<task type="auto">
  <name>Tarea 2: gate de alcance del diff + no-regresión + UAT del caso que lo destapó</name>
  <files>app/(dashboard)/abonos/abonos-client.tsx</files>
  <action>
Verificación de cierre. No hay cambios de código nuevos acá: si algún gate falla, se corrige en el
archivo de la Tarea 1 y se vuelve a correr.

**(a) Alcance del diff.** El único archivo de producción tocado es
`app/(dashboard)/abonos/abonos-client.tsx`. En particular `app/(dashboard)/abonos/page.tsx` NO puede
aparecer en el diff: el dato de turnos futuros ya llega como prop y no se agrega ninguna query.
Tampoco pueden aparecer `lib/types.ts`, `lib/abono-cancel.ts`, `app/api/abonos/create/route.ts` ni
`app/api/cron/cancel-expired/route.ts` — la semántica del `status` queda intacta.

**(b) No-regresión de la suite.** Correr la suite completa con el binario local. Los tests de este
repo pegan contra el **Supabase local**; si no está levantado (`supabase start`), la suite falla por
entorno y NO por este cambio. En ese caso hay que decirlo explícitamente en el SUMMARY, indicando
qué archivos de test erroraron y por qué — está prohibido reportar verde sin haberla corrido, y
también está prohibido atribuir a "entorno" un fallo que toque `abonos-*`.

**(c) UAT humana** (es la única prueba que ejercita el render; la suite corre en environment `node`,
sin jsdom, y ningún test cubre este componente). Los dos casos del `<human-check>` de abajo.
  </action>
  <verify>
    <automated>git status --porcelain -- "app/(dashboard)/abonos/page.tsx" "lib/types.ts" "lib/abono-cancel.ts" "app/api/abonos/create/route.ts" "app/api/cron/cancel-expired/route.ts"  # debe imprimir NADA (0 líneas): ninguno de los intocables cambió</automated>
    <automated>git status --porcelain -- "app/(dashboard)/abonos/"  # una sola línea, la de abonos-client.tsx</automated>
    <automated>./node_modules/.bin/vitest run</automated>
    <human-check>
Caso que destapó el bug: `npm run dev` → /abonos → poner la Ventana de generación en 8 semanas y
Guardar → alta de un abono nuevo de **7 sesiones** (día y hora libres). Al volver al listado, la
serie tiene que aparecer en **Activos (1)** — NO en Archivados —, con sus 7 turnos por delante, y al
abrir el detalle debe seguir mostrando "Estado: Todas las sesiones asignadas". Verificar que el
número del tab y la cantidad de filas listadas coinciden en los dos tabs.
    </human-check>
    <human-check>
No-regresión de la baja: dar de baja esa misma serie desde el panel → tiene que desaparecer de
Activos y aparecer en **Archivados**, con los contadores de los dos tabs coherentes. Y un abono
indefinido (`active`) tiene que seguir en Activos exactamente como antes.
    </human-check>
  </verify>
  <done>
Los gates de `git status` confirman que el diff de producción es un solo archivo y que ninguno de
los módulos intocables cambió. La suite corrió con el binario local (`./node_modules/.bin/vitest`,
nunca `npx`) y su resultado quedó reportado tal cual. La UAT confirma: abono finito de 7 sesiones
con ventana de 8 semanas → **Activos**; serie dada de baja → **Archivados**; contadores y listas
coherentes en los dos tabs.
  </done>
</task>

</tasks>

<verification>
- `./node_modules/.bin/tsc --noEmit` → exit 0
- `./node_modules/.bin/eslint "app/(dashboard)/abonos/abonos-client.tsx"` → exit 0
- `./node_modules/.bin/vitest run` → resultado reportado literal (ver Tarea 2b si falla por entorno)
- Un solo predicado, dos call sites, mismas dependencias en los dos memos
- Diff de producción = 1 archivo; `page.tsx` y la semántica del `status` sin tocar
</verification>

<success_criteria>
Un abono finito con turnos por delante se ve en Activos; uno sin turnos futuros y uno dado de baja
se ven en Archivados; el contador del tab nunca puede discrepar de la lista porque los dos salen del
mismo helper; ninguna serie `active` cambió de comportamiento; el backend quedó intacto.
</success_criteria>

<output>
Crear `.planning/quick/260722-nll-un-abono-finito-cuyas-n-sesiones-entran-/260722-nll-SUMMARY.md` al
terminar, dejando registrado el resultado de la suite y de la UAT.
</output>
