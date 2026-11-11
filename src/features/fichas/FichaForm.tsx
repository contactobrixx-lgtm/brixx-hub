import { useState, type FormEvent } from 'react'
import { Globe, MonitorPlay } from 'lucide-react'
import type { EstadoFicha, Ficha, FichaInput, ModoApertura, Seccion } from '../../types/db'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorBox } from '../../components/ui/ErrorBox'
import { cn } from '../../components/ui/cn'
import { normalizarUrl, vacioANull } from '../../lib/format'
import { ImagenPicker } from './ImagenPicker'
import type { CambioImagen } from './useFichas'

const CATEGORIAS: Record<Seccion, string[]> = {
  sistema: ['ERP', 'POS', 'CRM', 'Stock', 'Panel admin'],
  demo: ['Menú digital', 'Cotizador', 'Landing', 'Catálogo', 'Reservas'],
}

interface Props {
  abierto: boolean
  seccion: Seccion
  ficha: Ficha | null // null = nueva
  imagenUrl?: string
  siguienteOrden: number
  categoriasExistentes: string[]
  onCerrar: () => void
  onGuardar: (input: FichaInput, id: string | null, imagen: CambioImagen) => Promise<void>
  onEliminar: (ficha: Ficha) => Promise<void>
}

export function FichaForm(props: Props) {
  // key fuerza estado limpio cada vez que se abre con otra ficha
  if (!props.abierto) return null
  return <FormInterno key={props.ficha?.id ?? 'nueva'} {...props} />
}

function FormInterno({
  seccion,
  ficha,
  imagenUrl,
  siguienteOrden,
  categoriasExistentes,
  onCerrar,
  onGuardar,
  onEliminar,
}: Props) {
  const [nombre, setNombre] = useState(ficha?.nombre ?? '')
  const [url, setUrl] = useState(ficha?.url ?? '')
  const [cliente, setCliente] = useState(ficha?.cliente ?? '')
  const [categoria, setCategoria] = useState(ficha?.categoria ?? '')
  const [descripcion, setDescripcion] = useState(ficha?.descripcion ?? '')
  const [modo, setModo] = useState<ModoApertura>(ficha?.modo_apertura ?? 'iframe')
  const [estado, setEstado] = useState<EstadoFicha>(ficha?.estado ?? 'activo')
  const [etiquetas, setEtiquetas] = useState((ficha?.etiquetas ?? []).join(', '))
  const [orden, setOrden] = useState(String(ficha?.orden ?? siguienteOrden))
  const [seccionSel, setSeccionSel] = useState<Seccion>(ficha?.seccion ?? seccion)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [quitarImagen, setQuitarImagen] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  const sugerencias = Array.from(new Set([...CATEGORIAS[seccionSel], ...categoriasExistentes]))

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!nombre.trim() || !url.trim()) return setError('Nombre y URL son obligatorios.')
    const urlFinal = normalizarUrl(url)
    try {
      new URL(urlFinal)
    } catch {
      return setError('La URL no es válida.')
    }
    setGuardando(true)
    try {
      await onGuardar(
        {
          seccion: seccionSel,
          nombre: nombre.trim(),
          url: urlFinal,
          cliente: vacioANull(cliente),
          categoria: vacioANull(categoria),
          descripcion: vacioANull(descripcion),
          modo_apertura: modo,
          estado,
          etiquetas: etiquetas
            .split(',')
            .map((t) => t.trim().replace(/^#/, ''))
            .filter(Boolean),
          orden: Number.parseInt(orden, 10) || 0,
          imagen_path: ficha?.imagen_path ?? null, // lo resuelve el hook
        },
        ficha?.id ?? null,
        { archivo, quitar: quitarImagen },
      )
      onCerrar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  const eliminar = async () => {
    if (!ficha) return
    if (!confirmarBorrado) return setConfirmarBorrado(true)
    setGuardando(true)
    try {
      await onEliminar(ficha)
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
      titulo={ficha ? 'Editar ficha' : seccion === 'sistema' ? 'Nuevo sistema' : 'Nueva demo'}
      pie={
        <>
          {ficha && (
            <Button variant={confirmarBorrado ? 'peligro' : 'fantasma'} size="sm" onClick={eliminar} disabled={guardando}>
              {confirmarBorrado ? '¿Seguro? Eliminar' : 'Eliminar'}
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secundario" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" form="form-ficha" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      <form id="form-ficha" onSubmit={guardar} className="space-y-4">
        <ImagenPicker
          actualUrl={imagenUrl}
          archivo={archivo}
          quitada={quitarImagen}
          onArchivo={(f) => {
            setArchivo(f)
            if (f) setQuitarImagen(false)
          }}
          onQuitar={() => setQuitarImagen(true)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre *" className="sm:col-span-2">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ERP Ferretería" autoFocus />
          </Field>
          <Field label="URL *" className="sm:col-span-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
          </Field>
          <Field label="Cliente">
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Opcional" />
          </Field>
          <Field label="Categoría">
            <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} list="categorias-ficha" />
            <datalist id="categorias-ficha">
              {sugerencias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold">Cómo se abre</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['iframe', 'Dentro del hub', MonitorPlay],
                ['pestana', 'Pestaña nueva', Globe],
              ] as const
            ).map(([valor, label, Icono]) => (
              <button
                key={valor}
                type="button"
                onClick={() => setModo(valor)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[15px] font-medium transition-colors',
                  modo === valor ? 'border-acento bg-acento-tenue text-texto' : 'border-borde-fuerte text-suave hover:border-tenue',
                )}
              >
                <Icono className={cn('size-4', modo === valor && 'text-acento-texto')} />
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[13px] text-tenue">Si la app no carga dentro del hub, elegí "Pestaña nueva".</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value as EstadoFicha)}>
              <option value="activo">Activo</option>
              <option value="en_desarrollo">En desarrollo</option>
              <option value="archivado">Archivado</option>
            </Select>
          </Field>
          <Field label="Sección">
            <Select value={seccionSel} onChange={(e) => setSeccionSel(e.target.value as Seccion)}>
              <option value="sistema">Sistemas</option>
              <option value="demo">Demos web</option>
            </Select>
          </Field>
          <Field label="Orden" ayuda="Menor = primero">
            <Input type="number" value={orden} onChange={(e) => setOrden(e.target.value)} />
          </Field>
        </div>

        <Field label="Etiquetas" ayuda="Separadas por coma: gastronomía, whatsapp">
          <Input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} />
        </Field>

        {error && <ErrorBox mensaje={error} />}
      </form>
    </Modal>
  )
}
