import type { AnalyzeSource } from '../api/types'

/**
 * 输出来源徽标（plan-frontend.md 第四节的「来源透明」规范）。
 *
 * 后端未返回 source 时显示「来源未知」，而不是默认成 LLM —— 不猜。
 */
export function SourceBadge({ source }: { source?: AnalyzeSource }) {
  if (source === 'llm') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
        LLM 生成
      </span>
    )
  }
  if (source === 'rules') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        规则兜底
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
      title="后端未返回 source 字段（需后端补 source: llm|rules）"
    >
      来源未知
    </span>
  )
}
