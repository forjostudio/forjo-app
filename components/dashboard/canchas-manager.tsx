'use client'

// components/dashboard/canchas-manager.tsx — manager de canchas para el vertical canchas (D-03).
//
// Se renderiza en /servicios (view='servicios') SOLO cuando resolveVertical(business).key === 'canchas',
// en lugar del CRUD genérico de services. Presenta la CANCHA como entidad unificada: el dueño ve/edita
// "una cancha" (nombre + precio propio + duración fija propia, D-01) y su(s) espacio(s); la tupla
// (service + professional + space + agenda_spaces) es plomería que orquesta lib/canchas.ts (Plan 01).
//
// Consume lib/canchas.ts (NO reimplementa la provisión): provisionCancha para el alta, canchasFromData
// para reconstruir la lista por service_id (NUNCA por nombre, Pitfall 2), deleteCancha para el soft-delete
// (D-05). Todo write pasa por el browser client + RLS (patrón del repo, sin server actions).
//
// LEAK GUARD (Pitfall 3): las agendas-cancha se presentan como 'Canchas' (term.resource), NUNCA como
// 'Equipo'; no se muestran campos de staff (specialty/license/phone/email) ni el service_id (puntero interno).

import { useState } from 'react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Business, Service, Professional, Space, AgendaSpace } from '@/lib/types'
import { provisionCancha, canchasFromData, deleteCancha, type Cancha } from '@/lib/canchas'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, Clock, DollarSign, Pencil, MapPin, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  business: Business
  supabase: SupabaseClient
  // Estado + setters compartidos con SettingsClient: la provisión mergea a las 4 colecciones para que
  // la reconstrucción (canchasFromData) sea consistente sin recargar la página.
  services: Service[]
  setServices: React.Dispatch<React.SetStateAction<Service[]>>
  professionals: Professional[]
  setProfessionals: React.Dispatch<React.SetStateAction<Professional[]>>
  spaces: Space[]
  setSpaces: React.Dispatch<React.SetStateAction<Space[]>>
  agendaSpaces: AgendaSpace[]
  setAgendaSpaces: React.Dispatch<React.SetStateAction<AgendaSpace[]>>
}

