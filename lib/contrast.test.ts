import { describe, it, expect } from 'vitest'
import { onAccentText } from '@/lib/contrast'

// ── Tests PUROS del color de texto sobre el acento del negocio (IN-05) ───────────────────────────
// `businesses.primary_color` lo edita el dueño: el helper tiene que devolver el candidato de MAYOR
// contraste WCAG, no un blanco fijo. Sin DB ni red: es una función de un string a un string.

describe('onAccentText', () => {
  it('devuelve blanco sobre fondos oscuros', () => {
    expect(onAccentText('#1a1714')).toBe('#ffffff')
    expect(onAccentText('#000000')).toBe('#ffffff')
    expect(onAccentText('#2a5fa5')).toBe('#ffffff')
  })

  it('devuelve blanco sobre el naranja por defecto del proyecto', () => {
    // #d94a2b es el acento de fallback de las pantallas públicas: los dos candidatos quedan casi
    // empatados (~4.2:1) y gana el blanco, que es además el comportamiento previo — cero regresión.
    expect(onAccentText('#d94a2b')).toBe('#ffffff')
  })

  it('devuelve el near-black sobre fondos claros', () => {
    expect(onAccentText('#ffff00')).toBe('#1a1714')
    expect(onAccentText('#e8f5a0')).toBe('#1a1714')
    expect(onAccentText('#ffffff')).toBe('#1a1714')
  })

  it('parsea la forma corta igual que la larga', () => {
    expect(onAccentText('#fff')).toBe(onAccentText('#ffffff'))
    expect(onAccentText('#000')).toBe(onAccentText('#000000'))
  })

  it('acepta el hex sin numeral y con espacios alrededor', () => {
    expect(onAccentText('ffff00')).toBe('#1a1714')
    expect(onAccentText('  #1a1714  ')).toBe('#ffffff')
  })

  it('devuelve blanco ante cualquier entrada que no parsea, sin tirar', () => {
    expect(onAccentText('')).toBe('#ffffff')
    expect(onAccentText('rojo')).toBe('#ffffff')
    expect(onAccentText('#zzz')).toBe('#ffffff')
    expect(onAccentText('#12345')).toBe('#ffffff')
    expect(onAccentText(undefined as unknown as string)).toBe('#ffffff')
  })
})
