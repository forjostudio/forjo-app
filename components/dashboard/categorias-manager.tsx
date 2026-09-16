'use client'

// components/dashboard/categorias-manager.tsx — el organizador del catálogo (Phase 23, D-01).
//
// DÓNDE SE MONTA: /servicios (view='servicios'), dentro del `TabsContent value="services"` de
// SettingsClient, en la rama `!isCanchas`, como primer hijo y arriba de la Card de servicios.
//
// QUÉ CONSUME: `business` (el id para acotar por tenant y los dos modos de orden), `supabase` POR
// PROP —para que padre e hijo compartan la sesión, nunca `createClient()` acá adentro—, `services`
// (para contar) y el par `categories` + `setCategories` compartido con el padre (molde
// `canchas-manager.tsx`). Toda escritura va por el browser client + RLS y lleva además
// `.eq('business_id', business.id)`: defensa en profundidad, no una sola capa.
//
// QUIÉN QUEDA AFUERA A PROPÓSITO: el vertical canchas. Ahí el CRUD genérico de services no existe
// (lo reemplaza CanchasManager), la página pública es otra (`canchas-booking-client.tsx`) y el
// manager de canchas tiene un leak guard que un selector de categoría de servicio contradiría. El
// gate ya existe en el padre: este componente vive dentro del `else` del ternario `isCanchas`.
//
// QUÉ NO HACE: agrupar ni ordenar el catálogo. Eso lo resuelve `groupCatalog()` de
// `@/lib/service-categories`; si el panel ordenara por su cuenta, el dueño vería un orden y el
// cliente otro. Las posiciones, la columna de categoría y la copy de los rechazos salen de
// `@/lib/catalog-panel`.

import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Business, Service, ServiceCategory } from '@/lib/types'
import {
  SIN_CATEGORIA,
  categoryPatch,
  fromCategoryId,
  mapCategoryWriteError,
  moveRejectCopy,
  renumber,
  moveWithinList,
  categoryCountLabel,
  serviceCountLabel,
  classifyCategoryWriteError,
  CATEGORY_WRITE_REJECT_COPY,
  ORDER_REJECT_COPY,
} from '@/lib/catalog-panel'
import { groupCatalog, sortCategories, type CategorySortMode, type ServiceSortMode } from '@/lib/service-categories'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { Check, ChevronDown, ChevronUp, GripVertical, Plus, Tags, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  business: Business
  supabase: SupabaseClient
  // Par valor + setter compartido con SettingsClient (molde canchas-manager): asignar una categoría
  // mergea al estado del padre, así la lista de servicios de abajo y los chips de acá no divergen.
  services: Service[]
  setServices: React.Dispatch<React.SetStateAction<Service[]>>
  categories: ServiceCategory[]
  setCategories: React.Dispatch<React.SetStateAction<ServiceCategory[]>>
  // Los dos modos de orden (plan 23-04) viven en el PADRE y bajan por acá: el selector de servicios
  // está en SettingsClient y el de categorías acá, y los dos gatean cosas de este componente. Una
  // sola vía para el valor efectivo, así ninguno lee `business` por su cuenta y quedan desincronizados
  // hasta el próximo reload.
  categorySortMode: CategorySortMode
  setCategorySortMode: React.Dispatch<React.SetStateAction<CategorySortMode>>
  serviceSortMode: ServiceSortMode
}

// Etiquetas literales del Copywriting Contract. El disparador del Select las necesita en forma de
// render-prop: Base UI muestra por defecto el valor CRUDO (diría `custom`).
const CATEGORY_MODE_LABELS: Record<CategorySortMode, string> = {
  custom: 'Como las ordené yo',
  alpha: 'Alfabético (A-Z)',
}

// El fallo de guardar un modo: copy propia del contrato, nunca el texto de la base.
const SORT_MODE_REJECT_COPY = 'No se pudo guardar el orden. Probá de nuevo.'

