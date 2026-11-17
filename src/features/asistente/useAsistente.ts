import { useCallback, useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { claveAnon, supabase, urlFunciones } from '../../lib/supabase'
import type { AccionJarvis } from '../../types/db'

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
  /** Acciones que preparó o hizo en esta respuesta */
  acciones?: string[]
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
  | { tipo: 'accion'; accion: AccionJarvis }
  | { tipo: 'fin'; respuesta: string; respuesta_voz?: string; consultas?: string[]; acciones?: AccionJarvis[]; tiempos?: Record<string, number> }
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
  /** Cuánto tardó la última respuesta, medido desde acá (en ms) */
  const [tiempos, setTiempos] = useState<{ primeraPalabra: number | null; total: number; servidor?: Record<string, number> } | null>(null)
  /** Acciones de esta sesión (y las pendientes de antes), por id */
  const [acciones, setAcciones] = useState<AccionJarvis[]>([])
  const mensajesRef = useRef(mensajes)
  mensajesRef.current = mensajes

  const guardarAccion = useCallback((a: AccionJarvis) => {
    setAcciones((lista) => (lista.some((x) => x.id === a.id) ? lista.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [...lista, a]))
  }, [])

  // Despierta la función apenas se abre el hub: la primera pregunta no espera el arranque en frío
  useEffect(() => {
    fetch(`${urlFunciones}/asistente`, {
      method: 'POST',
      headers: { apikey: claveAnon, Authorization: `Bearer ${claveAnon}`, 'content-type': 'application/json' },
      body: JSON.stringify({ accion: 'calentar' }),
    }).catch(() => {})
  }, [])

  // Las que quedaron esperando confirmación (de los últimos 30 minutos)
  useEffect(() => {
    supabase
      .from('jarvis_acciones')
      .select('id, tipo, resumen, estado, resultado, link')
      .eq('estado', 'pendiente')
      .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
      .order('created_at')
      .then(({ data, error }) => {
        if (!error && data) setAcciones((lista) => [...(data as AccionJarvis[]).filter((a) => !lista.some((x) => x.id === a.id)), ...lista])
      })
  }, [])

  // La conversación guardada (de cualquier día y equipo)
  useEffect(() => {
    supabase
      .from('asistente_mensajes')
      .select('id, rol, texto, consultas, created_at')
      .order('created_at', { ascending: false })
      .order('rol', { ascending: true }) // mensajes viejos con la misma hora: la pregunta antes que la respuesta
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
    const inicio = performance.now()
    let primeraPalabra: number | null = null
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
              primeraPalabra ??= performance.now() - inicio
              acumulado += e.delta
              poner({ texto: acumulado })
              op.alTexto?.(e.delta)
            } else if (e.tipo === 'nueva_vuelta') {
              acumulado = ''
              poner({ texto: '' })
              op.alReiniciar?.()
            } else if (e.tipo === 'consulta') {
              setConsultando(e.nombre)
            } else if (e.tipo === 'accion') {
              guardarAccion(e.accion)
              setMensajes((ms) =>
                ms.map((m) => (m.id === idRespuesta && !m.acciones?.includes(e.accion.id) ? { ...m, acciones: [...(m.acciones ?? []), e.accion.id] } : m)),
              )
            } else if (e.tipo === 'fin') {
              fin = e
            } else if (e.tipo === 'error') {
              throw new Error(e.error)
            }
          }
        }
        if (!fin) throw new Error('Se cortó la respuesta. Probá de nuevo.')
        setTiempos({ primeraPalabra, total: performance.now() - inicio, servidor: fin.tiempos })
        for (const a of fin.acciones ?? []) guardarAccion(a)
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
  }, [guardarAccion])

  /** Confirma o cancela una acción con el botón. Devuelve cómo quedó (o lanza un error legible). */
  const resolverAccion = useCallback(
    async (id: string, que: 'confirmar' | 'cancelar'): Promise<AccionJarvis | null> => {
      const { data, error } = await supabase.functions.invoke('asistente', { body: { accion: que, id } })
      if (error) {
        const cuerpo = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
        throw new Error(cuerpo?.error ?? 'No se pudo. Probá de nuevo.')
      }
      if (que === 'cancelar') {
        const actual = acciones.find((a) => a.id === id)
        if (actual) guardarAccion({ ...actual, estado: 'cancelada', resultado: 'Cancelada.' })
        return null
      }
      const a = (data as { accion: AccionJarvis }).accion
      guardarAccion(a)
      return a
    },
    [acciones, guardarAccion],
  )

  /** Borra la conversación (la propia; la memoria de Jarvis queda). */
  const limpiar = useCallback(async () => {
    setMensajes([])
    await supabase.from('asistente_mensajes').delete().not('id', 'is', null)
  }, [])

  return { mensajes, pensando, consultando, acciones, tiempos, preguntar, resolverAccion, limpiar }
}
