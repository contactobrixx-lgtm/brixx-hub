import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTabla } from '../../lib/useTabla'
import type { Ajustes, Cobro, CobroInput, Costo, CostoInput } from '../../types/db'

export function useCobros() {
  return useTabla<Cobro, CobroInput>('cobros', { orden: [{ columna: 'fecha', asc: false }] })
}

export function useCostos() {
  return useTabla<Costo, CostoInput>('costos', { orden: [{ columna: 'categoria' }, { columna: 'nombre' }] })
}

/** Ajustes globales (una sola fila): tipo de cambio. */
export function useAjustes() {
  const [ajustes, setAjustes] = useState<Ajustes | null>(null)

  const recargar = useCallback(async () => {
    const { data } = await supabase.from('ajustes').select('*').maybeSingle()
    setAjustes((data as Ajustes | null) ?? { id: true, tipo_cambio_usd: null, tasa_reunion_propuesta: 0.5, tasa_propuesta_cierre: 0.33 })
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const guardarTipoCambio = async (valor: number | null) => {
    const { error } = await supabase.from('ajustes').upsert({ id: true, tipo_cambio_usd: valor })
    if (error) throw new Error(error.message)
    await recargar()
  }

  const guardarTasas = async (tasas: Pick<Ajustes, 'tasa_reunion_propuesta' | 'tasa_propuesta_cierre'>) => {
    const { error } = await supabase.from('ajustes').upsert({ id: true, ...tasas })
    if (error) throw new Error(error.message)
    await recargar()
  }

  return {
    tipoCambio: ajustes?.tipo_cambio_usd ?? null,
    tasas: {
      reunionPropuesta: Number(ajustes?.tasa_reunion_propuesta ?? 0.5),
      propuestaCierre: Number(ajustes?.tasa_propuesta_cierre ?? 0.33),
    },
    cargado: ajustes !== null,
    guardarTipoCambio,
    guardarTasas,
  }
}
