import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: Error | null
  loading: boolean
}

/**
 * 受控的异步数据加载 hook。
 *
 * - `auto` 为 true 时依赖变化自动执行（用于列表类只读请求）；
 * - Agent 端点耗时数秒，改为手动触发（`auto: false` + 页面按钮调用 run）。
 * - 用自增 requestId 丢弃过期响应，避免慢请求覆盖新结果。
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[], auto = true) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: auto })
  const requestId = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(async (): Promise<T | null> => {
    const id = ++requestId.current
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data = await loaderRef.current()
      if (id === requestId.current) setState({ data, error: null, loading: false })
      return data
    } catch (error) {
      if (id === requestId.current) {
        setState({ data: null, error: error as Error, loading: false })
      }
      return null
    }
  }, [])

  useEffect(() => {
    if (auto) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const reset = useCallback(() => {
    requestId.current++
    setState({ data: null, error: null, loading: false })
  }, [])

  return { ...state, run, reset }
}

/** 把后端 Decimal 字符串安全转成数字（用于展示与图表）。 */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 大数字友好展示：12000 -> 1.2万 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1)}亿`
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(1)}万`
  return String(Math.round(value))
}
