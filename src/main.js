import './styles.css'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

import {
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  BACKGROUND_OPTIONS,
  PAPER_OPTIONS,
  SIDE_MARGIN_OPTIONS,
  CODE_INSET_OPTIONS,
  ACCENT_OPTIONS,
  FRAME_STYLE_OPTIONS,
  formatFontSizeLabel,
  formatFontLabel
} from './themes.js'
import {
  CAPTION_MIN_ROWS,
  CAPTION_MAX_ROWS,
  CAPTION_BACKGROUND_OPTIONS,
  CAPTION_COLOR_OPTIONS,
  DEFAULT_CAPTION_FONT,
  clampCaptionRowCount
} from './lib/caption.js'
import { resolveFrameStyle } from './lib/frame.js'
import {
  LOCALES,
  detectLocale,
  setLocale,
  t,
  getLocale,
  getLocalePreference
} from './i18n.js'
import { codeToStyledLines } from './lib/tokenize.js'
import { linesToWordHtml } from './lib/word-html.js'
import { linesToRtf } from './lib/rtf.js'
import { linesToDocxBlob } from './lib/docx.js'
import { writeClipboard, downloadBlob, clipboardHostReady } from './lib/clipboard.js'
import { loadPrefs, savePrefs } from './prefs.js'
import { githubHome, openExternal } from './promo.js'

/** Fixed light theme; no theme picker. */
const THEME_ID = 'vscode-light'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('php', php)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('yaml', yaml)

const LANGS = [
  ['auto', 'Auto'],
  ['python', 'Python'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['java', 'Java'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['kotlin', 'Kotlin'],
  ['sql', 'SQL'],
  ['bash', 'Bash / Shell'],
  ['html', 'HTML / XML'],
  ['css', 'CSS'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['php', 'PHP']
]

const SAMPLE = `def binary_search(arr, target):
    """Classic binary search on a sorted list. Returns index or -1."""
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1


if __name__ == "__main__":
    nums = [1, 3, 5, 7, 9, 11, 13]
    print(binary_search(nums, 7))   # 3
    print(binary_search(nums, 4))   # -1
`

const els = {
  language: document.getElementById('language'),
  fontFamily: document.getElementById('fontFamily'),
  fontSize: document.getElementById('fontSize'),
  background: document.getElementById('background'),
  paper: document.getElementById('paper'),
  sideMargin: document.getElementById('sideMargin'),
  codeInset: document.getElementById('codeInset'),
  accent: document.getElementById('accent'),
  uiLang: document.getElementById('uiLang'),
  forceBold: document.getElementById('forceBold'),
  forceItalic: document.getElementById('forceItalic'),
  lineNumbers: document.getElementById('lineNumbers'),
  rowRules: document.getElementById('rowRules'),
  source: document.getElementById('source'),
  preview: document.getElementById('preview'),
  metaSource: document.getElementById('metaSource'),
  metaPreview: document.getElementById('metaPreview'),
  status: document.getElementById('status'),
  btnDownload: document.getElementById('btnDownload'),
  btnCopy: document.getElementById('btnCopy'),
  btnSample: document.getElementById('btnSample'),
  btnClear: document.getElementById('btnClear'),
  brandHome: document.getElementById('brandHome'),
  btnGitHub: document.getElementById('btnGitHub'),
  framePicker: document.getElementById('framePicker'),
  btnFrame: document.getElementById('btnFrame'),
  framePanel: document.getElementById('framePanel'),
  frameLabel: document.getElementById('frameLabel'),
  frameThumb: document.getElementById('frameThumb'),
  captionEnabled: document.getElementById('captionEnabled'),
  captionRow: document.getElementById('captionRow'),
  captionLines: document.getElementById('captionLines'),
  captionFont: document.getElementById('captionFont'),
  captionColor: document.getElementById('captionColor'),
  captionBg: document.getElementById('captionBg'),
  captionBold: document.getElementById('captionBold'),
  captionItalic: document.getElementById('captionItalic'),
  captionAddRow: document.getElementById('captionAddRow'),
  captionRemoveRow: document.getElementById('captionRemoveRow')
}

/** @type {string[]} */
let captionLineValues = ['']

/** @type {import('./lib/frame.js').FrameStyle} */
let frameStyle = 'bar'
/** Hover preview override (null = use committed frameStyle). */
let frameHover = /** @type {import('./lib/frame.js').FrameStyle | null} */ (null)

let timer = 0
let hostOk = false
let exportBusy = false
/** @type {{ lines: import('./themes.js').StyledRun[][], language: string, theme: import('./themes.js').Theme } | null} */
let latest = null
let selectsReady = false

function setStatus(text, kind = '') {
  els.status.textContent = text
  els.status.className = `status${kind ? ` ${kind}` : ''}`
}

function applyStaticI18n() {
  document.documentElement.lang = getLocale() === 'zh' ? 'zh-CN' : getLocale()
  document.title = t('title')
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n')
    if (!key) return
    node.textContent = t(key)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder')
    if (key && 'placeholder' in node) node.placeholder = t(key)
  })
  document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    const key = node.getAttribute('data-i18n-aria')
    if (key) node.setAttribute('aria-label', t(key))
  })
}

