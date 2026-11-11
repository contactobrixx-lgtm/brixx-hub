import { useState, type FormEvent } from 'react'
import type { Servicio, ServicioInput } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { parseNumero, vacioANull } from '../../lib/format'

interface Props {
  abierto: boolean
  servicio: Servicio | null
  siguienteOrden: number
  onCerrar: () => void
  onGuardar: (input: ServicioInput, id: string | null) => Promise<unknown>
  onEliminar: (id: string) => Promise<void>
}

export function ServicioForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno key={props.servicio?.id ?? 'nuevo'} {...props} />
}

function FormInterno({ servicio: s, siguienteOrden, onCerrar, onGuardar, onEliminar }: Props) {
  const [nombre, setNombre] = useState(s?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(s?.descripcion ?? '')
  const [impl, setImpl] = useState(s ? String(s.precio_implementacion) : '')
  const [mensual, setMensual] = useState(s ? String(s.precio_mensual) : '')
  const [activo, setActivo] = useState(s?.activo ?? true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError('El nombre es obligatorio.')
    const pi = impl.trim() ? parseNumero(impl) : 0
    const pm = mensual.trim() ? parseNumero(mensual) : 0
    if (pi == null || pm == null) return setError('Los precios tienen que ser números.')
    setGuardando(true)
    try {
      await onGuardar(
        {
          nombre: nombre.trim(),
          descripcion: vacioANull(descripcion),
          precio_implementacion: pi,
          precio_mensual: pm,
          activo,
          orden: s?.orden ?? siguienteOrden,
        },
        s?.id ?? null,
      )
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!s) return
    if (!confirmar) return setConfirmar(true)
    setGuardando(true)
    try {
      await onEliminar(s.id)
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
      titulo={s ? 'Editar servicio' : 'Nuevo servicio'}
      pie={
        <>
          {s && (
            <Button variant={confirmar ? 'peligro' : 'fantasma'} size="sm" onClick={eliminar} disabled={guardando}>
              {confirmar ? '¿Seguro? Eliminar' : 'Eliminar'}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-servicio" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <form id="form-servicio" onSubmit={guardar} className="space-y-4">
        <Field label="Nombre *">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!s} />
        </Field>
        <Field label="Descripción" ayuda="Aparece en la cotización que ve el cliente.">
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Implementación (USD)" ayuda="Pago único">
            <Input value={impl} onChange={(e) => setImpl(e.target.value)} inputMode="decimal" placeholder="0" />
          </Field>
          <Field label="Abono mensual (USD)" ayuda="Por mes">
            <Input value={mensual} onChange={(e) => setMensual(e.target.value)} inputMode="decimal" placeholder="0" />
          </Field>
        </div>
        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[15px]">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="size-[18px] accent-acento" />
          Activo (aparece al armar cotizaciones)
        </label>
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
