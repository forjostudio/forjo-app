import { describe, it, expect } from 'vitest'
import {
  groupCatalog,
  sortCategories,
  DEFAULT_SORT_MODES,
  OTHER_GROUP_TITLE,
  ALL_GROUPS_KEY,
  ALL_GROUPS_TITLE,
  CHIPS_MIN_GROUPS,
  CHIPS_MIN_SERVICES,
  LOOSE_GROUP_KEY,
  catalogChips,
  catalogGroupKey,
  filterCatalogGroups,
} from '@/lib/service-categories'
import type { CatalogCategory, CatalogService, CatalogSortModes } from '@/lib/service-categories'

// ── Phase 22 (el modelo del catálogo) — tests PUROS de lib/service-categories.ts ──────────────
// Espejan test/time-block-services.test.ts y test/staff-services.test.ts: describe/it/expect,
// import desde @/lib/..., SIN Supabase ni credenciales. Esta suite NO PUEDE importar el módulo de
// credenciales de test/, ni los helpers de fixtures, ni el cliente de Supabase: si lo hiciera,
// test/suite-split.ts la mandaría al carril serializado y además dejaría de correr sin credenciales.
// Es pura y tiene que seguir siéndolo (el guard test/suite-split.test.ts lo verifica).
//
// ⚠ Y los NOMBRES exactos de esos tres imports tampoco se escriben acá, ni siquiera en un
// comentario: el gate de pureza es un grep LITERAL sobre este archivo, así que nombrarlos en prosa
// lo pone rojo sin que exista ningún import. Es la misma trampa del token suelto que documenta
// test/suite-split.ts y que ese módulo resuelve anclando su regex al import y no al token.
//
// ⚠ El estándar del workstream es el CONTROL NEGATIVO, y acá hay un agravante propio de la fase
// (D-08): el caso de CERO categorías es el camino de HOY — pasa aunque la regla no exista y por sí
// solo no prueba nada. Por eso va emparejado con el caso que sí muerde (los modos en 'alpha' y
// 'price' dando LA MISMA salida), que es el único que distingue "CAT-07 se cumple" de "la función
// todavía no ordena nada".
//
// Lo que estos tests congelan, y que la implementación es demasiado corta para defender sola:
//   1. El ORDEN ESTABLE ante el empate. Un "desempate por nombre" agregado de buena fe cambiaría
//      el orden que ven TODOS los negocios de producción, cuyos `sort_order` están todos en 0.
//   2. Que la función NO ESCRIBE: la ida y vuelta de modo devuelve el arreglo del dueño intacto
//      (CAT-06) y los arreglos de entrada quedan sin tocar.
//   3. La INVARIANTE DE CONSERVACIÓN: ningún servicio se pierde, cualquiera sea su `category_id`
//      (D-03). Es el modo de falla que ya mordió dos veces en este repo (CR-01 de la Phase 20 y
//      otra vez en la 21): un helper que descarta de más y apaga el catálogo entero, en silencio.

// ── Factories mínimas (sólo los campos que lee `groupCatalog`) ─────────────────────────────────
function svc(id: string, extras: Partial<CatalogService> = {}): CatalogService {
  return { id, name: id, price: 0, category_id: null, sort_order: 0, ...extras }
}

function cat(id: string, extras: Partial<CatalogCategory> = {}): CatalogCategory {
  return { id, name: id, sort_order: 0, ...extras }
}

function modes(m: Partial<CatalogSortModes>): CatalogSortModes {
  return { categories: 'custom', services: 'custom', ...m }
}

/** Los ids de los servicios de un grupo, en orden. Asertar la SECUENCIA, nunca la longitud. */
function ids(group: { services: CatalogService[] }): string[] {
  return group.services.map((s) => s.id)
}

/** Los títulos de los grupos, en orden. */
function titles(groups: { title: string | null }[]): (string | null)[] {
  return groups.map((g) => g.title)
}

// ── Suite 1: el eje de las CATEGORÍAS ('custom' | 'alpha') ─────────────────────────────────────
describe('groupCatalog — orden de las categorías entre sí', () => {
  it("'custom': salen por sort_order ascendente", () => {
    const categorias = [
      cat('tratamientos', { sort_order: 3 }),
      cat('cortes', { sort_order: 1 }),
      cat('color', { sort_order: 2 }),
    ]
    const servicios = [
      svc('s-trat', { category_id: 'tratamientos' }),
      svc('s-corte', { category_id: 'cortes' }),
      svc('s-color', { category_id: 'color' }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ categories: 'custom' }))
    expect(grupos.map((g) => g.categoryId)).toEqual(['cortes', 'color', 'tratamientos'])
  })

  it("'custom' + sort_order EMPATADO: conserva el orden de entrada (estable), NO desempata por nombre", () => {
    // Éste es el caso que muerde si alguien agrega un desempate "para que quede prolijo": todos los
    // negocios de producción tienen sus sort_order en 0, así que un desempate alfabético les
    // cambiaría el orden del catálogo el día del deploy. La salida esperada está a propósito AL
    // REVÉS del alfabético.
    const categorias = [cat('zapatos'), cat('abrigos'), cat('medias')]
    const servicios = [
      svc('s-z', { category_id: 'zapatos' }),
      svc('s-a', { category_id: 'abrigos' }),
      svc('s-m', { category_id: 'medias' }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ categories: 'custom' }))
    expect(grupos.map((g) => g.categoryId)).toEqual(['zapatos', 'abrigos', 'medias'])
  })

  it("'alpha': por nombre en español, insensible a acentos y a capitalización", () => {
    // Discrimina contra un `<` sobre code points, que daría ['Uñas', 'tratamientos', 'Ámbar']:
    // la minúscula iría después de TODAS las mayúsculas y la 'Á' al final de todo.
    const categorias = [
      cat('c-unas', { name: 'Uñas', sort_order: 1 }),
      cat('c-trat', { name: 'tratamientos', sort_order: 2 }),
      cat('c-ambar', { name: 'Ámbar', sort_order: 3 }),
    ]
    const servicios = [
      svc('s-u', { category_id: 'c-unas' }),
      svc('s-t', { category_id: 'c-trat' }),
      svc('s-a', { category_id: 'c-ambar' }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ categories: 'alpha' }))
    expect(titles(grupos)).toEqual(['Ámbar', 'tratamientos', 'Uñas'])
  })
})