function collectPrefs() {
  readCaptionInputs()
  return {
    language: els.language?.value || 'auto',
    fontFamily: els.fontFamily?.value || 'Consolas',
    fontSize: els.fontSize?.value || '9',
    background: els.background?.value || 'paper',
    paper: els.paper?.value || 'fit',
    sideMargin: els.sideMargin?.value || 'auto',
    codeInset: els.codeInset?.value || 'auto',
    accent: els.accent?.value || 'blue',
    forceBold: !!els.forceBold?.checked,
    forceItalic: !!els.forceItalic?.checked,
    lineNumbers: !!els.lineNumbers?.checked,
    rowRules: !!els.rowRules?.checked,
    frameStyle,
    captionEnabled: !!els.captionEnabled?.checked,
    captionFont: els.captionFont?.value || DEFAULT_CAPTION_FONT,
    captionColor: els.captionColor?.value || 'black',
    captionBg: els.captionBg?.value || 'grey',
    captionBold: !!els.captionBold?.checked,
    captionItalic: !!els.captionItalic?.checked,
    captionLines: captionLineValues.slice()
  }
}

function persistPrefs() {
  savePrefs(collectPrefs())
}

/** @param {import('./prefs.js').Prefs} p */
function applyPrefs(p) {
  if (!p || !Object.keys(p).length) return
  const setVal = (el, v) => {
    if (!el || v == null || v === '') return
    el.value = String(v)
  }
  setVal(els.language, p.language)
  setVal(els.fontFamily, p.fontFamily)
  setVal(els.fontSize, p.fontSize)
  setVal(els.background, p.background)
  setVal(els.paper, p.paper)
  setVal(els.sideMargin, p.sideMargin)
  setVal(els.codeInset, p.codeInset)
  setVal(els.accent, p.accent)
  setVal(els.captionFont, p.captionFont)
  setVal(els.captionColor, p.captionColor)
  setVal(els.captionBg, p.captionBg)
  if (els.forceBold) els.forceBold.checked = !!p.forceBold
  if (els.forceItalic) els.forceItalic.checked = !!p.forceItalic
  if (els.lineNumbers) els.lineNumbers.checked = p.lineNumbers !== false
  if (els.rowRules) els.rowRules.checked = p.rowRules !== false
  if (els.captionEnabled) els.captionEnabled.checked = !!p.captionEnabled
  if (els.captionBold) els.captionBold.checked = !!p.captionBold
  if (els.captionItalic) els.captionItalic.checked = !!p.captionItalic
  if (Array.isArray(p.captionLines) && p.captionLines.length) {
    captionLineValues = p.captionLines.map((s) => String(s ?? ''))
  }
  if (p.frameStyle) frameStyle = resolveFrameStyle(p.frameStyle)
}

function openGitHubHome() {
  openExternal(githubHome())
}

function refillFontSizes() {
  if (!els.fontSize) return
  const keep = els.fontSize.value || '9'
  els.fontSize.innerHTML = ''
  const locale = getLocale()
  for (const size of FONT_SIZE_OPTIONS) {
    const opt = document.createElement('option')
    opt.value = String(size.pt)
    opt.textContent = formatFontSizeLabel(size, locale)
    els.fontSize.appendChild(opt)
  }
  els.fontSize.value = keep
}

function fillKeyedSelect(el, options, keep, fallback) {
  if (!el) return
  el.innerHTML = ''
  for (const item of options) {
    const opt = document.createElement('option')
    opt.value = item.id
    opt.textContent = t(item.labelKey)
    el.appendChild(opt)
  }
  el.value = keep || fallback
  if (![...el.options].some((o) => o.value === el.value)) el.value = fallback
}

