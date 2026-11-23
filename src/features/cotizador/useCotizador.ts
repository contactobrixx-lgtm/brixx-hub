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

/** Link público de la propuesta para mandarle al cliente (/p/<token>): lo crea si no existe. */
export async function linkPublicoPropuesta(id: string, tokenActual: string | null | undefined): Promise<string> {
  let token = tokenActual ?? null
  if (!token) {
    token = crypto.randomUUID()
    const { error } = await supabase.from('cotizaciones').update({ token_publico: token }).eq('id', id)
    if (error) throw new Error(error.message)
  }
  return `${window.location.origin}/p/${token}`
}

/** La propuesta pública (sin sesión) a partir de su token */
export function usePropuestaPublica(token: string | undefined) {
  type Publica = Cotizacion & { prospectos?: { nombre: string; empresa: string | null } | null }
  const [cotizacion, setCotizacion] = useState<Publica | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
      setCargando(false)
      return
    }
    supabase.rpc('propuesta_publica', { t: token }).then(({ data, error }) => {
      if (error) setError(error.message)
      else setCotizacion((data as Publica | null) ?? null)
      setCargando(false)
    })
  }, [token])
  return { cotizacion, cargando, error }
}

/** Las propuestas (cotizaciones) de un cliente, para su carpeta */
export function usePropuestasCliente(prospectoId: string | undefined) {
  const [propuestas, setPropuestas] = useState<Cotizacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!prospectoId) return
    supabase
      .from('cotizaciones')
      .select('*, cotizacion_items(*)')
      .eq('prospecto_id', prospectoId)
      .order('numero', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setPropuestas((data as Cotizacion[]) ?? [])
        setCargando(false)
      })
  }, [prospectoId])
  return { propuestas, cargando, error }
}
