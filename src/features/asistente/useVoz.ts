import { useCallback, useEffect, useRef, useState } from 'react'

export const vozDisponible = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** La mejor voz en español disponible: primero es-AR, después otras de Latinoamérica, después cualquier español. */
function elegirVoz(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const es = voces.filter((v) => v.lang.toLowerCase().startsWith('es'))
  const orden = ['es-ar', 'es-419', 'es-us', 'es-mx', 'es-cl', 'es-co', 'es-uy', 'es-es']
  for (const lang of orden) {
    const v = es.find((x) => x.lang.toLowerCase().replace('_', '-') === lang)
    if (v) return v
  }
  return es[0] ?? null
}

/** Parte el texto en oraciones: Chrome corta las lecturas largas si van de un solo tirón. */
function oraciones(texto: string): string[] {
  return (texto.match(/[^.!?¿¡]+[.!?]+|[^.!?]+$/g) ?? [texto]).map((s) => s.trim()).filter(Boolean)
}

/** Texto a voz con speechSynthesis del navegador. */
export function useVoz() {
  const [hablando, setHablando] = useState(false)
  const [voz, setVoz] = useState<SpeechSynthesisVoice | null>(null)
  const pendientes = useRef(0)

  useEffect(() => {
    if (!vozDisponible()) return
    const cargar = () => setVoz(elegirVoz(window.speechSynthesis.getVoices()))
    cargar()
    window.speechSynthesis.addEventListener('voiceschanged', cargar)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', cargar)
      window.speechSynthesis.cancel()
    }
  }, [])

  const callar = useCallback(() => {
    if (!vozDisponible()) return
    pendientes.current = 0
    window.speechSynthesis.cancel()
    setHablando(false)
  }, [])

  const decir = useCallback(
    (texto: string) => {
      if (!vozDisponible() || !texto.trim()) return
      window.speechSynthesis.cancel()
      const partes = oraciones(texto)
      pendientes.current = partes.length
      setHablando(true)
      for (const parte of partes) {
        const u = new SpeechSynthesisUtterance(parte)
        u.lang = voz?.lang ?? 'es-AR'
        if (voz) u.voice = voz
        u.rate = 1.05
        const fin = () => {
          pendientes.current = Math.max(0, pendientes.current - 1)
          if (pendientes.current === 0) setHablando(false)
        }
        u.onend = fin
        u.onerror = fin
        window.speechSynthesis.speak(u)
      }
    },
    [voz],
  )

  /**
   * En iPhone el navegador solo deja hablar si antes hubo un toque del usuario:
   * se llama al tocar el micrófono para "destrabar" la voz de la respuesta que llega después.
   */
  const destrabar = useCallback(() => {
    if (!vozDisponible()) return
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
  }, [])

  return { disponible: vozDisponible(), hablando, nombreVoz: voz?.name ?? null, decir, callar, destrabar }
}
