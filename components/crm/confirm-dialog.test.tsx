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
import { computeConfirmState, buildSubmitGuard, confirmButtonClass, computeFooterLayout } from './confirm-dialog'
import { CRM_SHELL_CLASS } from '@/lib/shell-scope'

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
    await Promise.all([first, second])
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith('motivo')
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

  // Test 6b (destructive FUERA de un shell = el panel del dueño, UAT 14-09 punto 3): el confirmar
  // destructivo cae al primario del tema. El dueño arbitró que el rojo de peligro es el lenguaje del
  // super-admin y que en su panel el botón no debe compartir color con el badge de riesgo. El CRM lo
  // conserva (test 6): si esta distinción se pierde, uno de los dos shells regresiona.
  it('destructive fuera de un shell: cae al primario del tema (panel del dueño)', () => {
    expect(confirmButtonClass(true)).toBe('')
    expect(confirmButtonClass(true, '')).toBe('')
    expect(confirmButtonClass(true, '   ')).toBe('')
    expect(confirmButtonClass(false)).toBe('')
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
