import type { ReactNode } from 'react'

export function EmptyState({ icono, titulo, texto, accion }: { icono: ReactNode; titulo: string; texto: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-borde px-6 py-16 text-center animate-aparecer">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-elevada text-acento">{icono}</div>
      <h3 className="font-semibold">{titulo}</h3>
      <p className="mt-1 max-w-sm text-sm text-suave">{texto}</p>
      {accion && <div className="mt-6">{accion}</div>}
    </div>
  )
}
