'use client'

import type { LandingConfig } from '@/lib/landing/schema'
import type { PublicBusiness, Service, TimeBlock } from '@/lib/types'

// ── STUB: SectionListPanel (Phase 14) — contrato de props FINAL ────────────────────────
// Este stub declara la firma COMPLETA que 14-02 implementa SIN cambiarla ni tocar el shell.
// El shell (web-client.tsx) ya le pasa los 4 datos read-only (services/locations/timeBlocks/
// business) que las forms de sección necesitan para los paneles derivados (servicios/ubicación/
// horarios son read-only acá — vienen de sus tablas). Todas las mutaciones del borrador viajan
// por los callbacks onMove/onToggle/onSectionDataChange, que el shell cablea a lib/landing/
// editor-draft.ts. Implementación real (8 filas fijas, reorder up/down, toggle enabled, forms de
// copy por sección) → Plan 14-02.

// LocationLite: el shell pasa las locations con las columnas acotadas del renderer.
type LocationLite = { id: string; name: string; address: string | null; phone: string | null }

type SectionType = LandingConfig['sections'][number]['type']

export interface SectionListPanelProps {
  draft: LandingConfig
  onMove: (type: SectionType, dir: 'up' | 'down') => void
  onToggle: (type: SectionType) => void
  onSectionDataChange: (type: SectionType, partialData: Record<string, unknown>) => void
  services: Service[]
  locations: LocationLite[]
  timeBlocks: TimeBlock[]
  business: PublicBusiness
}

export function SectionListPanel(props: SectionListPanelProps) {
  // Stub mínimo real: lista las secciones en orden actual con su estado. La UI completa
  // (reorder/toggle/forms) llega en 14-02; acá sólo garantizamos que el shell compila y monta algo.
  const ordered = [...props.draft.sections].sort((a, b) => a.order - b.order)
  return (
    <div className="space-y-2" aria-label="Secciones de la web">
      <p className="text-sm font-semibold">Secciones</p>
      <ul className="space-y-1">
        {ordered.map((s) => (
          <li
            key={s.type}
            className="flex items-center gap-2 rounded-md border bg-secondary p-3 text-sm"
          >
            <span className={s.enabled ? '' : 'text-muted-foreground'}>{s.type}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Reorden y edición por sección — próximamente.</p>
    </div>
  )
}
