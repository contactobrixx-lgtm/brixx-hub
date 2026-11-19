import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../components/ui/cn'

/** Dónde cae un punto en la textura (tesela del mundo en Mercator, 360° de ancho). */
function enTextura(lat: number, lng: number) {
  const φ = (lat * Math.PI) / 180
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + φ / 2)) / Math.PI) / 2
  return { x: (lng + 180) / 360, y }
}

/**
 * Globo liviano de apertura: una sola imagen del mundo sobre un círculo con sombreado y brillo de atmósfera.
 * Gira hasta el destino con UNA transición (sin 3D ni animaciones en bucle) y, cuando el mapa real está listo
 * (`salir`), se agranda y se desvanece para enlazar con el mapa.
 */
export function GloboApertura({
  textura,
  destino,
  texto,
  salir,
  onEnfocado,
  onTerminado,
}: {
  textura: string | null
  destino: { lat: number; lng: number }
  texto: string
  salir: boolean
  /** Ya giró hasta el destino (el mapa se puede mostrar) */
  onEnfocado: () => void
  /** Terminó de desvanecerse (se puede desmontar) */
  onTerminado: () => void
}) {
  const globo = useRef<HTMLDivElement>(null)
  const [d, setD] = useState(0)
  const [girado, setGirado] = useState(false)
  const reducir = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const p = enTextura(destino.lat, destino.lng)

  useLayoutEffect(() => {
    setD(globo.current?.offsetWidth ?? 0)
  }, [])

  // El destino al centro: la textura mide 2 diámetros de ancho (360°)
  const final = d ? d / 2 - p.x * 2 * d : 0
  const inicio = final - 0.75 * d

  useEffect(() => {
    if (!d) return
    if (reducir) {
      setGirado(true)
      onEnfocado()
      return
    }
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setGirado(true)))
    const t = setTimeout(onEnfocado, 2300)
    return () => {
      cancelAnimationFrame(a)
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d])

  useEffect(() => {
    if (!salir) return
    const t = setTimeout(onTerminado, reducir ? 0 : 650)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salir])

  return (
    <div className={cn('apertura pointer-events-none absolute inset-0 grid place-items-center', salir && 'saliendo')} aria-hidden>
      <div className="apertura-estrellas absolute inset-0" />
      <div className="flex flex-col items-center gap-6">
        <div ref={globo} className="globo-apertura relative">
          <div
            className={cn('globo-textura absolute inset-0 rounded-full', !textura && 'sin-textura', girado && 'girado')}
            style={{
              backgroundImage: textura ? `url("${textura}")` : undefined,
              backgroundSize: d ? `${2 * d}px ${d}px` : undefined,
              backgroundPositionX: d ? `${girado ? final : inicio}px` : undefined,
            }}
          />
          <div className="globo-sombra absolute inset-0 rounded-full" />
          {girado && <span className="globo-destino" style={{ left: '50%', top: `${p.y * 100}%` }} />}
        </div>
        <p className="font-mono text-[13px] tracking-[0.25em] text-acento-claro md:text-sm">{texto}</p>
      </div>
    </div>
  )
}

export type EstadoEsfera = 'reposo' | 'escuchando' | 'pensando' | 'hablando'

/** La esfera de Jarvis (abajo, toda la búsqueda): se toca para hablar. Solo late mientras escucha, piensa o habla. */
export function EsferaJarvis({ estado, onTocar, deshabilitada, etiqueta }: { estado: EstadoEsfera; onTocar: () => void; deshabilitada?: boolean; etiqueta: string }) {
  return (
    <button type="button" onClick={onTocar} disabled={deshabilitada} aria-label={etiqueta} title={etiqueta} className={cn('esfera-jarvis', `esfera-${estado}`)}>
      {/* Malla de la esfera en CSS (un SVG encima del mapa se redibuja en cada cuadro en celulares modestos) */}
      <i className="esfera-malla horizontal" aria-hidden />
      <i className="esfera-malla vertical" aria-hidden />
    </button>
  )
}
