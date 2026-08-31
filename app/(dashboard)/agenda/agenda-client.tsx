'use client'

import { useState, useMemo, useEffect, useCallback, useSyncExternalStore, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, TimeBlock, Location, ScheduleException, Service, Professional, Client, TimeBlockService } from '@/lib/types'
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, addDays, isSameMonth, isSameDay, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Plus, Minus, X, Copy, ChevronLeft, ChevronRight, CalendarOff, CalendarClock, CalendarDays, Clock, Check, Asterisk, RefreshCw, Users, Phone, Mail, Repeat } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buildDayEntries, computeOverlapFull, type DayEntry } from '@/lib/agenda-occupancy'
import { servicesOfBlock, isBlockWildcard } from '@/lib/time-block-services'
import { buildDayStatesFromRows, buildSaveHoursPayload, isValidBlockTime, type AgendaBlockDraft, type AgendaDayDraft, type SavedAgendaBlock } from '@/lib/agenda-hours-payload'
import { resolveVertical } from '@/lib/verticals'
import { todayInAR } from '@/lib/booking-window'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { NuevoTurnoForm } from '@/components/dashboard/nuevo-turno-form'

// Turno para la vista semanal (subset con joins de nombre de servicio/profesional).
export type AgendaAppt = {
  id: string
  date: string
  time: string
  status: string
  client_name: string
  // Contacto para el roster del admin (D-04). Datos propios del negocio sobre sus clientes.
  client_phone?: string | null
  client_email?: string | null
  // Vencimiento de la seña de un `pending_payment` (code-review CR-01): un hold VENCIDO ya no ocupa
  // lugar (el motor y availability lo descartan), así que tampoco puede contar para el aviso "lleno".
  expires_at?: string | null
  duration_minutes: number | null
  location_id: string | null
  // FK a la serie del abono (D-09): no nulo → el turno viene de un abono (badge "Fijo").
  abono_id?: string | null
  // FK al servicio (migr. 062, D-11): resuelve capacity_mode/capacity para el aviso "lleno" por
  // solape de los recursos simultáneos. El join services(name) NO lo trae (solo el nombre).
  service_id?: string | null
  // FK a la agenda (code-review CR-01): el motor cuenta los lugares por bucket
  // COALESCE(professional_id, sentinel). El join professionals(name) trae el nombre para mostrar,
  // no el id con el que se cuenta — y los dos hacen falta.
  professional_id?: string | null
  services: { name?: string } | null
  professionals: { name?: string } | null
}

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

// Color del chip de turno según su estado, para la vista semanal.
//
// `completed` tiene tratamiento PROPIO (code-review WR-04/WR-05): antes caía en el gris neutro, o
// sea el mismo tratamiento visual que un cancelado. El azul es el que appointments-client ya usa
// para ese estado, así que las dos superficies coinciden; la forma exacta de la clase espeja la
// línea de al lado (ámbar), que es el molde de este archivo.
function statusChip(status: string): string {
  if (status === 'confirmed') return 'bg-primary/10 text-foreground border-primary/30'
  if (status === 'pending_payment') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
  if (status === 'completed') return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
  return 'bg-secondary text-muted-foreground border-border'
}

// Etiqueta del estado para el roster (mismo semantismo de color que statusChip).
//
// El mapa está COMPLETO desde el code-review WR-04. Hasta esta fase el roster filtraba por
// OCCUPYING_STATUSES, así que acá sólo llegaban `confirmed` y `pending_payment` y la rama de
// fallback era inalcanzable. Ahora la entrada de grupo lleva TODOS los miembros (decisión correcta:
// colapsar no puede hacer desaparecer gente), y con eso un turno marcado desde Turnos aparecía con
// un chip que decía literalmente `completed` — un valor de base de datos, en inglés, en una interfaz
// que está toda en español.
//
// NO se importa el diccionario de appointments-client a propósito: ahí `pending_payment` se llama
// "Pendiente de pago" y acá "Seña pendiente", que es la copy que la agenda viene mostrando y que la
// UAT de esta fase miró cuatro veces. Unificar los dos textos es una decisión de producto, no una
// limpieza que corresponda a un fix de code-review.
function statusLabel(status: string): string {
  if (status === 'confirmed') return 'Confirmado'
  if (status === 'pending_payment') return 'Seña pendiente'
  if (status === 'completed') return 'Completado'
  if (status === 'cancelled') return 'Cancelado'
  if (status === 'pending') return 'Pendiente'
  return 'Otro'   // nunca el valor crudo de la DB
}

// ── OccupancyBadge: el contador de ocupación de LOS DOS modos (POLISH-09, D-10) ────────────────
//
// La asimetría que POLISH-09 vino a cerrar no era que al grupal le faltara un badge: era que el
// simultáneo tenía tratamiento de ocupación y el grupal no tenía NINGUNO, aunque el grupal es el
// modo donde el dueño más necesita saber cuántos lugares quedan. Este componente es la extracción
// literal del badge que ya existía, y ahora lo consumen los dos: mismos tokens, misma maqueta, una
// sola verdad visual.
//
// Un único badge, hasta DOS segmentos, UN solo color — así el aviso no se duplica ni se abarata.
// Orden fijo: primero el cupo (la pregunta de todos los días), después la plata (la excepción).
//
// El segundo segmento no es un extra. Colapsar la clase en una fila esconde el ámbar por-persona que
// hoy se ve en cada chip `pending_payment`: sin él, la fase PERDERÍA información que ya está en
// pantalla (T-17-25). Por eso el umbral es >= 1 y por eso la misma frase se repite en el aria-label
// del botón del grupo — en mobile no hay hover, así que el `title` nunca puede ser el único canal.
//
// El color NUNCA es el único portador: siempre está el icono y, cuando corresponde, la palabra. El
// texto va en --warning PURO, jamás a opacidad: 9px en negrita es texto chico y necesita el
// contraste completo. Las cifras van tabular para que pasar de 9 a 10 no mueva nada al lado.
function OccupancyBadge({ occupied, capacity, pendingDeposit, scope, className }: {
  occupied: number
  capacity: number
  pendingDeposit: number
  /** 'slot' = el cupo de este horario (grupal) · 'overlap' = turnos que se PISAN (simultáneo). */
  scope: 'slot' | 'overlap'
  className?: string
}) {
  const isFull = occupied >= capacity
  const hasPending = pendingDeposit >= 1
  const atTheSameTime = scope === 'overlap' ? ' a la vez' : ''
  const title = [
    isFull
      ? `El cupo de este horario está completo (${occupied} de ${capacity}${atTheSameTime})`
      : `${occupied} de ${capacity} lugares ocupados${atTheSameTime}`,
    hasPending ? `${pendingDeposit} inscripto${pendingDeposit === 1 ? '' : 's'} sin la seña pagada` : '',
  ].filter(Boolean).join(' · ')
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        'h-4 gap-0.5 px-1 py-0 text-[9px] font-medium',
        isFull || hasPending ? 'border-warning/30 bg-warning/10 text-warning' : 'border-border bg-secondary text-muted-foreground',
        className,
      )}
    >
      <Users className="size-2.5!" /><span className="tabular-nums">{occupied}/{capacity}</span>
      {isFull && <span>lleno</span>}
      {hasPending && <span>· <span className="tabular-nums">{pendingDeposit}</span> sin seña</span>}
    </Badge>
  )
}

