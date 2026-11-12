import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCw, Sparkles } from 'lucide-react'
import type { Analisis, CotizacionItemInput } from '../types/db'
import { useConfigGrabaciones, useGrabacion, useGrabaciones } from '../features/grabaciones/useGrabaciones'
import { ESTADO_GRABACION } from '../features/grabaciones/estados'
import { AvisoConfig } from '../features/grabaciones/AvisoConfig'
import { VistaAnalisis } from '../features/grabaciones/VistaAnalisis'
import { VistaTranscripcion } from '../features/grabaciones/VistaTranscripcion'
import { useCotizaciones, useServicios } from '../features/cotizador/useCotizador'
import { actualizarProspecto, useProspectos } from '../features/pipeline/useProspectos'
import { useReuniones } from '../features/calendario/useReuniones'
import { Badge, Segmentado } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Field'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga, Spinner } from '../components/ui/Spinner'
import { formatDuracion, formatHora, hoyISO, isoLocal } from '../lib/format'

type Vista = 'importante' | 'transcripcion'

export function GrabacionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { grabacion: g, cargando, audioUrl, accion, actualizar } = useGrabacion(id)
  const { eliminar } = useGrabaciones()
  const config = useConfigGrabaciones()
  const { filas: servicios } = useServicios()
  const { guardarConItems } = useCotizaciones()
  const { prospectos } = useProspectos()
  const { filas: reuniones } = useReuniones()

  const [vista, setVista] = useState<Vista>('importante')
  const [activo, setActivo] = useState<number | null>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)

  const reunion = reuniones.find((r) => r.id === g?.reunion_id)
  const prospectoId = g?.prospecto_id ?? reunion?.prospecto_id ?? null
  const prospecto = prospectos.find((p) => p.id === prospectoId)

  // Segmentos que contienen el segundo de algún punto clave
  const destacados = useMemo(() => {
    const set = new Set<number>()
    const segs = g?.segmentos ?? []
    for (const p of g?.analisis?.puntos_clave ?? []) {
      if (p.segundo == null) continue
      const ms = p.segundo * 1000
      let idx = segs.findIndex((s) => ms >= s.inicio_ms - 1000 && ms <= Math.max(s.fin_ms, s.inicio_ms) + 1000)
      if (idx < 0) idx = segs.reduce((mejor, s, i) => (Math.abs(s.inicio_ms - ms) < Math.abs(segs[mejor].inicio_ms - ms) ? i : mejor), 0)
      if (segs.length) set.add(idx)
    }
    return set
  }, [g?.segmentos, g?.analisis])

  if (cargando) return <PantallaCarga />
  if (!g) return <p className="p-10 text-center text-tenue">No se encontró la grabación.</p>

  const estado = ESTADO_GRABACION[g.estado]
  const tieneTexto = !!g.segmentos?.length

  const ejecutar = async (fn: () => Promise<string | void>) => {
    setOcupado(true)
    setMensaje(null)
    try {
      const texto = await fn()
      if (texto) setMensaje({ tipo: 'ok', texto })
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'Algo salió mal.' })
    } finally {
      setOcupado(false)
    }
  }

  const procesar = () =>
    ejecutar(async () => {
      const r = await accion(tieneTexto ? 'analizar' : 'procesar')
      if (r?.falta === 'assemblyai') throw new Error('Todavía no está cargada la clave de AssemblyAI. La grabación queda guardada como pendiente.')
      if (r?.falta === 'anthropic') throw new Error('Todavía no está cargada la clave de Anthropic (Claude).')
    })

  const irA = (segundo: number) => {
    const segs = g.segmentos ?? []
    const ms = segundo * 1000
    let idx = segs.findIndex((s) => ms >= s.inicio_ms - 1000 && ms <= Math.max(s.fin_ms, s.inicio_ms) + 1000)
    if (idx < 0 && segs.length) idx = 0
    setVista('transcripcion')
    setActivo(idx)
    setTimeout(() => document.getElementById(`seg-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
    if (audio.current) {
      audio.current.currentTime = segundo
      audio.current.play().catch(() => {})
    }
  }

  const crearCotizacion = (a: Analisis) =>
    ejecutar(async () => {
      if (!prospectoId) throw new Error('Vinculá la grabación a un cliente o prospecto.')
      const porId = new Map(servicios.map((s) => [s.id, s]))
      const items: CotizacionItemInput[] = a.propuesta.servicios
        .filter((s) => s.etapa === 1)
        .map((s, i) => {
          const cat = s.servicio_id ? porId.get(s.servicio_id) : undefined
          return {
            servicio_id: cat?.id ?? null,
            descripcion: cat ? (cat.descripcion ? `${cat.nombre} — ${cat.descripcion}` : cat.nombre) : s.nombre,
            cantidad: 1,
            precio_implementacion: Number(cat?.precio_implementacion ?? 0),
            precio_mensual: Number(cat?.precio_mensual ?? 0),
            orden: i,
          }
        })
      const despues = a.propuesta.servicios.filter((s) => s.etapa !== 1)
      const venc = new Date()
      venc.setDate(venc.getDate() + 15)
      const cotId = await guardarConItems(
        {
          prospecto_id: prospectoId,
          titulo: g.titulo,
          estado: 'borrador',
          fecha: hoyISO(),
          valida_hasta: isoLocal(venc),
          moneda: 'USD',
          descuento_pct: 0,
          notas: despues.length
            ? `Próximas etapas sugeridas: ${despues.map((s) => (s.servicio_id && porId.get(s.servicio_id)?.nombre) || s.nombre).join(', ')}.`
            : null,
        },
        items,
        null,
      )
      navigate(`/cotizador?abrir=${cotId}`)
    })

  const proximaAccion = (p: Analisis['proximos_pasos'][number]) =>
    ejecutar(async () => {
      if (!prospectoId) throw new Error('Vinculá la grabación a un cliente o prospecto.')
      await actualizarProspecto(prospectoId, { proxima_accion: p.accion, fecha_proxima_accion: p.fecha })
      return `Listo: "${p.accion}" quedó como próxima acción en el pipeline.`
    })

  const agendar = (p: Analisis['proximos_pasos'][number]) => {
    const q = new URLSearchParams({ agendar: '1', titulo: p.accion, fecha: p.fecha ?? hoyISO() })
    if (prospectoId) q.set('prospecto', prospectoId)
    navigate(`/calendario?${q}`)
  }

  const nombreP = (p: { empresa: string | null; nombre: string }) => (p.empresa ? `${p.empresa} · ${p.nombre}` : p.nombre)
  const procesando = g.estado === 'transcribiendo' || g.estado === 'analizando'

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <Link to="/grabaciones" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-acento-texto hover:underline">
        <ArrowLeft className="size-4" /> Grabaciones
      </Link>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tono={estado.tono}>{estado.label}</Badge>
          <span className="text-sm text-tenue">
            {new Date(g.created_at).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} {formatHora(new Date(g.created_at))}
            {g.duracion_seg ? ` · ${formatDuracion(g.duracion_seg)}` : ''}
          </span>
        </div>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[32px]">{g.titulo}</h1>
        <div className="mt-3 max-w-md">
          <Select
            value={g.prospecto_id ?? ''}
            onChange={(e) => ejecutar(() => actualizar({ prospecto_id: e.target.value || null }))}
            aria-label="Cliente o prospecto"
          >
            <option value="">{reunion?.prospecto_id && prospecto ? `${nombreP(prospecto)} (de la reunión)` : '— Sin cliente o prospecto —'}</option>
            {[...prospectos]
              .sort((a, b) => nombreP(a).localeCompare(nombreP(b)))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {nombreP(p)}
                </option>
              ))}
          </Select>
        </div>
      </header>

      {(g.estado === 'pendiente' || (g.estado === 'lista' && !g.analisis)) && <AvisoConfig config={config} />}

      {/* Estado del procesamiento */}
      {procesando && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-4">
          <Spinner />
          <div>
            <p className="font-semibold">{g.estado === 'transcribiendo' ? 'Transcribiendo el audio…' : 'Claude está analizando la reunión…'}</p>
            <p className="text-sm text-tenue">Suele tardar unos minutos. Podés salir: se actualiza solo.</p>
          </div>
        </div>
      )}
      {g.estado === 'pendiente' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-borde bg-superficie p-4">
          <p className="min-w-0 flex-1 text-sm text-suave">El audio está guardado. Cuando estén cargadas las claves, procesalo desde acá.</p>
          <Button onClick={procesar} disabled={ocupado}>
            <Sparkles className="size-4" /> Transcribir y analizar
          </Button>
        </div>
      )}
      {g.estado === 'error' && (
        <div className="mb-5 space-y-3">
          <ErrorBox mensaje={g.error ?? 'Algo falló al procesar.'} />
          <Button variant="secundario" onClick={procesar} disabled={ocupado}>
            <RotateCw className="size-4" /> Reintentar
          </Button>
        </div>
      )}
      {g.estado === 'lista' && tieneTexto && !g.analisis && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-borde bg-superficie p-4">
          <p className="min-w-0 flex-1 text-sm text-suave">La transcripción está lista. Falta el resumen, los puntos clave y la propuesta.</p>
          <Button onClick={procesar} disabled={ocupado}>
            <Sparkles className="size-4" /> Analizar con Claude
          </Button>
        </div>
      )}

      {mensaje && (
        <div className="mb-5">
          {mensaje.tipo === 'error' ? (
            <ErrorBox mensaje={mensaje.texto} />
          ) : (
            <p className="rounded-[10px] bg-ok-tenue px-3.5 py-3 text-sm text-ok">{mensaje.texto}</p>
          )}
        </div>
      )}

      {audioUrl && (
        <div className="sticky top-0 z-10 -mx-4 mb-5 bg-fondo/95 px-4 py-2 backdrop-blur md:-mx-10 md:px-10">
          <audio ref={audio} src={audioUrl} controls preload="metadata" className="w-full" />
        </div>
      )}
      {!g.audio_path && g.segmentos && (
        <p className="mb-5 text-[13px] text-tenue">El audio se borró a los 90 días; la transcripción y el análisis quedan.</p>
      )}

      {tieneTexto && (
        <>
          <div className="mb-4">
            <Segmentado
              valor={vista}
              onChange={setVista}
              opciones={[
                { valor: 'importante', label: 'Lo importante' },
                { valor: 'transcripcion', label: 'Transcripción' },
              ]}
            />
          </div>
          {vista === 'importante' ? (
            g.analisis ? (
              <VistaAnalisis
                analisis={g.analisis}
                servicios={servicios}
                tieneProspecto={!!prospectoId}
                ocupado={ocupado}
                onIrA={irA}
                onCrearCotizacion={() => crearCotizacion(g.analisis!)}
                onProximaAccion={proximaAccion}
                onAgendar={agendar}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-borde-fuerte px-6 py-10 text-center text-tenue">
                {g.estado === 'analizando' ? 'El análisis está en camino…' : 'Todavía no hay análisis. Mientras, podés leer la transcripción completa.'}
              </p>
            )
          ) : (
            <VistaTranscripcion
              segmentos={g.segmentos!}
              hablantes={g.hablantes ?? {}}
              destacados={destacados}
              activo={activo}
              onIrA={irA}
              onRenombrar={(h) => actualizar({ hablantes: h })}
            />
          )}
        </>
      )}

      <div className="mt-10 border-t border-borde pt-4">
        <Button
          variant={confirmarBorrado ? 'peligro' : 'fantasma'}
          size="sm"
          onClick={() => (confirmarBorrado ? eliminar(g).then(() => navigate('/grabaciones')) : setConfirmarBorrado(true))}
        >
          {confirmarBorrado ? '¿Seguro? Borrar grabación y audio' : 'Borrar grabación'}
        </Button>
      </div>
    </div>
  )
}
