'use client'

import { useState, useRef, useEffect, useMemo, useId } from 'react'
import { format, parseISO } from 'date-fns'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { THEMES, THEME_PALETTES, THEME_DEFAULT_PAL, FONTS, normalizeTheme, normalizeFont, normalizePalette } from '@/lib/theme-config'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business, BusinessSecrets, Service, Professional, Location, Space, AgendaSpace, ProfessionalService } from '@/lib/types'
import { professionalsForService, isServiceCovered } from '@/lib/staff-services'
import { nowInAR } from '@/lib/appointment-time'
import { getPlanLimits, UPGRADE_URL } from '@/lib/plans'
import { PlanModal } from '@/components/dashboard/plan-modal'
import { CanchasManager } from '@/components/dashboard/canchas-manager'
import { useActiveTabs, ActiveTabs, ActiveTabsEmptyState } from '@/components/dashboard/active-tabs'
import { canchasFromData, nonCanchaServices } from '@/lib/canchas'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Minus, Trash2, Clock, DollarSign, Eye, EyeOff, ImageIcon, Check, Sun, Moon, Pencil, MapPin, TriangleAlert, CalendarClock, RefreshCw, Users } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { getVerticalKeyByType, VERTICALS, RUBRO_PLACEHOLDERS, resolveVertical, type VerticalKey } from '@/lib/verticals'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_IDS, sanitizeWidgetIds } from '@/lib/dashboard-widgets'
import { normalizeArWhatsApp } from '@/lib/whatsapp'

// Paletas de marca (swatch = primary en claro). El detalle de tokens vive en globals.css.
// Paletas + themes + tipografías viven en lib/theme-config (fuente única).

// Resultado del borrado de un servicio. Discriminado (patrón del repo) en vez de void + toast: el
// motivo del rechazo lo decide la DB (trigger de la migr. 065) y el copy lo decide el modal, que es
// el único que tiene el contexto de qué le estaba mostrando al dueño.
type DeleteServiceResult = { ok: true } | { ok: false; error: 'has_future_appointments' | 'has_active_abono' | 'unknown' }

// Filtro del listado de servicios (D-14). Los desactivados salen de la lista principal y viven en su
// propio tab: mezclados con el nombre tachado volvían pobre la salida que ofrece el modal de borrado.
// El tipo, las píldoras, el filtro y los contadores viven ahora en @/components/dashboard/active-tabs
// (D-13): el mismo molde lo consume también el manager de canchas, así que dejó de ser local.
const isServiceActive = (s: Service) => !!s.active

// ── Profesionales: form ampliado + labels por rubro ─────────────────────────
type ProForm = { name: string; last_name: string; specialty: string; license_number: string; phone: string; email: string }
const EMPTY_PRO: ProForm = { name: '', last_name: '', specialty: '', license_number: '', phone: '', email: '' }

// Etiquetas de Especialidad/Matrícula adaptadas al rubro (sin sobrecomplicar).
const PRO_LABELS: Record<string, { specialty: string; specialtyPh: string; license: string; licensePh: string }> = {
  salud:   { specialty: 'Especialidad',       specialtyPh: 'Cardiología, Pediatría…',  license: 'Matrícula profesional',      licensePh: 'MN 12345' },
  belleza: { specialty: 'Especialidad',       specialtyPh: 'Colorista, barbero…',      license: 'Matrícula',                  licensePh: 'Opcional' },
  general: { specialty: 'Especialidad / rol', specialtyPh: 'Rol o especialidad',        license: 'Matrícula / N° de registro', licensePh: 'Opcional' },
}

function proToPayload(f: ProForm) {
  // Normaliza: trim y opcionales vacíos → null.
  return {
    name: f.name.trim(),
    last_name: f.last_name.trim() || null,
    specialty: f.specialty.trim() || null,
    license_number: f.license_number.trim() || null,
    phone: f.phone.trim() || null,
    email: f.email.trim() || null,
  }
}

// Campos del profesional, reutilizados en alta (inline) y edición (dialog).
//
// Teléfono y Email se muestran SIEMPRE (UAT 14-09, punto 6). Antes el alta los escondía detrás de un
// enlace "+ Datos de contacto (opcional)": ese enlace es contenido en línea suelto dentro de un
// contenedor de bloque, así que arrastraba el hueco de su caja de línea y dejaba el botón de agregar
// descentrado y pegado al texto. El dueño arbitró la solución: mostrar los dos campos y sacar el
// enlace —"son solo dos y no cambia mucho"—, con lo cual el botón queda solo en su línea. Los dos
// campos ya viajaban al submit (`proToPayload` los normaliza): el toggle solo controlaba visibilidad,
// no el payload, así que hacerlos visibles no cambia lo que se guarda.
function ProFields({ value, onChange, labels }: {
  value: ProForm
  onChange: (v: ProForm) => void
  labels: { specialty: string; specialtyPh: string; license: string; licensePh: string }
}) {
  const set = (k: keyof ProForm, v: string) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nombre *</Label>
          <Input value={value.name} onChange={e => set('name', e.target.value)} placeholder="Nombre" />
        </div>
        <div className="space-y-1">
          <Label>Apellido</Label>
          <Input value={value.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Apellido" />
        </div>
        <div className="space-y-1">
          <Label>{labels.specialty}</Label>
          <Input value={value.specialty} onChange={e => set('specialty', e.target.value)} placeholder={labels.specialtyPh} />
        </div>
        <div className="space-y-1">
          <Label>{labels.license} <span className="text-muted-foreground text-xs">(opcional)</span></Label>
          <Input value={value.license_number} onChange={e => set('license_number', e.target.value)} placeholder={labels.licensePh} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Teléfono <span className="text-muted-foreground text-xs">(opcional)</span></Label>
          <Input value={value.phone} onChange={e => set('phone', e.target.value)} placeholder="+54 9 …" />
        </div>
        <div className="space-y-1">
          <Label>Email <span className="text-muted-foreground text-xs">(opcional)</span></Label>
          <Input type="email" value={value.email} onChange={e => set('email', e.target.value)} placeholder="profesional@email.com" />
        </div>
      </div>
    </div>
  )
}

// ── Modo de cupo del servicio (CUPO-01, migr. 062; ampliado a TRES modos por la migr. 068) ──
// 'individual' = un turno por vez; es el DEFAULT de la columna desde la 068 y el caso real del 100 %
// de los servicios. 'group_class' = todos arrancan a la MISMA hora y comparten el cupo (clase de
// yoga). 'simultaneous_resource' = N turnos en paralelo sobre el mismo recurso, contados por SOLAPE
// de intervalos (2 camillas). Desde la 068 los TRES leen el número de `services.capacity`:
// `time_blocks.capacity` dejó de decidirlo.
// Los labels son FIJOS para todos los rubros (D-10): NO se rutean por lib/use-terminology.
type CapacityMode = Service['capacity_mode']

// Piso de cupo por modo. ESPEJA el CHECK `services_capacity_matches_mode_chk` de la migr. 068
// (individual ⇒ capacity = 1; group_class / simultaneous_resource ⇒ capacity >= 2). La AUTORIDAD es
// la base — este helper es su espejo de UX, para que el editor NO pueda producir una combinación que
// el constraint rechace, nunca un reemplazo del constraint.
function minCapacityFor(mode: CapacityMode): number {
  return mode === 'individual' ? 1 : 2
}

// Techo del cupo declarable desde el panel (code-review de Phase 15, WR-03). NO es un invariante de
// dominio: `services.capacity` es `smallint` (máx 32767) y la base no tiene tope propio. Es el guard
// que evita que un número pegado o tipeado de más (40000) viaje al UPDATE y vuelva como
// `22003 smallint out of range`, que el panel colapsa en un `toast.error('Error al guardar')` sin
// decir qué pasó. 99 lugares ya está muy por encima de cualquier clase real y mantiene usable la
// grilla del roster.
const MAX_CAPACITY = 99

// El cupo N es un entero entre `min` (mismo CHECK que la DB) y MAX_CAPACITY. Un input vacío o basura
// cae al piso del modo.
function normalizeCapacity(n: number, min = 1): number {
  return Number.isFinite(n) ? Math.min(MAX_CAPACITY, Math.max(min, Math.floor(n))) : min
}

// Copy del rechazo del gate de cambio de modo (CUPO-08, migr. 068/070) en UN SOLO LUGAR: la leen los
// DOS caminos de escritura sobre `services` —el diálogo de edición y el guardado inline de la tarjeta
// (D-08)—. Escrita dos veces se renombra a medias, que es la misma trampa que D-03 evita con los
// labels de los modos. La copy es PROPIA y fija: NUNCA se interpola `error.message`, el código de la
// base ni el nombre del servicio (T-14-25 / T-13-09).
// ⚠ LA COPY TIENE QUE DECIR LA VERDAD SOBRE LA SALIDA (WR-02 del code review de la Phase 16).
// La versión anterior decía "Cancelalos o esperá a que pasen" y ofrecía una salida que para dos
// de los tres motivos de rechazo NO EXISTE en la interfaz:
//   · desde la migr. 070 (GATE-02) un turno FUTURO marcado `completed` bloquea, y RowActions
//     (appointments-client.tsx) no le da al dueño ni cancelar, ni borrar, ni volver atrás sobre
//     esa fila — la única salida real es esperar. Registrado como todo del workstream para
//     darle la acción que falta;
//   · desde la 070 (WR-05) un ABONO ACTIVO también bloquea, y ahí la salida es dar de baja la
//     serie, no cancelar turnos sueltos.
const GATE_MODE_CHANGE_MESSAGE = 'No se puede cambiar cómo se ocupa el cupo: quedan turnos por delante o un abono activo. Cancelá los turnos y dá de baja el abono. Ojo: un turno marcado como completado no se puede cancelar desde el panel — ahí hay que esperar a que pase su horario.'

// ── Los tres modos de cupo, en UN solo lugar (CUPO-09 · D-01/D-03/D-04) ─────────────────────────
// Por qué existe: es la misma lección que la Phase 15 aplicó en la base —el número del cupo vive en una
// sola columna— aplicada ahora a la pantalla. Hasta acá el label estaba duplicado de hecho (el array de
// opciones del radiogroup y la línea de copy que iba debajo), y D-03 prohíbe renombrar los labels
// justamente porque el mismo texto lo arrastran la copy del rechazo del gate, el aviso de espacio
// compartido y los comentarios del código: un label que vive en dos lados se renombra a medias.
//
// El orden es el de la pantalla: 'individual' va PRIMERO porque es el DEFAULT de la base desde la 068 y
// el caso real del 100 % de los servicios de producción.
//
// 'individual' no lleva 'warning' (D-01): no tiene contra qué equivocarse. Sí lleva 'example', porque lo
// que sostiene la simetría del bloque explicativo es que los tres tengan la misma forma.
//
// Los ejemplos son FIJOS para todos los rubros (D-04): yoga y camillas se entienden desde cualquier
// vertical, y rutearlos por lib/verticals.ts obligaría a inventar el caso de canchas, donde el cupo
// compartido casi no aplica.
type CapacityModeHelp = {
  key: CapacityMode
  label: string
  // El EJE de conteo: qué cuenta este modo. Es la definición, la capa que hoy falta en pantalla.
  axis: string
  // Caso concreto, SIN el prefijo "Ej:" — lo pone el markup, que necesita resaltarlo aparte.
  example: string
  // Qué sale mal si se elige el OTRO modo de cupo compartido. Es la capa que convierte dos definiciones
  // correctas en una decisión: sin ella el dueño entiende los dos modos y sigue sin saber cuál le sirve.
  warning?: string
}

const CAPACITY_MODE_HELP: readonly CapacityModeHelp[] = [
  {
    key: 'individual',
    label: 'Individual',
    axis: 'Un turno por vez.',
    example: 'un corte de pelo — una persona por horario.',
  },
  {
    key: 'group_class',
    label: 'Clase grupal',
    axis: 'Todos arrancan a la misma hora y comparten los lugares.',
    example: 'yoga de 9:00 — 6 personas, todas a las 9:00.',
    warning: 'Si elegís Recurso simultáneo por error, alguien puede reservar 9:30 y sumarse a mitad de clase.',
  },
  {
    key: 'simultaneous_resource',
    label: 'Recurso simultáneo',
    axis: 'Entran escalonados y se cuentan los turnos que se pisan.',
    example: '3 camillas — una a las 9:00 y otra a las 9:30.',
    warning: 'Si elegís Clase grupal por error, se te llena la agenda antes de tiempo: solo entran a la hora en punto.',
  },
]

// ── Espejo en JS del corte "todavía ocupa la agenda" de los gates de servicio (migr. 070) ──────
// Los usa el pre-check del modal de borrado, y su única razón de existir es que ese corte NO se puede
// escribir como filtro de PostgREST: el trigger compara, POR FILA,
// `date + time + COALESCE(duration_minutes, 30)` contra el ahora AR. Acá se replica esa aritmética en
// segundos desde la medianoche, sobre los turnos de HOY (para los demás días decide la fecha sola).
//
// ⚠ El corte es el FIN del turno, no su inicio: un turno EN CURSO todavía ocupa la agenda y el
// trigger lo cuenta. Es DISTINTO del corte de `isPastAppointment` (que mira el inicio porque contesta
// otra pregunta: qué se le muestra al dueño como pasado). El porqué de la asimetría está escrito en
// `lib/appointment-time.ts`.
function horaEnSegundos(raw: string): number {
  const [h = '0', m = '0', s = '0'] = raw.split(':')
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0)
}
// `duration_minutes` es NULLABLE en la base: el 30 de fallback NO es un número inventado acá, es el
// mismo `COALESCE(duration_minutes, 30)` que usan el EXCLUDE gist 013 y el trigger sobre esa fila.
// `time` es NOT NULL; si igual llegara nulo se cuenta como vivo (fail-closed: bloquea de más).
function finEnSegundos(time: string | null, durationMinutes: number | null): number {
  if (!time) return Number.POSITIVE_INFINITY
  return horaEnSegundos(time) + (durationMinutes ?? 30) * 60
}

// Segmented control de modo + campo de cupo, reutilizado en alta (inline) y edición (dialog).
// Molde del control: el radiogroup de "Preselección del profesional" (tab Equipo) — misma píldora
// activa (bg-primary) y mismo contenedor bordeado. El campo N existe en los dos modos NO individuales:
// desde la migr. 068 `services.capacity` es la única fuente del número para los tres modos, así que
// esconderlo en la clase grupal dejaría al dueño sin dónde declarar su cupo.
// spacesBlockSharedCapacity: ¿alguna de las agendas que puede recibir turnos de este servicio tiene un
// ESPACIO físico mapeado (agenda_spaces)? Si sí, quedan inhabilitados LOS DOS modos de cupo compartido
// ("Clase grupal" y "Recurso simultáneo").
//
// Por qué (migr. 064, gap 3 del code-review 2; AMPLIADO por la migr. 069, CR-03): un espacio es una
// sala/cancha FÍSICA compartida entre agendas y la base impone UN turno por espacio a la vez
// (appointment_spaces_no_overlap, migr. 042), o sea capacidad 1. Un servicio de cupo ≥ 2 sobre ese
// mismo espacio es una contradicción semántica: el RPC lo rechaza de entrada con
// `simultaneous_space_conflict`. Antes de la 064 la combinación se podía guardar y fallaba sola y mal
// (el 2º turno moría con slot_taken mientras la página pública seguía ofreciendo el horario).
// Gatearlo acá es lo que evita que el dueño llegue a ese estado.
//
// ⚠ POR QUÉ AHORA SON LOS DOS MODOS: el guard nombraba sólo al simultáneo porque hasta la migr. 068
// una CLASE GRUPAL de cupo ≥ 2 no se podía declarar (el número salía de `time_blocks.capacity`). Desde
// la 068 sí, y el editor dejaba guardar exactamente la configuración imposible: la 1ª inscripción
// entraba y la 2ª moría con 23P01 → `slot_taken`. Lo que hace imposible la combinación es el CUPO, no
// el modo. `individual` (cupo 1) sigue siendo elegible SIEMPRE: es el caso de canchas/F11.
//
// Quiénes son "las agendas del servicio": las mismas que calcula el bloque de cobertura de arriba —
// professionalsForService (fuente ÚNICA de la regla del comodín, @/lib/staff-services). PROHIBIDO
// reimplementar la regla acá. Para un servicio NUEVO (todavía sin id) valen los comodines: un
// servicio recién creado no tiene filas en la puente, así que lo puede hacer cualquier pro sin mapeo.
function spacesBlockSharedCapacity(
  serviceId: string | null,
  activeProfessionals: Professional[],
  professionalServices: ProfessionalService[],
  agendaSpaces: AgendaSpace[],
): boolean {
  if (agendaSpaces.length === 0) return false
  const mapped = new Set(agendaSpaces.map(a => a.professional_id))
  // serviceId null (alta) → un id imposible: professionalsForService devuelve solo los comodines.
  const agendas = professionalsForService(serviceId ?? '__nuevo__', activeProfessionals, professionalServices)
  return agendas.some(p => mapped.has(p.id))
}

// ── CapacityStepper — el control compartido del número de lugares ────────────────────────────────
// Un dato, un control. `services.capacity` se edita desde DOS superficies —la tarjeta de servicio y el
// modal de edición— y hasta acá cada una tenía su propio control: la tarjeta un selector con targets
// cómodos para el dedo, el modal un campo de texto pelado que en mobile sólo se podía tipear. Es la
// misma deuda que esta fase viene pagando en la base y en la pantalla, un nivel más abajo.
//
// QUÉ COMPARTE Y QUÉ NO. Comparte el DIBUJO y el COMPORTAMIENTO DE TIPEO. NO comparte el guardado, y
// eso es deliberado: la tarjeta persiste directo en la base con su propio botón, y el modal propaga al
// estado del formulario para que el botón del diálogo lo guarde después. Fusionar las dos semánticas
// acá adentro sería el error. Por eso esta pieza recibe el valor y el texto, y devuelve INTENCIONES.
//
// Y por eso TAMPOCO clampea: propone el vecino (el valor ±1) y cada caller aplica su propio piso, que
// no es el mismo en las dos superficies (sale del modo del servicio). La AUTORIDAD final nunca es este
// componente ni sus callers: es el CHECK de la migr. 068.
//
// `text` es lo que se ve. `value` es sólo para dibujar el estado de los botones y calcular el vecino.
function CapacityStepper({ value, text, min, max, groupLabel, onStep, onTextChange, onInputBlur, onInputFocus, disabled, dirty, invalid }: {
  value: number
  text: string
  min: number
  max: number
  groupLabel: string
  onStep: (next: number) => void
  onTextChange: (raw: string) => void
  onInputBlur: () => void
  onInputFocus?: () => void
  disabled?: boolean
  dirty?: boolean
  invalid?: boolean
}) {
  const atMin = value <= min
  const atMax = value >= max

  // Hover/foco de los dos botones del stepper. Va `enabled:` en vez del `disabled:pointer-events-none`
  // del molde de agenda-client porque acá el botón deshabilitado TIENE que poder mostrar su `title`:
  // con los eventos de puntero apagados el navegador no hace hit-test y el tooltip nunca aparece, o sea
  // el callejón sin explicación que el UI-SPEC pide evitar. El resultado visual es el mismo: un botón
  // deshabilitado no reacciona al hover.
  const stepBtn = 'flex items-center justify-center text-muted-foreground transition-colors enabled:hover:bg-secondary enabled:hover:text-foreground focus-visible:outline-none focus-visible:bg-secondary focus-visible:text-foreground disabled:opacity-30'

  return (
    // El anillo de foco va en el CONTENEDOR y no en cada hijo: el `overflow-hidden` que redondea las
    // puntas del stepper recorta cualquier box-shadow de los hijos, así que un ring por botón sería
    // invisible. Adentro, cada control marca cuál está enfocado con el fondo, que no se recorta.
    <span
      role="group"
      aria-label={groupLabel}
      aria-invalid={invalid ? 'true' : undefined}
      className={cn(
        'inline-flex items-center overflow-hidden rounded-md border bg-background transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-background',
        invalid ? 'border-destructive' : dirty ? 'border-primary/50' : 'border-border',
      )}
    >
      <button
        type="button"
        aria-label="Un lugar menos"
        // El title SÓLO en el piso: en un botón usable diría una regla que todavía no aplica.
        title={atMin ? 'El mínimo de este modo es 2 lugares' : undefined}
        disabled={disabled || atMin}
        onClick={() => onStep(value - 1)}
        className={cn('h-11 w-11 sm:h-8 sm:w-8', stepBtn)}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        // inputMode numérico = teclado de números en mobile. tabular-nums para que pasar de 9 a 10 no
        // mueva el sufijo. Los spinners nativos se ocultan: el stepper ya es el control.
        inputMode="numeric"
        aria-label="Cantidad de lugares"
        value={text}
        disabled={disabled}
        // El caller avisa PRIMERO y la selección va después: el caller tiene que poder marcar que el
        // foco entró antes de que corra cualquier efecto suyo que dependa de eso.
        onFocus={e => { onInputFocus?.(); e.target.select() }}
        // Mientras se tipea NO se clampea ni se corrige nada: el string crudo se lo lleva el caller.
        onChange={e => onTextChange(e.target.value)}
        // Al SALIR normaliza el caller, que es el único que conoce su piso y su camino de guardado.
        onBlur={onInputBlur}
        // min/max/step son PISTA del navegador, no la validación.
        min={min}
        max={max}
        step={1}
        className="h-11 w-14 sm:h-8 sm:w-10 border-x border-border bg-transparent text-center text-sm tabular-nums outline-none focus-visible:bg-secondary/50 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="Un lugar más"
        title={atMax ? 'El máximo es 99 lugares' : undefined}
        disabled={disabled || atMax}
        onClick={() => onStep(value + 1)}
        className={cn('h-11 w-11 sm:h-8 sm:w-8', stepBtn)}
      >
        <Plus className="h-3 w-3" />
      </button>
    </span>
  )
}

