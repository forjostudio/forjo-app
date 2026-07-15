'use server'

import { createClient } from '@/lib/supabase/server'
import { parseLandingConfigForWrite } from '@/lib/landing/write'

// ── Server Actions OWNER-ONLY del CMS: guardar borrador / publicar / descartar (Phase 13 + 15) ─────
//
// Es la capa de PERSISTENCIA segura del CMS: el dueño escribe SU PROPIO landing desde el panel.
// El editor las invoca programáticamente (`await saveLandingDraft(config)`); NO reciben FormData.
// Fase security-sensitive (toca el invariante multi-tenant, Core Value).
//
// ── Phase 15: el dato está PARTIDO EN DOS (migración 050) ──────────────────────────────────────────
//   · businesses.landing_config → LO PUBLICADO. Lo único que leen /[slug], su layout y su og-image.
//   · businesses.landing_draft  → LO QUE SE EDITA. Lo único que escribe el editor del dueño.
//
//   saveLandingDraft(input)  → escribe el BORRADOR. Guardar deja de tener consecuencias públicas (PUB-03).
//   publishLanding()         → COPIA server-side draft → published. El borrador queda INTACTO (D-02).
//   discardLandingDraft()    → COPIA server-side published → draft (o NULL si nunca publicó).
//
// Por qué las dos acciones nuevas NO RECIBEN ARGUMENTOS (D-16, T-15-05):
//   Superficie de tampering = 0. No hay body que validar, estripar ni confundir: el config que sale al
//   aire se LEE DE LA DB, no del cliente. Un POST directo a publishLanding() no puede inyectar lo que
//   se publica — a lo sumo publica el borrador de su PROPIO negocio, que es su derecho. Aceptar el
//   config a publicar por el body convertiría "publicar" en "escribir directo lo publicado" y tiraría
//   toda la fase a la basura.
//
// Por qué la copia es de DOS PASOS (SELECT + UPDATE) y no un solo update:
//   PostgREST NO interpreta nombres de columna del lado derecho de un UPDATE: no existe `SET col_a =
//   col_b`. `.update({ landing_config: 'landing_draft' })` escribiría el STRING LITERAL "landing_draft"
//   en la columna jsonb y destruiría el config publicado del dueño. Los dos pasos, además, son lo ÚNICO
//   que permite correr el Zod estricto sobre el borrador ANTES de publicarlo (código `invalid_draft`):
//   un borrador corrupto —escrito por el script del operador, por una versión vieja del editor o a mano—
//   NO sale al aire.
//
// Por qué NO se invalida ninguna caché tras publicar (ni revalidatePath, ni revalidateTag, ni refresh):
//   /[slug] es `force-dynamic` y lee con supabase-js (no `fetch` cacheado) → NO HAY entrada de caché que
//   invalidar; el cambio se ve en el próximo request. Y la doc de Next 16 avisa que `revalidatePath`
//   llamado desde un Server Function "also causes all previously visited pages to refresh when navigated
//   to again" → refreshes espurios en todo el dashboard. El estado post-publicación se resuelve en
//   memoria en el cliente (los dos baselines ya están ahí).
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
//   (c) GATE ÚNICO = ENTITLEMENT POR SESIÓN: retirado el kill-switch global de entorno, el add-on
//       `has_web_custom` resuelto de la SESIÓN (owner_id = auth.uid()) queda como ÚNICO guard de
//       escritura. Cada acción lo re-chequea (early-return not_entitled): un POST directo de un
//       no-entitled se corta acá, aunque la page ya lo mande al upsell (defensa en profundidad).
//   (d) LIMITACIÓN CONOCIDA (para /gsd:secure-phase 13): con la policy RLS `FOR ALL`, el propio dueño
//       puede técnicamente escribir su columna vía anon-key directo (igual que hoy escribe theme/palette
//       desde settings-client.tsx). Esta action NO cierra ese bypass a nivel DB — agrega validación Zod
//       no-bypasseable en el PATH OFICIAL del producto (el único que Phase 14 expone). NO viola el Core
//       Value: sigue siendo owner-only y el aislamiento cross-tenant (B no escribe la fila de A) queda
//       intacto y probado por SC2 (test/isolation.test.ts).

