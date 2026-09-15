import { describe, it, expect } from 'vitest'
import { groupCatalog, OTHER_GROUP_TITLE } from '@/lib/service-categories'
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
  ]

  for (const modo of ['custom', 'alpha', 'price'] as const) {
    it(`la unión de los grupos es EXACTAMENTE la entrada, en los 6 casos (services: '${modo}')`, () => {
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
