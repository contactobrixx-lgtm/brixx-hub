import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { PantallaCarga } from '../components/ui/Spinner'
import { Button } from '../components/ui/Button'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, miembro, cargando, salir } = useAuth()
  const location = useLocation()

  if (cargando) return <PantallaCarga />
  if (!session) return <Navigate to="/login" replace state={{ desde: location.pathname }} />

  if (!miembro) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-sm text-center animate-aparecer">
          <ShieldAlert className="mx-auto mb-4 size-10 text-aviso" />
          <h1 className="text-lg font-semibold">Sin acceso</h1>
          <p className="mt-2 text-sm text-suave">
            La cuenta <span className="text-texto">{session.user.email}</span> no está habilitada en
            Brixx Hub. Pedile a un socio que agregue tu email a la tabla <code>miembros</code>.
          </p>
          <Button className="mt-6" variant="secundario" onClick={salir}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
