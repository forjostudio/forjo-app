import { describe, it, expect } from 'vitest'
import { revealScrollDelta } from '@/lib/reveal-in-container'

// La cuenta de "llevar el calendario a la vista" (quick 261006-iey, pedido del dueño). El runner no
// tiene jsdom, así que lo que se cubre es la decisión sobre las medidas, no la medición.
// Convención de los casos: el contenedor es la ventana [0, 400] del viewport.

describe('revealScrollDelta', () => {
  it('si el elemento ya entra entero, no scrollea nada', () => {
    expect(revealScrollDelta({ containerTop: 0, containerBottom: 400, elementTop: 100, elementBottom: 300 })).toBe(0)
  })

  it('baja exactamente lo que falta para ver el final, más el margen', () => {
    // Al calendario le sobran 50px por abajo; con 12 de aire, 62.
    expect(revealScrollDelta({ containerTop: 0, containerBottom: 400, elementTop: 200, elementBottom: 450, margin: 12 })).toBe(62)
  })

  it('el margen por sí solo puede disparar el scroll (que no quede pegado al borde)', () => {
    expect(revealScrollDelta({ containerTop: 0, containerBottom: 400, elementTop: 200, elementBottom: 400, margin: 12 })).toBe(12)
  })

  it('NUNCA empuja el borde de arriba del elemento fuera de la vista', () => {
    // Un calendario de 500px en un contenedor de 400: faltan 180, pero arriba sólo hay 80 de espacio.
    // Se baja 80 y no 180 — si no, el dueño pierde de vista el principio del calendario y el campo
    // que lo abrió.
    expect(revealScrollDelta({ containerTop: 0, containerBottom: 400, elementTop: 80, elementBottom: 580 })).toBe(80)
  })

  it('si el elemento ya arranca arriba del contenedor, no hace nada (esta función sólo baja)', () => {
    expect(revealScrollDelta({ containerTop: 0, containerBottom: 400, elementTop: -50, elementBottom: 600 })).toBe(0)
  })

  it('funciona con el contenedor desplazado en el viewport (no asume que empiece en 0)', () => {
    // El drawer arranca a 300px del tope de la pantalla: la cuenta es relativa, no absoluta.
    expect(revealScrollDelta({ containerTop: 300, containerBottom: 700, elementTop: 500, elementBottom: 760, margin: 8 })).toBe(68)
  })
})
