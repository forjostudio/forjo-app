'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

// Botón OAuth compartido por /login y /register (D-03): Google es el mismo flujo para alta y login
// (el nuevo se registra, el recurrente inicia sesión), así que es UN solo botón montado en las dos
// pantallas y visualmente consistente entre ellas (AUTH-03).
//
// SEGURIDAD (T-05-02, anti open-redirect): el `redirectTo` es SIEMPRE el callback fijo
// `${window.location.origin}/auth/callback` — nunca el destino final y nunca un valor que venga de un
// input del usuario. El destino real lo deriva server-side el callback (plan 05-01) desde su tabla
// cerrada DESTINATIONS. Usar el `origin` del propio navegador además garantiza que el `code_verifier`
// PKCE (que Supabase deja en cookie del host de la app) vuelva al mismo host que inició el flujo
// (Pitfall 1/2 del RESEARCH).
//
// El glifo de Google va inline como SVG (Pitfall 5): lucide-react NO trae el logo oficial multicolor,
// y los brand guidelines de Google Sign-In lo exigen. No se instala ningún paquete de íconos de marca.

export function GoogleButton() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function signIn() {
    // Deshabilita el botón para evitar doble click (design system §UI/UX).
    setLoading(true)
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // SIEMPRE el callback fijo, nunca un input ni el destino final (T-05-02).
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      // signInWithOAuth redirige el navegador al consent de Google: en el camino feliz esta página se
      // va, así que no hace falta resetear `loading`. El único caso donde el botón sigue en pantalla es
      // un error de red al iniciar el round-trip → se cubre en el catch.
    } catch {
      setLoading(false)
      toast.error('No se pudo conectar con Google, probá de nuevo')
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={loading}
      onClick={signIn}
    >
      {/* Glifo "G" oficial de Google (4 colores de marca), decorativo: el nombre accesible del botón
          lo da su texto, por eso aria-hidden. size-4 para calzar con los íconos lucide del proyecto. */}
      <svg className="size-4" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
        <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
        <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
        <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
      </svg>
      {loading ? 'Conectando...' : 'Continuar con Google'}
    </Button>
  )
}
