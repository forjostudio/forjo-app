import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WebEditorClient } from './web-client'
import { WebUpsell } from './_web-upsell'
import { BookingClient } from '@/app/[slug]/booking-client'
import { CanchasBookingClient } from '@/app/[slug]/canchas-booking-client'
import { previewBookingInputs } from '@/lib/preview-booking'
import { resolveVertical } from '@/lib/verticals'

// ── Editor CMS: ruta server gateada por el add-on has_web_custom (Phase 17, PUB-01) ──────────────
//
// El editor visual del dueño vive en app/(dashboard)/web/ junto a _landing-actions.ts. Esta page
// es Server Component: (1) resuelve el business de la SESIÓN, (2) ramifica por el entitlement
// has_web_custom — con el add-on server-fetchea UNA vez los datos del preview (D-01b) y monta el
// editor; sin el add-on renderiza el upsell "Web a medida" (venta) en vez de un 404. Retirado el
// kill-switch global de entorno (Phase 17), has_web_custom es el ÚNICO gate y sostiene solo.
//
// Por qué cada decisión de seguridad:
//   (a) GATE ÚNICO = ENTITLEMENT POR SESIÓN: has_web_custom se resuelve del business de owner_id =
//       auth.uid() (nunca de un body). Decide editor vs upsell. Es solo la puerta de LECTURA — el
//       gate que DE VERDAD importa vive en las 3 Server Actions (cada una re-chequea has_web_custom).
//   (b) SESSION CLIENT, nunca service-role: createClient() de @/lib/supabase/server (anon + cookies,
//       RLS activo). PROHIBIDO el service-role/admin client en la superficie web (T-14-04, heredado T-13-02).
//   (c) AISLAMIENTO POR TENANT: los 5 datasets del preview se fetchean con .eq('business_id',
//       business.id) del business de la sesión — sin fetch cross-tenant (T-14-03). El owner es un
//       actor autenticado y la RLS de las tablas base aplica (mismo patrón que settings/page.tsx).

