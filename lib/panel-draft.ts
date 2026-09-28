// ── Las reglas PURAS de los borradores del panel de Ajustes (Phase 23 · G-23-25) ────────────────
//
// POR QUÉ EXISTE
// La guarda que impide descartar un borrador sin querer (G-23-25) se apoya en una HUELLA por
// formulario: una cadena comparable que dice si lo que hay en pantalla es distinto de lo que había al
// abrir. Esas huellas nacieron adentro de `app/(dashboard)/settings/settings-client.tsx`, un módulo
// `'use client'` de más de 4.100 líneas, sin exportar y por lo tanto SIN UN SOLO TEST — para un
// arreglo cuyo modo de falla es grave: una huella mal normalizada marca sucio un formulario que nadie
// tocó y encierra al dueño en un diálogo que ya no cierra con un click afuera (code-review WR-09).
// El molde es el mismo que `lib/catalog-panel.ts` + `test/catalog-panel.test.ts`, de esta misma fase.
//
// EL CONTRATO QUE SOSTIENE TODO ESTO
// Cada huella corre EXACTAMENTE las mismas normalizaciones que el guardado de su formulario. Son las
// dos caras del mismo acuerdo: si un guardado cambia una normalización, su huella cambia con ella. Por
// eso el piso y el techo del cupo viven acá también —los comparten la huella, el guardado del diálogo,
// el alta y el stepper de la tarjeta—, y no en la pantalla.
//
// QUÉ NO HACE
//   - NO habla con Supabase, ni con React, ni con el DOM. `guardDraftOnDismiss` recibe el aviso como
//     callback justamente para no importar el toaster: lo visual lo decide la pantalla.
//   - NO decide QUÉ se escribe en la base más allá de la normalización que ya compartía con el
//     guardado. La columna de categoría la sigue traduciendo `categoryPatch` de `lib/catalog-panel`.
//   - NO filtra por tenant: recibe el borrador ya acotado por el caller, que es el que lleva el
//     `.eq('business_id', …)` en cada escritura.

import type { Service } from '@/lib/types'
// Sólo el TIPO del detalle del evento de cierre, directo del paquete: así los motivos que mira la
// guarda quedan chequeados contra la unión real de Base UI y un motivo mal escrito no compila. Es un
// `import type`: se borra al compilar, así que este módulo sigue sin runtime de UI.
import type { DialogRootChangeEventDetails } from '@base-ui/react/dialog'
// El motivo del cierre disparado por el "atrás" del celular. Es un valor (no un tipo) porque también
// se compara en runtime más abajo. Lo define `lib/overlay-history.ts`, que es quien sintetiza ese
// detalle de cierre; acá sólo se consume, así que no hay ciclo de imports.
import { HISTORY_BACK_REASON } from '@/lib/overlay-history'
import { liveCategoryValue } from '@/lib/catalog-panel'
import { normalizeServiceDuration, normalizeServicePrice } from '@/lib/onboarding-agenda'

// ── Cupo: piso por modo y techo del panel ───────────────────────────────────────────────────────

/** Los tres modos de cupo del servicio (migr. 068). El tipo lo manda la fila, no la pantalla. */
export type CapacityMode = Service['capacity_mode']

/**
 * Techo del cupo declarable desde el panel (code-review de Phase 15, WR-03). NO es un invariante de
 * dominio: `services.capacity` es `smallint` (máx 32767) y la base no tiene tope propio. Es el guard
 * que evita que un número pegado o tipeado de más (40000) viaje al UPDATE y vuelva como
 * `22003 smallint out of range`, que el panel colapsa en un `toast.error('Error al guardar')` sin
 * decir qué pasó. 99 lugares ya está muy por encima de cualquier clase real.
 */
export const MAX_CAPACITY = 99

/**
 * Piso de cupo por modo. ESPEJA el CHECK `services_capacity_matches_mode_chk` de la migr. 068
 * (individual ⇒ capacity = 1; group_class / simultaneous_resource ⇒ capacity >= 2). La AUTORIDAD es
 * la base — esto es su espejo de UX, para que el editor NO pueda producir una combinación que el
 * constraint rechace, nunca un reemplazo del constraint.
 */
export function minCapacityFor(mode: CapacityMode): number {
  return mode === 'individual' ? 1 : 2
}

