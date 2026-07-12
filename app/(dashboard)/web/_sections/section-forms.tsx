'use client'

import { useId, useState, type ReactNode } from 'react'
import { ImageIcon, Minus, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  heroData,
  aboutData,
  servicesData,
  galleryData,
  rsvData,
  locationData,
  ctaData,
} from '@/lib/landing/schema'
import type { LandingConfig } from '@/lib/landing/schema'
import { groupHoursByDay, DIAS, HOURS_RENDER_ORDER } from '@/lib/landing/derive'
import type { Service, TimeBlock, PublicBusiness } from '@/lib/types'

// ── Forms de copy por sección (Phase 14, Plan 02 — EDIT-01, D-05) ───────────────────────
// Un form por sección, dirigido por los schemas `data` por-sección de lib/landing/schema.ts.
// Cada campo edita EXACTAMENTE una clave del `data` de esa sección; cada keystroke llama
// onDataChange({ campo: valor }) → el shell aplica setSectionData (merge shallow) al borrador →
// el preview reacciona. NADA se arma desde cero (L5): el reducer parte del config recibido.
//
// Por qué services/locations/hours son READ-ONLY acá: esas listas viven en sus propias tablas
// (services / locations / time_blocks) y se editan en sus pantallas (Servicios, Negocio → …).
// El config `data` solo aporta el copy que las envuelve (título/subtítulo, map_url/show_address).
// Mostrarlas acá read-only + un hint evita duplicar la fuente de verdad (D7-06).
//
// Por qué rsvData vive bajo `booking`: la galería/copy de confianza de la reserva (RSV strip, F12)
// se muestra ANTES del widget de reserva; el widget en sí es caja negra (no se edita acá).
//
// Las imágenes NO se instancian acá (cero lógica de upload — 14-03 la implementa). El shell/panel
// inyecta el control real por `imageSlot`; sin él, se rinde un placeholder (la costura queda visible).

// LocationLite: exactamente las columnas que la page fetchea y el renderer consume (mismo shape
// que web-client.tsx / section-list.tsx). No se traen columnas sensibles.
type LocationLite = { id: string; name: string; address: string | null; phone: string | null }

type Section = LandingConfig['sections'][number]

// Costura de imagen: el panel/shell pasa un render-prop que monta el control real (14-03). `field`
// es la clave del data (ej. 'hero.image', 'gallery.images'); `kind` distingue única vs multi-grid.
export type ImageSlotSpec = { field: string; kind: 'single' | 'multi'; label: string }
export type ImageSlot = (spec: ImageSlotSpec) => ReactNode

export interface SectionFormProps {
  section: Section
  onDataChange: (partial: Record<string, unknown>) => void
  services: Service[]
  locations: LocationLite[]
  timeBlocks: TimeBlock[]
  business: PublicBusiness
  businessId: string
  // Opcional (14-03): sin él, cada campo de imagen rinde un placeholder read-only.
  imageSlot?: ImageSlot
}

// ── Sub-componentes de campo reutilizables (labels SIEMPRE visibles, nunca placeholder-only) ──

function OptionalTag() {
  return <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
}

