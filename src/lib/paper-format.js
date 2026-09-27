/**
 * 块序列 → 论文排版段落模型（PaperPara[]）。
 * 格式预设参照国内高校通行规范 / GB/T 7713：
 *  正文：宋体小四、1.5 倍行距、首行缩进 2 字符、两端对齐
 *  一级标题：黑体三号（学位论文式居中），段前 24 磅 段后 18 磅
 *  二级标题：黑体四号，段前 18 磅 段后 6 磅
 *  三级标题：黑体小四，段前 12 磅 段后 6 磅
 * 关键项均可通过 options 覆盖。
 */

const PT_TO_TWIPS = 20

/**
 * @typedef {object} PaperRun
 * @property {string} text
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 * @property {string} [color] hex
 * @property {string} [fontName] override paragraph font (inline code)
 */

/**
 * @typedef {object} PaperPara
 * @property {'heading'|'body'|'item'|'code'|'codeCaption'} kind
 * @property {PaperRun[]} runs
 * @property {string} fontName
 * @property {number} fontSizePt
 * @property {'left'|'center'|'justify'} align
 * @property {number} firstLineTwips
 * @property {number} beforeTwips
 * @property {number} afterTwips
 * @property {number|null} lineMultiple 1.5 等；null = 代码精确行距
 * @property {number} [level] heading level
 * @property {boolean} [headingCenter]
 * @property {string} [groupId] 同一代码块共享
 * @property {number} [codeIndex]
 * @property {number} [codeTotal]
 * @property {boolean} [codeFirst]
 * @property {boolean} [codeLast]
 */

export const PAPER_DEFAULTS = {
  scheme: 'academic',
  bodyFont: '宋体',
  bodySizePt: 12,
  lineSpacing: 1.5,
  firstLineIndentChars: 2,
  justify: true,
  headingFont: '黑体',
  heading1SizePt: 16,
  heading2SizePt: 14,
  heading3SizePt: 12,
  bodyAfterPt: 0,
  translations: null, // Map<blockIndex, string>
  translateOutput: 'original', // original | translated | bilingual
  codeCaption: true,
  codeCaptionLabel: '代码',
  code: {
    fontName: 'Consolas',
    fontSizePt: 10.5,
    background: '#F5F5F5',
    noFill: false,
    lineNumbers: false,
    frameStyle: 'bar',
    accent: '#007ACC'
  }
}

/** @param {number} pt */
function ptTwips(pt) {
  return Math.round(pt * PT_TO_TWIPS)
}

/** 行内 Markdown 清理：**加粗** → bold，`代码` 去反引号，[文字](链接) → 文字。
 * @param {string} text
 * @returns {PaperRun[]}
 */
