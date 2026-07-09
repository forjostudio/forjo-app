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
  // Orden actual (índices estables) para ubicar la vecina adyacente.
  const ordered = [...config.sections].sort((a, b) => a.order - b.order)
  const idx = ordered.findIndex((s) => s.type === type)
  if (idx === -1) return config

  const neighborIdx = dir === 'up' ? idx - 1 : idx + 1
  // Borde: sin vecina → no-op.
  if (neighborIdx < 0 || neighborIdx >= ordered.length) return config

  const current = ordered[idx]
  const neighbor = ordered[neighborIdx]

  // Intercambio de `order`: cada sección afectada se copia (spread) preservando su `data`.
  const sections = config.sections.map((s) => {
    if (s.type === current.type) return { ...s, order: neighbor.order }
    if (s.type === neighbor.type) return { ...s, order: current.order }
    return s
  })

  return { ...config, sections }
}

// ── toggleSection: invierte `enabled` de una sección ──────────────────────────────────
// Nunca agrega ni borra secciones: el set fijo de 8 (SECTION_TYPES) se preserva intacto.
// Solo la sección `type` cambia su `enabled`; el resto del config queda idéntico.
export function toggleSection(config: LandingConfig, type: SectionType): LandingConfig {
  const sections = config.sections.map((s) =>
    s.type === type ? { ...s, enabled: !s.enabled } : s,
  )
  return { ...config, sections }
}

// ── setSectionData: merge SHALLOW del `data` de una sección ───────────────────────────
// Parte del config recibido (L5) y muta SOLO el `data` de la sección objetivo con spread
// superficial: preserva las claves no tocadas del data previo y el resto del config (theme,
// motion, otras secciones) intacto. `data` es z.unknown().optional() en el schema, así que lo
// tratamos como Record parcial. Si la sección no existía en el config no se agrega (el set es
// fijo y se siembra desde DEFAULT_LANDING_CONFIG en el cliente).
export function setSectionData(
  config: LandingConfig,
  type: SectionType,
  partialData: Record<string, unknown>,
): LandingConfig {
  const sections = config.sections.map((s) => {
    if (s.type !== type) return s
    const prev = (s.data ?? {}) as Record<string, unknown>
    return { ...s, data: { ...prev, ...partialData } }
  })
  return { ...config, sections }
}

// ── setTheme: escribe preset y/o overrides.{palette,primary} sin pisar otros overrides ─
// El shape de theme es { preset: string; overrides?: Record<string,string> } (schema.ts).
// Cada campo pasado se aplica; los overrides NO pasados se preservan. Pasar `undefined` para un
// override lo BORRA (delete de la clave) — así el editor puede quitar un primary custom y volver
// al derivado del preset. `palette`/`primary` son las únicas claves conocidas que toca el editor;
// otras claves de overrides (ej. `font`) quedan intactas.
export function setTheme(
  config: LandingConfig,
  patch: { preset?: string; palette?: string; primary?: string | undefined },
): LandingConfig {
  const overrides: Record<string, string> = { ...(config.theme.overrides ?? {}) }

  if ('palette' in patch) {
    if (patch.palette === undefined) delete overrides.palette
    else overrides.palette = patch.palette
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

// ── setMotion: setea el nivel de movimiento del renderer ──────────────────────────────
// motion ∈ 'none'|'subtle'|'premium' (schema.ts). El resto del config queda intacto.
export function setMotion(
  config: LandingConfig,
  level: 'none' | 'subtle' | 'premium',
): LandingConfig {
  return { ...config, motion: level }
}

// ── isDirty: comparación estructural borrador-vs-guardado ─────────────────────────────
// Devuelve true si difieren. Usamos JSON.stringify (deep-equal barato y suficiente: el config es
// JSON plano, sin funciones/undefined significativos ni ciclos). Lo consume la save bar (indicador
// de cambios sin guardar) y el confirm-on-exit. Nota: JSON.stringify es sensible al orden de
// claves, pero como todos los mutadores parten del mismo config y hacen spread, el orden de claves
// se mantiene estable entre borrador y baseline — no hay falsos positivos por reordenamiento.
export function isDirty(current: LandingConfig, saved: LandingConfig): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved)
}

// Re-export del tipo Section por conveniencia de los consumidores del shell (tipado del stub).
export type { Section }
