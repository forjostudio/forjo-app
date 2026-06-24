import {
  groupHoursByDay,
  shouldHideHours,
  DIAS,
  HOURS_RENDER_ORDER,
} from '@/lib/landing/derive'
import { Kicker, GhostIndex } from '@/components/landing/_premium'
import type { TimeBlock, Location } from '@/lib/types'

// ── Sección Hours (RSC) ─────────────────────────────────────────────────────────────
// Deriva de `time_blocks` (NO de business_hours): time_blocks es la fuente real ya fetcheada
// en page.tsx. El agrupado por día vive en derive.ts (groupHoursByDay, testeado en 07-01); acá
// SOLO se renderiza — NO se reimplementa la lógica.
// Empty-state (D7-08): sin time_blocks → la sección se oculta (return null).
// Multi-location (D7-06): si hay más de una sede, se agrupa por location_id y se etiqueta.
//
// Restyle F8.1 (D81-08, mock 06/07-screen.png + `.frj-hr`): LISTA EDITORIAL — cada fila es día
// en display + rango en mono, separadas por hairline. El día de hoy se resalta en --primary
// (.today); los días sin bloques se muestran "Cerrado" atenuados (.closed). Se rinden los 7 días
// en orden AR (lunes primero) para una lista completa. Cero hex: solo tokens.
//
// Polish F8.1 (fidelidad mock): heading editorial "Cuándo." (kicker "Horarios") — sin repetir
// la palabra entre kicker y heading. Título de sucursal (multi-sede) en tamaño de subtítulo,
// por encima de las filas de días (jerarquía correcta). Cuando va combinada con Location en
// 2-col (mock 04), el renderer la rinde en variant="column": SOLO el bloque interno, SIN su
// propia <section> ni número fantasma. Sola → full-width como hoy.

// Día de hoy en zona fija de Argentina (America/Argentina/Buenos_Aires = UTC-3 sin DST).
// Indexado 0=Domingo … 6=Sábado, igual que day_of_week de Postgres y DIAS de derive.ts.
function todayInAR(): number {
  const nowUtcMs = Date.now()
  const arMs = nowUtcMs - 3 * 60 * 60 * 1000 // UTC-3 fijo
  return new Date(arMs).getUTCDay()
}

// Predicado público para que el renderer decida combinar location+hours sin duplicar lógica.
export function isHoursVisible(timeBlocks: TimeBlock[]): boolean {
  return !shouldHideHours(timeBlocks)
}

// Render de la lista editorial de un set de bloques (7 días, lunes→domingo).
function HoursList({ timeBlocks, today }: { timeBlocks: TimeBlock[]; today: number }) {
  const byDay = groupHoursByDay(timeBlocks)
  return (
    <dl className="flex flex-col">
      {HOURS_RENDER_ORDER.map((day) => {
        const ranges = byDay.get(day)
        const isToday = day === today
        const isClosed = !ranges || ranges.length === 0
        return (
          <div
            key={day}
            className="flex items-center justify-between border-b border-[color:var(--frj-hair)] py-[clamp(12px,1.8cqw,18px)] text-[clamp(14px,1.7cqw,19px)] first:border-t"
          >
            <dt
              className={`font-[family-name:var(--font-heading)] font-semibold [letter-spacing:-0.02em] ${
                isToday ? 'text-primary' : ''
              }`}
            >
              {DIAS[day]}
            </dt>
            <dd
              className={`font-[family-name:var(--frj-font-mono)] text-[clamp(12px,1.4cqw,15px)] tracking-[0.04em] ${
                isToday
                  ? 'text-primary'
                  : isClosed
                    ? 'text-muted-foreground opacity-50'
                    : 'text-muted-foreground'
              }`}
            >
              {isClosed ? 'Cerrado' : ranges!.join(', ')}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// `data` solo aportaría un título; hoursData no existe en schema.ts. Lectura defensiva sin tirar.
function readTitle(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'title' in data) {
    const t = (data as { title?: unknown }).title
    if (typeof t === 'string' && t.length > 0) return t
  }
  return undefined
}

// Bloque interno (head + lista de horarios). Sin <section> ni padding de sección: reutilizable
// tanto en full-width como dentro del wrapper combinado.
function HoursInner({
  data,
  timeBlocks,
  locations,
}: {
  data: unknown
  timeBlocks: TimeBlock[]
  locations: Location[]
}) {
  const title = readTitle(data)
  const multi = locations.length > 1
  const today = todayInAR()

  return (
    <>
      {/* Heading editorial "Cuándo." con kicker "Horarios" (mock): sin repetir palabra. Si el
          config trae un title propio, lo respeta; si no, cae en "Cuándo." (no "Horarios"). */}
      <div className="mb-[clamp(24px,4cqw,48px)] flex flex-col gap-[0.9em]">
        <Kicker>Horarios</Kicker>
        <h2 className="frj-display text-[clamp(26px,5cqw,60px)]">{title ?? 'Cuándo.'}</h2>
      </div>

      <div className="max-w-prose">
        {multi ? (
          // Multi-sede: un grupo por location_id con su NOMBRE como subtítulo (jerarquía
          // correcta: el nombre de sucursal pesa MÁS que las filas de días, no menos).
          <div className="space-y-[clamp(28px,5cqw,56px)]">
            {locations.map((loc) => {
              const blocks = timeBlocks.filter((b) => b.location_id === loc.id)
              if (blocks.length === 0) return null
              return (
                <div key={loc.id}>
                  <h3 className="mb-[0.6em] font-[family-name:var(--font-heading)] text-[clamp(18px,2.4cqw,26px)] font-bold leading-tight [letter-spacing:-0.02em]">
                    {loc.name}
                  </h3>
                  <HoursList timeBlocks={blocks} today={today} />
                </div>
              )
            })}
          </div>
        ) : (
          // Sede única: render directo.
          <HoursList timeBlocks={timeBlocks} today={today} />
        )}
      </div>
    </>
  )
}

// Export del bloque interno para el wrapper combinado (renderer).
export { HoursInner }

export function Hours({
  data,
  timeBlocks,
  locations,
  index,
}: {
  data: unknown
  timeBlocks: TimeBlock[]
  locations: Location[]
  index?: number | string
}) {
  if (shouldHideHours(timeBlocks)) return null

  // Full-width (sola): su propia <section> + número fantasma secuencial (del renderer).
  return (
    <section className="relative px-[clamp(20px,5cqw,64px)] py-[clamp(56px,11cqw,150px)]">
      {index != null && <GhostIndex n={index} />}
      <HoursInner data={data} timeBlocks={timeBlocks} locations={locations} />
    </section>
  )
}
