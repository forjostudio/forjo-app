import { normalizeArWhatsApp } from '@/lib/whatsapp'

// ── Botón flotante de WhatsApp (RSC) ──────────────────────────────────────────────
// Aparece SOLO si el negocio declaró un WhatsApp válido. No se configura desde el CMS: si el dato
// está, el canal existe y el botón va — es el atajo de contacto que todo negocio de servicios
// espera. El número sale de `businesses.whatsapp` (misma fuente que los emails), normalizado con
// normalizeArWhatsApp (idempotente: cubre datos viejos guardados sin normalizar). Si el número no
// se puede normalizar, NO renderiza nada — mejor sin botón que con un link roto.
//
// POR QUÉ sticky Y NO fixed (la decisión que importa acá):
// un `position: fixed` se ancla al VIEWPORT. En la web pública eso es lo que se quiere, pero el
// editor del CMS renderiza este mismo árbol dentro del dashboard → el botón se escaparía del marco
// del preview y quedaría flotando sobre el panel entero. La salida fácil sería crear un containing
// block en el wrapper del preview (transform/contain), pero eso está PROHIBIDO acá: rompe el
// position:fixed de los overlays del booking (vaul/sonner/react-day-picker).
// El truco: un contenedor `sticky; bottom: 0; height: 0` como ÚLTIMO hijo del landing. Al ser el
// último, su posición natural está al fondo del documento, así que queda pegado al borde inferior
// del scrollport mientras scrolleás — se comporta como un fixed, pero está CONTENIDO en el landing
// (funciona igual en la página real y adentro del preview). `height: 0` = no ocupa layout.
// Sticky crea contexto de apilado pero NO containing block para fixed → el booking sigue intacto.

export function WhatsappFloat({ whatsapp }: { whatsapp: string | null | undefined }) {
  const num = normalizeArWhatsApp(whatsapp)
  if (!num) return null

  return (
    <div className="pointer-events-none sticky bottom-0 z-40 h-0" aria-hidden={false}>
      <a
        href={`https://wa.me/${num}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Escribinos por WhatsApp"
        // pointer-events-auto: el contenedor los desactiva (es una capa de 0px que cubriría clics
        // en el ancho de la página); el link los vuelve a activar solo sobre sí mismo.
        // bottom con safe-area: en iPhone la barra de gestos se come el borde inferior.
        className="pointer-events-auto absolute right-[clamp(16px,4cqw,32px)] bottom-[calc(clamp(16px,4cqw,32px)+env(safe-area-inset-bottom))] inline-flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_6px_24px_-6px_rgb(0_0_0/0.45)] transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        {/* Glifo oficial de WhatsApp inline: lucide NO trae iconos de marca (los sacó), y no vamos
            a sumar una dependencia por un ícono. */}
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="size-7"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.9 11.9 0 0 0 5.688 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.48-8.413" />
        </svg>
      </a>
    </div>
  )
}
