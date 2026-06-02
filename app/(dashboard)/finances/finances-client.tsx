'use client'

import { useState } from 'react'
import { format, parseISO, startOfMonth, isSameMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Appointment } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DollarSign, TrendingUp, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

interface Props {
  appointments: Appointment[]
}

export function FinancesClient({ appointments: initialAppointments }: Props) {
  const supabase = createClient()
  const [appointments, setAppointments] = useState(initialAppointments)

  const now = new Date()
  const currentMonthAppointments = appointments.filter(a =>
    isSameMonth(parseISO(a.date), now)
  )

  function getPrice(a: Appointment) {
    return Number((a.services as { price?: number } | null)?.price || 0)
  }

  const totalMonth = currentMonthAppointments.reduce((s, a) => s + getPrice(a), 0)
  const paidMonth = currentMonthAppointments.filter(a => a.payment_status === 'paid').reduce((s, a) => s + getPrice(a), 0)
  const unpaidMonth = totalMonth - paidMonth

  // Bar chart data — last 6 months
  const months: { name: string; total: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthAppointments = appointments.filter(a => isSameMonth(parseISO(a.date), d))
    months.push({
      name: format(d, 'MMM', { locale: es }),
      total: monthAppointments.reduce((s, a) => s + getPrice(a), 0),
    })
  }

  async function markPaid(id: string) {
    const { error } = await supabase
      .from('appointments')
      .update({ payment_status: 'paid' })
      .eq('id', id)

    if (error) {
      toast.error('Error al actualizar')
      return
    }
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, payment_status: 'paid' } : a))
    toast.success('Marcado como pagado')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Finanzas</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Total del mes</span>
            </div>
            <p className="text-2xl font-bold">${totalMonth.toLocaleString('es-AR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-sm text-muted-foreground">Cobrados</span>
            </div>
            <p className="text-2xl font-bold text-green-400">${paidMonth.toLocaleString('es-AR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-muted-foreground">Pendientes</span>
            </div>
            <p className="text-2xl font-bold text-yellow-400">${unpaidMonth.toLocaleString('es-AR')}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingresos últimos 6 meses</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
                formatter={(v) => [`$${Number(v).toLocaleString('es-AR')}`, 'Ingresos']}
              />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Turnos del mes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {currentMonthAppointments.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">Sin turnos este mes</p>
            ) : (
              currentMonthAppointments.map(appt => {
                const service = appt.services as { name?: string; price?: number } | null
                return (
                  <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 text-sm">
                    <span className="text-muted-foreground w-20 flex-shrink-0">
                      {format(parseISO(appt.date), 'd MMM', { locale: es })} {appt.time.slice(0, 5)}
                    </span>
                    <span className="flex-1 truncate">{appt.client_name}</span>
                    <span className="text-muted-foreground hidden sm:block truncate">{service?.name}</span>
                    <span className="font-medium">${getPrice(appt).toLocaleString('es-AR')}</span>
                    {appt.payment_status === 'paid' ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30" variant="outline">
                        Pagado
                      </Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => markPaid(appt.id)}>
                        Cobrar
                      </Button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
