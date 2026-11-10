import { useCallback, useEffect, useState } from 'react'
import { BUCKET_CAPTURAS, supabase } from '../../lib/supabase'
import type { Ficha, FichaInput, Seccion } from '../../types/db'

const MAX_BYTES = 5 * 1024 * 1024

export interface CambioImagen {
  /** Archivo nuevo a subir (reemplaza la imagen actual). */
  archivo?: File | null
  /** true = borrar la imagen actual sin reemplazarla. */
  quitar?: boolean
}

async function urlsFirmadas(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {}
  const { data } = await supabase.storage.from(BUCKET_CAPTURAS).createSignedUrls(paths, 60 * 60)
  const mapa: Record<string, string> = {}
  for (const item of data ?? []) if (item.path && item.signedUrl) mapa[item.path] = item.signedUrl
  return mapa
}

async function subirImagen(archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.')
  if (archivo.size > MAX_BYTES) throw new Error('La imagen supera los 5 MB.')
  const ext = archivo.name.split('.').pop()?.toLowerCase() || archivo.type.split('/')[1] || 'png'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET_CAPTURAS)
    .upload(path, archivo, { contentType: archivo.type, cacheControl: '3600' })
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`)
  return path
}

async function borrarImagen(path: string | null) {
  if (path) await supabase.storage.from(BUCKET_CAPTURAS).remove([path])
}

export function useFichas(seccion: Seccion) {
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [imagenes, setImagenes] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('fichas')
      .select('*')
      .eq('seccion', seccion)
      .order('orden')
      .order('nombre')
    if (error) {
      setError(error.message)
    } else {
      const lista = (data ?? []) as Ficha[]
      setFichas(lista)
      setError(null)
      setImagenes(await urlsFirmadas(lista.flatMap((f) => (f.imagen_path ? [f.imagen_path] : []))))
    }
    setCargando(false)
  }, [seccion])

  useEffect(() => {
    setCargando(true)
    recargar()
  }, [recargar])

  /** Crea (sin id) o actualiza (con id) una ficha. Lanza Error si falla. */
  const guardar = async (input: FichaInput, id: string | null, imagen: CambioImagen) => {
    const anterior = id ? fichas.find((f) => f.id === id) : undefined
    let imagen_path = anterior?.imagen_path ?? null
    let nuevaSubida: string | null = null

    if (imagen.archivo) {
      nuevaSubida = await subirImagen(imagen.archivo)
      imagen_path = nuevaSubida
    } else if (imagen.quitar) {
      imagen_path = null
    }

    const fila = { ...input, imagen_path }
    const { error } = id
      ? await supabase.from('fichas').update(fila).eq('id', id)
      : await supabase.from('fichas').insert(fila)

    if (error) {
      await borrarImagen(nuevaSubida) // no dejar archivos huérfanos
      throw new Error(error.message)
    }
    if (anterior?.imagen_path && anterior.imagen_path !== imagen_path) await borrarImagen(anterior.imagen_path)
    await recargar()
  }

  const eliminar = async (ficha: Ficha) => {
    const { error } = await supabase.from('fichas').delete().eq('id', ficha.id)
    if (error) throw new Error(error.message)
    await borrarImagen(ficha.imagen_path)
    await recargar()
  }

  const siguienteOrden = fichas.reduce((max, f) => Math.max(max, f.orden), 0) + 1

  return { fichas, imagenes, cargando, error, guardar, eliminar, siguienteOrden }
}

/** Una sola ficha (para el visor). */
export function useFicha(id: string | undefined) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!id) return
    setCargando(true)
    supabase
      .from('fichas')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        setFicha((data as Ficha | null) ?? null)
        setCargando(false)
      })
  }, [id])

  return { ficha, cargando }
}

/** Lista liviana de demos para vincular a un prospecto. */
export function useDemosParaSelector() {
  const [demos, setDemos] = useState<Pick<Ficha, 'id' | 'nombre'>[]>([])
  useEffect(() => {
    supabase
      .from('fichas')
      .select('id, nombre')
      .neq('estado', 'archivado')
      .order('nombre')
      .then(({ data }) => setDemos(data ?? []))
  }, [])
  return demos
}
