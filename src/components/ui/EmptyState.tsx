import type { ReactNode } from 'react'

export function EmptyState({ icono, titulo, texto, accion }: { icono?: ReactNode; titulo: string; texto: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-borde-fuerte px-6 py-10 text-center animate-aparecer sm:py-14">
      {icono && <div className="mb-3 text-acento-texto">{icono}</div>}
      <h3 className="text-xl font-bold">{titulo}</h3>
      <p className="mt-1.5 max-w-md text-[15px] text-tenue">{texto}</p>
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  )
}
