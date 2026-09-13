export function Loading({ text = '加载中…' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-gray-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      {text}
    </div>
  )
}
