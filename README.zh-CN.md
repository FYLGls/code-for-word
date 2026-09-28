# 码文 · Code for Word

[English](./README.md) | **中文**

<p align="center">
  <img src="docs/demo.gif" alt="码文演示" width="100%" />
</p>

把代码或乱格式的文本贴进 Word——代码保持语法高亮，文本自动整理成规范的论文/公文格式。颜色和中文尽量保持正常。

## 怎么用

### 1）网页版（不用安装）

**打开网页版：** https://l00plegend.github.io/code-for-word/

源码镜像：[Gitee · loopisme/code-for-word](https://gitee.com/loopisme/code-for-word)（与 GitHub 同步；网页版只维护上述一个地址，避免双站过期/挂掉）

- 粘贴 → 调选项 → **下载 DOCX**（网页上最稳）
- 也可以点 **复制到 Word**，但浏览器粘贴效果不稳定；要高质量粘贴请用 Windows 桌面版

### 2）Windows 桌面版（粘贴效果最好）

1. 下载安装包 `CodeForWord-Setup-*.exe`（国内优先 Gitee）：
   - **Gitee Releases（国内）：** https://gitee.com/loopisme/code-for-word/releases
   - GitHub Releases：https://github.com/L00PLeGeNd/code-for-word/releases/latest
2. 安装后从开始菜单打开 **码文**
3. 粘贴 → **复制到 Word** → 到 Word / WPS 里 `Ctrl+V`（粘贴选项尽量选 **保留源格式**）

若出现 SmartScreen「未知发布者」，点 **更多信息 → 仍要运行**（目前安装包未做代码签名）。

关掉窗口会进系统托盘，不会退出。

## 一次粘贴，两种模式

**自动**：贴什么都行，应用会自动判断是代码还是文本（逐行加权投票——注释/括号/运算符投代码票，中文散文/句末标点/markdown 结构投文本票）。也可以随时用 **自动 / 代码 / 文本** 三个页签手动切换。

### 代码模式

最初的功能：语法高亮（highlight.js，可自动识别或手动指定语言）、主题、字体字号、行号、边框——以 RTF 写入剪贴板，颜色不丢。

### 文本 / 论文模式

把乱格式文本整理成规范文档：

- **自动分层与编号**，四种方案任选：
  - `学术` 1 / 1.1 / 1.1.1（GB/T 7713 风格，默认）
  - `论文` 第1章 / 1.1
  - `公文` 一、（一）1.（1）a.
  - `保持原样` 不改编号
- **自动分条列项** —— 项目符号、`1.`/`（1）` 列表、复选框 `[ ]`/`[x]` → ☐/☑、emoji 符号（✅ ❌ ➤ …）
- **代码与正文混排** —— 论文里的代码保留为高亮的 `代码 N` 编号块，论文结构不受影响
- **结构识别** —— 标题、摘要、各级标题、图表题注（`图 2-1`）、带悬挂缩进的参考文献、`$$…$$` 公式、算法块、落款（右对齐）
- **表格** —— Markdown 管道表格和 Excel/TSV 粘贴转成真正的 Word 表格
- **OCR 清理** —— 全角 `１２３％（）` 转半角，按行清理字间多余空格（Tab/TSV 不受影响）
- **LaTeX 残留** —— `\textbf{}` 转粗体、`\textit{}` 转斜体、`\cite{}` 剥离、`$x^2$` 斜体
- **排版** —— 中文宋体 + 西文 Times New Roman（按文字脚本自动切分）、标题字体字号、正文字号、行距、首行缩进、对齐方式、加粗/倾斜/下划线

### 翻译

- **免费**（MyMemory，无需 key）或 **AI**（任意 OpenAI 兼容接口：地址 + 模型 + key，仅存本地）
- 方向：自动 / 英→中 / 中→英；输出：仅译文 / 原文+译文 / 仅原文
- **自动翻译**：粘贴后自动执行（900ms 防抖）；块级缓存，只重译改动过的段落

隐私：免费翻译会把文本发送到 MyMemory；AI 翻译只发到你配置的接口。除此之外没有任何数据离开本机。首次翻译前会提示一次。

## 开发

```bash
git clone https://github.com/L00PLeGeNd/code-for-word.git
cd code-for-word
npm install
npm run dev   # Vite + Electron 壳
npm test      # 173 项测试（vitest）
npm run dist:win
```

## 许可证

MIT
