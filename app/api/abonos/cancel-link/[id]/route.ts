import { createClient } from '@/lib/supabase/server'
import type { NextRequest } from 'next/server'

// ── LINK DE BAJA de UNA serie, resuelto ON-DEMAND para el dueño (D-17, WR-07) ───────────────────
//
// PARA QUÉ EXISTE. El dueño necesita poder mandarle a su cliente el link de baja de su turno fijo por
// WhatsApp (D-17): el caso frecuente en canchas es el cliente sin mail cargado, o el que perdió el
// mail de alta. El botón "Copiar link de baja" del detalle del abono es la única superficie que lo
// ofrece, y este endpoint es lo que lo alimenta.
//
// POR QUÉ ES ON-DEMAND Y NO PARTE DEL LISTADO (WR-07). Hasta acá la credencial de baja de TODAS las
// series del negocio — activas y archivadas — viajaba en el payload RSC de /abonos en CADA render,
// aunque el dueño no abriera ningún detalle. Eso la dejaba en el HTML serializado, en la caché del
// navegador, en el bfcache y en cualquier captura de DOM: session replay, reporte de errores,
// screenshot de soporte, sesión de impersonación. La credencial NO rota ni vence (D-09), así que una
// fuga es permanente. D-17 pedía que el dueño pudiera COPIAR un link, no que el navegador tuviera
// siempre todos. Acá sale UNA sola, y sólo cuando el dueño la pide explícitamente (D-25).
//
// POR QUÉ ESTA RUTA. El segmento dinámico vive bajo un segmento estático propio (`cancel-link/[id]`)
// en vez de ser un `[id]` hermano de los `cancel/` y `create/` que ya cuelgan de `app/api/abonos/`.
// Next resuelve estático antes que dinámico, así que la otra forma también funcionaría, pero deja una
// ambigüedad estructural sobre una superficie de API viva a cambio de nada.
//
// AISLAMIENTO. Corre con la SESIÓN DEL DUEÑO — cliente anon + RLS — y el negocio se resuelve por
// owner_id del actor, nunca por un dato de la request. El service role está PROHIBIDO en esta ruta:
// `abonos` ya tiene RLS owner-only y el filtro explícito por business_id es la segunda capa
// (defensa en profundidad, T-07-45). Una serie inexistente y una de otro negocio devuelven
// EXACTAMENTE el mismo 404 genérico: no se revela la existencia de una serie ajena (D-22/D-23).
//
// ES UN ENDPOINT DE UN SOLO DATO. Devuelve la `url` y nada más: ni nombre de cliente, ni estado, ni
// fechas, ni datos de otras series (T-07-46). Y es de LECTURA: no tiene ninguna escritura (T-07-47).
//
// UNA SERIE DADA DE BAJA NO ENTREGA SU LINK (D-09, T-14-07). El token no rota ni vence: cada entrega es
// permanente. Una serie con status 'cancelled' es terminal (D-04) y no tiene ningún uso legítimo para su
// credencial — repartirla es dejar suelta para siempre una llave que ya no sirve para nada. El filtro
// viaja DENTRO de la query (paso 4) y no en un `if` sobre la fila leída, a propósito: así el estado ni
// siquiera se selecciona, el endpoint sigue siendo de una sola columna (T-07-46) y no queda ninguna
// rama de respuesta donde una versión futura pueda filtrar el MOTIVO del rechazo. El rechazo comparte
// cuerpo y status con el caso ajeno/inexistente también a propósito (T-14-08): distinguir "existe pero
// está muerta" de "no existe / no es tuya" convertiría al endpoint en un ORÁCULO DE EXISTENCIA, que es
// exactamente lo que D-09 y D-22/D-23 prohíben. El corte es SOLO sobre 'cancelled': una serie
// 'completed' (ya asignó sus N sesiones) puede tener turnos por delante y su cliente sigue necesitando
// la vía de baja (T-14-11).
//
// NINGUNA RESPUESTA DE ESTA RUTA SE PUEDE ALMACENAR (CR-02). Next no cachea los Route Handlers GET del
// lado del SERVIDOR, pero eso no dice nada sobre el store HTTP del navegador ni sobre una caché
// compartida intermedia: una respuesta sin directivas queda a merced del default de la plataforma, y un
// `public, max-age=0, must-revalidate` autoriza a una caché compartida a GUARDAR el cuerpo — que acá es
// justamente la credencial permanente. Sacarla del payload RSC para dejarla en una respuesta HTTP
// almacenable no cerraría nada. La cabecera va también en los 401/404: son baratos, y evitan que un
// rechazo cacheado enmascare un cambio de estado posterior de la serie. Es el MISMO molde que el repo ya
// usa en endpoints menos sensibles (`booking/availability`, `onboarding/slug-available`, `agent/context`,
// `agent/inbox/state`): `{ headers: { 'Cache-Control': 'no-store' } }`, sin inventar uno nuevo.
const NO_STORE = { 'Cache-Control': 'no-store' } as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // (1) Next 16: `params` es una Promise y hay que await-earla. Sin id (o vacío) se responde el MISMO
  // cuerpo que el caso ajeno — los tres caminos de abajo son indistinguibles desde afuera.
  const { id } = await params
  if (!id || !id.trim()) return Response.json({ ok: false, error: 'not_found' }, { status: 404, headers: NO_STORE })

  // (2) Sesión obligatoria. Cliente anon+RLS con las cookies del dueño.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: NO_STORE })

  // (3) Tenant = ACTOR: el negocio sale de owner_id de la sesión. Sólo se pide el id.
  //
  // UN FALLO DE INFRAESTRUCTURA NO ES UN 404 (WR-B1). Antes las dos queries desestructuraban sólo
  // `data` y tiraban el `error` al piso: Postgres caído, PostgREST sin schema cache tras un DDL o un
  // JWT vencido (PGRST301) se disfrazaban de "esa serie no es tuya", el dueño leía "no se pudo obtener
  // el link" y nadie se enteraba de que el sistema estaba roto. Se separa el eje: 500 = el sistema no
  // pudo responder, 404 = la respuesta es "no hay nada para vos".
  //
  // ESTO NO ABRE UN ORÁCULO DE EXISTENCIA (D-22/D-23, T-14-08). Lo que hay que mantener indistinguible
  // es "no existe" vs "es de otro negocio" vs "está dada de baja", y los TRES siguen cayendo en el
  // MISMO `if (!abono)` de abajo, con el mismo cuerpo, el mismo status y la misma forma de query. Un
  // 500 no depende de qué serie se pidió —no lo puede provocar el actor eligiendo un id— así que no
  // discrimina entre esos tres casos ni por respuesta ni por timing.
  //
  // POR QUÉ NO HAY `maybeSingle()` ACÁ (WR-B2). `maybeSingle()` devuelve `{ data: null, error }` cuando
  // la query matchea MÁS DE UNA fila, y no hay ningún UNIQUE sobre `businesses.owner_id` en el esquema:
  // un dueño con dos negocios quedaba con un 404 PERMANENTE en esta función y sin una sola línea que
  // explicara por qué. Se pide explícitamente el orden de alta y un `limit(2)`: el `[0]` es
  // determinístico (misma fila en cada request, nunca "a veces uno y a veces el otro") y la segunda
  // fila existe sólo para poder DETECTAR el caso ambiguo y dejarlo en los logs. El desempate por `id`
  // no es decorativo: `businesses.created_at` es NULLABLE (tiene DEFAULT now() pero no NOT NULL), y con
  // dos filas sin fecha el orden quedaría librado al plan de ejecución.
  const { data: businesses, error: bizErr } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(2)
  if (bizErr) {
    console.error('[abonos/cancel-link] business lookup:', bizErr.message)
    return Response.json({ ok: false, error: 'server_error' }, { status: 500, headers: NO_STORE })
  }
  if ((businesses?.length ?? 0) > 1) {
    // No se rechaza la request: el dueño sigue operando sobre su negocio más viejo, que es el que ve el
    // resto del panel. Pero el estado es anómalo y tiene que ser visible para quien mire los logs.
    console.error('[abonos/cancel-link] owner con más de un negocio:', user.id)
  }
  const business = businesses?.[0]
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404, headers: NO_STORE })

  // (4) Doble scoping: la serie se lee acotada por su id Y por el negocio del actor. Una columna sola.
  // El `.neq` es el gate de D-09: la serie dada de baja simplemente no matchea y cae en el mismo
  // `if (!abono)` que un id inexistente o ajeno. `status` es NOT NULL con CHECK sobre tres valores
  // (migr. 054), así que el filtro de desigualdad no puede dejar filas afuera por un NULL — la trampa
  // que sí existía en `appointments.status` (13-01).
  const { data: abono, error: abonoErr } = await supabase
    .from('abonos')
    .select('cancel_token')
    .eq('id', id.trim())
    .eq('business_id', business.id)
    .neq('status', 'cancelled')
    .maybeSingle()
  // `22P02` (invalid_text_representation) = el id de la URL no es un UUID. Ése NO es un fallo del
  // sistema: es una serie que no puede existir, así que sigue siendo un 404 y comparte cuerpo con los
  // otros dos rechazos. Cualquier OTRO error sí es infraestructura y sale por 500.
  if (abonoErr && abonoErr.code !== '22P02') {
    console.error('[abonos/cancel-link] abono lookup:', abonoErr.message)
    return Response.json({ ok: false, error: 'server_error' }, { status: 500, headers: NO_STORE })
  }
  if (!abono) return Response.json({ ok: false, error: 'not_found' }, { status: 404, headers: NO_STORE })

  // (5) Se devuelve la URL YA ARMADA y no la credencial cruda, a propósito: el cliente no tiene por
  // qué reconstruir la ruta pública (misma base y mismo fallback que usa app/api/abonos/create al
  // armar el link del mail de alta), y así la credencial no queda suelta como valor independiente en
  // el estado del browser.
  const token = typeof abono.cancel_token === 'string' ? abono.cancel_token : ''
  if (!token) return Response.json({ ok: false, error: 'not_found' }, { status: 404, headers: NO_STORE })
  const appBase = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/+$/, '')

  // (6) RASTRO DE LA EMISIÓN (WR-B2). Éste es el único endpoint del panel que reparte una credencial de
  // larga vida, y hasta acá no dejaba ni una línea: ante un incidente ("¿este link salió del panel o de
  // la fuga vieja del payload RSC?") no había forma de responder. Se registra QUIÉN, PARA QUÉ SERIE y
  // EN QUÉ NEGOCIO — nunca el token ni la URL, que es exactamente lo que no puede quedar escrito en
  // ningún lado. Va por `console.error` y no por `console.log` porque es el único canal de logging que
  // el repo usa en `app/api` (convención de AGENTS.md §Logging), con el prefijo `[modulo/accion]`.
  console.error('[abonos/cancel-link] link de baja emitido:', {
    abonoId: id.trim(),
    businessId: business.id,
    userId: user.id,
  })

  return Response.json({ ok: true, url: `${appBase}/abono/cancelar/${token}` }, { headers: NO_STORE })
}
