import { ApiError } from '../api/client'

export function ErrorState({
  error,
  onRetry,
  notFoundHint,
}: {
  error: Error
  onRetry?: () => void
  notFoundHint?: string
}) {
  const isNotFound = error instanceof ApiError && error.isNotFound
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
      <p className="font-medium text-red-800">
        {isNotFound ? '资源不存在' : '请求失败'}
      </p>
      <p className="mt-1 break-all text-red-700">
        {isNotFound && notFoundHint ? notFoundHint : error.message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
        >
          重试
        </button>
      )}
    </div>
  )
}
