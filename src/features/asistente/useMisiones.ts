import { useCallback, useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export type EstadoMision = 'planificando' | 'trabajando' | 'combinando' | 'lista' | 'error' | 'cancelada'

export interface Mision {
  id: string
  pedido: string
  titulo: string | null
  estado: EstadoMision
  resultado: string | null
  resumen: string | null
  error: string | null
  created_at: string
}

export interface AgenteMision {
  id: string
  mision_id: string
  orden: number
  nombre: string
  rol: string
  tarea: string
  usa_web: boolean
  estado: 'esperando' | 'trabajando' | 'listo' | 'error'
  progreso: number
  registro: { t: string; texto: string }[]
  resultado: string | null
}

export const misionActiva = (m: Mision | null) => !!m && ['planificando', 'trabajando', 'combinando'].includes(m.estado)

async function llamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('misiones', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      if (error.context.status === 404) throw new Error('La función de misiones todavía no está publicada.')
      const cuerpo = await error.context.json().catch(() => null)
      throw new Error(cuerpo?.error ?? `La función respondió ${error.context.status}.`)
    }
    throw new Error('No me pude conectar con la función de misiones.')
  }
  return data as Record<string, unknown>
}

/**
 * La misión de agentes más reciente (de las últimas 24 h) y sus agentes, en vivo:
 * mientras trabaja se relee cada 1,5 s. `alTerminar` avisa una vez cuando queda lista.
 */
export function useMisiones(alTerminar?: (m: Mision) => void) {
  const [mision, setMision] = useState<Mision | null>(null)
  const [agentes, setAgentes] = useState<AgenteMision[]>([])
  const [oculta, setOculta] = useState<string | null>(null)
  const anterior = useRef<Mision | null>(null)
  const callback = useRef(alTerminar)
  callback.current = alTerminar

  const refrescar = useCallback(async (id?: string) => {
    let q = supabase.from('jarvis_misiones').select('*').order('created_at', { ascending: false }).limit(1)
    q = id ? supabase.from('jarvis_misiones').select('*').eq('id', id).limit(1) : q.gte('created_at', new Date(Date.now() - 864e5).toISOString())
    const { data, error } = await q
    if (error) return // sin la tabla todavía
    const m = (data?.[0] as Mision | undefined) ?? null
    if (m) {
      const { data: ag } = await supabase.from('jarvis_agentes').select('*').eq('mision_id', m.id).order('orden')
      setAgentes((ag ?? []) as AgenteMision[])
    } else setAgentes([])
    // Avisar una sola vez cuando pasa a "lista"
    if (m && m.estado === 'lista' && anterior.current?.id === m.id && anterior.current.estado !== 'lista') callback.current?.(m)
    anterior.current = m
    setMision(m)
  }, [])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  // Mientras trabaja, se relee seguido
  const activa = misionActiva(mision)
  useEffect(() => {
    if (!activa) return
    const t = window.setInterval(() => refrescar(mision?.id), 1500)
    return () => window.clearInterval(t)
  }, [activa, mision?.id, refrescar])

  /** Lanza una misión desde la pantalla (sin pasar por la charla). */
  const crear = async (pedido: string) => {
    const r = await llamar({ accion: 'crear', pedido })
    setOculta(null)
    await refrescar(r.id as string)
  }

  const cancelar = async () => {
    if (!mision) return
    await llamar({ accion: 'cancelar', id: mision.id })
    await refrescar(mision.id)
  }

  /** Jarvis lanzó una misión desde la charla: empezar a seguirla ya. */
  const seguir = (id: string) => {
    setOculta(null)
    refrescar(id)
  }

  const visible = mision && mision.id !== oculta ? mision : null
  return { mision: visible, agentes: visible ? agentes : [], activa: misionActiva(visible), crear, cancelar, seguir, ocultar: () => setOculta(mision?.id ?? null) }
}
