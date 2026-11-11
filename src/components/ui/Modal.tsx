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

/** Editor en hoja lateral (derecha en escritorio, pantalla completa en celular). */
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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onCerrar} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-borde bg-fondo pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl animate-hoja sm:w-[min(660px,100%)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-borde px-4 py-[18px] sm:px-6">
          <h2 className="text-[22px] font-bold">{titulo}</h2>
          <Button variant="fantasma" size="icono" onClick={onCerrar} aria-label="Cerrar">
            <X className="size-5" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">{children}</div>
        {pie && (
          <footer className="flex flex-wrap items-center gap-2.5 border-t border-borde bg-superficie px-4 py-3.5 sm:px-6">
            {pie}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
