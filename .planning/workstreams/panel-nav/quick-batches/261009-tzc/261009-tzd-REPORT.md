# 261009-tzd — Guarda de borrador en los diálogos de edición del panel

**Ítem:** `261009-tzd` del quick-batch `261009-tzc` · workstream `panel-nav`
**Base:** `7f14e44` → **HEAD:** `8714de0` (6 commits atómicos)
**Todo que lo especifica:** `.planning/todos/pending/2026-10-09-guarda-de-borrador-en-los-dialogos-del-panel.md`

---

## 1. El plan que decidí

### Cómo lo decidí

El todo listaba 5 archivos y 16 diálogos "a revisar". Antes de tocar nada barrí
**los 32 `<Dialog>`/`<Drawer>` de todo el panel** (`app/(dashboard)` +
`components/dashboard`, no sólo los 5 archivos del todo) con un script de sonda, y
clasifiqué cada uno por una sola pregunta: **¿tiene un borrador que se pueda perder?**

El criterio que salió de ahí, y que terminó siendo también el criterio del candado:
**tiene borrador el diálogo que tiene un control de formulario en su cuerpo**. Los de
confirmación no tienen ninguno — por construcción, no por casualidad: su contenido es
un párrafo y dos botones.

El barrido **corrigió el inventario del todo en dos puntos** (ver §6).

### Los 6 diálogos que ENTRARON

| # | Pantalla | Diálogo | Por qué entra | Cómo se calcula el "sucio" |
|---|---|---|---|---|
| 1 | Finanzas | `saleModal` ("Nueva venta") | **Innegociable.** El más caro de perder del panel: descripción, cantidad, monto, fecha, tipo + buscador de cliente con alta anidada | Huella CRUDA del form + modo/cliente/alta-inline, contra el snapshot tomado en `openNewSale`/`openEditSale` |
| 2 | Finanzas | `expenseModal` | Concepto, categoría, monto, fecha | Huella cruda contra snapshot de apertura |
| 3 | Finanzas | `fixedModal` | Nombre, monto, frecuencia, día de vencimiento | Huella cruda contra snapshot de apertura (el preset entra en la línea base) |
| 4 | Clientes | `newClientOpen` ("Nuevo cliente") | **Innegociable.** Era el caso más literal: `resetNew()` en CUALQUIER cierre | "Algún campo con contenido", leído con `getValues()` en el intento de cierre |
| 5 | Clientes | `importOpen` (importar CSV) | El archivo elegido + el análisis que el server ya devolvió | `!!importFile && (stage === 'upload' \|\| stage === 'preview')` |
| 6 | Canchas (`components/dashboard/canchas-manager.tsx`) | `editCancha` | Formulario de EDICIÓN: nombre, duración, precio | Huella cruda contra snapshot de `openEdit` |
| 7 | Planes (`components/dashboard/plan-modal.tsx`) | `open` | **Lo destapó el candado, no el todo** (§6) | `!!selectedPlan \|\| email.trim() !== emailBaseline.trim()` |

Son **7**, no 6: el de planes apareció al escribir el barrido.

### Los que quedaron AFUERA, y por qué

**Confirmaciones (10) — nada que perder.** `clients/confirmDelete`,
`finances/confirmDeleteSale`, `confirmDeleteExpense`, `confirmDeleteFixed`,
`appointments/confirmCancelId`, `confirmDeleteId`, `settings/confirmCancelSub`,
`clinical-history-panel/confirmDeleteAtt`, `web/showGoLive`, `web/showDiscardConfirm`.
Un párrafo y dos botones. Es la exclusión que el todo ya pedía.

**`finances/askSaveSale` + `askSaveExpense` — pregunta POST-guardado.** Aparecen
*después* de que la venta ya se escribió ("¿guardar como producto frecuente?"). No hay
borrador: el trabajo ya está en la base.

**`clients/mergeModal` — informativo.** Lista los grupos de duplicados con un botón
"Fusionar" por grupo. No hay campos; no hay nada que tipear.

**Paneles de DETALLE (3): `agenda/rosterSlot`, `abonos/detailAbono`.** Son lectura
(lista de inscriptos, ficha del abono) más acciones que abren otros diálogos. Sin campos.

**`agenda/copyDay` — decidido AFUERA.** Sí tiene un borrador: el set de días destino.
Queda afuera por desproporción: su "borrador" son 1-6 taps en chips que están todos a la
vista, y recuperarlo cuesta menos que leer el aviso. Ponerle guarda significa además
plomería nueva (estado del aviso + región viva) en el cliente más grande del panel, para
proteger algo que no es trabajo acumulado. **Anotado como diferido.**

