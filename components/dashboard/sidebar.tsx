'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Business } from '@/lib/types'
import { getPlanLimits } from '@/lib/plans'
import { resolveVertical } from '@/lib/verticals'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  BarChart3,
  Settings,
  ExternalLink,
  LogOut,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

// Maps each menu key (from the vertical config) to its route + icon. Labels for
// client/patient items come from the vertical terminology so they read correctly
// per rubro ("Pacientes" en salud, "Clientes" en belleza/general).
function buildNav(business: Business): { href: string; label: string; icon: LucideIcon }[] {
  const v = resolveVertical(business)
  const t = v.terminology
  const ITEMS: Record<string, { href: string; label: string; icon: LucideIcon }> = {
    dashboard: { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    appointments: { href: '/appointments', label: t.appointments, icon: Calendar },
    clients: { href: '/clients', label: t.clients, icon: Users },
    patients: { href: '/clients', label: t.clients, icon: Users },
    clinical_history: { href: '/clinical-history', label: 'Historia Clínica', icon: FileText },
    finances: { href: '/finances', label: 'Finanzas', icon: BarChart3 },
    settings: { href: '/settings', label: 'Configuración', icon: Settings },
  }
  return v.menu.map(key => ITEMS[key]).filter(Boolean)
}

export function Sidebar({ business }: { business: Business }) {
  const NAV = buildNav(business)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: business.primary_color }}
            >
              {business.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{business.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {business.plan_status === 'active'
                ? `Plan ${getPlanLimits(business.plan || 'basic').name}`
                : (business.type || '')}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(item => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}

        <a
          href={`${process.env.NEXT_PUBLIC_APP_URL}/${business.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
          Ver mi página
        </a>
      </nav>

      <div className="p-3 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b border-border h-14 flex items-center px-4 gap-3">
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <span className="font-semibold">{business.name}</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <div className={cn(
        'lg:hidden fixed top-0 left-0 bottom-0 z-50 w-64 bg-card border-r border-border transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="absolute top-3 right-3">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <SidebarContent />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:top-0 lg:left-0 lg:bottom-0 lg:w-60 bg-card border-r border-border z-20">
        <SidebarContent />
      </div>
    </>
  )
}
