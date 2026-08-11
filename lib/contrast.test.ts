import { describe, it, expect } from 'vitest'
import { onAccentText, contrastRatioHex } from '@/lib/contrast'

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

// ── contrastRatioHex (T-14-41) ───────────────────────────────────────────────────────────────────
// Se expone la matemática que onAccentText ya usaba adentro, para que las verificaciones de
// contraste de la UI vivan en test y no en un comentario. La consume
// components/crm/confirm-dialog.test.tsx para congelar los pares del outline destructivo del panel.
describe('contrastRatioHex', () => {
  it('los extremos del rango WCAG: idénticos = 1, negro/blanco = 21', () => {
    expect(contrastRatioHex('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrastRatioHex('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('es simétrico (el orden de los argumentos no cambia el ratio)', () => {
    expect(contrastRatioHex('#b23a26', '#fbf3e3')).toBe(contrastRatioHex('#fbf3e3', '#b23a26'))
  })

  it('reproduce los ratios ya documentados en app/globals.css', () => {
    // Los dos pares RELLENOS de la superficie de peligro del tema Forjo, con el valor que el propio
    // CSS declara en su comentario: si alguno se moviera, el comentario del CSS quedaría mintiendo.
    expect(contrastRatioHex('#fbf3e3', '#b23a26')!).toBeCloseTo(5.4, 1) // claro: crema sobre rojo
    expect(contrastRatioHex('#1a1714', '#e05c43')!).toBeCloseTo(4.91, 1) // oscuro: ink sobre rojo claro
  })

  it('devuelve null si alguno de los dos no parsea (en vez de un NaN silencioso)', () => {
    expect(contrastRatioHex('rojo', '#ffffff')).toBeNull()
    expect(contrastRatioHex('#ffffff', '')).toBeNull()
  })

  it('acepta la forma corta y el hex sin numeral, igual que onAccentText', () => {
    expect(contrastRatioHex('#fff', '#000')).toBe(contrastRatioHex('ffffff', '000000'))
  })
})
