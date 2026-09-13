/**
 * 后端接口封装（原生 fetch）。
 *
 * - 基址默认 `/api/v1`，由 Vite dev proxy 转发（免 CORS）。
 * - 错误统一抛 ApiError，页面据此区分 404（资源不存在）与其它错误。
 */
import type {
  Account,
  AccountStrategyOutput,
  Content,
  ContentAnalysisResponse,
  DiagnosisResponse,
  Metric,
  ReportDetail,
  ReportListResponse,
  StrategyResponse,
  SystemStatus,
  TitleOptimizationResponse,
  TopicRecommendationResponse,
  TrendAnalysisResponse,
} from './types'

const BASE: string = import.meta.env.VITE_API_BASE ?? '/api/v1'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch (error) {
    throw new ApiError(0, `无法连接后端（${BASE}）：${String(error)}`)
  }

  if (!response.ok) {
    let detail = response.statusText || `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (body && typeof body.detail === 'string') detail = body.detail
    } catch {
      /* 响应体不是 JSON，沿用 statusText */
    }
    throw new ApiError(response.status, detail)
  }
  return (await response.json()) as T
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
}

export const api = {
  /* 数据查询 */
  listAccounts: (params: { platform?: string; limit?: number } = {}) =>
    request<Account[]>(`/accounts${query(params)}`),
  getAccount: (accountId: string) => request<Account>(`/accounts/${encodeURIComponent(accountId)}`),
  listContents: (params: { platform?: string; limit?: number } = {}) =>
    request<Content[]>(`/contents${query(params)}`),
  getContent: (contentId: string) =>
    request<Content>(`/contents/${encodeURIComponent(contentId)}`),
  listMetrics: (
    params: { content_id?: string; metric_type?: string; limit?: number } = {},
  ) => request<Metric[]>(`/metrics${query(params)}`),

  /* Agent 能力 */
  diagnosis: (accountId: string) =>
    post<DiagnosisResponse>(`/accounts/${encodeURIComponent(accountId)}/diagnosis`),
  strategy: (accountId: string) =>
    post<StrategyResponse>(`/accounts/${encodeURIComponent(accountId)}/strategy`),
  analyzeContent: (contentId: string) =>
    post<ContentAnalysisResponse>(`/contents/${encodeURIComponent(contentId)}/analysis`),
  analyzeTrends: (platform: string, period: number) =>
    post<TrendAnalysisResponse>('/trends/analysis', { platform, period }),
  recommendTopics: (accountId: string) =>
    post<TopicRecommendationResponse>(
      `/accounts/${encodeURIComponent(accountId)}/topic-recommendation`,
    ),
  optimizeTitle: (input: { content_id?: string; title?: string }) =>
    post<TitleOptimizationResponse>('/titles/optimize', input),

  /* 系统状态与周报 */
  getSystemStatus: () => request<SystemStatus>('/system/status'),
  listReports: () => request<ReportListResponse>('/reports'),
  getReport: (name: string) => request<ReportDetail>(`/reports/${encodeURIComponent(name)}`),
}

export type { AccountStrategyOutput }
