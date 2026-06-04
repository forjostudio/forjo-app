// Per-industry (vertical) configuration. Drives terminology, dashboard menu and
// feature flags based on the business `type`. Keep this file framework-agnostic
// (no React / icon imports) so it can be used on server and client.

export type VerticalKey = 'salud' | 'belleza' | 'general'

export interface VerticalTerminology {
  client: string
  clients: string
  appointment: string
  appointments: string
  service: string
  services: string
}

export interface VerticalFeatures {
  clinical_history?: boolean
  insurance?: boolean
  attachments?: boolean
  preferences?: boolean
  service_photos?: boolean
}

export interface VerticalConfig {
  label: string
  types: string[]
  terminology: VerticalTerminology
  menu: string[]
  features: VerticalFeatures
}

export const VERTICALS: Record<VerticalKey, VerticalConfig> = {
  salud: {
    label: 'Salud',
    types: ['Médico', 'Psicólogo', 'Kinesiólogo', 'Odontólogo', 'Nutricionista'],
    terminology: {
      client: 'Paciente',
      clients: 'Pacientes',
      appointment: 'Turno',
      appointments: 'Turnos',
      service: 'Prestación',
      services: 'Prestaciones',
    },
    // La Historia Clínica vive dentro de la ficha del paciente (sección colapsable),
    // ya no como item de menú propio.
    menu: ['dashboard', 'appointments', 'patients', 'finances', 'settings'],
    features: {
      clinical_history: true,
      insurance: true, // obra social
      attachments: true, // estudios, recetas
    },
  },
  belleza: {
    label: 'Belleza y Estética',
    types: ['Peluquería', 'Barbería', 'Centro de estética', 'Manicura', 'Spa'],
    terminology: {
      client: 'Cliente',
      clients: 'Clientes',
      appointment: 'Turno',
      appointments: 'Turnos',
      service: 'Servicio',
      services: 'Servicios',
    },
    menu: ['dashboard', 'appointments', 'clients', 'finances', 'settings'],
    features: {
      preferences: true, // color, alergias, productos
      service_photos: true, // antes/después
    },
  },
  general: {
    label: 'General',
    types: ['Otro'],
    terminology: {
      client: 'Cliente',
      clients: 'Clientes',
      appointment: 'Turno',
      appointments: 'Turnos',
      service: 'Servicio',
      services: 'Servicios',
    },
    menu: ['dashboard', 'appointments', 'clients', 'finances', 'settings'],
    features: {},
  },
}

// Legacy type names used by businesses created before verticals existed, so they
// resolve to the right vertical without a manual data migration.
const LEGACY_TYPE_VERTICAL: Record<string, VerticalKey> = {
  'Centro médico': 'salud',
  Psicología: 'salud',
  Odontología: 'salud',
  Kinesiología: 'salud',
  Estética: 'belleza',
}

export interface ResolvedVertical extends VerticalConfig {
  key: VerticalKey
}

export function getVerticalKeyByType(businessType?: string | null): VerticalKey {
  if (!businessType) return 'general'
  for (const key of Object.keys(VERTICALS) as VerticalKey[]) {
    if (VERTICALS[key].types.includes(businessType)) return key
  }
  return LEGACY_TYPE_VERTICAL[businessType] ?? 'general'
}

// Resolve the vertical of a business by its `type` (per the spec signature).
export function getVertical(businessType: string): ResolvedVertical {
  const key = getVerticalKeyByType(businessType)
  return { key, ...VERTICALS[key] }
}

// Resolve from a full business: prefer the stored `vertical` column, fall back
// to deriving it from `type` (backward compatibility for rows without vertical).
export function resolveVertical(business: { vertical?: string | null; type?: string | null }): ResolvedVertical {
  const stored = business.vertical
  if (stored && stored in VERTICALS) {
    const key = stored as VerticalKey
    return { key, ...VERTICALS[key] }
  }
  return getVertical(business.type ?? '')
}

// Type options grouped by vertical, for the onboarding / settings select.
export const TYPE_GROUPS = (Object.keys(VERTICALS) as VerticalKey[]).map((key) => ({
  key,
  label: VERTICALS[key].label,
  types: VERTICALS[key].types,
}))
