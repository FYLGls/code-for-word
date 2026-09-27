# 码文 · Code for Word

[English](./README.md) | **中文**

<p align="center">
  <img src="docs/demo.gif" alt="码文演示：高亮代码粘贴进 Word" width="100%" />
</p>

**写代码很顺，贴进 Word 却颜色没了、中文乱了？**  
码文专做一件事：把 **高亮代码一键粘贴进 Word**，颜色、字体、中文都尽量保持原样——面向论文、报告与办公文稿。

| 常见麻烦 | 码文怎么做 |
|----------|------------|
| 编辑器里一复制，Word 里颜色没了、中文乱了 | **复制到 Word** 走系统 **RTF**，效果接近正规代码块 |
| 网上工具只能下 HTML / 预览糊弄 | Windows 本地应用；粘贴质量与 **下载 DOCX** 对齐 |
| 每次手动调字号、边距、边框 | 纸张、边距、边框、说明栏、行号一次设好 |

---

## 适合谁用？

**很适合：**
- 写 **论文 / 课程报告 / 实验报告**，正文在 Word，代码要好看  
- 代码注释里有 **中文**，受够了粘贴乱码  
- 想要一个能固定任务栏、托盘常驻的 **小软件**，而不是又一个网页  

**可能不适合：**
- 你只用 Markdown / LaTeX / Notion 交稿  
- 你主要在 Mac/Linux 上（仍可预览与下 DOCX；高质量 RTF 粘贴以 Windows 为主）

---

## 使用用户：安装

1. 在 [Releases](https://github.com/L00PLeGeNd/code-for-word/releases) 下载 **`CodeForWord-Setup-*.exe`**  
2. 安装 → 开始菜单打开 **Code for Word（码文）**  
3. 粘贴代码 → **复制到 Word** → Word 里 `Ctrl+V`  

```bash
npx codepaste
```

已安装则直接打开；未安装则拉起安装包。

> 当前公开发布版可能仍为**未签名**。若 SmartScreen 提示，选「仍要运行」。  
> 签名流程已接入，需自行购买证书后启用，见 [docs/code-signing.md](./docs/code-signing.md)。

关掉窗口会进 **系统托盘**（右键：显示 / 开机启动 / 退出）。

---

## 开发者

```bash
git clone <仓库地址>
cd codepaste
npm install
npm run dev
npm test
npm run dist:win
```

打 tag `v0.x.x` 并推送后，可由 Actions 发 Release。

<details>
<summary>目录结构</summary>

```
bin/           命令行入口
electron/      窗口 / 托盘 / 菜单
resources/     图标
server/        剪贴板服务
src/           界面与导出（RTF / HTML / DOCX）
```

勿提交：`dist/`、`release/`、`node_modules/`。

</details>

---

## 功能一览

- VS Code Light+ 高亮  
- 纸张 / 边距 / 代码边距 / 边框 / 说明栏 / 行号  
- **复制到 Word**（RTF）· **下载 DOCX**  
- 界面：中 / 英 / 法 / 西 / 俄  

---

## License

MIT。随便用、随便分享；有问题或想法欢迎在 GitHub 反馈。
