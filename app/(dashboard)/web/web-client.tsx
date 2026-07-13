'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
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
import type { LandingConfig } from '@/lib/landing/schema'
import type { PublicBusiness, Service, Professional, TimeBlock } from '@/lib/types'
import {
  setSectionData,
  moveSection,
  toggleSection,
  setTheme,
  setMotion,
  stripPrimary,
  isDirty,
  deriveEditorState,
} from '@/lib/landing/editor-draft'
import { saveLandingDraft, publishLanding, discardLandingDraft } from './_landing-actions'
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
//   - SAVE BAR: arma el config COMPLETO (el draft) y llama saveLandingDraft (overwrite-total del
//     BORRADOR — desde Phase 15 guardar NO publica: la web al aire no se mueve, PUB-03); mapea
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
  // landing_draft crudo (jsonb), con coalesce a lo publicado: semilla del borrador en memoria y
  // baseline de "lo guardado". null → se siembra DEFAULT_LANDING_CONFIG (D-03 / empty-state).
  initialDraft: unknown
  // landing_config crudo (jsonb): baseline de "lo publicado". **null ⇒ NUNCA PUBLICÓ** — es la señal
  // que dispara el aviso de empty-state y (en 15-03) el dialog de go-live. No se coacciona a DEFAULT.
  publishedConfig: unknown
  services: Service[]
  professionals: Professional[]
  timeBlocks: TimeBlock[]
  exceptions: ExceptionLite[]
  locations: LocationLite[]
}

// Mapa ÚNICO de códigos de error → toast en español, compartido por las 3 acciones (15-UI-SPEC
// §Errores). Las 3 espejan el mismo patrón de Server Action owner-only (D-16) y devuelven el mismo
// { ok:false, error:'<snake>' }, así que un solo mapa alcanza. Fallback: código desconocido →
// server_error. Regla de CLAUDE.md: todo error dice QUÉ pasó + QUÉ hacer.
const ACTION_ERROR_COPY: Record<string, string> = {
  cms_disabled: 'El editor no está disponible en este momento.',
  // not_entitled: el negocio no tiene el add-on de web a medida (has_web_custom). En la práctica
  // no debería verse — la page ya hace notFound() sin el entitlement — pero el write path lo
  // rechaza igual (defensa en profundidad), así que el código tiene su copy.
  not_entitled: 'Tu plan no incluye la edición de la web. Escribinos para activarla.',
  unauthorized: 'Tu sesión expiró. Volvé a iniciar sesión.',
  no_business: 'No encontramos tu negocio. Recargá la página.',
  invalid_config: 'Hay un dato inválido en tu web. Revisá los campos marcados.',
  update_failed: 'No se pudo guardar el borrador. Probá de nuevo.',
  server_error: 'Ocurrió un error. Probá de nuevo en unos segundos.',
  // Códigos de Phase 15 (publicar / descartar).
  no_draft: 'No hay nada para publicar. Guardá algún cambio primero.',
  publish_failed: 'No se pudo publicar tu web. Probá de nuevo.',
  discard_failed: 'No se pudo descartar el borrador. Probá de nuevo.',
  invalid_draft: 'El borrador tiene un dato inválido y no se puede publicar. Revisá los campos marcados.',
}

// ── Indicador de 3 estados excluyentes (D-06 / 15-UI-SPEC §5) ────────────────────────────
// El estado NUNCA se comunica solo por color (WCAG 1.4.1): cada uno tiene su propio texto y el
// publicado además cambia de glifo (punto → check). Mismo tamaño y peso en los 3 (nada de bold).
type EditorState = 'unsaved' | 'unpublished' | 'published'
const STATE_LABEL: Record<EditorState, string> = {
  unsaved: 'Cambios sin guardar',
  unpublished: 'Guardado — sin publicar',
  published: 'Publicado',
}
const STATE_TONE: Record<EditorState, string> = {
  unsaved: 'text-primary',
  unpublished: 'text-warning',
  published: 'text-muted-foreground',
}
const STATE_DOT: Record<EditorState, string> = {
  unsaved: 'bg-primary',
  unpublished: 'bg-warning',
  published: '', // el estado publicado usa el ícono Check, no el punto
}

