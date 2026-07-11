'use client'

import { useEffect } from 'react'

// ── LandingMotion — controlador de scroll-reveal (IntersectionObserver) ──────────────
// POR QUÉ IO y NO animation-timeline: view(): el motor viejo (view()) es baseline SOLO
// Chromium → el reveal NO se veía en Safari, Firefox ni iOS. IntersectionObserver es API
// nativa del browser (cero dependencias) y anima en TODOS los navegadores. Espejo del
// <script> del mockup aprobado y del Reveal.tsx del CMS armar-web-forjo.
//
// POR QUÉ UN controlador global (montado UNA vez dentro de .frj-site) y no un wrapper client
// por sección: las secciones siguen siendo RSC (cero árbol al bundle). Este componente no
// renderiza DOM (retorna null): solo corre un efecto que busca los .frj-reveal ya presentes
// en el markup del server y los observa.
//
// CAJA NEGRA DEL BOOKING (D-E / T-OA7-01): este controlador SOLO agrega .shown y un
// transition-delay a nodos con clase .frj-reveal. Por markup, ningún .frj-reveal es ancestro
// del widget de reserva (el único .frj-reveal dentro de #reservar es el <div> HERMANO del
// strip RSV, que envuelve solo header+fotos, nunca el widget). Así no se crea containing block
// que rompa el position:fixed de vaul/sonner/react-day-picker.

export function LandingMotion({ level }: { level: 'none' | 'subtle' | 'premium' }) {
  useEffect(() => {
    // motion=none → estático, no tocamos nada (byte-idéntico a hoy).
    if (level === 'none') return
    // Fail-safe reduced-motion: no activamos el estado oculto ni observamos (belt-and-suspenders
    // con el @media del CSS). El controlador NO agrega data-motion-ready → el opacity:0 nunca aplica.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return

    // ⚠ El selector DEBE pedir [data-motion], no solo .frj-site. En el EDITOR del CMS hay DOS
    // .frj-site anidados: el wrapper del preview (web-client.tsx, que lleva data-theme/palette/font)
    // y, adentro, el <main> del renderer — que es el único que lleva data-motion. Con el selector
    // pelado agarrábamos el de AFUERA y le poníamos data-motion-ready ahí; como el CSS exige
    // data-motion y data-motion-ready EN EL MISMO elemento, no matcheaba ninguna regla y el motion
    // quedaba MUERTO en el preview (en la web pública hay un solo .frj-site, por eso ahí sí andaba).
    const root = document.querySelector<HTMLElement>('.frj-site[data-motion]')
    if (!root) return

    // Recién ACÁ el CSS activa el estado pendiente (opacity:0). Antes de esto todo es visible
    // → sin JS / sin este efecto no hay trap (anti-trap D-C).
    root.setAttribute('data-motion-ready', '')

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          // Stagger de grilla: si el elemento es hijo de un .frj-stagger, calculamos su índice
          // entre los hermanos que también son .frj-reveal y aplicamos 90ms/item (replica el
          // mockup). El primero (índice 0) no lleva delay.
          const parent = el.parentElement
          if (parent && parent.classList.contains('frj-stagger')) {
            const sibs = Array.from(parent.children).filter((c) =>
              c.classList.contains('frj-reveal'),
            )
            const i = sibs.indexOf(el)
            if (i > 0) el.style.transitionDelay = `${i * 90}ms`
          }
          el.classList.add('shown')
          observer.unobserve(el) // one-shot: no re-disparar al salir/entrar
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    )

    // scan(): resuelve TODOS los .frj-reveal que todavía no están resueltos.
    //  - ANTI-FLASH (D-C): los que YA están en viewport se marcan .shown de forma SÍNCRONA →
    //    aparecen crisp, sin animar ni parpadear. Solo los que entran por scroll animan.
    //  - Al resto los pone bajo observación.
    // Es idempotente: un elemento ya .shown se saltea, y observar dos veces el mismo nodo es no-op.
    function scan() {
      for (const el of root!.querySelectorAll<HTMLElement>('.frj-reveal')) {
        if (el.classList.contains('shown')) continue
        if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('shown')
        else observer.observe(el)
      }
    }

    scan()

    // POR QUÉ un MutationObserver: `.shown` es una clase IMPERATIVA, invisible para React. En el
    // preview del CMS, React monta NODOS NUEVOS cada vez que el dueño prende/apaga o reordena una
    // sección — y esos nodos nacen sin `.shown` y sin estar observados (el efecto no vuelve a
    // correr: su dep es [level]). Sin este re-scan quedaban en opacity:0 PARA SIEMPRE: la sección
    // que acabás de prender no aparecía nunca.
    // Solo childList/subtree: NO attributes — observar atributos entraría en loop, porque agregar
    // `.shown` es en sí mismo una mutación de atributo.
    // En la web pública (RSC, un solo render) no se dispara nunca: costo cero.
    const mutations = new MutationObserver(() => scan())
    mutations.observe(root, { childList: true, subtree: true })

    return () => {
      mutations.disconnect()
      observer.disconnect()
    }
  }, [level])

  return null
}
