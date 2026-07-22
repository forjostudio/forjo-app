---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 07
subsystem: ui
tags: [typescript, react-19, next-16, base-ui, vaul, drawer, select, mobile, a11y, abonos, gap-closure]

# Dependency graph
requires:
  - phase: 06-05-ui-abonos
    provides: "components/dashboard/nuevo-abono-form.tsx y app/(dashboard)/abonos/abonos-client.tsx (shell Dialog/Drawer + chips de la lista)"
  - phase: 06-06-cierre-post-uat
    provides: "abonos.total_occurrences (null=indefinido / N=finito) + status 'completed' y el chip 'Completado' que acá se reemplaza"
provides:
  - "useDrawerPortalContainer(): hook de components/ui/drawer.tsx que devuelve el nodo DOM del DrawerContent (o null fuera de un drawer)"
  - "SelectContent monta su popup DENTRO del subárbol del drawer cuando está dentro de uno → las opciones vuelven a ser clickeables en mobile (arregla también el alta manual de turno, bug en prod desde v0.22)"
  - "SelectContent acepta un prop `container` explícito (escape hatch) con prioridad sobre el contexto"
  - "Copy del abono finito: chip 'X de N turnos' en la lista y 'Todas las sesiones asignadas' en el detalle (en vez de 'Completado')"
