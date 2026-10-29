/**
 * Las redes de Forjo, al pie de las pantallas de auth.
 *
 * ⚠ Los SVG van INLINE y no importados de `lucide-react`: desde la v1 lucide **eliminó todos los
 * iconos de marca** (Instagram, Facebook, LinkedIn, Twitter — ninguno existe ya en el paquete) por
 * tema de marcas registradas. Verificado contra la versión instalada, no supuesto. Traer una
 * dependencia de iconos de marca por dos glifos no se justifica, y el hero mobile ya resuelve así
 * el icono de Google: inline es el patrón vigente del archivo, no uno nuevo.
 *
 * Un solo componente para las dos superficies (el panel oscuro de `(split)/layout.tsx` y el hero
 * mobile), porque son la misma marca en la misma pantalla y duplicar los paths garantiza que un día
 * diverjan.
 */

// Las mismas cuatro del pie de forjo-tiendas (app/(sitio)/datos.ts), que es el que copia la variante
// `caja`; Instagram primero para que el hero mobile quede como estaba. `soloPie`: WhatsApp y mail
// van en el pie de escritorio y no en el hero mobile, donde arriba del logo sólo entran las dos redes
// de marca.
const REDES = [
  {
    nombre: 'Instagram',
    url: 'https://www.instagram.com/forjo.studio/',
    // Cámara de contorno + lente + flash, en un solo path de trazo.
    path: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM17.5 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
  },
  {
    nombre: 'Facebook',
    url: 'https://facebook.com/forjo.studio',
    path: 'M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12Z',
  },
  {
    nombre: 'WhatsApp',
    url: 'https://wa.me/5493487623630',
    soloPie: true,
    path: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z',
  },
  {
    nombre: 'Email',
    url: 'mailto:hola@forjo.studio',
    soloPie: true,
    // Sobre: marco + solapa, en relleno para que pese igual que los otros tres glifos.
    path: 'M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm15 3.9-7.45 4.97a1 1 0 0 1-1.1 0L4 7.9V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7.9ZM18.6 6H5.4L12 10.4 18.6 6Z',
  },
] as const

type Props = {
  /** Clases del contenedor — cada superficie aporta su propio espaciado. */
  className?: string
  /**
   * `glifo` (default): iconos sueltos, las dos redes de marca — el hero mobile.
   * `caja`: los cuatro en cajas con borde, copia del pie de forjo-tiendas — el panel de escritorio.
   */
  variant?: 'glifo' | 'caja'
}

export function ForjoSocials({ className = '', variant = 'glifo' }: Props) {
  const caja = variant === 'caja'
  const redes = caja ? REDES : REDES.filter((r) => !('soloPie' in r))
  return (
    <ul className={`relative flex list-none items-center p-0 ${caja ? 'gap-2.5' : 'gap-1'} ${className}`}>
      {redes.map((red) => (
        <li key={red.nombre}>
          <a
            href={red.url}
            {...(red.url.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            // 44x44 de área táctil (guideline Apple/Google) aunque el glifo mida 18: el padding es
            // el que cumple el mínimo, no el icono. `focus-visible` explícito porque el foco por
            // teclado no puede depender del hover.
            className={
              caja
                ? 'flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#332d24] bg-[#1c1815] text-[#f3ead8] transition-colors hover:border-[#d94a2b] hover:text-[#d94a2b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d94a2b]'
                : 'flex h-11 w-11 items-center justify-center rounded-md text-[#a39989] transition-colors hover:text-[#f3ead8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d94a2b] focus-visible:text-[#f3ead8]'
            }
            aria-label={red.nombre === 'Email' ? 'Escribile a Forjo por mail' : `Forjo en ${red.nombre}`}
          >
            <svg
              width={caja ? 17 : 18}
              height={caja ? 17 : 18}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d={red.path} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  )
}
