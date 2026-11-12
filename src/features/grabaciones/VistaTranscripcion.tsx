import { useState } from 'react'
import type { Segmento } from '../../types/db'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { cn } from '../../components/ui/cn'
import { formatDuracion } from '../../lib/format'

// Un color por hablante (tokens de marca)
const COLORES = ['text-acento-texto', 'text-naranja', 'text-turquesa', 'text-violeta', 'text-aviso', 'text-ok']

interface Props {
  segmentos: Segmento[]
  hablantes: Record<string, string>
  destacados: Set<number> // índices de segmentos que contienen un punto clave
  activo: number | null
  onIrA: (segundo: number) => void
  onRenombrar: (hablantes: Record<string, string>) => Promise<void>
}

export function VistaTranscripcion({ segmentos, hablantes, destacados, activo, onIrA, onRenombrar }: Props) {
  const ids = [...new Set(segmentos.map((s) => s.hablante))]
  const [nombres, setNombres] = useState<Record<string, string>>(() => Object.fromEntries(ids.map((h) => [h, hablantes[h] ?? ''])))
  const [guardando, setGuardando] = useState(false)
  const color = (h: string) => COLORES[ids.indexOf(h) % COLORES.length]
  const nombre = (h: string) => hablantes[h] || `Hablante ${h}`
  const cambiado = ids.some((h) => (nombres[h] ?? '') !== (hablantes[h] ?? ''))

  return (
    <div className="flex flex-col gap-4">
      {ids.length > 1 && (
        <section className="rounded-2xl border border-borde bg-superficie p-4">
          <h2 className="mb-1 text-[17px] font-bold">¿Quién es quién?</h2>
          <p className="mb-3 text-[13px] text-tenue">Poné el nombre de cada hablante. Si lo cambiás antes de analizar, el análisis usa los nombres.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ids.map((h) => (
              <label key={h} className="flex items-center gap-2">
                <span className={cn('w-24 shrink-0 text-sm font-semibold', color(h))}>Hablante {h}</span>
                <Input value={nombres[h] ?? ''} onChange={(e) => setNombres({ ...nombres, [h]: e.target.value })} placeholder="Nombre" />
              </label>
            ))}
          </div>
          {cambiado && (
            <Button
              size="sm"
              className="mt-3"
              disabled={guardando}
              onClick={async () => {
                setGuardando(true)
                const limpio = Object.fromEntries(Object.entries(nombres).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
                await onRenombrar(limpio).finally(() => setGuardando(false))
              }}
            >
              Guardar nombres
            </Button>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-borde bg-superficie p-2 sm:p-3">
        {segmentos.map((s, i) => (
          <div
            key={i}
            id={`seg-${i}`}
            className={cn(
              'scroll-mt-24 rounded-xl px-3 py-2.5 transition-colors',
              destacados.has(i) && 'bg-acento-tenue',
              activo === i && 'ring-2 ring-acento',
            )}
          >
            <div className="mb-0.5 flex items-center gap-2 text-xs">
              <span className={cn('font-semibold', color(s.hablante))}>{nombre(s.hablante)}</span>
              <button onClick={() => onIrA(Math.floor(s.inicio_ms / 1000))} className="tabular cursor-pointer text-tenue hover:text-texto">
                {formatDuracion(s.inicio_ms / 1000)}
              </button>
              {destacados.has(i) && <span className="font-semibold text-acento-texto">· punto clave</span>}
            </div>
            <p className="leading-relaxed">{s.texto}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