// ── Suite 2: el eje de los SERVICIOS dentro de cada grupo ('custom' | 'alpha' | 'price') ───────
describe('groupCatalog — orden de los servicios dentro de su grupo', () => {
  const categorias = [cat('cortes', { name: 'Cortes' })]

  it("'custom': por sort_order ascendente, y el empate conserva el orden de entrada", () => {
    const servicios = [
      svc('c', { category_id: 'cortes', sort_order: 2 }),
      svc('a', { category_id: 'cortes', sort_order: 1 }),
      svc('b', { category_id: 'cortes', sort_order: 1 }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ services: 'custom' }))
    // 'a' y 'b' empatan en 1: sale primero el que llegó primero, no el alfabético inverso
    expect(ids(grupos[0])).toEqual(['a', 'b', 'c'])
  })

  it("'alpha': por nombre, mismo criterio que las categorías (acentos y caps no cuentan)", () => {
    const servicios = [
      svc('s1', { name: 'Uñas esculpidas', category_id: 'cortes', sort_order: 1 }),
      svc('s2', { name: 'corte de puntas', category_id: 'cortes', sort_order: 2 }),
      svc('s3', { name: 'Álisado', category_id: 'cortes', sort_order: 3 }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ services: 'alpha' }))
    expect(grupos[0].services.map((s) => s.name)).toEqual([
      'Álisado',
      'corte de puntas',
      'Uñas esculpidas',
    ])
  })

  it("'price': por precio ascendente", () => {
    const servicios = [
      svc('caro', { category_id: 'cortes', price: 9000, sort_order: 1 }),
      svc('barato', { category_id: 'cortes', price: 1500, sort_order: 2 }),
      svc('medio', { category_id: 'cortes', price: 4000, sort_order: 3 }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ services: 'price' }))
    expect(ids(grupos[0])).toEqual(['barato', 'medio', 'caro'])
  })

  it("'price': dos precios IGUALES conservan el orden de entrada", () => {
    const servicios = [
      svc('z', { category_id: 'cortes', price: 5000 }),
      svc('a', { category_id: 'cortes', price: 5000 }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ services: 'price' }))
    expect(ids(grupos[0])).toEqual(['z', 'a'])
  })

  it("'price': un precio que NO es un número deja el par SIN CRITERIO — conserva la entrada", () => {
    // PostgREST manda `numeric` como STRING, y una lectura rota puede traer null o undefined. El
    // comparador devuelve 0 en vez de mandar el inválido a un extremo: "los inválidos al final" (o
    // al principio) sería una decisión de producto que nadie tomó, y le cambiaría el catálogo al
    // dueño sin que él haya hecho nada.
    const roto = 'no-es-un-numero' as unknown as number
    const servicios = [
      svc('roto', { category_id: 'cortes', price: roto }),
      svc('barato', { category_id: 'cortes', price: 100 }),
      svc('nan', { category_id: 'cortes', price: NaN }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ services: 'price' }))
    expect(ids(grupos[0])).toEqual(['roto', 'barato', 'nan'])
  })

  it("'price': un precio NULO o VACÍO no se lee como GRATIS — NO salta al principio del grupo", () => {
    // EL QUE MUERDE, y el caso que el comentario del comparador nombraba por su nombre sin cubrir:
    // `Number(null)`, `Number('')` y `Number('   ')` devuelven 0, que es FINITO. Con la coerción
    // cruda, un precio roto se ordenaba como el servicio MÁS BARATO y saltaba al primer lugar del
    // grupo —la posición más ruidosa que hay— por un dato que el dueño no ve. Acá el roto va
    // SEGUNDO en la entrada a propósito: si el par tuviera criterio, la aserción caería.
    const rotos: [string, unknown][] = [
      ['null', null],
      ['string vacío', ''],
      ['sólo espacios', '   '],
      ['undefined', undefined],
    ]
    for (const [etiqueta, valor] of rotos) {
      const servicios = [
        svc('barato', { category_id: 'cortes', price: 100 }),
        svc('roto', { category_id: 'cortes', price: valor as number }),
      ]
      const grupos = groupCatalog(servicios, categorias, modes({ services: 'price' }))
      expect(ids(grupos[0]), etiqueta).toEqual(['barato', 'roto'])
    }
  })

  it('el grupo de los SUELTOS se ordena con el MISMO modo de servicios que los demás', () => {
    // si el grupo de sueltos quedara sin ordenar, el dueño vería su catálogo ordenado por precio
    // salvo el último bloque — que se lee como roto
    const servicios = [
      svc('en-cat', { category_id: 'cortes', price: 100 }),
      svc('suelto-caro', { price: 9000 }),
      svc('suelto-barato', { price: 500 }),
      svc('suelto-medio', { price: 2000 }),
    ]
    const grupos = groupCatalog(servicios, categorias, modes({ services: 'price' }))
    expect(titles(grupos)).toEqual(['Cortes', OTHER_GROUP_TITLE])
    expect(ids(grupos[1])).toEqual(['suelto-barato', 'suelto-medio', 'suelto-caro'])
  })

  it('NINGÚN modo altera los arreglos que recibió: la entrada queda intacta', () => {
    // Los consumidores son componentes de React que reciben props; ordenar in-place la prop del
    // padre es un bug de re-render esperando. Y en un RSC el mismo arreglo alimenta otras lecturas.
    const servicios = [
      svc('c', { category_id: 'cortes', price: 300, sort_order: 1 }),
      svc('a', { category_id: 'cortes', price: 100, sort_order: 2 }),
      svc('b', { price: 200, sort_order: 3 }),
    ]
    const categoriasLocales = [cat('color', { name: 'Color', sort_order: 2 }), cat('cortes', { name: 'Cortes', sort_order: 1 })]
    const serviciosAntes = JSON.parse(JSON.stringify(servicios))
    const categoriasAntes = JSON.parse(JSON.stringify(categoriasLocales))

    groupCatalog(servicios, categoriasLocales, modes({ categories: 'alpha', services: 'price' }))
    groupCatalog(servicios, categoriasLocales, modes({ categories: 'custom', services: 'alpha' }))

    expect(servicios).toEqual(serviciosAntes)
    expect(categoriasLocales).toEqual(categoriasAntes)
  })
})

