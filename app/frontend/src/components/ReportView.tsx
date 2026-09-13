import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** 统一的 markdown 报告渲染组件（后端所有 report 字段都走这里）。 */
export function ReportView({ markdown, className }: { markdown: string; className?: string }) {
  if (!markdown) return <p className="text-xs text-gray-400">（报告为空）</p>
  return (
    <div className={`report-markdown ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}
