import { useState, type FormEvent } from 'react'
import { MessageCircle } from 'lucide-react'
import { ETAPAS, type Etapa, type Miembro, type Moneda, type Prospecto, type ProspectoInput } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { ETAPA_LABEL, vacioANull } from '../../lib/format'

interface Props {
  abierto: boolean
  prospecto: Prospecto | null
  etapaInicial: Etapa
  miembros: Miembro[]
  demos: { id: string; nombre: string }[]
  emailActual: string
  ordenAlFinal: (etapa: Etapa) => number
  onCerrar: () => void
  onGuardar: (input: ProspectoInput, id: string | null) => Promise<void>
  onEliminar: (id: string) => Promise<void>
}

export function ProspectoForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno key={props.prospecto?.id ?? `nuevo-${props.etapaInicial}`} {...props} />
}

function linkWhatsApp(tel: string) {
  const digitos = tel.replace(/\D/g, '')
  return digitos ? `https://wa.me/${digitos}` : null
}

function FormInterno({
  prospecto: p,
  etapaInicial,
  miembros,
  demos,
  emailActual,
  ordenAlFinal,
  onCerrar,
  onGuardar,
  onEliminar,
}: Props) {
  const [nombre, setNombre] = useState(p?.nombre ?? '')
  const [empresa, setEmpresa] = useState(p?.empresa ?? '')
  const [rubro, setRubro] = useState(p?.rubro ?? '')
  const [telefono, setTelefono] = useState(p?.telefono ?? '')
  const [email, setEmail] = useState(p?.email ?? '')
  const [etapa, setEtapa] = useState<Etapa>(p?.etapa ?? etapaInicial)
  const [valor, setValor] = useState(p?.valor_estimado != null ? String(p.valor_estimado) : '')
  const [moneda, setMoneda] = useState<Moneda>(p?.moneda ?? 'ARS')
  const [responsable, setResponsable] = useState(p?.responsable ?? emailActual)
  const [proximaAccion, setProximaAccion] = useState(p?.proxima_accion ?? '')
  const [fecha, setFecha] = useState(p?.fecha_proxima_accion ?? '')
  const [demoId, setDemoId] = useState(p?.ficha_demo_id ?? '')
  const [motivo, setMotivo] = useState(p?.motivo_perdida ?? '')
  const [notas, setNotas] = useState(p?.notas ?? '')

  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!nombre.trim()) return setError('El nombre de contacto es obligatorio.')
    const valorNum = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null
    if (valorNum != null && Number.isNaN(valorNum)) return setError('El valor estimado tiene que ser un número.')

    setGuardando(true)
    try {
      await onGuardar(
        {
          nombre: nombre.trim(),
          empresa: vacioANull(empresa),
          rubro: vacioANull(rubro),
          telefono: vacioANull(telefono),
          email: vacioANull(email),
          etapa,
          valor_estimado: valorNum,
          moneda,
          responsable: vacioANull(responsable),
          proxima_accion: vacioANull(proximaAccion),
          fecha_proxima_accion: fecha || null,
          ficha_demo_id: demoId || null,
          motivo_perdida: etapa === 'perdido' ? vacioANull(motivo) : null,
          notas: vacioANull(notas),
          // Si cambia de columna desde el formulario, va al final de la nueva
          orden: p && p.etapa === etapa ? p.orden : ordenAlFinal(etapa),
        },
        p?.id ?? null,
      )
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!p) return
    if (!confirmarBorrado) return setConfirmarBorrado(true)
    setGuardando(true)
    try {
      await onEliminar(p.id)
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
      setGuardando(false)
    }
  }

  const wa = linkWhatsApp(telefono)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={p ? p.empresa || p.nombre : 'Nuevo prospecto'}
      pie={
        <>
          {p && (
            <Button variant={confirmarBorrado ? 'peligro' : 'fantasma'} size="sm" onClick={eliminar} disabled={guardando}>
              {confirmarBorrado ? '¿Seguro? Eliminar' : 'Eliminar'}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-prospecto" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <form id="form-prospecto" onSubmit={guardar} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contacto *">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" autoFocus={!p} />
          </Field>
          <Field label="Empresa / negocio">
            <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} />
          </Field>
          <Field label="Rubro">
            <Input value={rubro} onChange={(e) => setRubro(e.target.value)} placeholder="Gastronomía, ferretería…" />
          </Field>
          <Field label="Teléfono">
            <div className="flex gap-2">
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="54911…" />
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-borde text-ok hover:bg-hover"
                  title="Abrir WhatsApp"
                >
                  <MessageCircle className="size-4" />
                </a>
              )}
            </div>
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 border-t border-borde pt-5 sm:grid-cols-2">
          <Field label="Etapa">
            <Select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}>
              {ETAPAS.map((et) => (
                <option key={et} value={et}>
                  {ETAPA_LABEL[et]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsable">
            <Select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Sin asignar</option>
              {miembros.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor estimado">
            <div className="flex gap-2">
              <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0" />
              <div className="w-24 shrink-0">
                <Select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} aria-label="Moneda">
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
            </div>
          </Field>
          <Field label="Demo mostrada">
            <Select value={demoId} onChange={(e) => setDemoId(e.target.value)}>
              <option value="">Ninguna</option>
              {demos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Próxima acción">
            <Input value={proximaAccion} onChange={(e) => setProximaAccion(e.target.value)} placeholder="Mandar propuesta" />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          {etapa === 'perdido' && (
            <Field label="Motivo de pérdida" className="sm:col-span-2">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Precio, timing, eligió otro…" />
            </Field>
          )}
        </div>

        <Field label="Notas">
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} />
        </Field>

        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
