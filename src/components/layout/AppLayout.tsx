import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  CalendarDays,
  AudioLines,
  Bot,
  Calculator,
  Home,
  FolderOpen,
  KanbanSquare,
  KeyRound,
  LayoutGrid,
  LogOut,
  Mic,
  MonitorSmartphone,
  MoreHorizontal,
  Plug,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { cn } from '../ui/cn'
import { Logo } from './Logo'
import { Asistente } from '../../features/asistente/Asistente'
import { iniciales } from '../../lib/format'
import { avisarAgentes } from '../../features/agentes/useAgentes'
import { ConectorClaude } from '../../features/clientes/ConectorClaude'

interface Item {
  to: string
  label: string
  icono: LucideIcon
}

const ESTUDIO: Item[] = [
  { to: '/jarvis', label: 'Jarvis', icono: AudioLines },
  { to: '/inicio', label: 'Inicio', icono: Home },
  { to: '/agentes', label: 'Agentes', icono: Bot },
  { to: '/calendario', label: 'Calendario', icono: CalendarDays },
  { to: '/grabaciones', label: 'Grabaciones', icono: Mic },
  { to: '/pipeline', label: 'Pipeline', icono: KanbanSquare },
  { to: '/clientes', label: 'Clientes', icono: FolderOpen },
  { to: '/propuestas', label: 'Propuestas', icono: Calculator },
  { to: '/finanzas', label: 'Finanzas', icono: Wallet },
]

const PROYECTOS: Item[] = [
  { to: '/sistemas', label: 'Sistemas', icono: LayoutGrid },
  { to: '/demos', label: 'Demos web', icono: MonitorSmartphone },
]

/**
 * En el celular, la barra inferior es una tira deslizable con todas las secciones, en este orden
 * (las primeras cuatro se ven al abrir; el resto aparece deslizando hacia la izquierda).
 * "Más" queda fijo a la derecha, solo con la cuenta.
 */
const MOVIL = ['/jarvis', '/inicio', '/grabaciones', '/pipeline', '/clientes', '/calendario', '/propuestas', '/finanzas', '/agentes', '/sistemas', '/demos']
const TODAS = [...ESTUDIO, ...PROYECTOS]
const BARRA_MOVIL = MOVIL.map((to) => TODAS.find((i) => i.to === to)).filter((i): i is Item => !!i)

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

/** true cuando el hub está adentro de un iframe (el panel de pantallas de Jarvis) */
const embebido = typeof window !== 'undefined' && window.self !== window.top

export function AppLayout() {
  const { miembro, salir } = useAuth()
  const [masAbierto, setMasAbierto] = useState(false)
  // Enlace del conector de Claude: se usa una vez por socio, por eso vive con la cuenta y no en una sección
  const [conector, setConector] = useState(false)
  const { pathname } = useLocation()

  const tiraRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMasAbierto(false), [pathname])
  // En la tira deslizable, la sección activa queda siempre a la vista
  useEffect(() => {
    const tira = tiraRef.current
    const activo = tira?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!tira || !activo) return
    const destino = activo.offsetLeft - (tira.clientWidth - activo.offsetWidth) / 2
    tira.scrollTo({ left: Math.max(0, destino), behavior: 'smooth' })
  }, [pathname])
  // Al abrir el hub, los agentes programados corren lo que tengan pendiente (por si la base no los programa sola)
  useEffect(() => {
    if (!embebido) avisarAgentes()
  }, [])

  const enMas = pathname.startsWith('/nueva-clave')

  // Abierta dentro de un panel de Jarvis ("mostrame la carpeta de Nova"): solo la pantalla, sin menú ni asistente
  if (embebido) {
    return (
      <main className="h-full overflow-y-auto">
        <Outlet />
      </main>
    )
  }

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
          <button onClick={() => setConector(true)} className="mt-3 flex cursor-pointer items-center gap-1.5 hover:text-texto">
            <Plug className="size-3.5" /> Conectar con Claude
          </button>
          <div className="mt-2 flex gap-4">
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

        {/* Asistente de voz: en todas las pantallas, menos la grabadora (usan el micrófono) y Jarvis (tiene el suyo) */}
        {!pathname.startsWith('/grabar') && !pathname.startsWith('/jarvis') && <Asistente />}

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
                <button
                  onClick={() => {
                    setMasAbierto(false)
                    setConector(true)
                  }}
                  className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-[10px] px-3 font-medium text-suave hover:bg-elevada"
                >
                  <Plug className="size-[18px]" strokeWidth={1.8} /> Conectar con Claude
                </button>
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

        <ConectorClaude abierto={conector} onCerrar={() => setConector(false)} />

        {/* Navegación inferior móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-50 flex gap-1 border-t border-borde bg-fondo/95 px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          {/* Tira deslizable: el ancho fijo deja asomar la siguiente sección como pista de que hay más */}
          <div
            ref={tiraRef}
            className="sin-scrollbar flex min-w-0 flex-1 snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain"
          >
            {BARRA_MOVIL.map(({ to, label, icono: Icono }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex w-[4.75rem] shrink-0 snap-start flex-col items-center gap-0.5 rounded-[10px] py-1.5 text-[11px] font-medium whitespace-nowrap',
                    isActive && !masAbierto ? 'bg-superficie text-texto ring-1 ring-borde ring-inset' : 'text-tenue',
                  )
                }
              >
                <Icono className="size-5" strokeWidth={1.8} />
                {label}
              </NavLink>
            ))}
          </div>
          <button
            onClick={() => setMasAbierto((v) => !v)}
            className={cn(
              'flex w-16 shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-[10px] border-l border-borde py-1.5 text-[11px] font-medium',
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
