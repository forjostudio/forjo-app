'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Client, Appointment } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Search, Phone, Mail } from 'lucide-react'

interface Props {
  initialClients: Client[]
  appointments: Appointment[]
  businessId: string
}

export function ClientsClient({ initialClients, appointments, businessId }: Props) {
  const supabase = createClient()
  const [clients, setClients] = useState(initialClients)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Client | null>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    )
  })

  function openClient(client: Client) {
    setSelected(client)
    setNotes(client.notes || '')
  }

  async function saveNotes() {
    if (!selected) return
    setSaving(true)
    const { error } = await supabase
      .from('clients')
      .update({ notes })
      .eq('id', selected.id)
    setSaving(false)

    if (error) {
      toast.error('Error al guardar')
      return
    }
    setClients(prev => prev.map(c => c.id === selected.id ? { ...c, notes } : c))
    setSelected(prev => prev ? { ...prev, notes } : prev)
    toast.success('Notas guardadas')
  }

  const clientAppointments = selected
    ? appointments.filter(a => a.client_id === selected.id)
    : []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Clientes</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email..."
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">
            {search ? 'No se encontraron clientes' : 'Aún no hay clientes registrados'}
          </p>
        ) : (
          filtered.map(client => (
            <button
              key={client.id}
              onClick={() => openClient(client)}
              className="w-full flex items-center gap-3 p-4 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors text-left"
            >
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                  {client.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{client.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {client.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {client.phone}
                    </span>
                  )}
                  {client.email && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {client.email}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {format(parseISO(client.created_at), "d MMM yyyy", { locale: es })}
              </span>
            </button>
          ))
        )}
      </div>

      <Drawer open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>{selected?.name}</DrawerTitle>
          </DrawerHeader>
          {selected && (
            <div className="px-4 pb-8 space-y-6 overflow-y-auto">
              <div className="flex flex-wrap gap-4 text-sm">
                {selected.phone && (
                  <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Phone className="w-4 h-4" /> {selected.phone}
                  </a>
                )}
                {selected.email && (
                  <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-primary hover:underline">
                    <Mail className="w-4 h-4" /> {selected.email}
                  </a>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notas del cliente</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Observaciones, preferencias, alergias..."
                  rows={3}
                />
                <Button size="sm" onClick={saveNotes} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar notas'}
                </Button>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Historial de turnos ({clientAppointments.length})</h3>
                {clientAppointments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Sin turnos registrados</p>
                ) : (
                  <div className="space-y-2">
                    {clientAppointments.map(appt => {
                      const service = appt.services as { name?: string; price?: number } | null
                      return (
                        <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 text-sm">
                          <span className="text-muted-foreground w-20">
                            {format(parseISO(appt.date), 'd MMM yy', { locale: es })}
                          </span>
                          <span className="font-mono text-xs">{appt.time.slice(0, 5)}</span>
                          <span className="flex-1">{service?.name}</span>
                          {service?.price && (
                            <span className="text-muted-foreground">${Number(service.price).toLocaleString('es-AR')}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}