function refillLabeledSelects() {
  const keepBg = els.background?.value || 'paper'
  const keepPaper = els.paper?.value || 'fit'
  const keepMargin = els.sideMargin?.value || 'auto'
  const keepCodeInset = els.codeInset?.value || 'auto'
  const keepAccent = els.accent?.value || 'blue'
  const keepUi = getLocalePreference()

  if (els.uiLang) {
    els.uiLang.innerHTML = ''
    for (const loc of LOCALES) {
      const opt = document.createElement('option')
      opt.value = loc.id
      opt.textContent = loc.labelKey ? t(loc.labelKey) : loc.label
      els.uiLang.appendChild(opt)
    }
    els.uiLang.value = keepUi
  }

  fillKeyedSelect(els.background, BACKGROUND_OPTIONS, keepBg, 'paper')
  fillKeyedSelect(els.paper, PAPER_OPTIONS, keepPaper, 'fit')
  fillKeyedSelect(els.sideMargin, SIDE_MARGIN_OPTIONS, keepMargin, 'auto')
  fillKeyedSelect(els.codeInset, CODE_INSET_OPTIONS, keepCodeInset, 'auto')
  fillKeyedSelect(els.accent, ACCENT_OPTIONS, keepAccent, 'blue')
  const keepCapBg = els.captionBg?.value || 'grey'
  const keepCapColor = els.captionColor?.value || 'black'
  fillKeyedSelect(els.captionBg, CAPTION_BACKGROUND_OPTIONS, keepCapBg, 'grey')
  fillKeyedSelect(els.captionColor, CAPTION_COLOR_OPTIONS, keepCapColor, 'black')
  refillFontSizes()
  refillFontSelects()
  syncCaptionLineLabels()
}

function refillFontSelects() {
  const keepCode = els.fontFamily?.value || 'Consolas'
  const keepCap = els.captionFont?.value || DEFAULT_CAPTION_FONT
  for (const [el, keep, fallback] of [
    [els.fontFamily, keepCode, 'Consolas'],
    [els.captionFont, keepCap, DEFAULT_CAPTION_FONT]
  ]) {
    if (!el) continue
    el.innerHTML = ''
    for (const font of FONT_OPTIONS) {
      const opt = document.createElement('option')
      opt.value = font.id
      opt.textContent = formatFontLabel(font, t)
      el.appendChild(opt)
    }
    el.value = FONT_OPTIONS.some((f) => f.id === keep) ? keep : fallback
  }
}

function fillSelects() {
  if (!selectsReady) {
    for (const [id, label] of LANGS) {
      const opt = document.createElement('option')
      opt.value = id
      opt.textContent = id === 'auto' ? (getLocale() === 'zh' ? '自动检测' : 'Auto') : label
      els.language.appendChild(opt)
    }
    selectsReady = true
  } else if (els.language?.options[0]) {
    els.language.options[0].textContent = getLocale() === 'zh' ? '自动检测' : 'Auto'
  }
  refillLabeledSelects()
}

function resolveBackground(theme) {
  const id = els.background?.value || 'paper'
  const preset = BACKGROUND_OPTIONS.find((b) => b.id === id)
  if (!preset || preset.color == null) return theme?.background || '#F5F5F5'
  return preset.color
}

function resolveSideMarginTwips() {
  const id = els.sideMargin?.value || 'auto'
  const preset = SIDE_MARGIN_OPTIONS.find((s) => s.id === id)
  if (!preset || preset.twips == null) return null
  return { left: preset.twips, right: preset.twips }
}

function resolveCodeInsetTwipsOption() {
  const id = els.codeInset?.value || 'auto'
  const preset = CODE_INSET_OPTIONS.find((s) => s.id === id)
  if (!preset || preset.twips == null) return null
  return preset.twips
}

function resolvePageContentTwips() {
  const id = els.paper?.value || 'fit'
  const preset = PAPER_OPTIONS.find((p) => p.id === id)
  if (!preset) return null
  return preset.contentTwips
}

function resolveAccent() {
  const id = els.accent?.value || 'blue'
  return ACCENT_OPTIONS.find((a) => a.id === id)?.color || '#007ACC'
}

