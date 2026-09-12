'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, Plus, Trash2, Clock, DollarSign, Stethoscope, Sparkles, LogOut, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VERTICALS, RUBRO_PLACEHOLDERS, type VerticalKey } from '@/lib/verticals'
import { normalizeArWhatsApp } from '@/lib/whatsapp'
import { linkLeadOnSignup } from '@/app/(crm)/admin/_pipeline-actions'
import { BlockServicesLine } from '@/components/agenda/block-services-line'
import {
  buildOnboardingAgendaPayload,
  canMapServicesInVertical,
  esServicioVigente,
  franjaServiceIdsVigentes,
  MIN_SERVICE_MINUTES,
  newServiceId,
  servicesWithoutCoverage,
  shouldMapServices,
  toNumberOr,
} from '@/lib/onboarding-agenda'
import { isValidBlockTime } from '@/lib/agenda-hours-payload'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// La clave local de cada servicio del paso 2 (D-08/D-09), y a la vez el `services.id` final, vive en
// `lib/onboarding-agenda.ts`. Se mudó al módulo puro por WR-02: llamaba a `globalThis.crypto
// .randomUUID()` directo, y ese método es `[SecureContext]` —en http:// NO EXISTE—, así que en la
// UAT desde el celular en la LAN tiraba `TypeError` adentro del inicializador lazy de un `useState`
// y dejaba la pantalla del alta en blanco. La rama de degradación no se puede ejercitar desde acá
// (el runner no renderiza este componente), y un fallback que nunca corrió no es una red.

// Estado del paso de horarios: un día → { enabled, blocks[] }, donde cada bloque es una ventana
// simple { start_time, end_time }. Modelo N-bloques/día para soportar horario partido (D-04, ej.
// Lun 9-12 y 15-19). Cada bloque se persiste como una fila time_blocks vía `save_agenda_blocks`
// (migr. 074), con label/consultorio nulos: el onboarding no maneja sedes. error = validación
// inline por bloque (forma y orden), mismo criterio que el panel (agenda-client.tsx:validateBlocks).
//
// `service_ids` (AGENDA-08, D-04) = qué servicios declara la franja. Vacío = COMODÍN: sirve para
// todos. Es estado de configuración, no de vista: sobrevive a apagar el toggle del paso 4 (lo que
// el toggle decide es si se MUESTRA y si se PERSISTE, nunca si se borra del estado).
interface HourBlock {
  start_time: string
  end_time: string
  service_ids: string[]
  error?: string
}

interface DayState {
  enabled: boolean
  blocks: HourBlock[]
}

// Default equivalente al DEFAULT_HOURS anterior, expresado como bloques: lun-vie 9-18, sáb 9-13,
// dom cerrado. Índice del array = day_of_week (0=domingo … 6=sábado).
const DEFAULT_DAY_STATES: DayState[] = [
  { enabled: false, blocks: [] },                                    // 0 domingo — cerrado
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00', service_ids: [] }] }, // 1 lunes
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00', service_ids: [] }] }, // 2 martes
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00', service_ids: [] }] }, // 3 miércoles
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00', service_ids: [] }] }, // 4 jueves
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '18:00', service_ids: [] }] }, // 5 viernes
  { enabled: true, blocks: [{ start_time: '09:00', end_time: '13:00', service_ids: [] }] }, // 6 sábado
]

interface Service {
  // Clave local estable (D-08/D-09) y `services.id` final. Ver newServiceId().
  id: string
  name: string
  duration_minutes: number
  price: number
  // Error inline de precio (validación onBlur, D-08). Vive en el estado del item, mismo criterio que
  // HourBlock.error / validateBlocks del panel. Solo estado de UI: NO se persiste en la fila de services.
  priceError?: string
  // Error inline de nombre (validación onBlur). Se marca solo si la fila tiene datos (precio/duración
  // distintos del default) pero sin nombre → el nombre es obligatorio para que la fila sea un servicio
  // real. NO bloquea Siguiente/Omitir (gating relajado, D-02). Solo estado de UI, no se persiste.
  nameError?: string
  // Explicación inline de la duración (WR-03). Mismo molde que priceError: estado de UI, no se
  // persiste, no bloquea el avance.
  durationError?: string
}

