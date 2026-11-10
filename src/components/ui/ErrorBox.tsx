import { AlertTriangle } from 'lucide-react'

export function ErrorBox({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-peligro/30 bg-peligro/10 px-3 py-2.5 text-sm text-peligro">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{mensaje}</span>
    </div>
  )
}
