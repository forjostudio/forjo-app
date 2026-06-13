'use client'

import { useMemo, useState } from 'react'
import { format, parseISO, addDays, differenceInCalendarDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Subset con joins de nombre de servicio/profesional (Supabase los tipa como array → cast).
export type UpcomingAppt = {
  id: string
  date: string
  time: string
  status: string
  client_name: string
  services: { name?: string } | null
  professionals: { name?: string } | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  pending_payment: 'Falta seña',
  confirmed: 'Confirmado',
  completed: 'Completado',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#f4c543] text-[#1a1714] border-transparent',
  pending_payment: 'bg-[#f4c543] text-[#1a1714] border-transparent',
  confirmed: 'bg-[#2a5fa5] text-white border-transparent',
  completed: 'bg-[#2f8a5b] text-white border-transparent',
}

// Widget "Próximos turnos": ventana de 7 días (arrancando mañana) con navegación por semana.
// Las flechas avanzan/retroceden de a 7 días; el avance llega hasta la última semana con turnos.
export function UpcomingAppointments({ appointments }: { appointments: UpcomingAppt[] }) {
  const base = useMemo(() => addDays(startOfDay(new Date()), 1), []) // mañana
  const [offset, setOffset] = useState(0)

  const maxOffset = useMemo(() => {
    let max = 0
    for (const a of appointments) {
      const off = Math.floor(differenceInCalendarDays(parseISO(a.date), base) / 7)
      if (off > max) max = off
    }
    return max
  }, [appointments, base])

  const windowStart = addDays(base, offset * 7)
  const windowEnd = addDays(windowStart, 6)
  const wsStr = format(windowStart, 'yyyy-MM-dd')
  const weStr = format(windowEnd, 'yyyy-MM-dd')

  // Turnos de la ventana, agrupados por día (ya vienen ordenados por fecha+hora).
  const groups = useMemo(() => {
    const m = new Map<string, UpcomingAppt[]>()
    for (const a of appointments) {
      if (a.date < wsStr || a.date > weStr) continue
      const arr = m.get(a.date) || []
      arr.push(a)
      m.set(a.date, arr)
    }
    return [...m.entries()]
  }, [appointments, wsStr, weStr])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Próximos turnos</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{format(windowStart, "d 'de' MMM", { locale: es })} – {format(windowEnd, "d 'de' MMM", { locale: es })}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - 1))} aria-label="Semana anterior"><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={offset >= maxOffset} onClick={() => setOffset(o => o + 1)} aria-label="Semana siguiente"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">No hay turnos en estos días</p>
        ) : (
          <div className="space-y-4">
            {groups.map(([date, items]) => (
              <div key={date} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground capitalize">{format(parseISO(date), "EEEE d 'de' MMM", { locale: es })}</p>
                {items.map(appt => (
                  <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <span className="text-sm font-mono font-semibold text-primary w-14 flex-shrink-0">{appt.time.slice(0, 5)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{appt.client_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {appt.services?.name}
                        {appt.professionals?.name ? ` · ${appt.professionals.name}` : ''}
                      </p>
                    </div>
                    <Badge className={`text-xs ${STATUS_COLORS[appt.status] || ''}`} variant="outline">{STATUS_LABELS[appt.status] || appt.status}</Badge>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
