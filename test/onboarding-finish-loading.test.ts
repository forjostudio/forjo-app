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

// ── Quick 261124-iu8: ningún await de `handleFinish` espera sin tope ─────────────────────────────
//
// EL DEFECTO: un refresh de token que no volvía dejaba `await supabase.auth.getUser()` pendiente para
// siempre (lock de auth-js 2.106.2 sin timeout) y el botón en «Guardando...». Detrás del mismo lock
// esperan los inserts/rpc/storage de la configuración, y sus fetch tampoco tienen timeout. LO QUE ESTE
// GATE CONGELA: cada `await` del cuerpo pasa por el límite del alta (`altaDelNegocio(`) o por el plazo
// de la configuración (`enPlazo(`). Un await nuevo sin tope lo pone en rojo.
describe('handleFinish: ningún await sin límite (quick 261124-iu8)', () => {
  const cuerpo = cuerpoDeHandleFinish()
  const awaits = [...cuerpo.matchAll(/\bawait\b/g)]

  // Guarda del instrumento: alta + 2 del logo + servicios + profesionales + agenda + lead = 7.
  it('el recorte ve todos los awaits y el plazo de la configuración', () => {
    expect(awaits.length).toBeGreaterThanOrEqual(7)
    expect(cuerpo).toContain('crearPlazo(')
  })

  it('cada await va seguido de altaDelNegocio( o enPlazo(', () => {
    for (const m of awaits) {
      const despues = cuerpo.slice(m.index! + 'await'.length).replace(/^\s+/, '')
      expect(
        despues.startsWith('altaDelNegocio(') || despues.startsWith('enPlazo('),
        `await sin límite: await ${despues.slice(0, 80)}`,
      ).toBe(true)
    }
  })
})

// ── Quick 261124-iu8, DC-7: slug y «Atrás» bloqueados mientras el alta no se confirma ─────────────
//
// Un intento que vence con su insert (slug A) en viaje no puede dejar que el dueño vuelva al paso 1,
// cambie a slug B y reintente: la búsqueda correría antes de que A aterrice y se crearía B. Este gate
// nace verde (el bloqueo lo cableó la tarea 2); su rojo previo es la marca `atras-habilitado` de la
// sonda `onb-crear-negocio-colgado`.
describe('wizard: slug y Atrás bloqueados mientras el alta no se confirma (quick 261124-iu8, DC-7)', () => {
  const src = sinComentarios(readFileSync(ARCHIVO, 'utf8').replace(/\r\n/g, '\n'))

  it('altaSinConfirmar = loading || errorAlta !== null', () => {
    expect(src).toMatch(/const altaSinConfirmar = loading \|\| errorAlta !== null\b/)
  })

  it('el «Atrás» del pie tiene un disabled que incluye altaSinConfirmar', () => {
    const iClick = src.indexOf('onClick={() => setStep(visibleSteps[currentIndex - 1].n)}')
    expect(iClick, 'no encontré el onClick de «Atrás»').toBeGreaterThan(-1)
    const iInicio = src.lastIndexOf('<Button', iClick)
    const iTexto = src.indexOf('Atrás', iClick)
    expect(iInicio).toBeGreaterThan(-1)
    expect(iTexto).toBeGreaterThan(iClick)
    expect(src.slice(iInicio, iTexto)).toMatch(/disabled=\{[^}\n]*\baltaSinConfirmar\b[^}\n]*\}/)
  })

  it('los inputs del slug y del nombre llevan disabled={altaSinConfirmar}', () => {
    for (const marca of ['value={slug}', 'placeholder="Ej: Estudio Nova"']) {
      const i = src.indexOf(marca)
      expect(i, `no encontré el input con ${marca}`).toBeGreaterThan(-1)
      const iInicio = src.lastIndexOf('<Input', i)
      const iFin = src.indexOf('/>', i)
      expect(iInicio).toBeGreaterThan(-1)
      expect(iFin).toBeGreaterThan(i)
      expect(src.slice(iInicio, iFin), `input ${marca}`).toContain('disabled={altaSinConfirmar}')
    }
  })

  it('el catch de handleFinish decide con esAltaSinConfirmar(err) antes de setErrorAlta(', () => {
    const cuerpo = cuerpoDeHandleFinish()
    const iCatch = cuerpo.indexOf('} catch (err) {')
    expect(iCatch).toBeGreaterThan(-1)
    const iDecide = cuerpo.indexOf('esAltaSinConfirmar(err)', iCatch)
    const iSet = cuerpo.indexOf('setErrorAlta(', iCatch)
    expect(iDecide).toBeGreaterThan(iCatch)
    expect(iSet).toBeGreaterThan(iDecide)
  })
})
