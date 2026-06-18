'use client'

import { Search, Bell } from 'lucide-react'

/**
 * CrmTopbar — top bar del shell del CRM (FND-04, UI-SPEC §"Top bar").
 *
 * Título de página + breadcrumb mono, búsqueda global y campana de notificaciones.
 *
 * En Phase 1 la búsqueda es un input NO funcional (placeholder): las pantallas con datos
 * llegan en Phases 2+. El badge de la campana usa el ÚNICO rojo del CRM (--crm-danger),
 * nunca --destructive (UI-SPEC §"Color", brief §12).
 */
export function CrmTopbar({
  title = 'Consola CRM',
  breadcrumb = 'Operación · Overview',
  notificationCount,
}: {
  title?: string
  breadcrumb?: string
  notificationCount?: number
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur lg:px-6">
      {/* Título + breadcrumb (offset en mobile para no chocar con el botón del drawer) */}
      <div className="min-w-0 flex-1 pl-12 lg:pl-0">
        <h1 className="truncate text-base font-bold font-[family-name:var(--font-heading)] tracking-[-0.02em]">
          {title}
        </h1>
        <p className="truncate font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wide text-muted-foreground">
          {breadcrumb}
        </p>
      </div>

      {/* Búsqueda global (placeholder en Phase 1) */}
      <div className="relative hidden md:block md:w-64 lg:w-80">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder="Buscar en todo…"
          aria-label="Buscar en todo el CRM"
          className="h-9 w-full rounded-lg border border-border bg-secondary/50 pl-9 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-[family-name:var(--font-geist-mono)] text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      {/* Notificaciones — badge de count usa el único rojo (--crm-danger) */}
      <button
        type="button"
        aria-label={
          notificationCount
            ? `Notificaciones, ${notificationCount} sin leer`
            : 'Notificaciones'
        }
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Bell className="size-4" aria-hidden="true" />
        {notificationCount != null && notificationCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 font-[family-name:var(--font-geist-mono)] text-[10px] leading-4 text-[var(--crm-danger-foreground)]"
            style={{ backgroundColor: 'var(--crm-danger)' }}
          >
            {notificationCount}
          </span>
        )}
      </button>
    </header>
  )
}