export function WebEditorClient({
  business,
  initialDraft,
  publishedConfig,
  services,
  professionals,
  timeBlocks,
  exceptions,
  locations,
}: Props) {
  // Borrador inicial: el config parseado, o el DEFAULT sembrado (D-03 / §7).
  // stripPrimary: se quitó el control "Color principal" del editor (pisaba el acento de cualquier
  // paleta y dejaba los swatches decorativos). Normalizamos ACÁ, en el seed, porque `seeded`
  // alimenta a la vez el borrador Y el baseline → el editor NO abre marcado como "cambios sin
  // guardar", pero el primary ya no pisa nada y el próximo guardado lo persiste limpio.
  const seeded = useMemo<LandingConfig>(
    () => stripPrimary(parseLandingConfig(initialDraft) ?? DEFAULT_LANDING_CONFIG),
    [initialDraft],
  )

  // Baseline de LO PUBLICADO. Pasa por EL MISMO pipeline de normalización que el borrador: si el
  // publicado se parseara distinto (p. ej. sin stripPrimary), un negocio con un `overrides.primary`
  // guardado abriría el editor diciendo "sin publicar" sin haber tocado nada — falso positivo
  // permanente. ÚNICA asimetría legítima: null se PRESERVA como null (señal de "nunca publicó"), no
  // se coacciona a DEFAULT_LANDING_CONFIG.
  // Es ESTADO, no memo: al publicar con éxito lo publicado pasa a ser el borrador actual EN MEMORIA
  // (D-02/D-10) — sin refetch, sin router.refresh(), sin revalidatePath (la web pública es
  // force-dynamic: no hay caché que invalidar, y revalidar desde una Server Function refrescaría
  // todas las páginas del panel ya visitadas).
  const [publishedBaseline, setPublishedBaseline] = useState<LandingConfig | null>(() =>
    publishedConfig === null || publishedConfig === undefined
      ? null
      : stripPrimary(parseLandingConfig(publishedConfig)!),
  )

  const [draft, setDraft] = useState<LandingConfig>(seeded)
  // Baseline de "lo último guardado" para isDirty/confirm-on-exit. Al Guardar con éxito → draft.
  const [savedBaseline, setSavedBaseline] = useState<LandingConfig>(seeded)
  // Contador de uploads en vuelo (lo suben/bajan los controles de imagen, 14-03). >0 → bloquea Save (L9).
  const [uploading, setUploading] = useState(0)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // Mobile: toggle Editar / Vista previa (§1). Desktop es split y este estado se ignora.
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit')
  // Dialogs de la barra publish: go-live (primera publicación) y descarte destructivo.
  const [showGoLive, setShowGoLive] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

  const dirty = isDirty(draft, savedBaseline)
  // Estado del editor derivado del CONTENIDO (D-03/D-06), sin flag ni timestamp en la DB: manda
  // "sin guardar"; si no, "sin publicar" (incluye el caso nunca-publicó); si no, "publicado".
  const editorState = deriveEditorState({ draft, savedBaseline, published: publishedBaseline })
  // NUNCA PUBLICÓ: la señal que dispara el dialog de go-live (D-08 — exactamente una vez en la vida
  // del negocio, derivada de los datos, sin casilla "no volver a mostrar") y el aviso de empty-state.
  // Sale del baseline EN MEMORIA, así que tras la primera publicación deja de ser true sin recargar.
  const neverPublished = publishedBaseline === null
  // ¿El borrador sigue siendo la plantilla base sembrada? Decide CUÁL de las dos variantes del aviso
  // se muestra (§9). NO es un chequeo de calidad y no bloquea nada (D-11).
  const draftIsPristine = !isDirty(draft, DEFAULT_LANDING_CONFIG)

  // Matriz de habilitación (15-UI-SPEC §4). Uploads en vuelo bloquean las 3 acciones (L9 de Phase 14).
  const busy = saving || publishing || discarding
  const blocked = busy || uploading > 0
  const canDiscard = !blocked && editorState !== 'published'
  // Guardar queda habilitado en TODO lo que no sea 'publicado' (no solo con cambios sin guardar).
  // Por qué: tras Descartar SIN haber publicado nunca, la DB queda con landing_draft = NULL y el
  // editor re-siembra la plantilla base en memoria (D-13) ⇒ draft == savedBaseline ⇒ el indicador
  // decía "Guardado — sin publicar" (falso: no hay nada guardado) y Guardar quedaba DESHABILITADO,
  // así que el dueño no podía materializar ese "guardado" que la UI le afirmaba. Guardar un borrador
  // idéntico es idempotente y barato (un UPDATE de una fila), así que habilitarlo elimina el
  // dead-end sin inventar un 4º estado.
  const canSave = !blocked && editorState !== 'published'
  // D-04: Publicar queda habilitado TAMBIÉN con cambios sin guardar (encadena guardar → publicar).
  // Deshabilitarlo por "hay cambios sin guardar" era un dead-end visual.
  const canPublish = !blocked && editorState !== 'published'

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
    (patch: { preset?: string; palette?: string; font?: string; mode?: 'light' | 'dark' }) =>
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

  // ── Guardar: config COMPLETO (el draft) → saveLandingDraft (overwrite-total del BORRADOR) ───────
  // Phase 15: guardar YA NO publica. Escribe businesses.landing_draft y la web al aire no se mueve
  // (PUB-03) — de ahí el copy nuevo del toast. Publicar es una decisión aparte (barra de 15-03).
  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const res = await saveLandingDraft(draft)
    setSaving(false)
    if (res.ok) {
      toast.success('Borrador guardado')
      // D-03c: limpiar el flag de cambios sin guardar → baseline pasa a ser el draft actual.
      setSavedBaseline(draft)
    } else {
      toast.error(ACTION_ERROR_COPY[res.error] ?? ACTION_ERROR_COPY.server_error)
    }
  }

  // Abre la web pública REAL en otra pestaña (D-07/D-10): el preview del editor muestra SIEMPRE el
  // borrador; lo publicado se ve en /[slug] de verdad, no en una simulación. Sin window.opener.
  function openPublicSite() {
    window.open(`/${business.slug}`, '_blank', 'noopener,noreferrer')
  }

  // ── Publicar (D-04 en su forma fuerte): GUARDA SIEMPRE ANTES DE PUBLICAR ─────────────────
  // No es `if (dirty) save()`. publishLanding() copia el borrador DE LA DB, y un negocio nuevo ve la
  // plantilla base sembrada EN MEMORIA con landing_draft = NULL en la DB: sin el guardado previo,
  // Publicar devolvería "No hay nada para publicar" mientras el dueño mira su preview lleno. El
  // criterio de desempate de la fase es "el dueño nunca publica algo distinto de lo que ve".
  // D-11: acá NO se evalúa completitud del config. El único filtro de contenido es el Zod estricto
  // del server (código invalid_draft). Nada de checklist blando ni mínimos de contenido.
  async function runPublish() {
    if (blocked || editorState === 'published') return
    setPublishing(true)
    // 1. Guardado implícito. Durante todo el encadenado el botón dice "Publicando…" — para el dueño
    //    es UNA sola acción, no parpadea "Guardando…" → "Publicando…".
    const saved = await saveLandingDraft(draft)
    if (!saved.ok) {
      // El guardado falló ⇒ NO se publica (publicaríamos algo distinto de lo que ve el dueño). El
      // dialog se cierra recién acá, con la respuesta en la mano, y el borrador queda intacto.
      setPublishing(false)
      setShowGoLive(false)
      toast.error(ACTION_ERROR_COPY[saved.error] ?? ACTION_ERROR_COPY.server_error)
      return
    }
    // El borrador YA quedó en la DB: pase lo que pase con la publicación, el estado es recuperable.
    setSavedBaseline(draft)

    // 2. La publicación (sin argumentos: lo que sale al aire se lee de la DB, T-15-05).
    const res = await publishLanding()
    setPublishing(false)
    setShowGoLive(false)
    if (!res.ok) {
      toast.error(ACTION_ERROR_COPY[res.error] ?? ACTION_ERROR_COPY.server_error)
      return
    }

    // 3. Post-publicación EN MEMORIA (sin refetch ni invalidación de caché): lo publicado pasa a ser
    //    el borrador actual ⇒ el indicador cae en "✓ Publicado" y las 3 acciones se apagan.
    const firstTime = publishedBaseline === null
    setPublishedBaseline(draft)
    toast.success(firstTime ? 'Tu web está al aire' : 'Cambios publicados', {
      duration: 6000,
      action: { label: 'Ver mi web', onClick: openPublicSite },
    })
  }

  // Click en Publicar: la PRIMERA publicación del negocio pasa por el dialog de go-live (D-08 — la
  // condición se deriva de los datos, así que aparece exactamente una vez en la vida del negocio);
  // las siguientes publican de un click, sin dialog.
  function handlePublishClick() {
    if (blocked || editorState === 'published') return
    if (neverPublished) setShowGoLive(true)
    else void runPublish()
  }

  // ── Descartar (D-12/D-13/D-14): el borrador vuelve a ser copia fiel de lo publicado ──────
  // D-14 (PROHIBICIÓN): NO se toca Storage. Las fotos que el dueño había subido al borrador quedan
  // huérfanas —benignas y owner-scoped bajo el prefijo de assets del propio negocio— y así se
  // quedan. Diffear URLs draft-vs-publicado para borrar objetos es alto riesgo: un borrado mal
  // calculado se lleva puesta una foto que SÍ está al aire.
  async function runDiscard() {
    if (blocked || editorState === 'published') return
    setDiscarding(true)
    const res = await discardLandingDraft()
    setDiscarding(false)
    setShowDiscardConfirm(false)
    if (!res.ok) {
      toast.error(ACTION_ERROR_COPY[res.error] ?? ACTION_ERROR_COPY.server_error)
      return
    }
    // Reconstrucción EN MEMORIA: si ya publicó, el borrador vuelve a ser copia fiel de lo publicado;
    // si nunca publicó (D-13), se RE-SIEMBRA la plantilla base (mismo camino de empty-state de Phase
    // 14) y reaparece el aviso. Nunca queda un editor vacío ni un estado "sin web" nuevo.
    // OJO en el caso nunca-publicó: la DB queda SIN borrador (landing_draft = NULL) y esta plantilla
    // es una semilla EN MEMORIA, no algo guardado. Por eso Guardar sigue habilitado en 'unpublished'
    // (ver canSave): el dueño puede materializarla cuando quiera, sin dead-end.
    const restored = publishedBaseline ?? stripPrimary(DEFAULT_LANDING_CONFIG)
    setDraft(restored)
    setSavedBaseline(restored)
    toast.success(
      publishedBaseline !== null
        ? 'Descartaste el borrador'
        : 'Descartaste el borrador. Volviste a la plantilla base.',
    )
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

  const preview = (
    // Marco EXTERNO: el overflow/redondeo vive ACÁ, fuera de .frj-site (L7). Nunca poner
    // overflow/transform en un ancestro de #reservar dentro de .frj-site.
    <div className="overflow-hidden rounded-lg border bg-background">
      <div
        // `isolate` (isolation: isolate) NO es cosmético: arregla que la FOTO DEL HERO no se viera
        // en el preview. La capa de la imagen es `-z-10` y el <section> del hero es position:
        // relative con z-index auto ⇒ NO crea contexto de apilado, así que la imagen sube hasta el
        // contexto raíz y se pinta DETRÁS del `bg-background` opaco del marco de acá arriba. (En la
        // web pública no pasa: el único fondo opaco es el del <body>, que se propaga al canvas y se
        // pinta antes que todo.) `isolate` crea el contexto de apilado acá y encierra al -z-10
        // adentro. Es seguro para el booking: isolation NO crea containing block para
        // position:fixed (eso lo hacen transform/filter/contain) y los overlays de vaul/sonner
        // portan a document.body, fuera de este árbol.
        //
        // El TEMA ya NO se aplica acá: lo declara el propio <main class="frj-site"> del
        // LandingRenderer (theme/palette/font/modo). Ponerlo también acá era duplicar la fuente de
        // verdad — y encima el wrapper omitía el atributo cuando el theme era 'forjo', con lo cual
        // el preview HEREDABA el theme del panel (fuentes y colores del dashboard): la vista previa
        // mentía. Ahora el preview muestra exactamente lo que verá el visitante.
        className="isolate"
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
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Gestión</p>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Tu web</h1>
        </div>
        {/* "Ver mi web" (D-07): NO es un toggle Borrador|Publicado — el preview muestra siempre el
            borrador y lo publicado se ve en la web pública DE VERDAD. Siempre visible y habilitado,
            incluso si nunca publicó: en ese caso muestra su página de reservas de siempre, y eso es
            la verdad. Desktop → header; mobile → fila 1 de la barra (a 375px no entran 4 controles). */}
        <a
          href={`/${business.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ver mi web (abre en una pestaña nueva)"
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            'hidden min-h-11 text-muted-foreground hover:text-foreground sm:inline-flex',
          )}
        >
          Ver mi web
          <ExternalLink aria-hidden="true" className="size-4" />
        </a>
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
          {/* Aviso de empty-state (§9). La condición es NUNCA PUBLICÓ (no "el borrador venía vacío"):
              ese es el hecho relevante. Ya publicó ⇒ sin aviso, el indicador de la barra ya cuenta la
              historia. Dos variantes según si el borrador es la plantilla base o ya tiene contenido
              (p. ej. se lo armó el operador). */}
          {neverPublished && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              {draftIsPristine ? (
                <>
                  <p className="text-sm font-semibold">Todavía no personalizaste tu web</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Arrancá desde la plantilla base y editá cada sección. Guardar no publica nada: los
                    cambios salen al aire recién cuando tocás <strong>Publicar</strong>. Mientras
                    tanto, forjo.studio/{business.slug} sigue mostrando tu página de reservas.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">Tu web todavía no está publicada</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Esto es un borrador: solo lo ves vos. Quien entra a forjo.studio/{business.slug} ve
                    tu página de reservas de siempre. Revisalo, editá lo que quieras y tocá{' '}
                    <strong>Publicar</strong> cuando esté listo.
                  </p>
                </>
              )}
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
            onUploadingChange={onUploadingChange}
          />

          <ThemeControls
            theme={draft.theme}
            onChange={onThemeChange}
            motion={draft.motion ?? 'none'}
            onMotionChange={onMotionChange}
          />

          {/* ── Barra publish sticky (D-05, §2): UNA sola barra con TODAS las acciones ─────────
              Sin panel nuevo y sin acciones en el header (única excepción: el link "Ver mi web" en
              desktop). Mobile (<sm): 2 filas — [estado · Ver mi web] / [Descartar · Guardar ·
              Publicar]. Desktop: una fila. Las 3 acciones son min-h-11 (44px) en TODOS los viewports:
              publicar es la acción más cara del editor, no se toca de casualidad. */}
          <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background/95 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex items-center justify-between gap-3">
              {/* Indicador de 3 estados EXCLUYENTES (D-06 / §5). Los 4 estados en vuelo (uploads,
                  guardando, publicando, descartando) son overlays transitorios, no un 4º estado. El
                  punto va aria-hidden: el texto es la fuente de verdad y nunca se trunca. */}
              <span
                aria-live="polite"
                className={cn(
                  'flex items-center text-xs',
                  uploading > 0 ? 'text-muted-foreground' : STATE_TONE[editorState],
                )}
              >
                {uploading === 0 && editorState === 'published' ? (
                  <Check aria-hidden="true" className="mr-1.5 size-3.5 shrink-0" />
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mr-1.5 inline-block size-2 shrink-0 rounded-full',
                      uploading > 0 ? 'bg-muted-foreground' : STATE_DOT[editorState],
                    )}
                  />
                )}
                {uploading > 0 ? 'Subiendo imágenes…' : STATE_LABEL[editorState]}
              </span>

              {/* Mobile: el link vive en la fila 1 (en desktop está en el header). */}
              <a
                href={`/${business.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Ver mi web (abre en una pestaña nueva)"
                className={cn(
                  buttonVariants({ variant: 'ghost' }),
                  'min-h-11 shrink-0 text-muted-foreground hover:text-foreground sm:hidden',
                )}
              >
                Ver mi web
                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            </div>

            {/* Orden visual: Descartar · Guardar · Publicar. Lo destructivo lejos del destino natural
                del barrido; el único CTA primario de la pantalla (Publicar) al final. Descartar no
                lleva rojo acá: el rojo aparece recién en el dialog, donde la acción es irreversible. */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="min-h-11 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setShowDiscardConfirm(true)}
                disabled={!canDiscard}
              >
                {discarding ? 'Descartando…' : 'Descartar'}
              </Button>
              <Button
                variant="secondary"
                className="min-h-11 flex-1 sm:flex-none"
                onClick={handleSave}
                disabled={!canSave}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button
                className="min-h-11 flex-1 sm:flex-none"
                onClick={handlePublishClick}
                disabled={!canPublish}
              >
                {publishing ? 'Publicando…' : 'Publicar'}
              </Button>
            </div>
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

      {/* ── Dialog de go-live (PUB-04/PUB-07, D-08/D-09) ─────────────────────────────────────
          Solo se abre si el negocio NUNCA publicó (publishedBaseline === null). La condición se
          deriva de los datos ⇒ aparece exactamente una vez en la vida del negocio, sin casilla "no
          volver a mostrar" ni preferencia persistida.
          D-11 (PROHIBICIÓN): el dialog SOLO CONFIRMA, no evalúa nada. No hay chequeo de calidad
          pre-publicación (checklist blando, "tu hero no tiene título", mínimos de contenido): si el
          Zod estricto del server acepta el borrador, se publica. El renderer es fail-safe con
          secciones vacías y el dueño ve exactamente lo que va a salir, en su preview.
          El confirmatorio NO es destructivo: publicar no destruye nada y es reversible editando y
          volviendo a publicar. Foco inicial en [Publicar]. */}
      <Dialog open={showGoLive} onOpenChange={(o) => !publishing && setShowGoLive(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar tu web</DialogTitle>
            <DialogDescription>
              {`A partir de ahora, quien entre a forjo.studio/${business.slug} va a ver tu web en vez de la página de reservas simple. Las reservas siguen funcionando igual, dentro de tu web.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={() => setShowGoLive(false)}
              disabled={publishing}
            >
              Cancelar
            </Button>
            {/* El dialog NO se cierra antes de la respuesta: el botón pasa a "Publicando…" + disabled
                mientras corre el encadenado guardar → publicar. */}
            <Button
              autoFocus
              className="min-h-11"
              onClick={() => void runPublish()}
              disabled={publishing}
            >
              {publishing ? 'Publicando…' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog de descartar (PUB-06, D-12/D-13/D-14) ────────────────────────────────────
          Recicla el bloque de confirm-on-exit (que era código muerto: el prompt de recarga lo hace
          el beforeunload nativo). Descartar es IRREVERSIBLE (no hay historial) → merece fricción:
          sin undo y sin toast-deshacer. El foco inicial va en la opción SEGURA (la de cancelar), no
          en la destructiva.
          D-14: el copy NO menciona las fotos. Al descartar, los objetos subidos al borrador quedan
          huérfanos y Storage no se toca — prometer una limpieza que no ocurre sería mentir. */}
      <Dialog open={showDiscardConfirm} onOpenChange={(o) => !discarding && setShowDiscardConfirm(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Descartar los cambios?</DialogTitle>
            <DialogDescription>
              {neverPublished
                ? `Vas a perder todos los cambios que hiciste. Tu web todavía no está publicada, así que forjo.studio/${business.slug} va a seguir mostrando tu página de reservas de siempre.`
                : 'Vas a perder todos los cambios que no publicaste. Tu web al aire no se toca.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              autoFocus
              className="min-h-11"
              onClick={() => setShowDiscardConfirm(false)}
              disabled={discarding}
            >
              Seguir editando
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={() => void runDiscard()}
              disabled={discarding}
            >
              {discarding ? 'Descartando…' : 'Descartar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
