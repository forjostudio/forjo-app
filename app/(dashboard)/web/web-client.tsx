'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { LandingRenderer } from '@/components/landing/landing-renderer'
import { parseLandingConfig, DEFAULT_LANDING_CONFIG } from '@/lib/landing/schema'
import { resolveLandingTheme } from '@/lib/landing/theme'
import type { LandingConfig } from '@/lib/landing/schema'
import type { PublicBusiness, Service, Professional, TimeBlock } from '@/lib/types'
import {
  setSectionData,
  moveSection,
  toggleSection,
  setTheme,
  setMotion,
  isDirty,
} from '@/lib/landing/editor-draft'
import { saveLandingConfig } from './_landing-actions'
import { SectionListPanel } from './_sections/section-list'
import { ThemeControls } from './_sections/theme-controls'

// ── Editor CMS client: shell del split editor ↔ preview en vivo (Phase 14, D-01/D-03) ────
//
// Este es el ESQUELETO sobre el que enchufan los tres sub-editores (14-02/03/04). Responsabilidades:
//   - Mantiene el BORRADOR completo del landing_config en memoria (D-03): overwrite-total, así que
//     el draft carga el config real y se muta con lib/landing/editor-draft.ts — nunca se arma desde
//     cero (landmine L5: Zod v4 estripa claves no reconstruidas al guardar).
//   - PREVIEW EN VIVO: importa LandingRenderer DIRECTO y lo renderiza client-side con config={draft}
//     (RESEARCH Focus 1: el renderer es una función PURA de props, sin dependencia server-only, así
//     que arrastrarlo al bundle client desde este boundary 'use client' es legal). El tema se aplica
//     al WRAPPER del preview vía data-attributes + --primary inline (L6: NUNCA al <html>, repintaría
//     el chrome del panel). El overflow/scroll del marco va en el contenedor EXTERNO, nunca sobre un
//     ancestro de #reservar dentro de .frj-site (L7: rompería vaul/sonner/date-picker del booking).
//   - SAVE BAR: arma el config COMPLETO (el draft) y llama saveLandingConfig (overwrite-total); mapea
//     los 6 códigos de error a toasts (14-UI-SPEC §6). Deshabilitada sin cambios o con uploads en
//     vuelo (L9). Éxito → baseline = draft (limpia el flag de cambios sin guardar, D-03c).
//   - CONFIRM-ON-EXIT: beforeunload + dialog cuando hay cambios sin guardar (D-03b).
//   - EMPTY-STATE: config null → siembra DEFAULT_LANDING_CONFIG y muestra el notice (§7); el preview
//     igual renderiza el default.

// LocationLite/ExceptionLite: exactamente las columnas que la page fetchea y el renderer consume.
type LocationLite = { id: string; name: string; address: string | null; phone: string | null }
type ExceptionLite = {
  date: string
  closed: boolean
  start_time: string | null
  end_time: string | null
  location_id: string | null
}

interface Props {
  business: PublicBusiness
  // landing_config crudo (jsonb): se parsea acá y se siembra DEFAULT si es null (D-03).
  initialConfig: unknown
  services: Service[]
  professionals: Professional[]
  timeBlocks: TimeBlock[]
  exceptions: ExceptionLite[]
  locations: LocationLite[]
}

// Mapa de códigos de error de saveLandingConfig → toast en español (14-UI-SPEC §6, D-03c).
const SAVE_ERROR_COPY: Record<string, string> = {
  cms_disabled: 'El editor no está disponible en este momento.',
  unauthorized: 'Tu sesión expiró. Volvé a iniciar sesión.',
  no_business: 'No encontramos tu negocio. Recargá la página.',
  invalid_config: 'Hay un dato inválido en tu web. Revisá los campos marcados.',
  update_failed: 'No se pudieron guardar los cambios. Probá de nuevo.',
  server_error: 'Ocurrió un error al guardar. Probá de nuevo en unos segundos.',
}

