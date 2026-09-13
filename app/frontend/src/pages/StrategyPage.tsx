import { useEffect } from 'react'
import { api } from '../api/client'
import { BulletList, Card, EmptyState, ErrorState, Loading, ReportView, ScoreGauge, SourceBadge } from '../components'
import { useAccounts } from '../context/AccountContext'
import { useAsync } from '../hooks/useAsync'

export function StrategyPage() {
  const { selected, selectedId } = useAccounts()
  const { data, error, loading, run, reset } = useAsync(
    () => api.strategy(selectedId as string),
    [selectedId],
    false,
  )

  // 切换账号时清空上一次结果，避免把 A 账号的结论看成 B 账号的
  useEffect(() => {
    reset()
  }, [selectedId, reset])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">账号诊断与策略</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            运行 Account Strategy Agent（gather → analyze → persist → report）：
            基于数据库事实输出健康度、优势/不足/异常/建议、周计划、KPI 与风险，并把策略摘要写入 Memory（读-写闭环）。
          </p>
        </div>
        <button
          type="button"
          disabled={!selectedId || loading}
          onClick={() => void run()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {loading ? '分析中…（LLM 可能需数秒）' : '开始分析'}
        </button>
      </div>

      {!selectedId && <EmptyState title="请先选择账号" hint="顶部账号选择器为空，请先导入数据。" />}

      {selectedId && !data && !loading && !error && (
        <EmptyState
          title={'点击「开始分析」运行 ' + (selected?.nickname ?? selectedId)}
          hint="该操作是同步长请求：配置了 LLM 时由模型生成，未配置或失败时自动回退确定性规则。结果会标注来源。"
        />
      )}

      {loading && <Loading text="Agent 正在分析…" />}
      {error && <ErrorState error={error} onRetry={() => void run()} notFoundHint="账号不存在，请确认已在库中。" />}

      {data && !loading && (
        <>
          <Card
            title="账号健康度"
            subtitle={'策略摘要：' + data.strategy.strategy_summary}
            actions={
              <>
                <SourceBadge source={data.source} />
                {data.memory_saved && (
                  <span
                    className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                    title={'memory_id: ' + data.memory_saved.memory_id}
                  >
                    已沉淀到 Memory
                  </span>
                )}
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-6">
              <ScoreGauge score={data.strategy.account_health} label="健康度" />
              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                <Section title="优势" tone="positive" items={data.strategy.strengths} />
                <Section title="不足" tone="negative" items={data.strategy.weaknesses} />
                <Section title="异常" tone="warning" items={data.strategy.anomalies} />
                <Section title="建议" tone="action" items={data.strategy.recommendations} />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="周计划"><BulletList items={data.strategy.weekly_plan} /></Card>
            <Card title="KPI"><BulletList items={data.strategy.kpis} /></Card>
            <Card title="风险"><BulletList items={data.strategy.risks} tone="warning" /></Card>
          </div>

          <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-800">
              原始 Markdown 报告（后端确定性渲染）
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

function Section({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'positive' | 'negative' | 'warning' | 'action'
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-gray-500">{title}</p>
      <BulletList items={items} tone={tone} />
    </div>
  )
}
