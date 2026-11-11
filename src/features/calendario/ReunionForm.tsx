import { useState, type FormEvent } from 'react'
import type { Miembro, Prospecto, Reunion, ReunionInput } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { isoLocal, vacioANull } from '../../lib/format'

export interface BorradorReunion {
  fecha: string // YYYY-MM-DD
  hora?: string // HH:mm
  prospecto_id?: string | null
  titulo?: string
}

interface Props {
  abierto: boolean
  reunion: Reunion | null
  borrador: BorradorReunion | null
  prospectos: Prospecto[]
  miembros: Miembro[]
  emailActual: string
  onCerrar: () => void
  onGuardar: (input: ReunionInput, id: string | null) => Promise<unknown>
  onEliminar: (id: string) => Promise<void>
}

const DURACIONES: [number, string][] = [
  [15, '15 min'],
  [30, '30 min'],
  [45, '45 min'],
  [60, '1 h'],
  [90, '1 h 30'],
  [120, '2 h'],
]

export function ReunionForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno key={props.reunion?.id ?? `nueva-${props.borrador?.fecha}`} {...props} />
}

function FormInterno({ reunion: r, borrador, prospectos, miembros, emailActual, onCerrar, onGuardar, onEliminar }: Props) {
  const inicio = r ? new Date(r.inicio) : null
  const [titulo, setTitulo] = useState(r?.titulo ?? borrador?.titulo ?? '')
  const [fecha, setFecha] = useState(inicio ? isoLocal(inicio) : (borrador?.fecha ?? isoLocal(new Date())))
  const [hora, setHora] = useState(
    inicio ? inicio.toTimeString().slice(0, 5) : (borrador?.hora ?? '10:00'),
  )
  const [duracion, setDuracion] = useState(String(r?.duracion_min ?? 60))
  const [prospectoId, setProspectoId] = useState(r?.prospecto_id ?? borrador?.prospecto_id ?? '')
  const [lugar, setLugar] = useState(r?.lugar_o_link ?? '')
  const [responsable, setResponsable] = useState(r?.responsable ?? emailActual)
  const [notas, setNotas] = useState(r?.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!titulo.trim()) return setError('Poné un título para la reunión.')
    if (!fecha || !hora) return setError('Elegí fecha y hora.')
    setGuardando(true)
    try {
      await onGuardar(
        {
          titulo: titulo.trim(),
          inicio: new Date(`${fecha}T${hora}`).toISOString(),
          duracion_min: Number(duracion),
          prospecto_id: prospectoId || null,
          lugar_o_link: vacioANull(lugar),
          responsable: vacioANull(responsable),
          notas: vacioANull(notas),
        },
        r?.id ?? null,
      )
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!r) return
    if (!confirmar) return setConfirmar(true)
    setGuardando(true)
    try {
      await onEliminar(r.id)
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
      setGuardando(false)
    }
  }

  const ordenados = [...prospectos].sort((a, b) => (a.empresa || a.nombre).localeCompare(b.empresa || b.nombre))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={r ? 'Editar reunión' : 'Nueva reunión'}
      pie={
        <>
          {r && (
            <Button variant={confirmar ? 'peligro' : 'fantasma'} size="sm" onClick={eliminar} disabled={guardando}>
              {confirmar ? '¿Seguro? Eliminar' : 'Eliminar'}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-reunion" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <form id="form-reunion" onSubmit={guardar} className="space-y-4">
        <Field label="Título *">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Demo del menú digital" autoFocus={!r} />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Hora">
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} step={300} />
          </Field>
          <Field label="Duración" className="col-span-2 sm:col-span-1">
            <Select value={duracion} onChange={(e) => setDuracion(e.target.value)}>
              {DURACIONES.map(([min, label]) => (
                <option key={min} value={min}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Con quién (prospecto o cliente)">
            <Select value={prospectoId} onChange={(e) => setProspectoId(e.target.value)}>
              <option value="">— Ninguno —</option>
              {ordenados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.empresa ? `${p.empresa} · ${p.nombre}` : p.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsable">
            <Select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Los dos</option>
              {miembros.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Lugar o link" ayuda="Pegá el link de Meet o Zoom, o la dirección.">
          <Input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="https://meet.google.com/…" />
        </Field>
        <Field label="Notas">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
