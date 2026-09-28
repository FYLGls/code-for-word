import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

import { spawnSync } from 'node:child_process'
import { writeWindowsClipboard } from './clipboard-service.mjs'

describe('writeWindowsClipboard busy-retry', () => {
  beforeEach(() => {
    spawnSync.mockReset()
  })

  it('embeds an in-process retry loop (Clipboard is busy race)', async () => {
    spawnSync.mockReturnValue({ status: 0, stdout: 'ok', stderr: '' })

    await writeWindowsClipboard({ rtf: '{\\rtf1}', plain: 'hi' })

    expect(spawnSync).toHaveBeenCalledTimes(1)
    const args = spawnSync.mock.calls[0]
    expect(args[0]).toBe('powershell.exe')
    expect(args[1]).toContain('-STA')
    const script = args[1].join(' ')
    // 重试循环必须留在 PowerShell 进程内，进程级重试会超出客户端 2.5s 超时
    expect(script).toMatch(/for \(\$i = 0; \$i -lt \d+ -and -not \$done; \$i\+\+\)/)
    expect(script).toContain('Start-Sleep -Milliseconds')
    expect(script).toContain('throw \'clipboard busy after retries\'')
    // SetDataObject($data, $true) 整体替换剪贴板，前置 Clear() 是多余的失败点
    expect(script).not.toContain('Clipboard]::Clear()')
  })

  it('sets both Rtf and UnicodeText formats on the rtf path', async () => {
    spawnSync.mockReturnValue({ status: 0, stdout: 'ok', stderr: '' })

    await writeWindowsClipboard({ rtf: '{\\rtf1}', plain: 'hi' })

    const script = spawnSync.mock.calls[0][1].join(' ')
    expect(script).toContain('DataFormats]::Rtf')
    expect(script).toContain('DataFormats]::UnicodeText')
  })

  it('plain-only path skips Rtf and keeps the retry loop', async () => {
    spawnSync.mockReturnValue({ status: 0, stdout: 'ok', stderr: '' })

    await writeWindowsClipboard({ rtf: null, plain: 'hi' })

    const script = spawnSync.mock.calls[0][1].join(' ')
    expect(script).not.toContain('DataFormats]::Rtf')
    expect(script).toContain('$i -lt')
  })

  it('throws with stderr when powershell ultimately fails', () => {
    spawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'clipboard busy after retries' })

    expect(() => writeWindowsClipboard({ rtf: '{\\rtf1}', plain: 'hi' })).toThrow(
      'clipboard busy after retries'
    )
  })
})
