import { useCallback, useEffect, useRef, useState } from 'react'

// Tipos mínimos de la Web Speech API (no todos los navegadores la traen ni TypeScript la declara completa)
interface ResultadoVoz {
  isFinal: boolean
  0: { transcript: string }
}
interface EventoResultado {
  resultIndex: number
  results: ArrayLike<ResultadoVoz>
}
interface Reconocedor {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: EventoResultado) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type ConstructorReconocedor = new () => Reconocedor

function constructor(): ConstructorReconocedor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const reconocimientoDisponible = () => constructor() !== null

const ERRORES: Record<string, string> = {
  'not-allowed': 'El navegador no tiene permiso para usar el micrófono. Habilitalo en la configuración del sitio.',
  'service-not-allowed': 'El navegador no permite el reconocimiento de voz acá. Escribí la pregunta.',
  'no-speech': 'No te escuché. Tocá el micrófono y probá de nuevo.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'El reconocimiento de voz necesita internet. Revisá la conexión.',
}

const SILENCIO_MS = 2500 // si después de hablar pasan 2,5 s sin palabras nuevas, se manda solo
const MAXIMO_MS = 45000 // tope por si el navegador se queda colgado escuchando

/**
 * Push-to-talk con la Web Speech API en es-AR: escucha solo mientras está activo.
 * Entrega el texto a `alTerminar` apenas lo frenás (sin esperar al navegador: en iPhone el aviso
 * de "terminé" a veces tarda muchísimo o no llega), cuando hacés una pausa después de hablar,
 * o si el navegador corta solo.
 */
export function useReconocimientoVoz(alTerminar: (texto: string) => void) {
  const [escuchando, setEscuchando] = useState(false)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Reconocedor | null>(null)
  const final = useRef('')
  const ultimoParcial = useRef('')
  const entregado = useRef(true)
  const timerSilencio = useRef<number | undefined>(undefined)
  const timerMaximo = useRef<number | undefined>(undefined)
  const callback = useRef(alTerminar)
  callback.current = alTerminar

  /** Cierra la escucha y manda el texto (una sola vez por escucha). */
  const entregar = useCallback((texto: string) => {
    if (entregado.current) return
    entregado.current = true
    window.clearTimeout(timerSilencio.current)
    window.clearTimeout(timerMaximo.current)
    const r = rec.current
    rec.current = null
    setEscuchando(false)
    setParcial('')
    try {
      r?.abort() // ya tenemos el texto: se corta el micrófono enseguida
    } catch {
      /* ya estaba cortado */
    }
    const t = texto.trim()
    if (t) callback.current(t)
  }, [])

  /** El mejor texto disponible: lo final más lo que todavía era provisorio. */
  const mejorTexto = () => (ultimoParcial.current.length > final.current.trim().length ? ultimoParcial.current : final.current)

  /** Deja de escuchar y manda lo que se dijo. */
  const terminar = useCallback(() => entregar(mejorTexto()), [entregar])

  const escuchar = useCallback(() => {
    const Ctor = constructor()
    if (!Ctor || rec.current) return
    setError(null)
    setParcial('')
    final.current = ''
    ultimoParcial.current = ''
    entregado.current = false
    const r = new Ctor()
    r.lang = 'es-AR'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      if (entregado.current) return
      let interino = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) final.current += `${res[0].transcript} `
        else interino += res[0].transcript
      }
      ultimoParcial.current = `${final.current}${interino}`.trim()
      setParcial(ultimoParcial.current)
      // Pausa después de hablar: se manda solo
      window.clearTimeout(timerSilencio.current)
      if (ultimoParcial.current) timerSilencio.current = window.setTimeout(() => entregar(mejorTexto()), SILENCIO_MS)
    }
    r.onerror = (e) => {
      if (e.error === 'aborted' || entregado.current) return
      setError(ERRORES[e.error] ?? 'Hubo un problema con el micrófono. Probá de nuevo o escribí la pregunta.')
      entregar(mejorTexto())
    }
    r.onend = () => entregar(mejorTexto())
    rec.current = r
    try {
      r.start()
      setEscuchando(true)
      timerMaximo.current = window.setTimeout(() => entregar(mejorTexto()), MAXIMO_MS)
    } catch {
      rec.current = null
      entregado.current = true
      setError('No se pudo empezar a escuchar. Probá de nuevo.')
    }
  }, [entregar])

  /** Corta sin mandar nada. */
  const cancelar = useCallback(() => {
    final.current = ''
    ultimoParcial.current = ''
    entregar('')
  }, [entregar])

  useEffect(
    () => () => {
      entregado.current = true
      window.clearTimeout(timerSilencio.current)
      window.clearTimeout(timerMaximo.current)
      rec.current?.abort()
    },
    [],
  )

  return { disponible: reconocimientoDisponible(), escuchando, parcial, error, escuchar, terminar, cancelar }
}
