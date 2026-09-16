import { describe, it, expect } from 'vitest'
import {
  SIN_CATEGORIA,
  categoryPatch,
  fromCategoryId,
  liveCategoryValue,
  mapCategoryWriteError,
  renumber,
  nextSortOrder,
  categorySiblings,
  moveWithinList,
  categoryCountLabel,
  serviceCountLabel,
  classifyCategoryWriteError,
  CATEGORY_WRITE_REJECT_COPY,
  ORDER_REJECT_COPY,
  moveRejectCopy,
} from '@/lib/catalog-panel'

// ── Phase 23 (el panel del catálogo) — tests PUROS de lib/catalog-panel.ts ────────────────────
// Molde: test/service-categories.test.ts. describe/it/expect, import desde @/lib/..., sin base y
// sin credenciales: es carril `pure` y tiene que seguir siéndolo (test/suite-split.ts lo decide por
// los imports del archivo, así que acá no se importa nada de fixtures ni de clientes de datos).
//
// Lo que estos tests congelan y hoy sólo se podía verificar a ojo:
//   1. La RENUMERACIÓN completa: posiciones 0..n-1, sin huecos ni empates. Un swap suelto deja
//      empates, y con dos filas empatadas el orden lo decide la lectura, que cambia entre reloads.
//   2. El MOVIMIENTO dentro de una lista: la regla que comparten las flechas y el arrastre.
//   3. D-07: la ÚNICA traducción del sentinel "Sin categoría" a la columna, y la ÚNICA traducción
//      de sus rechazos a copy propia.
//   4. Que el rechazo de la base se clasifica por CÓDIGO y nunca por texto (T-23-04).

const UUID = '6f1c2a54-9a1e-4b8e-8f53-2b1d0c7e9a11'

// ── Renumeración ──────────────────────────────────────────────────────────────────────────────
describe('renumber — la lista completa de hermanas, desde 0', () => {
  it('lista vacía devuelve lista vacía', () => {
    expect(renumber([])).toEqual([])
  })

  it('tres ids: posiciones 0,1,2 en ese orden, sin huecos ni empates', () => {
    expect(renumber(['a', 'b', 'c'])).toEqual([
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 1 },
      { id: 'c', sort_order: 2 },
    ])
  })

  it('20 ids: exactamente 0..19 y cada posición aparece una sola vez', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `id-${i}`)
    const posiciones = renumber(ids).map((r) => r.sort_order)
    expect(posiciones).toEqual(Array.from({ length: 20 }, (_, i) => i))
    expect(new Set(posiciones).size).toBe(20)
  })

  it('no muta el array de entrada', () => {
    const ids = ['c', 'a', 'b']
    renumber(ids)
    expect(ids).toEqual(['c', 'a', 'b'])
  })
})

