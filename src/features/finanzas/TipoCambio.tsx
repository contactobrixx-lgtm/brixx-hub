import { useEffect, useState } from 'react'
import { Input } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { parseNumero } from '../../lib/format'

interface Props {
  valor: number | null
  onGuardar: (v: number | null) => Promise<void>
}

/** Editor del tipo de cambio: 1 USD = $ X ARS. */
export function TipoCambio({ valor, onGuardar }: Props) {
  const [texto, setTexto] = useState(valor ? String(valor) : '')
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle')

  useEffect(() => setTexto(valor ? String(valor) : ''), [valor])

  const cambiado = (parseNumero(texto) ?? null) !== (valor ? Number(valor) : null)

  const guardar = async () => {
    const n = parseNumero(texto)
    if (texto.trim() && (n == null || n <= 0)) return setEstado('error')
    setEstado('guardando')
    try {
      await onGuardar(n)
      setEstado('ok')
    } catch {
      setEstado('error')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-borde bg-superficie px-4 py-3">
      <span className="font-semibold">Tipo de cambio</span>
      <span className="text-tenue">1 USD =</span>
      <div className="flex items-center gap-2">
        <span className="text-tenue">$</span>
        <div className="w-32">
          <Input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setEstado('idle')
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label="Pesos por dólar"
            className="min-h-10"
          />
        </div>
        <span className="text-tenue">ARS</span>
      </div>
      {cambiado && (
        <Button size="sm" onClick={guardar} disabled={estado === 'guardando'}>
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </Button>
      )}
      {estado === 'ok' && !cambiado && <span className="text-sm text-ok">Guardado</span>}
      {estado === 'error' && <span className="text-sm text-peligro">Número inválido</span>}
      <span className="w-full text-[13px] text-tenue sm:ml-auto sm:w-auto">Se usa para pasar a dólares todo lo cargado en pesos.</span>
    </div>
  )
}
