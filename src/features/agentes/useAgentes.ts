import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { AgenteConfig, IdAgente, InformeAgente } from '../../types/db'

async function llamar(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('agentes', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const cuerpo = await error.context.json().catch(() => null)
      if (cuerpo?.error) throw new Error(cuerpo.error)
      if (error.context.status === 404) throw new Error('La función de agentes todavía no está publicada.')
      throw new Error(`La función respondió ${error.context.status}.`)
    }
    throw new Error(error.message)
  }
  return data as Record<string, unknown>
}

/**
 * Le avisa a la función de agentes que el hub se abrió, para que corra lo que toque
 * (por si el programador de la base no está andando). Una vez por carga.
 */
let avisado = false
export function avisarAgentes() {
  if (avisado) return
  avisado = true
  llamar({ accion: 'tic' }).catch(() => {})
}

/** Configuración de los agentes, sus informes y las acciones (correr, prender/apagar, marcar leído). */
export function useAgentes() {
  const [config, setConfig] = useState<AgenteConfig[]>([])
  const [informes, setInformes] = useState<InformeAgente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [programados, setProgramados] = useState<boolean | null>(null)

  const recargar = useCallback(async () => {
    const [c, i] = await Promise.all([
      supabase.from('agentes_config').select('agente, activo, hora, ultima_corrida, ultimo_estado'),
      supabase.from('agentes_informes').select('*').order('created_at', { ascending: false }).limit(60),
    ])
    if (c.error || i.error) setError((c.error ?? i.error)!.message)
    else {
      setConfig(c.data as AgenteConfig[])
      setInformes(i.data as InformeAgente[])
      setError(null)
    }
    setCargando(false)
  }, [])

  useEffect(() => {
    recargar()
    supabase.rpc('agentes_programados').then(({ data, error }) => setProgramados(error ? false : data === true))
  }, [recargar])

  // Mientras algún agente trabaja (o recién se pidió uno), relee cada 3 s
  const trabajando = informes.some((i) => i.estado === 'trabajando' && !colgado(i))
  const [esperarHasta, setEsperarHasta] = useState(0)
  useEffect(() => {
    if (!trabajando && esperarHasta <= Date.now()) return
    const t = window.setInterval(() => {
      if (esperarHasta && Date.now() > esperarHasta) setEsperarHasta(0)
      recargar()
    }, 3000)
    return () => window.clearInterval(t)
  }, [trabajando, esperarHasta, recargar])

  const correr = async (agente: IdAgente, extra: Record<string, unknown> = {}) => {
    const r = await llamar({ accion: 'correr', agente, ...extra })
    // Cobranzas y postventa no devuelven id: se relee un rato hasta que aparezca el informe
    setEsperarHasta(Date.now() + 20_000)
    await recargar()
    return r as { ok: boolean; id?: string; resumen?: string }
  }

  const cambiar = async (agente: IdAgente, cambios: Partial<Pick<AgenteConfig, 'activo' | 'hora'>>) => {
    setConfig((lista) => lista.map((c) => (c.agente === agente ? { ...c, ...cambios } : c)))
    const { error } = await supabase.from('agentes_config').update(cambios).eq('agente', agente)
    if (error) {
      await recargar()
      throw new Error(error.message)
    }
  }

  const marcarLeido = useCallback(async (id: string) => {
    setInformes((lista) => lista.map((i) => (i.id === id ? { ...i, leido: true } : i)))
    await supabase.from('agentes_informes').update({ leido: true }).eq('id', id)
  }, [])

  const borrar = async (id: string) => {
    const { error } = await supabase.from('agentes_informes').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setInformes((lista) => lista.filter((i) => i.id !== id))
  }

  return { config, informes, cargando, error, programados, recargar, correr, cambiar, marcarLeido, borrar }
}

/** Los últimos informes (para el panel de Jarvis). */
export function useInformesRecientes(limite = 4) {
  const [informes, setInformes] = useState<InformeAgente[]>([])
  useEffect(() => {
    supabase
      .from('agentes_informes')
      .select('id, agente, titulo, resumen, estado, leido, created_at')
      .eq('estado', 'lista')
      .order('created_at', { ascending: false })
      .limit(limite)
      .then(({ data, error }) => !error && data && setInformes(data as InformeAgente[]))
  }, [limite])
  return informes
}

/** Link de WhatsApp con el mensaje escrito (lo manda el socio, no el hub). */
export function linkWhatsApp(telefono: string | null, texto: string) {
  const numero = (telefono ?? '').replace(/\D/g, '')
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

/** Corre un agente a pedido (los de un cliente devuelven el id del informe). */
export async function correrAgente(agente: IdAgente, extra: Record<string, unknown> = {}) {
  return (await llamar({ accion: 'correr', agente, ...extra })) as { ok: boolean; id?: string; resumen?: string }
}

/** Informes de un cliente (los de su carpeta); relee mientras alguno trabaja. */
export function useInformesCliente(prospectoId: string | undefined) {
  const [informes, setInformes] = useState<InformeAgente[]>([])
  const recargar = useCallback(async () => {
    if (!prospectoId) return
    const { data, error } = await supabase
      .from('agentes_informes')
      .select('id, agente, titulo, resumen, estado, error, leido, created_at')
      .eq('prospecto_id', prospectoId)
      .order('created_at', { ascending: false })
      .limit(8)
    if (!error && data) setInformes(data as InformeAgente[])
  }, [prospectoId])
  useEffect(() => {
    recargar()
  }, [recargar])
  const trabajando = informes.some((i) => i.estado === 'trabajando' && !colgado(i))
  useEffect(() => {
    if (!trabajando) return
    const t = window.setInterval(recargar, 4000)
    return () => window.clearInterval(t)
  }, [trabajando, recargar])
  return { informes, recargar }
}

/** Un informe que sigue "trabajando" después de 10 minutos se cortó (la función tiene tope de tiempo). */
export const colgado = (i: Pick<InformeAgente, 'estado' | 'created_at'>) => i.estado === 'trabajando' && Date.now() - new Date(i.created_at).getTime() > 10 * 60_000
