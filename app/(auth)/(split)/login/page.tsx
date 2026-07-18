'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/google-button'
import { MobileLoginHero } from '@/components/auth/mobile-login-hero'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormData = z.infer<typeof schema>

// D-05/D-08: /auth/callback manda acá TODO fallo del OAuth de Google (error del proveedor o
// cancelación del consent, que vuelve con ?error=) con ?error=oauth. /login es el destino ÚNICO del
// error OAuth (D-08), así que el aviso vive solo acá y no en /register.
//
// Espeja InvalidLinkNotice de /forgot-password: vive en su propio componente para que el boundary de
// Suspense de abajo suspenda SOLO el aviso y NO el form, que se sigue prerenderizando. role="status"
// y no role="alert": al llegar acá esto no interrumpe nada, es el estado de la pantalla. Sin
// text-destructive a full — es información con una salida clara, no una pantalla muerta.
function OAuthErrorNotice() {
  const params = useSearchParams()
  // Se compara contra un literal fijo y NUNCA se refleja el valor de la query (input no confiable).
  if (params.get('error') !== 'oauth') return null
  return (
    <div role="status" className="border border-border bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm mb-6">
      No pudimos entrar con Google. Probá de nuevo, o entrá con tu email y contraseña.
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (error) {
      toast.error('Email o contraseña incorrectos')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      {/* Desktop (≥760px): el split lado-a-lado de siempre. En mobile lo reemplaza <MobileLoginHero />
          (hero full-screen + bottom sheet), que se monta abajo como overlay fixed. Se oculta acá — y no
          en el layout— porque el (split)/layout es compartido con forgot/reset, que NO llevan hero. */}
      <div className="hidden min-[760px]:block">
      {/* El aviso va arriba del todo para que sea lo primero que se ve al volver con ?error=oauth. El
          boundary de Suspense es OBLIGATORIO: en el build de prod, un client component estático que lee
          search params rompe el build sin él (mismo motivo que forgot-password, use-search-params.md de
          Next 16). fallback={null} sigue el precedente del repo. */}
      <Suspense fallback={null}>
        <OAuthErrorNotice />
      </Suspense>
      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Iniciá sesión</h1>
      <p className="text-muted-foreground text-sm mt-1.5 mb-6">Entrá a tu panel de Forjo Gestión</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-destructive text-sm">{errors.email.message}</p>
          )}
        </div>
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
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Ingresando...' : 'Entrar'}
        </Button>
      </form>
      {/* Divisor "o" entre el form y el botón de Google. El chip lleva el color del panel crema
          (#f3ead8) para cortar la línea por detrás del texto: NO usa bg-background porque en el skin
          .auth-cream-panel ese token es #fff9ec (la superficie de los campos, más clara que el panel),
          y quedaría una caja visible. En /register el divisor usa bg-card (la superficie del Card). */}
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-[#f3ead8] px-2 text-xs text-muted-foreground">o</span>
        </div>
      </div>
      <GoogleButton />
      {/* Zona de links secundarios (D-04): el link de recuperación va debajo del botón Entrar y
          arriba del link de registro, no en la fila del label Contraseña, para que los links
          secundarios queden agrupados en un solo lugar.
          El py-2 no es estético: un link de una línea en text-sm no llega a los 44px de touch target
          que pide CLAUDE.md §UI/UX; el mt-2 compensa el padding para que la separación visual con el
          botón quede en la escala de siempre. */}
      <p className="text-center text-sm mt-2">
        <Link href="/forgot-password" className="text-primary hover:underline inline-block py-2">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
      <p className="text-center text-sm text-muted-foreground mt-1">
        ¿No tenés cuenta?{' '}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Creá tu negocio
        </Link>
      </p>
      </div>
      {/* Mobile (≤760px): hero full-screen + bottom sheet. Overlay fixed inset-0 que tapa la columna
          del form; en desktop queda display:none (min-[760px]:hidden) y manda el split de arriba. */}
      <MobileLoginHero />
    </>
  )
}
