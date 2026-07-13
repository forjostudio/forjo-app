import type { LandingConfig, LandingTheme } from '@/lib/landing/schema'
import { SECTION_TYPES } from '@/lib/landing/schema'

// ── Mutadores PUROS del borrador del editor CMS (Phase 14) ────────────────────────
// Por qué este módulo: el editor CMS (web-client.tsx) es 'use client' y no unit-testeable
// fácil (no hay React Testing Library en el repo; environment 'node'). La estrategia Nyquist
// —igual que lib/landing/derive.ts y lib/landing/theme.ts— es EXTRAER la lógica de mutación
// del borrador (reorder/toggle/set-data/set-theme/set-motion) a funciones PURAS y testear esas;
// el render vivo del preview va por UAT.
// Reglas duras (idénticas a derive.ts/theme.ts): SIN React, SIN Supabase, SIN admin client,
// SIN 'use client'/'use server'. Named exports. Todos los mutadores son PUROS: devuelven un
// config NUEVO y NUNCA mutan el argumento recibido.
//
// Invariante crítica de correctness (RESEARCH landmine L5): el write de saveLandingConfig es
// OVERWRITE-TOTAL y Zod v4 estripa las claves no reconstruidas. Por eso ningún mutador arma el
// config desde cero: TODOS parten del config recibido y mutan solo lo mínimo (spread superficial),
// preservando theme/motion/sections que no tocan. Perder un campo acá = perderlo al guardar.

type SectionType = (typeof SECTION_TYPES)[number]
type Section = LandingConfig['sections'][number]

// ── normalizeSections: garantiza que el borrador tenga las 8 secciones fijas ───────────
// Por qué (Plan 02, must-have truth #1): el panel del editor DEBE mostrar SIEMPRE las 8 secciones
// fijas, pero los configs reales NO las traen todas — el builder (lib/landing/builder.ts) omite las
// vacías (about/gallery/location/hours/cta), `booking` no vive en el config (la inyecta el render vía
// orderedSections) y el DEFAULT sembrado trae solo hero+booking. Sin normalizar, el panel mostraría
// <8 filas y los mutadores harían no-op sobre las secciones ausentes (imposible prenderlas/editarlas/
// reordenarlas). Esta función materializa las faltantes (enabled:false salvo hero/booking, que son
// núcleo) y reasigna `order` contiguo 0..7 respetando el orden guardado de las existentes e insertando
// las faltantes en su posición canónica (SECTION_TYPES). Es PURA e IDEMPOTENTE: un config ya-completo
// con orders contiguos vuelve estructuralmente idéntico — por eso puede correr al frente de cada
// mutador estructural sin cambiar el comportamiento del caso ya-8 (ni romper sus tests).
export function normalizeSections(config: LandingConfig): LandingConfig {
  const byType = new Map(config.sections.map((s) => [s.type, s]))
  const canon = new Map<SectionType, number>(SECTION_TYPES.map((t, i) => [t, i]))
  const rows = SECTION_TYPES.map((type) => {
    const existing = byType.get(type)
    // Clave de orden: existente → su `order` guardado (preserva reorden del dueño); faltante → su
    // índice canónico (cae en su lugar natural). Desempate por índice canónico (estable).
    return { existing, type, sortKey: existing ? existing.order : canon.get(type)! }
  })
  rows.sort((a, b) => a.sortKey - b.sortKey || canon.get(a.type)! - canon.get(b.type)!)
  const sections: Section[] = rows.map((r, i) => {
    if (r.existing) return { ...r.existing, order: i }
    // Faltante: hero/booking son núcleo → visibles; el resto arranca oculto hasta que el dueño la llene.
    return { type: r.type, enabled: r.type === 'hero' || r.type === 'booking', order: i }
  })
  return { ...config, sections }
}

