import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Users, DollarSign, TrendingUp } from 'lucide-react'
import { sanitizeWidgetIds } from '@/lib/dashboard-widgets'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  confirmed: 'bg-blue-500/20 text-blue-400',
  cancelled: 'bg-red-500/20 text-red-400',
  completed: 'bg-green-500/20 text-green-400',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  const today = format(new Date(), 'yyyy-MM-dd')
  const weekStart = format(new Date(Date.now() - 6 * 86400000), 'yyyy-MM-dd')
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')

  const [
    { count: todayCount },
    { count: weekCount },
    { data: monthData },
    { count: clientCount },
    { data: todayAppointments },
  ] = await Promise.all([
    supabase.from('appointments').select('*', { count: 'exact', head: true })
      .eq('business_id', business.id).eq('date', today).neq('status', 'cancelled'),
    supabase.from('appointments').select('*', { count: 'exact', head: true })
      .eq('business_id', business.id).gte('date', weekStart).neq('status', 'cancelled'),
    supabase.from('appointments')
      .select('*, services(price)')
      .eq('business_id', business.id)
      .gte('date', monthStart)
      .neq('status', 'cancelled'),
    supabase.from('clients').select('*', { count: 'exact', head: true })
      .eq('business_id', business.id),
    supabase.from('appointments')
      .select('*, professionals(name), services(name, price)')
      .eq('business_id', business.id)
      .eq('date', today)
      .neq('status', 'cancelled')
      .order('time')
      .limit(8),
  ])

  const monthRevenue = (monthData || []).reduce((sum, a) => {
    return sum + ((a.services as { price?: number } | null)?.price || 0)
  }, 0)

  // Selección de widgets del negocio (null = mostrar todos). Catálogo en lib/dashboard-widgets.
  const widgetSel = sanitizeWidgetIds(business.dashboard_widgets)
  const showWidget = (id: string) => !widgetSel || widgetSel.includes(id)

  const stats = [
    { id: 'today_appointments', label: 'Turnos hoy', value: todayCount || 0, icon: Calendar, color: 'text-blue-400' },
    { id: 'week_appointments', label: 'Esta semana', value: weekCount || 0, icon: TrendingUp, color: 'text-green-400' },
    {
      id: 'month_revenue',
      label: 'Ingresos del mes',
      value: `$${monthRevenue.toLocaleString('es-AR')}`,
      icon: DollarSign,
      color: 'text-primary'
    },
    { id: 'total_clients', label: 'Total clientes', value: clientCount || 0, icon: Users, color: 'text-purple-400' },
  ].filter(s => showWidget(s.id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bienvenido, {business.name}</h1>
        <p className="text-muted-foreground mt-1">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => {
            const Icon = stat.icon
            return (
              <Card key={stat.label}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showWidget('today_schedule') && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Turnos de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {!todayAppointments || todayAppointments.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No hay turnos para hoy
            </p>
          ) : (
            <div className="space-y-2">
              {todayAppointments.map(appt => (
                <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                  <span className="text-sm font-mono font-semibold text-primary w-14 flex-shrink-0">
                    {appt.time.slice(0, 5)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{appt.client_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(appt.services as { name?: string } | null)?.name}
                      {(appt.professionals as { name?: string } | null)?.name &&
                        ` · ${(appt.professionals as { name?: string }).name}`}
                    </p>
                  </div>
                  <Badge className={`text-xs ${STATUS_COLORS[appt.status]}`} variant="outline">
                    {STATUS_LABELS[appt.status]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  )
}
