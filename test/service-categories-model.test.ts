import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
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
//
// ⚠ CADA CASO SIEMBRA LO SUYO Y NO ASUME NADA DE LO QUE DEJÓ OTRO. Es la convención explícita del
// archivo hermano de esta familia (`test/isolation.test.ts`, caso 8: "order-independent, como el
// resto del archivo... partimos de `category_id = null` sin asumir qué dejó otro caso"), y la razón
// es práctica: un caso que se apoya en el estado del anterior falla por motivos que no tienen NADA
// que ver con lo que vino a probar —corrido solo con `-t`, bajo `--sequence.shuffle`, o después de
// que su predecesor se rompa—, y ese ruido cuesta más que sembrar dos filas de más. El `afterEach`
// borra las categorías del negocio, y el `ON DELETE SET NULL (category_id)` de la FK compuesta de
// la 078 devuelve solo los servicios a "sin categoría".

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// La fila que devuelve `public_services`: el shape que la Phase 24 le va a pasar a `groupCatalog`.
type PublicServiceRow = CatalogService & { business_id: string }

describe.skipIf(!hasSupabaseCreds)('modelo del catálogo: service_categories → vista anon → groupCatalog', () => {
  let seeded: SeededTenant
  let anon: SupabaseClient
  const CATEGORY_NAME = '__test_cat_Color'
  const CATEGORY_SORT = 3

  // Siembra con SERVICE-ROLE — no es la aserción, es la herramienta correcta para crear fixtures.
  // Lo que se asierta siempre es lo que ve el ANÓNIMO después.
  const seedCategoria = async (name = CATEGORY_NAME, sort = CATEGORY_SORT): Promise<string> => {
    const ins = await seeded.admin
      .from('service_categories')
      .insert({ business_id: seeded.businessId, name, sort_order: sort })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`insert de categoría falló: ${ins.error?.message}`)
    return ins.data.id as string
  }

  const asignarCategoria = async (serviceId: string, catId: string | null) => {
    const upd = await seeded.admin
      .from('services')
      .update({ category_id: catId })
      .eq('id', serviceId)
      .eq('business_id', seeded.businessId)
      .select('id')
    if (upd.error) throw new Error(`asignar la categoría al servicio falló: ${upd.error.message}`)
    // 0 filas vuelve SIN error en PostgREST: exigir la fila o el fixture mentiría en silencio.
    expect(upd.data ?? []).toHaveLength(1)
  }

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
    // GUARD anti-falso-verde (Pitfall 12 de isolation.test.ts): si el cliente de aserción quedara
    // configurado con la service-role key, leería bypasseando RLS y la vista — y este archivo
    // dejaría de probar lo único que vino a probar.
    // ⚠ VA PRIMERO, antes de sembrar y antes de construir el cliente: con un entorno mal configurado
    // no hay que dejar fixtures escritos ni clientes creados, hay que abortar.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }

    seeded = await seedOneTenant()
    anon = createClient(url, anonKey, { auth: { persistSession: false } })
  })

  // Deja al negocio SIN categorías después de cada caso, que es el estado de producción. El
  // `ON DELETE SET NULL (category_id)` de la 078 devuelve los servicios a "sin categoría" solo, así
  // que ningún caso hereda una asignación que no hizo él.
  afterEach(async () => {
    if (!seeded) return
    const del = await seeded.admin
      .from('service_categories')
      .delete()
      .eq('business_id', seeded.businessId)
      .select('id')
    if (del.error) throw new Error(`limpieza de categorías falló: ${del.error.message}`)
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
    const categoryId = await seedCategoria()
    await asignarCategoria(seeded.serviceId, categoryId)

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

    // (c) Y el módulo puro lo agrupa bajo su título. Se busca EL grupo de la categoría sembrada en
    //     vez de asumir `grupos[0]` y una longitud total: el negocio puede tener otros servicios
    //     sueltos —los siembre este caso o no— y eso no es lo que este caso vino a probar.
    const grupos = groupCatalog(services, categories)
    const suGrupo = grupos.find((g) => g.categoryId === categoryId)
    expect(suGrupo?.title).toBe(CATEGORY_NAME)
    expect(suGrupo?.services.map((s) => s.id)).toEqual([seeded.serviceId])
  })

  it('D-03: un servicio SIN categoría no desaparece — va al grupo de los sueltos, último', async () => {
    // La invariante de conservación, MEDIDA: el modo de falla que ya mordió dos veces en este repo
    // es un helper que devuelve "no" para todo y apaga el catálogo entero. Acá se prueba que la
    // suma de lo agrupado es igual a lo que devolvió la vista: ni un servicio se pierde.
    // Siembra propia: la categoría, la asignación y el servicio suelto los crea ESTE caso. No se
    // apoya en lo que dejó el anterior ni en un total acumulado de servicios.
    const categoryId = await seedCategoria()
    await asignarCategoria(seeded.serviceId, categoryId)
    const sueltoId = await seedService(seeded, { name: `__test_svc_suelto_${crypto.randomUUID().slice(0, 8)}` })

    const { categories, services } = await leerCatalogoPublico()

    const grupos = groupCatalog(services, categories)

    // El servicio CON categoría está bajo su título...
    const suGrupo = grupos.find((g) => g.categoryId === categoryId)
    expect(suGrupo?.title).toBe(CATEGORY_NAME)
    expect(suGrupo?.services.map((s) => s.id)).toContain(seeded.serviceId)

    // ...y el SUELTO no desapareció: cayó en el grupo de los sueltos, que va ÚLTIMO.
    const ultimo = grupos[grupos.length - 1]
    expect(ultimo.categoryId).toBeNull()
    expect(ultimo.title).toBe(OTHER_GROUP_TITLE)
    expect(ultimo.services.map((s) => s.id)).toContain(sueltoId)

    // La conservación, medida contra lo que devolvió LA VISTA (no contra una constante): la suma de
    // lo agrupado es exactamente lo que llegó, sin repetidos.
    const idsAgrupados = grupos.flatMap((g) => g.services.map((s) => s.id))
    expect(idsAgrupados).toHaveLength(services.length)
    expect(new Set(idsAgrupados).size).toBe(services.length)
    expect([...idsAgrupados].sort()).toEqual([...services.map((s) => s.id)].sort())
  })

  it("CAT-01 EN LA BASE: 'Color' y 'Color ' no pueden convivir en el mismo negocio (migr. 079)", async () => {
    // La 078 justificó su índice único diciendo que CAT-01 quedaba resuelto EN LA BASE y no en la
    // pantalla, con el daño escrito: dos títulos que el cliente lee como UNO. Pero `lower(name)` a
    // secas sólo cerraba la capitalización — 'Color' y 'Color ' entraban las dos, y el espacio de
    // borde es INVISIBLE en HTML, o sea el mismo daño por la variante que nadie diagnostica
    // mirando. La 079 normaliza con `btrim`. Se siembra con service-role a propósito: bypassa la
    // RLS pero NO los constraints, que es exactamente lo que este caso viene a medir.
    await seedCategoria('__test_cat_Unico', 0)

    const variantes = [
      '__test_cat_Unico ', // espacio al final (el que la 078 dejaba pasar)
      ' __test_cat_Unico', // espacio al principio
      '  __test_cat_Unico  ', // de los dos lados
      '__TEST_CAT_UNICO', // capitalización (esta la 078 ya la cerraba)
      '  __TEST_CAT_unico ', // las dos cosas juntas
    ]
    for (const variante of variantes) {
      const dup = await seeded.admin
        .from('service_categories')
        .insert({ business_id: seeded.businessId, name: variante })
        .select('id')
      expect(dup.error?.code, JSON.stringify(variante)).toBe('23505')
    }
  })

  it('un encabezado público NO puede quedar EN BLANCO (migr. 079)', async () => {
    // Sin el CHECK, un `name` vacío o de puros espacios era insertable: un título fantasma arriba de
    // un grupo de servicios, y el cliente sin forma de saber qué está mirando. La Phase 23 es la que
    // va a traducir este 23514 a un error de formulario.
    for (const enBlanco of ['', '   ', '\t']) {
      const ins = await seeded.admin
        .from('service_categories')
        .insert({ business_id: seeded.businessId, name: enBlanco })
        .select('id')
      expect(ins.error?.code, JSON.stringify(enBlanco)).toBe('23514')
    }
  })
})
