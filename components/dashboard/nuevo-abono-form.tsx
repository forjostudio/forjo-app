'use client'

// Form de alta del ABONO (serie de turnos FIJOS semanales) desde el panel del dueño (ABONO-01, D-04).
// Clon adaptado de nuevo-turno-form.tsx: MISMO shell responsive (Dialog en desktop ≥768px / Drawer vaul
// en mobile), MISMO combobox de cliente (filtro en memoria + crear-nuevo inline con dedupe optimista) y
// MISMOS selects de servicio/profesional/consultorio por vertical. La ÚNICA diferencia con el alta de
// turno suelto es el campo temporal: acá se pide **día de la semana** (0..6, domingo..sábado) + **hora**,
// SIN fecha puntual — porque el abono es un turno fijo recurrente indefinido, no un turno con fecha.
// NO inserta directo a Supabase: postea a /api/abonos/create (Plan 03), que hace todo el anti-tampering
// por business_id, la derivación de la cancha en el vertical canchas y el dedupe de cliente (autoridad
// del servidor). Acá solo armamos el body y traducimos los errores del endpoint a toasts.

import { useState, useMemo, useId, useSyncExternalStore, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Business, Client, Service, Professional, Location } from '@/lib/types'
import { resolveVertical } from '@/lib/verticals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Check, UserPlus, ChevronLeft, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Hook responsive mínimo (idéntico al de nuevo-turno-form) ─────────────────────────────────
// Dialog y Drawer son portales con estado propio; el breakpoint se decide en JS. useSyncExternalStore
// se suscribe a matchMedia sin setState-in-effect. SSR-safe: getServerSnapshot → false (no matchea).
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

// Días de la semana — convención EXTRACT(dow) 0=domingo..6=sábado (idéntica a time_blocks.day_of_week,
// abonos.day_of_week y book_slot_atomic). El orden de display arranca en lunes (uso real del negocio).
const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Lunes → Domingo

// Mapeo de error del endpoint → copy en español (mismo criterio que nuevo-turno-form).
const ERROR_COPY: Record<string, string> = {
  invalid_service: 'Revisá el servicio o el profesional seleccionado.',
  invalid_professional: 'Revisá el servicio o el profesional seleccionado.',
  missing_fields: 'Completá el cliente, el servicio y el día y hora.',
  insert_failed: 'No se pudo guardar el abono. Probá de nuevo.',
}
function errorToast(code: string | undefined) {
  return ERROR_COPY[code ?? ''] ?? 'No se pudo guardar el abono. Probá de nuevo.'
}

// Normalización espejo de la autoridad del servidor (resolveClientId): teléfono = solo dígitos,
// email = lowercase. Acá es solo sugerencia optimista de dedupe; el servidor decide.
function normPhone(p: string | null | undefined) {
  return p ? p.replace(/\D/g, '') : ''
}
function normEmail(e: string | null | undefined) {
  return e ? e.toLowerCase().trim() : ''
}

type SelectedClient = { id: string | null; name: string; phone: string | null; email: string | null }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  business: Business
  clients: Client[]
  services: Service[]
  professionals: Professional[]
  locations: Location[]
  // Callback opcional tras crear con éxito. Si no se pasa, el form hace router.refresh().
  onCreated?: () => void
}