// ── moveSection: intercambia `order` con la sección adyacente en el orden actual ──────
// El criterio de orden es el mismo que orderedSections (derive.ts): asc por `order`. Encontramos
// la posición de `type` en ese orden y, según dir, buscamos la vecina inmediata (arriba = índice
// anterior, abajo = índice siguiente). En el borde (primera hacia arriba / última hacia abajo)
// no hay vecina → devolvemos el config SIN cambios (no-op), nunca un throw.
// El swap es SOLO de los campos `order` de las dos secciones; el set de secciones nunca cambia.
export function moveSection(
  config: LandingConfig,
  type: SectionType,
  dir: 'up' | 'down',
): LandingConfig {
  // Normalizamos primero (garantiza las 8 con order contiguo): así reordenar contra una sección
  // ausente funciona, y el caso ya-8 queda idéntico (normalize es idempotente).
  const normalized = normalizeSections(config)
  // Orden actual (índices estables) para ubicar la vecina adyacente.
  const ordered = [...normalized.sections].sort((a, b) => a.order - b.order)
  const idx = ordered.findIndex((s) => s.type === type)
  if (idx === -1) return normalized

  const neighborIdx = dir === 'up' ? idx - 1 : idx + 1
  // Borde: sin vecina → no-op.
  if (neighborIdx < 0 || neighborIdx >= ordered.length) return normalized

  const current = ordered[idx]
  const neighbor = ordered[neighborIdx]

  // Intercambio de `order`: cada sección afectada se copia (spread) preservando su `data`.
  const sections = normalized.sections.map((s) => {
    if (s.type === current.type) return { ...s, order: neighbor.order }
    if (s.type === neighbor.type) return { ...s, order: current.order }
    return s
  })

  return { ...normalized, sections }
}

// ── toggleSection: invierte `enabled` de una sección ──────────────────────────────────
// Nunca agrega ni borra secciones: el set fijo de 8 (SECTION_TYPES) se preserva intacto.
// Solo la sección `type` cambia su `enabled`; el resto del config queda idéntico.
export function toggleSection(config: LandingConfig, type: SectionType): LandingConfig {
  // Normalizamos primero: togglear una sección ausente (ej. `about` que el builder omitió) la
  // materializa y la prende. Caso ya-8 → idéntico (normalize idempotente).
  const normalized = normalizeSections(config)
  const sections = normalized.sections.map((s) =>
    s.type === type ? { ...s, enabled: !s.enabled } : s,
  )
  return { ...normalized, sections }
}

// ── setSectionData: merge SHALLOW del `data` de una sección ───────────────────────────
// Parte del config recibido (L5) y muta SOLO el `data` de la sección objetivo con spread
// superficial: preserva las claves no tocadas del data previo y el resto del config (theme,
// motion, otras secciones) intacto. `data` es z.unknown().optional() en el schema, así que lo
// tratamos como Record parcial. Normalizamos primero (el set fijo de 8 se materializa acá, no en el
// seed del cliente): así editar el copy de una sección que el builder omitió (ej. `about`) la crea y
// le mergea el data. Caso ya-8 → idéntico (normalize idempotente).
export function setSectionData(
  config: LandingConfig,
  type: SectionType,
  partialData: Record<string, unknown>,
): LandingConfig {
  const normalized = normalizeSections(config)
  const sections = normalized.sections.map((s) => {
    if (s.type !== type) return s
    const prev = (s.data ?? {}) as Record<string, unknown>
    return { ...s, data: { ...prev, ...partialData } }
  })
  return { ...normalized, sections }
}

// ── setTheme: escribe preset y/o overrides.{palette,primary} sin pisar otros overrides ─
// El shape de theme es { preset: string; overrides?: Record<string,string> } (schema.ts).
// Cada campo pasado se aplica; los overrides NO pasados se preservan. Pasar `undefined` para un
// override lo BORRA (delete de la clave) — así el editor puede quitar un primary custom y volver
// al derivado del preset. `palette`/`primary` son las únicas claves conocidas que toca el editor;
// otras claves de overrides (ej. `font`) quedan intactas.
export function setTheme(
  config: LandingConfig,
  patch: {
    preset?: string
    palette?: string
    font?: string | undefined
    mode?: 'light' | 'dark'
    primary?: string | undefined
  },
): LandingConfig {
  const overrides: Record<string, string> = { ...(config.theme.overrides ?? {}) }

  if ('palette' in patch) {
    if (patch.palette === undefined) delete overrides.palette
    else overrides.palette = patch.palette
  }
  // mode: claro/oscuro DEL LANDING (lo declara el <main> del renderer, no el <html> del visitante).
  // No se borra nunca desde acá: el editor siempre manda un valor explícito.
  if (patch.mode !== undefined) overrides.mode = patch.mode
  // font: mismo contrato que palette. El renderer YA lo resuelve (resolveLandingTheme →
  // overrides.font → data-font); antes de esto el editor simplemente no lo exponía.
  if ('font' in patch) {
    if (patch.font === undefined) delete overrides.font
    else overrides.font = patch.font
  }
  if ('primary' in patch) {
    if (patch.primary === undefined) delete overrides.primary
    else overrides.primary = patch.primary
  }

  const theme: LandingTheme = {
    preset: patch.preset ?? config.theme.preset,
    overrides,
  }
  return { ...config, theme }
}

