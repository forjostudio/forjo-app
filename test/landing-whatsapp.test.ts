import { describe, it, expect } from 'vitest'
import { normalizeArWhatsApp } from '@/lib/whatsapp'

// El botón flotante de WhatsApp del landing NO tiene lógica propia: renderiza si —y solo si—
// normalizeArWhatsApp puede formar un número. Este test congela ese contrato (el componente es
// RSC puro y el render se valida por UAT; acá se prueba la decisión de mostrarlo o no).
describe('WhatsApp flotante — la decisión de mostrarlo', () => {
  it('con un número válido arma el destino de wa.me', () => {
    expect(normalizeArWhatsApp('+54 9 11 1234-5678')).toBe('5491112345678')
    expect(normalizeArWhatsApp('011 15 1234-5678')).toBe('5491112345678')
  })

  // Sin número (o con uno que no se puede normalizar) el botón NO se renderiza: mejor sin botón
  // que con un link roto que abre WhatsApp en la nada.
  it('sin número o con basura devuelve null → el botón no se renderiza', () => {
    expect(normalizeArWhatsApp(null)).toBeNull()
    expect(normalizeArWhatsApp('')).toBeNull()
    expect(normalizeArWhatsApp('123')).toBeNull()
    expect(normalizeArWhatsApp('no es un teléfono')).toBeNull()
  })
})