**`categorias-manager/moving` — decidido AFUERA, y con precedente explícito.** Su
borrador es una categoría elegida (radiogroup de botones planos) + una posición. El
archivo documenta el comportamiento actual como una **decisión tomada**, en la misma
Phase 23 que escribió la guarda:

> *"Escape, click afuera y la X descartan el borrador SIN escribir: lo da el Dialog de
> @base-ui/react (portal, focus trap y Escape resueltos), no se hand-rollea."*

Los autores de la guarda miraron este diálogo y eligieron no guardarlo. No lo reverti
por mi cuenta. **Anotado como diferido, para que lo decida el dueño si quiere.**

**`nuevo-turno-form` + `nuevo-abono-form` (4 overlays) — ya la tenían.** Son los dos
precedentes que espejé.

**`settings-client` (3) — ya la tenía.** Es la otra mitad del trabajo de la Phase 23.

---

## 2. Los diffs, por archivo

### `app/(dashboard)/finances/finances-client.tsx` (+168 / −13) — commit `8ff2b83`

1. **Nivel de módulo:** tres tipos (`SaleForm`, `ExpenseForm`, `FixedForm`) + tres
   huellas (`saleFingerprint`, `expenseFingerprint`, `fixedFingerprint`), con los campos
   **enumerados** y no por spread, para que reordenar el estado no cambie la huella en
   silencio.
2. **Plomería del aviso, una sola vez para los tres:** `dismissBlocked` +
   `clearDismissBlocked()` + `noticeDismissBlocked()` + `dismissBlockedNotice`.
3. **Tres líneas base nuevas:** `saleBaselineFp`, `expenseBaselineFp`, `fixedBaselineFp`.
4. **Los seis `open*`** fijan la línea base y apagan el aviso; `openEditSale` resuelve el
   cliente asociado **antes** de la huella.
5. **Tres `isDirty`** (`isSaleDirty`, `isExpenseDirty`, `isFixedDirty`).
6. **Los tres `onOpenChange`** pasan por `guardDraftOnDismiss`; `{dismissBlockedNotice}`
   adentro de cada `DialogContent`.

### `app/(dashboard)/clients/clients-client.tsx` (+120 / −4) — commits `398c765`, `8714de0`

1. `getValues: getValuesNew` sumado al `useForm` existente.
2. Plomería del aviso con **dos pistas** (§3) y un solo `dismissBlocked`: el alta y el
   importador no pueden estar abiertos a la vez.
3. `isNewClientDirty()` + `isImportDirty()`.
4. `onImportDismiss(nextOpen, details)` — el handler que arma la guarda adentro (§5).
5. Los dos `onOpenChange` cableados; región viva en cada popup; `clearDismissBlocked()`
   en los dos botones que abren.

### `components/dashboard/canchas-manager.tsx` (+58 / −5) — commit `96aa4ec`

`editBaselineFp` + `dismissBlocked` + `editFingerprint()` + `isEditDirty()` +
`noticeDismissBlocked()`; `openEdit` fija la línea base; `onOpenChange` cableado; región
viva adentro del popup.

### `components/dashboard/plan-modal.tsx` (+57 / −2) — commit `fc61f5f`

`emailBaseline` + `dismissBlocked` + `isPlanDirty()` + `noticeDismissBlocked()`; el
efecto de prefill mueve la línea base con el **mismo `prev ||`** que el campo;
`handleClose` resetea los dos; `onOpenChange` cableado.

### `test/panel-draft-guard-coverage.test.ts` (+286, nuevo) — commit `f8d73ee`

El candado. Detalle en §4.

---

## 3. El aviso: DOS canales, y por qué dos pistas

El aviso lo da el **caller**, no la guarda (code-review WR-08 de la Phase 23). Los dos
canales, en los 7 diálogos:

- `toast.warning(UNSAVED_CHANGES_MESSAGE, { id: UNSAVED_CHANGES_TOAST_ID, description: <pista> })`
- `<p role="status" aria-live="assertive" className="sr-only">` **adentro del popup** —
  porque la región `aria-live` del toast vive fuera del portal y el modal la marca `inert`.

**Dos pistas, no una**, porque la salida que ofrecen es distinta:

| Pista | Dónde | Por qué |
|---|---|---|
| `UNSAVED_CHANGES_HINT` ("Guardá para conservarlos…") | Finanzas ×3, Nuevo cliente, Editar cancha | Los cinco tienen un botón **"Guardar"** literal en pantalla |
| `UNSAVED_NEW_HINT` ("Terminá de cargarlo…") | Importar CSV, Modal de planes | No tienen "Guardar": tienen "Continuar"/"Importar" y "Continuar al pago". Mandar al dueño a apretar un botón que no está en pantalla es peor que no avisar — es la razón por la que esa constante existe |