function CapacityModeFields({ value, capacity, onChange, disabled, sharedCapacityBlocked = false }: {
  value: CapacityMode
  capacity: number
  onChange: (patch: { capacity_mode?: CapacityMode; capacity?: number }) => void
  disabled?: boolean
  // (064, gap 3 / 069, CR-03) El servicio se atiende en una agenda con espacio físico mapeado ⇒ NINGÚN
  // modo de cupo compartido se puede elegir (el espacio es 1-a-la-vez; ver spacesBlockSharedCapacity).
  sharedCapacityBlocked?: boolean
}) {
  const isIndividual = value === 'individual'

  // ── Los ids del explicador son POR INSTANCIA (code-review WR-03) ──────────────────────────────
  // Este componente se monta DOS VECES a la vez: en la tarjeta "Agregar servicio" y adentro del
  // diálogo de edición (Radix portalea el diálogo pero NO desmonta la página de atrás). Con ids
  // literales había dos `#cap-mode-help-group_class` en el documento y el `aria-describedby` del
  // diálogo resolvía al PRIMERO, o sea al bloque del formulario de alta: quien usa lector de
  // pantalla escuchaba el estado del OTRO formulario. El `sr-only` seguía presente —por eso un gate
  // de presencia no podía verlo— pero colgaba de la instancia equivocada.
  const uid = useId()
  const helpId = (key: string) => `${uid}-cap-mode-help-${key}`

  // El piso del cupo lo decide el MODO, siempre. Antes el campo llevaba un 2 escrito a mano que daba el
  // mismo número por casualidad —en esta rama el modo nunca es individual—, pero eran dos fuentes para
  // la misma regla, y de esas se corrige una sola cuando la regla cambia.
  const capacityMin = minCapacityFor(value)

  // ── El campo "Cuántos lugares" se deja VACIAR y se corrige al SALIR (D-06) ────────────────────────
  // Mientras el foco está adentro la fuente de verdad del control es este texto crudo, no el número del
  // formulario. Antes el onChange normalizaba en cada tecla: borrar el 2 daba parseInt('') = NaN, el
  // helper lo llevaba al piso y REESCRIBÍA el campo bajo el cursor — el defecto que levantó la UAT.
  // El molde es el NumberField de web/_sections/section-forms.tsx (mismo proyecto, misma lógica):
  // validación inline al salir del campo, no al tipear.
  const [capacityText, setCapacityText] = useState(String(capacity))
  // ¿El cursor está adentro del campo? El toggle de modo sube el cupo a su piso, así que el texto tiene
  // que seguir al prop cuando el cambio viene de OTRO control; pero si se resincroniza mientras se
  // tipea, escribir "007" se reescribe a "7" abajo del cursor. Este ref es el que separa los dos casos.
  const capacityFocusedRef = useRef(false)
  useEffect(() => {
    if (capacityFocusedRef.current) return
    setCapacityText(String(capacity))
  }, [capacity])

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Cómo se ocupa el cupo</Label>
      {/* Grid determinista (D-13). Con el inline-flex + wrap de antes las tres opciones no entraban a
          375px y el envoltorio dejaba la caja dentada, con la tercera pill colgando sola. En grid son
          tres filas de 44px en mobile —lectura vertical que RIMA con los tres grupos del explicador de
          abajo— y tres columnas iguales en desktop, donde "Recurso simultáneo" entra en una línea. */}
      <div role="radiogroup" aria-label="Cómo se ocupa el cupo" className="grid grid-cols-1 gap-1 rounded-md border border-border p-1 sm:grid-cols-3">
        {CAPACITY_MODE_HELP.map(o => {
          // El modo bloqueado sigue siendo visible (no se esconde la opción: el dueño tiene que
          // entender POR QUÉ no está disponible), pero no se puede activar. Si el servicio YA estaba
          // en ese modo, el botón del otro modo queda habilitado para poder salir.
          // (069, CR-03) Se bloquean los DOS modos de cupo compartido, no sólo el simultáneo:
          // `individual` nunca se bloquea (es la salida legítima y el caso de canchas/F11).
          const blocked = sharedCapacityBlocked && o.key !== 'individual' && value !== o.key
          return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={value === o.key}
            // El destino de este id es el bloque explicativo que va DEBAJO del radiogroup: el lector de
            // pantalla lee el eje + el ejemplo + la advertencia del modo al enfocar la opción, sin que
            // haga falta activarla (que es justamente lo que D-02 evita: activar escribe).
            aria-describedby={helpId(o.key)}
            disabled={disabled || blocked}
            // El patch lleva SIEMPRE el cupo junto con el modo (D-06): pasar de individual a grupal
            // o simultáneo con el cupo en 1 rebota contra services_capacity_matches_mode_chk, así que
            // el cambio de modo sube el cupo a su piso legal en el mismo estado.
            onClick={() => onChange({ capacity_mode: o.key, capacity: o.key === 'individual' ? 1 : normalizeCapacity(capacity, 2) })}
            className={cn(
              'w-full min-h-11 sm:min-h-0 sm:h-9 px-3 rounded text-sm font-medium transition-colors disabled:opacity-60',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              value === o.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              blocked && 'cursor-not-allowed',
            )}
          >
            {o.label}
          </button>
          )
        })}
      </div>
      {sharedCapacityBlocked && (
        <p role="status" className="flex items-start gap-2 text-xs font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>
            “Clase grupal” y “Recurso simultáneo” no están disponibles: este servicio se atiende en una
            agenda con un espacio asignado, y un espacio se usa de a un turno por vez. Si querés varios
            lugares en paralelo, sacale el espacio a esa agenda en <Link href="/equipo" className="underline underline-offset-2">Equipo</Link>.
          </span>
        </p>
      )}
      {/* Explicador de los tres modos (CUPO-09 · D-01 · D-02 revisada en la UAT). Reemplaza a la línea
          que había acá, que nombraba los modos sin explicarlos y metía los dos de cupo compartido en la
          misma bolsa.

          El modo SELECCIONADO trae las TRES capas de D-01: el eje de conteo (qué cuenta el modo), un
          ejemplo concreto y qué sale mal al elegir el otro. La tercera es la que justifica el requisito:
          sin ella el dueño lee dos definiciones correctas y sigue sin saber cuál le conviene.

          Los otros DOS quedan en UNA línea con sólo su eje (G-01). La decisión original —los tres
          completos y siempre en pantalla— se tomó sin la pantalla delante: implementada ocupa ~10 líneas
          dentro del modal a 375px y el dueño la rechazó por ruido en la UAT. La versión corta no es una
          redacción nueva: ES el eje que ya vive en CAPACITY_MODE_HELP, fuente única de los cuatro textos.
          El label colapsado pierde su tamaño de 14px a propósito: esa línea es el ancla de "acá hay una
          decisión tomada", y el modo que no está elegido no la tiene.

          ⚠ Lo que NO cambia, y es la razón de ser de todo esto: el bloque NO es interactivo. Sin
          manejador de click, sin rol de botón y sin índice de tabulación (D-02). El atajo obvio —ocultar
          del todo los no seleccionados, o abrirlos al tocarlos— es el que hay que NO tomar: elegir bien
          exige comparar, y acá cada toque de un toggle ESCRIBE en el formulario (el handler de arriba
          manda capacity_mode + capacity juntos). Leer no puede tener efecto de escritura. La línea
          colapsada conserva la comparación gratis.

          Cambiar de modo ahora cambia el ALTO del bloque. El UI-SPEC §2.2 prometía "cero reflow" porque
          el activo sólo cambiaba de color; eso queda revisado por diseño, no olvidado. Está cubierto: el
          diálogo scrollea por dentro con el Guardar anclado abajo (D-05, aprobado en la UAT), así que un
          cambio de alto del cuerpo no puede volver a dejar el botón fuera del viewport. El cambio de
          presentación es instantáneo: el alto NO se anima (sólo transform y opacity, regla del proyecto).

          Los pasos de 2px (space-y-0.5, dentro del grupo) y 10px (space-y-2.5, entre grupos) son
          deliberados y están declarados en el UI-SPEC: junto con el riel izquierdo son los que hacen que
          los tres se lean como grupos paralelos, y colapsar dos de tres no puede llevárselos puestos. */}
      <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-2.5">
        {CAPACITY_MODE_HELP.map(h => {
          const activo = value === h.key
          return (
            <div
              key={h.key}
              id={helpId(h.key)}
              className={cn('border-l-2 pl-3 space-y-0.5', activo ? 'border-l-primary' : 'border-l-border')}
            >
              {activo ? (
                <>
                  <p className="text-sm font-medium text-foreground">{h.label}</p>
                  <p className="text-xs text-muted-foreground">{h.axis}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">Ej:</span> {h.example}
                  </p>
                  {/* Mismo molde exacto que el aviso de espacio compartido de arriba (icono, tamaño y
                      token): es la única línea con color e icono del grupo, así que cae siempre en la
                      misma posición relativa y el ojo la usa como cierre. El modo individual no la
                      tiene (D-01), y por eso su versión colapsada es casi igual de corta que la
                      expandida — no hace falta compensarlo con nada. */}
                  {h.warning && (
                    <p className="flex items-start gap-1.5 text-xs text-warning">
                      <TriangleAlert aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                      <span>{h.warning}</span>
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{h.label}:</span> {h.axis}
                  </p>
                  {/* Colapsar es VISUAL, no informativo. Cada opción del radiogroup apunta su descripción
                      accesible a ESTE grupo, y ése es justamente el canal que permite
                      comparar los tres modos sin activarlos. Si el grupo colapsado perdiera el ejemplo y
                      la advertencia, quien usa lector de pantalla tendría que ACTIVAR cada modo para
                      conocerlos — y activar escribe en el formulario: el problema exacto que D-02 existe
                      para evitar, entrando por la puerta de la accesibilidad.

                      El texto sale de la MISMA fuente, sin una segunda redacción. El prefijo del ejemplo
                      viaja acá adentro porque el resaltado visual del prefijo no existe en este canal. Es
                      contenido puro: sin manejadores, sin rol y sin índice de tabulación. Y como es hijo
                      del div que lleva el id del grupo, la descripción accesible lo incluye sin cablear nada. */}
                  <span className="sr-only">Ej: {h.example}{h.warning ? ` ${h.warning}` : ''}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
      {!isIndividual && (
        <div className="space-y-1 pt-1">
          <Label className="text-xs text-muted-foreground">Cuántos lugares</Label>
          {/* El MISMO control que la tarjeta de servicio: un dato, un control. Antes acá había un campo
              de texto pelado con los spinners nativos apagados, o sea un campo que en mobile sólo se
              podía tipear. Lo que NO se comparte es el guardado: acá el número se propaga al estado del
              formulario y lo persiste el botón del diálogo, así que el clamp es de este lado. */}
          <CapacityStepper
            value={capacity}
            // Lo que se ve es el texto crudo local, NUNCA el prop. Ésa es la mitad de D-06.
            text={capacityText}
            // El piso lo pone el modo, no un número escrito a mano: una sola fuente para el piso.
            min={capacityMin}
            max={MAX_CAPACITY}
            groupLabel="Cuántos lugares"
            disabled={disabled}
            // El vecino que propone el control se normaliza acá y se escribe en LOS DOS lados: el texto
            // local es lo que se ve, y el formulario es lo que se guarda.
            onStep={n => {
              const c = normalizeCapacity(n, capacityMin)
              setCapacityText(String(c))
              onChange({ capacity: c })
            }}
            // Mientras se tipea NO se clampea: el string crudo va al estado local y sólo se propaga al
            // formulario si parsea, y TAL CUAL. Propagar el valor clampeado sería volver al bug: el padre
            // cambiaría el prop y el campo se resincronizaría encima de lo que se está escribiendo.
            onTextChange={raw => {
              setCapacityText(raw)
              if (raw.trim() === '') return
              const n = Number(raw)
              if (Number.isFinite(n)) onChange({ capacity: n })
            }}
            // Marca que el cursor entró ANTES de que corra ningún efecto. Sin esta línea el efecto de
            // arriba resincroniza el texto mientras se tipea y vuelve el defecto exacto que levantó la
            // UAT, sin que el typecheck ni el build digan una palabra.
            onInputFocus={() => { capacityFocusedRef.current = true }}
            // Al SALIR se normaliza: vacío o basura vuelven al valor vigente, y el resultado se clampea al
            // piso del modo y al techo. Este es el único clamp del camino de edición; la última línea sigue
            // siendo el payload de saveEditService/addService, y la AUTORIDAD el CHECK de la migr. 068.
            onInputBlur={() => {
              capacityFocusedRef.current = false
              const n = Number(capacityText)
              const base = capacityText.trim() !== '' && Number.isFinite(n) ? n : capacity
              const c = normalizeCapacity(base, minCapacityFor(value))
              setCapacityText(String(c))
              onChange({ capacity: c })
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── CapacityInlineControl — el modo de cupo se VE en la tarjeta y el número se EDITA ahí mismo ──
// (POLISH-08 · D-07 + D-08). Es UN solo elemento, no dos: `Clase grupal · [−] 6 [+] lugares`. La misma
// lección que la Phase 15 aplicó en la base —el número del cupo vive en un solo lugar— aplicada a la
// pantalla: si el badge mostrara el cupo y el modal fuera el único que lo edita, el dueño tendría que
// abrir un diálogo entero para subir un lugar, que es exactamente el pedido que salió de la UAT.
//
// POR QUÉ EL LABEL DE MODO ES TEXTO Y NO UN CONTROL (D-09). Desde la tarjeta se cambia el NÚMERO,
// nunca el MODO. Cambiar de modo es la operación peligrosa: es la que el gate de la migr. 070 bloquea
// cuando hay turnos futuros o un abono activo, y la que necesita las tres explicaciones del explicador
// (eje de conteo + ejemplo + qué sale mal con el otro modo). Eso no entra en una línea de 12px, así que
// vive en el modal. Si alguien viene a ponerle un onClick a este span, la respuesta es no.
//
// Este componente NO habla con Supabase: recibe `onSave` y devuelve el control del resultado al padre,
// que es el que tiene el negocio, el cliente y el estado por tarjeta. Acá sólo vive la interacción.
function CapacityInlineControl({ service, saving, onSave }: {
  service: Service
  // Lo calcula el PADRE comparando el id de esta tarjeta con el que tiene un guardado en vuelo:
  // guardar un servicio no puede congelar los steppers de los demás servicios de la lista.
  saving: boolean
  // `true` = la base aceptó; `false` = rechazó y hay que volver al valor guardado.
  onSave: (capacity: number) => Promise<boolean>
}) {
  // El fallback cubre filas viejas que quedaron en memoria sin el modo resuelto — mismo criterio que
  // openEditService (el DEFAULT de la migr. 068 ya las cubre en la DB).
  const mode: CapacityMode = service.capacity_mode ?? 'individual'
  const min = minCapacityFor(mode)
  // El valor GUARDADO sale del prop, normalizado con el piso del modo: es la única fuente de verdad de
  // "qué hay en la base", y de él sale `dirty`.
  const saved = normalizeCapacity(Number(service.capacity), min)

  const [value, setValue] = useState(saved)
  // Texto crudo del input: misma disciplina que CapacityModeFields (D-06). Mientras el foco está adentro
  // el texto es la verdad, se acepta el vacío y NO se clampea en cada tecla; se normaliza al salir.
  const [text, setText] = useState(String(saved))
  // Marca transitoria del rechazo. Vive ~4s (el mismo lifetime que el toast) y se apaga sola.
  const [rejected, setRejected] = useState(false)
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Resincronización desde el padre. NO hace falta el ref de foco que sí necesita CapacityModeFields:
  // allá el prop cambiaba en cada tecla; acá `saved` sólo cambia cuando un guardado se confirmó. Gracias
  // a esto el componente no tiene que saber que guardó: la fila se limpia sola y el botón desaparece.
  useEffect(() => {
    setValue(saved)
    setText(String(saved))
  }, [saved])

  // El timer del rechazo no puede sobrevivir al unmount (borrar el servicio desmonta la tarjeta).
  useEffect(() => () => { if (rejectTimer.current) clearTimeout(rejectTimer.current) }, [])

  const dirty = value !== saved

  function apply(n: number) {
    const c = normalizeCapacity(n, min)
    setValue(c)
    setText(String(c))
  }

  // Revertir = volver al número guardado. No hay botón "Cancelar": si el dueño vuelve el número a donde
  // estaba, la fila se limpia sola. Escape es el atajo de teclado del mismo gesto.
  function revert() {
    setValue(saved)
    setText(String(saved))
  }

  async function handleSave() {
    const ok = await onSave(value)
    if (ok) return
    // Rechazo: el número vuelve al valor guardado ANTES de marcar el error, así no queda ningún número
    // en pantalla que la base no tenga (el estado zombi "sucio pero fallado"). Como queda limpio, el
    // botón desaparece solo; el mensaje viaja por toast (cero desplazamiento de layout) y acá sólo
    // queda la marca en el elemento que falló.
    revert()
    setRejected(true)
    if (rejectTimer.current) clearTimeout(rejectTimer.current)
    rejectTimer.current = setTimeout(() => setRejected(false), 4000)
  }

  return (
    // UNA fila propia de la tarjeta, HERMANA de la línea de datos y no hija suya. Hasta acá el bloque
    // vivía adentro del contenedor de texto, a 4px del renglón, y eso solo alcanzaba para romperlo:
    // tocar la duración BAJABA el cupo y tocar el label lo SUBÍA, porque los navegadores móviles
    // corrigen el punto de toque hacia el elemento interactivo más cercano cuando el dedo no aterrizó
    // en ninguno (G-04, reproducido y confirmado en la ronda 3 de UAT). La dirección dependía de la
    // posición horizontal del dedo, que es justamente lo que ningún manejador suelto podría saber.
    //
    // LA INVARIANTE DE LOS 32px. Entre cualquier texto inerte de esta tarjeta y el primer píxel de un
    // botón hay 32px: 24px de padding vertical propio de esta fila + los 8px que la tarjeta ya pone
    // entre hermanos. De dónde sale el 32: el piso táctil de 44px que exige el proyecto implica un
    // radio de contacto de 22px, y un dedo centrado en un renglón de 18px llega 31px más abajo; 32 es
    // el primer paso de la escala que lo supera. Es una decisión DERIVADA, no una medición — el único
    // instrumento capaz de confirmarla es la UAT. Va como padding y no como margen porque el padding
    // SUMA al ritmo de la tarjeta de forma determinista, mientras que un margen pelearía con él.
    //
    // COROLARIO, que es lo que evita la recaída: si alguien vuelve a meter este bloque adentro de la
    // línea de datos "para ahorrar una línea", el defecto vuelve entero.
    //
    // La composición interna NO cambia (G-02b): 146 del stepper + 8 de hueco + 96 del botón = 250px,
    // que entran en los 271px que mide la tarjeta a 375px. El tamaño y el color del texto se declaran
    // acá porque el bloque ya no los hereda de la línea de datos: sin ellos el sufijo saltaría de 12px
    // a 14px y de gris a texto pleno. El manejador de teclado vive en este contenedor para que Escape
    // restaure con el foco en cualquier parte del bloque, incluido el botón Guardar.
    <div
      className="flex items-center gap-x-2 gap-y-1 py-6 text-xs text-muted-foreground"
      onKeyDown={e => { if (e.key === 'Escape') revert() }}
    >
      {/* La tarjeta consume el control compartido y sigue siendo dueña de su guardado: el clamp de
          abajo es SUYO, con el piso de su propio modo. */}
      <CapacityStepper
        value={value}
        text={text}
        min={min}
        max={MAX_CAPACITY}
        groupLabel={`Lugares de ${service.name}`}
        disabled={saving}
        dirty={dirty}
        invalid={rejected}
        onStep={apply}
        onTextChange={setText}
        // Al SALIR se normaliza: vacío o basura vuelven al valor vigente, y el resultado se clampea al
        // piso del modo y al techo. Este NO es el último clamp: saveCapacityInline vuelve a normalizar
        // antes de mandar, y la AUTORIDAD sigue siendo el CHECK de la migr. 068.
        onInputBlur={() => {
          const n = Number(text)
          apply(text.trim() !== '' && Number.isFinite(n) ? n : value)
        }}
      />
      {/* Invariable: el piso de los dos modos de cupo compartido es 2, así que nunca es "lugar".
          Con un guardado pendiente la unidad le cede sus 40px al botón en mobile, que es el elemento
          que TIENE que verse. No se pierde para nadie: viaja por la etiqueta accesible del input y
          por la del grupo, en reposo —el 99 % del tiempo— está siempre visible, y a los ≥640px vuelve
          porque ahí el stepper baja a 104px y entran los dos. */}
      <span className={cn(dirty && 'hidden sm:inline')}>lugares</span>
      {/* Sólo cuando hay algo pendiente. Entra con fade + 4px de deslizamiento; SALE sin animar (unmount
          directo): animar la salida exige mantenerlo montado con un estado más y no paga. Es decisión
          escrita, no olvido. El ancho mínimo del botón evita que la fila se reacomode al pasar a "Guardando…". */}
      {dirty && (
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          aria-busy={saving ? 'true' : undefined}
          className="min-h-11 sm:min-h-0 min-w-24 animate-in fade-in-0 slide-in-from-left-1 duration-150 motion-reduce:animate-none"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      )}
    </div>
  )
}

// ── Props ───────────────────────────────────────────────────────────────────
type SettingsView = 'config' | 'negocio' | 'servicios' | 'equipo' | 'consultorios'

// Secretos vacíos: default para las vistas de sidebar (negocio/equipo/servicios/consultorios) que
// reusan SettingsClient pero NO renderizan los forms de secretos (view !== 'config'). Solo la
// página /settings (view='config') fetchea y pasa los valores reales (D-05).
const EMPTY_SECRETS: BusinessSecrets = {
  mp_access_token: null,
  mp_refresh_token: null,
  mp_token_expires_at: null,
  resend_api_key: null,
  resend_from: null,
  recaptcha_secret_key: null,
  google_refresh_token: null,
}

interface Props {
  business: Business
  // Valores crudos de los secretos del dueño (leídos server-side vía getBusinessSecrets). Este
  // es el form de edición del PROPIO dueño → D-05 permite mostrarle SU valor. Nunca se exponen
  // a anon ni a otro componente que no sea este form. Opcional: las vistas de sidebar que no
  // muestran los forms de secretos no lo pasan (default EMPTY_SECRETS).
  secrets?: BusinessSecrets
  initialServices: Service[]
  initialProfessionals: Professional[]
  initialLocations: Location[]
  // Espacios físicos (canchas) + mapeo agenda→espacios (motor-reservas / espacio compartido).
  // Cargados por tenant en page.tsx / equipo (.eq('business_id', business.id) + RLS). Opcionales:
  // las vistas de sidebar que no muestran la tab de Equipo (servicios/negocio/consultorios) no los pasan.
  initialSpaces?: Space[]
  initialAgendaSpaces?: AgendaSpace[]
  // Mapeo profesional→servicio (migr. 057, STAFF v0.25). Cargado por tenant en equipo/servicios page.
  // Opcional: solo lo pasan las vistas /equipo (editor) y /servicios (cobertura); default [].
  initialProfessionalServices?: ProfessionalService[]
  mpConnectEnabled: boolean
  // Google Calendar (mismo estado/conexión que el control de la Agenda): presencia del refresh_token
  // (booleano, nunca el token) + si la integración está configurada. Se leen server-side en negocio/page.
  googleEnabled?: boolean
  googleConnected?: boolean
  // Email del dueño (sesión) para autocargar el campo de notificaciones cuando aún no hay uno seteado.
  ownerEmail?: string | null
  // Qué mostrar: 'config' = pestañas de Configuración; el resto = una sección suelta (sidebar).
  view?: SettingsView
}

// Isotipo de MercadoPago: PNG oficial recortado al handshake (public/mercadopago-isotipo.png).
// Se usa el raster del logo oficial del usuario porque el SVG rinde mal el aro navy en navegador
// (fill-rule). Decorativo (alt vacío; el nombre accesible lo da el texto de la card).
function MpLogo({ className }: { className?: string }) {
  return <Image src="/mercadopago-isotipo.png" alt="" width={35} height={26} className={className} />
}

// Ícono de Google Calendar: PNG oficial del usuario, con el fondo cuadriculado limpiado a blanco
// y recortado al ícono (public/google-calendar.png). Va en chip blanco. Decorativo (alt vacío).
function GoogleCalendarLogo({ className }: { className?: string }) {
  return <Image src="/google-calendar.png" alt="" width={20} height={20} className={className} />
}

export function SettingsClient({ business, secrets = EMPTY_SECRETS, initialServices, initialProfessionals, initialLocations, initialSpaces = [], initialAgendaSpaces = [], initialProfessionalServices = [], mpConnectEnabled, googleEnabled = false, googleConnected = false, ownerEmail = null, view = 'config' }: Props) {
  const supabase = createClient()
  const router = useRouter()

  // Secciones que viven en el sidebar (una sola, sin pestañas). 'config' muestra las pestañas.
  // 'negocio' ahora es un HUB con sus propias pestañas (NAV-02, D-04): dejó de ser una sección
  // suelta de una sola tab. El resto (servicios/equipo/consultorios) siguen siendo secciones sueltas.
  const SECTION_TAB: Record<string, string> = { negocio: 'business', servicios: 'services', equipo: 'professionals', consultorios: 'locations' }
  const isSection = view !== 'config'
  const isNegocio = view === 'negocio'
  const [configTab, setConfigTab] = useState('appearance')
  // Estado de tab propio del hub Negocio (Datos·Cobros·Integraciones·Notificaciones/Mails). Se
  // separa de configTab porque son dos TabsList distintas en dos rutas distintas; default 'business'.
  const [negocioTab, setNegocioTab] = useState('business')
  // Qué value/handler recibe el <Tabs>: config y negocio tienen estado propio (TabsList visible);
  // las secciones sueltas restantes mapean a su única tab fija y no cambian de tab (onValueChange undefined).
  const tabValue = isNegocio ? negocioTab : isSection ? SECTION_TAB[view] : configTab
  const onTabChange = isNegocio ? setNegocioTab : isSection ? undefined : setConfigTab

  // Aviso al volver del OAuth de MercadoPago (?mp=connected|error) y limpieza de la URL.
  // D-06: Integraciones migró de /settings a /negocio, así que el retorno del OAuth se maneja acá,
  // en el hub Negocio. El backend ahora redirige a /negocio?mp=... → gateamos por isNegocio para que
  // el efecto solo corra al montar /negocio (nunca en /settings).
  useEffect(() => {
    if (!isNegocio) return
    const params = new URLSearchParams(window.location.search)
    const mp = params.get('mp')
    const google = params.get('google')
    if (!mp && !google) return
    if (mp === 'connected') toast.success('MercadoPago conectado')
    else if (mp === 'error') toast.error('No se pudo conectar con MercadoPago')
    // Google Calendar también vuelve acá cuando se conecta desde Integraciones (?from=negocio).
    if (google === 'connected') toast.success('Google Calendar conectado')
    else if (google === 'error') toast.error('No se pudo conectar con Google Calendar')
    setNegocioTab('integraciones')
    window.history.replaceState(null, '', '/negocio')
  }, [isNegocio])

  // Etiqueta del lugar de atención según el rubro (Consultorio/Local/Sucursal).
  const term = resolveVertical(business).terminology
  const locWord = term.location.toLowerCase()
  // Vertical canchas: en /servicios (view='servicios') se renderiza el manager de canchas (D-03) en
  // lugar del CRUD genérico de services. El resto de verticales conserva el CRUD de services intacto.
  const isCanchas = resolveVertical(business).key === 'canchas'

  // ── Apariencia: paleta + tema (next-themes) ─────────────────────────────────
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  // Estilo visual: theme (forjo|modern|spa|cyber), paleta (depende del theme) y font.
  const [vtheme, setVtheme] = useState(() => normalizeTheme(business.theme))
  const [palette, setPalette] = useState(() => normalizePalette(normalizeTheme(business.theme), business.palette))
  const [font, setFont] = useState(() => normalizeFont(business.font))
  const themePalettes = THEME_PALETTES[vtheme] || THEME_PALETTES.forjo

  // Setea/borra los data-* del <html> según los defaults del preview (forjo/auto = sin atributo).
  function applyTheme(t: string) { const d = document.documentElement.dataset; if (t === 'forjo') delete d.theme; else d.theme = t }
  function applyFont(f: string) { const d = document.documentElement.dataset; if (f === 'auto') delete d.font; else d.font = f }

  async function selectTheme(t: string) {
    if (t === vtheme) return
    // Elegir un estilo es la decisión de primer orden y RESETEA lo de abajo (mismo criterio que el
    // CMS del landing, theme-controls.tsx selectPreset): la paleta al default del theme (sus ids son
    // distintos) y la fuente a 'auto' (borra el override para que mande la tipografía del theme nuevo;
    // sin esto, una fuente elegida a mano seguía pisando la del tema al cambiar de estilo).
    const newPal = THEME_DEFAULT_PAL[t] || 'red'
    setVtheme(t); setPalette(newPal); setFont('auto')
    applyTheme(t)
    applyFont('auto')
    document.documentElement.dataset.palette = newPal
    const { error } = await supabase.from('businesses').update({ theme: t, palette: newPal, font: 'auto' }).eq('id', business.id)
    if (error) { toast.error('Error al guardar el estilo'); return }
    toast.success('Estilo actualizado')
  }

  async function selectPalette(key: string) {
    setPalette(key)
    // Feedback inmediato en el <html>; la persistencia confirma después.
    document.documentElement.dataset.palette = key
    const { error } = await supabase.from('businesses').update({ palette: key }).eq('id', business.id)
    if (error) { toast.error('Error al guardar la paleta'); return }
    toast.success('Paleta actualizada')
  }

  async function selectFont(f: string) {
    setFont(f)
    applyFont(f)
    const { error } = await supabase.from('businesses').update({ font: f }).eq('id', business.id)
    if (error) { toast.error('Error al guardar la tipografía'); return }
    toast.success('Tipografía actualizada')
  }

  // ── Plan limits ───────────────────────────────────────────────────────────
  const planConfig = getPlanLimits(business.plan || 'basic')
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [confirmCancelSub, setConfirmCancelSub] = useState(false)
  const [cancellingSub, setCancellingSub] = useState(false)

  async function cancelSubscription() {
    setCancellingSub(true)
    const res = await fetch('/api/subscription/cancel', { method: 'POST' })
    const data = await res.json()
    setCancellingSub(false)
    setConfirmCancelSub(false)
    if (data.ok) {
      toast.success('Suscripción cancelada')
      setTimeout(() => window.location.reload(), 800)
    } else {
      toast.error(data.error || 'Error al cancelar')
    }
  }

  // ── Tab 1 — Business ──────────────────────────────────────────────────────
  const [bizForm, setBizForm] = useState({
    name: business.name,
    type: business.type || '',
    whatsapp: business.whatsapp || '',
    address: business.address || '',
    maps_url: business.maps_url || '',
    instagram: business.instagram || '',
    primary_color: business.primary_color,
  })
  const [savingBiz, setSavingBiz] = useState(false)

  // Rubro (vertical): resuelve terminología/menú del panel (D-07). Inicializa desde la columna
  // vertical guardada; para filas viejas sin vertical, deriva del type con getVerticalKeyByType.
  // El type es texto libre de display (bizForm.type), ya no un subtipo del selector.
  const [vertical, setVertical] = useState<VerticalKey>(
    (business.vertical && business.vertical in VERTICALS
      ? business.vertical
      : getVerticalKeyByType(business.type)) as VerticalKey
  )

  async function saveBusiness() {
    // WhatsApp: vacío permitido (null); si hay algo, normalizar a formato wa.me y validar.
    let whatsapp: string | null = null
    if (bizForm.whatsapp.trim()) {
      whatsapp = normalizeArWhatsApp(bizForm.whatsapp)
      if (!whatsapp) {
        toast.error('WhatsApp inválido. Usá código de país y área, ej. +54 9 11 1234-5678')
        return
      }
    }
    setSavingBiz(true)
    // El vertical lo define el rubro elegido (estado `vertical`); el type es texto libre.
    const verticalChanged = vertical !== (business.vertical ?? 'general')
    const type = bizForm.type.trim()
    const maps_url = bizForm.maps_url.trim() || null
    const { error } = await supabase.from('businesses').update({ ...bizForm, type, whatsapp, vertical, maps_url }).eq('id', business.id)
    setSavingBiz(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Negocio actualizado')
    // El menú y la terminología del dashboard dependen del vertical → recargar.
    if (verticalChanged) setTimeout(() => window.location.reload(), 600)
  }

  // ── Widgets del dashboard (selección manual) ────────────────────────────────
  // El usuario elige del catálogo FIJO y confirma con "Guardar panel".
  // Persistimos null si están todos = default mostrar todo.
  const [widgetSelection, setWidgetSelection] = useState<string[]>(
    sanitizeWidgetIds(business.dashboard_widgets) ?? DASHBOARD_WIDGET_IDS
  )
  const [savingWidgets, setSavingWidgets] = useState(false)

  function toggleWidget(id: string) {
    setWidgetSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function saveWidgets() {
    setSavingWidgets(true)
    const value = widgetSelection.length === DASHBOARD_WIDGET_IDS.length ? null : widgetSelection
    const { error } = await supabase.from('businesses').update({ dashboard_widgets: value }).eq('id', business.id)
    setSavingWidgets(false)
    if (error) { toast.error('Error al guardar'); return }
    toast.success('Panel actualizado')
  }

  // ── Logo upload ───────────────────────────────────────────────────────────
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [currentLogo, setCurrentLogo] = useState<string | null>(business.logo_url)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('El archivo no puede superar 2MB'); return }
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { toast.error('Formato no soportado. Usá JPG, PNG o WebP'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo() {
    if (!logoFile) return
    setUploadingLogo(true)
    const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${business.id}/logo.${ext}`
    const { error: uploadError } = await supabase.storage.from('logos').upload(path, logoFile, { upsert: true })
    if (uploadError) { toast.error('Error al subir el logo: ' + uploadError.message); setUploadingLogo(false); return }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    const urlWithCache = `${publicUrl}?t=${Date.now()}`
    const { error: updateError } = await supabase.from('businesses').update({ logo_url: urlWithCache }).eq('id', business.id)
    if (updateError) { toast.error('Error al guardar'); setUploadingLogo(false); return }
    setCurrentLogo(urlWithCache)
    setLogoPreview(null)
    setLogoFile(null)
    setUploadingLogo(false)
    toast.success('Logo actualizado')
  }

  async function deleteLogo() {
    const { error } = await supabase.from('businesses').update({ logo_url: null }).eq('id', business.id)
    if (error) { toast.error('Error'); return }
    setCurrentLogo(null)
    setLogoPreview(null)
    setLogoFile(null)
    toast.success('Logo eliminado')
  }

  // ── Tab 2 — Services ──────────────────────────────────────────────────────
  const [services, setServices] = useState<Service[]>(initialServices)
  // capacity_mode/capacity (migr. 062, ampliado por la 068): el default espeja el de la DB → un
  // servicio nuevo nace INDIVIDUAL con cupo 1, y el dueño opta explícitamente por los otros dos modos.
  const [newService, setNewService] = useState<{ name: string; duration_minutes: number; price: number; location_ids: string[]; capacity_mode: CapacityMode; capacity: number }>({ name: '', duration_minutes: 30, price: 0, location_ids: [], capacity_mode: 'individual', capacity: 1 })
  // Guard de doble submit del alta (T-17-05): hasta ahora `addService` no deshabilitaba nada, así que
  // dos clicks seguidos creaban DOS servicios idénticos y el segundo quedaba huérfano de intención.
  // Espeja a `savingEditSvc` del diálogo de edición.
  const [savingNewSvc, setSavingNewSvc] = useState(false)
  // El tab, la lista visible y sus contadores salen de useActiveTabs, invocado más abajo (buscar
  // `manageableServices`): el hook necesita la lista ya filtrada, que depende de `professionals` y
  // `agendaSpaces` — declarados después, así que leerlos acá sería un TDZ en runtime.

  const [delService, setDelService] = useState<Service | null>(null)
  // Pre-check del borrado (D-11/D-13): lo que el modal necesita para anticipar el resultado ANTES de
  // que el dueño apriete. `null` = todavía contando; `'error'` = el pre-check NO se pudo hacer.
  // Molde: openDelete de canchas-manager.
  //
  // POR QUÉ 'error' es un estado propio y no un cero (WR-02): si una de las tres queries falla,
  // `count` vuelve null y el `?? 0` lo volvía indistinguible de "este servicio no tiene nada que
  // perder" — o sea, aparecía el Eliminar destructivo y el modal prometía conservar "0 turnos" de un
  // servicio que puede tener cientos. FAIL-CLOSED: sin dato no se ofrece la acción.
  const [delInfo, setDelInfo] = useState<{ future: number; nextDate: string | null; activeAbono: boolean; history: number } | 'error' | null>(null)

  // Token de generación del pre-check (WR-03). `openDeleteService` setea el servicio de una y recién
  // después espera tres round-trips: sin esto, cerrar el modal de A y abrir el de B mientras la
  // consulta de A sigue en vuelo hacía que A pisara `delInfo` y el diálogo de B mostrara los números
  // de A — con un "Eliminar" vivo para un servicio que la DB va a rechazar. Solo commitea el último.
  const delReqRef = useRef(0)

  // Abre el modal de borrado y cuenta lo que el trigger va a mirar. Es UX/refuerzo: NO autoriza nada
  // — el gate real vive en `services_block_delete_trg` (migr. 065), que no se puede saltear desde el
  // cliente. Las tres queries filtran por business_id ADEMÁS de service_id (aislamiento por tenant;
  // la RLS es la segunda capa, no la única).
  async function openDeleteService(s: Service) {
    const req = ++delReqRef.current
    setDelService(s)
    setDelInfo(null)
    // "Hoy" en hora AR, igual que el trigger: con el date de UTC, a las 22:00 de Buenos Aires un
    // turno de mañana temprano dejaría de contarse como futuro.
    const { date: today, time: nowTime } = nowInAR()
    const [futDias, futHoy, abo, hist] = await Promise.all([
      // (a) DÍAS POSTERIORES A HOY. Para estos la hora no decide nada: cuentan enteros.
      //
      // El `.or(...)` de abajo es el equivalente EXACTO en PostgREST del
      // `status IS NULL OR status NOT IN ('cancelled','completed')` del trigger. Un turno CANCELADO
      // no bloquea (se anuló) y uno COMPLETED tampoco (ya se prestó: es historia, no una reserva
      // pendiente). NO usar `.neq('status', ...)` suelto ni `.in('status', [...])`: las dos formas
      // descartan las filas con status NULL, y entonces el pre-check diría "podés borrar" justo
      // donde el trigger rechaza — por eso la rama `status.is.null` es explícita.
      supabase.from('appointments').select('date', { count: 'exact' })
        .eq('business_id', business.id).eq('service_id', s.id)
        .gt('date', today).or('status.is.null,and(status.neq.cancelled,status.neq.completed)')
        .order('date').limit(1),
      // (b) LOS DE HOY, que se traen enteros para decidirlos ACÁ. Desde la migr. 070 el trigger
      // cuenta un turno mientras TODAVÍA NO TERMINÓ
      // (`date + time + COALESCE(duration_minutes, 30) > ahora AR`), y eso NO se puede expresar como
      // filtro de PostgREST: la comparación es por fila, contra una expresión calculada. Por eso el
      // corte de hoy se hace en JS, con la misma aritmética. Sin esto el pre-check bloqueaba el
      // modal por turnos que la base ya deja borrar, y el arreglo de GATE-03 no llegaba al panel.
      supabase.from('appointments').select('time, duration_minutes', { count: 'exact' })
        .eq('business_id', business.id).eq('service_id', s.id)
        .eq('date', today).or('status.is.null,and(status.neq.cancelled,status.neq.completed)'),
      supabase.from('abonos').select('id', { count: 'exact', head: true })
        .eq('business_id', business.id).eq('service_id', s.id).eq('status', 'active'),
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .eq('business_id', business.id).eq('service_id', s.id),
    ])
    // Llegó tarde: mientras esperábamos, el dueño abrió el modal de otro servicio. Descartar.
    if (delReqRef.current !== req) return
    // Sin los cuatro counts no hay pre-check: cualquier fallo (red, RLS, parse del `.or(...)`) es
    // 'error', NUNCA un 0 silencioso.
    if (futDias.error || futHoy.error || abo.error || hist.error) {
      console.error('[settings/delete-service] pre-check falló:', futDias.error ?? futHoy.error ?? abo.error ?? hist.error)
      setDelInfo('error')
      return
    }
    const filasDeHoy = (futHoy.data ?? []) as { time: string | null; duration_minutes: number | null }[]
    const countDeHoy = futHoy.count ?? 0
    // FAIL-CLOSED si PostgREST paginó la respuesta (`max-rows`): con menos filas que el count no se
    // puede decidir cuáles siguen vivas, así que se cuentan TODAS — el modal bloquea de más, nunca
    // de menos. Es el mismo criterio del estado 'error': sin dato no se ofrece la acción.
    const vivosDeHoy = countDeHoy > filasDeHoy.length
      ? countDeHoy
      : filasDeHoy.filter(r => finEnSegundos(r.time, r.duration_minutes) > horaEnSegundos(nowTime)).length
    const future = (futDias.count ?? 0) + vivosDeHoy
    setDelInfo({
      future,
      nextDate: vivosDeHoy > 0 ? today : ((futDias.data?.[0] as { date?: string } | undefined)?.date ?? null),
      activeAbono: (abo.count ?? 0) > 0,
      history: hist.count ?? 0,
    })
  }

  // Bloqueado = el trigger va a rechazar el DELETE. Mientras `delInfo` es null todavía no se sabe, y
  // con 'error' tampoco: ahí no está bloqueado, está SIN VERIFICAR (se maneja aparte, sin confirmar).
  const delBlocked = !!delInfo && delInfo !== 'error' && (delInfo.future > 0 || delInfo.activeAbono)

  // Descripción de los CUATRO estados del diálogo (contando / sin verificar / bloqueado /
  // confirmable), derivada fuera del JSX (molde delDescription de canchas-manager).
  const delDescription = !delService
    ? undefined
    : delInfo === null
      ? `Vas a eliminar "${delService.name}". Verificando turnos…`
      : delInfo === 'error'
        ? `No pudimos verificar los turnos de "${delService.name}", así que no se puede eliminar sin saber qué se pierde. Cerrá y probá de nuevo.`
        : delBlocked
          ? `${delInfo.future > 0
              ? `"${delService.name}" tiene ${delInfo.future} ${delInfo.future === 1 ? 'turno reservado' : 'turnos reservados'}${delInfo.nextDate ? ` a partir del ${format(parseISO(delInfo.nextDate), 'd/M')}` : ''}${delInfo.activeAbono ? ' y un abono activo' : ''}`
              : `"${delService.name}" tiene un abono activo`}. ${delService.active
                ? 'Desactivalo para dejar de ofrecerlo y conservar el historial.'
                // Ya está desactivado (viene del tab "Desactivados"): ofrecerle desactivar de nuevo
                // sería un callejón sin salida disfrazado de acción recomendada (WR-04).
                : 'Ya está desactivado y no se ofrece más: vas a poder eliminarlo cuando no le queden turnos futuros ni abonos activos.'}`
          : `Vas a eliminar "${delService.name}". Se conservan sus ${delInfo.history} ${delInfo.history === 1 ? 'turno' : 'turnos'} en el historial (Finanzas y ficha del cliente) con su nombre y su precio. Esta acción no se puede deshacer.`

  async function addService() {
    // El botón deshabilitado es la SEÑAL, no la defensa: el guard se conserva acá adentro porque la
    // función es lo único que corre siempre (el estado del botón puede quedar viejo por un render en
    // vuelo, y nada impide llamarla desde otro lado).
    if (!newService.name) return
    if (savingNewSvc) return
    setSavingNewSvc(true)
    try {
      const { name, duration_minutes, price, location_ids, capacity_mode } = newService
      // Desde la migr. 068 el cupo vale para los TRES modos y está atado al modo por CHECK: individual
      // ⇒ exactamente 1; grupal y simultáneo ⇒ >= 2. Se normaliza con el piso del modo para que el
      // INSERT no pueda rebotar contra services_capacity_matches_mode_chk.
      const capacity = capacity_mode === 'individual' ? 1 : normalizeCapacity(newService.capacity, 2)
      const { data, error } = await supabase.from('services')
        .insert({ name, duration_minutes, price, location_ids: location_ids.length ? location_ids : null, capacity_mode, capacity, business_id: business.id })
        .select().single()
      if (error) { toast.error('Error'); return }
      setServices(prev => [...prev, data as Service])
      setNewService({ name: '', duration_minutes: 30, price: 0, location_ids: [], capacity_mode: 'individual', capacity: 1 })
      toast.success('Servicio agregado')
    } finally {
      // `finally` y no una línea antes de cada `return`: el early return por error del INSERT y
      // cualquier excepción de red tienen que devolver el botón, o el alta queda muerta hasta recargar.
      setSavingNewSvc(false)
    }
  }
  // NO optimista: capturamos el error real. Defensa en profundidad con business_id (igual que
  // deleteProfessional). NO emite toast de error: el motivo se devuelve y lo traduce el modal, que
  // sabe qué estado le estaba mostrando al dueño. `.select('id')` tampoco es cosmético: si la RLS
  // filtra la fila, el DELETE vuelve sin error y con 0 filas — sin eso diríamos "Servicio eliminado"
  // sin haber borrado nada.
  async function deleteService(id: string): Promise<DeleteServiceResult> {
    const { data, error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id).select('id')
    if (error) {
      // Mapeo del rechazo del gate de la migr. 065 (molde: lib/booking-core.ts — message primero,
      // code después). Dos messages distintos sobre el mismo ERRCODE P0001 para poder distinguir
      // "hay turnos" de "hay un abono vivo".
      if (error.code === 'P0001' && error.message?.includes('service_has_future_appointments')) return { ok: false, error: 'has_future_appointments' }
      if (error.code === 'P0001' && error.message?.includes('service_has_active_abono')) return { ok: false, error: 'has_active_abono' }
      // Fallback defensivo: si algún FK a services quedara en NO ACTION, Postgres rechaza con 23503
      // antes de que corra cualquier gate — para el dueño es el mismo caso "tiene turnos".
      if (error.code === '23503') return { ok: false, error: 'has_future_appointments' }
      return { ok: false, error: 'unknown' }
    }
    if (!data || data.length === 0) return { ok: false, error: 'unknown' }
    setServices(prev => prev.filter(s => s.id !== id))
    toast.success('Servicio eliminado')
    return { ok: true }
  }
  // D-12 asciende toggleService a acción primaria del modal de borrado, así que un fallo silencioso
  // mentiría. Alineado al patrón de deleteService/deleteProfessional: filtro por business_id (sin él,
  // un UUID conocido de otro negocio se desactivaría si la policy lo permitiera) + error real
  // capturado ANTES de tocar el estado local.
  // Devuelve si salió bien (WR-08): el modal de borrado la usa como acción secundaria y NO puede
  // cerrarse "por las dudas" — antes cerraba siempre, así que un fallo dejaba el toast de error al
  // lado de un diálogo ya desaparecido.
  async function toggleService(id: string, active: boolean): Promise<boolean> {
    const { error } = await supabase.from('services').update({ active }).eq('id', id).eq('business_id', business.id)
    if (error) { toast.error('No se pudo actualizar el servicio'); return false }
    setServices(prev => prev.map(s => s.id === id ? { ...s, active } : s))
    toast.success(active ? 'Servicio activado' : 'Servicio desactivado')
    return true
  }
  // Consultorios donde se ofrece un servicio (con compatibilidad legacy location_id).
  const serviceLocSet = (s: Service) => s.location_ids?.length ? s.location_ids : (s.location_id ? [s.location_id] : [])
  async function setServiceLocations(id: string, ids: string[]) {
    await supabase.from('services').update({ location_ids: ids.length ? ids : null, location_id: null }).eq('id', id)
    setServices(prev => prev.map(s => s.id === id ? { ...s, location_ids: ids, location_id: null } : s))
  }
  function toggleServiceLocation(s: Service, locId: string) {
    const cur = serviceLocSet(s)
    setServiceLocations(s.id, cur.includes(locId) ? cur.filter(x => x !== locId) : [...cur, locId])
  }

  // Edición de servicio (reusa el form de alta: nombre, duración, precio, consultorios).
  const [editSvc, setEditSvc] = useState<Service | null>(null)
  const [editSvcForm, setEditSvcForm] = useState<{ name: string; duration_minutes: number; price: number; location_ids: string[]; capacity_mode: CapacityMode; capacity: number }>({ name: '', duration_minutes: 30, price: 0, location_ids: [], capacity_mode: 'individual', capacity: 1 })
  const [savingEditSvc, setSavingEditSvc] = useState(false)
  // Guardado del cupo inline, POR TARJETA (D-08). NO se puede copiar el shape booleano de
  // `savingEditSvc`: el diálogo es uno solo, pero las tarjetas son muchas y están todas en pantalla a
  // la vez — con un booleano global, guardar un servicio congelaría los steppers de todos los demás.
  // Es el único punto donde el molde de saveEditService no alcanza tal cual.
  //
  // Y es un CONJUNTO, no un id suelto (code-review WR-02). Con un solo id la afirmación "una tarjeta =
  // un request en vuelo" no la garantizaba el estado: guardar en A y después en B dejaba el estado en
  // 'B', y cuando volvía A el `setSavingCapacityId(null)` re-habilitaba el botón y el stepper de B con
  // SU request todavía viajando ⇒ doble submit sobre B y, si el dueño tocaba `+` en el hueco, la
  // resincronización del efecto le pisaba la edición nueva al confirmar. Un conjunto hace que cada
  // tarjeta prenda y apague SU flag y ninguna toque el de otra.
  const [savingCapacityIds, setSavingCapacityIds] = useState<ReadonlySet<string>>(() => new Set())
  function openEditService(s: Service) {
    setEditSvc(s)
    // El fallback cubre filas viejas en memoria (el DEFAULT de la 068 ya las cubre en la DB): al
    // reabrir, el modo y el cupo guardados vuelven seleccionados (CUPO-01). El cupo se normaliza con
    // el piso del modo que se acaba de resolver, para no abrir el diálogo en un estado que la base
    // rechazaría.
    const mode: CapacityMode = s.capacity_mode ?? 'individual'
    setEditSvcForm({
      name: s.name,
      duration_minutes: s.duration_minutes,
      price: Number(s.price),
      location_ids: serviceLocSet(s),
      capacity_mode: mode,
      capacity: normalizeCapacity(Number(s.capacity), minCapacityFor(mode)),
    })
  }
  async function saveEditService() {
    if (!editSvc || !editSvcForm.name.trim()) return
    setSavingEditSvc(true)
    // Normaliza igual que addService/setServiceLocations: array vacío → null = "todos"; limpia el legacy location_id.
    const payload = {
      name: editSvcForm.name.trim(),
      duration_minutes: editSvcForm.duration_minutes,
      price: editSvcForm.price,
      location_ids: editSvcForm.location_ids.length ? editSvcForm.location_ids : null,
      location_id: null,
      capacity_mode: editSvcForm.capacity_mode,
      // Mismo criterio que addService: el cupo se ata al modo con el piso de la migr. 068 (individual
      // ⇒ 1; los otros dos ⇒ >= 2) para que el UPDATE no rebote contra el CHECK de coherencia.
      capacity: editSvcForm.capacity_mode === 'individual' ? 1 : normalizeCapacity(editSvcForm.capacity, 2),
    }
    // El `.eq('business_id', ...)` es defensa en profundidad (la RLS es la segunda capa, no la única).
    const { error } = await supabase.from('services').update(payload).eq('id', editSvc.id).eq('business_id', business.id)
    setSavingEditSvc(false)
    if (error) {
      // Mapeo del rechazo del gate de cambio de modo (CUPO-08, migr. 068) — mismo molde que
      // deleteService: `code` primero, `message.includes(<código de dominio>)` después. La copy es
      // PROPIA y fija: NUNCA se interpola `error.message` ni el nombre del servicio (T-14-14 / T-13-09).
      if (error.code === 'P0001' && error.message?.includes('service_mode_has_future_appointments')) {
        toast.error(GATE_MODE_CHANGE_MESSAGE)
        return
      }
      toast.error('Error al guardar')
      return
    }
    setServices(prev => prev.map(s => s.id === editSvc.id ? { ...s, ...payload } : s))
    setEditSvc(null)
    toast.success('Servicio actualizado')
  }

  // ── Guardado del cupo desde la tarjeta (D-08) ─────────────────────────────────────
  // SEGUNDO camino de escritura sobre `services`, en paralelo al del diálogo. Devuelve true/false
  // porque el control inline necesita saber si tiene que revertir el número que muestra.
  async function saveCapacityInline(svc: Service, cap: number): Promise<boolean> {
    // El id de ESTE servicio entra al conjunto y se saca en TODAS las salidas: una tarjeta = un
    // request en vuelo, y las demás tarjetas siguen usables mientras tanto. Sacar SÓLO el propio id
    // es lo que hace verdadera esa frase cuando hay dos guardados en vuelo a la vez.
    setSavingCapacityIds(prev => { const next = new Set(prev); next.add(svc.id); return next })
    // Se normaliza otra vez acá aunque el control ya clampee: el piso por modo espeja el CHECK de la
    // migr. 068 y MAX_CAPACITY es lo que evita que un número pegado viaje al UPDATE y vuelva como
    // `22003 smallint out of range`, que el panel no sabría explicar. Defensa en profundidad, nunca
    // reemplazo del constraint.
    const capacity = normalizeCapacity(cap, minCapacityFor(svc.capacity_mode ?? 'individual'))
    // El payload lleva UNA sola clave. Es HIGIENE, no un arreglo de un bug: el guard de no-cambio del
    // trigger de la migr. 070 (`IS NOT DISTINCT FROM` → RETURN NEW) hace que mandar también el modo pase
    // igual —saveEditService lo manda hoy en producción y no rebota—, pero mandarlo desde acá despacharía
    // un trigger SECURITY DEFINER por cada + y cada − que sólo puede terminar en RETURN NEW. Cuesta cero
    // evitarlo, y de paso el cambio de modo queda donde D-09 lo dejó: en el diálogo.
    // El `.eq('business_id', ...)` es defensa en profundidad (la RLS es la segunda capa, no la única).
    const { error } = await supabase.from('services').update({ capacity }).eq('id', svc.id).eq('business_id', business.id)
    setSavingCapacityIds(prev => { const next = new Set(prev); next.delete(svc.id); return next })
    if (error) {
      // FAIL-SAFE, no camino feliz: por D-09 este camino NO manda el modo, así que este rechazo no
      // debería llegar nunca desde la tarjeta. Si llega, significa que alguien empezó a mandar un
      // `capacity_mode` DISTINTO — es un bug del cliente. Mismo molde de mapeo que el diálogo (`code`
      // primero, `message.includes(<código de dominio>)` después) y LA MISMA cadena, no una variante.
      if (error.code === 'P0001' && error.message?.includes('service_mode_has_future_appointments')) {
        toast.error(GATE_MODE_CHANGE_MESSAGE)
        return false
      }
      // Cadena FIJA: ni el mensaje de la base, ni el código, ni el nombre del servicio (T-17-10).
      toast.error('No pudimos guardar el cupo. Volvimos al valor anterior. Intentá de nuevo.')
      return false
    }
    // Actualización local DESPUÉS de la confirmación, igual que saveEditService: en la tarjeta se ve lo
    // que la base aceptó. Al cambiar el prop, el control se resincroniza solo y la fila queda limpia.
    setServices(prev => prev.map(s => s.id === svc.id ? { ...s, capacity } : s))
    toast.success('Cupo actualizado')
    return true
  }

  // ── Tab 3 — Professionals ─────────────────────────────────────────────────
  const [professionals, setProfessionals] = useState<Professional[]>(initialProfessionals)
  const [newPro, setNewPro] = useState<ProForm>(EMPTY_PRO)
  const [savingPro, setSavingPro] = useState(false)
  const [editingPro, setEditingPro] = useState<Professional | null>(null)
  const [editPro, setEditPro] = useState<ProForm>(EMPTY_PRO)
  const [savingEditPro, setSavingEditPro] = useState(false)
  const [uploadingProPhoto, setUploadingProPhoto] = useState(false)
  const [newProPhoto, setNewProPhoto] = useState<File | null>(null)
  const [newProPhotoPreview, setNewProPhotoPreview] = useState<string | null>(null)

  // Foto del profesional (se muestra en la página pública). Mismo bucket que el logo,
  // bajo la carpeta del negocio: logos/{businessId}/pro-{proId}.{ext}.
  function validatePhoto(file: File): boolean {
    if (file.size > 2 * 1024 * 1024) { toast.error('El archivo no puede superar 2MB'); return false }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error('Formato no soportado. Usá JPG, PNG o WebP'); return false }
    return true
  }
  async function uploadPhotoFile(proId: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${business.id}/pro-${proId}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (error) { toast.error('Error al subir la foto: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    return `${publicUrl}?t=${Date.now()}`
  }

  // Alta: se elige antes de que exista el profesional; se sube en addProfessional.
  function selectNewProPhoto(file: File) {
    if (!validatePhoto(file)) return
    setNewProPhoto(file)
    setNewProPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file) })
  }
  function clearNewProPhoto() {
    setNewProPhotoPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setNewProPhoto(null)
  }

  // Edición: sube y persiste de inmediato.
  async function uploadProPhoto(file: File) {
    if (!editingPro || !validatePhoto(file)) return
    setUploadingProPhoto(true)
    const url = await uploadPhotoFile(editingPro.id, file)
    if (!url) { setUploadingProPhoto(false); return }
    const { error } = await supabase.from('professionals').update({ photo_url: url }).eq('id', editingPro.id)
    if (error) { toast.error('Error al guardar la foto'); setUploadingProPhoto(false); return }
    setProfessionals(prev => prev.map(p => p.id === editingPro.id ? { ...p, photo_url: url } : p))
    setEditingPro(prev => prev ? { ...prev, photo_url: url } : prev)
    setUploadingProPhoto(false)
    toast.success('Foto actualizada')
  }
  async function removeProPhoto() {
    if (!editingPro) return
    const { error } = await supabase.from('professionals').update({ photo_url: null }).eq('id', editingPro.id)
    if (error) { toast.error('Error al quitar la foto'); return }
    setProfessionals(prev => prev.map(p => p.id === editingPro.id ? { ...p, photo_url: null } : p))
    setEditingPro(prev => prev ? { ...prev, photo_url: null } : prev)
    toast.success('Foto eliminada')
  }

  const canAddPro = professionals.filter(p => p.active).length < planConfig.max_agendas
  // Labels de Especialidad/Matrícula según el rubro del negocio.
  const proLabels = PRO_LABELS[vertical] ?? PRO_LABELS.general

  async function addProfessional() {
    if (!newPro.name.trim()) return
    if (!canAddPro) { toast.error('Límite de profesionales del plan alcanzado'); return }
    setSavingPro(true)
    const { data, error } = await supabase
      .from('professionals')
      .insert({ ...proToPayload(newPro), business_id: business.id })
      .select()
      .single()
    if (error) { setSavingPro(false); toast.error('Error al agregar'); return }
    let created = data as Professional
    // Si eligió foto en el alta, la subimos ahora que existe el id.
    if (newProPhoto) {
      const url = await uploadPhotoFile(created.id, newProPhoto)
      if (url) {
        await supabase.from('professionals').update({ photo_url: url }).eq('id', created.id)
        created = { ...created, photo_url: url }
      }
    }
    setSavingPro(false)
    setProfessionals(prev => [...prev, created])
    setNewPro(EMPTY_PRO)
    clearNewProPhoto()
    toast.success('Profesional agregado')
  }

  function openEditPro(p: Professional) {
    setEditingPro(p)
    setEditPro({
      name: p.name ?? '',
      last_name: p.last_name ?? '',
      specialty: p.specialty ?? '',
      license_number: p.license_number ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
    })
  }

  async function saveEditPro() {
    if (!editingPro || !editPro.name.trim()) return
    setSavingEditPro(true)
    const payload = proToPayload(editPro)
    // Defensa en profundidad: filtro explícito por business_id además de la RLS.
    const { error } = await supabase
      .from('professionals')
      .update(payload)
      .eq('id', editingPro.id)
      .eq('business_id', business.id)
    setSavingEditPro(false)
    if (error) { toast.error('Error al guardar'); return }
    setProfessionals(prev => prev.map(p => p.id === editingPro.id ? { ...p, ...payload } as Professional : p))
    setEditingPro(null)
    toast.success('Profesional actualizado')
  }

  async function deleteProfessional(id: string) {
    // NO optimista: capturamos el error real (mismo patrón que deleteService). Defensa en profundidad
    // con business_id además de la RLS. Si hay turnos asociados, el FK (23503) sobre appointments bloquea
    // el borrado (professional_services/agenda_spaces caen por CASCADE, por eso el mensaje genérico "tiene
    // turnos asociados" es correcto) → sugerimos desactivar SIN tocar el estado, en vez de mentir "eliminado".
    const { error } = await supabase.from('professionals').delete().eq('id', id).eq('business_id', business.id)
    if (error) {
      if (error.code === '23503') toast.error('No se puede eliminar: el profesional tiene turnos asociados, incluidos pasados y cancelados (cancelar no los borra). Desactivalo para dejar de ofrecerlo y conservar el historial, o borrá esos turnos primero.')
      else toast.error('No se pudo eliminar el profesional')
      return
    }
    setProfessionals(prev => prev.filter(p => p.id !== id))
    // Limpieza optimista del mapeo: al borrar la agenda, sus filas de agenda_spaces caen por FK
    // CASCADE en la DB; reflejarlo en el estado para que el UI no muestre mapeos huérfanos.
    setAgendaSpaces(prev => prev.filter(a => a.professional_id !== id))
    toast.success('Profesional eliminado')
  }

  // ── Espacios físicos + mapeo agenda→espacios (motor-reservas / espacio compartido) ─────────
  // Reusa el patrón del CRUD de professionals (estado local + browser client RLS + UI optimista +
  // toast). Toda escritura confía en RLS WITH CHECK por tenant (Plan 01); el business_id se pasa
  // porque la columna es NOT NULL, pero la policy lo valida (no es superficie falsificable).
  const [spaces, setSpaces] = useState<Space[]>(initialSpaces)
  const [agendaSpaces, setAgendaSpaces] = useState<AgendaSpace[]>(initialAgendaSpaces)
  // Mapeo profesional→servicio (STAFF, D-01/D-06). Espeja el estado/patrón de agendaSpaces.
  const [professionalServices, setProfessionalServices] = useState<ProfessionalService[]>(initialProfessionalServices)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [savingSpace, setSavingSpace] = useState(false)

  // ── Base del CRUD genérico de Servicios (vive acá por el orden de declaración) ──────────────
  // `services` MENOS la mitad `service` de cada cancha (gap 13-05 #2). Una cancha es una TUPLA
  // (service + professional-agenda + space) y se administra SOLO desde su manager: listarla en el
  // CRUD genérico dejaba borrarla desde ahí, y el FK dejaba `professionals.service_id` en NULL →
  // agenda huérfana que canchasFromData ya no reconstruye. Se aplica aunque el vertical NO sea
  // canchas: la tupla existe igual si el negocio cambió de rubro. El emparejamiento sale de
  // canchasFromData (por service_id, NUNCA por nombre — Pitfall 2). Al CanchasManager se le sigue
  // pasando `services` COMPLETO: el filtro es del CRUD genérico, no de la fuente de datos.
  const manageableServices = useMemo(
    () => nonCanchaServices(services, canchasFromData(services, professionals, agendaSpaces)),
    [services, professionals, agendaSpaces],
  )
  // Tab + filtro + contadores (D-13). El hook compartido garantiza el invariante que antes vivía acá:
  // el filtro y el contador llaman al MISMO predicado (`isServiceActive`), porque si cada uno
  // decidiera por su cuenta el tab podría decir "Activos (1)" sobre una lista vacía.
  const { tab: serviceTab, setTab: setServiceTab, visible: visibleServices, counts: serviceTabCounts } =
    useActiveTabs(manageableServices, isServiceActive)
  // Término del eje según el rubro: 'Cancha'/'Canchas' para canchas, 'Profesional'/'Equipo' resto.
  const resourceWord = term.resource
  const resourcesWord = term.resources

  async function addSpace() {
    const name = newSpaceName.trim()
    if (!name) return
    setSavingSpace(true)
    const { data, error } = await supabase
      .from('spaces')
      .insert({ name, business_id: business.id })
      .select()
      .single()
    setSavingSpace(false)
    if (error) { toast.error('Error al agregar el espacio'); return }
    setSpaces(prev => [...prev, data as Space])
    setNewSpaceName('')
    toast.success('Espacio agregado')
  }

  async function deleteSpace(id: string) {
    // Defensa en profundidad: filtro explícito por business_id además de la RLS.
    const { error } = await supabase.from('spaces').delete().eq('id', id).eq('business_id', business.id)
    if (error) { toast.error('Error al eliminar el espacio'); return }
    setSpaces(prev => prev.filter(s => s.id !== id))
    // Sus filas de agenda_spaces caen por FK CASCADE en la DB; reflejarlo en el estado.
    setAgendaSpaces(prev => prev.filter(a => a.space_id !== id))
    toast.success('Espacio eliminado')
  }

  function isMapped(professionalId: string, spaceId: string) {
    return agendaSpaces.some(a => a.professional_id === professionalId && a.space_id === spaceId)
  }

  // Marca/desmarca el mapeo de una agenda a un espacio. Optimista con rollback en error.
  async function toggleAgendaSpace(professionalId: string, spaceId: string) {
    const mapped = isMapped(professionalId, spaceId)
    if (mapped) {
      // Optimista: quitar primero.
      setAgendaSpaces(prev => prev.filter(a => !(a.professional_id === professionalId && a.space_id === spaceId)))
      const { error } = await supabase
        .from('agenda_spaces')
        .delete()
        .eq('business_id', business.id)
        .eq('professional_id', professionalId)
        .eq('space_id', spaceId)
      if (error) {
        // Rollback: re-insertar la fila quitada.
        setAgendaSpaces(prev => [...prev, { business_id: business.id, professional_id: professionalId, space_id: spaceId }])
        toast.error('Error al actualizar el mapeo')
      }
    } else {
      const row: AgendaSpace = { business_id: business.id, professional_id: professionalId, space_id: spaceId }
      setAgendaSpaces(prev => [...prev, row])
      const { error } = await supabase.from('agenda_spaces').insert(row)
      if (error) {
        // Rollback: quitar la fila agregada.
        setAgendaSpaces(prev => prev.filter(a => !(a.professional_id === professionalId && a.space_id === spaceId)))
        toast.error('Error al actualizar el mapeo')
      }
    }
  }

  // ── Mapeo profesional→servicio (STAFF, D-06) ────────────────────────────────
  function isServiceMapped(professionalId: string, serviceId: string) {
    return professionalServices.some(r => r.professional_id === professionalId && r.service_id === serviceId)
  }

  // Marca/desmarca qué servicio hace un profesional. Optimista con rollback (paridad exacta con
  // toggleAgendaSpace). Escritura por el browser client con RLS + .eq('business_id') (defensa en
  // profundidad), NUNCA service-role. Al DESMARCAR dispara como máximo UN toast con la precedencia del
  // UI-SPEC: D-10 (ese servicio quedó sin cobertura) gana sobre D-02 (el profesional volvió a comodín);
  // si la escritura falla, solo toast.error. Marcar nunca avisa: el chip pintado ES el feedback. La
  // regla del comodín se consume del helper puro (@/lib/staff-services), no se reimplementa acá.
  async function toggleProfessionalService(professionalId: string, serviceId: string) {
    const mapped = isServiceMapped(professionalId, serviceId)
    if (mapped) {
      const next = professionalServices.filter(r => !(r.professional_id === professionalId && r.service_id === serviceId))
      setProfessionalServices(next)
      const { error } = await supabase
        .from('professional_services')
        .delete()
        .eq('business_id', business.id)
        .eq('professional_id', professionalId)
        .eq('service_id', serviceId)
      if (error) {
        // Rollback: re-insertar la fila quitada.
        setProfessionalServices(prev => [...prev, { business_id: business.id, professional_id: professionalId, service_id: serviceId }])
        toast.error('No se pudo guardar el cambio. Revisá tu conexión y probá de nuevo.')
        return
      }
      // Avisos post-escritura, sobre el estado ya aplicado y solo profesionales ACTIVOS (D-16).
      const activePros = professionals.filter(p => p.active)
      const svc = services.find(s => s.id === serviceId)
      if (svc && !isServiceCovered(serviceId, activePros, next)) {
        toast.warning(`Nadie ofrece "${svc.name}". Marcá a alguien para que lo cubra.`)
      } else if (next.every(r => r.professional_id !== professionalId)) {
        const pro = professionals.find(p => p.id === professionalId)
        const proName = pro ? [pro.name, pro.last_name].filter(Boolean).join(' ') : ''
        toast.info(`Sin nada marcado, ${proName} vuelve a ofrecerse para todo.`)
      }
    } else {
      const row: ProfessionalService = { business_id: business.id, professional_id: professionalId, service_id: serviceId }
      setProfessionalServices(prev => [...prev, row])
      const { error } = await supabase.from('professional_services').insert(row)
      if (error) {
        // Rollback: quitar la fila agregada.
        setProfessionalServices(prev => prev.filter(r => !(r.professional_id === professionalId && r.service_id === serviceId)))
        toast.error('No se pudo guardar el cambio. Revisá tu conexión y probá de nuevo.')
      }
    }
  }

  // ── Tab 4 — Locations ─────────────────────────────────────────────────────
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [newLocation, setNewLocation] = useState({ name: '', address: '', phone: '' })
  const [savingLocation, setSavingLocation] = useState(false)

  const activeLocations = locations.filter(l => l.is_active !== false)
  const canAddLocation = true // sucursales sin tope de plan

  // Agendas activas: base del bloque de cobertura por servicio (D-08) y del gate de "Recurso
  // simultáneo" vs. espacios (064, gap 3). Se filtra a activas acá (D-16: el caller filtra, no el
  // helper puro de @/lib/staff-services).
  const activeProfessionals = professionals.filter(p => p.active)

  async function addLocation() {
    if (!newLocation.name.trim()) return
    if (!canAddLocation) { toast.error('Límite del plan alcanzado'); return }
    setSavingLocation(true)
    const { data, error } = await supabase.from('locations').insert({
      business_id: business.id,
      name: newLocation.name.trim(),
      address: newLocation.address.trim() || null,
      phone: newLocation.phone.trim() || null,
      is_active: true,
    }).select().single()
    setSavingLocation(false)
    if (error) { toast.error('Error al agregar'); return }
    setLocations(prev => [...prev, data as Location])
    setNewLocation({ name: '', address: '', phone: '' })
    toast.success('Guardado')
  }

  const [delLoc, setDelLoc] = useState<Location | null>(null)
  async function deleteLocation(id: string) {
    // Mismo patrón que deleteService: NO optimista, error real + business_id. FK (23503) =
    // tiene turnos → bloqueamos y sugerimos desactivar (soft-disable vía is_active).
    const { error } = await supabase.from('locations').delete().eq('id', id).eq('business_id', business.id)
    if (error) {
      if (error.code === '23503') toast.error(`No se puede eliminar: el ${locWord} tiene turnos asociados, incluidos pasados y cancelados (cancelar no los borra). Desactivalo para dejar de ofrecerlo y conservar el historial, o borrá esos turnos primero.`)
      else toast.error('No se pudo eliminar')
      return
    }
    setLocations(prev => prev.filter(l => l.id !== id))
    toast.success('Eliminado')
  }
  // Soft-disable de locales (la columna en locations es is_active, NO active). El booking público
  // ya filtra is_active (app/[slug]/page.tsx) → un local desactivado deja de ofrecerse sin más.
  async function toggleLocation(id: string, is_active: boolean) {
    const { error } = await supabase.from('locations').update({ is_active }).eq('id', id).eq('business_id', business.id)
    if (error) { toast.error('Error al actualizar'); return }
    setLocations(prev => prev.map(l => l.id === id ? { ...l, is_active } : l))
    toast.success(is_active ? 'Activado' : 'Desactivado')
  }
  const [editLoc, setEditLoc] = useState<Location | null>(null)
  const [editLocForm, setEditLocForm] = useState({ name: '', address: '', phone: '' })
  const [savingEditLoc, setSavingEditLoc] = useState(false)
  function openEditLocation(l: Location) {
    setEditLoc(l)
    setEditLocForm({ name: l.name, address: l.address || '', phone: l.phone || '' })
  }
  async function saveEditLocation() {
    if (!editLoc || !editLocForm.name.trim()) return
    setSavingEditLoc(true)
    const payload = { name: editLocForm.name.trim(), address: editLocForm.address.trim() || null, phone: editLocForm.phone.trim() || null }
    const { error } = await supabase.from('locations').update(payload).eq('id', editLoc.id)
    setSavingEditLoc(false)
    if (error) { toast.error('Error al guardar'); return }
    setLocations(prev => prev.map(l => l.id === editLoc.id ? { ...l, ...payload } : l))
    setEditLoc(null)
    toast.success('Guardado')
  }

  // ── Tab 5 — Payments ──────────────────────────────────────────────────────
  // El valor crudo del token viene de secrets (business_secrets), no de business (D-05: el form
  // de edición del dueño puede mostrar SU valor; el secreto ya no vive en Business).
  const [mpToken, setMpToken] = useState(secrets.mp_access_token || '')
  const [showMpToken, setShowMpToken] = useState(false)
  const [savingMp, setSavingMp] = useState(false)
  // Conexión por MercadoPago Connect (OAuth): mp_user_id presente = conectado por botón.
  // mp_user_id NO es secreto → sigue en businesses.
  // Conectado sano SOLO si hay cuenta OAuth y el flag no está caído (D-01).
  const mpConnected = !!business.mp_user_id && business.mp_connection_status !== 'error'
  // La cuenta estuvo conectada por OAuth y se cayó (Phase 1 dejó el flag en 'error').
  const mpConnectionError = !!business.mp_user_id && business.mp_connection_status === 'error'
  // Pegar el token a mano: avanzado. Abierto si ya hay token manual (sin user_id de OAuth).
  const [mpManual, setMpManual] = useState(!!secrets.mp_access_token && !business.mp_user_id)
  const [disconnectingMp, setDisconnectingMp] = useState(false)
  async function disconnectMp() {
    setDisconnectingMp(true)
    const res = await fetch('/api/mercadopago/disconnect', { method: 'POST' })
    setDisconnectingMp(false)
    if (res.ok) { toast.success('MercadoPago desconectado'); router.refresh() }
    else toast.error('No se pudo desconectar')
  }

  // ── Google Calendar (misma conexión que el control de la Agenda) ──────────────
  // Comparte los endpoints /api/google/* → conectar/desconectar/sincronizar acá refleja lo mismo
  // que en la Agenda (el token vive en business_secrets, keyed por business_id). Conectar hace un
  // full redirect al OAuth de Google, cuyo callback vuelve a /agenda (hardcodeado).
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
      if (res.ok) toast.success('Turnos sincronizados con Google Calendar')
      else toast.error('No se pudo sincronizar')
    } finally {
      setSyncingGoogle(false)
    }
  }

  const [depositForm, setDepositForm] = useState({
    require_deposit: business.require_deposit || false,
    deposit_amount: business.deposit_amount || 0,
    deposit_expiry_hours: business.deposit_expiry_hours || 1,
  })
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)

  // EXTRA-B: default del selector de profesional del booking público (enum 'any'|'choose', migr 061).
  // 'any' = tarjeta "Cualquiera" arriba (recomendado, byte-idéntico a hoy); 'choose' = profesionales
  // primero. Nullish → 'any' (default de la columna). Persiste owner-only (RLS), patrón require_deposit.
  const [selectorDefault, setSelectorDefault] = useState<'any' | 'choose'>(
    business.public_selector_default === 'choose' ? 'choose' : 'any'
  )
  const [savingSelector, setSavingSelector] = useState(false)

  const [notifForm, setNotifForm] = useState({
    // notification_email NO es secreto → sigue en businesses. resend_* vienen de secrets (D-05).
    // Autocarga: si el negocio todavía no seteó un email, precargamos el del dueño (sesión) como
    // fallback — no pisa un valor ya guardado.
    notification_email: business.notification_email || ownerEmail || '',
    resend_api_key: secrets.resend_api_key || '',
    resend_from: secrets.resend_from || '',
  })
  const [showResendKey, setShowResendKey] = useState(false)
  const [savingNotif, setSavingNotif] = useState(false)
  // Avanzado: dominio propio de email (Resend). Abierto si ya tenían key cargada.
  const [ownDomain, setOwnDomain] = useState(!!secrets.resend_api_key)

  const [recaptchaForm, setRecaptchaForm] = useState({
    // recaptcha_site_key NO es secreto (se renderiza en el browser) → sigue en businesses.
    // recaptcha_secret_key viene de secrets (business_secrets), valor solo al dueño (D-05).
    recaptcha_site_key: business.recaptcha_site_key || '',
    recaptcha_secret_key: secrets.recaptcha_secret_key || '',
  })
  const [showRecaptchaSecret, setShowRecaptchaSecret] = useState(false)
  const [savingRecaptcha, setSavingRecaptcha] = useState(false)
  // Avanzado: cuenta propia de reCAPTCHA. Por defecto todos quedan protegidos con la
  // clave global de Forjo; esto es un override. Abierto si ya tenían key cargada.
  const [ownRecaptcha, setOwnRecaptcha] = useState(!!secrets.recaptcha_secret_key)

  async function saveMpToken() {
    setSavingMp(true)
    // El secreto va a business_secrets (upsert por business_id). El session client lo autoriza
    // la policy owner-only de business_secrets (Pitfall F).
    const { error } = await supabase
      .from('business_secrets')
      .upsert({ business_id: business.id, mp_access_token: mpToken || null }, { onConflict: 'business_id' })
    setSavingMp(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Token guardado')
  }
  async function saveDeposit() {
    setSavingDeposit(true)
    const { error } = await supabase.from('businesses').update(depositForm).eq('id', business.id)
    setSavingDeposit(false)
    if (error) toast.error('Error al guardar')
    else toast.success('Configuración de seña guardada')
  }
  async function saveSelectorDefault(value: 'any' | 'choose') {
    if (value === selectorDefault) return
    const prev = selectorDefault
    setSelectorDefault(value) // optimista: revertimos si la escritura falla
    setSavingSelector(true)
    // Owner-only por RLS + `.eq('id', business.id)` (patrón require_deposit, sin service-role). El
    // enum emitido es siempre 'any'|'choose'; el CHECK de la 061 es el fail-closed en DB.
    const { error } = await supabase.from('businesses').update({ public_selector_default: value }).eq('id', business.id)
    setSavingSelector(false)
    if (error) { setSelectorDefault(prev); toast.error('Error al guardar') }
    else toast.success('Preferencia guardada')
  }
  async function cleanupExpired() {
    setCleaningUp(true)
    try {
      const res = await fetch('/api/appointments/cleanup-expired', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) {
        toast.success(data.cancelled > 0
          ? `Se liberaron ${data.cancelled} reserva(s) con seña vencida`
          : 'No había reservas vencidas para liberar')
      } else {
        toast.error('No se pudo limpiar. Probá de nuevo.')
      }
    } catch {
      toast.error('No se pudo conectar. Probá de nuevo.')
    } finally {
      setCleaningUp(false)
    }
  }
  async function saveNotif() {
    setSavingNotif(true)
    // Sin dominio propio → se limpian las claves de Resend (los emails vuelven a salir desde Forjo).
    // notification_email NO es secreto → businesses. resend_* (secretos) → business_secrets (Pitfall F).
    const { error: bizErr } = await supabase.from('businesses').update({
      notification_email: notifForm.notification_email || null,
    }).eq('id', business.id)
    const { error: secErr } = await supabase.from('business_secrets').upsert({
      business_id: business.id,
      resend_api_key: ownDomain ? (notifForm.resend_api_key || null) : null,
      resend_from: ownDomain ? (notifForm.resend_from || null) : null,
    }, { onConflict: 'business_id' })
    setSavingNotif(false)
    if (bizErr || secErr) toast.error('Error al guardar')
    else toast.success('Notificaciones guardadas')
  }
  async function saveRecaptcha() {
    setSavingRecaptcha(true)
    // Sin cuenta propia → se limpian las claves (queda la protección global de Forjo).
    // recaptcha_site_key es pública (se renderiza en el browser) → businesses.
    // recaptcha_secret_key es secreto → business_secrets (upsert owner RLS, Pitfall F).
    const { error: bizErr } = await supabase.from('businesses').update({
      recaptcha_site_key: ownRecaptcha ? (recaptchaForm.recaptcha_site_key || null) : null,
    }).eq('id', business.id)
    const { error: secErr } = await supabase.from('business_secrets').upsert({
      business_id: business.id,
      recaptcha_secret_key: ownRecaptcha ? (recaptchaForm.recaptcha_secret_key || null) : null,
    }, { onConflict: 'business_id' })
    setSavingRecaptcha(false)
    if (bizErr || secErr) toast.error('Error al guardar')
    else toast.success('Configuración anti-spam guardada')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <PageEyebrow label={isSection ? 'Gestión' : 'Ajustes'} />
        <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">
          {view === 'negocio' ? 'Negocio'
            : view === 'servicios' ? term.services
            : view === 'equipo' ? 'Equipo'
            : view === 'consultorios' ? term.locations
            : 'Configuración'}
        </h1>
      </div>

      <Tabs value={tabValue} onValueChange={onTabChange}>
        {/* TabsList del hub Negocio (NAV-02): Cobros·Integraciones·Notificaciones migraron acá desde
            Configuración. El label de la 4ª es literal "Notificaciones/Mails" (brief §3) aunque el
            value siga siendo 'notificaciones'. */}
        {/* Mobile: 2×2 real. El !h-auto vence al h-8 del TabsList base (group-data-horizontal, más
            específico) que aplastaba el grid a 32px. Cada trigger llena su celda (w-full). Desktop: fila. */}
        {isNegocio && (
          <TabsList className="grid grid-cols-2 gap-1.5 lg:flex lg:flex-wrap w-full lg:w-fit !h-auto">
            <TabsTrigger value="business" className="w-full lg:w-auto py-1.5">Datos</TabsTrigger>
            <TabsTrigger value="cobros" className="w-full lg:w-auto py-1.5">Cobros</TabsTrigger>
            <TabsTrigger value="integraciones" className="w-full lg:w-auto py-1.5">Integraciones</TabsTrigger>
            <TabsTrigger value="notificaciones" className="w-full lg:w-auto py-1.5">Notificaciones/Mail</TabsTrigger>
          </TabsList>
        )}
        {/* TabsList de Configuración reducido a 3 (NAV-02): Cobros/Integraciones/Notificaciones se
            movieron al hub Negocio de arriba. */}
        {!isSection && (
          <TabsList className="grid grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap w-full lg:w-fit h-auto">
            <TabsTrigger value="appearance">Apariencia</TabsTrigger>
            <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
            <TabsTrigger value="suscripcion">Suscripción</TabsTrigger>
          </TabsList>
        )}

        {/* ── Apariencia ── */}
        <TabsContent value="appearance" className="mt-4">
          <Card className="p-6 space-y-6">
            {/* Estilo visual (theme) */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Estilo visual</p>
                <p className="text-xs text-muted-foreground">Cambiá la personalidad completa del panel y tu página: tipografías, colores y detalles.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {THEMES.map(t => {
                  const active = vtheme === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTheme(t.id)}
                      aria-pressed={active}
                      className={cn(
                        'overflow-hidden rounded-lg border-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <span className="relative flex h-[68px] items-end gap-1.5 p-3" style={{ background: t.bg }}>
                        <span className="absolute left-3 top-2.5 text-sm font-extrabold" style={{ color: t.fg }}>Aa</span>
                        {t.chips.map((c, i) => (
                          <span key={i} className="h-6 flex-1 rounded" style={{ background: c, opacity: 1 - i * 0.18, boxShadow: t.glow ? `0 0 10px ${c}` : undefined }} />
                        ))}
                      </span>
                      <span className="flex items-center gap-2 p-2.5">
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold truncate">{t.name}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">{t.meta}</span>
                        </span>
                        {active && (
                          <span className="ml-auto flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Paleta de color (depende del theme activo) */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Paleta de color</p>
                <p className="text-xs text-muted-foreground">Define el color principal de tu panel y tu página pública de reservas.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {themePalettes.map(p => {
                  const active = palette === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectPalette(p.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col gap-2.5 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <span className="flex h-10 w-full overflow-hidden rounded-md border border-border/50">
                        {p.swatches.map((c, i) => <span key={i} className="flex-1" style={{ backgroundColor: c, boxShadow: p.glow ? `inset 0 0 8px ${c}` : undefined }} />)}
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.meta}</p>
                        </div>
                        {active && (
                          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Tipografía */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Tipografía</p>
                <p className="text-xs text-muted-foreground">Elegí el carácter de las letras. «Automática» usa la fuente nativa de cada estilo.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {FONTS.map(f => {
                  const active = font === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => selectFont(f.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'
                      )}
                    >
                      <span className="flex-shrink-0 w-10 h-10 rounded-md bg-secondary flex items-center justify-center text-xl font-bold leading-none" style={{ fontFamily: f.css }}>Aa</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold truncate">{f.name}</span>
                        <span className="block text-[10px] text-muted-foreground truncate">{f.meta}</span>
                      </span>
                      {active && (
                        <span className="ml-auto flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator />

            {/* Tema claro / oscuro */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold text-sm">Tema</p>
                <p className="text-xs text-muted-foreground">Se guarda en este dispositivo.</p>
              </div>
              <div className="inline-flex rounded-lg border border-border p-1 bg-secondary/30">
                {([
                  { key: 'light', label: 'Claro', icon: Sun },
                  { key: 'dark', label: 'Oscuro', icon: Moon },
                ] as const).map(opt => {
                  const Icon = opt.icon
                  // Hasta montar, next-themes no conoce el tema → evitamos marcar activo (hydration).
                  const active = mounted && theme === opt.key
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setTheme(opt.key)}
                      aria-pressed={active}
                      className={cn(
                        'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4" /> {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* ── Panel del dashboard (widgets) ── */}
          <Card className="p-6 space-y-3 mt-4">
            <div>
              <p className="font-semibold text-sm">Panel del dashboard</p>
              <p className="text-xs text-muted-foreground">Elegí qué widgets ver en tu panel principal.</p>
            </div>
            <div className="space-y-2">
              {DASHBOARD_WIDGETS.map(w => (
                <label key={w.id} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={widgetSelection.includes(w.id)} onChange={() => toggleWidget(w.id)}
                    className="w-4 h-4 accent-primary cursor-pointer mt-0.5" />
                  <span>
                    <span className="text-sm">{w.label}</span>
                    <span className="block text-xs text-muted-foreground">{w.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <Button size="sm" className="self-start" onClick={saveWidgets} disabled={savingWidgets}>{savingWidgets ? 'Guardando...' : 'Guardar panel'}</Button>
          </Card>
        </TabsContent>

        {/* ── Business ── */}
        <TabsContent value="business" className="mt-4">
          <Card className="p-6 space-y-5">
            {/* Logo */}
            <div className="space-y-3">
              <Label>Logo del negocio</Label>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {(logoPreview || currentLogo) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoPreview || currentLogo!}
                      alt="Logo"
                      className="w-20 h-20 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                      {bizForm.name ? (
                        <span className="text-2xl font-bold text-primary">{bizForm.name.charAt(0).toUpperCase()}</span>
                      ) : (
                        <ImageIcon className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={handleLogoSelect}
                  />
                  {logoPreview ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={uploadLogo} disabled={uploadingLogo}>
                        {uploadingLogo ? 'Subiendo...' : 'Guardar logo'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setLogoPreview(null); setLogoFile(null) }}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                        {currentLogo ? 'Cambiar logo' : 'Subir logo'}
                      </Button>
                      {currentLogo && (
                        <Button size="sm" variant="outline" className="text-red-400 border-red-500/30" onClick={deleteLogo}>
                          Eliminar
                        </Button>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">JPG, PNG o WebP · Máximo 2MB</p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nombre del negocio</Label>
                <Input value={bizForm.name} onChange={e => setBizForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Rubro</Label>
                <Select value={vertical} onValueChange={v => setVertical(v as VerticalKey)}>
                  {/* Base UI Select.Value muestra el value crudo (la VerticalKey); mapeamos a su label. */}
                  <SelectTrigger className="w-full"><SelectValue>{(v: string | null) => (v && v in VERTICALS ? VERTICALS[v as VerticalKey].label : 'Elegí tu rubro')}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(VERTICALS) as VerticalKey[]).map(k => (
                      <SelectItem key={k} value={k}>{VERTICALS[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground pt-0.5">
                  Rubro: <span className="text-foreground">{VERTICALS[vertical].label}</span>
                  {' · '}define el menú y los campos del panel.
                </p>
                <Label className="pt-2">¿A qué se dedica tu negocio?</Label>
                <Input
                  value={bizForm.type}
                  onChange={e => setBizForm(f => ({ ...f, type: e.target.value }))}
                  placeholder={RUBRO_PLACEHOLDERS[vertical]}
                />
                <p className="text-xs text-muted-foreground">Así aparecerá en tu página de reservas</p>
              </div>
              <div className="space-y-1">
                <Label>WhatsApp</Label>
                <Input value={bizForm.whatsapp} onChange={e => setBizForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+54 9 11 1234-5678" />
                <p className="text-xs text-muted-foreground">Con código de país, ej. +54 9 11 1234-5678. Se usa para el botón de WhatsApp en los emails.</p>
              </div>
              <div className="space-y-1">
                <Label>Instagram</Label>
                <Input value={bizForm.instagram} onChange={e => setBizForm(f => ({ ...f, instagram: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Dirección</Label>
                <Input value={bizForm.address} onChange={e => setBizForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Link de Google Maps <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input
                  value={bizForm.maps_url}
                  onChange={e => setBizForm(f => ({ ...f, maps_url: e.target.value }))}
                  placeholder="https://maps.app.goo.gl/…"
                />
                <p className="text-xs text-muted-foreground pt-0.5">
                  Si lo pegás, los botones “Ver en el mapa” y “Cómo llegar” de la confirmación llevan exactamente a tu local. En Google Maps: buscá tu local → Compartir → Copiar vínculo.
                </p>
              </div>
            </div>
            <div className="pt-2">
              <Label className="text-muted-foreground text-xs">URL de tu página</Label>
              <p className="text-sm mt-1">{process.env.NEXT_PUBLIC_APP_URL}/{business.slug}</p>
            </div>
            <Button className="self-start" onClick={saveBusiness} disabled={savingBiz}>{savingBiz ? 'Guardando...' : 'Guardar cambios'}</Button>
          </Card>
        </TabsContent>

        {/* ── Services ── */}
        <TabsContent value="services" className="mt-4">
          {isCanchas ? (
            /* Vertical canchas (D-03): manager de canchas en lugar del CRUD genérico de services.
               Consume lib/canchas.ts (Plan 01) y comparte el estado de services/professionals/
               spaces/agendaSpaces para reconstruir la lista por service_id. */
            <CanchasManager
              business={business}
              supabase={supabase}
              services={services}
              setServices={setServices}
              professionals={professionals}
              setProfessionals={setProfessionals}
              spaces={spaces}
              setSpaces={setSpaces}
              agendaSpaces={agendaSpaces}
              setAgendaSpaces={setAgendaSpaces}
            />
          ) : (
          <>
          <Card className="p-6 space-y-4">
            {/* Píldoras de filtro (D-14), desde el módulo compartido (D-13): el mismo componente lo
                usa el manager de canchas, así que las dos pantallas no pueden divergir. */}
            <ActiveTabs tab={serviceTab} onChange={setServiceTab} counts={serviceTabCounts} />
            {visibleServices.length === 0 ? (
              <ActiveTabsEmptyState
                tab={serviceTab}
                icon={Clock}
                activos={{
                  title: 'Todavía no tenés servicios activos',
                  help: 'Agregá el primero acá abajo para empezar a recibir reservas.',
                }}
                desactivados={{
                  title: 'No hay servicios desactivados',
                  help: 'Acá van a aparecer los que dejes de ofrecer: se conservan con todo su historial y los podés volver a activar cuando quieras.',
                }}
              />
            ) : (
            <div className="space-y-2">
              {visibleServices.map(s => {
                const set = serviceLocSet(s)
                const all = set.length === 0
                // Bloque B — cobertura por servicio (STAFF, D-08). Solo lectura. Gates: ya estamos en
                // la rama !isCanchas (D-18: única defensa, /servicios no redirige por vertical) + ≥2
                // profesionales ACTIVOS (derivado de D-07). La lista y el booleano salen del helper puro
                // (@/lib/staff-services): PROHIBIDO reimplementar la regla del comodín acá.
                const activePros = professionals.filter(p => p.active)
                const showCoverage = activePros.length >= 2
                const coverageNames = showCoverage
                  ? professionalsForService(s.id, activePros, professionalServices).map(p => [p.name, p.last_name].filter(Boolean).join(' '))
                  : []
                const covered = showCoverage ? isServiceCovered(s.id, activePros, professionalServices) : true
                // Mismo fallback que openEditService: cubre filas viejas que quedaron en memoria sin el
                // modo resuelto (el DEFAULT de la migr. 068 ya las cubre en la DB).
                const capMode: CapacityMode = s.capacity_mode ?? 'individual'
                // El rótulo del modo lo resuelve la TARJETA y lo renderiza inline en su línea de datos.
                // Antes lo resolvía el control; se mudó junto con el label, sin cambiar el cálculo:
                // CAPACITY_MODE_HELP sigue siendo la única fuente de los rótulos (D-03).
                const capacityModeLabel = CAPACITY_MODE_HELP.find(h => h.key === capMode)?.label ?? ''
                return (
                  <div key={s.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
                    {/* Fila A — nombre y acciones. Hasta acá las acciones y el dato peleaban el mismo
                        renglón: a 375px el interior de la tarjeta mide 271px, las tres acciones se
                        comían ~186 y a la columna del texto le quedaban ~85 contra los 146 que mide el
                        stepper. Eran 61px de desborde REAL, no una ilusión óptica (G-02). Al agrupar
                        las acciones y sacarles la línea de datos de al lado, el dato se lleva los 271px
                        enteros y el nombre pasa de ~85 a ~105px de ancho útil.

                        El precedente es la fila mobile de Finanzas (POLISH-10): la única de las tres
                        superficies de esta fase que pasó la UAT sin un solo issue, y la única donde el
                        dato nuevo bajó a su propia línea en vez de pedirle ancho al que ya estaba.

                        El centrado vertical se CONSERVA a propósito: sin la línea de datos adentro,
                        esta fila vuelve a ser un renglón corto. Alinear arriba movería las tarjetas de
                        los servicios individuales, que son el 100 % de producción hoy y no tienen
                        ningún defecto. */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* Sin tachado: en el tab "Desactivados" todos lo están, es ruido visual (D-14). */}
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          {showCoverage && !covered && (
                            <span className="inline-flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded-full border border-warning/30 bg-warning/10 text-warning text-[11px] font-medium">
                              <TriangleAlert aria-hidden="true" className="w-3 h-3" />
                              Sin cobertura
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Las tres acciones, agrupadas en un solo item: recuperan ancho achicando los
                          huecos entre ellas en vez de robárselo al nombre. Por dentro no cambia una
                          sola clase de los botones. */}
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => toggleService(s.id, !s.active)}>
                          {s.active ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8" onClick={() => openEditService(s)} aria-label={`Editar ${s.name}`}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => openDeleteService(s)} aria-label={`Eliminar ${s.name}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Línea de DATOS de la tarjeta (D-07). El modo de cupo entra acá como TERCER
                        dato —mismo registro que duración y precio—, y no como pill junto al nombre:
                        las pills de arriba están reservadas para advertencias (la de cobertura) y
                        mezclar los dos registros le sube el volumen a un dato normal. Por eso la
                        pill de alarma NO se toca acá: sigue en el bloque del nombre. Es la primera
                        "mejora" que va a proponer el próximo que lea esto; la respuesta es no.

                        El contenedor pasa de <p> a flex-wrap, pero la duración y el precio siguen
                        siendo UN solo nodo de texto: así la línea de un servicio `individual` —que es
                        el 100 % de producción hoy— se ve exactamente igual que antes. Sin badge, el
                        badge se vuelve señal.

                        POR QUÉ EL CONTROL DEL CUPO YA NO VIVE ACÁ ADENTRO (G-04). Esta línea es texto
                        inerte y el control tiene botones de 44px. Los navegadores móviles corrigen el
                        punto de toque hacia el elemento interactivo más cercano cuando el dedo no
                        aterrizó en ninguno, así que texto inerte y botón no pueden ser vecinos: con el
                        control adentro, a 4px de este renglón, tocar la duración bajaba el cupo y tocar
                        el modo lo subía. Ahora el control es HERMANO de esta línea y se lleva 32px de
                        zona de exclusión (24 de padding propio + 8 del ritmo de la tarjeta). Meterlo de
                        vuelta acá adentro reabre el defecto entero. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{s.duration_minutes}min · ${Number(s.price).toLocaleString('es-AR')}</span>
                      {capMode !== 'individual' && (
                        <>
                          {/* El separador no puede leerse en voz alta: ya hay uno en el nodo de
                              arriba y el lector de pantalla repetiría "punto medio" dos veces. Viaja
                              junto al label dentro del MISMO condicional: así nunca queda colgando
                              solo en una tarjeta individual (R2-1). */}
                          <span aria-hidden="true">·</span>
                          {/* TERCER dato de la línea (D-07): un span de texto, sin manejador de click,
                              sin rol y sin índice de tabulación (D-09). Desde la tarjeta se cambia el
                              NÚMERO, nunca el MODO. */}
                          <span className="font-medium text-foreground">{capacityModeLabel}</span>
                        </>
                      )}
                    </div>
                    {capMode !== 'individual' && (
                      <CapacityInlineControl
                        service={s}
                        saving={savingCapacityIds.has(s.id)}
                        onSave={c => saveCapacityInline(s, c)}
                      />
                    )}
                    {activeLocations.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground mr-0.5">Se ofrece en:</span>
                        <button type="button" onClick={() => setServiceLocations(s.id, [])} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', all ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>Todos</button>
                        {activeLocations.map(l => (
                          <button key={l.id} type="button" onClick={() => toggleServiceLocation(s, l.id)} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', !all && set.includes(l.id) ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>{l.name}</button>
                        ))}
                      </div>
                    )}
                    {/* Cobertura (STAFF, D-08): quiénes lo hacen, o aviso persistente si nadie. Texto
                        plano (solo lectura, sin pills). El copy NO afirma que sin cobertura "no se puede
                        reservar": en esta fase el mapeo todavía no afecta la reserva pública. */}
                    {showCoverage && (
                      covered ? (
                        <p className="text-[11px] text-muted-foreground">Lo hacen: <span className="text-foreground">{coverageNames.join(' · ')}</span></p>
                      ) : (
                        <p role="status" className="flex items-center gap-2 text-xs font-medium text-warning">
                          <TriangleAlert aria-hidden="true" className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>Nadie lo ofrece — asignalo en <Link href="/equipo" className="underline underline-offset-2">Equipo</Link></span>
                        </p>
                      )
                    )}
                  </div>
                )
              })}
            </div>
            )}
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium">Agregar servicio</p>
              {/* El `+` que confirmaba el alta se fue de acá (CUPO-09): estaba en col-span-1, o sea el
                  submit vivía EN EL MEDIO del formulario, antes del modo de cupo y de las sedes. Ahora
                  la fila es solo campos y las tres columnas se reparten los 12: en mobile cada campo
                  ocupa su propia fila; en desktop la fila queda igual de compacta que antes. */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-6 space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre</Label>
                  <Input value={newService.name} onChange={e => setNewService(f => ({ ...f, name: e.target.value }))} placeholder="Nombre" />
                </div>
                <div className="col-span-12 sm:col-span-3 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Min.</Label>
                  <Input type="number" value={newService.duration_minutes} onChange={e => setNewService(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))} min={5} step={5} />
                </div>
                <div className="col-span-12 sm:col-span-3 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Precio</Label>
                  <Input type="number" value={newService.price} onFocus={e => e.target.select()} onChange={e => setNewService(f => ({ ...f, price: parseFloat(e.target.value) }))} min={0} step={100} />
                </div>
              </div>
              <CapacityModeFields
                value={newService.capacity_mode}
                capacity={newService.capacity}
                onChange={patch => setNewService(f => ({ ...f, ...patch }))}
                sharedCapacityBlocked={spacesBlockSharedCapacity(null, activeProfessionals, professionalServices, agendaSpaces)}
              />
              {activeLocations.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Se ofrece en</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setNewService(f => ({ ...f, location_ids: [] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', newService.location_ids.length === 0 ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>Todos</button>
                    {activeLocations.map(l => {
                      const on = newService.location_ids.includes(l.id)
                      return (
                        <button key={l.id} type="button" onClick={() => setNewService(f => ({ ...f, location_ids: on ? f.location_ids.filter(x => x !== l.id) : [...f.location_ids, l.id] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>{l.name}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              {/* La confirmación del alta, al FINAL del bloque: después del modo de cupo y de las sedes,
                  o sea después de todo lo que el dueño tiene que decidir. La etiqueta es "Agregar
                  servicio" (verbo + sustantivo, regla de microcopy del proyecto) y no un "Guardar"
                  pelado: así no compite con el "Guardar" del diálogo de edición, que es OTRA operación.
                  El bloque vive en la página y no en un diálogo, así que el botón está siempre visible.
                  El `.trim()` del disabled es para que un nombre de solo espacios tampoco lo habilite. */}
              <Button onClick={addService} disabled={!newService.name.trim() || savingNewSvc} className="w-full sm:w-auto min-h-11 sm:min-h-0">
                <Plus className="w-4 h-4" /> {savingNewSvc ? 'Agregando…' : 'Agregar servicio'}
              </Button>
            </div>
          </Card>

          {/* Editar servicio (reusa el form de alta: nombre, min, precio, consultorios).
              Los chips espejan el alta; usa el cliente browser directo (sin server actions). */}
          <Dialog open={!!editSvc} onOpenChange={open => { if (!open) setEditSvc(null) }}>
            {/* Scroll interno + pie anclado (D-05 / UI-SPEC §3.1). El patrón se aplica ACÁ, por caller,
                y NO en components/ui/dialog.tsx: así los ~15 diálogos restantes del panel quedan
                byte-idénticos. Las cuatro piezas son solidarias — cualquiera sola no alcanza:
                · max-h con `svh` (no `vh`): en mobile la barra de URL no se come el borde del popup.
                  El -2rem deja 16px de backdrop arriba y abajo (el popup está centrado con -translate-y-1/2).
                · las tres filas del grid: el DialogContent YA es grid; el minmax(0,1fr) del medio es
                  lo único que permite que la fila del medio encoja por debajo de su contenido.
                · gap-0: el gap-4 del componente dejaba flotando al pie (que ya trae -mb-4) a 16px
                  del fondo. El espaciado se recupera con el pb-3 del header y el mt-4 del footer.
                · pr-8 en el header: el botón X es `absolute top-2 right-2` y el título no puede pasarle
                  por abajo.
                Sin sombra ni fade en los bordes: es decisión escrita (UI-SPEC §3.2), no omisión — abajo
                la frontera ya la marcan el border-t + bg-muted/50 del pie, y un fade condicional
                exigiría medir en JS o usar scroll-timeline, que este repo no usa en ningún lado.
                Alcance de esta fase: SOLO este diálogo. "Copiar horario" (agenda-client.tsx:1130) y el
                roster de desktop (agenda-client.tsx:1110) son los próximos candidatos al mismo patrón y
                quedan anotados, no tocados (UI-SPEC §3.3). */}
            <DialogContent className="grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-sm">
              <DialogHeader className="pb-3 pr-8">
                <DialogTitle>Editar servicio</DialogTitle>
              </DialogHeader>
              {/* La fila del medio es la ÚNICA que scrollea: el título queda fijo (contexto de qué estás
                  editando) y el pie queda fijo (la salida). min-h-0 es obligatorio — sin él un hijo de
                  grid no encoge y el overflow-y-auto nunca se activa. El sangrado -mx-4 px-4 hace que el
                  área scrolleable llegue al borde del diálogo, así el scrollbar y los anillos de foco no
                  quedan recortados por el padding. El overscroll contenido evita que llegar al final arrastre
                  el scroll de la página de atrás. */}
              <div className="-mx-4 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-1">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre</Label>
                  <Input value={editSvcForm.name} onChange={e => setEditSvcForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Min.</Label>
                    <Input type="number" value={editSvcForm.duration_minutes} onChange={e => setEditSvcForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))} min={5} step={5} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Precio</Label>
                    <Input type="number" value={editSvcForm.price} onFocus={e => e.target.select()} onChange={e => setEditSvcForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} min={0} step={100} />
                  </div>
                </div>
                <CapacityModeFields
                  value={editSvcForm.capacity_mode}
                  capacity={editSvcForm.capacity}
                  onChange={patch => setEditSvcForm(f => ({ ...f, ...patch }))}
                  disabled={savingEditSvc}
                  sharedCapacityBlocked={spacesBlockSharedCapacity(editSvc?.id ?? null, activeProfessionals, professionalServices, agendaSpaces)}
                />
                {activeLocations.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> Se ofrece en</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => setEditSvcForm(f => ({ ...f, location_ids: [] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', editSvcForm.location_ids.length === 0 ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>Todos</button>
                      {activeLocations.map(l => {
                        const on = editSvcForm.location_ids.includes(l.id)
                        return (
                          <button key={l.id} type="button" onClick={() => setEditSvcForm(f => ({ ...f, location_ids: on ? f.location_ids.filter(x => x !== l.id) : [...f.location_ids, l.id] }))} className={cn('text-[11px] font-semibold py-1 px-2 rounded transition-colors', on ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground border border-border')}>{l.name}</button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
              {/* El Guardar deja de ser el último hijo suelto del DialogContent (que crecía con el
                  formulario y a 375×667 se iba fuera del viewport) y pasa a la tercera fila `auto` del
                  grid: el pie ya trae -mx-4 -mb-4 + border-t + bg-muted/50, o sea sangra a los
                  bordes y marca la frontera solo. Sigue siendo un hijo del popup, así que el focus trap
                  y el orden de tabulación quedan intactos. min-h-11 sm:min-h-0 = target táctil de 44px
                  en mobile sin engordar el desktop. */}
              <DialogFooter className="mt-4">
                <Button onClick={saveEditService} disabled={savingEditSvc || !editSvcForm.name.trim()} className="min-h-11 w-full sm:min-h-0 sm:w-auto">{savingEditSvc ? 'Guardando...' : 'Guardar'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
          )}
        </TabsContent>

        {/* ── Professionals ── */}
        <TabsContent value="professionals" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Profesionales del equipo</p>
              <span className="text-xs bg-secondary px-2 py-1 rounded-full text-muted-foreground">
                {planConfig.name} · {professionals.filter(p => p.active).length}/{planConfig.max_agendas}
              </span>
            </div>
            <div className="space-y-2">
              {professionals.map(p => {
                const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
                const sub = [p.specialty, p.license_number].filter(Boolean).join(' · ')
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    {p.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo_url} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{fullName}</p>
                      {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                    </div>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8" onClick={() => openEditPro(p)} aria-label={`Editar ${fullName}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => deleteProfessional(p.id)} aria-label={`Eliminar ${fullName}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
            {!canAddPro ? (
              <div className="border-t border-border pt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Límite del plan alcanzado · Upgrade para agregar más</span>
                <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">Ver planes →</a>
              </div>
            ) : (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium">Agregar profesional</p>
                <div className="flex items-center gap-3">
                  {newProPhotoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={newProPhotoPreview} alt="" className="w-12 h-12 rounded-full object-cover border border-border flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <label className="inline-flex items-center h-7 px-2.5 rounded-md border border-border text-xs font-medium cursor-pointer hover:border-primary hover:text-primary transition-colors">
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) selectNewProPhoto(f); e.target.value = '' }} />
                    {newProPhoto ? 'Cambiar foto' : 'Foto (opcional)'}
                  </label>
                  {newProPhoto && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearNewProPhoto}>Quitar</Button>
                  )}
                </div>
                <ProFields value={newPro} onChange={setNewPro} labels={proLabels} />
                <Button onClick={addProfessional} disabled={savingPro || !newPro.name.trim()} className="gap-1">
                  <Plus className="w-4 h-4" /> {savingPro ? 'Agregando...' : 'Agregar'}
                </Button>
              </div>
            )}
          </Card>

          {/* ── Bloque A: qué servicios hace cada profesional (STAFF, D-05/D-06) ──
               Editor de chips optimista (view=equipo). Gates en orden (UI-SPEC): (1) NO canchas
               (D-18, defensa en profundidad — /equipo ya redirige canchas antes de las queries),
               (2) ≥2 profesionales ACTIVOS (D-07), (3) sin servicios → header + línea guía. Lista
               solo profesionales activos; los chips = todos los services en orden created_at. El copy
               evita el artículo antes de term.services (regla de género del UI-SPEC). */}
          {!isCanchas && professionals.filter(p => p.active).length >= 2 && (
            <Card className="p-6 space-y-4 mt-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Qué {term.services.toLowerCase()} hace cada {resourceWord.toLowerCase()}</p>
                <p className="text-xs text-muted-foreground">
                  Marcá qué hace cada {resourceWord.toLowerCase()}. Si no marcás nada, se ofrece para todo.
                </p>
              </div>
              {services.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Primero agregá {term.services.toLowerCase()} en Servicios; después vas a poder marcar
                  qué hace cada {resourceWord.toLowerCase()}.
                </p>
              ) : (
                <div className="space-y-2">
                  {professionals.filter(p => p.active).map(p => {
                    const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
                    // Comodín (D-01): 0 filas = hace todo. Se consume la misma noción del helper.
                    const isWildcard = !professionalServices.some(r => r.professional_id === p.id)
                    return (
                      <div key={p.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
                        {/* Nombre + "Hace todo" inline: el estado comodín va en la MISMA línea del
                            nombre (no una fila aparte) para que aparecer/desaparecer al marcar el
                            primer chip NO cambie el alto de la tarjeta (evita el layout shift). */}
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-medium truncate min-w-0">{fullName}</p>
                          {isWildcard && <span className="shrink-0 text-[11px] font-normal text-muted-foreground">Hace todo</span>}
                        </div>
                        <div role="group" aria-label={`${term.services} de ${fullName}`} className="flex flex-wrap gap-2">
                          {services.map(s => {
                            const checked = isServiceMapped(p.id, s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleProfessionalService(p.id, s.id)}
                                aria-pressed={checked}
                                className={cn(
                                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  checked
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary hover:text-primary',
                                )}
                              >
                                {checked && <Check aria-hidden="true" className="w-3.5 h-3.5" />}
                                {s.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )}

          {/* Selección de profesional en el booking público (EXTRA-B). Vive en Equipo, arriba de
              Espacios, porque define cómo se ofrecen los profesionales en la reserva pública. */}
          <Card className="p-6 space-y-4 mt-4">
            <div>
              <p className="font-semibold text-sm">Al reservar, ¿preseleccionar “Cualquiera”?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cuando un servicio tiene 2 o más profesionales, elegí cómo se muestra el paso de profesional en tu página de reservas.</p>
            </div>
            {/* D-02 + UAT 14-09 punto 5. El recuadro es hijo directo de <Card>, que es flex-column:
                su `align-items: stretch` blockifica el ítem y lo estira a todo el ancho de la tarjeta
                aunque el recuadro se declare en línea. El fix vive en el call-site porque tocar
                components/ui/card.tsx cambiaría el layout de toda la app. Este control quedó fuera del
                inventario que auditó 14-01 (gap 2 de 14-VERIFICATION.md).

                Mobile-first, que es la decisión del dueño tras verlo ("Desktop, ancho de contenido.
                Movil no se ve muy lindo, queda ancho completo" → "ancho completo, pero prolijo"):
                debajo de sm el recuadro ocupa la tarjeta y las dos opciones se apilan estirándose a
                todo su ancho, o sea un segmentado deliberado en vez de un recuadro estirado por
                accidente; desde sm se desestira (self-start) y vuelve exactamente al estado de
                desktop que el dueño ya aprobó: en línea y al ancho de su contenido.

                Debajo de sm cada opción declara además la altura mínima táctil (44px), porque apiladas
                quedaban en 32px y el mínimo de touch target es 44×44. Se copia la forma del grupo
                gemelo de CapacityModeFields, que ya la usa; desde sm se libera para no mover el
                desktop, que el dueño ya aprobó.

                El grupo gemelo de CapacityModeFields NO cambia: su padre es un contenedor de bloque y
                nada lo estira. */}
            <div role="radiogroup" aria-label="Preselección del profesional" className="flex w-full flex-col gap-1 rounded-md border border-border p-1 sm:inline-flex sm:w-auto sm:flex-row sm:flex-wrap sm:self-start">
              <button
                type="button"
                role="radio"
                aria-checked={selectorDefault === 'any'}
                disabled={savingSelector}
                onClick={() => saveSelectorDefault('any')}
                className={cn(
                  'min-h-11 sm:min-h-0 px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-60',
                  selectorDefault === 'any' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Sí, mostrar “Cualquiera” arriba
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={selectorDefault === 'choose'}
                disabled={savingSelector}
                onClick={() => saveSelectorDefault('choose')}
                className={cn(
                  'min-h-11 sm:min-h-0 px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-60',
                  selectorDefault === 'choose' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                No, que elijan un profesional
              </button>
            </div>
          </Card>

          {/* ── Espacios físicos + mapeo agenda→espacios (motor-reservas / espacio compartido) ──
               Vive dentro de la tab de Equipo (D-04, sin pantalla nueva). El alta de espacios y el
               mapeo escriben spaces/agenda_spaces por el browser client con RLS. El término del eje
               ('Cancha'/'Profesional') se nombra por rubro. */}
          <Card className="p-6 space-y-4 mt-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Espacios físicos compartidos</p>
              <p className="text-xs text-muted-foreground">
                Un espacio físico es un lugar real que se comparte entre varias {resourcesWord.toLowerCase()}
                {' '}—una sala, un sector de cancha, un equipo—. Reservar en una bloquea a las demás que comparten
                ese espacio en el mismo horario. Ejemplo: una cancha de fútbol 11 partida en 3 cruzadas → creás
                3 espacios (A, B y C); la cancha grande ocupa los tres.
              </p>
            </div>

            {spaces.length > 0 && (
              <div className="space-y-2">
                {spaces.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <p className="flex-1 min-w-0 text-sm truncate">{s.name}</p>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => deleteSpace(s.id)} aria-label={`Eliminar espacio ${s.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium">Agregar espacio</p>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="new-space-name">Nombre del espacio</Label>
                  <Input
                    id="new-space-name"
                    value={newSpaceName}
                    onChange={e => setNewSpaceName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSpace() } }}
                    placeholder="Sala 1, Sector A, Equipo de pilates…"
                  />
                </div>
                <Button onClick={addSpace} disabled={savingSpace || !newSpaceName.trim()} className="gap-1">
                  <Plus className="w-4 h-4" /> {savingSpace ? 'Agregando...' : 'Agregar'}
                </Button>
              </div>
            </div>

            {/* Mapeo agenda→espacios: por cada agenda, qué espacios ocupa (checkbox por espacio).
                Si todavía no hay agendas reales, mostramos una línea guía en vez de ocultar el bloque. */}
            {spaces.length > 0 && (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Qué espacios ocupa cada {resourceWord.toLowerCase()}</p>
                  <p className="text-xs text-muted-foreground">
                    Marcá los espacios que ocupa cada {resourceWord.toLowerCase()}; al reservarse bloquea a las
                    demás que compartan alguno.
                  </p>
                </div>
                {professionals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Primero agregá tus {resourcesWord.toLowerCase()} más arriba; después vas a poder marcar qué
                    espacios ocupa cada una.
                  </p>
                ) : (
                <div className="space-y-2">
                  {professionals.map(p => {
                    const fullName = [p.name, p.last_name].filter(Boolean).join(' ')
                    return (
                      <div key={p.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
                        <p className="text-sm font-medium truncate">{fullName}</p>
                        <div className="flex flex-wrap gap-2">
                          {spaces.map(s => {
                            const checked = isMapped(p.id, s.id)
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => toggleAgendaSpace(p.id, s.id)}
                                aria-pressed={checked}
                                className={cn(
                                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
                                  checked
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary hover:text-primary',
                                )}
                              >
                                {checked && <Check className="w-3.5 h-3.5" />}
                                {s.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ── Locations ── */}
        <TabsContent value="locations" className="mt-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{term.locations}</p>
              <span className="text-xs bg-secondary px-2 py-1 rounded-full text-muted-foreground">
                {planConfig.name} · {activeLocations.length}
              </span>
            </div>
            <div className="space-y-2">
              {locations.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Todavía no agregaste {term.locations.toLowerCase()}</p>
              )}
              {locations.map(loc => (
                <div key={loc.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', loc.is_active === false && 'line-through text-muted-foreground')}>{loc.name}</p>
                    {(loc.address || loc.phone) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[loc.address, loc.phone].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground flex-shrink-0" onClick={() => toggleLocation(loc.id, loc.is_active === false)}>
                    {loc.is_active === false ? 'Activar' : 'Desactivar'}
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8 flex-shrink-0" onClick={() => openEditLocation(loc)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8 flex-shrink-0" onClick={() => setDelLoc(loc)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            {!canAddLocation ? (
              <div className="border-t border-border pt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Límite del plan alcanzado · Upgrade para agregar más</span>
                <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer" className="text-primary text-xs hover:underline">Ver planes →</a>
              </div>
            ) : (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium">Agregar {locWord}</p>
                <div className="space-y-2">
                  <Input value={newLocation.name} onChange={e => setNewLocation(f => ({ ...f, name: e.target.value }))} placeholder="Nombre *" />
                  <Input value={newLocation.address} onChange={e => setNewLocation(f => ({ ...f, address: e.target.value }))} placeholder="Dirección (opcional)" />
                  <Input value={newLocation.phone} onChange={e => setNewLocation(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono (opcional)" />
                </div>
                <Button onClick={addLocation} disabled={savingLocation} className="gap-1">
                  <Plus className="w-4 h-4" /> {savingLocation ? 'Guardando...' : `Agregar ${locWord}`}
                </Button>
              </div>
            )}
          </Card>

          <Dialog open={!!editLoc} onOpenChange={open => { if (!open) setEditLoc(null) }}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Editar {locWord}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Input value={editLocForm.name} onChange={e => setEditLocForm(f => ({ ...f, name: e.target.value }))} placeholder="Nombre *" />
                <Input value={editLocForm.address} onChange={e => setEditLocForm(f => ({ ...f, address: e.target.value }))} placeholder="Dirección (opcional)" />
                <Input value={editLocForm.phone} onChange={e => setEditLocForm(f => ({ ...f, phone: e.target.value }))} placeholder="Teléfono (opcional)" />
              </div>
              <Button onClick={saveEditLocation} disabled={savingEditLoc}>{savingEditLoc ? 'Guardando...' : 'Guardar'}</Button>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ── Payments ── */}
        {/* ── Cobros (seña) ── */}
        <TabsContent value="cobros" className="mt-4 space-y-4">
          {/* Seña */}
          <Card className="p-6 space-y-4">
            <p className="font-semibold text-sm">Seña</p>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="require_deposit" checked={depositForm.require_deposit}
                onChange={e => setDepositForm(f => ({ ...f, require_deposit: e.target.checked }))} className="w-4 h-4 accent-primary cursor-pointer" />
              <Label htmlFor="require_deposit" className="cursor-pointer">Requerir seña para confirmar el turno</Label>
            </div>
            {depositForm.require_deposit && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Monto (ARS)</Label>
                  <Input type="text" inputMode="numeric"
                    value={depositForm.deposit_amount === 0 ? '' : String(depositForm.deposit_amount)}
                    onChange={e => { const raw = e.target.value.replace(/\D/g, ''); setDepositForm(f => ({ ...f, deposit_amount: raw === '' ? 0 : Number(raw) })) }}
                    placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Horas para pagar</Label>
                  <Input type="number" min={1} value={depositForm.deposit_expiry_hours}
                    onChange={e => setDepositForm(f => ({ ...f, deposit_expiry_hours: parseInt(e.target.value) || 1 }))} />
                </div>
              </div>
            )}
            {/* self-start (D-02): el botón no declara ancho, pero <Card> es flex-column y `align-items: stretch` lo estiraba a todo lo ancho; el fix vive en el call-site porque tocar components/ui/card.tsx cambiaría el layout de toda la app. */}
            <Button className="self-start" onClick={saveDeposit} disabled={savingDeposit}>{savingDeposit ? 'Guardando...' : 'Guardar'}</Button>
          </Card>

          {/* Limpieza de reservas con seña vencida */}
          <Card className="p-6 space-y-3">
            <div>
              <p className="font-semibold text-sm">Reservas con seña vencida</p>
              <p className="text-xs text-muted-foreground mt-0.5">Cancela las reservas cuya seña no se pagó a tiempo y libera esos horarios. Se hace solo una vez por día; podés forzarlo acá.</p>
            </div>
            <Button variant="outline" className="self-start" onClick={cleanupExpired} disabled={cleaningUp}>
              {cleaningUp ? 'Limpiando...' : 'Liberar horarios vencidos'}
            </Button>
          </Card>
        </TabsContent>

        {/* ── Integraciones (MercadoPago) ── */}
        <TabsContent value="integraciones" className="mt-4 space-y-4">
          {/* MercadoPago */}
          <Card className="p-6 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                {/* Chip blanco: el isotipo oficial (aro azul marino) está pensado para fondo claro;
                    sobre la card oscura el navy se funde. El tile lo hace rendir con sus colores reales. */}
                <span className="inline-flex items-center justify-center rounded-md bg-white size-6 shrink-0">
                  <MpLogo className="h-4 w-auto" />
                </span>
                <p className="font-semibold text-sm">MercadoPago</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Conectá tu cuenta para cobrar las señas de los turnos.</p>
            </div>

            {mpConnectEnabled && (
              mpConnected ? (
                // Estado sano (D-09): "Conectado" limpio, sin el número de cuenta.
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> Conectado
                  </p>
                  <Button variant="outline" size="sm" onClick={disconnectMp} disabled={disconnectingMp}>
                    {disconnectingMp ? 'Desconectando...' : 'Desconectar'}
                  </Button>
                </div>
              ) : mpConnectionError ? (
                // Estado caído (D-02/03/04): aviso ámbar recuperable + Reconectar (reusa el OAuth existente).
                <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 space-y-3">
                  <p className="text-sm font-medium text-warning flex items-start gap-2">
                    <TriangleAlert aria-hidden="true" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    Tu conexión con MercadoPago se interrumpió, reconectá tu cuenta para seguir cobrando señas.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button onClick={() => { window.location.href = '/api/mercadopago/connect' }}>Reconectar</Button>
                    <Button variant="outline" size="sm" onClick={disconnectMp} disabled={disconnectingMp}>
                      {disconnectingMp ? 'Desconectando...' : 'Desconectar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="self-start" onClick={() => { window.location.href = '/api/mercadopago/connect' }}>
                  <span className="inline-flex items-center justify-center rounded bg-white p-0.5">
                    <MpLogo className="h-3.5 w-auto" />
                  </span>
                  Conectar con MercadoPago
                </Button>
              )
            )}

            {/* Pegar el Access Token a mano (avanzado / fallback si no usás Connect) */}
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={mpManual} onChange={e => setMpManual(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Pegar el Access Token a mano <span className="text-muted-foreground text-xs">(avanzado)</span>
            </label>
            {mpManual && (
              <div className="space-y-3 border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">Lo encontrás en mercadopago.com.ar → Tu negocio → Credenciales.</p>
                <div className="space-y-1">
                  <Label>Access Token</Label>
                  <div className="relative">
                    <Input type={showMpToken ? 'text' : 'password'} value={mpToken} onChange={e => setMpToken(e.target.value)} placeholder="APP_USR-..." className="pr-10" />
                    <button type="button" onClick={() => setShowMpToken(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showMpToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Button onClick={saveMpToken} disabled={savingMp}>{savingMp ? 'Guardando...' : 'Guardar'}</Button>
              </div>
            )}
          </Card>

          {/* Google Calendar — misma conexión/estado que el control de la Agenda (endpoints /api/google/*).
              Conectar/desconectar/sincronizar acá refleja lo mismo que allá. */}
          {googleEnabled && (
            <Card className="p-6 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-md bg-white size-6 shrink-0">
                    <GoogleCalendarLogo className="h-4 w-auto" />
                  </span>
                  <p className="font-semibold text-sm">Google Calendar</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Sincronizá los turnos con tu Google Calendar. Es la misma conexión que ves en la Agenda.</p>
              </div>
              {googleConnected ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" /> Conectado
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={syncGoogle} disabled={syncingGoogle}>
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncingGoogle ? 'animate-spin' : ''}`} />
                      {syncingGoogle ? 'Sincronizando...' : 'Sincronizar'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={disconnectGoogle} disabled={disconnectingGoogle}>
                      {disconnectingGoogle ? 'Desconectando...' : 'Desconectar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button className="self-start" onClick={() => { window.location.href = '/api/google/connect?from=negocio' }}>
                  <CalendarClock className="w-4 h-4 mr-1.5" /> Conectar Google Calendar
                </Button>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── Notificaciones ── */}
        <TabsContent value="notificaciones" className="mt-4 space-y-4">
          {/* Notificaciones */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">Notificaciones por email</p>
              <p className="text-xs text-muted-foreground mt-0.5">Dónde recibís los avisos de turnos nuevos y cancelaciones. Los emails salen desde Forjo Studio.</p>
            </div>
            <div className="space-y-1">
              <Label>Email para recibir notificaciones</Label>
              <Input type="email" value={notifForm.notification_email} onChange={e => setNotifForm(f => ({ ...f, notification_email: e.target.value }))} placeholder="vos@tudominio.com" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={ownDomain} onChange={e => setOwnDomain(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Enviar los emails desde mi propio dominio <span className="text-muted-foreground text-xs">(avanzado)</span>
            </label>
            {ownDomain && (
              <div className="space-y-4 border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">Creá tu cuenta gratis en resend.com, verificá tu dominio y pegá la API Key. Así los mails salen desde tu dominio en vez de Forjo Studio.</p>
                <div className="space-y-1">
                  <Label>API Key de Resend</Label>
                  <div className="relative">
                    <Input type={showResendKey ? 'text' : 'password'} value={notifForm.resend_api_key} onChange={e => setNotifForm(f => ({ ...f, resend_api_key: e.target.value }))} placeholder="re_..." className="pr-10" />
                    <button type="button" onClick={() => setShowResendKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showResendKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Email remitente</Label>
                  <Input type="email" value={notifForm.resend_from} onChange={e => setNotifForm(f => ({ ...f, resend_from: e.target.value }))} placeholder="turnos@tudominio.com" />
                  <p className="text-xs text-muted-foreground">Debe ser de un dominio verificado en tu cuenta de Resend.</p>
                </div>
              </div>
            )}
            <Button className="self-start" onClick={saveNotif} disabled={savingNotif}>{savingNotif ? 'Guardando...' : 'Guardar'}</Button>
          </Card>
        </TabsContent>

        {/* ── Seguridad (anti-spam) ── */}
        <TabsContent value="seguridad" className="mt-4 space-y-4">
          {/* Anti-spam */}
          <Card className="p-6 space-y-4">
            <div>
              <p className="font-semibold text-sm">Verificación anti-spam</p>
              <p className="text-xs text-muted-foreground mt-0.5">Tus reservas ya están protegidas con reCAPTCHA por defecto. No tenés que configurar nada.</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={ownRecaptcha} onChange={e => setOwnRecaptcha(e.target.checked)} className="h-4 w-4 rounded border-border" />
              Usar mi propia cuenta de reCAPTCHA <span className="text-muted-foreground text-xs">(avanzado)</span>
            </label>
            {ownRecaptcha && (
              <div className="space-y-4 border-l-2 border-border pl-4">
                <p className="text-xs text-muted-foreground">Creá tu cuenta en google.com/recaptcha → v3 → tu dominio.</p>
                <div className="space-y-1">
                  <Label>reCAPTCHA Site Key</Label>
                  <Input value={recaptchaForm.recaptcha_site_key} onChange={e => setRecaptchaForm(f => ({ ...f, recaptcha_site_key: e.target.value }))} placeholder="6Le..." />
                </div>
                <div className="space-y-1">
                  <Label>reCAPTCHA Secret Key</Label>
                  <div className="relative">
                    <Input type={showRecaptchaSecret ? 'text' : 'password'} value={recaptchaForm.recaptcha_secret_key} onChange={e => setRecaptchaForm(f => ({ ...f, recaptcha_secret_key: e.target.value }))} placeholder="6Le..." className="pr-10" />
                    <button type="button" onClick={() => setShowRecaptchaSecret(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showRecaptchaSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <Button className="self-start" onClick={saveRecaptcha} disabled={savingRecaptcha}>{savingRecaptcha ? 'Guardando...' : 'Guardar'}</Button>
          </Card>
        </TabsContent>

        {/* ── Suscripción ── */}
        <TabsContent value="suscripcion" className="mt-4 space-y-4">
          {(business.plan_status === 'active' || business.plan_status === 'cancelled') ? (
            <Card className="p-6 space-y-4">
              <p className="font-semibold text-sm">Tu suscripción</p>
              <div className="text-sm space-y-1">
                <p>Plan actual: <span className="font-medium">{planConfig.name}</span></p>
                {business.subscription_ends_at && (
                  <p className="text-muted-foreground">
                    {business.plan_status === 'cancelled' ? 'Tu plan sigue activo hasta' : 'Próximo cobro'}:{' '}
                    {new Date(business.subscription_ends_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {business.plan_status === 'cancelled' && (
                  <p className="text-amber-400 text-xs">Suscripción cancelada — no se renovará automáticamente</p>
                )}
              </div>
              {business.plan_status === 'active' && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPlanModalOpen(true)}>Cambiar plan</Button>
                  <Button variant="outline" size="sm" className="text-red-400 border-red-500/30"
                    onClick={() => setConfirmCancelSub(true)}>Cancelar suscripción</Button>
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-6 space-y-3">
              <p className="font-semibold text-sm">Tu suscripción</p>
              <p className="text-sm text-muted-foreground">Plan actual: <span className="font-medium text-foreground">{planConfig.name}</span></p>
              <Button variant="outline" size="sm" className="self-start" onClick={() => setPlanModalOpen(true)}>Ver planes</Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Segundo acceso a la ayuda (HELP-01 / D-07): navegación interna del dashboard hacia la guía
          estática. Se muestra solo en Configuración (no en los hubs Negocio/Servicios/etc.). */}
      {!isSection && (
        <Link
          href="/ayuda"
          className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded"
        >
          ¿Necesitás ayuda? Ver la guía
        </Link>
      )}

      {/* Plan change modal */}
      <PlanModal open={planModalOpen} onOpenChange={setPlanModalOpen} />

      {/* Cancel subscription confirmation */}
      <Dialog open={confirmCancelSub} onOpenChange={setConfirmCancelSub}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>¿Cancelar suscripción?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tu plan seguirá activo hasta{' '}
            {business.subscription_ends_at
              ? new Date(business.subscription_ends_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
              : 'el fin del período'}
            . No se renovará automáticamente.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmCancelSub(false)}>Volver</Button>
            <Button variant="destructive" onClick={cancelSubscription} disabled={cancellingSub}>
              {cancellingSub ? 'Cancelando...' : 'Cancelar suscripción'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Editar profesional */}
      <Dialog open={!!editingPro} onOpenChange={open => { if (!open) setEditingPro(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar profesional</DialogTitle></DialogHeader>
          {/* Foto del profesional — se muestra en la página pública de reservas */}
          <div className="flex items-center gap-4">
            {editingPro?.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={editingPro.photo_url} alt={editingPro.name} className="w-16 h-16 rounded-full object-cover border border-border flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xl font-semibold flex-shrink-0">
                {(editPro.name.charAt(0) || '?').toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium">Foto del profesional</p>
              <p className="text-[11px] text-muted-foreground">Se muestra en tu página pública. JPG, PNG o WebP · máx 2MB.</p>
              <div className="flex items-center gap-2 pt-2">
                <label className={cn(
                  'inline-flex items-center h-7 px-2.5 rounded-md border border-border text-xs font-medium cursor-pointer hover:border-primary hover:text-primary transition-colors',
                  uploadingProPhoto && 'opacity-60 pointer-events-none'
                )}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingProPhoto}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadProPhoto(f); e.target.value = '' }}
                  />
                  {uploadingProPhoto ? 'Subiendo...' : (editingPro?.photo_url ? 'Cambiar' : 'Subir foto')}
                </label>
                {editingPro?.photo_url && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={removeProPhoto}>Quitar</Button>
                )}
              </div>
            </div>
          </div>
          <ProFields value={editPro} onChange={setEditPro} labels={proLabels} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingPro(null)}>Cancelar</Button>
            <Button onClick={saveEditPro} disabled={savingEditPro || !editPro.name.trim()}>
              {savingEditPro ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado (servicio / consultorio). El ConfirmDialog usa el cliente browser
          de Supabase directo (NO server actions, NO redirect) → sin toast espurio de NEXT_REDIRECT.
          El de servicio tiene DOS estados (D-11): bloqueado (sin "Eliminar", con salida a desactivar)
          y confirmable. Ante un rechazo del gate, deleteLocation muestra su propio toast y NO filtra
          el item: el dialog se cierra pero la fila sigue en la lista. */}
      <ConfirmDialog
        open={!!delService}
        // Al cerrar también se invalida el pre-check en vuelo (WR-03): si no, una respuesta tardía
        // escribiría `delInfo` sobre un diálogo ya cerrado.
        onOpenChange={(o) => { if (!o) { delReqRef.current++; setDelService(null); setDelInfo(null) } }}
        title="¿Eliminar servicio?"
        description={delDescription}
        risk="alto"
        confirmLabel="Eliminar"
        destructive
        hideConfirm={delInfo === null || delInfo === 'error' || delBlocked}
        // La salida solo se ofrece cuando ES una salida (WR-04): en el tab "Desactivados" todos los
        // servicios ya están inactivos, y ahí "Desactivar" escribía active:false sobre active:false,
        // cantaba éxito y cerraba el diálogo sin que cambiara nada.
        secondaryAction={delBlocked && delService && delService.active
          // Solo cierra si REALMENTE se desactivó (WR-08).
          ? { label: 'Desactivar', onClick: async () => { if (!await toggleService(delService.id, false)) return false; delReqRef.current++; setDelService(null); setDelInfo(null); return true } }
          : undefined}
        onConfirmError={(err) => {
          const motivo = err instanceof Error ? err.message : ''
          toast.error(
            motivo === 'has_future_appointments' ? 'No se puede eliminar: quedaron turnos futuros reservados. Desactivalo para dejar de ofrecerlo y conservar el historial.'
              : motivo === 'has_active_abono' ? 'No se puede eliminar: el servicio tiene un abono activo. Desactivalo para dejar de ofrecerlo y conservar el historial.'
                : 'No se pudo eliminar el servicio'
          )
        }}
        onConfirm={async () => {
          if (!delService) return
          const res = await deleteService(delService.id)
          if (!res.ok) {
            // Backstop del gate de la DB (D-10/D-11): alguien reservó entre el pre-check y el
            // confirm. Hay que LANZAR — el ConfirmDialog cierra el diálogo cuando onConfirm no
            // lanza, y el rechazo se tragaría en silencio. Con el throw el modal queda abierto y,
            // con el pre-check refrescado, se re-renderiza en estado bloqueado.
            await openDeleteService(delService)
            throw new Error(res.error)
          }
          setDelService(null)
          setDelInfo(null)
        }}
      />
      <ConfirmDialog
        open={!!delLoc}
        onOpenChange={(o) => { if (!o) setDelLoc(null) }}
        title={`¿Eliminar ${locWord}?`}
        description={delLoc ? `Vas a eliminar "${delLoc.name}". Esta acción no se puede deshacer.` : undefined}
        risk="alto"
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => { if (delLoc) { await deleteLocation(delLoc.id); setDelLoc(null) } }}
      />
    </div>
  )
}
