// Lógica PURA del alta manual de cliente (CLIENT-01), compartida por el route handler
// (app/api/clients/create/route.ts) y sus tests. Framework-agnostic (sin React ni Next), para
// poder testear el contrato sin levantar el server: validación del body + construcción del insert.
//
// Invariantes de seguridad que viven acá (D-02 + skill supabase-multitenant-rls):
//  - business_id SIEMPRE proviene del negocio resuelto por sesión (owner_id), NUNCA del body.
//  - origin se fija server-side; el cliente no lo elige (el CHECK de migr. 049 además
//    rechaza cualquier valor fuera de reserva|manual|importado). buildClientInsert lo recibe
//    como parámetro con default 'manual' (alta manual); el import lo pasa como 'importado'.
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

// Un teléfono es opcional, pero si viene solo puede tener dígitos, espacios y `+ ( ) -`
// (no letras ni otros símbolos). Vacío/null = válido (el campo no es obligatorio).
export function isValidPhone(phone: string | null | undefined): boolean {
  const v = phone?.trim()
  if (!v) return true
  return /^[\d\s()+-]+$/.test(v)
}

// Un email es opcional, pero si viene tiene que tener formato válido (local@dominio.tld). Vacío/null =
// válido. Contraparte server-side del `z.string().email()` del form del alta — la usa también el import
// CSV, que no tiene validación de cliente por fila (por eso un email sin @ se colaba). Bug UAT Fase 3.
export function isValidEmail(email: string | null | undefined): boolean {
  const v = email?.trim()
  if (!v) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

// Validación de dominio (D-02): nombre no vacío + al menos uno de teléfono/email +
// teléfono y email con formato válido si vienen. Devuelve el código de error snake_case, o null si es válido.
export function validateClientBody(input: { name: string; phone: string | null; email: string | null }): string | null {
  if (!input.name) return 'missing_fields'
  if (!input.phone && !input.email) return 'missing_fields'
  if (!isValidPhone(input.phone)) return 'invalid_phone'
  if (!isValidEmail(input.email)) return 'invalid_email'
  return null
}

// Construye el objeto del insert en `clients`. business_id = el del negocio de la sesión (no del
// body). origin parametrizable con default 'manual' (alta manual intacta); el import CSV lo llama
// con 'importado'. insurance_* solo si el vertical resuelto es salud; en otros verticales se
// ignora aunque venga en el body (T-02-08).
export function buildClientInsert(
  business: { id: string; type?: string | null; vertical?: string | null },
  input: ClientCreateInput,
  origin: 'manual' | 'importado' = 'manual',
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
    origin,
  }
}
