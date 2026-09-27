# Code for Word · 码文

**English** | [中文](./README.zh-CN.md)

<p align="center">
  <img src="docs/demo.gif" alt="Code for Word demo" width="100%" />
</p>

Paste highlighted code into Microsoft Word. Colors and Chinese text stay readable.

## Use it

### 1) In the browser (no install)

Open: **https://l00plegend.github.io/code-for-word/**

- Paste code → adjust options → **Download DOCX** (recommended on the web)
- **Copy to Word** works in the browser too, but Word paste quality varies; desktop app is better for that

### 2) Windows app (best paste quality)

1. Download `CodeForWord-Setup-*.exe` from [Releases](https://github.com/L00PLeGeNd/code-for-word/releases/latest)
2. Install and open **Code for Word**
3. Paste code → **Copy to Word** → `Ctrl+V` in Word

If Windows SmartScreen says the publisher is unknown, choose **More info → Run anyway** (builds are not code-signed yet).

Closing the window hides the app to the system tray.

## Develop

```bash
git clone https://github.com/L00PLeGeNd/code-for-word.git
cd code-for-word
npm install
npm run dev
npm test
npm run dist:win
```

## License

MIT
