import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, IdCard, ListChecks, PackageCheck, Pencil, RefreshCw, Sparkles, X } from 'lucide-react'
import { FichasCliente } from '../features/fichas/FichasCliente'
import type { Sintesis } from '../types/db'
import { useAuth } from '../auth/AuthProvider'
import { actualizarProspecto, useMiembros, useProspectos } from '../features/pipeline/useProspectos'
import { ProspectoForm } from '../features/pipeline/ProspectoForm'
import { ESTILO_ETAPA } from '../features/pipeline/etapas'
import { useDemosParaSelector } from '../features/fichas/useFichas'
import { useServicios } from '../features/cotizador/useCotizador'
import { useGrabaciones } from '../features/grabaciones/useGrabaciones'
import { IntervencionForm } from '../features/grabaciones/IntervencionForm'
import { ESTADO_GRABACION, lineaDeAnalisis, ORIGEN_GRABACION } from '../features/grabaciones/estados'
import { actualizarSintesis, dominio, useHistoriaClientes, usuarioInstagram } from '../features/clientes/useClientes'
import { LinksCliente } from '../features/clientes/LinksCliente'
import { InstagramCliente } from '../features/clientes/InstagramCliente'
import { AgentesCliente } from '../features/agentes/AgentesCliente'
import { VideosCliente } from '../features/videos/VideosCliente'
import { PropuestasCliente } from '../features/cotizador/PropuestasCliente'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga, Spinner } from '../components/ui/Spinner'
import { ETAPA_LABEL, formatFecha, formatMonto, hoyISO, normalizarUrl, precioServicio } from '../lib/format'

