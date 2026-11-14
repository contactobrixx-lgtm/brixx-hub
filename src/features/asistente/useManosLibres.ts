import { useCallback, useEffect, useRef, useState } from 'react'

// Tipos mínimos de la Web Speech API
interface ResultadoVoz {
  isFinal: boolean
  0: { transcript: string }
}
interface Reconocedor {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<ResultadoVoz> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type Ctor = new () => Reconocedor

function constructor(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** iPhone/iPad: Safari no sostiene el reconocimiento continuo, ahí se usa "tocar para hablar". */
const esIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

export const manosLibresDisponible = () => constructor() !== null && !esIOS()

// "Jarvis" y cómo lo suele transcribir el reconocedor en español
const PALABRA = /\b(?:hola\s+|che\s+|oye\s+|oi\s+)?(?:jarvis|yarvis|jarbis|yarbis|charvis|harvis|jarvi|yarvi|travis)\b[\s,.:!?¡¿]*/i

const normal = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')

export type EstadoManosLibres = 'apagado' | 'esperando_palabra' | 'escuchando_pregunta' | 'pausado'

/**
 * Modo manos libres: escucha de forma continua SOLO mientras está activado y la pestaña está visible.
 * Cuando oye "Jarvis…", toma lo que sigue como pregunta. Se pausa mientras Jarvis piensa o habla.
 */
export function useManosLibres(alPreguntar: (pregunta: string) => void, pausar: boolean) {
  const [activo, setActivo] = useState(false)
  const [estado, setEstado] = useState<EstadoManosLibres>('apagado')
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rec = useRef<Reconocedor | null>(null)
  const esperandoPregunta = useRef(false)
  const timeoutPregunta = useRef<number | undefined>(undefined)
  const quiereEscuchar = useRef(false)
  const callback = useRef(alPreguntar)
  callback.current = alPreguntar

  const dejarDeEsperar = () => {
    esperandoPregunta.current = false
    window.clearTimeout(timeoutPregunta.current)
  }

  const procesarFinal = (texto: string) => {
    const t = normal(texto).trim()
    const m = t.match(PALABRA)
    if (m) {
      const despues = t.slice((m.index ?? 0) + m[0].length).trim()
      if (despues.length > 2) {
        dejarDeEsperar()
        callback.current(texto.slice(texto.length - despues.length).trim() || despues)
        return
      }
      // Dijo solo "Jarvis": esperar la pregunta unos segundos
      esperandoPregunta.current = true
      setEstado('escuchando_pregunta')
      window.clearTimeout(timeoutPregunta.current)
      timeoutPregunta.current = window.setTimeout(() => {
        esperandoPregunta.current = false
        setEstado('esperando_palabra')
        setParcial('')
      }, 8000)
      return
    }
    if (esperandoPregunta.current && t.length > 2) {
      dejarDeEsperar()
      callback.current(texto.trim())
    }
  }

  const arrancar = useCallback(() => {
    const C = constructor()
    if (!C || rec.current) return
    const r = new C()
    r.lang = 'es-AR'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let interino = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          setParcial('')
          procesarFinal(res[0].transcript)
        } else interino += res[0].transcript
      }
      if (interino) {
        setParcial(interino)
        if (PALABRA.test(normal(interino))) setEstado('escuchando_pregunta')
      }
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        quiereEscuchar.current = false
        setActivo(false)
        setError('El navegador no dio permiso para usar el micrófono.')
      }
    }
    r.onend = () => {
      rec.current = null
      // El navegador corta solo cada tanto: si seguimos activos, volver a escuchar
      if (quiereEscuchar.current) window.setTimeout(() => quiereEscuchar.current && arrancar(), 300)
    }
    rec.current = r
    try {
      r.start()
      setEstado(esperandoPregunta.current ? 'escuchando_pregunta' : 'esperando_palabra')
    } catch {
      rec.current = null
    }
  }, [])

  const detener = useCallback(() => {
    quiereEscuchar.current = false
    rec.current?.abort()
    rec.current = null
  }, [])

  // Escuchar solo si está activo, no está en pausa y la pestaña se ve
  useEffect(() => {
    if (!activo) {
      detener()
      dejarDeEsperar()
      setEstado('apagado')
      setParcial('')
      return
    }
    if (pausar) {
      detener()
      setEstado('pausado')
      return
    }
    quiereEscuchar.current = true
    arrancar()
  }, [activo, pausar, arrancar, detener])

  useEffect(() => {
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') setActivo(false)
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => {
      document.removeEventListener('visibilitychange', alCambiar)
      detener()
      dejarDeEsperar()
    }
  }, [detener])

  return {
    disponible: manosLibresDisponible(),
    activo,
    estado,
    parcial,
    error,
    activar: () => {
      setError(null)
      setActivo(true)
    },
    desactivar: () => setActivo(false),
  }
}
