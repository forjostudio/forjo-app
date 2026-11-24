// ── Alta idempotente del negocio en el onboarding (quick 261124-iu8) ──────────────────────────────
//
// QUÉ RESUELVE: «Crear mi negocio» tiene que poder reintentarse sin armar un SEGUNDO negocio.
// `businesses.owner_id` NO es unique; la única red de la base es el slug único (23505). Así que antes de
// insertar, cada intento busca los negocios del dueño con el MISMO cliente de sesión del navegador
// (RLS `owner access` + `owner_id` de `getUser()`, nunca del formulario) y bajo el MISMO límite que el
// insert:
//   - sin negocios → inserta (`creado`);
//   - uno con el MISMO slug → es un intento propio anterior que llegó a la base aunque su respuesta no
//     volvió (`retomado`). No se asume que esté vacío: un intento anterior pudo llegar a la configuración,
//     o el dueño cargarla en otra pestaña. Por eso se lee qué ya tiene (`leerConfiguracion`, fail-closed)
//     y el wizard saltea lo que ya tiene filas (`pasosDeConfiguracion`): nada se duplica ni se pisa;
//   - uno con OTRO slug → no se escribe nada (`ya-existia`).
//
// POR QUÉ EL MISMO CLIENTE Y NO UN ENDPOINT (DC-1): toda request a la app pasa por `proxy.ts`, que
// refresca la sesión cerca del vencimiento y ROTA el refresh token; el refresh trabado del navegador, al
// llegar con el token viejo, sería rechazado y auth-js borraría la sesión (deslogueo justo al reintentar).
// Con el mismo cliente, si está trabado, la búsqueda vence junto con el resto → NO se inserta.
//
// FAIL-CLOSED: si la búsqueda o la lectura de la configuración fallan o vencen, no se escribe nada.
// INTENTO VENCIDO INERTE (DC-4): `conLimite` rechaza al vencer pero lo de abajo sigue corriendo; sin
// corte, un `getUser()` trabado resolvería más tarde y seguiría con el insert. Se corta por
// `signal.aborted` después de CADA await, y cada query recibe el signal.
//
// Sin imports de React ni de Supabase: se testea puro (lib/onboarding-alta.test.ts).

import { conLimite, LimiteVencido } from '@/lib/con-limite'

export interface ConfiguracionExistente {
  /** ids de `services` que el negocio ya tiene. */
  serviceIds: string[]
  /** si ya tiene al menos un profesional. */
  profesionales: boolean
  /** si ya tiene al menos una franja en `time_blocks`. */
  horarios: boolean
}

export type ResultadoAlta<N extends { id: string }> =
  | { tipo: 'creado'; negocio: N }
  | { tipo: 'retomado'; negocio: { id: string; slug: string }; yaTiene: ConfiguracionExistente }
  | { tipo: 'ya-existia' }

/**
 * Un pedido que falló SIN respuesta HTTP (status 0 de postgrest-js: red caída, fetch cortado). El pedido
 * pudo haber llegado a la base, así que para la UI el alta queda "sin confirmar" (DC-7): se mantiene el
 * slug bloqueado y se ofrece «Reintentar», que lo encuentra si aterrizó.
 */
export class AltaSinConfirmar extends Error {
  readonly causa: unknown
  constructor(causa: unknown) {
    super('No hubo respuesta del servidor: no se sabe si el pedido llegó')
    this.name = 'AltaSinConfirmar'
    this.causa = causa
  }
}

/** Vencimiento o pedido sin respuesta: el alta no se pudo confirmar ni descartar. */
export function esAltaSinConfirmar(e: unknown): boolean {
  return e instanceof LimiteVencido || e instanceof AltaSinConfirmar
}

/** Sin status (o status 0) = el server no contestó; con status HTTP = el server contestó. */
const sinRespuesta = (status: number | undefined) => !status

export function altaDelNegocio<N extends { id: string }>(p: {
  limiteMs: number
  slug: string
  obtenerUsuarioId: () => PromiseLike<string | null>
  buscarNegociosDelDueno: (ownerId: string, signal: AbortSignal) => PromiseLike<{ data: { id: string; slug: string }[] | null; error: unknown; status?: number }>
  leerConfiguracion: (businessId: string, signal: AbortSignal) => PromiseLike<ConfiguracionExistente>
  insertarNegocio: (ownerId: string, signal: AbortSignal) => PromiseLike<{ data: N | null; error: unknown; status?: number }>
}): Promise<ResultadoAlta<N>> {
  // UN solo límite para todo: usuario + búsqueda + (lectura | insert). Así el total del alta tiene tope
  // aunque el lock de auth trabe cualquiera de los pasos.
  return conLimite<ResultadoAlta<N>>(p.limiteMs, async (signal) => {
    // Chequeo manual (no `throwIfAborted`): si el límite ya venció, este intento no sigue.
    const cortar = () => {
      if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new LimiteVencido(p.limiteMs)
    }

    const ownerId = await p.obtenerUsuarioId()
    cortar()
    if (!ownerId) throw new Error('No autenticado')

    const busqueda = await p.buscarNegociosDelDueno(ownerId, signal)
    cortar()
    if (busqueda.error) {
      // Sin respuesta del server: el bloqueo del slug se mantiene (DC-7). Con respuesta: su error.
      if (sinRespuesta(busqueda.status)) throw new AltaSinConfirmar(busqueda.error)
      throw busqueda.error
    }

    const negocios = busqueda.data ?? []
    if (negocios.length > 0) {
      const mismo = negocios.find((n) => n.slug === p.slug)
      if (!mismo) return { tipo: 'ya-existia' }
      const yaTiene = await p.leerConfiguracion(mismo.id, signal)
      cortar()
      return { tipo: 'retomado', negocio: { id: mismo.id, slug: mismo.slug }, yaTiene }
    }

    const alta = await p.insertarNegocio(ownerId, signal)
    cortar()
    if (alta.error) {
      if (sinRespuesta(alta.status)) throw new AltaSinConfirmar(alta.error)
      throw alta.error
    }
    if (!alta.data) throw new Error('El alta no devolvió el negocio')
    return { tipo: 'creado', negocio: alta.data }
  })
}

/**
 * Qué pasos de la configuración aplicar después del alta (DC-3). `creado`: todos. `retomado`: sólo los
 * que todavía no tienen filas. `idsVigentes` = los servicios a los que puede apuntar el mapeo de franjas:
 * si los servicios se saltean, sólo los del wizard que ya existen (la FK `tbs_service_same_tenant`
 * rebotaría con 23503 un id que no existe).
 */
export function pasosDeConfiguracion(
  alta: { tipo: 'creado' } | { tipo: 'retomado'; yaTiene: ConfiguracionExistente },
  idsDelWizard: string[],
): { servicios: boolean; profesionales: boolean; horarios: boolean; idsVigentes: string[] } {
  if (alta.tipo === 'creado') return { servicios: true, profesionales: true, horarios: true, idsVigentes: idsDelWizard }
  const { yaTiene } = alta
  const servicios = yaTiene.serviceIds.length === 0
  return {
    servicios,
    profesionales: !yaTiene.profesionales,
    horarios: !yaTiene.horarios,
    idsVigentes: servicios ? idsDelWizard : idsDelWizard.filter((id) => yaTiene.serviceIds.includes(id)),
  }
}
