import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/layout/Logo'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'
import { ErrorBox } from '../components/ui/ErrorBox'
import { PantallaCarga } from '../components/ui/Spinner'

export function LoginPage() {
  const { session, cargando } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (cargando) return <PantallaCarga />
  if (session) {
    const desde = (location.state as { desde?: string } | null)?.desde
    return <Navigate to={desde && desde !== '/login' ? desde : '/sistemas'} replace />
  }

  const entrar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setAviso(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave })
    setEnviando(false)
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message)
  }

  const recuperar = async () => {
    setError(null)
    setAviso(null)
    if (!email.trim()) {
      setError('Escribí tu email arriba y volvé a tocar "¿Olvidaste tu contraseña?".')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-clave`,
    })
    if (error) setError(error.message)
    else setAviso('Si el email está registrado, te llegó un link para elegir una contraseña nueva.')
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-6">
      {/* Halo de fondo */}
      <div className="pointer-events-none absolute top-[-20%] left-1/2 size-[600px] -translate-x-1/2 rounded-full bg-acento/10 blur-[120px]" />

      <div className="relative w-full max-w-sm animate-aparecer">
        <Logo className="mb-10 justify-center" />
        <div className="rounded-2xl border border-borde bg-superficie/80 p-6 shadow-2xl backdrop-blur">
          <h1 className="text-lg font-semibold">Ingresar</h1>
          <p className="mt-1 text-sm text-suave">Panel interno de brixx.</p>

          <form onSubmit={entrar} className="mt-6 space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={clave}
                onChange={(e) => setClave(e.target.value)}
              />
            </Field>
            {error && <ErrorBox mensaje={error} />}
            {aviso && <p className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">{aviso}</p>}
            <Button type="submit" className="w-full justify-center" disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
          <button
            type="button"
            onClick={recuperar}
            className="mt-4 w-full cursor-pointer text-center text-xs text-tenue hover:text-suave"
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>
    </div>
  )
}
