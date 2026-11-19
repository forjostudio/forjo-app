import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// ── Quick 261119-q8v, WR-02: «Finalizar» no se re-habilita mientras navega al paso 5 ─────────────
//
// EL DEFECTO: `handleFinish` terminaba con `router.replace('/onboarding/integraciones')` y un
// `finally { setLoading(false) }`. `router.replace` no espera la navegación, así que el botón volvía a
// estar habilitado mientras el server renderizaba la pantalla nueva (sesión + negocio + secretos). Un
// segundo toque volvía a correr el alta: otro `insert` en `businesses`, que hoy sólo frena el índice
// único del slug (23505) y que dejaba un «Error al crear el negocio» encima del «¡Negocio creado!».
//
// LO QUE ESTE GATE CONGELA: en el camino de éxito `loading` queda en true hasta que el wizard se
// desmonta; se suelta SÓLO en el `catch` y en cada salida temprana de adentro del `try` (WhatsApp
// inválido), que si no dejaría el botón trabado en «Guardando...» para siempre.
//
// POR QUÉ LEE EL FUENTE: el carril `pure` corre en `node`, sin DOM ni Testing Library, y el quick no
// suma dependencias. Mismo mecanismo que `test/forms-no-get-leak.test.ts`.

const ARCHIVO = 'app/(onboarding)/onboarding/page.tsx'

/** Borra comentarios JSX, de bloque y de línea (copiado de `test/forms-no-get-leak.test.ts`). */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** El cuerpo de `handleFinish`: desde su firma hasta la primera llave de cierre con su misma sangría. */
function cuerpoDeHandleFinish(): string {
  const src = sinComentarios(readFileSync(ARCHIVO, 'utf8').replace(/\r\n/g, '\n'))
  const inicio = src.indexOf('async function handleFinish()')
  expect(inicio, 'no encontré `handleFinish` en el wizard').toBeGreaterThan(-1)
  const fin = src.indexOf('\n  }\n', inicio)
  expect(fin, 'no encontré el cierre de `handleFinish`').toBeGreaterThan(inicio)
  return src.slice(inicio, fin + 4)
}

const cuenta = (s: string, aguja: string) => s.split(aguja).length - 1

describe('handleFinish del wizard (WR-02)', () => {
  const cuerpo = cuerpoDeHandleFinish()
  const DESTINO = "router.replace('/onboarding/integraciones')"
  const iTry = cuerpo.indexOf('setLoading(true)')
  const iDestino = cuerpo.indexOf(DESTINO)
  const iCatch = cuerpo.indexOf('} catch (err) {')

  // Guarda del instrumento (memoria «gates de region que miden cero»): si el recorte se corta antes de
  // tiempo, cada afirmación de abajo daría verde midiendo nada.
  it('el recorte abarca la función entera', () => {
    expect(iTry).toBeGreaterThan(-1)
    expect(iDestino).toBeGreaterThan(iTry)
    expect(iCatch).toBeGreaterThan(iDestino)
    expect(cuerpo).toContain("toast.error('Error al crear el negocio. Intentá de nuevo.')")
    expect(cuerpo).toContain('.from(\'businesses\')')
    expect(cuerpo.length).toBeGreaterThan(3000)
  })

  it('no hay `finally`: el éxito no suelta `loading`', () => {
    expect(cuerpo).not.toMatch(/\bfinally\b/)
  })

  it('después de navegar al paso 5 no se llama a setLoading(false) dentro del try', () => {
    expect(cuerpo.slice(iDestino, iCatch)).not.toContain('setLoading(false)')
  })

  it('el catch suelta `loading`', () => {
    expect(cuerpo.slice(iCatch)).toContain('setLoading(false)')
  })

  it('cada salida temprana del try suelta `loading` antes de volver', () => {
    const tramo = cuerpo.slice(iTry, iDestino)
    const salidas = cuenta(tramo, 'return')
    expect(salidas, 'el try tiene que tener al menos la salida del WhatsApp inválido').toBeGreaterThan(0)
    // Cada `return` del tramo va precedido, en su mismo bloque, por un setLoading(false).
    for (const m of tramo.matchAll(/\breturn\b/g)) {
      const antes = tramo.slice(0, m.index)
      const bloque = antes.slice(antes.lastIndexOf('{'))
      expect(bloque, `return sin setLoading(false) en: ${bloque.trim().slice(0, 120)}`).toContain('setLoading(false)')
    }
  })
})
