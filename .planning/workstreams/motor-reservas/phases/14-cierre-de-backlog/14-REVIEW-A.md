---
phase: 14-cierre-de-backlog
cluster: A — scope de shell, diálogos del CRM y remediación de T-14-41
reviewed: 2026-08-11T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - lib/shell-scope.ts
  - components/ui/shell-scope.tsx
  - components/ui/dialog.tsx
  - app/(crm)/layout.tsx
  - components/crm/confirm-dialog.tsx
  - components/crm/confirm-dialog.test.tsx
  - components/crm/maintenance-toggle.tsx
  - components/crm/plan-price-card.tsx
  - components/crm/risk-badge.tsx
  - lib/contrast.ts
  - lib/contrast.test.ts
  - test/shell-scope.test.ts
findings:
  critical: 1
  warning: 8
  info: 6
  total: 15
status: issues_found
---

# Phase 14 — Cluster A: Code Review Report

**Reviewed:** 2026-08-11
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Se auditaron los dos cambios encadenados del cluster: el scope de shell para superficies portaleadas (14-08) y la remediación de T-14-41 (outline de peligro fuera del shell).

**Lo que se verificó y SE SOSTIENE:**

- **Anti-fuga (foco 1).** `ShellScopeProvider` se monta en un único archivo (`app/(crm)/layout.tsx`, línea 60) — confirmado por grep sobre todo el repo. `portalScopeClass()` devuelve `undefined` para `undefined`, `''` y `'   '`; `cn()` los descarta. `.crm-shell` (globals.css:235-262) y `.dark` (142-175) declaran **únicamente** custom properties, así que la premisa "aplicar el scope sobre el popup es inocuo" es correcta. El `@custom-variant dark (&:is(.dark *))` (globals.css:5) hace que las utilidades `dark:` apliquen a descendientes, no al elemento propio — el popup se comporta exactamente igual que el `<div>` del layout. Sin proveedor, el className del popup queda byte-idéntico.
- **Orden de `cn()` (foco 2).** Los 33 `<DialogContent>` del repo pasan como mucho `sm:max-w-{sm,md,2xl}`; ninguno colisiona con `dark`/`crm-shell` (que tailwind-merge no reconoce y deja pasar). El scope primero es correcto y no rompe ningún call-site.
- **Firma endurecida (foco 3).** Los 3 call-sites (`confirm-dialog.tsx:423`, `maintenance-toggle.tsx:53`, `plan-price-card.tsx:217`) pasan el scope. `bg-transparent` neutraliza `bg-primary` correctamente (`buttonVariants` mergea `className` al final vía `cn(buttonVariants({variant, size, className}))`), y `--danger` sí resuelve fuera de `.crm-shell` (`:root { --danger: var(--destructive) }`, globals.css:99) — el outline no queda sin borde en el panel.
- **`contrastRatioHex` (foco 4).** NO duplica matemática: reusa `parseHex` / `relativeLuminance` / `contrastRatio` existentes. El parseo cubre 3 y 6 dígitos, mayúsculas, con/sin `#` y con espacios.

**Lo que NO se sostiene:** la remediación de T-14-41 deja abierta la **misma inversión de señal** que fue a corregir, en el estado `:focus-visible` (CR-01). Además, las guardas de contraste que el plan presenta como red de seguridad miden un solo theme y una superficie que no es la que se renderiza, y varias de las aserciones "por lectura de fuentes" son más laxas de lo que su propio comentario declara (foco 5).

---

## Critical Issues

### CR-01: el outline de peligro pierde la señal en `:focus-visible` y vuelve a pintarse con la paleta del negocio

**File:** `components/crm/confirm-dialog.tsx:253` (interacción con `components/ui/button.tsx:7`)

**Issue:**
La rama sin shell devuelve `border-2 border-[var(--danger)] bg-transparent text-foreground hover:...`. La base de `buttonVariants` incluye:

```
focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50
```

tailwind-merge **no** elimina `focus-visible:border-ring`: pertenece al mismo grupo (`border-color`) pero con otro conjunto de modificadores, así que ambas clases sobreviven. En CSS, `.focus-visible\:border-ring:focus-visible` tiene especificidad (0,2,0) contra (0,1,0) de `.border-\[var\(--danger\)\]` → **al recibir foco de teclado, `border-color` pasa a `var(--ring)`**.

