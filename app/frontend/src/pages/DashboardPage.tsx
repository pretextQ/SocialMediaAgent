import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { METRIC_LABELS, PLATFORM_LABELS, SOURCE_LABELS } from '../api/types'
import type { Metric, MetricType } from '../api/types'
import { Card, EmptyState, ErrorState, Loading, SourceBadge, StatCard } from '../components'
import { useAccounts } from '../context/AccountContext'
import { formatCount, toNumber, useAsync } from '../hooks/useAsync'

const METRIC_ORDER: MetricType[] = ['views', 'likes', 'comments', 'shares', 'favorites']

function sumByType(metrics: Metric[], type: MetricType): number {
  return metrics
    .filter((m) => m.metric_type === type)
    .reduce((total, m) => total + toNumber(m.value), 0)
}

export function DashboardPage() {
  const { selected, selectedId, loading: accountsLoading } = useAccounts()
  const contents = useAsync(() => api.listContents({ limit: 500 }), [])
  const metrics = useAsync(() => api.listMetrics({ limit: 1000 }), [])

  if (accountsLoading || contents.loading || metrics.loading) {
    return <Loading text="加载工作台…" />
  }
  if (contents.error) {
    return <ErrorState error={contents.error} onRetry={() => void contents.run()} />
  }
  if (metrics.error) {
    return <ErrorState error={metrics.error} onRetry={() => void metrics.run()} />
  }
  if (!selectedId || !selected) {
    return (
      <EmptyState
        title="暂无账号数据"
        hint="请先导入数据：在 app/backend 下执行 import_csv（手工导入真实数据）或 ingest（自动采集）。"
      />
    )
  }

  const myContents = (contents.data ?? []).filter((c) => c.account_id === selectedId)
  const myMetrics = (metrics.data ?? []).filter((m) => m.account_id === selectedId)
  const sources = Array.from(new Set(myMetrics.map((m) => m.source)))
  const recent = [...myContents]
    .sort((a, b) => (b.publish_time ?? '').localeCompare(a.publish_time ?? ''))
    .slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {selected.nickname ?? selected.canonical_id}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {PLATFORM_LABELS[selected.platform] ?? selected.platform} · {selected.canonical_id} ·{' '}
            {selected.owner_type === 'owner' ? '自有账号' : '观察账号'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <QuickLink to="/strategy" label="诊断与策略" primary />
          <QuickLink to="/topics" label="选题推荐" />
          <QuickLink to="/titles" label="标题优化" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="内容数" value={myContents.length} />
        {METRIC_ORDER.filter((t) => t !== 'views').map((type) => (
          <StatCard
            key={type}
            label={METRIC_LABELS[type]}
            value={formatCount(sumByType(myMetrics, type))}
          />
        ))}
        <StatCard
          label="总播放量"
          value={formatCount(sumByType(myMetrics, 'views'))}
          hint={myContents.length ? `均播 ${formatCount(sumByType(myMetrics, 'views') / myContents.length)}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="最近内容" subtitle="按发布时间倒序，最多 5 条" className="lg:col-span-2">
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">该账号暂无内容</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recent.map((content) => (
                <li key={content.canonical_id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-800">{content.title ?? '（无标题）'}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {content.publish_time?.slice(0, 10) ?? '时间未知'} · {content.content_type}
                    </p>
                  </div>
                  <Link
                    to={`/analysis/${encodeURIComponent(content.canonical_id)}`}
                    className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                  >
                    分析
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="数据来源" subtitle="指标的 source 字段，保证可追溯">
          {sources.length === 0 ? (
            <p className="text-xs text-gray-400">该账号暂无指标</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sources.map((source) => (
                <li key={source} className="flex items-center justify-between">
                  <span className="text-gray-700">{SOURCE_LABELS[source] ?? source}</span>
                  <span className="text-xs text-gray-400">
                    {myMetrics.filter((m) => m.source === source).length} 条
                  </span>
                </li>
              ))}
            </ul>
          )}
          {sources.includes('synthetic') && (
            <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
              该库含<strong>合成演示数据</strong>，仅用于链路验证与演示，不可作为评测依据。
            </p>
          )}
          <div className="mt-3 border-t border-gray-100 pt-3">
            <SourceBadge />
            <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
              Agent 结果会标注输出来自 LLM 还是规则兜底；未配置 LLM_API_KEY 时全部走规则兜底。
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

function QuickLink({ to, label, primary }: { to: string; label: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={`rounded-md px-3 py-1.5 text-xs font-medium ${
        primary
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </Link>
  )
}
