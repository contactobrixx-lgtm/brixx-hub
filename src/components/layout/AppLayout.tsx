import { NavLink, Outlet } from 'react-router-dom'
import { KanbanSquare, KeyRound, LayoutGrid, LogOut, Sparkles } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { cn } from '../ui/cn'
import { Logo } from './Logo'
import { iniciales } from '../../lib/format'

const NAV = [
  { to: '/sistemas', label: 'Sistemas', icono: LayoutGrid },
  { to: '/demos', label: 'Demos web', icono: Sparkles },
  { to: '/pipeline', label: 'Pipeline', icono: KanbanSquare },
]

export function AppLayout() {
  const { miembro, salir } = useAuth()

  return (
    <div className="flex h-full">
      {/* Sidebar escritorio */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-borde bg-superficie/60 md:flex">
        <Logo className="px-5 pt-6 pb-8" />
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ to, label, icono: Icono }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-acento-tenue text-texto' : 'text-suave hover:bg-hover hover:text-texto',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icono className={cn('size-4', isActive && 'text-acento')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-borde p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-elevada text-xs font-semibold text-acento">
              {iniciales(miembro?.nombre ?? '?')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{miembro?.nombre}</div>
              <div className="truncate text-xs text-tenue">{miembro?.email}</div>
            </div>
          </div>
          <div className="mt-1 flex gap-1">
            <NavLink
              to="/nueva-clave"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-suave hover:bg-hover hover:text-texto"
            >
              <KeyRound className="size-3.5" /> Contraseña
            </NavLink>
            <button
              onClick={salir}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-suave hover:bg-hover hover:text-texto"
            >
              <LogOut className="size-3.5" /> Salir
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header móvil */}
        <header className="flex items-center justify-between border-b border-borde px-4 py-3 md:hidden">
          <Logo />
          <div className="flex gap-1">
            <NavLink to="/nueva-clave" className="rounded-lg p-2 text-suave hover:bg-hover" aria-label="Cambiar contraseña">
              <KeyRound className="size-4" />
            </NavLink>
            <button onClick={salir} className="rounded-lg p-2 text-suave hover:bg-hover" aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Navegación inferior móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-borde bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map(({ to, label, icono: Icono }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn('flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]', isActive ? 'text-acento' : 'text-tenue')
              }
            >
              <Icono className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
