import { describe, it, expect } from 'vitest'
import {
  apptServiceName,
  apptServicePrice,
  apptServicePriceOrNull,
} from '@/lib/appointment-service'

// ── Tests PUROS del fallback snapshot → join (HIST-03, D-05) ─────────────────────
// Sin Supabase ni creds: el helper no toca la base, así que estos tests NO van bajo
// `describe.skipIf(!hasSupabaseCreds)` (no importan test/env.ts). Espejan el estilo de
// test/landing-derive.test.ts: describe/it/expect + import desde @/lib/...
//
// Lo que se protege acá es la regla que hace que un turno de un servicio YA BORRADO siga
// mostrando su nombre y su precio: el snapshot que escribe el trigger de la migración 065
// manda, y el join a `services` queda sólo como red de seguridad.

describe('apptServiceName', () => {
  it('devuelve el snapshot cuando está poblado', () => {
    expect(apptServiceName({ service_name: 'Corte' })).toBe('Corte')
  })

  it('cae al join cuando el snapshot es null', () => {
    expect(apptServiceName({ service_name: null, services: { name: 'Corte' } })).toBe('Corte')
  })

  it('devuelve "—" cuando no hay ni snapshot ni join', () => {
    expect(apptServiceName({ service_name: null, services: null })).toBe('—')
  })

  it('respeta el fallback explícito', () => {
    expect(apptServiceName({ service_name: null, services: null }, 'Sin servicio')).toBe('Sin servicio')
  })

  it('el snapshot GANA aunque el join exista (D-03: foto inmutable)', () => {
    expect(apptServiceName({ service_name: 'Snapshot', services: { name: 'Actual' } })).toBe('Snapshot')
  })

  it('trata el snapshot ausente (undefined) igual que null', () => {
    expect(apptServiceName({ services: { name: 'Corte' } })).toBe('Corte')
  })

  it('sirve igual para una fila de abonos (misma forma estructural)', () => {
    expect(apptServiceName({ service_name: 'Clase de yoga', services: null })).toBe('Clase de yoga')
  })

  it('acepta el embed en forma de array (como lo tipa supabase-js en los select acotados)', () => {
    expect(apptServiceName({ service_name: null, services: [{ name: 'Corte' }] })).toBe('Corte')
  })

  it('un embed array vacío cae al fallback', () => {
    expect(apptServiceName({ service_name: null, services: [] })).toBe('—')
  })
})

describe('apptServicePrice', () => {
  it('un precio 0 legítimo NO cae al join', () => {
    // Éste es exactamente el bug del `||` que tenía la versión inline: 0 colapsaba con null
    // y el turno pasaba a facturar el precio ACTUAL del servicio.
    expect(apptServicePrice({ service_price: 0, services: { price: 5000 } })).toBe(0)
  })

  it('cae al join cuando el snapshot es null', () => {
    expect(apptServicePrice({ service_price: null, services: { price: 5000 } })).toBe(5000)
  })

  it('devuelve 0 cuando no hay ni snapshot ni join', () => {
    expect(apptServicePrice({ service_price: null, services: null })).toBe(0)
  })

  it('normaliza el numeric de PostgREST que llega como string', () => {
    expect(apptServicePrice({ service_price: '1234.50' })).toBe(1234.5)
  })

  it('el snapshot GANA aunque el join tenga otro precio (D-03)', () => {
    expect(apptServicePrice({ service_price: 3000, services: { price: 5000 } })).toBe(3000)
  })

  it('acepta el embed en forma de array (como lo tipa supabase-js en los select acotados)', () => {
    expect(apptServicePrice({ service_price: null, services: [{ price: 5000 }] })).toBe(5000)
  })
})

describe('apptServicePriceOrNull', () => {
  it('devuelve null cuando no hay ni snapshot ni join', () => {
    expect(apptServicePriceOrNull({ service_price: null, services: null })).toBeNull()
  })

  it('distingue el 0 del "sin precio"', () => {
    expect(apptServicePriceOrNull({ service_price: 0 })).toBe(0)
  })

  it('cae al join cuando el snapshot es null', () => {
    expect(apptServicePriceOrNull({ service_price: null, services: { price: 800 } })).toBe(800)
  })

  it('devuelve null si el join tampoco trae precio', () => {
    expect(apptServicePriceOrNull({ services: { name: 'Corte' } })).toBeNull()
  })
})
