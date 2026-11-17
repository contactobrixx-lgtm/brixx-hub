import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { modoAudio } from '../../lib/audioSession'

const hayNavegador = () => typeof window !== 'undefined'
const hayVozDispositivo = () => hayNavegador() && 'speechSynthesis' in window

/** Hay alguna forma de hablar: la voz premium (audio) o la del dispositivo. */
export const vozDisponible = () => hayNavegador() && (typeof Audio !== 'undefined' || hayVozDispositivo())

// ── Voz premium (ElevenLabs, por la Edge Function "voz") ─────────────────────

let configPremium: Promise<boolean> | null = null

/** Pregunta una sola vez por sesión si la función "voz" tiene la clave de ElevenLabs cargada. */
function premiumConfigurada(): Promise<boolean> {
  configPremium ??= supabase.functions
    .invoke('voz', { body: { accion: 'config' } })
    .then(({ data, error }) => !error && Boolean((data as { elevenlabs?: boolean } | null)?.elevenlabs))
    .catch(() => false)
  return configPremium
}

// Últimos audios generados: "Escuchar de nuevo" no gasta créditos otra vez
const cacheAudio = new Map<string, string>()
function guardarEnCache(texto: string, url: string) {
  cacheAudio.set(texto, url)
  if (cacheAudio.size > 12) {
    const [viejo, urlVieja] = cacheAudio.entries().next().value as [string, string]
    cacheAudio.delete(viejo)
    URL.revokeObjectURL(urlVieja)
  }
}

// Si ElevenLabs no contesta en este tiempo, se lee con la voz del dispositivo
const TIMEOUT_PREMIUM_MS = 12000
// Tope de seguridad para cuidar los créditos (el asistente ya manda un resumen corto)
const MAX_PREMIUM = 700

/** Borra los audios guardados (por ejemplo, al cambiar de voz). */
export function limpiarCacheVoz() {
  for (const url of cacheAudio.values()) URL.revokeObjectURL(url)
  cacheAudio.clear()
}

async function audioPremium(texto: string): Promise<string | null> {
  const enCache = cacheAudio.get(texto)
  if (enCache) return enCache
  if (texto.length > MAX_PREMIUM) return null // muy largo: mejor la voz del dispositivo que gastar créditos
  const { data, error } = await supabase.functions.invoke('voz', {
    body: { texto },
    signal: AbortSignal.timeout(TIMEOUT_PREMIUM_MS),
  })
  if (error) console.warn('Voz premium no disponible, uso la del dispositivo:', error.message)
  if (error || !(data instanceof Blob) || data.size === 0) return null
  const url = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }))
  guardarEnCache(texto, url)
  return url
}