Cero cadenas nuevas: las cuatro ya vivían en `lib/panel-draft.ts`.

---

## 4. El candado

`test/panel-draft-guard-coverage.test.ts` — **puro** (`readdirSync`/`readFileSync`; sin
base, sin navegador, sin reloj → `test/suite-split.ts` lo clasifica solo en el carril
paralelo `pure`). **10 casos, 3 bloques.** Molde heredado de `test/panel-nav-chrome.test.ts`.

**Qué afirma (bloque 2, el central):** todo `<Dialog>`/`<Drawer>` de
`app/(dashboard)` + `components/dashboard` con un control de formulario en su cuerpo
pasa su cierre por la guarda. Dos caminos de detección, los dos vivos en el repo:
directo (`onOpenChange={guardDraftOnDismiss(...)}`) e **indirecto por nombre de handler**
(`onOpenChange={handleDialogDismiss}` → resuelve la definición en el mismo archivo).

**Bloque 3:** la guarda y su copy viven en un solo módulo, ninguna pantalla define su
propia versión, y **todo consumidor de la guarda tiene la región viva adentro del popup**.

### Las dos trampas de regex, medidas y fijadas como casos

1. **La que avisaba el brief.** El primer detector de controles fue `/<Input[^>]*?>/` y
   daba **CERO sobre 88 `<Input>` reales**: la clase negada se corta en el primer `>`, y
   el primer `>` de un `<Input>` de este repo casi siempre es el de la arrow function de
   su `onChange={e => …}`. **Solución:** detectar por la **etiqueta de apertura sola**
   (`<Input` + delimitador), nunca el elemento entero — no hay cierre que buscar, así que
   no hay nada que se pueda cortar de más. Fijado en el caso *"el detector de controles
   NO se corta en el `>` de una arrow function"*.
2. **La misma trampa del otro lado, que el brief no nombraba.** Recortar la etiqueta de
   apertura del `<Dialog>` tiene el problema simétrico: la etiqueta de un diálogo
   *guardado* lleva `onOpenChange={guardDraftOnDismiss(isD, () => setM(false), avisar)}`,
   y ese `>` está **antes** del `>` de la etiqueta — cortar ahí partiría la etiqueta justo
   antes de su `onOpenChange` y **todos** los diálogos guardados se leerían como no
   guardados. **Solución:** `finDeEtiqueta()` cuenta llaves. Fijado en su propio caso.

### Las guardas de honestidad (bloque 1)

| Guarda | Piso | Medido 2026-10-09 |
|---|---|---|
| archivos `.tsx` barridos | > 20 | 47 |
| overlays encontrados | > 20 | 32 |
| overlays que **EXIGEN** la guarda | > 5 | **10** |
| overlays que **ya** pasan por la guarda | > 5 | 14 |
| consumidores de la guarda (bloque 3) | > 4 | 7 archivos |

El tercero es el que importa: si el detector de controles se rompe (la trampa 1),
`EXIGIDOS` queda vacío y el bloque 2 pasaría **por vacío** sin mirar nada.

### La mutación: probada TRES veces, en los tres caminos

Las tres se aplicaron **con el árbol limpio y todo ya commiteado**, y se revirtieron con
`git checkout --` sin commitear nunca.

**Mutación 1 — camino DIRECTO.** Le saqué la guarda a "Nueva venta"
(`onOpenChange={guardDraftOnDismiss(isSaleDirty, …)}` → `onOpenChange={setSaleModal}`):

```
 FAIL  |pure| test/panel-draft-guard-coverage.test.ts > 2 · todo overlay del panel con un formulario adentro pasa por la guarda > no queda ninguno sin guarda
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "app/(dashboard)/finances/finances-client.tsx <Dialog open={saleModal}> (tiene <ProductCombobox)",
+ ]

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

**Mutación 2 — el aviso duplicado.** Le borré la región viva a "Editar cancha":

```
 FAIL  |pure| test/panel-draft-guard-coverage.test.ts > 3 · la guarda y su copy viven en UN solo módulo > toda pantalla que usa la guarda avisa TAMBIÉN adentro del popup
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "components/dashboard/canchas-manager.tsx",
+ ]

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
```

**Mutación 3 — camino INDIRECTO** (el que resuelve el handler por nombre). Vacié el
cuerpo de `onImportDismiss` dejando el `onOpenChange={onImportDismiss}` intacto:

```
 FAIL  |pure| test/panel-draft-guard-coverage.test.ts > 2 · todo overlay del panel con un formulario adentro pasa por la guarda > no queda ninguno sin guarda
