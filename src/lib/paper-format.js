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
 * @property {boolean} [underline]
 * @property {boolean} [strike]
 * @property {string} [color] hex
 * @property {string} [fontName] override paragraph font (inline code)
 */

/**
 * @typedef {object} PaperPara
 * @property {'heading'|'body'|'item'|'code'|'codeCaption'|'caption'|'ref'|'title'|'formula'|'signoff'|'table'} kind
 * @property {PaperRun[]} runs
 * @property {string[]} [header] 表格表头（kind === 'table'）
 * @property {string[][]} [rows] 表格数据行（kind === 'table'）
 * @property {string} fontName
 * @property {number} fontSizePt
 * @property {'left'|'center'|'justify'} align
 * @property {number} firstLineTwips 负值 = 悬挂缩进（配合 leftIndentTwips）
 * @property {number} leftIndentTwips
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
  latinFont: 'Times New Roman',
  bodySizePt: 12,
  lineSpacing: 1.5,
  firstLineIndentChars: 2,
  justify: true,
  headingFont: '黑体',
  heading1SizePt: 16,
  heading2SizePt: 14,
  heading3SizePt: 12,
  bodyAfterPt: 0,
  bodyBold: false,
  bodyItalic: false,
  bodyUnderline: false,
  captionSizePt: 10.5,
  refSizePt: 10.5,
  titleSizePt: 18,
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

/**
 * 行内标记 → Word 格式：**加粗**、*倾斜*、__下划线__、~~删除线~~、
 * `代码`（等宽）、[文字](链接) → 文字。
 * @param {string} text
 * @returns {PaperRun[]}
 */
