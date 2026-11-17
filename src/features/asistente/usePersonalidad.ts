import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/** La personalidad de Jarvis (ajustes.jarvis_personalidad): la escriben los socios desde /jarvis. */
export function usePersonalidad() {
  const [texto, setTexto] = useState<string>('')
  const [disponible, setDisponible] = useState(true)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('ajustes').select('*').maybeSingle()
    if (error) return
    if (data && !('jarvis_personalidad' in data)) setDisponible(false) // la base todavía no tiene el campo
    setTexto((data?.jarvis_personalidad as string | null) ?? '')
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const guardar = async (nuevo: string) => {
    const valor = nuevo.trim() || null
    const { error } = await supabase.from('ajustes').upsert({ id: true, jarvis_personalidad: valor })
    if (error) throw new Error(error.message)
    setTexto(valor ?? '')
  }

  return { texto, disponible, guardar }
}
