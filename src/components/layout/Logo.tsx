export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#18181d" />
        <rect x="7" y="7" width="8" height="8" rx="2" fill="#a78bfa" />
        <rect x="17" y="7" width="8" height="8" rx="2" fill="#a78bfa" opacity=".55" />
        <rect x="7" y="17" width="8" height="8" rx="2" fill="#a78bfa" opacity=".55" />
        <rect x="17" y="17" width="8" height="8" rx="2" fill="#a78bfa" opacity=".3" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        brixx <span className="font-normal text-tenue">hub</span>
      </span>
    </div>
  )
}