// ── Bloque A: el control negativo de CAT-07, y el agravante de esta fase (D-08) ────────────────
// El caso "cero categorías devuelve la lista plana" PASA AUNQUE LA FUNCIÓN ESTÉ VACÍA, así que por
// sí solo no prueba nada. Va emparejado con el caso que sí muerde: los modos en 'alpha' y en
// 'price' dando LA MISMA salida.
describe('groupCatalog — CAT-07: el catálogo de hoy, sin títulos (D-08)', () => {
  const catalogoDeHoy = [
    svc('corte', { name: 'Corte', price: 9000 }),
    svc('color', { name: 'Color', price: 2000 }),
    svc('barba', { name: 'Barba', price: 5000 }),
  ]

  it('cero categorías: UN grupo sin título con la lista EXACTA y en el mismo orden', () => {
    const grupos = groupCatalog(catalogoDeHoy, [])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].categoryId).toBeNull()
    expect(grupos[0].title).toBeNull()
    // La SECUENCIA completa, no la longitud: un toHaveLength no vería un reordenamiento.
    expect(ids(grupos[0])).toEqual(['corte', 'color', 'barba'])
  })

  it('EL QUE MUERDE: con cero categorías los modos NI SE MIRAN — alpha y price dan la misma salida', () => {
    // Los sort_order están todos en 0, los nombres al revés del alfabético y los precios al revés
    // del orden de entrada: si algún modo se aplicara, esta aserción caería. Es la única lectura de
    // CAT-07 que garantiza que un negocio de producción no vea un orden distinto al del día
    // anterior — el día de la migración TODOS tienen cero categorías.
    const base = groupCatalog(catalogoDeHoy, [])
    expect(groupCatalog(catalogoDeHoy, [], modes({ categories: 'alpha', services: 'alpha' }))).toEqual(base)
    expect(groupCatalog(catalogoDeHoy, [], modes({ services: 'price' }))).toEqual(base)
    expect(groupCatalog(catalogoDeHoy, [], modes({ categories: 'alpha', services: 'price' }))).toEqual(base)
  })

  it('categorías CREADAS pero NINGUNA con servicios: también la lista plana, sin títulos', () => {
    // El estado real del dueño que acaba de crear su primera categoría y todavía no asignó nada.
    // Sin esta rama su página pública mostraría todo el catálogo bajo un encabezado de "Otros", que
    // se lee como roto. Misma regla de siempre —sin agrupación real no hay títulos—, un nivel arriba.
    const categorias = [cat('cortes', { name: 'Cortes' }), cat('color', { name: 'Color' })]
    const grupos = groupCatalog(catalogoDeHoy, categorias)
    expect(titles(grupos)).toEqual([null])
    expect(ids(grupos[0])).toEqual(['corte', 'color', 'barba'])
    // y tampoco acá se miran los modos
    expect(
      groupCatalog(catalogoDeHoy, categorias, modes({ categories: 'alpha', services: 'price' })),
    ).toEqual(grupos)
  })
})