export function parseInline(text) {
  const out = []
  const re = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(~~([^~]+)~~)|(`([^`]+)`)|(\*([^*\s][^*]*?)\*)|(\[([^\]]+)\]\([^)]*\))/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    if (m[2] != null) out.push({ text: m[2], bold: true })
    else if (m[4] != null) out.push({ text: m[4], underline: true })
    else if (m[6] != null) out.push({ text: m[6], strike: true })
    else if (m[8] != null) out.push({ text: m[8], fontName: 'Consolas' })
    else if (m[10] != null) out.push({ text: m[10], italic: true })
    else if (m[12] != null) out.push({ text: m[12] })
    last = re.lastIndex
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out.length ? out : [{ text }]
}

/**
 * 按文字系统切分 run：中文（含全角标点）用正文字体，西文/数字用西文字体。
 * 这是论文排版刚需——宋体正文里的英文与数字应配 Times New Roman。
 * @param {PaperRun[]} runs
 * @param {string} latinFont
 * @returns {PaperRun[]}
 */
export function applyLatinFont(runs, latinFont) {
  if (!latinFont) return runs
  const isLatinChar = (ch) => {
    const code = ch.codePointAt(0)
    return code <= 0xff || (code >= 0x2000 && code <= 0x206f) // ASCII/拉丁/通用标点
  }
  const isCjk = (ch) => /[\u3000-\u9fff\uff00-\uffef\u3400-\u4dbf]/.test(ch)
  /** @type {PaperRun[]} */
  const out = []
  for (const run of runs) {
    if (run.fontName) {
      out.push(run) // 行内代码等显式字体不覆盖
      continue
    }
    let buf = ''
    let latin = null
    const flush = () => {
      if (!buf) return
      out.push(latin ? { ...run, text: buf, fontName: latinFont } : { ...run, text: buf })
      buf = ''
    }
    for (const ch of run.text) {
      const chLatin = !isCjk(ch) && isLatinChar(ch)
      if (ch === ' ' || ch === '\u00a0') {
        buf += ch // 空格跟随前后文
        continue
      }
      if (latin === null) latin = chLatin
      if (chLatin !== latin) {
        flush()
        latin = chLatin
      }
      buf += ch
    }
    flush()
  }
  return out.length ? out : runs
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
    const styled = (r) => ({
      ...r,
      bold: opts.bodyBold || !!r.bold,
      italic: opts.bodyItalic || !!r.italic,
      underline: opts.bodyUnderline || !!r.underline
    })
    const base = parseInline(text).map(kind === 'body' || kind === 'item' ? styled : (r) => r)
    paras.push({
      kind,
      runs: applyLatinFont(base, opts.latinFont),
      fontName: opts.bodyFont,
      fontSizePt: opts.bodySizePt,
      align: alignBody,
      firstLineTwips: kind === 'item' || kind === 'body' ? firstLine : 0,
      leftIndentTwips: 0,
      beforeTwips: 0,
      afterTwips: kind === 'body' || kind === 'item' ? bodyAfterTwips : 0,
      lineMultiple: opts.lineSpacing,
      ...extra
    })
  }

  let codeSeq = 0
  blocks.forEach((b, i) => {
    if (b.kind === 'title') {
      const translation = opts.translations ? opts.translations.get(i) : null
      const pushTitle = (body) => paras.push({
        kind: 'title',
        runs: applyLatinFont(parseInline(body).map((r) => ({ ...r, bold: true })), opts.latinFont),
        fontName: opts.headingFont,
        fontSizePt: opts.titleSizePt,
        align: 'center',
        firstLineTwips: 0,
        leftIndentTwips: 0,
        beforeTwips: 0,
        afterTwips: ptTwips(18),
        lineMultiple: opts.lineSpacing
      })
      if (opts.translateOutput === 'translated' && translation != null) {
        pushTitle(translation)
      } else {
        pushTitle(b.text)
        if (opts.translateOutput === 'bilingual' && translation != null) {
          pushTitle(translation)
        }
      }
      return
    }
    if (b.kind === 'heading') {
      const spec = headingSpec[Math.min(Math.max(b.level ?? 1, 1), 3)]
      const center = b.unnumbered || (centerL1 && (b.level ?? 1) === 1)
      const joinWithNumber = (body) => (b.number ? `${b.number}${joiner}${body}` : body)
      const translation = opts.translations ? opts.translations.get(i) : null

      const pushHeading = (body) => paras.push({
        kind: 'heading',
        runs: applyLatinFont(parseInline(body).map((r) => ({ ...r, bold: true })), opts.latinFont),
        fontName: opts.headingFont,
        fontSizePt: spec.size,
        align: center ? 'center' : 'left',
        firstLineTwips: 0,
        leftIndentTwips: 0,
        beforeTwips: spec.before,
        afterTwips: spec.after,
        lineMultiple: opts.lineSpacing,
        level: b.level ?? 1,
        headingCenter: center
      })

      if (opts.translateOutput === 'translated' && translation != null) {
        pushHeading(joinWithNumber(translation))
      } else {
        pushHeading(joinWithNumber(b.text))
        // 双语：标题也成对翻译（同一样式与编号）
        if (opts.translateOutput === 'bilingual' && translation != null) {
          pushHeading(joinWithNumber(translation))
        }
      }
      return
    }
    if (b.kind === 'formula') {
      // 独立公式：居中、正体、保留 $$ 原文（Word 里可用公式编辑器替换）
      paras.push({
        kind: 'formula',
        runs: [{ text: b.text }],
        fontName: opts.bodyFont,
        fontSizePt: opts.bodySizePt,
        align: 'center',
        firstLineTwips: 0,
        leftIndentTwips: 0,
        beforeTwips: ptTwips(3),
        afterTwips: ptTwips(3),
        lineMultiple: opts.lineSpacing
      })
      return
    }
    if (b.kind === 'table') {
      paras.push({
        kind: 'table',
        runs: [],
        header: b.header || [],
        rows: b.rows || [],
        fontName: opts.bodyFont,
        fontSizePt: Math.min(opts.bodySizePt, 12),
        align: 'left',
        firstLineTwips: 0,
        leftIndentTwips: 0,
        beforeTwips: ptTwips(6),
        afterTwips: ptTwips(6),
        lineMultiple: opts.lineSpacing
      })
      return
    }
    if (b.kind === 'signoff') {
      // 落款（机构/日期）：右对齐
      paras.push({
        kind: 'signoff',
        runs: parseInline(b.text),
        fontName: opts.bodyFont,
        fontSizePt: opts.bodySizePt,
        align: 'right',
        firstLineTwips: 0,
        leftIndentTwips: 0,
        beforeTwips: ptTwips(6),
        afterTwips: 0,
        lineMultiple: opts.lineSpacing
      })
      return
    }
    if (b.kind === 'caption') {
      paras.push({
        kind: 'caption',
        runs: parseInline(b.text),
        fontName: opts.bodyFont,
        fontSizePt: opts.captionSizePt,
        align: 'center',
        firstLineTwips: 0,
        leftIndentTwips: 0,
        beforeTwips: ptTwips(3),
        afterTwips: ptTwips(3),
        lineMultiple: opts.lineSpacing
      })
      return
    }
    if (b.kind === 'ref') {
      paras.push({
        kind: 'ref',
        runs: parseInline(b.text),
        fontName: opts.bodyFont,
        fontSizePt: opts.refSizePt,
        align: 'left',
        firstLineTwips: -480, // 悬挂缩进：换行对齐编号
        leftIndentTwips: 480,
        beforeTwips: 0,
        afterTwips: 0,
        lineMultiple: opts.lineSpacing
      })
      return
    }
    if (b.kind === 'paragraph' || b.kind === 'item') {
      const joinWithNumber = (body) => (b.number ? `${b.number}${joiner}${body}` : body)
      const translation = opts.translations ? opts.translations.get(i) : null
      if (opts.translateOutput === 'translated' && translation != null) {
        pushTextPara(b.kind === 'item' ? 'item' : 'body', joinWithNumber(translation))
        return
      }
      pushTextPara(b.kind === 'item' ? 'item' : 'body', joinWithNumber(b.text))
      // 双语：译文沿用与原文相同的编号与样式
      if (opts.translateOutput === 'bilingual' && translation != null) {
        pushTextPara(b.kind === 'item' ? 'item' : 'body', joinWithNumber(translation))
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
    if (!text.trim() && p.kind !== 'table') continue
    if (p.kind === 'table') {
      const cells = [
        ...(p.header?.length ? [p.header.join(' | ')] : []),
        ...(p.rows || []).map((r) => r.join(' | '))
      ]
      parts.push(cells.join('\n'))
      prevGroup = ''
      continue
    }
    if ((p.kind === 'code' || p.kind === 'codeCaption') && p.groupId === prevGroup) {
      parts[parts.length - 1] += `\n${text}`
    } else {
      parts.push(text)
    }
    prevGroup = p.kind === 'code' || p.kind === 'codeCaption' ? p.groupId : ''
  }
  return parts.join('\n\n')
}
