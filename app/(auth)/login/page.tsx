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
    <div className="min-h-screen flex items-stretch bg-background text-foreground">
      {/* Panel izquierdo Bauhaus — bg-primary + formas geométricas (oculto en mobile) */}
      <div className="hidden md:flex flex-1 relative overflow-hidden bg-primary text-primary-foreground p-12 flex-col justify-between">
        <svg className="absolute inset-0 w-full h-full opacity-90" viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <circle cx="420" cy="120" r="90" fill="rgba(255,255,255,.10)" />
          <rect x="60" y="430" width="120" height="120" fill="rgba(0,0,0,.12)" />
          <path d="M360 480 L470 480 L470 590 Z" fill="rgba(255,255,255,.08)" />
          <rect x="300" y="300" width="50" height="50" fill="rgba(255,255,255,.12)" />
        </svg>
        <div className="relative flex items-center gap-3">
          <svg width="30" height="38" viewBox="0 0 64 80" aria-hidden="true">
            <rect x="6" y="6" width="14" height="68" fill="currentColor" />
            <rect x="20" y="6" width="38" height="14" fill="#f4c543" />
            <path d="M20 34 L50 34 L36 48 L20 48 Z" fill="rgba(255,255,255,.65)" />
            <circle cx="56" cy="13" r="6" fill="rgba(255,255,255,.85)" />
          </svg>
          <span className="font-[family-name:var(--font-heading)] font-black text-2xl">Forjo <span className="font-medium opacity-85">Studio</span></span>
        </div>
        <h2 className="relative font-[family-name:var(--font-heading)] font-black uppercase leading-none tracking-tight text-[clamp(30px,4vw,46px)]">
          Tus turnos,<br />clientes y<br />finanzas en<br />un solo lugar.
        </h2>
        <p className="relative text-sm opacity-80">© Forjo Studio · Gestión de turnos para tu negocio</p>
      </div>

      {/* Columna derecha — formulario */}
      <div className="w-full md:w-[440px] flex items-center justify-center p-8 sm:p-10">
        <div className="w-full max-w-[340px]">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Iniciá sesión</h1>
          <p className="text-muted-foreground text-sm mt-1.5 mb-6">Entrá a tu panel de Forjo Studio</p>
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
          <p className="text-center text-sm text-muted-foreground mt-5">
            ¿No tenés cuenta?{' '}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Creá tu negocio
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
