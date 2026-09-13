import { useState } from 'react'
import { api } from '../api/client'
import { Card, CopyButton, EmptyState, ErrorState, Loading, ReportView, SourceBadge } from '../components'
import { useAsync } from '../hooks/useAsync'

type Mode = 'title' | 'content'

export function TitlesPage() {
  const [mode, setMode] = useState<Mode>('title')
  const [title, setTitle] = useState('')
  const [contentId, setContentId] = useState('')

  const contents = useAsync(() => api.listContents({ limit: 500 }), [])
  const input = mode === 'title' ? { title } : { content_id: contentId }
  const { data, error, loading, run } = useAsync(
    () => api.optimizeTitle(input),
    [mode, title, contentId],
    false,
  )

  const canRun = mode === 'title' ? title.trim().length > 0 : contentId.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">标题优化</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            运行 Title Optimization 内部能力，固定返回 <strong>3 条</strong>优化标题 + 修改说明。支持「已有内容」与「直接粘贴标题」两种模式。
          </p>
        </div>
        <button
          type="button"
          disabled={!canRun || loading}
          onClick={() => void run()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loading ? '优化中…' : '优化标题'}
        </button>
      </div>

      <Card title="输入">
        <div className="mb-3 flex gap-2">
          {(['title', 'content'] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                mode === value
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {value === 'title' ? '直接输入标题' : '选择已有内容'}
            </button>
          ))}
        </div>

        {mode === 'title' ? (
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="粘贴原标题，例如：如何用三步做出爆款短视频"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        ) : (
          <select
            value={contentId}
            disabled={contents.loading}
            onChange={(event) => setContentId(event.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">（请选择内容）</option>
            {(contents.data ?? []).map((content) => (
              <option key={content.canonical_id} value={content.canonical_id}>
                {(content.title ?? content.canonical_id) + ' · ' + content.canonical_id}
              </option>
            ))}
          </select>
        )}
        {contents.error && (
          <p className="mt-2 text-xs text-red-600">
            内容列表加载失败（可改用「直接输入标题」模式）：{contents.error.message}
          </p>
        )}
      </Card>

      {!data && !loading && !error && (
        <EmptyState title="输入标题后点击「优化标题」" hint="契约固定返回 3 条，可直接复制。" />
      )}
      {loading && <Loading text="正在优化标题…" />}
      {error && <ErrorState error={error} onRetry={() => void run()} notFoundHint="内容不存在。" />}

      {data && !loading && (
        <>
          <Card
            title="优化结果"
            subtitle={'原标题：' + data.optimization.original}
            actions={<SourceBadge source={data.source} />}
          >
            <ol className="space-y-3">
              {data.optimization.optimized_titles.map((optimized, index) => (
                <li
                  key={index}
                  className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <p className="text-sm text-gray-800">
                    <span className="mr-2 font-semibold text-blue-600">{index + 1}</span>
                    {optimized}
                  </p>
                  <CopyButton text={optimized} />
                </li>
              ))}
            </ol>
            {data.optimization.explanation && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="mb-1 text-xs font-semibold text-gray-500">修改说明</p>
                <p className="text-sm leading-relaxed text-gray-700">{data.optimization.explanation}</p>
              </div>
            )}
          </Card>

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
