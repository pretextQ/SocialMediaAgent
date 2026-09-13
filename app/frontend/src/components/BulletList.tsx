export type BulletTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'action'

const TONE_STYLES: Record<BulletTone, string> = {
  neutral: 'text-gray-700',
  positive: 'text-green-700',
  negative: 'text-red-700',
  warning: 'text-amber-700',
  action: 'text-blue-700',
}

const TONE_DOTS: Record<BulletTone, string> = {
  neutral: 'bg-gray-400',
  positive: 'bg-green-500',
  negative: 'bg-red-500',
  warning: 'bg-amber-500',
  action: 'bg-blue-500',
}

export function BulletList({
  items,
  tone = 'neutral',
  emptyText = '（无）',
}: {
  items: string[]
  tone?: BulletTone
  emptyText?: string
}) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-gray-400">{emptyText}</p>
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm leading-relaxed">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOTS[tone]}`} />
          <span className={TONE_STYLES[tone]}>{item}</span>
        </li>
      ))}
    </ul>
  )
}