// ── Bloque B: CAT-06 — la ida y vuelta de modo ────────────────────────────────────────────────
describe('groupCatalog — CAT-06: el orden manual sobrevive a elegir alfabético o precio', () => {
  // Los sort_order están DELIBERADAMENTE desalineados del alfabético y del precio: si coincidieran,
  // el test pasaría por casualidad y no probaría nada.
  function catalogo() {
    return {
      categorias: [
        cat('c-zeta', { name: 'Zeta', sort_order: 1 }),
        cat('c-alfa', { name: 'Alfa', sort_order: 2 }),
      ],
      servicios: [
        svc('z1', { name: 'Zurcido', category_id: 'c-zeta', sort_order: 1, price: 9000 }),
        svc('z2', { name: 'Afeitado', category_id: 'c-zeta', sort_order: 2, price: 1000 }),
        svc('a1', { name: 'Uñas', category_id: 'c-alfa', sort_order: 1, price: 7000 }),
        svc('a2', { name: 'Bordado', category_id: 'c-alfa', sort_order: 2, price: 3000 }),
      ],
    }
  }

  it('custom → alpha → price → custom devuelve el arreglo del dueño IDÉNTICO', () => {
    const { categorias, servicios } = catalogo()

    const personalizadoAntes = groupCatalog(servicios, categorias, modes({}))
    // El dueño prueba alfabético...
    const alfabetico = groupCatalog(
      servicios,
      categorias,
      modes({ categories: 'alpha', services: 'alpha' }),
    )
    // ...después por precio...
    const porPrecio = groupCatalog(servicios, categorias, modes({ services: 'price' }))
    // ...y vuelve a personalizado.
    const personalizadoDespues = groupCatalog(servicios, categorias, modes({}))

    // Los dos modos SÍ pisaron el orden para mostrar (si no, el test sería vacío)...
    expect(titles(alfabetico)).toEqual(['Alfa', 'Zeta'])
    expect(ids(porPrecio[0])).toEqual(['z2', 'z1'])
    expect(alfabetico).not.toEqual(personalizadoAntes)
    expect(porPrecio).not.toEqual(personalizadoAntes)
    // ...pero no BORRARON nada: volver a personalizado devuelve exactamente lo de antes.
    expect(personalizadoDespues).toEqual(personalizadoAntes)
    expect(titles(personalizadoDespues)).toEqual(['Zeta', 'Alfa'])
    expect(ids(personalizadoDespues[0])).toEqual(['z1', 'z2'])
    expect(ids(personalizadoDespues[1])).toEqual(['a1', 'a2'])
  })

  it('y NO HAY POR DÓNDE BORRARLO: los arreglos de entrada quedan intactos tras las tres corridas', () => {
    // Esto es lo que hace de CAT-06 una garantía por construcción y no una promesa: la función es
    // pura, así que el sort_order del dueño no tiene dónde perderse. El write path del
    // reordenamiento (CAT-03, Phase 23) vive fuera de este módulo a propósito.
    const { categorias, servicios } = catalogo()
    const categoriasAntes = JSON.parse(JSON.stringify(categorias))
    const serviciosAntes = JSON.parse(JSON.stringify(servicios))

    groupCatalog(servicios, categorias, modes({ categories: 'alpha', services: 'alpha' }))
    groupCatalog(servicios, categorias, modes({ services: 'price' }))
    groupCatalog(servicios, categorias, modes({}))

    expect(categorias).toEqual(categoriasAntes)
    expect(servicios).toEqual(serviciosAntes)
  })
})

// ── Bloque C: la invariante de CONSERVACIÓN (D-03, T-22-11) ────────────────────────────────────
// El modo de falla que ya mordió DOS veces en este repo (CR-01 del code review de la Phase 20, y
// otra vez en la 21): un helper que descarta de más y apaga el catálogo entero, EN SILENCIO. Acá el
// peor caso posible tiene que ser "se ve como hoy", nunca "no se ve nada".

/** Todos los ids de la salida, aplanados en el orden en que quedaron. */
function idsDeTodaLaSalida(grupos: { services: CatalogService[] }[]): string[] {
  return grupos.flatMap((g) => g.services.map((s) => s.id))
}