function currentOptions() {
  readCaptionInputs()
  const theme = latest?.theme || { mode: 'light', foreground: '#000000', lineNumber: '#237893', accentLeft: '#007ACC' }
  const background = resolveBackground(theme)
  const noFill = background === 'none'
  const darkPaper = !noFill && /^#1[Ee]1[Ee]1[Ee]$/i.test(background)
  const marker = resolveAccent()
  return {
    background: noFill ? 'none' : background,
    noFill,
    foreground: darkPaper ? '#D4D4D4' : (theme.foreground || '#000000'),
    // Accent: bar + line numbers share marker
    lineNumberColor: marker,
    accentLeft: marker,
    fontName: els.fontFamily?.value || 'Consolas',
    fontSizePt: Number(els.fontSize.value) || 9,
    lineNumbers: els.lineNumbers.checked,
    rowRules: els.rowRules ? els.rowRules.checked : true,
    lineNumberSuffix: '.',
    frameStyle: frameHover || frameStyle,
    forceBold: !!els.forceBold?.checked,
    forceItalic: !!els.forceItalic?.checked,
    sideMarginTwips: resolveSideMarginTwips(),
    pageContentTwips: resolvePageContentTwips(),
    paperId: els.paper?.value || 'fit',
    codeInsetTwips: resolveCodeInsetTwipsOption(),
    captionEnabled: !!els.captionEnabled?.checked,
    captionLines: captionLineValues.slice(),
    captionFont: els.captionFont?.value || DEFAULT_CAPTION_FONT,
    captionBackground: CAPTION_BACKGROUND_OPTIONS.find((b) => b.id === (els.captionBg?.value || 'grey'))?.color
      || '#D9D9D9',
    captionColor: CAPTION_COLOR_OPTIONS.find((c) => c.id === (els.captionColor?.value || 'black'))?.color
      || '#000000',
    captionBold: !!els.captionBold?.checked,
    captionItalic: !!els.captionItalic?.checked,
    captionPlaceholder: t('captionPlaceholder')
  }
}

function readCaptionInputs() {
  if (!els.captionLines) return
  const inputs = els.captionLines.querySelectorAll('input[data-caption-line]')
  captionLineValues = Array.from(inputs).map((el) => /** @type {HTMLInputElement} */ (el).value)
  if (!captionLineValues.length) captionLineValues = ['']
}

function syncCaptionLineLabels() {
  if (!els.captionLines) return
  els.captionLines.querySelectorAll('[data-caption-label]').forEach((node, i) => {
    node.textContent = t('captionRowN', { n: i + 1 })
  })
  els.captionLines.querySelectorAll('input[data-caption-line]').forEach((node) => {
    if ('placeholder' in node) /** @type {HTMLInputElement} */ (node).placeholder = t('captionPlaceholder')
  })
}

function renderCaptionLineEditors(focusIndex = -1) {
  if (!els.captionLines) return
  const n = clampCaptionRowCount(captionLineValues.length)
  while (captionLineValues.length < n) captionLineValues.push('')
  captionLineValues = captionLineValues.slice(0, n)
  els.captionLines.innerHTML = ''
  captionLineValues.forEach((value, i) => {
    const label = document.createElement('label')
    label.className = 'caption-field'
    const span = document.createElement('span')
    span.dataset.captionLabel = '1'
    span.textContent = t('captionRowN', { n: i + 1 })
    const input = document.createElement('input')
    input.type = 'text'
    input.maxLength = 200
    input.autocomplete = 'off'
    input.dataset.captionLine = String(i)
    input.value = value
    input.placeholder = t('captionPlaceholder')
    input.addEventListener('input', () => {
      readCaptionInputs()
      persistPrefs()
      scheduleRender()
    })
    label.appendChild(span)
    label.appendChild(input)
    els.captionLines.appendChild(label)
  })
  if (els.captionAddRow) els.captionAddRow.disabled = captionLineValues.length >= CAPTION_MAX_ROWS
  if (els.captionRemoveRow) els.captionRemoveRow.disabled = captionLineValues.length <= CAPTION_MIN_ROWS
  if (focusIndex >= 0) {
    const el = els.captionLines.querySelector(`input[data-caption-line="${focusIndex}"]`)
    /** @type {HTMLInputElement | null} */ (el)?.focus()
  }
}

function syncCaptionRow(focus = false) {
  const on = !!els.captionEnabled?.checked
  if (els.captionRow) els.captionRow.hidden = !on
  if (on) {
    renderCaptionLineEditors(focus ? 0 : -1)
  }
}

function addCaptionRow() {
  readCaptionInputs()
  if (captionLineValues.length >= CAPTION_MAX_ROWS) return
  captionLineValues.push('')
  renderCaptionLineEditors(captionLineValues.length - 1)
  scheduleRender()
}