// Un chip de servicio. Vive a nivel de MÓDULO y no dentro del componente: una función-componente
// declarada adentro cambia de identidad en cada render, React remonta el subárbol y el arrastre del
// plan 23-03 se cortaría a mitad de gesto.
//
// UN SOLO CONTROL POR CHIP, no tres (desviación declarada de la lectura literal de D-08): tres botones
// inline de 44px (▲ ▼ mover) son 132px más el nombre, o sea un chip por fila a 375px, que destruye los
// chips compactos que eligió D-06. El diálogo "Mover …" contiene categoría y posición, así que el
// mecanismo sigue disponible con teclado y en mobile, que es lo que exigen CAT-03 y D-08.
// El nombre NUNCA se trunca: `whitespace-nowrap` + el `flex-wrap` del contenedor hacen que un nombre
// largo ocupe su fila entera; un nombre cortado volvería ambiguo cuál servicio estás por mover.
//
// ARRASTRE (plan 23-03): el chip es a la vez ORIGEN (sólo con el modo de servicios personalizado) y
// DESTINO (soltar un chip sobre otro chip toma la categoría de ese chip). Lo que desaparece sin el modo
// personalizado es el atajo —grip y `draggable`—, nunca la acción: el botón sigue abriendo "Mover …".
function ServiceChip({ service, onMove, canDrag, dragging, onDragStart, onDragEnd, onDropOnChip }: {
  service: Service
  onMove: (s: Service) => void
  canDrag: boolean
  dragging: boolean
  onDragStart: (serviceId: string) => void
  onDragEnd: () => void
  // Devuelve si el drop era de un chip y lo resolvió: sólo entonces se corta la propagación, así un
  // arrastre de FILA que se suelta encima de un chip sigue llegando a su fila.
  onDropOnChip: (target: Service) => boolean
}) {
  return (
    <li>
      <button
        type="button"
        aria-label={`Mover “${service.name}”`}
        onClick={() => onMove(service)}
        draggable={canDrag}
        onDragStart={e => {
          // Sin esto el dragstart burbujea a la fila (que también es arrastrable) y arrancarían dos
          // gestos a la vez.
          e.stopPropagation()
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', service.id)
          onDragStart(service.id)
        }}
        onDragEnd={e => { e.stopPropagation(); onDragEnd() }}
        onDragOver={e => {
          // Obligatorio: sin preventDefault el navegador rechaza el drop en silencio. NO se corta la
          // propagación: la fila de abajo sigue marcándose como zona de drop mientras se está encima.
          e.preventDefault()
        }}
        onDrop={e => {
          e.preventDefault()
          if (onDropOnChip(service)) e.stopPropagation()
        }}
        className={cn(
          'inline-flex min-h-11 items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          canDrag && 'cursor-grab active:cursor-grabbing',
        )}
      >
        {/* Siendo arrastrado: borde punteado + cursor de agarre. Sin transparencia (baja el contraste). */}
        <span className={cn(
          'inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground whitespace-nowrap',
          dragging && 'border-dashed cursor-grabbing',
        )}>
          {canDrag && <GripVertical aria-hidden="true" className="size-3 text-muted-foreground/60" />}
          {service.name}
        </span>
      </button>
    </li>
  )
}

