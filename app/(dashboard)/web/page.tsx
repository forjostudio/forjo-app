import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { WebEditorClient } from './web-client'

// ── Editor CMS: ruta server gateada por flag (Phase 14, D-07) ──────────────────────────
//
// El editor visual del dueño vive en app/(dashboard)/web/ junto a _landing-actions.ts. Esta page
// es Server Component: (1) fail-closed por CMS_ENABLED, (2) resuelve el business de la SESIÓN,
// (3) server-fetchea UNA vez los datos que el LandingRenderer necesita para el preview (D-01b) y
// (4) monta el client editor. Cero exposición en nav (EDIT-07): se accede sólo por URL directa
// mientras el flag esté encendido.
//
// Por qué cada decisión de seguridad:
//   (a) FLAG PRIMERO (fail-closed): CMS_ENABLED === 'true' se lee como PRIMER paso, antes de crear
//       el client, getUser o cualquier fetch. Con el flag off → notFound() (la ruta "no existe").
//       Misma expresión literal que _landing-actions.ts:33 (threat note d de Phase 13 / T-14-02).
//   (b) SESSION CLIENT, nunca service-role: createClient() de @/lib/supabase/server (anon + cookies,
//       RLS activo). PROHIBIDO el service-role/admin client en la superficie web (T-14-04, heredado T-13-02).
//   (c) AISLAMIENTO POR TENANT: los 5 datasets del preview se fetchean con .eq('business_id',
//       business.id) del business de la sesión — sin fetch cross-tenant (T-14-03). El owner es un
//       actor autenticado y la RLS de las tablas base aplica (mismo patrón que settings/page.tsx).

// Kill-switch global del CMS. Server-only (NO NEXT_PUBLIC_*), fail-closed: sólo 'true' enciende.
const CMS_ENABLED = process.env.CMS_ENABLED === 'true'

export default async function WebEditorPage() {
  // 1. Flag primero — fail-closed. Sin flag la ruta no renderiza NADA (notFound antes de todo).
  if (!CMS_ENABLED) notFound()

  // 2. Session client (anon + cookies, RLS). Nunca service-role acá.
  const supabase = await createClient()

  // 3. Sesión del dueño.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 4. Negocio de la SESIÓN (owner_id = auth.uid()), con COLUMNAS EXPLÍCITAS. Nunca un business_id
  //    del cliente, y nunca select('*'): esta fila viaja entera al bundle del cliente (el business es
  //    prop de un Client Component), así que un '*' publicaría en el payload RSC notification_email,
  //    plan/plan_status, mp_subscription_id, mp_user_id, owner_id… y bastaría con que mañana alguien
  //    agregue una columna sensible a `businesses` para que se filtre sola. La lista es exactamente
  //    lo que consume el LandingRenderer + el BookingClient del preview (misma lista que
  //    app/[slug]/page.tsx), MÁS: theme/palette/font (fallback de resolveLandingTheme en el preview),
  //    has_web_custom (el gate del add-on) y los dos configs.
  const { data: business } = await supabase
    .from('businesses')
    .select(
      'id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp, address, instagram, require_deposit, deposit_amount, deposit_expiry_hours, recaptcha_site_key, default_slot_duration, buffer_minutes, created_at, palette, theme, font, has_web_custom, landing_config, landing_draft',
    )
    .eq('owner_id', user.id)
    .single()
  if (!business) redirect('/onboarding')

  // 4b. ENTITLEMENT por negocio (PUB-01): el CMS es un add-on, no una feature de plan. Solo puede
  //     editarse la web de un negocio que efectivamente TIENE web a medida (has_web_custom).
  //     Por qué esta columna y no el plan: (a) es el entitlement real (el admin la togglea desde el
  //     CRM cuando el cliente contrata/paga la web); (b) el trigger businesses_protect_admin_columns
  //     la REVIERTE ante cualquier UPDATE que no sea service_role → el dueño NO puede auto-otorgársela
  //     (gate a prueba de tampering); (c) sin web a medida no hay nada que editar.
  //     notFound() y no redirect: para un negocio sin el add-on, la ruta directamente "no existe".
  //     Esto es solo la puerta de la UI — el gate que DE VERDAD importa vive en saveLandingConfig
  //     (defensa en profundidad: una page sin este check igual no podría escribir).
  if (!business.has_web_custom) notFound()

  // 5. Datos del preview: los 5 datasets que el LandingRenderer consume además del config, todos
  //    acotados a este tenant. Los selects de schedule_exceptions y locations piden EXACTAMENTE las
  //    columnas que declaran ExceptionLite/LocationLite del renderer (landing-renderer.tsx:47-48),
  //    para que el cast a los Props del renderer sea seguro. schedule_exceptions se filtra desde hoy
  //    (las pasadas no afectan el preview), igual que [slug]/page.tsx.
  const todayStr = new Date().toISOString().slice(0, 10)
  const [
    { data: services },
    { data: professionals },
    { data: timeBlocks },
    { data: exceptions },
    { data: locations },
  ] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id),
    supabase.from('professionals').select('*').eq('business_id', business.id),
    supabase.from('time_blocks').select('*').eq('business_id', business.id),
    supabase
      .from('schedule_exceptions')
      .select('date, closed, start_time, end_time, location_id')
      .eq('business_id', business.id)
      .gte('date', todayStr),
    supabase
      .from('locations')
      .select('id, name, address, phone')
      .eq('business_id', business.id)
      .or('is_active.is.null,is_active.eq.true'),
  ])

  // 6. Los DOS configs, crudos (jsonb), al cliente. Phase 15 parte el dato en dos (migración 050) y
  //    el editor necesita ambos baselines para derivar sus 3 estados en memoria, sin estado nuevo en
  //    la DB (D-03) y sin un round-trip extra:
  //      · publishedConfig = landing_config → LO PUBLICADO (lo único que ve un visitante).
  //        **null significa "NUNCA PUBLICÓ"**: es la señal de la que dependen el dialog de go-live
  //        (D-08) y el aviso de empty-state. Se preserva como null, NO se coacciona a la plantilla.
  //      · initialDraft = landing_draft ?? publishedConfig → LO QUE SE EDITA. El coalesce es
  //        DEFENSIVO: la migración no produce el estado (publicado presente, borrador ausente), pero
  //        un rollback parcial o una fila tocada a mano sí podrían — y sin el coalesce un dueño con
  //        la web AL AIRE abriría el editor con una plantilla vacía. null acá = arranca del DEFAULT.
  //    Se DESESTRUCTURAN fuera del business: los dos jsonb ya viajan como props propias, y dejarlos
  //    también dentro de `business` los mandaría DOS VECES en el payload RSC (con una galería cargada
  //    el config no es chico).
  const { landing_config: publishedRaw, landing_draft: draftRaw, ...publicBusiness } = business
  const publishedConfig = publishedRaw ?? null
  const initialDraft = draftRaw ?? publishedConfig

  return (
    <WebEditorClient
      // Sin cast: `publicBusiness` YA es el subconjunto público (columnas explícitas, sin
      // notification_email). El `as unknown as PublicBusiness` de antes era una mentira — el tipo
      // excluye notification_email pero el objeto en runtime lo traía, y viajaba al navegador.
      business={publicBusiness}
      initialDraft={initialDraft}
      publishedConfig={publishedConfig}
      services={services || []}
      professionals={professionals || []}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
    />
  )
}
