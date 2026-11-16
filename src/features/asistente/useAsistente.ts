import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'

export interface Mensaje {
  id: string
  rol: 'usuario' | 'asistente'
  texto: string
  error?: boolean
  /** Versión corta para leer en voz alta (si la respuesta era larga) */
  voz?: string
  /** Qué datos consultó para responder (agenda, grabaciones…) */
  consultas?: string[]
}

const CLAVE = 'brixx-asistente-historial'
const TURNOS_A_ENVIAR = 10

function leerHistorial(): Mensaje[] {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE) ?? '[]') as Mensaje[]
  } catch {
    return []
  }
}

/** Conversación de esta sesión con la Edge Function "asistente" (no se guarda en la base). */
export function useAsistente() {
  const [mensajes, setMensajes] = useState<Mensaje[]>(leerHistorial)
  const [pensando, setPensando] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(mensajes.slice(-40)))
    } catch {
      /* modo privado o almacenamiento bloqueado: el historial queda solo en memoria */
    }
  }, [mensajes])

  /**
   * Manda una pregunta. La respuesta aparece en pantalla apenas llega;
   * devuelve el texto para leer en voz alta (o null si falló).
   */
  const preguntar = useCallback(
    async (pregunta: string): Promise<string | null> => {
      const texto = pregunta.trim()
      if (!texto) return null
      const historial = mensajes
        .filter((m) => !m.error)
        .slice(-TURNOS_A_ENVIAR)
        .map(({ rol, texto }) => ({ rol, texto }))
      setMensajes((m) => [...m, { id: crypto.randomUUID(), rol: 'usuario', texto }])
      setPensando(true)
      try {
        const { data, error } = await supabase.functions.invoke('asistente', { body: { pregunta: texto, historial } })
        if (error) {
          let mensaje = 'No me pude conectar con el asistente. Probá de nuevo.'
          if (error instanceof FunctionsHttpError) {
            if (error.context.status === 404) mensaje = 'El asistente todavía no está publicado en Supabase.'
            else {
              const cuerpo = await error.context.json().catch(() => null)
              if (cuerpo?.error) mensaje = cuerpo.error
            }
          }
          throw new Error(mensaje)
        }
        const d = data as { respuesta?: string; respuesta_voz?: string; consultas?: string[] }
        const respuesta = String(d.respuesta ?? '')
        const hablada = d.respuesta_voz?.trim() || respuesta
        setMensajes((m) => [
          ...m,
          { id: crypto.randomUUID(), rol: 'asistente', texto: respuesta, voz: hablada !== respuesta ? hablada : undefined, consultas: d.consultas },
        ])
        return hablada
      } catch (e) {
        setMensajes((m) => [
          ...m,
          { id: crypto.randomUUID(), rol: 'asistente', texto: e instanceof Error ? e.message : 'Algo salió mal.', error: true },
        ])
        return null
      } finally {
        setPensando(false)
      }
    },
    [mensajes],
  )

  const limpiar = useCallback(() => setMensajes([]), [])

  return { mensajes, pensando, preguntar, limpiar }
}
