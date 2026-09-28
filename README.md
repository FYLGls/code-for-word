# Code for Word · 码文

**English** | [中文](./README.zh-CN.md)

<p align="center">
  <img src="docs/demo.gif" alt="Code for Word demo" width="100%" />
</p>

Paste code or messy text into Word — as a syntax-highlighted code block, or reformat it into a clean academic/thesis document. Colors and Chinese text stay readable.

## Use it

### 1) In the browser (no install)

**Open web app:** https://l00plegend.github.io/code-for-word/

Source mirror: [Gitee · loopisme/code-for-word](https://gitee.com/loopisme/code-for-word) (synced with GitHub; one web URL only, so it cannot drift)

- Paste → adjust options → **Download DOCX** (recommended on the web)
- **Copy to Word** works in the browser too, but Word paste quality varies; desktop app is better for that

### 2) Windows app (best paste quality)

1. Download `CodeForWord-Setup-*.exe`:
   - **Gitee Releases (China):** https://gitee.com/loopisme/code-for-word/releases
   - GitHub Releases: https://github.com/L00PLeGeNd/code-for-word/releases/latest
2. Install and open **Code for Word**
3. Paste → **Copy to Word** → `Ctrl+V` in Word / WPS (prefer **Keep Source Formatting** in the paste options)

If Windows SmartScreen says the publisher is unknown, choose **More info → Run anyway** (builds are not code-signed yet).

Closing the window hides the app to the system tray.

## Two modes, one paste

**Auto**: paste anything and the app detects code vs. prose (weighted line voting — comments, brackets and operators vote code; CJK prose, sentence punctuation and markdown structure vote text). Override anytime with the **自动 / 代码 / 文本** tabs.

### Code mode

The original feature: syntax highlighting (highlight.js, auto-detect or pick a language), theme, font/size, line numbers, frame — copied to Word as RTF so colors survive.

### Text / paper mode

Turns messy text into a properly structured document:

- **Auto layering & numbering** — one of four schemes:
  - `academic` 1 / 1.1 / 1.1.1 (GB/T 7713 style, default)
  - `thesis` 第1章 / 1.1
  - `official` 一、（一）1.（1）a.
  - `none` keep the original numbering
- **Auto itemization** — bullets, `1.`/`（1）` lists, checkboxes `[ ]`/`[x]` → ☐/☑, emoji bullets (✅ ❌ ➤ …)
- **Mixed code + prose** — code inside a paper is kept as a highlighted, numbered `代码 N` block; paper structure is preserved
- **Structure recognition** — title, abstract, headings, figure/table captions (`图 2-1`), numbered references with hanging indent, `$$…$$` formulas, algorithm blocks, sign-off (right-aligned)
- **Tables** — Markdown pipe tables and Excel/TSV pastes become real Word tables
- **OCR cleanup** — full-width `１２３％（）` normalized to half-width, stray inter-character spaces squeezed (tabs/TSV preserved)
- **LaTeX leftovers** — `\textbf{}` → bold, `\textit{}` → italic, `\cite{}` stripped, `$x^2$` italic
- **Typography** — 宋体 for CJK + Times New Roman for Latin (automatic per-script run splitting), heading font/size, body size, line spacing, first-line indent, alignment, bold/italic/underline

### Translation

- **Free** via MyMemory (no key) or **AI** via any OpenAI-compatible endpoint (base URL + model + key, stored locally)
- Direction: auto / EN→中文 / 中文→EN; output: translation only / original + translation / original only
- **Auto-translate** runs after paste (900 ms debounce); block-level cache retranslates only what changed

Privacy: free translation sends the text to MyMemory; AI translation goes only to the endpoint you configure. Nothing else leaves the machine. A one-time notice is shown before the first translation.

## Develop

```bash
git clone https://github.com/L00PLeGeNd/code-for-word.git
cd code-for-word
npm install
npm run dev   # Vite + Electron shell
npm test      # 173 tests (vitest)
npm run dist:win
```

## License

MIT
