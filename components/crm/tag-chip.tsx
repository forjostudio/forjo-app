import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * TagChip — chip de tag (dot de color + texto), reusable por el pipeline (Plan 02), la ficha y el
 * directorio (Plan 03). Modelado sobre components/crm/status-badge.tsx: pill con dot inline cuyo color
 * lo lleva el `style` (es dinámico por tag, no una variante fija), tokens CSS del shell CRM, nunca hex.
 *
 * Controlado por el padre (sin estado propio):
 *   - default              → chip estático (solo muestra la tag).
 *   - onToggle + selected  → botón toggle para el filtro (aria-pressed, área clickable ≥44px, focus ring).
 *   - removable + onRemove → muestra una X (lucide) para desasignar la tag.
 */
export function TagChip({
  label,
  color,
  selected = false,
  onToggle,
  removable = false,
  onRemove,
  className,
}: {
  label: string
  color: string
  selected?: boolean
  onToggle?: () => void
  removable?: boolean
  onRemove?: () => void
  className?: string
}) {
  const dot = (
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )

  const pillBase =
    'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs whitespace-nowrap'

  // Variante toggle: botón con aria-pressed. min-h-11 (44px) garantiza el touch target aunque el pill
  // visual sea más bajo; focus-visible deja el ring accesible (CLAUDE.md: estado focus visible).
  if (onToggle) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={onToggle}
        className={cn(
          'inline-flex min-h-11 items-center outline-none',
          'focus-visible:ring-ring/50 rounded-4xl focus-visible:ring-2',
          className,
        )}
      >
        <span
          className={cn(
            pillBase,
            selected
              ? 'border-border bg-secondary text-foreground'
              : 'border-border bg-transparent text-muted-foreground',
          )}
        >
          {dot}
          {label}
        </span>
      </button>
    )
  }

  // Variante estática (con o sin botón de remover).
  return (
    <span className={cn(pillBase, 'border-border bg-secondary text-foreground', className)}>
      {dot}
      {label}
      {removable && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar tag ${label}`}
          className="focus-visible:ring-ring/50 -mr-1 ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-full outline-none hover:opacity-70 focus-visible:ring-2"
        >
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  )
}
