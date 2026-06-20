import { createAdminClient } from '@/lib/supabase/admin'
import {
  getBusinessIntegrationStatus,
  type BusinessIntegrationStatus,
} from '@/lib/business-secrets'

// ── Capa de lectura de la impersonación read-only (Phase 3, IMP-01/IMP-03) ────────────────────
//
// MÓDULO SERVER-ONLY. Centraliza TODAS las lecturas cross-tenant de la sub-página /ver en un único
// helper. POR QUÉ centralizado: con service-role (createAdminClient bypassa RLS) el filtro
// `.eq('business_id', ...)` de la app es la ÚNICA barrera de aislamiento (D-03); tener todas las
// queries acá evita que una suelta olvide el filtro y filtre datos de otro tenant (Pitfall 2 /
// skill supabase-multitenant-rls).
//
// GARANTÍA READ-ONLY POR CONSTRUCCIÓN (D-02): este archivo NO contiene ningún .update/.insert/
// .delete/.upsert. Esa ausencia ES la garantía IMP-01.
//
// PROHIBIDO (verificado en acceptance): la única vía de lectura es createAdminClient (service-role);
// nada de clientes de sesión/browser de Supabase, que correrían como el operador → cero datos o fuga.
// El negocio se resuelve por su id, NUNCA por el dueño (eso traería el negocio del operador). La
// presencia de integraciones se obtiene SOLO vía getBusinessIntegrationStatus (booleanos), nunca el
// helper que devuelve valores crudos.

export interface ImpersonationBusiness {
  id: string
  name: string
  slug: string
  plan: string | null
  plan_status: string | null
  // palette/theme/font: los necesita PaletteScript para la fidelidad visual del negocio (D-12).
  palette: string | null
  theme: string | null
  font: string | null
}

// Forma de retorno de loadImpersonationData. Plan 03-02 consume este tipo para alimentar el banner
// y los renderers read-only por sección. `business` es null cuando el id no existe → el loader hace
// notFound(). Las colecciones nunca son null (se normalizan a []).
export interface ImpersonationData {
  business: ImpersonationBusiness | null
  appointments: Record<string, unknown>[]
  services: Record<string, unknown>[]
  professionals: Record<string, unknown>[]
  locations: Record<string, unknown>[]
  clients: Record<string, unknown>[]
  timeBlocks: Record<string, unknown>[]
  scheduleExceptions: Record<string, unknown>[]
  // Presencia conectado/desconectado de cada integración (sin valores crudos, #4).
  integrationStatus: BusinessIntegrationStatus
}

// Lee TODAS las secciones operativas de un negocio impersonado por business_id (D-05: agenda/turnos,
// servicios, equipo, consultorios, clientes con PII completa D-15, config como presencia). EXCLUYE
// historia clínica y finanzas (D-06). El negocio se resuelve por .eq('id', businessId); cada otra
// colección por .eq('business_id', businessId). Una sola instancia de admin, todo en Promise.all.
export async function loadImpersonationData(businessId: string): Promise<ImpersonationData> {
  const admin = createAdminClient()

  const [
    { data: business },
    { data: appointments },
    { data: services },
    { data: professionals },
    { data: locations },
    { data: clients },
    { data: timeBlocks },
    { data: scheduleExceptions },
    integrationStatus,
  ] = await Promise.all([
    // Negocio: SOLO columnas no sensibles + palette/theme/font (D-12). NUNCA columnas de secretos.
    admin
      .from('businesses')
      .select('id, name, slug, plan, plan_status, palette, theme, font')
      .eq('id', businessId)
      .maybeSingle<ImpersonationBusiness>(),
    // Turnos (calca appointments/page.tsx:18-35): joins de nombre de servicio/profesional para display.
    admin
      .from('appointments')
      .select('*, professionals(name), services(name, price, duration_minutes)')
      .eq('business_id', businessId)
      .order('date', { ascending: true })
      .order('time', { ascending: true }),
    // Servicios (calca servicios/page.tsx:14-17).
    admin.from('services').select('*').eq('business_id', businessId).order('created_at'),
    // Equipo (calca equipo/page.tsx:14).
    admin.from('professionals').select('*').eq('business_id', businessId).order('created_at'),
    // Consultorios (calca consultorios/page.tsx:14).
    admin.from('locations').select('*').eq('business_id', businessId).order('created_at'),
    // Clientes: PII completa, sin masking (D-15; calca clients/page.tsx:18-22).
    admin.from('clients').select('*').eq('business_id', businessId).order('created_at'),
    // Bloques horarios (calca agenda/page.tsx:29, sin sub-orden para mantenerlo agnóstico).
    admin.from('time_blocks').select('*').eq('business_id', businessId),
    // Excepciones de agenda (calca agenda/page.tsx:31).
    admin.from('schedule_exceptions').select('*').eq('business_id', businessId).order('date'),
    // Presencia de integraciones (booleanos, sin valores crudos): única fuente para la sección config.
    getBusinessIntegrationStatus(businessId),
  ])

  // Si el negocio no existe, el loader hace notFound(); las colecciones quedan vacías de todos modos.
  return {
    business: business ?? null,
    appointments: (appointments as Record<string, unknown>[] | null) ?? [],
    services: (services as Record<string, unknown>[] | null) ?? [],
    professionals: (professionals as Record<string, unknown>[] | null) ?? [],
    locations: (locations as Record<string, unknown>[] | null) ?? [],
    clients: (clients as Record<string, unknown>[] | null) ?? [],
    timeBlocks: (timeBlocks as Record<string, unknown>[] | null) ?? [],
    scheduleExceptions: (scheduleExceptions as Record<string, unknown>[] | null) ?? [],
    integrationStatus,
  }
}