`--ring` es exactamente el token de la paleta del negocio que T-14-41 identificó como el problema: `[data-palette="green"] { --ring:#2f8a5b }`, `emerald` `#10b981`, `sage` `#7e9b82` (globals.css / themes.css). Como en la rama outline **el borde es la ÚNICA señal de peligro en reposo** (el texto es `--foreground` a propósito, y el fondo es transparente), el resultado es que un usuario de teclado que tabula hasta el confirmar de un borrado irreversible ve el botón enteramente en verde: borde verde + `ring-ring/50` verde. Es la señal invertida que §6.2 de `14-SECURITY.md` describe, solo que en el estado de foco.

Es alcanzable con un `Tab`: en los ConfirmDialog de nivel *simple* del panel (`app/(dashboard)/abonos/abonos-client.tsx:644` y `:668`, ambos `risk="alto" destructive` sin `confirmWord`) el orden de tabulación en el DOM es `Cancelar` → `confirmar`, así que el primer Tab dentro del diálogo aterriza en el botón destructivo. Lo mismo en `components/dashboard/canchas-manager.tsx:390` y `app/(dashboard)/settings/settings-client.tsx:2484`.

El test `outline del panel: no referencia --primary ni ninguna clase de paleta` (`confirm-dialog.test.tsx:197-205`) pasa porque inspecciona el string devuelto, no el elemento renderizado — la guarda queda derrotada en runtime por una clase que vive en `buttonVariants`.

**Fix:** reafirmar el borde (y el halo) en `focus-visible` desde la propia rama outline, sin nombrar el token de ningún shell:

```ts
// components/crm/confirm-dialog.tsx:253
return 'border-2 border-[var(--danger)] bg-transparent text-foreground ' +
  'focus-visible:border-[var(--danger)] focus-visible:ring-[var(--danger)]/40 ' +
  'hover:bg-[var(--danger)] hover:text-[var(--danger-foreground)]'
```

Y agregar la aserción que hoy falta (el string devuelto es lo único testeable en `environment: 'node'`):

```ts
it('outline del panel: el foco NO devuelve el borde a la paleta (--ring)', () => {
  const panelCls = confirmButtonClass(true, '')
  expect(panelCls).toMatch(/focus-visible:border-\[var\(--danger\)\]/)
  expect(panelCls).toMatch(/focus-visible:ring-\[var\(--danger\)\]/)
})
```

---

## Warnings

### WR-01: la guarda de contraste solo cubre el theme Forjo — los 3 themes alternativos no se miden

**File:** `components/crm/confirm-dialog.test.tsx:299-348`

**Issue:** El encabezado del bloque afirma: *"si alguien cambia `--destructive` o `--danger-foreground` por un color que baja de 4.5:1, esta suite se pone roja antes del deploy"*. La suite lee **solo `app/globals.css`** (línea 299) y solo los bloques `:root` y `.dark` (`BLOCK_HEAD`, líneas 303-306).

`app/themes.css` declara su propio `--destructive` (`modern` `#e5484d`:34, `spa` `#c0876b`:105, `cyber` `#ff2e7e`:173) y su propio `--danger-foreground` (:41, :109, :177). Ninguno de esos valores se mide. Peor: en esos themes `--popover` es `color-mix(in oklab, #ffffff 96%, var(--tint))` (:26, :97, :165), o sea **depende de `--tint`, que lo mueve la paleta del negocio** — la superficie contra la que se lee el borde cambia por negocio y no está congelada por ningún test. El residual conocido (`spa` claro en 2.72:1) es la prueba de que el riesgo es real, no teórico.

**Fix:** parametrizar `tokenIn()` por archivo y recorrer los 8 bloques (`:root`, `.dark`, y los 6 de themes.css), o —si medir `color-mix` es inviable en Node— acotar el comentario del test a lo que realmente cubre y dejar registrado en `14-SECURITY.md` que los themes alternativos quedan sin guarda automática. Hoy el comentario promete una cobertura que no existe.

### WR-02: los tests de contraste miden `--popover`, pero el botón no se renderiza sobre `--popover`

**File:** `components/crm/confirm-dialog.test.tsx:321-348`

**Issue:** El confirmar vive dentro de `<DialogFooter>`, que aplica `bg-muted/50` sobre el popup (`components/ui/dialog.tsx:118`). El fondo efectivo detrás del label y del borde es `color-mix(--muted 50%, --popover)`, no `--popover`. Los tres tests miden contra `--popover` puro, así que el par medido no es el par renderizado — el borde (que es la señal de peligro y el valor más ajustado, ya en 2.72:1 en spa claro) se está evaluando contra una superficie optimista.

En el tema Forjo la diferencia es marginal (los neutrales son cercanos), pero la guarda pierde precisión justo donde menos margen hay.

