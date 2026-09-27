import { describe, expect, it } from 'vitest'
import {
  parseBlocks,
  parseMarker,
  renumberBlocks,
  blocksToPlainText,
  resolveSchemeId
} from './blocks.js'

describe('parseMarker', () => {
  it('parses chinese official markers', () => {
    expect(parseMarker('一、总体设计')).toEqual({ level: 1, text: '总体设计', marker: 'cnTop' })
    expect(parseMarker('（二）数据库选型')).toEqual({ level: 2, text: '数据库选型', marker: 'cnParen' })
  })

  it('parses academic dotted numbers', () => {
    expect(parseMarker('1 引言')).toEqual({ level: 1, text: '引言', marker: 'dotted' })
    expect(parseMarker('1.1 研究背景')).toEqual({ level: 2, text: '研究背景', marker: 'dotted' })
    expect(parseMarker('3.2.1 模型结构')).toEqual({ level: 3, text: '模型结构', marker: 'dotted' })
  })

  it('parses thesis chapters and list markers', () => {
    expect(parseMarker('第1章 绪论')).toEqual({ level: 1, text: '绪论', marker: 'chapter' })
    expect(parseMarker('第二章 相关工作')).toEqual({ level: 1, text: '相关工作', marker: 'chapter' })
    expect(parseMarker('- 前后端分离')).toEqual({ level: 0, text: '前后端分离', marker: 'bullet' })
    expect(parseMarker('（1）数据采集')).toEqual({ level: 3, text: '数据采集', marker: 'parenNum' })
    expect(parseMarker('a. 模型训练')).toEqual({ level: 4, text: '模型训练', marker: 'latinDot' })
  })

  it('rejects sentence starts that look like numbers', () => {
    expect(parseMarker('2026 年的研究进展表明，')).toBeNull()
    expect(parseMarker('1.5 小时即可完成训练。')).toBeNull()
  })
})

