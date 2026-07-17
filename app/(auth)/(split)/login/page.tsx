'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormData = z.infer<typeof schema>

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
          <Input
            id="password"
            type="password"
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
    </>
  )
}