function removeCaptionRow() {
  readCaptionInputs()
  if (captionLineValues.length <= CAPTION_MIN_ROWS) return
  captionLineValues.pop()
  renderCaptionLineEditors()
  scheduleRender()
}

function syncFramePicker() {
  const key = FRAME_STYLE_OPTIONS.find((f) => f.id === frameStyle)?.labelKey || 'frameBar'
  if (els.frameLabel) els.frameLabel.textContent = t(key)
  if (els.frameThumb) els.frameThumb.dataset.frame = frameStyle
  els.framePanel?.querySelectorAll('.frame-option').forEach((btn) => {
    const id = btn.getAttribute('data-frame')
    const on = id === frameStyle
    btn.setAttribute('aria-selected', on ? 'true' : 'false')
    btn.classList.toggle('is-active', on)
  })
}

function closeFramePanel() {
  if (!els.framePanel) return
  els.framePanel.hidden = true
  els.btnFrame?.setAttribute('aria-expanded', 'false')
}

function openFramePanel() {
  if (!els.framePanel) return
  els.framePanel.hidden = false
  els.btnFrame?.setAttribute('aria-expanded', 'true')
}

function setFrameStyle(id) {
  frameStyle = resolveFrameStyle(id)
  syncFramePicker()
  closeFramePanel()
  persistPrefs()
  renderPreview()
}

function countStats(code) {
  if (!code) return { lines: 0, chars: 0 }
  const normalized = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized === '' ? 0 : normalized.replace(/\n$/, '').split('\n').length
  return { lines, chars: [...normalized].length }
}

function renderPreview() {
  const code = els.source.value
  latest = codeToStyledLines(code, els.language.value, THEME_ID, hljs)
  const opts = currentOptions()
  const { lines, chars } = countStats(code)
  els.metaSource.textContent = code ? t('metaCount', { lines, chars }) : t('source')
  const sizeOpt = FONT_SIZE_OPTIONS.find((o) => o.pt === opts.fontSizePt)
  const sizeLabel = sizeOpt ? formatFontSizeLabel(sizeOpt, getLocale()) : `${opts.fontSizePt} pt`
  els.metaPreview.textContent = code ? `${latest.language} · ${opts.fontName} · ${sizeLabel}` : t('preview')

  const wrap = els.preview
  wrap.dataset.mode = !opts.noFill && /^#1[Ee]1[Ee]1[Ee]$/i.test(opts.background) ? 'dark' : 'light'
  wrap.style.background = ''
  if (!code) {
    wrap.innerHTML = `<div class="preview-empty">${t('previewEmpty')}</div>`
    return
  }
  wrap.innerHTML = `<div class="preview-sheet">${linesToWordHtml(latest.lines, {
    ...opts,
    preview: true,
    captionPlaceholder: t('captionPlaceholder')
  })}</div>`
}

function scheduleRender() {
  clearTimeout(timer)
  timer = setTimeout(renderPreview, 80)
}

async function refreshHost() {
  hostOk = await clipboardHostReady()
}

async function copyToWord() {
  if (exportBusy) return
  if (!els.source.value.trim()) {
    setStatus(t('statusNeedCode'), 'err')
    return
  }
  exportBusy = true
  try {
    const opts = currentOptions()
    latest = codeToStyledLines(els.source.value, els.language.value, THEME_ID, hljs)
    const rtf = linesToRtf(latest.lines, opts)
    const desktop = typeof window !== 'undefined' ? window.codepasteDesktop : null
    const html = desktop?.isDesktop ? '' : linesToWordHtml(latest.lines, opts)
    const result = await writeClipboard({ rtf, html, plain: els.source.value })
    if (result.via === 'native-rtf') setStatus(t('statusCopied'), 'ok')
    else if (
      result.via === 'browser-html' ||
      result.via === 'execCommand' ||
      result.via === 'browser-text'
    ) {
      setStatus(t('statusCopyWeb'), 'ok')
    } else setStatus(t('statusCopyFallback'), 'err')
  } catch (err) {
    console.error(err)
    setStatus(t('statusCopyFail'), 'err')
  } finally {
    exportBusy = false
  }
}

function stampName() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
}

