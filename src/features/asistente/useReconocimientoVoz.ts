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

/**
 * Push-to-talk con la Web Speech API en es-AR: escucha solo mientras está activo.
 * Al terminar (porque lo frenás o porque el navegador corta) entrega el texto a `alTerminar`.
 */
export function useReconocimientoVoz(alTerminar: (texto: string) => void) {
  const [escuchando, setEscuchando] = useState(false)
  const [parcial, setParcial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Reconocedor | null>(null)
  const final = useRef('')
  const ultimoParcial = useRef('')
  const callback = useRef(alTerminar)
  callback.current = alTerminar

  const escuchar = useCallback(() => {
    const Ctor = constructor()
    if (!Ctor || rec.current) return
    setError(null)
    setParcial('')
    final.current = ''
    ultimoParcial.current = ''
    const r = new Ctor()
    r.lang = 'es-AR'
    r.continuous = true
    r.interimResults = true
    r.onresult = (e) => {
      let interino = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) final.current += `${res[0].transcript} `
        else interino += res[0].transcript
      }
      ultimoParcial.current = `${final.current}${interino}`.trim()
      setParcial(ultimoParcial.current)
    }
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORES[e.error] ?? 'Hubo un problema con el micrófono. Probá de nuevo o escribí la pregunta.')
    }
    r.onend = () => {
      rec.current = null
      setEscuchando(false)
      const texto = final.current.trim()
      setParcial('')
      if (texto) callback.current(texto)
    }
    rec.current = r
    try {
      r.start()
      setEscuchando(true)
    } catch {
      rec.current = null
      setError('No se pudo empezar a escuchar. Probá de nuevo.')
    }
  }, [])

  /** Deja de escuchar y manda lo que se dijo. */
  const terminar = useCallback(() => {
    const r = rec.current
    if (!r) return
    // Si el último fragmento todavía no era "final", lo tomamos igual
    if (ultimoParcial.current.length > final.current.trim().length) final.current = ultimoParcial.current
    r.stop()
  }, [])

  /** Corta sin mandar nada. */
  const cancelar = useCallback(() => {
    const r = rec.current
    if (!r) return
    final.current = ''
    r.abort()
  }, [])

  useEffect(() => () => rec.current?.abort(), [])

  return { disponible: reconocimientoDisponible(), escuchando, parcial, error, escuchar, terminar, cancelar }
}
