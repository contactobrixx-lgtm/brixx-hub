import type { ReactNode } from 'react'
import { cn } from './cn'

type Tono = 'neutro' | 'acento' | 'ok' | 'aviso' | 'peligro'

const TONOS: Record<Tono, string> = {
  neutro: 'bg-elevada text-suave border-borde',
  acento: 'bg-acento-tenue text-acento border-acento/25',
  ok: 'bg-ok/10 text-ok border-ok/25',
  aviso: 'bg-aviso/10 text-aviso border-aviso/25',
  peligro: 'bg-peligro/10 text-peligro border-peligro/25',
}

export function Badge({ tono = 'neutro', children, className }: { tono?: Tono; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  )
}
