import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
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
  const recargar = useCallback(async () => {
    if (!id) return
    await cargarCotizacion(id)
      .then(setCotizacion)
      .catch((e: Error) => setError(e.message))
      .finally(() => setCargando(false))
  }, [id])
  useEffect(() => {
    recargar()
  }, [recargar])
  return { cotizacion, cargando, error, recargar }
}

/** Una cotización con sus ítems (para volver a abrir el formulario con lo último) */
export async function leerCotizacion(id: string): Promise<Cotizacion | null> {
  const { data, error } = await supabase.from('cotizaciones').select('*, cotizacion_items(*)').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as Cotizacion | null
}

/** ¿Le faltan los textos de la propuesta? (introducción, etapas y textos vacíos) */
export const sinTextosPropuesta = (c: Pick<Cotizacion, 'introduccion' | 'etapas' | 'propuesta'>) =>
  !c.introduccion && !(c.etapas ?? []).length && !(c.propuesta?.punto_texto || c.propuesta?.puntos?.length || c.propuesta?.cierre)

/**
 * Claude escribe los textos de la propuesta con el formato de la de Alcione (portada, punto de partida, etapas,
 * tarjeta de cada servicio y condiciones) a partir de la carpeta del cliente. No toca precios. Tarda ~1 min.
 */
export async function armarTextosPropuesta(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('agentes', { body: { accion: 'textos_propuesta', id } })
  if (!error) return
  if (error instanceof FunctionsHttpError) {
    const cuerpo = await error.context.json().catch(() => null)
    throw new Error(cuerpo?.error ?? `La función respondió ${error.context.status}.`)
  }
  throw new Error(error.message)
}

export interface VideoPropuesta {
  src: string
  /** A dónde lleva el video en el PDF (el link público de la propuesta) */
  link: string | null
}

/** El video del hub que va en la propuesta (elegido o el último guardado del cliente), con link temporal */
export function useVideoPropuesta(c: Pick<Cotizacion, 'id' | 'video_url' | 'video_id' | 'propuesta' | 'token_publico' | 'prospecto_id'> | null) {
  const [video, setVideo] = useState<VideoPropuesta | null>(null)
  const clave = c ? `${c.id}|${c.video_url ?? ''}|${c.video_id ?? ''}|${c.propuesta?.sin_video ?? ''}` : ''
  useEffect(() => {
    if (!c || c.video_url) return setVideo(null)
    let vivo = true
    ;(async () => {
      const { data: videoId } = await supabase.rpc('video_de_cotizacion', { cot: c.id })
      if (!videoId) return vivo && setVideo(null)
      const { data: v } = await supabase.from('videos').select('archivo_path').eq('id', videoId).maybeSingle()
      if (!v?.archivo_path) return vivo && setVideo(null)
      const { data } = await supabase.storage.from('videos').createSignedUrl(v.archivo_path, 12 * 3600)
      if (!data) return
      // En el PDF el video lleva al link público de la propuesta (el link firmado vence)
      const link = await linkPublicoPropuesta(c.id, c.token_publico).catch(() => null)
      if (vivo) setVideo({ src: data.signedUrl, link })
    })()
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return video
}

/** El video de la propuesta pública (lo da la función "videos" con el token, sin sesión) */
export function useVideoPropuestaPublica(token: string | undefined, conLinkPropio: boolean) {
  const [video, setVideo] = useState<VideoPropuesta | null>(null)
  useEffect(() => {
    if (!token || conLinkPropio) return
    supabase.functions
      .invoke('videos', { body: { accion: 'video_propuesta', token } })
      .then(({ data }) => data?.url && setVideo({ src: data.url as string, link: window.location.href }))
      .catch(() => {})
  }, [token, conLinkPropio])
  return video
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