interface Professional {
  name: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  // Step 1 - Business
  const [name, setName] = useState('')
  // vertical = rubro elegido (resuelve terminología/menú, D-07); type = texto libre de display (D-07).
  const [vertical, setVertical] = useState<VerticalKey>('' as VerticalKey)
  const [type, setType] = useState('')
  const [slug, setSlug] = useState('')
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [slugChecking, setSlugChecking] = useState(false)
  const [whatsapp, setWhatsapp] = useState('')
  // Error inline de WhatsApp (validación onBlur, D-08). WhatsApp es OPCIONAL: vacío = válido, sin error.
  const [whatsappError, setWhatsappError] = useState<string | undefined>()
  const [address, setAddress] = useState('')
  const [instagram, setInstagram] = useState('')
  // Logo del negocio (ONB-03): se elige/previsualiza en el paso 1 pero se sube al FINALIZAR (la RLS
  // del bucket `logos` exige que el negocio ya exista). logoFile = archivo elegido; logoPreview =
  // objectURL para el avatar; ref para disparar el input file oculto.
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Validación cliente del logo (mitigación T-07-03): tipo ∈ {jpeg,png,webp} y tamaño ≤ 2MB antes de
  // aceptar el archivo. Verbatim del molde de settings-client.uploadLogo. La barrera no-bypasseable
  // sigue siendo la policy del bucket del lado server; esto es feedback temprano.
  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('El archivo no puede superar 2MB'); return }
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { toast.error('Formato no soportado. Usá JPG, PNG o WebP'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  // Step 2 - Services. Inicializador LAZY: `newServiceId()` genera un uuid, así que llamarlo en el
  // cuerpo del render quemaría uno nuevo en cada tecla que el dueño toca.
  const [services, setServices] = useState<Service[]>(() => [{ id: newServiceId(), name: '', duration_minutes: 30, price: 0 }])

  // Step 3 - Professionals
  const [professionals, setProfessionals] = useState<Professional[]>([{ name: '' }])

  // Step 4 - Hours (día → { enabled, blocks[] }, índice = day_of_week)
  const [dayStates, setDayStates] = useState<DayState[]>(DEFAULT_DAY_STATES)

  // ── Servicios por franja en el alta (AGENDA-08, D-01/D-02/D-04) ──────────────────────────────
  // El toggle arranca APAGADO: el negocio que atiende todos sus servicios en cualquier horario está
  // perfectamente descrito por el comodín, y el que no toca nada sale del alta exactamente igual que
  // antes de esta fase (cero regresión, D-02). Es control de UI y NADA más: prenderlo revela los
  // chips, apagarlo los esconde — el mapeo cargado sigue vivo en `dayStates` (D-04), y lo único que
  // el toggle decide sobre la base es si ese mapeo se persiste o si todo viaja en comodín (D-10).
  const [perFranja, setPerFranja] = useState(false)
  // Colapso de la línea de chips, por franja. Estado de VISTA (no se guarda, no viaja a la base).
  // La clave `día-índice` alcanza porque el alta no maneja sedes. Copiado del panel.
  const [expandedChips, setExpandedChips] = useState<Set<string>>(new Set())
  function toggleChipsExpanded(day: number, idx: number) {
    setExpandedChips(prev => {
      const next = new Set(prev)
      const key = `${day}-${idx}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Chequeo de disponibilidad de slug vía el endpoint service-role (ONB-01, D-01/D-03). ANTES corría
  // bajo RLS (supabase.from('businesses')): un futuro-owner no veía slugs ajenos → decía "disponible"
  // en falso y el negocio recién fallaba en el insert con el opaco "Error al crear el negocio". El
  // endpoint ve el espacio global multi-tenant y devuelve SOLO { available: boolean }.
  const checkSlug = useCallback(async (value: string) => {
    if (!value || value.length < 3) return
    setSlugChecking(true)
    try {
      const res = await fetch(`/api/onboarding/slug-available?slug=${encodeURIComponent(value)}`)
      const json = await res.json()
      // Fail-safe: SOLO available === true habilita el slug. Cualquier otra respuesta (400/401/
      // shape raro) deja slugAvailable en false → nunca falso-positivo de disponibilidad.
      setSlugAvailable(json.available === true)
    } catch {
      // Error de red → estado indeterminado (null), NUNCA "disponible" (Pitfall 5). El insert
      // conserva su guardia businesses_slug_key como red final ante la carrera.
      setSlugAvailable(null)
    } finally {
      setSlugChecking(false)
    }
  }, [])

  useEffect(() => {
    const slugified = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)
    setSlug(slugified)
  }, [name])

  useEffect(() => {
    const timeout = setTimeout(() => checkSlug(slug), 500)
    return () => clearTimeout(timeout)
  }, [slug, checkSlug])

  function handleSlugChange(val: string) {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setSlug(clean)
  }

  // Salida del wizard (ONB-02, D-04): un usuario autenticado sin negocio queda atrapado en el
  // onboarding (ej. entró con la cuenta de Google equivocada en el UAT de Phase 5). Cierra sesión y
  // vuelve a /login. Mismo patrón canónico que sidebar.tsx (signOut + push + refresh).
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Services
  function addService() {
    setServices([...services, { id: newServiceId(), name: '', duration_minutes: 30, price: 0 }])
  }

  // Borrar un servicio del paso 2 también le saca sus chips a TODAS las franjas del paso 4 (D-08).
  //
  // El chip desaparecía solo —el componente pinta lo que está en el catálogo— pero el id seguía vivo
  // adentro del bloque, que es exactamente lo que D-08 promete que no pasa. Es la PRIMERA de dos
  // capas: la segunda es el filtro contra el catálogo vigente dentro de buildOnboardingAgendaPayload,
  // que existe porque sin él la FK compuesta `tbs_service_same_tenant` rebota con 23503 y —como el
  // RPC de la agenda es todo-o-nada— se revierte la agenda COMPLETA. Esta capa es de UX (que el
  // estado diga la verdad); aquélla es el backstop que evita perder los horarios.
  function removeService(i: number) {
    const idBorrado = services[i]?.id
    setServices(services.filter((_, idx) => idx !== i))
    if (!idBorrado) return
    setDayStates(prev => prev.map(ds => ({
      ...ds,
      blocks: ds.blocks.map(b => (
        b.service_ids.includes(idBorrado)
          ? { ...b, service_ids: b.service_ids.filter(id => id !== idBorrado) }
          : b
      )),
    })))
  }

  function updateService(i: number, field: keyof Service, value: string | number) {
    const updated = [...services]
    // Limpiar el error del campo editado al escribir → feedback en vivo (se re-valida onBlur). El nombre
    // limpia su error solo cuando pasa a ser no-vacío; los demás campos limpian nameError igual porque
    // cambiar precio/duración puede resolver la condición "fila con datos sin nombre".
    const clearName = field === 'name' ? (typeof value === 'string' && value.trim() !== '') : true
    updated[i] = {
      ...updated[i],
      [field]: value,
      priceError: undefined,
      durationError: field === 'duration_minutes' ? undefined : updated[i].durationError,
      nameError: clearName ? undefined : updated[i].nameError,
    }
    setServices(updated)
  }

  // Validación inline de duración onBlur (WR-03). Dos cosas distintas y las dos necesarias:
  //
  // 1. El `NaN` ya no puede llegar hasta acá: el onChange usa `toNumberOr`, porque `parseInt('')` de
  //    un campo vaciado serializaba a `null` contra una columna NOT NULL y reventaba el insert ENTERO
  //    de servicios (una sola sentencia multi-fila) — y con él, desde esta fase, el mapeo de franjas.
  // 2. Lo que sí puede llegar es un `0` o un negativo tipeados a mano, que son entrada degenerada
  //    para la grilla horaria. Se CORRIGE a la vista (el campo pasa a 5) y se explica por qué, en vez
  //    de bloquear Finalizar: dejar al dueño encerrado en el wizard por esto contradice D-02/D-06, y
  //    dejarlo pasar en silencio le rompe la disponibilidad después. La corrección es visible y
  //    reversible — escribir 30 encima la deshace.
  function validateServiceDuration(i: number) {
    setServices(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      if (Number.isFinite(s.duration_minutes) && s.duration_minutes >= MIN_SERVICE_MINUTES) {
        return { ...s, durationError: undefined }
      }
      return {
        ...s,
        duration_minutes: MIN_SERVICE_MINUTES,
        durationError: `La duración mínima es de ${MIN_SERVICE_MINUTES} minutos: la ajustamos a ${MIN_SERVICE_MINUTES}. Escribí cuántos minutos dura el servicio.`,
      }
    }))
  }

  // Validación inline de precio onBlur (D-08/D-09): precio 0 y positivos son VÁLIDOS (servicio gratuito);
  // solo el negativo da error. El error vive en el item, se limpia al corregir (updateService).
  function validateServicePrice(i: number) {
    setServices(prev => prev.map((s, idx) =>
      idx === i
        ? { ...s, priceError: s.price < 0 ? 'El precio no puede ser negativo' : undefined }
        : s
    ))
  }

  // Validación inline de nombre onBlur: el nombre es obligatorio SOLO si la fila tiene datos (precio > 0
  // o duración distinta del default 30). Una fila totalmente vacía se ignora (se filtra en handleFinish),
  // así que no molesta con error. Mismo precedente que validateServicePrice; no bloquea el avance (D-02).
  function validateServiceName(i: number) {
    setServices(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      const hasData = s.price > 0 || s.duration_minutes !== 30
      const missing = s.name.trim() === '' && hasData
      return { ...s, nameError: missing ? 'El nombre es obligatorio' : undefined }
    }))
  }

  // Professionals
  function addProfessional() {
    setProfessionals([...professionals, { name: '' }])
  }

  function removeProfessional(i: number) {
    setProfessionals(professionals.filter((_, idx) => idx !== i))
  }

  function updateProfessional(i: number, value: string) {
    const updated = [...professionals]
    updated[i] = { name: value }
    setProfessionals(updated)
  }

  // Hours — patrón del panel (agenda-client.tsx) adaptado a un solo eje día (sin consultorio/location).
  // Activar un día = arrancar con un bloque por defecto; desactivar = sin bloques (día cerrado).
  function toggleDay(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks: HourBlock[] = next[day].enabled ? [] : [{ start_time: '09:00', end_time: '18:00', service_ids: [] }]
      next[day] = { enabled: blocks.length > 0, blocks }
      return next
    })
  }

  // Agregar bloque = horario partido. Arranca donde terminó el último bloque (+3h), como el panel.
  function addBlock(day: number) {
    setDayStates(prev => {
      const next = [...prev]
      const last = next[day].blocks[next[day].blocks.length - 1]
      const newStart = last?.end_time || '09:00'
      const [h, m] = newStart.split(':').map(Number)
      const newEnd = `${String(Math.min(h + 3, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      next[day] = { enabled: true, blocks: [...next[day].blocks, { start_time: newStart, end_time: newEnd, service_ids: [] }] }
      return next
    })
  }

  // Toglea un servicio en UNA franja concreta (día + índice dentro del día). Inmutable: se
  // reemplazan el arreglo de días, el de bloques y el de servicios, nunca se muta ninguno.
  // Molde del panel (agenda-client.tsx:toggleBlockService) SIN su `setHoursDirty`: el alta no tiene
  // indicador de cambios sin guardar porque el submit es la única salida del wizard.
  function toggleBlockService(day: number, idx: number, serviceId: string) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks = [...next[day].blocks]
      const current = blocks[idx].service_ids
      const service_ids = current.includes(serviceId)
        ? current.filter(id => id !== serviceId)
        : [...current, serviceId]
      blocks[idx] = { ...blocks[idx], service_ids }
      next[day] = { ...next[day], blocks }
      return next
    })
  }

  function removeBlock(day: number, idx: number) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks = next[day].blocks.filter((_, i) => i !== idx)
      next[day] = { enabled: blocks.length > 0, blocks }
      return next
    })
  }

  function updateBlock(day: number, idx: number, field: 'start_time' | 'end_time', value: string) {
    setDayStates(prev => {
      const next = [...prev]
      const blocks = [...next[day].blocks]
      blocks[idx] = { ...blocks[idx], [field]: value, error: undefined }
      next[day] = { ...next[day], blocks }
      return next
    })
  }

  // Validación inline por bloque: PRIMERO la forma, después el orden (mismo criterio y mismo orden
  // que validateBlocks del panel). No valida solapamiento (el onboarding no maneja consultorios).
  // Marca errores en el estado y devuelve false si hay alguno para bloquear el finalizar.
  //
  // Por qué la forma va primero: un `<input type="time">` se puede VACIAR, y entonces la comparación
  // de orden miente — es lexicográfica, y cualquier cadena no vacía ordena DESPUÉS de la vacía, así
  // que `'18:00' <= ''` da false y el bloque pasaba el filtro entero. Del otro lado el `::time` del
  // RPC revienta con 22007 ANTES de poder llegar a su propio backstop `invalid_block`, y el dueño se
  // come un error crudo de la base por un campo que la pantalla podía haberle marcado.
  function validateHours(): boolean {
    let valid = true
    const next = dayStates.map(ds => {
      if (!ds.enabled) return ds
      const blocks = ds.blocks.map(b => {
        if (!isValidBlockTime(b.start_time) || !isValidBlockTime(b.end_time)) {
          valid = false
          return { ...b, error: 'Completá la hora de inicio y la de fin.' }
        }
        if (b.end_time <= b.start_time) { valid = false; return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' } }
        return { ...b, error: undefined }
      })
      return { ...ds, blocks }
    })
    setDayStates(next)
    return valid
  }

  async function handleFinish() {
    // Bloquear el finalizar si algún bloque de horario es inválido (fin <= inicio). Marca el error
    // inline en el estado y no avanza (no crea el negocio con horarios rotos).
    if (!validateHours()) {
      toast.error('Revisá los horarios: la hora de fin debe ser mayor a la de inicio.')
      return
    }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')

      // WhatsApp opcional: si lo cargaron, normalizar a formato wa.me y validar.
      let whatsappNorm: string | null = null
      if (whatsapp.trim()) {
        whatsappNorm = normalizeArWhatsApp(whatsapp)
        if (!whatsappNorm) {
          toast.error('WhatsApp inválido. Usá código de país y área, ej. +54 9 11 1234-5678')
          return
        }
      }

      const { data: business, error: bizError } = await supabase
        .from('businesses')
        .insert({
          owner_id: user.id,
          name,
          slug,
          type,
          vertical,
          whatsapp: whatsappNorm,
          address: address || null,
          instagram: instagram || null,
          // Paleta default (ONB-04, D-06): el wizard ya no ofrece el selector; el negocio arranca con
          // la paleta 'red' (el default histórico) y la edita después en Ajustes → Apariencia.
          palette: 'red',
          // back-compat: la columna primary_color sigue existiendo; es el swatch del 'red'.
          primary_color: '#d94a2b',
        })
        .select()
        .single()

      if (bizError) throw bizError

      // Upload del logo al bucket `logos` (ONB-03, D-05). Timing: DESPUÉS de crear el negocio porque
      // la RLS del bucket exige que el negocio exista (path keyeado por business.id). El path lo arma
      // el server con business.id de la sesión (UUID de confianza, NO del cliente → mitigación T-07-02
      // path traversal). Best-effort: el negocio ya existe, así que un fallo del upload/update se
      // loguea y NO rompe el redirect al dashboard (mismo criterio que linkLeadOnSignup, T-04-09).
      if (logoFile) {
        try {
          const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
          const path = `${business.id}/logo.${ext}`
          const bucket = supabase.storage.from('logos')
          const { error: uploadErr } = await bucket.upload(path, logoFile, { upsert: true })
          if (!uploadErr) {
            const { data: { publicUrl } } = bucket.getPublicUrl(path)
            await supabase.from('businesses').update({ logo_url: `${publicUrl}?t=${Date.now()}` }).eq('id', business.id)
          } else {
            console.error('[onboarding/logo]', uploadErr.message)
          }
        } catch (logoErr) {
          console.error('[onboarding/logo]', logoErr instanceof Error ? logoErr.message : logoErr)
        }
      }

      // priceError es solo estado de UI (validación inline): NO se envía al insert (columna inexistente
      // en services). Se arma la fila con los campos de dominio explícitos. Precio 0 se persiste tal cual
      // (servicio gratuito, D-09).
      //
      // El `id` lo pone el cliente (D-09): es el mismo uuid con el que la fila viene viviendo desde el
      // paso 2 y el mismo que el mapeo del paso 4 referencia. No hay `.select()` ni correlación por
      // posición — ver el comentario de newServiceId().
      const filasDeServicios = services.filter(esServicioVigente).map(s => ({
        id: s.id,
        name: s.name,
        duration_minutes: s.duration_minutes,
        price: s.price,
        business_id: business.id,
      }))
      // El error de este insert SÍ se chequea, y no por prolijidad: si los servicios no entraron, el
      // mapeo del paso 4 apuntaría a ids que no existen, la FK compuesta `tbs_service_same_tenant`
      // (migr. 073) rebotaría con 23503 y —como el RPC de la agenda es todo-o-nada— el negocio se
      // quedaría TAMBIÉN sin horarios. Cuando falla, la agenda se degrada a comodín en vez de
      // arrastrar al fondo a toda la configuración.
      let falloServicios = false
      if (filasDeServicios.length > 0) {
        const { error: svcErr } = await supabase.from('services').insert(filasDeServicios)
        if (svcErr) {
          falloServicios = true
          console.error('[onboarding/services]', svcErr.code)
          // El mensaje tiene que nombrar TODO lo que se perdió, no sólo la mitad visible (WR-01).
          // Cuando el dueño venía mapeando franjas, este fallo NO se lleva sólo el catálogo: fuerza
          // `mapServices: false`, así que la agenda se persiste entera en comodín —o sea, abierta a
          // todo— y él no tiene forma de enterarse. Recrear los servicios en el panel no reconstruye
          // ese mapeo, así que el mensaje también dice dónde terminar de configurarlo.
          toast.error(
            canMapServices && perFranja
              ? 'Creamos tu negocio, pero no pudimos guardar tus servicios, así que tampoco pudimos guardar qué se da en cada franja: tus horarios quedaron abiertos a cualquier servicio. Entrá a Servicios, cargalos, y después definí las franjas en Agenda.'
              : 'Creamos tu negocio, pero no pudimos guardar tus servicios. Entrá a Servicios y cargalos.'
          )
        }
      }

      await supabase.from('professionals').insert(
        professionals.filter(p => p.name).map(p => ({ ...p, business_id: business.id }))
      )

      // Horarios + mapeo franja↔servicio → `save_agenda_blocks` (migr. 074), el MISMO RPC atómico
      // que usa el panel. Una sola llamada todo-o-nada en vez de dos escrituras sin transacción: las
      // franjas y sus servicios entran juntos o no entra nada, así que el estado "horarios sí, mapeo
      // no" —que el dueño no podría distinguir de "todavía no lo configuré"— deja de ser alcanzable.
      //
      // business_id = SIEMPRE el del negocio recién creado por ESTA sesión (business.id), nunca del
      // estado del formulario: aislamiento por tenant, con el guard `not_your_business` de la propia
      // función y la RLS de time_blocks/time_block_services como capas de abajo.
      // La decisión de si el mapeo se persiste NO se escribe acá: sale del módulo puro
      // (`shouldMapServices`), que es donde se la puede testear. Mientras vivía como una expresión
      // suelta en este submit se le podía invertir cualquiera de los tres términos sin que un solo
      // test se pusiera rojo — y el término que más caro sale (`servicesFailed`) es justo el que
      // decide entre "agenda en comodín" y "negocio sin ningún horario".
      const p_blocks = buildOnboardingAgendaPayload(dayStates, {
        mapServices: shouldMapServices({ vertical, perFranja, servicesFailed: falloServicios }),
        liveServiceIds: filasDeServicios.map(s => s.id),
      })
      const { error: agendaErr } = await supabase.rpc('save_agenda_blocks', {
        p_business_id: business.id,
        p_blocks,
      })
      if (agendaErr) {
        // Se registra el CÓDIGO, nunca el mensaje: alcanza para diagnosticar y no arrastra nombres
        // de tabla ni de constraint a ningún lado.
        console.error('[onboarding/agenda]', agendaErr.code)
        if (agendaErr.code === 'PGRST202') {
          // Sin esta línea el síntoma es indistinguible de un problema de red, y el diagnóstico real
          // es otro (mismo caso que el panel).
          console.error('[onboarding/agenda] la función de guardado de la agenda no está expuesta por PostgREST — verificar que la migración 074 esté aplicada y que se haya recargado el cache del schema')
        }
        toast.error('Creamos tu negocio, pero no pudimos guardar los horarios. Entrá a Agenda y cargalos.')
        // NO se tira: el negocio ya existe y el alta no es re-entrante (un segundo submit crearía
        // OTRO negocio), así que cortar el redirect dejaría al dueño peor de lo que está. Un solo
        // mensaje, honesto sobre qué se guardó y qué no, y el camino de salida es el panel.
      }

      // Conversión automática lead→negocio (CRM, PIPE-03 / D-05). Este es el punto de integración
      // REAL de la conversión: register solo hace auth.signUp; el negocio recién existe ACÁ. La sesión
      // del dueño NO puede escribir leads/deals (tablas admin-only por RLS, migración 034) → la action
      // corre service-role server-side y re-deriva el email del owner de la sesión (anti-tampering, por
      // eso NO le pasamos email ni leadId). Best-effort: si falla, el negocio ya se creó; loguear y
      // seguir, NUNCA bloquear el redirect al dashboard (T-04-09).
      try {
        await linkLeadOnSignup({ businessId: business.id })
      } catch (linkErr) {
        console.error('[onboarding/link-lead]', linkErr instanceof Error ? linkErr.message : linkErr)
      }

      toast.success('¡Negocio creado con éxito!')
      router.push('/dashboard')
    } catch (err) {
      toast.error('Error al crear el negocio. Intentá de nuevo.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Array base de pasos con su `n` ESTABLE (n=1 Negocio … n=4 Horarios). `n` es el identificador
  // canónico del paso: `step` y los bloques del render (`step === 1/2/3/4`) siempre keyean contra él,
  // así el contenido de cada paso no se corre cuando ocultamos uno. El orden NO cambia (D-06).
  const steps = [
    { n: 1, label: 'Tu negocio' },
    { n: 2, label: 'Servicios' },
    { n: 3, label: 'Profesionales' },
    { n: 4, label: 'Horarios' },
  ]

  // Stepper dinámico por vertical (D-03): en 'canchas' una cancha NO es un profesional humano, así que
  // el paso Profesionales (n=3) desaparece del flujo → quedan 3 pasos (Negocio → Servicios → Horarios).
  // En el resto de verticales `visibleSteps === steps` (4 pasos). La numeración VISIBLE del stepper
  // deriva de la POSICIÓN en este array (idx+1), no del `n`, para leerse 1-2-3 / 1-2-3-4 sin huecos.
  const visibleSteps = vertical === 'canchas'
    ? steps.filter(s => s.n !== 3)
    : steps

  // ── Los gates del mapeo franja↔servicio del paso Horarios (AGENDA-08) ───────────────────────
  // 1) Vertical canchas (D-03): en ese rubro un "servicio" ES una cancha con su propia agenda
  //    (v0.13), así que declarar "qué se da en esta franja" duplicaría ese eje con otro que no lo
  //    decide. Es un CONTROL oculto, NO un paso oculto: canchas necesita horarios, así que el paso
  //    se sigue mostrando y por eso este gate no filtra `steps`. Se evalúa contra el estado local
  //    `vertical` y nunca contra resolveVertical(business): acá el negocio todavía no existe.
  //    La regla sale del módulo puro para que este gate y el del submit (`shouldMapServices`) no
  //    puedan separarse: son la MISMA condición leída en dos momentos.
  const canMapServices = canMapServicesInVertical(vertical)
  // 2) El catálogo de los chips, fabricado desde el estado local del paso 2. `active` siempre true:
  //    durante el alta no existe un servicio dado de baja (el matiz D-11 del panel no aplica acá).
  const chipCatalog = services.filter(esServicioVigente).map(s => ({ id: s.id, name: s.name, active: true }))
  // Los ids VIGENTES, para filtrar lo que cada franja le pasa a la línea de chips (CR-01). Sin esto,
  // el id de un servicio al que se le vació el nombre y quedó mapeado no pintaba ningún chip marcado
  // (no está en el catálogo) NI el comodín (el arreglo no estaba vacío): la franja no decía nada,
  // mientras la base la guardaba abierta a TODO el catálogo. El filtro se aplica acá, en el borde del
  // componente, y no adentro del estado: limpiar `dayStates` desde `updateService` le destruiría el
  // mapeo al dueño mientras retipea un nombre, que es una segunda pérdida silenciosa.
  const chipCatalogIds = new Set(chipCatalog.map(s => s.id))
  // 3) Catálogo vacío: no se ofrece el toggle. Un alta puede tener 14 franjas, y un control que no
  //    tiene nada para elegir es ruido; en su lugar va UNA línea guía en la card (son mutuamente
  //    excluyentes).
  const showServicesToggle = canMapServices && chipCatalog.length > 0

  // ── El aviso de D-07: los servicios que NINGUNA franja cubre ─────────────────────────────────
  // Sólo tiene sentido con el toggle prendido: apagado se persiste comodín (D-10), así que ningún
  // servicio queda sin cobertura y el aviso estaría mintiendo. En canchas no aparece nunca porque
  // `showServicesToggle` ya lo cubre (D-03).
  //
  // El dato sale del módulo puro, jamás de un filtro sobre el mapeo escrito acá (AGENDA-02): una
  // segunda interpretación de la regla del comodín es exactamente cómo el alta y el booking público
  // terminan diciendo cosas distintas sobre la misma franja.
  //
  // ⚠ NO BLOQUEA, y eso es estructural y no una promesa: `handleFinish` no consulta esta constante,
  // Finalizar conserva su único `disabled={loading}` y `validateHours()` no cambia. Un servicio sin
  // franja es un estado LEGAL —el dueño está a mitad de configurar, D-06 de la Phase 18—, sólo que
  // desde la Phase 20 tiene consecuencia pública real. Por eso se informa en vez de impedir: dejarlo
  // encerrado en el wizard por un estado que el modelo declara válido sería peor que el silencio.
  const sinCobertura = showServicesToggle && perFranja ? servicesWithoutCoverage(services, dayStates) : []
  // La frase entre comillas angulares es VERBATIM la que el cliente ya ve en la página pública desde
  // la Phase 20 (`app/[slug]/booking-client.tsx`): el objetivo es que el dueño RECONOZCA el efecto
  // cuando lo vea en su propia página, no que se entere de dos cosas parecidas con dos palabras
  // distintas. Los nombres salen del paso 2, tal como los escribió, y en ese orden.
  const avisoSinCobertura =
    sinCobertura.length === 0
      ? ''
      : sinCobertura.length === 1
        ? `${sinCobertura[0].name} no se da en ninguna franja: en tu página de reservas va a aparecer como «Sin horarios disponibles».`
        : `Estos servicios no se dan en ninguna franja y van a aparecer como «Sin horarios disponibles» en tu página de reservas: ${sinCobertura.map(s => s.name).join(', ')}.`

  // Índice del paso actual dentro de `visibleSteps` (posición, no `n`). La navegación se mueve entre
  // posiciones para saltar limpio el paso oculto en canchas (Servicios n=2 → Horarios n=4 sin pasar
  // por el Profesionales inexistente). También define cuál es el "último paso" (Finalizar) y si mostrar
  // Omitir. Fallback a 0 si `step` no está en la lista visible (cambio de rubro que oculta el actual).
  const currentIndex = Math.max(0, visibleSteps.findIndex(s => s.n === step))
  const isLastStep = currentIndex === visibleSteps.length - 1

  const canGoNext = () => {
    // Gating relajado (D-02): solo el paso Negocio (siempre visibleSteps[0]) bloquea el avance;
    // Servicios/Profesionales/Horarios son omitibles → nunca bloquean (esto también elimina el viejo
    // requisito `price > 0`, cumpliendo D-09 a nivel de gating). Negocio es el primer paso en todo
    // vertical, así que keyeamos contra su `n` (1), no contra una posición que pueda correrse.
    if (step === 1) return name && slug && slugAvailable && vertical
    return true
  }

  // Gate del "+ Agregar" para no apilar filas vacías: la última fila debe estar completa antes de sumar
  // otra. Servicios → nombre no vacío y sin priceError (nombre = campo obligatorio de la fila, D-02).
  // Profesionales → solo nombre. NO toca el gating de Siguiente/Omitir (D-02 sigue relajado); solo el
  // affordance de agregar. El disabled usa el estilo built-in de shadcn.
  const lastService = services[services.length - 1]
  const canAddService = !!lastService?.name.trim() && !lastService?.priceError && !lastService?.durationError
  const lastProfessional = professionals[professionals.length - 1]
  const canAddProfessional = !!lastProfessional?.name.trim()

  return (
    <div className="min-h-screen p-4 flex flex-col items-center">
      <div className="w-full max-w-2xl mt-8">
        <div className="relative text-center mb-8">
          {/* Salida discreta arriba a la derecha (ONB-02): no compite con el lockup centrado. Visible
              en todos los pasos para que el usuario con la cuenta equivocada pueda salir siempre. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="absolute right-0 top-0 gap-1.5 text-muted-foreground"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </Button>
          <div className="flex items-center justify-center">
            <Image src="/brand/forjo-gestion-lockup-tinta.png" alt="Forjo Gestión" width={781} height={190} priority className="h-10 w-auto dark:hidden" />
            <Image src="/brand/forjo-gestion-lockup-crema.png" alt="Forjo Gestión" width={781} height={190} priority className="hidden h-10 w-auto dark:block" />
          </div>
          {/* Subtítulo count-aware: refleja el conteo real de pasos visibles (3 en canchas, 4 en el
              resto), no un literal fijo. */}
          <p className="text-muted-foreground mt-2">Configurá tu negocio en {visibleSteps.length} pasos</p>
        </div>

        {/* Stepper — itera sobre visibleSteps (Profesionales oculto en canchas, D-03). El número visible
            del nodo deriva de la POSICIÓN (idx+1) → 1-2-3 / 1-2-3-4 sin huecos; el estado
            activo/completado compara contra `s.n` (el paso real), no contra la posición. */}
        <div className="flex items-center justify-center mb-8 gap-0">
          {visibleSteps.map((s, idx) => (
            <div key={s.n} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                  step > s.n ? 'bg-primary text-primary-foreground' :
                  step === s.n ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
                  'bg-secondary text-muted-foreground'
                )}>
                  {step > s.n ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span className={cn(
                  'text-xs mt-1 hidden sm:block',
                  step === s.n ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}>{s.label}</span>
              </div>
              {idx < visibleSteps.length - 1 && (
                <div className={cn(
                  'h-px w-12 sm:w-20 mx-1 sm:mx-2 mb-4 transition-colors',
                  step > s.n ? 'bg-primary' : 'bg-border'
                )} />
              )}
            </div>
          ))}
        </div>

        <Card className="p-6">
          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Tu negocio</h2>

              {/* Logo (ONB-03): se elige acá y se sube al finalizar. Avatar redondo + input file oculto,
                  mismo layout que Ajustes → Negocio. Sin botón "Guardar": el upload es al finalizar. */}
              <div className="space-y-2">
                <Label>Logo del negocio <span className="text-muted-foreground">(opcional)</span></Label>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {logoPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoPreview}
                        alt="Logo"
                        className="w-20 h-20 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center">
                        {name ? (
                          <span className="text-2xl font-bold text-primary">{name.charAt(0).toUpperCase()}</span>
                        ) : (
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={handleLogoSelect}
                    />
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()}>
                        {logoPreview ? 'Cambiar logo' : 'Subir logo'}
                      </Button>
                      {logoPreview && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-400 border-red-500/30"
                          onClick={() => { setLogoPreview(null); setLogoFile(null) }}
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">JPG, PNG o WebP · Máximo 2MB</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre del negocio *</Label>
                  <Input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ej: Estudio Nova"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rubro *</Label>
                  <Select value={vertical} onValueChange={v => setVertical(v as VerticalKey)}>
                    <SelectTrigger>
                      {/* Base UI Select.Value muestra el value crudo por defecto (la VerticalKey);
                          mapeamos a su label. Vacío → placeholder (muted vía data-placeholder). */}
                      <SelectValue>
                        {(v: string | null) => (v && v in VERTICALS ? VERTICALS[v as VerticalKey].label : 'Elegí tu rubro')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(VERTICALS) as VerticalKey[]).map(k => (
                        <SelectItem key={k} value={k}>{VERTICALS[k].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Campo libre SIEMPRE visible (D-04/D-05): ancho completo bajo la grilla. El placeholder
                  sugiere según el rubro elegido; la leyenda avisa que es la categoría pública. Opcional
                  (D-03) → no bloquea el avance (canGoNext exige el rubro, no este campo). */}
              <div className="space-y-2">
                <Label>¿A qué se dedica tu negocio?</Label>
                <Input
                  value={type}
                  onChange={e => setType(e.target.value)}
                  placeholder={RUBRO_PLACEHOLDERS[vertical] ?? ''}
                />
                <p className="text-xs text-muted-foreground">Así aparecerá en tu página de reservas</p>
              </div>

              {/* Vertical hint — explica qué incluye el panel según el rubro */}
              {vertical === 'salud' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Stethoscope className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">Tu panel incluirá <strong className="text-foreground">historia clínica</strong> y <strong className="text-foreground">obra social</strong>.</span>
                </div>
              )}
              {vertical === 'belleza' && (
                <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">Tu panel incluirá <strong className="text-foreground">fichas de preferencias</strong> de clientes.</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>URL de tu página *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm whitespace-nowrap">forjo.studio/</span>
                  <Input
                    value={slug}
                    onChange={e => handleSlugChange(e.target.value)}
                    placeholder="mi-negocio"
                    className="flex-1"
                  />
                </div>
                <div className="text-sm">
                  {slugChecking && <span className="text-muted-foreground">Verificando disponibilidad...</span>}
                  {!slugChecking && slug && slugAvailable === true && (
                    <span className="text-green-500">✓ Disponible</span>
                  )}
                  {!slugChecking && slug && slugAvailable === false && (
                    <span className="text-destructive">✗ Ya está en uso</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>WhatsApp <span className="text-muted-foreground">(opcional)</span></Label>
                  {/* Validación inline onBlur (D-08): si hay algo cargado y el formato es inválido, error
                      inmediato; vacío o válido = sin error. Se limpia al escribir (feedback en vivo). */}
                  <Input
                    value={whatsapp}
                    onChange={e => { setWhatsapp(e.target.value); setWhatsappError(undefined) }}
                    onBlur={() => setWhatsappError(
                      whatsapp.trim() && !normalizeArWhatsApp(whatsapp)
                        ? 'WhatsApp inválido. Usá código de país y área, ej. +54 9 11 1234-5678'
                        : undefined
                    )}
                    placeholder="+54 9 11 1234-5678"
                    aria-invalid={!!whatsappError}
                  />
                  {whatsappError && <p className="text-xs text-destructive">{whatsappError}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Instagram <span className="text-muted-foreground">(opcional)</span></Label>
                  <Input value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@minegocio" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dirección <span className="text-muted-foreground">(opcional)</span></Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Tus servicios</h2>
              <div className="space-y-3">
                {/* Header de columnas fijo (D-07): los labels Nombre/Min./Precio viven UNA sola vez arriba
                    de la grilla y quedan visibles siempre, sin importar qué fila tenga foco. Sticky (top-0)
                    para no perderse con listas largas; oculto en mobile (< sm) donde cada fila es una
                    tarjeta con labels propios. bg-card = superficie del onboarding. */}
                <div className="hidden sm:grid sticky top-0 z-10 bg-card grid-cols-12 gap-2 py-1">
                  <Label className="col-span-5 text-xs text-muted-foreground">Nombre</Label>
                  <Label className="col-span-3 text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Min.
                  </Label>
                  <Label className="col-span-3 text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Precio
                  </Label>
                  <div className="col-span-1" />
                </div>
                {/* Un solo template responsive por fila (FIX 4/6): mobile (< sm) = tarjeta de dos líneas con
                    labels propios (el header de columnas está oculto → labels siempre visibles, ONB-02);
                    desktop (sm+) = fila en la grilla 12-col alineada al header sticky. */}
                {services.map((service, i) => (
                  <div
                    key={service.id}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:border-0 sm:p-0 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center"
                  >
                    {/* Línea 1 mobile / col Nombre desktop */}
                    <div className="sm:col-span-5 space-y-1">
                      <Label className="sm:hidden text-xs text-muted-foreground">Nombre</Label>
                      <Input
                        value={service.name}
                        onChange={e => updateService(i, 'name', e.target.value)}
                        onBlur={() => validateServiceName(i)}
                        placeholder={i === 0 ? 'Ej: Corte de cabello' : ''}
                        aria-invalid={!!service.nameError}
                      />
                    </div>
                    {/* Línea 2 mobile: Min. + Precio lado a lado + trash centrado; en desktop cada campo es
                        su propia columna de la grilla. */}
                    <div className="flex items-end gap-2 sm:contents">
                      <div className="flex-1 min-w-0 sm:col-span-3 space-y-1">
                        <Label className="sm:hidden text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Min.
                        </Label>
                        {/* `toNumberOr` y no `parseInt` (WR-03): un campo vaciado daba NaN, que
                            JSON.stringify serializa a null contra una columna NOT NULL y voltea el
                            insert COMPLETO de servicios — y con él el mapeo franja↔servicio. */}
                        <Input
                          type="number"
                          value={service.duration_minutes}
                          onChange={e => updateService(i, 'duration_minutes', toNumberOr(e.target.value, 30))}
                          onFocus={e => e.target.select()}
                          onBlur={() => validateServiceDuration(i)}
                          min={MIN_SERVICE_MINUTES}
                          step={5}
                          aria-invalid={!!service.durationError}
                        />
                      </div>
                      <div className="flex-1 min-w-0 sm:col-span-3 space-y-1">
                        <Label className="sm:hidden text-xs text-muted-foreground flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> Precio
                        </Label>
                        {/* Precio valida onBlur (D-08/D-09): negativo = error inline; 0 y positivos válidos.
                            onFocus select() → escribir reemplaza el 0 preseteado (antes escribía "05"). */}
                        <Input
                          type="number"
                          value={service.price}
                          onChange={e => updateService(i, 'price', toNumberOr(e.target.value, 0))}
                          onFocus={e => e.target.select()}
                          onBlur={() => validateServicePrice(i)}
                          min={0}
                          step={100}
                          aria-invalid={!!service.priceError}
                        />
                      </div>
                      <div className="sm:col-span-1 flex items-center justify-end">
                        {services.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeService(i)}
                            className="text-muted-foreground hover:text-destructive h-9 w-9"
                            aria-label="Quitar servicio"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {(service.nameError || service.priceError || service.durationError) && (
                      <p className="sm:col-span-12 text-xs text-destructive">
                        {service.nameError || service.priceError || service.durationError}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={addService} disabled={!canAddService} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Agregar servicio
              </Button>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4">Tus profesionales</h2>
              <div className="space-y-2">
                {professionals.map((pro, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={pro.name}
                      onChange={e => updateProfessional(i, e.target.value)}
                      placeholder={`Profesional ${i + 1}`}
                      className="flex-1"
                    />
                    {professionals.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProfessional(i)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={addProfessional} disabled={!canAddProfessional} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Agregar profesional
              </Button>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold mb-4 text-center sm:text-left">Horarios de atención</h2>
              <p className="text-sm text-muted-foreground">Tocá cada día para abrirlo o cerrarlo. Podés cargar horario partido: agregá más de un bloque por día (ej. 9-12 y 15-19). Un día sin bloques queda cerrado.</p>

              {/* El toggle de D-01: la pregunta que sólo el dueño puede contestar. No discrimina por
                  rubro ni por cantidad de servicios —una peluquería con 5 servicios que atiende 9-18
                  está perfectamente descrita por el comodín, y un taller con 2 no—; lo que distingue
                  es si la franja ES la clase. Arranca en No (D-02) y no bloquea el avance. */}
              {showServicesToggle && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    {/* El `id` no es decorativo: es lo único que le da nombre accesible al switch
                        (WR-04). Sin él, el lector de pantalla anunciaba "No, switch, apagado" y el
                        dueño no tenía forma de saber QUÉ se estaba apagando — la pregunta vive en
                        este span, no en el botón, cuyo texto visible es sólo "Sí"/"No". */}
                    <span id="per-franja-label" className="text-sm font-medium">¿Cada franja es para un servicio puntual?</span>
                    {/* `aria-checked` y NUNCA `aria-pressed`: el estado de un `role="switch"` lo lleva
                        el primero; `aria-pressed` es del rol `button` y el rol switch no lo soporta
                        (lo marca `jsx-a11y/role-supports-aria-props`). Tener los dos no reforzaba
                        nada: duplicaba el estado en un atributo que este rol ignora. */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={perFranja}
                      aria-labelledby="per-franja-label"
                      onClick={() => setPerFranja(v => !v)}
                      className={cn(
                        'inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        perFranja
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {perFranja ? 'Sí' : 'No'}
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">Si atendés todos tus servicios en cualquiera de tus horarios, dejalo en No. Si tenés horarios dedicados —por ejemplo, los martes de 15 a 16 hacés cerámica y nada más— ponelo en Sí y elegí qué se da en cada franja.</p>
                </div>
              )}
              {/* Línea guía del catálogo vacío: UNA sola vez en la card, nunca una por franja. */}
              {canMapServices && chipCatalog.length === 0 && (
                <p className="text-xs text-muted-foreground">Cargá tus servicios en el paso anterior y vas a poder elegir qué se da en cada franja.</p>
              )}

              <div className="space-y-2">
                {dayStates.map((ds, day) => (
                  // Mobile (< sm): día como barra full-width centrada arriba y los bloques debajo (stack
                  // vertical). Desktop (sm+): layout horizontal — día w-20 a la izquierda, bloques a la
                  // derecha. items-stretch en mobile para que el botón ocupe todo el ancho.
                  <div key={day} className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2 sm:gap-3 py-2 border-b border-border last:border-0">
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={ds.enabled}
                      className={cn(
                        'w-3/5 mx-auto sm:w-20 sm:mx-0 shrink-0 text-center text-xs font-medium py-1 px-2 rounded transition-colors sm:mt-1',
                        ds.enabled ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                      )}
                    >
                      {DAYS[day]}
                    </button>
                    {ds.enabled ? (
                      <div className="flex-1 min-w-0 space-y-2">
                        {ds.blocks.map((b, idx) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-center sm:justify-start gap-2">
                              {/* Inputs de hora: ancho fijo snug (w-24 = 96px) y texto centrado — entra
                                  "09:00" + el ícono nativo del reloj sin truncar; centrados bajo el día en
                                  mobile, alineados a la izquierda en sm+. */}
                              <Input
                                type="time"
                                value={b.start_time}
                                onChange={e => updateBlock(day, idx, 'start_time', e.target.value)}
                                className="w-24 text-center text-sm"
                                aria-invalid={!!b.error}
                              />
                              <span className="text-muted-foreground text-sm">—</span>
                              <Input
                                type="time"
                                value={b.end_time}
                                onChange={e => updateBlock(day, idx, 'end_time', e.target.value)}
                                className="w-24 text-center text-sm"
                                aria-invalid={!!b.error}
                              />
                              {ds.blocks.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeBlock(day, idx)}
                                  className="text-muted-foreground hover:text-destructive h-9 w-9"
                                  aria-label="Quitar bloque"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            {b.error && <p className="text-xs text-destructive">{b.error}</p>}
                            {/* Los chips van TERCEROS, después del párrafo de error: el error tiene
                                que quedar pegado a los inputs que lo causaron y los servicios abajo
                                de todo (mismo orden que el panel). `disabled={loading}` es el
                                análogo del congelado del panel: un chip tocado con el submit en
                                vuelo no llegaría a la base y se perdería sin ruido. */}
                            {showServicesToggle && perFranja && (
                              <BlockServicesLine
                                serviceIds={franjaServiceIdsVigentes(b.service_ids, chipCatalogIds)}
                                catalog={chipCatalog}
                                groupLabel={`Servicios de la franja de ${b.start_time} a ${b.end_time}`}
                                expanded={expandedChips.has(`${day}-${idx}`)}
                                disabled={loading}
                                onToggleExpanded={() => toggleChipsExpanded(day, idx)}
                                onToggleService={serviceId => toggleBlockService(day, idx, serviceId)}
                              />
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addBlock(day)}
                          className="gap-1.5 text-xs text-muted-foreground h-8 mx-auto sm:mx-0 flex"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agregar bloque
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm mt-1.5 text-center sm:text-left">Cerrado</span>
                    )}
                  </div>
                ))}
              </div>

              {/* El aviso de D-07, al pie del paso y después de la grilla: se lee cuando el dueño
                  terminó de mapear, no mientras arrastra el primer chip.

                  SIEMPRE MONTADO, y lo único que cambia es su texto. Es el mismo motivo que ya está
                  escrito en `components/agenda/block-services-line.tsx`: una región viva (status)
                  que se monta JUNTO con su contenido no la locuta ningún lector de pantalla —el nodo
                  aparece ya con el texto adentro y no hay cambio que anunciar—. Cuando no hay nada
                  que avisar el contenido es cadena vacía, así que no ocupa alto ni deja hueco.

                  Tratamiento NEUTRO a propósito: `text-muted-foreground`, sin color de error, sin
                  `aria-invalid` y sin ícono de alerta. No es un campo mal llenado: es información
                  sobre lo que un cliente va a ver. Y no es un `toast` porque tiene que quedar en
                  pantalla mientras el dueño ajusta los chips, que es justo lo que un toast no hace. */}
              <p role="status" className="text-xs text-muted-foreground">{avisoSinCobertura}</p>
            </div>
          )}

          {/* Navigation — la detección de "último paso" y el avance/retroceso se guían por la POSICIÓN
              dentro de visibleSteps (no por el literal 4), para saltar limpio el paso oculto en canchas
              (Servicios n=2 → Horarios n=4). Cluster: Atrás — [ Omitir por ahora ] [ Siguiente ];
              en el último paso solo la CTA Finalizar. */}
          <div className="flex justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="ghost"
              onClick={() => setStep(visibleSteps[currentIndex - 1].n)}
              disabled={currentIndex === 0}
            >
              Atrás
            </Button>
            {!isLastStep ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Omitir por ahora (D-01/D-04): visible SOLO en pasos opcionales intermedios
                    (currentIndex > 0 = no en Negocio; !isLastStep = no en el último, ahí va Finalizar).
                    variant="ghost" → menor énfasis, nunca accent (el accent queda para la única CTA
                    forward). Avanza a la posición siguiente SIN correr canGoNext ni validar: skip
                    granular por paso, no salto al final. No persiste nada (handleFinish ya filtra
                    vacíos, D-05). Siempre habilitado en pasos opcionales. */}
                {currentIndex > 0 && (
                  <Button
                    variant="ghost"
                    onClick={() => setStep(visibleSteps[currentIndex + 1].n)}
                    className="text-muted-foreground/70"
                  >
                    Omitir por ahora
                  </Button>
                )}
                <Button
                  onClick={() => setStep(visibleSteps[currentIndex + 1].n)}
                  disabled={!canGoNext()}
                >
                  Siguiente
                </Button>
              </div>
            ) : (
              <Button onClick={handleFinish} disabled={loading}>
                {loading ? 'Guardando...' : 'Finalizar y entrar al dashboard'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
