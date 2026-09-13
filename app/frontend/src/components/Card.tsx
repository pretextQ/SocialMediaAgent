import type { ReactNode } from 'react'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}

export function Card({ title, subtitle, actions, children, className, padded = true }: CardProps) {
  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className ?? ''}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-gray-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'px-4 py-3' : ''}>{children}</div>
    </section>
  )
}
