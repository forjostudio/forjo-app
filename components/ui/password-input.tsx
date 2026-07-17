'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Input de contraseña con toggle de visibilidad ("ojito"). Envuelve el Input del design system y le
// suma un botón que alterna type password/text. Pensado para consumirse con react-hook-form: hace
// spread de `...props` (incluido el `ref` que register() pasa como prop en React 19) sobre el Input,
// así el registro del campo sigue funcionando igual que con un Input pelado.
//
// El botón es focusable a propósito (WCAG: todo control interactivo debe poder alcanzarse por teclado)
// y trae su anillo de foco. `pr-9` reserva el espacio del ícono para que el texto no lo pise.
export function PasswordInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        className={cn('pr-9', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-2.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