/** Un WAV mudo y cortito: reproducirlo con un toque "destraba" el audio en iPhone. */
function silencio(): string {
  const muestras = 800
  const buf = new ArrayBuffer(44 + muestras)
  const v = new DataView(buf)
  const txt = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  txt(0, 'RIFF'); v.setUint32(4, 36 + muestras, true); txt(8, 'WAVE'); txt(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true)
  txt(36, 'data'); v.setUint32(40, muestras, true)
  for (let i = 0; i < muestras; i++) v.setUint8(44 + i, 128)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

// ── Voz del dispositivo (respaldo) ───────────────────────────────────────────

// Voces masculinas conocidas en Windows, macOS, Android e iOS: más sobrias que las por defecto
const MASCULINAS = /diego|jorge|juan|carlos|enrique|pablo|alvaro|álvaro|andr[eé]s|tom[aá]s|ra[uú]l|male|hombre/i

/** La voz del dispositivo más parecida a un mayordomo: en español, mejor masculina y de Latinoamérica. */
function elegirVoz(voces: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const es = voces.filter((v) => v.lang.toLowerCase().startsWith('es'))
  const orden = ['es-ar', 'es-419', 'es-us', 'es-mx', 'es-cl', 'es-co', 'es-uy', 'es-es']
  const idioma = (v: SpeechSynthesisVoice) => {
    const i = orden.indexOf(v.lang.toLowerCase().replace('_', '-'))
    return i === -1 ? orden.length : i
  }
  const puntaje = (v: SpeechSynthesisVoice) => (MASCULINAS.test(v.name) ? 0 : 100) + idioma(v)
  return [...es].sort((a, b) => puntaje(a) - puntaje(b))[0] ?? null
}

/** Parte el texto en oraciones: Chrome corta las lecturas largas si van de un solo tirón. */
function oraciones(texto: string): string[] {
  return (texto.match(/[^.!?¿¡]+[.!?]+|[^.!?]+$/g) ?? [texto]).map((s) => s.trim()).filter(Boolean)
}

export type FuenteVoz = 'premium' | 'dispositivo'

/** Voz que se va armando mientras llega la respuesta (ver enVivo). */
export interface VozEnVivo {
  agregar: (delta: string) => void
  reiniciar: () => void
  terminar: () => void
}

const MAX_VOZ_EN_VIVO = 600 // caracteres que se leen como mucho por respuesta
const MIN_TANDA = 120 // después de la primera oración, se pide el audio de a tandas (menos pedidos)

/** Restos de markdown que no se leen bien. */
const limpiar = (t: string) => t.replace(/[*_#`>]+/g, '').replace(/\s+/g, ' ').trim()

/**
 * Índice donde termina la primera tanda de oraciones completas de al menos `minimo` caracteres
 * (null si todavía no hay ninguna completa). Una oración termina en . ! ? … seguido de espacio o salto.
 */
export function buscarFinDeOracion(texto: string, minimo: number): number | null {
  const re = /[.!?…]+["»)]*(?=\s)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const fin = m.index + m[0].length
    // "3.5" o "Sr." no cortan: se exige espacio después y que no sea un número decimal
    if (/\d$/.test(texto.slice(0, m.index)) && /^\.\d/.test(texto.slice(m.index))) continue
    if (fin >= minimo) return fin
  }
  return null
}

/**
 * Texto a voz. Usa la voz premium de ElevenLabs si está configurada en Supabase;
 * si no está o falla (sin créditos, sin conexión), lee con la voz del dispositivo.
 */
export function useVoz() {
  const [hablando, setHablando] = useState(false)
  const [voz, setVoz] = useState<SpeechSynthesisVoice | null>(null)
  const [premium, setPremium] = useState<boolean | null>(null)
  const [fuente, setFuente] = useState<FuenteVoz | null>(null)
  const pendientes = useRef(0)
  const turno = useRef(0) // cada "decir" o "callar" invalida lo anterior
  const audio = useRef<HTMLAudioElement | null>(null)
  const urlSilencio = useRef<string | null>(null)

  useEffect(() => {
    let vivo = true
    premiumConfigurada().then((ok) => vivo && setPremium(ok))
    if (!hayVozDispositivo()) return () => void (vivo = false)
    const cargar = () => setVoz(elegirVoz(window.speechSynthesis.getVoices()))
    cargar()
    window.speechSynthesis.addEventListener('voiceschanged', cargar)
    return () => {
      vivo = false
      window.speechSynthesis.removeEventListener('voiceschanged', cargar)
      window.speechSynthesis.cancel()
      audio.current?.pause()
    }
  }, [])

  const elemento = () => (audio.current ??= new Audio())

  const callar = useCallback(() => {
    turno.current++
    pendientes.current = 0
    audio.current?.pause()
    if (hayVozDispositivo()) window.speechSynthesis.cancel()
    setHablando(false)
  }, [])

  const decirDispositivo = useCallback(
    (texto: string) => {
      if (!hayVozDispositivo()) return setHablando(false)
      setFuente('dispositivo')
      const partes = oraciones(texto)
      pendientes.current = partes.length
      for (const parte of partes) {
        const u = new SpeechSynthesisUtterance(parte)
        u.lang = voz?.lang ?? 'es-AR'
        if (voz) u.voice = voz
        u.rate = 0.97 // pausado
        u.pitch = 0.85 // más grave
        const fin = () => {
          pendientes.current = Math.max(0, pendientes.current - 1)
          if (pendientes.current === 0) setHablando(false)
        }
        u.onend = fin
        u.onerror = fin
        modoAudio('playback')
        window.speechSynthesis.speak(u)
      }
    },
    [voz],
  )

  const decir = useCallback(
    async (texto: string) => {
      if (!texto.trim()) return
      callar()
      const mio = ++turno.current
      setHablando(true) // también mientras se genera el audio: así "manos libres" no escucha en el medio

      if (premium !== false && (await premiumConfigurada())) {
        const url = await audioPremium(texto).catch(() => null)
        if (mio !== turno.current) return // lo callaron mientras se generaba
        if (url) {
          const a = elemento()
          a.onended = a.onerror = () => mio === turno.current && setHablando(false)
          a.src = url
          try {
            modoAudio('playback') // que no salga bajito después de usar el micrófono (iPhone)
          await a.play()
            setFuente('premium')
            return
          } catch {
            // el navegador no dejó reproducir: sigue con la voz del dispositivo
          }
        }
      }
      if (mio !== turno.current) return
      decirDispositivo(texto)
    },
    [callar, decirDispositivo, premium],
  )

  /**
   * Voz en vivo: se le van pasando pedacitos de texto a medida que llega la respuesta y empieza a hablar
   * con la primera oración, mientras pide el audio de las siguientes. Lee hasta ~600 caracteres
   * (cuida los créditos); si la respuesta sigue, avisa que el resto quedó en pantalla.
   */
  const enVivo = useCallback((): VozEnVivo => {
    callar()
    const mio = ++turno.current
    const vigente = () => mio === turno.current
    setHablando(true)

    let buffer = ''
    let leidos = 0
    let cortado = false
    let terminado = false
    let reproduciendo = false
    let usarPremium: boolean | null = premium === false ? false : null // null = todavía no se sabe
    const cola: Promise<{ url: string | null; texto: string }>[] = []

    const pedir = (texto: string) =>
      (async () => {
        if (usarPremium === null) usarPremium = await premiumConfigurada()
        if (!usarPremium) return { url: null, texto }
        const url = await audioPremium(texto).catch(() => null)
        if (!url) usarPremium = false // si falló una vez, el resto de esta respuesta con la voz del dispositivo
        return { url, texto }
      })()

    const siguiente = async (): Promise<void> => {
      if (!vigente()) return
      const pieza = cola.shift()
      if (!pieza) {
        reproduciendo = false
        if (terminado) setHablando(false)
        return
      }
      reproduciendo = true
      const { url, texto } = await pieza
      if (!vigente()) return
      if (url) {
        const a = elemento()
        a.onended = a.onerror = () => void siguiente()
        a.src = url
        try {
          modoAudio('playback') // que no salga bajito después de usar el micrófono (iPhone)
          await a.play()
          setFuente('premium')
          return
        } catch {
          // el navegador no dejó reproducir: esta pieza con la voz del dispositivo
        }
      }
      if (!hayVozDispositivo()) return siguiente()
      setFuente('dispositivo')
      const u = new SpeechSynthesisUtterance(texto)
      u.lang = voz?.lang ?? 'es-AR'
      if (voz) u.voice = voz
      u.rate = 0.97
      u.pitch = 0.85
      u.onend = u.onerror = () => void siguiente()
      modoAudio('playback')
        window.speechSynthesis.speak(u)
    }

    const encolar = (texto: string) => {
      const t = limpiar(texto)
      if (!t || !vigente()) return
      cola.push(pedir(t))
      if (!reproduciendo) void siguiente()
    }

    /** Saca del buffer las oraciones completas: la primera sola (para arrancar rápido), después de a tandas. */
    const sacarOraciones = (todo: boolean) => {
      for (;;) {
        if (cortado) return
        const fin = buscarFinDeOracion(buffer, leidos === 0 ? 1 : MIN_TANDA)
        const hasta = fin ?? (todo && buffer.trim() ? buffer.length : null)
        if (hasta == null) return
        const pieza = buffer.slice(0, hasta)
        buffer = buffer.slice(hasta)
        if (leidos > 0 && leidos + pieza.length > MAX_VOZ_EN_VIVO) {
          cortado = true
          encolar('El resto te lo dejé en pantalla.')
          return
        }
        leidos += pieza.length
        encolar(pieza)
      }
    }

    return {
      agregar: (delta) => {
        if (!vigente() || cortado) return
        buffer += delta
        sacarOraciones(false)
      },
      reiniciar: () => {
        // Lo que no se llegó a leer era un comentario antes de consultar datos: se descarta
        buffer = ''
      },
      terminar: () => {
        if (!vigente()) return
        sacarOraciones(true)
        terminado = true
        if (!reproduciendo && !cola.length) setHablando(false)
      },
    }
  }, [callar, premium, voz])

  /**
   * En iPhone el navegador solo deja sonar audio si antes hubo un toque del usuario:
   * se llama al tocar un botón para "destrabar" la voz de la respuesta que llega después.
   */
  const destrabar = useCallback(() => {
    if (hayNavegador() && typeof Audio !== 'undefined') {
      const a = elemento()
      if (a.paused) {
        urlSilencio.current ??= silencio()
        a.src = urlSilencio.current
        a.play().catch(() => {})
      }
    }
    if (hayVozDispositivo()) {
      const u = new SpeechSynthesisUtterance('')
      u.volume = 0
      modoAudio('playback')
        window.speechSynthesis.speak(u)
    }
  }, [])

  return {
    disponible: vozDisponible(),
    hablando,
    /** Si la voz premium (ElevenLabs) está configurada; null mientras se consulta. */
    premium,
    /** Qué voz se usó la última vez. */
    fuente,
    nombreVoz: premium ? 'ElevenLabs' : (voz?.name ?? null),
    decir,
    enVivo,
    callar,
    destrabar,
  }
}