export function CategoriasManager({ business, supabase, services, setServices, categories, setCategories, categorySortMode, setCategorySortMode, serviceSortMode }: Props) {
  // D-02: arranca colapsada con cero categorías (el estado de TODOS los negocios de producción el día
  // del deploy: /servicios no crece de alto) y abierta con al menos una. Sin localStorage a propósito.
  const [open, setOpen] = useState(categories.length > 0)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [announce, setAnnounce] = useState('')

  // Diálogo "Mover …": UNO SOLO para toda la Card (evita N portales montados en una lista densa).
  // `draft` es el valor del control SIN traducir (un uuid o el sentinel): la traducción a la columna
  // la hace `categoryPatch` adentro del escritor.
  const [moving, setMoving] = useState<Service | null>(null)
  const [draft, setDraft] = useState<string>(SIN_CATEGORIA)
  const [savingMove, setSavingMove] = useState(false)

  // Renombrado in situ: UNA fila a la vez. `renameError` es el slot inline DE ESA FILA (no del alta).
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  // Escape y Enter ya resolvieron la edición: el blur que puede venir detrás (al desmontarse el campo)
  // no tiene que volver a guardar. Es un ref y no estado porque el blur llega antes del re-render.
  const skipRenameBlurRef = useRef(false)

  // Arrastre nativo (atajo de desktop; en touch no existe y para eso están las flechas y el diálogo).
  // Los ids viajan por ESTADO: el dato del navegador devuelve cadena vacía mientras se está encima
  // (modo protegido del spec) y sólo es legible al soltar.
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null)
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null)
  const [draggingServiceId, setDraggingServiceId] = useState<string | null>(null)
  // La fila resaltada como zona de drop de un chip: el id de la categoría o SIN_CATEGORIA.
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  // Guardado del modo de orden de las categorías: el Select queda deshabilitado mientras vuela.
  const [savingCategoryMode, setSavingCategoryMode] = useState(false)

  // Borrado: UN diálogo de confirmación para toda la Card, hermano de la Card (molde canchas-manager).
  const [deleting, setDeleting] = useState<ServiceCategory | null>(null)

  const bodyId = useId()
  const errorId = useId()
  const renameErrorId = useId()
  const categoryLabelId = useId()
  const categoryModeId = useId()

  // La regla de agrupar vive en groupCatalog (no se reimplementa acá). Los dos modos pueden llegar
  // `undefined` y la función ya lo cubre campo por campo. En el camino de la identidad (ninguna
  // categoría con servicios) devuelve un único grupo con `categoryId` nulo: son todos sueltos.
  // Los modos salen del estado del PADRE (plan 23-04), no de `business`: así un cambio de modo se ve
  // al instante acá y en la lista de servicios, sin esperar un reload.
  const groups = groupCatalog(services, categories, { categories: categorySortMode, services: serviceSortMode })
  const serviciosPorCategoria = new Map(groups.flatMap(g => (g.categoryId ? [[g.categoryId, g.services] as const] : [])))
  const sueltos = groups.find(g => g.categoryId === null)?.services ?? []

  // Las FILAS se pintan con la misma regla del eje categorías que usa groupCatalog, pero incluyendo
  // las vacías (que groupCatalog omite). Con "Alfabético (A-Z)" la lista se reordena sin que el panel
  // ordene por su cuenta y sin tocar el `sort_order` guardado. Decisión del usuario del 2026-09-16.
  const categoriasOrdenadas = sortCategories(categories, categorySortMode)

  // D-12: los controles de orden de las categorías sólo existen con el modo personalizado.
  const categoryCustom = categorySortMode === 'custom'
  // Mismo criterio para el eje de los servicios: sin modo personalizado el chip pierde el atajo.
  const serviceCustom = serviceSortMode === 'custom'

  // ── Alta ────────────────────────────────────────────────────────────────────
  async function createCategory() {
    // El guard vive acá además del botón deshabilitado: el botón es la señal, esto es la defensa.
    if (creating) return
    // trim al guardar, no en el onChange: recortar mientras se escribe se come el espacio entre palabras.
    const name = newName.trim()
    if (!name) { setNameError(CATEGORY_WRITE_REJECT_COPY.blank); return }
    setCreating(true)
    try {
      const { data, error } = await supabase.from('service_categories').insert({ business_id: business.id, name, sort_order: categories.length }).select().single()
      if (error) {
        const reason = classifyCategoryWriteError(error)
        // Se registra el CÓDIGO, jamás el texto: el mensaje de Postgres trae el nombre del constraint.
        console.error('[catalogo/alta-categoria] rechazo:', reason, error.code)
        if (reason === 'unknown') toast.error(CATEGORY_WRITE_REJECT_COPY.unknown)
        else setNameError(CATEGORY_WRITE_REJECT_COPY[reason])
        // El estado local NO se toca: lo que el dueño ve sigue siendo lo que está guardado.
        return
      }
      setCategories(prev => [...prev, data as ServiceCategory])
      setNewName('')
      setNameError(null)
      toast.success('Categoría creada')
    } finally {
      setCreating(false)
    }
  }

  // ── Renombrar ───────────────────────────────────────────────────────────────
  function startRename(c: ServiceCategory) {
    skipRenameBlurRef.current = false
    setRenameDraft(c.name)
    setRenameError(null)
    setRenamingId(c.id)
  }

  function cancelRename() {
    skipRenameBlurRef.current = true
    setRenamingId(null)
    setRenameError(null)
  }

  // Enter, blur: los dos guardan por acá. El campo en blanco y el nombre repetido los garantiza LA
  // BASE (CHECK de no-blanco + índice normalizado de la migr. 079); el chequeo de acá es UX y el
  // cliente sólo traduce el código.
  async function saveRename(c: ServiceCategory) {
    if (renaming) return
    // trim al guardar, igual que la base normaliza los blancos de borde: no mientras se escribe.
    const name = renameDraft.trim()
    // Sin cambios = no-op: se cierra sin escribir nada.
    if (name === c.name) { setRenamingId(cur => (cur === c.id ? null : cur)); setRenameError(null); return }
    if (!name) { skipRenameBlurRef.current = false; setRenameError(CATEGORY_WRITE_REJECT_COPY.blank); return }
    setRenaming(true)
    try {
      const { data, error } = await supabase.from('service_categories').update({ name }).eq('id', c.id).eq('business_id', business.id).select('id')
      if (error) {
        const reason = classifyCategoryWriteError(error)
        // El código, jamás el texto: el mensaje de Postgres trae el nombre del constraint.
        console.error('[catalogo/renombrar-categoria] rechazo:', reason, error.code)
        if (reason === 'unknown') toast.error(CATEGORY_WRITE_REJECT_COPY.unknown)
        else setRenameError(CATEGORY_WRITE_REJECT_COPY[reason])
        // El estado local NO se toca: el campo sigue abierto con lo que escribió el dueño.
        skipRenameBlurRef.current = false
        return
      }
      // Un update que la RLS filtró vuelve SIN error y con CERO filas: eso no es un éxito.
      if (!data || data.length === 0) {
        console.error('[catalogo/renombrar-categoria] rechazo:', 'sin_filas')
        toast.error(CATEGORY_WRITE_REJECT_COPY.unknown)
        skipRenameBlurRef.current = false
        return
      }
      setCategories(prev => prev.map(x => (x.id === c.id ? { ...x, name } : x)))
      setRenamingId(cur => (cur === c.id ? null : cur))
      setRenameError(null)
    } finally {
      setRenaming(false)
    }
  }

  // ── Borrar ──────────────────────────────────────────────────────────────────
  // Lo que NO se pierde lo garantiza la base: la FK compuesta de la migr. 078 termina en
  // `ON DELETE SET NULL (category_id)`, o sea deja la referencia nula SIN tocar el negocio del
  // servicio, que sigue activo y reservable. Esta acción escribe, espeja en memoria y retorna: NO
  // navega (una redirección de servidor dentro de una acción del ConfirmDialog tira un toast espurio).
  async function deleteCategory(c: ServiceCategory) {
    const { data, error } = await supabase.from('service_categories').delete().eq('id', c.id).eq('business_id', business.id).select('id')
    // Un delete que la RLS filtró vuelve SIN error y con CERO filas: eso no es un éxito.
    if (error || !data || data.length === 0) {
      console.error('[catalogo/borrar-categoria] rechazo:', error?.code ?? 'sin_filas')
      // Se tira para que el diálogo quede abierto; el aviso lo da `onConfirmError` con copy propia.
      // La fila SIGUE en la lista: nada se sacó antes del await.
      throw new Error('borrar-categoria')
    }
    setCategories(prev => prev.filter(x => x.id !== c.id))
    // Espejo de lo que la base acaba de hacer, para que los chips salten a "Sin categoría" sin
    // recargar. El valor sale de categoryPatch (D-07): nunca otra traducción de "sin categoría".
    setServices(prev => prev.map(s => (s.category_id === c.id ? { ...s, ...categoryPatch(SIN_CATEGORIA) } : s)))
    setRenamingId(cur => (cur === c.id ? null : cur))
  }

  // La descripción se arma ANTES del render del diálogo, con el conteo que ya está en memoria: cero
  // consultas de pre-chequeo, y por eso el diálogo no tiene estado de carga ni de error propio.
  const deletingCount = deleting ? services.filter(s => s.category_id === deleting.id).length : 0
  const deleteDescription = !deleting
    ? undefined
    : deletingCount === 0
      ? `Vas a eliminar “${deleting.name}”. No tiene ningún servicio asignado.`
      : deletingCount === 1
        ? `Vas a eliminar “${deleting.name}”. Su servicio queda sin categoría: sigue activo y se puede reservar igual. Después lo podés asignar a otra.`
        : `Vas a eliminar “${deleting.name}”. Sus ${deletingCount} servicios quedan sin categoría: siguen activos y se pueden reservar igual. Después los podés asignar a otra.`

  // ── Orden ───────────────────────────────────────────────────────────────────
  // EL ÚNICO mutador del orden de las categorías (D-09 con la resolución de D-1, opción B): una
  // sentencia por fila que escribe SOLO la columna de orden, sobre la lista COMPLETA de hermanas
  // renumerada desde 0. Cero migraciones: no hay RPC transaccional, así que la atomicidad perdida la
  // reemplaza D-10.2 — ante cualquier fallo se relee la base y se pinta ESO, no el optimista.
  // Ningún dato del dueño (name) viaja en el reorden: un cliente con un nombre viejo en memoria no
  // puede pisar un renombrado para tocar el orden.
  async function persistCategoryOrder(idsEnOrden: string[]) {
    if (savingOrder) return
    const antes = categories
    const porId = new Map(antes.map(c => [c.id, c]))
    // Optimista: se pinta el orden nuevo ya, reasignando la posición de cada fila.
    setCategories(renumber(idsEnOrden).flatMap(({ id, sort_order }) => {
      const c = porId.get(id)
      return c ? [{ ...c, sort_order }] : []
    }))
    setSavingOrder(true)
    try {
      const resultados = await Promise.all(renumber(idsEnOrden).map(({ id, sort_order }) =>
        supabase.from('service_categories').update({ sort_order }).eq('id', id).eq('business_id', business.id).select('id'),
      ))
      // Un update que la RLS filtró vuelve SIN error y con CERO filas: eso no es un éxito (molde
      // `deleteService` de settings-client).
      const fallo = resultados.find(r => r.error || !r.data || r.data.length === 0)
      if (!fallo) return
      console.error('[catalogo/orden-categorias] rechazo:', fallo.error?.code ?? 'sin_filas')
      // D-10.2, no opcional: re-leer las filas reales y pintar ESO.
      const { data: reales, error: releerError } = await supabase.from('service_categories').select('*').eq('business_id', business.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      if (releerError || !reales) {
        // Sin lectura no hay verdad que pintar: se vuelve a lo que había antes del gesto, que era
        // lo último que la base confirmó.
        console.error('[catalogo/orden-categorias] relectura:', releerError?.code ?? 'sin_datos')
        setCategories(antes)
      } else {
        setCategories(reales as ServiceCategory[])
      }
      toast.error(ORDER_REJECT_COPY)
    } finally {
      setSavingOrder(false)
    }
  }

  // Flechas: nunca intercambia con la vecina. Arma la lista entera, la mueve con la regla compartida
  // y manda la lista completa renumerada (un swap deja huecos y empates, y con dos filas empatadas
  // el orden lo decide la lectura, que cambia entre reloads).
  function moveCategory(index: number, delta: -1 | 1) {
    const destino = index + delta
    if (destino < 0 || destino >= categoriasOrdenadas.length) return
    reorderCategory(index, destino)
  }

  // La regla ÚNICA de reorden que comparten las flechas y el arrastre: sacar de `from`, insertar en
  // `to` y mandar la lista completa al único mutador, que la renumera. Dos disparadores, una regla.
  // Los índices son los de la lista PINTADA: con el modo personalizado (el único en el que existen
  // flechas y arrastre) es el orden de `sort_order`, que es justo lo que se renumera.
  function reorderCategory(from: number, to: number) {
    const ids = categoriasOrdenadas.map(c => c.id)
    if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return
    const nuevos = moveWithinList(ids, from, to)
    setAnnounce(`“${categoriasOrdenadas[from].name}” movida a la posición ${to + 1} de ${ids.length}`)
    void persistCategoryOrder(nuevos)
  }

  // ── Arrastre ────────────────────────────────────────────────────────────────
  // Se llama en el fin del gesto, en cada drop (ANTES de cualquier await) y al colapsar la Card: si la
  // Card se colapsa a mitad de un gesto el nodo se desmonta, su dragend nunca corre y la fila quedaría
  // con el borde punteado para siempre.
  function resetDrag() {
    setDraggingCategoryId(null)
    setDragOverCategoryId(null)
    setDraggingServiceId(null)
    setDropTargetId(null)
  }

  // Soltar una FILA sobre la fila de índice `targetIndex`: se inserta en ese índice.
  function dropCategoryOn(targetIndex: number) {
    const fromId = draggingCategoryId
    resetDrag()
    if (!fromId || !categoryCustom) return
    const from = categoriasOrdenadas.findIndex(c => c.id === fromId)
    // No-op si el destino es el origen.
    if (from < 0 || from === targetIndex) return
    reorderCategory(from, targetIndex)
  }

  // Soltar un CHIP sobre un destino cuyo valor es el id de una categoría o SIN_CATEGORIA. La escritura
  // la hace assignServiceCategory, la MISMA que usa el diálogo (D-07), con el valor tal cual: la
  // traducción a la columna es de categoryPatch y el aviso ante rechazo es de esa función, así que acá
  // no se repite. Si falla, el chip queda en su grupo original porque el padre sólo se mergea en éxito.
  function dropServiceOn(value: string): boolean {
    const serviceId = draggingServiceId
    if (!serviceId) return false
    resetDrag()
    const service = services.find(s => s.id === serviceId)
    if (!service || assigning) return true
    // No-op si el servicio ya está en ese destino.
    if (fromCategoryId(service.category_id) === value) return true
    setAssigning(true)
    void assignServiceCategory(service, value).finally(() => setAssigning(false))
    return true
  }

  // Soltar un chip sobre OTRO chip: toma la categoría de ese chip. La parte de posición dentro del
  // grupo la entrega el plan 23-04 junto con el modo de orden de servicios que la gatea.
  function dropServiceOnChip(target: Service): boolean {
    if (!draggingServiceId) return false
    return dropServiceOn(fromCategoryId(target.category_id))
  }

  // onDragLeave con la guarda de `contains`: pasar por encima de un hijo de la fila dispara un
  // dragleave de la fila, y sin la guarda el resaltado se apaga y parpadea.
  function leaveRow(e: React.DragEvent<HTMLElement>, rowId: string) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragOverCategoryId(cur => (cur === rowId ? null : cur))
    setDropTargetId(cur => (cur === rowId ? null : cur))
  }

  // ── Modo de orden de las categorías ─────────────────────────────────────────
  // ⚠ D-11, el límite irreversible de la fase: cambiar de modo escribe UNA SOLA columna del negocio y
  // NADA MÁS. El orden manual del dueño no se toca acá, ni antes ni después: el modo es un
  // COMPARADOR que eligen groupCatalog/sortCategories, no un orden que se materializa. Persistirlo
  // destruiría el arreglo del dueño sin forma de recuperarlo (CAT-06).
  // Éxito sin toast: el resultado se ve (los controles de reorden aparecen o desaparecen).
  async function saveCategorySortMode(value: string | null) {
    if (savingCategoryMode) return
    if (value !== 'custom' && value !== 'alpha') return
    if (value === categorySortMode) return
    const anterior = categorySortMode
    // Cambiar de modo desmonta las filas arrastrables y su dragend nunca corre: se limpia acá.
    resetDrag()
    setCategorySortMode(value)
    setSavingCategoryMode(true)
    try {
      const { data, error } = await supabase.from('businesses').update({ category_sort_mode: value }).eq('id', business.id).select('id')
      // Un update que la RLS filtró vuelve sin error y con CERO filas: el modo NO se guardó.
      if (error || !data || data.length === 0) {
        console.error('[catalogo/modo-categorias] rechazo:', error?.code ?? 'sin_filas')
        // Nunca queda mostrando un modo que no se guardó.
        setCategorySortMode(anterior)
        toast.error(SORT_MODE_REJECT_COPY)
      }
    } finally {
      setSavingCategoryMode(false)
    }
  }

  // ── Asignar categoría ───────────────────────────────────────────────────────
  // EL ÚNICO update suelto de la columna de categoría de un servicio en todo el código (D-07,
  // restricción dura, reversibilidad costosa). Lo usan el diálogo "Mover …" (plan 23-01) y el
  // arrastre de chips (plan 23-03).
  //
  // Las TRES superficies que escriben la columna convergen en dos funciones de `@/lib/catalog-panel`:
  // `categoryPatch` produce todo valor escrito y `mapCategoryWriteError` traduce todo rechazo. El alta
  // y la edición del form (plan 23-02) NO llaman a esta función a propósito: esparcen `categoryPatch`
  // dentro de su ÚNICA sentencia, porque partir un "Guardar" en dos escrituras abre una ventana de
  // fallo parcial —el servicio guardado y su categoría no— que viola D-10.2, y en el alta ni siquiera
  // hay id contra el cual hacer el segundo update. Es una interpretación de D-07 APROBADA POR EL
  // USUARIO el 2026-09-16, no un atajo.
  //
  // La pertenencia al tenant de la categoría la garantiza la base de forma DECLARATIVA: la FK
  // compuesta `services_category_same_tenant` rechaza con 23503 una categoría de otro negocio (y
  // `mapCategoryWriteError` le pone copy propia). El `.eq('business_id', …)` es la segunda capa.
  //
  // El aviso vive ACÁ y no en los call sites: el diálogo y el arrastre sólo miran el booleano, así no
  // pueden divergir en qué le dicen al dueño.
  async function assignServiceCategory(service: Service, value: string): Promise<boolean> {
    const { data, error } = await supabase.from('services').update(categoryPatch(value)).eq('id', service.id).eq('business_id', business.id).select('id')
    if (error) {
      // El código, jamás el texto: el mensaje de Postgres trae el nombre del constraint.
      console.error('[catalogo/asignar] rechazo:', error.code)
      toast.error(mapCategoryWriteError(error.code) ?? moveRejectCopy(service.name))
      return false
    }
    // Un update que la RLS filtró vuelve sin error y con CERO filas: eso no es un éxito.
    if (!data || data.length === 0) {
      toast.error(moveRejectCopy(service.name))
      return false
    }
    // El espejo en memoria también sale de categoryPatch, nunca de una clave escrita a mano.
    setServices(prev => prev.map(s => (s.id === service.id ? { ...s, ...categoryPatch(value) } : s)))
    return true
  }

  function openMove(service: Service) {
    setDraft(fromCategoryId(service.category_id))
    setMoving(service)
  }

  // Se aplica al CONFIRMAR, no en cada toque: una sola escritura, una sola ventana de fallo. Si el
  // borrador no cambió no se escribe nada. Si falla, el aviso ya lo dio el escritor y el chip sigue en
  // su grupo original (el estado del padre sólo se mergea en éxito), así que alcanza con cerrar.
  async function confirmMove() {
    if (!moving || savingMove) return
    const target = moving
    if (draft === fromCategoryId(target.category_id)) { setMoving(null); return }
    setSavingMove(true)
    try {
      await assignServiceCategory(target, draft)
    } finally {
      setSavingMove(false)
      setMoving(null)
    }
  }

  // Opciones del diálogo: una por categoría y "Sin categoría" SIEMPRE última y siempre presente
  // (CAT-02: asignar nunca es obligatorio).
  const moveOptions = [
    ...categories.map(c => ({ value: c.id, label: c.name, loose: false })),
    { value: SIN_CATEGORIA, label: 'Sin categoría', loose: true },
  ]

  return (
    <>
    <Card className="p-6 space-y-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => { setOpen(o => !o); resetDrag() }}
        className="flex w-full min-h-11 items-center gap-2 text-left"
      >
        <Tags aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Categorías del catálogo</span>
        <span className="ml-auto rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">
          {categoryCountLabel(categories.length)}
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div id={bodyId} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Agrupá tus servicios bajo títulos. El orden que armes acá es el que ve tu cliente en la página de reservas.
          </p>

          {/* Selector del orden de las categorías: donde se arrastra. Sin categorías no se renderiza:
              no hay nada que ordenar. */}
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={categoryModeId} className="text-xs text-muted-foreground">Orden de las categorías</Label>
              <Select value={categorySortMode} onValueChange={v => void saveCategorySortMode(v)} disabled={savingCategoryMode}>
                <SelectTrigger id={categoryModeId} className="w-auto min-w-40">
                  <SelectValue>{(v: string | null) => CATEGORY_MODE_LABELS[v === 'alpha' ? 'alpha' : 'custom']}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">{CATEGORY_MODE_LABELS.custom}</SelectItem>
                  <SelectItem value="alpha">{CATEGORY_MODE_LABELS.alpha}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <Tags aria-hidden="true" className="size-5 text-muted-foreground/60" />
              <p className="text-sm font-medium">Todavía no tenés categorías</p>
              <p className="max-w-prose text-xs text-muted-foreground">
                Agrupá tus servicios bajo títulos —“Color”, “Uñas”, “Barbería”— para que tu página de reservas se lea de un vistazo. Sin categorías, tus servicios se muestran como hasta ahora.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {categoriasOrdenadas.map((c, i) => {
                const isFirst = i === 0
                const isLast = i === categoriasOrdenadas.length - 1
                const suyos = serviciosPorCategoria.get(c.id) ?? []
                const count = suyos.length
                return (
                  <li
                    key={c.id}
                    // El atributo de arrastre lo lleva la fila ENTERA y las acciones quedan como botones
                    // hermanos: así ningún botón anidado "roba" el gesto. Sólo con el modo personalizado,
                    // igual que el grip y las flechas; nunca mientras se renombra esa fila (el campo
                    // necesita seleccionar texto) ni con un reorden en vuelo.
                    draggable={categoryCustom && renamingId !== c.id && !savingOrder}
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', c.id)
                      setDraggingCategoryId(c.id)
                    }}
                    onDragEnd={resetDrag}
                    onDragOver={e => {
                      e.preventDefault()
                      if (draggingCategoryId) {
                        if (draggingCategoryId !== c.id && dragOverCategoryId !== c.id) setDragOverCategoryId(c.id)
                      } else if (draggingServiceId && dropTargetId !== c.id) {
                        setDropTargetId(c.id)
                      }
                    }}
                    onDragLeave={e => leaveRow(e, c.id)}
                    onDrop={e => {
                      e.preventDefault()
                      if (draggingServiceId) { dropServiceOn(c.id); return }
                      dropCategoryOn(i)
                    }}
                    className={cn(
                      'rounded-md border border-border bg-secondary/50 flex flex-col gap-2 p-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-2',
                      categoryCustom && 'cursor-grab active:cursor-grabbing',
                      // Siendo arrastrada: borde punteado. Sin transparencia.
                      draggingCategoryId === c.id && 'border-dashed',
                      // Indicador de inserción: el borde superior que la fila YA tiene, engrosado y
                      // teñido. No es un nodo nuevo: agregar un elemento al DOM en medio del gesto
                      // corre el layout; engrosar el borde existente lo deja en 1px y se queda en la
                      // escala de bordes (px) sin inventar un alto fuera de la grilla de 4.
                      dragOverCategoryId === c.id && 'border-t-2 border-t-primary',
                      // Zona de drop de un chip: relleno + anillo, dos portadores, ninguno sólo cromático.
                      dropTargetId === c.id && 'bg-secondary ring-2 ring-ring',
                    )}
                  >
                    {/* Línea 1 (mobile) / columnas 1-2 (desktop): grip + nombre. */}
                    <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
                      {categoryCustom && (
                        <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />
                      )}
                      {renamingId === c.id ? (
                        <Input
                          autoFocus
                          value={renameDraft}
                          readOnly={renaming}
                          onFocus={e => e.currentTarget.select()}
                          onChange={e => { setRenameDraft(e.target.value); if (renameError) setRenameError(null) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); skipRenameBlurRef.current = true; void saveRename(c) }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
                          }}
                          onBlur={() => {
                            if (skipRenameBlurRef.current) { skipRenameBlurRef.current = false; return }
                            void saveRename(c)
                          }}
                          aria-label={`Nombre de “${c.name}”`}
                          aria-invalid={renameError ? true : undefined}
                          aria-describedby={renameError ? renameErrorId : undefined}
                          className="h-8 text-sm"
                        />
                      ) : (
                        <button
                          type="button"
                          aria-label={`Renombrar “${c.name}”`}
                          disabled={renaming}
                          onClick={() => startRename(c)}
                          className="min-h-11 min-w-0 rounded-sm text-left text-sm font-medium text-foreground break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 sm:truncate"
                        >
                          {c.name}
                        </button>
                      )}
                    </div>
                    {/* Línea 2 (mobile) / columna 3 (desktop): conteo + acciones, a la derecha. */}
                    <div className="flex items-center justify-end gap-2">
                      <span className="mr-auto text-xs text-muted-foreground sm:mr-0">{serviceCountLabel(count)}</span>
                      {categoryCustom && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 sm:h-8 sm:w-8"
                            disabled={isFirst || savingOrder}
                            aria-disabled={isFirst || savingOrder}
                            aria-label={`Subir “${c.name}”`}
                            onClick={() => moveCategory(i, -1)}
                          >
                            <ChevronUp className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 sm:h-8 sm:w-8"
                            disabled={isLast || savingOrder}
                            aria-disabled={isLast || savingOrder}
                            aria-label={`Bajar “${c.name}”`}
                            onClick={() => moveCategory(i, 1)}
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                        </>
                      )}
                      {/* Eliminar: SIEMPRE visible — borrar no depende del modo de orden. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-11 w-11 sm:h-8 sm:w-8"
                        aria-label={`Eliminar “${c.name}”`}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {/* Slot de error del renombrado, DE ESTA FILA. `role="status"` (polite), nunca alert. */}
                    {renamingId === c.id && renameError && (
                      <p id={renameErrorId} role="status" className="px-2 text-xs text-destructive sm:col-span-3">{renameError}</p>
                    )}
                    {/* Chips del grupo. Sin servicios no se renderiza el ul: habla el conteo de la fila. */}
                    {suyos.length > 0 && (
                      <ul className="flex flex-wrap gap-2 px-2 pb-2 sm:col-span-3" role="list">
                        {suyos.map(s => (
                          <ServiceChip
                            key={s.id}
                            service={s}
                            onMove={openMove}
                            canDrag={serviceCustom}
                            dragging={draggingServiceId === s.id}
                            onDragStart={setDraggingServiceId}
                            onDragEnd={resetDrag}
                            onDropOnChip={dropServiceOnChip}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
              {/* El grupo de los sueltos: NO es una categoría (sin grip, sin flechas, sin renombrar ni
                  eliminar) y va ÚLTIMO, siempre — espeja OTHER_GROUP_TITLE. Sólo con ≥1 categoría:
                  con cero, todos son sueltos y el grupo sería el catálogo entero duplicado, sin ningún
                  lugar a donde moverlo. */}
              {sueltos.length > 0 && (
                <li
                  // Recibe chips (soltar acá desasigna) y NADA más: no es una categoría, así que no se
                  // arrastra ni recibe filas.
                  onDragOver={e => {
                    e.preventDefault()
                    if (draggingServiceId && dropTargetId !== SIN_CATEGORIA) setDropTargetId(SIN_CATEGORIA)
                  }}
                  onDragLeave={e => leaveRow(e, SIN_CATEGORIA)}
                  onDrop={e => {
                    e.preventDefault()
                    if (!dropServiceOn(SIN_CATEGORIA)) resetDrag()
                  }}
                  className={cn(
                    'rounded-md border border-dashed border-border bg-secondary/50 flex flex-col gap-2 p-2',
                    dropTargetId === SIN_CATEGORIA && 'bg-secondary ring-2 ring-ring',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 text-sm font-medium text-foreground">Sin categoría</span>
                    <span className="ml-auto text-xs text-muted-foreground">{serviceCountLabel(sueltos.length)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Estos se reservan igual. En tu página aparecen al final, bajo “Otros”.</p>
                  <ul className="flex flex-wrap gap-2 px-2 pb-2" role="list">
                    {sueltos.map(s => (
                      <ServiceChip
                        key={s.id}
                        service={s}
                        onMove={openMove}
                        canDrag={serviceCustom}
                        dragging={draggingServiceId === s.id}
                        onDragStart={setDraggingServiceId}
                        onDragEnd={resetDrag}
                        onDropOnChip={dropServiceOnChip}
                      />
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          )}

          {/* Alta de categoría: siempre presente, es la salida del estado vacío. */}
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-sm font-medium">Agregar categoría</p>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={e => { setNewName(e.target.value); if (nameError) setNameError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void createCategory() } }}
                placeholder="Ej. Color"
                aria-label="Nombre de la categoría"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? errorId : undefined}
                className="h-11 sm:h-8"
              />
              <Button onClick={() => void createCategory()} disabled={creating || !newName.trim()} className="h-11 shrink-0 sm:h-8">
                <Plus className="size-4" />
                {creating ? 'Agregando…' : 'Agregar'}
              </Button>
            </div>
            {nameError && (
              <p id={errorId} role="status" className="text-xs text-destructive">{nameError}</p>
            )}
          </div>
        </div>
      )}

      {/* Anuncio del reorden a lectores de pantalla: SIEMPRE montado (fuera del cuerpo condicional).
          Lo que cambia es el contenido, nunca el nodo. */}
      <div aria-live="polite" className="sr-only">{announce}</div>
    </Card>

    {/* Diálogo "Mover …". Escape, click afuera y la X descartan el borrador SIN escribir: lo da el
        Dialog de @base-ui/react (portal, focus trap y Escape resueltos), no se hand-rollea. No contiene
        ningún Select a propósito — sus opciones son botones planos —, lo que lo deja fuera del bug de
        portal del Select dentro del Drawer que ya mordió en producción. La cadena de clases del
        DialogContent es copia literal de "Editar servicio": scroll interno con pie anclado, las
        cuatro piezas son solidarias. La sección "Posición" la entrega el plan 23-04. */}
    <Dialog open={!!moving} onOpenChange={o => { if (!o && !savingMove) setMoving(null) }}>
      <DialogContent className="grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-sm">
        <DialogHeader className="pb-3 pr-8">
          <DialogTitle className="break-words">{moving ? `Mover “${moving.name}”` : 'Mover'}</DialogTitle>
        </DialogHeader>
        <div className="-mx-4 min-h-0 space-y-2 overflow-y-auto overscroll-contain px-4 py-1">
          <Label id={categoryLabelId} className="text-xs text-muted-foreground">Categoría</Label>
          <div role="radiogroup" aria-labelledby={categoryLabelId} className="space-y-1">
            {moveOptions.map(opt => {
              const checked = draft === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={savingMove}
                  onClick={() => setDraft(opt.value)}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    checked && 'bg-secondary',
                    opt.loose && 'border border-dashed border-border',
                  )}
                >
                  {/* Portador NO cromático de la selección: el Check, además del relleno. */}
                  {checked ? <Check aria-hidden="true" className="size-4 shrink-0" /> : <span aria-hidden="true" className="size-4 shrink-0" />}
                  <span className="min-w-0 break-words">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={() => void confirmMove()} disabled={savingMove} className="min-h-11 w-full sm:min-h-0 sm:w-auto">{savingMove ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Confirmación de borrado: nivel simple. `risk="medio"` y NO alto a propósito: la base garantiza
        que ningún servicio se borra (ON DELETE SET NULL de la migr. 078); lo único irrecuperable es
        QUÉ servicios estaban en esa categoría, y eso es justo lo que dice la descripción. */}
    <ConfirmDialog
      open={!!deleting}
      onOpenChange={o => { if (!o) setDeleting(null) }}
      title="¿Eliminar la categoría?"
      description={deleteDescription}
      risk="medio"
      confirmLabel="Eliminar"
      destructive
      onConfirm={async () => { if (deleting) await deleteCategory(deleting) }}
      onConfirmError={() => toast.error(CATEGORY_WRITE_REJECT_COPY.unknown)}
    />
    </>
  )
}
