'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Client, ClinicalNote, ClientAttachment } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Search, ChevronLeft, Plus, Trash2, FileText, Paperclip,
  Upload, ShieldCheck, Download, X,
} from 'lucide-react'

interface Props {
  initialClients: Client[]
  businessId: string
  primaryColor: string
}

export function ClinicalHistoryClient({ initialClients, businessId, primaryColor }: Props) {
  const supabase = createClient()

  const [clients, setClients] = useState(initialClients)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Per-patient loaded data
  const [notes, setNotes] = useState<ClinicalNote[]>([])
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [loadingData, setLoadingData] = useState(false)

  // Add-note form
  const [noteText, setNoteText] = useState('')
  const [noteDate, setNoteDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [savingNote, setSavingNote] = useState(false)

  // Insurance form
  const [insurance, setInsurance] = useState({ name: '', number: '' })
  const [savingInsurance, setSavingInsurance] = useState(false)

  const [uploading, setUploading] = useState(false)

  const selected = clients.find(c => c.id === selectedId) ?? null

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clients
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [clients, search])

  const loadPatientData = useCallback(async (clientId: string) => {
    setLoadingData(true)
    const [{ data: n }, { data: a }] = await Promise.all([
      supabase.from('clinical_notes').select('*').eq('client_id', clientId).order('note_date', { ascending: false }),
      supabase.from('client_attachments').select('*').eq('client_id', clientId).order('uploaded_at', { ascending: false }),
    ])
    setNotes(n || [])
    setAttachments(a || [])
    setLoadingData(false)
  }, [supabase])

  useEffect(() => {
    if (!selectedId || !selected) return
    setNoteText('')
    setNoteDate(format(new Date(), 'yyyy-MM-dd'))
    setInsurance({ name: selected.insurance_name || '', number: selected.insurance_number || '' })
    loadPatientData(selectedId)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notes ──────────────────────────────────────────────────────────────────
  async function addNote() {
    if (!selectedId || !noteText.trim()) return
    setSavingNote(true)
    const { data, error } = await supabase.from('clinical_notes').insert({
      business_id: businessId,
      client_id: selectedId,
      note: noteText.trim(),
      note_date: noteDate,
    }).select().single()
    setSavingNote(false)
    if (error) { toast.error('Error al guardar la nota'); return }
    setNotes(prev => [data as ClinicalNote, ...prev].sort((a, b) => (a.note_date < b.note_date ? 1 : -1)))
    setNoteText('')
    toast.success('Nota agregada')
  }

  async function deleteNote(id: string) {
    const { error } = await supabase.from('clinical_notes').delete().eq('id', id)
    if (error) { toast.error('Error al eliminar'); return }
    setNotes(prev => prev.filter(n => n.id !== id))
    toast.success('Nota eliminada')
  }

  // ── Insurance ──────────────────────────────────────────────────────────────
  async function saveInsurance() {
    if (!selectedId) return
    setSavingInsurance(true)
    const { error } = await supabase.from('clients').update({
      insurance_name: insurance.name || null,
      insurance_number: insurance.number || null,
    }).eq('id', selectedId)
    setSavingInsurance(false)
    if (error) { toast.error('Error al guardar'); return }
    setClients(prev => prev.map(c => c.id === selectedId
      ? { ...c, insurance_name: insurance.name || null, insurance_number: insurance.number || null }
      : c))
    toast.success('Obra social actualizada')
  }

  // ── Attachments (Supabase Storage, private bucket) ───────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file || !selectedId) return
    if (file.size > 10 * 1024 * 1024) { toast.error('El archivo no puede superar 10MB'); return }
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${businessId}/${selectedId}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
    if (upErr) { toast.error('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data, error } = await supabase.from('client_attachments').insert({
      business_id: businessId,
      client_id: selectedId,
      file_url: path,
      file_name: file.name,
    }).select().single()
    setUploading(false)
    if (error) { toast.error('Error al guardar el archivo'); return }
    setAttachments(prev => [data as ClientAttachment, ...prev])
    toast.success('Archivo subido')
  }

  async function viewAttachment(att: ClientAttachment) {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.file_url, 60)
    if (error || !data) { toast.error('No se pudo abrir el archivo'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function deleteAttachment(att: ClientAttachment) {
    await supabase.storage.from('attachments').remove([att.file_url])
    const { error } = await supabase.from('client_attachments').delete().eq('id', att.id)
    if (error) { toast.error('Error al eliminar'); return }
    setAttachments(prev => prev.filter(a => a.id !== att.id))
    toast.success('Archivo eliminado')
  }

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

            {/* ── Obra social ── */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-widest text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> OBRA SOCIAL
              </h3>
              <div className="bg-card border border-border rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Obra social</Label>
                  <Input value={insurance.name} onChange={e => setInsurance(f => ({ ...f, name: e.target.value }))} placeholder="Ej: OSDE, Swiss Medical" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">N° de afiliado</Label>
                  <Input value={insurance.number} onChange={e => setInsurance(f => ({ ...f, number: e.target.value }))} placeholder="N° de afiliado" className="h-8 text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <Button size="sm" onClick={saveInsurance} disabled={savingInsurance}>
                    {savingInsurance ? 'Guardando...' : 'Guardar obra social'}
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Add note ── */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-widest text-muted-foreground">NUEVA NOTA</h3>
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="space-y-1 max-w-[180px]">
                  <Label className="text-xs">Fecha</Label>
                  <Input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="h-8 text-sm" />
                </div>
                <Textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Evolución, diagnóstico, indicaciones..."
                  rows={4}
                  className="resize-none text-sm"
                />
                <Button size="sm" onClick={addNote} disabled={savingNote || !noteText.trim()} className="gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> {savingNote ? 'Guardando...' : 'Agregar nota'}
                </Button>
              </div>
            </div>

            {/* ── Timeline ── */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-widest text-muted-foreground">EVOLUCIÓN ({notes.length})</h3>
              {loadingData ? (
                <p className="text-sm text-muted-foreground py-4">Cargando...</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center bg-card border border-border rounded-lg">Sin notas registradas</p>
              ) : (
                <div className="relative space-y-3 pl-4 border-l-2 border-border">
                  {notes.map(n => (
                    <div key={n.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 border-background" style={{ backgroundColor: primaryColor }} />
                      <div className="bg-card border border-border rounded-lg p-3 group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{format(parseISO(n.note_date), "d 'de' MMMM 'de' yyyy", { locale: es })}</span>
                          <button onClick={() => deleteNote(n.id)} className="text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm whitespace-pre-wrap text-foreground/90">{n.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Attachments ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold tracking-widest text-muted-foreground flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" /> ESTUDIOS Y RECETAS ({attachments.length})
                </h3>
                <label className={cn('inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer px-2.5 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors', uploading && 'opacity-60 pointer-events-none')}>
                  <Upload className="w-3.5 h-3.5" /> {uploading ? 'Subiendo...' : 'Subir archivo'}
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                </label>
              </div>
              {attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center bg-card border border-border rounded-lg">Sin archivos adjuntos</p>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-card border border-border text-sm group">
                      <Paperclip className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 truncate">{att.file_name || 'Archivo'}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{format(parseISO(att.uploaded_at), 'd MMM yy', { locale: es })}</span>
                      <button onClick={() => viewAttachment(att)} className="text-muted-foreground hover:text-foreground transition-colors" title="Ver / descargar">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteAttachment(att)} className="text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Eliminar">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
