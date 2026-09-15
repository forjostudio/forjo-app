import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, seedService, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { groupCatalog, OTHER_GROUP_TITLE, type CatalogCategory, type CatalogService } from '@/lib/service-categories'

// ── El modelo del catálogo, medido sobre el CAMINO REAL (CAT-06/CAT-07, migr. 078) ──────────
//
// POR QUÉ ESTE ARCHIVO PEGA CONTRA LA BASE Y NO ES UN TEST PURO. La promesa de CAT-07 —"un negocio
// sin categorías ve exactamente la lista de hoy"— no se puede probar sobre un array inventado: lo
// que hay que probar es que el recorrido COMPLETO (tabla → vista acotada anónima → módulo puro →
// catálogo agrupado) devuelve la misma lista, en el mismo orden y sin títulos. Un test puro sólo
// probaría que el módulo hace lo que dice; lo que puede romper CAT-07 está en las OTRAS dos patas:
// una vista con la opción de invocador que devuelve 0 filas en silencio, o una columna que no viajó.
//
// `import { hasSupabaseCreds } from './env'` NO es decorativo: es el marcador que `test/suite-split`
// usa para mandar esta suite al carril `db` (serializado). Sin él, este archivo correría en paralelo
// contra el Supabase local y contaminaría a sus vecinos.
//
// ⚠ EL CLIENTE DE LAS ASERCIONES ES `anon` PURO — anon key y SIN sesión, el mismo rol que atiende
// `/[slug]`. El service-role del fixture se usa SÓLO para sembrar (crear categorías, asignarlas):
// asertar con él daría un falso verde, porque bypassa RLS y no pasa por la vista.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// La fila que devuelve `public_services`: el shape que la Phase 24 le va a pasar a `groupCatalog`.
type PublicServiceRow = CatalogService & { business_id: string }

