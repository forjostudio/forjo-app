import { createAdminClient } from '@/lib/supabase/admin'
import { PipelineClient, type PipelineDeal, type PipelineTag } from './pipeline-client'

/**
 * Tablero de pipeline de la Consola CRM (/admin/pipeline) — PIPE-01/02/04.
 *
 * RSC que lee con service-role (createAdminClient) DENTRO del server component: las tablas del CRM
 * (deals/leads/tags/entity_tags) son admin-only por RLS (migración 034) → la lectura va con
 * service-role tras el guard del layout (crm). El service-role NUNCA cruza al cliente
 * (anti-pattern T-04): se pasan SOLO filas no sensibles (deal + nombre/email/whatsapp del lead +
 * tagIds), nunca el cliente admin ni tokens.
 *
 * SELECT explícito de columnas (sin comodín — calca negocios/page.tsx). El tablero muestra los deals
 * OPEN (los won/lost ya salieron del embudo activo); los totales $ por columna y el resumen del header
 * se calculan en el cliente con stageTotals/pipelineSummary (módulo puro de lib/crm-pipeline).
 */

type DealSelect = {
  id: string
  lead_id: string
  title: string | null
  value_ars: number
  stage: string
  status: string
  business_id: string | null
  expected_close_date: string | null
}

type LeadSelect = {
  id: string
  name: string
  email: string | null
  whatsapp: string | null
  business_id: string | null
}

type TagSelect = { id: string; label: string; color: string }

type EntityTagSelect = { tag_id: string; entity_type: string; entity_id: string }

export default async function PipelinePage() {
  const admin = createAdminClient()

  // Deals open + catálogo de tags + asignaciones, en paralelo (volumen bajo, un operador).
  const [dealsRes, tagsRes, entityTagsRes] = await Promise.all([
    admin
      .from('deals')
      .select('id, lead_id, title, value_ars, stage, status, business_id, expected_close_date')
      .eq('status', 'open')
      .order('created_at', { ascending: false }),
    admin.from('tags').select('id, label, color').order('label', { ascending: true }),
    admin.from('entity_tags').select('tag_id, entity_type, entity_id'),
  ])

  const loadError = Boolean(dealsRes.error || tagsRes.error || entityTagsRes.error)
  if (dealsRes.error) console.error('[crm/pipeline] deals read error:', dealsRes.error.message)
  if (tagsRes.error) console.error('[crm/pipeline] tags read error:', tagsRes.error.message)
  if (entityTagsRes.error) console.error('[crm/pipeline] entity_tags read error:', entityTagsRes.error.message)

  const dealRows: DealSelect[] = (dealsRes.data ?? []) as DealSelect[]
  const tagRows: TagSelect[] = (tagsRes.data ?? []) as TagSelect[]
  const entityTags: EntityTagSelect[] = (entityTagsRes.data ?? []) as EntityTagSelect[]

  // Leads de esos deals (para nombre/email/whatsapp de la tarjeta). Una sola query acotada por ids.
  const leadIds = Array.from(new Set(dealRows.map((d) => d.lead_id)))
  let leadRows: LeadSelect[] = []
  if (leadIds.length > 0) {
    const { data: leadsData, error: leadsErr } = await admin
      .from('leads')
      .select('id, name, email, whatsapp, business_id')
      .in('id', leadIds)
    if (leadsErr) console.error('[crm/pipeline] leads read error:', leadsErr.message)
    leadRows = (leadsData ?? []) as LeadSelect[]
  }
  const leadById = new Map(leadRows.map((l) => [l.id, l]))

  // tagIds por entidad (lead) para los chips de cada tarjeta y el filtro OR.
  function tagIdsFor(entityType: 'lead', entityId: string): string[] {
    return entityTags
      .filter((et) => et.entity_type === entityType && et.entity_id === entityId)
      .map((et) => et.tag_id)
  }

  const deals: PipelineDeal[] = dealRows.map((d): PipelineDeal => {
    const lead = leadById.get(d.lead_id)
    return {
      id: d.id,
      leadId: d.lead_id,
      contactName: lead?.name ?? d.title ?? 'Sin nombre',
      contactEmail: lead?.email ?? null,
      valueArs: d.value_ars,
      stage: d.stage,
      status: d.status,
      businessId: d.business_id,
      expectedCloseDate: d.expected_close_date,
      tagIds: tagIdsFor('lead', d.lead_id),
    }
  })

  const tags: PipelineTag[] = tagRows.map((t) => ({ id: t.id, label: t.label, color: t.color }))

  return <PipelineClient deals={deals} tags={tags} loadError={loadError} />
}
