import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, Trash2 } from 'lucide-react'
import type {
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
}

export function CotizacionForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno key={props.cotizacion?.id ?? 'nueva'} {...props} />
}

let contador = 0
const nuevaKey = () => `it-${++contador}`

function enDias(dias: number) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return isoLocal(d)
}

function FormInterno({ cotizacion: c, prospectoInicial, prospectos, servicios, tipoCambio, onCerrar, onGuardar, onEliminar }: Props) {
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
      })),
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

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
      },
    ])
  }

  const cambiar = (key: string, campo: keyof ItemEditable, valor: string) =>
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
      titulo={c ? numeroCotizacion(c.numero) : 'Nueva cotización'}
      pie={
        <>
          {c && (
            <Button variant={confirmar ? 'peligro' : 'fantasma'} size="sm" onClick={eliminar} disabled={guardando}>
              {confirmar ? '¿Seguro? Eliminar' : 'Eliminar'}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
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
            Al guardar, el prospecto pasa a "Cerrado" y su valor estimado se actualiza con el total.
          </p>
        )}

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
                <div className="mt-2 grid grid-cols-[70px_1fr_1fr] gap-2">
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
                setItems((l) => [...l, { key: nuevaKey(), servicio_id: null, descripcion: '', cantidad: '1', impl: '', mensual: '' }])
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

        <Field label="Notas y condiciones" ayuda="Aparecen en el PDF. Ej: forma de pago, plazos de entrega.">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} placeholder="50% de anticipo y 50% contra entrega. Plazo estimado: 4 semanas." />
        </Field>

        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
