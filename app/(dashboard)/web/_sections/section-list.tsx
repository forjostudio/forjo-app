'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, Eye, EyeOff, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { LandingConfig } from '@/lib/landing/schema'
import type { PublicBusiness, Service, TimeBlock } from '@/lib/types'
import { normalizeSections } from '@/lib/landing/editor-draft'
import { SectionForm } from './section-forms'
import { SingleImageControl, ImageGridControl } from './image-controls'

// ── SectionListPanel (Phase 14, Plan 02 — EDIT-03) ──────────────────────────────────────
// Implementa el contrato FINAL que el stub de 14-01 ya declaraba (misma firma; el shell
// web-client.tsx ya pasa los 4 datos read-only). Panel del set FIJO de 8 secciones:
//   - Se listan SIEMPRE las 8 (SECTION_TYPES), en orden por `order`, sin filtrar enabled: acá
//     se administran todas, incluidas las ocultas (a diferencia de orderedSections del render).
//   - Reorden por FLECHAS subir/bajar (NO drag-and-drop, D-04: cero dependencia nueva). Cada
//     flecha invoca onMove → moveSection (swap de `order` con la vecina; no-op en bordes). La
//     primera fila no puede subir; la última no puede bajar (botón disabled).
//   - Toggle enabled por sección (Eye/EyeOff, botón segmentado — no hay Switch en @/components/ui).
//     `booking` queda LOCKED-ON (D-04b: lockear SOLO booking; hero sigue togglable) porque el
//     render server-side (orderedSections) la re-inyecta siempre aunque esté off — apagarla acá
//     confundiría sin efecto real.
//   - Expand-to-edit: click en el label abre el form de copy de esa sección (acordeón inline;
//     una abierta a la vez). Una sección enabled:false sigue expandible (se edita aunque esté oculta).
//   - Reorden anunciado a AT via región aria-live="polite".

// LocationLite: el shell pasa las locations con las columnas acotadas del renderer.
type LocationLite = { id: string; name: string; address: string | null; phone: string | null }

type SectionType = LandingConfig['sections'][number]['type']

// Labels en español (14-UI-SPEC Copywriting). Set fijo — coincide 1:1 con SECTION_TYPES.
const LABELS: Record<SectionType, string> = {
  hero: 'Portada',
  about: 'Nosotros',
  services: 'Servicios',
  gallery: 'Galería',
  location: 'Ubicación',
  hours: 'Horarios',
  cta: 'Llamado a la acción',
  booking: 'Reservas',
}

// Secciones con toggle bloqueado en "visible" (D-04b): SOLO booking (núcleo del producto).
const LOCKED_ON: ReadonlySet<SectionType> = new Set<SectionType>(['booking'])

export interface SectionListPanelProps {
  draft: LandingConfig
  onMove: (type: SectionType, dir: 'up' | 'down') => void
  onToggle: (type: SectionType) => void
  onSectionDataChange: (type: SectionType, partialData: Record<string, unknown>) => void
  services: Service[]
  locations: LocationLite[]
  timeBlocks: TimeBlock[]
  business: PublicBusiness
  // Señal de uploads-en-vuelo hacia el shell (gatea Guardar mientras hay subidas). Los controles de
  // imagen (14-03) se montan acá vía imageSlot y reportan hacia arriba por este callback.
  onUploadingChange: (delta: number) => void
}

