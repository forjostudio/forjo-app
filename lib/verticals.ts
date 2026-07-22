// Per-industry (vertical) configuration. Drives terminology, dashboard menu and
// feature flags based on the business `type`. Keep this file framework-agnostic
// (no React / icon imports) so it can be used on server and client.

export type VerticalKey = 'salud' | 'belleza' | 'general' | 'canchas'

export interface VerticalTerminology {
  client: string
  clients: string
  appointment: string
  appointments: string
  service: string
  services: string
  // Lugar de atención. Varía por rubro: salud=Consultorio, belleza=Local, general=Sucursal.
  location: string
  locations: string
  // Eje de la agenda (quién/qué se reserva). Cada vertical define su eje directamente: salud/belleza/
  // general usan 'Profesional'/'Equipo'; el vertical 'canchas' usa 'Cancha'/'Canchas' de forma nativa.
  // Label-only: NO afecta datos ni el VerticalKey resuelto.
  resource: string
  resources: string
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
    types: [],
    terminology: {
      client: 'Paciente',
      clients: 'Pacientes',
      appointment: 'Turno',
      appointments: 'Turnos',
      service: 'Prestación',
      services: 'Prestaciones',
      location: 'Consultorio',
      locations: 'Consultorios',
      resource: 'Profesional',
      resources: 'Equipo',
    },
    // La Historia Clínica vive dentro de la ficha del paciente (sección colapsable),
    // ya no como item de menú propio.
    menu: ['dashboard', 'appointments', 'agenda', 'abonos', 'patients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'web', 'settings'],
    features: {
      clinical_history: true,
      insurance: true, // obra social
      attachments: true, // estudios, recetas
    },
  },
  belleza: {
    label: 'Belleza/Estética/Spa',
    types: [],
    terminology: {
      client: 'Cliente',
      clients: 'Clientes',
      appointment: 'Turno',
      appointments: 'Turnos',
      service: 'Servicio',
      services: 'Servicios',
      location: 'Local',
      locations: 'Locales',
      resource: 'Profesional',
      resources: 'Equipo',
    },
    menu: ['dashboard', 'appointments', 'agenda', 'abonos', 'clients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'web', 'settings'],
    features: {
      preferences: true, // color, alergias, productos
      service_photos: true, // antes/después
    },
  },
  general: {
    label: 'General',
    types: [],
    terminology: {
      client: 'Cliente',
      clients: 'Clientes',
      appointment: 'Turno',
      appointments: 'Turnos',
      service: 'Servicio',
      services: 'Servicios',
      location: 'Sucursal',
      locations: 'Sucursales',
      resource: 'Profesional',
      resources: 'Equipo',
    },
    menu: ['dashboard', 'appointments', 'agenda', 'abonos', 'clients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'web', 'settings'],
    features: {},
  },
  canchas: {
    label: 'Canchas',
    types: [],
    terminology: {
      client: 'Cliente',
      clients: 'Clientes',
      // El turno de alquiler se llama "Reserva" (más natural para canchas, D-04).
      appointment: 'Reserva',
      appointments: 'Reservas',
      // En canchas el bookable ES la cancha: service y resource apuntan al mismo eje (D-04).
      service: 'Cancha',
      services: 'Canchas',
      location: 'Sede',
      locations: 'Sedes',
      resource: 'Cancha',
      resources: 'Canchas',
    },
    // Sin 'equipo' ni 'patients' (D-02): el rubro no tiene staff, el bookable es la cancha.
    menu: ['dashboard', 'appointments', 'agenda', 'abonos', 'clients', 'finances', 'servicios', 'consultorios', 'negocio', 'web', 'settings'],
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
// Cada vertical posee su terminología directamente (el eje de agenda "Cancha" lo dueña el
// vertical 'canchas'), así que la terminología sale directa del VerticalConfig, sin pisado por type.
export function getVertical(businessType: string): ResolvedVertical {
  const key = getVerticalKeyByType(businessType)
  return {
    key,
    ...VERTICALS[key],
    terminology: { ...VERTICALS[key].terminology },
  }
}

// Resolve from a full business: prefer the stored `vertical` column, fall back
// to deriving it from `type` (backward compatibility for rows without vertical).
export function resolveVertical(business: { vertical?: string | null; type?: string | null }): ResolvedVertical {
  const stored = business.vertical
  if (stored && stored in VERTICALS) {
    const key = stored as VerticalKey
    return {
      key,
      ...VERTICALS[key],
      terminology: { ...VERTICALS[key].terminology },
    }
  }
  return getVertical(business.type ?? '')
}

// Type options grouped by vertical, for the onboarding / settings select.
export const TYPE_GROUPS = (Object.keys(VERTICALS) as VerticalKey[]).map((key) => ({
  key,
  label: VERTICALS[key].label,
  types: VERTICALS[key].types,
}))

// Placeholder del campo libre "¿A qué se dedica tu negocio?" (texto de display),
// sugerido según el rubro elegido (D-06). Patrón "Ej: …" como en Servicios.
export const RUBRO_PLACEHOLDERS: Record<VerticalKey, string> = {
  salud: 'Ej: Lic. en Psicología, Kinesiólogo',
  belleza: 'Ej: Barbería, Masajista, Depilación',
  general: 'Ej: Lavaautos, Tatuajes, Fotógrafo',
  canchas: 'Ej: Canchas de fútbol',
}

// Label del rubro (vertical) de un negocio, para el fallback de categoría en la
// página pública de reservas cuando `type` (texto libre) está vacío (D-03).
// Reusa la precedencia vertical>>type de resolveVertical: devuelve el label correcto
// incluso para filas viejas sin `vertical`.
export function getVerticalLabel(business: { vertical?: string | null; type?: string | null }): string {
  return resolveVertical(business).label
}
