'use client'

// ── STUB: controles de imagen (Phase 14) — contrato de props FINAL ─────────────────────
// Dos controles: SingleImageControl (hero/about) y ImageGridControl (gallery.images /
// rsvData.images). Ambos suben directo al bucket landing-assets/{business_id}/ con el browser
// client de sesión (RLS owner-write, migr. 030) — NUNCA service-role, NUNCA una path fuera de
// `${businessId}/` (T-14 upload). La URL pública resultante va al borrador (onChange) y se
// persiste recién al Guardar. `onUploadingChange(delta)` sube/baja el contador de uploads en
// vuelo del shell para deshabilitar "Guardar cambios" mientras hay una subida pendiente (L9).
// Implementación real (validación 2MB/tipo, estados uploading/replace/error, thumbnails,
// Reemplazar/Quitar, grid + "Agregar foto") → Plan 14-03.

// Prop común a ambos controles: el businessId (de props del shell, jamás client-supplied) para
// construir la path del upload, y el callback de uploads-en-vuelo.
interface BaseImageControlProps {
  businessId: string
  // El shell lleva un contador; delta +1 al empezar un upload, -1 al terminar (éxito o error).
  onUploadingChange: (delta: number) => void
}

export interface SingleImageControlProps extends BaseImageControlProps {
  // URL actual en el config (o undefined si no hay imagen). onChange escribe la nueva URL o la
  // quita (undefined) en el borrador.
  value: string | undefined
  onChange: (url: string | undefined) => void
}

export interface ImageGridControlProps extends BaseImageControlProps {
  // Array de URLs del config (gallery/rsv). onChange reemplaza el array completo en el borrador.
  values: string[]
  onChange: (urls: string[]) => void
}

export function SingleImageControl(props: SingleImageControlProps) {
  // Stub mínimo real: muestra el estado actual. La UI de upload/replace/remove llega en 14-03.
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
      {props.value ? 'Imagen cargada' : 'Subir imagen — JPG, PNG o WebP · máx 2 MB'}
    </div>
  )
}

export function ImageGridControl(props: ImageGridControlProps) {
  // Stub mínimo real: cuenta las imágenes actuales. La grilla real (thumbnails + agregar/quitar)
  // llega en 14-03.
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
      {props.values.length > 0 ? `${props.values.length} imagen(es)` : '+ Agregar foto'}
    </div>
  )
}
