// Tests del patrón de doble confirmación (FND-03).
//
// NOTA de entorno (deviación documentada del PLAN 01-04, Rule 3):
// el plan asumía Testing Library + un environment con DOM ("Vitest + Testing Library, ya
// disponible en el repo"). NO lo está: no hay @testing-library/* ni jsdom/happy-dom en
// node_modules, y la restricción del milestone es CERO paquetes npm nuevos (§7, threat T-01-SC).
// El vitest.config corre `environment: 'node'` (no renderiza JSX — ver su comentario).
//
// Resolución sin nuevas deps: la lógica de gating del ConfirmDialog (qué habilita el botón,
// el anti doble-submit, qué palabra/motivo se exige) vive en helpers PUROS exportados desde
// el mismo módulo (`computeConfirmState`, `buildSubmitGuard`). El componente React los consume.
// Acá testeamos esos helpers en el entorno `node` — cubren los 6 comportamientos del bloque
// <behavior> del plan sin necesitar DOM. El render (clases, base-ui Dialog) se valida por
// `npx tsc --noEmit` + `npm run lint` + revisión visual en Phases 2-3 que consumen el dialog.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeConfirmState, buildSubmitGuard, confirmButtonClass, computeFooterLayout } from './confirm-dialog'
import { CRM_SHELL_CLASS } from '@/lib/shell-scope'
import { contrastRatioHex } from '@/lib/contrast'
import { cn } from '@/lib/utils'