export function WebEditorClient({
  business,
  initialConfig,
  services,
  professionals,
  timeBlocks,
  exceptions,
  locations,
}: Props) {
  // Si el negocio nunca optó por una landing, initialConfig es null → empty-state + seed del DEFAULT.
  const isEmpty = initialConfig === null || initialConfig === undefined
  // Borrador inicial: el config parseado, o el DEFAULT sembrado (D-03 / §7).
  const seeded = useMemo<LandingConfig>(
    () => parseLandingConfig(initialConfig) ?? DEFAULT_LANDING_CONFIG,
    [initialConfig],
  )

  const [draft, setDraft] = useState<LandingConfig>(seeded)
  // Baseline de "lo último guardado" para isDirty/confirm-on-exit. Al Guardar con éxito → draft.
  const [savedBaseline, setSavedBaseline] = useState<LandingConfig>(seeded)
  // Contador de uploads en vuelo (lo suben/bajan los controles de imagen, 14-03). >0 → bloquea Save (L9).
  const [uploading, setUploading] = useState(0)
  const [saving, setSaving] = useState(false)
  // Mobile: toggle Editar / Vista previa (§1). Desktop es split y este estado se ignora.
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  // Confirm-on-exit dialog.
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const dirty = isDirty(draft, savedBaseline)

  // ── Callbacks de mutación del borrador (todo pasa por editor-draft.ts) ──────────────────
  const onMove = useCallback(
    (type: LandingConfig['sections'][number]['type'], dir: 'up' | 'down') =>
      setDraft((d) => moveSection(d, type, dir)),
    [],
  )
  const onToggle = useCallback(
    (type: LandingConfig['sections'][number]['type']) =>
      setDraft((d) => toggleSection(d, type)),
    [],
  )
  const onSectionDataChange = useCallback(
    (type: LandingConfig['sections'][number]['type'], partialData: Record<string, unknown>) =>
      setDraft((d) => setSectionData(d, type, partialData)),
    [],
  )
  const onThemeChange = useCallback(
    (patch: { preset?: string; palette?: string; primary?: string | undefined }) =>
      setDraft((d) => setTheme(d, patch)),
    [],
  )
  const onMotionChange = useCallback(
    (level: 'none' | 'subtle' | 'premium') => setDraft((d) => setMotion(d, level)),
    [],
  )
  // Los controles de imagen suben/bajan el contador de uploads en vuelo (delta +1/-1).
  const onUploadingChange = useCallback((delta: number) => {
    setUploading((n) => Math.max(0, n + delta))
  }, [])

  // ── Guardar: config COMPLETO (el draft) → saveLandingConfig (overwrite-total) ───────────
  async function handleSave() {
    if (saving || !dirty || uploading > 0) return
    setSaving(true)
    const res = await saveLandingConfig(draft)
    setSaving(false)
    if (res.ok) {
      toast.success('Cambios guardados')
      // D-03c: limpiar el flag de cambios sin guardar → baseline pasa a ser el draft actual.
      setSavedBaseline(draft)
    } else {
      toast.error(SAVE_ERROR_COPY[res.error] ?? SAVE_ERROR_COPY.server_error)
    }
  }

  // ── Confirm-on-exit: beforeunload nativo cuando hay cambios sin guardar (D-03b) ─────────
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return
      e.preventDefault()
      // Los navegadores muestran su propio mensaje; setear returnValue activa el prompt.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // ── Preview: tema resuelto para el WRAPPER (L6) ─────────────────────────────────────────
  // resolveLandingTheme mapea draft.theme (preset/overrides) al motor, con fallback a los
  // businesses.theme/palette/font (el chrome de marca) para un config recién sembrado. Los
  // atributos data-* + --primary van al wrapper .frj-site del preview, jamás al <html>.
  const t = useMemo(
    () =>
      resolveLandingTheme(draft.theme, {
        theme: business.theme,
        palette: business.palette,
        font: business.font,
      }),
    [draft.theme, business.theme, business.palette, business.font],
  )

  const preview = (
    // Marco EXTERNO: el overflow/redondeo vive ACÁ, fuera de .frj-site (L7). Nunca poner
    // overflow/transform en un ancestro de #reservar dentro de .frj-site.
    <div className="overflow-hidden rounded-lg border bg-background">
      <div
        className="frj-site"
        // Tema al wrapper (L6): omitir 'forjo'/'auto' igual que PaletteScript; --primary sólo si es válido.
        data-theme={t.theme !== 'forjo' ? t.theme : undefined}
        data-palette={t.palette}
        data-font={t.font !== 'auto' ? t.font : undefined}
        style={t.primary ? ({ ['--primary']: t.primary } as React.CSSProperties) : undefined}
      >
        <LandingRenderer
          config={draft}
          business={business}
          services={services}
          professionals={professionals}
          timeBlocks={timeBlocks}
          exceptions={exceptions}
          locations={locations}
        />
      </div>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Gestión</p>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Tu web</h1>
      </header>

      {/* Mobile: segmented Editar / Vista previa (§1). Oculto en desktop (split). */}
      <div className="mb-4 inline-flex rounded-lg border border-border bg-secondary/30 p-1 lg:hidden">
        {(
          [
            { key: 'edit', label: 'Editar' },
            { key: 'preview', label: 'Vista previa' },
          ] as const
        ).map((opt) => {
          const active = mobileView === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMobileView(opt.key)}
              aria-pressed={active}
              className={cn(
                'min-h-11 rounded-md px-4 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(380px,440px)_1fr] lg:gap-8">
        {/* ── Columna editor (scrollable) ── */}
        <div
          className={cn(
            'space-y-6 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2',
            mobileView === 'preview' && 'hidden lg:block',
          )}
        >
          {isEmpty && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Todavía no personalizaste tu web</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Arrancá desde la plantilla base y editá cada sección. Los cambios se ven en la vista
                previa; se publican recién cuando tocás <strong>Guardar cambios</strong>.
              </p>
            </div>
          )}

          <SectionListPanel
            draft={draft}
            onMove={onMove}
            onToggle={onToggle}
            onSectionDataChange={onSectionDataChange}
            services={services}
            locations={locations}
            timeBlocks={timeBlocks}
            business={business}
          />

          <ThemeControls
            theme={draft.theme}
            onChange={onThemeChange}
            motion={draft.motion ?? 'none'}
            onMotionChange={onMotionChange}
          />

          {/* Save bar sticky (§6): Save nunca detrás del scroll. */}
          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
            <span
              className={cn('text-xs', dirty ? 'text-primary' : 'text-muted-foreground')}
              aria-live="polite"
            >
              {dirty ? (
                <>
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle"
                  />
                  Cambios sin guardar
                </>
              ) : (
                'Todo guardado'
              )}
            </span>
            <Button onClick={handleSave} disabled={saving || !dirty || uploading > 0}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </div>

        {/* ── Columna preview (sticky en desktop) ── */}
        <div
          className={cn(
            'lg:sticky lg:top-6 lg:self-start',
            mobileView === 'edit' && 'hidden lg:block',
          )}
        >
          {preview}
        </div>
      </div>

      {/* Confirm-on-exit dialog (D-03b): lo dispara la navegación interna interceptada por 14-02+
          (los enlaces del panel). El shell expone el control; el prompt de recarga usa beforeunload. */}
      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tenés cambios sin guardar</DialogTitle>
            <DialogDescription>
              Si salís ahora perdés los cambios que no guardaste.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowExitConfirm(false)}>
              Seguir editando
            </Button>
            <Button variant="destructive" onClick={() => setShowExitConfirm(false)}>
              Descartar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
