import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from './cn'

const BASE =
  'w-full rounded-lg border border-borde bg-fondo px-3 text-sm text-texto placeholder:text-tenue ' +
  'transition-colors focus:border-acento/60 focus:outline-none focus:ring-2 focus:ring-acento/20 disabled:opacity-60'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(BASE, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(BASE, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(BASE, 'h-10 pr-8', className)} {...props} />
}

interface FieldProps {
  label: string
  children: ReactNode
  ayuda?: string
  className?: string
}

export function Field({ label, children, ayuda, className }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-suave">{label}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-tenue">{ayuda}</span>}
    </label>
  )
}