// Shape de dominio compartido por las 3 acciones (convención del repo: { ok } | { ok, error snake }).
type Result = { ok: true } | { ok: false; error: string }

// ── saveLandingDraft: escribe el BORRADOR (PUB-03, D-01) ──────────────────────────────────────────
// Es `saveLandingConfig` de Phase 13 con UN solo diff real: la columna. Antes cada guardado salía al
// aire al instante; ahora guarda `landing_draft` y la web pública NO se mueve. El nombre viejo ya no
// existe (sin alias): un call site que siga escribiendo lo publicado sería una regresión silenciosa
// de PUB-03, así que tiene que romper el type-check, no compilar.
export async function saveLandingDraft(input: unknown): Promise<Result> {
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
    //    Se trae has_web_custom en el MISMO select: es el entitlement del add-on de web (PUB-01).
    const { data: business } = await supabase
      .from('businesses')
      .select('id, has_web_custom')
      .eq('owner_id', user.id)
      .single()
    if (!business) return { ok: false, error: 'no_business' }

    // 4b. ENTITLEMENT (gate real, server-side): sin web a medida contratada, NO se escribe. Gatear
    //     solo la page sería cosmético — un POST directo a la action la saltearía. Acá se corta.
    //     has_web_custom la togglea el admin desde el CRM con service-role; el trigger
    //     businesses_protect_admin_columns la revierte ante cualquier UPDATE que no sea service_role,
    //     así que el dueño NO puede auto-otorgársela para desbloquear el CMS (anti-tampering).
    if (!business.has_web_custom) return { ok: false, error: 'not_entitled' }

    // 5. Validación estricta reject-on-invalid: un config inválido NO se escribe (no 500, no default).
    const parsed = parseLandingConfigForWrite(input)
    if (!parsed.ok) return { ok: false, error: parsed.error }

    // 6. Overwrite total SOLO de landing_draft, acotado a la fila del propio negocio. El payload es
    //    exactamente { landing_draft } (por construcción nunca toca otra columna, y NUNCA la publicada
    //    — escribir las dos "por compatibilidad" rompería PUB-03 en silencio). El `.select('id')`
    //    verifica filas afectadas: si el negocio fue borrado entre el fetch y el update, el update es
    //    un no-op silencioso que sin esta verificación devolvería { ok:true } sin escribir nada (WR-01).
    const { data: updated, error } = await supabase
      .from('businesses')
      .update({ landing_draft: parsed.data })
      .eq('id', business.id)
      .select('id')
    if (error) return { ok: false, error: 'update_failed' }
    if (!updated || updated.length === 0) return { ok: false, error: 'update_failed' }

    return { ok: true }
  } catch {
    return { ok: false, error: 'server_error' }
  }
}