**Fix:** medir contra el blend real. Sin motor de CSS en Node, la aproximación honesta es componer los dos hex al 50% antes de pasar el resultado a `contrastRatioHex()` y documentarlo:

```ts
/** Mezcla lineal 50/50 de dos hex — aproxima el `bg-muted/50` del DialogFooter sobre el popup. */
function blend50(a: string, b: string): string { /* … */ }
const surface = blend50(tokenIn(':root','muted'), tokenIn(':root','popover'))
```

### WR-03: la prueba anti-fuga verifica un solo archivo, no el invariante "un solo lugar de montaje"

**File:** `test/shell-scope.test.ts:112-117`

**Issue:** El invariante declarado es que el dashboard, el booking público y el landing no heredan nada del CRM y que `ShellScopeProvider` se monta en un único lugar. El test solo comprueba `app/(dashboard)/layout.tsx`. Montar el proveedor en `app/[slug]/layout.tsx`, en `app/layout.tsx`, en un componente compartido (`components/dashboard/*`) o en cualquier `*-client.tsx` pasa sin un solo test rojo, y basta con eso para que todos los diálogos de esa superficie tomen el chrome del super-admin (T-14-32 exacto).

**Fix:** afirmar la unicidad, no la ausencia puntual. Con `node:fs` (mismo mecanismo del repo, sin deps nuevas):

```ts
it('ShellScopeProvider se MONTA en un solo archivo: app/(crm)/layout.tsx', () => {
  const mounts = walk(process.cwd())               // .ts/.tsx, excluye node_modules/.next/test
    .filter(f => readFileSync(f,'utf8').includes('<ShellScopeProvider'))
    .map(f => relative(process.cwd(), f).replace(/\\/g,'/'))
  expect(mounts).toEqual(['app/(crm)/layout.tsx'])
})
```

### WR-04: la aserción "el scope se aplica sobre el POPUP" es demasiado laxa para atrapar su propia regresión

**File:** `test/shell-scope.test.ts:72-86`

**Issue:** La comprobación real es `dialog.lastIndexOf('portalScopeClass(') > dialog.indexOf('data-slot="dialog-content"')`. Todo lo que hay después de ese marcador en el archivo satisface la condición: `DialogHeader` (:96), `DialogFooter` (:106), `DialogTitle` (:133), `DialogDescription` (:146). Mover el scope del `className` del Popup al del `DialogTitle` —la regresión sutil más plausible, porque "se sigue viendo distinto"— deja la suite **verde** mientras el popup pierde los tokens.

Segundo agujero: `lastIndexOf` sobre un string. Un comentario futuro que mencione `portalScopeClass(...)` ubicado después de la línea 68 (algo que ya ocurre en `confirm-dialog.tsx:216`) haría pasar el test de forma vacua aunque el cableado se hubiera borrado.

**Fix:** acotar la búsqueda al bloque del Popup y exigir que esté dentro de su `cn()`:

```ts
const popupBlock = dialog.slice(popupAt, dialog.indexOf('{...props}', popupAt))
expect(popupBlock).toMatch(/className=\{cn\(\s*portalScopeClass\(\w+\)/)
```

### WR-05: el proveedor alcanza a `/admin/negocios/[id]/ver`, la sub-página que deliberadamente escapa del shell

**File:** `app/(crm)/layout.tsx:60` (afecta a `app/(crm)/admin/negocios/[id]/ver/page.tsx:64`)

**Issue:** `ShellScopeProvider` envuelve **todo** el route group `(crm)`, incluida la vista de impersonación, que existe justamente para mostrar la superficie **del cliente** y por eso re-declara los neutrales light en `.impersonation-view` (globals.css:295-316, D-12 / Pitfall 4). Cualquier `<Dialog>` que se agregue a esa página va a portalear un popup con `dark crm-shell` — dark, acento amarillo y `--danger` = rojo CRM — encima de una vista deliberadamente light y con la paleta del negocio impersonado, contradiciendo D-12.

Hoy es **latente**: `impersonation-view.tsx` (274 líneas) no monta ningún Dialog/Drawer/Select. Pero el escape del shell es un patrón ya documentado en este repo, y no hay nada —ni test ni tipo— que impida reabrir el defecto.

**Fix:** o bien mover el proveedor de `layout.tsx` a un wrapper que la ruta `/ver` pueda anular (`<ShellScopeProvider scope="">` alrededor de `.impersonation-view`), o dejar registrada la restricción con un test que falle si esa página incorpora una superficie portaleada:

