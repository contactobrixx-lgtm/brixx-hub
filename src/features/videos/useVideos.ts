import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Video } from '../../types/db'

async function llamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('videos', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const cuerpo = await error.context.json().catch(() => null)
      if (cuerpo?.error) throw new Error(cuerpo.error)
      if (error.context.status === 404) throw new Error('La función de videos todavía no está publicada.')
      throw new Error(`La función respondió ${error.context.status}.`)
    }
    throw new Error(error.message)
  }
  return data as Record<string, unknown>
}

export type EnfoqueVideo = 'cliente' | 'equipo'

/** Pide un video nuevo (sale de una grabación o de la carpeta de un cliente). Devuelve su id. */
export async function crearVideo(origen: { grabacion_id?: string | null; prospecto_id?: string | null }, enfoque: EnfoqueVideo): Promise<string> {
  const r = await llamar({ accion: 'crear', ...origen, enfoque })
  return String(r.id)
}

export const reintentarVideo = (id: string) => llamar({ accion: 'reintentar', id })

const trabajando = (v: Video) => v.estado === 'guion' || v.estado === 'voz'
/** Un video que sigue "trabajando" a los 6 minutos se cortó (la función tiene un tope de tiempo) */
export const colgado = (v: Video) => trabajando(v) && Date.now() - new Date(v.updated_at).getTime() > 6 * 60_000

/** Los videos de una grabación o de un cliente (relee cada 3 s mientras alguno se está armando). */
export function useVideos(filtro: { grabacion_id?: string | null; prospecto_id?: string | null }) {
  const [videos, setVideos] = useState<Video[]>([])
  const [error, setError] = useState<string | null>(null)
  const { grabacion_id, prospecto_id } = filtro

  const recargar = useCallback(async () => {
    if (!grabacion_id && !prospecto_id) return setVideos([])
    let q = supabase.from('videos').select('*').order('created_at', { ascending: false }).limit(20)
    q = grabacion_id ? q.eq('grabacion_id', grabacion_id) : q.eq('prospecto_id', prospecto_id!)
    const { data, error } = await q
    // Si la base todavía no tiene la tabla (migración sin aplicar), no es un error para mostrar
    if (error) setError(/videos/.test(error.message) && /exist|schema cache/i.test(error.message) ? null : error.message)
    else {
      setVideos(data as Video[])
      setError(null)
    }
  }, [grabacion_id, prospecto_id])

  useEffect(() => {
    recargar()
  }, [recargar])

  const enCurso = videos.some((v) => trabajando(v) && !colgado(v))
  useEffect(() => {
    if (!enCurso) return
    const t = setInterval(recargar, 3000)
    return () => clearInterval(t)
  }, [enCurso, recargar])

  const borrar = async (v: Video) => {
    const paths = v.audios.map((a) => a.path).filter((p): p is string => !!p)
    if (paths.length) await supabase.storage.from('videos').remove(paths)
    const { error } = await supabase.from('videos').delete().eq('id', v.id)
    if (error) throw new Error(error.message)
    await recargar()
  }

  return { videos, error, recargar, borrar }
}

/** Un video (para el reproductor); relee mientras se arma. */
export function useVideo(id: string | undefined) {
  const [video, setVideo] = useState<Video | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!id) return
    const { data, error } = await supabase.from('videos').select('*').eq('id', id).maybeSingle()
    if (error) setError(error.message)
    else setVideo(data as Video | null)
    setCargando(false)
  }, [id])

  useEffect(() => {
    recargar()
  }, [recargar])

  const armando = !!video && trabajando(video) && !colgado(video)
  useEffect(() => {
    if (!armando) return
    const t = setInterval(recargar, 3000)
    return () => clearInterval(t)
  }, [armando, recargar])

  return { video, cargando, error, recargar }
}

/** Baja los audios de las escenas (bucket privado "videos") */
export async function bajarAudios(v: Video): Promise<(ArrayBuffer | null)[]> {
  return Promise.all(
    v.audios.map(async (a) => {
      if (!a.path) return null
      const { data, error } = await supabase.storage.from('videos').download(a.path)
      if (error || !data) throw new Error(`No pude bajar la voz del video: ${error?.message ?? 'sin datos'}`)
      return data.arrayBuffer()
    }),
  )
}
