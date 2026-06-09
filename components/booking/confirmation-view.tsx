'use client'

import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Check, Calendar, CalendarPlus, Scissors, User, MapPin, Users,
  ShieldCheck, ArrowRight, Navigation, MessageCircle,
} from 'lucide-react'

export interface ConfirmationViewProps {
  businessName: string
  businessType?: string | null
  businessSlug: string
  logoUrl?: string | null
  address?: string | null
  mapsUrl?: string | null
  whatsapp?: string | null
  // Consultorio del turno (capa 2a). Si está, manda sobre la dirección del negocio.
  locationName?: string | null
  locationAddress?: string | null
  // Etiqueta del lugar según el rubro (Consultorio/Local/Sucursal).
  locationLabel?: string
  clientName: string
  clientPhone?: string | null
  clientEmail?: string | null
  serviceName: string
  durationMinutes?: number | null
  price?: number | null
  professionalName?: string | null
  date: string // yyyy-MM-dd
  time: string // HH:mm[:ss]
  code: string
  cancelToken: string
  // true = la reserva ya tiene la seña paga (viene del flujo de pago).
  depositPaid?: boolean
}

// Link de WhatsApp tolerante: el negocio puede tener guardado un wa.me/URL o solo el número.
function waLink(whatsapp: string, text: string): string {
  const t = encodeURIComponent(text)
  if (/^https?:\/\//i.test(whatsapp)) {
    return whatsapp + (whatsapp.includes('?') ? '&' : '?') + 'text=' + t
  }
  const digits = whatsapp.replace(/[^\d]/g, '')
  return `https://wa.me/${digits}?text=${t}`
}

