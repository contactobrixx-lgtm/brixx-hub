import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Link2, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { armarTextosPropuesta, linkPublicoPropuesta, sinTextosPropuesta } from './useCotizador'
import { useVideos } from '../videos/useVideos'
import type {
  ContenidoPropuesta,
  EtapaCotizacion,
  Cotizacion,
  CotizacionInput,
  CotizacionItemInput,
  EstadoCotizacion,
  Moneda,
  Prospecto,
  Servicio,
} from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { ESTADO_COTIZACION_LABEL, formatMonto, isoLocal, numeroCotizacion, parseNumero, vacioANull } from '../../lib/format'
import { totalesCotizacion } from '../finanzas/calculos'

interface ItemEditable {
  key: string
  servicio_id: string | null
  descripcion: string
  cantidad: string
  impl: string
  mensual: string
  etapa: string
  opcional: boolean
  resumen: string
  incluye: string
  entregable: string
}

/** Textos de varias líneas ↔ listas (una por línea; "Título: detalle" para los puntos) */
const aLineas = (l?: string[]) => (l ?? []).join('\n')
const deLineas = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)
const aPuntos = (l?: { titulo: string; detalle: string }[]) => (l ?? []).map((x) => `${x.titulo}: ${x.detalle}`).join('\n')
const dePuntos = (t: string) =>
  deLineas(t).map((x) => {
    const i = x.indexOf(':')
    return i > 0 ? { titulo: x.slice(0, i).trim(), detalle: x.slice(i + 1).trim() } : { titulo: x, detalle: '' }
  })

interface EtapaEditable {
  key: string
  titulo: string
  detalle: string
  plazo: string
}

interface Props {
  abierto: boolean
  cotizacion: Cotizacion | null
  prospectoInicial?: string | null
  prospectos: Prospecto[]
  servicios: Servicio[]
  tipoCambio: number | null
  onCerrar: () => void
  onGuardar: (input: CotizacionInput, items: CotizacionItemInput[], id: string | null) => Promise<string>
  onEliminar: (id: string) => Promise<void>
  /** Claude terminó de escribir los textos de la propuesta: el formulario se vuelve a abrir con lo nuevo */
  onTextosListos?: (id: string) => void | Promise<void>
}

export function CotizacionForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno key={props.cotizacion ? `${props.cotizacion.id}:${props.cotizacion.updated_at}` : 'nueva'} {...props} />
}

let contador = 0
const nuevaKey = () => `it-${++contador}`