function TextField({
  label,
  value,
  onChange,
  optional,
  multiline,
  rows,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  optional?: boolean
  multiline?: boolean
  rows?: number
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {optional && <OptionalTag />}
      </Label>
      {multiline ? (
        <Textarea id={id} rows={rows ?? 3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}

// NumberStepper: campo numérico editable + botones − / +. Lo usan los ajustes de presentación del
// hero (opacidad de la foto, tamaño de cada texto).
// Dos decisiones que importan:
//  1) El valor SIEMPRE se clampea al [min,max] del schema antes de escribir al borrador. Si el
//     dueño tipea 500, se guarda el max — nunca un valor que el Zod del render vaya a descartar
//     (un valor fuera de rango degradaría a undefined y el ajuste "no haría nada", que se lee
//     como bug).
//  2) Se permite el campo VACÍO mientras se tipea (estado local) sin escribir al borrador: si no,
//     borrar para reescribir haría saltar el valor a min en cada tecla.
function NumberStepper({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 5,
}: {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
}) {
  const id = useId()
  const [text, setText] = useState(String(value))
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)))

  // Sincroniza el texto cuando el valor cambia desde afuera (ej. los botones − / +).
  function commit(n: number) {
    const c = clamp(n)
    setText(String(c))
    onChange(c)
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="min-h-11 min-w-11 shrink-0"
          aria-label={`Disminuir ${label}`}
          disabled={value <= min}
          onClick={() => commit(value - step)}
        >
          <Minus className="size-4" />
        </Button>
        <Input
          id={id}
          inputMode="numeric"
          value={text}
          className="max-w-[92px] text-center font-mono"
          onChange={(e) => {
            const raw = e.target.value
            setText(raw)
            // Vacío o a medio tipear → no escribimos al borrador todavía.
            if (raw.trim() === '') return
            const n = Number(raw)
            if (Number.isFinite(n)) onChange(clamp(n))
          }}
          // Al salir del campo normalizamos lo que quedó escrito (vacío/basura → el valor vigente).
          onBlur={() => {
            const n = Number(text)
            commit(Number.isFinite(n) && text.trim() !== '' ? n : value)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="min-h-11 min-w-11 shrink-0"
          aria-label={`Aumentar ${label}`}
          disabled={value >= max}
          onClick={() => commit(value + step)}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// URL field con validación https onBlur (UX inmediata; la validación no-bypasseable corre
// server-side al Guardar — T-14-06). Vacío = válido (el campo es opcional).
function UrlField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)

  function validate(v: string) {
    if (!v) {
      setError(null)
      return
    }
    try {
      const u = new URL(v)
      if (u.protocol !== 'https:') {
        setError('El enlace debe empezar con https://')
        return
      }
      setError(null)
    } catch {
      setError('Ingresá un enlace válido (https://…)')
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} <OptionalTag />
      </Label>
      <Input
        id={id}
        type="url"
        inputMode="url"
        placeholder="https://…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => validate(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

// Toggle booleano (show_address). Botón segmentado Sí/No con aria-pressed (no hay Switch en
// @/components/ui — mismo patrón segmentado que settings). Touch target ≥ 44px.
function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-pressed={value}
        onClick={() => onChange(!value)}
        className={cn(
          'inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          value
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {value ? 'Sí' : 'No'}
      </button>
    </div>
  )
}

// Panel read-only para listas derivadas (services/locations/hours): bg-muted/40 + hint explícito
// a la pantalla donde SÍ se editan, para que el dueño entienda por qué no son editables acá.
function ReadonlyPanel({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children?: ReactNode
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

// Placeholder de imagen cuando el shell no inyecta `imageSlot` (14-03 aún no cableado). Deja la
// costura visible sin acoplar este archivo al upload.
function ImageSeamFallback({ label, kind }: { label: string; kind: 'single' | 'multi' }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
        <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>
          {kind === 'multi' ? 'Galería de imágenes' : 'Imagen'} — la carga se habilita próximamente
        </span>
      </div>
    </div>
  )
}

function renderImage(imageSlot: ImageSlot | undefined, spec: ImageSlotSpec): ReactNode {
  return imageSlot ? imageSlot(spec) : <ImageSeamFallback label={spec.label} kind={spec.kind} />
}

// ── Dispatcher: un form por section.type ────────────────────────────────────────────────
export function SectionForm(props: SectionFormProps) {
  const { section, onDataChange, services, locations, timeBlocks, business, imageSlot } = props

  switch (section.type) {
    case 'hero': {
      const d = heroData.parse(section.data)
      return (
        <div className="space-y-4">
          <TextField
            label="Título principal"
            value={d.headline ?? ''}
            onChange={(v) => onDataChange({ headline: v })}
          />
          <TextField
            label="Bajada (kicker)"
            optional
            value={d.kicker ?? ''}
            onChange={(v) => onDataChange({ kicker: v })}
          />
          <TextField
            label="Subtítulo"
            optional
            multiline
            value={d.subhead ?? ''}
            onChange={(v) => onDataChange({ subhead: v })}
          />
          <TextField
            label="Texto del botón"
            optional
            value={d.cta_label ?? ''}
            onChange={(v) => onDataChange({ cta_label: v })}
          />
          {renderImage(imageSlot, { field: 'hero.image', kind: 'single', label: 'Imagen de portada' })}

          {/* ── Ajustes de presentación (solo Portada) ───────────────────────────────────
              La opacidad se muestra SOLO si hay foto: sin foto el hero rinde el campo de color
              (NoiseField) y el control no tendría sobre qué actuar. */}
          <div className="space-y-4 rounded-md border border-dashed p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ajustes de portada
            </p>

            {d.image ? (
              <NumberStepper
                label="Opacidad del fondo"
                hint="(0-100) · 100 = foto a full"
                value={d.image_opacity ?? 100}
                onChange={(v) => onDataChange({ image_opacity: v })}
                min={0}
                max={100}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Subí una imagen de portada para poder ajustar su opacidad.
              </p>
            )}

            <NumberStepper
              label="Tamaño del título"
              hint="(%)"
              value={d.headline_scale ?? 100}
              onChange={(v) => onDataChange({ headline_scale: v })}
              min={70}
              max={160}
            />
            {/* Los tres tamaños se muestran SIEMPRE, aunque el texto esté vacío: gatearlos por
                contenido escondía el control justo cuando el dueño estaba por escribir la bajada
                (y quedaba la sensación de que faltaba la opción). Sin texto, el ajuste no hace
                nada visible — pero está donde se lo espera. */}
            <NumberStepper
              label="Tamaño de la bajada"
              hint="(%)"
              value={d.kicker_scale ?? 100}
              onChange={(v) => onDataChange({ kicker_scale: v })}
              min={70}
              max={160}
            />
            <NumberStepper
              label="Tamaño del subtítulo"
              hint="(%)"
              value={d.subhead_scale ?? 100}
              onChange={(v) => onDataChange({ subhead_scale: v })}
              min={70}
              max={160}
            />
          </div>
        </div>
      )
    }

    case 'about': {
      const d = aboutData.parse(section.data)
      return (
        <div className="space-y-4">
          <TextField
            label="Título"
            value={d.title ?? ''}
            onChange={(v) => onDataChange({ title: v })}
          />
          <TextField
            label="Texto"
            multiline
            rows={5}
            value={d.body ?? ''}
            onChange={(v) => onDataChange({ body: v })}
          />
          {renderImage(imageSlot, { field: 'about.image', kind: 'single', label: 'Imagen' })}
        </div>
      )
    }

    case 'services': {
      const d = servicesData.parse(section.data)
      return (
        <div className="space-y-4">
          <TextField
            label="Título"
            value={d.title ?? ''}
            onChange={(v) => onDataChange({ title: v })}
          />
          <TextField
            label="Subtítulo"
            optional
            value={d.subtitle ?? ''}
            onChange={(v) => onDataChange({ subtitle: v })}
          />
          <ReadonlyPanel title="Servicios" hint="La lista se edita en Servicios.">
            {services.length > 0 ? (
              <ul className="space-y-1">
                {services.map((s) => (
                  <li key={s.id} className="text-sm text-foreground">
                    {s.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no cargaste servicios.</p>
            )}
          </ReadonlyPanel>
        </div>
      )
    }

    case 'gallery': {
      const d = galleryData.parse(section.data)
      return (
        <div className="space-y-4">
          <TextField
            label="Título"
            optional
            value={d.title ?? ''}
            onChange={(v) => onDataChange({ title: v })}
          />
          {renderImage(imageSlot, { field: 'gallery.images', kind: 'multi', label: 'Imágenes' })}
        </div>
      )
    }

    case 'location': {
      const d = locationData.parse(section.data)
      return (
        <div className="space-y-4">
          <TextField
            label="Título"
            optional
            value={d.title ?? ''}
            onChange={(v) => onDataChange({ title: v })}
          />
          <UrlField
            label="Enlace del mapa"
            value={d.map_url ?? ''}
            onChange={(v) => onDataChange({ map_url: v })}
          />
          <ToggleField
            label="Mostrar la dirección"
            value={d.show_address ?? false}
            onChange={(v) => onDataChange({ show_address: v })}
          />
          <ReadonlyPanel title="Sucursales" hint="Las sucursales se editan en Negocio → Ubicaciones.">
            {locations.length > 0 ? (
              <ul className="space-y-1">
                {locations.map((l) => (
                  <li key={l.id} className="text-sm text-foreground">
                    {l.name}
                    {l.address ? <span className="text-muted-foreground"> — {l.address}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no cargaste sucursales.</p>
            )}
          </ReadonlyPanel>
        </div>
      )
    }

    case 'hours': {
      // hours NO tiene copy: deriva 100% de time_blocks. Panel informativo read-only + preview
      // del horario actual (mismo agrupado que el renderer, groupHoursByDay).
      const byDay = groupHoursByDay(timeBlocks)
      return (
        <div className="space-y-4">
          <ReadonlyPanel
            title="Horarios"
            hint="Los horarios se editan en Negocio → Horarios."
          >
            {timeBlocks.length > 0 ? (
              <ul className="space-y-1">
                {HOURS_RENDER_ORDER.filter((day) => byDay.has(day)).map((day) => (
                  <li key={day} className="text-sm text-foreground">
                    <span className="font-medium">{DIAS[day]}:</span>{' '}
                    <span className="text-muted-foreground">{byDay.get(day)!.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todavía no cargaste horarios.</p>
            )}
          </ReadonlyPanel>
        </div>
      )
    }

    case 'cta': {
      const d = ctaData.parse(section.data)
      const links = d.links ?? []
      return (
        <div className="space-y-4">
          <TextField
            label="Título del llamado a la acción"
            value={d.headline ?? ''}
            onChange={(v) => onDataChange({ headline: v })}
          />
          <TextField
            label="Texto del botón de reserva"
            optional
            value={d.primary_label ?? ''}
            onChange={(v) => onDataChange({ primary_label: v })}
          />

          {/* Botones extra (Instagram, la carta, cómo llegar…). El de WhatsApp NO se lista acá:
              sale solo del número del negocio. */}
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Botones extra
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {business.whatsapp
                  ? 'El botón de WhatsApp ya aparece solo, con el número de tu negocio.'
                  : 'Cargá tu WhatsApp en Negocio para que aparezca también ese botón.'}
              </p>
            </div>

            {links.map((l, i) => (
              <div key={i} className="space-y-2 rounded-md border bg-secondary/40 p-2.5">
                <TextField
                  label="Texto del botón"
                  value={l.label}
                  onChange={(v) =>
                    onDataChange({ links: links.map((x, j) => (j === i ? { ...x, label: v } : x)) })
                  }
                />
                <UrlField
                  label="Enlace"
                  value={l.url}
                  onChange={(v) =>
                    onDataChange({ links: links.map((x, j) => (j === i ? { ...x, url: v } : x)) })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9 text-destructive hover:text-destructive"
                  onClick={() => onDataChange({ links: links.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" />
                  Quitar botón
                </Button>
              </div>
            ))}

            {/* Tope de 3 (el schema también lo corta). El CTA tiene UN objetivo —reservar— y cada
                botón que se suma compite con él. */}
            {links.length < 3 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11 w-full"
                onClick={() => onDataChange({ links: [...links, { label: '', url: '' }] })}
              >
                <Plus className="size-4" />
                Agregar botón
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Máximo 3 botones extra: más opciones compiten con el de reservar.
              </p>
            )}
          </div>
        </div>
      )
    }

    case 'booking': {
      // El widget de reserva es caja negra (no se edita). Editable = solo el copy/galería de la
      // RSV strip (rsvData), la franja de confianza que se muestra antes de reservar.
      const d = rsvData.parse(section.data)
      return (
        <div className="space-y-4">
          <TextField
            label="Título de la reserva"
            optional
            value={d.header ?? ''}
            onChange={(v) => onDataChange({ header: v })}
          />
          <TextField
            label="Texto introductorio"
            optional
            multiline
            value={d.intro ?? ''}
            onChange={(v) => onDataChange({ intro: v })}
          />
          {renderImage(imageSlot, { field: 'rsvData.images', kind: 'multi', label: 'Galería de la reserva' })}
        </div>
      )
    }

    default:
      return null
  }
}
