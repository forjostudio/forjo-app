import Link from 'next/link'
import { XCircle } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PagoFallido({ params }: Props) {
  const { slug } = await params

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-destructive/15">
          <XCircle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">El pago no se completó</h1>
        <p className="text-muted-foreground mb-6">Por favor intentá de nuevo o elegí otro método.</p>
        <Link
          href={`/${slug}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Volver e intentar de nuevo
        </Link>
      </div>
    </div>
  )
}
