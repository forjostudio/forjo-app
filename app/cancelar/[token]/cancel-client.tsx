'use client'

import { useState } from 'react'

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
  date: string
  time: string
  businessName: string
  logoUrl: string | null
  accent: string
  initialState: 'active' | 'cancelled' | 'past'
}

export function CancelClient({ token, clientName, service, date, time, businessName, logoUrl, accent, initialState }: Props) {
  const [view, setView] = useState<'active' | 'cancelled' | 'past' | 'done'>(initialState)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmCancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/cancel/${token}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setView('done')
      } else if (data.reason === 'already_cancelled') {
        setView('cancelled')
      } else if (data.reason === 'past') {
        setView('past')
      } else if (data.reason === 'not_found') {
        setError('Este enlace de cancelación no es válido.')
      } else {
        setError('No pudimos cancelar el turno. Probá de nuevo en unos minutos.')
      }
    } catch {
      setError('No pudimos conectar. Revisá tu conexión e intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const heading =
    view === 'done' ? 'Turno cancelado'
    : view === 'cancelled' ? 'Este turno ya está cancelado'
    : view === 'past' ? 'Este turno ya pasó'
    : '¿Cancelar tu turno?'

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

          {/* Detalle del turno */}
          <div className="rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5" style={{ borderLeftColor: accent }}>
            <p className="text-muted-foreground">Servicio: <span className="text-foreground">{service}</span></p>
            <p className="text-muted-foreground">Fecha: <span className="text-foreground">{fmtDate(date)}</span></p>
            <p className="text-muted-foreground">Hora: <span className="text-foreground">{time.slice(0, 5)} hs</span></p>
            <p className="text-muted-foreground">A nombre de: <span className="text-foreground">{clientName}</span></p>
          </div>

          {view === 'active' && (
            <>
              <p className="text-sm text-muted-foreground mb-4">Esta acción no se puede deshacer. El horario quedará disponible para otras personas.</p>
              {error && <p className="text-destructive text-sm mb-3">{error}</p>}
              <button
                onClick={confirmCancel}
                disabled={loading}
                className="w-full rounded-md py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: accent }}
              >
                {loading ? 'Cancelando...' : 'Sí, cancelar turno'}
              </button>
            </>
          )}

          {view === 'done' && (
            <p className="text-sm text-muted-foreground">Listo, tu turno fue cancelado. Si querés, podés reservar otro horario cuando quieras.</p>
          )}
          {view === 'cancelled' && (
            <p className="text-sm text-muted-foreground">No hay nada que hacer: este turno ya figuraba cancelado.</p>
          )}
          {view === 'past' && (
            <p className="text-sm text-muted-foreground">La fecha de este turno ya pasó, así que no se puede cancelar.</p>
          )}
        </div>
      </div>
    </main>
  )
}
