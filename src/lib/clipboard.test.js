import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('writeClipboard (web / HTTPS)', () => {
  let writeClipboard
  let fetchMock
  let clipboardWrite
  let clipboardWriteText

  beforeEach(async () => {
    vi.resetModules()
    fetchMock = vi.fn(() => Promise.reject(new Error('host must not be called')))
    clipboardWrite = vi.fn(async () => {})
    clipboardWriteText = vi.fn(async () => {})

    class FakeClipboardItem {
      constructor(items) {
        this.items = items
      }
    }

    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    vi.stubGlobal('window', {
      location: { protocol: 'https:', hostname: 'l00plegend.github.io' },
      ClipboardItem: FakeClipboardItem,
      codepasteDesktop: undefined
    })
    vi.stubGlobal('navigator', {
      clipboard: {
        write: clipboardWrite,
        writeText: clipboardWriteText
      }
    })
    vi.stubGlobal('document', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      execCommand: vi.fn(() => false),
      createElement: vi.fn(() => ({
        value: '',
        style: { cssText: '' },
        setAttribute: vi.fn(),
        focus: vi.fn(),
        select: vi.fn(),
        remove: vi.fn()
      })),
      body: { appendChild: vi.fn() },
      activeElement: null
    })

    ;({ writeClipboard } = await import('./clipboard.js'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('skips localhost host and writes HTML via Clipboard API', async () => {
    const result = await writeClipboard({
      rtf: '{\\rtf1}',
      html: '<b>hi</b>',
      plain: 'hi'
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(clipboardWrite).toHaveBeenCalledTimes(1)
    expect(result.via).toBe('browser-html')
  })

  it('does not call fetch before clipboard.write (keeps user gesture)', async () => {
    const order = []
    fetchMock.mockImplementation(async () => {
      order.push('fetch')
      throw new Error('no')
    })
    clipboardWrite.mockImplementation(async () => {
      order.push('clipboard.write')
    })

    await writeClipboard({ rtf: 'x', html: '<i>x</i>', plain: 'x' })

    expect(order).toEqual(['clipboard.write'])
  })
})