/**
 * El cupo N es un entero entre `min` (mismo CHECK que la DB) y {@link MAX_CAPACITY}. Un input vacío o
 * basura cae al piso.
 */
export function normalizeCapacity(n: number, min = 1): number {
  return Number.isFinite(n) ? Math.min(MAX_CAPACITY, Math.max(min, Math.floor(n))) : min
}

/**
 * El patch que escribe el toggle de modo de cupo del formulario: el modo nuevo + el cupo que
 * corresponde (D-06). Lleva SIEMPRE los dos, porque pasar de individual a un modo compartido con el
 * cupo en 1 rebota contra `services_capacity_matches_mode_chk`.
 *
 * ⚠ AL IR A INDIVIDUAL EL CUPO SE CONSERVA (code-review WR-05, pasada 3). Antes se pisaba con 1, y
 * como volver a un modo compartido sólo aplica el PISO, el round-trip
 * `grupal → individual → grupal` degradaba una clase de 12 lugares a 2 en silencio; con la guarda de
 * G-23-25 eso además ensuciaba el borrador y el aviso empujaba a guardar la pérdida. Conservarlo no
 * puede producir una combinación ilegal: el 1 de individual lo imponen el guardado, el alta y la
 * propia huella, y el campo "Cuántos lugares" ni siquiera se renderiza en ese modo.
 */
export function capacityModePatch(next: CapacityMode, capacity: number): { capacity_mode: CapacityMode; capacity: number } {
  return { capacity_mode: next, capacity: next === 'individual' ? capacity : normalizeCapacity(capacity, 2) }
}

// ── La guarda del descarte accidental (G-23-25) ─────────────────────────────────────────────────

/**
 * Lo que la guarda necesita del detalle del evento de cierre de Base UI: el motivo y la cancelación.
 * Se declara estructuralmente (y no como el tipo entero del paquete) para que la guarda se pueda
 * testear con un objeto plano, sin construir un evento de Base UI. El `reason` sí sale de la unión
 * real: un motivo mal escrito no compila.
 *
 * ⚠ POR QUÉ LA UNIÓN SE ENSANCHA con {@link HISTORY_BACK_REASON} (quick 260928-seo): el cierre que
 * dispara el "atrás" del celular no lo origina Base UI —lo sintetiza `lib/overlay-history.ts`— así
 * que su motivo NO está en la unión cerrada del paquete y sin ensanchar el tipo no se podría ni
 * nombrar acá. No alcanza con sumarlo al `if` de abajo: sin este ensanche el motivo nuevo ni compila.
 */
export type DraftDismissDetails = {
  reason: DialogRootChangeEventDetails['reason'] | typeof HISTORY_BACK_REASON
  cancel: () => void
}

/**
 * La guarda compartida por los tres diálogos de edición del panel. Recibe una función que responde
 * "¿hay cambios?", la que cierra, y la que avisa; devuelve el handler de `onOpenChange`.
 *
 * `isDirty` viaja como FUNCIÓN y no como booleano a propósito: así la huella se calcula recién cuando
 * hay un intento de cierre, no en cada tecleo. Y el motivo se evalúa ANTES que `isDirty()`, para no
 * calcularla en los cierres que igual van a pasar.
 *
 * Mira EXACTAMENTE tres motivos: el click afuera, la tecla Escape y el "atrás" del celular. Los tres
 * son cierres ACCIDENTALES: gestos que el dueño hace sin la intención de descartar lo que cargó. El
 * del "atrás" se sumó en el quick 260928-seo, y es el que había que sumar sí o sí: los overlays
 * empezaron a cerrarse con el back del celular y esta lista es LITERAL, así que un cierre por
 * `popstate` caía derecho en `close()` y descartaba el borrador sucio SIN AVISAR — el mismo bug que
 * G-23-25 arregló, entrando por la puerta de atrás. El cierre por la ✕ (`close-press`)
 * y el que dispara el guardado no pasan por ninguna condición nueva — si la guarda los alcanzara, el
 * dueño quedaría encerrado en un diálogo sin salida (el caso real: vaciar el nombre deja el borrador
 * sucio y "Guardar" deshabilitado). `focus-out` queda afuera a propósito: con el diálogo modal el foco
 * está atrapado, así que no es un camino real.
 *
 * El aviso lo da el CALLER (`onBlocked`) y no esta función (code-review WR-08): el toast no alcanza
 * como único canal porque su región `aria-live` vive fuera del portal del diálogo y el modal la marca
 * `inert`. La pantalla duplica el mensaje adentro del popup.
 */
