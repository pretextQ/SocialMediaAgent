import { Link } from 'react-router-dom'
import { EmptyState } from '../components'

export function NotFoundPage() {
  return (
    <EmptyState
      title="页面不存在"
      hint="请从左侧导航选择一个已有页面。"
      action={
        <Link
          to="/"
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          回到工作台
        </Link>
      }
    />
  )
}
