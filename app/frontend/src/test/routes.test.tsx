import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { ACCOUNT, CONTENT, METRIC, STATUS } from './fixtures'

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    json: async () => body,
  } as unknown as Response
}

function resolveBody(url: string): unknown {
  if (url.includes('/system/status')) return STATUS
  if (url.includes('/reports')) return { reports: [] }
  if (url.includes('/metrics')) return [METRIC]
  if (url.includes('/contents')) return [CONTENT]
  if (url.includes('/accounts')) return [ACCOUNT]
  throw new Error('未预期的请求：' + url)
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return json(resolveBody(url))
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('路由渲染冒烟测试', () => {
  const cases: { path: string; expectText: string; label: string }[] = [
    { path: '/', expectText: '最近内容', label: '工作台' },
    { path: '/data', expectText: '原始值', label: '数据浏览' },
    { path: '/strategy', expectText: '开始分析', label: '账号诊断与策略' },
    { path: '/analysis', expectText: '选择内容', label: '内容分析' },
    { path: '/trends', expectText: '点击「开始分析」查看平台趋势', label: '趋势分析' },
    { path: '/topics', expectText: '推荐选题', label: '选题推荐' },
    { path: '/titles', expectText: '直接输入标题', label: '标题优化' },
    { path: '/reports', expectText: '周报文件', label: '运营周报' },
    { path: '/settings', expectText: '能力规模', label: '系统状态' },
    { path: '/does-not-exist', expectText: '页面不存在', label: '404 兜底' },
  ]

  for (const item of cases) {
    it(`${item.label} (${item.path}) 能渲染且不抛错`, async () => {
      renderAt(item.path)
      expect(await screen.findByText(item.expectText)).toBeInTheDocument()
    })
  }

  it('工作台展示账号昵称与指标合计（Decimal 字符串被正确解析）', async () => {
    renderAt('/')
    expect(await screen.findByText('测试账号')).toBeInTheDocument()
    // 12000 -> 1.2万
    expect(await screen.findByText('1.2万')).toBeInTheDocument()
  })
})