// ── La línea de servicios de cada franja (AGENDA-05 / AGENDA-06, D-08…D-17) ────────────────────
//
// Dos funciones de PRESENTACIÓN, hermanas de `OccupancyBadge` y declaradas acá, FUERA de
// `AgendaClient`, por el mismo motivo que aquélla: se renderizan dentro de un `map` de 7 días × N
// bloques, así que definirlas adentro del componente las recrearía en CADA render — o sea en cada
// tecla que el dueño toca en un input de hora, y con 14 franjas eso son 14 identidades nuevas por
// pulsación. Acá arriba se crean una sola vez para toda la vida del módulo.
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
function ServiceChip({ label, selected, inactive, ariaLabel, disabled, onToggle }: {
  label: string
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
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    >
      <span
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
          selected
            ? 'border-foreground/30 bg-secondary text-foreground'
            : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground',
          inactive && 'border-dashed',
        )}
      >
        {selected && <Check aria-hidden="true" className="size-3" />}
        {label}
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
function BlockServicesLine({ serviceIds, catalog, groupLabel, expanded, disabled, onToggleExpanded, onToggleService }: {
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
      {/* El chip comodín (D-16 / AGENDA-06). Se renderiza si y sólo si la franja no declara ningún
          servicio, y esa decisión sale del módulo puro, no de un filtro escrito acá.

          Es INFORMATIVO, no clickeable: un control cuyo único estado posible es el no-op enseña mal
          la regla, y si fuera clickeable se leería como una opción más entre los servicios — justo
          la lectura que D-16 evita (el estado por defecto no es "una opción sin elegir", es un
          estado DECLARADO). Para volver al comodín ya está el camino de D-17: apagar todos.

          `min-h-11` aunque no sea clickeable: así la altura de la línea es idéntica con o sin él y
          no hay salto de layout cuando aparece o desaparece (D-17 pide que reaparezca al instante).
          `role="status"` para que un lector lo anuncie al reaparecer — información, nunca alerta.

          NUNCA coexiste con un chip marcado, tampoco con el de un servicio dado de baja: si queda
          uno mapeado la franja no es comodín, porque el motor tampoco la trata como tal. */}
      {wildcard && (
        <span role="status" className="inline-flex min-h-11 items-center">
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
            <Asterisk aria-hidden="true" className="size-3" />
            Cualquier servicio
          </span>
        </span>
      )}
      {visible.map(s => (
        <ServiceChip
          key={s.id}
          label={s.active ? s.name : `${s.name} · inactivo`}
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
          {expanded ? 'Ver menos' : `Ver todos (${total})`}
        </button>
      )}
    </div>
  )
}

// Los estados que ocupan lugar y el parseo de 'HH:MM' vivían acá duplicados. Ahora salen de
// `lib/agenda-occupancy.ts`, que es el módulo puro con la suite: una sola definición, un solo lugar
// donde corregirla. No dejar una segunda copia local aunque parezca inofensiva — la divergencia
// entre dos copias del mismo criterio es exactamente lo que esta fase vino a cerrar.

// Dialog (desktop ≥768px) / Drawer vaul (mobile) son portales con estado propio: el breakpoint
// se decide en JS, no con clases CSS. useSyncExternalStore se suscribe a matchMedia (store externo)
// sin setState-in-effect. SSR-safe: getServerSnapshot → false. Espeja NuevoTurnoForm (D-09/D-04).
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon → Sun
const SLOT_DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const BUFFER_OPTIONS = [0, 5, 10, 15, 20, 30]

// ── Time block state types ──────────────────────────────────────────────────
// La franja declara QUÉ se da en ella: `service_ids` son los servicios mapeados, y el arreglo
// VACÍO es el comodín (D-01) — "sirve para todos" se computa desde la ausencia de mapeo, no se lee
// de un sentinel. Un bloque nuevo nace comodín sin que haya que escribir nada.
//
// El cupo del bloque NO vive acá (D-12): la columna `time_blocks.capacity` dejó de decidir en la
// migr. 068 —el motor lee el cupo del SERVICIO— y arrastrarla al código nuevo la volvería a
// legitimar. (Las lecturas de `capacity` de la vista semanal, más abajo, salen de `services`, que
// es otra cosa.)
//
// El tipo es el borrador que exporta `lib/agenda-hours-payload.ts` MÁS el error de validación del
// editor, en vez de una segunda declaración del mismo objeto: `AgendaDayDraft` es genérico
// justamente para poder recibirlo sin castear en el call site.
type LocalBlock = AgendaBlockDraft & { error?: string }
type DayConfig = AgendaDayDraft<LocalBlock>

function defaultBlock(day: number): LocalBlock {
  if (day >= 1 && day <= 5) return { start_time: '09:00', end_time: '18:00', label: '', location_id: '', service_ids: [] }
  if (day === 6) return { start_time: '09:00', end_time: '13:00', label: '', location_id: '', service_ids: [] }
  return { start_time: '09:00', end_time: '18:00', label: '', location_id: '', service_ids: [] }
}

// ── El rechazo de la base → copy propia del cliente (T-19-24 / T-14-25 / T-13-09) ──────────────
//
// El mensaje que devuelve Postgres trae nombres de tabla, de constraint y detalles del schema. Acá
// se INSPECCIONA para saber qué pasó —el código primero, y el texto sólo para distinguir dos casos
// que comparten el mismo ERRCODE— pero NUNCA cruza a la pantalla: lo único que sale de esta función
// es un código de dominio propio, y la copy la pone el call site. Molde exacto: el borrado de
// servicios de `settings-client.tsx`.
type SaveHoursReject = 'reload' | 'stale' | 'invalid' | 'not_deployed' | 'unknown'

function classifySaveHoursError(error: { code?: string; message?: string }): SaveHoursReject {
  const code = error.code ?? ''
  const message = error.message ?? ''
  // Autoría (el negocio del payload no es del dueño) y violación de las FK compuestas de la migr.
  // 073 (un bloque o un servicio de otro negocio) comparten SÍNTOMA para el dueño: lo que tiene en
  // pantalla dejó de corresponder con la base, y la salida es la misma — recargar.
  if (code === 'P0001' && message.includes('not_your_business')) return 'reload'
  if (code === '23503') return 'reload'
  // El UPDATE no encontró una franja que el editor creía existente: los horarios cambiaron desde
  // otra pestaña o sesión mientras el dueño editaba.
  if (code === 'P0001' && message.includes('block_not_found')) return 'stale'
  // Payload o bloque inválidos: es dato del propio editor, así que el camino es corregir y guardar.
  if (code === 'P0001' && (message.includes('invalid_payload') || message.includes('invalid_block'))) return 'invalid'
  // Clase 22 = error de DATO (`22007` una hora que no castea, `22P02` un uuid mal formado). Es el
  // payload del editor, igual que `invalid_block`, sólo que lo rechazó el CAST antes de que el
  // backstop de la función pudiera correr. Sin esta rama caía en 'unknown', cuya copy afirmaba un
  // problema de red que no pasó y mandaba al dueño a reintentar para siempre (WR-02).
  if (code.startsWith('22')) return 'invalid'
  // PostgREST no expone la función de guardado: la migr. 074 no está aplicada, o se aplicó sin
  // recargar el cache del schema (P-05). Para el dueño el mensaje es el genérico, pero el
  // diagnóstico real es MUY otro — de ahí que el call site además lo registre en consola.
  if (code === 'PGRST202') return 'not_deployed'
  return 'unknown'
}

// La copy es siempre del cliente. Ninguna de estas frases interpola nada de la base.
//
// ⚠ Ninguna afirma una causa que no se pueda probar (WR-02). Dos casos que antes mentían:
//   · `invalid` decía "corregí los errores", pero a esta rama sólo se llega cuando el SERVIDOR
//     rechazó algo que el validador del cliente dejó pasar ⇒ no hay ningún error pintado en
//     pantalla que el dueño pueda ir a corregir. Ahora la frase dice qué buscar.
//   · `not_deployed` y `unknown` decían "revisá tu conexión": la conexión funcionó —la base
//     contestó, y contestó que no— así que mandaba a diagnosticar donde no había nada roto. El
//     diagnóstico REAL de `not_deployed` (migr. 074 sin aplicar o sin recargar el cache del schema)
//     no es accionable para el dueño; va a consola, no a la pantalla.
const SAVE_HOURS_REJECT_COPY: Record<SaveHoursReject, string> = {
  reload: 'No se pudieron guardar los horarios. Recargá la página y probá de nuevo.',
  stale: 'Los horarios cambiaron desde otra pestaña o sesión. Recargá la página y volvé a guardar.',
  invalid: 'Hay una franja con horarios incompletos o inválidos. Revisalos y volvé a guardar.',
  not_deployed: 'No se pudieron guardar los horarios. Probá de nuevo en un momento.',
  unknown: 'No se pudieron guardar los horarios. Probá de nuevo.',
}

interface Props {
  business: Business
  initialTimeBlocks: TimeBlock[]
  initialLocations: Location[]
  initialExceptions: ScheduleException[]
  initialAppointments: AgendaAppt[]
  // Las filas de la puente franja↔servicio (migr. 071): el mapeo que decide QUÉ se ofrece en cada
  // franja. Llegan server-rendered para que la línea de servicios se pinte sin fetch en cliente.
  initialTimeBlockServices: TimeBlockService[]
  // El catálogo de los chips, CON inactivos (D-11). Distinto de `services`, que va filtrado a
  // activos porque lo consume el alta manual.
  serviceCatalog: ServiceCatalogItem[]
  services: Service[]
  professionals: Professional[]
  clients: Client[]
  googleEnabled: boolean
  googleConnected: boolean
}

export function AgendaClient({ business, initialTimeBlocks, initialLocations, initialExceptions, initialAppointments, initialTimeBlockServices, serviceCatalog, services, professionals, clients, googleEnabled, googleConnected }: Props) {
  const supabase = createClient()
  const router = useRouter()

  // ── Alta manual de turno (D-08): botón "Nuevo turno" + click-en-día pre-llena la FECHA.
  // El form compartido corre el pipeline server-side completo vía el endpoint autenticado.
  const [nuevoTurnoOpen, setNuevoTurnoOpen] = useState(false)
  const [prefillDate, setPrefillDate] = useState('')
  function openNuevoTurno(date = '') {
    setPrefillDate(date)
    setNuevoTurnoOpen(true)
  }

  // Aviso al volver del OAuth de Google (?google=connected|error) y limpieza de la URL.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get('google')
    if (!g) return
    if (g === 'connected') toast.success('Google Calendar conectado')
    else if (g === 'error') toast.error('No se pudo conectar con Google Calendar')
    window.history.replaceState(null, '', '/agenda')
  }, [])

  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false)
  async function disconnectGoogle() {
    setDisconnectingGoogle(true)
    const res = await fetch('/api/google/disconnect', { method: 'POST' })
    setDisconnectingGoogle(false)
    if (res.ok) { toast.success('Google Calendar desconectado'); router.refresh() }
    else toast.error('No se pudo desconectar')
  }
  const [syncingGoogle, setSyncingGoogle] = useState(false)
  async function syncGoogle() {
    setSyncingGoogle(true)
    try {
      const res = await fetch('/api/google/sync', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        const n = data.cancelled ?? 0
        toast.success(n > 0 ? `${n} turno${n > 1 ? 's' : ''} cancelado${n > 1 ? 's' : ''} desde tu calendario` : 'Todo al día, sin cambios')
        if (n > 0) router.refresh()
      } else toast.error('No se pudo sincronizar')
    } finally {
      setSyncingGoogle(false)
    }
  }

  // Etiqueta del lugar de atención según el rubro (Consultorio/Local/Sucursal).
  const term = resolveVertical(business).terminology
  // Los consultorios se administran en Configuración; acá solo se asignan a los bloques.
  const activeLocations = initialLocations.filter(l => l.is_active !== false)

  // ── Grilla semanal (time_blocks) ────────────────────────────────────────────
  // Todo lo que el botón "Guardar horarios" persiste en `businesses` vive ACÁ, en un objeto único, y
  // ese objeto es el MISMO que lee el UPDATE de `saveHours`. Antes eran dos `useState` sueltos y la
  // invariante "lo que este botón guarda tiene que ensuciar y congelarse" estaba escrita como una
  // ENUMERACIÓN de gestos — y una enumeración no cubre el control que se agrega después: así fue
  // como la duración del turno y el descanso quedaron afuera del contrato (BLOCKER del audit visual
  // 6-pilares). La regla, en dos mitades:
  //   · automática: todo campo de este objeto ensucia el estado, porque el ÚNICO camino de escritura
  //     es `updateHoursConfig`. Agregar un campo acá no obliga a acordarse de nada.
  //   · manual: congelarse durante el guardado sigue siendo POR CONTROL — el prop de deshabilitado
  //     atado a `savingHours` se pone en cada control, uno por uno. El control nuevo que lea de este
  //     objeto también lo necesita, y eso es lo único que hay que recordar.
  const [hoursConfig, setHoursConfig] = useState({
    slotDuration: business.default_slot_duration ?? 60,
    bufferMinutes: business.buffer_minutes ?? 0,
  })
  // Ensuciar PRIMERO y mergear después, con la misma forma que los seis mutadores de la grilla
  // (`toggleDay`, `addBlock`, `removeBlock`, `updateBlock`, `toggleBlockService`, `applyCopyDay`).
  function updateHoursConfig(patch: Partial<typeof hoursConfig>) {
    setHoursDirty(true)
    setHoursConfig(prev => ({ ...prev, ...patch }))
  }
  // Consultorio activo en el editor de horarios. Con consultorios, arranca en el primero;
  // sin consultorios, '' = grilla única (sin concepto de "General").
  const [activeLoc, setActiveLoc] = useState(() => activeLocations[0]?.id ?? '')
  const selLoc = activeLocations.find(l => l.id === activeLoc) || null
  const selMeta = selLoc ? [selLoc.address, selLoc.phone].filter(Boolean).join(' · ') : ''
  // Los 7 días del editor, derivados UNA sola vez de las props con la MISMA función que va a
  // re-derivarlos después de cada guardado (P-01). Tener dos derivaciones distintas del mismo
  // estado es exactamente cómo se llega a que el segundo guardado duplique todo: la del
  // inicializador se mantiene y la del guardado se olvida. Por eso la derivación vive en
  // `lib/agenda-hours-payload.ts` y acá sólo se la alimenta.
  //
  // Los servicios de cada franja salen de `servicesOfBlock`, la función pura de la Phase 18, y NO
  // de un filtro inline sobre las filas de la puente: ese filtro sería una SEGUNDA interpretación
  // de la regla del comodín, y dos interpretaciones es como el panel y el motor terminan diciendo
  // cosas distintas sobre la misma franja (AGENDA-02, P-07).
  const [dayStates, setDayStates] = useState<DayConfig[]>(() =>
    buildDayStatesFromRows(
      initialTimeBlocks.map(b => ({
        id: b.id,
        day_of_week: b.day_of_week,
        start_time: b.start_time,
        end_time: b.end_time,
        label: b.label ?? null,
        location_id: b.location_id ?? null,
        service_ids: servicesOfBlock(b.id, initialTimeBlockServices),
      }))
    )
  )
  const [savingHours, setSavingHours] = useState(false)
  // ── El estado sucio del editor (D-03) ─────────────────────────────────────
  // Con horarios, un input que quedó mal SE VE. Con el mapeo no: el dueño toca cuatro chips, se va
  // sin guardar, y la franja sigue en comodín — un estado visualmente IDÉNTICO a no haber
  // configurado nada. Por eso los seis gestos que expresan intención del dueño (abrir/cerrar día,
  // agregar bloque, quitar bloque, editar bloque, copiar día, togglear servicio) prenden esta
  // bandera. `validateBlocks` NO la prende: marcar errores no es un cambio de intención, y un
  // indicador que se prende solo miente — y un indicador que miente es peor que no tenerlo.
  // El indicador visual vive al lado del botón de guardar, y `saveHours` es el ÚNICO que la apaga.
  const [hoursDirty, setHoursDirty] = useState(false)

  // ── El colapso de la línea de servicios (D-10) ────────────────────────────
  // Estado POR FRANJA, con clave `día-índice`. Vive en un Set aparte y no dentro del bloque porque
  // es estado de VISTA, no de configuración: no se guarda, no viaja a la base y no sobrevive a una
  // recarga. Se resetea al eliminar un bloque (los índices se corren y la clave pasaría a apuntar a
  // otra franja) y al cambiar de consultorio (la grilla que se está mirando es otra).
  const [expandedChips, setExpandedChips] = useState<Set<string>>(new Set())
  function toggleChipsExpanded(day: number, idx: number) {
    setExpandedChips(prev => {
      const next = new Set(prev)
      const key = `${day}-${idx}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Los gates de visibilidad de la línea de servicios, en orden ───────────
  // 1) Vertical canchas: la línea NO se renderiza en ninguna franja, y la línea guía tampoco. Acá
  //    un "servicio" ES una cancha con su propia agenda (v0.13), así que ofrecer "qué canchas se
  //    dan en esta franja" duplicaría ese eje con otro que no lo decide. Sin el gate esas franjas
  //    quedan comodín igual (cero filas en la puente) ⇒ el gate no cambia comportamiento, sólo
  //    saca ruido. Mismo precedente que ya usan /servicios y /equipo para gatear por rubro.
  const isCanchas = resolveVertical(business).key === 'canchas'
  // 2) Catálogo vacío (ningún activo y ninguno mapeado): no se renderiza una línea por franja. Un
  //    negocio nuevo puede tener 7 días × 2 bloques = 14 franjas, y repetir catorce veces "todavía
  //    no cargaste servicios" convierte una pantalla sana en un tablero de pendientes. En su lugar
  //    va UNA sola línea en la card, en la misma posición que la línea guía (son mutuamente
  //    excluyentes).
  const hasChipCatalog = serviceCatalog.some(s => s.active)
    || dayStates.some(d => d.blocks.some(b => b.service_ids.length > 0))
  // 3) Resto: se renderiza en todas las franjas del consultorio activo.
  const showServicesLine = !isCanchas && hasChipCatalog

  // Cambiar de consultorio muestra otra grilla: el colapso, que se indexa por día e índice, dejaría
  // de corresponder con lo que hay en pantalla.
  function selectLocation(id: string) {
    setActiveLoc(id)
    setExpandedChips(new Set())
  }

  // Abrir/cerrar un día PARA EL CONSULTORIO ACTIVO: cerrar = quitar sus bloques de ese día;
  // abrir = agregar un bloque por defecto de ese consultorio. Los bloques de otros consultorios
  // del mismo día no se tocan. enabled = hay algún bloque (de cualquier consultorio) ese día.
  function toggleDay(day: number) {
    setHoursDirty(true)
    setDayStates(prev => {
      const next = [...prev]
      const dayBlocks = next[day].blocks
      const hasLoc = dayBlocks.some(b => (b.location_id || '') === activeLoc)
      const blocks = hasLoc
        ? dayBlocks.filter(b => (b.location_id || '') !== activeLoc)
        : [...dayBlocks, { ...defaultBlock(day), location_id: activeLoc }]
      next[day] = { enabled: blocks.length > 0, blocks }
      return next
    })
  }

  function addBlock(day: number) {
    setHoursDirty(true)
    setDayStates(prev => {
      const next = [...prev]
      const locBlocks = next[day].blocks.filter(b => (b.location_id || '') === activeLoc)
      const lastBlock = locBlocks[locBlocks.length - 1]
      const newStart = lastBlock?.end_time || '09:00'
      const [h, m] = newStart.split(':').map(Number)
      const newEnd = `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      // Nace COMODÍN (`service_ids: []`): no hay que escribir nada para que una franja nueva sirva
      // para todos los servicios, que es justo la regla D-01.
      next[day] = { ...next[day], enabled: true, blocks: [...next[day].blocks, { start_time: newStart, end_time: newEnd, label: '', location_id: activeLoc, service_ids: [] }] }
      return next
    })
  }

  function removeBlock(day: number, idx: number) {
    setHoursDirty(true)
    // Los índices de las franjas que siguen se corren, así que una clave de colapso guardada pasaría
    // a apuntar a OTRA franja: se limpia el Set entero en vez de reindexarlo.
    setExpandedChips(new Set())
    setDayStates(prev => {
      const next = [...prev]
      const blocks = next[day].blocks.filter((_, i) => i !== idx)
      next[day] = { ...next[day], blocks, enabled: blocks.length > 0 }
      return next
    })
  }

  // Con el cupo afuera, TODOS los campos que se editan por acá son texto (hora, hora, etiqueta,
  // consultorio): el tipo del valor se angosta a cadena para que no vuelva a entrar un número.
  function updateBlock(day: number, idx: number, field: keyof LocalBlock, value: string) {
    setHoursDirty(true)
    setDayStates(prev => {
      const next = [...prev]
      const blocks = [...next[day].blocks]
      blocks[idx] = { ...blocks[idx], [field]: value, error: undefined }
      next[day] = { ...next[day], blocks }
      return next
    })
  }

  // Toglea un servicio en UNA franja concreta (día + índice dentro del día). Inmutable: se
  // reemplazan el arreglo de días, el de bloques y el de servicios, nunca se muta ninguno.
  //
  // NO persiste nada: D-03 fija "editá y después guardá" con un solo botón, y además sobre un
  // bloque recién agregado no habría a qué mapear porque todavía no tiene id en la base.
  function toggleBlockService(day: number, idx: number, serviceId: string) {
    setHoursDirty(true)
    setDayStates(prev => {
      const next = [...prev]
      const blocks = [...next[day].blocks]
      const current = blocks[idx].service_ids
      const service_ids = current.includes(serviceId)
        ? current.filter(id => id !== serviceId)
        : [...current, serviceId]
      blocks[idx] = { ...blocks[idx], service_ids }
      next[day] = { ...next[day], blocks }
      return next
    })
  }

  function validateBlocks(): boolean {
    let valid = true
    const next = dayStates.map(ds => {
      if (!ds.enabled) return ds
      const blocks = ds.blocks.map(b => {
        // PRIMERO la forma, después el orden. La comparación de orden es lexicográfica y sobre una
        // hora VACÍA miente: `'18:00' <= ''` es `false`, así que un bloque al que le borraron la
        // hora de inicio pasaba la validación entera y se lo comía el `::time` del RPC con un
        // 22007. El chequeo de forma lo agarra acá, con el error pegado a los inputs que lo
        // causaron (WR-01).
        if (!isValidBlockTime(b.start_time) || !isValidBlockTime(b.end_time)) {
          return { ...b, error: 'Completá la hora de inicio y la de fin' }
        }
        if (b.end_time <= b.start_time) return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' }
        return { ...b, error: undefined }
      })
      // Solapamiento POR consultorio: dos consultorios distintos pueden coincidir en horario;
      // solo es error si se pisan bloques del MISMO consultorio.
      const byLoc = new Map<string, typeof blocks>()
      for (const b of blocks) { const k = b.location_id || ''; const arr = byLoc.get(k) || []; arr.push(b); byLoc.set(k, arr) }
      const overlapLocs = new Set<string>()
      for (const [k, arr] of byLoc) {
        const sorted = [...arr].sort((a, b) => a.start_time.localeCompare(b.start_time))
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i].end_time > sorted[i + 1].start_time) { overlapLocs.add(k); break }
        }
      }
      const marked = overlapLocs.size > 0
        ? blocks.map(b => overlapLocs.has(b.location_id || '') ? { ...b, error: b.error || 'Los bloques se superponen' } : b)
        : blocks
      if (marked.some(b => b.error)) valid = false
      return { ...ds, blocks: marked }
    })
    setDayStates(next)
    return valid
  }

  // Copiar el horario de un día a otros (multi-día). Solo toca el estado local; se persiste
  // al guardar, igual que el resto de la grilla.
  const [copyDay, setCopyDay] = useState<number | null>(null)
  const [copyTargets, setCopyTargets] = useState<Set<number>>(new Set())
  function applyCopyDay() {
    if (copyDay === null || copyTargets.size === 0) { setCopyDay(null); return }
    // Copia SOLO los bloques del consultorio activo del día origen; en los destinos reemplaza
    // los de ese consultorio y conserva los de los demás.
    const src = dayStates[copyDay].blocks.filter(b => (b.location_id || '') === activeLoc)
    setHoursDirty(true)
    setDayStates(prev => {
      const next = [...prev]
      for (const d of copyTargets) {
        const others = next[d].blocks.filter(b => (b.location_id || '') !== activeLoc)
        // El mapeo se arrastra con el horario (D-05), pero con el arreglo CLONADO: si dos días
        // copiados compartieran la referencia, togglear un chip en uno cambiaría el otro en
        // silencio (P-04). El `[...]` es la diferencia entre copiar y aliasear.
        const copied = src.map(b => ({ start_time: b.start_time, end_time: b.end_time, label: b.label, location_id: activeLoc, service_ids: [...b.service_ids] }))
        const blocks = [...others, ...copied]
        next[d] = { enabled: blocks.length > 0, blocks }
      }
      return next
    })
    setCopyDay(null)
    // Copy condicional: el mensaje sólo nombra los servicios si de verdad se copió alguno; decir
    // que se copiaron cuando no había ninguno mapeado sería un aviso falso.
    const copiedServices = src.some(b => b.service_ids.length > 0)
    toast.success(copiedServices
      ? `Horario y ${term.services.toLowerCase()} copiados · acordate de guardar`
      : 'Horario copiado · acordate de guardar')
  }

  // ── El guardado de horarios: UNA llamada, todo-o-nada (D-04) ──────────────
  //
  // Antes esto borraba TODOS los bloques del negocio y reinsertaba. Dos agujeros que la migr. 074
  // cierra de raíz: (1) las filas del mapeo franja↔servicio son hijas con borrado en cascada, así
  // que cada guardado de horarios se llevaba puesto el mapeo que el dueño acababa de configurar, y
  // el estado al que caía —comodín— es VISUALMENTE IDÉNTICO a no haber configurado nada; (2) entre
  // el borrado y la inserción, la disponibilidad PÚBLICA leía un negocio sin horarios. Ahora el
  // diff lo hace la base adentro de una transacción: no hay estado intermedio observable.
  //
  // Dos límites que esta fase acepta a conciencia:
  //   · Los días con horario especial (`schedule_exceptions`) no son franjas, así que no tienen
  //     mapeo posible y siguen ofreciendo todos los servicios (D-06, el caveat que la Phase 18
  //     aceptó como RA-04).
  //   · La lectura pública de disponibilidad todavía no discrimina por sede (D-19 / WR-04): el
  //     bloque ya lleva su consultorio y un dueño multi-sede PUEDE mapear por sede; lo que no filtra
  //     por sede es la lectura. Cerrarlo tocaría el módulo puro y sus dos consumidores —que la
  //     Phase 18 dejó con cero amenazas abiertas— para un caso con cero negocios afectados hoy.
  async function saveHours() {
    if (!validateBlocks()) { toast.error('Corregí los errores antes de guardar'); return }
    // ⚠ `savingHours` CONGELA la grilla entera, no sólo el botón (CR-01): inputs de hora, ×,
    // "Agregar bloque", el toggle de día, "Copiar a otros días" y cada chip de servicio. Sin eso,
    // todo lo que el dueño toque mientras la llamada está en vuelo se PIERDE sin ruido: cuando el
    // RPC vuelve, este handler re-deriva el estado de las filas que devolvió la base (P-01, abajo)
    // —un reemplazo, no un merge— y encima apaga `hoursDirty`, o sea que borra también la única
    // señal de que algo quedaba pendiente. El resultado es un mapeo que desaparece y cae en
    // comodín, un estado visualmente idéntico a "nunca se configuró": exactamente el modo de falla
    // que la migr. 074 cerró del lado de la base.
    //
    // Se eligió deshabilitar y no un `if (savingHours) return` adentro de cada mutador: el early
    // return también evita la pérdida, pero el click no hace NADA y el dueño no tiene forma de
    // saber por qué. El control apagado sí lo explica.
    //
    // La regla, por encima de esa enumeración: TODO lo que este botón persiste —los bloques de la
    // grilla y el objeto de configuración declarado arriba— tiene que (a) ensuciar el estado y
    // (b) congelarse mientras la llamada está en vuelo. La primera mitad la garantiza la estructura
    // (un solo camino de escritura al objeto); la segunda es por control y hay que ponerla a mano.
    // Enumerar en vez de derivar la regla es lo que dejó afuera a la duración del turno y al
    // descanso entre turnos hasta el audit visual de la fase.
    setSavingHours(true)
    try {
      // ⚠ El set que viaja es COMPLETO: los 7 días con TODOS sus bloques, de todos los
      // consultorios. La base borra del negocio lo que no venga en el payload, así que armarlo con
      // la lista ya filtrada por consultorio activo sería "guardé la sede A y borré los horarios de
      // la sede B" — una regresión que sólo aparece en un negocio multi-sede y que en local, con un
      // solo consultorio, no la ve nadie (P-03). Por eso el constructor del payload no acepta
      // ningún parámetro de consultorio: no hay por dónde meter el filtro sin cambiar su firma.
      const blocks = buildSaveHoursPayload(dayStates, { hasLocations: activeLocations.length > 0 })
      const { data, error } = await supabase.rpc('save_agenda_blocks', {
        p_business_id: business.id,
        p_blocks: blocks,
      })
      if (error) {
        const reason = classifySaveHoursError(error)
        // Se registra el CÓDIGO, nunca el mensaje: alcanza para diagnosticar y no arrastra el
        // schema a ningún lado.
        console.error('[agenda/save-hours] rechazo:', reason, error.code)
        if (reason === 'not_deployed') {
          // Sin esta línea el síntoma es indistinguible de un problema de red, y el diagnóstico real
          // es otro: la migr. 074 no está aplicada en esta base, o se aplicó sin recargar el cache
          // del schema de PostgREST (P-05).
          console.error('[agenda/save-hours] la función de guardado de la agenda no está expuesta por PostgREST — verificar que la migración 074 esté aplicada y que se haya recargado el cache del schema')
        }
        toast.error(SAVE_HOURS_REJECT_COPY[reason])
        // El estado local NO se toca: lo que el dueño ve sigue siendo lo que quiso guardar.
        return
      }
      // Re-derivar el estado con lo que devolvió la base NO es opcional (P-01). El editor deriva sus
      // 7 días una sola vez, en el inicializador, y no vuelve a derivarlos de las props: no hay
      // efecto que los re-sincronice, y recargar la ruta del servidor tampoco alcanza porque el
      // inicializador ya corrió y no vuelve a correr. Sin esto, un bloque insertado en el guardado
      // #1 seguiría sin id en memoria y el guardado #2 lo volvería a INSERTAR: cada franja nueva,
      // duplicada. Se usa la MISMA función que el inicializador, así que no hay dos derivaciones
      // del mismo estado que puedan divergir.
      setDayStates(buildDayStatesFromRows((data ?? []) as SavedAgendaBlock[]))
      setHoursDirty(false)
      toast.success('Horarios guardados')
      // La duración del turno y el descanso quedan FUERA de la transacción a propósito: no
      // participan de ninguna invariante con el mapeo —nadie puede observar un estado inconsistente
      // entre las dos cosas— y meterlos adentro agrandaría la firma de la función de la base sin
      // cerrar ningún estado intermedio que el público pueda ver. Lo que sí se corrige: hasta hoy
      // este UPDATE no chequeaba su error, así que podía fallar MUDO y el dueño se iba creyendo que
      // había configurado (T-19-27).
      const { error: bizError } = await supabase.from('businesses')
        .update({ default_slot_duration: hoursConfig.slotDuration, buffer_minutes: hoursConfig.bufferMinutes })
        .eq('id', business.id)
      if (bizError) {
        console.error('[agenda/save-hours] duración/descanso:', bizError.code)
        // Se vuelve a prender la señal: el `setHoursDirty(false)` de arriba es correcto para el RPC
        // (los horarios SÍ se guardaron), pero si este UPDATE falla queda configuración sin
        // persistir y el dueño se iría sin ningún indicador — justo el modo de falla que el
        // indicador existe para cubrir. Así la pantalla no contradice al toast.
        setHoursDirty(true)
        // La copy dice la verdad completa: los horarios SÍ quedaron guardados.
        toast.error('Los horarios se guardaron, pero no se pudo guardar la duración del turno ni el descanso entre turnos. Probá de nuevo.')
      }
    } finally {
      // `finally` y no una línea antes de cada `return`: el botón tiene que volver pase lo que pase,
      // incluida una excepción de red, o el guardado queda muerto hasta recargar.
      setSavingHours(false)
    }
  }

  // Ventana de reserva pública (BOOK-WINDOW-01): con cuánta anticipación puede reservar un cliente
  // desde la página pública. Vive acá (junto a horarios y días especiales) porque es config de AGENDA,
  // no de cobros. 3 modos mutuamente excluyentes (D-01): días rolling / sin límite / fecha exacta; el
  // modo inicial se deriva de las columnas (fecha tiene precedencia, espeja effectiveBookingCutoff).
  const [windowForm, setWindowForm] = useState<{ mode: 'dias' | 'sin_limite' | 'fecha'; days: number; date: string }>({
    mode: business.max_advance_date ? 'fecha' : (business.max_advance_days && business.max_advance_days > 0 ? 'dias' : 'sin_limite'),
    days: business.max_advance_days ?? 30,
    date: business.max_advance_date ?? '',
  })
  const [savingWindow, setSavingWindow] = useState(false)
  async function saveWindow() {
    // Pitfall 4: los 3 modos son mutuamente excluyentes en la DB — se escribe la columna del modo
    // activo y se nulea SIEMPRE la otra. Nunca dejar max_advance_days y max_advance_date a la vez.
    let payload: { max_advance_days: number | null; max_advance_date: string | null }
    if (windowForm.mode === 'dias') {
      const days = Math.floor(windowForm.days)
      if (!Number.isFinite(days) || days < 1) { toast.error('Ingresá un número de días mayor o igual a 1'); return }
      payload = { max_advance_days: days, max_advance_date: null }
    } else if (windowForm.mode === 'fecha') {
      if (!windowForm.date) { toast.error('Elegí una fecha de corte'); return }
      payload = { max_advance_days: null, max_advance_date: windowForm.date }
    } else {
      payload = { max_advance_days: null, max_advance_date: null }
    }
    setSavingWindow(true)
    const { error } = await supabase.from('businesses').update(payload).eq('id', business.id)
    setSavingWindow(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Ventana de reserva guardada')
  }

  // ── Excepciones por fecha (capa 1) ──────────────────────────────────────────
  const [exceptions, setExceptions] = useState<ScheduleException[]>(initialExceptions)
  const [excMonth, setExcMonth] = useState(() => startOfMonth(new Date()))
  const thisMonthStart = startOfMonth(new Date())

  // Excepciones agrupadas por fecha (puede haber varias por día: global + por consultorio).
  const excByDate = useMemo(() => {
    const m = new Map<string, ScheduleException[]>()
    for (const e of exceptions) { const arr = m.get(e.date) || []; arr.push(e); m.set(e.date, arr) }
    return m
  }, [exceptions])
  const excCalendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(excMonth), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(excMonth), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [excMonth])

  // Borrar una excepción puntual (de la lista de próximos), por id.
  async function clearExceptionRow(ex: ScheduleException) {
    const { error } = await supabase.from('schedule_exceptions').delete().eq('id', ex.id)
    if (error) { toast.error('Error'); return }
    setExceptions(prev => prev.filter(e => e.id !== ex.id))
    toast.success('Excepción quitada')
  }

  // Selección de días. excSel = días elegidos; el panel lateral opera sobre ellos (1 o varios).
  const [excSel, setExcSel] = useState<Set<string>>(new Set())
  const [excBulk, setExcBulk] = useState({ start: '09:00', end: '18:00' })
  // "Aplicar a:" — a qué consultorios aplica la excepción. '__all__' = global (todo el negocio).
  const [excTargets, setExcTargets] = useState<Set<string>>(new Set(['__all__']))
  const excIsGlobal = excTargets.has('__all__') || activeLocations.length === 0
  const excLocs: (string | null)[] = excIsGlobal ? [null] : [...excTargets]
  const excMatchesTarget = (e: ScheduleException) => excIsGlobal ? !e.location_id : (!!e.location_id && excTargets.has(e.location_id))
  // Merge de filas tras un upsert, deduplicando por (fecha|consultorio).
  function mergeExceptions(prev: ScheduleException[], rows: ScheduleException[]) {
    const key = (e: ScheduleException) => `${e.date}|${e.location_id ?? ''}`
    const m = new Map(prev.map(e => [key(e), e]))
    for (const e of rows) m.set(key(e), e)
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date))
  }
  // Ancla para la selección por rango (Shift). Es el último día clickeado sin modificadores.
  const [excAnchor, setExcAnchor] = useState<string | null>(null)
  // Selección siempre múltiple (funciona en touch sin teclado): cada tap suma o
  // quita el día. Shift + otro día = rango hacia el futuro. Se confirma en el panel.
  function handleDayClick(d: Date, ev: MouseEvent) {
    const ds = format(d, 'yyyy-MM-dd')
    if (ev.shiftKey && excAnchor && ds >= excAnchor) {
      const today = startOfDay(new Date())
      const range = eachDayOfInterval({ start: parseISO(excAnchor), end: parseISO(ds) })
        .filter(x => !isBefore(x, today))
        .map(x => format(x, 'yyyy-MM-dd'))
      setExcSel(new Set(range))
      return
    }
    setExcSel(s => { const n = new Set(s); if (n.has(ds)) n.delete(ds); else n.add(ds); return n })
    setExcAnchor(ds)
  }
  // Resumen de la selección para el panel (1 día = fecha completa; varios = conteo + rango).
  const selDates = [...excSel].sort()
  const selectionLabel = selDates.length === 1
    ? format(parseISO(selDates[0]), "EEEE d 'de' MMMM", { locale: es })
    : selDates.length > 1
      ? `${selDates.length} días · ${format(parseISO(selDates[0]), 'd MMM', { locale: es })} → ${format(parseISO(selDates[selDates.length - 1]), 'd MMM', { locale: es })}`
      : ''
  const selectionHasException = selDates.some(ds => (excByDate.get(ds)?.length ?? 0) > 0)
  async function bulkCloseDays(dates: string[]) {
    if (dates.length === 0) return
    const rows = dates.flatMap(date => excLocs.map(loc => ({ business_id: business.id, date, location_id: loc, closed: true, start_time: null, end_time: null })))
    const { data, error } = await supabase.from('schedule_exceptions').upsert(rows, { onConflict: 'business_id,date,location_id' }).select()
    if (error) { toast.error('Error al guardar'); return }
    setExceptions(prev => mergeExceptions(prev, data as ScheduleException[]))
    setExcSel(new Set()); setExcAnchor(null)
    toast.success(`${dates.length} día${dates.length > 1 ? 's' : ''} cerrado${dates.length > 1 ? 's' : ''}`)
  }
  async function bulkSpecialDays(dates: string[], start: string, end: string) {
    if (dates.length === 0) return
    if (end <= start) { toast.error('La hora fin debe ser mayor a la inicio'); return }
    const rows = dates.flatMap(date => excLocs.map(loc => ({ business_id: business.id, date, location_id: loc, closed: false, start_time: start, end_time: end })))
    const { data, error } = await supabase.from('schedule_exceptions').upsert(rows, { onConflict: 'business_id,date,location_id' }).select()
    if (error) { toast.error('Error al guardar'); return }
    setExceptions(prev => mergeExceptions(prev, data as ScheduleException[]))
    setExcSel(new Set()); setExcAnchor(null)
    toast.success(`Horario especial en ${dates.length} día${dates.length > 1 ? 's' : ''}`)
  }
  async function bulkClearDays(dates: string[]) {
    if (dates.length === 0) return
    let q = supabase.from('schedule_exceptions').delete().eq('business_id', business.id).in('date', dates)
    q = excIsGlobal ? q.is('location_id', null) : q.in('location_id', [...excTargets])
    const { error } = await q
    if (error) { toast.error('Error'); return }
    setExceptions(prev => prev.filter(e => !(dates.includes(e.date) && excMatchesTarget(e))))
    setExcSel(new Set()); setExcAnchor(null)
    toast.success('Excepciones quitadas')
  }

  // ── Vista semanal de turnos ─────────────────────────────────────────────────
  const todayWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const [weekStart, setWeekStart] = useState(todayWeekStart)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const openDays = useMemo(() => new Set(initialTimeBlocks.map(b => b.day_of_week)), [initialTimeBlocks])

  // ── Ocupación y agrupamiento de la columna del día (POLISH-09, D-10/D-11/D-12) ──────────────
  // Index de servicios por id: los `services` llegan del server ya filtrados por business_id
  // (T-02-13), así que nada de lo que se calcula acá puede alcanzar datos de otro tenant.
  const serviceById = useMemo(() => new Map(services.map(s => [s.id, s])), [services])

  // Toda la ocupación vive en `lib/agenda-occupancy.ts` (módulo puro, con su suite de 20 casos y dos
  // garantías probadas por mutación). Acá NO se recalcula nada: la grilla solo PINTA lo que ese
  // módulo decide.
  //
  // ⚠ El cupo sale de `services.capacity`, la fuente del MOTOR desde la migración 068. Hasta esta
  // fase la columna del día sacaba el cupo recorriendo los bloques de horario: esa columna dejó de
  // decidir, así que el panel podía avisar "lleno" con un número que `book_slot_atomic` ignora. La
  // lectura vieja se borró entera y el módulo puro ni siquiera recibe los bloques — no hay parámetro
  // por donde volver a enchufarlos.
  //
  // Los DOS cálculos salen del MISMO memo porque comparten el reloj: `nowMs` se lee UNA sola vez y
  // se pasa a los dos. Si cada uno leyera la hora por su cuenta, dos partes de la misma pantalla
  // podrían discrepar sobre si un hold ya venció (la fila diría 3/6 y el aviso de solape contaría 4).
  const { entriesByDate, overlapFullById } = useMemo(() => {
    const nowMs = Date.now()
    const byDate = new Map<string, AgendaAppt[]>()
    for (const a of initialAppointments) {
      const arr = byDate.get(a.date) || []
      arr.push(a)
      byDate.set(a.date, arr)
    }
    const entries = new Map<string, DayEntry<AgendaAppt>[]>()
    for (const [date, dayAppts] of byDate) {
      entries.set(date, buildDayEntries(dayAppts, serviceById, nowMs))
    }
    return {
      entriesByDate: entries,
      overlapFullById: computeOverlapFull(initialAppointments, serviceById, nowMs),
    }
  }, [initialAppointments, serviceById])

  // ── Roster del admin (CUPOS-04, D-04) ────────────────────────────────────────
  // Click en la fila de una clase grupal → overlay con el contador y la lista (nombre, contacto,
  // estado). El slot se identifica por la key de la fila: fecha + hora + AGENDA + servicio.
  const isDesktop = useMediaQuery('(min-width: 768px)')
  // El slot se identifica por la KEY de la entrada (`date|HH:MM|bucket|service_id`), no por sus
  // partes sueltas: desde el code-review CR-01 la fecha, la hora y el servicio ya no alcanzan —
  // la misma clase dictada por dos profesionales son dos filas distintas, y hay que abrir la que se
  // tocó. La key es la identidad que arma el módulo puro, así que acá no se re-deriva.
  const [rosterSlot, setRosterSlot] = useState<string | null>(null)

  // El roster NO recalcula nada: recupera de `entriesByDate` LA MISMA entrada de grupo que se
  // renderizó en la columna. Al leer el mismo objeto es estructuralmente imposible que la fila y el
  // diálogo muestren números distintos (T-17-23).
  //
  // Tres consecuencias buscadas:
  // - El roster filtra por SERVICIO y por AGENDA. Antes, dos clases distintas a la misma hora se
  //   mezclaban en una sola lista (T-17-24); y desde el code-review CR-01 la misma clase dictada por
  //   dos profesionales tampoco mezcla sus dos listas.
  // - La lista puede tener MÁS filas que el contador: un hold vencido o un turno que no ocupa lugar
  //   sigue apareciendo con su chip de estado, pero el contador dice cuántos lugares están
  //   realmente tomados. No es una discrepancia, es la distinción entre "quiénes figuran" y
  //   "cuántos lugares hay tomados".
  // - Y también puede tener MENOS: el contador es el de la AGENDA-HORA (el eje del motor), así que
  //   si otro servicio comparte agenda y hora, sus lugares cuentan acá aunque su gente no figure en
  //   esta lista. Es exactamente lo que hace `book_slot_atomic` al decidir si acepta una reserva.
  const roster = useMemo(() => {
    if (!rosterSlot) return null
    // La key empieza por la fecha (`date|HH:MM|bucket|service_id`), así que la columna del día sale
    // de ahí sin guardar un segundo estado que pueda desincronizarse.
    const date = rosterSlot.slice(0, rosterSlot.indexOf('|'))
    const entry = (entriesByDate.get(date) || []).find(e => e.kind === 'group' && e.key === rosterSlot)
    if (!entry || entry.kind !== 'group') return null
    return {
      date,
      time: entry.time,
      serviceName: entry.serviceName,
      // Nombre de la agenda: solo cuando dos filas del mismo servicio y hora compiten (si no, el
      // título repetiría un dato que no desambigua nada).
      agendaName: entry.agendaAmbiguous ? (entry.appts[0]?.professionals?.name ?? null) : null,
      capacity: entry.capacity,
      occupied: entry.occupied,
      enrollees: [...entry.appts].sort((a, b) => a.client_name.localeCompare(b.client_name)),
    }
  }, [rosterSlot, entriesByDate])
  // Estado del día para el badge: cerrado / horario especial / abierto (según excepción o grilla).
  function dayStatus(d: Date): 'closed' | 'special' | 'open' {
    const list = excByDate.get(format(d, 'yyyy-MM-dd')) || []
    if (list.some(e => e.closed && !e.location_id)) return 'closed' // cierre global
    if (list.length > 0) return 'special' // excepciones parciales/especiales
    return openDays.has(d.getDay()) ? 'open' : 'closed'
  }
  // Próximos días especiales (de hoy en adelante) para listarlos bajo el calendario.
  const upcomingExc = useMemo(() => {
    const t = format(new Date(), 'yyyy-MM-dd')
    return exceptions.filter(e => e.date >= t).sort((a, b) => a.date.localeCompare(b.date))
  }, [exceptions])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <PageEyebrow label="Agenda" />
          <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">Tus turnos de la semana, la grilla de atención y los días especiales.</p>
        </div>

        {/* Acciones de la página: alta de turno + controles de Google Calendar */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0 sm:pt-1">
          <Button onClick={() => openNuevoTurno()} className="gap-2">
            <Plus className="w-4 h-4" /> Nuevo turno
          </Button>
          {googleEnabled && (
            googleConnected ? (
              <>
                <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="w-3.5 h-3.5 text-primary" /> Google Calendar</span>
                <Button variant="outline" size="sm" onClick={syncGoogle} disabled={syncingGoogle}>
                  <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', syncingGoogle && 'animate-spin')} />{syncingGoogle ? 'Sincronizando...' : 'Sincronizar'}
                </Button>
                <Button variant="ghost" size="sm" onClick={disconnectGoogle} disabled={disconnectingGoogle}>
                  {disconnectingGoogle ? '...' : 'Desconectar'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { window.location.href = '/api/google/connect?from=agenda' }}>
                <CalendarClock className="w-3.5 h-3.5 mr-1.5" /> Conectar Google Calendar
              </Button>
            )
          )}
        </div>
      </div>

      {/* Turnos de la semana */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Turnos de la semana</p>
            <p className="text-xs text-muted-foreground capitalize">{format(weekStart, "d 'de' MMM", { locale: es })} – {format(addDays(weekStart, 6), "d 'de' MMM", { locale: es })}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={!isBefore(todayWeekStart, weekStart)} onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {weekDays.map(d => {
            const ds = format(d, 'yyyy-MM-dd')
            const st = dayStatus(d)
            // Entradas del día, ya agrupadas por el módulo puro: una clase grupal es UNA entrada
            // (no N chips), y todo lo demás es un turno suelto EN SU LUGAR. El orden cronológico
            // mezclado lo resuelve el módulo (el grupo va en la posición de su primer miembro), así
            // que acá se renderiza en el orden en que vienen: la columna se sigue leyendo como una
            // línea de tiempo.
            const dayEntries = entriesByDate.get(ds) || []
            const isToday = isSameDay(d, new Date())
            // D-08 acotado: el header de la celda pre-llena la FECHA del form (no la hora).
            // La fila de una clase grupal abre el roster (D-04); los turnos sueltos se muestran como
            // hoy (no interactivos). La celda es un <div> para que la fila-botón del grupo no quede
            // anidada en un <button> (HTML inválido / a11y rota).
            return (
              <div
                key={ds}
                className={cn(
                  // Hover sutil de la celda (mismo token que el header-boton y los chips): la celda
                  // dejo de ser <button> (a11y de los chips-boton del roster) y recupera el feedback
                  // de hover aca. transition-colors (≤300ms, solo color) · los hijos (header-boton,
                  // chips) mantienen su propio hover/focus encima.
                  'rounded-lg border p-2 min-h-[5rem] flex flex-col gap-1 transition-colors hover:border-primary/60',
                  st === 'closed' ? 'bg-secondary/30 hover:bg-secondary/95' : 'hover:bg-secondary/85',
                  isToday ? 'border-primary' : 'border-border',
                )}
              >
                <button
                  type="button"
                  onClick={() => openNuevoTurno(ds)}
                  aria-label={`Agregar turno el ${format(d, "EEEE d 'de' MMMM", { locale: es })}`}
                  className="text-left flex items-center justify-between rounded -m-1 p-1 transition-[background-color,filter] hover:bg-secondary hover:brightness-[0.85] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <span className={cn('text-xs font-semibold capitalize', isToday && 'text-primary')}>{format(d, 'EEE d', { locale: es })}</span>
                  {st === 'closed' && <CalendarOff className="w-3 h-3 text-muted-foreground" />}
                  {st === 'special' && <CalendarClock className="w-3 h-3 text-primary" />}
                </button>
                {dayEntries.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">{st === 'closed' ? 'Cerrado' : 'Sin turnos'}</span>
                ) : dayEntries.map(entry => {
                  // ── Clase grupal (D-10): UNA fila por horario ────────────────────────────────
                  // Alto fijo de una fila, haya 3 o 15 inscriptos: a 375px la grilla es de dos
                  // columnas de ~170px y seis chips apilados hacían impracticable la semana.
                  if (entry.kind === 'group') {
                    // El `3/6` visual no puede ser el único portador del dato: el aria-label dice la
                    // ocupación con palabras, y repite el aviso de seña que el badge muestra en
                    // ámbar (en mobile no hay hover, así que el `title` no llega).
                    // Nombre de la agenda: SOLO cuando otra fila del mismo servicio y hora vive en
                    // otra agenda (`agendaAmbiguous`). Sin esa marca, dos filas idénticas a la misma
                    // hora serían indistinguibles; con ella, el caso de siempre —una sola agenda—
                    // renderiza exactamente lo mismo que antes, sin gastar un renglón ni ancho.
                    const agendaName = entry.agendaAmbiguous ? (entry.appts[0]?.professionals?.name ?? null) : null
                    // ── Clase CERRADA: pasó y todos sus turnos se marcaron completados (WR-05) ──
                    // `completed` no ocupa lugar (correcto: espeja el motor), así que el estado de la
                    // fila no puede salir de `occupied > 0`. Con esa regla, una clase de 6 personas
                    // dictada el lunes y marcada como completada se veía el miércoles como una fila
                    // GRIS con "0/6" — el mismo tratamiento visual que un slot cancelado, y sin los
                    // seis chips con nombre que antes de esta fase seguían ahí. La lectura que se
                    // llevaba el dueño ("no vino nadie") era la opuesta a lo que pasó. La vista
                    // semanal arranca en startOfWeek, así que siempre hay días ya pasados en pantalla.
                    const closed = entry.occupied === 0 && entry.appts.length > 0 && entry.appts.every(a => a.status === 'completed')
                    const aria = closed
                      // Sobre un horario cerrado, "cuántos lugares quedan" ya no es una pregunta: la
                      // que queda es cuánta gente asistió.
                      ? `Ver inscriptos de ${entry.serviceName ?? 'la clase'}${agendaName ? ` con ${agendaName}` : ''} a las ${entry.time} del ${format(d, "EEEE d 'de' MMMM", { locale: es })} — clase terminada, ${entry.appts.length} ${entry.appts.length === 1 ? 'asistió' : 'asistieron'}`
                      : `Ver inscriptos de ${entry.serviceName ?? 'la clase'}${agendaName ? ` con ${agendaName}` : ''} a las ${entry.time} del ${format(d, "EEEE d 'de' MMMM", { locale: es })} — ${entry.occupied} de ${entry.capacity} lugares${entry.pendingDeposit >= 1 ? `, ${entry.pendingDeposit} sin seña` : ''}`
                    return (
                      <button
                        key={entry.key}
                        type="button"
                        onClick={() => setRosterSlot(entry.key)}
                        aria-label={aria}
                        className={cn(
                          'rounded px-1.5 py-1 text-[11px] leading-tight border',
                          // El grupo es UNA unidad: el estado por persona vive en el badge y en el
                          // roster, no en la superficie de la fila. Un slot cuyos turnos son TODOS
                          // no-ocupantes (cancelados, holds vencidos) igual se renderiza, con su
                          // contador en 0/N sobre la superficie neutra: colapsar no puede hacer
                          // desaparecer un día que hoy muestra algo.
                          statusChip(entry.occupied > 0 ? 'confirmed' : closed ? 'completed' : 'cancelled'),
                          // A 375px la grilla de la semana es de dos columnas: a la celda del día le
                          // quedan ~143px y, descontando su relleno y el del chip, el contenido dispone de
                          // ~115px. En un solo renglón la hora (~32px) más el contador ámbar (~93px) más
                          // los espacios ya sumaban ~137px, así que al nombre no le quedaba ancho y
                          // `Yoga grupal` directamente no se veía (G-03). Por eso el chip apila: hora y
                          // nombre arriba, contador abajo, y el nombre recupera ~77px. Se descartó acortar
                          // el aviso de seña (recupera menos, sigue truncando y encima esconde
                          // información) y pasar la semana a una sola columna (duplica el alto de una
                          // superficie que hoy funciona). El precedente es la fila mobile de Finanzas
                          // (POLISH-10): el dato nuevo entró en su propia línea y fue la única superficie
                          // de la fase que no se rompió.
                          'flex w-full flex-col items-start gap-0.5 text-left cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                        )}
                      >
                        <span className="flex w-full min-w-0 items-center gap-1.5">
                          <span className="font-semibold">{entry.time}</span>
                          <span className="min-w-0 flex-1 truncate">{entry.serviceName ?? 'Clase'}</span>
                        </span>
                        {/* Desambiguación de agenda: renglón propio y no un tercer elemento en la
                            línea de arriba, que a 375px ya está al límite (G-03). Aparece solo en el
                            caso ambiguo, así que la fila del negocio de una sola agenda no cambia. */}
                        {agendaName && <span className="w-full truncate text-[10px] opacity-80">{agendaName}</span>}
                        {/* Tope duro de ancho. El caso peor del contador —cupo lleno Y además el aviso
                            de seña— mide ~119px contra los ~115px de contenido del chip. El Badge base
                            ya recorta lo que sobra, así que acotarlo al ancho del chip hace que ese
                            exceso se corte ADENTRO del badge en vez de desbordar el borde redondeado,
                            que es el síntoma exacto que reportó la UAT. Y como el cupo va primero
                            (UI-SPEC §4.4: primero el cupo, después la plata), lo único que puede ceder
                            en ese extremo es la cola del aviso de seña, nunca la cifra. El texto entero
                            sigue disponible en el title del badge y en el aria-label del botón. El
                            call-site tampoco necesita declarar que el badge no encoge: eso ya viene en
                            la base del componente. */}
                        {closed ? (
                          // Sobre un horario cerrado el contador `0/6` no responde ninguna pregunta
                          // útil, y encima responde mal la que el dueño se hace. Mismo molde, mismos
                          // tokens y misma altura que OccupancyBadge para no mover la fila: sólo
                          // cambia el dato, que ahora es el único que queda vivo.
                          <Badge
                            variant="outline"
                            title={`Clase terminada · ${entry.appts.length} ${entry.appts.length === 1 ? 'asistió' : 'asistieron'}`}
                            className="h-4 max-w-full gap-0.5 border-border bg-secondary px-1 py-0 text-[9px] font-medium text-muted-foreground"
                          >
                            <Check className="size-2.5!" /><span className="tabular-nums">{entry.appts.length}</span><span>{entry.appts.length === 1 ? 'asistió' : 'asistieron'}</span>
                          </Badge>
                        ) : (
                          <OccupancyBadge
                            occupied={entry.occupied}
                            capacity={entry.capacity}
                            pendingDeposit={entry.pendingDeposit}
                            scope="slot"
                            className="max-w-full"
                          />
                        )}
                      </button>
                    )
                  }
                  // ── Turno suelto: individual, simultáneo, o sin servicio resoluble (D-12) ────
                  // Recurso simultáneo (D-11): sigue SIN agrupar, un chip por turno con su propio
                  // horario, porque su cupo se cuenta por solape y no por hora de inicio exacta.
                  // Ya NO es un <button>: un turno que no pertenece a un grupo no tiene roster que
                  // abrir.
                  const a = entry.appt
                  const overlapFull = overlapFullById.get(a.id)
                  const chipClass = cn('rounded px-1.5 py-1 text-[11px] leading-tight border break-words', statusChip(a.status))
                  return (
                    <div key={a.id} className={chipClass}>
                      <span className="font-semibold">{a.time.slice(0, 5)}</span> {a.client_name}
                      {a.services?.name && <span className="block text-[10px] opacity-80">{a.services.name}</span>}
                      {/* Aviso "lleno" (D-11): el intervalo de ESTE turno ya alcanzó el cupo del
                          recurso. Dato exclusivo del admin (el público nunca ve la ocupación, D-06).
                          Conserva su comportamiento —aparece SOLO al llenarse, porque el solape no se
                          lee de un vistazo— pero ahora sale del mismo componente y con los mismos
                          tokens que la línea de grupo: eso es la armonización que pide POLISH-09.
                          `pendingDeposit={0}`: el aviso de seña es propio del slot grupal, donde el
                          ámbar por-persona quedó escondido al colapsar; acá los chips siguen a la
                          vista uno por uno. */}
                      {overlapFull && (
                        <OccupancyBadge
                          occupied={overlapFull.count}
                          capacity={overlapFull.capacity}
                          pendingDeposit={0}
                          scope="overlap"
                          className="mt-0.5"
                        />
                      )}
                      {/* Badge "Fijo" (D-09): el turno viene de un abono. Reusa el Badge del design system,
                          sizeado para no romper la tarjeta compacta del turno. */}
                      {a.abono_id && (
                        <Badge variant="secondary" className="mt-0.5 h-4 gap-0.5 px-1 py-0 text-[9px] font-medium">
                          <Repeat className="size-2.5!" /> Fijo
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Grilla semanal */}
      <Card className="p-6 space-y-5">
        {/* Slot duration */}
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <div className="space-y-1 flex-1">
            <Label>Duración del turno por defecto</Label>
            <p className="text-xs text-muted-foreground">Se usa para calcular los slots disponibles. Puede sobreescribirse por servicio.</p>
          </div>
          <Select value={String(hoursConfig.slotDuration)} onValueChange={v => updateHoursConfig({ slotDuration: Number(v) })} disabled={savingHours}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLOT_DURATIONS.map(d => (
                <SelectItem key={d} value={String(d)}>{d} minutos</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buffer entre turnos */}
        <div className="flex items-center gap-4 pb-4 border-b border-border">
          <div className="space-y-1 flex-1">
            <Label>Descanso entre turnos</Label>
            <p className="text-xs text-muted-foreground">Tiempo libre que se deja entre un turno y el siguiente.</p>
          </div>
          <Select value={String(hoursConfig.bufferMinutes)} onValueChange={v => updateHoursConfig({ bufferMinutes: Number(v) })} disabled={savingHours}>
            <SelectTrigger className="w-36">
              <SelectValue>{hoursConfig.bufferMinutes === 0 ? 'Sin descanso' : `${hoursConfig.bufferMinutes} minutos`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BUFFER_OPTIONS.map(d => (
                <SelectItem key={d} value={String(d)}>{d === 0 ? 'Sin descanso' : `${d} minutos`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selector de consultorio (tabs estilo Configuración) + ficha — solo si hay consultorios */}
        {activeLocations.length > 0 && (
          <div className="space-y-3">
            <Tabs value={activeLoc} onValueChange={selectLocation}>
              <TabsList className="flex flex-wrap w-full sm:w-fit h-auto">
                {activeLocations.map(l => <TabsTrigger key={l.id} value={l.id}>{l.name}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            {selLoc && (
              <div className="rounded-md bg-secondary/50 p-3">
                <p className="text-sm font-medium">{selLoc.name}</p>
                {selMeta && <p className="text-xs text-muted-foreground mt-0.5">{selMeta}</p>}
              </div>
            )}
          </div>
        )}

        {/* Days — del consultorio activo */}
        <div className="space-y-4">
          {/* La línea guía: el ÚNICO texto explicativo de toda la fase. Enseña la regla del comodín
              UNA vez, no una vez por franja. Y su empty state es mutuamente excluyente con ella:
              o hay servicios y se explica la regla, o no los hay y se explica dónde cargarlos.

              La terminología sale del rubro y nunca va hardcodeada; el artículo antes de la
              interpolación se EVITA a propósito (regla de género heredada de la Phase 8: "elegí los
              {'{'}prestaciones{'}'}" no concuerda en ningún rubro). En canchas no se muestra
              ninguna de las dos: ahí un servicio ES una cancha con su propia agenda. */}
          {!isCanchas && (hasChipCatalog ? (
            <p className="text-xs text-muted-foreground">
              Debajo de cada franja elegí qué {term.services.toLowerCase()} se dan. Si no elegís ninguno, esa franja sirve para todos.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Cuando cargues {term.services.toLowerCase()} vas a poder elegir qué se da en cada franja.{' '}
              <Link href="/servicios" className="underline underline-offset-2">Ir a Servicios</Link>
            </p>
          ))}
          {DAY_DISPLAY_ORDER.map(day => {
            const dayBlocks = dayStates[day].blocks.map((block, idx) => ({ block, idx })).filter(({ block }) => (block.location_id || '') === activeLoc)
            const dayOpen = dayBlocks.length > 0
            return (
              <div key={day} className="space-y-2 sm:max-w-md">
                {/* Día: chip full-width y centrado (parecido al onboarding, mejor en mobile).
                    `disabled` mientras se guarda, como TODOS los controles de la grilla: ver el
                    bloque de `saveHours`. */}
                <button
                  onClick={() => toggleDay(day)}
                  disabled={savingHours}
                  className={cn(
                    'w-full text-center text-sm font-semibold py-2 px-3 rounded transition-colors disabled:pointer-events-none disabled:opacity-50',
                    dayOpen ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  )}
                >
                  {DAYS[day]}
                </button>
                {!dayOpen && <p className="text-center text-xs text-muted-foreground">Cerrado — tocá el día para abrirlo</p>}

                {dayOpen && (
                  <div className="space-y-2">
                    {dayBlocks.map(({ block, idx }) => (
                      <div key={idx} className="space-y-1">
                        {/* Hora inicio → hora fin → ×, en UNA sola línea. El stepper de cupo salió
                            de acá (D-12: la columna dejó de decidir en la migr. 068) y los ~74px
                            que liberó van ENTEROS a los dos inputs `flex-1`, no a un control nuevo:
                            a 375px cada input pasa de ~78px a ~115px. La línea de servicios va
                            DEBAJO del párrafo de error, no en esta fila. */}
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="time"
                            value={block.start_time}
                            disabled={savingHours}
                            onChange={e => updateBlock(day, idx, 'start_time', e.target.value)}
                            className="min-w-0 flex-1 px-1.5 text-center text-sm max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
                          />
                          <span className="shrink-0 text-xs text-muted-foreground">→</span>
                          <Input
                            type="time"
                            value={block.end_time}
                            disabled={savingHours}
                            onChange={e => updateBlock(day, idx, 'end_time', e.target.value)}
                            className="min-w-0 flex-1 px-1.5 text-center text-sm max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
                          />
                          {/* Único botón de la fila: se le suma nombre accesible (hasta ahora sólo
                              tenía `title`, que un lector de pantalla puede no anunciar) y foco
                              visible, que no tenía. Es el único retoque permitido a esta fila. */}
                          <button
                            onClick={() => removeBlock(day, idx)}
                            disabled={savingHours}
                            aria-label="Eliminar bloque"
                            className="shrink-0 rounded text-muted-foreground transition-colors hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
                            title="Eliminar bloque"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {block.error && (
                          <p className="text-xs text-red-400 pl-0.5">{block.error}</p>
                        )}
                        {/* La línea de servicios va TERCERA, después del párrafo de error: el error
                            tiene que quedar pegado a los inputs que lo causaron y los chips van
                            abajo de todo. La fila existente no se envuelve en nada nuevo. */}
                        {showServicesLine && (
                          <BlockServicesLine
                            serviceIds={block.service_ids}
                            catalog={serviceCatalog}
                            groupLabel={`Servicios de la franja de ${block.start_time} a ${block.end_time}`}
                            expanded={expandedChips.has(`${day}-${idx}`)}
                            disabled={savingHours}
                            onToggleExpanded={() => toggleChipsExpanded(day, idx)}
                            onToggleService={serviceId => toggleBlockService(day, idx, serviceId)}
                          />
                        )}
                      </div>
                    ))}
                    <div className="flex items-center gap-4 mt-1">
                      <button
                        onClick={() => addBlock(day)}
                        disabled={savingHours}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" /> Agregar bloque
                      </button>
                      <button
                        onClick={() => { setCopyDay(day); setCopyTargets(new Set()) }}
                        disabled={savingHours}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Copy className="w-3.5 h-3.5" /> Copiar a otros días
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* El único CTA de la fase es el que ya estaba: no se agrega ninguno (D-03). Al lado, el
            indicador de estado sucio — el ÚNICO lugar de toda la fase donde se usa el token de
            advertencia. Con horarios, un input que quedó mal SE VE; con el mapeo no: el dueño toca
            cuatro chips, se va, y la franja sigue en comodín, un estado visualmente idéntico a no
            haber configurado nada. Sin bloqueo de navegación, sin aviso al cerrar la pestaña y sin
            modal: eso está fuera de alcance. */}
        <div className="pt-2 border-t border-border flex items-center gap-4">
          <Button onClick={saveHours} disabled={savingHours}>
            {savingHours ? 'Guardando...' : 'Guardar horarios'}
          </Button>
          {hoursDirty && (
            <span role="status" className="text-xs text-warning">Cambios sin guardar</span>
          )}
        </div>
      </Card>

      {/* Ventana de reserva pública (BOOK-WINDOW-01) — 3 modos mutuamente excluyentes (D-01). Va acá,
          junto a horarios y días especiales, por ser config de agenda (no de cobros). */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="font-semibold text-sm flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Ventana de reserva</p>
          <p className="text-xs text-muted-foreground mt-0.5">Limita con cuánta anticipación un cliente puede reservar desde tu página pública. No afecta los turnos que cargás manualmente.</p>
        </div>

        <fieldset className="space-y-3">
          {/* Modo: días de anticipación */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input type="radio" id="window_mode_dias" name="window_mode" className="w-4 h-4 accent-primary cursor-pointer"
                checked={windowForm.mode === 'dias'} onChange={() => setWindowForm(f => ({ ...f, mode: 'dias' }))} />
              <Label htmlFor="window_mode_dias" className="cursor-pointer">Hasta cierta cantidad de días de anticipación</Label>
            </div>
            {windowForm.mode === 'dias' && (
              <div className="pl-7 space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Días de anticipación</Label>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <div className="flex items-center overflow-hidden rounded-md border border-border">
                    <button
                      type="button"
                      aria-label="Menos días"
                      disabled={windowForm.days <= 1}
                      onClick={() => setWindowForm(f => ({ ...f, days: Math.max(1, f.days - 1) }))}
                      className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={windowForm.days}
                      onFocus={e => e.target.select()}
                      onChange={e => setWindowForm(f => ({ ...f, days: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))}
                      className="h-8 w-12 border-x border-border bg-transparent text-center text-sm tabular-nums outline-none focus:bg-secondary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label="Días de anticipación"
                    />
                    <button
                      type="button"
                      aria-label="Más días"
                      onClick={() => setWindowForm(f => ({ ...f, days: f.days + 1 }))}
                      className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {windowForm.days >= 1 && (() => {
                    const d = addDays(todayInAR(), windowForm.days)
                    return (
                      <span className="text-sm font-medium text-primary">
                        Hasta el <span className="capitalize">{format(d, 'EEE', { locale: es }).replace('.', '')}</span> {format(d, 'dd/MM')}
                      </span>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Modo: sin límite */}
          <div className="flex items-center gap-3">
            <input type="radio" id="window_mode_sin_limite" name="window_mode" className="w-4 h-4 accent-primary cursor-pointer"
              checked={windowForm.mode === 'sin_limite'} onChange={() => setWindowForm(f => ({ ...f, mode: 'sin_limite' }))} />
            <Label htmlFor="window_mode_sin_limite" className="cursor-pointer">Sin límite</Label>
          </div>

          {/* Modo: fecha exacta */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input type="radio" id="window_mode_fecha" name="window_mode" className="w-4 h-4 accent-primary cursor-pointer"
                checked={windowForm.mode === 'fecha'} onChange={() => setWindowForm(f => ({ ...f, mode: 'fecha' }))} />
              <Label htmlFor="window_mode_fecha" className="cursor-pointer">Hasta una fecha exacta</Label>
            </div>
            {windowForm.mode === 'fecha' && (
              <div className="pl-7 space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Fecha de corte (inclusive)</Label>
                <div className="inline-block rounded-lg border border-border bg-card">
                  <Calendar
                    mode="single"
                    selected={windowForm.date ? parseISO(windowForm.date) : undefined}
                    onSelect={d => setWindowForm(f => ({ ...f, date: d ? format(d, 'yyyy-MM-dd') : '' }))}
                    disabled={d => d < startOfDay(new Date())}
                  />
                </div>
                {windowForm.date && (
                  <p className="text-sm font-medium text-primary">
                    Hasta el <span className="capitalize">{format(parseISO(windowForm.date), 'EEE', { locale: es }).replace('.', '')}</span> {format(parseISO(windowForm.date), 'dd/MM')}
                  </p>
                )}
              </div>
            )}
          </div>
        </fieldset>

        <Button className="self-start" onClick={saveWindow} disabled={savingWindow}>{savingWindow ? 'Guardando...' : 'Guardar'}</Button>
      </Card>

      {/* Excepciones por fecha — anular/cambiar un día puntual sobre la grilla semanal */}
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-sm">Días especiales</p>
            <p className="text-xs text-muted-foreground">Tocá los días que quieras. Shift = rango. Elegí qué hacer en el panel.</p>
          </div>
          {excSel.size > 0 && (
            <Button variant="outline" size="sm" className="flex-shrink-0" onClick={() => { setExcSel(new Set()); setExcAnchor(null) }}>
              Limpiar
            </Button>
          )}
        </div>
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
          <div className="max-w-sm w-full">
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={() => setExcMonth(m => addMonths(m, -1))} disabled={isSameMonth(excMonth, thisMonthStart)} className="w-8 h-8 rounded-md flex items-center justify-center text-lg text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:pointer-events-none transition-colors" aria-label="Mes anterior">‹</button>
              <span className="text-sm font-semibold capitalize">{format(excMonth, 'MMMM yyyy', { locale: es })}</span>
              <button type="button" onClick={() => setExcMonth(m => addMonths(m, 1))} className="w-8 h-8 rounded-md flex items-center justify-center text-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label="Mes siguiente">›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground font-semibold mb-1">
              {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {excCalendarDays.map(d => {
                const ds = format(d, 'yyyy-MM-dd')
                const inMonth = isSameMonth(d, excMonth)
                const isPast = isBefore(d, startOfDay(new Date()))
                const exList = excByDate.get(ds) || []
                const exClosed = exList.some(e => e.closed)
                const disabled = !inMonth || isPast
                return (
                  <button
                    key={ds}
                    type="button"
                    disabled={disabled}
                    onClick={e => handleDayClick(d, e)}
                    className={cn(
                      'aspect-square rounded-md text-xs font-medium flex items-center justify-center border transition-colors',
                      disabled ? 'border-transparent text-muted-foreground/30 cursor-default'
                        : exClosed ? 'border-destructive/40 bg-destructive/15 text-destructive'
                          : exList.length > 0 ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border bg-card hover:border-primary',
                      excSel.has(ds) && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                    )}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-destructive/15 border border-destructive/40" /> Cerrado</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary/10 border border-primary/40" /> Horario especial</span>
            </div>
          </div>

          {/* Panel de acción a la derecha del calendario. Siempre visible; apagado sin selección. */}
          <div className={cn('rounded-md bg-secondary/50 p-4 space-y-3 lg:w-64 lg:flex-shrink-0 transition-opacity', excSel.size === 0 && 'opacity-50 pointer-events-none')}>
            <div>
              <p className={cn('text-sm font-medium', selDates.length === 1 && 'capitalize')}>{excSel.size === 0 ? 'Ningún día seleccionado' : selectionLabel}</p>
              {excSel.size === 0 && <p className="text-xs text-muted-foreground mt-0.5">Tocá un día del calendario.</p>}
            </div>
            {activeLocations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Aplicar a</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setExcTargets(new Set(['__all__']))} className={cn('text-[11px] font-semibold py-1 px-2.5 rounded transition-colors', excIsGlobal ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>Todos</button>
                  {activeLocations.map(l => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setExcTargets(prev => {
                        const n = new Set(prev)
                        n.delete('__all__')
                        if (n.has(l.id)) n.delete(l.id); else n.add(l.id)
                        if (n.size === 0) n.add('__all__')
                        return n
                      })}
                      className={cn('text-[11px] font-semibold py-1 px-2.5 rounded transition-colors', !excIsGlobal && excTargets.has(l.id) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}
                    >{l.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {/* w-full sm:w-auto (D-01, criterio único sin excepciones por contenedor): estos 3 botones viven en el panel lateral angosto, así que a partir de 640px pasan a ancho-por-contenido dentro de una columna que sigue siendo estrecha — a mirar en la UAT visual, no a exceptuar acá. */}
              <Button size="sm" variant="destructive" className="w-full sm:w-auto" onClick={() => bulkCloseDays([...excSel])}>Marcar como cerrado</Button>
              {selectionHasException && (
                <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => bulkClearDays([...excSel])}>Quitar excepción</Button>
              )}
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium">Horario especial</p>
              <div className="flex items-center gap-2">
                <Input type="time" value={excBulk.start} onChange={e => setExcBulk(s => ({ ...s, start: e.target.value }))} className="w-full text-sm h-8" />
                <span className="text-muted-foreground text-sm">→</span>
                <Input type="time" value={excBulk.end} onChange={e => setExcBulk(s => ({ ...s, end: e.target.value }))} className="w-full text-sm h-8" />
              </div>
              <Button size="sm" className="w-full sm:w-auto" onClick={() => bulkSpecialDays([...excSel], excBulk.start, excBulk.end)}>Aplicar horario especial</Button>
            </div>
          </div>
        </div>
        {upcomingExc.length > 0 && (
          <div className="border-t border-border pt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Próximos días especiales</p>
            {upcomingExc.map(e => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="capitalize w-28 flex-shrink-0">{format(parseISO(e.date), "EEE d 'de' MMM", { locale: es })}</span>
                <span className="text-xs text-muted-foreground flex-1">
                  {e.closed ? 'Cerrado' : `Horario especial ${e.start_time?.slice(0, 5)}–${e.end_time?.slice(0, 5)}`}
                  {' · '}<span className="text-foreground/70">{e.location_id ? (activeLocations.find(l => l.id === e.location_id)?.name ?? term.location) : 'Todos'}</span>
                </span>
                <button onClick={() => clearExceptionRow(e)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0" title="Quitar"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Roster del slot grupal (CUPOS-04, D-04): contador "ocupados/cupo" + inscriptos.
          Dialog en desktop / Drawer vaul en mobile (mismo shell responsive que NuevoTurnoForm). */}
      {roster && (() => {
        // El título suma el NOMBRE DEL SERVICIO: desde que el roster filtra por servicio, la fecha y
        // la hora ya no alcanzan para saber qué clase se está mirando (dos clases distintas pueden
        // compartir horario).
        // Y suma la AGENDA cuando la misma clase se dicta en dos a la misma hora (code-review
        // CR-01): sin eso, los dos rosters tendrían el mismo título.
        const title = `${roster.serviceName ? `${roster.serviceName} · ` : ''}${roster.agendaName ? `${roster.agendaName} · ` : ''}${format(parseISO(roster.date), "EEE d 'de' MMM", { locale: es })} · ${roster.time}`
        // El contador dice LUGARES OCUPADOS, no filas de la lista: un hold vencido figura abajo con
        // su chip de estado pero no ocupa lugar (precedente CR-01).
        const counter = `${roster.occupied}/${roster.capacity}`
        const body = (
          <div className="space-y-3">
            {/* Contador de ocupación — dato exclusivo del admin (el público nunca lo ve, D-06). */}
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold tabular-nums">{counter}</span>
              <span className="text-xs text-muted-foreground">{roster.occupied === 1 ? 'lugar ocupado' : 'lugares ocupados'}</span>
            </div>
            {roster.enrollees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin inscriptos aún.</p>
            ) : (
              <ul className="space-y-2">
                {roster.enrollees.map(a => (
                  <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium truncate">{a.client_name}</p>
                      {a.client_phone && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="w-3 h-3 flex-shrink-0" /><span className="truncate">{a.client_phone}</span></p>
                      )}
                      {a.client_email && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="w-3 h-3 flex-shrink-0" /><span className="truncate">{a.client_email}</span></p>
                      )}
                      {!a.client_phone && !a.client_email && (
                        <p className="text-xs text-muted-foreground">Sin contacto</p>
                      )}
                    </div>
                    <span className={cn('flex-shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium', statusChip(a.status))}>
                      {statusLabel(a.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
        const close = () => setRosterSlot(null)
        return isDesktop ? (
          <Dialog open onOpenChange={open => { if (!open) close() }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 capitalize">{title}</DialogTitle>
              </DialogHeader>
              {body}
            </DialogContent>
          </Dialog>
        ) : (
          <Drawer open onOpenChange={open => { if (!open) close() }}>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle className="capitalize">{title}</DrawerTitle>
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-6">{body}</div>
            </DrawerContent>
          </Drawer>
        )
      })()}

      {/* Copiar el horario de un día a otros (multi-día) */}
      <Dialog open={copyDay !== null} onOpenChange={open => { if (!open) setCopyDay(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Copiar horario {copyDay !== null ? `del ${DAYS[copyDay]}` : ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Elegí a qué días copiar este horario. Reemplaza lo que tengan.</p>
            <div className="flex flex-wrap gap-2">
              {DAY_DISPLAY_ORDER.filter(d => d !== copyDay).map(d => {
                const on = copyTargets.has(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCopyTargets(s => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })}
                    className={cn(
                      'text-xs font-semibold py-1.5 px-3 rounded transition-colors',
                      on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {DAYS[d]}
                  </button>
                )
              })}
            </div>
            <Button size="sm" className="w-full sm:w-auto" disabled={copyTargets.size === 0} onClick={applyCopyDay}>
              Copiar a {copyTargets.size} día{copyTargets.size === 1 ? '' : 's'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nuevo turno — form compartido (modal desktop / drawer mobile), alta vía el endpoint autenticado.
          prefill.date = día clickeado en el resumen semanal (D-08 acotado: solo la fecha, no la hora). */}
      <NuevoTurnoForm
        open={nuevoTurnoOpen}
        onOpenChange={setNuevoTurnoOpen}
        prefill={{ date: prefillDate }}
        clients={clients}
        services={services}
        professionals={professionals}
        locations={initialLocations}
      />
    </div>
  )
}