async function downloadDocx() {
  if (exportBusy) return
  if (!els.source.value.trim()) {
    setStatus(t('statusNeedCode'), 'err')
    return
  }
  exportBusy = true
  try {
    latest = codeToStyledLines(els.source.value, els.language.value, THEME_ID, hljs)
    const blob = await linesToDocxBlob(latest.lines, currentOptions())
    downloadBlob(blob, `listing-${stampName()}.docx`)
    setStatus(t('statusDocx'), 'ok')
  } catch (err) {
    console.error(err)
    setStatus(t('statusDocxFail'), 'err')
  } finally {
    exportBusy = false
  }
}

function syncDesktopLocale() {
  const desktop = typeof window !== 'undefined' ? window.codepasteDesktop : null
  if (desktop?.setLocale) {
    desktop.setLocale(getLocale()).catch(() => {})
  }
}

function applyLocale(id) {
  setLocale(id)
  localStorage.setItem('codepaste-locale', getLocalePreference())
  applyStaticI18n()
  fillSelects()
  syncFramePicker()
  refreshHost()
  renderPreview()
  syncDesktopLocale()
}

const startLocale = detectLocale()
setLocale(startLocale)
fillSelects()
applyStaticI18n()
syncDesktopLocale()
const savedPrefs = loadPrefs()
if (Object.keys(savedPrefs).length) {
  applyPrefs(savedPrefs)
} else {
  if (els.background) els.background.value = 'paper'
  if (els.sideMargin) els.sideMargin.value = 'auto'
  if (els.codeInset) els.codeInset.value = 'auto'
  if (els.accent) els.accent.value = 'blue'
  if (els.language) els.language.value = 'auto'
  els.lineNumbers.checked = true
  if (els.captionEnabled) els.captionEnabled.checked = false
}
syncFramePicker()
syncCaptionRow()

function onSettingChange() {
  persistPrefs()
  renderPreview()
}

els.source.addEventListener('input', scheduleRender)
els.language.addEventListener('change', onSettingChange)
els.fontFamily?.addEventListener('change', onSettingChange)
els.fontSize.addEventListener('change', onSettingChange)
els.background?.addEventListener('change', onSettingChange)
els.paper?.addEventListener('change', onSettingChange)
els.sideMargin?.addEventListener('change', onSettingChange)
els.codeInset?.addEventListener('change', onSettingChange)
els.accent?.addEventListener('change', onSettingChange)
els.forceBold?.addEventListener('change', onSettingChange)
els.forceItalic?.addEventListener('change', onSettingChange)
els.lineNumbers.addEventListener('change', onSettingChange)
els.rowRules?.addEventListener('change', onSettingChange)
els.captionEnabled?.addEventListener('change', () => {
  syncCaptionRow(true)
  onSettingChange()
})
els.captionFont?.addEventListener('change', onSettingChange)
els.captionColor?.addEventListener('change', onSettingChange)
els.captionBg?.addEventListener('change', onSettingChange)
els.captionBold?.addEventListener('change', onSettingChange)
els.captionItalic?.addEventListener('change', onSettingChange)
els.captionAddRow?.addEventListener('click', () => {
  addCaptionRow()
  persistPrefs()
})
els.captionRemoveRow?.addEventListener('click', () => {
  removeCaptionRow()
  persistPrefs()
})
els.uiLang?.addEventListener('change', () => applyLocale(els.uiLang.value))
els.btnCopy.addEventListener('click', copyToWord)
els.btnDownload?.addEventListener('click', downloadDocx)
els.brandHome?.addEventListener('click', openGitHubHome)
els.btnGitHub?.addEventListener('click', openGitHubHome)

els.btnFrame?.addEventListener('click', (e) => {
  e.stopPropagation()
  if (els.framePanel?.hidden) openFramePanel()
  else closeFramePanel()
})
els.framePanel?.querySelectorAll('.frame-option').forEach((btn) => {
  btn.addEventListener('mouseenter', () => {
    const id = btn.getAttribute('data-frame')
    if (!id) return
    frameHover = resolveFrameStyle(id)
    renderPreview()
  })
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    frameHover = null
    setFrameStyle(btn.getAttribute('data-frame') || 'bar')
  })
})
els.framePanel?.addEventListener('mouseleave', () => {
  frameHover = null
  renderPreview()
})
document.addEventListener('click', (e) => {
  if (!els.framePicker?.contains(/** @type {Node} */ (e.target))) closeFramePanel()
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFramePanel()
})
els.btnSample.addEventListener('click', () => {
  els.source.value = SAMPLE
  els.language.value = 'python'
  renderPreview()
  setStatus(t('statusSample'))
})
els.btnClear.addEventListener('click', () => {
  els.source.value = ''
  renderPreview()
  setStatus('')
})

