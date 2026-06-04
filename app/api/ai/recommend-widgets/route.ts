import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, AI_MODEL, firstText, parseJsonLoose } from '@/lib/anthropic'
import { DASHBOARD_WIDGETS, DASHBOARD_WIDGET_IDS, sanitizeWidgetIds } from '@/lib/dashboard-widgets'
import { VERTICALS, type VerticalKey } from '@/lib/verticals'
import type { NextRequest } from 'next/server'

// Dado el rubro, recomienda qué widgets del catálogo FIJO mostrar en el dashboard.
// La salida se acota a ids del catálogo (no inventa). El usuario confirma en la UI.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const client = getAnthropicClient()
  if (!client) return Response.json({ available: false })

  let body: { vertical?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }) }
  const vertical = (body.vertical || '') as VerticalKey
  const verticalLabel = VERTICALS[vertical]?.label
  if (!verticalLabel) return Response.json({ error: 'Rubro inválido' }, { status: 400 })

  const catalog = DASHBOARD_WIDGETS.map(w => ({ id: w.id, label: w.label, description: w.description }))

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 150,
      system: 'Recomendás qué widgets mostrar en el dashboard de un negocio según su rubro. Respondés SOLO con un objeto JSON {"widgets":["id",...]}, sin texto adicional. Cada id debe ser EXACTAMENTE uno del catálogo provisto; no inventes ids.',
      messages: [{
        role: 'user',
        content: `Rubro del negocio: ${verticalLabel}\nCatálogo de widgets disponibles: ${JSON.stringify(catalog)}\nElegí los más útiles para ese rubro (devolvé sus ids).`,
      }],
    })

    const parsed = parseJsonLoose(firstText(msg))
    const widgets = sanitizeWidgetIds(parsed?.widgets)
    // Si la IA no devolvió algo usable, recomendamos todo (default seguro).
    return Response.json({ available: true, widgets: widgets ?? DASHBOARD_WIDGET_IDS })
  } catch (e) {
    console.error('recommend-widgets error:', e)
    return Response.json({ available: false })
  }
}
