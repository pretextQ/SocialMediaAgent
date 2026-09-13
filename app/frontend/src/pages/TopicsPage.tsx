import { useEffect } from 'react'
import { api } from '../api/client'
import { Card, EmptyState, ErrorState, Loading, ReportView, SourceBadge } from '../components'
import { useAccounts } from '../context/AccountContext'
import { useAsync } from '../hooks/useAsync'

export function TopicsPage() {
  const { selected, selectedId } = useAccounts()
  const { data, error, loading, run, reset } = useAsync(
    () => api.recommendTopics(selectedId as string),
    [selectedId],
    false,
  )

  useEffect(() => {
    reset()
  }, [selectedId, reset])

  const topics = data?.recommendation.topics ?? []
  const maxInterest = topics.reduce((max, t) => Math.max(max, t.estimated_interest), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">选题推荐</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            运行 Topic Recommendation 内部能力：候选来自趋势话题或知识库，并与账号已有内容标题硬去重。
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedId || loading}
          onClick={() => void run()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loading ? '生成中…' : '推荐选题'}
        </button>
      </div>

      {!selectedId && <EmptyState title="请先选择账号" />}
      {selectedId && !data && !loading && !error && (
        <EmptyState
          title={'为 ' + (selected?.nickname ?? selectedId) + ' 推荐选题'}
          hint="点击「推荐选题」开始。无趋势话题时会回退到知识库候选。"
        />
      )}
      {loading && <Loading text="正在生成选题…" />}
      {error && <ErrorState error={error} onRetry={() => void run()} notFoundHint="账号不存在。" />}

      {data && !loading && (
        <>
          <Card
            title="推荐选题"
            subtitle={'共 ' + topics.length + ' 个'}
            actions={<SourceBadge source={data.source} />}
          >
            {topics.length === 0 ? (
              <EmptyState
                title="暂无推荐"
                hint="趋势话题与知识库都没有可用候选时会返回空。可先灌入知识库（seed_knowledge）或导入趋势话题。"
              />
            ) : (
              <ul className="space-y-4">
                {topics.map((topic, index) => (
                  <li key={index} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-gray-800">{topic.title}</p>
                      <span className="shrink-0 text-xs text-gray-500">
                        预估兴趣 {topic.estimated_interest}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{
                          width:
                            (maxInterest ? (topic.estimated_interest / maxInterest) * 100 : 0) + '%',
                        }}
                      />
                    </div>
                    {topic.rationale && (
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{topic.rationale}</p>
                    )}
                  </li>
                ))}
              </ul>
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