```ts
it('la vista de impersonación no monta superficies portaleadas (heredarían el shell del CRM, D-12)', () => {
  const v = read(join('app','(crm)','admin','negocios','[id]','ver','impersonation-view.tsx'))
  expect(v).not.toMatch(/<(Dialog|Drawer|Select|Popover)\b/)
})
```

### WR-06: `handleConfirm` trata "el guard descartó el submit" como éxito y cierra el diálogo con la acción en vuelo

**File:** `components/crm/confirm-dialog.tsx:324-340` (con `buildSubmitGuard`, :148-166)

**Issue:** `buildSubmitGuard` devuelve una promesa **resuelta sin llamar a `onConfirm`** cuando `getLoading()` ya es `true` (:158). `handleConfirm` no distingue ese caso del éxito real: sigue derecho a `setTyped(''); setReason(''); onOpenChange(false)`. Nótese que llama a **`onOpenChange` (la prop) y no a `handleOpenChange`**, así que también **saltea el guard de "no cerrable mientras corre"** (:299). Resultado: el diálogo se cierra mientras la primera escritura sigue en vuelo, el caller desmonta el modal y un fallo posterior no tiene dónde mostrarse.

Alcanzabilidad honesta: baja por dos gates (`state.canConfirm` es false una vez que re-renderiza con `loading=true`, y el `<Button>` queda `disabled`). Requiere dos disparos dentro del mismo tick antes del re-render (Enter repetido / disparo programático). Aun así es un defecto de lógica en el camino que el propio guard existe para cubrir, y el arreglo es de una línea.

**Fix:** que el guard informe si corrió, y cerrar solo entonces:

```ts
// buildSubmitGuard
return async (reason?: string): Promise<boolean> => {
  if (getLoading()) return false     // descartado, NO es éxito
  setLoading(true)
  try { await onConfirm(reason); return true } finally { setLoading(false) }
}

// handleConfirm
const ran = await submit(requireReason ? reason : undefined)
if (!ran) return
setTyped(''); setReason(''); onOpenChange(false)
```

### WR-07: las regex de cableado rompen con reformateos inocuos (falso rojo)

**File:** `components/crm/confirm-dialog.test.tsx:244, 251, 258, 264`

**Issue:** Dos patrones frágiles, ambos con `[^)]*`, que **no tolera un `)` en los argumentos**:

1. `/className=\{confirmButtonClass\([^)]*\bshellScope\b[^)]*\)\}/` — se rompe con una edición legítima como `confirmButtonClass(Boolean(x), shellScope)` o `confirmButtonClass(isDestructive(t), shellScope)`, aunque el cableado sea correcto.
2. `/export function confirmButtonClass\([^)]*shellScope:\s*string\s*\)/` (:264) — exige que `shellScope: string` sea el **último** parámetro y que `)` lo siga inmediatamente. Un formateo multilínea con **trailing comma** (`shellScope: string,\n): string {`, que es la salida por defecto de Prettier 3) o el agregado de un tercer parámetro ponen la suite en rojo sin que el invariante se haya violado. El repo no tiene Prettier hoy, pero la regla no depende de eso.

Y un patrón con riesgo de **falso verde**: `/\/\/.*$/gm` (:279) solo quita comentarios de línea; convertir una nota interna a `/* … */` reintroduciría `bg-primary` en el texto inspeccionado y volvería rojo un helper correcto (falso rojo), mientras que cualquier `bg-primary` colocado dentro de un bloque `/* */` no sería detectado si la aserción fuera la inversa.

**Fix:** reemplazar `[^)]*` por un match no ambiguo del bloque (p. ej. acotar por índices como hace `test/shell-scope.test.ts`) y, para la firma, afirmar sobre el orden relativo en vez de la forma exacta:

```ts
const sig = dialogSrc.slice(
  dialogSrc.indexOf('export function confirmButtonClass'),
  dialogSrc.indexOf('{', dialogSrc.indexOf('export function confirmButtonClass'))
)
expect(sig).toMatch(/shellScope\s*:\s*string/)   // requerido
expect(sig).not.toMatch(/shellScope\s*\?/)       // no opcional
```

### WR-08: `secondaryAction.onClick` documenta un contrato de retorno que el componente descarta

**File:** `components/crm/confirm-dialog.tsx:73` (tipo) y `:397-421` (uso)