describe('groupCatalog — invariante de conservación: ningún servicio se pierde (D-03)', () => {
  const propias = [cat('cortes', { name: 'Cortes' }), cat('color', { name: 'Color' })]

  const casos: { nombre: string; servicios: CatalogService[]; categorias: CatalogCategory[] }[] = [
    {
      nombre: 'todos con categoría válida',
      servicios: [svc('a', { category_id: 'cortes' }), svc('b', { category_id: 'color' })],
      categorias: propias,
    },
    {
      nombre: 'algunos con category_id NULO',
      servicios: [svc('a', { category_id: 'cortes' }), svc('b'), svc('c', { category_id: null })],
      categorias: propias,
    },
    {
      nombre: 'uno con un category_id COLGADO (categoría borrada entre dos lecturas)',
      servicios: [
        svc('a', { category_id: 'cortes' }),
        svc('fantasma', { category_id: 'ya-no-existe' }),
      ],
      categorias: propias,
    },
    {
      nombre: 'uno con un category_id de OTRA lista (cross-tenant)',
      servicios: [
        svc('a', { category_id: 'cortes' }),
        svc('ajeno', { category_id: 'cat-de-otro-negocio' }),
      ],
      categorias: propias,
    },
    { nombre: 'lista de categorías VACÍA', servicios: [svc('a'), svc('b')], categorias: [] },
    { nombre: 'lista de servicios VACÍA', servicios: [], categorias: propias },
    {
      // "EXACTAMENTE una vez" también prohíbe DOS veces, y ése es el lado que faltaba alimentar:
      // la aserción `new Set(salida).size === entrada.length` ya estaba escrita, pero ningún caso
      // le daba ids de categoría repetidos. Un caller que concatena dos lecturas, mezcla una lista
      // cacheada o agrega optimistamente una categoría que el refetch también devuelve llega acá.
      nombre: 'DOS categorías con el MISMO id (dos lecturas concatenadas)',
      servicios: [svc('a', { category_id: 'cortes' }), svc('b', { category_id: 'color' })],
      categorias: [...propias, cat('cortes', { name: 'Cortes (repetida)' })],
    },
  ]

  for (const modo of ['custom', 'alpha', 'price'] as const) {
    it(`la unión de los grupos es EXACTAMENTE la entrada, en los 7 casos (services: '${modo}')`, () => {
      for (const caso of casos) {
        const grupos = groupCatalog(caso.servicios, caso.categorias, modes({ services: modo }))
        const salida = idsDeTodaLaSalida(grupos)
        const entrada = caso.servicios.map((s) => s.id)
        // misma cantidad, sin repetidos, y exactamente el mismo conjunto
        expect(salida, caso.nombre).toHaveLength(entrada.length)
        expect(new Set(salida).size, caso.nombre).toBe(entrada.length)
        expect([...salida].sort(), caso.nombre).toEqual([...entrada].sort())
      }
    })
  }

  it('el COLGADO cae en el grupo de los sueltos, y ese grupo va ÚLTIMO', () => {
    const servicios = [
      svc('a', { category_id: 'cortes' }),
      svc('fantasma', { category_id: 'ya-no-existe' }),
    ]
    const grupos = groupCatalog(servicios, propias)
    expect(titles(grupos)).toEqual(['Cortes', OTHER_GROUP_TITLE])
    expect(ids(grupos[grupos.length - 1])).toEqual(['fantasma'])
  })

  it('el CROSS-TENANT cae en el grupo de los sueltos, y ese grupo va ÚLTIMO', () => {
    // La FK compuesta services_category_same_tenant de la migr. 078 impide este estado EN LA BASE.
    // Esto es la otra capa: la función tiene que sobrevivirlo igual, porque recibe filas de un
    // tercero y no puede validar su origen (contrato de la cabecera).
    const ajenas = [cat('cat-de-otro-negocio', { name: 'Ajena' })]
    const servicios = [
      svc('a', { category_id: 'cortes' }),
      svc('ajeno', { category_id: ajenas[0].id }),
    ]
    const grupos = groupCatalog(servicios, propias)
    expect(titles(grupos)).toEqual(['Cortes', OTHER_GROUP_TITLE])
    expect(ids(grupos[grupos.length - 1])).toEqual(['ajeno'])
  })

  it('una categoría REPETIDA no duplica sus servicios: el bucket se consume', () => {
    // El otro filo de la invariante. Sin consumir el bucket, las dos filas con el mismo id leen el
    // MISMO arreglo y lo empujan a dos grupos: el cliente vería el mismo servicio reservable bajo
    // dos títulos, y React recibiría keys repetidas. Gana la PRIMERA en el orden del eje de
    // categorías; la segunda no produce grupo, porque un grupo vacío nunca sale.
    const repetidas = [cat('cortes', { name: 'Cortes' }), cat('cortes', { name: 'Cortes (repetida)' })]
    const servicios = [svc('a', { category_id: 'cortes' }), svc('b', { category_id: 'cortes' })]

    const grupos = groupCatalog(servicios, repetidas)

    expect(grupos).toHaveLength(1)
    expect(titles(grupos)).toEqual(['Cortes'])
    expect(idsDeTodaLaSalida(grupos)).toEqual(['a', 'b'])
  })

  it('lista de servicios VACÍA: la salida NO inventa grupos vacíos', () => {
    // Un grupo con cero servicios no le sirve a ningún consumidor y sí lo puede confundir (un
    // grupos.length > 0 leído como "hay catálogo"). La invariante general: NINGÚN grupo de la
    // salida está vacío.
    expect(groupCatalog([], propias)).toEqual([])
    expect(groupCatalog([], [])).toEqual([])
    expect(groupCatalog([], propias, modes({ categories: 'alpha', services: 'price' }))).toEqual([])
  })

  it('NINGÚN grupo de la salida está vacío, en ningún caso ni con ningún modo', () => {
    for (const caso of casos) {
      for (const modo of ['custom', 'alpha', 'price'] as const) {
        const grupos = groupCatalog(caso.servicios, caso.categorias, modes({ services: modo }))
        expect(
          grupos.filter((g) => g.services.length === 0),
          `${caso.nombre} / ${modo}`,
        ).toEqual([])
      }
    }
  })
})

// ── Bloque D: filas ROTAS — el peor caso es "se ve como hoy", nunca una excepción ──────────────
// El contrato de la cabecera del módulo es explícito: recibe filas de un tercero y NO PUEDE validar
// su origen. Los dos consumidores (el panel de la Phase 23 y la página pública de la 24) lo llaman
// DENTRO del render de un RSC, así que un throw acá adentro no lo atrapa nadie: es un 500 en la
// página de reservas — o sea "no se ve nada", el único modo de falla que el módulo declara
// imposible. Hoy la base lo impide (`services.name` y `service_categories.name` son las dos NOT
// NULL), así que esto congela la defensa ANTES de que haya dos superficies dependiendo de ella.
describe('groupCatalog — un nombre roto no tira ni pierde a nadie', () => {
  const nombreRoto = null as unknown as string

  it("'alpha': un SERVICIO con name nulo no rompe en NINGUNA de las dos posiciones", () => {
    // La posición importa, y por eso se prueban las dos: `'b'.localeCompare(null)` coerciona al
    // string "null" y NO tira, mientras que `null.localeCompare('b')` sí. La misma fila rota o
    // rompía la página o se mis-ordenaba en silencio, según dónde hubiera caído en la lectura.
    const categorias = [cat('cortes', { name: 'Cortes' })]
    for (const posicion of [0, 1]) {
      const sano = svc('sano', { name: 'Afeitado', category_id: 'cortes' })
      const roto = svc('roto', { name: nombreRoto, category_id: 'cortes' })
      const servicios = posicion === 0 ? [roto, sano] : [sano, roto]
      expect(
        () => groupCatalog(servicios, categorias, modes({ services: 'alpha' })),
        `posición ${posicion}`,
      ).not.toThrow()
      const grupos = groupCatalog(servicios, categorias, modes({ services: 'alpha' }))
      // Y la conservación no se negocia ni con filas rotas: ninguno de los dos se perdió.
      expect(idsDeTodaLaSalida(grupos).sort(), `posición ${posicion}`).toEqual(['roto', 'sano'])
    }
  })

  it("'alpha': una CATEGORÍA con name nulo no rompe en NINGUNA de las dos posiciones", () => {
    const sana = cat('cortes', { name: 'Cortes' })
    const rota = cat('sin-nombre', { name: nombreRoto })
    const servicios = [
      svc('s-sano', { category_id: 'cortes' }),
      svc('s-roto', { category_id: 'sin-nombre' }),
    ]
    for (const posicion of [0, 1]) {
      const categorias = posicion === 0 ? [rota, sana] : [sana, rota]
      expect(
        () => groupCatalog(servicios, categorias, modes({ categories: 'alpha' })),
        `posición ${posicion}`,
      ).not.toThrow()
      const grupos = groupCatalog(servicios, categorias, modes({ categories: 'alpha' }))
      expect(idsDeTodaLaSalida(grupos).sort(), `posición ${posicion}`).toEqual(['s-roto', 's-sano'])
    }
  })
})

