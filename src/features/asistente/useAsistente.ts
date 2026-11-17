import { useCallback, useEffect, useRef, useState } from 'react'
import { claveAnon, supabase, urlFunciones } from '../../lib/supabase'

export interface Mensaje {
  id: string
  rol: 'usuario' | 'asistente'
  texto: string
  error?: boolean
  /** Lo que se lee en voz alta, si es distinto del texto (respuestas largas) */
  voz?: string
  /** Qué datos consultó para responder (agenda, grabaciones…) */
  consultas?: string[]
  /** Todavía está llegando */
  enCurso?: boolean
}

export interface OpcionesPregunta {
  /** Cada pedacito de texto apenas llega (para empezar a hablar antes) */
  alTexto?: (delta: string) => void
  /** Lo que llegó hasta acá era un comentario antes de consultar datos: la respuesta empieza de nuevo */
  alReiniciar?: () => void
}

const CLAVE = 'brixx-asistente-historial'

function leerCopiaLocal(): Mensaje[] {
  try {
    return JSON.parse(sessionStorage.getItem(CLAVE) ?? '[]') as Mensaje[]
  } catch {
    return []
  }
}

type Evento =
  | { tipo: 'texto'; delta: string }
  | { tipo: 'consulta'; nombre: string }
  | { tipo: 'nueva_vuelta' }
  | { tipo: 'fin'; respuesta: string; respuesta_voz?: string; consultas?: string[] }
  | { tipo: 'error'; error: string }

/**
 * Conversación con Jarvis (Edge Function "asistente"). La respuesta llega en vivo y la charla
 * queda guardada en la base (asistente_mensajes), así se acuerda de lo que se habló.
 */
export function useAsistente() {
  const [mensajes, setMensajes] = useState<Mensaje[]>(leerCopiaLocal)
  const [pensando, setPensando] = useState(false)
  /** Qué está consultando ahora (agenda, búsqueda web…), para mostrarlo */
  const [consultando, setConsultando] = useState<string | null>(null)
  const mensajesRef = useRef(mensajes)
  mensajesRef.current = mensajes

  // La conversación guardada (de cualquier día y equipo)
  useEffect(() => {
    supabase
      .from('asistente_mensajes')
      .select('id, rol, texto, consultas, created_at')
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data, error }) => {
        if (error || !data) return // sin la tabla todavía: queda la copia de esta pestaña
        setMensajes((actuales) => (actuales.some((m) => m.enCurso) ? actuales : (data.reverse() as Mensaje[])))
      })
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(mensajes.filter((m) => !m.enCurso).slice(-40)))
    } catch {
      /* modo privado o almacenamiento bloqueado */
    }
  }, [mensajes])

  /** Manda una pregunta. Devuelve el texto para leer en voz alta (o null si falló). */
  const preguntar = useCallback(async (pregunta: string, op: OpcionesPregunta = {}): Promise<string | null> => {
    const texto = pregunta.trim()
    if (!texto) return null
    const idRespuesta = crypto.randomUUID()
    const poner = (cambios: Partial<Mensaje>) => setMensajes((ms) => ms.map((m) => (m.id === idRespuesta ? { ...m, ...cambios } : m)))
    // Por compatibilidad con la versión anterior de la función (que recibía el historial)
    const historial = mensajesRef.current
      .filter((m) => !m.error && !m.enCurso)
      .slice(-10)
      .map(({ rol, texto }) => ({ rol, texto }))
    setMensajes((m) => [
      ...m,
      { id: crypto.randomUUID(), rol: 'usuario', texto },
      { id: idRespuesta, rol: 'asistente', texto: '', enCurso: true },
    ])
    setPensando(true)
    setConsultando(null)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch(`${urlFunciones}/asistente`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session?.access_token ?? claveAnon}`,
          apikey: claveAnon,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ pregunta: texto, stream: true, historial }),
      })
      if (!res.ok) {
        if (res.status === 404) throw new Error('El asistente todavía no está publicado en Supabase.')
        const cuerpo = await res.json().catch(() => null)
        throw new Error(cuerpo?.error ?? 'No me pude conectar con el asistente. Probá de nuevo.')
      }

      let final: { respuesta: string; voz: string; consultas: string[] }
      if (!(res.headers.get('content-type') ?? '').includes('text/event-stream') || !res.body) {
        // Versión anterior de la función: responde todo junto
        const d = (await res.json()) as { respuesta?: string; respuesta_voz?: string; consultas?: string[] }
        final = { respuesta: String(d.respuesta ?? ''), voz: d.respuesta_voz?.trim() || String(d.respuesta ?? ''), consultas: d.consultas ?? [] }
        op.alTexto?.(final.voz)
      } else {
        let acumulado = ''
        let fin: Extract<Evento, { tipo: 'fin' }> | null = null
        const lector = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let resto = ''
        for (;;) {
          const { value, done } = await lector.read()
          if (done) break
          resto += value
          const bloques = resto.split('\n\n')
          resto = bloques.pop() ?? ''
          for (const b of bloques) {
            const linea = b.split('\n').find((l) => l.startsWith('data: '))
            if (!linea) continue
            const e = JSON.parse(linea.slice(6)) as Evento
            if (e.tipo === 'texto') {
              acumulado += e.delta
              poner({ texto: acumulado })
              op.alTexto?.(e.delta)
            } else if (e.tipo === 'nueva_vuelta') {
              acumulado = ''
              poner({ texto: '' })
              op.alReiniciar?.()
            } else if (e.tipo === 'consulta') {
              setConsultando(e.nombre)
            } else if (e.tipo === 'fin') {
              fin = e
            } else if (e.tipo === 'error') {
              throw new Error(e.error)
            }
          }
        }
        if (!fin) throw new Error('Se cortó la respuesta. Probá de nuevo.')
        final = { respuesta: fin.respuesta, voz: fin.respuesta_voz?.trim() || fin.respuesta, consultas: fin.consultas ?? [] }
      }
      poner({ texto: final.respuesta, voz: final.voz !== final.respuesta ? final.voz : undefined, consultas: final.consultas, enCurso: false })
      return final.voz
    } catch (e) {
      poner({ texto: e instanceof Error ? e.message : 'Algo salió mal.', error: true, enCurso: false })
      return null
    } finally {
      setPensando(false)
      setConsultando(null)
    }
  }, [])

  /** Borra la conversación (la propia; la memoria de Jarvis queda). */
  const limpiar = useCallback(async () => {
    setMensajes([])
    await supabase.from('asistente_mensajes').delete().not('id', 'is', null)
  }, [])

  return { mensajes, pensando, consultando, preguntar, limpiar }
}