// ── publishLanding: COPIA server-side del borrador a lo publicado (PUB-04, D-02) ───────────────────
// SIN ARGUMENTOS. Lo que sale al aire se lee de la DB (T-15-05). Mismos pasos 1-5 que saveLandingDraft
// (flag → session client → sesión → negocio de la sesión → entitlement); el select trae además el
// borrador para no hacer un round-trip extra.
//
// D-11 (PROHIBICIÓN): el Zod estricto es el ÚNICO filtro de contenido. Si parseLandingConfigForWrite
// acepta el borrador, se publica — punto. Está prohibido agregar cualquier chequeo de calidad
// pre-publicación (checklist blando, "el hero no tiene título", "faltan secciones", mínimos de
// contenido): sería una capa de reglas de producto nueva a mantener en sync con el schema, el renderer
// ya es fail-safe con secciones vacías, y el dueño ve EXACTAMENTE lo que va a salir en su preview.
export async function publishLanding(): Promise<Result> {
  try {
    // 2. Session client (anon + cookies, RLS activo). PROHIBIDO createAdminClient()/service-role acá.
    const supabase = await createClient()

    // 3. Sesión del dueño.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'unauthorized' }

    // 4. Negocio + entitlement + BORRADOR, todo en el MISMO select acotado a la SESIÓN. El business_id
    //    sale de acá (owner_id = auth.uid()), jamás de un body: no hay body (T-15-15).
    const { data: business } = await supabase
      .from('businesses')
      .select('id, has_web_custom, landing_draft')
      .eq('owner_id', user.id)
      .single()
    if (!business) return { ok: false, error: 'no_business' }

    // 4b. ENTITLEMENT (gate real, server-side): se chequea EN LA ACCIÓN, no solo en la page — gatear
    //     solo la page es cosmético, un POST directo la saltea (T-15-04).
    if (!business.has_web_custom) return { ok: false, error: 'not_entitled' }

    // 5. Sin borrador no hay nada que copiar. En la práctica el cliente encadena guardar → publicar
    //    (siempre, no solo si hay cambios), así que esto solo salta ante una carrera. Fail-closed igual.
    if (business.landing_draft === null || business.landing_draft === undefined) {
      return { ok: false, error: 'no_draft' }
    }

    // 6. Zod ESTRICTO sobre lo LEÍDO DE LA DB (no sobre un body): reject-on-invalid, nunca coerción a
    //    DEFAULT (eso es el contrato de RENDER, no el de ESCRITURA). Un borrador corrupto no sale al aire.
    //    Desde T-15-16 el parse valida TAMBIÉN el `data` de cada sección por tipo y topea el tamaño:
    //    un borrador escrito fuera de la app (script del operador con service-role, versión vieja del
    //    editor) con un `javascript:` adentro NO se publica. El código de tamaño se propaga tal cual —
    //    decirle "hay un dato inválido" a un dueño cuyo config pesa 300 KB sería mentirle.
    const parsed = parseLandingConfigForWrite(business.landing_draft)
    if (!parsed.ok) {
      return { ok: false, error: parsed.error === 'config_too_large' ? 'config_too_large' : 'invalid_draft' }
    }

    // 7. La copia. Solo landing_config; el BORRADOR QUEDA INTACTO (D-02: post-publicación draft ==
    //    published, y el editor lo refleja sin refetch). `.select('id')` detecta el update no-op.
    const { data: updated, error } = await supabase
      .from('businesses')
      .update({ landing_config: parsed.data })
      .eq('id', business.id)
      .select('id')
    if (error || !updated || updated.length === 0) return { ok: false, error: 'publish_failed' }

    // NO se invalida caché acá (ver cabecera): /[slug] es force-dynamic y no tiene entrada de caché.
    return { ok: true }
  } catch {
    return { ok: false, error: 'server_error' }
  }
}

// ── discardLandingDraft: el borrador vuelve a ser copia fiel de lo publicado (PUB-06, D-12/D-13) ───
// SIN ARGUMENTOS, misma razón que publishLanding. Si el negocio NUNCA publicó (landing_config IS NULL),
// el borrador se limpia a NULL: el editor re-siembra DEFAULT_LANDING_CONFIG en memoria (mismo camino de
// empty-state de Phase 14) y su /[slug] sigue mostrando la reserva simple. Nunca queda un editor vacío.
//
// Acá NO se re-valida lo publicado con el Zod estricto, a propósito: ese valor YA ESTÁ AL AIRE y el
// contrato de lectura (parseLandingConfig) es fail-safe. Validarlo dejaría a un negocio con un config
// viejo/raro sin poder descartar nunca — un dead-end sin salida.
export async function discardLandingDraft(): Promise<Result> {
  try {
    // 2. Session client (anon + cookies, RLS activo). Nunca service-role.
    const supabase = await createClient()

    // 3. Sesión del dueño.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'unauthorized' }

    // 4. Negocio + entitlement + LO PUBLICADO, en el MISMO select acotado a la sesión.
    const { data: business } = await supabase
      .from('businesses')
      .select('id, has_web_custom, landing_config')
      .eq('owner_id', user.id)
      .single()
    if (!business) return { ok: false, error: 'no_business' }

    // 4b. ENTITLEMENT en la acción (T-15-04), igual que en las otras dos.
    if (!business.has_web_custom) return { ok: false, error: 'not_entitled' }

    // 5. La copia inversa. `?? null` es el caso "nunca publicó": el borrador se limpia (D-13).
    const { data: updated, error } = await supabase
      .from('businesses')
      .update({ landing_draft: business.landing_config ?? null })
      .eq('id', business.id)
      .select('id')
    if (error || !updated || updated.length === 0) return { ok: false, error: 'discard_failed' }

    return { ok: true }
  } catch {
    return { ok: false, error: 'server_error' }
  }
}
