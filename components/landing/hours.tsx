import {
  groupHoursByDay,
  shouldHideHours,
  DIAS,
  HOURS_RENDER_ORDER,
} from '@/lib/landing/derive'
import type { TimeBlock, Location } from '@/lib/types'

// ── Sección Hours (RSC) ─────────────────────────────────────────────────────────────
// Deriva de `time_blocks` (NO de business_hours, RESEARCH Anti-Pattern): time_blocks es
// la fuente real ya fetcheada en page.tsx. El agrupado por día vive en derive.ts
// (groupHoursByDay, testeado en 07-01); acá SOLO se renderiza.
// Empty-state (D7-08): sin time_blocks → la sección se oculta (return null).
// Multi-location (D7-06): si hay más de una sede, se agrupa por location_id y se etiqueta
// cada bloque con el nombre de la location.

// `data` solo aportaría un título; hoursData no existe en schema.ts (Hours no lee config
// más allá del título), así que lo leemos de forma defensiva sin tirar.
function readTitle(data: unknown): string {
  if (data && typeof data === 'object' && 'title' in data) {
    const t = (data as { title?: unknown }).title
    if (typeof t === 'string' && t.length > 0) return t
  }
  return 'Horarios'
}

// Render de un <dl> de días → rangos, en orden AR (lunes primero, domingo al final).
function HoursList({ timeBlocks }: { timeBlocks: TimeBlock[] }) {
  const byDay = groupHoursByDay(timeBlocks)
  return (
    <dl className="max-w-prose">
      {HOURS_RENDER_ORDER.filter((day) => byDay.has(day)).map((day) => (
        <div
          key={day}
          className="flex justify-between border-b border-border py-2 text-sm"
        >
          <dt className="font-semibold">{DIAS[day]}</dt>
          <dd className="text-muted-foreground">{byDay.get(day)!.join(', ')}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Hours({
  data,
  timeBlocks,
  locations,
}: {
  data: unknown
  timeBlocks: TimeBlock[]
  locations: Location[]
}) {
  if (shouldHideHours(timeBlocks)) return null
  const title = readTitle(data)
  const multi = locations.length > 1

  return (
    <section className="px-4 py-12 md:px-6 md:py-16">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight md:text-3xl">
          {title}
        </h2>
        <div className="mt-6">
          {multi ? (
            // Multi-sede: un grupo por location_id con su nombre como etiqueta.
            <div className="space-y-8">
              {locations.map((loc) => {
                const blocks = timeBlocks.filter((b) => b.location_id === loc.id)
                if (blocks.length === 0) return null
                return (
                  <div key={loc.id}>
                    <h3 className="mb-2 font-[family-name:var(--font-heading)] text-base font-semibold">
                      {loc.name}
                    </h3>
                    <HoursList timeBlocks={blocks} />
                  </div>
                )
              })}
            </div>
          ) : (
            // Sede única: render directo.
            <HoursList timeBlocks={timeBlocks} />
          )}
        </div>
      </div>
    </section>
  )
}
