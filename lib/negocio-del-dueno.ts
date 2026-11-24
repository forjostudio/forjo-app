import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── El negocio del dueño de la sesión (quick 261124-neg) ─────────────────────────────────────────
//
// POR QUÉ EXISTE. El panel leía el negocio con `.eq('owner_id', user.id).single()` y, si no volvía
// `data`, mandaba a `/onboarding`. `.single()` devuelve error en tres casos que el código mezclaba:
//   1. 0 filas: el dueño de verdad no tiene negocio → el único caso que corresponde al wizard.
//   2. 2+ filas: `owner_id` no es unique → el dueño no entraba nunca (loop panel → wizard →
//      `ya-existia` → integraciones → panel). El segundo negocio ya lo frena `lib/onboarding-alta.ts`
//      (rama `ya-existia`), pero quien ya tenía dos quedaba afuera.
//   3. un error de red o de PostgREST → un corte momentáneo mandaba al dueño a rehacer el wizard.
//
// EL ARREGLO. `order('created_at', asc) + limit(1) + maybeSingle()` separa «0 filas, sin error» de
// «falló la lectura», y con 2+ filas elige siempre el MÁS VIEJO: es determinístico, así que el layout
// y todas las pantallas resuelven el mismo negocio (el original; un duplicado del loop viejo siempre es
// posterior). Antecedente: WR-03 de `app/(onboarding)/onboarding/integraciones/page.tsx`.
//
// AISLAMIENTO POR TENANT. `ownerId` sale SIEMPRE de `supabase.auth.getUser()` de la sesión (nunca de
// un parámetro del cliente) y `supabase` es SIEMPRE el cliente de sesión, con RLS activo. Nunca el
// admin: `order` + `limit(1)` sólo elige entre negocios del MISMO dueño.
//
// TIPADO. La fila se deriva del literal de `columnas` con el MISMO `select` del cliente (`FilaDe<Q>`),
// así que cada pantalla conserva el tipo de antes (`'*'` → `any`, `'id'` → `{ id: any }`). Congelado con
// `expectTypeOf` en `test/negocio-del-dueno.test.ts`.
// ⚠ El retorno va ANOTADO con `FilaDe<Q>` y no inferido: con el retorno inferido, `tsc` incremental (el
// `incremental: true` de tsconfig.json) se queda sin memoria al serializar la firma del archivo en el
// .tsbuildinfo —expande el tipo genérico entero de postgrest—, aun con 10 GB de heap. Medido: sin
// anotación, `tsc --noEmit` muere por heap; con `--incremental false` sale 0. El alias lo mantiene corto.

type ConsultaDeNegocios = ReturnType<SupabaseClient['from']>
declare const consulta: ConsultaDeNegocios
/** La fila que devuelve `.select(Q)` del cliente de sesión, tal cual la tipaba el `.single()` de antes. */
export type FilaDe<Q extends string> = NonNullable<Awaited<ReturnType<typeof consulta.select<Q>>>['data']>[number]

export type NegocioDelDueno<T> =
  | { ok: true; business: T }
  | { ok: false; reason: 'sin-negocio' | 'error' }

/**
 * La lectura del negocio falló (red o PostgREST). La lanzan las pantallas del panel para que la
 * atrape `app/(dashboard)/error.tsx`. Mensaje genérico a propósito: nunca lleva el error de Supabase.
 */
export class LecturaDelNegocioFallida extends Error {
  constructor() {
    super('No se pudo leer el negocio del dueño.')
    this.name = 'LecturaDelNegocioFallida'
  }
}

/** El negocio del dueño, discriminado: el llamador decide qué hacer con «sin negocio» y con «error». */
export async function negocioDelDueno<Q extends string>(
  supabase: SupabaseClient,
  ownerId: string,
  columnas: Q,
): Promise<NegocioDelDueno<FilaDe<Q>>> {
  const { data, error } = await supabase
    .from('businesses')
    .select(columnas)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Sólo el código (o el mensaje si no hay código), nunca el objeto entero.
    console.error('[negocio-del-dueno] leer negocio falló:', error.code ?? error.message)
    return { ok: false, reason: 'error' }
  }
  if (!data) return { ok: false, reason: 'sin-negocio' }
  return { ok: true, business: data as FilaDe<Q> }
}

/**
 * La política de las pantallas del panel: 0 filas → wizard; error → lanza `LecturaDelNegocioFallida`
 * (NUNCA al wizard: no verifica si ya hay negocio); 1 fila → el negocio. `redirect` lanza
 * NEXT_REDIRECT: no envolver en try/catch.
 */
export async function negocioDelPanel<Q extends string>(
  supabase: SupabaseClient,
  ownerId: string,
  columnas: Q,
): Promise<FilaDe<Q>> {
  const negocio = await negocioDelDueno(supabase, ownerId, columnas)
  if (!negocio.ok) {
    if (negocio.reason === 'sin-negocio') redirect('/onboarding')
    throw new LecturaDelNegocioFallida()
  }
  return negocio.business
}
