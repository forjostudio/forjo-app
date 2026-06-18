'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  Inbox,
  GitBranch,
  Store,
  BarChart3,
  ScrollText,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  LucideIcon,
} from 'lucide-react'

/**
 * CrmSidebar — sidebar AGRUPADO propio del CRM super-admin (FND-04, UI-SPEC §"CrmSidebar").
 *
 * NO reusa `components/dashboard/sidebar.tsx`: aquel es PLANO y business-scoped vía
 * un nav construido desde el `business` + terminología por vertical. El CRM no es un tenant
 * (no tiene `business`), así que su nav es estático y agrupado en 4 secciones (OPERACIÓN / VENTAS /
 * INSIGHTS / CUENTA). En Phase 1 solo Dashboard (→ /admin) y Auditoría (→ /admin/auditoria)
 * enrutan a páginas reales; el resto son items deshabilitados con tag "PRONTO" (Phases 2+).
 *
 * El estado activo se diferencia por FONDO elevado + barra de acento amarillo + color +
 * icono tintado, NUNCA por un peso de fuente más pesado (el sistema usa solo 400/700).
 */

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  badge?: number
  soon?: boolean
}

type NavGroup = {
  label: string
  items: NavItem[]
}

// Nav estático del CRM (no business-scoped, no derivado de un business). En Phase 1 solo enrutan a páginas
// reales Dashboard y Auditoría; el resto quedan como "PRONTO" (deshabilitados) — las pantallas
// con datos llegan en Phases 2+ (ver 01-CONTEXT.md <deferred>).
const NAV_GROUPS: NavGroup[] = [
  {
    label: 'OPERACIÓN',
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
      { href: '#', label: 'Bandeja', icon: Inbox, soon: true },
    ],
  },
  {
    label: 'VENTAS',
    items: [
      { href: '#', label: 'Pipeline', icon: GitBranch, soon: true },
      { href: '#', label: 'Negocios', icon: Store, soon: true },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { href: '#', label: 'Reportes', icon: BarChart3, soon: true },
      { href: '/admin/auditoria', label: 'Auditoría', icon: ScrollText },
    ],
  },
  {
    label: 'CUENTA',
    items: [
      { href: '#', label: 'Planes y precios', icon: CreditCard, soon: true },
      { href: '#', label: 'Ajustes', icon: Settings, soon: true },
    ],
  },
]

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const Icon = item.icon
  // Activo = ruta exacta (las del CRM no son anidadas en Phase 1). El item Dashboard (/admin)
  // no debe activarse en /admin/auditoria → comparación exacta, no startsWith.
  const active = !item.soon && pathname === item.href

  const baseClass =
    'group/nav relative flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

  if (item.soon) {
    return (
      <span
        aria-disabled="true"
        className={cn(baseClass, 'cursor-not-allowed text-muted-foreground/50 select-none')}
      >
        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        <span className="font-[family-name:var(--font-geist-mono)] text-[10px] tracking-wider text-muted-foreground/60">
          PRONTO
        </span>
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        baseClass,
        // Barra de acento amarilla a la izquierda (2px) — solo visible en activo.
        'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary before:opacity-0',
        active
          ? 'bg-secondary text-foreground before:opacity-100'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
      )}
    >
      <Icon
        className={cn('w-4 h-4 flex-shrink-0', active && 'text-primary')}
        aria-hidden="true"
      />
      <span className="flex-1">{item.label}</span>
      {item.badge != null && (
        <span className="font-[family-name:var(--font-geist-mono)] text-xs text-muted-foreground">
          {item.badge}
        </span>
      )}
    </Link>
  )
}

export function CrmSidebar({ operatorName = 'Operador' }: { operatorName?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = operatorName
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const close = () => setMobileOpen(false)

  // Contenido del sidebar como ELEMENTO JSX (no un componente declarado en render — eso
  // recrearía el componente en cada render y resetearía su estado, regla react/no-unstable).
  const content = (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="p-5 border-b border-sidebar-border">
        <p className="text-base leading-none font-[family-name:var(--font-heading)] tracking-[-0.02em]">
          <span className="font-bold">forjo</span> studio
        </p>
        <p className="mt-1.5 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider text-muted-foreground">
          CONSOLA · OPERACIÓN
        </p>
      </div>

      {/* Nav agrupado */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label="Navegación del CRM">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.label} item={item} pathname={pathname} onNavigate={close} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: bloque de usuario + logout */}
      <div className="p-2 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-foreground font-[family-name:var(--font-heading)] text-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{operatorName}</p>
            <p className="truncate font-[family-name:var(--font-geist-mono)] text-[11px] text-muted-foreground">
              Operador · dueño
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile header con botón de drawer */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir navegación"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <span className="text-sm font-[family-name:var(--font-heading)] tracking-[-0.02em]">
          <span className="font-bold">forjo</span> studio
        </span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          'lg:hidden fixed top-0 left-0 bottom-0 z-50 w-60 bg-sidebar border-r border-sidebar-border transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="absolute top-3 right-3">
          <Button variant="ghost" size="icon" onClick={close} aria-label="Cerrar navegación">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {content}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:top-0 lg:left-0 lg:bottom-0 lg:w-60 bg-sidebar border-r border-sidebar-border z-20">
        {content}
      </div>
    </>
  )
}