export function guardDraftOnDismiss(isDirty: () => boolean, close: () => void, onBlocked: () => void) {
  return (open: boolean, details: DraftDismissDetails) => {
    if (open) return
    const accidental =
      details.reason === 'outside-press' ||
      details.reason === 'escape-key' ||
      details.reason === HISTORY_BACK_REASON
    if (accidental && isDirty()) {
      details.cancel()
      onBlocked()
      return
    }
    close()
  }
}

// ── Servicio ────────────────────────────────────────────────────────────────────────────────────

/** Forma del borrador del diálogo de edición de servicio. */
export type ServiceEditForm = {
  name: string
  duration_minutes: string
  price: string
  location_ids: string[]
  capacity_mode: CapacityMode
  capacity: number
  category: string
  description: string
}

/**
 * Huella comparable del borrador de servicio.
 *
 * ⚠ CONTRATO CON EL GUARDADO, y es el modo de falla GRAVE de este arreglo. Cada campo pasa por la
 * MISMA normalización que aplica `saveEditService`. Una huella desincronizada marca sucio un
 * formulario que nadie tocó —el precio se normaliza solo al salir del campo, el cupo se satura contra
 * el piso del modo, la categoría se sanea contra las vivas— y ahí el dueño queda ENCERRADO en un
 * diálogo que ya no puede cerrar con un click afuera: la mejora se convierte en la trampa.
 *
 * Las sedes se ordenan SÓLO acá adentro: apagar y volver a prender una sede deja el mismo conjunto en
 * otro orden, y sin ordenar la huella lo leería como un cambio. El guardado sigue escribiendo el
 * arreglo tal como está.
 */
export function serviceFormFingerprint(f: ServiceEditForm, liveCategoryIds: readonly string[]): string {
  const capacity = f.capacity_mode === 'individual' ? 1 : normalizeCapacity(f.capacity, 2)
  return JSON.stringify({
    name: f.name.trim(),
    duration: normalizeServiceDuration(f.duration_minutes).value,
    price: normalizeServicePrice(f.price).value,
    location_ids: [...f.location_ids].sort(),
    capacity_mode: f.capacity_mode,
    capacity,
    category: liveCategoryValue(f.category, liveCategoryIds),
    // El guardado hace `.trim() || null`; acá alcanza con el trim porque los DOS lados pasan por la
    // misma línea, así que vacío y nulo colapsan igual.
    description: f.description.trim(),
  })
}

// ── Sede ────────────────────────────────────────────────────────────────────────────────────────

/** Forma del borrador de la sede. */
export type LocationEditForm = { name: string; address: string; phone: string }

/**
 * La ÚNICA normalización de la sede: la comparten el guardado y la huella, así que no hay nada que
 * espejar y nada que pueda divergir.
 */
export function locToPayload(f: LocationEditForm) {
  return { name: f.name.trim(), address: f.address.trim() || null, phone: f.phone.trim() || null }
}

/** Huella comparable del borrador de la sede. */
export function locationFormFingerprint(f: LocationEditForm): string {
  return JSON.stringify(locToPayload(f))
}

// ── Profesional ─────────────────────────────────────────────────────────────────────────────────

/** Forma del borrador del profesional (alta y edición comparten la misma). */
export type ProForm = { name: string; last_name: string; specialty: string; license_number: string; phone: string; email: string }

/** Normaliza el profesional: trim y opcionales vacíos → null. La usan el alta, la edición y la huella. */
export function proToPayload(f: ProForm) {
  return {
    name: f.name.trim(),
    last_name: f.last_name.trim() || null,
    specialty: f.specialty.trim() || null,
    license_number: f.license_number.trim() || null,
    phone: f.phone.trim() || null,
    email: f.email.trim() || null,
  }
}

/**
 * Huella comparable del borrador del profesional. Su FOTO no entra: se sube y se persiste sola, así
 * que no es un cambio sin guardar.
 */
export function proFormFingerprint(f: ProForm): string {
  return JSON.stringify(proToPayload(f))
}
