'use client'

import { useState } from 'react'

// Superficie PÚBLICA: fechas con un helper local (arrays DAYS/MONTHS), sin date-fns — mismo criterio
// que app/cancelar/[token]/cancel-client.tsx, para no arrastrar el locale al bundle del cliente.
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DAYS[dt.getDay()]} ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`
}

interface Props {
  token: string
  clientName: string
  service: string
  // Frase ya armada por el server, ej. "todos los martes" (derivada de day_of_week).
  dayLabel: string
  time: string
  // Preview calculado server-side por el mismo motor que ejecuta la baja (D-03/D-11).
  cancelledCount: number
  lastDate: string | null
  businessName: string
  businessSlug: string
  logoUrl: string | null
  accent: string
  // Sólo dos estados iniciales (D-08): no existe ni el estado de turno pasado ni el de plazo vencido
  // — la regla de las 24 h del cancel de turno suelto NO rige en la baja de serie (D-06).
  initialState: 'active' | 'cancelled'
}

export function AbonoCancelClient({
  token,
  clientName,
  service,
  dayLabel,
  time,
  cancelledCount,
  lastDate,
  businessName,
  businessSlug,
  logoUrl,
  accent,
  initialState,
}: Props) {
  const [view, setView] = useState<'active' | 'cancelled' | 'done'>(initialState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmCancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/abonos/cancel/${token}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setView('done')
      } else if (data.reason === 'already_cancelled') {
        // Alguien (el dueño desde el panel, u otra pestaña) ya la dio de baja: pantalla informativa.
        setView('cancelled')
      } else if (data.reason === 'not_found') {
        setError('Este enlace de cancelación no es válido.')
      } else {
        setError('No pudimos dar de baja el turno fijo. Probá de nuevo en unos minutos.')
      }
    } catch {
      setError('No pudimos conectar. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const heading =
    view === 'done' ? 'Turno fijo dado de baja'
    : view === 'cancelled' ? 'Este turno fijo ya fue dado de baja'
    : '¿Dar de baja tu turno fijo?'

  const turnosLabel = cancelledCount === 1 ? '1 turno' : `${cancelledCount} turnos`

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="w-full max-w-sm">
        {/* Header de marca */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-[family-name:var(--font-heading)] font-black" style={{ backgroundColor: accent }}>
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-semibold">{businessName}</span>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold mb-4 font-[family-name:var(--font-heading)]">{heading}</h1>

          {/* Detalle de la serie (D-11): qué es, cuándo, a nombre de quién y cuánto se cancela. */}
          <div className="rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5" style={{ borderLeftColor: accent }}>
            {service && <p className="text-muted-foreground">Servicio: <span className="text-foreground">{service}</span></p>}
            {dayLabel && <p className="text-muted-foreground">Se repite: <span className="text-foreground">{dayLabel}</span></p>}
            <p className="text-muted-foreground">Hora: <span className="text-foreground">{time.slice(0, 5)} hs</span></p>
            <p className="text-muted-foreground">A nombre de: <span className="text-foreground">{clientName}</span></p>
            {cancelledCount > 0 && (
              <p className="text-muted-foreground pt-1">
                Se cancelan <strong className="text-foreground">{turnosLabel} {view === 'done' ? 'que tenías reservados' : 'futuros'}</strong>
                {lastDate ? <>, el último el <strong className="text-foreground">{fmtDate(lastDate)}</strong></> : null}.
              </p>
            )}
          </div>

          {view === 'active' && (
            <>
              <p className="text-sm text-muted-foreground mb-4">Se da de baja el turno fijo <strong className="text-foreground">completo</strong>, todas las semanas, no sólo el próximo. Esta acción <strong className="text-foreground">no se puede deshacer</strong> y los horarios quedarán disponibles para otras personas.</p>
              {error && <p className="text-destructive text-sm mb-3">{error}</p>}
              <button
                onClick={confirmCancel}
                disabled={loading}
                className="w-full rounded-md py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: accent }}
              >
                {loading ? 'Dando de baja...' : 'Sí, dar de baja el turno fijo'}
              </button>
            </>
          )}

          {view === 'done' && (
            <>
              <p className="text-sm text-muted-foreground mb-4">Listo, tu turno fijo fue dado de baja y los turnos que tenías reservados quedaron liberados. Si querés, podés reservar un turno suelto cuando te venga bien.</p>
              {businessSlug && (
                <a
                  href={`/${businessSlug}`}
                  className="block w-full rounded-md py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: accent }}
                >
                  Reservar un turno
                </a>
              )}
            </>
          )}

          {view === 'cancelled' && (
            <>
              <p className="text-sm text-muted-foreground mb-4">No hay nada que hacer: este turno fijo ya figuraba dado de baja.</p>
              {businessSlug && (
                <a
                  href={`/${businessSlug}`}
                  className="block w-full rounded-md py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: accent }}
                >
                  Reservar un turno
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
