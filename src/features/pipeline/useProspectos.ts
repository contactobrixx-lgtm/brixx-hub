import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Etapa, Miembro, Prospecto, ProspectoInput } from '../../types/db'

export function useProspectos() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('prospectos').select('*').order('orden')
    if (error) setError(error.message)
    else {
      setProspectos((data ?? []) as Prospecto[])
      setError(null)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const guardar = async (input: ProspectoInput, id: string | null) => {
    const { error } = id
      ? await supabase.from('prospectos').update(input).eq('id', id)
      : await supabase.from('prospectos').insert(input)
    if (error) throw new Error(error.message)
    await recargar()
  }

  const eliminar = async (id: string) => {
    const { error } = await supabase.from('prospectos').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await recargar()
  }

  /** Mueve una tarjeta (optimista: actualiza la UI antes de que responda la base). */
  const mover = async (id: string, etapa: Etapa, orden: number) => {
    const previo = prospectos
    setProspectos((lista) =>
      lista.map((p) => (p.id === id ? { ...p, etapa, orden } : p)).sort((a, b) => a.orden - b.orden),
    )
    const { error } = await supabase.from('prospectos').update({ etapa, orden }).eq('id', id)
    if (error) {
      setProspectos(previo)
      setError(`No se pudo mover la tarjeta: ${error.message}`)
    }
  }

  /** Orden para agregar una tarjeta al final de una columna. */
  const ordenAlFinal = (etapa: Etapa) =>
    prospectos.filter((p) => p.etapa === etapa).reduce((max, p) => Math.max(max, p.orden), 0) + 1

  return { prospectos, cargando, error, guardar, eliminar, mover, ordenAlFinal }
}

export function useMiembros() {
  const [miembros, setMiembros] = useState<Miembro[]>([])
  useEffect(() => {
    supabase
      .from('miembros')
      .select('email, nombre')
      .order('nombre')
      .then(({ data }) => setMiembros(data ?? []))
  }, [])
  return miembros
}
