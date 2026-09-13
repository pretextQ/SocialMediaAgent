import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BulletList, ReportView, ScoreGauge } from '../components'

describe('ReportView', () => {
  it('渲染后端确定性生成的 markdown 结构', () => {
    const markdown = [
      '# 账号运营报告：测试账号',
      '',
      '- 账号健康度：**18/100**',
      '',
      '## 优势',
      '- 内容方向聚焦',
      '',
      '## 周计划',
      '- 每周 2 条',
    ].join('\n')

    const { container } = render(<ReportView markdown={markdown} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('账号运营报告：测试账号')
    expect(screen.getByRole('heading', { level: 2, name: '优势' })).toBeInTheDocument()
    expect(screen.getByText('18/100').tagName).toBe('STRONG')
    expect(container.querySelectorAll('li')).toHaveLength(3)
  })

  it('空报告给出占位而不是报错', () => {
    render(<ReportView markdown="" />)
    expect(screen.getByText('（报告为空）')).toBeInTheDocument()
  })
})

describe('ScoreGauge', () => {
  it('固定尺寸渲染出 SVG 与分数（不依赖容器测量）', () => {
    const { container } = render(<ScoreGauge score={72} label="趋势分" />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('趋势分')).toBeInTheDocument()
  })

  it('越界分数被夹到 0-100', () => {
    render(<ScoreGauge score={180} />)
    expect(screen.getByText('100')).toBeInTheDocument()
  })
})

describe('BulletList', () => {
  it('空数组渲染占位文案', () => {
    render(<BulletList items={[]} />)
    expect(screen.getByText('（无）')).toBeInTheDocument()
  })

  it('逐条渲染', () => {
    render(<BulletList items={['甲', '乙']} tone="positive" />)
    expect(screen.getByText('甲')).toBeInTheDocument()
    expect(screen.getByText('乙')).toBeInTheDocument()
  })
})
