'use server'

import { createClient } from '@/lib/supabase/server'
import { parseLandingConfigForWrite } from '@/lib/landing/write'

// ── Server Action OWNER-ONLY de escritura del landing_config (CMS, Phase 13) ──────────────────────
//
// Es la capa de PERSISTENCIA segura del CMS: el dueño escribe SU PROPIO landing_config desde el panel.
// Phase 14 la invoca programáticamente (`await saveLandingConfig(config)`); NO recibe FormData, recibe
// el config como objeto `unknown`. Fase security-sensitive (toca el invariante multi-tenant, Core Value).
//
// Por qué cada decisión:
//   (a) SESSION CLIENT, no service-role: usa `createClient()` de @/lib/supabase/server (anon + cookies,
//       RLS activo) — jamás `createAdminClient()`. El CRM sí usa service-role porque es admin-only global;
//       acá el actor es el DUEÑO y el guard real es su sesión + la policy RLS `owner_id = auth.uid()`.
//       Meter service-role en la superficie web de escritura re-abriría el riesgo de bypass de aislamiento
//       que endureció v0.9 (threat T-13-02).
//   (b) business_id de la SESIÓN, nunca del body: se resuelve con `.eq('owner_id', user.id).single()` y el
//       .update apunta a `.eq('id', business.id)`. Un `business_id` que venga en `input` se IGNORA por
//       construcción → un POST directo no puede escribir la fila de otro tenant (anti-tampering, T-13-01).
//   (c) FLAG PRIMERO (fail-closed): el kill-switch global es el PRIMER early-return, antes de crear el
//       client, `getUser` o cualquier efecto. Ausente o ≠ 'true' → OFF (T-13-04). Phase 14 reusa el MISMO
//       flag para gatear el render del editor server-side.
//   (d) LIMITACIÓN CONOCIDA (para /gsd:secure-phase 13): con la policy RLS `FOR ALL`, el propio dueño
//       puede técnicamente escribir su columna vía anon-key directo (igual que hoy escribe theme/palette
//       desde settings-client.tsx). Esta action NO cierra ese bypass a nivel DB — agrega validación Zod
//       no-bypasseable en el PATH OFICIAL del producto (el único que Phase 14 expone). NO viola el Core
//       Value: sigue siendo owner-only y el aislamiento cross-tenant (B no escribe la fila de A) queda
//       intacto y probado por SC2 (test/isolation.test.ts).

// Kill-switch global del CMS (D-01/D-01b). Server-only (NO NEXT_PUBLIC_*), fail-closed: solo el valor
// exacto 'true' enciende; ausente o cualquier otro valor → false. Espeja el patrón de MP_MODE.
const CMS_ENABLED = process.env.CMS_ENABLED === 'true'

export async function saveLandingConfig(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 1. Flag primero — kill-switch global. Con el flag off el request NO escribe ni resuelve sesión.
  if (!CMS_ENABLED) return { ok: false, error: 'cms_disabled' }

  // Efectos de red (pasos 2-6) envueltos en try/catch: un error inesperado (red, Supabase caído)
  // devuelve un error de dominio { ok:false, error:'server_error' } en vez de tirar un throw sin
  // capturar fuera de la Server Action (WR-03). Los early-returns de dominio de abajo NO tiran.
  try {
    // 2. Session client (anon + cookies, RLS activo). PROHIBIDO createAdminClient()/service-role acá.
    const supabase = await createClient()

    // 3. Sesión del dueño.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'unauthorized' }

    // 4. Negocio resuelto de la SESIÓN (owner_id = auth.uid()), nunca de un business_id del body.
    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!business) return { ok: false, error: 'no_business' }

    // 5. Validación estricta reject-on-invalid: un config inválido NO se escribe (no 500, no default).
    const parsed = parseLandingConfigForWrite(input)
    if (!parsed.ok) return { ok: false, error: parsed.error }

    // 6. Overwrite total SOLO de landing_config, acotado a la fila del propio negocio. El payload es
    //    exactamente { landing_config } (por construcción nunca toca otra columna). El `.select('id')`
    //    verifica filas afectadas: si el negocio fue borrado entre el fetch y el update, el update es
    //    un no-op silencioso que sin esta verificación devolvería { ok:true } sin escribir nada (WR-01).
    const { data: updated, error } = await supabase
      .from('businesses')
      .update({ landing_config: parsed.data })
      .eq('id', business.id)
      .select('id')
    if (error) return { ok: false, error: 'update_failed' }
    if (!updated || updated.length === 0) return { ok: false, error: 'update_failed' }

    return { ok: true }
  } catch {
    return { ok: false, error: 'server_error' }
  }
}
