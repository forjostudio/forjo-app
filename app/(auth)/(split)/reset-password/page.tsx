'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { INVALID_LINK_DEST } from '@/lib/auth/callback'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'

// Seteo de la contraseña nueva (AUTH-02). El split Bauhaus lo aporta el layout del route group
// (split): esta página arranca directo en el h1.
//
// De dónde sale la sesión: la creó /auth/callback canjeando el token del mail (verifyOtp), y es la
// ÚNICA fuente de sesión de este flujo. Por eso el guard de abajo no es decorativo — sin sesión no hay
// nada que hacer acá, y renderizar el form igual dejaría una pantalla muerta.
//
// Orden del submit (no invertir, ver el comentario del onSubmit): primero se escribe la contraseña,
// después se cierran las otras sesiones.
//
// Destino: /dashboard a secas (D-16). El guard del panel ya resuelve al que no tiene negocio y al
// suspendido; duplicar esa lógica en una pantalla de auth sería una segunda copia que se desincroniza.

const schema = z.object({
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Guard de sesión. Va en la PÁGINA y no en el proxy a propósito: sumar esta ruta a las listas de
  // rutas protegidas del proxy la haría rebotar a /login, que es justo el "error opaco" que D-18
  // prohíbe. Sin sesión → INVALID_LINK_DEST, o sea el mismo lugar donde el callback deja a todo link
  // vencido o ya usado: el aviso y el campo para pedir uno nuevo, en la misma pantalla.
  //
  // `replace` y no `push`: el que rebota no debe poder volver con el botón Atrás a una pantalla muerta.
  // La higiene del efecto async (`cancelled`) se copia de components/dashboard/plan-banner.tsx:44-61.
  // `supabase` puede ir en las deps sin re-disparar el efecto: createBrowserClient cachea la instancia
  // en el navegador, así que la referencia es estable entre renders.
  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.replace(INVALID_LINK_DEST)
        return
      }
      setChecking(false)
    }
    check()
    return () => { cancelled = true }
  }, [router, supabase])

  async function onSubmit(data: FormData) {
    setLoading(true)

    // Paso 1 — la contraseña PRIMERO. Al revés, la sesión actual podría quedar sin token válido para
    // autorizar esta escritura.
    const { error } = await supabase.auth.updateUser({ password: data.password })
    if (error) {
      // Acá mostrar el fallo SÍ está permitido (a diferencia de /forgot-password): el usuario ya está
      // autenticado por el token, así que no hay oráculo de enumeration posible. Se queda en la página
      // para reintentar.
      toast.error(error.message)
      setLoading(false)
      return
    }

    // Paso 2 — cerrar las otras sesiones (D-17). Es lo único que hace que "recuperar la cuenta" sirva
    // cuando alguien te la robó: si no, el intruso se queda adentro con su sesión y el dueño cree que
    // lo echó. El alcance elegido no dispara sign-out en la sesión actual, que sobrevive.
    // Si falla, NO se rompe el flujo: la contraseña ya se cambió, que es lo que el usuario pidió.
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' })
    if (signOutError) console.error('[reset-password] signOut others:', signOutError.message)

    // Paso 3 — adentro del panel (D-16).
    router.push('/dashboard')
    router.refresh()
  }

  // Mientras se resuelve el guard no se renderiza el form: sin esto se ve un flash del form antes del
  // redirect del que llegó sin sesión.
  if (checking) {
    return <p className="text-muted-foreground text-sm">Cargando...</p>
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Creá tu contraseña nueva</h1>
      <p className="text-muted-foreground text-sm mt-1.5 mb-6">Con esta contraseña vas a entrar de ahora en más.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <PasswordInput
            id="password"
            placeholder="••••••••"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-destructive text-sm">{errors.password.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
          <PasswordInput
            id="confirmPassword"
            placeholder="••••••••"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="text-destructive text-sm">{errors.confirmPassword.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar y entrar'}
        </Button>
      </form>
      {/* El aviso va ANTES de la acción, no después: D-17 acepta el precio de que el olvidadizo tenga
          que volver a entrar en el celu, y el trato es cubrirlo con copy. Avisar después de hacerlo no
          es avisar. */}
      <p className="text-muted-foreground text-xs mt-3">
        Al guardar, se cierran tus sesiones abiertas en otros dispositivos. Vas a tener que volver a entrar ahí.
      </p>
    </>
  )
}
