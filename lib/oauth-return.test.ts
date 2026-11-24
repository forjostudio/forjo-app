import { describe, it, expect } from 'vitest'
import {
  oauthReturnPath,
  resolveOAuthReturn,
  oauthReturnNotice,
  resolveMpErrorReason,
  MP_ERROR_REASONS,
  MP_CUENTA_EN_USO_TEXTO,
  MP_RETURN,
  GOOGLE_RETURN,
  type OAuthReturnToken,
} from '@/lib/oauth-return'

// ── Test PURO: sin red, sin credenciales, sin Supabase ─────────────────────────────────────────
// Importa SOLO de @/lib/oauth-return. Nada del helper de entorno de la carpeta test/ (eso es la marca
// de un test de integración y lo mandaría al carril `db`). Analog: lib/auth/callback.test.ts.
//
// Qué protege: el destino de vuelta de los dos OAuth (MercadoPago Connect y Google Calendar) sale de
// una lista CERRADA de tokens (anti open-redirect T-05-02 / T-q8v-01). Cualquier valor que no esté
// textual en la lista del proveedor cae al default de ese proveedor.

const TOKENS: OAuthReturnToken[] = ['negocio', 'agenda', 'onboarding']

// Basura que llega por `?from=` o por una cookie editada a mano.
const JUNK: Array<string | null | undefined> = [
  null,
  undefined,
  '',
  '__proto__',
  'constructor',
  'toString',
  'https://evil.example',
  '//evil.example',
  '/onboarding/integraciones',
  'ONBOARDING',
  ' onboarding',
]

describe('oauthReturnPath', () => {
  it('mapea cada token a su path', () => {
    expect(oauthReturnPath('negocio')).toBe('/negocio')
    expect(oauthReturnPath('agenda')).toBe('/agenda')
    expect(oauthReturnPath('onboarding')).toBe('/onboarding/integraciones')
  })

  it('todo path es relativo al sitio: una sola / seguida de una letra (nunca //, nunca esquema)', () => {
    for (const t of TOKENS) {
      expect(oauthReturnPath(t)).toMatch(/^\/[a-z]/)
      expect(oauthReturnPath(t).startsWith('//')).toBe(false)
      expect(oauthReturnPath(t)).not.toContain(':')
    }
  })
})

describe('resolveOAuthReturn — MercadoPago (MP_RETURN)', () => {
  it('acepta onboarding y negocio', () => {
    expect(resolveOAuthReturn('onboarding', MP_RETURN)).toBe('onboarding')
    expect(resolveOAuthReturn('negocio', MP_RETURN)).toBe('negocio')
  })

  it('agenda NO está en la lista de MP (la Agenda no maneja ?mp=) → negocio', () => {
    expect(resolveOAuthReturn('agenda', MP_RETURN)).toBe('negocio')
  })

  it.each(JUNK.map(v => [v]))('basura %j → negocio', (raw) => {
    expect(resolveOAuthReturn(raw, MP_RETURN)).toBe('negocio')
  })
})

describe('resolveOAuthReturn — Google (GOOGLE_RETURN)', () => {
  it('acepta los tres tokens tal cual', () => {
    for (const t of TOKENS) expect(resolveOAuthReturn(t, GOOGLE_RETURN)).toBe(t)
  })

  it.each(JUNK.map(v => [v]))('basura %j → agenda (el default de hoy)', (raw) => {
    expect(resolveOAuthReturn(raw, GOOGLE_RETURN)).toBe('agenda')
  })
})

describe('presets', () => {
  it('el fallback de cada preset está dentro de su propia lista', () => {
    expect(MP_RETURN.allowed).toContain(MP_RETURN.fallback)
    expect(GOOGLE_RETURN.allowed).toContain(GOOGLE_RETURN.fallback)
  })
})

// ── IN-02 (review del quick): el aviso de la vuelta lo decide el estado REAL del server ──────────
// El `?mp=`/`?google=` de la URL sólo dice que hubo una vuelta; qué se le muestra al dueño sale del
// booleano leído de la base. Así nunca conviven un «Conectado» en la tarjeta y un error en el toast,
// ni un «conectado» anunciado que la base no confirma.
describe('oauthReturnNotice', () => {
  it.each([
    ['connected', true, 'success'],
    ['error', true, 'success'], // la reconexión falló pero la conexión anterior sigue sana
    ['error', false, 'error'],
    ['connected', false, 'unconfirmed'], // p. ej. `?mp=connected` fabricado, o el callback no dejó mp_user_id
  ] as const)('?…=%s con conectado=%s → %s', (result, connected, expected) => {
    expect(oauthReturnNotice(result, connected)).toBe(expected)
  })

  it.each([null, '', 'ok', 'CONNECTED', '__proto__'].flatMap(v => [[v, true], [v, false]] as const))(
    'valor %j (conectado=%s) → sin aviso',
    (result, connected) => {
      expect(oauthReturnNotice(result, connected)).toBeNull()
    },
  )

  // quick 261124-obs: el motivo sólo cuenta con `error`, y sólo si es un token de la lista cerrada.
  it.each([
    ['error', false, 'cuenta-en-uso', 'cuenta-en-uso'],
    ['error', true, 'cuenta-en-uso', 'cuenta-en-uso'], // tenía otra cuenta: la tarjeta sigue «Conectado», el aviso explica el rechazo
    ['error', false, 'inventado', 'error'],
    ['error', true, 'inventado', 'success'], // como hoy
    ['connected', true, 'cuenta-en-uso', 'success'],
    ['connected', false, 'cuenta-en-uso', 'unconfirmed'],
    [null, true, 'cuenta-en-uso', null],
    [null, false, 'cuenta-en-uso', null],
  ] as const)('?mp=%s con conectado=%s y motivo=%s → %s', (result, connected, motivo, expected) => {
    expect(oauthReturnNotice(result, connected, motivo)).toBe(expected)
  })
})

// ── Motivo del error de la vuelta (quick 261124-obs) ──
// El `?motivo=` es texto que cualquiera puede pegar en un link: sólo vale un token textual de la lista.
describe('resolveMpErrorReason', () => {
  it('cada token de la lista se resuelve a sí mismo', () => {
    expect(resolveMpErrorReason('cuenta-en-uso')).toBe('cuenta-en-uso')
    for (const t of MP_ERROR_REASONS) expect(resolveMpErrorReason(t)).toBe(t)
  })

  it.each([null, undefined, '', 'Cuenta-En-Uso', ' cuenta-en-uso', 'cuenta-en-uso ', '__proto__', 'constructor', 'inventado', 'cuenta-en-uso&x=1'])(
    'valor %j → null',
    raw => {
      expect(resolveMpErrorReason(raw)).toBeNull()
    },
  )

  it('el texto de cuenta en uso no abre con ¿/¡ y nombra al otro negocio', () => {
    expect(MP_CUENTA_EN_USO_TEXTO).not.toMatch(/[¿¡]/)
    expect(MP_CUENTA_EN_USO_TEXTO).toContain('otro negocio')
  })
})
