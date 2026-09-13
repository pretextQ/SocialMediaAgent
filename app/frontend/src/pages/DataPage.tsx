import { useState } from 'react'
import { api } from '../api/client'
import { METRIC_LABELS, PLATFORM_LABELS, SOURCE_LABELS } from '../api/types'
import type { Platform } from '../api/types'
import { Card, ErrorState, Loading, PageHeader } from '../components'
import { formatCount, useAsync } from '../hooks/useAsync'

const PLATFORMS = Object.keys(PLATFORM_LABELS) as Platform[]

export function DataPage() {
  const [platform, setPlatform] = useState<string>('')
  const accounts = useAsync(() => api.listAccounts({ platform: platform || undefined, limit: 500 }), [platform])
  const contents = useAsync(() => api.listContents({ platform: platform || undefined, limit: 500 }), [platform])
  const metrics = useAsync(() => api.listMetrics({ limit: 1000 }), [])

  const loading = accounts.loading || contents.loading || metrics.loading
  const error = accounts.error ?? contents.error ?? metrics.error

  return (
    <div className="space-y-5">
      <PageHeader
        title="数据浏览"
        description="只读视图：账号、内容与指标明细。数据经 CLI（import_csv / ingest）入库，HTTP 无写入端点。"
        actions={
          <label className="flex items-center gap-2 text-xs text-gray-500">
            平台
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            >
              <option value="">全部</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {loading && <Loading />}
      {!loading && error && (
        <ErrorState
          error={error}
          onRetry={() => {
            void accounts.run()
            void contents.run()
            void metrics.run()
          }}
        />
      )}

      {!loading && !error && (
        <>
          <Card title="账号" subtitle={`${accounts.data?.length ?? 0} 个`} padded={false}>
            <Table
              head={['账号', '平台', 'canonical_id', '类型']}
              rows={(accounts.data ?? []).map((a) => [
                a.nickname ?? '（无昵称）',
                PLATFORM_LABELS[a.platform] ?? a.platform,
                a.canonical_id,
                a.owner_type === 'owner' ? '自有' : '观察',
              ])}
            />
          </Card>

          <Card title="内容" subtitle={`${contents.data?.length ?? 0} 条`} padded={false}>
            <Table
              head={['标题', '所属账号', '类型', '发布时间', '原文']}
              rows={(contents.data ?? []).map((c) => [
                c.title ?? '（无标题）',
                c.account_id ?? '-',
                c.content_type,
                c.publish_time?.slice(0, 10) ?? '-',
                c.url ? '有' : '-',
              ])}
            />
          </Card>

          <Card
            title="指标明细"
            subtitle={`${metrics.data?.length ?? 0} 条（同一指标为最新快照，非时间序列）`}
            padded={false}
          >
            <Table
              head={['内容', '指标', '数值', '原始值', '来源', '采集时间']}
              rows={(metrics.data ?? []).slice(0, 200).map((m) => [
                m.content_id ?? '-',
                METRIC_LABELS[m.metric_type] ?? m.metric_type,
                formatCount(Number(m.value)),
                m.raw_value ?? '-',
                SOURCE_LABELS[m.source] ?? m.source,
                m.captured_at.slice(0, 19).replace('T', ' '),
              ])}
            />
            {(metrics.data?.length ?? 0) > 200 && (
              <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
                仅展示前 200 条（共 {metrics.data?.length} 条）
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-gray-400">暂无数据</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`px-4 py-2 ${cellIndex === 0 ? 'max-w-md truncate text-gray-800' : 'text-gray-600'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
