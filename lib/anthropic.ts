import Anthropic from '@anthropic-ai/sdk'

// Modelo chico y rápido para clasificación / sugerencias cortas.
export const AI_MODEL = 'claude-haiku-4-5'

// Devuelve un cliente Anthropic, o null si la key no está configurada. La feature
// de IA degrada elegante: sin key, los endpoints responden { available: false } y
// la selección manual sigue funcionando. La key vive SOLO en el server (env var),
// nunca se expone al cliente.
export function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

// Texto plano del primer bloque de texto de la respuesta.
export function firstText(message: Anthropic.Message): string {
  const block = message.content.find(b => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

// Parseo tolerante: intenta JSON directo y, si falla, extrae el primer objeto {...}.
// Las respuestas se fuerzan a JSON por system prompt, pero no confiamos a ciegas.
export function parseJsonLoose(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) } catch { /* sigue */ }
  const m = text.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) } catch { /* sigue */ } }
  return null
}