affects: [07-cancelacion-serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Portal-container por CONTEXTO: el contenedor modal (Drawer) publica su nodo DOM y los popups portaleados (Select) lo consumen — arregla todos los call sites de una sin tocar ninguno"
    - "Callback ref + useState (no useRef) para exponer un nodo DOM por contexto: hace falta el re-render del montaje para que el consumidor lo vea; la ref del caller se compone, no se pisa"
    - "No-op garantizado fuera del contexto: el prop se pasa con spread condicional ({...(x ? {container:x} : {})}) en vez de container={x ?? undefined}, así la ruta de código de siempre queda literalmente idéntica"
    - "Copy de estado terminal: el chip cuenta la ASIGNACIÓN (X de N turnos) y el estado se marca sólo con un ícono — una palabra de estado ('Completado') en el lugar donde el usuario espera una cantidad se lee como 'ya terminó'"

key-files:
  created: []
  modified:
    - components/ui/drawer.tsx
    - components/ui/select.tsx
    - app/(dashboard)/abonos/abonos-client.tsx

key-decisions:
  - "El arreglo del Select va a la CAPA COMPARTIDA (drawer.tsx + select.tsx), no a los dos forms: el bug es del componente, no del abono — nuevo-turno-form lo tenía en producción desde v0.22 y cualquier Select futuro dentro de un drawer queda cubierto"
  - "Contexto con default null: fuera de un drawer NO se pasa `container` al SelectPrimitive.Portal (spread condicional), así los 9 archivos que usan Select conservan exactamente el comportamiento actual (portal a <body>)"
  - "Prioridad container explícito > contexto del drawer: escape hatch por si algún call site necesita otro contenedor sin pelearse con el contexto"
  - "El nodo publicado es el DrawerContent (no el DrawerPortal): vaul es modal y bloquea los pointer-events fuera de su subárbol, así que el popup tiene que vivir ADENTRO del Content para recuperarlos"
  - "No se tocó el combobox de cliente ni el calendario: ambos forms lo resuelven con Input + <ul> en el flujo del documento (no hay Popover/Command portaleado) y el Calendar se despliega inline — no aplica el bug"
  - "El chip del finito dice 'X de N turnos' (no 'X de N' a secas) para leer igual que el indefinido '8 turnos'; 'completed' se marca sólo con el check + variant outline"

patterns-established:
  - "Un bug de UAT que se reproduce en un componente compartido se arregla en el componente, y el SUMMARY deja explícito qué superficie ya-en-producción quedó arreglada de rebote"

requirements-completed: [ABONO-01, ABONO-07]

# Metrics
duration: 13min
completed: 2026-07-21
status: complete
---

# Phase 6 Plan 07: Select clickeable dentro del Drawer + copy del abono finito Summary

**El popup del `Select` ahora se monta dentro del subárbol del `Drawer` (contexto con el nodo del `DrawerContent` + `container` del Portal de base-ui), así que en mobile las opciones vuelven a ser clickeables — esto arregla de rebote el alta manual de turno, que tenía el bug EN PRODUCCIÓN desde v0.22, y fuera de un drawer la ruta de código queda literalmente idéntica a la anterior. Además el abono finito deja de decir "Completado" en la lista y muestra la cantidad asignada ("3 de 3 turnos"), coherente con el indefinido ("8 turnos"). tsc + eslint + 647 tests en verde.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-21T12:55Z
- **Completed:** 2026-07-21T13:08Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **Causa raíz del bug de mobile identificada y cerrada en la capa compartida.** `SelectContent` montaba su popup con `SelectPrimitive.Portal` sin `container`, es decir en `<body>`. vaul (Radix Dialog por debajo) abre el drawer en modo **modal**: bloquea los pointer-events de todo lo que vive fuera de su subárbol del DOM. Resultado: el popup se veía pero no se podía clickear. Ahora el `DrawerContent` publica su nodo por contexto y el `Select` portalea ahí adentro.
- **Arreglado también `nuevo-turno-form` (alta manual, en producción desde v0.22).** No hizo falta tocar ninguno de los dos forms: ambos renderizan sus `SelectContent` como descendientes de `<DrawerContent>` en la rama mobile, así que consumen el contexto por construcción.
- **Cero regresión fuera de drawers, por diseño.** El contexto arranca en `null`; cuando no hay contenedor el componente **no pasa** `container` (spread condicional), de modo que el árbol de props del `Portal` es idéntico al de antes para los 9 archivos que usan `Select`.
- **Copy del abono finito honesto.** El chip de la lista pasó de "✓ Completado" a "**X de N turnos**"; el estado `completed` queda marcado sólo con el check + `variant="outline"`. En el detalle, "Estado: Completado" → "Estado: **Todas las sesiones asignadas**".

## Task Commits

| Task | Nombre | Commit | Archivos |
| ---- | ------ | ------ | -------- |
| 1 | Portal del Select dentro del Drawer | `57c8f33` | `components/ui/drawer.tsx`, `components/ui/select.tsx` |
| 2 | Copy del abono finito (cantidad asignada) | `4fd5e49` | `app/(dashboard)/abonos/abonos-client.tsx` |

## Implementation Notes

### API real de base-ui verificada antes de codear

`node_modules/@base-ui/react/esm/floating-ui-react/components/FloatingPortal.d.ts` confirma que
`FloatingPortal.Props` (de la que hereda `SelectPortalProps`) expone:

```ts
container?: HTMLElement | ShadowRoot | null | React.RefObject<HTMLElement | ShadowRoot | null>
```

Es decir, en ESTA versión el prop se llama efectivamente `container` y acepta el nodo directo. El tipo
público de `SelectContent` se amplió con `Pick<SelectPrimitive.Portal.Props, "container">`, así que el
escape hatch queda tipado y `tsc` lo valida.

### Cómo se verificó el cableado sin poder clickear en un browser

1. `SelectContent` llama a `useDrawerPortalContainer()` **incondicionalmente**, así que cualquier
   `SelectContent` que sea descendiente React de `DrawerContent` recibe el nodo.
2. `nuevo-turno-form.tsx` (rama mobile) y `nuevo-abono-form.tsx` (rama mobile) renderizan
   `<Drawer><DrawerContent>…{body}…</DrawerContent></Drawer>` y el `body` es el que contiene los
   `<SelectContent>` de servicio / profesional / consultorio (y día de la semana, en el abono).
   El `Provider` está **dentro** del `DrawerPrimitive.Content`, envolviendo `{children}` → los Selects
   quedan aguas abajo del Provider.
3. La ref se toma con un **callback ref guardado en `useState`** (no `useRef`): sin el re-render del
   montaje el consumidor vería `null` para siempre. La `ref` que pueda pasar el caller se compone
   (función u objeto), no se pisa.
4. Fuera de un drawer, `React.useContext` devuelve el default `null` → `portalContainer` es `null` →
   `{...(portalContainer ? { container: portalContainer } : {})}` expande a nada.

### Lo que NO se tocó

- Estilos, `z-index`, `className`, `side`, `align`, `alignOffset`, `alignItemWithTrigger`: intactos.
  El único cambio es **dónde** se monta el portal.
- Combobox de cliente y calendario: en ambos forms el combobox es un `Input` + `<ul>` en el flujo
  normal del documento (no hay `Popover`/`Command` portaleado — no existe `command.tsx` en el repo) y
  el `Calendar` de `nuevo-turno-form` se despliega inline dentro del cuerpo. No sufren el bug, no se
  tocaron.
- Lógica de `status` de los abonos y backend: el cambio de Task 2 es **sólo presentación**.

## Deviations from Plan

None - el plan se ejecutó exactamente como estaba escrito. El plan contemplaba aplicar el mismo
arreglo a `Popover`/`Command` "si usan el mismo patrón y están dentro de estos drawers": se revisó y
**no aplica** (ver "Lo que NO se tocó"), así que no se tocó ningún componente extra — coherente con la
instrucción de no tocar componentes que nunca se usan dentro de un drawer.

## Verification

| Check | Resultado |
| ----- | --------- |
| `npx tsc --noEmit` | limpio |
| `npx eslint components/ui/select.tsx components/ui/drawer.tsx` | limpio (0 issues) |
| `npx eslint "app/(dashboard)/abonos"` | limpio (0 issues) |
| `npx vitest run --no-file-parallelism` | **50 archivos / 647 pass · 1 skip** |

Errores pre-existentes NO tocados (fuera de alcance, ver `deferred-items`): `settings-client.tsx`
(~10 errores de react-hooks) y el import sin usar de `test/abono-cron.test.ts`.

## Re-verificación humana pendiente (375px)

1. **Nuevo turno** (Agenda → botón +) en mobile: abrir los selects de **Servicio** y **Profesional** y
   confirmar que ahora se puede **elegir una opción con el dedo/click** (antes se veían y no respondían).
2. **Nuevo abono** (Abonos → Nuevo abono) en mobile: ídem con **Servicio**, **Profesional/Cancha**,
   **Consultorio** (si el negocio tiene) y **Día de la semana**.
3. Confirmar que el popup se ve completo y bien posicionado (no recortado por el borde del drawer).
4. **Desktop ≥768px**: los mismos selects dentro del Dialog deben seguir funcionando igual que antes
   (control de no-regresión), igual que los selects de Clientes / Finanzas / Turnos / Ajustes.
5. **Abonos → lista**: un abono finito debe mostrar el chip **"3 de 3 turnos"** (con check) y ya no la
   palabra "Completado"; al abrir el detalle, el estado debe decir "Todas las sesiones asignadas".

## Threat Mitigations

| Threat ID | Disposición | Cómo quedó |
| --------- | ----------- | ---------- |
| T-06-26 | mitigate | El popup se monta en el subárbol del drawer → recupera los pointer-events que vaul bloquea afuera |
| T-06-27 | mitigate | Contexto con default `null` + spread condicional → fuera de un drawer el `Portal` recibe exactamente los mismos props que antes; tsc + eslint + suite completa como gate |

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Archivos modificados presentes en disco: `components/ui/drawer.tsx`, `components/ui/select.tsx`, `app/(dashboard)/abonos/abonos-client.tsx`, `06-07-SUMMARY.md`.
- Commits verificados en `git log`: `57c8f33`, `4fd5e49`.
