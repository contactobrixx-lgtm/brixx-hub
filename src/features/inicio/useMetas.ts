import { supabase } from '../../lib/supabase'
import { useTabla } from '../../lib/useTabla'
import type { Meta, MetaInput } from '../../types/db'

export function useMetas() {
  const tabla = useTabla<Meta, MetaInput>('metas', { orden: [{ columna: 'periodo' }] })

  /** Guarda varias metas de una vez (una por tipo + período). */
  const guardarVarias = async (metas: MetaInput[]) => {
    if (!metas.length) return
    const { error } = await supabase.from('metas').upsert(metas, { onConflict: 'tipo,periodo' })
    if (error) throw new Error(error.message)
    await tabla.recargar()
  }

  return { ...tabla, guardarVarias }
}
