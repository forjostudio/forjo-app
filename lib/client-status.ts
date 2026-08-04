// ── Clasificación de clientes del panel (POLISH-07, D-10/D-11) ────────────────────────────────
// Fuente ÚNICA de la regla que hasta ahora vivía duplicada en `clients-client.tsx`: una vez en el
// `status` que alimenta el filtro por tabs (`clientStats`) y otra en la rama que elige el copy de
// `getSuggestion`. Las dos copias habían derivado en el umbral de pausa (45 vs 60 días), así que la
// misma persona podía estar en el tab "Pausa" y recibir el consejo de un cliente activo.
//
// Función PURA: sin React, sin Supabase, sin `date-fns` — solo dos números. Por eso es testeable sin
// DB (test/client-status.test.ts) y por eso no recibe ni retiene identidad, contacto ni `business_id`
// (T-14-04): la clasificación no necesita saber de quién habla.

export type ClientStatusKey = 'new' | 'active' | 'frequent' | 'paused'

/**
 * Días sin venir a partir de los cuales un cliente se considera en pausa.
 *
 * D-11: número ÚNICO de la regla. Antes el filtro usaba 45 y el copy de la sugerencia decía "más de
 * 2 meses" (60). Se unifica en 60, que es además como `REQUIREMENTS.md` describe el tab
 * ("Pausa (>2 meses sin venir)"). Efecto aceptado: los clientes con 46-60 días sin venir salen del
 * tab "Pausa" y pasan a "Activos"/"En desarrollo".
 */
export const PAUSED_AFTER_DAYS = 60

/**
 * Clasifica un cliente a partir de sus visitas y de cuántos días pasaron desde la última.
 *
 * El guard de `visits === 0` va PRIMERO, antes del chequeo de días, y ese orden es la corrección de
 * D-10: el caller pasa un `daysSinceLast` con un valor sentinela (999) cuando la persona no tiene
 * ninguna fecha, y ese sentinela hacía que un alta de hoy se leyera como abandono. Con el guard,
 * "Pausa" pasa a significar literalmente *vino y dejó de venir*, y un cliente recién creado cae en
 * "Nuevos" venga de un alta de hoy o de hace un año — sin leer la fecha de alta ni ningún otro dato
 * del cliente (D-10 lo pide así para no threadear nada nuevo a `clientStats`).
 *
 * Después del guard, la cascada es la de siempre: pausa por umbral (D-11), frecuente, activo, nuevo.
 * La pausa le sigue ganando a frecuente, igual que antes: no es un cambio de comportamiento.
 */
export function classifyClient({ visits, daysSinceLast }: { visits: number; daysSinceLast: number }): ClientStatusKey {
  if (visits <= 0) return 'new' // D-10: sin ninguna visita nunca es pausa, sin importar el sentinela
  if (daysSinceLast > PAUSED_AFTER_DAYS) return 'paused'
  if (visits >= 5) return 'frequent'
  if (visits >= 2) return 'active'
  return 'new'
}
