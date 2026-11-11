import { useState, type FormEvent } from 'react'
import type { CategoriaCosto, Costo, CostoInput, FrecuenciaCosto, Moneda } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { CATEGORIA_COSTO_LABEL, FRECUENCIA_LABEL, hoyISO, parseNumero, vacioANull } from '../../lib/format'

interface Props {
  abierto: boolean
  costo: Costo | null
  onCerrar: () => void
  onGuardar: (input: CostoInput, id: string | null) => Promise<unknown>
  onEliminar: (id: string) => Promise<void>
}

export function CostoForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno key={props.costo?.id ?? 'nuevo'} {...props} />
}

function FormInterno({ costo: c, onCerrar, onGuardar, onEliminar }: Props) {
  const [nombre, setNombre] = useState(c?.nombre ?? '')
  const [categoria, setCategoria] = useState<CategoriaCosto>(c?.categoria ?? 'apps')
  const [monto, setMonto] = useState(c ? String(c.monto) : '')
  const [moneda, setMoneda] = useState<Moneda>(c?.moneda ?? 'USD')
  const [frecuencia, setFrecuencia] = useState<FrecuenciaCosto>(c?.frecuencia ?? 'mensual')
  const [desde, setDesde] = useState(c?.desde ?? hoyISO())
  const [hasta, setHasta] = useState(c?.hasta ?? '')
  const [notas, setNotas] = useState(c?.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError('Poné un nombre (ej: Supabase, Vercel, Meta Ads).')
    const n = parseNumero(monto)
    if (n == null || n < 0) return setError('Ingresá un monto válido.')
    if (hasta && hasta < desde) return setError('"Hasta" no puede ser anterior a "Desde".')
    setGuardando(true)
    try {
      await onGuardar(
        {
          nombre: nombre.trim(),
          categoria,
          monto: n,
          moneda,
          frecuencia,
          desde,
          hasta: frecuencia === 'unico' ? null : hasta || null,
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

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={c ? 'Editar costo' : 'Agregar costo'}
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
            <Button type="submit" form="form-costo" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <form id="form-costo" onSubmit={guardar} className="space-y-4">
        <Field label="Nombre *">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Supabase Pro" autoFocus={!c} />
        </Field>
        <Field
          label="Categoría"
          ayuda={categoria === 'adquisicion' ? 'Publicidad, prospección, comisiones por referidos: se usa para calcular el ROAS.' : undefined}
        >
          <Select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaCosto)}>
            {(Object.keys(CATEGORIA_COSTO_LABEL) as CategoriaCosto[]).map((k) => (
              <option key={k} value={k}>
                {CATEGORIA_COSTO_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Monto *">
            <div className="flex gap-2">
              <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" />
              <div className="w-24 shrink-0">
                <Select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} aria-label="Moneda">
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </Select>
              </div>
            </div>
          </Field>
          <Field label="Frecuencia">
            <Select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as FrecuenciaCosto)}>
              {(Object.keys(FRECUENCIA_LABEL) as FrecuenciaCosto[]).map((k) => (
                <option key={k} value={k}>
                  {FRECUENCIA_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={frecuencia === 'unico' ? 'Fecha del pago' : 'Desde'}>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          {frecuencia !== 'unico' && (
            <Field label="Hasta" ayuda="Vacío = sigue vigente">
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="Notas">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