export function parseInline(text) {
  const out = []
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\([^)]*\))/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    if (m[2] != null) out.push({ text: m[2], bold: true })
    else if (m[4] != null) out.push({ text: m[4], fontName: 'Consolas' })
    else if (m[6] != null) out.push({ text: m[6] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out.length ? out : [{ text }]
}

/**
 * 标题/条目编号与正文的拼接（GB/T 7713：编号后空一格；公文式无空格）。
 * @param {string} scheme
 */
function joinerFor(scheme) {
  return scheme === 'official' ? '' : ' '
}

/**
 * 块序列 → PaperPara[]。
 * @param {import('./blocks.js').Block[]} blocks 已 renumberBlocks 的块序列
 * @param {Partial<typeof PAPER_DEFAULTS>} [options]
 * @param {(code: string, language: string) => import('../themes.js').StyledRun[][]} [options.highlight]
 *   注入的高亮函数（main.js 用 codeToStyledLines；测试用 stub）
 */
export function buildPaperModel(blocks, options = {}) {
  const opts = { ...PAPER_DEFAULTS, ...options, code: { ...PAPER_DEFAULTS.code, ...(options.code || {}) } }
  const firstLine = Math.max(0, opts.firstLineIndentChars) * ptTwips(opts.bodySizePt)
  const headingSpec = {
    1: { size: opts.heading1SizePt, before: ptTwips(24), after: ptTwips(18) },
    2: { size: opts.heading2SizePt, before: ptTwips(18), after: ptTwips(6) },
    3: { size: opts.heading3SizePt, before: ptTwips(12), after: ptTwips(6) }
  }
  const centerL1 = opts.scheme === 'thesis'
  const joiner = joinerFor(opts.scheme)
  const alignBody = opts.justify ? 'justify' : 'left'
  const bodyAfterTwips = ptTwips(Math.max(0, opts.bodyAfterPt || 0))

  /** @type {PaperPara[]} */
  const paras = []

  const pushTextPara = (kind, text, extra = {}) => {
    paras.push({
      kind,
      runs: parseInline(text),
      fontName: opts.bodyFont,
      fontSizePt: opts.bodySizePt,
      align: alignBody,
      firstLineTwips: kind === 'item' || kind === 'body' ? firstLine : 0,
      beforeTwips: 0,
      afterTwips: kind === 'body' || kind === 'item' ? bodyAfterTwips : 0,
      lineMultiple: opts.lineSpacing,
      ...extra
    })
  }

  const translatedText = (i) => {
    if (!opts.translations || opts.translateOutput !== 'translated') return null
    const t = opts.translations.get(i)
    return t || null
  }

  let codeSeq = 0
  blocks.forEach((b, i) => {
    if (b.kind === 'heading') {
      const spec = headingSpec[Math.min(Math.max(b.level ?? 1, 1), 3)]
      const center = b.unnumbered || (centerL1 && (b.level ?? 1) === 1)
      const joinWithNumber = (body) => (b.number ? `${b.number}${joiner}${body}` : body)
      const translated = opts.translations && opts.translateOutput === 'translated'
        ? opts.translations.get(i)
        : null
      const text = translated != null ? joinWithNumber(translated) : joinWithNumber(b.text)
      paras.push({
        kind: 'heading',
        runs: parseInline(text).map((r) => ({ ...r, bold: true })),
        fontName: opts.headingFont,
        fontSizePt: spec.size,
        align: center ? 'center' : 'left',
        firstLineTwips: 0,
        beforeTwips: spec.before,
        afterTwips: spec.after,
        lineMultiple: opts.lineSpacing,
        level: b.level ?? 1,
        headingCenter: center
      })
      return
    }
    if (b.kind === 'paragraph' || b.kind === 'item') {
      const kind = b.kind === 'item' ? 'item' : 'body'
      const repl = translatedText(i)
      if (repl != null) {
        pushTextPara(kind, repl)
        return
      }
      const text = b.number ? `${b.number}${joiner}${b.text}` : b.text
      pushTextPara(kind, text)
      if (opts.translations && opts.translateOutput === 'bilingual') {
        const t = opts.translations.get(i)
        if (t) pushTextPara(kind, t)
      }
      return
    }
    if (b.kind === 'code' && b.code && b.code.trim()) {
      codeSeq += 1
      const groupId = `code-${codeSeq}`
      const lines = opts.highlight ? opts.highlight(b.code, b.language || '') : [[{ text: b.code, color: '#000000' }]]
      const total = lines.length
      if (opts.codeCaption) {
        paras.push({
          kind: 'codeCaption',
          runs: [{ text: `${opts.codeCaptionLabel} ${codeSeq}` }],
          fontName: opts.bodyFont,
          fontSizePt: opts.code.fontSizePt,
          align: 'center',
          firstLineTwips: 0,
          beforeTwips: ptTwips(6),
          afterTwips: ptTwips(3),
          lineMultiple: opts.lineSpacing,
          groupId
        })
      }
      lines.forEach((row, idx) => {
        paras.push({
          kind: 'code',
          runs: row.length ? row : [{ text: ' ' }],
          fontName: opts.code.fontName,
          fontSizePt: opts.code.fontSizePt,
          align: 'left',
          firstLineTwips: 0,
          beforeTwips: 0,
          afterTwips: idx === total - 1 ? ptTwips(6) : 0,
          lineMultiple: null, // 代码用精确行距，由导出器按字号计算
          groupId,
          codeIndex: idx,
          codeTotal: total,
          codeFirst: idx === 0,
          codeLast: idx === total - 1
        })
      })
    }
  })

  return paras
}

/**
 * 论文段落 → 纯文本。
 * @param {PaperPara[]} paras
 */
export function paperParasToPlainText(paras) {
  const parts = []
  let prevGroup = ''
  for (const p of paras) {
    const text = p.runs.map((r) => r.text).join('')
    if (!text.trim()) continue
    if ((p.kind === 'code' || p.kind === 'codeCaption') && p.groupId === prevGroup) {
      parts[parts.length - 1] += `\n${text}`
    } else {
      parts.push(text)
    }
    prevGroup = p.kind === 'code' || p.kind === 'codeCaption' ? p.groupId : ''
  }
  return parts.join('\n\n')
}
