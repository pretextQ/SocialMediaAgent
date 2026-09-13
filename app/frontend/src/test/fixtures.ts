import type { Account, Content, Metric, SystemStatus } from '../api/types'

export const ACCOUNT: Account = {
  id: 'a1',
  canonical_id: 'bilibili:1',
  platform: 'bilibili',
  platform_id: '1',
  nickname: '测试账号',
  avatar_url: null,
  owner_type: 'observed',
  extra: {},
}

export const CONTENT: Content = {
  id: 'c1',
  canonical_id: 'bilibili:BV1',
  platform: 'bilibili',
  platform_content_id: 'BV1',
  account_id: 'bilibili:1',
  title: '测试内容标题',
  content: '正文',
  content_type: 'video',
  publish_time: '2026-01-01T00:00:00Z',
  url: 'https://example.com/v',
  raw_metadata: {},
}

export const METRIC: Metric = {
  id: 'm1',
  content_id: 'bilibili:BV1',
  account_id: 'bilibili:1',
  platform: 'bilibili',
  metric_type: 'views',
  value: '12000.0000',
  captured_at: '2026-01-02T00:00:00Z',
  source: 'manual',
  raw_value: '1.2万',
}

export const STATUS: SystemStatus = {
  llm_configured: true,
  llm_model: 'deepseek-flash',
  llm_base_url: 'https://api.deepseek.com/v1',
  database_url: 'sqlite:///data/sma.db',
  memory_database_url: 'sqlite:///data/sma_memory.db',
  knowledge_store_path: 'data/knowledge/knowledge.index',
  knowledge_doc_count: 4,
  memory_entry_count: 2,
  account_count: 1,
  content_count: 1,
  metric_count: 5,
  topic_count: 0,
  report_dir: 'data/reports',
  report_count: 0,
}
