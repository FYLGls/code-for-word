# Code for Word · 码文

**English** | [中文说明](./README.zh-CN.md)

<p align="center">
  <img src="docs/demo.gif" alt="Code for Word demo: paste highlighted code into Word" width="100%" />
</p>

**Paste highlighted code into Word — colors, fonts, and CJK stay intact.**

Built for people who already live in VS Code / editors, but must deliver **Microsoft Word** — thesis chapters, lab reports, company docs, homework appendices.

| Pain | With Code for Word |
|------|----------------|
| Copy from editor → Word: colors gone, Chinese garbled, fonts wrong | **Copy to Word** writes real **RTF** — same look as a proper listing |
| Online “code to Word” tools that only spit HTML | Local Windows app; paste quality matches **Download DOCX** |
| Re-formatting every figure/listing by hand | Paper size, margins, frames, captions, line numbers in one place |

---

## Is this for you?

**Yes, if you…**
- Write **papers / theses / reports** and need clean code listings in Word  
- Work in **Chinese + English** code comments (CJK paste is a first-class concern)  
- Want a small **desktop app** (tray, taskbar pin), not another flaky webpage  

**Maybe not, if you…**
- Only need Markdown / LaTeX / Notion  
- Are on Mac/Linux and need native Word RTF paste (preview + DOCX still work; RTF bridge is Windows-first)

---

## Install (end users)

1. Download **`CodeForWord-Setup-*.exe`** from [Releases](https://github.com/L00PLeGeNd/code-for-word/releases)  
2. Install → open **Code for Word** from the Start menu  
3. Paste code → **Copy to Word** → `Ctrl+V` in Word  

```bash
npx codepaste
```

Opens the installed app, or launches the Setup if you don’t have it yet.

> Current public builds may still be **unsigned**. If SmartScreen appears, choose **Run anyway**.  
> Code signing is prepared — see [docs/code-signing.md](./docs/code-signing.md) (certificate required).

Closing the window hides to the **system tray** (right-click: show / open at login / quit).

---

## Develop

```bash
git clone <your-repo-url>
cd codepaste
npm install
npm run dev          # Electron + Vite
npm test
npm run dist:win     # → release/CodeForWord-Setup-*.exe
```

Tag `v0.x.x` and push to publish a Release via GitHub Actions.

<details>
<summary>Project layout</summary>

```
bin/           CLI
electron/      Window, tray, menu
resources/     Icons
server/        Clipboard service
src/           UI + export pipeline (RTF / HTML / DOCX)
```

Ignore: `dist/`, `release/`, `node_modules/`.

</details>

---

## Features

- VS Code Light+ highlighting  
- Paper, margins, code padding, frames, captions, line numbers  
- **Copy to Word** (RTF) · **Download DOCX**  
- UI: 中文 / English / Français / Español / Русский  

---

## License

MIT — free to use and share. Feedback and PRs welcome on GitHub.
