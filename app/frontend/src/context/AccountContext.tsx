import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../api/client'
import type { Account } from '../api/types'

const STORAGE_KEY = 'sma.selectedAccountId'

interface AccountContextValue {
  accounts: Account[]
  loading: boolean
  error: Error | null
  selectedId: string | null
  selected: Account | null
  select: (accountId: string) => void
  reload: () => void
}

const AccountContext = createContext<AccountContextValue | null>(null)

/** 全局账号上下文：顶栏账号选择器 + 跨页面复用（plan-frontend.md 第三节）。 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(
    () => window.localStorage.getItem(STORAGE_KEY),
  )
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .listAccounts({ limit: 500 })
      .then((data) => {
        if (cancelled) return
        setAccounts(data)
        setError(null)
        setSelectedId((current) => {
          if (current && data.some((a) => a.canonical_id === current)) return current
          return data[0]?.canonical_id ?? null
        })
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  useEffect(() => {
    if (selectedId) window.localStorage.setItem(STORAGE_KEY, selectedId)
  }, [selectedId])

  const select = useCallback((accountId: string) => setSelectedId(accountId), [])
  const reload = useCallback(() => setTick((n) => n + 1), [])

  const value = useMemo<AccountContextValue>(
    () => ({
      accounts,
      loading,
      error,
      selectedId,
      selected: accounts.find((a) => a.canonical_id === selectedId) ?? null,
      select,
      reload,
    }),
    [accounts, loading, error, selectedId, select, reload],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccounts(): AccountContextValue {
  const ctx = useContext(AccountContext)
  if (!ctx) throw new Error('useAccounts 必须在 AccountProvider 内使用')
  return ctx
}