// ── stripPrimary: saca overrides.primary del config ───────────────────────────────────
// POR QUÉ existe: se quitó el control "Color principal" del editor. Un `primary` custom pisa el
// acento de CUALQUIER paleta, y eso dejaba a los swatches de paleta decorativos (elegís una y no
// pasa nada). Pero sacar SOLO la UI dejaría a los negocios que ya tienen un primary guardado
// pisados para siempre y SIN forma de quitarlo (no queda control que lo borre). Por eso el editor
// normaliza el config al cargarlo: el primary se va, la paleta vuelve a mandar, y el próximo
// guardado lo persiste limpio.
// Se aplica al BORRADOR y al BASELINE por igual → el editor NO abre marcado como "cambios sin
// guardar" (isDirty compara ambos, y ambos entran ya normalizados).
// El schema y el resolver siguen soportando `primary` a propósito: un config viejo con primary
// renderiza igual que siempre en la web pública hasta que el dueño entre al editor y guarde.
export function stripPrimary(config: LandingConfig): LandingConfig {
  if (config.theme.overrides?.primary === undefined) return config
  const overrides = { ...config.theme.overrides }
  delete overrides.primary
  return { ...config, theme: { ...config.theme, overrides } }
}

// ── setMotion: setea el nivel de movimiento del renderer ──────────────────────────────
// motion ∈ 'none'|'subtle'|'premium' (schema.ts). El resto del config queda intacto.
export function setMotion(
  config: LandingConfig,
  level: 'none' | 'subtle' | 'premium',
): LandingConfig {
  return { ...config, motion: level }
}

// ── canonical + configsEqual: comparación estructural INSENSIBLE al orden de claves ───
//
// DESVIACIÓN DECLARADA DE D-03 (Phase 15) — leer antes de "simplificar" esto de vuelta.
// D-03 dice, textual: *"«Cambios sin publicar» = comparación estructural draft ≠ published (mismo
// criterio que el isDirty de lib/landing/editor-draft.ts: JSON.stringify deep-compare). No hay flag
// ni timestamp de publicación: el estado se DERIVA del contenido."*
// La INTENCIÓN de D-03 se cumple al pie de la letra: el estado se deriva por comparación estructural
// del contenido, sin flag, sin timestamp, sin estado nuevo más allá de la columna landing_draft.
// Lo que cambia es el MECANISMO: en vez de JSON.stringify crudo se serializa con las claves
// ORDENADAS. Por qué, y por qué no es opcional:
//
//   Los dos baselines que compara el editor NO vienen del mismo lugar.
//     · savedBaseline sale del objeto EN MEMORIA (tras guardar: setSavedBaseline(draft)), con el
//       orden de claves que le dejaron los mutadores de este módulo.
//     · published vuelve de un ROUND-TRIP POR jsonb, y Postgres REORDENA las claves de un jsonb
//       (las almacena por longitud + orden binario, no por orden de inserción).
//   Con JSON.stringify crudo, dos configs SEMÁNTICAMENTE IDÉNTICOS serializan distinto ⇒ el
//   indicador queda clavado en "● Guardado — sin publicar" PARA SIEMPRE y el botón Publicar nunca
//   se apaga. Es el bug más probable de la fase y NO lo agarra el type-check.
//
// Ordenar las claves antes de serializar mata esa clase entera de falso positivo. Para un MISMO
// objeto el resultado es idéntico al de hoy: la desviación es de implementación, no de semántica.
// El orden de los ARRAYS sí se preserva: el orden de las secciones es significativo.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}

