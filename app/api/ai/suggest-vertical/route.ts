import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient, AI_MODEL, firstText, parseJsonLoose } from '@/lib/anthropic'
import { ALL_BUSINESS_TYPES, getVerticalKeyByType, VERTICALS } from '@/lib/verticals'
import type { NextRequest } from 'next/server'

// Sugiere el rubro (subtipo) más probable para un negocio a partir de su nombre.
// La salida se acota a la lista cerrada ALL_BUSINESS_TYPES (no inventa).
export async function POST(request: NextRequest) {
  // Solo dueños autenticados pueden usar la asistencia de IA.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  // Degradado elegante: sin key, la feature no está disponible (no es un error).
  const client = getAnthropicClient()
  if (!client) return Response.json({ available: false })

  let body: { name?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }) }
  const name = (body.name || '').trim()
  if (!name) return Response.json({ error: 'Falta el nombre del negocio' }, { status: 400 })

  try {
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 150,
      system: 'Clasificás el rubro de un negocio por su nombre. Respondés SOLO con un objeto JSON {"type":"<valor>"}, sin texto adicional. El valor debe ser EXACTAMENTE uno de la lista provista; no inventes opciones nuevas.',
      messages: [{
        role: 'user',
        content: `Nombre del negocio: "${name}"\nRubros válidos (elegí uno): ${JSON.stringify(ALL_BUSINESS_TYPES)}`,
      }],
    })

    const parsed = parseJsonLoose(firstText(msg))
    const raw = typeof parsed?.type === 'string' ? parsed.type : null
    const type = raw && ALL_BUSINESS_TYPES.includes(raw) ? raw : null
    if (!type) return Response.json({ available: true, type: null })

    const vertical = getVerticalKeyByType(type)
    return Response.json({ available: true, type, vertical, verticalLabel: VERTICALS[vertical].label })
  } catch (e) {
    // Cualquier fallo de la IA degrada a "no disponible": la carga manual sigue.
    console.error('suggest-vertical error:', e)
    return Response.json({ available: false })
  }
}