export function CanchasManager({
  business, supabase,
  services, setServices,
  professionals, setProfessionals,
  spaces, setSpaces,
  agendaSpaces, setAgendaSpaces,
}: Props) {
  // Lista de canchas reconstruida por service_id (puntero estable, D-06). Deriva del estado en cada render.
  const canchas = canchasFromData(services, professionals, agendaSpaces)

  // ── Alta de cancha ──────────────────────────────────────────────────────────
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState(0)
  const [newDuration, setNewDuration] = useState(60)
  // Control "compartir espacio" (D-04): por defecto vacío → provisionCancha crea un space dedicado 1:1.
  // Si el dueño marca espacios existentes, se pasan como sharedSpaceIds y NO se crea space nuevo (F11→{A,B,C}).
  const [sharedSpaceIds, setSharedSpaceIds] = useState<string[]>([])
  const [shareOpen, setShareOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  function toggleSharedSpace(id: string) {
    setSharedSpaceIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function addCancha() {
    const name = newName.trim()
    if (!name) { toast.error('Poné un nombre para la cancha'); return }
    if (!(newPrice > 0)) { toast.error('El precio debe ser mayor a 0'); return }
    if (!(newDuration > 0)) { toast.error('La duración debe ser mayor a 0'); return }
    setSaving(true)
    const res = await provisionCancha(supabase, business.id, {
      name, price: newPrice, duration: newDuration,
      sharedSpaceIds: sharedSpaceIds.length ? sharedSpaceIds : undefined,
    })
    setSaving(false)
    if (!res.ok) { toast.error('No se pudo crear la cancha. Probá de nuevo.'); return }
    // Merge del resultado al estado local (service + professional + space dedicado + agenda_spaces).
    setServices(prev => [...prev, res.service])
    setProfessionals(prev => [...prev, res.professional])
    // Si se creó un space dedicado (no compartido), sumarlo al estado; los compartidos ya existen.
    if (sharedSpaceIds.length === 0 && res.spaceIds.length === 1) {
      setSpaces(prev => [...prev, { id: res.spaceIds[0], business_id: business.id, name, created_at: new Date().toISOString() }])
    }
    setAgendaSpaces(prev => [
      ...prev,
      ...res.spaceIds.map(space_id => ({ business_id: business.id, professional_id: res.professional.id, space_id })),
    ])
    // Reset del form.
    setNewName(''); setNewPrice(0); setNewDuration(60); setSharedSpaceIds([]); setShareOpen(false)
    toast.success('Cancha creada')
  }

  // ── Edición de cancha (edita el service: nombre/precio/duración, D-01/CANCHA-02) ──────────────
  const [editCancha, setEditCancha] = useState<Cancha | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState(0)
  const [editDuration, setEditDuration] = useState(60)
  const [savingEdit, setSavingEdit] = useState(false)

  function openEdit(c: Cancha) {
    setEditCancha(c)
    setEditName(c.service.name)
    setEditPrice(Number(c.service.price))
    setEditDuration(c.service.duration_minutes)
  }

  async function saveEdit() {
    if (!editCancha) return
    const name = editName.trim()
    if (!name) { toast.error('El nombre no puede quedar vacío'); return }
    if (!(editPrice > 0)) { toast.error('El precio debe ser mayor a 0'); return }
    if (!(editDuration > 0)) { toast.error('La duración debe ser mayor a 0'); return }
    setSavingEdit(true)
    const payload = { name, price: editPrice, duration_minutes: editDuration }
    // Defensa en profundidad: filtro por business_id además de la RLS. Cada cancha conserva SU duración
    // (edita solo su propio service) → dos canchas nunca comparten duración/precio.
    const { error } = await supabase.from('services').update(payload)
      .eq('id', editCancha.service.id).eq('business_id', business.id)
    setSavingEdit(false)
    if (error) { toast.error('Error al guardar'); return }
    setServices(prev => prev.map(s => s.id === editCancha.service.id ? { ...s, ...payload } : s))
    setEditCancha(null)
    toast.success('Cancha actualizada')
  }

  // ── Borrado (soft-delete por defecto, D-05) detrás de ConfirmDialog ──────────────────────────
  const [delCancha, setDelCancha] = useState<Cancha | null>(null)

  async function confirmDelete() {
    if (!delCancha) return
    // Soft: active=false en service Y professional → la cancha sale del booking pero conserva reservas.
    const res = await deleteCancha(supabase, business.id, delCancha)
    if (!res.ok) { toast.error('No se pudo desactivar la cancha'); return }
    const svcId = delCancha.service.id
    const proId = delCancha.professional.id
    setServices(prev => prev.map(s => s.id === svcId ? { ...s, active: false } : s))
    setProfessionals(prev => prev.map(p => p.id === proId ? { ...p, active: false } : p))
    setDelCancha(null)
    toast.success('Cancha desactivada')
  }

  // Nombre del/los espacio(s) que ocupa cada cancha, para la línea de detalle de la lista.
  const spaceName = (id: string) => spaces.find(s => s.id === id)?.name ?? 'Espacio'

  return (
    <>
      <Card className="p-6 space-y-4">
        {/* Lista de canchas */}
        <div className="space-y-2">
          {canchas.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Todavía no creaste ninguna cancha. Cargá la primera abajo.
            </p>
          )}
          {canchas.map(c => (
            <div key={c.service.id} className="p-3 rounded-lg bg-secondary/50 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', !c.service.active && 'line-through text-muted-foreground')}>{c.service.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.service.duration_minutes}min · ${Number(c.service.price).toLocaleString('es-AR')}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8" onClick={() => openEdit(c)} aria-label={`Editar ${c.service.name}`}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => setDelCancha(c)} aria-label={`Eliminar ${c.service.name}`}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {c.spaceIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground mr-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> Ocupa:</span>
                  {c.spaceIds.map(id => (
                    <span key={id} className="text-[11px] font-semibold py-1 px-2 rounded bg-background text-muted-foreground border border-border">{spaceName(id)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Alta de cancha */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm font-medium">Agregar cancha</p>
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-5 space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Cancha 11, Cruzada A…" />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Duración</Label>
              <Input type="number" value={newDuration} onChange={e => setNewDuration(parseInt(e.target.value) || 0)} min={5} step={5} />
            </div>
            <div className="col-span-3 space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Precio</Label>
              <Input type="number" value={newPrice} onChange={e => setNewPrice(parseFloat(e.target.value) || 0)} min={0} step={100} />
            </div>
            <div className="col-span-1">
              <Button size="icon" onClick={addCancha} disabled={saving} className="h-9 w-9" aria-label="Agregar cancha">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Control opcional "compartir espacio" (D-04). Por defecto plegado: cada cancha nueva crea su
              espacio dedicado. Al abrirlo, el dueño marca espacios existentes para el caso F11→{A,B,C}. */}
          {spaces.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShareOpen(o => !o)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={shareOpen}
              >
                {shareOpen ? '− ' : '+ '}Compartir espacio con otras canchas (avanzado)
              </button>
              {shareOpen && (
                <div className="space-y-1.5 rounded-lg border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Si esta cancha comparte espacio físico con otras (ej. una F11 partida en cruzadas), marcá los espacios que ocupa.
                    Reservarla bloqueará a las que compartan ese espacio. Si no marcás nada, se crea un espacio dedicado.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {spaces.map(s => {
                      const on = sharedSpaceIds.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSharedSpace(s.id)}
                          aria-pressed={on}
                          className={cn(
                            'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
                            on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary',
                          )}
                        >
                          {on && <Check className="w-3.5 h-3.5" />}
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Editar cancha (nombre + duración + precio; cada cancha conserva su propia duración). */}
      <Dialog open={!!editCancha} onOpenChange={open => { if (!open) setEditCancha(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar cancha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nombre</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nombre" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Duración</Label>
                <Input type="number" value={editDuration} onChange={e => setEditDuration(parseInt(e.target.value) || 0)} min={5} step={5} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Precio</Label>
                <Input type="number" value={editPrice} onChange={e => setEditPrice(parseFloat(e.target.value) || 0)} min={0} step={100} />
              </div>
            </div>
          </div>
          <Button onClick={saveEdit} disabled={savingEdit || !editName.trim()}>{savingEdit ? 'Guardando…' : 'Guardar'}</Button>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado (soft-delete: la cancha se desactiva y conserva sus reservas). */}
      <ConfirmDialog
        open={!!delCancha}
        onOpenChange={o => { if (!o) setDelCancha(null) }}
        title="¿Desactivar cancha?"
        description={delCancha ? `Vas a desactivar "${delCancha.service.name}". Deja de aparecer en las reservas nuevas, pero conserva las reservas ya hechas.` : undefined}
        risk="alto"
        confirmLabel="Desactivar"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  )
}