export function configsEqual(a: LandingConfig, b: LandingConfig): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

// ── isDirty: comparación estructural borrador-vs-guardado ─────────────────────────────
// Devuelve true si difieren. Mismo contrato público de siempre (lo consumen la barra de acciones y
// el confirm-on-exit), ahora montado sobre configsEqual: deep-equal barato (el config es JSON plano,
// sin funciones, sin ciclos) pero canónico. Antes esta nota afirmaba que el orden de claves se
// mantenía estable entre borrador y baseline porque los mutadores parten del mismo config y hacen
// spread — eso valía cuando AMBOS lados salían de memoria. Desde Phase 15 uno de los lados puede
// venir de la DB (jsonb reordena), así que esa premisa ya no se sostiene: ver el bloque de arriba.
export function isDirty(current: LandingConfig, saved: LandingConfig): boolean {
  return !configsEqual(current, saved)
}

// ── deriveEditorState: los 3 estados del editor, derivados del CONTENIDO (D-03 / D-06) ─
// Excluyentes y con esta precedencia exacta:
//   1. draft ≠ savedBaseline                          → 'unsaved'      (● Cambios sin guardar)
//   2. published === null  ó  savedBaseline ≠ published → 'unpublished'  (● Guardado — sin publicar)
//   3. si no                                          → 'published'    (✓ Publicado)
// published === null significa "nunca publicó" (landing_config IS NULL): ese negocio SIEMPRE tiene
// algo para publicar, así que este helper NUNCA devuelve 'published' en ese caso — es lo que
// habilita el botón Publicar y el dialog de go-live (D-08) sin guardar un flag en la DB.
// Puro: sin React, sin fetch, sin estado. La UI (15-03) solo consume el resultado.
export type EditorState = 'unsaved' | 'unpublished' | 'published'

export function deriveEditorState({
  draft,
  savedBaseline,
  published,
}: {
  draft: LandingConfig
  savedBaseline: LandingConfig
  published: LandingConfig | null
}): EditorState {
  if (!configsEqual(draft, savedBaseline)) return 'unsaved'
  if (published === null) return 'unpublished'
  if (!configsEqual(savedBaseline, published)) return 'unpublished'
  return 'published'
}

// ── deriveStateLabel: el TEXTO del indicador (la máquina de estados NO cambia, D-06) ───
// Los 3 estados de deriveEditorState siguen siendo 3 y excluyentes. Lo que este helper resuelve es
// que 'unpublished' mete DOS situaciones distintas en la misma bolsa, y el label fijo mentía en una:
//
//   · guardé cambios y no los publiqué   → landing_draft tiene contenido → "Guardado — sin publicar" ✔
//   · negocio nuevo / descarté sin haber publicado nunca → landing_draft IS NULL → NO HAY NADA
//     GUARDADO, pero el editor igual mostraba "Guardado — sin publicar". Es falso: el borrador que
//     ve el dueño es la plantilla base sembrada EN MEMORIA (D-13), no una fila persistida.
//
// El desempate necesita un dato que la máquina de estados no tiene (ni debe tener: es puramente
// estructural, compara CONTENIDO): si existe o no un borrador PERSISTIDO. Por eso entra como
// parámetro — lo sabe la page (landing_draft !== null al cargar) y lo mantiene vivo el cliente
// (guardar/publicar ⇒ true; descartar sin haber publicado nunca ⇒ false).
// Puro, sin React: el componente consume el resultado, no reimplementa la decisión inline.
const STATE_LABEL: Record<EditorState, string> = {
  unsaved: 'Cambios sin guardar',
  unpublished: 'Guardado — sin publicar',
  published: 'Publicado',
}

export function deriveStateLabel({
  editorState,
  published,
  hasPersistedDraft,
}: {
  editorState: EditorState
  published: LandingConfig | null
  hasPersistedDraft: boolean
}): string {
  // Único caso especial: nunca publicó Y no hay borrador guardado ⇒ no hay NADA persistido.
  if (editorState === 'unpublished' && published === null && !hasPersistedDraft) {
    return 'Sin publicar'
  }
  return STATE_LABEL[editorState]
}

// Re-export del tipo Section por conveniencia de los consumidores del shell (tipado del stub).
export type { Section }