export default async function WebEditorPage() {
  // 1. Session client (anon + cookies, RLS). Nunca service-role acá.
  const supabase = await createClient()

  // 2. Sesión del dueño.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 3. Negocio de la SESIÓN (owner_id = auth.uid()), con COLUMNAS EXPLÍCITAS. Nunca un business_id
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

  // 3b. ENTITLEMENT por negocio (PUB-01): el CMS es un add-on, no una feature de plan. Solo edita la
  //     web un negocio que efectivamente TIENE web a medida (has_web_custom).
  //     Por qué esta columna y no el plan: (a) es el entitlement real (el admin la togglea desde el
  //     CRM cuando el cliente contrata/paga la web); (b) el trigger businesses_protect_admin_columns
  //     la REVIERTE ante cualquier UPDATE que no sea service_role → el dueño NO puede auto-otorgársela
  //     (gate a prueba de tampering); (c) sin web a medida no hay nada que editar.
  //     Sin el add-on → upsell "Web a medida" (venta), NO un 404. Se resuelve ANTES del Promise.all del
  //     preview, así un no-entitled no dispara las ~5 queries. Esto es solo la puerta de LECTURA — el
  //     gate que DE VERDAD importa vive en las 3 Server Actions (saveLandingDraft / publishLanding /
  //     discardLandingDraft: cada una re-chequea has_web_custom). Defensa en profundidad: una page sin
  //     este check igual no podría escribir.
  if (!business.has_web_custom) {
    return <WebUpsell slug={business.slug} />
  }

  // 4. Datos del preview: los datasets que el LandingRenderer consume además del config, todos
  //    acotados a este tenant. Los selects de schedule_exceptions y locations piden EXACTAMENTE las
  //    columnas que declaran los tipos ExceptionLite/LocationLite del renderer (landing-renderer.tsx),
  //    para que el cast a los Props del renderer sea seguro. schedule_exceptions se filtra desde hoy
  //    (las pasadas no afectan el preview), igual que [slug]/page.tsx.
  //
  //    Las DOS PUENTES (professional_services, time_block_services) son lo que le faltaba al preview
  //    para dejar de mentir: sin ellas el widget caía en la regla del comodín (puente vacía = sirve
  //    para todo) y TODA tarjeta de servicio se veía habilitada, mientras la página pública
  //    deshabilitaba con motivo al servicio que ninguna franja cubre (AGENDA-07) y filtraba el staff
  //    al servicio elegido (AGENDA-06). Se leen de la TABLA BASE con el cliente de SESIÓN y
  //    `.eq('business_id', …)`, igual que las otras cinco y que servicios/page.tsx: la base suma la
  //    RLS al filtro explícito (las dos capas), mientras las vistas `public_*` son DEFINER — sin
  //    security_invoker — y dejarían el aislamiento colgado de una sola. Las dos vistas públicas son
  //    proyecciones SIN WHERE, así que base y vista devuelven las mismas filas para el mismo tenant:
  //    no se pierde fidelidad (pinchado en test/preview-booking-parity.test.ts).
  //    Columnas EXPLÍCITAS: las 3 del mapeo, las que declaran ProfessionalService/TimeBlockService.
  const todayStr = new Date().toISOString().slice(0, 10)
  const [
    { data: services },
    { data: professionals },
    { data: timeBlocks },
    { data: exceptions },
    { data: locations },
    { data: professionalServices },
    { data: timeBlockServices },
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
    supabase
      .from('professional_services')
      .select('business_id, professional_id, service_id')
      .eq('business_id', business.id),
    supabase
      .from('time_block_services')
      .select('business_id, time_block_id, service_id')
      .eq('business_id', business.id),
  ])

  // 5. Los DOS configs, crudos (jsonb), al cliente. Phase 15 parte el dato en dos (migración 050) y
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
  //    El coalesce de initialDraft COLAPSA un dato que el indicador de estado necesita: si HABÍA o no
  //    un borrador persistido. Sin eso, un negocio nuevo (landing_draft IS NULL) abría el editor con
  //    el cartel "Guardado — sin publicar" — falso, no hay nada guardado. Por eso el hecho crudo
  //    (draftRaw !== null) viaja como prop propia; el coalesce queda intacto (es defensivo, ver arriba).
  const { landing_config: publishedRaw, landing_draft: draftRaw, ...publicBusiness } = business
  const publishedConfig = publishedRaw ?? null
  const initialDraft = draftRaw ?? publishedConfig
  const hasPersistedDraft = draftRaw !== null && draftRaw !== undefined

  // 6. EL NODO DE BOOKING DEL PREVIEW, armado acá y no en el cliente (quick 260913-3tv).
  //
  //    Hasta este quick el preview renderizaba <LandingRenderer> SIN `bookingSlot` y caía en un
  //    fallback interno del renderer: un BookingClient armado ahí mismo, sin las dos puentes y sin
  //    noción del vertical. O sea: el preview mentía sobre qué servicios son reservables (toda
  //    tarjeta habilitada, todo el staff capaz de todo) y en el vertical canchas mostraba un
  //    COMPONENTE DISTINTO del que ve el cliente final. El fallback ya no existe: el nodo se arma
  //    acá, por el MISMO camino que app/[slug]/page.tsx.
  //
  //    Por qué en el RSC y no en el client: (a) el gateo por vertical queda server-side, en el mismo
  //    eslabón de la cadena que en la página pública; (b) un elemento que llega por el payload RSC es
  //    referencialmente ESTABLE entre renders, así que el widget deja de re-crearse con cada tecla del
  //    editor (el fallback vivía dentro del render del client y se re-creaba siempre).
  //
  //    `previewBookingInputs` reproduce los WHERE de las vistas acotadas del público (el por qué de
  //    derivar en vez de leer la vista está en su docblock) y deriva las canchas de las dos tablas
  //    base que ya se fetchearon: cero query nueva, cero vista DEFINER en el dashboard.
  //
  //    Fail-safe DIRECCIONAL de los `|| []`: una lectura que falla deja la puente VACÍA ⇒ regla del
  //    comodín ⇒ todo queda agendado/cubierto, que es el comportamiento previo a las migraciones. Un
  //    error de lectura NUNCA puede apagar el catálogo del preview.
  const vertical = resolveVertical(business)
  const isCanchas = vertical.key === 'canchas'
  const {
    services: visibleServices,
    professionals: visibleStaff,
    canchas,
  } = previewBookingInputs({
    services: services || [],
    professionals: professionals || [],
  })
  const bookingNode = isCanchas ? (
    <CanchasBookingClient
      business={publicBusiness}
      canchas={canchas}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
    />
  ) : (
    <BookingClient
      business={publicBusiness}
      services={visibleServices}
      professionals={visibleStaff}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
      professionalServices={professionalServices || []}
      timeBlockServices={timeBlockServices || []}
    />
  )

  return (
    <WebEditorClient
      // Sin cast: `publicBusiness` YA es el subconjunto público (columnas explícitas, sin
      // notification_email). El `as unknown as PublicBusiness` de antes era una mentira — el tipo
      // excluye notification_email pero el objeto en runtime lo traía, y viajaba al navegador.
      business={publicBusiness}
      initialDraft={initialDraft}
      publishedConfig={publishedConfig}
      hasPersistedDraft={hasPersistedDraft}
      // ⚠ DIVERGENCIA CONOCIDA Y DELIBERADA: estas dos props siguen SIN proyectar (catálogo crudo,
      // inactivos incluidos) porque las consumen el editor de secciones y las SECCIONES del landing
      // — filtrarlas cambiaría qué servicios puede elegir el dueño en el editor, que es una decisión
      // de producto, no un fix de camino. La proyección fiel se aplica al NODO DE BOOKING (arriba),
      // que es lo que este quick vino a unificar.
      services={services || []}
      professionals={professionals || []}
      timeBlocks={timeBlocks || []}
      exceptions={exceptions || []}
      locations={locations || []}
      // El widget de reserva YA resuelto por vertical (ReactNode opaco): el client sólo lo reenvía.
      bookingSlot={bookingNode}
    />
  )
}