describe('parseBlocks', () => {
  it('parses headings, paragraphs and fenced code', () => {
    const src = [
      '1 引言',
      '',
      '随着深度学习的发展，文本分类取得显著进展。',
      '传统方法依赖人工特征，泛化能力有限。',
      '',
      '```python',
      'def train(model, data):',
      '    return model.fit(data)',
      '```',
      '',
      '2 相关工作'
    ].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading', 'paragraph', 'code', 'heading'
    ])
    expect(blocks[0].level).toBe(1)
    expect(blocks[2].language).toBe('python')
    expect(blocks[2].fenced).toBe(true)
    expect(blocks[1].text).toContain('传统方法依赖人工特征，泛化能力有限。')
  })

  it('joins wrapped paragraph lines with proper spacing', () => {
    const src = ['本文提出一种新方法。', '该方法效果很好。', '', 'Deep learning is powerful.', 'It works well.'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks[0].text).toBe('本文提出一种新方法。该方法效果很好。')
    expect(blocks[1].text).toBe('Deep learning is powerful. It works well.')
  })

  it('auto-itemizes bare short lines', () => {
    const src = ['系统架构设计', '', '前后端分离', '', '数据库独立部署', '', '缓存层可选'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['item', 'item', 'item', 'item'])
  })

  it('auto-itemizes sentence-per-line groups (PDF list shape)', () => {
    const src = [
      '系统采用前后端分离的架构。',
      '数据库使用 MySQL 进行持久化存储。',
      '支持一键复制到 Word 文档。',
      '提供论文格式自动排版能力。'
    ].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['item', 'item', 'item', 'item'])
  })

  it('still merges wrapped prose paragraphs', () => {
    const src = ['本文提出一种新方法。', '该方法效果很好。'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph'])
  })

  it('honors explicit split modes', () => {
    const src = ['本文提出一种新方法。', '该方法效果很好。', '实验证明了有效性。'].join('\n')
    const merged = parseBlocks(src, { splitMode: 'merge' })
    expect(merged.map((b) => b.kind)).toEqual(['paragraph'])
    const itemized = parseBlocks(src, { splitMode: 'items' })
    expect(itemized.map((b) => b.kind)).toEqual(['item', 'item', 'item'])
  })

  it('itemizes blank-line-separated short sentence lines', () => {
    const src = ['系统包含三大模块。', '', '前端负责界面展示。', '', '后端提供数据接口。'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['item', 'item', 'item'])
  })

  it('promotes a bare short line to heading when a paragraph follows', () => {
    const src = ['系统总体架构', '', '系统采用前后端分离的设计，前端使用 Vue，后端使用 Spring。'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph'])
  })

  it('keeps list-marker runs as items', () => {
    const src = ['系统包含以下模块：', '', '- 前端界面', '- 后端服务', '- 数据库'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'item', 'item', 'item'])
  })

  it('treats consecutive academic numbers as headings (outline)', () => {
    const src = ['1 引言', '2 相关工作', '3 方法'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'heading', 'heading'])
  })

  it('maps bare N. to level 3 under chinese markers', () => {
    const src = ['一、总体设计', '1. 首页布局', '2. 路由设计'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks[0].kind).toBe('heading')
    expect(blocks[1].level).toBe(3)
    expect(blocks[1].kind).toBe('heading')
  })

  it('recognizes unnumbered special sections', () => {
    const src = ['摘要', '', '这是摘要内容。', '', '参考文献'].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks[0].unnumbered).toBe(true)
    expect(blocks[2].unnumbered).toBe(true)
  })

  it('detects implicit code groups inside prose', () => {
    const src = [
      '模型定义如下所示。',
      '',
      'class Net(nn.Module):',
      '    def forward(self, x):',
      '        return self.fc(x)',
      '',
      '训练在 GPU 上进行。'
    ].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'code', 'paragraph'])
    expect(blocks[1].fenced).toBe(false)
  })

  it('parses figure/table captions and reference entries', () => {
    const src = [
      '实验结果见下图。',
      '',
      '图 1 系统总体架构图',
      '',
      '表 2 三种方法的准确率对比',
      '',
      '参考文献',
      '',
      '[1] 张三, 李四. 文本分类方法研究[J]. 计算机学报, 2023.',
      '[2] Wang L. A survey on pre-trained models[J]. JMLR, 2022.'
    ].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual([
      'paragraph', 'caption', 'caption', 'heading', 'ref', 'ref'
    ])
    expect(blocks[1].text).toBe('图 1 系统总体架构图')
    expect(blocks[4].text).toContain('[1] 张三')
  })

  it('strips markdown emphasis from numbered headings', () => {
    const blocks = parseBlocks('**3 实验结果**\n\n准确率提升 5%。')
    expect(blocks[0].kind).toBe('heading')
    expect(blocks[0].level).toBe(1)
    expect(blocks[0].text).toBe('实验结果')
  })

  it('normalizes a messy PDF-copied paper end to end', () => {
    const src = [
      '摘要',
      '',
      '针对传统方法不足的问题，',
      '本文提出一种端到端分类方法。',
      '实验表明该方法有效。',
      '',
      '关键词：文本分类；深度学习',
      '',
      '**1 引言**',
      '',
      '随着深度学习的发展，NLP 取得长足进步。',
      '传统方法依赖人工特征，泛化能力有限。',
      '本文贡献包括 __三点__：结构改进与训练优化。',
      '',
      '一、系统总体设计',
      '',
      '核心流程调用 `train()` 函数完成：',
      '',
      '```python',
      'def train(model, data):',
      '    return model.fit(data)',
      '```',
      '',
      '1.1 数据预处理',
      '',
      '语料经清洗、分词、去停用词三步处理。',
      '',
      '（一）前端界面设计',
      '',
      '前端使用 Vue 框架开发，主要页面包括：',
      '',
      '数据上传页面，支持拖拽上传。',
      '标注结果页面，支持逐条审核。',
      '',
      'const router = createRouter({',
      '  history: createWebHistory()',
      '})',
      '',
      '图 1 系统总体架构图',
      '',
      '2 结论',
      '',
      '本文方法显著提升了准确率。',
      '',
      '参考文献',
      '',
      '[1] 张三, 李四. 文本分类研究[J]. 计算机学报, 2023.'
    ].join('\n')
    const blocks = renumberBlocks(parseBlocks(src), 'academic')
    // 结构：kind#编号（无编号标题无 #）
    const shape = blocks.map((b) => `${b.kind}#${b.number ?? ''}`)
    expect(shape).toEqual([
      'heading#', 'paragraph#', 'paragraph#',
      'heading#1', 'paragraph#',
      'heading#2', 'paragraph#', 'code#',
      'heading#2.1', 'paragraph#',
      'heading#2.2', 'paragraph#', 'item#1)', 'item#2)', 'code#',
      'caption#', 'heading#3', 'paragraph#',
      'heading#', 'ref#'
    ])
    // 关键内容抽查
    const headingTexts = blocks.filter((b) => b.kind === 'heading').map((b) => b.text)
    expect(headingTexts).toEqual(['摘要', '引言', '系统总体设计', '数据预处理', '前端界面设计', '结论', '参考文献'])
    expect(blocks.find((b) => b.kind === 'caption')?.text).toBe('图 1 系统总体架构图')
    expect(blocks.find((b) => b.kind === 'ref')?.text).toContain('[1] 张三')
    // 摘要正文折行合并成一段
    expect(blocks[1].text).toContain('针对传统方法不足的问题，本文提出一种端到端分类方法。实验表明该方法有效。')
    // 冒号引导句保留为段落
    expect(blocks[11].text).toBe('前端使用 Vue 框架开发，主要页面包括：')
  })
})

