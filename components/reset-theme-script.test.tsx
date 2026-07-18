import { describe, it, expect } from 'vitest'
import { ResetThemeScript } from '@/components/reset-theme-script'

// Unit test del script inline que genera ResetThemeScript. No renderiza (environment: 'node'):
// el componente no usa hooks y devuelve un elemento React plano, así que se invoca como función
// y se lee el __html directo desde props (patrón viable sin jsdom).
describe('ResetThemeScript', () => {
  const el = ResetThemeScript()
  const html: string = el.props.dangerouslySetInnerHTML.__html

  it('setea la paleta al default Forjo base (red)', () => {
    // Test 1: fuerza data-palette='red' (el default del root layout = tema Forjo base).
    expect(html).toContain('palette')
    expect(html).toContain('red')
  })

  it('borra el data-theme del tenant', () => {
    // Test 2: elimina el theme heredado del negocio.
    expect(html).toContain('delete d.theme')
  })

  it('borra el data-font del tenant', () => {
    // Test 3: elimina la fuente heredada del negocio.
    expect(html).toContain('delete d.font')
  })

  it('limpia el override de acento del landing (--primary)', () => {
    // Test 4: cierra el vector /[slug] → /login (landing que dejó --primary inline).
    expect(html).toContain('removeProperty')
    expect(html).toContain('--primary')
  })

  it('NO toca classList / la clase .dark (invariante D-03: next-themes es dueño de claro/oscuro)', () => {
    // Test 5: el reset opera SOLO sobre dataset y style, nunca sobre classList.
    expect(html).not.toContain('classList')
  })
})
