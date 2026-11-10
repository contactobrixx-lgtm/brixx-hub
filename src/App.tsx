import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { NuevaClavePage } from './pages/NuevaClavePage'
import { FichasPage } from './pages/FichasPage'
import { VisorPage } from './pages/VisorPage'
import { PipelinePage } from './pages/PipelinePage'
import { supabaseConfigurado } from './lib/supabase'

export default function App() {
  if (!supabaseConfigurado) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold">Falta configurar Supabase</h1>
          <p className="mt-2 text-sm text-suave">
            Definí <code className="text-acento">VITE_SUPABASE_URL</code> y{' '}
            <code className="text-acento">VITE_SUPABASE_ANON_KEY</code> en las variables de entorno (en Vercel:
            Settings → Environment Variables) y volvé a desplegar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/nueva-clave"
        element={
          <RequireAuth>
            <NuevaClavePage />
          </RequireAuth>
        }
      />
      <Route
        path="/ver/:id"
        element={
          <RequireAuth>
            <VisorPage />
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/sistemas" element={<FichasPage seccion="sistema" />} />
        <Route path="/demos" element={<FichasPage seccion="demo" />} />
        <Route path="/pipeline" element={<PipelinePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/sistemas" replace />} />
    </Routes>
  )
}
