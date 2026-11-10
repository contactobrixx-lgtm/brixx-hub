import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Logo } from '../components/layout/Logo'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'
import { ErrorBox } from '../components/ui/ErrorBox'

export function NuevaClavePage() {
  const navigate = useNavigate()
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (clave.length < 8) return setError('La contraseña tiene que tener al menos 8 caracteres.')
    if (clave !== repetir) return setError('Las contraseñas no coinciden.')
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password: clave })
    setGuardando(false)
    if (error) setError(error.message)
    else navigate('/sistemas', { replace: true })
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm animate-aparecer">
        <Logo className="mb-10 justify-center" />
        <div className="rounded-2xl border border-borde bg-superficie p-6">
          <Link to="/sistemas" className="mb-4 inline-flex items-center gap-1 text-xs text-tenue hover:text-suave">
            <ArrowLeft className="size-3.5" /> Volver al hub
          </Link>
          <h1 className="text-lg font-semibold">Nueva contraseña</h1>
          <form onSubmit={guardar} className="mt-6 space-y-4">
            <Field label="Contraseña nueva" ayuda="Mínimo 8 caracteres.">
              <Input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} />
            </Field>
            <Field label="Repetir contraseña">
              <Input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
            </Field>
            {error && <ErrorBox mensaje={error} />}
            <Button type="submit" className="w-full justify-center" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar contraseña'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
