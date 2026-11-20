// Dibuja un cuadro del video explicativo en un lienzo de 1920×1080. Es una función pura del tiempo:
// la usa el reproductor y la descarga (que graba el lienzo), así lo que se ve es lo que se baja.
// Estética del video de Alcione Deco: fondo carbón, acento azul de brixx, charla de WhatsApp, subtítulos
// con la palabra que se está diciendo resaltada. Los colores salen de los tokens de index.css.
import type { EscenaVideo, GuionVideo } from '../../types/db'
import { escenaEn, type Linea } from './linea'

export const ANCHO = 1920
export const ALTO = 1080

const FUENTE = 'Figtree, system-ui, sans-serif'
const TITULOS = '"Bricolage Grotesque", Figtree, system-ui, sans-serif'

type Paleta = Record<
  | 'fondo'
  | 'superficie'
  | 'elevada'
  | 'borde'
  | 'texto'
  | 'suave'
  | 'tenue'
  | 'acento'
  | 'acentoTexto'
  | 'acentoClaro'
  | 'acentoTenue'
  | 'ok'
  | 'okTenue'
  | 'aviso'
  | 'avisoTenue'
  | 'violeta'
  | 'violetaTenue'
  | 'naranja'
  | 'turquesa',
  string
>

let paleta: Paleta | null = null
function colores(): Paleta {
  if (paleta) return paleta
  const css = getComputedStyle(document.documentElement)
  const t = (n: string, r: string) => css.getPropertyValue(`--color-${n}`).trim() || r
  paleta = {
    fondo: t('fondo', '#121316'),
    superficie: t('superficie', '#1b1d22'),
    elevada: t('elevada', '#24262c'),
    borde: t('borde', '#33363e'),
    texto: t('texto', '#edebe5'),
    suave: t('suave', '#c4c7ce'),
    tenue: t('tenue', '#a2a6af'),
    acento: t('acento', '#2d61fe'),
    acentoTexto: t('acento-texto', '#9db2ff'),
    acentoClaro: t('acento-claro', '#c4cffe'),
    acentoTenue: t('acento-tenue', '#1a2547'),
    ok: t('ok', '#5bc48d'),
    okTenue: t('ok-tenue', '#173326'),
    aviso: t('aviso', '#e8b44f'),
    avisoTenue: t('aviso-tenue', '#352812'),
    violeta: t('violeta', '#a68bff'),
    violetaTenue: t('violeta-tenue', '#2b2347'),
    naranja: t('naranja', '#f07a45'),
    turquesa: t('turquesa', '#4fc9a6'),
  }
  return paleta
}

/** Que las fuentes del hub estén cargadas antes de dibujar (si no, el lienzo usa la del sistema) */
export async function cargarFuentes() {
  await Promise.all(
    ['700 40px "Bricolage Grotesque"', '400 30px Figtree', '600 30px Figtree', '700 30px Figtree'].map((f) => document.fonts.load(f).catch(() => null)),
  )
}

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------
const lim = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const suave = (x: number) => {
  const u = lim(x)
  return 1 - Math.pow(1 - u, 3)
}
/** Aparece en `dur` segundos desde `desde` (0 → 1) */
const entrada = (t: number, desde: number, dur = 0.45) => suave((t - desde) / dur)

function caja(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, relleno?: string, borde?: string, grosor = 2) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  if (relleno) {
    ctx.fillStyle = relleno
    ctx.fill()
  }
  if (borde) {
    ctx.strokeStyle = borde
    ctx.lineWidth = grosor
    ctx.stroke()
  }
}

/** Corta un texto en renglones que entran en `ancho` */
function renglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const out: string[] = []
  for (const parrafo of texto.split('\n')) {
    let linea = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (ctx.measureText(prueba).width > ancho && linea) {
        out.push(linea)
        linea = palabra
      } else linea = prueba
    }
    if (linea) out.push(linea)
  }
  return out
}

function textoEn(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, ancho: number, alto: number, max = 99): number {
  const ls = renglones(ctx, texto, ancho).slice(0, max)
  ls.forEach((l, i) => ctx.fillText(l, x, y + i * alto))
  return ls.length * alto
}

const fuente = (peso: number, tam: number, familia = FUENTE) => `${peso} ${tam}px ${familia}`

function etiquetaSeccion(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number) {
  const c = colores()
  ctx.fillStyle = c.acento
  ctx.beginPath()
  ctx.arc(x + 7, y - 8, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = fuente(700, 22)
  ctx.fillStyle = c.acentoTexto
  ctx.letterSpacing = '4px'
  ctx.fillText(texto.toUpperCase(), x + 26, y)
  ctx.letterSpacing = '0px'
}

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, tam: number) {
  const c = colores()
  caja(ctx, x, y, tam, tam, tam * 0.26, '#000', c.borde, 1.5)
  const m = tam * 0.24
  const s = (tam - 2 * m) / 176
  const r = (rx: number, ry: number, w: number, h: number, color: string) => caja(ctx, x + m + rx * s, y + m + ry * s * 0.95 + tam * 0.02, w * s, h * s * 0.95, 17 * s, color)
  r(97, 0, 79, 74, '#fff')
  r(0, 90, 79, 78, c.acento)
  r(97, 90, 79, 78, c.acentoClaro)
}

