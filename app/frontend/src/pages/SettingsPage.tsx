import { api } from '../api/client'
import { Card, ErrorState, Loading, PageHeader, StatCard } from '../components'
import { useAsync } from '../hooks/useAsync'

export function SettingsPage() {
  const { data, error, loading, run } = useAsync(() => api.getSystemStatus(), [])

  return (
    <div className="space-y-5">
      <PageHeader
        title="系统状态"
        description="只读状态：LLM 是否配置、知识库/Memory 规模、库路径与周报目录。用于判断当前结果来自 LLM 还是规则兜底。"
        actions={
          <button
            type="button"
            onClick={() => void run()}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            刷新
          </button>
        }
      />

      {loading && <Loading />}
      {error && (
        <ErrorState
          error={error}
          onRetry={() => void run()}
          notFoundHint="后端尚未提供 GET /api/v1/system/status。"
        />
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="LLM 链路"
              value={data.llm_configured ? '已启用' : '规则兜底'}
              tone={data.llm_configured ? 'good' : 'warn'}
              hint={data.llm_configured ? data.llm_model : '未配置 LLM_API_KEY'}
            />
            <StatCard label="账号" value={data.account_count} />
            <StatCard label="内容" value={data.content_count} />
            <StatCard label="指标" value={data.metric_count} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="能力规模">
              <dl className="divide-y divide-gray-100 text-sm">
                <Row label="趋势话题" value={data.topic_count + ' 个'} />
                <Row label="知识库文档" value={data.knowledge_doc_count + ' 篇'} />
                <Row label="Memory 条目" value={data.memory_entry_count + ' 条'} />
                <Row label="周报文件" value={data.report_count + ' 篇'} />
              </dl>
              {data.topic_count === 0 && (
                <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                  趋势话题为 0：真实公开数据未含 Topic，因此「趋势分析」页会返回空话题集。
                </p>
              )}
            </Card>

            <Card title="端点与路径">
              <dl className="divide-y divide-gray-100 text-sm">
                <Row label="LLM 模型" value={data.llm_model} />
                <Row label="LLM Base URL" value={data.llm_base_url} mono />
                <Row label="核心库" value={data.database_url} mono />
                <Row label="Memory 库" value={data.memory_database_url} mono />
                <Row label="知识库索引" value={data.knowledge_store_path} mono />
                <Row label="周报目录" value={data.report_dir} mono />
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className={`break-all text-right text-gray-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
