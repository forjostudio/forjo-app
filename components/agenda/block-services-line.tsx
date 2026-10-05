'use client'

import { toast } from 'sonner'
import { Check, Asterisk } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isBlockWildcard } from '@/lib/time-block-services'

// ── El editor de chips de una franja, compartido por el panel y el alta (D-05 de la Phase 21) ───
//
// Vivía adentro de `app/(dashboard)/agenda/agenda-client.tsx` y lo consumía un solo call site. La
// Phase 21 necesita el MISMO editor durante el onboarding, y la alternativa —escribir un segundo
// editor de chips para el alta— es exactamente el modo de falla que AGENDA-02 existe para prevenir:
// dos implementaciones de la regla del comodín terminan diciendo cosas distintas sobre la misma
// franja. Por eso se movió acá tal cual, sin editar el cuerpo: lo que está abajo ya pasó la UAT de
// la Phase 19 cuatro veces, y cada detalle contraintuitivo viaja con el comentario que lo explica.

// Un servicio del catálogo con el que el editor de horarios pinta los chips de cada franja.
//
// Tipo propio y NO `Service` entero a propósito (T-19-19): al editor le alcanzan tres columnas
// —id para el mapeo, nombre para el chip, y si está activo para el matiz D-11— y mandar el catálogo
// completo al browser arrastraría precio, duración, seña y cupo a un bundle que no los necesita.
// Son datos del propio negocio, así que el riesgo es de superficie, no de tenant; pero superficie
// que no hace falta no viaja.
//
// ⚠ Incluye los INACTIVOS: es lo único que puede NOMBRAR a un servicio desactivado que sigue
// mapeado a una franja (D-11). Sin él, esa franja se vería como comodín cuando el motor la trata
// como restringida.
export type ServiceCatalogItem = {
  id: string
  name: string
  active: boolean
}

// ── La línea de servicios de cada franja (AGENDA-05 / AGENDA-06, D-08…D-17) ────────────────────
//
// Dos funciones de PRESENTACIÓN, declaradas a nivel de MÓDULO y no adentro del componente que las
// usa: se renderizan dentro de un `map` de 7 días × N bloques, así que definirlas adentro las
// recrearía en CADA render — o sea en cada tecla que el dueño toca en un input de hora, y con 14
// franjas eso son 14 identidades nuevas por pulsación. Acá arriba se crean una sola vez para toda
// la vida del módulo.
//
// Sólo PINTAN y DISPARAN. La regla del comodín no se decide acá (sale del módulo puro) y el estado
// no se muta acá (sube por callback). Mismo reparto que `lib/agenda-occupancy.ts` con la ocupación.
//
// Y no abren NADA: ni diálogo, ni cajón, ni popover. AGENDA-05 pide ver qué se da en cada franja
// SIN abrir nada — por eso es una segunda línea bajo la fila y no un botón que despliega algo.

// El umbral de "Ver todos", determinista y sin medir el DOM (D-10). A 375px el ancho útil de la
// línea es ~295px (375 − el padding de la página − el `p-6` de la Card) y un chip promedio (`px-3`
// más un nombre de ~8 caracteres a 12px) mide ~85px ⇒ entran 3 por fila. 6 chips son las ~2 filas
// que pide D-10, expresadas en una unidad que no depende de medir texto en runtime.
const CHIPS_COLLAPSED_MAX = 6

// El estado del editor guarda los servicios DENTRO del bloque (`service_ids`), no como filas de la
// puente. Para que "¿esta franja es comodín?" la siga contestando la MISMA función que se la
// contesta al motor y a la disponibilidad pública, se adapta el borrador a la forma que esa función
// espera y se DELEGA. Escribir un `length === 0` acá sería una segunda interpretación de la regla
// del comodín, y dos interpretaciones es exactamente cómo el panel y el motor terminan diciendo
// cosas distintas sobre la misma franja (AGENDA-02 / P-07).
//
// ⚠ Volver a comodín es BORRAR filas, no escribir un estado vacío: la AUSENCIA de mapeo ES el
// estado. No hay sentinel ni columna nullable donde leerlo — se computa desde la nada.
const DRAFT_BLOCK_ID = '__draft__'
function isDraftBlockWildcard(serviceIds: string[]): boolean {
  return isBlockWildcard(
    DRAFT_BLOCK_ID,
    serviceIds.map(id => ({ business_id: '', time_block_id: DRAFT_BLOCK_ID, service_id: id })),
  )
}

