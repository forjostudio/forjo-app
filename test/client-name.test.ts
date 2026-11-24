import { describe, it, expect } from 'vitest'
import { clientFullName, normalizeLastName } from '@/lib/client-name'
import { buildClientInsert } from '@/lib/clients-create'

// ── Suite PURA del nombre completo del cliente (quick 261124-lfd) ─────────────────────────────
// clientFullName es la ÚNICA fuente del «Nombre Apellido» que el panel muestra para un cliente de la
// tabla clients; normalizeLastName es la normalización que usan los tres escritores del apellido
// (alta manual, edición de la ficha, import). No toca la base: no importa test/env.

describe('clientFullName', () => {
  it('junta nombre y apellido con un espacio', () => {
    expect(clientFullName({ name: 'Ana', last_name: 'Pérez' })).toBe('Ana Pérez')
  })

  it('sin apellido (null, undefined, vacío o solo espacios) devuelve solo el nombre', () => {
    expect(clientFullName({ name: 'Ana', last_name: null })).toBe('Ana')
    expect(clientFullName({ name: 'Ana', last_name: undefined })).toBe('Ana')
    expect(clientFullName({ name: 'Ana' })).toBe('Ana')
    expect(clientFullName({ name: 'Ana', last_name: '' })).toBe('Ana')
    expect(clientFullName({ name: 'Ana', last_name: '   ' })).toBe('Ana')
  })

  it('recorta los dos lados de cada parte', () => {
    expect(clientFullName({ name: ' Ana ', last_name: ' Pérez ' })).toBe('Ana Pérez')
  })

  it('nombre vacío con apellido devuelve el apellido', () => {
    expect(clientFullName({ name: '', last_name: 'Pérez' })).toBe('Pérez')
  })

  it('null o undefined devuelve cadena vacía', () => {
    expect(clientFullName(null)).toBe('')
    expect(clientFullName(undefined)).toBe('')
  })

  it('la búsqueda por apellido y por nombre completo funciona con el includes de siempre', () => {
    const full = clientFullName({ name: 'Ana', last_name: 'Pérez' }).toLowerCase()
    expect(full.includes('pérez')).toBe(true)
    expect(full.includes('ana p')).toBe(true)
  })
})

describe('normalizeLastName', () => {
  it('recorta un apellido con espacios', () => {
    expect(normalizeLastName('  Pérez ')).toBe('Pérez')
  })

  it('vacío, solo espacios o cualquier cosa que no sea string → null', () => {
    expect(normalizeLastName('')).toBeNull()
    expect(normalizeLastName('   ')).toBeNull()
    expect(normalizeLastName(null)).toBeNull()
    expect(normalizeLastName(undefined)).toBeNull()
    expect(normalizeLastName(123)).toBeNull()
    expect(normalizeLastName({})).toBeNull()
  })
})

describe('buildClientInsert con apellido', () => {
  const base = { name: 'Ana', phone: '1122334455', email: null, notes: null, insurance_name: null, insurance_number: null }

  it('con last_name lo escribe en el payload; business_id y origin sin cambios', () => {
    const payload = buildClientInsert({ id: 'biz-1' }, { ...base, last_name: 'Pérez' })
    expect(payload.last_name).toBe('Pérez')
    expect(payload.business_id).toBe('biz-1')
    expect(payload.origin).toBe('manual')
  })

  it('sin last_name en el input → payload.last_name null', () => {
    const payload = buildClientInsert({ id: 'biz-1' }, base, 'importado')
    expect(payload.last_name).toBeNull()
    expect(payload.business_id).toBe('biz-1')
    expect(payload.origin).toBe('importado')
  })
})