describe('ConfirmDialog — gating de confirmación (FND-03)', () => {
  // Test 1 (simple, confirmWord undefined): botón habilitado de entrada.
  it('simple: sin confirmWord ni requireReason, canConfirm es true de entrada', () => {
    const s = computeConfirmState({ typed: '', reason: '', loading: false })
    expect(s.canConfirm).toBe(true)
    expect(s.wordOk).toBe(true)
    expect(s.reasonOk).toBe(true)
    expect(s.wordMismatch).toBe(false)
  })

  // Test 2 (type-word): disabled hasta match exacto case-sensitive.
  it('type-word: SUSPENDER habilita solo con match exacto; "suspender" NO habilita', () => {
    const empty = computeConfirmState({ confirmWord: 'SUSPENDER', typed: '', reason: '', loading: false })
    expect(empty.canConfirm).toBe(false)

    const lower = computeConfirmState({ confirmWord: 'SUSPENDER', typed: 'suspender', reason: '', loading: false })
    expect(lower.wordOk).toBe(false)
    expect(lower.canConfirm).toBe(false)

    const exact = computeConfirmState({ confirmWord: 'SUSPENDER', typed: 'SUSPENDER', reason: '', loading: false })
    expect(exact.wordOk).toBe(true)
    expect(exact.canConfirm).toBe(true)
  })

  // Test 3 (word-mismatch): texto distinto ⇒ helper visible + sigue disabled.
  it('word-mismatch: con texto ≠ palabra, wordMismatch true y helper presente', () => {
    const s = computeConfirmState({ confirmWord: 'VER', typed: 'XX', reason: '', loading: false })
    expect(s.wordMismatch).toBe(true)
    expect(s.canConfirm).toBe(false)
    expect(s.wordHelper).toBe('Escribí "VER" para confirmar')
    // input vacío NO es mismatch (es estado neutral default), pero tampoco habilita
    const emptyNeutral = computeConfirmState({ confirmWord: 'VER', typed: '', reason: '', loading: false })
    expect(emptyNeutral.wordMismatch).toBe(false)
    expect(emptyNeutral.canConfirm).toBe(false)
  })

  // Test 4 (requireReason): aunque la palabra coincida, disabled hasta motivo no vacío.
  it('requireReason: con palabra OK pero motivo vacío sigue disabled; helper de motivo', () => {
    const reasonEmpty = computeConfirmState({ confirmWord: 'VER', requireReason: true, typed: 'VER', reason: '   ', loading: false })
    expect(reasonEmpty.wordOk).toBe(true)
    expect(reasonEmpty.reasonOk).toBe(false)
    expect(reasonEmpty.canConfirm).toBe(false)
    expect(reasonEmpty.reasonHelper).toBe('El motivo es obligatorio')

    const reasonOk = computeConfirmState({ confirmWord: 'VER', requireReason: true, typed: 'VER', reason: 'soporte: revisar config', loading: false })
    expect(reasonOk.reasonOk).toBe(true)
    expect(reasonOk.canConfirm).toBe(true)
    expect(reasonOk.reasonHelper).toBeUndefined()
  })

  // Test 4b (#3 minReasonLength aditivo): sin la prop el comportamiento no cambia (motivo 'a'
  // habilita); con minReasonLength=10 un motivo de 3 chars NO habilita y de 10 sí, con helper inline.
  it('minReasonLength: aditivo — sin prop "a" habilita; con 10 exige >=10 chars con helper', () => {
    // sin la prop: comportamiento idéntico al actual (no vacío basta).
    const sinProp = computeConfirmState({ confirmWord: 'VER', requireReason: true, typed: 'VER', reason: 'a', loading: false })
    expect(sinProp.reasonOk).toBe(true)
    expect(sinProp.canConfirm).toBe(true)
    expect(sinProp.reasonHelper).toBeUndefined()

    // con minReasonLength=10: 3 chars NO habilita y muestra el helper de largo mínimo.
    const corto = computeConfirmState({ confirmWord: 'VER', requireReason: true, minReasonLength: 10, typed: 'VER', reason: 'abc', loading: false })
    expect(corto.reasonOk).toBe(false)
    expect(corto.canConfirm).toBe(false)
    expect(corto.reasonHelper).toBe('El motivo debe tener al menos 10 caracteres')

    // motivo vacío con minReasonLength=10 → sigue el helper de "obligatorio" (no el de largo).
    const vacio = computeConfirmState({ confirmWord: 'VER', requireReason: true, minReasonLength: 10, typed: 'VER', reason: '   ', loading: false })
    expect(vacio.reasonOk).toBe(false)
    expect(vacio.reasonHelper).toBe('El motivo es obligatorio')

    // 10 chars exactos → habilita y sin helper.
    const ok = computeConfirmState({ confirmWord: 'VER', requireReason: true, minReasonLength: 10, typed: 'VER', reason: '1234567890', loading: false })
    expect(ok.reasonOk).toBe(true)
    expect(ok.canConfirm).toBe(true)
    expect(ok.reasonHelper).toBeUndefined()
  })

  // Test 5 (loading): durante loading no se puede confirmar (anti doble-submit) y el guard
  // sólo dispara onConfirm una vez.
  it('loading: canConfirm false durante loading; el submit guard previene doble disparo', async () => {
    const loadingState = computeConfirmState({ typed: '', reason: '', loading: true })
    expect(loadingState.canConfirm).toBe(false)

    const onConfirm = vi.fn().mockResolvedValue(undefined)
    let loading = false
    const guard = buildSubmitGuard({
      getLoading: () => loading,
      setLoading: (v) => { loading = v },
      onConfirm,
    })
    // dos clicks "simultáneos": el segundo entra mientras loading=true
    const first = guard('motivo')
    const second = guard('motivo')
    const [ranFirst, ranSecond] = await Promise.all([first, second])
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('motivo')
    // WR-A6: el descarte tiene que ser DISTINGUIBLE del éxito. Con `void` los dos eran una promesa
    // resuelta, así que handleConfirm cerraba el dialog con la primera escritura todavía en vuelo.
    expect(ranFirst).toBe(true)
    expect(ranSecond).toBe(false)
    // tras resolver, loading vuelve a false (dialog queda usable / cerrable por el caller)
    expect(loading).toBe(false)
  })

  // Test 5b: si onConfirm rechaza, el guard resetea loading (dialog NO se cierra → estado ready).
  it('loading→error: si onConfirm rechaza, loading vuelve a false y el error se propaga', async () => {
    const err = new Error('boom')
    const onConfirm = vi.fn().mockRejectedValue(err)
    let loading = false
    const guard = buildSubmitGuard({
      getLoading: () => loading,
      setLoading: (v) => { loading = v },
      onConfirm,
    })
    await expect(guard()).rejects.toThrow('boom')
    expect(loading).toBe(false)
  })

  // Test 7 (13-03, footer aditivo): computeFooterLayout decide qué botones muestra el footer.
  // Sin props nuevas el footer es exactamente el de hoy ([Cancelar] [confirmLabel]) → cero
  // regresión para los ~10 call-sites existentes.
  it('footer: sin props nuevas muestra confirmar y NO muestra secundario', () => {
    expect(computeFooterLayout({})).toEqual({ showConfirm: true, showSecondary: false, secondaryVariant: 'outline' })
  })

  it('footer: con secundario y confirmar visible, el secundario es outline (confirmar manda)', () => {
    expect(computeFooterLayout({ hasSecondary: true })).toEqual({ showConfirm: true, showSecondary: true, secondaryVariant: 'outline' })
  })

  it('footer: sin confirmar, el secundario pasa a ser el primario visual (default)', () => {
    expect(computeFooterLayout({ hideConfirm: true, hasSecondary: true })).toEqual({ showConfirm: false, showSecondary: true, secondaryVariant: 'default' })
  })

  it('footer: sin confirmar y sin secundario, queda solo "Cancelar" (estado verificando…)', () => {
    expect(computeFooterLayout({ hideConfirm: true })).toEqual({ showConfirm: false, showSecondary: false, secondaryVariant: 'outline' })
  })

  // Test 6 (destructive, DENTRO de un shell): el helper referencia la superficie de peligro compartida
  // (--danger), NUNCA el token de un shell puntual. Regresión del gap 13-05 #1: con --crm-danger
  // directo el botón se quedaba sin fondo fuera de .crm-shell (o sea, en el dashboard).
  it('destructive dentro de un shell: la clase usa --danger (no el token de un shell puntual)', () => {
    const dangerCls = confirmButtonClass(true, CRM_SHELL_CLASS)
    expect(dangerCls).toMatch(/var\(--danger\)/)
    expect(dangerCls).toMatch(/var\(--danger-foreground\)/)
    // Invariante D-07: un componente compartido no nombra el token propio de ningún shell.
    expect(dangerCls).not.toMatch(/crm-danger/)
    expect(dangerCls).not.toMatch(/destructive/)

    // No destructivo dentro del shell ⇒ el primario del shell, que ya trae <Button>.
    expect(confirmButtonClass(false, CRM_SHELL_CLASS)).toBe('')
  })

  // Test 6b (destructive FUERA de un shell = el panel del dueño, UAT 14-09 punto 3 + T-14-41): el
  // confirmar destructivo pasa a OUTLINE de peligro. El dueño arbitró que en su panel el botón no
  // comparta el relleno rojo con el chip "Alto" del RiskBadge; el CRM conserva el relleno (test 6).
  // Lo que NO puede pasar es que caiga al `bg-primary` del variant default: --primary es la paleta
  // del NEGOCIO, así que con `green`/`emerald`/`sage` un borrado irreversible se pintaba VERDE.
  it('destructive fuera de un shell: outline de peligro, NUNCA el primario de la paleta', () => {
    const panelCls = confirmButtonClass(true, '')
    // Outline: borde de peligro + fondo transparente (lo que neutraliza el bg-primary del default).
    expect(panelCls).toMatch(/border-\[var\(--danger\)\]/)
    expect(panelCls).toMatch(/bg-transparent/)
    // Se rellena en hover con el par que cada theme declara como AA.
    expect(panelCls).toMatch(/hover:bg-\[var\(--danger\)\]/)
    expect(panelCls).toMatch(/hover:text-\[var\(--danger-foreground\)\]/)
    // Invariante D-07: sigue sin nombrar el token de ningún shell puntual.
    expect(panelCls).not.toMatch(/crm-danger/)
    expect(panelCls).not.toMatch(/destructive/)
    // Las dos formas de "no hay shell" dan el MISMO resultado (el default del contexto es '').
    expect(confirmButtonClass(true, '   ')).toBe(panelCls)
    expect(confirmButtonClass(undefined, '')).toBe('')
    // No destructivo ⇒ el primario del tema, como siempre (dentro y fuera del shell).
    expect(confirmButtonClass(false, '')).toBe('')
  })

  // T-14-41, hallazgo (1): la aserción anti-regresión DIRECTA. El worst case que el audit encontró es
  // que la rama sin shell termine pintada con la paleta del negocio. Cualquier reintroducción de
  // --primary (o de una clase de paleta) en esta rama pone la suite en rojo.
  it('outline del panel: no referencia --primary ni ninguna clase de paleta (T-14-41)', () => {
    const panelCls = confirmButtonClass(true, '')
    expect(panelCls).not.toMatch(/primary/)
    expect(panelCls).not.toMatch(/accent/)
    // Los nombres de paleta de globals.css/themes.css no tienen por qué aparecer nunca acá.
    expect(panelCls).not.toMatch(/\b(red|green|blue|yellow|ink|emerald|sage|cyber|indigo|violet|rose|amber|mauve|clay|ocean|lavender|cyan|magenta|lime|purple)\b/)
    // Y la señal de peligro tiene que seguir presente: outline sin --danger no es un outline de peligro.
    expect(panelCls).toMatch(/var\(--danger\)/)
  })

  // CR-01 (code review de la fase, cluster A). El test de arriba mira el REPOSO y por eso no vio el
  // agujero: la base de buttonVariants trae `focus-visible:border-ring focus-visible:ring-ring/50`,
  // que tailwind-merge NO elimina (mismo grupo, otro modificador) y que en CSS gana por
  // especificidad (0,2,0 vs 0,1,0). Como en la rama outline el BORDE es la única señal de peligro en
  // reposo, al tabular el botón volvía a pintarse con --ring = la paleta del negocio. La rama tiene
  // que declarar su PROPIO estado de foco, no solo el de reposo.
  it('outline del panel: el foco NO devuelve el borde a la paleta (--ring) — CR-01', () => {
    const panelCls = confirmButtonClass(true, '')
    expect(panelCls).toMatch(/focus-visible:border-\[var\(--danger\)\]/)
    expect(panelCls).toMatch(/focus-visible:ring-\[var\(--danger\)\]/)
    // Sigue sin nombrar el token de ningún shell ni la paleta (D-07 + T-14-41).
    expect(panelCls).not.toMatch(/focus-visible:[a-z-]*-ring\b/)
    expect(panelCls).not.toMatch(/crm-danger/)
  })

  // WR-06: el hover también sale del token. Cablearlo como un mix con negro asumía que la superficie
  // de peligro siempre es oscura y el texto claro; en dark es al revés y oscurecerla tiraba el
  // contraste a 3.82:1. La dirección la sabe el theme, no el componente. Sigue valiendo para el caso
  // del shell, que es el único que pinta la superficie de peligro.
  it('destructive dentro de un shell: el hover referencia --danger-hover y NO calcula el color', () => {
    const dangerCls = confirmButtonClass(true, CRM_SHELL_CLASS)
    expect(dangerCls).toMatch(/hover:bg-\[var\(--danger-hover\)\]/)
    expect(dangerCls).not.toMatch(/color-mix/)
    expect(dangerCls).not.toMatch(/black_10%/)
  })
})

