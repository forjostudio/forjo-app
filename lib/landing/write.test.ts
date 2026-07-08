import { describe, it, expect } from 'vitest'
import { parseLandingConfigForWrite } from './write'
import { DEFAULT_LANDING_CONFIG } from './schema'

// Unit tests del validador de ESCRITURA (reject-on-invalid). El contraste con `parseLandingConfig`
// (contrato de RENDER que coacciona a DEFAULT) es la propiedad central que probamos: al escribir,
// un config inválido se RECHAZA, no se degrada silenciosamente al default.
describe('parseLandingConfigForWrite', () => {
  // (1) Inválido → rechaza SIN devolver DEFAULT_LANDING_CONFIG (delta vs parseLandingConfig, SC1).
  it('rechaza un config inválido con invalid_config y NO devuelve DEFAULT_LANDING_CONFIG', () => {
    const res = parseLandingConfigForWrite({ theme: 123 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('invalid_config')
    // Clave: el retorno no expone `data` alguno, y menos el default (que sí devolvería parseLandingConfig).
    expect(res).not.toHaveProperty('data')
    expect(res).not.toMatchObject(DEFAULT_LANDING_CONFIG)
  })

  // (2) Claves desconocidas top-level → estripadas por z.object (no re-abre la fuga de secretos v0.9).
  // Usamos `__secret` como nombre GENÉRICO: no hardcodear el nombre real de la clave secreta de v0.9.
  it('estripa las claves desconocidas del envelope antes de escribir', () => {
    const res = parseLandingConfigForWrite({
      theme: { preset: 'forjo' },
      sections: [],
      evil: 'x',
      __secret: 'y',
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect('evil' in res.data).toBe(false)
      expect('__secret' in res.data).toBe(false)
    }
  })

  // (3) Válido (sections no vacío, motion premium, y un section.data con rsvData) → pasa y matchea.
  it('acepta un config válido y devuelve su data', () => {
    const cfg = {
      theme: { preset: 'forjo' },
      sections: [
        { type: 'hero', enabled: true, order: 0 },
        {
          type: 'booking',
          enabled: true,
          order: 1,
          data: { rsvData: { header: 'Reservá', images: ['https://example.com/a.jpg'] } },
        },
      ],
      motion: 'premium',
    }
    const res = parseLandingConfigForWrite(cfg)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.theme.preset).toBe('forjo')
      expect(res.data.sections).toHaveLength(2)
      expect(res.data.motion).toBe('premium')
    }
  })

  // (4) motion roto → aceptado como undefined (permisivo per-campo, D-03c). El .catch(undefined) del
  // schema degrada un motion basura sin invalidar el envelope entero.
  it('tolera un motion roto degradándolo a undefined (no invalida el config)', () => {
    const res = parseLandingConfigForWrite({ theme: { preset: 'forjo' }, sections: [], motion: 'wat' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data.motion).toBeUndefined()
  })

  // (5) Contrato inválido-no-corrompe: ante un input inválido el retorno es ok:false → la Server Action
  // hace early-return ANTES del .update, así el config real del dueño nunca se pisa con un default.
  it('ante input inválido retorna ok:false (la action no llega a escribir)', () => {
    const res = parseLandingConfigForWrite({ sections: 'not-an-array' })
    expect(res.ok).toBe(false)
  })
})