function enDias(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

function FormInterno({ cotizacion: c, prospectoInicial, prospectos, servicios, tipoCambio, onCerrar, onGuardar, onEliminar, onTextosListos }: Props) {
  const [prospectoId, setProspectoId] = useState(c?.prospecto_id ?? prospectoInicial ?? '')
  const [titulo, setTitulo] = useState(c?.titulo ?? '')
  const [estado, setEstado] = useState<EstadoCotizacion>(c?.estado ?? 'borrador')
  const [fecha, setFecha] = useState(c?.fecha ?? isoLocal(new Date()))
  const [validaHasta, setValidaHasta] = useState(c?.valida_hasta ?? enDias(15))
  const [moneda, setMoneda] = useState<Moneda>(c?.moneda ?? 'USD')
  const [descuento, setDescuento] = useState(String(c?.descuento_pct ?? 0))
  const [notas, setNotas] = useState(c?.notas ?? '')
  const [items, setItems] = useState<ItemEditable[]>(() =>
    [...(c?.cotizacion_items ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map((it) => ({
        key: nuevaKey(),
        servicio_id: it.servicio_id,
        descripcion: it.descripcion,
        cantidad: String(it.cantidad),
        impl: String(it.precio_implementacion),
        mensual: String(it.precio_mensual),
        etapa: it.etapa ? String(it.etapa) : '',
        opcional: !!it.opcional,
        resumen: it.resumen ?? '',
        incluye: aLineas(it.incluye),
        entregable: it.entregable ?? '',
      })),
  )
  const [introduccion, setIntroduccion] = useState(c?.introduccion ?? '')
  const [videoUrl, setVideoUrl] = useState(c?.video_url ?? '')
  const p0: ContenidoPropuesta = c?.propuesta ?? {}
  // Video del hub: "auto" = el último video guardado del cliente; "ninguno"; o el id de un video
  const [sinSeguridad, setSinSeguridad] = useState(!!p0.sin_seguridad)
  const [videoSel, setVideoSel] = useState<string>(c?.video_id ?? (p0.sin_video ? 'ninguno' : 'auto'))
  const [escribiendo, setEscribiendo] = useState(false)
  const [confirmarTextos, setConfirmarTextos] = useState(false)
  const [prop, setProp] = useState({
    subtitulo: p0.subtitulo ?? '',
    punto_texto: p0.punto_texto ?? '',
    puntos: aPuntos(p0.puntos),
    seguridad_intro: p0.seguridad?.intro ?? '',
    seguridad_puntos: aPuntos(p0.seguridad?.puntos),
    seguridad_recomendaciones: aLineas(p0.seguridad?.recomendaciones),
    objetivos: aLineas(p0.objetivos),
    plan_titulo: p0.plan_titulo ?? '',
    plan_texto: p0.plan_texto ?? '',
    mantenimiento: aLineas(p0.mantenimiento),
    mantenimiento_nota: p0.mantenimiento_nota ?? '',
    aviso_titulo: p0.aviso?.titulo ?? '',
    aviso_texto: p0.aviso?.texto ?? '',
    pago: p0.pago ?? '',
    financiacion: p0.financiacion ?? '',
    moneda_texto: p0.moneda_texto ?? '',
    validez: p0.validez ?? '',
    cierre: p0.cierre ?? '',
    conclusion: p0.conclusion ?? '',
    telefono: p0.telefono ?? '',
  })
  const campoProp = (k: keyof typeof prop) => ({ value: prop[k], onChange: (e: { target: { value: string } }) => setProp((x) => ({ ...x, [k]: e.target.value })) })
  const [etapas, setEtapas] = useState<EtapaEditable[]>(() => (c?.etapas ?? []).map((e) => ({ key: nuevaKey(), titulo: e.titulo, detalle: e.detalle, plazo: e.plazo ?? '' })))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const { videos } = useVideos({ prospecto_id: prospectoId || null })
  const videosCliente = videos.filter((v) => v.estado === 'listo' && v.enfoque !== 'interno')

  /** Claude escribe los textos de la propuesta (formato Alcione) con la carpeta del cliente; no toca precios */
  const escribirTextos = async () => {
    if (!c) return
    if (!sinTextosPropuesta(c) && !confirmarTextos) return setConfirmarTextos(true)
    setConfirmarTextos(false)
    setEscribiendo(true)
    setError(null)
    try {
      await armarTextosPropuesta(c.id)
      await onTextosListos?.(c.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron escribir los textos.')
    } finally {
      setEscribiendo(false)
    }
  }

  /** Link de la propuesta para el cliente: se abre sin iniciar sesión. En el celular abre el menú para mandarlo. */
  const compartir = async () => {
    if (!c) return
    setError(null)
    try {
      const url = await linkPublicoPropuesta(c.id, c.token_publico)
      setLink(url)
      const nombre = prospectos.find((p) => p.id === c.prospecto_id)
      const titulo = `Propuesta para ${nombre?.empresa || nombre?.nombre || 'vos'}`
      if (navigator.share) await navigator.share({ title: titulo, text: `${titulo} · brixx`, url }).catch(() => {})
      else await navigator.clipboard?.writeText(url).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo armar el link.')
    }
  }

  // Precios del catálogo están en USD; si la cotización es en ARS se convierten con el tipo de cambio.
  const convertir = (usd: number) => (moneda === 'ARS' && tipoCambio ? Math.round(usd * tipoCambio) : usd)

  const agregarServicio = (id: string) => {
    const s = servicios.find((x) => x.id === id)
    if (!s) return
    setItems((l) => [
      ...l,
      {
        key: nuevaKey(),
        servicio_id: s.id,
        descripcion: s.descripcion ? `${s.nombre} — ${s.descripcion}` : s.nombre,
        cantidad: '1',
        impl: String(convertir(Number(s.precio_implementacion))),
        mensual: String(convertir(Number(s.precio_mensual))),
        etapa: etapas.length ? String(etapas.length) : '',
        opcional: false,
        resumen: '',
        incluye: '',
        entregable: '',
      },
    ])
  }

  const cambiar = (key: string, campo: Exclude<keyof ItemEditable, 'opcional' | 'key'>, valor: string) =>
    setItems((l) => l.map((it) => (it.key === key ? { ...it, [campo]: valor } : it)))

  const itemsNumericos = (): CotizacionItemInput[] | null => {
    const res: CotizacionItemInput[] = []
    for (const [i, it] of items.entries()) {
      const cantidad = parseNumero(it.cantidad)
      const impl = it.impl.trim() ? parseNumero(it.impl) : 0
      const mensual = it.mensual.trim() ? parseNumero(it.mensual) : 0
      if (cantidad == null || impl == null || mensual == null || !it.descripcion.trim()) return null
      res.push({
        servicio_id: it.servicio_id,
        descripcion: it.descripcion.trim(),
        cantidad,
        precio_implementacion: impl,
        precio_mensual: mensual,
        orden: i,
        etapa: it.etapa && Number(it.etapa) <= etapas.length ? Number(it.etapa) : null,
        opcional: it.opcional,
        resumen: vacioANull(it.resumen),
        incluye: deLineas(it.incluye),
        entregable: vacioANull(it.entregable),
      })
    }
    return res
  }

  const numericos = itemsNumericos()
  const desc = parseNumero(descuento) ?? 0
  const totales = totalesCotizacion({
    descuento_pct: desc,
    cotizacion_items: (numericos ?? []).map((it) => ({ ...it, id: '', cotizacion_id: '' })),
  })

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!prospectoId) return setError('Elegí para quién es la cotización.')
    if (items.length === 0) return setError('Agregá al menos un ítem.')
    if (!numericos) return setError('Revisá los ítems: cada uno necesita descripción y números válidos.')
    if (desc < 0 || desc > 100) return setError('El descuento tiene que estar entre 0 y 100.')
    setGuardando(true)
    try {
      await onGuardar(
        {
          prospecto_id: prospectoId,
          titulo: vacioANull(titulo),
          estado,
          fecha,
          valida_hasta: validaHasta || null,
          moneda,
          descuento_pct: desc,
          notas: vacioANull(notas),
          introduccion: vacioANull(introduccion),
          video_url: vacioANull(videoUrl),
          video_id: videoSel !== 'auto' && videoSel !== 'ninguno' ? videoSel : null,
          etapas: etapas
            .filter((e) => e.titulo.trim())
            .map((e): EtapaCotizacion => ({ titulo: e.titulo.trim(), detalle: e.detalle.trim(), plazo: vacioANull(e.plazo) })),
          propuesta: Object.fromEntries(
            Object.entries({
              subtitulo: prop.subtitulo.trim(),
              punto_texto: prop.punto_texto.trim(),
              puntos: dePuntos(prop.puntos),
              objetivos: deLineas(prop.objetivos),
              plan_titulo: prop.plan_titulo.trim(),
              plan_texto: prop.plan_texto.trim(),
              mantenimiento: deLineas(prop.mantenimiento),
              mantenimiento_nota: prop.mantenimiento_nota.trim(),
              aviso: prop.aviso_titulo.trim() ? { titulo: prop.aviso_titulo.trim(), texto: prop.aviso_texto.trim() } : undefined,
              pago: prop.pago.trim(),
              financiacion: prop.financiacion.trim(),
              moneda_texto: prop.moneda_texto.trim(),
              validez: prop.validez.trim(),
              cierre: prop.cierre.trim(),
              conclusion: prop.conclusion.trim(),
              telefono: prop.telefono.trim(),
              sin_video: videoSel === 'ninguno' || undefined,
              sin_seguridad: sinSeguridad || undefined,
              seguridad: dePuntos(prop.seguridad_puntos).length
                ? {
                    intro: prop.seguridad_intro.trim() || undefined,
                    puntos: dePuntos(prop.seguridad_puntos),
                    recomendaciones: deLineas(prop.seguridad_recomendaciones),
                  }
                : undefined,
            }).filter(([, v]) => (Array.isArray(v) ? v.length : !!v)),
          ) as ContenidoPropuesta,
        },
        numericos,
        c?.id ?? null,
      )
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!c) return
    if (!confirmar) return setConfirmar(true)
    setGuardando(true)
    try {
      await onEliminar(c.id)
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
      setGuardando(false)
    }
  }

  const activos = servicios.filter((s) => s.activo)
  const ordenados = [...prospectos]
    .filter((p) => p.etapa !== 'perdido' || p.id === prospectoId)
    .sort((a, b) => (a.empresa || a.nombre).localeCompare(b.empresa || b.nombre))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={c ? numeroCotizacion(c.numero) : 'Nueva propuesta'}
      pie={
        <>
          {c && (
            <Button variant={confirmar ? 'peligro' : 'fantasma'} size="sm" onClick={eliminar} disabled={guardando}>
              {confirmar ? '¿Seguro? Eliminar' : 'Eliminar'}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {c && (
              <Button variant="secundario" onClick={compartir} disabled={guardando} title="Link para mandarle la propuesta al cliente (se abre sin iniciar sesión)">
                <Link2 className="size-[18px]" /> Link para el cliente
              </Button>
            )}
            {c && (
              <Link
                to={`/cotizaciones/${c.id}/imprimir`}
                target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-[11px] border border-borde-fuerte px-[18px] font-semibold hover:border-tenue"
              >
                <FileText className="size-[18px]" /> PDF
              </Link>
            )}
            <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-cotizacion" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <form id="form-cotizacion" onSubmit={guardar} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Para *" className="sm:col-span-2">
            <Select value={prospectoId} onChange={(e) => setProspectoId(e.target.value)}>
              <option value="">— Elegí un prospecto o cliente —</option>
              {ordenados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.empresa ? `${p.empresa} · ${p.nombre}` : p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Título" className="sm:col-span-2" ayuda="Opcional. Ej: Sistema de gestión y bot de WhatsApp">
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoCotizacion)}>
              {(Object.keys(ESTADO_COTIZACION_LABEL) as EstadoCotizacion[]).map((e) => (
                <option key={e} value={e}>
                  {ESTADO_COTIZACION_LABEL[e]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Moneda">
            <Select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Válida hasta">
            <Input type="date" value={validaHasta} onChange={(e) => setValidaHasta(e.target.value)} />
          </Field>
        </div>
        {estado === 'aceptada' && c?.estado !== 'aceptada' && (
          <p className="rounded-[10px] bg-ok-tenue px-3.5 py-3 text-sm text-ok">
            Al guardar, el prospecto pasa a "Demo" y su valor estimado se actualiza con el total.
          </p>
        )}

        {/* Propuesta: primera hoja, video y etapas */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 text-[19px] font-bold">Propuesta</h3>
            {c && (
              <Button size="sm" variant={confirmarTextos ? 'peligro' : 'secundario'} onClick={escribirTextos} disabled={escribiendo || guardando}>
                {escribiendo ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {escribiendo ? 'Escribiendo… (un minuto)' : confirmarTextos ? 'Reemplaza los textos: tocá de nuevo' : 'Armar los textos con Claude'}
              </Button>
            )}
          </div>
          <p className="-mt-2 text-xs text-tenue">
            {c
              ? 'Claude escribe la introducción, las etapas, el punto de partida, la tarjeta de cada servicio y las condiciones con la carpeta del cliente, como la propuesta de Alcione. No toca precios. Lo que no guardaste se pierde.'
              : 'Guardala y después Claude puede escribir los textos con la carpeta del cliente (también se escriben solos al abrir el PDF).'}
          </p>
          <Field label="Introducción" ayuda="Primera hoja del PDF: para quién es y qué resuelve.">
            <Textarea value={introduccion} onChange={(e) => setIntroduccion(e.target.value)} rows={4} />
          </Field>
          <Field label="Video del hub" ayuda="Va en la segunda hoja. Solo los videos ya guardados (abrilo y tocá Descargar una vez). En el PDF queda como link a la propuesta.">
            <Select value={videoSel} onChange={(e) => setVideoSel(e.target.value)}>
              <option value="auto">Automático: el último video guardado del cliente</option>
              {videosCliente.map((v) => (
                <option key={v.id} value={v.id} disabled={!v.archivo_path}>
                  {v.titulo} · {new Date(v.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  {v.archivo_path ? '' : ' (sin guardar: descargalo una vez)'}
                </option>
              ))}
              <option value="ninguno">Sin video</option>
            </Select>
          </Field>
          <Field label="O un link de video" ayuda='Si lo cargás, va este en lugar del video del hub: una página del hub ("/material/….html"), un link de YouTube o un .mp4.'>
            <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="/material/setter-alcione-deco.html" />
          </Field>
          <div>
            <div className="mb-2 text-sm font-semibold">Etapas</div>
            <div className="flex flex-col gap-2">
              {etapas.map((e, n) => (
                <div key={e.key} className="rounded-xl bg-superficie p-3 ring-1 ring-borde">
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-sm font-semibold text-acento-texto">Etapa {n + 1}</span>
                    <Input
                      value={e.titulo}
                      onChange={(ev) => setEtapas((l) => l.map((x) => (x.key === e.key ? { ...x, titulo: ev.target.value } : x)))}
                      placeholder="Título de la etapa"
                      aria-label={`Título de la etapa ${n + 1}`}
                    />
                    <Button
                      variant="fantasma"
                      size="icono"
                      className="size-11 text-peligro"
                      onClick={() => {
                        setEtapas((l) => l.filter((x) => x.key !== e.key))
                        // Los ítems de esta etapa quedan sin etapa; los de las siguientes bajan un número
                        setItems((l) =>
                          l.map((it) => {
                            const k = Number(it.etapa)
                            if (!k) return it
                            return { ...it, etapa: k === n + 1 ? '' : k > n + 1 ? String(k - 1) : it.etapa }
                          }),
                        )
                      }}
                      aria-label={`Quitar la etapa ${n + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <Input
                    className="mt-2"
                    value={e.plazo}
                    onChange={(ev) => setEtapas((l) => l.map((x) => (x.key === e.key ? { ...x, plazo: ev.target.value } : x)))}
                    placeholder='Plazo estimado (ej.: "3 a 4 semanas")'
                    aria-label={`Plazo de la etapa ${n + 1}`}
                  />
                  <Textarea
                    className="mt-2"
                    value={e.detalle}
                    onChange={(ev) => setEtapas((l) => l.map((x) => (x.key === e.key ? { ...x, detalle: ev.target.value } : x)))}
                    rows={3}
                    placeholder="Qué incluye esta etapa"
                    aria-label={`Detalle de la etapa ${n + 1}`}
                  />
                </div>
              ))}
            </div>
            <Button variant="secundario" className="mt-2" onClick={() => setEtapas((l) => [...l, { key: nuevaKey(), titulo: '', detalle: '', plazo: '' }])}>
              <Plus className="size-4" /> Agregar etapa
            </Button>
          </div>
          <details className="rounded-xl bg-superficie p-3 ring-1 ring-borde">
            <summary className="cursor-pointer text-sm font-semibold">Textos de la propuesta (portada, punto de partida, condiciones)</summary>
            <div className="mt-3 grid gap-3">
              <Field label="Segunda línea del título" ayuda='Ej.: "en automatización y gestión."'>
                <Input {...campoProp('subtitulo')} />
              </Field>
              <Field label="Dónde está hoy (texto)">
                <Textarea {...campoProp('punto_texto')} rows={3} />
              </Field>
              <Field label="Dónde está hoy (puntos)" ayuda='Uno por línea, "Título: detalle".'>
                <Textarea {...campoProp('puntos')} rows={4} />
              </Field>
              <Field label="Objetivos" ayuda="Uno por línea.">
                <Textarea {...campoProp('objetivos')} rows={4} />
              </Field>
              <Field label="El plan (título)">
                <Input {...campoProp('plan_titulo')} />
              </Field>
              <Field label="El plan (texto)">
                <Textarea {...campoProp('plan_texto')} rows={2} />
              </Field>
              <Field label="Qué incluye el mantenimiento" ayuda="Uno por línea.">
                <Textarea {...campoProp('mantenimiento')} rows={3} />
              </Field>
              <Field label="Nota del mantenimiento">
                <Input {...campoProp('mantenimiento_nota')} placeholder="Comienza al terminar la etapa 1. Sin permanencia mínima." />
              </Field>
              <Field label="Aviso (título)" ayuda="Ej.: costos de terceros que paga el cliente.">
                <Input {...campoProp('aviso_titulo')} />
              </Field>
              <Field label="Aviso (texto)">
                <Textarea {...campoProp('aviso_texto')} rows={2} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Forma de pago">
                  <Textarea {...campoProp('pago')} rows={2} />
                </Field>
                <Field label="Financiación" ayuda='Va en grande debajo de la forma de pago. Vacío: "Pagás cada etapa por separado… consultanos por cuotas".'>
                  <Textarea {...campoProp('financiacion')} rows={2} />
                </Field>
                <Field label="Moneda">
                  <Textarea {...campoProp('moneda_texto')} rows={2} />
                </Field>
                <Field label="Validez">
                  <Textarea {...campoProp('validez')} rows={2} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Conclusión" ayuda="El párrafo de la última hoja. Vacío: va la introducción.">
                  <Textarea {...campoProp('conclusion')} rows={3} />
                </Field>
                <Field label="Frase de cierre">
                  <Input {...campoProp('cierre')} placeholder="Empecemos por las bases: USD 840 + USD 100/mes." />
                </Field>
                <Field label="Teléfono de brixx">
                  <Input {...campoProp('telefono')} />
                </Field>
              </div>
            </div>
          </details>
          <details className="rounded-xl bg-superficie p-3 ring-1 ring-borde">
            <summary className="cursor-pointer text-sm font-semibold">Hoja de seguridad (va sola si hay un bot o asistente)</summary>
            <div className="mt-3 grid gap-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input type="checkbox" checked={sinSeguridad} onChange={(e) => setSinSeguridad(e.target.checked)} className="size-4 accent-(--color-acento)" />
                Sacar la hoja de seguridad de esta propuesta
              </label>
              <Field label="Introducción" ayuda="Vacío: el texto por defecto (permiso acotado de Meta, las cuentas siguen siendo del cliente).">
                <Textarea {...campoProp('seguridad_intro')} rows={3} />
              </Field>
              <Field label="Puntos" ayuda='Uno por línea, "Título: detalle". Vacío: los 6 por defecto (sin contraseñas, permiso revocable, no compromete plata, si falla no se pierde nada, botón para apagarlo, datos cuidados).'>
                <Textarea {...campoProp('seguridad_puntos')} rows={5} />
              </Field>
              <Field label="Lo que recomendamos" ayuda="Uno por línea.">
                <Textarea {...campoProp('seguridad_recomendaciones')} rows={3} />
              </Field>
            </div>
          </details>
        </section>

        {/* Ítems */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-[19px] font-bold">Ítems</h3>
            {moneda === 'ARS' && !tipoCambio && (
              <span className="text-[13px] text-aviso">Sin tipo de cambio: los precios del catálogo se copian en USD.</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <div key={it.key} className="rounded-xl bg-superficie p-3 ring-1 ring-borde">
                <div className="flex gap-2">
                  <Input
                    value={it.descripcion}
                    onChange={(e) => cambiar(it.key, 'descripcion', e.target.value)}
                    placeholder="Descripción"
                    aria-label="Descripción"
                  />
                  <Button
                    variant="fantasma"
                    size="icono"
                    className="size-11 text-peligro"
                    onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}
                    aria-label="Quitar ítem"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className={etapas.length ? 'mt-2 grid grid-cols-[70px_1fr_1fr] gap-2 sm:grid-cols-[70px_1fr_1fr_110px]' : 'mt-2 grid grid-cols-[70px_1fr_1fr] gap-2'}>
                  <label className="text-xs text-tenue">
                    Cant.
                    <Input value={it.cantidad} onChange={(e) => cambiar(it.key, 'cantidad', e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="text-xs text-tenue">
                    Implementación
                    <Input value={it.impl} onChange={(e) => cambiar(it.key, 'impl', e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="text-xs text-tenue">
                    Mensual
                    <Input value={it.mensual} onChange={(e) => cambiar(it.key, 'mensual', e.target.value)} inputMode="decimal" />
                  </label>
                  {etapas.length > 0 && (
                    <label className="col-span-3 text-xs text-tenue sm:col-span-1">
                      Etapa
                      <Select value={it.etapa} onChange={(e) => cambiar(it.key, 'etapa', e.target.value)}>
                        <option value="">—</option>
                        {etapas.map((_, n) => (
                          <option key={n} value={String(n + 1)}>
                            {n + 1}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  <label className="col-span-3 flex cursor-pointer items-center gap-2 text-xs text-tenue sm:col-span-full">
                    <input
                      type="checkbox"
                      checked={it.opcional}
                      onChange={(e) => setItems((l) => l.map((x) => (x.key === it.key ? { ...x, opcional: e.target.checked } : x)))}
                      className="size-4 accent-(--color-acento)"
                    />
                    Opcional (se muestra con su precio, pero no suma al total)
                  </label>
                  <details className="col-span-full text-xs text-tenue">
                    <summary className="cursor-pointer py-1 font-semibold">Tarjeta en la propuesta</summary>
                    <div className="mt-1 flex flex-col gap-2">
                      <Input value={it.resumen} onChange={(e) => cambiar(it.key, 'resumen', e.target.value)} placeholder="En una línea: qué es (ej.: Un asistente que atiende y vende a toda hora)" aria-label="Resumen" />
                      <Textarea value={it.incluye} onChange={(e) => cambiar(it.key, 'incluye', e.target.value)} rows={3} placeholder="Qué incluye (uno por línea)" aria-label="Qué incluye" />
                      <Input value={it.entregable} onChange={(e) => cambiar(it.key, 'entregable', e.target.value)} placeholder="Entregable (ej.: asistente activo en el WhatsApp del local)" aria-label="Entregable" />
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="min-w-0 flex-1">
              <Select
                value=""
                onChange={(e) => {
                  agregarServicio(e.target.value)
                  e.target.value = ''
                }}
                aria-label="Agregar servicio del catálogo"
              >
                <option value="">+ Agregar servicio del catálogo…</option>
                {activos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                    {Number(s.precio_implementacion) || Number(s.precio_mensual)
                      ? ` (USD ${s.precio_implementacion} + ${s.precio_mensual}/mes)`
                      : ' (sin precio)'}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secundario"
              onClick={() =>
                setItems((l) => [...l, { key: nuevaKey(), servicio_id: null, descripcion: '', cantidad: '1', impl: '', mensual: '', etapa: etapas.length ? String(etapas.length) : '', opcional: false, resumen: '', incluye: '', entregable: '' }])
              }
            >
              <Plus className="size-4" /> Ítem libre
            </Button>
          </div>
        </section>

        {/* Totales */}
        <section className="rounded-xl bg-elevada p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-suave">Subtotal implementación</span>
            <span className="tabular font-semibold">{formatMonto(totales.subtotal, moneda)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <label htmlFor="descuento" className="text-suave">
              Descuento sobre implementación (%)
            </label>
            <div className="w-24 shrink-0">
              <Input id="descuento" value={descuento} onChange={(e) => setDescuento(e.target.value)} inputMode="decimal" className="text-right" />
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-borde pt-3">
            <span className="font-semibold">Total implementación</span>
            <span className="tabular font-display text-2xl font-bold">{formatMonto(totales.implementacion, moneda)}</span>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <span className="font-semibold">Abono mensual</span>
            <span className="tabular font-display text-xl font-bold">{formatMonto(totales.mensual, moneda)}/mes</span>
          </div>
        </section>

        <Field label="Notas y condiciones" ayuda="Internas: no aparecen en la propuesta. Las condiciones para el cliente van en los textos de la propuesta.">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} placeholder="50% de anticipo y 50% contra entrega. Plazo estimado: 4 semanas." />
        </Field>

        {link && (
          <div className="rounded-[10px] bg-ok-tenue px-3.5 py-3 text-sm text-ok">
            <p className="font-semibold">Link para el cliente (se abre sin iniciar sesión, con el video):</p>
            <a href={link} target="_blank" rel="noreferrer" className="mt-1 block break-all underline">
              {link}
            </a>
            <p className="mt-1 text-xs">Si no se abrió el menú para compartir, ya quedó copiado: pegalo en WhatsApp.</p>
          </div>
        )}
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
