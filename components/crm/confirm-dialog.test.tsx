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
import { computeConfirmState, buildSubmitGuard, confirmButtonClass } from './confirm-dialog'

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

  // Test 6 (destructive): el helper de clase del botón confirmar referencia --crm-danger, no --destructive.
  it('destructive: la clase del botón confirmar usa --crm-danger (no --destructive)', () => {
    const dangerCls = confirmButtonClass(true)
    expect(dangerCls).toMatch(/crm-danger/)
    expect(dangerCls).not.toMatch(/destructive/)

    const normalCls = confirmButtonClass(false)
    expect(normalCls).not.toMatch(/crm-danger/)
  })
})
