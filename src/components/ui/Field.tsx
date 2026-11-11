import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const BASE =
  'w-full rounded-[10px] border border-borde-fuerte bg-superficie px-3 text-[15px] text-texto placeholder:text-tenue/70 ' +
  'transition-colors focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/30 disabled:opacity-60'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, 'min-h-11', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE, 'min-h-24 py-2.5 leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(BASE, 'min-h-11 pr-8', className)} {...props} />
}

interface FieldProps {
  label: string
  children: ReactNode
  ayuda?: string
  className?: string
}

export function Field({ label, children, ayuda, className }: FieldProps) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {ayuda && <span className="text-[13px] text-tenue">{ayuda}</span>}
    </label>
  )
}
