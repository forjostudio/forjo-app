// Tests de la descripción expandible de la tarjeta pública (G-23-6, CAT-11).
//
// Entorno `node` sin DOM (mismo molde que components/crm/confirm-dialog.test.tsx): no hay
// Testing Library ni jsdom y la restricción es cero paquetes nuevos. Por eso:
// - la decisión de mostrar el toggle vive en helpers PUROS exportados del módulo y se testea acá;
// - el render se prueba con `renderToStaticMarkup` (sale de react-dom, ya instalado), que es
//   justamente el render de SERVIDOR: el caso que importa es que ahí no haya botón, porque en el
//   servidor no hay pantalla que medir y un "Ver más" pintado de más rompe la hidratación.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ServiceDescription, descriptionOverflows, showDescriptionToggle } from './service-description'

describe('descriptionOverflows — desborde medido, no contado', () => {
  it('mismo alto: no desborda', () => {
    expect(descriptionOverflows(48, 48)).toBe(false)
  })

  it('un píxel de más no cuenta: el +1 absorbe el redondeo subpíxel', () => {
    expect(descriptionOverflows(49, 48)).toBe(false)
  })

  it('dos píxeles o más: desborda', () => {
    expect(descriptionOverflows(50, 48)).toBe(true)
    expect(descriptionOverflows(64, 48)).toBe(true)
  })
})

describe('showDescriptionToggle — cuándo se ve el botón', () => {
  it('sin desborde y cerrada: no hay botón', () => {
    expect(showDescriptionToggle(false, false)).toBe(false)
  })

  it('desborda y cerrada: aparece "Ver más"', () => {
    expect(showDescriptionToggle(true, false)).toBe(true)
  })

  it('abierta: el botón sigue aunque ya no desborde (es la única forma de cerrarla)', () => {
    expect(showDescriptionToggle(false, true)).toBe(true)
  })
})

describe('ServiceDescription — render de servidor', () => {
  const text = 'Corte con lavado, secado y peinado. Incluye asesoramiento de estilo y productos de terminación para el pelo.'

  it('pinta el párrafo con el id, recortado a tres renglones y partiendo palabras largas, sin botón', () => {
    const html = renderToStaticMarkup(<ServiceDescription text={text} name="Corte" id="svc-desc-test" />)
    expect(html).toContain('id="svc-desc-test"')
    expect(html).toContain('line-clamp-3')
    expect(html).toContain('break-words')
    expect(html).not.toContain('<button')
  })

  it('la descripción viaja como texto: un <script> sale escapado', () => {
    const html = renderToStaticMarkup(
      <ServiceDescription text={'<script>alert(1)</script>'} name="X" id="svc-desc-xss" />
    )
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('respeta el className del call site en el párrafo', () => {
    const html = renderToStaticMarkup(
      <ServiceDescription text={text} name="Corte" id="svc-desc-cls" className="mt-2 text-xs text-muted-foreground" />
    )
    expect(html).toMatch(/<p[^>]*class="[^"]*text-muted-foreground[^"]*"/)
  })
})