function Bloque({ titulo, children, acciones }: { titulo: string; children: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[19px] font-bold">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  )
}

function Dato({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 text-tenue">{label}</span>
      <span className="min-w-0 flex-1 break-words">{valor || <span className="text-tenue">—</span>}</span>
    </div>
  )
}

export function ClientePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { miembro } = useAuth()
  const { prospectos, cargando, guardar, eliminar, ordenAlFinal } = useProspectos()
  const { porCliente, cargando: cargandoHistoria } = useHistoriaClientes()
  const { filas: servicios } = useServicios()
  const { crearIntervencion } = useGrabaciones()
  const miembros = useMiembros()
  const demos = useDemosParaSelector()

  const [editando, setEditando] = useState(false)
  const [intervencion, setIntervencion] = useState(false)
  const [sintesisNueva, setSintesisNueva] = useState<Sintesis | null>(null)
  const [actualizando, setActualizando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [datosAbierto, setDatosAbierto] = useState(false)
  const datosRef = useRef<HTMLDivElement>(null)

  // El box de datos se cierra con Esc, tocando afuera o al cambiar de cliente
  useEffect(() => setDatosAbierto(false), [id])
  useEffect(() => {
    if (!datosAbierto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDatosAbierto(false)
    const onClick = (e: PointerEvent) => {
      if (datosRef.current && !datosRef.current.contains(e.target as Node)) setDatosAbierto(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onClick)
    }
  }, [datosAbierto])

  if (cargando || cargandoHistoria) return <PantallaCarga />
  const p = prospectos.find((x) => x.id === id)
  if (!p) return <p className="p-10 text-center text-tenue">No se encontró el cliente.</p>

  const historia = porCliente.get(p.id) ?? []
  const s = sintesisNueva ?? p.sintesis
  const porId = new Map(servicios.map((x) => [x.id, x]))
  const estilo = ESTILO_ETAPA[p.etapa]
  const procesando = historia.some((g) => g.estado === 'transcribiendo' || g.estado === 'analizando')

  const rearmar = async () => {
    setActualizando(true)
    setMensaje(null)
    try {
      setSintesisNueva(await actualizarSintesis(p.id))
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo actualizar.' })
    } finally {
      setActualizando(false)
    }
  }

  const aPipeline = async (accion: string, fecha: string | null) => {
    setMensaje(null)
    try {
      await actualizarProspecto(p.id, { proxima_accion: accion, fecha_proxima_accion: fecha })
      setMensaje({ tipo: 'ok', texto: `Listo: "${accion}" quedó como próxima acción en el pipeline.` })
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar.' })
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pt-6 pb-16 md:px-10 md:pt-8">
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-acento-texto hover:underline">
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-[9px] py-[3px] text-xs font-semibold ${estilo.fondo} ${estilo.texto}`}>{ETAPA_LABEL[p.etapa]}</span>
          {[p.rubro, p.industria].filter(Boolean).length > 0 && <span className="text-sm text-tenue">{[p.rubro, p.industria].filter(Boolean).join(' · ')}</span>}
        </div>
        <h1 className="mt-2 text-[28px] leading-tight font-bold sm:text-[32px]">{p.empresa || p.nombre}</h1>
        {p.empresa && <p className="text-suave">{p.nombre}</p>}
        <div ref={datosRef} className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <button
            type="button"
            onClick={() => setDatosAbierto((v) => !v)}
            aria-expanded={datosAbierto}
            aria-controls="datos-cliente"
            title="Datos del cliente"
            className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border px-2.5 text-sm font-semibold transition-colors ${
              datosAbierto ? 'border-acento bg-acento-tenue text-acento-texto' : 'border-borde text-suave hover:bg-elevada hover:text-texto'
            }`}
          >
            <IdCard className="size-4" /> Datos
          </button>
          <LinksCliente p={p} />

          {datosAbierto && (
            <div
              id="datos-cliente"
              role="dialog"
              aria-label="Datos del cliente"
              className="absolute top-full right-0 left-0 z-30 mt-2 rounded-2xl border border-borde-fuerte bg-superficie p-4 shadow-2xl animate-aparecer sm:right-auto sm:w-[380px] sm:p-5"
            >
              <div className="mb-2 flex items-center gap-2">
                <h2 className="min-w-0 flex-1 text-[19px] font-bold">Datos</h2>
                <Button
                  size="sm"
                  variant="fantasma"
                  onClick={() => {
                    setDatosAbierto(false)
                    setEditando(true)
                  }}
                >
                  <Pencil className="size-4" /> Editar
                </Button>
                <Button size="icono" variant="fantasma" onClick={() => setDatosAbierto(false)} aria-label="Cerrar datos">
                  <X className="size-4" />
                </Button>
              </div>
              <Dato label="Contacto" valor={p.nombre} />
              <Dato label="Empresa" valor={p.empresa} />
              <Dato label="Mail" valor={p.email} />
              <Dato label="Teléfono" valor={p.telefono} />
              <Dato
                label="Instagram"
                valor={p.instagram && <a href={normalizarUrl(p.instagram)} target="_blank" rel="noreferrer" className="text-acento-texto hover:underline">{usuarioInstagram(p.instagram)}</a>}
              />
              <Dato
                label="Web"
                valor={p.web && <a href={normalizarUrl(p.web)} target="_blank" rel="noreferrer" className="text-acento-texto hover:underline">{dominio(p.web)}</a>}
              />
              <Dato label="Rubro" valor={p.rubro} />
              <Dato label="Industria" valor={p.industria} />
              <Dato label="Valor" valor={p.valor_estimado != null ? formatMonto(Number(p.valor_estimado), p.moneda) : null} />
              <Dato label="Próxima" valor={p.proxima_accion ? `${p.proxima_accion}${p.fecha_proxima_accion ? ` · ${formatFecha(p.fecha_proxima_accion)}` : ''}` : null} />
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setIntervencion(true)}>
            <Sparkles className="size-4" /> Nueva intervención
          </Button>
          <Button variant="secundario" onClick={() => setEditando(true)}>
            <Pencil className="size-4" /> Editar datos
          </Button>
        </div>
      </header>

      {mensaje && (
        <div className="mb-5">
          {mensaje.tipo === 'error' ? (
            <ErrorBox mensaje={mensaje.texto} />
          ) : (
            <p className="rounded-[10px] bg-ok-tenue px-3.5 py-3 text-sm text-ok">{mensaje.texto}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {procesando && (
            <div className="flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-4">
              <Spinner />
              <p className="text-sm text-suave">Hay una intervención analizándose. Cuando termine, se actualiza este resumen.</p>
            </div>
          )}

          {s ? (
            <>
              <Bloque
                titulo="Objetivos del cliente"
                acciones={
                  <Button size="sm" variant="fantasma" onClick={rearmar} disabled={actualizando} title="Volver a armar con todo lo del cliente">
                    <RefreshCw className={`size-4 ${actualizando ? 'animate-spin' : ''}`} /> {actualizando ? 'Actualizando…' : 'Actualizar'}
                  </Button>
                }
              >
                <p className="mb-3 text-sm text-tenue">{s.situacion}</p>
                <ul className="flex flex-col gap-1.5">
                  {s.objetivos.map((o, i) => (
                    <li key={i} className="flex gap-2 leading-snug">
                      <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-acento-texto" aria-hidden />
                      {o}
                    </li>
                  ))}
                </ul>
              </Bloque>

              <Bloque titulo="Soluciones que le proponemos">
                <ul className="flex flex-col gap-2.5">
                  {s.soluciones.map((x, i) => {
                    const cat = x.servicio_id ? porId.get(x.servicio_id) : undefined
                    return (
                      <li key={i} className="rounded-xl bg-elevada p-3.5">
                        <p className="leading-snug">{x.solucion}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <Badge tono={cat ? 'acento' : 'neutro'}>{cat?.nombre ?? x.servicio}</Badge>
                          {cat && precioServicio(cat) && <span className="text-tenue">{precioServicio(cat)}</span>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Bloque>

              {s.hacer_ahora.length > 0 && (
                <Bloque titulo="Hacé ahora">
                  <ul className="flex flex-col gap-2">
                    {s.hacer_ahora.map((h, i) => (
                      <li key={i} className="flex flex-col gap-1.5 rounded-xl bg-elevada p-3 sm:flex-row sm:items-center sm:gap-2">
                        <span className="min-w-0 leading-snug sm:flex-1">
                          {h.accion}
                          {h.fecha && <span className="text-tenue"> · {formatFecha(h.fecha)}</span>}
                        </span>
                        {/* En el celular los botones van abajo del texto (al lado lo dejaban en una columnita) */}
                        <span className="-ml-2 flex shrink-0 flex-wrap gap-1 sm:ml-0">
                        <Button size="sm" variant="fantasma" onClick={() => aPipeline(h.accion, h.fecha)}>
                          <ListChecks className="size-4" /> Al pipeline
                        </Button>
                        <Button
                          size="sm"
                          variant="fantasma"
                          onClick={() =>
                            navigate(`/calendario?${new URLSearchParams({ agendar: '1', titulo: h.accion, fecha: h.fecha ?? hoyISO(), prospecto: p.id })}`)
                          }
                        >
                          <CalendarPlus className="size-4" /> Agendar
                        </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Bloque>
              )}

              {s.falta_saber.length > 0 && (
                <Bloque titulo="Falta saber">
                  <ul className="flex flex-col gap-1.5 text-suave">
                    {s.falta_saber.map((f, i) => (
                      <li key={i}>· {f}</li>
                    ))}
                  </ul>
                </Bloque>
              )}
            </>
          ) : (
            <section className="rounded-2xl border border-dashed border-borde-fuerte px-6 py-8 text-center">
              <p className="font-semibold">Todavía no hay objetivos ni soluciones</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-tenue">
                Cargá una intervención (un audio, el chat o tus notas) y Claude arma los objetivos del cliente y las soluciones que le
                podemos proponer.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={() => setIntervencion(true)}>
                  <Sparkles className="size-4" /> Nueva intervención
                </Button>
                {historia.some((g) => g.analisis) && (
                  <Button variant="secundario" onClick={rearmar} disabled={actualizando}>
                    <RefreshCw className={`size-4 ${actualizando ? 'animate-spin' : ''}`} /> Armar con lo que hay
                  </Button>
                )}
              </div>
            </section>
          )}

          <Bloque titulo="Intervenciones">
            {historia.length === 0 ? (
              <p className="text-sm text-tenue">Todavía no hay audios, chats ni reuniones de este cliente.</p>
            ) : (
              <ul className="-mx-1 flex flex-col">
                {historia.map((g) => {
                  const e = ESTADO_GRABACION[g.estado]
                  const linea = lineaDeAnalisis(g.analisis)
                  return (
                    <li key={g.id}>
                      <Link to={`/grabaciones/${g.id}`} className="flex gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-elevada">
                        <span className="w-14 shrink-0 pt-0.5 text-[13px] text-tenue">
                          {new Date(g.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge>{ORIGEN_GRABACION[g.origen ?? 'reunion']}</Badge>
                            <span className="truncate font-semibold">{g.titulo}</span>
                            {g.estado !== 'lista' && <Badge tono={e.tono}>{e.label}</Badge>}
                          </span>
                          {linea && <span className="mt-0.5 line-clamp-2 block text-sm text-suave">{linea}</span>}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Bloque>
        </div>

        {/* Entregables: todo lo que le armamos al cliente, a mano en la columna de al lado */}
        <aside className="flex min-w-0 flex-col gap-4">
          <InstagramCliente p={p} />
          {/* Contenedor "Entregables" con un subcontenedor por tipo. Cada bloque trae su propia caja;
              acá se la pasa a una caja interna (fondo más oscuro, menos aire, título más chico). */}
          <section
            aria-labelledby="titulo-entregables"
            className="rounded-2xl border border-borde bg-superficie p-3 sm:p-4"
          >
            <div className="mb-3 flex items-center gap-2 px-1">
              <PackageCheck className="size-5 text-acento-texto" />
              <h2 id="titulo-entregables" className="text-[19px] font-bold">
                Entregables
              </h2>
            </div>
            <div className="flex flex-col gap-3 [&>section]:rounded-xl [&>section]:border-borde [&>section]:bg-fondo [&>section]:p-3.5 [&>section_h2]:text-base">
              <PropuestasCliente prospectoId={p.id} nombre={p.empresa || p.nombre} />
              <FichasCliente p={p} />
              <AgentesCliente p={p} />
              <VideosCliente prospectoId={p.id} compacto puedeGenerar={historia.some((g) => g.analisis)} />
            </div>
          </section>
          {p.notas && (
            <Bloque titulo="Notas">
              <p className="text-sm whitespace-pre-line text-suave">{p.notas}</p>
            </Bloque>
          )}
          <Link to="/pipeline" className="text-center text-sm font-semibold text-acento-texto hover:underline">
            Ver en el pipeline
          </Link>
        </aside>
      </div>

      <ProspectoForm
        abierto={editando}
        prospecto={p}
        etapaInicial={p.etapa}
        miembros={miembros}
        demos={demos}
        emailActual={miembro?.email ?? ''}
        ordenAlFinal={ordenAlFinal}
        onCerrar={() => setEditando(false)}
        onGuardar={guardar}
        onEliminar={async (pid) => {
          await eliminar(pid)
          navigate('/clientes')
        }}
      />
      <IntervencionForm
        abierto={intervencion}
        prospectos={prospectos}
        prospectoInicial={p.id}
        onCerrar={() => setIntervencion(false)}
        onGuardar={async (d) => {
          const gid = await crearIntervencion({ ...d, grabado_por: miembro?.email ?? null })
          setIntervencion(false)
          navigate(`/grabaciones/${gid}`)
        }}
      />
    </div>
  )
}
