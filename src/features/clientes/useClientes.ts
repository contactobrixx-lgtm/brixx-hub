import { useCallback, useEffect, useMemo, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Grabacion, Sintesis } from '../../types/db'

/** Lo mínimo de cada grabación o intervención para armar las carpetas. */
export type ItemHistoria = Pick<Grabacion, 'id' | 'titulo' | 'origen' | 'estado' | 'created_at' | 'prospecto_id' | 'analisis' | 'urls'>

/** Grabaciones e intervenciones agrupadas por cliente (de la más nueva a la más vieja). */
export function useHistoriaClientes() {
  const [items, setItems] = useState<ItemHistoria[]>([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    const { data } = await supabase
      .from('grabaciones')
      .select('*')
      .not('prospecto_id', 'is', null)
      .order('created_at', { ascending: false })
    setItems((data ?? []) as ItemHistoria[])
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const porCliente = useMemo(() => {
    const m = new Map<string, ItemHistoria[]>()
    for (const g of items) {
      if (!g.prospecto_id) continue
      m.set(g.prospecto_id, [...(m.get(g.prospecto_id) ?? []), g])
    }
    return m
  }, [items])

  return { porCliente, cargando, recargar }
}

/** Pide a Claude que re-arme el resumen de la carpeta del cliente (objetivos, soluciones, qué hacer). */
export async function actualizarSintesis(prospectoId: string): Promise<Sintesis> {
  const { data, error } = await supabase.functions.invoke('grabaciones', { body: { accion: 'sintesis', prospecto_id: prospectoId } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const cuerpo = await error.context.json().catch(() => null)
      throw new Error(cuerpo?.error ?? `La función respondió ${error.context.status}.`)
    }
    throw new Error('No se pudo conectar con la función de grabaciones.')
  }
  return (data as { sintesis: Sintesis }).sintesis
}

/** "@usuario" para mostrar, a partir del link de Instagram. */
export function usuarioInstagram(link: string | null): string | null {
  if (!link) return null
  const m = link.match(/instagram\.com\/([A-Za-z0-9._]+)/i) ?? link.match(/^@?([A-Za-z0-9._]{2,30})$/)
  return m ? `@${m[1]}` : link
}

/** Dominio para mostrar, a partir de la web. */
export function dominio(link: string | null): string | null {
  if (!link) return null
  return link.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '')
}
