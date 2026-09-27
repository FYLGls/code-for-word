import { describe, expect, it } from 'vitest'
import { htmlToStyledLines } from './tokenize.js'
import { getTheme } from '../themes.js'

describe('tokenize', () => {
  it('maps highlight.js spans onto VS Code Dark+ colors', () => {
    const html = '<span class="hljs-keyword">def</span> <span class="hljs-title function_">fib</span>()'
    const lines = htmlToStyledLines(html, getTheme('vscode-dark'))
    expect(lines).toHaveLength(1)
    expect(lines[0][0]).toMatchObject({ text: 'def', color: '#569CD6' })
    expect(lines[0][1].text).toBe(' ')
    expect(lines[0][2]).toMatchObject({ text: 'fib', color: '#DCDCAA' })
  })

  it('keeps hard newlines as separate rows', () => {
    const html = '<span class="hljs-keyword">a</span>\n<span class="hljs-keyword">b</span>'
    const lines = htmlToStyledLines(html, getTheme('vscode-light'))
    expect(lines).toHaveLength(2)
    expect(lines[0][0].text).toBe('a')
    expect(lines[1][0].text).toBe('b')
  })
})
