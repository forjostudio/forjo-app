'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Business } from '@/lib/types'
import { getPlanLimits } from '@/lib/plans'
import { cn } from '@/lib/utils'
import {
  ExternalLink,
  HelpCircle,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
// El inventario del menú vive en un módulo compartido (sin directiva de cliente) para que la barra
// inferior y la pantalla Más lean el MISMO gateo por rubro en vez de reimplementarlo.
import { buildNavGroups } from '@/components/dashboard/nav-groups'
import { useNavigationGuard } from '@/components/dashboard/unsaved-changes-guard'
import { consumeOwnedPanelEntry, panelNavMode } from '@/lib/panel-history'
import { useState } from 'react'

export function Sidebar({ business }: { business: Business }) {
  const NAV_GROUPS_RESOLVED = buildNavGroups(business)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  // Guard de salida del panel: si la pantalla actual tiene cambios sin guardar, cada link de acá
  // pregunta antes de navegar en vez de descartarlos en silencio. Sin provider devuelve siempre
  // false ⇒ nunca bloquea. Ver components/dashboard/unsaved-changes-guard.tsx.
  const requestNavigation = useNavigationGuard()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Contenido del sidebar como ELEMENTO JSX (no un componente declarado en render — eso
  // recrearía el componente en cada render y resetearía su estado, regla react/no-unstable /
  // react-hooks/static-components). Mismo patrón que crm-sidebar.tsx.
  const sidebarContent = (
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

      <nav className="flex-1 overflow-y-auto px-3 pb-2" aria-label="Navegación">
        {/* Nav agrupado data-driven (D-01/D-02): headers de sección mono espejando crm-sidebar,
            mismo estado activo bg-primary del dashboard (NO el bg-secondary+barra del CRM). */}
        {NAV_GROUPS_RESOLVED.map(group => (
          <div key={group.section}>
            <p className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground">
              {group.section}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    // NAV-07 — el atrás desde cualquier sección cae en el DASHBOARD, nunca en otra
                    // sección abierta antes. El sidebar no decide nada: CONSUME la regla pura de
                    // lib/panel-history.ts (mismo criterio que NAV-05 — una sola forma de tocar el
                    // historial, testeable sin jsdom). Ojo: NO es `replace` a secas, que reemplazaría
                    // también la entrada del dashboard y el primer atrás sacaría del panel.
                    replace={panelNavMode({ from: pathname, to: item.href }) === 'replace'}
                    onClick={() => setMobileOpen(false)}
                    // El guard de cambios sin guardar se evalúa PRIMERO y no se toca: si bloquea, él
                    // se hace cargo del diálogo y acá no pasa nada más.
                    // NAV-08 — tocar la sección en la que YA estás cierra la subsección en vez de
                    // apilarla encima (el `/clients` que entierra un `?c=` y lo desentierra tres
                    // atrás después). `history.back()` es ASÍNCRONO: hay que PREVENIR la navegación,
                    // no encadenarla — si dejáramos navegar, el router empujaría su entrada antes de
                    // que el browser procese el pop y volveríamos a enterrar la ficha.
                    onNavigate={(e) => {
                      if (requestNavigation(item.href)) { e.preventDefault(); return }
                      if (active && consumeOwnedPanelEntry()) e.preventDefault()
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
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
            </div>
          </div>
        ))}

        <a
          href={`${process.env.NEXT_PUBLIC_APP_URL}/${business.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
          Ver mi página
        </a>
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        {/* Acceso a la ayuda estática desde el footer (HELP-01 / D-07): HELP-01 pide un acceso
            desde el footer del sidebar además del de Configuración. Misma fila que los links de nav
            y cierra el drawer en mobile igual que ellos. */}
        {/* La Ayuda es una ruta más del panel y entra por el MISMO menú, así que se rige por la misma
            regla que los items de arriba: si no compartiera la política, salir de Clientes por Ayuda
            dejaría Clientes debajo y el atrás caería ahí en vez del dashboard — el dialecto que
            NAV-05 viene a evitar. El consumo de NAV-08 hoy es un no-op acá (Ayuda no tiene
            subsecciones) y se deja igual para que no haya dos formas de escribir esta fila. */}
        <Link
          href="/ayuda"
          replace={panelNavMode({ from: pathname, to: '/ayuda' }) === 'replace'}
          onClick={() => setMobileOpen(false)}
          onNavigate={(e) => {
            if (requestNavigation('/ayuda')) { e.preventDefault(); return }
            if (pathname === '/ayuda' && consumeOwnedPanelEntry()) e.preventDefault()
          }}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          Ayuda
        </Link>
        {/* El logout pasa por el guard con su PROPIA continuación: acá "seguir" significa desloguear
            y DESPUÉS navegar. Si el guard empujara /login sin haber llamado a signOut(), la sesión
            quedaría viva y el proxy rebotaría al dashboard. Si el guard bloquea, el diálogo se
            encarga; si no bloquea, se ejecuta el mismo handler de siempre. */}
        <button
          onClick={() => { if (!requestNavigation('/login', () => void handleLogout())) void handleLogout() }}
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
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:top-0 lg:left-0 lg:bottom-0 lg:w-60 bg-card border-r border-border z-20">
        {sidebarContent}
      </div>
    </>
  )
}
