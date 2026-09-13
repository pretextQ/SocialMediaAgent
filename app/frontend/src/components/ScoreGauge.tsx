import { PolarAngleAxis, RadialBar, RadialBarChart } from 'recharts'

/**
 * 0-100 评分的仪表盘。
 *
 * 刻意使用**固定尺寸**而不是 ResponsiveContainer：后者在无布局尺寸的环境
 * （如 jsdom 测试）下渲染为空，会让「页面是否真的渲染出内容」无法断言。
 */
export function ScoreGauge({
  score,
  label = '评分',
  size = 168,
}: {
  score: number
  label?: string
  size?: number
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const color = clamped >= 70 ? '#16a34a' : clamped >= 40 ? '#d97706' : '#dc2626'
  const data = [{ name: 'score', value: clamped, fill: color }]

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <RadialBarChart
        width={size}
        height={size}
        data={data}
        innerRadius="74%"
        outerRadius="100%"
        startAngle={90}
        endAngle={-270}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
        <RadialBar dataKey="value" cornerRadius={8} background />
      </RadialBarChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold" style={{ color }}>
          {clamped}
        </span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
    </div>
  )
}
