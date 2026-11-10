import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'
type Tamano = 'sm' | 'md' | 'icono'

const VARIANTES: Record<Variante, string> = {
  primario:
    'bg-acento text-fondo hover:bg-acento-fuerte hover:text-white shadow-[0_0_0_1px_rgb(167_139_250/0.4),0_8px_24px_-8px_rgb(139_92_246/0.6)]',
  secundario: 'bg-elevada text-texto border border-borde hover:border-borde-fuerte hover:bg-hover',
  fantasma: 'text-suave hover:text-texto hover:bg-hover',
  peligro: 'bg-peligro/10 text-peligro border border-peligro/30 hover:bg-peligro/20',
}

const TAMANOS: Record<Tamano, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  icono: 'size-9 justify-center',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variante
  size?: Tamano
}

export function Button({ variant = 'primario', size = 'md', className, type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center rounded-lg font-medium transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento',
        'disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        VARIANTES[variant],
        TAMANOS[size],
        className,
      )}
      {...props}
    />
  )
}
