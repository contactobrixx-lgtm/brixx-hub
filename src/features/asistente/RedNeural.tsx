import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../components/ui/cn'
import type { EstadoNucleo } from './Nucleo'

export interface NodoRed {
  etiqueta: string
  valor: string
}

interface Props {
  estado: EstadoNucleo
  /** Datos del hub que orbitan alrededor del núcleo (clientes, pipeline, hoy…) */
  nodos: NodoRed[]
  className?: string
  /** Lo que va encima de la red (botón del núcleo, estado, etc.) */
  children?: ReactNode
}

// ---------------------------------------------------------------------------
// Colores: salen de los tokens de index.css (nada de colores sueltos)

type RGB = [number, number, number]
function leerColor(nombre: string, respaldo: RGB): RGB {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()
  const m = v.match(/^#([0-9a-f]{6})$/i)
  if (!m) return respaldo
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mezclar = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

// Cuánta energía tiene cada estado (se interpola para que los cambios sean suaves)
const ESTADO: Record<EstadoNucleo, { giro: number; brillo: number; chispas: number; pulsos: number; respira: number }> = {
  inactivo: { giro: 0.12, brillo: 0.45, chispas: 6, pulsos: 0.2, respira: 0.01 },
  reposo: { giro: 0.25, brillo: 0.8, chispas: 22, pulsos: 0.6, respira: 0.02 },
  escuchando: { giro: 0.35, brillo: 1, chispas: 30, pulsos: 1, respira: 0.04 },
  pensando: { giro: 1.1, brillo: 1, chispas: 55, pulsos: 3.5, respira: 0.03 },
  hablando: { giro: 0.55, brillo: 1.1, chispas: 45, pulsos: 1.5, respira: 0.09 },
}

interface Particula {
  u: number // altura en el núcleo (0 arriba, 1 abajo)
  ang: number
  vel: number
  radio: number
  tam: number
  fase: number
}
interface Chispa {
  x: number
  y: number
  vx: number
  vy: number
  giro: number
  vida: number
  max: number
  color: RGB
  hacia: boolean // va hacia el centro (escuchando)
}
interface Pulso {
  nodo: number
  t: number
  vel: number
  haciaNucleo: boolean
}
interface Onda {
  r: number
  a: number
}

/**
 * La "red" de Jarvis: un núcleo de partículas en espiral, filamentos y chispas, y los datos del hub
 * orbitando conectados por pulsos de luz. Reacciona al estado (reposo, escuchando, pensando, hablando).
 * Canvas 2D, sin librerías. En el celular usa menos partículas; se pausa con la pestaña oculta.
 */
export function RedNeural({ estado, nodos, className, children }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const estadoRef = useRef(estado)
  const nodosRef = useRef(nodos)
  estadoRef.current = estado
  nodosRef.current = nodos

  useEffect(() => {
    const canvas = lienzo.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const fondo = leerColor('--color-fondo', [18, 19, 22])
    const acento = leerColor('--color-acento', [45, 97, 254])
    const claro = leerColor('--color-acento-claro', [196, 207, 254])
    const violeta = leerColor('--color-violeta', [166, 139, 255])
    const naranja = leerColor('--color-naranja', [240, 122, 69])
    const turquesa = leerColor('--color-turquesa', [79, 201, 166])
    const blanco: RGB = mezclar(claro, [255, 255, 255], 0.6)

    /** Color según la altura en el núcleo: arriba violeta/naranja, al medio blanco azulado, abajo turquesa. */
    const colorAltura = (u: number): RGB =>
      u < 0.25
        ? mezclar(naranja, violeta, u / 0.25)
        : u < 0.5
          ? mezclar(violeta, blanco, (u - 0.25) / 0.25)
          : u < 0.7
            ? mezclar(blanco, acento, (u - 0.5) / 0.2)
            : mezclar(acento, turquesa, (u - 0.7) / 0.3)

    let w = 0
    let h = 0
    let dpr = 1
    let particulas: Particula[] = []
    let chispas: Chispa[] = []
    let pulsos: Pulso[] = []
    let ondas: Onda[] = []
    let movil = false

    const crearParticulas = () => {
      const cantidad = Math.round(Math.min(movil ? 650 : 1500, Math.max(320, (w * h) / (movil ? 520 : 420))))
      particulas = Array.from({ length: cantidad }, () => {
        // A lo largo de todo el núcleo, con algo más de densidad al medio
        const u = Math.random() < 0.6 ? Math.random() : Math.min(1, Math.max(0, 0.5 + (Math.random() + Math.random() - 1) * 0.45))
        // La mayoría cerca del eje (una "columna" brillante) y algunas más afuera
        const radio = 0.08 + Math.pow(Math.random(), 1.8) * 1.05
        return {
          u,
          ang: Math.random() * Math.PI * 2,
          vel: 0.25 + Math.random() * 0.6,
          radio,
          tam: (0.6 + Math.random() * (movil ? 1.2 : 1.5)) * (radio < 0.3 ? 1.25 : 1),
          fase: Math.random() * Math.PI * 2,
        }
      })
    }

    const medir = () => {
      const r = canvas.getBoundingClientRect()
      movil = r.width < 640
      dpr = Math.min(window.devicePixelRatio || 1, movil ? 1.5 : 2)
      w = r.width
      h = r.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = rgba(fondo, 1)
      ctx.fillRect(0, 0, w, h)
      crearParticulas()
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(canvas)

    // Valores que se interpolan hacia el estado actual
    const nivel = { ...ESTADO[estadoRef.current] }
    let t = 0
    let ultimo = performance.now()
    let acumuladoChispas = 0
    let acumuladoPulsos = 0
    let proximaOnda = 0
    let raf = 0

    const geometria = () => {
      const lado = Math.min(w, h)
      return {
        cx: w / 2,
        cy: h * 0.47,
        alto: Math.min(h * 0.7, lado * 1.1),
        ancho: lado * (movil ? 0.17 : 0.14),
      }
    }

    /** Posición de cada dato alrededor del núcleo (una elipse que gira muy despacio). */
    const posicionNodo = (i: number, total: number, g: ReturnType<typeof geometria>) => {
      const a = (i / total) * Math.PI * 2 - Math.PI / 2 + t * 0.03 + 0.4
      // Que las etiquetas entren: se deja lugar a los costados para el texto
      const rx = Math.min(w / 2 - (movil ? 78 : 120), g.alto * (movil ? 0.62 : 0.95))
      const ry = Math.min(h / 2 - 48, g.alto * 0.62)
      return { x: g.cx + Math.cos(a) * rx, y: g.cy + Math.sin(a) * ry, a }
    }

    /** Punto de control de la curva núcleo→dato (curvada, como un filamento). */
    const controlCurva = (x: number, y: number, g: ReturnType<typeof geometria>, i: number) => {
      const mx = (g.cx + x) / 2
      const my = (g.cy + y) / 2
      const dx = x - g.cx
      const dy = y - g.cy
      const curva = 0.28 * (i % 2 ? 1 : -1)
      return { x: mx - dy * curva, y: my + dx * curva }
    }
    const enCurva = (p0: { x: number; y: number }, c: { x: number; y: number }, p1: { x: number; y: number }, s: number) => ({
      x: (1 - s) * (1 - s) * p0.x + 2 * (1 - s) * s * c.x + s * s * p1.x,
      y: (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * c.y + s * s * p1.y,
    })

    const cuadro = (ahora: number) => {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000) * (reducido ? 0.3 : 1)
      ultimo = ahora
      t += dt
      const objetivo = ESTADO[estadoRef.current]
      for (const k of Object.keys(nivel) as (keyof typeof nivel)[]) nivel[k] += (objetivo[k] - nivel[k]) * Math.min(1, dt * 2.5)

      const g = geometria()
      const hablando = estadoRef.current === 'hablando'
      const escuchando = estadoRef.current === 'escuchando'
      // "Voz" simulada: suma de senos para que respire de forma irregular al hablar
      const voz = hablando ? 0.5 + 0.5 * Math.sin(t * 9) * Math.sin(t * 3.7 + 1) : 0
      const respira = 1 + Math.sin(t * 1.6) * nivel.respira + voz * 0.08

      // Estela: en vez de borrar, se tapa con el fondo semitransparente
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = rgba(fondo, reducido ? 0.5 : 0.24)
      ctx.fillRect(0, 0, w, h)

      // Halo del núcleo
      const halo = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.alto * 0.7)
      halo.addColorStop(0, rgba(acento, 0.16 * nivel.brillo))
      halo.addColorStop(1, rgba(acento, 0))
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, w, h)

      ctx.globalCompositeOperation = 'lighter'

      // --- Filamentos y datos
      const lista = nodosRef.current.slice(0, movil ? 4 : 6)
      const posiciones = lista.map((_, i) => posicionNodo(i, lista.length, g))
      posiciones.forEach((p, i) => {
        const c = controlCurva(p.x, p.y, g, i)
        ctx.strokeStyle = rgba(claro, 0.07 + 0.05 * nivel.brillo)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(g.cx, g.cy)
        ctx.quadraticCurveTo(c.x, c.y, p.x, p.y)
        ctx.stroke()
      })

      // Pulsos que viajan por los filamentos (hacia el núcleo al pensar, hacia afuera al hablar)
      acumuladoPulsos += dt * nivel.pulsos * Math.max(1, lista.length / 2)
      while (acumuladoPulsos > 1 && lista.length) {
        acumuladoPulsos -= 1
        pulsos.push({ nodo: (Math.random() * lista.length) | 0, t: 0, vel: 0.35 + Math.random() * 0.5, haciaNucleo: estadoRef.current === 'pensando' || (escuchando && Math.random() < 0.7) })
      }
      pulsos = pulsos.filter((pu) => (pu.t += dt * pu.vel) < 1 && pu.nodo < posiciones.length)
      for (const pu of pulsos) {
        const p = posiciones[pu.nodo]
        const c = controlCurva(p.x, p.y, g, pu.nodo)
        const s = pu.haciaNucleo ? 1 - pu.t : pu.t
        const q = enCurva({ x: g.cx, y: g.cy }, c, p, s)
        const col = pu.haciaNucleo ? turquesa : claro
        ctx.fillStyle = rgba(col, 0.9 * Math.sin(Math.PI * pu.t))
        ctx.beginPath()
        ctx.arc(q.x, q.y, movil ? 1.8 : 2.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // --- Núcleo: partículas en espiral con forma de "S"
      for (const pa of particulas) {
        pa.ang += dt * pa.vel * nivel.giro * (pa.u < 0.5 ? 1 : -1) * 1.4
        const perfil = 0.2 + 0.8 * Math.pow(Math.sin(Math.PI * pa.u), 1.4) // más ancho al medio, finito en las puntas
        const curvaS = Math.sin(pa.u * Math.PI * 1.7 + t * 0.35) * g.ancho * 0.9
        const r = g.ancho * perfil * pa.radio * respira
        const prof = Math.sin(pa.ang) // -1 atrás, 1 adelante
        const x = g.cx + curvaS + Math.cos(pa.ang) * r
        const y = g.cy + (pa.u - 0.5) * g.alto * respira + prof * r * 0.18 + Math.sin(t * 2 + pa.fase) * 1.2
        const centelleo = 0.55 + 0.45 * Math.sin(t * 3 + pa.fase)
        const eje = pa.radio < 0.3 // la columna central: más blanca y más brillante
        const alfa = (0.2 + 0.32 * (prof + 1)) * centelleo * nivel.brillo * (eje ? 1.35 : 1)
        const tam = pa.tam * (0.7 + 0.3 * (prof + 1))
        ctx.fillStyle = rgba(eje ? mezclar(colorAltura(pa.u), blanco, 0.55) : colorAltura(pa.u), Math.min(1, alfa))
        ctx.fillRect(x - tam / 2, y - tam / 2, tam, tam)
      }

      // --- Chispas: salen del núcleo en arcos (o entran, al escuchar)
      acumuladoChispas += dt * nivel.chispas * (reducido ? 0.2 : 1)
      const maxChispas = movil ? 160 : 380
      while (acumuladoChispas > 1) {
        acumuladoChispas -= 1
        if (chispas.length >= maxChispas) continue
        const u = Math.random()
        const col = colorAltura(u)
        const ang = Math.random() * Math.PI * 2
        if (escuchando && Math.random() < 0.6) {
          const lejos = Math.min(w, h) * (0.45 + Math.random() * 0.2)
          const x = g.cx + Math.cos(ang) * lejos
          const y = g.cy + Math.sin(ang) * lejos * 0.8
          const v = 70 + Math.random() * 60
          chispas.push({ x, y, vx: -Math.cos(ang) * v, vy: -Math.sin(ang) * v * 0.8, giro: (Math.random() - 0.5) * 1.2, vida: 0, max: 2.2, color: claro, hacia: true })
        } else {
          const x = g.cx + Math.sin(u * Math.PI * 1.7 + t * 0.35) * g.ancho * 0.9 + Math.cos(ang) * g.ancho * 0.5
          const y = g.cy + (u - 0.5) * g.alto
          const v = (45 + Math.random() * 140) * (hablando ? 1.4 : 1) * (movil ? 0.75 : 1)
          chispas.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v * 0.7, giro: (Math.random() - 0.5) * 1.8, vida: 0, max: 1.6 + Math.random() * 2.8, color: col, hacia: false })
        }
      }
      ctx.lineCap = 'round'
      chispas = chispas.filter((c) => (c.vida += dt) < c.max)
      for (const c of chispas) {
        // Curvan de a poco (filamentos)
        const cos = Math.cos(c.giro * dt)
        const sin = Math.sin(c.giro * dt)
        const vx = c.vx * cos - c.vy * sin
        c.vy = c.vx * sin + c.vy * cos
        c.vx = vx
        const px = c.x
        const py = c.y
        c.x += c.vx * dt
        c.y += c.vy * dt
        if (c.hacia && Math.hypot(c.x - g.cx, c.y - g.cy) < g.ancho * 0.6) c.vida = c.max
        const a = Math.sin(Math.PI * (c.vida / c.max)) * 0.75 * nivel.brillo
        ctx.strokeStyle = rgba(c.color, a)
        ctx.lineWidth = movil ? 1 : 1.2
        ctx.beginPath()
        // Cola larga: se ven como filamentos
        ctx.moveTo(px - c.vx * 0.06, py - c.vy * 0.06)
        ctx.lineTo(c.x, c.y)
        ctx.stroke()
      }

      // --- Ondas al hablar
      if (hablando && t > proximaOnda) {
        ondas.push({ r: g.ancho * 0.8, a: 0.35 + voz * 0.3 })
        proximaOnda = t + 0.35 + Math.random() * 0.35
      }
      ondas = ondas.filter((o) => (o.a -= dt * 0.35) > 0)
      for (const o of ondas) {
        o.r += dt * Math.min(w, h) * 0.32
        ctx.strokeStyle = rgba(claro, o.a * (movil ? 0.35 : 0.5))
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.ellipse(g.cx, g.cy, o.r, o.r * 0.82, 0, 0, Math.PI * 2)
        ctx.stroke()
      }

      // --- Datos (nodos) con su etiqueta
      ctx.globalCompositeOperation = 'source-over'
      posiciones.forEach((p, i) => {
        const nodo = lista[i]
        const latido = 0.6 + 0.4 * Math.sin(t * 2 + i)
        const brillo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14)
        brillo.addColorStop(0, rgba(claro, 0.5 * latido))
        brillo.addColorStop(1, rgba(claro, 0))
        ctx.fillStyle = brillo
        ctx.fillRect(p.x - 14, p.y - 14, 28, 28)
        ctx.fillStyle = rgba(blanco, 0.95)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2)
        ctx.fill()
        // Texto del lado de afuera del nodo; si no entra, del lado de adentro
        ctx.font = `700 ${movil ? 13 : 15}px Figtree, system-ui, sans-serif`
        const ancho = Math.max(ctx.measureText(nodo.valor).width, nodo.etiqueta.length * (movil ? 6.5 : 7.5))
        let derecha = p.x >= g.cx
        if (derecha && p.x + 10 + ancho > w - 6) derecha = false
        else if (!derecha && p.x - 10 - ancho < 6) derecha = true
        ctx.textAlign = derecha ? 'left' : 'right'
        const tx = p.x + (derecha ? 10 : -10)
        ctx.font = `600 ${movil ? 9 : 10}px Figtree, system-ui, sans-serif`
        ctx.fillStyle = rgba(claro, 0.75)
        ctx.fillText(nodo.etiqueta.toUpperCase(), tx, p.y - 3)
        ctx.font = `700 ${movil ? 13 : 15}px Figtree, system-ui, sans-serif`
        ctx.fillStyle = rgba(blanco, 0.95)
        ctx.fillText(nodo.valor, tx, p.y + (movil ? 12 : 14))
      })

      raf = requestAnimationFrame(cuadro)
    }

    const arrancar = () => {
      cancelAnimationFrame(raf)
      ultimo = performance.now()
      raf = requestAnimationFrame(cuadro)
    }
    const alCambiarVisibilidad = () => (document.hidden ? cancelAnimationFrame(raf) : arrancar())
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    arrancar()

    return () => {
      cancelAnimationFrame(raf)
      observador.disconnect()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [])

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <canvas ref={lienzo} className="absolute inset-0 size-full" role="img" aria-label={`Red de Jarvis: ${estado}`} />
      {children}
    </div>
  )
}