// Un servicio de la franja: botón externo de 44×44 que envuelve un pill visual de 28px.
//
// Los dos elementos existen a propósito (molde `components/crm/tag-chip.tsx`): el área táctil llega
// al mínimo de 44 puntos sin engordar el pill, que es la única forma de cumplir a la vez el mínimo
// táctil del proyecto y el "peso visual secundario" que pide D-14 para esta línea.
//
// El tratamiento es TODO NEUTRO: el acento de la paleta no entra acá. No es sólo estética — pintar
// el texto del chip con el color de acento a 12px sobre la superficie clara no llega a AA en tres
// de las cinco paletas, la default incluida (medido en el contrato visual de la fase). El cambio de
// estado lo llevan TRES portadores a la vez (relleno + color de texto + tilde), nunca el color
// solo, y ninguno de los tres depende de la paleta.
//
// ── Y el nombre largo NO se sale de la tarjeta (quick 261005-pbj, UAT en celular) ──────────────
//
// Es la TERCERA vez que el repo paga el mismo defecto: tarjetas del catálogo público (UAT de v0.29),
// chips del manager de categorías (quick 260929-g4d) y éste. Cada superficie escribió su propio chip
// y cada una lo reintrodujo. El arreglo es el MISMO de `components/dashboard/categorias-manager.tsx`
// y tiene tres partes que sólo funcionan juntas:
//
// 1. `max-w-full` en el botón y `min-w-0 max-w-full` en el pill: los dos son items de un flex y
//    arrastran el `min-width: auto` que les impide encoger por debajo de su contenido.
// 2. El `whitespace-nowrap` que estaba en el pill SE FUE con el nombre: `truncate` ya lo incluye, y
//    suelto en el pill es justo lo que bloquea el encogimiento.
// 3. El nombre en su PROPIO span con `truncate`: `text-overflow` no actúa sobre los hijos de un
//    contenedor flex, así que la elipsis necesita nodo propio. Es la cicatriz exacta de 260929-g4d.
//
// Medido a 375px (ancho útil de la línea: 295px): el pill de un nombre de 74 caracteres medía 443px
// y se pasaba 74px del borde derecho de la tarjeta, con 54px de scroll horizontal en la Card y 45px
// en el documento. Ahora el pill mide 293px, el exceso es 0 y no hay scroll en ninguno de los dos.
function ServiceChip({ name, selected, inactive, ariaLabel, disabled, onToggle }: {
  /**
   * El nombre PELADO, sin el sufijo del inactivo. El chip lo compone él: desde que el nombre se
   * trunca, el sufijo tiene que vivir en su propio nodo `shrink-0` o `truncate` se lo come justo en
   * el caso que D-11 necesita que se lea (un servicio de baja con nombre largo quedaría distinguido
   * sólo por el borde punteado, y D-11 pide forma Y palabra).
   */
  name: string
  selected: boolean
  /** Servicio dado de baja que sigue mapeado (D-11): la señal es forma y palabra, jamás opacidad. */
  inactive?: boolean
  /** Sólo cuando el texto visible no alcanza para nombrarlo (el caso del inactivo). */
  ariaLabel?: string
  /**
   * Congelado mientras el guardado está en vuelo. La opacidad SÍ entra acá y no contradice a D-11:
   * lo que apaga es la línea ENTERA (inputs de hora incluidos), no un chip contra otro, así que no
   * es una señal que haya que distinguir de la del servicio inactivo.
   */
  disabled?: boolean
  onToggle: () => void
}) {
  // El texto visible COMPLETO, para el `title`. Se compone acá y no en el call site para que el
  // sufijo y lo que anuncia el tooltip no puedan divergir.
  const label = inactive ? `${name} · inactivo` : name
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      // El nombre ENTERO al pasar el mouse, ahora que el chip lo puede cortar. Va en TODOS los chips
      // y no sólo en los inactivos: el `ariaLabel` existe nada más que cuando el texto visible no
      // alcanza para nombrar al servicio (el sufijo "· inactivo"), y desde que el nombre se trunca
      // cualquier chip puede quedar sin mostrarlo completo. Para lectores de pantalla el nombre sigue
      // llegando entero por el contenido del botón: `truncate` recorta en pantalla, no en el DOM.
      title={label}
      // `min-w-11` se queda y NO se le agrega `min-w-0`: los 44px son el mínimo táctil del proyecto y
      // son los que hacen que este botón no necesite el `min-w-0` del molde de categorías (un mínimo
      // declarado ya desactiva el `min-width: auto` automático). `max-w-full` es el que impide que se
      // pase de la línea.
      className="inline-flex min-h-11 min-w-11 max-w-full items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      <span
        className={cn(
          // El `whitespace-nowrap` que vivía en esta línea se fue con el nombre (`truncate` lo trae):
          // suelto acá impedía que el pill encogiera. `min-w-0 max-w-full` porque este pill es item
          // de flex del botón y arrastra el mismo `min-width: auto`.
          'inline-flex h-7 min-w-0 max-w-full items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
          selected
            ? 'border-foreground/30 bg-secondary text-foreground'
            : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
          inactive && 'border-dashed',
        )}
      >
        {/* `shrink-0`: la tilde es uno de los tres portadores del estado seleccionado, nunca se
            encoge — se encoge el nombre. */}
        {selected && <Check aria-hidden="true" className="size-3 shrink-0" />}
        {/* El nombre en su propio span: `text-overflow` no actúa sobre los hijos de un contenedor
            flex, así que la elipsis necesita este nodo. `truncate` trae `overflow-hidden`, que de
            paso le resuelve el `min-width: 0` (el mínimo automático es 0 cuando el overflow no es
            visible). El `onToggle`, el `aria-pressed` y el área táctil siguen todos en el <button>. */}
        <span className="truncate">{name}</span>
        {/* `shrink-0`: la palabra que nombra el estado de baja (D-11) nunca se recorta; lo que se
            recorta es el nombre. El punto medio y el espacio los da el `gap-1` del pill. */}
        {inactive && <span className="shrink-0">· inactivo</span>}
      </span>
    </button>
  )
}

