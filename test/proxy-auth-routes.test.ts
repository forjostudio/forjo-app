import { describe, it, expect } from 'vitest'
import { isMaintExempt, isKnownRoute, isAuthRoute, isDashboardRoute } from '@/lib/auth/route-lists'

// ── El guardia de la trampa de las listas del Edge (D-21 / D-22 / D-06) ──────────────────────────
// Por qué existe este archivo: las listas de ruteo vivían en DOS archivos distintos (proxy.ts y
// lib/supabase/middleware.ts), tienen efectos DISTINTOS entre sí, y el error clásico —sumar las rutas
// de recuperación a las listas de auth por inercia— NO FALLA EN ROJO. No rompe el build, no rompe
// ningún test: aparece en producción como un bug intermitente y difícil de atribuir (D-22).
//
// Este test es el único guardia automático de esa regla. Es un test PURO: importa solo del módulo de
// listas, no toca red y no necesita credenciales de Supabase ni el helper de entorno de la suite
// (H-06). Tampoco se saltea condicionalmente: si este archivo dejara de correr, la trampa vuelve a
// quedar sin vigilancia.

describe('isMaintExempt — el link del mail sobrevive al mantenimiento (D-21)', () => {
  it('exime /auth y /auth/callback: el token del link se canjea igual con la app en mantenimiento', () => {
    // Sin esto, un link single-use que vence en 1h (D-19) quema su token contra un 503.
    expect(isMaintExempt('/auth')).toBe(true)
    expect(isMaintExempt('/auth/callback')).toBe(true)
  })

  it('NO exime /forgot-password ni /reset-password: caen a la pantalla de mantenimiento a propósito', () => {
    // D-21: si el sistema está caído no hay a dónde entrar igual, y /reset-password ESCRIBE en la base
    // — el mantenimiento existe justo para que nadie escriba.
    expect(isMaintExempt('/forgot-password')).toBe(false)
    expect(isMaintExempt('/reset-password')).toBe(false)
  })

  it('conserva las 3 exenciones que ya existían (webhooks + break-glass del super-admin)', () => {
    expect(isMaintExempt('/api')).toBe(true)
    expect(isMaintExempt('/admin')).toBe(true)
    expect(isMaintExempt('/login')).toBe(true)
    expect(isMaintExempt('/dashboard')).toBe(false)
  })

  it('no sobre-matchea: /auth no cubre /authentication', () => {
    // El matcher es `pathname === p || startsWith(p + '/')`, no un startsWith pelado.
    expect(isMaintExempt('/authentication')).toBe(false)
  })
})

describe('isKnownRoute — las rutas nuevas refrescan la cookie de sesión (D-22)', () => {
  it('reconoce las 3 rutas nuevas: sin esto caen en NextResponse.next() y la cookie queda stale', () => {
    expect(isKnownRoute('/auth/callback')).toBe(true)
    expect(isKnownRoute('/forgot-password')).toBe(true)
    expect(isKnownRoute('/reset-password')).toBe(true)
  })

  it('conserva las rutas conocidas de siempre', () => {
    expect(isKnownRoute('/login')).toBe(true)
    expect(isKnownRoute('/dashboard')).toBe(true)
  })

  it('un slug de booking público sigue siendo desconocido — false DELIBERADO y load-bearing', () => {
    // Este false es lo que hace que /[slug] NO pase por updateSession: es lo que impide que las
    // credenciales del dueño logueado se filtren al flujo anónimo de reservas. Si algún día esto da
    // true, el booking público empieza a ver la sesión del dueño.
    expect(isKnownRoute('/mi-negocio')).toBe(false)
  })
})

describe('isAuthRoute — LA lista que no hay que tocar (D-06)', () => {
  it('NO matchea /forgot-password ni /reset-password', () => {
    // ⚠ Un `true` acá deja SIN SALIDA al dueño: con la sesión abierta en el celu y sin acordarse la
    // contraseña, el proxy lo rebota a /dashboard y no puede llegar a la pantalla de recuperación —
    // que es el ÚNICO camino para cambiar la contraseña (no existe pantalla de "cambiar contraseña"
    // en el panel). Si este test se pone rojo, la respuesta NO es actualizar el expected.
    expect(isAuthRoute('/forgot-password')).toBe(false)
    expect(isAuthRoute('/reset-password')).toBe(false)
  })

  it('sigue matcheando /login y /register (sin cambios respecto de hoy)', () => {
    expect(isAuthRoute('/login')).toBe(true)
    expect(isAuthRoute('/register')).toBe(true)
  })
})

describe('isDashboardRoute — el guard del reset va en la página, no en el proxy (Pitfall 5 / D-18)', () => {
  it('NO matchea /reset-password ni /forgot-password', () => {
    // Un `true` acá haría que el proxy redirija a /login a quien llega con un link válido pero todavía
    // sin sesión: es exactamente el "error opaco" que D-18 prohíbe. El link vencido/usado tiene que
    // caer en /forgot-password en estado de error, no en un rebote al login.
    expect(isDashboardRoute('/reset-password')).toBe(false)
    expect(isDashboardRoute('/forgot-password')).toBe(false)
  })

  it('sigue matcheando el panel (sin cambios respecto de hoy)', () => {
    expect(isDashboardRoute('/dashboard')).toBe(true)
    expect(isDashboardRoute('/onboarding')).toBe(true)
    expect(isDashboardRoute('/admin')).toBe(true)
  })
})
