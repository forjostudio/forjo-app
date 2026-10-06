'use client'

// Form compartido de alta MANUAL de turno (modal en desktop ≥768px / drawer vaul en mobile <768px,
// D-09). Reusa el endpoint autenticado app/api/appointments/create (Plan 02): NO inserta directo a
// supabase — toda la validación, el anti-tampering por business_id, el anti-doble-booking (slot_taken)
// y el dedupe de cliente (autoridad del servidor) los hace el endpoint. Acá solo armamos el body,
// mostramos un combobox de clientes (filtro en memoria, command.tsx NO existe) con crear-nuevo inline,
// y traducimos los errores del endpoint a los toasts del UI-SPEC. Sin control de seña (D-01).

import { useState, useMemo, useId, useSyncExternalStore, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Client, Service, Professional, Location } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TimeField } from '@/components/ui/time-field'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, resetDrawerDrag } from '@/components/ui/drawer'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  UNSAVED_CHANGES_MESSAGE,
  UNSAVED_CHANGES_TOAST_ID,
  UNSAVED_NEW_ANNOUNCE,
  UNSAVED_NEW_HINT,
  guardDraftOnDismiss,
  guardDraftOnDrawerDismiss,
} from '@/lib/panel-draft'
import { useOverlayHistory, type OverlayDismissDetails } from '@/lib/overlay-history'
import { Plus, Check, UserPlus, ChevronLeft, CalendarDays, XIcon } from 'lucide-react'
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

  // ── Anti-descarte accidental: el MISMO modelo que los diálogos de edición de Ajustes ───────────
  //
  // ⚠ ACÁ HABÍA UN SEGUNDO `<Dialog>` "¿Descartar el turno?", HERMANO del shell, y en mobile era
  // INTOCABLE (UAT en celular real, quick 260929-g4d): vaul monta el drawer en modo modal y bloquea
  // los pointer-events de todo lo que esté FUERA de su subárbol, así que el confirm se veía pero
  // estaba muerto. Se podía montarlo adentro del drawer (existe el contexto para eso, lo usa el
  // Select), pero eso deja el anidamiento de modales en pie — CLAUDE.md los prohíbe — y sólo tapa el
  // síntoma. Se sacó el anidamiento y se adoptó `guardDraftOnDismiss`, que ya resolvía exactamente
  // esto en los tres diálogos de Ajustes SIN abrir ningún segundo modal: veta el cierre y avisa.
  //
  // EL MODELO, y por qué la ✕ es la pieza que lo cierra:
  //   · cierre ACCIDENTAL (click afuera · Escape · atrás del celular · arrastrar el drawer) con datos
  //     cargados ⇒ no cierra, avisa;
  //   · ✕ y "Cancelar" ⇒ cierran y descartan SIEMPRE. Son la salida deliberada, y sin ellas un
  //     formulario sucio no tendría cómo descartarse.
  // El mismo modelo en los dos viewports: el dueño pidió que la protección sea IGUAL a la de editar
  // un servicio, no un dialecto por tamaño de pantalla.
  const dirtyRef = useRef(false)
  // El nodo del DrawerContent, sólo para devolverlo a su lugar cuando se veta un cierre por arrastre
  // (vaul deja el transform del gesto puesto; ver `resetDrawerDrag`).
  const drawerRef = useRef<HTMLDivElement>(null)
  // El aviso, TAMBIÉN adentro del overlay: la región aria-live del toast vive fuera del portal y el
  // modal la marca `inert`, así que el toast se ve pero no se anuncia (el porqué largo está escrito
  // en `lib/panel-draft.ts`). Los dos canales son necesarios, no redundantes.
  const [dismissBlocked, setDismissBlocked] = useState(false)

  // El cierre DELIBERADO: descarta sin preguntar. Lo usan la ✕, "Cancelar" y el éxito del submit.
  //
  // Apaga el aviso de paso, y ése es el ÚNICO lugar donde se apaga (no hay un efecto que lo resetee
  // al abrir): una región viva que nace con el texto ya puesto no anuncia nada, así que reabrir con
  // el aviso viejo colgado sería un anuncio perdido. Todos los cierres de este shell pasan por acá
  // —la ✕, "Cancelar", el éxito del submit y el cierre accidental que la guarda deja pasar—, así que
  // la región siempre se vuelve a montar limpia.
  const close = useCallback(() => {
    dirtyRef.current = false
    setDismissBlocked(false)
    onOpenChange(false)
  }, [onOpenChange])

  const noticeDismissBlocked = useCallback(() => {
    // Primero el rebote: si el veto cortó un arrastre, el drawer quedó traducido a media pantalla.
    resetDrawerDrag(drawerRef.current)
    toast.warning(UNSAVED_CHANGES_MESSAGE, { id: UNSAVED_CHANGES_TOAST_ID, description: UNSAVED_NEW_HINT })
    setDismissBlocked(true)
  }, [])

  // Los dos handlers de cierre, ARMADOS ADENTRO de un callback y no en el render.
  //
  // POR QUÉ ESTA VUELTA y no `guardDraftOnDismiss(isDirty, …)` suelto en el JSX, que es como lo usa
  // Ajustes: ahí `isEditSvcDirty` lee ESTADO, acá lee una REF. `react-hooks/refs` marca como error
  // pasarle a una función, durante el render, algo que puede leer `ref.current` —y tiene razón como
  // regla general—. Envolviendo la construcción en el callback, la ref se lee recién cuando el
  // usuario intenta cerrar, que es exactamente cuando tenía que leerse: el contrato de la guarda es
  // que la respuesta a “¿hay cambios?” se calcule en el intento de cierre, no en cada tecleo.
  //
  // La ref se conserva (en vez de subir el estado sucio al shell) porque el cuerpo la escribe en un
  // efecto: con estado sería un setState sincrónico adentro de un efecto —la otra regla— y un render
  // extra del shell por cada vez que el formulario pasa de limpio a sucio.
  const handleDialogDismiss = useCallback(
    (nextOpen: boolean, details: OverlayDismissDetails) =>
      guardDraftOnDismiss(() => dirtyRef.current, close, noticeDismissBlocked)(nextOpen, details),
    [close, noticeDismissBlocked],
  )
  const handleDrawerDismiss = useCallback(
    (nextOpen: boolean) =>
      guardDraftOnDrawerDismiss(() => dirtyRef.current, close, noticeDismissBlocked)(nextOpen),
    [close, noticeDismissBlocked],
  )

  // `sr-only` es `position: absolute`: no reclama espacio ni mueve nada del layout.
  const blockedNotice = (
    <p role="status" aria-live="assertive" className="sr-only">{dismissBlocked ? UNSAVED_NEW_ANNOUNCE : ''}</p>
  )

  const body = (
    <TurnoFormBody
      key={open ? 'open' : 'closed'}
      onClose={close}
      dirtyRef={dirtyRef}
      clients={clients}
      services={services}
      professionals={professionals}
      locations={locations}
      prefill={prefill}
      onCreated={onCreated}
    />
  )

  // Desktop ≥768px → Dialog · mobile <768px → Drawer (vaul). D-09.
  // El Dialog usa `guardDraftOnDismiss` TAL CUAL: Base UI sí manda el motivo del cierre, así que la
  // ✕ que ya trae el DialogContent (`close-press`) pasa derecho y el click afuera/Escape/atrás se
  // vetan. El Drawer necesita la hermana sin motivos (vaul no entrega ninguno) y su propia ✕.
  return isDesktop ? (
    <Dialog open={open} onOpenChange={handleDialogDismiss}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Nuevo turno</DialogTitle>
        </DialogHeader>
        {blockedNotice}
        {body}
      </DialogContent>
    </Dialog>
  ) : (
    <Drawer open={open} onOpenChange={handleDrawerDismiss}>
      <DrawerContent ref={drawerRef}>
        {/* px-8 y no pr-8 (que es lo que lleva el diálogo de servicio en Ajustes): el título del
            drawer va CENTRADO, así que despejar un solo lado lo correría 8px del centro. Simétrico
            queda centrado de verdad y con la misma holgura contra la ✕. */}
        <DrawerHeader className="px-8">
          <DrawerTitle>Nuevo turno</DrawerTitle>
        </DrawerHeader>
        {/* La ✕ del drawer: espeja la del DialogContent (ghost · icon-sm · absolute top-2 right-2).
            NO pasa por la guarda — es la salida deliberada.
            TOUCH TARGET: `icon-sm` mide 28px, abajo de los 44 que pide CLAUDE.md. Se agranda el área
            táctil con un ::after de `-inset-2` (8px por lado ⇒ 28+16 = 44×44) SIN tocar el tamaño
            visual del icono, que es el mismo truco que usa vaul para su propio handle
            (`[data-vaul-handle-hitarea]`). El ::after ancla contra el botón porque ya es `absolute`. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-2 right-2 after:absolute after:-inset-2 after:content-['']"
          onClick={close}
        >
          <XIcon />
          <span className="sr-only">Cerrar</span>
        </Button>
        {blockedNotice}
        <div className="overflow-y-auto px-4 pb-6">{body}</div>
      </DrawerContent>
    </Drawer>
  )
}

type BodyProps = {
  // El cierre deliberado del shell: descarta y cierra. Lo llaman "Cancelar" y el éxito del submit.
  // Ya NO existe un `requestClose` aparte: el único cierre que pregunta algo es el accidental, y ése
  // lo intercepta la guarda del shell, no el cuerpo.
  onClose: () => void
  dirtyRef: { current: boolean }
  clients: Client[]
  services: Service[]
  professionals: Professional[]
  locations: Location[]
  prefill?: { date?: string; professionalId?: string }
  onCreated?: () => void
}

function TurnoFormBody({ onClose, dirtyRef, clients, services, professionals, locations, prefill, onCreated }: BodyProps) {
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
  // Paso del form: 'form' = carga · 'confirm' = resumen + confirmación antes de crear (UX).
  const [step, setStep] = useState<'form' | 'confirm'>('form')
  // Cliente ya resuelto (derivado si era nuevo) para el resumen del paso confirm.
  const [pendingClient, setPendingClient] = useState<SelectedClient | null>(null)

  // ── El "atrás" del celular cierra el CALENDARIO abierto, no el formulario (quick 261006-fln) ───
  //
  // ÚLTIMO HUECO DE LA TANDA. Diálogos y drawers (quick 260928-seo) y selectores (261006-dzr) ya
  // participan del historial porque los tres pasan por un wrapper único de `components/ui/`. El
  // calendario del campo Fecha NO tiene componente propio: es este `dateOpen` + un `<button>` que
  // togglea + una expansión EN EL LUGAR (no un portal), así que el enganche va acá, en el formulario.
  //
  // El hook sólo participa si el overlay es CONTROLADO (`open` definido + `dismiss` presente). Acá
  // `dateOpen` ya es estado explícito, así que sale natural: no hubo que controlar nada por dentro
  // como sí hubo que hacer con el `Select`, que era no controlado en sus 23 call sites.
  //
  // ⚠ LO QUE SE LE PASA ES "ESTÁ EN PANTALLA", NO `dateOpen` A SECAS. El paso de confirmación hace un
  // early return más abajo que se lleva TODA la rama del calendario, pero no toca `dateOpen`: con
  // `dateOpen` crudo el hook seguiría reteniendo una entrada por un calendario que ya no se ve, y el
  // atrás en el resumen sería un gesto MUERTO (apretar y que no pase nada visible) en vez de cerrar
  // el formulario — el defecto exacto que esta tanda viene a no repetir. Al bajar a false el hook
  // CONSUME la entrada, y al volver al paso 'form' la vuelve a empujar, así que el calendario sigue
  // expandido igual que antes: cero cambio de UI.
  //
  // ANIDAMIENTO: esto convive con el diálogo/drawer del alta, que ya tiene su propia entrada. El
  // módulo resuelve LIFO con un id por instancia —el `popstate` deja arriba la entrada del shell, que
  // el calendario ve como ajena (⇒ cierra) y el shell como propia (⇒ ignora)—, así que el atrás
  // cierra el calendario y el formulario QUEDA. Verificado en `test/overlay-history.test.ts`, no
  // supuesto.
  const dateCalendarOnScreen = dateOpen && !(step === 'confirm' && pendingClient)
  useOverlayHistory({
    open: dateCalendarOnScreen,
    // No pasa por `guardDraftOnDismiss`: acá no se descarta nada: la fecha ya elegida queda en `date`
    // y el borrador lo sigue protegiendo la guarda del shell cuando el atrás llega al formulario.
    dismiss: () => setDateOpen(false),
  })

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

  // El form está "sucio" si se tocó algún campo → habilita la confirmación de descarte del shell.
  const isDirty = !!(
    selectedClient || creatingClient || serviceId || date || time ||
    notes.trim() || newClientName.trim() || newClientContact.trim()
  )
  // El ref se actualiza en un effect (no en render): el shell lo lee en el handler de cierre, que
  // corre siempre después de los effects, así que refleja el último estado.
  useEffect(() => { dirtyRef.current = isDirty }, [isDirty, dirtyRef])

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

  // Paso 1 — validar + derivar el cliente efectivo, y pasar al RESUMEN/confirmación (no crea todavía).
  // Si hay un cliente nuevo en progreso (creatingClient), se deriva de los inputs SIN exigir el click
  // extra de "Crear nuevo cliente" — el endpoint lo persiste con dedupe.
  function goToConfirm() {
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
    setPendingClient(client)
    setStep('confirm')
  }

  // Paso 2 — crear el turno con el cliente ya resuelto en el resumen.
  async function doSubmit() {
    const client = pendingClient
    if (!client) { setStep('form'); return }
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
      // Un error puntual (ej. slot_taken) vuelve al form para corregir.
      setStep('form')
      toast.error(errorToast(data?.error))
      return
    }
    dirtyRef.current = false
    toast.success('Turno agregado')
    onClose()
    if (onCreated) onCreated()
    else router.refresh()
  }

  // ── Paso de confirmación (UX): resumen breve + aviso de mail, antes de crear el turno ────────
  if (step === 'confirm' && pendingClient) {
    const svc = services.find((s) => s.id === serviceId)
    const willNotify = notifyClient && !!pendingClient.email
    return (
      <div className="space-y-4">
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-3.5 text-sm">
          <div className="flex gap-2"><span className="w-20 shrink-0 text-muted-foreground">Cliente</span><span className="font-medium">{pendingClient.name}</span></div>
          <div className="flex gap-2"><span className="w-20 shrink-0 text-muted-foreground">Servicio</span><span className="font-medium">{svc ? svc.name : '—'}</span></div>
          <div className="flex gap-2"><span className="w-20 shrink-0 text-muted-foreground">Cuándo</span><span className="font-medium capitalize">{format(parseISO(date), "EEE d 'de' MMM", { locale: es })} · {time}</span></div>
        </div>
        <p className="text-sm text-muted-foreground">
          {willNotify ? (
            <>Se le va a enviar un <span className="font-medium text-foreground">mail de confirmación</span> a {pendingClient.email}.</>
          ) : (
            <>No se le va a enviar mail al cliente.</>
          )}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setStep('form')} disabled={saving}>
            Volver
          </Button>
          <Button type="button" className="min-h-11 gap-1.5" onClick={doSubmit} disabled={saving}>
            <Check className={cn('w-4 h-4', saving && 'hidden')} />
            {saving ? 'Agregando...' : 'Confirmar y agregar'}
          </Button>
        </div>
      </div>
    )
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
                {selectedClient.phone && (
                  <p className="text-xs text-muted-foreground truncate">{selectedClient.phone}</p>
                )}
                {selectedClient.email && (
                  <p className="text-xs text-muted-foreground truncate">{selectedClient.email}</p>
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
                <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={useExistingFromDedupe}>
                  Usar existente
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" className="w-full gap-1.5 sm:w-auto" onClick={confirmNewClient}>
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
                        {c.phone && (
                          <span className="block text-xs text-muted-foreground truncate">{c.phone}</span>
                        )}
                        {c.email && (
                          <span className="block text-xs text-muted-foreground truncate">{c.email}</span>
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
          <SelectContent align="start" alignItemWithTrigger={false}>
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
          <SelectContent align="start" alignItemWithTrigger={false}>
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
            <SelectContent align="start" alignItemWithTrigger={false}>
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
          {/* `TimeField`: siempre 24hs (el nativo lo decide el locale del SO) y teclado numérico en
              mobile en vez de la ruedita. Mismo ancho (`w-full` del Input base) y mismo alto; se cae
              el hack que escondía el ícono del reloj, que ya no existe. El `<Label htmlFor>` de
              arriba sigue siendo el nombre accesible. */}
          <TimeField
            id={`${searchListId}-time`}
            value={time}
            onValueChange={setTime}
            className="text-center"
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
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" className="min-h-11 gap-1.5" onClick={goToConfirm}>
          <Plus className="w-4 h-4" />
          Agregar turno
        </Button>
      </div>
    </div>
  )
}