**Issue:** El tipo es `onClick: () => boolean | void | Promise<boolean | void>` y el JSDoc afirma: *"El caller puede devolver `false` para decir 'falló, no cierres'"*. En el handler (`:407`) el resultado se descarta (`await secondaryAction.onClick()` sin asignar) y el diálogo **nunca cierra** tras la acción secundaria en ningún caso, así que devolver `true` o `false` es indistinguible. Un caller que confíe en el JSDoc va a asumir un control de cierre que no existe.

**Fix:** o se implementa (`const ok = await secondaryAction.onClick(); if (ok !== false) onOpenChange(false)`) o se simplifica el tipo a `() => void | Promise<void>` y se corrige el comentario para decir que cerrar es siempre decisión del caller.

---

## Info

### IN-01: `plan-price-card` computa un scope que no puede afectar el resultado, y el test que lo "protege" no cubre el riesgo que declara

**File:** `components/crm/plan-price-card.tsx:66, 217`; test en `confirm-dialog.test.tsx:254-259`

`confirmButtonClass(false, shellScope)` devuelve `''` por el early return de `:246` — `shellScope` es literalmente inalcanzable en esa llamada, así que `useShellScope()` es cómputo muerto hoy. El test lo justifica diciendo que previene *"el día que esa acción cambie de signo"*, pero ese cambio es `false` → `true`, algo que la aserción del scope no observa. La red de seguridad real sería medir el argumento destructivo, no el de scope.

### IN-02: `contrastRatioHex` es un export de producción consumido solo por tests

**File:** `lib/contrast.ts:71`

Grep sobre el repo: los únicos consumidores son `lib/contrast.test.ts` y `components/crm/confirm-dialog.test.tsx`. Es una decisión defendible (la alternativa —duplicar la matemática en el test— es peor), pero conviene que el JSDoc lo diga explícitamente para que un análisis de exports muertos no lo elimine.

### IN-03: `onAccentText` no reusa el export nuevo y recalcula luminancias constantes

**File:** `lib/contrast.ts:84-93`

`onAccentText` sigue llamando `relativeLuminance([255,255,255])` y `relativeLuminance([26,23,20])` en cada invocación en vez de apoyarse en `contrastRatioHex(hex, WHITE)` / `contrastRatioHex(hex, NEAR_BLACK)`, que es la misma comparación ya expresada en términos del nuevo export. Además, las constantes `WHITE`/`NEAR_BLACK` (:18-19) se declaran pero solo se usan como valores de retorno, no como entrada del cálculo — si alguien cambiara `NEAR_BLACK` el cálculo seguiría usando `[26,23,20]` hardcodeado y el helper devolvería un color distinto del que midió.

### IN-04: `tokenIn()` acepta hex de 4 y 8 dígitos que `parseHex` rechaza → fallo con mensaje confuso

**File:** `components/crm/confirm-dialog.test.tsx:315, 332-348`

La regex de extracción es `#[0-9a-fA-F]{3,8}`, pero `parseHex` (`lib/contrast.ts:22-41`) solo soporta 3 y 6 dígitos. Si un token pasara a `#rrggbbaa` (forma válida en CSS), `contrastRatioHex` devolvería `null` y las aserciones `claro!`/`oscuro!` de los tests *hover* y *borde* fallarían con "received value must be a number" en vez de un diagnóstico útil — el test de *reposo* (:326-327) sí tiene el `expect(...).not.toBeNull()` que a los otros dos les falta. Alinear la regex a `{3}|{6}` o replicar el guard en los tres tests.

### IN-05: referencias de línea obsoletas en los comentarios

**File:** `components/crm/confirm-dialog.test.tsx:223, 242`

Los comentarios citan `confirm-dialog.tsx:383` como el call-site del helper; hoy es la línea **423**. Como la prosa de este repo es densa y deliberada, una cita numérica que ya no apunta a nada erosiona su valor. Referenciar el símbolo (`el <Button> de confirmar del footer`) en vez del número.

### IN-06: el confirmar destructivo del panel queda con 2px de borde contra 1px de sus hermanos

**File:** `components/crm/confirm-dialog.tsx:253`

`buttonVariants` da `border border-transparent` (1px) a todos los botones; la rama outline sube a `border-2`. En el footer, "Cancelar" (`variant="outline"`, 1px) y el confirmar (2px) quedan con pesos de borde distintos y —por `box-sizing: border-box`— con 1px menos de área de contenido a cada lado. Es intencional como refuerzo de la señal, pero rompe la consistencia de hermanos que el proyecto trata como load-bearing. Vale confirmarlo en la UAT visual o bajar a `border` reforzando el color.

---

_Reviewed: 2026-08-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Cluster: A — scope de shell, diálogos del CRM y remediación de T-14-41_
