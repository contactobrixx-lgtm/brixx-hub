import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export interface NotaMemoria {
  id: string
  contenido: string
  creado_por: string | null
  created_at: string
}

/** Lo que Jarvis guardó en su memoria ("recordá que…"). Se puede borrar desde /jarvis. */
export function useMemoria() {
  const [notas, setNotas] = useState<NotaMemoria[]>([])

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('jarvis_memoria').select('*').order('created_at', { ascending: false })
    if (!error) setNotas((data ?? []) as NotaMemoria[])
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const borrar = async (id: string) => {
    setNotas((n) => n.filter((x) => x.id !== id))
    await supabase.from('jarvis_memoria').delete().eq('id', id)
  }

  return { notas, recargar, borrar }
}
