import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import { BulletList, Card, EmptyState, ErrorState, Loading, ReportView, ScoreGauge, SourceBadge } from '../components'
import { useAsync } from '../hooks/useAsync'

export function ContentAnalysisPage() {
  const { contentId } = useParams<{ contentId?: string }>()
  const [manualId, setManualId] = useState('')
  const targetId = contentId ?? manualId

  const contents = useAsync(() => api.listContents({ limit: 500 }), [])
  const { data, error, loading, run, reset } = useAsync(
    () => api.analyzeContent(targetId),
    [targetId],
    false,
  )

  // 从「数据浏览 / 工作台」点进来（带 :contentId）时自动运行一次
  useEffect(() => {
    if (contentId) void run()
  }, [contentId, run])

  useEffect(() => {
    reset()
  }, [targetId, reset])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">内容分析</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            运行 Content Analysis Agent，输出质量评分、优势、不足与改进建议。可从下方选择已有内容，或直接输入 content_id。
          </p>
        </div>
        <button
          type="button"
          disabled={!targetId || loading}
          onClick={() => void run()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loading ? '分析中…' : '开始分析'}
        </button>
      </div>

      <Card title="选择内容">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={contentId ?? ''}
            disabled={contents.loading}
            onChange={(event) => {
              const value = event.target.value
              setManualId(value)
              if (value) window.history.replaceState(null, '', '/analysis/' + encodeURIComponent(value))
            }}
            className="max-w-xl flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">（从列表选择内容）</option>
            {(contents.data ?? []).map((content) => (
              <option key={content.canonical_id} value={content.canonical_id}>
                {(content.title ?? content.canonical_id) + ' · ' + content.canonical_id}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">或</span>
          <input
            value={manualId}
            onChange={(event) => setManualId(event.target.value)}
            placeholder="输入 content_id，如 bilibili:BV1yyQEBdEZX"
            className="w-80 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      </Card>

      {!targetId && <EmptyState title="请选择一条内容" hint="也可以从「数据浏览」页点击内容进入。" />}
      {loading && <Loading text="Agent 正在分析内容…" />}
      {error && <ErrorState error={error} onRetry={() => void run()} notFoundHint="内容不存在，请确认 content_id 正确。" />}

      {data && !loading && (
        <>
          <Card
            title={data.analysis.title ?? targetId}
            subtitle={'content_id: ' + data.analysis.content_id}
            actions={<SourceBadge source={data.source} />}
          >
            <div className="flex flex-wrap items-start gap-6">
              <ScoreGauge score={data.analysis.quality_score} label="质量分" />
              <div className="min-w-64 flex-1">
                <p className="mb-2 text-xs font-semibold text-gray-500">摘要</p>
                <p className="text-sm leading-relaxed text-gray-700">{data.analysis.summary || '（无）'}</p>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="优势"><BulletList items={data.analysis.strengths} tone="positive" /></Card>
            <Card title="不足"><BulletList items={data.analysis.weaknesses} tone="negative" /></Card>
            <Card title="改进建议"><BulletList items={data.analysis.suggestions} tone="action" /></Card>
          </div>

          <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-800">
              原始 Markdown 报告
            </summary>
            <div className="border-t border-gray-100 px-4 py-3">
              <ReportView markdown={data.report} />
            </div>
          </details>
        </>
      )}
    </div>
  )
}
