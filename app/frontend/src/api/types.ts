/**
 * 后端领域模型与 Agent 输出契约的 TypeScript 映射。
 *
 * 类型来源：docs/api.md + 后端各 agents/ * /schemas.py（逐字段核对，非照抄文档）。
 * 字段命名与后端 JSON 完全一致（snake_case），不做转换，避免隐式口径漂移。
 */

export type Platform =
  | 'douyin'
  | 'xiaohongshu'
  | 'bilibili'
  | 'kuaishou'
  | 'channels'
  | 'weibo'
  | 'zhihu'
  | 'tieba'

export type OwnerType = 'owner' | 'observed'
export type ContentType = 'video' | 'image' | 'article' | 'note'
export type MetricType = 'views' | 'likes' | 'comments' | 'shares' | 'favorites'
export type MetricSource = 'mediacrawler' | 'matrixflow' | 'official_api' | 'manual' | 'synthetic'

export const PLATFORM_LABELS: Record<Platform, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  bilibili: 'B站',
  kuaishou: '快手',
  channels: '视频号',
  weibo: '微博',
  zhihu: '知乎',
  tieba: '贴吧',
}

export const METRIC_LABELS: Record<MetricType, string> = {
  views: '播放',
  likes: '点赞',
  comments: '评论',
  shares: '分享',
  favorites: '收藏',
}

/** Agent 角色显示名（与后端 LLM_MODEL_<ROLE> 的角色名一一对应） */
export const ROLE_LABELS: Record<string, string> = {
  account_strategy: '账号诊断与策略',
  content_analysis: '内容分析',
  trend_analysis: '趋势分析',
  topic_recommendation: '选题推荐',
  title_optimization: '标题优化',
}

export const SOURCE_LABELS: Record<MetricSource, string> = {
  mediacrawler: '采集',
  matrixflow: '自有账号',
  official_api: '官方 API',
  manual: '手工导入',
  synthetic: '合成（演示）',
}

/* ── 领域模型 ───────────────────────────────────────────── */

export interface Account {
  id: string
  canonical_id: string
  platform: Platform
  platform_id: string
  nickname: string | null
  avatar_url: string | null
  owner_type: OwnerType
  extra: Record<string, unknown>
}

export interface Content {
  id: string
  canonical_id: string
  platform: Platform
  platform_content_id: string
  account_id: string | null
  title: string | null
  content: string | null
  content_type: ContentType
  publish_time: string | null
  url: string | null
  raw_metadata: Record<string, unknown>
}

export interface Metric {
  id: string
  content_id: string | null
  account_id: string | null
  platform: Platform
  metric_type: MetricType
  /** 后端用 Decimal 序列化为字符串，保留精度（如 "12000.0000"） */
  value: string
  captured_at: string
  source: MetricSource
  raw_value: string | null
}

/* ── Agent 输出契约 ─────────────────────────────────────── */

/** 结果实际由 LLM 生成还是规则兜底（plan-frontend.md 第五节「来源透明」） */
export type AnalyzeSource = 'llm' | 'rules'

export interface DiagnosisOutput {
  account_health: number
  strengths: string[]
  weaknesses: string[]
  anomalies: string[]
  recommendations: string[]
}

export interface AccountStrategyOutput extends DiagnosisOutput {
  account_id: string
  strategy_summary: string
  weekly_plan: string[]
  kpis: string[]
  risks: string[]
}

export interface ContentAnalysisOutput {
  content_id: string
  title: string | null
  summary: string
  quality_score: number
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
}

export interface TrendTopic {
  keyword: string
  title: string | null
  post_count: number
}

export interface TrendAnalysisOutput {
  platform: string
  period: number
  topics: TrendTopic[]
  trend_score: number
  insights: string[]
}

export interface RecommendedTopic {
  title: string
  rationale: string
  estimated_interest: number
}

export interface TopicRecommendationOutput {
  account_id: string
  topics: RecommendedTopic[]
}

export interface TitleOptimizationOutput {
  original: string
  /** 契约固定 3 条 */
  optimized_titles: string[]
  explanation: string
}

export interface MemorySaved {
  memory_id: string
  account_id: string
}

/* ── Agent 端点响应封装（均带 source 字段；旧后端缺该字段时按 undefined 处理） ── */

export interface DiagnosisResponse {
  diagnosis: DiagnosisOutput
  report: string
  source?: AnalyzeSource
}

export interface StrategyResponse {
  strategy: AccountStrategyOutput
  report: string
  memory_saved: MemorySaved | null
  source?: AnalyzeSource
}

export interface ContentAnalysisResponse {
  analysis: ContentAnalysisOutput
  report: string
  source?: AnalyzeSource
}

export interface TrendAnalysisResponse {
  analysis: TrendAnalysisOutput
  report: string
  source?: AnalyzeSource
}

export interface TopicRecommendationResponse {
  recommendation: TopicRecommendationOutput
  report: string
  source?: AnalyzeSource
}

export interface TitleOptimizationResponse {
  optimization: TitleOptimizationOutput
  report: string
  source?: AnalyzeSource
}

/* ── 系统状态与周报（plan-frontend.md 第五节的后端配套） ────── */

export interface ReportListItem {
  name: string
  size: number
  modified_at: string
}

export interface ReportListResponse {
  reports: ReportListItem[]
}

export interface ReportDetail {
  name: string
  content: string
}

export interface SystemStatus {
  llm_configured: boolean
  llm_model: string
  /** 已显式配置的「角色 -> 模型」覆盖；未配置的角色不出现在这里，回落 llm_model */
  llm_model_overrides: Record<string, string>
  /** LLM 熔断器状态（进程内存，单实例视角）；未注入 gateway 时为 null */
  llm_circuit_state: string | null
  llm_circuit_failures: number | null
  llm_base_url: string
  database_url: string
  memory_database_url: string
  knowledge_store_path: string
  knowledge_doc_count: number
  memory_entry_count: number
  account_count: number
  content_count: number
  metric_count: number
  topic_count: number
  report_dir: string
  report_count: number
}