els.source.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return
  e.preventDefault()
  const start = els.source.selectionStart
  const end = els.source.selectionEnd
  const v = els.source.value
  els.source.value = `${v.slice(0, start)}    ${v.slice(end)}`
  els.source.selectionStart = els.source.selectionEnd = start + 4
  scheduleRender()
})

renderPreview()
refreshHost()
setInterval(refreshHost, 8000)

// Desktop app menu → same actions as toolbar buttons
if (typeof window !== 'undefined' && window.codepasteDesktop?.onMenuAction) {
  window.codepasteDesktop.onMenuAction((action) => {
    if (action === 'copy-to-word') {
      els.btnCopy?.click()
      return
    }
    if (action === 'download-docx') {
      els.btnDownload?.click()
    }
  })
}

/** README demo capture helpers: ?demo=1 then call window.__codepasteDemo(step) */
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const DEMO_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">' +
  '<path fill="#111" d="M5 2.5v20.2l5.1-5 3.1 7.4 2.8-1.2-3.1-7.3H19z"/>' +
  '<path fill="#fff" stroke="#111" stroke-width="1.1" d="M6.2 4.2v16.1l4.2-4.1 2.7 6.4 1.7-.7-2.7-6.3h5.9z"/>' +
  '</svg>'

function ensureDemoCursor() {
  let el = document.getElementById('__demo-cursor')
  if (!el) {
    el = document.createElement('div')
    el.id = '__demo-cursor'
    el.innerHTML = DEMO_CURSOR_SVG
    Object.assign(el.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '28px',
      height: '28px',
      margin: '0',
      padding: '0',
      pointerEvents: 'none',
      zIndex: '2147483647',
      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35))',
      transform: 'translate(-2px, -1px)',
      willChange: 'left, top'
    })
    document.documentElement.appendChild(el)
  }
  return el
}

function demoSetCursor(x, y) {
  const el = ensureDemoCursor()
  el.style.left = `${Math.round(x)}px`
  el.style.top = `${Math.round(y)}px`
  return { x, y }
}

function demoTargetPoint(sel, ox = 0.55, oy = 0.55) {
  const node = typeof sel === 'string' ? document.querySelector(sel) : sel
  if (!node) return null
  const r = node.getBoundingClientRect()
  return {
    x: r.left + r.width * ox,
    y: r.top + r.height * oy,
    rect: { left: r.left, top: r.top, width: r.width, height: r.height }
  }
}

function demoResetDefaults() {
  if (els.captionEnabled) els.captionEnabled.checked = false
  if (els.forceBold) els.forceBold.checked = false
  if (els.forceItalic) els.forceItalic.checked = false
  if (els.lineNumbers) els.lineNumbers.checked = true
  if (els.background) els.background.value = 'paper'
  if (els.paper) els.paper.value = 'a4'
  if (els.sideMargin) els.sideMargin.value = 'auto'
  if (els.codeInset) els.codeInset.value = 'auto'
  if (els.accent) els.accent.value = 'blue'
  if (els.fontSize) els.fontSize.value = '9'
  frameStyle = 'bar'
  syncFramePicker()
  syncCaptionRow()
  closeFramePanel()
}

async function demoStep(step) {
  ensureDemoCursor()
  switch (step) {
    case 0: {
      demoResetDefaults()
      els.source.value = ''
      setStatus('')
      renderPreview()
      const p = demoTargetPoint('#btnSample', 0.4, 2.4) || { x: 640, y: 120 }
      demoSetCursor(p.x, p.y)
      break
    }
    case 1: {
      demoResetDefaults()
      els.source.value = ''
      setStatus('')
      renderPreview()
      const p = demoTargetPoint('#btnSample') || { x: 700, y: 48 }
      demoSetCursor(p.x, p.y)
      break
    }
    case 2: {
      demoResetDefaults()
      els.source.value = SAMPLE
      els.language.value = 'python'
      renderPreview()
      setStatus(t('statusSample'))
      const p = demoTargetPoint('#btnSample') || { x: 700, y: 48 }
      demoSetCursor(p.x, p.y)
      break
    }
    case 3: {
      const p = demoTargetPoint('#btnCopy') || { x: 1180, y: 48 }
      demoSetCursor(p.x, p.y)
      break
    }
    case 4: {
      setStatus(t('statusCopied'), 'ok')
      const p = demoTargetPoint('#btnCopy') || { x: 1180, y: 48 }
      demoSetCursor(p.x, p.y)
      break
    }
    case 5: {
      closeFramePanel()
      const p = demoTargetPoint('#btnFrame') || { x: 900, y: 100 }
      demoSetCursor(p.x, p.y)
      break
    }
    case 6: {
      openFramePanel()
      await delay(40)
      const p = demoTargetPoint('#framePanel [data-frame="box"]') || demoTargetPoint('#btnFrame')
      if (p) demoSetCursor(p.x, p.y)
      break
    }
    case 7: {
      frameStyle = 'box'
      syncFramePicker()
      closeFramePanel()
      renderPreview()
      setStatus(t('statusCopied'), 'ok')
      const p = demoTargetPoint('#btnFrame') || { x: 900, y: 100 }
      demoSetCursor(p.x, p.y)
      break
    }
    default:
      break
  }
  await delay(40)
  return step
}

