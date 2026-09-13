import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { Card, EmptyState, ErrorState, Loading, PageHeader, ReportView } from '../components'
import { useAsync } from '../hooks/useAsync'

export function ReportsPage() {
  const list = useAsync(() => api.listReports(), [])
  const [selected, setSelected] = useState<string | null>(null)
  const detail = useAsync(() => api.getReport(selected as string), [selected], false)

  // 列表加载完成后默认选中第一篇
  useEffect(() => {
    if (!selected && list.data && list.data.reports.length > 0) {
      setSelected(list.data.reports[0].name)
    }
  }, [list.data, selected])

  useEffect(() => {
    if (selected) void detail.run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  return (
    <div className="space-y-5">
      <PageHeader
        title="运营周报"
        description="由 APScheduler 每周一 09:00 生成并落盘为 Markdown。此处只读展示。"
        actions={
          <button
            type="button"
            onClick={() => void list.run()}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            刷新
          </button>
        }
      />

      {list.loading && <Loading />}
      {list.error && (
        <ErrorState
          error={list.error}
          onRetry={() => void list.run()}
          notFoundHint="后端尚未提供 GET /api/v1/reports。"
        />
      )}

      {list.data && (
        <div className="grid gap-4 lg:grid-cols-4">
          <Card title="周报文件" subtitle={list.data.reports.length + ' 篇'} className="lg:col-span-1">
            {list.data.reports.length === 0 ? (
              <p className="py-4 text-xs text-gray-400">
                暂无周报。调度任务未手动触发过，或该实例的 DB 中没有账号。
              </p>
            ) : (
              <ul className="space-y-1">
                {list.data.reports.map((report) => (
                  <li key={report.name}>
                    <button
                      type="button"
                      onClick={() => setSelected(report.name)}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                        selected === report.name
                          ? 'bg-blue-50 font-medium text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block truncate">{report.name}</span>
                      <span className="text-[11px] text-gray-400">
                        {report.modified_at.slice(0, 19).replace('T', ' ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={selected ?? '周报内容'} className="lg:col-span-3">
            {detail.loading && <Loading text="加载周报…" />}
            {detail.error && <ErrorState error={detail.error} onRetry={() => void detail.run()} />}
            {!selected && !detail.loading && (
              <EmptyState title="请选择一篇周报" hint="左侧列表为空时，先触发一次周报生成。" />
            )}
            {detail.data && !detail.loading && <ReportView markdown={detail.data.content} />}
          </Card>
        </div>
      )}
    </div>
  )
}
