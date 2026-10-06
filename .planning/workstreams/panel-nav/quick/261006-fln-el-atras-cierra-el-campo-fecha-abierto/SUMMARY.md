---
quick_id: 261006-fln
slug: el-atras-cierra-el-campo-fecha-abierto
date: 2026-10-06
status: complete
uat: PENDIENTE (celular del dueño, los 4 puntos del PLAN) — el punto 4 ("lo mismo en Nuevo abono") NO APLICA: el alta de abono no tiene campo Fecha
commits:
  - 75394c0
  - 3d966a8
plan_head_before: f6027a087f3f5a66c2501d7d72ca1cd7fe00f164
actuals:
  commits: 2
  tasks: 1
key-files:
  modified:
    - components/dashboard/nuevo-turno-form.tsx
    - test/overlay-history.test.ts
---

# El atrás cierra el campo Fecha abierto

Un Task del plan, dos commits (el cableado y sus tests). **Un solo cableado, no dos**: el alta de
abono no tiene calendario (ver la desviación de abajo). Cero paquetes, cero migraciones (siguen 41),
cero cambio de markup/clases/aria, y `lib/overlay-history.ts` quedó **sin tocar**.

---

## El cableado (`75394c0`)

`components/dashboard/nuevo-turno-form.tsx` — dos cambios, nada más:

1. el import pasó de `import type { OverlayDismissDetails }` a
   `import { useOverlayHistory, type OverlayDismissDetails }`;
2. en `TurnoFormBody`, junto al resto del estado, el hook con el molde de `components/ui/dialog.tsx`.

La parte fácil era la que el plan anticipaba: `dateOpen` ya es estado explícito, así que el hook
participa sin inventar nada (a diferencia del `Select`, que había que controlar por dentro primero).

### Lo que NO era obvio: `dateOpen` crudo dejaba un atrás muerto en el resumen

`TurnoFormBody` tiene un **early return** en `step === 'confirm' && pendingClient` que se lleva toda
la rama del calendario del árbol — **sin tocar `dateOpen`**. Con `open: dateOpen` el hook habría
seguido reteniendo una entrada por un calendario invisible, y en el paso de confirmación el atrás
habría "cerrado" algo que no se ve: el gesto muerto que esta tanda viene a no repetir. Camino real
para llegar ahí: abrir Fecha, scrollear y tocar "Agregar turno" sin elegir día nuevo (la fecha ya
estaba puesta de antes), con el calendario todavía expandido.

Lo que se le pasa al hook es entonces **"el calendario está en pantalla"**:

```ts
const dateCalendarOnScreen = dateOpen && !(step === 'confirm' && pendingClient)
```

Se eligió esto antes que `setDateOpen(false)` dentro de `goToConfirm` porque no cambia ningún
comportamiento visible: al pasar al resumen el hook **consume** la entrada, y al volver al paso form
la **vuelve a empujar**, con el calendario expandido igual que antes. La alternativa habría colapsado
la expansión al volver del resumen — un cambio de UI que el plan prohíbe.

## El anidamiento, verificado (no supuesto)

El calendario vive dentro del diálogo/drawer del alta, que ya tiene su propia entrada. El atrás
cierra el calendario y el formulario queda, y el mecanismo es el id por instancia del módulo: tras el
pop, arriba del stack queda la entrada del shell — **ajena** para el calendario (cierra) y **propia**
para el shell (su `popstateAction` devuelve ignore, sin cierre fantasma). Hashes distintos (`#modal`
para el shell, `#modal-2` para el calendario), que es lo que evita que el router colapse la segunda
entrada.

Verificado en el test "DENTRO del drawer del alta: el atrás cierra el CALENDARIO y el formulario
QUEDA", que además afirma que el **atrás siguiente** sí cierra el formulario.

## Elegir una fecha consume su entrada

`onSelect` ya hacía `setDateOpen(false)`, así que el camino de consume del hook se encarga: la entrada
se devuelve con un `back()` guardado por la marca propia. El test afirma las dos mitades que importan:
que el stack vuelve a 2 (no queda huérfana) y que `date` **sigue puesta** — cerrar el calendario no
descarta la fecha elegida. Por eso el `dismiss` no pasa por `guardDraftOnDismiss`: acá no hay nada que
proteger; el borrador lo sigue cubriendo la guarda del shell cuando el atrás llega al formulario.

## El cruce con la gracia del teclado: IGUAL al del `Select`, no peor

Medido en el mismo viewport falso que usó el quick del `Select`, con los altos de teclado medidos en
la sonda (320 QWERTY / 240 keypad sobre 823px):

| Momento del atrás tras bajar el teclado | Resultado |
|---|---|
| dentro de la gracia (100ms) | **absorbido** — el calendario no cierra y la entrada vuelve |
| exactamente 300ms (`SOFT_KEYBOARD_GRACE_MS`) | **absorbido** (el borde es menor-o-igual) |
| 301ms | cierra el calendario |
| segundo atrás, pasada la gracia | cierra el calendario (la absorción no queda pegada) |
| sin teclado en toda la vida del calendario (desktop) | cierra de una |

**Es igual, no peor, y por construcción:** el disparador es el mismo tipo de botón fuera del input
(mismo desenfoque, misma bajada de teclado), la guarda es la misma función del módulo compartido, el
rastreador del teclado es **uno por documento** (no uno por overlay, así que sumar el calendario no
agrega listeners ni cambia el timing) y la gracia es la misma constante. Costo máximo: **un atrás
muerto**; nunca perder la página, porque la entrada vuelve.

