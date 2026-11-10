import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from './Button'

interface Props {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  children: ReactNode
  pie?: ReactNode
}

export function Modal({ abierto, onCerrar, titulo, children, pie }: Props) {
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-borde bg-superficie shadow-2xl animate-aparecer sm:max-w-xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-borde px-5 py-4">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <Button variant="fantasma" size="icono" onClick={onCerrar} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {pie && <footer className="flex items-center gap-2 border-t border-borde px-5 py-4">{pie}</footer>}
      </div>
    </div>,
    document.body,
  )
}