// ── Bloque E: el merge de los MODOS — un campo ausente cae al DEFAULT, no a `undefined` ────────
// ⚠ ESTE BLOQUE NO MUERDE HOY, Y ESTÁ ESCRITO IGUAL A PROPÓSITO. Con `{ ...DEFAULT, ...modes }` un
// campo presente-con-valor-`undefined` PISA el default con `undefined`, y aun así la salida coincide
// con 'custom' — pero por CASUALIDAD: los dos comparadores caen a `porOrden` al final de su cadena
// de `if`, así que hoy "sin modo" y "modo custom" toman el mismo camino. El día que cambie un
// default, o que alguien reemplace esos `if` por un `switch` con guarda exhaustiva, la casualidad se
// termina y el bug sería un orden equivocado para TODOS los negocios, en silencio (la clase exacta
// de cambio que CAT-07 existe para impedir). Esto es el candado que convierte ese accidente en
// contrato: fija el COMPORTAMIENTO OBSERVABLE, no la implementación del merge.
//
// Importa porque es el call site natural de las Phases 23/24: en `lib/types.ts` las dos columnas son
// opcionales, así que `{ categories: business.category_sort_mode, services: business.service_sort_mode }`
// manda `undefined` en las dos cada vez que la fila se leyó con un `select` más angosto.
describe('groupCatalog — un modo ausente o `undefined` cae al DEFAULT_SORT_MODES', () => {
  // Deliberadamente desalineados: el sort_order va al revés del alfabético y del precio, así que si
  // un eje cayera en un modo distinto del default la aserción se vería.
  const categorias = [
    cat('c-zeta', { name: 'Zeta', sort_order: 1 }),
    cat('c-alfa', { name: 'Alfa', sort_order: 2 }),
  ]
  const servicios = [
    svc('z1', { name: 'Zurcido', category_id: 'c-zeta', sort_order: 1, price: 9000 }),
    svc('z2', { name: 'Afeitado', category_id: 'c-zeta', sort_order: 2, price: 1000 }),
    svc('a1', { name: 'Uñas', category_id: 'c-alfa', sort_order: 1, price: 7000 }),
  ]

  const conDefaults = () => groupCatalog(servicios, categorias, DEFAULT_SORT_MODES)

  it('el default es el orden manual: es la referencia contra la que se comparan los demás', () => {
    // Sin esto el bloque entero podría estar comparando dos salidas idénticas por la razón
    // equivocada. 'custom' TIENE que dar el orden de `sort_order`, al revés del alfabético.
    expect(titles(conDefaults())).toEqual(['Zeta', 'Alfa'])
    expect(ids(conDefaults()[0])).toEqual(['z1', 'z2'])
  })

  it('`modes` omitido por completo', () => {
    expect(groupCatalog(servicios, categorias)).toEqual(conDefaults())
  })

  it('`modes` presente pero VACÍO', () => {
    expect(groupCatalog(servicios, categorias, {})).toEqual(conDefaults())
  })

  it('las dos claves PRESENTES con valor `undefined` — el caso que el spread no cubre', () => {
    expect(
      groupCatalog(servicios, categorias, { categories: undefined, services: undefined }),
    ).toEqual(conDefaults())
  })

  it('UNA clave real y la otra `undefined`: la real manda, la ausente cae al default', () => {
    // El caller que sólo conoce un eje no pierde el del otro (es lo que promete el JSDoc).
    const soloAlfaEnCategorias = groupCatalog(servicios, categorias, {
      categories: 'alpha',
      services: undefined,
    })
    expect(titles(soloAlfaEnCategorias)).toEqual(['Alfa', 'Zeta'])
    // ...y los servicios quedaron en el orden manual, no en alfabético ni por precio.
    expect(ids(soloAlfaEnCategorias[1])).toEqual(['z1', 'z2'])

    const soloPrecioEnServicios = groupCatalog(servicios, categorias, {
      categories: undefined,
      services: 'price',
    })
    expect(titles(soloPrecioEnServicios)).toEqual(['Zeta', 'Alfa'])
    expect(ids(soloPrecioEnServicios[0])).toEqual(['z2', 'z1'])
  })
})

