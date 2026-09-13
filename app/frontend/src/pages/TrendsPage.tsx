import { useState } from 'react'
import { api } from '../api/client'
import { DIRECTION_LABELS, PLATFORM_LABELS } from '../api/types'
import type { Platform, TrendDirection } from '../api/types'
import { BulletList, Card, EmptyState, ErrorState, Loading, ReportView, ScoreGauge, SourceBadge } from '../components'
import { useAsync } from '../hooks/useAsync'

const PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[]

/** 演变方向的样式；rising/fading 用语义色，stable 与 new 保持中性。 */
const DIRECTION_STYLES: Record<TrendDirection, string> = {
  rising: 'rounded-full bg-green-50 px-1.5 py-0.5 font-medium text-green-700',
  fading: 'rounded-full bg-red-50 px-1.5 py-0.5 font-medium text-red-700',
  stable: 'rounded-full bg-gray-100 px-1.5 py-0.5 text-gray-600',
  new: 'rounded-full bg-blue-50 px-1.5 py-0.5 text-blue-700',
}

export function TrendsPage() {
  const [platform, setPlatform] = useState<Platform>('bilibili')
  const [period, setPeriod] = useState(7)
  const { data, error, loading, run } = useAsync(
    () => api.analyzeTrends(platform, period),
    [platform, period],
    false,
  )

  const topics = data ? [...data.analysis.topics].sort((a, b) => b.post_count - a.post_count) : []
  const maxCount = topics.reduce((max, t) => Math.max(max, t.post_count), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">趋势分析</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            运行 Trend Analysis Agent。话题一律以数据库 Topic 事实为准（LLM 只做洞察，不得编造话题）。
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void run()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? '分析中…' : '开始分析'}
        </button>
      </div>

      <Card title="参数">
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            平台
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value as Platform)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm text-gray-600">
            周期
            <input
              type="range"
              min={1}
              max={90}
              value={period}
              onChange={(event) => setPeriod(Number(event.target.value))}
              className="w-48"
            />
            <span className="w-16 text-xs text-gray-500">{period} 天</span>
          </label>
        </div>
      </Card>

      {!data && !loading && !error && (
        <EmptyState
          title="点击「开始分析」查看平台趋势"
          hint="注意：真实公开数据集里 topics=0，此页会返回空话题；合成 demo 库（5 个话题）才有内容。"
        />
      )}
      {loading && <Loading text="Agent 正在分析趋势…" />}
      {error && <ErrorState error={error} onRetry={() => void run()} />}

      {data && !loading && (
        <>
          <Card
            title="趋势概览"
            subtitle={data.analysis.platform + ' · 近 ' + data.analysis.period + ' 天'}
            actions={<SourceBadge source={data.source} />}
          >
            <div className="flex flex-wrap items-center gap-6">
              <ScoreGauge score={data.analysis.trend_score} label="趋势分" />
              <div className="min-w-64 flex-1">
                <p className="mb-2 text-xs font-semibold text-gray-500">洞察</p>
                <BulletList items={data.analysis.insights} tone="action" />
              </div>
            </div>
          </Card>

          <Card title="热门话题" subtitle={'共 ' + topics.length + ' 个（按发布量倒序）'}>
            {topics.length === 0 ? (
              <EmptyState
                title="该周期无趋势话题"
                hint="Trend 话题来自数据库 topics 表。真实数据未含话题；可用 seed/generate_demo_data.py 生成 demo 话题后导入独立 demo 库。"
              />
            ) : (
              <ul className="space-y-3">
                {topics.map((topic) => (
                  <li key={topic.keyword}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-gray-800">{topic.keyword}</span>
                      <span className="flex shrink-0 items-baseline gap-2 text-xs text-gray-500">
                        <span>{topic.post_count} 条</span>
                        {topic.direction ? (
                          <span className={DIRECTION_STYLES[topic.direction]}>
                            {DIRECTION_LABELS[topic.direction]}
                            {topic.change_pct !== null &&
                              ` ${topic.change_pct > 0 ? '+' : ''}${topic.change_pct}%`}
                          </span>
                        ) : (
                          <span
                            className="text-gray-400"
                            title="该话题尚无历史观测；上升/消退需要多次导入积累观测后才能判断"
                          >
                            方向未知
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: (maxCount ? (topic.post_count / maxCount) * 100 : 0) + '%' }}
                      />
                    </div>
                    {topic.title && <p className="mt-1 text-xs text-gray-400">{topic.title}</p>}
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
