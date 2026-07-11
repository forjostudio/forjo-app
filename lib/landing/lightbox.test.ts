import { describe, it, expect } from 'vitest'
import {
  LIGHTBOX_HASH,
  LIGHTBOX_GROUP_ATTR,
  LIGHTBOX_SRC_ATTR,
  wrapIndex,
  slideStep,
  scrollLeftForIndex,
  clampIndex,
  indexFromScroll,
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

describe('wrapIndex — índice CIRCULAR (solo para la trampa de foco del Tab)', () => {
  // Ojo: el carrusel NO usa esto (clampea). Acá envolver es lo correcto: el Tab tiene que ciclar
  // entre los botones del visor y no escaparse a la página de atrás.
  it('cicla en ambos sentidos', () => {
    expect(wrapIndex(3, 3)).toBe(0)
    expect(wrapIndex(-1, 3)).toBe(2)
    expect(wrapIndex(1, 3)).toBe(1)
  })

  // len 0 → el módulo da NaN y `list[NaN].focus()` tira. Guarda explícita.
  it('con len 0 devuelve 0 (no NaN)', () => {
    expect(wrapIndex(0, 0)).toBe(0)
  })
})

describe('clampIndex — índice CLAMPEADO (las flechas no dan la vuelta)', () => {
  it('deja pasar un índice válido', () => {
    expect(clampIndex(1, 3)).toBe(1)
  })

  it('se queda en los extremos en vez de envolver (0 y count-1)', () => {
    expect(clampIndex(-1, 3)).toBe(0)
    expect(clampIndex(3, 3)).toBe(2)
  })

  it('con count 0 devuelve 0 (no devuelve -1 ni NaN)', () => {
    expect(clampIndex(0, 0)).toBe(0)
  })
})

describe('slideStep — paso entre slides (ancho + gap)', () => {
  it('lo mide como la distancia entre los offsetLeft de dos slides consecutivos', () => {
    expect(
      slideStep({ firstOffsetLeft: 100, secondOffsetLeft: 412, fallbackWidth: 999 }),
    ).toBe(312)
  })

  // Con 0 o 1 slide no hay dos offsets que restar → fallback al ancho del track.
  it('con un solo slide cae al fallbackWidth', () => {
    expect(slideStep({ firstOffsetLeft: 0, secondOffsetLeft: null, fallbackWidth: 460 })).toBe(460)
  })

  // El guard que importa: un step 0 haría scrollLeft/0 → Infinity/NaN → el visor queda en blanco
  // SIN error visible. Nunca puede devolver 0.
  it('nunca devuelve 0 (un step 0 rompería la división scroll↔índice)', () => {
    expect(slideStep({ firstOffsetLeft: 0, secondOffsetLeft: 0, fallbackWidth: 0 })).toBe(1)
  })
})

describe('scrollLeftForIndex — scrollLeft que centra al slide i', () => {
  // La cuenta es i * step gracias al padding-inline del track: el slide 0 YA nace centrado en
  // scrollLeft 0, y cada siguiente se centra un step más a la derecha.
  it('centra el slide i en i * step', () => {
    expect(scrollLeftForIndex(0, 312)).toBe(0)
    expect(scrollLeftForIndex(2, 312)).toBe(624)
  })

  it('nunca devuelve negativo', () => {
    expect(scrollLeftForIndex(-1, 312)).toBe(0)
  })
})

describe('indexFromScroll — EL SCROLL MANDA: el índice activo se deriva de él', () => {
  // Esta es la pieza que hace que el resaltado/peek siga al dedo en vivo durante el swipe (y que
  // las flechas nunca se desincronicen de dónde quedó el carrusel).
  it('redondea al slide más centrado', () => {
    expect(indexFromScroll({ scrollLeft: 0, step: 300, count: 4 })).toBe(0)
    expect(indexFromScroll({ scrollLeft: 140, step: 300, count: 4 })).toBe(0) // todavía más cerca del 0
    expect(indexFromScroll({ scrollLeft: 160, step: 300, count: 4 })).toBe(1) // ya pasó la mitad
    expect(indexFromScroll({ scrollLeft: 600, step: 300, count: 4 })).toBe(2)
  })

  it('clampea al final (el rubber-band del celular puede pasarse del último)', () => {
    expect(indexFromScroll({ scrollLeft: 99999, step: 300, count: 4 })).toBe(3)
  })

  it('con step 0 o count 0 devuelve 0 (sin división por cero ni NaN)', () => {
    expect(indexFromScroll({ scrollLeft: 500, step: 0, count: 4 })).toBe(0)
    expect(indexFromScroll({ scrollLeft: 500, step: 300, count: 0 })).toBe(0)
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
