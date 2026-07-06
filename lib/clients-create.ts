// Lógica PURA del alta manual de cliente (CLIENT-01), compartida por el route handler
// (app/api/clients/create/route.ts) y sus tests. Framework-agnostic (sin React ni Next), para
// poder testear el contrato sin levantar el server: validación del body + construcción del insert.
//
// Invariantes de seguridad que viven acá (D-02 + skill supabase-multitenant-rls):
//  - business_id SIEMPRE proviene del negocio resuelto por sesión (owner_id), NUNCA del body.
//  - origin='manual' se fija server-side; el cliente no lo elige (el CHECK de migr. 049 además
//    rechaza cualquier valor fuera de reserva|manual|importado).
//  - insurance_name / insurance_number SOLO se persisten si el vertical del negocio es salud.

import { resolveVertical } from '@/lib/verticals'

export interface ClientCreateInput {
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  insurance_name: string | null
  insurance_number: string | null
}

// Validación de dominio (D-02): nombre no vacío + al menos uno de teléfono/email.
// Devuelve el código de error snake_case, o null si el body es válido.
export function validateClientBody(input: { name: string; phone: string | null; email: string | null }): string | null {
  if (!input.name) return 'missing_fields'
  if (!input.phone && !input.email) return 'missing_fields'
  return null
}

// Construye el objeto del insert en `clients`. business_id = el del negocio de la sesión (no del
// body). origin='manual' fijo. insurance_* solo si el vertical resuelto es salud; en otros
// verticales se ignora aunque venga en el body (T-02-08).
export function buildClientInsert(
  business: { id: string; type?: string | null; vertical?: string | null },
  input: ClientCreateInput,
): Record<string, unknown> {
  const isSalud = resolveVertical(business).key === 'salud'
  return {
    business_id: business.id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
    ...(isSalud
      ? { insurance_name: input.insurance_name, insurance_number: input.insurance_number }
      : {}),
    origin: 'manual',
  }
}
