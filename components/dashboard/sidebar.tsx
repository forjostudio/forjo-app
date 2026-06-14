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
  CalendarClock,
  Users,
  UserCog,
  Store,
  Tag,
  MapPin,
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
    agenda: { href: '/agenda', label: 'Agenda', icon: CalendarClock },
    negocio: { href: '/negocio', label: 'Negocio', icon: Store },
    servicios: { href: '/servicios', label: t.services, icon: Tag },
    equipo: { href: '/equipo', label: 'Equipo', icon: UserCog },
    consultorios: { href: '/consultorios', label: t.locations, icon: MapPin },
    clients: { href: '/clients', label: t.clients, icon: Users },
    patients: { href: '/clients', label: t.clients, icon: Users },
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
            <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary text-primary-foreground font-[family-name:var(--font-heading)] font-black text-base flex-shrink-0">
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

      <div className="p-3 border-t border-border space-y-1">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
        {/* Marca F constructivista — el primer trazo usa currentColor para adaptarse a claro/oscuro */}
        <div className="flex items-center gap-2 px-3 pt-1 text-xs text-muted-foreground">
          <svg viewBox="0 0 64 80" className="w-3 h-[0.95rem]" aria-hidden="true">
            <rect x="6" y="6" width="14" height="68" fill="currentColor" />
            <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
            <path d="M20 34 L50 34 L36 48 L20 48 Z" fill="#2a5fa5" />
            <circle cx="56" cy="13" r="6" fill="#f4c543" />
          </svg>
          <span>
            hecho con{' '}
            <a
              href="https://www.forjo.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              <span className="font-semibold text-foreground font-[family-name:var(--font-heading)]">Forjo</span> Studio
            </a>
          </span>
        </div>
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
