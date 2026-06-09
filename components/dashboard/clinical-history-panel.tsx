'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ClinicalNote, ClientAttachment } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, Paperclip, Upload, ShieldCheck, Download, X } from 'lucide-react'

// Panel de Historia Clínica de UN paciente: obra social, evolución (notas),
// estudios y recetas (adjuntos). Es la única fuente de esta UI: la consumen tanto
// la página /clinical-history como la ficha del paciente. La data del paciente se
// carga al montar (en la ficha eso ocurre al expandir la sección), no antes.
interface Props {
  clientId: string
  businessId: string
  initialInsuranceName?: string | null
  initialInsuranceNumber?: string | null
  // Permite al contenedor sincronizar su propio estado del cliente al guardar.
  onInsuranceSaved?: (name: string | null, number: string | null) => void
}

export function ClinicalHistoryPanel({
  clientId,
  businessId,
  initialInsuranceName,
  initialInsuranceNumber,
  onInsuranceSaved,
}: Props) {
  const supabase = createClient()

  const [notes, setNotes] = useState<ClinicalNote[]>([])
  const [attachments, setAttachments] = useState<ClientAttachment[]>([])
  const [confirmDeleteAtt, setConfirmDeleteAtt] = useState<ClientAttachment | null>(null)
  const [loadingData, setLoadingData] = useState(true)

  const [noteText, setNoteText] = useState('')
  const [noteDate, setNoteDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [savingNote, setSavingNote] = useState(false)

  const [insurance, setInsurance] = useState({ name: initialInsuranceName || '', number: initialInsuranceNumber || '' })
  const [savingInsurance, setSavingInsurance] = useState(false)

  const [uploading, setUploading] = useState(false)

  const loadPatientData = useCallback(async (id: string) => {
    setLoadingData(true)
    // Defensa en profundidad: filtro explícito por business_id además de la RLS.
    const [{ data: n }, { data: a }] = await Promise.all([
      supabase.from('clinical_notes').select('*').eq('business_id', businessId).eq('client_id', id).order('note_date', { ascending: false }),
      supabase.from('client_attachments').select('*').eq('business_id', businessId).eq('client_id', id).order('uploaded_at', { ascending: false }),
    ])
    setNotes(n || [])
    setAttachments(a || [])
    setLoadingData(false)
  }, [supabase, businessId])

  useEffect(() => {
    setNoteText('')
    setNoteDate(format(new Date(), 'yyyy-MM-dd'))
    setInsurance({ name: initialInsuranceName || '', number: initialInsuranceNumber || '' })
    loadPatientData(clientId)
  }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notes ──────────────────────────────────────────────────────────────────
  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    const { data, error } = await supabase.from('clinical_notes').insert({
      business_id: businessId,
      client_id: clientId,
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
    setSavingInsurance(true)
    const name = insurance.name || null
    const number = insurance.number || null
    const { error } = await supabase.from('clients').update({
      insurance_name: name,
      insurance_number: number,
    }).eq('id', clientId)
    setSavingInsurance(false)
    if (error) { toast.error('Error al guardar'); return }
    onInsuranceSaved?.(name, number)
    toast.success('Obra social actualizada')
  }

  // ── Attachments (Supabase Storage, private bucket) ───────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('El archivo no puede superar 10MB'); return }
    setUploading(true)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${businessId}/${clientId}/${Date.now()}-${safeName}`
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
    if (upErr) { toast.error('Error al subir: ' + upErr.message); setUploading(false); return }
    const { data, error } = await supabase.from('client_attachments').insert({
      business_id: businessId,
      client_id: clientId,
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
    setConfirmDeleteAtt(null)
    toast.success('Archivo eliminado')
  }

  return (
    <div className="space-y-5">
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
                <span className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 border-background bg-primary" />
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
                <button onClick={() => setConfirmDeleteAtt(att)} className="text-muted-foreground hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100" title="Eliminar">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!confirmDeleteAtt} onOpenChange={open => { if (!open) setConfirmDeleteAtt(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar archivo?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se va a eliminar <strong className="text-foreground">{confirmDeleteAtt?.file_name || 'este archivo'}</strong> de forma permanente. Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteAtt(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => { if (confirmDeleteAtt) deleteAttachment(confirmDeleteAtt) }}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
