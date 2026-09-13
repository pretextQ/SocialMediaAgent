import type { ReactNode } from 'react'

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <div className="mt-1 max-w-xl text-xs leading-relaxed text-gray-500">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