// ---------------------------------------------------------------------------
// Fondo y cabecera (todas las escenas)
// ---------------------------------------------------------------------------
let fondoCache: HTMLCanvasElement | null = null
function fondo(ctx: CanvasRenderingContext2D) {
  if (!fondoCache) {
    const c = colores()
    const f = document.createElement('canvas')
    f.width = ANCHO
    f.height = ALTO
    const g = f.getContext('2d')!
    g.fillStyle = c.fondo
    g.fillRect(0, 0, ANCHO, ALTO)
    const azul = g.createRadialGradient(0, ALTO, 0, 0, ALTO, 1100)
    azul.addColorStop(0, `${c.acento}38`)
    azul.addColorStop(1, `${c.acento}00`)
    g.fillStyle = azul
    g.fillRect(0, 0, ANCHO, ALTO)
    const naranja = g.createRadialGradient(ANCHO, ALTO, 0, ANCHO, ALTO, 900)
    naranja.addColorStop(0, `${c.naranja}22`)
    naranja.addColorStop(1, `${c.naranja}00`)
    g.fillStyle = naranja
    g.fillRect(0, 0, ANCHO, ALTO)
    fondoCache = f
  }
  ctx.drawImage(fondoCache, 0, 0)
}

function cabecera(ctx: CanvasRenderingContext2D, guion: GuionVideo) {
  const c = colores()
  logo(ctx, 56, 34, 50)
  ctx.textBaseline = 'middle'
  ctx.font = fuente(700, 32)
  ctx.fillStyle = c.texto
  ctx.fillText('brixx', 122, 60)
  const wb = ctx.measureText('brixx').width
  ctx.font = fuente(600, 32)
  ctx.fillStyle = c.suave
  ctx.fillText(` × ${guion.cliente}`, 122 + wb, 60)
  ctx.font = fuente(600, 24)
  const w = ctx.measureText(guion.etiqueta).width + 44
  caja(ctx, ANCHO - 56 - w, 36, w, 48, 24, c.acentoTenue, `${c.acento}aa`)
  ctx.fillStyle = c.acentoClaro
  ctx.fillText(guion.etiqueta, ANCHO - 56 - w + 22, 61)
  ctx.textBaseline = 'alphabetic'
}

// ---------------------------------------------------------------------------
// Subtítulos: el renglón que se está diciendo, con la palabra actual resaltada
// ---------------------------------------------------------------------------
function subtitulos(ctx: CanvasRenderingContext2D, linea: Linea, t: number) {
  const c = colores()
  const i = escenaEn(linea, t)
  const ps = linea.palabras.filter((p) => p.escena === i)
  if (!ps.length || t < ps[0].s - 0.1 || t > ps[ps.length - 1].e + 0.6) return
  // Renglones de hasta ~40 letras, cortando en puntos y comas cuando se puede
  const grupos: (typeof ps)[] = []
  let actual: typeof ps = []
  let largo = 0
  for (const p of ps) {
    if (actual.length && largo + p.w.length > 40) {
      grupos.push(actual)
      actual = []
      largo = 0
    }
    actual.push(p)
    largo += p.w.length + 1
    if (/[.!?]$/.test(p.w) && largo > 16) {
      grupos.push(actual)
      actual = []
      largo = 0
    }
  }
  if (actual.length) grupos.push(actual)
  const g = grupos.find((gr) => t <= gr[gr.length - 1].e + 0.15) ?? grupos[grupos.length - 1]
  ctx.font = fuente(700, 50)
  ctx.textBaseline = 'middle'
  const esp = ctx.measureText(' ').width
  const anchos = g.map((p) => ctx.measureText(p.w).width)
  const total = anchos.reduce((a, b) => a + b, 0) + esp * (g.length - 1)
  let x = (ANCHO - total) / 2
  const y = 985
  g.forEach((p, k) => {
    const dicha = t >= p.s
    const ahora = t >= p.s && t < (g[k + 1]?.s ?? p.e + 0.25)
    if (ahora) caja(ctx, x - 10, y - 34, anchos[k] + 20, 68, 12, c.acento)
    ctx.fillStyle = dicha ? '#fff' : `${c.texto}66`
    ctx.fillText(p.w, x, y + 2)
    x += anchos[k] + esp
  })
  ctx.textBaseline = 'alphabetic'
}

