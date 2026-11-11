import type { ReactNode } from 'react'

export function PageHeader({ titulo, subtitulo, acciones }: { titulo: string; subtitulo?: string; acciones?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-[1.1] font-bold sm:text-[34px]">{titulo}</h1>
        {subtitulo && <p className="mt-1.5 max-w-[62ch] text-tenue">{subtitulo}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  )
}