describe.skipIf(!hasSupabaseCreds)('modelo del catálogo: service_categories → vista anon → groupCatalog', () => {
  let seeded: SeededTenant
  let anon: SupabaseClient
  let categoryId: string
  const CATEGORY_NAME = '__test_cat_Color'
  const CATEGORY_SORT = 3

  // Lee las dos vistas públicas como el RSC: cliente anónimo + `.eq('business_id', ...)`.
  const leerCatalogoPublico = async () => {
    const cats = await anon
      .from('public_service_categories')
      .select('id, business_id, name, sort_order')
      .eq('business_id', seeded.businessId)
    if (cats.error) throw new Error(`lectura anon de public_service_categories falló: ${cats.error.message}`)

    const svcs = await anon
      .from('public_services')
      .select('id, business_id, name, price, category_id, sort_order')
      .eq('business_id', seeded.businessId)
    if (svcs.error) throw new Error(`lectura anon de public_services falló: ${svcs.error.message}`)

    return {
      categories: (cats.data ?? []) as (CatalogCategory & { business_id: string })[],
      services: (svcs.data ?? []) as PublicServiceRow[],
    }
  }

  beforeAll(async () => {
    seeded = await seedOneTenant()
    anon = createClient(url, anonKey, { auth: { persistSession: false } })

    // GUARD anti-falso-verde (Pitfall 12 de isolation.test.ts): si el cliente de aserción quedara
    // configurado con la service-role key, leería bypasseando RLS y la vista — y este archivo
    // dejaría de probar lo único que vino a probar.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }
  })

  afterAll(async () => {
    if (seeded) await teardownOneTenant(seeded)
  })

  it('CAT-07: con CERO categorías, el catálogo es la lista de hoy — misma cantidad, mismo orden, sin títulos', async () => {
    // El CONTROL NEGATIVO, y va PRIMERO a propósito: es el estado de TODOS los negocios de
    // producción el día que se aplique la 078, y el único caso que puede romper la promesa que
    // desbloquea el milestone entero.
    const { categories, services } = await leerCatalogoPublico()

    expect(categories).toEqual([]) // cero backfill: la migración no siembra ni una fila
    expect(services.length).toBeGreaterThan(0) // si no, el caso no probaría nada

    const grupos = groupCatalog(services, categories)

    expect(grupos).toHaveLength(1)
    expect(grupos[0].categoryId).toBeNull()
    // `title` nulo es lo que hace que el consumidor NO PUEDA pintar un encabezado: la regla "sin
    // títulos" vive en el dato, no en un `if` del JSX.
    expect(grupos[0].title).toBeNull()
    // Misma cantidad Y mismo orden que lo que devolvió la vista: la identidad, no "los mismos ids".
    expect(grupos[0].services.map((s) => s.id)).toEqual(services.map((s) => s.id))
  })

  it('el camino completo: una categoría nace en la base, sale por la vista anónima y llega al catálogo agrupado', async () => {
    // Se siembra con service-role (NO es la aserción): es la herramienta correcta para crear
    // fixtures. Lo que se asierta es lo que el ANÓNIMO ve después.
    const insCat = await seeded.admin
      .from('service_categories')
      .insert({ business_id: seeded.businessId, name: CATEGORY_NAME, sort_order: CATEGORY_SORT })
      .select('id')
      .single()
    if (insCat.error || !insCat.data) throw new Error(`insert de categoría falló: ${insCat.error?.message}`)
    categoryId = insCat.data.id

    const updSvc = await seeded.admin
      .from('services')
      .update({ category_id: categoryId })
      .eq('id', seeded.serviceId)
      .eq('business_id', seeded.businessId)
      .select('id')
    if (updSvc.error) throw new Error(`asignar la categoría al servicio falló: ${updSvc.error.message}`)
    expect((updSvc.data ?? []).length).toBe(1) // 0 filas vuelve SIN error en PostgREST: exigir la fila

    const { categories, services } = await leerCatalogoPublico()

    // (a) La vista acotada le devuelve FILAS REALES al anónimo. Si estuviera creada con la opción de
    //     invocador, acá habría 0 filas y el fallo sería indistinguible de "no hay categorías" —
    //     exactamente el modo de falla silencioso que T-22-02 existe para atrapar.
    expect(categories).toHaveLength(1)
    expect(categories[0].name).toBe(CATEGORY_NAME)
    expect(categories[0].sort_order).toBe(CATEGORY_SORT)

    // (b) La columna nueva viajó por `public_services` (si el CREATE OR REPLACE VIEW no la hubiera
    //     agregado, o PostgREST no hubiera recargado su cache, el `select` de arriba erroraría).
    const elServicio = services.find((s) => s.id === seeded.serviceId)
    expect(elServicio?.category_id).toBe(categoryId)

    // (c) Y el módulo puro lo agrupa bajo su título.
    const grupos = groupCatalog(services, categories)
    expect(grupos).toHaveLength(1)
    expect(grupos[0].categoryId).toBe(categoryId)
    expect(grupos[0].title).toBe(CATEGORY_NAME)
    expect(grupos[0].services.map((s) => s.id)).toEqual([seeded.serviceId])
  })

  it('D-03: un servicio SIN categoría no desaparece — va al grupo de los sueltos, último', async () => {
    // La invariante de conservación, MEDIDA: el modo de falla que ya mordió dos veces en este repo
    // es un helper que devuelve "no" para todo y apaga el catálogo entero. Acá se prueba que la
    // suma de lo agrupado es igual a lo que devolvió la vista: ni un servicio se pierde.
    const sueltoId = await seedService(seeded, { name: '__test_svc_suelto' })

    const { categories, services } = await leerCatalogoPublico()
    expect(services).toHaveLength(2)

    const grupos = groupCatalog(services, categories)

    expect(grupos).toHaveLength(2)
    expect(grupos[0].title).toBe(CATEGORY_NAME)
    // Los sueltos van ÚLTIMOS y con el título compartido.
    expect(grupos[1].categoryId).toBeNull()
    expect(grupos[1].title).toBe(OTHER_GROUP_TITLE)
    expect(grupos[1].services.map((s) => s.id)).toEqual([sueltoId])

    const total = grupos.reduce((acc, g) => acc + g.services.length, 0)
    expect(total).toBe(services.length)
  })
})
