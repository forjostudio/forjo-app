import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  UpcomingAppointments,
  type UpcomingAppt,
} from '@/components/dashboard/upcoming-appointments'
import type { ImpersonationData } from '@/lib/impersonation'

/**
 * ImpersonationView — superficie VISUAL read-only de la impersonación (D-05/D-12/D-13, IMP-03).
 *
 * GARANTÍA READ-ONLY POR CONSTRUCCIÓN (D-02 / Pitfall 1 de RESEARCH):
 * estos renderers son componentes NUEVOS y delgados sobre primitivos puros (Card/Badge +
 * UpcomingAppointments). NO derivan de los componentes operativos del dashboard, que corren en el
 * browser con el cliente anon de Supabase y escriben en la base + POSTean a route handlers de
 * mutación. Pasarles data read-only NO los vuelve seguros. La AUSENCIA de write paths en esta
 * superficie ES la garantía read-only:
 *   - sin directiva de cliente que mute, sin el cliente browser de Supabase,
 *   - sin pedidos a la API de mutación, sin botones que disparen escrituras.
 * (La navegación de semana de UpcomingAppointments es solo-display: no muta nada.)
 *
 * EXCLUIDO (D-06): las secciones de salud y de ingresos del negocio NO se renderizan bajo
 * impersonación (datos sensibles fuera del alcance de soporte).
 *
 * Config (#4): muestra solo la PRESENCIA de cada integración (conectado/desconectado) leída de
 * data.integrationStatus (booleanos provistos por loadImpersonationData), NUNCA el valor crudo de un
 * token/secreto.
 *
 * Estilo calcado de app/(dashboard)/dashboard/page.tsx:148-187 (render que solo mapea data a Card).
 */

// Badges de estado de turno con la paleta Bauhaus (constantes, calca dashboard/page.tsx:12-26).
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  pending_payment: 'Falta seña',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#f4c543] text-[#1a1714] border-transparent',
  pending_payment: 'bg-[#f4c543] text-[#1a1714] border-transparent',
  confirmed: 'bg-[#2a5fa5] text-white border-transparent',
  cancelled: 'bg-[#d94a2b] text-white border-transparent',
  completed: 'bg-[#2f8a5b] text-white border-transparent',
}

// Las filas vienen del read-helper como Record<string, unknown>[]; helpers de lectura segura.
function str(row: Record<string, unknown>, key: string): string {
  const v = row[key]
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}
function nested(row: Record<string, unknown>, key: string, field: string): string {
  const obj = row[key]
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const v = (obj as Record<string, unknown>)[field]
    return typeof v === 'string' ? v : v == null ? '' : String(v)
  }
  return ''
}
function bool(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true
}

const arsFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

export function ImpersonationView({ data }: { data: ImpersonationData }) {
  // Mapeo de los turnos al subset que consume UpcomingAppointments (joins de nombre).
  // loadImpersonationData trae '*, professionals(name), services(name, price, duration_minutes)'.
  const upcoming: UpcomingAppt[] = data.appointments.map((a) => ({
    id: str(a, 'id'),
    date: str(a, 'date'),
    time: str(a, 'time'),
    status: str(a, 'status'),
    client_name: str(a, 'client_name'),
    services: { name: nested(a, 'services', 'name') || undefined },
    professionals: { name: nested(a, 'professionals', 'name') || undefined },
  }))

  return (
    <div className="space-y-6">
      {/* Agenda / próximos turnos — reusa el widget presentacional puro del dashboard. */}
      <UpcomingAppointments appointments={upcoming} />

      {/* Turnos (listado completo, solo display) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Turnos</CardTitle>
        </CardHeader>
        <CardContent>
          {data.appointments.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No hay turnos</p>
          ) : (
            <div className="space-y-2">
              {data.appointments.map((a) => {
                const status = str(a, 'status')
                return (
                  <div
                    key={str(a, 'id')}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
                  >
                    <span className="text-sm font-mono font-semibold text-primary w-24 flex-shrink-0">
                      {str(a, 'date')} {str(a, 'time').slice(0, 5)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{str(a, 'client_name')}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {nested(a, 'services', 'name')}
                        {nested(a, 'professionals', 'name') &&
                          ` · ${nested(a, 'professionals', 'name')}`}
                      </p>
                    </div>
                    <Badge
                      className={`text-xs ${STATUS_COLORS[status] || ''}`}
                      variant="outline"
                    >
                      {STATUS_LABELS[status] || status}
                    </Badge>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Servicios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Servicios</CardTitle>
        </CardHeader>
        <CardContent>
          {data.services.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No hay servicios</p>
          ) : (
            <div className="space-y-2">
              {data.services.map((s) => (
                <div
                  key={str(s, 'id')}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{str(s, 'name')}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {str(s, 'duration_minutes') && `${str(s, 'duration_minutes')} min`}
                    </p>
                  </div>
                  <span className="text-sm text-foreground flex-shrink-0">
                    {s.price != null && typeof s.price === 'number'
                      ? arsFmt.format(s.price)
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equipo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equipo</CardTitle>
        </CardHeader>
        <CardContent>
          {data.professionals.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No hay miembros del equipo</p>
          ) : (
            <div className="space-y-2">
              {data.professionals.map((p) => (
                <div
                  key={str(p, 'id')}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50"
                >
                  <p className="text-sm font-medium truncate">{str(p, 'name')}</p>
                  {!bool(p, 'active') && (
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      Inactivo
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consultorios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consultorios</CardTitle>
        </CardHeader>
        <CardContent>
          {data.locations.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No hay consultorios</p>
          ) : (
            <div className="space-y-2">
              {data.locations.map((l) => (
                <div
                  key={str(l, 'id')}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50"
                >
                  <p className="text-sm font-medium truncate">{str(l, 'name')}</p>
                  <span className="text-xs text-muted-foreground truncate">{str(l, 'address')}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clientes — PII completa, sin masking (D-15) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.clients.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No hay clientes</p>
          ) : (
            <div className="space-y-2">
              {data.clients.map((c) => (
                <div key={str(c, 'id')} className="p-3 rounded-lg bg-secondary/50">
                  <p className="text-sm font-medium truncate">{str(c, 'name')}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[str(c, 'phone'), str(c, 'email')].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Negocio / Configuración — solo PRESENCIA de integraciones (#4), nunca un token crudo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integraciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <IntegrationRow label="MercadoPago" connected={data.integrationStatus.mercadopago} />
            <IntegrationRow label="Email" connected={data.integrationStatus.email} />
            <IntegrationRow label="reCAPTCHA" connected={data.integrationStatus.recaptcha} />
            <IntegrationRow label="Google Calendar" connected={data.integrationStatus.google} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Fila de presencia de integración: muestra conectado/desconectado, NUNCA el valor del secreto (#4).
function IntegrationRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-secondary/50">
      <span className="text-sm font-medium">{label}</span>
      <Badge
        variant="outline"
        className={
          connected
            ? 'text-xs bg-[#2f8a5b] text-white border-transparent'
            : 'text-xs text-muted-foreground'
        }
      >
        {connected ? 'Conectado' : 'Desconectado'}
      </Badge>
    </div>
  )
}
