'use client'

// Form compartido de alta MANUAL de turno (modal en desktop ≥768px / drawer vaul en mobile <768px,
// D-09). Reusa el endpoint autenticado app/api/appointments/create (Plan 02): NO inserta directo a
// supabase — toda la validación, el anti-tampering por business_id, el anti-doble-booking (slot_taken)
// y el dedupe de cliente (autoridad del servidor) los hace el endpoint. Acá solo armamos el body,
// mostramos un combobox de clientes (filtro en memoria, command.tsx NO existe) con crear-nuevo inline,
// y traducimos los errores del endpoint a los toasts del UI-SPEC. Sin control de seña (D-01).

import { useState, useMemo, useId, useSyncExternalStore, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Client, Service, Professional, Location } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Check, UserPlus, ChevronLeft, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Calendar } from '@/components/ui/calendar'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Hook responsive mínimo (sin dependencias) ───────────────────────────────────────────────
// Dialog y Drawer son portales con estado propio; renderizar uno u otro pide un breakpoint en JS,
// no clases CSS. useSyncExternalStore se suscribe a matchMedia (store externo) sin setState-in-effect.
// SSR-safe: el getServerSnapshot devuelve `false` (no matchea) → sin mismatch de hidratación.
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

// ── Mapeo de error del endpoint → copy del UI-SPEC (español) ─────────────────────────────────
const ERROR_COPY: Record<string, string> = {
  slot_taken: 'Ese horario ya está ocupado. Elegí otro.',
  invalid_service: 'Revisá el servicio o el profesional seleccionado.',
  invalid_professional: 'Revisá el servicio o el profesional seleccionado.',
  missing_fields: 'Completá el cliente, el servicio y el horario.',
  insert_failed: 'No se pudo guardar el turno. Probá de nuevo.',
}
function errorToast(code: string | undefined) {
  return ERROR_COPY[code ?? ''] ?? 'No se pudo guardar el turno. Probá de nuevo.'
}

// Normalización espejo de la autoridad del servidor (resolveClientId): teléfono = solo dígitos,
// email = lowercase. Acá es solo una sugerencia optimista de dedupe; el servidor decide.
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
  clients: Client[]
  services: Service[]
  professionals: Professional[]
  locations: Location[]
  // Pre-llenado opcional (D-08 acotado: la Agenda pre-llena la FECHA al clickear un día).
  prefill?: { date?: string; professionalId?: string }
  // Callback opcional tras crear con éxito. Si no se pasa, el form hace router.refresh().
  onCreated?: () => void
}

// Shell responsive: Dialog en desktop (≥768px) / Drawer vaul en mobile (<768px). El cuerpo
// con estado (TurnoFormBody) se REMONTA cada vez que se abre (key={open}) para resetearse —
// así el prefill se aplica como estado inicial y evitamos resetear con un effect (idiomático).
export function NuevoTurnoForm({ open, onOpenChange, clients, services, professionals, locations, prefill, onCreated }: Props) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const body = (
    <TurnoFormBody
      key={open ? 'open' : 'closed'}
      onOpenChange={onOpenChange}
      clients={clients}
      services={services}
      professionals={professionals}
      locations={locations}
      prefill={prefill}
      onCreated={onCreated}
    />
  )

  // Desktop ≥768px → Dialog · mobile <768px → Drawer (vaul). D-09.
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo turno</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Nuevo turno</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{body}</div>
      </DrawerContent>
    </Drawer>
  )
}

type BodyProps = Omit<Props, 'open'>

