import { describe, expect, it } from 'vitest'
import {
  parseBlocks,
  parseMarker,
  renumberBlocks,
  blocksToPlainText,
  resolveSchemeId
} from './blocks.js'
import { detectKind } from './detect.js'

const detectKindOf = (s) => detectKind(s).kind

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

  it('parses an english journal paper with title and references', () => {
    const src = [
      'A Survey of Lightweight Models for Text Classification',
      '',
      'Abstract',
      '',
      'Text classification is a fundamental task.',
      'Recent advances have changed this landscape.',
      '',
      '1 Introduction',
      '',
      'Deep learning has improved performance.',
      '',
      'References',
      '',
      '[1] Devlin J, et al. BERT: Pre-training of deep bidirectional transformers[C]. NAACL, 2019: 4171-4186.',
      '[2] Hinton G, et al. Distilling the knowledge in a neural network[J]. arXiv, 2015.'
    ].join('\n')
    const blocks = renumberBlocks(parseBlocks(src), 'academic')
    expect(blocks[0].kind).toBe('title')
    expect(blocks[0].text).toContain('A Survey')
    expect(blocks.map((b) => b.kind)).toEqual([
      'title', 'heading', 'paragraph', 'heading', 'paragraph', 'heading', 'ref', 'ref'
    ])
    expect(blocks[1].unnumbered).toBe(true)
    expect(blocks[5].unnumbered).toBe(true) // References 不编号
    expect(blocks[6].text).toContain('[1] Devlin')
  })

  it('parses a chinese thesis with spaced section names and formulas', () => {
    const src = [
      '基于深度学习的中文文本分类方法研究',
      '',
      '摘  要',
      '',
      '随着互联网技术的快速发展，网络文本数据呈爆炸式增长。',
      '如何高效地对海量文本进行自动分类已成为重要课题。',
      '',
      '关键词：文本分类；深度学习',
      '',
      'Abstract',
      '',
      'This paper proposes an end-to-end method.',
      '',
      'Key words: text classification; deep learning',
      '',
      '第1章 绪论',
      '',
      '文本分类是基础任务之一。',
      '',
      '1.2 研究现状',
      '',
      '早期研究采用传统方法。',
      '',
      '1.2.1 中文预训练模型',
      '',
      '中文场景下涌现了多个预训练模型。',
      '',
      '$$Attention(Q, K, V) = softmax(QK^T)V$$',
      '',
      '表 3-1 不同模型性能对比',
      '',
      '参考文献',
      '',
      '[1] 张三, 李四. 基于BERT的文本分类研究[J]. 计算机学报, 2023.'
    ].join('\n')
    const blocks = renumberBlocks(parseBlocks(src), 'thesis')
    expect(blocks[0].kind).toBe('title')
    expect(blocks[1].unnumbered).toBe(true) // 摘  要（带空格）识别为栏目
    expect(blocks[2].kind).toBe('paragraph') // 摘要两句合并
    expect(blocks.find((b) => b.kind === 'formula')?.text).toContain('Attention')
    expect(blocks.filter((b) => b.kind === 'caption').map((b) => b.text))
      .toEqual(['表 3-1 不同模型性能对比'])
    const chapter = blocks.find((b) => b.number === '第1章')
    expect(chapter?.text).toBe('绪论')
    // 编号按位置归一：原文 1.2/1.2.1 是本章第一组 → 重排为 1.1/1.1.1
    expect(blocks.find((b) => b.number === '1.1')?.text).toBe('研究现状')
    expect(blocks.find((b) => b.number === '1.1.1')?.text).toBe('中文预训练模型')
  })

  it('parses an official document with full numbering cascade and signoff', () => {
    const src = [
      '关于进一步加强经费管理的通知',
      '',
      '各部门、各学院：',
      '',
      '为进一步规范经费使用，现就有关事项通知如下。',
      '',
      '一、总体要求',
      '',
      '（一）落实主体责任',
      '',
      '1. 建立经费使用台账',
      '2. 定期开展自查自纠',
      '',
      '二、具体措施',
      '',
      '1. 预算编制应当科学合理，符合项目研究计划。',
      '2. 预算调整应当按照规定程序报批。',
      '',
      '（1）单项调整超过百分之二十的，须经审核。',
      '（2）涉及科目间调剂的，应当履行备案手续。',
      '',
      '特此通知。',
      '',
      '××大学',
      '2026年3月15日'
    ].join('\n')
    const blocks = renumberBlocks(parseBlocks(src), 'official')
    expect(blocks[0].kind).toBe('title')
    expect(blocks[1].kind).toBe('paragraph') // 各部门、各学院：
    const headings = blocks.filter((b) => b.kind === 'heading')
    expect(headings.map((b) => b.number)).toEqual(['一、', '（一）', '1.', '2.', '二、'])
    // 带句号的数字/括号列表 → 条目
    const items = blocks.filter((b) => b.kind === 'item')
    expect(items.length).toBe(4)
    // 落款右对齐
    const signoffs = blocks.filter((b) => b.kind === 'signoff')
    expect(signoffs.map((b) => b.text)).toEqual(['××大学', '2026年3月15日'])
  })

  it('parses web-copied markdown with pipe tables and html entities', () => {
    const src = [
      '# Transformer 模型对比',
      '',
      '实验环境为&nbsp;RTX 4090&amp;128G&nbsp;内存。',
      '',
      '| 模型 | 参数量 | 层数 |',
      '| --- | --- | --- |',
      '| BERT-base | 110M | 12 |',
      '| BERT-large | 340M | 24 |',
      '',
      '详见[论文原文](https://example.com/paper)。'
    ].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1, text: 'Transformer 模型对比' })
    expect(blocks[1].text).toContain('RTX 4090&128G 内存')
    const table = blocks.find((b) => b.kind === 'table')
    expect(table.header).toEqual(['模型', '参数量', '层数'])
    expect(table.rows).toEqual([['BERT-base', '110M', '12'], ['BERT-large', '340M', '24']])
    expect(blocks[blocks.length - 1].text).toContain('论文原文')
    expect(detectKindOf(src)).toBe('text')
  })

  it('parses algorithm pseudo-code blocks', () => {
    const src = [
      '本节给出训练流程，如算法 1 所示。',
      '',
      '算法 1: 基于对比学习的联合训练',
      '',
      '输入: 训练集 D, 学习率 η',
      '输出: 模型参数 θ',
      '',
      '1: 初始化参数 θ',
      '2: for epoch = 1 to E do',
      '3:     计算损失 L',
      '4: end for',
      '5: return θ',
      '',
      '算法收敛性见定理 1。'
    ].join('\n')
    const blocks = parseBlocks(src)
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'caption', 'code', 'paragraph'])
    expect(blocks[1].text).toContain('算法 1')
    expect(blocks[2].code.split('\n')).toHaveLength(7) // 输入/输出与步骤行合并
    expect(blocks[2].code).toContain('5: return θ')
  })

  it('itemizes outline-style content with various bullets', () => {
    const src = [
      '项目验收汇报提纲',
      '',
      '- 项目背景与目标',
      '- 总体架构',
      '  · Vue 3 + TypeScript',
      '  · Element Plus 组件库',
      '',
      '进度安排',
      '',
      '一、需求分析阶段',
      '二、开发实施阶段',
      '',
      '交付物列表',
      '',
      '‣ 需求规格说明书',
      '‣ 测试报告',
      '⁃ 用户手册'
    ].join('\n')
    const blocks = renumberBlocks(parseBlocks(src), 'academic')
    expect(blocks[0].kind).toBe('heading') // 提纲
    expect(blocks[5].kind).toBe('heading') // 进度安排
    expect(blocks[8].kind).toBe('heading') // 交付物列表
    const items = blocks.filter((b) => b.kind === 'item')
    expect(items.length).toBe(9) // 4（含缩进 ·）+ 2（一、二、）+ 3（‣ ⁃）
    expect(items.some((b) => b.text === 'Vue 3 + TypeScript')).toBe(true) // 缩进 · bullet
  })

  it('parses a kitchen-sink paper with every element type', () => {
    const src = [
      '基于混合架构的智能问答系统设计与实现',
      '',
      '摘  要',
      '',
      '本文设计了基于混合架构的问答系统。',
      '实验表明准确率达到 92.4%，提升 __7.8 个百分点__。',
      '',
      '关键词：智能问答；知识图谱',
      '',
      '第1章 绪论',
      '',
      '1.2 主要挑战',
      '',
      '- 领域知识更新滞后',
      '- 生成内容存在幻觉',
      '',
      '第2章 系统设计',
      '',
      '核心接口实现如下：',
      '',
      '```python',
      'def 检索(query):',
      '    return index.search(encoder.encode(query))',
      '```',
      '',
      '算法 1: 实体抽取',
      '',
      '输入: 文本 T',
      '',
      '1: for 文档 in T do',
      '2:     抽取实体',
      '3: end for',
      '',
      '表 2-1 组件配置',
      '',
      '| 组件 | 模型 |',
      '| --- | --- |',
      '| 编码器 | BGE |',
      '',
      '$$Attention(Q, K, V) = softmax(QK^T)V$$',
      '',
      '（1）基线一准确率 76.5%。',
      '（2）本文方法准确率 92.4%。',
      '',
      '图 3-1 错误类型分布',
      '',
      '参考文献',
      '',
      '[1] 张三. 问答系统综述[J]. 计算机学报, 2024.',
      '',
      '××大学',
      '2026年6月1日'
    ].join('\n')
    const blocks = renumberBlocks(parseBlocks(src), 'thesis')
    const shape = blocks.map((b) => b.kind)
    expect(shape).toEqual([
      'title', 'heading', 'paragraph', 'paragraph',
      'heading', 'heading', 'item', 'item',
      'heading', 'paragraph', 'code',
      'caption', 'code',
      'caption', 'table', 'formula',
      'item', 'item', 'caption',
      'heading', 'ref', 'signoff', 'signoff'
    ])
    expect(detectKindOf(src)).toBe('mixed')
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