/** Instant cursor move for interpolated GIF frames (no CSS transition = no stutter). */
function demoCursorAt(x, y) {
  return demoSetCursor(x, y)
}

function demoTargets() {
  const pick = (sel, ox, oy) => {
    const p = demoTargetPoint(sel, ox, oy)
    return p ? { x: p.x, y: p.y } : null
  }
  return {
    sample: pick('#btnSample'),
    copy: pick('#btnCopy'),
    frame: pick('#btnFrame'),
    boxOption: pick('#framePanel [data-frame="box"]'),
    idle: pick('#btnSample', 0.4, 2.4)
  }
}

function demoLerp(a, b, t) {
  const e = t * t * (3 - 2 * t) // smoothstep
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e }
}

const DEMO_FRAME_COUNT = 36

/**
 * Full README GIF storyboard (fullscreen + visible cursor, English UI).
 * Call window.__codepasteDemoFrame(i) for i in 0..count-1, screenshot each.
 *
 * 0–1 empty · 2 hover Sample · 3–4 sample loaded
 * 5–16 move → Copy · 17–18 on Copy · 19–21 copied
 * 22–31 move → Border · 32 on Border · 33–34 open+Box · 35 box done
 */
async function demoFrame(index) {
  ensureDemoCursor()
  const ease = (from, to, t) => {
    const p = demoLerp(from, to, t)
    demoSetCursor(p.x, p.y)
  }
  const total = DEMO_FRAME_COUNT
  const i = Math.max(0, Math.min(index, total - 1))

  if (i <= 1) {
    await demoStep(0)
    return { index: i, total, holdMs: i === 0 ? 900 : 700 }
  }
  if (i === 2) {
    await demoStep(1)
    return { index: i, total, holdMs: 650 }
  }
  if (i <= 4) {
    await demoStep(2)
    return { index: i, total, holdMs: i === 3 ? 900 : 750 }
  }
  if (i <= 16) {
    await demoStep(2)
    const tg = demoTargets()
    ease(tg.sample, tg.copy, (i - 4) / 12)
    return { index: i, total, holdMs: 55 }
  }
  if (i <= 18) {
    await demoStep(3)
    return { index: i, total, holdMs: 500 }
  }
  if (i <= 21) {
    await demoStep(4)
    return { index: i, total, holdMs: i === 19 ? 700 : 850 }
  }
  if (i <= 31) {
    await demoStep(4)
    const tg = demoTargets()
    ease(tg.copy, tg.frame, (i - 21) / 10)
    return { index: i, total, holdMs: 55 }
  }
  if (i === 32) {
    await demoStep(5)
    return { index: i, total, holdMs: 600 }
  }
  if (i <= 34) {
    await demoStep(6)
    return { index: i, total, holdMs: i === 33 ? 700 : 900 }
  }
  await demoStep(7)
  return { index: i, total, holdMs: 1400 }
}

if (typeof window !== 'undefined') {
  window.__codepasteDemo = demoStep
  window.__codepasteDemoCursorAt = demoCursorAt
  window.__codepasteDemoTargets = demoTargets
  window.__codepasteDemoFrame = demoFrame
  window.__codepasteDemoFrameCount = DEMO_FRAME_COUNT
  const demo = new URLSearchParams(location.search).get('demo')
  if (demo === '1') {
    // Stable README capture: English UI only
    document.documentElement.classList.add('demo-capture')
    applyLocale('en')
    if (els.uiLang) els.uiLang.value = 'en'
    demoStep(0)
  }
}