// ── Cableado (lectura de fuentes) — T-14-41, hallazgo 3 ──────────────────────────────────────────
// El contrato de arriba puede estar VERDE con el helper desconectado: el audit lo midió
// (`grep -c readFileSync components/crm/confirm-dialog.test.tsx` → 0) y comprobó que borrar
// `shellScope` de confirm-dialog.tsx:383 dejaba los 26 tests en verde mientras los 10 ConfirmDialog
// del CRM perdían su superficie de peligro. Con la firma requerida (sub-fix 2) el borrado ahora
// además rompe `tsc`, pero eso solo cubre el ARGUMENTO FALTANTE: pasar `''` a mano, o cablear el
// helper en un botón que no es el de confirmar, sigue compilando. Estas aserciones cubren eso.
//
// El entorno de Vitest de este repo es `node` (vitest.config.mts): sin DOM, sin Testing Library y
// con el milestone prohibiendo paquetes nuevos, el cableado no se puede probar renderizando. Se
// afirma leyendo el código fuente — MISMO mecanismo y mismo molde que el describe de cableado de
// test/shell-scope.test.ts:61-118, que es el precedente del repo para este mismo tipo de defecto.
// Va en ESTE archivo y no en shell-scope.test.ts porque el sujeto es confirmButtonClass y sus
// call-sites (shell-scope.test.ts cubre el otro mecanismo: el scope del popup portaleado).
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/**
 * Texto de los argumentos (o de los parámetros) de la primera `marker` de `src`, BALANCEANDO
 * paréntesis. `marker` tiene que terminar en `(`.
 *
 * Por qué existe (WR-A7): antes esto se hacía con `[^)]*`, que corta en el primer `)` — o sea que un
 * reformateo legítimo como `confirmButtonClass(Boolean(x), shellScope)` ponía la suite en ROJO sin
 * que el invariante se hubiera violado, y una firma multilínea con trailing comma (la salida por
 * defecto de Prettier 3) hacía lo mismo. El balanceo tolera el formato sin perder poder de detección:
 * lo que se afirma sigue siendo que el argumento/parámetro está DENTRO de esa llamada puntual.
 *
 * Limitación conocida y aceptada: un `)` dentro de un string literal en los argumentos descuadraría
 * el conteo. Ninguno de los tres call-sites pasa strings, y el molde es de test, no de producción.
 */