AssertionError: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "app/(dashboard)/clients/clients-client.tsx <Dialog open={importOpen}> (tiene <input)",
+ ]
```

Las tres nombran el archivo, el diálogo y el control que lo delata. Después de las tres:
`git status --porcelain -- app components lib test` **vacío**, y el candado de nuevo en
10/10.

---

## 5. Lo que al medirlo resultó distinto de lo que decía el todo

### a) El todo decía 16 diálogos en 5 archivos. Son **32 en 13 archivos**

El todo barrió sólo 5 clientes de pantalla. El panel completo tiene 32 overlays, y **dos
de los que tienen formulario viven en `components/dashboard`**, fuera del alcance que el
todo miraba: `canchas-manager` y `plan-modal`.

### b) El **modal de planes** no estaba en el todo y era un caso real

Lo destapó el candado. Era el único diálogo del panel con un campo de texto adentro que
seguía descartando en cualquier cierre: un toque afuera con el plan ya elegido y el mail
de MercadoPago tipeado reseteaba los dos y volvía al paso 1. Lo incluí en vez de
exceptuarlo: una excepción sobre un campo de texto real es justo el agujero que degrada
el candado.

**Y tenía la trampa de WR-09 esperando.** El mail viene **precargado** con el de la
cuenta (`setEmail(prev => prev || accountEmail)` en un efecto). La señal obvia
—`!!email.trim()`— habría marcado sucio un modal que nadie tocó y habría **encerrado al
dueño** en un diálogo que ya no cierra con un toque afuera: exactamente el modo de falla
grave que la guarda tiene que evitar. Por eso ahí la señal compara contra el valor con el
que el campo nació, y la línea base se mueve con el prefill usando el mismo `prev ||`.

### c) `settings/editingPro` y las dos altas son **invisibles** para el barrido del cuerpo

Sus formularios están extraídos a sub-componentes (`<ProFields …/>`) o pasados como
variable (`{body}`), así que ningún control aparece en el cuerpo del `<Dialog>`. Los tres
**sí** tienen la guarda, así que no hay falso rojo — pero el candado tampoco los cubre.
Sumar los nativos en minúscula al detector recuperó `editingPro` (tiene el `<input
type="file">` de la foto). **Hueco conocido y declarado:** un diálogo nuevo cuyo
formulario entero viva en un sub-componente no queda cubierto. Cerrarlo de verdad pide
seguir el import del sub-componente, que es una pasada aparte.

### d) El `isDirty` de react-hook-form **no servía** para el alta de cliente

El `useForm` del alta no declara `defaultValues`, así que el `isDirty` de RHF compara
contra `{}` y deja marcado como sucio un campo que se tipeó y se volvió a vaciar. Usé
`getValues()` + "algún campo con contenido", que es el molde de los dos precedentes.

### e) `eslint` encontró lo que `tsc` no: `react-hooks/refs` en el importador

Pasarle a `guardDraftOnDismiss`, **durante el render**, un closure que termina en
`resetImport()` —que lee `importInputRef.current`— es **error** de `react-hooks/refs`.
`tsc` lo pasa limpio. Remedio: el mismo que ya usan las dos altas, construir la guarda
adentro del handler (commit `8714de0`). Los otros 6 diálogos no necesitan la vuelta: su
señal sale de estado, no de una ref.

### f) El form LIMPIO no muerde — verificado por construcción, no por inspección

Es el requisito 7 del brief. En los 5 diálogos con huella, la línea base se fija **en el
mismo `open*`** y con **el mismo objeto** que el setter del borrador, así que recién
abierto `isDirty()` compara dos strings idénticos ⇒ `false` ⇒ el toque afuera cierra
igual que hoy. En el alta de cliente los 6 campos nacen vacíos ⇒ `false`. En el
importador, sin archivo ⇒ `false`. En el modal de planes, sin plan y con el mail tal como
vino ⇒ `false`.

Y la salida deliberada existe en los 7: todos usan `DialogContent` con su
`showCloseButton` por defecto (`true`), así que **todos tienen ✕** — que es la pieza que
hace cerrable un formulario sucio.

---

## 6. Gates

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0** |
| `npx vitest run` | **rc 0** · `Test Files 108 passed (108)` · `Tests 1698 passed \| 4 expected fail \| 1 skipped (1703)` |
| `npm run build` | **rc 0** |
| `npx eslint` (4 fuentes + el test) | 1 error **PREEXISTENTE** (ver abajo); los 4 archivos tocados, limpios tras `8714de0` |

Piso respetado: 1688 → **1698** casos (+10), 107 → **108** archivos (+1), 0 fallados.

**Reloj al correr la suite:** `9/10/2026, 09:52` AR — dentro de `[01:00, 23:30]`, así que
los dos canarios de reloj pasaron.

**Dos ruidos de infra, los dos documentados y los dos resueltos re-corriendo el comando
tal cual, sin tocar nada:**

1. **Flake del runner en Windows**, primera corrida de la suite final:
   `Test Files 107 passed (108)` + `Errors 1 error` con **rc 1 y 0 casos fallados**.
   Re-corrida: 108/108, rc 0.
2. **Flake de red en el build**, primera corrida: `module-not-found` repetido sobre
   `[next]/internal/font/google/manrope_89ee1e75.module.css` (la fetch de Google Fonts),
   con el build ya compilado y las 63 páginas generadas. Re-corrida: rc 0, 109 líneas de
   log, cero `Error`/`Warning`.

**El error de eslint que NO toqué, con la evidencia de que es preexistente:**
`app/(dashboard)/finances/finances-client.tsx` → `react-hooks/set-state-in-effect` en
`useEffect(() => { fetchData() }, [fetchData])`. Verificado contra la base:

```
$ git show 7f14e44:"app/(dashboard)/finances/finances-client.tsx" | grep -n "useEffect(() => { fetchData() }"
290:  useEffect(() => { fetchData() }, [fetchData])
```

Misma línea, en la base, antes de esta pasada (ahora en la 383 por mis inserciones).
Fuera de alcance, misma clase que el `react-hooks/purity` preexistente de
`app/(dashboard)/layout.tsx` que el brief ya declaraba.

---

## 7. Los commits

| SHA | Mensaje |
|---|---|
| `8ff2b83` | `fix(261009-tzd): guarda de borrador en los tres diálogos de Finanzas` |
| `398c765` | `fix(261009-tzd): guarda de borrador en el alta de cliente y en el importador CSV` |
| `96aa4ec` | `fix(261009-tzd): guarda de borrador en "Editar cancha"` |
| `fc61f5f` | `fix(261009-tzd): guarda de borrador en el modal de planes` |
| `f8d73ee` | `test(261009-tzd): candado — ningún diálogo del panel con formulario sin guarda` |
| `8714de0` | `fix(261009-tzd): el cierre del importador se arma adentro del handler, no en el render` |

Los seis con el trailer `Co-Authored-By: Claude Opus 5 (1M context)`, verificado con
`git log -1 --format=%B`. Todos con `git commit -m` directo (hooks activos, sin
`--no-verify`). Cero `git stash`, cero cambios de rama, cero push, cero amend.

---

## 8. Lo que dejé AFUERA, para anotar

1. **`agenda/copyDay`** — borrador real (set de días destino) pero desproporcionado:
   1-6 taps en chips a la vista, y pide plomería nueva en el cliente más grande del panel.
2. **`categorias-manager/moving`** — borrador real (categoría + posición), pero su
   descarte está documentado **como decisión** por la misma Phase 23 que escribió la
   guarda. No la reverti por mi cuenta; que la decida el dueño.
3. **El hueco del barrido con formularios en sub-componentes** (§5c): `settings/editingPro`
   y las dos altas pasan por suerte (tienen un nativo en minúscula o ya la guarda). Un
   diálogo nuevo cuyo formulario entero viva en un sub-componente **no** queda cubierto.
   Cerrarlo pide seguir el import del sub-componente.
4. **UAT visual en el celular, pendiente.** Nada de lo de acá se probó en un navegador:
   el entorno no tiene DOM ni Playwright. Lo que hay que mirar con el teléfono, en el dev
   server de `http://127.0.0.1/` (que no toqué):
   - "Nueva venta" cargada + toque afuera ⇒ **no cierra** y aparece el toast;
   - "Nueva venta" **vacía** + toque afuera ⇒ **cierra** (la mitad del requisito que más
     fácil se rompe);
   - la ✕ con el form cargado ⇒ **cierra y descarta**;
   - el **atrás del celular** con el form cargado ⇒ no cierra, y el segundo atrás tampoco
     se lleva la página;
   - "Editar venta" de una venta **que ya tiene cliente** + toque afuera ⇒ **cierra**
     (es el caso que podía nacer sucio);
   - el **modal de planes** recién abierto, con el mail ya precargado + toque afuera ⇒
     **cierra** (la trampa de WR-09 de §5b).
