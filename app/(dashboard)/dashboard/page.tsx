import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, Users, DollarSign, TrendingUp } from 'lucide-react'
import { sanitizeWidgetIds } from '@/lib/dashboard-widgets'
import { UpcomingAppointments, type UpcomingAppt } from '@/components/dashboard/upcoming-appointments'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
}

// Badges de estado con la paleta Bauhaus (constantes, no cambian por paleta de negocio):
// pending=amarillo · confirmed=azul · completed=verde · cancelled=rojo.
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#f4c543] text-[#1a1714] border-transparent',
  confirmed: 'bg-[#2a5fa5] text-white border-transparent',
  cancelled: 'bg-[#d94a2b] text-white border-transparent',
  completed: 'bg-[#2f8a5b] text-white border-transparent',
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
  // Horizonte para "Próximos turnos": de mañana en adelante, hasta 8 semanas.
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const horizon = format(addDays(new Date(), 56), 'yyyy-MM-dd')

  const [
    { count: todayCount },
    { count: weekCount },
    { data: monthData },
    { count: clientCount },
    { data: todayAppointments },
    { data: upcoming },
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
    supabase.from('appointments')
      .select('id, date, time, status, client_name, professionals(name), services(name)')
      .eq('business_id', business.id)
      .gte('date', tomorrow)
      .lte('date', horizon)
      .neq('status', 'cancelled')
      .order('date')
      .order('time'),
  ])

  const monthRevenue = (monthData || []).reduce((sum, a) => {
    return sum + ((a.services as { price?: number } | null)?.price || 0)
  }, 0)

  // Selección de widgets del negocio (null = mostrar todos). Catálogo en lib/dashboard-widgets.
  const widgetSel = sanitizeWidgetIds(business.dashboard_widgets)
  const showWidget = (id: string) => !widgetSel || widgetSel.includes(id)

  const stats = [
    { id: 'today_appointments', label: 'Turnos de hoy', value: todayCount || 0, icon: Calendar, color: 'text-[#2a5fa5]', href: '/appointments' },
    { id: 'week_appointments', label: 'Turnos de la semana', value: weekCount || 0, icon: TrendingUp, color: 'text-[#2f8a5b]', href: '/agenda' },
    {
      id: 'month_revenue',
      label: 'Ingresos del mes',
      value: `$${monthRevenue.toLocaleString('es-AR')}`,
      icon: DollarSign,
      color: 'text-primary',
      href: '/finances',
    },
    { id: 'total_clients', label: 'Total de clientes', value: clientCount || 0, icon: Users, color: 'text-[#8a5fb0]', href: '/clients' },
  ].filter(s => showWidget(s.id))

  return (
    <div className="space-y-6">
      <div>
        {/* Eyebrow Bauhaus: triple primitiva (cuadrado rojo · cuadrado amarillo · círculo azul) */}
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <span className="flex items-center gap-1" aria-hidden="true">
            <i className="block w-2 h-2 bg-[#d94a2b]" />
            <i className="block w-2 h-2 bg-[#f4c543]" />
            <i className="block w-2 h-2 rounded-full bg-[#2a5fa5]" />
          </span>
          Panel
        </div>
        <h1 className="text-2xl font-bold mt-2">Bienvenido, {business.name}</h1>
        <p className="text-muted-foreground mt-1">
          {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {stats.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(stat => {
            const Icon = stat.icon
            // Acento Bauhaus: "Ingresos del mes" como bloque sólido primary.
            const isPrimary = stat.id === 'month_revenue'
            return (
              <Link key={stat.label} href={stat.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
                <Card className={`transition-colors hover:border-primary ${isPrimary ? 'bg-primary text-primary-foreground border-transparent hover:border-transparent hover:opacity-95' : ''}`}>
                  <CardContent className="pt-5">
                    {/* Ícono en recuadro (acento constructivista) */}
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center mb-3 ${isPrimary ? 'bg-white/15' : 'bg-secondary'}`}>
                      <Icon className={`w-[18px] h-[18px] ${isPrimary ? 'text-primary-foreground' : stat.color}`} />
                    </div>
                    <p className="text-3xl font-[family-name:var(--font-heading)] font-extrabold tracking-tight leading-none">{stat.value}</p>
                    <p className={`text-xs mt-1.5 ${isPrimary ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{stat.label}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {showWidget('today_schedule') && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Agenda de hoy</CardTitle>
          <Link href="/appointments" className="text-xs text-primary hover:underline flex-shrink-0">Ver todos →</Link>
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

      {showWidget('upcoming_appointments') && (
        <UpcomingAppointments appointments={(upcoming || []) as unknown as UpcomingAppt[]} />
      )}
    </div>
  )
}
