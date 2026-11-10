import { cn } from './cn'

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block size-5 animate-spin rounded-full border-2 border-borde-fuerte border-t-acento', className)}
      role="status"
      aria-label="Cargando"
    />
  )
}

export function PantallaCarga() {
  return (
    <div className="flex h-full min-h-60 items-center justify-center">
      <Spinner />
    </div>
  )
}