// ── Movimiento dentro de una lista ────────────────────────────────────────────────────────────
describe('moveWithinList — saca de `from` e inserta en `to`, sobre una copia', () => {
  it('del primero al último', () => {
    expect(moveWithinList(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('del último al primero', () => {
    expect(moveWithinList(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('mismo índice: copia idéntica', () => {
    const entrada = ['a', 'b', 'c']
    const salida = moveWithinList(entrada, 1, 1)
    expect(salida).toEqual(['a', 'b', 'c'])
    expect(salida).not.toBe(entrada)
  })

  it('no-op con `from` negativo', () => {
    expect(moveWithinList(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('no-op con `to` negativo', () => {
    expect(moveWithinList(['a', 'b', 'c'], 1, -1)).toEqual(['a', 'b', 'c'])
  })

  it('no-op con `from` fuera del rango por arriba', () => {
    expect(moveWithinList(['a', 'b', 'c'], 3, 0)).toEqual(['a', 'b', 'c'])
  })

  it('no-op con `to` fuera del rango por arriba', () => {
    expect(moveWithinList(['a', 'b', 'c'], 0, 3)).toEqual(['a', 'b', 'c'])
  })

  it('no muta el array de entrada', () => {
    const entrada = ['a', 'b', 'c']
    moveWithinList(entrada, 0, 2)
    expect(entrada).toEqual(['a', 'b', 'c'])
  })
})

describe('nextSortOrder — una fila nueva entra al final (code review WR-01)', () => {
  it('lista vacía ⇒ 0', () => {
    expect(nextSortOrder([])).toBe(0)
  })

  it('lista renumerada 0..n-1 ⇒ n', () => {
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 1 }, { sort_order: 2 }])).toBe(3)
  })

  it('con huecos no usa el largo: [2] ⇒ 3, no 1 (la fila nueva no se pinta arriba de otra)', () => {
    expect(nextSortOrder([{ sort_order: 2 }])).toBe(3)
  })

  it('todas empatadas en 0 (el estado de producción) ⇒ 1', () => {
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 0 }])).toBe(1)
  })

  it('un sort_order ausente o nulo cuenta como 0', () => {
    expect(nextSortOrder([{}, { sort_order: null }])).toBe(1)
  })

  it('no depende del orden de la entrada', () => {
    expect(nextSortOrder([{ sort_order: 5 }, { sort_order: 1 }, { sort_order: 3 }])).toBe(6)
  })
})

describe('categorySiblings — el grupo al que llega un servicio (code review WR-02)', () => {
  const COLOR = 'cat-color'
  const UNAS = 'cat-unas'
  const vivas = [COLOR, UNAS]
  const servicios = [
    { id: 's1', category_id: COLOR, sort_order: 0 },
    { id: 's2', category_id: UNAS, sort_order: 0 },
    { id: 's3', category_id: COLOR, sort_order: 1 },
    { id: 's4', category_id: null, sort_order: 0 },
    { id: 's5', category_id: 'cat-borrada', sort_order: 3 },
    { id: 's6', sort_order: 1 },
  ]
  const ids = (xs: { id: string }[]) => xs.map(x => x.id)

  it('un uuid vivo devuelve los de esa categoría, en el orden de entrada', () => {
    expect(ids(categorySiblings(servicios, COLOR, vivas))).toEqual(['s1', 's3'])
  })

  it('el sentinel junta nulos, ausentes y categorías colgadas (mismo reparto que groupCatalog)', () => {
    expect(ids(categorySiblings(servicios, SIN_CATEGORIA, vivas))).toEqual(['s4', 's5', 's6'])
  })

  it('excludeId saca al propio servicio', () => {
    expect(ids(categorySiblings(servicios, COLOR, vivas, 's3'))).toEqual(['s1'])
  })

  it('una categoría sin servicios devuelve lista vacía (llega en la posición 0)', () => {
    expect(categorySiblings(servicios, 'cat-nueva', [...vivas, 'cat-nueva'])).toEqual([])
    expect(nextSortOrder(categorySiblings(servicios, 'cat-nueva', [...vivas, 'cat-nueva']))).toBe(0)
  })

  it('compuesto con nextSortOrder, el servicio llega detrás del último del grupo, no empatado con el primero', () => {
    expect(nextSortOrder(categorySiblings(servicios, COLOR, vivas))).toBe(2)
    expect(nextSortOrder(categorySiblings(servicios, SIN_CATEGORIA, vivas))).toBe(4)
  })

  it('no muta la entrada', () => {
    const copia = structuredClone(servicios)
    categorySiblings(servicios, COLOR, vivas, 's1')
    expect(servicios).toEqual(copia)
  })
})

// ── D-07: la única fuente del valor de la columna ─────────────────────────────────────────────
describe('categoryPatch / fromCategoryId — la única traducción del sentinel (D-07)', () => {
  it('el sentinel produce la columna en null', () => {
    expect(categoryPatch(SIN_CATEGORIA)).toStrictEqual({ category_id: null })
  })

  it('un uuid pasa tal cual', () => {
    expect(categoryPatch(UUID)).toStrictEqual({ category_id: UUID })
  })

  it('el patch tiene EXACTAMENTE una clave: ninguna otra columna viaja escondida', () => {
    expect(Object.keys(categoryPatch(SIN_CATEGORIA))).toHaveLength(1)
    expect(Object.keys(categoryPatch(UUID))).toHaveLength(1)
  })

  it('fromCategoryId: null y undefined hidratan el sentinel', () => {
    expect(fromCategoryId(null)).toBe(SIN_CATEGORIA)
    expect(fromCategoryId(undefined)).toBe(SIN_CATEGORIA)
  })

  it('fromCategoryId: un uuid vuelve tal cual', () => {
    expect(fromCategoryId(UUID)).toBe(UUID)
  })

  it('ida y vuelta: hidratar y guardar sin tocar el control no cambia el dato', () => {
    expect(categoryPatch(fromCategoryId(null))).toStrictEqual({ category_id: null })
    expect(categoryPatch(fromCategoryId(UUID))).toStrictEqual({ category_id: UUID })
  })
})

describe('liveCategoryValue — lo que se escribe es lo que se ve (code review CR-01)', () => {
  const OTRO = '0b6e2f1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b'

  it('un uuid que sigue existiendo pasa tal cual', () => {
    expect(liveCategoryValue(UUID, [OTRO, UUID])).toBe(UUID)
  })

  it('un uuid borrado (ya no está entre las vivas) cae al sentinel', () => {
    expect(liveCategoryValue(UUID, [OTRO])).toBe(SIN_CATEGORIA)
  })

  it('borrada la ÚLTIMA categoría (cero vivas) también cae al sentinel', () => {
    expect(liveCategoryValue(UUID, [])).toBe(SIN_CATEGORIA)
  })

  it('el sentinel pasa tal cual, haya o no categorías', () => {
    expect(liveCategoryValue(SIN_CATEGORIA, [])).toBe(SIN_CATEGORIA)
    expect(liveCategoryValue(SIN_CATEGORIA, [UUID])).toBe(SIN_CATEGORIA)
  })

  it('acepta cualquier iterable (un Set, un generador de ids)', () => {
    expect(liveCategoryValue(UUID, new Set([UUID]))).toBe(UUID)
  })

  it('compuesto con categoryPatch, un uuid borrado escribe la columna en null', () => {
    expect(categoryPatch(liveCategoryValue(UUID, [OTRO]))).toStrictEqual({ category_id: null })
  })
})

describe('mapCategoryWriteError — la única traducción de los rechazos de la columna (D-07)', () => {
  it("'23503' (FK compuesta same-tenant) devuelve la copy propia", () => {
    expect(mapCategoryWriteError('23503')).toBe('Esa categoría ya no existe. Recargá la página y elegí otra.')
  })

  for (const code of ['23505', '23514', 'P0001', undefined, null]) {
    it(`devuelve null con ${String(code)}: el resto lo decide el caller`, () => {
      expect(mapCategoryWriteError(code)).toBeNull()
    })
  }

  it('la copy no es un eco de la base: sin constraint ni nombre de columna', () => {
    const copy = mapCategoryWriteError('23503') ?? ''
    expect(copy).not.toContain('services_category')
    expect(copy).not.toContain('constraint')
    expect(copy).not.toContain('category_id')
  })
})

// ── Plurales del Copywriting Contract ─────────────────────────────────────────────────────────
describe('categoryCountLabel / serviceCountLabel — plural real', () => {
  it('categorías: 0, 1 y 4', () => {
    expect(categoryCountLabel(0)).toBe('Sin categorías')
    expect(categoryCountLabel(1)).toBe('1 categoría')
    expect(categoryCountLabel(4)).toBe('4 categorías')
  })

  it('servicios: 0, 1 y 4', () => {
    expect(serviceCountLabel(0)).toBe('Sin servicios')
    expect(serviceCountLabel(1)).toBe('1 servicio')
    expect(serviceCountLabel(4)).toBe('4 servicios')
  })
})

// ── El rechazo del alta, por CÓDIGO ───────────────────────────────────────────────────────────
describe('classifyCategoryWriteError — ramifica sólo por code (T-23-04)', () => {
  it("'23505' es duplicate", () => {
    expect(classifyCategoryWriteError({ code: '23505' })).toBe('duplicate')
  })

  it("'23514' es blank", () => {
    expect(classifyCategoryWriteError({ code: '23514' })).toBe('blank')
  })

  it("'23503' es unknown", () => {
    expect(classifyCategoryWriteError({ code: '23503' })).toBe('unknown')
  })

  it('code undefined es unknown', () => {
    expect(classifyCategoryWriteError({ code: undefined })).toBe('unknown')
  })

  it('null es unknown', () => {
    expect(classifyCategoryWriteError(null)).toBe('unknown')
  })

  it('NO mira el texto: un mensaje con el nombre del constraint y code desconocido es unknown', () => {
    const error = { code: 'XX000', message: 'duplicate key value violates unique constraint "service_categories_name_uq"' }
    expect(classifyCategoryWriteError(error)).toBe('unknown')
  })

  it('la copy de los tres casos es propia, no un eco de la base', () => {
    expect(Object.keys(CATEGORY_WRITE_REJECT_COPY).sort()).toEqual(['blank', 'duplicate', 'unknown'])
    expect(CATEGORY_WRITE_REJECT_COPY.duplicate).toBe('Ya tenés una categoría con ese nombre.')
    expect(CATEGORY_WRITE_REJECT_COPY.blank).toBe('Escribí un nombre para la categoría.')
    expect(CATEGORY_WRITE_REJECT_COPY.unknown).toBe('No se pudo guardar la categoría. Probá de nuevo.')
    for (const copy of Object.values(CATEGORY_WRITE_REJECT_COPY)) {
      expect(copy).not.toContain('service_categories_')
      expect(copy).not.toContain('constraint')
    }
  })
})

describe('copy de los fallos de orden y de mover', () => {
  it('ORDER_REJECT_COPY es la del contrato', () => {
    expect(ORDER_REJECT_COPY).toBe('No se pudo guardar el orden. Volvimos a mostrar el que está guardado.')
  })

  it('moveRejectCopy interpola el nombre del servicio', () => {
    expect(moveRejectCopy('Corte')).toBe('No se pudo mover “Corte”. Probá de nuevo.')
  })
})
