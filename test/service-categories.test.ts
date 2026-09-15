import { describe, it, expect } from 'vitest'
import { groupCatalog, OTHER_GROUP_TITLE } from '@/lib/service-categories'
import type { CatalogCategory, CatalogService, CatalogSortModes } from '@/lib/service-categories'

// ── Phase 22 (el modelo del catálogo) — tests PUROS de lib/service-categories.ts ──────────────
// Espejan test/time-block-services.test.ts y test/staff-services.test.ts: describe/it/expect,
// import desde @/lib/..., SIN Supabase ni credenciales. Esta suite NO PUEDE importar './env', ni
// los fixtures, ni '@supabase/supabase-js': si lo hiciera, test/suite-split.ts la mandaría al
// carril serializado `db` y dejaría de correr sin credenciales. Es pura y tiene que seguir siéndolo
// (el guard test/suite-split.test.ts lo verifica).
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
