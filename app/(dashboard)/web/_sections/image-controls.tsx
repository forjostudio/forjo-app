'use client'

// ── Controles de imagen del editor CMS (Phase 14 · EDIT-02 · D-02) ─────────────────────────
// Dos controles: SingleImageControl (hero/about) y ImageGridControl (gallery.images /
// rsvData.images). Ambos suben DIRECTO al bucket landing-assets/{business_id}/ con el browser
// SESSION client (RLS owner-write, migr. 030) — NUNCA service-role. La URL pública resultante va al
// borrador (onChange) y se persiste recién al Guardar (D-02b). `onUploadingChange(delta)` sube/baja
// el contador de uploads en vuelo del shell para deshabilitar "Guardar cambios" mientras hay una
// subida pendiente (L9).
//
// POR QUÉ session client y no service-role (T-14-10): el aislamiento lo garantiza la RLS del bucket,
// que exige que el primer segmento del path sea un business del owner autenticado. El service-role
// bypassaría esa RLS y movería el control de aislamiento al código de la app (frágil). El session
// client lleva las cookies del dueño → RLS `authenticated` → la policy valida el prefijo por nosotros.
//
// POR QUÉ upsert:false + nombre único (T-14-09): `buildUploadPath` genera `{businessId}/xxx-{uuid}.ext`,
// así dos subidas nunca colisionan y `upsert:false` nunca pisa un objeto (propio o ajeno) existente.
//
// POR QUÉ Quitar/Reemplazar son config-only (D-02c): v1 solo toca el config (saca/apunta la URL); el
// objeto viejo queda huérfano en el bucket (benigno). La limpieza de huérfanos se difiere.

import { useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Trash2, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { buildUploadPath, validateImageFile } from '@/lib/landing/editor-upload'

// Copy de error VERBATIM del control de logo en settings-client.tsx (misma barrera de input).
const ERROR_COPY = {
  oversize: 'El archivo no puede superar 2MB',
  wrong_type: 'Formato no soportado. Usá JPG, PNG o WebP',
  upload: 'No se pudo subir la imagen. Probá de nuevo.',
} as const

const BUCKET = 'landing-assets'

// Deriva la extensión del nombre del archivo (fallback jpg), igual que settings.
function extOf(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || 'jpg'
}

// Sube UN archivo al bucket bajo {businessId}/ y devuelve la publicUrl, o null si falló.
// NO muta ningún estado ni config: el caller decide qué hacer con la URL (D-02b / L4). La `section`
// es un token de organización interno (el path real lo arma buildUploadPath, que fuerza el prefijo).
async function uploadOne(businessId: string, section: string, file: File): Promise<string | null> {
  const supabase = createClient() // browser session client — NUNCA el admin/service-role client
  const path = buildUploadPath({ businessId, section, ext: extOf(file) })
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
  if (error) {
    toast.error(ERROR_COPY.upload)
    return null
  }
  // Solo escribimos al draft una publicUrl real (https válido, L4) — nunca un blob:/object URL.
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

// Prop común: businessId (de props del shell, jamás client-supplied) + callback de uploads-en-vuelo.
interface BaseImageControlProps {
  businessId: string
  onUploadingChange: (delta: number) => void
}

export interface SingleImageControlProps extends BaseImageControlProps {
  value: string | undefined
  onChange: (url: string | undefined) => void
}

export interface ImageGridControlProps extends BaseImageControlProps {
  values: string[]
  onChange: (urls: string[]) => void
}

// ── SingleImageControl: hero/about — subir/reemplazar/quitar una imagen ─────────────────────
export function SingleImageControl({
  businessId,
  value,
  onChange,
  onUploadingChange,
}: SingleImageControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-seleccionar el mismo archivo
    if (!file) return
    const check = validateImageFile(file)
    if (!check.ok) {
      // Validación falla → toast y NO entramos en estado uploading (UI-SPEC §4).
      toast.error(ERROR_COPY[check.error])
      return
    }
    setBusy(true)
    onUploadingChange(1)
    try {
      const url = await uploadOne(businessId, 'image', file)
      // En fallo, url=null → el draft NO se muta (onChange no se llama).
      if (url) onChange(url)
    } finally {
      setBusy(false)
      onUploadingChange(-1)
    }
  }

  const openPicker = () => inputRef.current?.click()

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onSelect}
      />

      {value ? (
        <div className="space-y-2">
          <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
            <Image
              src={value}
              alt="Imagen de la sección"
              fill
              sizes="(max-width: 640px) 100vw, 440px"
              className="object-cover"
            />
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Subiendo…</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={openPicker}
            >
              {busy ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" /> Subiendo…
                </>
              ) : (
                'Reemplazar'
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={busy}
              // Quitar = config-only (D-02c): saca la URL del borrador; el objeto queda huérfano.
              onClick={() => onChange(undefined)}
            >
              Quitar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={openPicker}
          className={cn(
            'flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-muted/40 p-4 text-center text-xs text-muted-foreground transition-colors',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            busy && 'pointer-events-none opacity-70',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <span>Subiendo…</span>
            </>
          ) : (
            <>
              <ImageIcon className="size-5" aria-hidden="true" />
              <span>Subir imagen — JPG, PNG o WebP · máx 2 MB</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ── ImageGridControl: gallery.images / rsvData.images — grilla + agregar/borrar ─────────────
export function ImageGridControl({
  businessId,
  values,
  onChange,
  onUploadingChange,
}: ImageGridControlProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Contador local de tiles en subida → placeholders con spinner + deshabilita "Agregar".
  const [pending, setPending] = useState(0)

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // permite re-seleccionar los mismos archivos
    if (files.length === 0) return

    const added: string[] = []
    for (const file of files) {
      const check = validateImageFile(file)
      if (!check.ok) {
        toast.error(ERROR_COPY[check.error])
        continue
      }
      setPending((n) => n + 1)
      onUploadingChange(1)
      try {
        const url = await uploadOne(businessId, 'gallery', file)
        if (url) added.push(url)
      } finally {
        setPending((n) => Math.max(0, n - 1))
        onUploadingChange(-1)
      }
    }
    // Una sola mutación del borrador con todas las subidas exitosas del batch (append al array).
    // En fallo total (added vacío) el draft NO se muta.
    if (added.length > 0) onChange([...values, ...added])
  }

  const openPicker = () => inputRef.current?.click()

  function removeAt(index: number) {
    // Borrar = config-only: quita esa URL del array; el objeto queda huérfano (D-02c).
    onChange(values.filter((_, i) => i !== index))
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={onSelect}
      />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {values.map((url, i) => (
          <div
            key={`${url}-${i}`}
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
          >
            <Image
              src={url}
              alt={`Imagen ${i + 1}`}
              fill
              sizes="(max-width: 640px) 33vw, 110px"
              className="object-cover"
            />
            <button
              type="button"
              aria-label={`Quitar imagen ${i + 1}`}
              onClick={() => removeAt(i)}
              className={cn(
                'absolute right-1 top-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md',
                'bg-background/80 text-destructive backdrop-blur transition-colors',
                'hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}

        {/* Placeholders de tiles en subida: spinner mientras cada upload está en vuelo. */}
        {Array.from({ length: pending }).map((_, i) => (
          <div
            key={`pending-${i}`}
            className="flex aspect-square items-center justify-center rounded-md border border-dashed bg-muted/40"
          >
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Subiendo…</span>
          </div>
        ))}

        {/* Tile "+ Agregar foto": abre el file picker (multi-select). */}
        <button
          type="button"
          disabled={pending > 0}
          onClick={openPicker}
          className={cn(
            'flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/40 p-2 text-center text-[0.7rem] text-muted-foreground transition-colors',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            pending > 0 && 'pointer-events-none opacity-70',
          )}
        >
          <Plus className="size-5" aria-hidden="true" />
          <span>Agregar foto</span>
        </button>
      </div>
    </div>
  )
}
