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
] as const

type Props = {
  /** Clases del contenedor — cada superficie aporta su propio espaciado. */
  className?: string
}

export function ForjoSocials({ className = '' }: Props) {
  return (
    <ul className={`relative flex list-none items-center gap-1 p-0 ${className}`}>
      {REDES.map((red) => (
        <li key={red.nombre}>
          <a
            href={red.url}
            target="_blank"
            rel="noopener noreferrer"
            // 44x44 de área táctil (guideline Apple/Google) aunque el glifo mida 18: el padding es
            // el que cumple el mínimo, no el icono. `focus-visible` explícito porque el foco por
            // teclado no puede depender del hover.
            className="flex h-11 w-11 items-center justify-center rounded-md text-[#a39989] transition-colors hover:text-[#f3ead8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d94a2b] focus-visible:text-[#f3ead8]"
            aria-label={`Forjo en ${red.nombre}`}
          >
            <svg
              width="18"
              height="18"
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
