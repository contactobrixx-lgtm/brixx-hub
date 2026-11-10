import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Miembro } from '../types/db'

interface AuthState {
  session: Session | null
  /** null = logueado pero su email no está en la tabla miembros */
  miembro: Miembro | null
  cargando: boolean
  salir: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [miembro, setMiembro] = useState<Miembro | null>(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)
  const [cargandoMiembro, setCargandoMiembro] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCargandoSesion(false)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      setSession(nueva)
      // Llegó desde el link de "olvidé mi contraseña"
      if (evento === 'PASSWORD_RECOVERY') navigate('/nueva-clave')
    })
    return () => data.subscription.unsubscribe()
  }, [navigate])

  const email = session?.user.email ?? null
  useEffect(() => {
    if (!email) {
      setMiembro(null)
      return
    }
    let cancelado = false
    setCargandoMiembro(true)
    supabase
      .from('miembros')
      .select('email, nombre')
      .ilike('email', email)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setMiembro(data ?? null)
        setCargandoMiembro(false)
      })
    return () => {
      cancelado = true
    }
  }, [email])

  const salir = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <AuthContext.Provider
      value={{ session, miembro, cargando: cargandoSesion || cargandoMiembro, salir }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