describe('renumberBlocks', () => {
  const src = [
    '1 引言',
    '正文一段。',
    '1.1 研究背景',
    '背景说明。',
    '1.2 研究意义',
    '2 相关工作',
    '- 工作A',
    '- 工作B'
  ].join('\n')

  it('renumbers to academic scheme', () => {
    const blocks = renumberBlocks(parseBlocks(src), 'academic')
    const numbers = blocks.filter((b) => b.number).map((b) => b.number)
    expect(numbers).toEqual(['1', '1.1', '1.2', '2', '1)', '2)'])
  })

  it('renumbers to thesis scheme with chapters', () => {
    const blocks = renumberBlocks(parseBlocks(src), 'thesis')
    const nums = blocks.filter((b) => b.number).map((b) => b.number)
    expect(nums).toEqual(['第1章', '1.1', '1.2', '第2章', '1)', '2)'])
  })

  it('renumbers to official scheme', () => {
    const blocks = renumberBlocks(parseBlocks(src), 'official')
    const nums = blocks.filter((b) => b.number).map((b) => b.number)
    expect(nums).toEqual(['一、', '（一）', '（二）', '二、', '（1）', '（2）'])
  })

  it('keeps original text with none scheme', () => {
    const blocks = renumberBlocks(parseBlocks(src), 'none')
    expect(blocks.every((b) => b.number === undefined)).toBe(true)
    expect(blocks[0].text).toBe('引言')
  })

  it('uses half-width parens for pure latin content', () => {
    const src2 = ['Overview', '', 'Body text here.', '', '（1）first item', '（2）second item'].join('\n')
    const blocks = renumberBlocks(parseBlocks(src2), 'official')
    expect(blocks.find((b) => b.kind === 'item')?.number).toBe('(1)')
  })

  it('demotes headings whose parents are missing', () => {
    const src2 = ['（一）数据库选型', '说明文本。'].join('\n')
    const blocks = renumberBlocks(parseBlocks(src2), 'academic')
    expect(blocks[0].level).toBe(1)
    expect(blocks[0].number).toBe('1')
  })
})

describe('blocksToPlainText', () => {
  it('flattens blocks with numbers', () => {
    const blocks = renumberBlocks(parseBlocks('1 引言\n\n正文内容。'), 'academic')
    const text = blocksToPlainText(blocks)
    expect(text).toBe('1 引言\n\n正文内容。')
  })

  it('puts consecutive items on separate lines', () => {
    const blocks = renumberBlocks(parseBlocks('- 甲\n- 乙\n- 丙'), 'academic')
    const text = blocksToPlainText(blocks)
    expect(text).toBe('1) 甲\n2) 乙\n3) 丙')
  })
})

describe('resolveSchemeId', () => {
  it('falls back to academic', () => {
    expect(resolveSchemeId('bogus')).toBe('academic')
    expect(resolveSchemeId('thesis')).toBe('thesis')
  })
})