export function SectionListPanel({
  draft,
  onMove,
  onToggle,
  onSectionDataChange,
  services,
  locations,
  timeBlocks,
  business,
  onUploadingChange,
}: SectionListPanelProps) {
  // Sección expandida (una a la vez). null = todas colapsadas.
  const [openType, setOpenType] = useState<SectionType | null>(null)
  // Mensaje para el lector de pantalla tras un reorden (aria-live polite).
  const [announce, setAnnounce] = useState('')

  // Orden de administración: SIEMPRE las 8 fijas (must-have truth #1). normalizeSections materializa
  // las que el config real omite (booking, y about/gallery/… vacías) y las devuelve ya ordenadas por
  // `order` contiguo — sin filtrar enabled (se administran también las ocultas). Los mutadores del
  // shell normalizan igual, así que togglear/editar/reordenar una fila sintetizada la crea de verdad.
  const ordered = normalizeSections(draft).sections

  function handleMove(type: SectionType, dir: 'up' | 'down', idx: number) {
    onMove(type, dir)
    // Nueva posición 1-based: subir → idx (0-based idx-1 +1); bajar → idx+2 (0-based idx+1 +1).
    const newPos = dir === 'up' ? idx : idx + 2
    setAnnounce(`Sección movida a la posición ${newPos}`)
  }

  return (
    <div className="space-y-2" aria-label="Secciones de la web">
      <div>
        <p className="text-sm font-semibold">Secciones</p>
        <p className="text-xs text-muted-foreground">
          Reordená con las flechas y mostrá u ocultá cada sección. Tocá el nombre para editar su
          contenido.
        </p>
      </div>

      <ul className="space-y-2">
        {ordered.map((s, i) => {
          const isFirst = i === 0
          const isLast = i === ordered.length - 1
          const locked = LOCKED_ON.has(s.type)
          const open = openType === s.type

          return (
            <li key={s.type} className="rounded-md border bg-secondary">
              <div className="flex items-center gap-1.5 p-2">
                {/* Grip decorativo: señala "arrastrable-ish" pero el reorden es por flechas (NO DnD). */}
                <GripVertical
                  className="size-4 shrink-0 text-muted-foreground/40"
                  aria-hidden="true"
                />

                {/* Label = disparador del acordeón. enabled:false → texto atenuado (sigue editable). */}
                <button
                  type="button"
                  onClick={() => setOpenType(open ? null : s.type)}
                  aria-expanded={open}
                  className={cn(
                    'flex-1 rounded px-1 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    s.enabled ? '' : 'text-muted-foreground',
                  )}
                >
                  {LABELS[s.type]}
                </button>

                {/* Subir: disabled en la primera fila. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  disabled={isFirst}
                  aria-disabled={isFirst}
                  aria-label="Subir sección"
                  onClick={() => handleMove(s.type, 'up', i)}
                >
                  <ChevronUp className="size-4" />
                </Button>

                {/* Bajar: disabled en la última fila. */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  disabled={isLast}
                  aria-disabled={isLast}
                  aria-label="Bajar sección"
                  onClick={() => handleMove(s.type, 'down', i)}
                >
                  <ChevronDown className="size-4" />
                </Button>

                {/* Toggle enabled (Eye/EyeOff). booking queda locked-on (disabled, pinned "on"). */}
                <button
                  type="button"
                  aria-pressed={s.enabled}
                  aria-label={s.enabled ? 'Visible' : 'Oculta'}
                  disabled={locked}
                  title={locked ? 'Esta sección siempre se muestra' : undefined}
                  onClick={() => {
                    if (!locked) onToggle(s.type)
                  }}
                  className={cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    s.enabled
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                    locked && 'cursor-not-allowed opacity-70',
                  )}
                >
                  {s.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
              </div>

              {locked && (
                <p className="px-3 pb-2 text-xs text-muted-foreground">
                  Esta sección siempre se muestra
                </p>
              )}

              {open && (
                <div className="border-t p-3">
                  <SectionForm
                    section={s}
                    onDataChange={(partial) => onSectionDataChange(s.type, partial)}
                    services={services}
                    locations={locations}
                    timeBlocks={timeBlocks}
                    business={business}
                    businessId={business.id}
                    imageSlot={(spec) => {
                      // La clave del `data` es el segmento tras el punto: 'hero.image'→'image',
                      // 'gallery.images'→'images', 'rsvData.images'→'images'. El businessId sale del
                      // business de la SESIÓN (props del shell), jamás del cliente (aislamiento RLS).
                      const key = spec.field.split('.')[1]
                      const data = (s.data ?? {}) as Record<string, unknown>
                      return spec.kind === 'single' ? (
                        <SingleImageControl
                          businessId={business.id}
                          value={typeof data[key] === 'string' ? (data[key] as string) : undefined}
                          onChange={(url) => onSectionDataChange(s.type, { [key]: url })}
                          onUploadingChange={onUploadingChange}
                        />
                      ) : (
                        <ImageGridControl
                          businessId={business.id}
                          values={Array.isArray(data[key]) ? (data[key] as string[]) : []}
                          onChange={(urls) => onSectionDataChange(s.type, { [key]: urls })}
                          onUploadingChange={onUploadingChange}
                        />
                      )
                    }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Anuncio del reorden a AT — no visual, solo lector de pantalla. */}
      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  )
}
