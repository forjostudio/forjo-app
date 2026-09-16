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

import { useId, useState } from 'react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Business, Service, ServiceCategory } from '@/lib/types'
import {
  renumber,
  moveWithinList,
  categoryCountLabel,
  serviceCountLabel,
  classifyCategoryWriteError,
  CATEGORY_WRITE_REJECT_COPY,
  ORDER_REJECT_COPY,
} from '@/lib/catalog-panel'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, GripVertical, Plus, Tags } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  business: Business
  supabase: SupabaseClient
  services: Service[]
  categories: ServiceCategory[]
  setCategories: React.Dispatch<React.SetStateAction<ServiceCategory[]>>
}

export function CategoriasManager({ business, supabase, services, categories, setCategories }: Props) {
  // D-02: arranca colapsada con cero categorías (el estado de TODOS los negocios de producción el día
  // del deploy: /servicios no crece de alto) y abierta con al menos una. Sin localStorage a propósito.
  const [open, setOpen] = useState(categories.length > 0)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [announce, setAnnounce] = useState('')

  const bodyId = useId()
  const errorId = useId()

  // D-12: los controles de orden de las categorías sólo existen con el modo personalizado. El modo
  // es opcional en el tipo (una lectura angosta puede no traerlo): ausente vale el default de la base.
  const categoryCustom = (business.category_sort_mode ?? 'custom') === 'custom'

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
    const ids = categories.map(c => c.id)
    const destino = index + delta
    if (destino < 0 || destino >= ids.length) return
    const nuevos = moveWithinList(ids, index, destino)
    setAnnounce(`“${categories[index].name}” movida a la posición ${destino + 1} de ${ids.length}`)
    void persistCategoryOrder(nuevos)
  }

  return (
    <Card className="p-6 space-y-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(o => !o)}
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
              {categories.map((c, i) => {
                const isFirst = i === 0
                const isLast = i === categories.length - 1
                const count = services.filter(s => s.category_id === c.id).length
                return (
                  <li key={c.id} className="rounded-md border border-border bg-secondary/50 flex flex-col gap-2 p-2 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-2">
                    {/* Línea 1 (mobile) / columnas 1-2 (desktop): grip + nombre. */}
                    <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
                      {categoryCustom && (
                        <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />
                      )}
                      <span className="min-w-0 text-sm font-medium text-foreground break-words sm:truncate">{c.name}</span>
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
                    </div>
                  </li>
                )
              })}
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
  )
}
