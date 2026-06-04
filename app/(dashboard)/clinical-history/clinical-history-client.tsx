'use client'

import { useState, useMemo } from 'react'
import { Client } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Search, ChevronLeft, FileText } from 'lucide-react'
import { ClinicalHistoryPanel } from '@/components/dashboard/clinical-history-panel'

interface Props {
  initialClients: Client[]
  businessId: string
  primaryColor: string
}

export function ClinicalHistoryClient({ initialClients, businessId, primaryColor }: Props) {
  const [clients, setClients] = useState(initialClients)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const selected = clients.find(c => c.id === selectedId) ?? null

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clients
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [clients, search])

  const showDetail = selectedId !== null

  return (
    <div className="-m-4 sm:-m-6 lg:-m-8 flex h-[calc(100vh-56px)] lg:h-screen overflow-hidden bg-background">

      {/* ═══════════ PATIENT LIST ═══════════ */}
      <div className={cn(
        'w-full lg:w-80 flex-shrink-0 flex flex-col overflow-hidden border-r border-border',
        showDetail && 'hidden lg:flex'
      )}>
        <div className="flex-shrink-0 p-4 border-b border-border space-y-3">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-4 h-4" /> Historia Clínica
            <span className="text-muted-foreground font-normal text-sm">({clients.length})</span>
          </h1>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar paciente..." className="pl-8 h-8 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-12">{search ? 'Sin resultados' : 'Sin pacientes'}</p>
          ) : filtered.map(client => {
            const isSelected = client.id === selectedId
            return (
              <button
                key={client.id}
                onClick={() => setSelectedId(client.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left border-l-2 transition-all',
                  isSelected ? 'border-l-primary bg-primary/10' : 'border-l-transparent hover:bg-secondary/40'
                )}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: isSelected ? primaryColor : 'hsl(var(--secondary))' }}
                >
                  {client.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{client.name}</p>
                  {client.insurance_name && <p className="text-xs text-muted-foreground truncate">{client.insurance_name}</p>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══════════ PATIENT HISTORY ═══════════ */}
      <div className={cn('flex-1 overflow-y-auto', !showDetail && 'hidden lg:flex lg:items-center lg:justify-center')}>
        {!selected && (
          <div className="text-center text-muted-foreground space-y-2">
            <div className="w-16 h-16 rounded-full bg-secondary/50 flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7 opacity-40" />
            </div>
            <p className="text-sm">Seleccioná un paciente para ver su historia clínica</p>
          </div>
        )}

        {selected && (
          <div className="p-4 sm:p-6 space-y-5 max-w-3xl">
            <button onClick={() => setSelectedId(null)} className="lg:hidden flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2">
              <ChevronLeft className="w-4 h-4" /> Volver
            </button>

            <h2 className="text-2xl font-bold tracking-tight uppercase">{selected.name}</h2>

            <ClinicalHistoryPanel
              clientId={selected.id}
              businessId={businessId}
              primaryColor={primaryColor}
              initialInsuranceName={selected.insurance_name}
              initialInsuranceNumber={selected.insurance_number}
              onInsuranceSaved={(name, number) =>
                setClients(prev => prev.map(c => c.id === selected.id ? { ...c, insurance_name: name, insurance_number: number } : c))}
            />
          </div>
        )}
      </div>
    </div>
  )
}
