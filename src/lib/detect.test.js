import { describe, expect, it } from 'vitest'
import { detectKind, lineVote, findFences } from './detect.js'

describe('lineVote', () => {
  it('votes code for typical code lines', () => {
    expect(lineVote('def binary_search(arr, target):')).toBe('code')
    expect(lineVote('    return arr[mid] if arr[mid] == target else -1')).toBe('code')
    expect(lineVote('const express = require("express");')).toBe('code')
    expect(lineVote('import numpy as np')).toBe('code')
    expect(lineVote('}')).toBe('code')
    expect(lineVote('<!-- header -->')).toBe('code')
  })

  it('votes text for prose lines', () => {
    expect(lineVote('本文提出了一种基于深度学习的文本分类方法。')).toBe('text')
    expect(lineVote('实验结果表明，该方法的准确率达到了 95%。')).toBe('text')
    expect(lineVote('The experimental results show that our method outperforms all baselines significantly.')).toBe('text')
    expect(lineVote('摘要：随着人工智能技术的快速发展，自然语言处理取得了长足进步，')).toBe('text')
  })

  it('abstains on ambiguous short lines', () => {
    expect(lineVote('setup')).toBe('')
    expect(lineVote('')).toBe('')
  })

  it('votes text for academic prose containing brackets', () => {
    expect(lineVote('BERT (Bidirectional Encoder Representations) achieved strong results.')).toBe('text')
    expect(lineVote('Devlin et al. (2019) proposed the pre-training paradigm.')).toBe('text')
    expect(lineVote('Our method outperforms all baselines (p < 0.01).')).toBe('text')
    expect(lineVote('We further analyze the effect of batch size (see Figure 2).')).toBe('text')
    expect(lineVote('该方法在多个数据集上进行了验证（GLUE、SuperGLUE）。')).toBe('text')
  })

  it('still votes code for real code lines under scoring', () => {
    expect(lineVote('let acc = model.evaluate(X_test);')).toBe('code')
    expect(lineVote('let config = { retries: 3 };')).toBe('code')
    expect(lineVote('if (acc > best) {')).toBe('code')
    expect(lineVote('const arr = [1, 2, 3].map(x => x * 2)')).toBe('code')
  })
})

describe('findFences', () => {
  it('finds fenced regions with language', () => {
    const fences = findFences(['前置说明', '```python', 'x = 1', '```', '后续说明'])
    expect(fences).toEqual([{ start: 1, end: 4, language: 'python', closed: true }])
  })

  it('treats an unclosed fence as running to EOF', () => {
    const fences = findFences(['```js', 'let a = 1'])
    expect(fences).toEqual([{ start: 0, end: 2, language: 'js', closed: false }])
  })
})

describe('detectKind', () => {
  it('classifies pure code', () => {
    const code = [
      'function fib(n) {',
      '  if (n <= 1) return n;',
      '  return fib(n - 1) + fib(n - 2);',
      '}',
      ''
    ].join('\n')
    expect(detectKind(code).kind).toBe('code')
  })

  it('classifies Chinese prose as text', () => {
    const text = [
      '随着深度学习技术的发展，文本分类任务取得了显著进展。',
      '传统的机器学习方法依赖人工特征工程，泛化能力有限。',
      '',
      '本文提出一种端到端的分类模型，在多个数据集上验证了有效性。'
    ].join('\n')
    expect(detectKind(text).kind).toBe('text')
  })

  it('classifies English prose as text', () => {
    const text = [
      'Deep learning has dramatically improved the state of text classification.',
      'However, most existing approaches require large amounts of labeled data.',
      '',
      'In this paper, we propose a simple yet effective baseline for this task.'
    ].join('\n')
    expect(detectKind(text).kind).toBe('text')
  })

  it('classifies fenced prose + code as mixed', () => {
    const mixed = [
      '本文使用如下代码进行特征提取，具体流程如下：',
      '',
      '```python',
      'def extract(text):',
      '    return tokenizer.encode(text)',
      '```',
      '',
      '实验表明该流程有效。'
    ].join('\n')
    expect(detectKind(mixed).kind).toBe('mixed')
  })

  it('classifies pure fenced code as code', () => {
    const code = ['```python', 'x = 1', 'print(x)', '```'].join('\n')
    expect(detectKind(code).kind).toBe('code')
  })

  it('classifies code with chinese comments/strings as code', () => {
    const code = [
      '# 数据预处理模块',
      'import pandas as pd',
      '',
      'def 清洗数据(df):',
      '    df = df.dropna()  # 丢弃缺失值',
      '    print("清洗完成，剩余 %d 行" % len(df))',
      '    return df',
      '',
      'if __name__ == "__main__":',
      '    df = pd.read_csv("数据集.csv")',
      '    print("处理结束")'
    ].join('\n')
    const r = detectKind(code)
    expect(r.kind).toBe('code')
  })

  it('still classifies chinese prose as text', () => {
    const text = [
      '结果表明，该方法准确率达到 95%，显著优于基线。',
      '其中"预训练"策略贡献最大。',
      '此外，推理速度也有明显提升。'
    ].join('\n')
    expect(detectKind(text).kind).toBe('text')
  })

  it('uses an injected hljs signal for borderline snippets', () => {
    const snippet = 'x = score * 0.8 + bonus\n最终结果以百分比形式输出并写入报表'
    const weak = detectKind(snippet)
    const boosted = detectKind(snippet, {
      autoDetect: () => ({ language: 'python', relevance: 20 })
    })
    expect(weak.kind).toBe('text')
    expect(boosted.kind).toBe('code')
  })

  it('defaults empty input to text', () => {
    expect(detectKind('').kind).toBe('text')
  })
})