// ---------------------------------------------------------------------------
// Escenas
// ---------------------------------------------------------------------------
function apertura(ctx: CanvasRenderingContext2D, e: EscenaVideo, guion: GuionVideo, u: number) {
  const c = colores()
  const a = entrada(u, 0.1, 0.7)
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(0, (1 - a) * 40)
  ctx.textAlign = 'center'
  ctx.font = fuente(700, 24)
  ctx.fillStyle = c.acentoTexto
  ctx.letterSpacing = '5px'
  ctx.fillText(`PARA ${guion.cliente.toUpperCase()}`, ANCHO / 2, 330)
  ctx.letterSpacing = '0px'
  ctx.font = fuente(700, 96, TITULOS)
  ctx.fillStyle = c.texto
  const alto = textoEn(ctx, e.titulo ?? guion.titulo, ANCHO / 2, 450, 1500, 108, 3)
  if (e.subtitulo) {
    const b = entrada(u, 0.6, 0.6)
    ctx.globalAlpha = a * b
    ctx.font = fuente(500, 42)
    ctx.fillStyle = c.suave
    textoEn(ctx, e.subtitulo, ANCHO / 2, 450 + alto + 40, 1400, 54, 2)
  }
  ctx.restore()
}

/** Mensajes de las escenas chat seguidas con el mismo contacto (la charla continúa) */
function historial(guion: GuionVideo, i: number): EscenaVideo['mensajes'] {
  const out: EscenaVideo['mensajes'] = []
  const e = guion.escenas[i]
  for (let k = i - 1; k >= 0; k--) {
    const p = guion.escenas[k]
    if (p.tipo !== 'chat' || (p.contacto ?? '') !== (e.contacto ?? '')) break
    out.unshift(...p.mensajes)
  }
  return out
}