// Shell responsive: Dialog en desktop (≥768px) / Drawer vaul en mobile (<768px). El cuerpo con estado
// (AbonoFormBody) se REMONTA cada vez que se abre (key={open}) para resetearse (idiomático, sin effect).
export function NuevoAbonoForm({ open, onOpenChange, business, clients, services, professionals, locations, onCreated }: Props) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  // Anti-descarte accidental (UX): si el form tiene datos, cualquier cierre pide confirmación.
  const dirtyRef = useRef(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const requestClose = useCallback(
    (next: boolean) => {
      if (!next && dirtyRef.current) { setDiscardOpen(true); return }
      onOpenChange(next)
    },
    [onOpenChange],
  )
  const confirmDiscard = useCallback(() => {
    setDiscardOpen(false)
    dirtyRef.current = false
    onOpenChange(false)
  }, [onOpenChange])

  const body = (
    <AbonoFormBody
      key={open ? 'open' : 'closed'}
      onClose={() => onOpenChange(false)}
      requestClose={() => requestClose(false)}
      dirtyRef={dirtyRef}
      business={business}
      clients={clients}
      services={services}
      professionals={professionals}
      locations={locations}
      onCreated={onCreated}
    />
  )

  const shell = isDesktop ? (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo abono</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  ) : (
    <Drawer open={open} onOpenChange={requestClose}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Nuevo abono</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{body}</div>
      </DrawerContent>
    </Drawer>
  )

  return (
    <>
      {shell}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Descartar el abono?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Vas a perder los datos que cargaste.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>Seguir editando</Button>
            <Button type="button" variant="destructive" onClick={confirmDiscard}>Descartar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

type BodyProps = {
  onClose: () => void
  requestClose: () => void
  dirtyRef: { current: boolean }
  business: Business
  clients: Client[]
  services: Service[]
  professionals: Professional[]
  locations: Location[]
  onCreated?: () => void
}

function AbonoFormBody({ onClose, requestClose, dirtyRef, business, clients, services, professionals, locations, onCreated }: BodyProps) {
  const router = useRouter()

  // Terminología por vertical: en canchas el bookable ES la cancha (professional con service_id), no hay
  // "profesional" ni "servicio" separados → se pide sólo la cancha y el server deriva el service (D-03).
  const v = resolveVertical(business)
  const isCanchas = v.key === 'canchas'
  const term = v.terminology

  // Consultorios activos (igual criterio que el resto del dashboard).
  const activeLocations = useMemo(() => locations.filter((l) => l.is_active !== false), [locations])

  // ── Estado del form ──────────────────────────────────────────────────────────────────────────
  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState('none')
  const [locationId, setLocationId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState<string>('') // '' = sin elegir; se parsea a number al enviar
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)

  // Cliente: seleccionado de la lista (combobox) o creado inline.
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientContact, setNewClientContact] = useState('')

  const fieldId = useId()

  // El form está "sucio" si se tocó algún campo → habilita la confirmación de descarte del shell.
  const isDirty = !!(
    selectedClient || creatingClient || serviceId || dayOfWeek || time ||
    newClientName.trim() || newClientContact.trim()
  )
  useEffect(() => { dirtyRef.current = isDirty }, [isDirty, dirtyRef])

  // ── Combobox: filtro en memoria sobre clients (ya cargados por business_id) ────────────────────
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase()
    const qDigits = clientSearch.replace(/\D/g, '')
    if (!q) return clients.slice(0, 8)
    return clients
      .filter((c) => {
        const byName = c.name.toLowerCase().includes(q)
        const byEmail = (c.email || '').toLowerCase().includes(q)
        const byPhone = qDigits.length > 0 && normPhone(c.phone).includes(qDigits)
        return byName || byEmail || byPhone
      })
      .slice(0, 8)
  }, [clients, clientSearch])

  // Dedupe optimista al crear inline: si el contacto matchea un cliente existente, sugerir reusarlo.
  const dedupeMatch = useMemo(() => {
    const contact = newClientContact.trim()
    if (!creatingClient || !contact) return null
    const isEmail = contact.includes('@')
    const phoneDigits = normPhone(contact)
    const emailLower = normEmail(contact)
    return (
      clients.find((c) => {
        if (isEmail) return !!emailLower && normEmail(c.email) === emailLower
        return phoneDigits.length > 0 && normPhone(c.phone) === phoneDigits
      }) || null
    )
  }, [creatingClient, newClientContact, clients])

  function pickClient(c: Client) {
    setSelectedClient({ id: c.id, name: c.name, phone: c.phone, email: c.email })
    setCreatingClient(false)
  }

  function confirmNewClient() {
    const name = newClientName.trim()
    if (!name) { toast.error('Ingresá el nombre del cliente.'); return }
    const contact = newClientContact.trim()
    if (!contact) { toast.error('Ingresá un teléfono o email.'); return }
    const isEmail = contact.includes('@')
    setSelectedClient({ id: null, name, phone: isEmail ? null : contact, email: isEmail ? contact : null })
    setCreatingClient(false)
  }

  function useExistingFromDedupe() {
    if (dedupeMatch) pickClient(dedupeMatch)
  }

  // Crear el abono. Deriva el cliente efectivo (si hay uno nuevo en progreso) sin exigir el click extra
  // de "Crear nuevo cliente" — el endpoint lo persiste con dedupe.
  async function doSubmit() {
    let client = selectedClient
    if (creatingClient) {
      if (dedupeMatch) {
        toast.error('Ese contacto ya existe. Usá el cliente existente o cambiá el contacto.')
        return
      }
      const name = newClientName.trim()
      const contact = newClientContact.trim()
      if (!name) { toast.error('Ingresá el nombre del cliente.'); return }
      if (!contact) { toast.error('Ingresá un teléfono o email del cliente.'); return }
      const isEmail = contact.includes('@')
      client = { id: null, name, phone: isEmail ? null : contact, email: isEmail ? contact : null }
    }
    // En canchas el bookable es la cancha (professionalId); en el resto se exige el servicio.
    const hasBookable = isCanchas ? professionalId !== 'none' : !!serviceId
    if (!client || !hasBookable || dayOfWeek === '' || !time) {
      toast.error(isCanchas ? 'Completá el cliente, la cancha y el día y hora.' : 'Completá el cliente, el servicio y el día y hora.')
      return
    }

    setSaving(true)
    let res: Response
    try {
      res = await fetch('/api/abonos/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          // En canchas el server DERIVA el service desde la cancha; no mandamos serviceId.
          serviceId: isCanchas ? null : serviceId,
          professionalId: professionalId === 'none' ? null : professionalId,
          locationId: locationId || null,
          dayOfWeek: Number(dayOfWeek),
          time,
        }),
      })
    } catch {
      setSaving(false)
      toast.error('No se pudo guardar el abono. Probá de nuevo.')
      return
    }
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok || !data?.ok) {
      toast.error(errorToast(data?.error))
      return
    }
    dirtyRef.current = false
    const generated = Number(data.generated) || 0
    toast.success(generated > 0 ? `Abono creado · ${generated} turno${generated > 1 ? 's' : ''} generado${generated > 1 ? 's' : ''}` : 'Abono creado')
    onClose()
    if (onCreated) onCreated()
    else router.refresh()
  }

  // ── Cuerpo del form ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Aviso: es un turno FIJO semanal indefinido */}
      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
        <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>Un abono reserva el mismo día y hora <span className="font-medium text-foreground">todas las semanas</span>, de forma indefinida.</span>
      </div>

      {/* Cliente — combobox + crear inline */}
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>Cliente</Label>
        {selectedClient ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedClient.name}</p>
                {selectedClient.phone && <p className="text-xs text-muted-foreground truncate">{selectedClient.phone}</p>}
                {selectedClient.email && <p className="text-xs text-muted-foreground truncate">{selectedClient.email}</p>}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => {
                if (selectedClient.id === null) {
                  setNewClientName(selectedClient.name)
                  setNewClientContact(selectedClient.email || selectedClient.phone || '')
                  setSelectedClient(null)
                  setCreatingClient(true)
                } else {
                  setSelectedClient(null)
                }
              }}
            >
              {selectedClient.id === null ? 'Editar' : 'Cambiar'}
            </Button>
          </div>
        ) : creatingClient ? (
          <div className="space-y-2 rounded-md bg-secondary/50 p-3">
            <button
              type="button"
              onClick={() => setCreatingClient(false)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Volver a buscar
            </button>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-name`}>Nombre</Label>
              <Input
                id={`${fieldId}-name`}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nombre y apellido"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${fieldId}-contact`}>Teléfono o email</Label>
              <Input
                id={`${fieldId}-contact`}
                value={newClientContact}
                onChange={(e) => setNewClientContact(e.target.value)}
                placeholder="11 2345 6789 o nombre@email.com"
                autoComplete="off"
              />
            </div>
            {dedupeMatch ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Ya tenés un cliente con ese contacto: <span className="font-medium">{dedupeMatch.name}</span>. ¿Usar el existente?
                </p>
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={useExistingFromDedupe}>
                  Usar existente
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" className="w-full gap-1.5" onClick={confirmNewClient}>
                <UserPlus className="w-3.5 h-3.5" /> Crear nuevo cliente
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            <Input
              id={fieldId}
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Buscá un cliente o creá uno nuevo"
              autoComplete="off"
            />
            <div className="rounded-md border border-border bg-card max-h-48 overflow-y-auto">
              {filteredClients.length === 0 ? (
                <div className="p-3 space-y-2 text-center">
                  <p className="text-sm font-medium">Sin clientes que coincidan</p>
                  <p className="text-xs text-muted-foreground">Creá un cliente nuevo con el nombre y un contacto.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setCreatingClient(true)
                      setNewClientName(clientSearch.replace(/\d/g, '').trim())
                      setNewClientContact(/\d/.test(clientSearch) ? clientSearch.trim() : '')
                    }}
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Crear nuevo cliente
                  </Button>
                </div>
              ) : (
                <ul>
                  {filteredClients.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => pickClient(c)}
                        className="w-full text-left px-3 py-1.5 hover:bg-secondary/60 transition-colors"
                      >
                        <span className="text-sm font-medium">{c.name}</span>
                        {c.phone && <span className="block text-xs text-muted-foreground truncate">{c.phone}</span>}
                        {c.email && <span className="block text-xs text-muted-foreground truncate">{c.email}</span>}
                      </button>
                    </li>
                  ))}
                  <li className="border-t border-border">
                    <button
                      type="button"
                      onClick={() => { setCreatingClient(true); setNewClientName(''); setNewClientContact('') }}
                      className="w-full text-left px-3 py-2 text-xs font-medium text-primary hover:bg-secondary/60 transition-colors flex items-center gap-1.5"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Crear nuevo cliente
                    </button>
                  </li>
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Servicio — oculto en canchas (el bookable es la cancha; el server deriva el service) */}
      {!isCanchas && (
        <div className="space-y-1.5">
          <Label>{term.service}</Label>
          <Select value={serviceId} onValueChange={(val) => setServiceId(val ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {(() => {
                  const s = services.find((s) => s.id === serviceId)
                  return s ? `${s.name} — ${s.duration_minutes}min` : <span className="text-muted-foreground">Elegí un {term.service.toLowerCase()}</span>
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} — {s.duration_minutes}min — ${Number(s.price).toLocaleString('es-AR')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Profesional / Cancha — en canchas es obligatorio (es el bookable); en el resto es opcional */}
      <div className="space-y-1.5">
        <Label>{term.resource}</Label>
        <Select value={professionalId} onValueChange={(val) => setProfessionalId(val ?? 'none')}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {professionalId && professionalId !== 'none'
                ? professionals.find((p) => p.id === professionalId)?.name ?? (isCanchas ? `Elegí una ${term.resource.toLowerCase()}` : 'Sin preferencia')
                : <span className="text-muted-foreground">{isCanchas ? `Elegí una ${term.resource.toLowerCase()}` : 'Sin preferencia'}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {!isCanchas && <SelectItem value="none">Sin preferencia</SelectItem>}
            {professionals.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Consultorio / location — solo si el negocio tiene locations */}
      {activeLocations.length > 0 && (
        <div className="space-y-1.5">
          <Label>{term.location}</Label>
          <Select value={locationId || 'none'} onValueChange={(val) => setLocationId(val === 'none' ? '' : (val ?? ''))}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {locationId
                  ? activeLocations.find((l) => l.id === locationId)?.name ?? 'Sin especificar'
                  : <span className="text-muted-foreground">Sin especificar</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectItem value="none">Sin especificar</SelectItem>
              {activeLocations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Día de la semana + Hora — el abono es recurrente, no lleva fecha puntual */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Día de la semana</Label>
          <Select value={dayOfWeek} onValueChange={(val) => setDayOfWeek(val ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {dayOfWeek !== '' ? DAY_LABELS[Number(dayOfWeek)] : <span className="text-muted-foreground">Elegí un día</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {DAY_ORDER.map((d) => (
                <SelectItem key={d} value={String(d)}>{DAY_LABELS[d]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-time`}>Hora</Label>
          <Input
            id={`${fieldId}-time`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="text-center max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Se generan los turnos de las próximas semanas automáticamente. Las semanas con conflicto se saltean y quedan listadas en el abono.
      </p>

      {/* Submit — min-h 44px para touch (WCAG AA), disabled + loading anti doble-submit */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" className="min-h-11" onClick={requestClose} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" className="min-h-11 gap-1.5" onClick={doSubmit} disabled={saving}>
          <Plus className={cn('w-4 h-4', saving && 'hidden')} />
          {saving ? 'Creando...' : 'Crear abono'}
        </Button>
      </div>
    </div>
  )
}
