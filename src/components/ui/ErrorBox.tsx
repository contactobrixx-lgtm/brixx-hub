import { AlertTriangle } from 'lucide-react'

export function ErrorBox({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex items-start gap-2 rounded-[10px] bg-peligro-tenue px-3.5 py-3 text-sm text-peligro">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{mensaje}</span>
    </div>
  )
}