// La línea entera de una franja: el chip comodín, o los chips de servicio, más el disparador del
// colapso. Va DEBAJO de la fila de horas y debajo del párrafo de error (el error tiene que quedar
// pegado a los inputs que lo causaron).
//
// `gap-y-0` es deliberado: cada chip es un botón de 44px alrededor de un pill de 28px, así que las
// filas ya quedan separadas por 16px de área táctil transparente. Sumarle un gap vertical daría
// 24px de aire y rompería el peso secundario de D-14.
export function BlockServicesLine({ serviceIds, catalog, groupLabel, expanded, disabled, onToggleExpanded, onToggleService }: {
  /** Los servicios que DECLARA esta franja. Vacío = comodín (D-01). */
  serviceIds: string[]
  /** El catálogo completo del negocio, CON inactivos: es lo único que puede nombrar a uno de baja. */
  catalog: ServiceCatalogItem[]
  groupLabel: string
  expanded: boolean
  /**
   * Guardado en vuelo: los chips no se pueden togglear. El colapso ("Ver todos") SÍ sigue vivo —
   * no toca la configuración, sólo muestra más de lo mismo, así que no hay nada que se pueda
   * perder al pisarse el estado con lo que devuelve la base.
   */
  disabled?: boolean
  onToggleExpanded: () => void
  onToggleService: (serviceId: string) => void
}) {
  const wildcard = isDraftBlockWildcard(serviceIds)
  // Se OFRECEN los activos (D-11); se MUESTRAN además los inactivos que siguen mapeados a ESTA
  // franja. Un inactivo NO mapeado no aparece nunca. Ocultar el mapeado mentiría: la franja sigue
  // restringida por esa fila —el motor la lee igual— y el dueño no tendría de dónde sacarla.
  //
  // El orden es el del catálogo (fecha de creación ascendente, ya ordenado por el servidor) y se
  // conserva SIEMPRE: reordenar por seleccionados haría saltar los chips de lugar al togglear.
  const shown = catalog.filter(s => s.active || serviceIds.includes(s.id))
  const selectedCount = shown.filter(s => serviceIds.includes(s.id)).length
  // El comodín cuenta dentro del umbral: cuando aparece (0 marcados) la línea muestra el comodín
  // más 5 servicios, que es el peor caso de altura y siguen siendo 2 filas.
  // UMBRAL y NÚMERO MOSTRADO son cosas distintas: el comodín ocupa lugar, así que entra en el que
  // decide si la línea colapsa, pero no es un servicio del negocio y no puede entrar en el número
  // que el disparador le muestra al dueño (ahí va la cantidad de servicios, sin el comodín).
  const total = shown.length + (wildcard ? 1 : 0)
  const collapsible = total > CHIPS_COLLAPSED_MAX
  let visible = shown
  if (collapsible && !expanded) {
    // Un servicio MARCADO nunca se recorta: colapsar un servicio declarado rompería AGENDA-05, que
    // pide ver qué se da sin abrir nada. Lo único que se colapsa son las opciones NO elegidas.
    let room = Math.max(0, CHIPS_COLLAPSED_MAX - selectedCount - (wildcard ? 1 : 0))
    const kept: ServiceCatalogItem[] = []
    for (const s of shown) {
      if (serviceIds.includes(s.id)) { kept.push(s); continue }
      if (room <= 0) continue
      room -= 1
      kept.push(s)
    }
    visible = kept
  }
  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap items-center gap-x-2 gap-y-0">
      {/* La región viva del comodín: SIEMPRE montada, invisible, y lo único que cambia es su texto.
          Una región que se monta junto con su contenido no la locuta ningún lector (el nodo aparece
          ya con el texto adentro y no hay "cambio" que anunciar), que es exactamente lo que pasaba
          cuando el anuncio vivía en el chip visible.

          Va fuera del flujo a propósito: `sr-only` es `position:absolute`, así que este nodo NO es
          un item del flex `gap-x-2` de la línea. Si fuera item, vacío mediría 0 de ancho pero igual
          consumiría su gap de 8px y la fila entera se correría de lado al aparecer y desaparecer el
          comodín — un desplazamiento nuevo justo en la interacción que la UAT ya aprobó. Por eso el
          anuncio se desacopla del dibujo en vez de montar siempre el contenedor visible. */}
      <span role="status" className="sr-only">{wildcard ? 'Cualquier servicio' : ''}</span>
      {/* El chip comodín (D-16 / AGENDA-06). Se renderiza si y sólo si la franja no declara ningún
          servicio, y esa decisión sale del módulo puro, no de un filtro escrito acá.

          Es INFORMATIVO, no clickeable: un control cuyo único estado posible es el no-op enseña mal
          la regla, y si fuera clickeable se leería como una opción más entre los servicios — justo
          la lectura que D-16 evita (el estado por defecto no es "una opción sin elegir", es un
          estado DECLARADO). Para volver al comodín ya está el camino de D-17: apagar todos.

          `min-h-11` aunque no sea clickeable: así la altura de la línea es idéntica con o sin él y
          no hay salto de layout cuando aparece o desaparece (D-17 pide que reaparezca al instante).
          El anuncio para lectores de pantalla NO lo hace este nodo: lo hace la región invisible de
          acá arriba, siempre montada. Este chip va oculto para la accesibilidad, si no el mismo
          texto se leería dos veces. Es información, nunca una alerta.

          NUNCA coexiste con un chip marcado, tampoco con el de un servicio dado de baja: si queda
          uno mapeado la franja no es comodín, porque el motor tampoco la trata como tal. */}
      {wildcard && (
        <span aria-hidden="true" className="inline-flex min-h-11 items-center">
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
            <Asterisk aria-hidden="true" className="size-3" />
            Cualquier servicio
          </span>
        </span>
      )}
      {visible.map(s => (
        <ServiceChip
          key={s.id}
          name={s.name}
          selected={serviceIds.includes(s.id)}
          inactive={!s.active}
          disabled={disabled}
          ariaLabel={s.active ? undefined : `${s.name} — servicio inactivo, todavía asignado a esta franja. Tocá para quitarlo.`}
          onToggle={() => {
            onToggleService(s.id)
            // El ÚNICO toggle de la línea que avisa. Un servicio de baja sólo aparece acá mientras
            // siga mapeado, así que quitarlo no se puede deshacer desde esta pantalla: hay que
            // reactivarlo en Servicios. El resto no avisa nada — el chip que se pinta ES el
            // feedback.
            if (!s.active) toast.info(`Quitaste "${s.name}" de esta franja. Como está inactivo, para volver a asignarlo reactivalo en Servicios.`)
          }}
        />
      ))}
      {/* Expansión IN SITU, en la misma línea: nada de modal, cajón ni popover. Neutro y subrayado
          a propósito — es navegación dentro de la línea, no una acción de configuración. */}
      {collapsible && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex min-h-11 items-center rounded-full px-1 text-xs font-medium text-muted-foreground underline underline-offset-2 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? 'Ver menos' : `Ver todos (${shown.length})`}
        </button>
      )}
    </div>
  )
}
