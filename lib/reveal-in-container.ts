// ── Llevar un elemento a la vista DENTRO del contenedor que scrollea ────────────────────────────
//
// POR QUÉ EXISTE Y NO SE USA `scrollIntoView`: el caso que lo pide es el calendario del campo Fecha
// del alta de turnos (quick 261006-iey, pedido del dueño: al desplegarlo se perdía abajo de la
// pantalla). Ese calendario vive dentro del `overflow-y-auto` del drawer, y el drawer BLOQUEA el
// scroll del documento mientras está abierto: un `scrollIntoView` a secas apunta al scroll más
// cercano que el navegador elija —y en la práctica pelea con ese bloqueo— en vez de mover el
// contenedor que de verdad scrollea. Acá se calcula el desplazamiento y el call site se lo aplica al
// contenedor que eligió, explícitamente.
//
// POR QUÉ LA CUENTA VIVE EN UN MÓDULO APARTE: `vitest.config.mts` corre `environment: 'node'`, sin
// jsdom (el milestone prohíbe paquetes nuevos). Las medidas del DOM no se pueden testear, pero la
// DECISIÓN sobre esas medidas sí — mismo molde que `lib/unsaved-changes.ts` y
// `lib/agenda-hours-payload.ts`.

/**
 * Cuánto hay que bajar el scroll del contenedor para que se vea el FINAL del elemento.
 *
 * Todas las medidas son del viewport (`getBoundingClientRect`), así que la cuenta es la misma sin
 * importar cuánto scroll ya haya acumulado el contenedor.
 *
 * Las tres reglas, en orden:
 *   1. Si el elemento ya entra entero (con su margen), **0**: no se scrollea por scrollear. Es lo que
 *      hace que en desktop —donde el diálogo no tiene scroll interno y el calendario entra— no pase
 *      nada.
 *   2. Si falta, se baja lo que falta… pero **nunca tanto como para empujar el borde de ARRIBA del
 *      elemento fuera de la vista**. Es el caso del calendario más alto que el contenedor: revelarle
 *      el final a cualquier costo le taparía el principio (y el botón que lo abrió), y el dueño
 *      perdería la referencia de dónde está.
 *   3. Nunca devuelve negativo: esta función sólo BAJA. Subir el scroll al abrir algo que está más
 *      arriba movería la vista hacia donde el dueño no estaba mirando.
 *
 * El `margin` es aire debajo del elemento, para que no quede pegado al borde del contenedor.
 */
export function revealScrollDelta(input: {
  containerTop: number
  containerBottom: number
  elementTop: number
  elementBottom: number
  margin?: number
}): number {
  const margin = input.margin ?? 0
  const falta = input.elementBottom + margin - input.containerBottom
  if (falta <= 0) return 0
  const espacioArriba = input.elementTop - input.containerTop
  return Math.max(0, Math.min(falta, espacioArriba))
}
