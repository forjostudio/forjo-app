import { describe, it, expect } from 'vitest'
import {
  LIGHTBOX_HASH,
  LIGHTBOX_GROUP_ATTR,
  LIGHTBOX_SRC_ATTR,
  wrapIndex,
  centeredScrollLeft,
  shouldConsumeHistoryEntry,
} from './lightbox'

// Tests de los helpers PUROS del lightbox del landing.
//
// NOTA de entorno (convención ya establecida en el repo, ver confirm-dialog.test.tsx):
// vitest.config.mts corre `environment: 'node'` — no hay jsdom ni Testing Library, y la regla
// del repo es CERO paquetes npm nuevos. Por eso la lógica riesgosa del visor (el índice
// circular, el centrado del slide y —sobre todo— la guarda del historial) vive en helpers
// PUROS que se testean acá; el render del overlay se valida con tsc + lint + build + UAT visual.

describe('constantes del contrato (RSC ↔ controlador cliente)', () => {
  // Estos strings son el CONTRATO entre 3 secciones RSC (gallery/rsv-strip/about) y el
  // controlador cliente. Si alguien los cambia de un lado y no del otro, las fotos dejan de
  // abrir en SILENCIO (sin error de tipos, sin excepción). Estos asserts congelan los valores.
  it('LIGHTBOX_HASH es "#foto" (el hash que impide que el router colapse la entrada de historial)', () => {
    expect(LIGHTBOX_HASH).toBe('#foto')
  })

  it('LIGHTBOX_GROUP_ATTR es "data-frj-lightbox"', () => {
    expect(LIGHTBOX_GROUP_ATTR).toBe('data-frj-lightbox')
  })

  it('LIGHTBOX_SRC_ATTR es "data-frj-src"', () => {
    expect(LIGHTBOX_SRC_ATTR).toBe('data-frj-src')
  })
})

describe('wrapIndex — índice circular seguro', () => {
  it('envuelve al pasarse del final: wrapIndex(3, 3) → 0', () => {
    expect(wrapIndex(3, 3)).toBe(0)
  })

  it('envuelve hacia atrás: wrapIndex(-1, 3) → 2', () => {
    expect(wrapIndex(-1, 3)).toBe(2)
  })

  it('deja pasar un índice válido: wrapIndex(1, 3) → 1', () => {
    expect(wrapIndex(1, 3)).toBe(1)
  })

  // len 0 es el caso que rompe la aritmética modular (división por cero → NaN → scrollLeft NaN
  // → el track no scrollea y el visor queda en blanco). Guarda explícita.
  it('con len 0 devuelve 0 (no divide por cero ni devuelve NaN)', () => {
    const r = wrapIndex(0, 0)
    expect(r).toBe(0)
    expect(Number.isNaN(r)).toBe(false)
  })
})

describe('centeredScrollLeft — scrollLeft que centra un slide en el track', () => {
  it('centra el slide: offsetLeft 500 + w/2 (150) - trackW/2 (500) → 150', () => {
    expect(
      centeredScrollLeft({ slideOffsetLeft: 500, slideWidth: 300, trackWidth: 1000 }),
    ).toBe(150)
  })

  // El PRIMER slide, gracias al padding-inline del track (D-02), ya queda centrado en
  // scrollLeft 0: la cuenta da negativo y un scrollLeft negativo no existe. Clamp obligatorio.
  it('nunca devuelve negativo (clamp a 0) — el primer slide ya está centrado en scrollLeft 0', () => {
    expect(centeredScrollLeft({ slideOffsetLeft: 0, slideWidth: 300, trackWidth: 1000 })).toBe(0)
    expect(centeredScrollLeft({ slideOffsetLeft: 100, slideWidth: 300, trackWidth: 1000 })).toBe(0)
  })
})

describe('shouldConsumeHistoryEntry — la guarda del bug de doble history.back()', () => {
  // El único caso en que PODEMOS llamar history.back(): la entrada de arriba del stack es la
  // NUESTRA (la que empujamos al abrir el visor).
  it('true SOLO si el state lleva nuestra marca frjLightbox === true', () => {
    expect(shouldConsumeHistoryEntry({ frjLightbox: true })).toBe(true)
  })

  // Todo lo demás → false. Llamar history.back() sobre una entrada que NO es nuestra es
  // exactamente el camino que SACA AL USUARIO DEL SITIO (bug real, ya sufrido en producción
  // en el CMS hermano). Cada uno de estos casos es un escenario que se dio o se puede dar:
  // state limpio (navegación normal), state de otro (el router de Next), doble cierre.
  it('false con null / undefined / {} / marca en false (nunca back() sin nuestra marca)', () => {
    expect(shouldConsumeHistoryEntry(null)).toBe(false)
    expect(shouldConsumeHistoryEntry(undefined)).toBe(false)
    expect(shouldConsumeHistoryEntry({})).toBe(false)
    expect(shouldConsumeHistoryEntry({ frjLightbox: false })).toBe(false)
  })

  // Defensa extra: valores no-objeto y marcas truthy pero no === true (un '1' de un state ajeno
  // no nos habilita a consumir la entrada).
  it('false con tipos que no son objeto y con marcas truthy que no son true', () => {
    expect(shouldConsumeHistoryEntry('frjLightbox')).toBe(false)
    expect(shouldConsumeHistoryEntry(1)).toBe(false)
    expect(shouldConsumeHistoryEntry({ frjLightbox: 'true' })).toBe(false)
    expect(shouldConsumeHistoryEntry({ frjLightbox: 1 })).toBe(false)
  })
})
