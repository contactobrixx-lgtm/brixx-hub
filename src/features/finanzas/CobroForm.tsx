import { useState, type FormEvent } from 'react'
import type { Cobro, CobroInput, ConceptoCobro, Cotizacion, Moneda, Prospecto } from '../../types/db'
import { ETAPAS_GANADAS } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { CONCEPTO_LABEL, hoyISO, numeroCotizacion, parseNumero, vacioANull } from '../../lib/format'

interface Props {
  abierto: boolean
  cobro: Cobro | null
  /** Valores para un cobro nuevo (ej. "registrar abono" desde Pendientes). */
  inicial?: Partial<CobroInput> | null
  prospectos: Prospecto[]
  cotizaciones: Cotizacion[]
  onCerrar: () => void
  onGuardar: (input: CobroInput, id: string | null) => Promise<unknown>
  onEliminar: (id: string) => Promise<void>
}

export function CobroForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno key={props.cobro?.id ?? 'nuevo'} {...props} />
}

function FormInterno({ cobro: c, inicial, prospectos, cotizaciones, onCerrar, onGuardar, onEliminar }: Props) {
  const [fecha, setFecha] = useState(c?.fecha ?? hoyISO())
  const [prospectoId, setProspectoId] = useState(c?.prospecto_id ?? inicial?.prospecto_id ?? '')
  const [concepto, setConcepto] = useState<ConceptoCobro>(c?.concepto ?? inicial?.concepto ?? 'anticipo')
  const [monto, setMonto] = useState(c ? String(c.monto) : inicial?.monto != null ? String(inicial.monto) : '')
  const [moneda, setMoneda] = useState<Moneda>(c?.moneda ?? inicial?.moneda ?? 'USD')
  const [cotizacionId, setCotizacionId] = useState(
    c?.cotizacion_id ??
      inicial?.cotizacion_id ??
      (() => {
        const aceptadas = cotizaciones.filter((q) => q.prospecto_id === inicial?.prospecto_id && q.estado === 'aceptada')
        return aceptadas.length === 1 ? aceptadas[0].id : ''
      })(),
  )
  const [notas, setNotas] = useState(c?.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const delCliente = cotizaciones.filter((q) => q.prospecto_id === prospectoId && q.estado === 'aceptada')

  const elegirCliente = (id: string) => {
    setProspectoId(id)
    const aceptadas = cotizaciones.filter((q) => q.prospecto_id === id && q.estado === 'aceptada')
    setCotizacionId(aceptadas.length === 1 ? aceptadas[0].id : '')
    if (aceptadas.length === 1) setMoneda(aceptadas[0].moneda)
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const n = parseNumero(monto)
    if (n == null || n <= 0) return setError('Ingresá un monto válido.')
    setGuardando(true)
    try {
      await onGuardar(
        {
          fecha,
          monto: n,
          moneda,
          concepto,
          prospecto_id: prospectoId || null,
          cotizacion_id: cotizacionId || null,
          notas: vacioANull(notas),
        },
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

  const nombre = (p: Prospecto) => (p.empresa ? `${p.empresa} · ${p.nombre}` : p.nombre)
  const clientes = prospectos.filter((p) => ETAPAS_GANADAS.includes(p.etapa)).sort((a, b) => nombre(a).localeCompare(nombre(b)))
  const otros = prospectos.filter((p) => !ETAPAS_GANADAS.includes(p.etapa)).sort((a, b) => nombre(a).localeCompare(nombre(b)))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={c ? 'Editar cobro' : 'Registrar cobro'}
      pie={
        <>
          {c && (
            <Button variant={confirmar ? 'peligro' : 'fantasma'} size="sm" onClick={eliminar} disabled={guardando}>
              {confirmar ? '¿Seguro? Eliminar' : 'Eliminar'}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-cobro" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <form id="form-cobro" onSubmit={guardar} className="space-y-4">
        <Field label="Cliente">
          <Select value={prospectoId} onChange={(e) => elegirCliente(e.target.value)}>
            <option value="">— Sin cliente —</option>
            {clientes.length > 0 && (
              <optgroup label="Clientes">
                {clientes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nombre(p)}
                  </option>
                ))}
              </optgroup>
            )}
            {otros.length > 0 && (
              <optgroup label="Prospectos">
                {otros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nombre(p)}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Concepto">
            <Select value={concepto} onChange={(e) => setConcepto(e.target.value as ConceptoCobro)}>
              {(Object.keys(CONCEPTO_LABEL) as ConceptoCobro[]).map((k) => (
                <option key={k} value={k}>
                  {CONCEPTO_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>
        <Field label="Monto *">
          <div className="flex gap-2">
            <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" autoFocus={!c} />
            <div className="w-24 shrink-0">
              <Select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} aria-label="Moneda">
                <option value="USD">USD</option>
                <option value="ARS">ARS</option>
              </Select>
            </div>
          </div>
        </Field>
        {delCliente.length > 0 && (
          <Field label="Cotización">
            <Select value={cotizacionId} onChange={(e) => setCotizacionId(e.target.value)}>
              <option value="">— Ninguna —</option>
              {delCliente.map((q) => (
                <option key={q.id} value={q.id}>
                  {numeroCotizacion(q.numero)} {q.titulo ? `· ${q.titulo}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notas">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Transferencia, factura N°…" />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
