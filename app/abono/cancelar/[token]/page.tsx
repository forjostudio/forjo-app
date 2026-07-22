import { createAdminClient } from '@/lib/supabase/admin'
import { previewAbonoCancellation, abonoDayLabel, type AbonoCancelSummary } from '@/lib/abono-cancel'
import { onAccentText } from '@/lib/contrast'
import { PaletteScript } from '@/components/palette-script'
import { AbonoCancelClient } from './abono-cancel-client'

// NOINDEX obligatorio (IN-04, T-07-38): la URL de esta página CONTIENE la credencial de baja
// (`cancel_token`), que no rota ni vence (D-09), y la pantalla muestra el nombre del cliente, el
// servicio y el horario. Si el link se filtra a un lugar crawleable (un foro, una captura pública, un
// historial compartido), un buscador podría indexar la URL con el token adentro — y esa fuga sería
// PERMANENTE, porque el token no se puede invalidar.
export const metadata = {
  title: 'Cancelar turno fijo',
  robots: { index: false, follow: false },
}

// ── Página pública de BAJA DEL TURNO FIJO (ABONO-04) ────────────────────────────────────────────
//
// Resuelve la SERIE (no un turno suelto) SOLO por el `cancel_token` de la URL, con service role
// server-side: sin token válido no muestra ni da de baja nada, y el mensaje de error es el mismo para
// "no existe", "formato de uuid inválido" y "es de otro negocio" — no se revela si la serie existe
// (D-22, T-07-13).
//
// Ruta NUEVA (D-10): copia el shell de app/cancelar/[token]/ SIN modificar aquellos archivos, que
// están vivos en producción para el cancel de turno suelto.
//
// AVISO PREVIO OBLIGATORIO (D-03/D-11): la baja es destructiva e irreversible, así que el conteo de
// turnos que se van a cancelar y la fecha del último se calculan ACÁ, server-side, con el mismo motor
// que ejecuta la baja (previewAbonoCancellation) — el número que ve el cliente no puede divergir del
// efecto real. NO se lista fecha por fecha: con la ventana de generación la lista es larga en mobile.
//
// No se calcula ninguna condición de horario: la regla de las 24 h del cancel de turno suelto no
// existe en esta superficie (D-06).
export default async function AbonoCancelarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()

  // El select del business SIEMPRE trae theme/palette/font: los consume PaletteScript para pintar la
  // página con la identidad del tenant antes del primer paint.
  const { data: abono } = await supabase
    .from('abonos')
    .select(
      'id, business_id, status, day_of_week, start_time, clients(name), services(name), businesses(name, slug, primary_color, logo_url, theme, palette, font)',
    )
    .eq('cancel_token', token)
    .maybeSingle()

  // Token inexistente / inválido → mensaje genérico, sin revelar nada.
  if (!abono) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
        <div className="text-center max-w-sm">
          <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">Link inválido</h1>
          <p className="text-muted-foreground">Este enlace de cancelación no es válido o el turno fijo ya no existe.</p>
        </div>
      </main>
    )
  }

  const business = abono.businesses as {
    name?: string
    slug?: string
    primary_color?: string | null
    logo_url?: string | null
    theme?: string | null
    palette?: string | null
    font?: string | null
  } | null
  const clientName = (abono.clients as { name?: string | null } | null)?.name ?? ''
  const serviceName = (abono.services as { name?: string } | null)?.name ?? ''

  // Estado inicial con SOLO dos valores (D-08): la serie ya dada de baja muestra el mensaje sin botón
  // de acción; cualquier otro estado es accionable. 'completed' cae en 'active' a propósito (D-21): un
  // finito que juntó sus N sesiones puede tener turnos futuros por delante y se da de baja igual.
  const initialState: 'active' | 'cancelled' = abono.status === 'cancelled' ? 'cancelled' : 'active'

  // Preview del efecto (D-03/D-11). Si la serie ya está cancelada no hace falta: no hay nada que
  // cancelar y la pantalla no muestra números.
  const preview: AbonoCancelSummary =
    initialState === 'cancelled'
      ? { count: 0, lastDate: null }
      : await previewAbonoCancellation({
          supabase,
          businessId: abono.business_id as string,
          abonoId: abono.id as string,
        })

  // El preview NO se pudo calcular (WR-04): la query falló y el 0 sería indistinguible del caso
  // legítimo "no hay turnos futuros". La pantalla lo DICE, en vez de ocultar en silencio el aviso
  // previo de una acción irreversible (D-03/D-11).
  const previewUnknown = preview.unknown === true

  const dow = Number(abono.day_of_week)
  // Etiqueta plural del día desde el motor compartido (IN-01), con el MISMO fallback único que la vía
  // del panel y el mail. El prefijo 'todos ' lo arma el caller. Arma el "todos los martes" de D-11.
  const dayLabel = `todos ${abonoDayLabel(dow)}`

  // Acento del negocio, calculado UNA sola vez (antes salía inline en el JSX) porque ahora también
  // alimenta el color de TEXTO sobre ese acento (IN-05): `primary_color` lo edita el dueño y con un
  // blanco fijo el CTA de una acción destructiva puede quedar por debajo de 4.5:1.
  const accent = (business?.primary_color && business.primary_color.trim()) || '#d94a2b'

  return (
    <>
      <PaletteScript palette={business?.palette} theme={business?.theme} font={business?.font} />
      <AbonoCancelClient
        token={token}
        clientName={clientName}
        service={serviceName}
        dayLabel={dayLabel}
        time={String(abono.start_time ?? '')}
        cancelledCount={preview.count}
        lastDate={preview.lastDate}
        previewUnknown={previewUnknown}
        businessName={business?.name ?? ''}
        businessSlug={business?.slug ?? ''}
        logoUrl={business?.logo_url ?? null}
        accent={accent}
        accentText={onAccentText(accent)}
        initialState={initialState}
      />
    </>
  )
}
