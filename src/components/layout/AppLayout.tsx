import { NavLink, Outlet } from 'react-router-dom'
import { KanbanSquare, KeyRound, LayoutGrid, LogOut, MonitorSmartphone } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { cn } from '../ui/cn'
import { Logo } from './Logo'
import { iniciales } from '../../lib/format'

const NAV = [
  { to: '/sistemas', label: 'Sistemas', icono: LayoutGrid },
  { to: '/demos', label: 'Demos web', icono: MonitorSmartphone },
  { to: '/pipeline', label: 'Pipeline', icono: KanbanSquare },
]

export function AppLayout() {
  const { miembro, salir } = useAuth()

  return (
    <div className="flex h-full">
      {/* Sidebar escritorio */}
      <aside className="hidden w-[232px] shrink-0 flex-col gap-7 border-r border-borde px-4 py-6 md:flex">
        <Logo className="px-2" />
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icono: Icono }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[42px] items-center gap-2.5 rounded-[10px] px-3 font-medium transition-colors',
                  isActive ? 'bg-superficie text-texto ring-1 ring-borde ring-inset' : 'text-suave hover:bg-elevada',
                )
              }
            >
              <Icono className="size-[18px] shrink-0" strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-tenue">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-acento-tenue text-xs font-semibold text-acento-texto">
              {iniciales(miembro?.nombre ?? '?')}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-texto">{miembro?.nombre}</div>
              <div className="truncate">{miembro?.email}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-4">
            <NavLink to="/nueva-clave" className="flex items-center gap-1.5 hover:text-texto">
              <KeyRound className="size-3.5" /> Contraseña
            </NavLink>
            <button onClick={salir} className="flex cursor-pointer items-center gap-1.5 hover:text-texto">
              <LogOut className="size-3.5" /> Salir
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header móvil */}
        <header className="flex items-center justify-between border-b border-borde px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <Logo subtitulo={false} />
          <div className="flex gap-1">
            <NavLink to="/nueva-clave" className="grid size-10 place-items-center rounded-[10px] text-suave hover:bg-elevada" aria-label="Cambiar contraseña">
              <KeyRound className="size-[18px]" />
            </NavLink>
            <button onClick={salir} className="grid size-10 place-items-center rounded-[10px] text-suave hover:bg-elevada" aria-label="Cerrar sesión">
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Navegación inferior móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-borde bg-fondo/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          {NAV.map(({ to, label, icono: Icono }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-[10px] py-1.5 text-[11px] font-medium',
                  isActive ? 'bg-superficie text-texto ring-1 ring-borde ring-inset' : 'text-tenue',
                )
              }
            >
              <Icono className="size-5" strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
