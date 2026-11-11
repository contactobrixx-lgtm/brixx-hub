import { useCallback, useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useTabla } from '../../lib/useTabla'
import type { Grabacion } from '../../types/db'

export const BUCKET_GRABACIONES = 'grabaciones'
const DIAS_AUDIO = 90

type Accion = 'config' | 'procesar' | 'actualizar' | 'analizar'

export interface ConfigGrabaciones {
  /** false = la función todavía no está publicada en Supabase */
  funcion: boolean
  assemblyai: boolean
  anthropic: boolean
}

/** Llama a la Edge Function "grabaciones". Devuelve el JSON o lanza Error con un mensaje legible. */
export async function llamarFuncion(accion: Accion, id?: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('grabaciones', { body: { accion, id } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status
      if (status === 404) throw new Error('La función de grabaciones todavía no está publicada en Supabase.')
      const cuerpo = await error.context.json().catch(() => null)
      throw new Error(cuerpo?.error ?? `La función respondió ${status}.`)
    }
    throw new Error('No se pudo conectar con la función de grabaciones (¿está publicada?).')
  }
  return data as Record<string, unknown>
}

export function useConfigGrabaciones() {
  const [config, setConfig] = useState<ConfigGrabaciones | null>(null)
  useEffect(() => {
    llamarFuncion('config')
      .then((d) => setConfig({ funcion: true, assemblyai: !!d.assemblyai, anthropic: !!d.anthropic }))
      .catch(() => setConfig({ funcion: false, assemblyai: false, anthropic: false }))
  }, [])
  return config
}

function extension(mime: string) {
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('mpeg')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

/** Tipo base para el bucket (sin parámetros como ;codecs=opus). */
const mimeBase = (mime: string) => mime.split(';')[0].trim() || 'audio/webm'

export function useGrabaciones() {
  const tabla = useTabla<Grabacion>('grabaciones', { orden: [{ columna: 'created_at', asc: false }] })
  const limpiado = useRef(false)

  // Los audios se borran a los 90 días; la transcripción y el análisis quedan.
  useEffect(() => {
    if (tabla.cargando || limpiado.current) return
    limpiado.current = true
    const limite = Date.now() - DIAS_AUDIO * 864e5
    const viejas = tabla.filas.filter((g) => g.audio_path && new Date(g.created_at).getTime() < limite)
    if (!viejas.length) return
    ;(async () => {
      await supabase.storage.from(BUCKET_GRABACIONES).remove(viejas.map((g) => g.audio_path!))
      await supabase.from('grabaciones').update({ audio_path: null }).in('id', viejas.map((g) => g.id))
      await tabla.recargar()
    })().catch(() => {})
  }, [tabla])

  /**
   * Sube el audio, crea la grabación y la manda a procesar.
   * Si falla el procesamiento (claves sin cargar, función sin publicar) la grabación queda pendiente igual.
   */
  const subir = async (
    blob: Blob,
    datos: { titulo: string; segundos: number; reunion_id: string | null; prospecto_id: string | null; grabado_por: string | null },
  ): Promise<string> => {
    const mime = mimeBase(blob.type)
    const path = `${crypto.randomUUID()}.${extension(mime)}`
    const { error: errSubida } = await supabase.storage
      .from(BUCKET_GRABACIONES)
      .upload(path, blob, { contentType: mime, cacheControl: '3600' })
    if (errSubida) throw new Error(`No se pudo subir el audio: ${errSubida.message}`)

    const { data, error } = await supabase
      .from('grabaciones')
      .insert({
        titulo: datos.titulo,
        reunion_id: datos.reunion_id,
        prospecto_id: datos.prospecto_id,
        audio_path: path,
        audio_mime: mime,
        duracion_seg: datos.segundos,
        grabado_por: datos.grabado_por,
        estado: 'pendiente',
      })
      .select('id')
      .single()
    if (error) {
      await supabase.storage.from(BUCKET_GRABACIONES).remove([path])
      throw new Error(`No se pudo guardar la grabación: ${error.message}`)
    }
    const id = (data as { id: string }).id
    await llamarFuncion('procesar', id).catch(() => {}) // queda "pendiente" si no se pudo
    await tabla.recargar()
    return id
  }

  const eliminar = async (g: Grabacion) => {
    if (g.audio_path) await supabase.storage.from(BUCKET_GRABACIONES).remove([g.audio_path])
    await tabla.eliminar(g.id)
  }

  return { ...tabla, subir, eliminar }
}

/** Una grabación, con actualización automática mientras se procesa. */
export function useGrabacion(id: string | undefined) {
  const [grabacion, setGrabacion] = useState<Grabacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!id) return
    const { data } = await supabase.from('grabaciones').select('*').eq('id', id).maybeSingle()
    setGrabacion((data as Grabacion | null) ?? null)
    setCargando(false)
  }, [id])

  useEffect(() => {
    recargar()
  }, [recargar])

  const audioPath = grabacion?.audio_path
  useEffect(() => {
    if (!audioPath) return setAudioUrl(null)
    supabase.storage
      .from(BUCKET_GRABACIONES)
      .createSignedUrl(audioPath, 60 * 60)
      .then(({ data }) => setAudioUrl(data?.signedUrl ?? null))
  }, [audioPath])

  // Mientras se procesa: releer cada 5 s, y cada 20 s preguntarle a AssemblyAI (por si el aviso no llegó).
  const estado = grabacion?.estado
  useEffect(() => {
    if (!id || (estado !== 'transcribiendo' && estado !== 'analizando')) return
    let vueltas = 0
    const t = setInterval(() => {
      vueltas++
      if (estado === 'transcribiendo' && vueltas % 4 === 0) llamarFuncion('actualizar', id).catch(() => {})
      recargar()
    }, 5000)
    return () => clearInterval(t)
  }, [id, estado, recargar])

  const accion = async (a: 'procesar' | 'analizar') => {
    if (!id) return null
    const r = await llamarFuncion(a, id)
    await recargar()
    return r
  }

  const actualizar = async (cambios: Partial<Pick<Grabacion, 'titulo' | 'hablantes' | 'prospecto_id' | 'reunion_id'>>) => {
    if (!id) return
    const { error } = await supabase.from('grabaciones').update(cambios).eq('id', id)
    if (error) throw new Error(error.message)
    await recargar()
  }

  return { grabacion, cargando, audioUrl, recargar, accion, actualizar }
}
