import { useState, type FormEvent } from 'react'
import type { Meta, MetaInput, TipoMeta } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { parseNumero } from '../../lib/format'
import { periodoDe, periodoSiguiente, type Periodo } from './metas'

interface Props {
  abierto: boolean
  metas: Meta[]
  tasas: { reunionPropuesta: number; propuestaCierre: number }
  onCerrar: () => void
  onGuardar: (metas: MetaInput[], tasas: { tasa_reunion_propuesta: number; tasa_propuesta_cierre: number }) => Promise<void>
}

/** Períodos editables: este mes + 2 siguientes, este trimestre + el siguiente. */
function periodosEditables(): Periodo[] {
  const lista: Periodo[] = []
  for (const [tipo, cantidad] of [['mes', 3], ['trimestre', 2]] as [TipoMeta, number][]) {
    let p = periodoDe(tipo)
    for (let i = 0; i < cantidad; i++) {
      lista.push(p)
      p = periodoSiguiente(p)
    }
  }
  return lista
}

export function MetasForm(props: Props) {
  if (!props.abierto) return null
  return <FormInterno {...props} />
}

function FormInterno({ metas, tasas, onCerrar, onGuardar }: Props) {
  const periodos = periodosEditables()
  const buscar = (p: Periodo) => metas.find((m) => m.tipo === p.tipo && m.periodo.slice(0, 10) === p.iso)
  const [valores, setValores] = useState<Record<string, { clientes: string; ingreso: string }>>(() =>
    Object.fromEntries(
      periodos.map((p) => {
        const m = buscar(p)
        return [`${p.tipo}:${p.iso}`, { clientes: m?.clientes_nuevos?.toString() ?? '', ingreso: m?.ingreso_recurrente?.toString() ?? '' }]
      }),
    ),
  )
  const [tasaRP, setTasaRP] = useState(String(Math.round(tasas.reunionPropuesta * 100)))
  const [tasaPC, setTasaPC] = useState(String(Math.round(tasas.propuestaCierre * 100)))
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cambiar = (clave: string, campo: 'clientes' | 'ingreso', v: string) =>
    setValores((x) => ({ ...x, [clave]: { ...x[clave], [campo]: v } }))

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const filas: MetaInput[] = []
    for (const p of periodos) {
      const v = valores[`${p.tipo}:${p.iso}`]
      const clientes = v.clientes.trim() ? parseNumero(v.clientes) : null
      const ingreso = v.ingreso.trim() ? parseNumero(v.ingreso) : null
      if ((v.clientes.trim() && (clientes == null || clientes < 0)) || (v.ingreso.trim() && (ingreso == null || ingreso < 0))) {
        return setError(`Revisá los números de ${p.etiqueta}.`)
      }
      if (clientes == null && ingreso == null && !buscar(p)) continue
      filas.push({ tipo: p.tipo, periodo: p.iso, clientes_nuevos: clientes == null ? null : Math.round(clientes), ingreso_recurrente: ingreso })
    }
    const rp = parseNumero(tasaRP)
    const pc = parseNumero(tasaPC)
    if (rp == null || pc == null || rp <= 0 || rp > 100 || pc <= 0 || pc > 100) return setError('Las tasas tienen que estar entre 1% y 100%.')
    setGuardando(true)
    try {
      await onGuardar(filas, { tasa_reunion_propuesta: rp / 100, tasa_propuesta_cierre: pc / 100 })
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const bloque = (tipo: TipoMeta, titulo: string) => (
    <section>
      <h3 className="mb-3 text-[17px] font-bold">{titulo}</h3>
      <div className="flex flex-col gap-3">
        {periodos
          .filter((p) => p.tipo === tipo)
          .map((p) => {
            const clave = `${p.tipo}:${p.iso}`
            return (
              <div key={clave} className="rounded-xl bg-elevada p-3">
                <div className="mb-2 text-sm font-semibold">{p.etiqueta}</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Clientes nuevos">
                    <Input value={valores[clave].clientes} onChange={(e) => cambiar(clave, 'clientes', e.target.value)} inputMode="numeric" placeholder="—" />
                  </Field>
                  <Field label="Ingreso recurrente (USD/mes)">
                    <Input value={valores[clave].ingreso} onChange={(e) => cambiar(clave, 'ingreso', e.target.value)} inputMode="decimal" placeholder="—" />
                  </Field>
                </div>
              </div>
            )
          })}
      </div>
    </section>
  )

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Metas"
      pie={
        <div className="ml-auto flex gap-2">
          <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-metas" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <form id="form-metas" onSubmit={guardar} className="space-y-6">
        <p className="text-sm text-tenue">
          <b className="text-texto">Clientes nuevos</b>: los que pasan a cliente dentro del período.{' '}
          <b className="text-texto">Ingreso recurrente</b>: la suma de abonos mensuales que quieren tener al cierre del período. Vacío = sin meta.
        </p>
        {bloque('mes', 'Por mes')}
        {bloque('trimestre', 'Por trimestre')}
        <section>
          <h3 className="mb-1 text-[17px] font-bold">Embudo</h3>
          <p className="mb-3 text-sm text-tenue">
            Se usan para calcular cuántas reuniones y propuestas hacen falta, hasta que haya al menos 5 casos reales: ahí el hub usa sus
            propias tasas.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reuniones que llegan a propuesta (%)">
              <Input value={tasaRP} onChange={(e) => setTasaRP(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Propuestas que se cierran (%)">
              <Input value={tasaPC} onChange={(e) => setTasaPC(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        </section>
        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
