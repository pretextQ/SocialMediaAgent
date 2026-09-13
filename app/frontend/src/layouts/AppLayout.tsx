import { NavLink, Outlet } from 'react-router-dom'
import { useAccounts } from '../context/AccountContext'

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: '工作台', end: true },
  { to: '/data', label: '数据浏览' },
  { to: '/strategy', label: '账号诊断与策略' },
  { to: '/analysis', label: '内容分析' },
  { to: '/trends', label: '趋势分析' },
  { to: '/topics', label: '选题推荐' },
  { to: '/titles', label: '标题优化' },
  { to: '/reports', label: '运营周报' },
  { to: '/settings', label: '系统状态' },
]

export function AppLayout() {
  const { accounts, selectedId, select, loading } = useAccounts()

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-4">
          <p className="text-sm font-semibold text-gray-900">SocialMediaAgent</p>
          <p className="mt-0.5 text-xs text-gray-500">多平台自媒体智能运营</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-50 font-medium text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <p className="border-t border-gray-100 px-4 py-3 text-[11px] leading-relaxed text-gray-400">
          分析结果为建议，不含自动发布等写操作。
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-3">
          <span className="text-xs text-gray-400">
            输入平台数据 → 账号诊断 / 内容分析 / 趋势 / 选题 / 标题 / 策略
          </span>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            当前账号
            <select
              value={selectedId ?? ''}
              disabled={loading || accounts.length === 0}
              onChange={(event) => select(event.target.value)}
              className="max-w-72 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 disabled:bg-gray-100"
            >
              {accounts.length === 0 && <option value="">（无账号）</option>}
              {accounts.map((account) => (
                <option key={account.canonical_id} value={account.canonical_id}>
                  {(account.nickname ?? account.canonical_id) + ' · ' + account.canonical_id}
                </option>
              ))}
            </select>
          </label>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
