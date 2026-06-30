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
    types: ['Médico', 'Psicólogo', 'Kinesiólogo', 'Odontólogo', 'Nutricionista'],
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
    menu: ['dashboard', 'appointments', 'agenda', 'patients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'settings'],
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
      location: 'Local',
      locations: 'Locales',
      resource: 'Profesional',
      resources: 'Equipo',
    },
    menu: ['dashboard', 'appointments', 'agenda', 'clients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'settings'],
    features: {
      preferences: true, // color, alergias, productos
      service_photos: true, // antes/después
    },
  },
  general: {
    label: 'General',
    types: ['Estudio de tatuajes', 'Entrenador personal', 'Clases particulares', 'Lavadero de autos', 'Veterinaria', 'Taller mecánico', 'Estudio de fotografía', 'Otro'],
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
    menu: ['dashboard', 'appointments', 'agenda', 'clients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'settings'],
    features: {},
  },
  canchas: {
    label: 'Canchas',
    types: ['Cancha de fútbol', 'Cancha de pádel', 'Cancha de tenis', 'Cancha de básquet', 'Otro'],
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
    menu: ['dashboard', 'appointments', 'agenda', 'clients', 'finances', 'servicios', 'consultorios', 'negocio', 'settings'],
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

// Override de terminología por `type` (no por VerticalKey). "Cancha de fútbol" es un type DENTRO
// del vertical `general`, así que el término del eje de la agenda se resuelve por type, no por key:
// el rubro canchas ve "Cancha"/"Canchas" en vez de "Profesional"/"Equipo". Label-only (D-05): solo
// pisa strings, no toca datos. Solo aplica al type exacto listado acá; el resto de general y los
// demás verticales conservan 'Profesional'/'Equipo' byte-idéntico. Aplicado en getVertical tras el
// spread del vertical → cae también por resolveVertical cuando se resuelve por type.
const TYPE_TERMINOLOGY_OVERRIDE: Record<string, Partial<VerticalTerminology>> = {
  'Cancha de fútbol': { resource: 'Cancha', resources: 'Canchas' },
}

export function getVerticalKeyByType(businessType?: string | null): VerticalKey {
  if (!businessType) return 'general'
  for (const key of Object.keys(VERTICALS) as VerticalKey[]) {
    if (VERTICALS[key].types.includes(businessType)) return key
  }
  return LEGACY_TYPE_VERTICAL[businessType] ?? 'general'
}

// Resolve the vertical of a business by its `type` (per the spec signature).
// El término del eje de agenda ("Cancha" vs "Profesional") depende del `type`, NO solo del
// VerticalKey: se mergea el override por type sobre la terminología del vertical tras el spread.
export function getVertical(businessType: string): ResolvedVertical {
  const key = getVerticalKeyByType(businessType)
  const override = TYPE_TERMINOLOGY_OVERRIDE[businessType]
  return {
    key,
    ...VERTICALS[key],
    terminology: { ...VERTICALS[key].terminology, ...(override ?? {}) },
  }
}

// Resolve from a full business: prefer the stored `vertical` column, fall back
// to deriving it from `type` (backward compatibility for rows without vertical).
// El override de terminología por type ("Cancha") se aplica en AMBAS ramas: el rubro canchas
// resuelve por su `vertical` almacenado (general) pero su término del eje depende del `type`, así
// que se mergea TYPE_TERMINOLOGY_OVERRIDE[type] también cuando se resuelve por el vertical stored.
export function resolveVertical(business: { vertical?: string | null; type?: string | null }): ResolvedVertical {
  const stored = business.vertical
  const override = TYPE_TERMINOLOGY_OVERRIDE[business.type ?? '']
  if (stored && stored in VERTICALS) {
    const key = stored as VerticalKey
    return {
      key,
      ...VERTICALS[key],
      terminology: { ...VERTICALS[key].terminology, ...(override ?? {}) },
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

// Lista cerrada de todos los subtipos válidos (todos los verticales). La usa la
// sugerencia de rubro por IA: el modelo elige uno de acá, no inventa.
export const ALL_BUSINESS_TYPES = (Object.keys(VERTICALS) as VerticalKey[])
  .flatMap((key) => VERTICALS[key].types)