// ── Plan 23-04: `sortCategories`, la misma regla del eje categorías expuesta para el organizador ──
// El panel pinta TODAS las categorías (también las vacías, que groupCatalog omite) y tiene que
// pintarlas en el mismo orden que ve el cliente. Estos tests congelan que es la MISMA regla, no otra.
describe('sortCategories — el eje categorías, con las vacías incluidas', () => {
  const categorias = [
    cat('c-unas', { name: 'Uñas', sort_order: 0 }),
    cat('c-color', { name: 'color', sort_order: 1 }),
    cat('c-barb', { name: 'Barbería', sort_order: 2 }),
  ]

  it("'custom': por sort_order, y el empate conserva la entrada (NO desempata por nombre)", () => {
    expect(sortCategories(categorias, 'custom').map(c => c.id)).toEqual(['c-unas', 'c-color', 'c-barb'])
    const empatadas = [cat('b', { name: 'B' }), cat('a', { name: 'A' })]
    expect(sortCategories(empatadas, 'custom').map(c => c.id)).toEqual(['b', 'a'])
  })

  it("'alpha': por nombre en español, insensible a capitalización", () => {
    expect(sortCategories(categorias, 'alpha').map(c => c.id)).toEqual(['c-barb', 'c-color', 'c-unas'])
  })

  it('modo ausente cae al default (custom)', () => {
    expect(sortCategories(categorias).map(c => c.id)).toEqual(['c-unas', 'c-color', 'c-barb'])
    expect(sortCategories(categorias, undefined).map(c => c.id)).toEqual(['c-unas', 'c-color', 'c-barb'])
  })

  it('incluye las categorías VACÍAS y NO muta la entrada (CAT-06: no hay por dónde borrar el orden)', () => {
    const antes = categorias.map(c => ({ ...c }))
    const alfa = sortCategories(categorias, 'alpha')
    expect(alfa).toHaveLength(3)
    expect(alfa).not.toBe(categorias)
    expect(categorias).toEqual(antes)
    // Ida y vuelta: volver a 'custom' devuelve el arreglo del dueño idéntico.
    expect(sortCategories(categorias, 'custom').map(c => c.id)).toEqual(['c-unas', 'c-color', 'c-barb'])
  })

  it('un nombre roto no tira en ninguna posición', () => {
    const rotas = [cat('x', { name: null as unknown as string }), cat('y', { name: 'Alfa' })]
    expect(() => sortCategories(rotas, 'alpha')).not.toThrow()
    expect(() => sortCategories([...rotas].reverse(), 'alpha')).not.toThrow()
  })

  it('es LA MISMA regla que usa groupCatalog: los títulos salen en el mismo orden', () => {
    const servicios = categorias.map(c => svc(`s-${c.id}`, { category_id: c.id }))
    for (const mode of ['custom', 'alpha'] as const) {
      const titulos = groupCatalog(servicios, categorias, { categories: mode }).map(g => g.title)
      expect(titulos).toEqual(sortCategories(categorias, mode).map(c => c.name))
    }
  })
})

