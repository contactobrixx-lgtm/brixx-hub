import { useEffect, useRef, useState } from 'react'
import { cn } from '../../components/ui/cn'

const ANCHO = 1280 // la web se dibuja como en una pantalla de escritorio…
const ALTO = 720 // …y se achica al tamaño de la tarjeta

/**
 * Miniatura en vivo de una web: un iframe a tamaño escritorio, escalado y sin interacción.
 * Se monta recién cuando la tarjeta entra en pantalla, para no cargar todas las webs de golpe.
 */
export function PreviewSitio({ url, className }: { url: string; className?: string }) {
  const caja = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [escala, setEscala] = useState(0.25)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    const el = caja.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    const ro = new ResizeObserver(([e]) => setEscala(e.contentRect.width / ANCHO))
    ro.observe(el)
    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [])

  return (
    <div ref={caja} className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden>
      {visible && (
        <iframe
          src={url}
          title=""
          tabIndex={-1}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          onLoad={() => setCargado(true)}
          className={cn('pointer-events-none origin-top-left border-0 bg-white transition-opacity duration-500', cargado ? 'opacity-100' : 'opacity-0')}
          style={{ width: ANCHO, height: ALTO, transform: `scale(${escala})` }}
        />
      )}
    </div>
  )
}