function chat(ctx: CanvasRenderingContext2D, e: EscenaVideo, guion: GuionVideo, i: number, u: number, dur: number) {
  const c = colores()
  const a = entrada(u, 0, 0.4)
  ctx.save()
  ctx.globalAlpha = a
  // Ventana de WhatsApp
  const X = 60
  const Y = 124
  const W = 1180
  const H = 750
  caja(ctx, X, Y, W, H, 26, c.superficie, c.borde)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(X, Y, W, H, 26)
  ctx.clip()
  ctx.fillStyle = c.elevada
  ctx.fillRect(X, Y, W, 92)
  const nombre = e.contacto ?? 'Cliente'
  const interno = e.vista === 'equipo'
  ctx.fillStyle = interno ? c.turquesa : c.violeta
  ctx.beginPath()
  ctx.arc(X + 58, Y + 46, 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = c.fondo
  ctx.font = fuente(700, 26)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(nombre.charAt(0).toUpperCase(), X + 58, Y + 47)
  ctx.textAlign = 'left'
  ctx.fillStyle = c.texto
  ctx.font = fuente(700, 28)
  ctx.fillText(nombre, X + 100, Y + 34)
  ctx.fillStyle = interno ? c.turquesa : c.ok
  ctx.font = fuente(500, 20)
  ctx.fillText(interno ? `Hablando con el asistente de ${guion.cliente}` : `en línea · WhatsApp de ${guion.cliente}`, X + 100, Y + 64)
  if (interno) {
    // Marca que es el lado del dueño y su equipo
    const txt = `Del lado de ${guion.cliente}`
    ctx.font = fuente(700, 20)
    const w = ctx.measureText(txt).width + 36
    caja(ctx, X + W - 30 - w, Y + 26, w, 40, 20, c.acentoTenue, `${c.turquesa}aa`)
    ctx.fillStyle = c.turquesa
    ctx.fillText(txt, X + W - 30 - w + 18, Y + 47)
  }
  ctx.textBaseline = 'alphabetic'

  // Mensajes: los de antes (si la charla sigue) ya están; los nuevos aparecen de a uno
  const previos = historial(guion, i)
  const nuevos = e.mensajes
  const tramo = Math.max(1, dur * 0.82 - 0.5)
  const aparece = nuevos.map((_, k) => 0.5 + (k * tramo) / Math.max(1, nuevos.length))
  type Burbuja = { m: EscenaVideo['mensajes'][number]; desde: number }
  const visibles: Burbuja[] = [...previos.map((m) => ({ m, desde: -9 })), ...nuevos.map((m, k) => ({ m, desde: aparece[k] })).filter((b) => u >= b.desde)]
  const escribiendo = nuevos.findIndex((m, k) => m.de !== 'cliente' && m.de !== 'aviso' && u >= aparece[k] - 0.8 && u < aparece[k])

  const maxW = 720
  const medidas = visibles.map((b) => {
    if (b.m.de === 'aviso') {
      ctx.font = fuente(600, 22)
      return { ...b, ls: [b.m.texto], w: ctx.measureText(b.m.texto).width + 40, h: 46 }
    }
    ctx.font = fuente(400, 30)
    const ls = renglones(ctx, b.m.texto, maxW - 44)
    const w = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 44
    const extra = b.m.de === 'persona' ? 30 : 0
    return { ...b, ls, w: Math.max(w, b.m.de === 'persona' ? 260 : 120), h: ls.length * 40 + 30 + extra }
  })
  const fondoChat = Y + H - 86
  let y = fondoChat - 20
  if (escribiendo >= 0) y -= 74
  const dibujar: { b: (typeof medidas)[number]; y: number }[] = []
  for (let k = medidas.length - 1; k >= 0; k--) {
    y -= medidas[k].h
    dibujar.unshift({ b: medidas[k], y })
    y -= 16
    if (y < Y + 92) break
  }
  ctx.beginPath()
  ctx.rect(X, Y + 92, W, H - 92 - 86)
  ctx.clip()
  for (const { b, y: by } of dibujar) {
    const ap = entrada(u, b.desde, 0.3)
    ctx.save()
    ctx.globalAlpha = a * ap
    const dy = (1 - ap) * 24
    const derecha = b.m.de === 'bot' || b.m.de === 'persona'
    if (b.m.de === 'aviso') {
      const bx = X + (W - b.w) / 2
      caja(ctx, bx, by + dy, b.w, b.h, 23, c.acentoTenue)
      ctx.fillStyle = c.acentoClaro
      ctx.font = fuente(600, 22)
      ctx.textBaseline = 'middle'
      ctx.fillText(b.m.texto, bx + 20, by + dy + b.h / 2 + 1)
      ctx.textBaseline = 'alphabetic'
    } else {
      const bx = derecha ? X + W - 40 - b.w : X + 40
      caja(ctx, bx, by + dy, b.w, b.h, 18, b.m.de === 'cliente' ? c.elevada : b.m.de === 'bot' ? c.okTenue : c.violetaTenue)
      let ty = by + dy + 44
      if (b.m.de === 'persona') {
        ctx.font = fuente(700, 20)
        ctx.fillStyle = c.violeta
        ctx.fillText(`Equipo de ${guion.cliente}`, bx + 22, by + dy + 32)
        ty += 28
      }
      ctx.font = fuente(400, 30)
      ctx.fillStyle = c.texto
      b.ls.forEach((l, k) => ctx.fillText(l, bx + 22, ty + k * 40))
    }
    ctx.restore()
  }
  if (escribiendo >= 0) {
    const bx = X + W - 40 - 120
    const by = fondoChat - 20 - 60
    caja(ctx, bx, by, 120, 60, 18, c.okTenue)
    for (let k = 0; k < 3; k++) {
      const fase = (u * 3 + k * 0.35) % 1
      ctx.fillStyle = c.ok
      ctx.globalAlpha = a * (0.35 + 0.65 * Math.sin(fase * Math.PI))
      ctx.beginPath()
      ctx.arc(bx + 36 + k * 24, by + 30, 7, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = a
  }
  ctx.restore()
  // Barra de escribir
  caja(ctx, X + 30, Y + H - 70, W - 130, 52, 26, c.elevada)
  ctx.fillStyle = c.tenue
  ctx.font = fuente(400, 22)
  ctx.fillText('Escribí un mensaje', X + 60, Y + H - 36)
  ctx.restore()

  // Por dentro: lo que hace el sistema mientras chatea
  const PX = 1280
  const PW = 580
  ctx.save()
  ctx.globalAlpha = entrada(u, 0.2, 0.5)
  caja(ctx, PX, Y, PW, H, 26, c.superficie, c.borde)
  etiquetaSeccion(ctx, 'Por dentro', PX + 36, Y + 60)
  ctx.font = fuente(700, 38, TITULOS)
  ctx.fillStyle = c.texto
  textoEn(ctx, 'Lo que hace mientras chatea', PX + 36, Y + 116, PW - 72, 44, 2)
  const pasos = e.por_dentro.slice(0, 5)
  const prendido = (k: number) => 0.6 + (k * Math.max(1, dur * 0.8 - 0.6)) / Math.max(1, pasos.length)
  pasos.forEach((p, k) => {
    const on = u >= prendido(k)
    const ultimo = on && (k === pasos.length - 1 || u < prendido(k + 1))
    const py = Y + 210 + k * 104
    ctx.globalAlpha = on ? 1 : 0.32
    if (ultimo) caja(ctx, PX + 22, py - 14, PW - 44, 92, 16, c.acentoTenue, `${c.acento}99`)
    caja(ctx, PX + 40, py + 4, 44, 44, 12, on ? c.acento : c.elevada)
    ctx.fillStyle = '#fff'
    ctx.font = fuente(700, 22)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(on ? '✓' : String(k + 1), PX + 62, py + 27)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = c.texto
    ctx.font = fuente(700, 27)
    ctx.fillText(p.titulo, PX + 104, py + 22, PW - 140)
    ctx.fillStyle = c.tenue
    ctx.font = fuente(400, 21)
    ctx.fillText(p.detalle, PX + 104, py + 56, PW - 140)
  })
  ctx.restore()
}

// Agenda del dueño o de cada profesional: los turnos cambian de estado y le llega un aviso por cada cambio
const ESTADO_TURNO = {
  confirmado: { etiqueta: 'Confirmado' },
  pendiente: { etiqueta: 'Sin confirmar' },
  libre: { etiqueta: 'Libre' },
  reprogramado: { etiqueta: 'Reprogramado' },
  bloqueado: { etiqueta: 'Bloqueado' },
} as const
type EstadoTurno = keyof typeof ESTADO_TURNO

function coloresTurno(estado: EstadoTurno) {
  const c = colores()
  if (estado === 'confirmado') return { fondo: c.okTenue, texto: c.ok, borde: `${c.ok}66` }
  if (estado === 'pendiente') return { fondo: c.avisoTenue, texto: c.aviso, borde: `${c.aviso}66` }
  if (estado === 'reprogramado') return { fondo: c.violetaTenue, texto: c.violeta, borde: `${c.violeta}66` }
  if (estado === 'bloqueado') return { fondo: c.elevada, texto: c.tenue, borde: c.borde }
  return { fondo: 'transparent', texto: c.tenue, borde: c.borde }
}

const horaComparable = (h: string) => {
  const m = /(\d{1,2})[:.h]?(\d{2})?/.exec(h)
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9999
}

function agenda(ctx: CanvasRenderingContext2D, e: EscenaVideo, guion: GuionVideo, u: number, dur: number) {
  const c = colores()
  encabezado(ctx, e.seccion ?? `Del lado de ${guion.cliente}`, e.titulo, u)
  const columnas = (e.columnas ?? []).slice(0, 3)
  if (!columnas.length) return
  const cambios = (e.cambios ?? []).slice(0, 5)
  const pasa = (k: number) => 1.2 + (k * Math.max(1, dur * 0.8 - 1.2)) / Math.max(1, cambios.length)
  // Estado de cada turno ahora: el original + los cambios que ya pasaron
  type Celda = { paciente: string | null; estado: EstadoTurno; cambio: number | null }
  const celdas = new Map<string, Celda>()
  const clave = (col: string, hora: string) => `${col.toLowerCase()}|${horaComparable(hora)}`
  const horas = new Set<number>()
  const textoHora = new Map<number, string>()
  for (const col of columnas)
    for (const t of col.turnos.slice(0, 7)) {
      const h = horaComparable(t.hora)
      horas.add(h)
      textoHora.set(h, t.hora)
      celdas.set(clave(col.nombre, t.hora), { paciente: t.paciente, estado: (t.estado as EstadoTurno) in ESTADO_TURNO ? (t.estado as EstadoTurno) : 'pendiente', cambio: null })
    }
  cambios.forEach((ch, k) => {
    const h = horaComparable(ch.hora)
    if (!horas.has(h) && horas.size < 8) {
      horas.add(h)
      textoHora.set(h, ch.hora)
    }
    if (u >= pasa(k)) {
      const est = (ch.estado as EstadoTurno) in ESTADO_TURNO ? (ch.estado as EstadoTurno) : 'confirmado'
      celdas.set(clave(ch.columna, ch.hora), { paciente: ch.paciente, estado: est, cambio: k })
    }
  })
  const filas = [...horas].sort((a, b) => a - b).slice(0, 8)

  const X = 60
  const Y = 310
  const W = 1220
  const H = 600
  const a = entrada(u, 0.2, 0.5)
  ctx.save()
  ctx.globalAlpha = a
  caja(ctx, X, Y, W, H, 24, c.superficie, c.borde)
  const colHora = 130
  const anchoCol = (W - colHora - 30) / columnas.length
  const altoFila = Math.min(78, (H - 100) / Math.max(1, filas.length))
  // Encabezado de columnas
  columnas.forEach((col, k) => {
    const cx = X + colHora + k * anchoCol
    ctx.fillStyle = [c.acento, c.turquesa, c.violeta][k % 3]
    ctx.beginPath()
    ctx.arc(cx + 22, Y + 46, 17, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.fondo
    ctx.font = fuente(700, 18)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(col.nombre.replace(/^(dra?\.?|lic\.?)\s*/i, '').charAt(0).toUpperCase(), cx + 22, Y + 47)
    ctx.textAlign = 'left'
    ctx.fillStyle = c.texto
    ctx.font = fuente(700, 26)
    ctx.fillText(col.nombre, cx + 50, Y + 47, anchoCol - 70)
    ctx.textBaseline = 'alphabetic'
  })
  ctx.fillStyle = c.borde
  ctx.fillRect(X + 20, Y + 84, W - 40, 1.5)
  // Turnos
  filas.forEach((h, f) => {
    const fy = Y + 100 + f * altoFila
    ctx.fillStyle = c.tenue
    ctx.font = fuente(600, 22)
    ctx.textBaseline = 'middle'
    ctx.fillText(textoHora.get(h) ?? '', X + 34, fy + altoFila / 2 - 4)
    columnas.forEach((col, k) => {
      const cel = celdas.get(clave(col.nombre, textoHora.get(h) ?? ''))
      const cx = X + colHora + k * anchoCol
      const w = anchoCol - 16
      const hh = altoFila - 12
      if (!cel) return
      const col2 = coloresTurno(cel.estado)
      const recien = cel.cambio != null ? entrada(u, pasa(cel.cambio), 0.5) : 1
      ctx.save()
      if (cel.estado === 'libre') ctx.setLineDash([8, 6])
      caja(ctx, cx, fy - 2, w, hh, 12, col2.fondo, col2.borde, 2)
      ctx.setLineDash([])
      if (cel.cambio != null && recien < 1) {
        // Destello del turno que recién cambió
        ctx.globalAlpha = a * (1 - recien)
        caja(ctx, cx - 6, fy - 8, w + 12, hh + 12, 16, undefined, c.acentoClaro, 4)
        ctx.globalAlpha = a
      }
      ctx.fillStyle = cel.paciente ? c.texto : c.tenue
      ctx.font = fuente(cel.paciente ? 600 : 500, 22)
      ctx.fillText(cel.paciente ?? '—', cx + 16, fy + hh / 2 - 12, w - 32)
      ctx.fillStyle = col2.texto
      ctx.font = fuente(600, 17)
      ctx.fillText(ESTADO_TURNO[cel.estado].etiqueta, cx + 16, fy + hh / 2 + 13, w - 32)
      ctx.restore()
    })
    ctx.textBaseline = 'alphabetic'
  })
  ctx.restore()

  // Avisos que le llegan al dueño
  const PX = 1310
  const PW = 550
  ctx.save()
  ctx.globalAlpha = entrada(u, 0.3, 0.5)
  caja(ctx, PX, Y, PW, H, 24, c.superficie, c.borde)
  etiquetaSeccion(ctx, 'Avisos', PX + 32, Y + 54)
  ctx.font = fuente(700, 30, TITULOS)
  ctx.fillStyle = c.texto
  ctx.fillText('Lo que te llega', PX + 32, Y + 102)
  cambios.forEach((ch, k) => {
    const on = entrada(u, pasa(k), 0.4)
    if (on <= 0) return
    ctx.save()
    ctx.globalAlpha = on
    const py = Y + 136 + k * 90 + (1 - on) * 16
    const ultimo = k === cambios.length - 1 || u < pasa(k + 1)
    caja(ctx, PX + 22, py, PW - 44, 78, 14, ultimo ? c.acentoTenue : c.elevada, ultimo ? `${c.acento}99` : undefined)
    const est = (ch.estado as EstadoTurno) in ESTADO_TURNO ? (ch.estado as EstadoTurno) : 'confirmado'
    ctx.fillStyle = coloresTurno(est).texto
    ctx.beginPath()
    ctx.arc(PX + 50, py + 39, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = c.texto
    ctx.font = fuente(600, 21)
    textoEn(ctx, ch.nota, PX + 72, py + 33, PW - 120, 26, 2)
    ctx.restore()
  })
  ctx.restore()
}

// Paso a paso (video interno): una línea de tiempo con los pasos numerados, que aparecen de a uno
function pasos(ctx: CanvasRenderingContext2D, e: EscenaVideo, u: number, dur: number) {
  const c = colores()
  encabezado(ctx, e.seccion ?? 'Paso a paso', e.titulo, u)
  const items = e.items.slice(0, 8)
  const dosColumnas = items.length > 4
  const porColumna = dosColumnas ? Math.ceil(items.length / 2) : items.length
  const ancho = dosColumnas ? (ANCHO - 120 - 40) / 2 : ANCHO - 120
  const paso = Math.min(140, (900 - 320) / Math.max(1, porColumna))
  items.forEach((it, k) => {
    const on = entrada(u, 0.6 + (k * Math.max(1, dur * 0.8 - 0.6)) / Math.max(1, items.length), 0.45)
    const col = dosColumnas && k >= porColumna ? 1 : 0
    const fila = col ? k - porColumna : k
    const x = 60 + col * (ancho + 40)
    const y = 330 + fila * paso
    // Línea que une los pasos de la columna
    if (fila < porColumna - 1 && k < items.length - 1) {
      ctx.save()
      ctx.globalAlpha = 0.25 + 0.75 * entrada(u, 0.6 + ((k + 1) * Math.max(1, dur * 0.8 - 0.6)) / Math.max(1, items.length), 0.45)
      ctx.fillStyle = c.borde
      ctx.fillRect(x + 35, y + 64, 3, paso - 64)
      ctx.restore()
    }
    ctx.save()
    ctx.globalAlpha = 0.25 + 0.75 * on
    const actual = on > 0 && (k === items.length - 1 || u < 0.6 + ((k + 1) * Math.max(1, dur * 0.8 - 0.6)) / Math.max(1, items.length))
    caja(ctx, x + 6, y, 62, 62, 31, on > 0 ? c.acento : c.elevada, actual ? c.acentoClaro : undefined, 3)
    ctx.fillStyle = '#fff'
    ctx.font = fuente(700, 28)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(k + 1), x + 37, y + 32)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.translate((1 - on) * 20, 0)
    ctx.fillStyle = c.texto
    ctx.font = fuente(700, 32)
    ctx.fillText(it.titulo, x + 96, y + 30, ancho - 110)
    ctx.fillStyle = c.suave
    ctx.font = fuente(400, 24)
    textoEn(ctx, it.detalle, x + 96, y + 64, ancho - 110, 30, paso > 120 ? 2 : 1)
    ctx.restore()
  })
}

function encabezado(ctx: CanvasRenderingContext2D, etiqueta: string, titulo: string | null, u: number) {
  const c = colores()
  const a = entrada(u, 0, 0.5)
  ctx.save()
  ctx.globalAlpha = a
  etiquetaSeccion(ctx, etiqueta, 60, 180)
  if (titulo) {
    ctx.font = fuente(700, 72, TITULOS)
    ctx.fillStyle = c.texto
    ctx.fillText(titulo, 60, 268, ANCHO - 120)
  }
  ctx.restore()
}

function flujo(ctx: CanvasRenderingContext2D, e: EscenaVideo, u: number, dur: number) {
  const c = colores()
  encabezado(ctx, e.seccion ?? 'Cómo funciona', e.titulo, u)
  const cx = ANCHO / 2
  const cy = 600
  const items = e.items.slice(0, 6)
  const n = items.length
  // Tarjetas alrededor del centro: mitad a la izquierda, mitad a la derecha
  const izq = Math.ceil(n / 2)
  const pos = items.map((_, k) => {
    const lado = k < izq ? -1 : 1
    const j = k < izq ? k : k - izq
    const cuantos = k < izq ? izq : n - izq
    const yy = cy + (j - (cuantos - 1) / 2) * 190
    return { x: cx + lado * 560, y: yy }
  })
  const aparece = (k: number) => 0.6 + (k * Math.max(1, dur * 0.75 - 0.6)) / Math.max(1, n)
  // Líneas
  items.forEach((_, k) => {
    const p = pos[k]
    const on = entrada(u, aparece(k), 0.6)
    if (on <= 0) return
    ctx.save()
    ctx.globalAlpha = on
    ctx.strokeStyle = `${c.acento}aa`
    ctx.lineWidth = 3
    const ex = p.x + (p.x < cx ? 180 : -180)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.quadraticCurveTo((cx + ex) / 2, p.y, ex, p.y)
    ctx.stroke()
    // Un pulso que viaja por la línea
    const f = ((u - aparece(k)) * 0.5) % 1
    const qx = (1 - f) * (1 - f) * cx + 2 * (1 - f) * f * ((cx + ex) / 2) + f * f * ex
    const qy = (1 - f) * (1 - f) * cy + 2 * (1 - f) * f * p.y + f * f * p.y
    ctx.fillStyle = c.acentoClaro
    ctx.beginPath()
    ctx.arc(qx, qy, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
  // Centro
  const ac = entrada(u, 0.2, 0.6)
  ctx.save()
  ctx.globalAlpha = ac
  const brillo = ctx.createRadialGradient(cx, cy, 60, cx, cy, 230)
  brillo.addColorStop(0, `${c.acento}66`)
  brillo.addColorStop(1, `${c.acento}00`)
  ctx.fillStyle = brillo
  ctx.fillRect(cx - 240, cy - 240, 480, 480)
  ctx.fillStyle = c.acento
  ctx.beginPath()
  ctx.arc(cx, cy, 118, 0, Math.PI * 2)
  ctx.fill()
  logo(ctx, cx - 46, cy - 46, 92)
  ctx.restore()
  // Tarjetas
  items.forEach((it, k) => {
    const p = pos[k]
    const on = entrada(u, aparece(k), 0.45)
    if (on <= 0) return
    ctx.save()
    ctx.globalAlpha = on
    const w = 360
    const h = 140
    const x = p.x - w / 2
    const y = p.y - h / 2 + (1 - on) * 20
    caja(ctx, x, y, w, h, 20, c.superficie, c.borde)
    caja(ctx, x + 24, y + 24, 44, 44, 12, c.acentoTenue)
    ctx.fillStyle = c.acentoClaro
    ctx.font = fuente(700, 22)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(k + 1), x + 46, y + 47)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = c.texto
    ctx.font = fuente(700, 30)
    ctx.fillText(it.titulo, x + 84, y + 56, w - 104)
    ctx.fillStyle = c.tenue
    ctx.font = fuente(400, 22)
    textoEn(ctx, it.detalle, x + 24, y + 104, w - 48, 28, 2)
    ctx.restore()
  })
}

function panel(ctx: CanvasRenderingContext2D, e: EscenaVideo, guion: GuionVideo, u: number, dur: number) {
  const c = colores()
  encabezado(ctx, e.seccion ?? `Lo que ve ${guion.cliente}`, e.titulo, u)
  const X = 160
  const Y = 330
  const W = ANCHO - 320
  const items = e.items.slice(0, 5)
  // Filas que entran entre el título y los subtítulos (el panel termina antes de y = 915)
  const paso = Math.min(104, (915 - Y - 110) / Math.max(1, items.length))
  const alto = paso - 16
  const H = 110 + items.length * paso
  const a = entrada(u, 0.3, 0.5)
  ctx.save()
  ctx.globalAlpha = a
  caja(ctx, X, Y, W, H, 24, c.superficie, c.borde)
  ;[c.naranja, c.turquesa, c.ok].forEach((col, k) => {
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(X + 40 + k * 28, Y + 44, 9, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.fillStyle = c.tenue
  ctx.font = fuente(600, 22)
  ctx.fillText(e.seccion ? `Plan de brixx para ${guion.cliente}` : `Panel de ${guion.cliente}`, X + 140, Y + 52)
  const colorFila = [c.acento, c.turquesa, c.violeta, c.naranja, c.ok]
  items.forEach((it, k) => {
    const on = entrada(u, 0.7 + (k * Math.max(1, dur * 0.7 - 0.7)) / Math.max(1, items.length), 0.4)
    if (on <= 0) return
    ctx.save()
    ctx.globalAlpha = a * on
    const fy = Y + 96 + k * paso + (1 - on) * 16
    caja(ctx, X + 30, fy, W - 60, alto, 16, c.elevada)
    caja(ctx, X + 30, fy, 8, alto, 4, colorFila[k % colorFila.length])
    ctx.fillStyle = c.texto
    ctx.font = fuente(700, 30)
    ctx.fillText(it.titulo, X + 64, fy + alto / 2 - 4, 640)
    ctx.fillStyle = c.tenue
    ctx.font = fuente(400, 24)
    ctx.fillText(it.detalle, X + 64, fy + alto / 2 + 28, W - 200)
    ctx.restore()
  })
  ctx.restore()
}

function beneficios(ctx: CanvasRenderingContext2D, e: EscenaVideo, u: number, dur: number) {
  const c = colores()
  encabezado(ctx, e.seccion ?? 'Beneficios', e.titulo, u)
  const items = e.items.slice(0, 6)
  const cols = items.length <= 4 ? 2 : 3
  const gap = 30
  const W = (ANCHO - 120 - gap * (cols - 1)) / cols
  const H = items.length <= 4 ? 230 : 210
  const iconos = [c.acento, c.turquesa, c.violeta, c.naranja, c.ok, c.acentoClaro]
  items.forEach((it, k) => {
    const on = entrada(u, 0.6 + (k * Math.max(1, dur * 0.75 - 0.6)) / Math.max(1, items.length), 0.45)
    if (on <= 0) return
    const x = 60 + (k % cols) * (W + gap)
    const y = 330 + Math.floor(k / cols) * (H + gap) + (1 - on) * 24
    ctx.save()
    ctx.globalAlpha = on
    caja(ctx, x, y, W, H, 22, c.superficie, c.borde)
    caja(ctx, x + 30, y + 30, 56, 56, 16, `${iconos[k % iconos.length]}33`)
    ctx.fillStyle = iconos[k % iconos.length]
    ctx.font = fuente(700, 28)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✓', x + 58, y + 59)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = c.texto
    ctx.font = fuente(700, 34)
    ctx.fillText(it.titulo, x + 30, y + 132, W - 60)
    ctx.fillStyle = c.tenue
    ctx.font = fuente(400, 25)
    textoEn(ctx, it.detalle, x + 30, y + 174, W - 60, 32, 2)
    ctx.restore()
  })
}

function cierre(ctx: CanvasRenderingContext2D, e: EscenaVideo, guion: GuionVideo, u: number) {
  const c = colores()
  const a = entrada(u, 0.1, 0.7)
  ctx.save()
  ctx.globalAlpha = a
  ctx.translate(0, (1 - a) * 30)
  logo(ctx, ANCHO / 2 - 60, 250, 120)
  ctx.textAlign = 'center'
  ctx.font = fuente(700, 80, TITULOS)
  ctx.fillStyle = c.texto
  const alto = textoEn(ctx, e.titulo ?? `Así podría funcionar ${guion.cliente}`, ANCHO / 2, 520, 1500, 92, 2)
  ctx.font = fuente(600, 40)
  ctx.fillStyle = c.acentoTexto
  ctx.fillText(e.subtitulo ?? 'Lo armamos en brixx.', ANCHO / 2, 520 + alto + 40)
  ctx.restore()
}

// ---------------------------------------------------------------------------

/** Dibuja el cuadro del segundo `t` */
export function dibujarCuadro(ctx: CanvasRenderingContext2D, guion: GuionVideo, linea: Linea, t: number) {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.globalAlpha = 1
  fondo(ctx)
  cabecera(ctx, guion)
  const i = escenaEn(linea, t)
  const e = guion.escenas[i]
  const tr = linea.escenas[i]
  if (e && tr) {
    const u = t - tr.inicio
    const dur = tr.fin - tr.inicio
    // Al final de cada escena (menos la última) se desvanece un poco
    const salida = i < guion.escenas.length - 1 ? 1 - lim((t - (tr.fin + 0.1)) / 0.3) : 1
    ctx.save()
    ctx.globalAlpha = salida
    if (e.tipo === 'apertura') apertura(ctx, e, guion, u)
    else if (e.tipo === 'chat') chat(ctx, e, guion, i, u, dur)
    else if (e.tipo === 'agenda') agenda(ctx, e, guion, u, dur)
    else if (e.tipo === 'pasos') pasos(ctx, e, u, dur)
    else if (e.tipo === 'flujo') flujo(ctx, e, u, dur)
    else if (e.tipo === 'panel') panel(ctx, e, guion, u, dur)
    else if (e.tipo === 'beneficios') beneficios(ctx, e, u, dur)
    else cierre(ctx, e, guion, u)
    ctx.restore()
  }
  subtitulos(ctx, linea, t)
  ctx.restore()
}