function TurnoFormBody({ onOpenChange, clients, services, professionals, locations, prefill, onCreated }: BodyProps) {
  const router = useRouter()

  // Consultorios activos (igual criterio que el resto del dashboard).
  const activeLocations = useMemo(() => locations.filter((l) => l.is_active !== false), [locations])

  // ── Estado del form ─ valores iniciales desde prefill (D-08). El remount via key resetea todo.
  const [serviceId, setServiceId] = useState('')
  const [professionalId, setProfessionalId] = useState(prefill?.professionalId || 'none')
  const [locationId, setLocationId] = useState('')
  const [date, setDate] = useState(prefill?.date || '')
  const [dateOpen, setDateOpen] = useState(false)
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  // Aviso opt-in al cliente por mail (D-01): default OFF. El remount via key={open} lo resetea al reabrir.
  const [notifyClient, setNotifyClient] = useState(false)

  // Cliente: seleccionado de la lista (combobox) o creado inline.
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientContact, setNewClientContact] = useState('')

  const searchListId = useId()

  // El opt-in de aviso aplica si hay email — sea del cliente ya elegido/confirmado, o del que se está
  // creando inline (así el checkbox se habilita sin exigir confirmar el cliente primero).
  const pendingNewEmail = creatingClient && newClientContact.includes('@') ? newClientContact.trim() : null
  const clientHasEmail = !!(selectedClient?.email || pendingNewEmail)

  // ── Combobox: filtro en memoria sobre clients (ya cargados por business_id) ────────────────
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

  // Confirmar el cliente nuevo inline → parsear el contacto a teléfono o email.
  function confirmNewClient() {
    const name = newClientName.trim()
    if (!name) {
      toast.error('Ingresá el nombre del cliente.')
      return
    }
    const contact = newClientContact.trim()
    if (!contact) {
      toast.error('Ingresá un teléfono o email.')
      return
    }
    const isEmail = contact.includes('@')
    setSelectedClient({
      id: null,
      name,
      phone: isEmail ? null : contact,
      email: isEmail ? contact : null,
    })
    setCreatingClient(false)
  }

  function useExistingFromDedupe() {
    if (dedupeMatch) pickClient(dedupeMatch)
  }

  async function handleSubmit() {
    // Cliente efectivo: si hay uno nuevo en progreso (creatingClient), se deriva de los inputs SIN
    // exigir el click extra de "Crear nuevo cliente" — "Agregar turno" da de alta al cliente (el
    // endpoint lo persiste con dedupe). Si ya está elegido/confirmado, se usa ese.
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
    if (!client || !serviceId || !date || !time) {
      toast.error('Completá el cliente, el servicio y el horario.')
      return
    }
    setSaving(true)
    let res: Response
    try {
      res = await fetch('/api/appointments/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          clientName: client.name,
          clientPhone: client.phone,
          clientEmail: client.email,
          serviceId,
          professionalId: professionalId === 'none' ? null : professionalId,
          locationId: locationId || null,
          date,
          time,
          notes: notes.trim() || null,
          notify: notifyClient && !!client.email,
        }),
      })
    } catch {
      setSaving(false)
      toast.error('No se pudo guardar el turno. Probá de nuevo.')
      return
    }
    const data = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok || !data?.ok) {
      toast.error(errorToast(data?.error))
      return
    }
    toast.success('Turno agregado')
    onOpenChange(false)
    if (onCreated) onCreated()
    else router.refresh()
  }

  // ── Cuerpo del form (compartido entre Dialog y Drawer vía el shell de NuevoTurnoForm) ────────
  return (
    <div className="space-y-3">
      {/* Cliente — combobox + crear inline */}
      <div className="space-y-1.5">
        <Label htmlFor={searchListId}>Cliente</Label>
        {selectedClient ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Check className="w-4 h-4 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedClient.name}</p>
                {(selectedClient.phone || selectedClient.email) && (
                  <p className="text-xs text-muted-foreground truncate">{selectedClient.phone || selectedClient.email}</p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => {
                if (selectedClient.id === null) {
                  // Cliente nuevo (todavía no persistido) → EDITAR: volver al form con los datos, sin borrarlos.
                  setNewClientName(selectedClient.name)
                  setNewClientContact(selectedClient.email || selectedClient.phone || '')
                  setSelectedClient(null)
                  setCreatingClient(true)
                } else {
                  // Cliente existente → volver a buscar/elegir otro.
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
              <Label htmlFor={`${searchListId}-name`}>Nombre</Label>
              <Input
                id={`${searchListId}-name`}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nombre y apellido"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${searchListId}-contact`}>Teléfono o email</Label>
              <Input
                id={`${searchListId}-contact`}
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
              id={searchListId}
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
                        {(c.phone || c.email) && (
                          <span className="block text-xs text-muted-foreground truncate">{c.phone || c.email}</span>
                        )}
                      </button>
                    </li>
                  ))}
                  <li className="border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingClient(true)
                        setNewClientName('')
                        setNewClientContact('')
                      }}
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

      {/* Servicio */}
      <div className="space-y-1.5">
        <Label>Servicio</Label>
        <Select value={serviceId} onValueChange={(v) => setServiceId(v ?? '')}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {(() => {
                const s = services.find((s) => s.id === serviceId)
                return s ? `${s.name} — ${s.duration_minutes}min` : <span className="text-muted-foreground">Elegí un servicio</span>
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} — {s.duration_minutes}min — ${Number(s.price).toLocaleString('es-AR')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Profesional */}
      <div className="space-y-1.5">
        <Label>Profesional</Label>
        <Select value={professionalId} onValueChange={(v) => setProfessionalId(v ?? 'none')}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {professionalId && professionalId !== 'none'
                ? professionals.find((p) => p.id === professionalId)?.name ?? 'Sin preferencia'
                : <span className="text-muted-foreground">Sin preferencia</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin preferencia</SelectItem>
            {professionals.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Consultorio / location — solo si el negocio tiene locations */}
      {activeLocations.length > 0 && (
        <div className="space-y-1.5">
          <Label>Consultorio</Label>
          <Select value={locationId || 'none'} onValueChange={(v) => setLocationId(v === 'none' ? '' : (v ?? ''))}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {locationId
                  ? activeLocations.find((l) => l.id === locationId)?.name ?? 'Sin especificar'
                  : <span className="text-muted-foreground">Sin especificar</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin especificar</SelectItem>
              {activeLocations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Fecha + Hora — hora libre (D-06). La fecha usa un calendario estilado que se despliega debajo
          (a ancho completo) y se cierra al elegir un día, en vez del date input nativo. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Fecha</Label>
          <button
            type="button"
            onClick={() => setDateOpen((o) => !o)}
            aria-expanded={dateOpen}
            className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className={cn('truncate capitalize', !date && 'text-muted-foreground normal-case')}>
              {date ? format(parseISO(date), "EEE d 'de' MMM", { locale: es }) : 'Elegí una fecha'}
            </span>
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${searchListId}-time`}>Hora</Label>
          <Input
            id={`${searchListId}-time`}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="text-center max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
          />
        </div>
      </div>
      {dateOpen && (
        <div className="rounded-lg border border-border bg-card">
          <Calendar
            mode="single"
            selected={date ? parseISO(date) : undefined}
            onSelect={(d) => {
              if (d) setDate(format(d, 'yyyy-MM-dd'))
              setDateOpen(false)
            }}
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Podés agendar a cualquier hora libre, aunque esté fuera de tu horario de atención.
      </p>

      {/* Notas (opcional) */}
      <div className="space-y-1.5">
        <Label htmlFor={`${searchListId}-notes`}>Notas (opcional)</Label>
        <Input id={`${searchListId}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alguna referencia del turno" />
      </div>

      {/* Aviso opt-in al cliente por mail (D-01) — checkbox nativo (no hay ui/checkbox), default OFF.
          Deshabilitado con hint cuando el cliente no tiene email; se habilita al elegir/crear uno con email. */}
      <div className="space-y-1">
        <label
          htmlFor={`${searchListId}-notify`}
          className={cn(
            'flex items-center gap-2.5 text-sm',
            clientHasEmail ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground',
          )}
        >
          <input
            id={`${searchListId}-notify`}
            type="checkbox"
            checked={notifyClient && clientHasEmail}
            disabled={!clientHasEmail}
            onChange={(e) => setNotifyClient(e.target.checked)}
            className="h-4 w-4 accent-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
          />
          Avisar al cliente por mail
        </label>
        {!clientHasEmail && (
          <p className="text-xs text-muted-foreground">Agregá un email del cliente para poder avisarle.</p>
        )}
      </div>

      {/* Submit — min-h 44px para touch (WCAG AA), disabled + loading anti doble-submit */}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="button" className="min-h-11 gap-1.5" onClick={handleSubmit} disabled={saving}>
          <Plus className={cn('w-4 h-4', saving && 'hidden')} />
          {saving ? 'Agregando...' : 'Agregar turno'}
        </Button>
      </div>
    </div>
  )
}
