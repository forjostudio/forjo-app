import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanPrices } from '@/lib/plan-prices'
import { NegociosClient, type NegocioRow, type DirectoryTag } from './negocios-client'

/**
 * Directorio de negocios de la Consola CRM (/admin/negocios) — ADM-01.
 *
 * RSC que lee TODOS los negocios con service-role (createAdminClient) DENTRO del server component:
 * `businesses` NO tiene policy "is_admin lee todo" → la lectura cross-tenant del super-admin va con
 * service-role tras el guard del layout (crm). El service-role NUNCA cruza al cliente
 * (anti-pattern T-01-09 / T-02-09): se pasan SOLO filas con columnas no sensibles + el email del
 * dueño resuelto + los precios. Jamás el cliente admin ni tokens/secrets.
 *
 * Email del dueño (Pitfall 6 / T-02-10): se resuelve vía admin.auth.admin.getUserById(owner_id)
 * de forma ACOTADA — se extrae solo el email, con fallback a notification_email; el objeto user
 * completo nunca se propaga. Volumen bajo (un operador) → resolución en paralelo aceptable.
 *
 * SELECT explícito de columnas no sensibles (calca auditoria/page.tsx). El directorio muestra
 * SIEMPRE los suspendidos (filterBusinesses incluye 'todos'); el StatusBadge rojo los marca (Pitfall 4).
 */

// Subconjunto de columnas no sensibles de businesses que necesita el directorio.
type BusinessSelect = {
  id: string
  name: string
  slug: string
  owner_id: string
  plan: string | null
  plan_status: string | null
  trial_ends_at: string | null
  subscription_ends_at: string | null
  mp_subscription_id: string | null
  whatsapp: string | null
  notification_email: string | null
  has_web_custom: boolean | null
  has_whatsapp: boolean | null
  created_at: string
}

export default async function NegociosPage() {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('businesses')
    .select(
      'id, name, slug, owner_id, plan, plan_status, trial_ends_at, subscription_ends_at, mp_subscription_id, whatsapp, notification_email, has_web_custom, has_whatsapp, created_at'
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[crm/negocios] read error:', error.message)
  }

  const businesses: BusinessSelect[] = (data ?? []) as BusinessSelect[]
  const prices = await getPlanPrices()

  // ── Tags del directorio (filtro por tag, PIPE-04) ──────────────────────────────────────────────
  // Catálogo de tags + asignaciones (entity_type='business') con service-role (tags/entity_tags son
  // admin-only por RLS; el gate is_admin lo dio el layout). Se mapean los tagIds por negocio para el
  // filtro OR del cliente. tagIds NO son datos sensibles (T-04-13): solo ids de etiquetas del catálogo.
  const tagsByBusiness = new Map<string, string[]>()
  let catalogTags: DirectoryTag[] = []
  try {
    const { data: catalog } = await admin.from('tags').select('id, label, color').order('label')
    catalogTags = (catalog ?? []) as DirectoryTag[]

    const { data: assignments } = await admin
      .from('entity_tags')
      .select('tag_id, entity_id')
      .eq('entity_type', 'business')
    for (const a of assignments ?? []) {
      const row = a as { tag_id: string; entity_id: string }
      const list = tagsByBusiness.get(row.entity_id) ?? []
      list.push(row.tag_id)
      tagsByBusiness.set(row.entity_id, list)
    }
  } catch (e) {
    console.error('[crm/negocios] tags read error:', e instanceof Error ? e.message : e)
  }

  // Email del dueño acotado: solo el string de email, fallback a notification_email (nunca el user completo).
  const rows: NegocioRow[] = await Promise.all(
    businesses.map(async (b): Promise<NegocioRow> => {
      let ownerEmail: string | null = b.notification_email ?? null
      try {
        const { data: userData } = await admin.auth.admin.getUserById(b.owner_id)
        if (userData?.user?.email) ownerEmail = userData.user.email
      } catch (e) {
        console.error('[crm/negocios] getUserById error:', e instanceof Error ? e.message : e)
      }
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        ownerEmail,
        whatsapp: b.whatsapp,
        plan: b.plan ?? 'basic',
        plan_status: b.plan_status ?? 'trial',
        trial_ends_at: b.trial_ends_at,
        has_web_custom: Boolean(b.has_web_custom),
        has_whatsapp: Boolean(b.has_whatsapp),
        created_at: b.created_at,
        tagIds: tagsByBusiness.get(b.id) ?? [],
      }
    })
  )

  return <NegociosClient rows={rows} prices={prices} catalogTags={catalogTags} loadError={Boolean(error)} />
}