// ── Phase 24 / plan 24-03 — la barra de chips que filtra (D-16 / G-24-6) ──────────────────────
// Estos casos existen para que la regla NO se afirme leyendo el JSX con un grep. La lógica es pura,
// así que se prueba directo: el umbral, el estado inicial y el filtro con sus dos bordes.
//
// ⚠ EL CONTROL NEGATIVO de este bloque es el caso de CERO y de UNA categoría: son los que muerden.
// "Con 2 categorías hay chips" pasaría igual con una barra que se muestra siempre.
describe('la barra de chips del catálogo público (D-16)', () => {
  const dos = [cat('c-corte', { name: 'Corte' }), cat('c-color', { name: 'Color' })]
  /** N servicios de una categoría, para cruzar (o no) el umbral de servicios sin ruido. */
  const svcs = (n: number, categoryId: string | null, desde = 0) =>
    Array.from({ length: n }, (_, i) => svc(`s${desde + i + 1}`, categoryId ? { category_id: categoryId } : {}))
  /** Dos grupos y SEIS servicios: el caso mínimo en que la barra corresponde. */
  const conBarra = groupCatalog([...svcs(3, 'c-corte'), ...svcs(3, 'c-color', 3)], dos)

  it('los umbrales son CONSTANTES del módulo: 2 grupos y 6 servicios', () => {
    // Los dos números son elecciones explícitas del dueño (D-16, revisada el 2026-09-28). Viven
    // nombrados para que moverlos cueste una línea; este caso es el que hace que moverlos no pase
    // desapercibido.
    expect(CHIPS_MIN_GROUPS).toBe(2)
    expect(CHIPS_MIN_SERVICES).toBe(6)
  })

  it('con CERO categorías no hay barra: la pantalla es la de hoy (CAT-07 / G-24-2)', () => {
    // El caso de TODOS los negocios de producción el día del deploy. Cae por el umbral de GRUPOS
    // (identidad ⇒ un solo grupo sin título), no por una rama especial. La barra no se renderiza
    // vacía: no se renderiza.
    expect(catalogChips(groupCatalog(svcs(10, null), []))).toEqual([])
  })

  it('con categorías creadas pero NINGUNA asignada tampoco: una barra con sólo "Todo" no filtra nada', () => {
    // `groupCatalog` cae en su camino de identidad (un grupo sin título) por más servicios que haya.
    const identidad = groupCatalog(svcs(10, null), dos)
    expect(identidad).toHaveLength(1)
    expect(identidad[0].title).toBeNull()
    expect(catalogChips(identidad)).toEqual([])
  })

  it('DOS grupos pero POCOS servicios: no hay barra, el catálogo ya entra en una pantalla', () => {
    // ⚠ El control negativo del segundo umbral, y el caso que la PRIMERA versión de D-16 hacía mal:
    // contando categorías, dos categorías con cuatro servicios mostraban una barra sobre un catálogo
    // que se ve entero.
    const pocos = groupCatalog([...svcs(2, 'c-corte'), ...svcs(2, 'c-color', 2)], dos)
    expect(pocos).toHaveLength(2)
    expect(catalogChips(pocos)).toEqual([])
  })

  it('UNA categoría + "Otros" con bastantes servicios SÍ tiene barra (el caso que encontró el dueño)', () => {
    // ⚠ Éste es el que la versión del 2026-09-22 hacía mal al revés: una categoría con diez
    // servicios más cinco sueltos es una página eterna con dos grupos filtrables, y el umbral por
    // CATEGORÍAS la dejaba sin barra. Son los GRUPOS los que dicen "hay entre qué elegir".
    const una = [cat('c-corte', { name: 'Corte' })]
    const grupos = groupCatalog([...svcs(10, 'c-corte'), ...svcs(5, null, 10)], una)
    expect(grupos).toHaveLength(2)
    const chips = catalogChips(grupos)
    expect(chips.map(c => c.title)).toEqual([ALL_GROUPS_TITLE, 'Corte', OTHER_GROUP_TITLE])
  })

  it('se cuentan los servicios de TODOS los grupos, no los del más grande', () => {
    // Tres y tres llegan a seis. Si contara sólo el grupo mayor, este caso no tendría barra.
    expect(catalogChips(conBarra)).not.toEqual([])
  })

  it('cruzando el umbral: con cinco servicios no hay barra y con seis sí', () => {
    const cinco = groupCatalog([...svcs(3, 'c-corte'), ...svcs(2, 'c-color', 3)], dos)
    const seis = groupCatalog([...svcs(3, 'c-corte'), ...svcs(3, 'c-color', 3)], dos)
    expect(catalogChips(cinco)).toEqual([])
    expect(catalogChips(seis)).not.toEqual([])
  })

  it('"Todo" PRIMERO y después un chip por grupo, en el orden del dueño', () => {
    // El orden de los chips no se decide acá: sale de `groupCatalog`, que es la fuente única del
    // orden en los dos ejes (D-09). Si divergiera, el dueño ordenaría una cosa y el cliente vería
    // otra sin ningún error.
    const chips = catalogChips(conBarra)
    expect(chips.map(c => c.title)).toEqual([ALL_GROUPS_TITLE, 'Corte', 'Color'])
    expect(chips[0].key).toBe(ALL_GROUPS_KEY)
    expect(chips.slice(1).map(c => c.key)).toEqual(conBarra.map(catalogGroupKey))
  })

  it('"Otros" es un chip más y va último, con la clave sentinela de los sueltos', () => {
    const grupos = groupCatalog([...svcs(3, 'c-corte'), ...svcs(3, 'c-color', 3), ...svcs(1, null, 6)], dos)
    const chips = catalogChips(grupos)
    expect(chips.map(c => c.title)).toEqual([ALL_GROUPS_TITLE, 'Corte', 'Color', OTHER_GROUP_TITLE])
    expect(chips[chips.length - 1].key).toBe(LOOSE_GROUP_KEY)
  })

  it('el estado inicial (`Todo`) devuelve el catálogo COMPLETO y la MISMA referencia', () => {
    // La invariante que sostiene CAT-09: al entrar no hay nada escondido y reservar no cuesta un
    // click más. La identidad referencial además evita un re-render del catálogo por nada.
    expect(filterCatalogGroups(conBarra, ALL_GROUPS_KEY)).toBe(conBarra)
  })

  it('un chip de grupo deja EXACTAMENTE ese grupo, con sus servicios intactos', () => {
    const soloColor = filterCatalogGroups(conBarra, 'c-color')
    expect(soloColor).toHaveLength(1)
    expect(soloColor[0].title).toBe('Color')
    expect(soloColor[0].services.map(s => s.id)).toEqual(['s4', 's5', 's6'])
  })

  it('el chip de "Otros" filtra por la sentinela, no por un id nulo', () => {
    const grupos = groupCatalog([...svcs(3, 'c-corte'), ...svcs(3, 'c-color', 3), ...svcs(1, null, 6)], dos)
    const sueltos = filterCatalogGroups(grupos, LOOSE_GROUP_KEY)
    expect(sueltos).toHaveLength(1)
    expect(sueltos[0].title).toBe(OTHER_GROUP_TITLE)
    expect(sueltos[0].services.map(s => s.id)).toEqual(['s7'])
  })

  it('una clave DESCONOCIDA devuelve el catálogo entero, nunca cero grupos (filtra, no apaga)', () => {
    // El dueño borró la categoría en otra pestaña entre dos renders. El peor caso posible es "se ve
    // como hoy" — el mismo modo de falla que ya mordió dos veces en este repo (CR-01 Phase 20/21).
    expect(filterCatalogGroups(conBarra, 'c-borrada')).toEqual(conBarra)
    expect(filterCatalogGroups(conBarra, '')).toEqual(conBarra)
  })

  it('no muta la entrada: filtrar es leer', () => {
    const antes = JSON.stringify(conBarra)
    filterCatalogGroups(conBarra, 'c-color')
    catalogChips(conBarra)
    expect(JSON.stringify(conBarra)).toBe(antes)
  })
})
