import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  Calculator,
  Home,
  KanbanSquare,
  KeyRound,
  LayoutGrid,
  LogOut,
  Mic,
  MonitorSmartphone,
  MoreHorizontal,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { cn } from '../ui/cn'
import { Logo } from './Logo'
import { iniciales } from '../../lib/format'

interface Item {
  to: string
  label: string
  icono: LucideIcon
}

const ESTUDIO: Item[] = [
  { to: '/inicio', label: 'Inicio', icono: Home },
  { to: '/calendario', label: 'Calendario', icono: CalendarDays },
  { to: '/grabaciones', label: 'Grabaciones', icono: Mic },
  { to: '/pipeline', label: 'Pipeline', icono: KanbanSquare },
  { to: '/cotizador', label: 'Cotizador', icono: Calculator },
  { to: '/finanzas', label: 'Finanzas', icono: Wallet },
]

const PROYECTOS: Item[] = [
  { to: '/sistemas', label: 'Sistemas', icono: LayoutGrid },
  { to: '/demos', label: 'Demos web', icono: MonitorSmartphone },
]

/** En el celular, la barra inferior muestra estas y el resto va a "Más". */
const MOVIL = ['/inicio', '/calendario', '/grabaciones', '/pipeline']

function LinkNav({ item }: { item: Item }) {
  const Icono = item.icono
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex min-h-[42px] items-center gap-2.5 rounded-[10px] px-3 font-medium transition-colors',
          isActive ? 'bg-superficie text-texto ring-1 ring-borde ring-inset' : 'text-suave hover:bg-elevada',
        )
      }
    >
      <Icono className="size-[18px] shrink-0" strokeWidth={1.8} />
      {item.label}
    </NavLink>
  )
}

export function AppLayout() {
  const { miembro, salir } = useAuth()
  const [masAbierto, setMasAbierto] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => setMasAbierto(false), [pathname])

  const enMas = ![...MOVIL, '/grabar'].some((r) => pathname.startsWith(r))
  const resto = [...ESTUDIO, ...PROYECTOS].filter((i) => !MOVIL.includes(i.to))

  return (
    <div className="flex h-full">
      {/* Sidebar escritorio */}
      <aside className="hidden w-[232px] shrink-0 flex-col gap-7 overflow-y-auto border-r border-borde px-4 py-6 md:flex">
        <Logo className="px-2" />
        <nav className="flex flex-col gap-1">
          {ESTUDIO.map((i) => (
            <LinkNav key={i.to} item={i} />
          ))}
          <span className="mt-5 mb-1 px-3 text-xs font-semibold text-tenue">Proyectos</span>
          {PROYECTOS.map((i) => (
            <LinkNav key={i.to} item={i} />
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
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Menú "Más" (móvil) */}
        {masAbierto && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMasAbierto(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-borde bg-fondo px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] animate-aparecer">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-display text-lg font-bold">Más</span>
                <button onClick={() => setMasAbierto(false)} className="grid size-10 place-items-center rounded-[10px] text-suave" aria-label="Cerrar">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {resto.map((i) => (
                  <LinkNav key={i.to} item={i} />
                ))}
                <LinkNav item={{ to: '/nueva-clave', label: 'Cambiar contraseña', icono: KeyRound }} />
                <button
                  onClick={salir}
                  className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-[10px] px-3 font-medium text-suave hover:bg-elevada"
                >
                  <LogOut className="size-[18px]" strokeWidth={1.8} /> Cerrar sesión
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* Navegación inferior móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-50 flex gap-1 border-t border-borde bg-fondo/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          {ESTUDIO.filter((i) => MOVIL.includes(i.to)).map(({ to, label, icono: Icono }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center gap-0.5 rounded-[10px] py-1.5 text-[11px] font-medium',
                  isActive && !masAbierto ? 'bg-superficie text-texto ring-1 ring-borde ring-inset' : 'text-tenue',
                )
              }
            >
              <Icono className="size-5" strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setMasAbierto((v) => !v)}
            className={cn(
              'flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-[10px] py-1.5 text-[11px] font-medium',
              masAbierto || enMas ? 'bg-superficie text-texto ring-1 ring-borde ring-inset' : 'text-tenue',
            )}
          >
            <MoreHorizontal className="size-5" strokeWidth={1.8} />
            Más
          </button>
        </nav>
      </div>
    </div>
  )
}
