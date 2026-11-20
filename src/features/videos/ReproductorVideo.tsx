import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Expand, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import type { Video } from '../../types/db'
import { Button } from '../../components/ui/Button'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { ALTO, ANCHO, cargarFuentes, dibujarCuadro } from './lienzo'
import { armarLinea } from './linea'
import { bajarAudios } from './useVideos'

/** El mejor formato que el navegador sabe grabar (MP4 si puede: se manda por WhatsApp sin convertir) */
function formatoGrabacion(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null
  const opciones: { mime: string; ext: 'mp4' | 'webm' }[] = [
    { mime: 'video/mp4;codecs=avc1.640028,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ]
  return opciones.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? null
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const nombreArchivo = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'video'

/**
 * Reproduce el video dibujándolo en un lienzo, con la voz de cada escena programada en el reloj del audio
 * (así imagen, voz y subtítulos van juntos). "Descargar" lo graba tal cual se ve (tarda lo que dura).
 */
export function ReproductorVideo({ video }: { video: Video }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const audio = useRef<AudioContext | null>(null)
  const buffers = useRef<(AudioBuffer | null)[]>([])
  const fuentes = useRef<AudioBufferSourceNode[]>([])
  const salidaExtra = useRef<MediaStreamAudioDestinationNode | null>(null)
  const t0 = useRef(0)
  const posicion = useRef(0)
  const cuadro = useRef(0)
  const alTerminar = useRef<(() => void) | null>(null)
  const cancelado = useRef(false)

  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [t, setT] = useState(0)
  const [grabando, setGrabando] = useState(false)
  const formato = useMemo(formatoGrabacion, [])

  const guion = video.guion!
  const linea = useMemo(() => armarLinea(guion, video.audios), [guion, video.audios])

  const dibujar = useCallback(
    (seg: number) => {
      const ctx = lienzo.current?.getContext('2d')
      if (ctx) dibujarCuadro(ctx, guion, linea, seg)
    },
    [guion, linea],
  )

  // Cargar fuentes y voces; mostrar el primer cuadro con el título
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        await cargarFuentes()
        if (!vivo) return
        dibujar(1.2)
        audio.current = new AudioContext()
        const crudos = video.con_voz ? await bajarAudios(video) : []
        const decodificados = await Promise.all(crudos.map((b) => (b ? audio.current!.decodeAudioData(b) : Promise.resolve(null))))
        if (!vivo) return
        buffers.current = decodificados
        setListo(true)
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el video.')
      }
    })()
    return () => {
      vivo = false
      cancelAnimationFrame(cuadro.current)
      fuentes.current.forEach((f) => f.stop())
      audio.current?.close().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id])

  const pararVoces = () => {
    fuentes.current.forEach((f) => {
      try {
        f.stop()
      } catch {
        // ya había terminado
      }
    })
    fuentes.current = []
  }

  /** Arranca desde `desde` segundos: programa cada voz en el reloj del audio y dibuja cuadro a cuadro */
  const arrancar = async (desde: number) => {
    const ctx = audio.current
    if (!ctx) return
    await ctx.resume()
    pararVoces()
    t0.current = ctx.currentTime - desde
    linea.escenas.forEach((tr, i) => {
      const b = buffers.current[i]
      if (!b) return
      const fin = tr.audio + b.duration
      if (desde >= fin) return
      const src = ctx.createBufferSource()
      src.buffer = b
      src.connect(ctx.destination)
      if (salidaExtra.current) src.connect(salidaExtra.current)
      if (desde <= tr.audio) src.start(t0.current + tr.audio)
      else src.start(ctx.currentTime, desde - tr.audio)
      fuentes.current.push(src)
    })
    setReproduciendo(true)
    let ultimoEstado = 0
    const paso = () => {
      const ahora = ctx.currentTime - t0.current
      if (ahora >= linea.total) {
        dibujar(linea.total)
        posicion.current = 0
        setT(linea.total)
        setReproduciendo(false)
        pararVoces()
        alTerminar.current?.()
        return
      }
      dibujar(ahora)
      posicion.current = ahora
      if (performance.now() - ultimoEstado > 250) {
        ultimoEstado = performance.now()
        setT(ahora)
      }
      cuadro.current = requestAnimationFrame(paso)
    }
    cancelAnimationFrame(cuadro.current)
    cuadro.current = requestAnimationFrame(paso)
  }

  const pausar = () => {
    cancelAnimationFrame(cuadro.current)
    pararVoces()
    setReproduciendo(false)
    setT(posicion.current)
  }

  const irA = (seg: number) => {
    posicion.current = seg
    setT(seg)
    if (reproduciendo) arrancar(seg)
    else dibujar(seg)
  }

  const pantallaCompleta = () => {
    const el = contenedor.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
  }

  /** Graba el lienzo + la voz mientras se reproduce desde el principio y lo baja como archivo */
  const descargar = async () => {
    const ctx = audio.current
    const canvas = lienzo.current
    if (!ctx || !canvas || !formato) return
    setError(null)
    pausar()
    const destino = ctx.createMediaStreamDestination()
    salidaExtra.current = destino
    const imagen = canvas.captureStream(30)
    const pista = new MediaStream([...imagen.getVideoTracks(), ...destino.stream.getAudioTracks()])
    const rec = new MediaRecorder(pista, { mimeType: formato.mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 })
    const partes: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && partes.push(e.data)
    const terminado = new Promise<void>((res) => (rec.onstop = () => res()))
    cancelado.current = false
    setGrabando(true)
    rec.start(1000)
    alTerminar.current = () => setTimeout(() => rec.state !== 'inactive' && rec.stop(), 300)
    await arrancar(0)
    await terminado
    alTerminar.current = null
    salidaExtra.current = null
    imagen.getTracks().forEach((tr) => tr.stop())
    setGrabando(false)
    if (cancelado.current) return
    const blob = new Blob(partes, { type: formato.mime.split(';')[0] })
    if (!blob.size) return setError('No se pudo grabar el video en este navegador.')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nombreArchivo(video.titulo)}.${formato.ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const cancelarGrabacion = () => {
    cancelado.current = true
    alTerminar.current?.()
    pausar()
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={contenedor} className="relative overflow-hidden rounded-2xl border border-borde bg-black [&:fullscreen]:rounded-none [&:fullscreen]:border-0">
        <canvas ref={lienzo} width={ANCHO} height={ALTO} className="block aspect-video h-auto w-full [:fullscreen_&]:h-full [:fullscreen_&]:object-contain" />
        {!reproduciendo && listo && !grabando && (
          <button
            onClick={() => arrancar(t >= linea.total ? 0 : posicion.current)}
            aria-label="Reproducir"
            className="absolute inset-0 grid cursor-pointer place-items-center bg-fondo/30 transition-colors hover:bg-fondo/10"
          >
            <span className="grid size-20 place-items-center rounded-full bg-acento text-white shadow-lg">
              <Play className="ml-1 size-9 fill-current" />
            </span>
          </button>
        )}
        {!listo && !error && (
          <div className="absolute inset-0 grid place-items-center bg-fondo/50">
            <Loader2 className="size-8 animate-spin text-acento-texto" />
          </div>
        )}
      </div>

      {error && <ErrorBox mensaje={error} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secundario" onClick={() => (reproduciendo ? pausar() : arrancar(t >= linea.total ? 0 : posicion.current))} disabled={!listo || grabando}>
          {reproduciendo ? <Pause className="size-4" /> : <Play className="size-4" />} {reproduciendo ? 'Pausa' : 'Reproducir'}
        </Button>
        <Button size="sm" variant="fantasma" onClick={() => irA(0)} disabled={!listo || grabando} aria-label="Desde el principio">
          <RotateCcw className="size-4" />
        </Button>
        <input
          type="range"
          min={0}
          max={linea.total}
          step={0.1}
          value={Math.min(t, linea.total)}
          onChange={(e) => irA(Number(e.target.value))}
          disabled={!listo || grabando}
          aria-label="Posición del video"
          className="min-w-32 flex-1 accent-(--color-acento)"
        />
        <span className="tabular w-24 text-right text-sm text-tenue">
          {mmss(t)} / {mmss(linea.total)}
        </span>
        <Button size="sm" variant="fantasma" onClick={pantallaCompleta} aria-label="Pantalla completa">
          <Expand className="size-4" />
        </Button>
      </div>

      <div className="rounded-2xl border border-borde bg-superficie p-4">
        {grabando ? (
          <div className="flex flex-wrap items-center gap-3">
            <Loader2 className="size-5 animate-spin text-acento-texto" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Grabando el video… {mmss(t)} de {mmss(linea.total)}
              </p>
              <p className="text-sm text-tenue">Dejá esta pestaña abierta y a la vista hasta que termine: se graba mientras se reproduce.</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevada">
                <div className="h-full bg-acento" style={{ width: `${Math.min(100, (t / linea.total) * 100)}%` }} />
              </div>
            </div>
            <Button size="sm" variant="fantasma" onClick={cancelarGrabacion}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Descargar para mandarlo</p>
              <p className="text-sm text-tenue">
                {formato
                  ? `Se graba en ${formato.ext === 'mp4' ? 'MP4 (se manda directo por WhatsApp)' : 'WebM'} mientras se reproduce: tarda ${mmss(linea.total)}.`
                  : 'Este navegador no puede grabar video. Probá desde Chrome, Edge o Safari.'}
                {!video.con_voz && ' Este video no tiene voz (falta la clave de ElevenLabs).'}
              </p>
            </div>
            <Button onClick={descargar} disabled={!listo || !formato}>
              <Download className="size-4" /> Descargar video
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
