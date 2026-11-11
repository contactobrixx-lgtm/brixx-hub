import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

interface Opciones {
  select?: string
  orden?: { columna: string; asc?: boolean }[]
}

/**
 * CRUD genérico sobre una tabla de Supabase. Los hooks de cada feature lo envuelven;
 * los componentes de UI nunca llaman a Supabase directo.
 */
export function useTabla<T extends { id: string | boolean }, I = Partial<T>>(tabla: string, opciones: Opciones = {}) {
  const { select = '*', orden = [] } = opciones
  const ordenKey = JSON.stringify(orden)
  const [filas, setFilas] = useState<T[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    let q = supabase.from(tabla).select(select)
    for (const o of JSON.parse(ordenKey) as { columna: string; asc?: boolean }[]) q = q.order(o.columna, { ascending: o.asc ?? true })
    const { data, error } = await q
    if (error) setError(error.message)
    else {
      setFilas((data ?? []) as unknown as T[])
      setError(null)
    }
    setCargando(false)
  }, [tabla, select, ordenKey])

  useEffect(() => {
    recargar()
  }, [recargar])

  /** Crea o actualiza. Devuelve la fila guardada. Lanza Error si falla. */
  const guardar = async (input: I, id: T['id'] | null): Promise<T> => {
    const fila = input as Record<string, unknown>
    const q = id != null ? supabase.from(tabla).update(fila).eq('id', id) : supabase.from(tabla).insert(fila)
    const { data, error } = await q.select().single()
    if (error) throw new Error(error.message)
    await recargar()
    return data as T
  }

  const eliminar = async (id: T['id']) => {
    const { error } = await supabase.from(tabla).delete().eq('id', id)
    if (error) throw new Error(error.message)
    await recargar()
  }

  return { filas, cargando, error, recargar, guardar, eliminar }
}
