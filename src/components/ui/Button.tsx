import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro'
type Tamano = 'sm' | 'md' | 'icono'

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-acento border border-acento text-white hover:bg-acento-fuerte hover:border-acento-fuerte',
  secundario: 'bg-superficie text-texto border border-borde-fuerte hover:border-tenue',
  fantasma: 'border border-transparent text-suave hover:text-texto hover:bg-elevada',
  peligro: 'bg-superficie text-peligro border border-peligro-tenue hover:border-peligro/60',
}

const TAMANOS: Record<Tamano, string> = {
  sm: 'min-h-[38px] px-3 text-sm gap-1.5',
  md: 'min-h-11 px-[18px] text-[15px] gap-2',
  icono: 'size-10 justify-center',
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
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[11px] font-semibold transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTES[variant],
        TAMANOS[size],
        className,
      )}
      {...props}
    />
  )
}