Lo que **no** se midió es el teclado real de Android: no se emula. Mismo límite declarado que en los
otros tres quicks de la tanda; queda para la UAT (punto 3 del plan).

## Los tests (`3d966a8`)

10 casos nuevos en `test/overlay-history.test.ts`, con el molde del archivo (entorno node, historial y
viewport falsos, sin jsdom ni Testing Library). Se **appendeó** a esa suite en vez de crear un archivo
nuevo porque el harness (`HistorialFalso`, `ViewportFalso`, `montarOverlay`) vive ahí y no se exporta:
duplicarlo eran ~130 líneas de copia. `montarCampoFecha` reconstruye el estado real del formulario
(`dateOpen` + `step` + `pendingClient`) sobre el mismo `montarOverlay` que ya modela el hook, igual
que `montarSelect` hizo con el wrapper del selector.

Cubren: cerrado no toca el historial · abrir empuja una entrada con hash · anidado en el drawer (LIFO)
· elegir día consume · el toggle consume · 5 ciclos sin acumular · resumen libera y volver recupera ·
desmontaje con el calendario abierto consume · los dos casos del teclado · desktop sin teclado.

## Desviación: el alta de abono no tiene campo Fecha

El plan y su frontmatter dicen **dos** cableados (`nuevo-turno-form.tsx` y "su gemelo en
`nuevo-abono-form.tsx`"). Ese gemelo **no existe**: `nuevo-abono-form.tsx` no tiene ni `dateOpen`, ni
`<Calendar>`, ni la cadena "date" en todo el archivo. Su propio encabezado lo dice:

> La ÚNICA diferencia con el alta de turno suelto es el campo temporal: acá se pide **día de la
> semana** (0..6) + **hora**, SIN fecha puntual — porque el abono es un turno fijo recurrente.

Y ese campo es un `<Select>`, que **ya participa del historial** desde el quick `261006-dzr`. O sea:
la cobertura del abono ya estaba, por otro camino. No se tocó el archivo (habría sido inventar un
calendario que el dominio no tiene). Por eso el punto 4 de la UAT no aplica.

### Los otros dos `<Calendar>` del panel, revisados y fuera de alcance

- `app/(dashboard)/appointments/appointments-client.tsx:114` — **el otro `dateOpen` real del repo**,
  pero es el **filtro de fecha del listado** de turnos, no un campo de un formulario de alta: un
  dropdown absoluto con cuatro atajos y "Elegir fecha...", cerrado por mousedown afuera. Mismo hueco
  del gesto, otra superficie; fuera de mis archivos asignados. **Candidato a un quick propio.**
- `app/(dashboard)/agenda/agenda-client.tsx:1444` — calendario de la ventana de reserva: **no es un
  overlay**, se muestra siempre que el radio "Hasta una fecha exacta" está elegido, así que no hay
  nada que cerrar. (Archivo del otro ejecutor; sólo lectura.)

## Verificación

| Comando | Resultado real |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | sin "error TS" (filtrando el prefijo `.next/`) |
| `npx vitest run` | **102 archivos · 1544 passed · 4 expected fail · 1 skipped** (piso 1534 + 10) |
| `./node_modules/.bin/eslint` (los 3 archivos) | salida vacía, exit 0 |

Reloj al correr la suite: **14:25 AR**, dentro de la banda 01:00-23:30, así que los canarios de reloj
no aplicaron (0 fallas; los 4 expected fail son los del piso, no fallas).

No se tocó el dev server del puerto 80.

## Sin verificar

- **El gesto real en el celular** (los 3 puntos aplicables de la UAT). No la corrí, por indicación
  explícita.
- **El teclado real de Android** en el cruce con la gracia: no se emula. Lo medido es el modelo que
  lee el código (`visualViewport` encoge, `innerHeight` no).
- **Cerrar el formulario con el calendario abierto, en el browser de verdad.** El historial falso es
  sincrónico; `history.back()` en el browser **no**. Los dos consumos del mismo commit (el calendario
  al desmontarse por el `key={open}` y el shell al bajar su `open`) se encolan juntos, y el segundo
  puede leer un `history.state` todavía viejo: su guarda no reconoce su marca y se saltea el `back()`,
  dejando la entrada del shell enterrada. **Costo máximo: un atrás muerto al volver a esa pantalla**,
  nunca salir de la página — para eso está esa guarda. Es la misma forma que ya tiene el anidamiento
  diálogo-sobre-drawer que está shipeado y con UAT pasada, así que no se intentó pelearla acá (habría
  pedido tocar `lib/overlay-history.ts`, que el plan prohíbe). Queda declarado en el test.
- El filtro de fecha de /appointments, por alcance.

## Self-Check: PASSED

- `components/dashboard/nuevo-turno-form.tsx` — existe, modificado, `useOverlayHistory` presente.
- `test/overlay-history.test.ts` — existe, +10 casos, suite del archivo 56/56.
- `75394c0` y `3d966a8` — existen en git log. `git rev-list --count f6027a0..HEAD` = **2**.
- `components/dashboard/nuevo-abono-form.tsx` y `lib/overlay-history.ts` — **sin modificar**
  (confirmado por git status: no aparecen).
- `agenda-client.tsx`, `unsaved-changes-guard.tsx`, `lib/panel-history.ts` — **no los tocó este
  quick**: ninguno aparece en mis dos commits (`git show --stat`). `agenda-client.tsx` sí figura como
  modificado en el working tree, pero es el ejecutor paralelo del quick `261006-flm`; de mi lado fue
  sólo lectura.