export function ConfirmationView({
  businessName, businessType, logoUrl, address, mapsUrl, whatsapp, locationName, locationAddress, locationLabel,
  clientName, clientPhone, clientEmail,
  serviceName, durationMinutes, price, professionalName,
  date, time, code, depositPaid,
}: ConfirmationViewProps) {
  const dt = parseISO(`${date}T${time.slice(0, 5)}:00`)
  const fechaLarga = format(dt, "EEEE d 'de' MMMM", { locale: es })
  const fechaCorta = format(dt, "EEE d 'de' MMM", { locale: es })
  const hora = time.slice(0, 5)
  const firstName = clientName.trim().split(/\s+/)[0]
  const dur = durationMinutes && durationMinutes > 0 ? durationMinutes : null

  // Dónde: si el turno tiene consultorio, manda sobre la dirección del negocio.
  const placeName = (locationName && locationName.trim()) || null
  const placeAddress = (locationAddress && locationAddress.trim()) || (address && address.trim()) || null
  // Mapa: si el consultorio tiene dirección propia, buscamos eso; si no, el link del dueño
  // o una búsqueda por "negocio + dirección".
  const mapHref = (locationAddress && locationAddress.trim())
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${businessName} ${placeName ?? ''} ${locationAddress}`)}`
    : ((mapsUrl && mapsUrl.trim())
      || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${businessName} ${address}`)}` : null))
  const waHref = whatsapp
    ? waLink(whatsapp, `Hola ${businessName}, tengo un turno: ${serviceName} el ${fechaCorta} a las ${hora} hs (código ${code}).`)
    : null

  // Genera y descarga un .ics con el turno (hora local "flotante", sin TZ → la abre el cliente).
  function addToCalendar() {
    const end = new Date(dt.getTime() + (dur || 30) * 60000)
    const stamp = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}` +
      `T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`
    const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Forjo//Turnos//ES', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${code}@forjo.studio`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(dt)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`${serviceName} — ${businessName}`)}`,
      ...(address ? [`LOCATION:${esc(address)}`] : []),
      `DESCRIPTION:${esc(`Turno en ${businessName}. Código ${code}.`)}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `turno-${code}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero — banda bg-primary (sigue la paleta/theme del negocio) */}
      <div className="relative overflow-hidden bg-primary text-primary-foreground">
        <svg className="absolute inset-0 w-full h-full opacity-90 pointer-events-none" viewBox="0 0 760 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
          <circle cx="700" cy="30" r="60" fill="rgba(255,255,255,.10)" />
          <rect x="610" y="96" width="74" height="74" fill="rgba(0,0,0,.10)" />
        </svg>
        <div className="max-w-xl mx-auto px-6 py-9 relative flex flex-col items-center text-center gap-4">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} className="w-16 h-16 rounded-2xl object-cover border border-white/20" />
          ) : (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-white/15 font-[family-name:var(--font-heading)] font-black text-2xl">
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-[clamp(28px,7vw,40px)] font-black uppercase tracking-tight leading-none font-[family-name:var(--font-heading)]">{businessName}</p>
            {businessType && <p className="text-sm text-primary-foreground/80 mt-2">{businessType}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-6 pt-8 pb-14">
        {/* Check + saludo */}
        <div className="w-[62px] h-[62px] rounded-full flex items-center justify-center mx-auto bg-primary text-primary-foreground shadow-lg shadow-primary/40">
          <Check className="w-8 h-8" strokeWidth={3} />
        </div>
        <h1 className="text-3xl font-bold text-center mt-4 font-[family-name:var(--font-heading)]">¡Listo, {firstName}!</h1>
        <p className="text-center text-muted-foreground mt-2 leading-relaxed">
          {depositPaid && <>Tu seña fue recibida. </>}
          Te esperamos el <strong className="text-foreground">{fechaLarga}</strong> a las <strong className="text-foreground">{hora} hs</strong>.
        </p>

        {/* Tarjeta de detalle */}
        <div className="rounded-xl border border-border bg-card overflow-hidden mt-6">
          <Row icon={<Calendar />} label="Cuándo">
            <span className="capitalize">{fechaLarga}</span>
            <br />
            <span className="text-muted-foreground text-[13px] font-medium">{hora} hs{dur ? ` · Duración ${dur} min` : ''}</span>
          </Row>
          <Row icon={<Scissors />} label="Servicio">
            <span className="flex items-center justify-between gap-3">
              <span>{serviceName}</span>
              {(dur || price != null) && (
                <span className="text-muted-foreground text-[13px] font-medium whitespace-nowrap">
                  {dur ? `${dur} min` : ''}{dur && price != null ? ' · ' : ''}{price != null ? `$${Number(price).toLocaleString('es-AR')}` : ''}
                </span>
              )}
            </span>
          </Row>
          {professionalName && (
            <Row icon={<User />} label="Profesional">{professionalName}</Row>
          )}
          {(placeName || placeAddress) && (
            <Row icon={<MapPin />} label={placeName ? (locationLabel || 'Consultorio') : 'Dirección'}>
              {placeName && <div>{placeName}</div>}
              {placeAddress && <div className={placeName ? 'text-muted-foreground text-[13px] font-medium' : undefined}>{placeAddress}</div>}
              {mapHref && (
                <a href={mapHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary font-semibold text-[13px] mt-1.5">
                  Ver en el mapa <ArrowRight className="w-3 h-3" />
                </a>
              )}
            </Row>
          )}
          <Row icon={<Users />} label="A nombre de">
            {clientName}
            {(clientPhone || clientEmail) && (
              <>
                <br />
                <span className="text-muted-foreground text-[13px] font-medium">{[clientPhone, clientEmail].filter(Boolean).join(' · ')}</span>
              </>
            )}
          </Row>
          <Row icon={<ShieldCheck />} label="Cancelación">
            <span className="text-muted-foreground font-medium">
              Podés cancelar o reprogramar hasta <strong className="text-foreground font-bold">24 h antes</strong> del turno. Pasado ese plazo no se puede cancelar online.{depositPaid ? <> La seña <strong className="text-foreground font-bold">no se reintegra</strong>.</> : null}
            </span>
          </Row>
        </div>

        {/* Acciones */}
        <div className="flex flex-col gap-2.5 mt-5">
          <ActionButton onClick={addToCalendar} icon={<CalendarPlus />}>Agregar al calendario</ActionButton>
          {mapHref && <ActionLink href={mapHref} icon={<Navigation />}>Cómo llegar</ActionLink>}
          {waHref && (
            <ActionLink href={waHref} icon={<MessageCircle />} variant="wa">Escribir al negocio</ActionLink>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
          Te enviamos los detalles por {clientEmail ? 'email' : 'WhatsApp'}.<br />¿Necesitás cambiar algo? Escribinos.
        </p>

        {/* Footer marca */}
        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted-foreground">
          <svg width="13" height="16" viewBox="0 0 64 80" aria-hidden="true">
            <rect x="6" y="6" width="14" height="68" fill="currentColor" />
            <rect x="20" y="6" width="38" height="14" fill="#d94a2b" />
            <path d="M20 34 L50 34 L36 48 L20 48 Z" fill="#2a5fa5" />
            <circle cx="56" cy="13" r="6" fill="#f4c543" />
          </svg>
          <span>
            hecho con{' '}
            <a href="https://www.forjo.studio" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              <span className="font-semibold text-foreground font-[family-name:var(--font-heading)]">Forjo</span> Studio
            </a>
          </span>
        </div>
      </div>
    </div>
  )
}

// Fila de la tarjeta de detalle: ícono + label en mayúsculas + contenido.
function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5 px-5 py-4 border-b border-border last:border-b-0">
      <span className="w-[18px] h-[18px] flex-shrink-0 text-primary mt-0.5 [&_svg]:w-[18px] [&_svg]:h-[18px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground font-bold mb-1">{label}</p>
        <div className="text-sm font-semibold leading-snug">{children}</div>
      </div>
    </div>
  )
}

function ActionButton({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2.5 w-full p-3.5 rounded-lg border border-border bg-card text-foreground text-sm font-semibold hover:border-primary hover:bg-secondary transition-colors [&_svg]:w-[17px] [&_svg]:h-[17px]"
    >
      {icon}{children}
    </button>
  )
}

function ActionLink({ href, icon, children, variant }: { href: string; icon: React.ReactNode; children: React.ReactNode; variant?: 'wa' }) {
  const wa = variant === 'wa'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        'flex items-center justify-center gap-2.5 w-full p-3.5 rounded-lg border bg-card text-sm font-semibold transition-colors [&_svg]:w-[17px] [&_svg]:h-[17px] ' +
        (wa
          ? 'border-[#25d366]/45 text-[#1f9d4d] hover:bg-[#25d366]/10 hover:border-[#25d366] dark:text-[#3ddc7a]'
          : 'border-border text-foreground hover:border-primary hover:bg-secondary')
      }
    >
      {icon}{children}
    </a>
  )
}
