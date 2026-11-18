import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { EnergiaVoz } from '../../types/db'
import { limpiarCacheVoz } from './useVoz'

export const MODELOS_VOZ = [
  { valor: 'eleven_flash_v2_5', label: 'Rápida' },
  { valor: 'eleven_multilingual_v2', label: 'Más natural' },
] as const

export const ENERGIAS_VOZ: { valor: EnergiaVoz; label: string; ayuda: string }[] = [
  { valor: 'calmo', label: 'Calmo', ayuda: 'Sereno y pausado.' },
  { valor: 'animado', label: 'Animado', ayuda: 'Más expresivo y apenas más rápido.' },
  { valor: 'energico', label: 'Enérgico', ayuda: 'Con empuje: bien expresivo y 10% más rápido.' },
]

export interface ConfigVoz {
  vozId: string
  modelo: string
  energia: EnergiaVoz
}

/** La voz de Jarvis elegida en el hub (ajustes.jarvis_voz_id / jarvis_voz_modelo / jarvis_voz_energia). */
export function useConfigVoz() {
  const [vozId, setVozId] = useState('')
  const [modelo, setModelo] = useState('')
  const [energia, setEnergia] = useState<EnergiaVoz>('calmo')
  const [disponible, setDisponible] = useState(true)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('ajustes').select('*').maybeSingle()
    if (error) return
    if (data && !('jarvis_voz_id' in data)) setDisponible(false) // la base todavía no tiene los campos
    setVozId((data?.jarvis_voz_id as string | null) ?? '')
    setModelo((data?.jarvis_voz_modelo as string | null) ?? '')
    setEnergia((data?.jarvis_voz_energia as EnergiaVoz | null) ?? 'calmo')
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  const guardar = async (nuevo: ConfigVoz) => {
    const { error } = await supabase
      .from('ajustes')
      .upsert({ id: true, jarvis_voz_id: nuevo.vozId.trim() || null, jarvis_voz_modelo: nuevo.modelo || null, jarvis_voz_energia: nuevo.energia })
    if (error) throw new Error(error.message)
    setVozId(nuevo.vozId.trim())
    setModelo(nuevo.modelo)
    setEnergia(nuevo.energia)
    limpiarCacheVoz() // lo ya generado era con la voz anterior
  }

  /** Genera una frase con la voz y el modelo indicados, sin guardarlos. Devuelve la URL del audio. */
  const probar = async (prueba: ConfigVoz): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('voz', {
      body: { texto: 'Buen día. Soy Jarvis, ¿qué hacemos hoy?', voz_id: prueba.vozId.trim() || undefined, modelo: prueba.modelo || undefined, energia: prueba.energia },
    })
    if (error) {
      const cuerpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      throw new Error(cuerpo?.error ?? 'No se pudo generar la prueba. ¿Está cargada la clave de ElevenLabs?')
    }
    if (!(data instanceof Blob)) throw new Error('ElevenLabs no devolvió audio.')
    return URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }))
  }

  return { vozId, modelo, energia, disponible, guardar, probar }
}
