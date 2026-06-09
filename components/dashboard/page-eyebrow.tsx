// Eyebrow Bauhaus de las páginas: bullet de 3 primitivas (cuadrado rojo · cuadrado amarillo ·
// círculo azul) + label en mayúsculas. Colores fijos (constantes Bauhaus), independientes de
// la paleta del negocio, para que la marca se lea igual en todas las paletas.
export function PageEyebrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="w-2 h-2" style={{ background: '#d94a2b' }} />
        <span className="w-2 h-2" style={{ background: '#f4c543' }} />
        <span className="w-2 h-2 rounded-full" style={{ background: '#2a5fa5' }} />
      </span>
      {label}
    </div>
  )
}
