import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { RedPerfil } from '../../types/db'

/** Las fotos de Instagram de un cliente (API de Meta): la última y la anterior, para comparar */
export function useInstagram(prospectoId: string) {
  const [fotos, setFotos] = useState<RedPerfil[]>([])
  const [cargando, setCargando] = useState(true)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sinMeta, setSinMeta] = useState(false)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('redes_perfiles')
      .select('*')
      .eq('prospecto_id', prospectoId)
      .eq('red', 'instagram')
      .order('created_at', { ascending: false })
      .limit(2)
    // Sin la migración aplicada todavía, no es un error para mostrar
    if (!error) setFotos((data as RedPerfil[]) ?? [])
    setCargando(false)
  }, [prospectoId])

  useEffect(() => {
    recargar()
  }, [recargar])

  /** Lee la cuenta con la API de Meta (función agentes) y guarda la foto del momento */
  const actualizar = async () => {
    setActualizando(true)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('agentes', { body: { accion: 'instagram', prospecto_id: prospectoId } })
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const cuerpo = await error.context.json().catch(() => null)
          if (cuerpo?.falta === 'meta') setSinMeta(true)
          throw new Error(cuerpo?.error ?? `La función respondió ${error.context.status}.`)
        }
        throw new Error(error.message)
      }
      const foto = data?.foto as RedPerfil | undefined
      if (!foto?.datos) throw new Error('Meta respondió pero sin datos de la cuenta. Tocá "Ver diagnóstico".')
      // Se muestra lo que trajo Meta aunque no se haya podido guardar; la anterior queda para comparar
      setFotos((f) => [foto, ...f.filter((x) => x.id !== foto.id)].slice(0, 2))
      if (data?.error_guardado) setError(`Se leyó, pero no se pudo guardar para comparar después: ${data.error_guardado}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el Instagram.')
    } finally {
      setActualizando(false)
    }
  }

  /** Qué permisos tiene el token de Meta y si puede leer cuentas (para resolver errores de conexión) */
  const [diagnostico, setDiagnostico] = useState<string[] | null>(null)
  const diagnosticar = async (usuario: string | null) => {
    setDiagnostico(['Revisando la conexión con Meta…'])
    const { data, error } = await supabase.functions.invoke('agentes', { body: { accion: 'meta_diagnostico', usuario } })
    if (error) {
      const cuerpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
      setDiagnostico([`No se pudo revisar: ${cuerpo?.error ?? error.message}`])
    } else setDiagnostico((data?.lineas as string[]) ?? [])
  }

  return { ultima: fotos[0] ?? null, anterior: fotos[1] ?? null, cargando, actualizando, error, sinMeta, actualizar, diagnostico, diagnosticar }
}
