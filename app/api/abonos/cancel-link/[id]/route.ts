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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // (1) Next 16: `params` es una Promise y hay que await-earla. Sin id (o vacío) se responde el MISMO
  // cuerpo que el caso ajeno — los tres caminos de abajo son indistinguibles desde afuera.
  const { id } = await params
  if (!id || !id.trim()) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // (2) Sesión obligatoria. Cliente anon+RLS con las cookies del dueño.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // (3) Tenant = ACTOR: el negocio sale de owner_id de la sesión. Sólo se pide el id.
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // (4) Doble scoping: la serie se lee acotada por su id Y por el negocio del actor. Una columna sola.
  // El `.neq` es el gate de D-09: la serie dada de baja simplemente no matchea y cae en el mismo
  // `if (!abono)` que un id inexistente o ajeno. `status` es NOT NULL con CHECK sobre tres valores
  // (migr. 054), así que el filtro de desigualdad no puede dejar filas afuera por un NULL — la trampa
  // que sí existía en `appointments.status` (13-01).
  const { data: abono } = await supabase
    .from('abonos')
    .select('cancel_token')
    .eq('id', id.trim())
    .eq('business_id', business.id)
    .neq('status', 'cancelled')
    .maybeSingle()
  if (!abono) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // (5) Se devuelve la URL YA ARMADA y no la credencial cruda, a propósito: el cliente no tiene por
  // qué reconstruir la ruta pública (misma base y mismo fallback que usa app/api/abonos/create al
  // armar el link del mail de alta), y así la credencial no queda suelta como valor independiente en
  // el estado del browser.
  const token = typeof abono.cancel_token === 'string' ? abono.cancel_token : ''
  if (!token) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  const appBase = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/+$/, '')

  return Response.json({ ok: true, url: `${appBase}/abono/cancelar/${token}` })
}
