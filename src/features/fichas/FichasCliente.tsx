import { Link } from 'react-router-dom'
import { ExternalLink, LayoutGrid, MonitorSmartphone } from 'lucide-react'
import type { Prospecto } from '../../types/db'
import { Badge } from '../../components/ui/Badge'
import { normalizarUrl } from '../../lib/format'
import { useFichasCliente } from './useFichas'

/** Bloque "Demos y sistemas" de los entregables del cliente: cada ficha se abre en el visor o en otra pestaña */
export function FichasCliente({ p }: { p: Prospecto }) {
  const { fichas, cargando } = useFichasCliente(p)
  return (
    <section className="rounded-2xl border border-borde bg-superficie p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <MonitorSmartphone className="size-5 text-acento-texto" />
        <h2 className="min-w-0 flex-1 text-[19px] font-bold">Demos y sistemas</h2>
        <Link to="/demos" className="text-sm font-semibold text-acento-texto hover:underline">
          Ver todas
        </Link>
      </div>
      {cargando ? null : fichas.length === 0 ? (
        <p className="text-sm text-tenue">
          Todavía no tiene demos ni sistemas. Al cargar una ficha, poné en "cliente" el mismo nombre de esta carpeta.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {fichas.map((f) => {
            const Icono = f.seccion === 'sistema' ? LayoutGrid : MonitorSmartphone
            return (
              <li key={f.id} className="flex items-center gap-2 rounded-xl bg-elevada p-2.5 pl-3">
                <Icono className="size-4 shrink-0 text-suave" />
                <Link to={`/ver/${f.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate font-semibold leading-snug">{f.nombre}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1.5">
                    <Badge tono={f.seccion === 'sistema' ? 'ok' : 'acento'}>{f.seccion === 'sistema' ? 'Sistema' : 'Demo'}</Badge>
                    {f.en_linea === false && <Badge tono="peligro">Caída</Badge>}
                  </span>
                </Link>
                <a
                  href={normalizarUrl(f.url)}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir en pestaña nueva"
                  aria-label={`Abrir ${f.nombre} en pestaña nueva`}
                  className="grid size-9 shrink-0 place-items-center rounded-[10px] text-suave transition-colors hover:bg-superficie hover:text-texto"
                >
                  <ExternalLink className="size-4" />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
