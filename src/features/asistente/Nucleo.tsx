import { cn } from '../../components/ui/cn'

export type EstadoNucleo = 'inactivo' | 'reposo' | 'escuchando' | 'pensando' | 'hablando'

/** Barras de onda de voz (decorativas, se mueven al escuchar o hablar). */
export function Onda({ activa }: { activa: boolean }) {
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden>
      {[0.1, 0.35, 0.2, 0.5, 0.15, 0.4, 0.25, 0.05, 0.3].map((d, i) => (
        <span
          key={i}
          className={cn('block h-full w-[3px] rounded-full bg-acento-claro', activa ? 'animate-onda' : 'scale-y-[0.25] opacity-50')}
          style={{ animationDelay: `${d}s` }}
        />
      ))}
    </div>
  )
}
