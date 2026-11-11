import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useTabla } from '../../lib/useTabla'
import { ETAPAS_ABIERTAS, type Cotizacion, type CotizacionInput, type CotizacionItemInput, type Servicio, type ServicioInput } from '../../types/db'
import { totalesCotizacion } from '../finanzas/calculos'

export function useServicios() {
  return useTabla<Servicio, ServicioInput>('servicios', { orden: [{ columna: 'orden' }, { columna: 'nombre' }] })
}

export function useCotizaciones() {
  const tabla = useTabla<Cotizacion, CotizacionInput>('cotizaciones', {
    select: '*, cotizacion_items(*)',
    orden: [{ columna: 'numero', asc: false }],
  })

  /** Guarda cabecera + ítems (los ítems se reemplazan completos). */
  const guardarConItems = async (input: CotizacionInput, items: CotizacionItemInput[], id: string | null) => {
    const q = id
      ? supabase.from('cotizaciones').update(input).eq('id', id)
      : supabase.from('cotizaciones').insert(input)
    const { data, error } = await q.select('id').single()
    if (error) throw new Error(error.message)
    const cotId = (data as { id: string }).id

    const borrar = await supabase.from('cotizacion_items').delete().eq('cotizacion_id', cotId)
    if (borrar.error) throw new Error(borrar.error.message)
    if (items.length) {
      const filas = items.map((it, i) => ({ ...it, cotizacion_id: cotId, orden: i }))
      const ins = await supabase.from('cotizacion_items').insert(filas)
      if (ins.error) throw new Error(ins.error.message)
    }

    // Aceptada → el prospecto pasa a "cerrado" con el valor de la cotización
    if (input.estado === 'aceptada' && input.prospecto_id) {
      const { implementacion } = totalesCotizacion({
        descuento_pct: input.descuento_pct,
        cotizacion_items: items.map((it) => ({ ...it, id: '', cotizacion_id: cotId })),
      })
      const { data: p } = await supabase.from('prospectos').select('etapa').eq('id', input.prospecto_id).single()
      const cambios: Record<string, unknown> = { valor_estimado: implementacion, moneda: input.moneda }
      if (p && ETAPAS_ABIERTAS.includes(p.etapa)) cambios.etapa = 'cerrado'
      await supabase.from('prospectos').update(cambios).eq('id', input.prospecto_id)
    }

    await tabla.recargar()
    return cotId
  }

  return { ...tabla, guardarConItems }
}

type CotizacionCompleta = Awaited<ReturnType<typeof cargarCotizacion>>

/** Una cotización con su cliente (para la vista imprimible). */
export function useCotizacionCompleta(id: string | undefined) {
  const [cotizacion, setCotizacion] = useState<CotizacionCompleta>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    cargarCotizacion(id)
      .then(setCotizacion)
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false))
  }, [id])
  return { cotizacion, cargando, error }
}

async function cargarCotizacion(id: string) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*, cotizacion_items(*), prospectos(nombre, empresa, email, telefono)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as
    | (Cotizacion & { prospectos: { nombre: string; empresa: string | null; email: string | null; telefono: string | null } | null })
    | null
}
