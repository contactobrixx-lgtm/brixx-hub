import { useCallback, useEffect, useRef, useState } from 'react'
import { idb } from '../../lib/indexedDb'

export type EstadoGrabadora = 'inactivo' | 'pidiendo' | 'grabando' | 'pausado' | 'listo'

interface Meta {
  mime: string
  inicio: number // epoch ms
  segundos: number
}

const META = 'grabacion_meta'
const PARTES = 'grabacion_partes'
const TROZO_MS = 10_000 // cada 10 s se guarda un pedazo en el celular

/** Formatos preferidos: Opus en webm (Chrome/Android) o AAC en mp4 (iPhone). */
function elegirFormato(): string {
  const opciones = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
  return opciones.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''
}

export function grabadoraDisponible() {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

/**
 * Graba audio del micrófono. Va guardando el audio cada 10 s en IndexedDB para que, si el
 * navegador corta (pantalla bloqueada, se cierra la pestaña), se pueda recuperar lo grabado.
 */
export function useGrabadora() {
  const [estado, setEstado] = useState<EstadoGrabadora>('inactivo')
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [recuperable, setRecuperable] = useState<{ segundos: number; inicio: number } | null>(null)
  const [pantallaFija, setPantallaFija] = useState(false)

  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const partes = useRef<Blob[]>([])
  const meta = useRef<Meta | null>(null)
  const acumulado = useRef(0) // ms grabados antes de la última reanudación
  const desde = useRef(0) // momento de la última reanudación
  const wakeLock = useRef<WakeLockSentinel | null>(null)
  const alTerminar = useRef<((b: Blob) => void) | null>(null)

  // ¿Quedó una grabación sin terminar de antes?
  useEffect(() => {
    idb
      .leer<Meta>(META, 'actual')
      .then((m) => {
        if (m) setRecuperable({ segundos: m.segundos, inicio: m.inicio })
      })
      .catch(() => {})
  }, [])

  // Reloj
  useEffect(() => {
    if (estado !== 'grabando') return
    const t = setInterval(() => setSegundos(Math.floor((acumulado.current + Date.now() - desde.current) / 1000)), 500)
    return () => clearInterval(t)
  }, [estado])

  const pedirPantallaFija = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLock.current = await navigator.wakeLock.request('screen')
        setPantallaFija(true)
        wakeLock.current.addEventListener('release', () => setPantallaFija(false))
      }
    } catch {
      setPantallaFija(false)
    }
  }, [])

  // El bloqueo de pantalla se suelta al cambiar de pestaña: pedirlo de nuevo al volver.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible' && (estado === 'grabando' || estado === 'pausado')) pedirPantallaFija()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [estado, pedirPantallaFija])

  const liberar = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }

  useEffect(() => () => liberar(), [])

  const empezar = async () => {
    setError(null)
    if (!grabadoraDisponible()) {
      setError('Este navegador no permite grabar audio. Probá con Chrome o Safari actualizados.')
      return
    }
    setEstado('pidiendo')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      setEstado('inactivo')
      setError('No se pudo usar el micrófono. Revisá que el navegador tenga permiso para usarlo.')
      return
    }
    const mime = elegirFormato()
    const rec = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32_000 })
    recorder.current = rec
    partes.current = []
    meta.current = { mime: rec.mimeType || mime || 'audio/webm', inicio: Date.now(), segundos: 0 }
    acumulado.current = 0
    desde.current = Date.now()
    await idb.vaciar(PARTES).catch(() => {})

    rec.ondataavailable = (e) => {
      if (!e.data.size) return
      partes.current.push(e.data)
      const m = meta.current!
      m.segundos = Math.floor((acumulado.current + (rec.state === 'recording' ? Date.now() - desde.current : 0)) / 1000)
      idb.guardar(PARTES, e.data).catch(() => {})
      idb.guardar(META, m, 'actual').catch(() => {})
    }
    rec.onstop = () => {
      const blob = new Blob(partes.current, { type: meta.current?.mime ?? 'audio/webm' })
      liberar()
      setEstado('listo')
      alTerminar.current?.(blob)
    }
    rec.start(TROZO_MS)
    setSegundos(0)
    setEstado('grabando')
    pedirPantallaFija()
  }

  const pausar = () => {
    if (recorder.current?.state !== 'recording') return
    recorder.current.pause()
    acumulado.current += Date.now() - desde.current
    setEstado('pausado')
  }

  const reanudar = () => {
    if (recorder.current?.state !== 'paused') return
    desde.current = Date.now()
    recorder.current.resume()
    setEstado('grabando')
  }

  /** Termina y devuelve el audio completo. */
  const terminar = () =>
    new Promise<{ blob: Blob; segundos: number }>((resolve) => {
      const rec = recorder.current
      if (!rec || rec.state === 'inactive') return
      if (rec.state === 'recording') acumulado.current += Date.now() - desde.current
      const total = Math.floor(acumulado.current / 1000)
      setSegundos(total)
      alTerminar.current = (blob) => resolve({ blob, segundos: total })
      rec.stop()
    })

  /** Arma el audio de una grabación que quedó cortada. */
  const recuperar = async () => {
    const m = await idb.leer<Meta>(META, 'actual')
    const trozos = (await idb.todos<Blob>(PARTES)) ?? []
    if (!m || !trozos.length) return null
    return { blob: new Blob(trozos, { type: m.mime }), segundos: m.segundos }
  }

  /** Borra la copia local (después de subir el audio, o si se descarta). */
  const descartarCopia = async () => {
    await idb.vaciar(PARTES).catch(() => {})
    await idb.vaciar(META).catch(() => {})
    setRecuperable(null)
  }

  return { estado, segundos, error, pantallaFija, recuperable, empezar, pausar, reanudar, terminar, recuperar, descartarCopia }
}
