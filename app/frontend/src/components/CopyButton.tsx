import { useState } from 'react'

export function CopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 剪贴板 API 在非安全上下文可能不可用：降级为选中提示，不静默失败
      window.prompt('复制失败，请手动复制：', text)
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
    >
      {copied ? '已复制' : label}
    </button>
  )
}