function callArgs(src: string, marker: string): string | null {
  const at = src.indexOf(marker)
  if (at === -1) return null
  const open = at + marker.length - 1 // índice del '(' del marker
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return null
}

describe('cableado de confirmButtonClass (regresión de T-14-41, §6.2 de 14-SECURITY.md)', () => {
  const dialogSrc = read(join('components', 'crm', 'confirm-dialog.tsx'))
  const toggleSrc = read(join('components', 'crm', 'maintenance-toggle.tsx'))
  const priceCardSrc = read(join('components', 'crm', 'plan-price-card.tsx'))

  /** El scope tiene que llegar al className del confirmar, sea cual sea el formato de la llamada. */
  const scopeLlegaAlClassName = (src: string, archivo: string) => {
    expect(src).toMatch(/const\s+shellScope\s*=\s*useShellScope\(\)/)
    const args = callArgs(src, 'className={confirmButtonClass(')
    expect(args, `${archivo}: el className del confirmar no llama a confirmButtonClass(...)`).not.toBeNull()
    expect(args!).toMatch(/\bshellScope\b/)
  }

  it('ConfirmDialog lee el scope del shell activo y se lo pasa al className del confirmar', () => {
    // Previene la regresión EXACTA que midió el audit: que alguien borre `shellScope` del call-site
    // del <Button> de confirmar del footer y los 10 ConfirmDialog del CRM se queden sin --danger sin
    // un solo test rojo.
    scopeLlegaAlClassName(dialogSrc, 'confirm-dialog.tsx')
  })

  it('MaintenanceToggle lee el scope del shell activo y se lo pasa al className de su botón', () => {
    // Previene lo mismo en el otro call-site vivo: este toggle vive dentro del shell del super-admin
    // y su botón es el kill switch de toda la app — perder la superficie de peligro ahí importa.
    scopeLlegaAlClassName(toggleSrc, 'maintenance-toggle.tsx')
  })

  it('PlanPriceCard también pasa el scope (era el call-site latente del audit)', () => {
    // Previene volver a `confirmButtonClass(false)` sin scope: hoy es inocuo porque no es destructivo,
    // pero deja armado el defecto para el día que esa acción cambie de signo.
    scopeLlegaAlClassName(priceCardSrc, 'plan-price-card.tsx')
  })

  it('la firma declara shellScope REQUERIDO (no `shellScope?`)', () => {
    // Previene volver al fail-silent: con el parámetro opcional, un call-site nuevo que lo olvide
    // compila sin diagnóstico y degrada distinto según el shell (correcto en el panel, roto en el CRM).
    // Se afirma sobre el BLOQUE de parámetros, no sobre su forma exacta (WR-A7): un tercer parámetro
    // o una firma multilínea con trailing comma son ediciones legítimas que no violan el invariante.
    const params = callArgs(dialogSrc, 'export function confirmButtonClass(')
    expect(params, 'no se encontró la firma de confirmButtonClass').not.toBeNull()
    expect(params!).toMatch(/shellScope\s*:\s*string/)
    expect(params!).not.toMatch(/shellScope\s*\?/)
  })

  it('handleConfirm usa el retorno del guard y cierra por handleOpenChange (WR-A6)', () => {
    // El componente no se puede renderizar (environment node), pero el defecto es de FLUJO y se lee:
    // (1) si el retorno de submit() se descarta, el descarte del guard se trata como éxito;
    // (2) si el cierre va por onOpenChange directo, se saltea el guard de "no cerrable mientras
    //     corre" y el dialog se puede cerrar con una acción en vuelo.
    const start = dialogSrc.indexOf('async function handleConfirm')
    expect(start).toBeGreaterThan(-1)
    const body = dialogSrc.slice(start, dialogSrc.indexOf('\n  }', start))
    expect(body).toMatch(/(const|let)\s+\w+\s*=\s*await\s+submit\(/)
    expect(body).toMatch(/if\s*\(\s*!\w+\s*\)\s*return/)
    expect(body).toMatch(/handleOpenChange\(false\)/)
    expect(body).not.toMatch(/\bonOpenChange\(/)
  })

  it('mergeado con la BASE de <Button>, el outline no conserva una sola clase de --ring (CR-01)', () => {
    // Esta es la aserción de ESTADO FINAL, no de intención: reproduce lo que hace <Button>
    // (`cn(buttonVariants({ variant, size, className }))`) y comprueba el string que termina en el
    // DOM. La aserción del helper mira lo que el componente pide; esta mira lo que tailwind-merge
    // efectivamente deja. Sin los `focus-visible:*` de la rama outline, `focus-visible:border-ring`
    // y `focus-visible:ring-ring/50` SOBREVIVEN al merge (medido) y repintan el botón con la paleta
    // del negocio al recibir foco de teclado.
    const buttonSrc = read(join('components', 'ui', 'button.tsx'))
    const base = buttonSrc.match(/cva\(\s*"([^"]*)"/)?.[1]
    expect(base, 'no se pudo leer la base de buttonVariants en components/ui/button.tsx').toBeTruthy()
    // El variant `default` es el que aplica: el confirmar no pasa `variant`, así que trae bg-primary.
    const variantDefault = buttonSrc.match(/default:\s*"([^"]*bg-primary[^"]*)"/)?.[1]
    expect(variantDefault, 'no se pudo leer el variant default de buttonVariants').toBeTruthy()

    const merged = cn(base!, variantDefault!, confirmButtonClass(true, ''))
    expect(merged).not.toMatch(/focus-visible:border-ring\b/)
    expect(merged).not.toMatch(/focus-visible:ring-ring\b/)
    expect(merged).toMatch(/focus-visible:border-\[var\(--danger\)\]/)
    expect(merged).toMatch(/focus-visible:ring-\[var\(--danger\)\]/)
    // El ANCHO del halo sí se conserva (otro grupo): sin ring-3 no habría halo que colorear.
    expect(merged).toMatch(/focus-visible:ring-3\b/)
    // Y el bg-primary del variant default sigue neutralizado (lo que ya cubría T-14-41).
    expect(merged).not.toMatch(/\bbg-primary\b/)
  })

  it('la rama SIN shell del helper no nombra --primary ni ninguna clase de paleta', () => {
    // ESTA es la aserción anti-regresión directa de T-14-41: se lee el cuerpo del helper (no solo su
    // salida) para que reintroducir un `bg-primary` en la rama del panel no pueda pasar el review.
    // Con --primary, en un negocio con paleta green/emerald/sage un borrado irreversible se pintaba
    // VERDE — el color semántico de éxito sobre la acción más destructiva del panel.
    const bodyStart = dialogSrc.indexOf('export function confirmButtonClass')
    expect(bodyStart).toBeGreaterThan(-1)
    // Se sacan los comentarios: la aserción es sobre las clases que el helper DEVUELVE, no sobre la
    // prosa que las explica (el propio comentario nombra `bg-primary` para decir por qué NO se usa).
    // Se sacan los DOS estilos (WR-A7): con solo `//`, convertir una nota interna a bloque `/* */`
    // reintroducía la palabra en el texto inspeccionado y ponía en rojo un helper correcto.
    const body = dialogSrc
      .slice(bodyStart, dialogSrc.indexOf('\n}', bodyStart))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(body).not.toMatch(/bg-primary/)
    expect(body).not.toMatch(/text-primary/)
    expect(body).not.toMatch(/\bbg-(red|green|blue|yellow|emerald|sage|cyan|indigo|amber)\b/)
    // Y el neutralizador del bg-primary del variant default tiene que seguir ahí.
    expect(body).toMatch(/bg-transparent/)
  })
})

// ── Contraste WCAG del outline del panel (T-14-41 · WR-A1 · WR-A2) ───────────────────────────────
// El outline no puede quedar "documentado en un comentario": los tres pares que decide (texto en
// reposo, borde en reposo, relleno del hover) se MIDEN acá con el helper que ya existe en
// lib/contrast.ts, y los valores se leen del CSS en vez de copiarse.
//
// QUÉ CAMBIÓ Y POR QUÉ (code review de la fase, cluster A):
//
// WR-A1 — antes se leía SOLO app/globals.css, o sea el theme Forjo. Pero app/themes.css declara su
//   propio --destructive (modern #e5484d, spa #c0876b, cyber #ff2e7e) y su propio
//   --danger-foreground, y sus neutrales son `color-mix(in oklab, #hex NN%, var(--tint))` — o sea que
//   la superficie contra la que se lee el borde DEPENDE DE LA PALETA DEL NEGOCIO. El comentario
//   prometía una cobertura que no existía. Ahora se recorren los 32 contextos reales
//   (4 themes × sus paletas × claro/oscuro).
//
// WR-A2 — antes se medía contra --popover, pero el botón NO se pinta sobre --popover: vive dentro del
//   <DialogFooter>, que lleva `bg-muted/50` (components/ui/dialog.tsx). Tailwind v4 compila ese `/50`
//   a `color-mix(in oklab, var(--muted) 50%, transparent)`, o sea --muted con alpha .5, que el
//   navegador compone sobre el popup. El par medido no era el par pintado. Ahora la superficie es la
//   composición real.
//
// POR QUÉ el texto en reposo NO es var(--danger): ese par no llega a AA en la mayoría de los themes
// (ver la tabla de §6.2 de 14-SECURITY.md). El label es texto normal ⇒ 4.5:1 obligatorio, así que
// sale de --foreground y la señal de peligro viaja por el BORDE (contraste de no-texto, 1.4.11).
const AA_NORMAL = 4.5
const NO_TEXTO = 3 // WCAG 1.4.11: componentes de UI y sus bordes
const cssGlobals = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')
const cssThemes = readFileSync(join(process.cwd(), 'app', 'themes.css'), 'utf8')

// ── Resolución de color: lo MÍNIMO de CSS que hace falta para no mentir ──────────────────────────
// NO se duplica la matemática de WCAG (esa vive en lib/contrast.ts y se consume vía contrastRatioHex).
// Lo que se implementa acá es la resolución de dos construcciones de CSS que el navegador hace y Node
// no: el `color-mix(in oklab, …)` de los neutrales de themes.css y la composición de un fondo con
// alpha. Sin esto la alternativa sería medir un color que el usuario nunca ve.
const srgbALineal = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const linealASrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

function hexARgb(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, '')
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
const rgbAHex = (rgb: number[]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

/** sRGB → Oklab (matrices de Björn Ottosson, las mismas que implementa el navegador). */
function rgbAOklab([R, G, B]: [number, number, number]): [number, number, number] {
  const r = srgbALineal(R / 255), g = srgbALineal(G / 255), b = srgbALineal(B / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function oklabARgb([L, A, B]: [number, number, number]): number[] {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const canal = (v: number) =>
    Math.max(0, Math.min(255, Math.round(linealASrgb(Math.max(0, Math.min(1, v))) * 255)))
  return [
    canal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    canal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    canal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** `color-mix(in oklab, a pct%, b)` con dos colores opacos = interpolación lineal en Oklab. */
function mezclaOklab(a: string, pct: number, b: string): string {
  const A = rgbAOklab(hexARgb(a))
  const Bc = rgbAOklab(hexARgb(b))
  const p = pct / 100
  return rgbAHex(oklabARgb([0, 1, 2].map((i) => A[i] * p + Bc[i] * (1 - p)) as [number, number, number]))
}

/**
 * Composición de `bg-muted/50` sobre el popup: --muted con alpha .5 encima de --popover.
 * El navegador compone en el espacio de destino (sRGB con gamma), así que es el promedio de los
 * bytes — NO una mezcla en Oklab. Es exacto, no una aproximación.
 */
const componer50 = (encima: string, debajo: string) =>
  rgbAHex(hexARgb(encima).map((v, i) => Math.round((v + hexARgb(debajo)[i]) / 2)))

// ── Lectura de los bloques de CSS ────────────────────────────────────────────────────────────────
function bloque(src: string, head: RegExp, etiqueta: string): string {
  const m = head.exec(src)
  if (!m) throw new Error(`No se encontró el bloque ${etiqueta}`)
  return src.slice(m.index, src.indexOf('\n}', m.index))
}
function declaracion(bloqueTexto: string, token: string): string | null {
  const m = bloqueTexto.match(new RegExp(`--${token}:\\s*([^;]+);`))
  return m ? m[1].trim() : null
}

const BLOQUES: Record<string, string> = {
  // `:root` NO va solo: globals.css lo declara en lista con [data-theme='forjo'] (el theme por
  // defecto es la AUSENCIA de atributo). Acotar el bloque es a propósito: --popover: #fbf3e3 aparece
  // también en .impersonation-view, y mezclarlos mentiría.
  forjo: bloque(cssGlobals, /^:root\s*,/m, ':root'),
  'forjo.dark': bloque(cssGlobals, /^\.dark\s*\{/m, '.dark'),
}
for (const t of ['modern', 'spa', 'cyber']) {
  BLOQUES[t] = bloque(cssThemes, new RegExp(`^\\[data-theme="${t}"\\]\\{`, 'm'), t)
  BLOQUES[`${t}.dark`] = bloque(cssThemes, new RegExp(`^\\.dark\\[data-theme="${t}"\\]\\{`, 'm'), `${t} dark`)
}
/** Bloques de paleta, separados por modo: el `.dark[...]` NO puede pisar al claro (declara --tint). */
function paletasDe(prefijo: string): Record<string, Record<string, string>> {
  const acc: Record<string, Record<string, string>> = {}
  const re = new RegExp(`^${prefijo}\\[data-theme="(\\w+)"\\]\\[data-palette="(\\w+)"\\]\\s*\\{([^}]*)\\}`, 'gm')
  for (const m of cssThemes.matchAll(re)) (acc[m[1]] ??= {})[m[2]] = m[3]
  return acc
}
const PALETAS = paletasDe('')
const PALETAS_DARK = paletasDe('\\.dark')

/** Resuelve un token siguiendo la cascada (el último bloque de la cadena gana). */
function resolver(cadena: string[], token: string): string {
  let crudo: string | null = null
  for (const b of cadena) {
    const v = declaracion(b, token)
    if (v) crudo = v
  }
  if (!crudo) throw new Error(`No se encontró --${token} en la cadena`)
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(crudo)) return crudo
  const cm = crudo.match(/^color-mix\(in oklab,\s*(#[0-9a-fA-F]{3,6})\s*(\d+)%\s*,\s*var\(--tint\)\)$/)
  if (cm) return mezclaOklab(cm[1], Number(cm[2]), resolver(cadena, 'tint'))
  // Fail-loud a propósito: si aparece una forma nueva (oklch(), rgba(), otro var()), es mejor que la
  // suite explote a que mida un color inventado.
  throw new Error(`Valor no resoluble para --${token}: ${crudo}`)
}

/** Los 32 contextos reales: theme × paleta × claro/oscuro. */
const CONTEXTOS: { nombre: string; cadena: string[] }[] = [
  { nombre: 'forjo/-/claro', cadena: [BLOQUES.forjo] },
  { nombre: 'forjo/-/oscuro', cadena: [BLOQUES.forjo, BLOQUES['forjo.dark']] },
]
for (const t of ['modern', 'spa', 'cyber']) {
  for (const p of Object.keys(PALETAS[t])) {
    CONTEXTOS.push({ nombre: `${t}/${p}/claro`, cadena: [BLOQUES[t], PALETAS[t][p]] })
    CONTEXTOS.push({
      nombre: `${t}/${p}/oscuro`,
      cadena: [BLOQUES[t], BLOQUES[`${t}.dark`], PALETAS[t][p], PALETAS_DARK[t]?.[p] ?? ''],
    })
  }
}

/** Los tres pares del outline, medidos en un contexto. */
function medir(ctx: { nombre: string; cadena: string[] }) {
  const popup = resolver(ctx.cadena, 'popover')
  const superficie = componer50(resolver(ctx.cadena, 'muted'), popup) // el fondo REAL del footer
  const ratio = (a: string, b: string) => {
    const r = contrastRatioHex(a, b)
    if (r === null) throw new Error(`${ctx.nombre}: hex no parseable (${a} / ${b})`)
    return r
  }
  return {
    nombre: ctx.nombre,
    texto: ratio(resolver(ctx.cadena, 'foreground'), superficie),
    borde: ratio(resolver(ctx.cadena, 'destructive'), superficie),
    hover: ratio(resolver(ctx.cadena, 'danger-foreground'), resolver(ctx.cadena, 'destructive')),
  }
}

/**
 * Residuales REGISTRADOS: contextos donde el borde no llega a 3:1. Es el R-1 de §7 de
 * 14-SECURITY.md (el terracota claro de spa, `--destructive:#c0876b`), medido ahora contra la
 * superficie real del footer: 2.47–2.48:1 en vez de los 2.72:1 que se anotaron contra --popover puro.
 * No se puede corregir sin tocar app/themes.css, que está fuera de alcance.
 *
 * Se afirma por IGUALDAD, no por "≥ estos": si aparece un residual nuevo la suite se pone roja, y si
 * alguien ARREGLA spa también — y ahí lo correcto es sacarlo de esta lista, no volver a esconderlo.
 */
const RESIDUALES_BORDE = [
  'spa/clay/claro',
  'spa/lavender/claro',
  'spa/mauve/claro',
  'spa/ocean/claro',
  'spa/sage/claro',
]

describe('outline del confirmar destructivo del panel — contraste WCAG (T-14-41 · WR-A1 · WR-A2)', () => {
  const medidos = CONTEXTOS.map(medir)

  it('cubre los 4 themes con sus paletas, en claro y en oscuro (WR-A1)', () => {
    // Si alguien agrega un theme o una paleta y no aparece acá, la cobertura que el comentario
    // promete deja de ser cierta en silencio. Este test es el que no la deja mentir.
    expect(medidos.length).toBe(32)
    expect(medidos.filter((m) => m.nombre.startsWith('forjo/')).length).toBe(2)
    for (const t of ['modern', 'spa', 'cyber']) {
      expect(medidos.filter((m) => m.nombre.startsWith(`${t}/`)).length).toBe(10)
    }
  })

  it('reposo: el texto (--foreground) sobre el fondo REAL del footer pasa AA en todos', () => {
    // Previene: que el label del botón quede ilegible. Es el par que el design system ya garantiza
    // (--popover-foreground === --foreground), por eso el outline se apoya en él.
    // Medido: mínimo 7.75:1 (spa claro), máximo 15.51:1 (cyber magenta).
    const bajos = medidos.filter((m) => m.texto < AA_NORMAL)
    expect(bajos.map((m) => `${m.nombre} ${m.texto.toFixed(2)}:1`)).toEqual([])
  })

  it('hover: el relleno (--danger-foreground sobre --danger) pasa AA en todos', () => {
    // Previene: que al pasar el mouse el botón se rellene con un par ilegible. --danger resuelve a
    // --destructive fuera del shell, y cada bloque declara su propio --danger-foreground para esto.
    // Medido: 5.40 forjo claro, 4.91 forjo oscuro, 4.63 modern, 5.36 spa, 5.73 cyber.
    const bajos = medidos.filter((m) => m.hover < AA_NORMAL)
    expect(bajos.map((m) => `${m.nombre} ${m.hover.toFixed(2)}:1`)).toEqual([])
  })

  it('borde: ≥3:1 (WCAG 1.4.11) salvo los residuales registrados, que son EXACTAMENTE los conocidos', () => {
    // El borde es LA señal de peligro en reposo, así que es el par más importante y el más ajustado.
    // Medido: forjo 4.99 claro / 4.22 oscuro, modern 3.36–3.59, cyber 4.57–4.91, spa 3.90–3.93 oscuro.
    const bajos = medidos.filter((m) => m.borde < NO_TEXTO).map((m) => m.nombre).sort()
    expect(bajos).toEqual(RESIDUALES_BORDE)
  })

  it('la superficie medida sigue siendo la que pinta el DialogFooter (bg-muted/50)', () => {
    // Ata el modelo de color de esta suite a su fuente: si el footer dejara de ser `bg-muted/50`, los
    // tres tests de arriba seguirían verdes midiendo una superficie que ya no existe (WR-A2 otra vez).
    const dialogUi = read(join('components', 'ui', 'dialog.tsx'))
    const footerAt = dialogUi.indexOf('data-slot="dialog-footer"')
    expect(footerAt).toBeGreaterThan(-1)
    expect(dialogUi.slice(footerAt, dialogUi.indexOf('{...props}', footerAt))).toMatch(/bg-muted\/50/)
  })
})
