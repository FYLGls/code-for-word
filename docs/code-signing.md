# Windows 代码签名（解决 SmartScreen）

签名证书**必须你本人购买**（要企业/个人身份核验）。项目已接好：有证书后打包会自动签名。

## 1. 买什么证书

| 类型 | 效果 | 适合 |
|------|------|------|
| **OV Code Signing**（标准） | 签完仍可能短暂提示，下载多了 SmartScreen 会消 | 个人/小团队，最常见 |
| **EV Code Signing** | 信任更快，但密钥常绑 U 盾，CI 麻烦 | 预算更高时 |
| **Azure Trusted Signing** | 微软云签名，按量付费 | 已有 Azure 账号时可考虑 |

推荐先买 **OV Code Signing**，导出为 **`.pfx` / `.p12`**（带私钥）。

常见渠道（自行比价）：DigiCert、Sectigo、SSL.com，或国内代理商代办。准备：
- 证件 / 企业营业执照（按厂商要求）
- 能收验证邮件/电话的联系方式
- 约 **几天到两周** 出证

## 2. 本机签名打包

1. 把 `.pfx` 放到本机安全路径（**不要提交到 Git**）
2. PowerShell：

```powershell
cd path\to\code-for-word
$env:WIN_CSC_LINK = "C:\secure\codesign.pfx"
$env:WIN_CSC_KEY_PASSWORD = "你的PFX密码"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run dist:win
```

3. 验证是否签上：

```powershell
Get-AuthenticodeSignature .\release\CodeForWord-Setup-*.exe | Format-List *
```

`Status` 应为 `Valid`，`SignerCertificate` 里是你的名字/公司。

## 3. GitHub Actions 自动签名发版

在仓库 **Settings → Secrets and variables → Actions** 添加：

| Secret | 内容 |
|--------|------|
| `WIN_CSC_LINK` | `.pfx` 的 **Base64**（整文件编码后的一串字符） |
| `WIN_CSC_KEY_PASSWORD` | PFX 密码 |

生成 Base64（PowerShell）：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\secure\codesign.pfx")) | Set-Clipboard
```

打 tag `v*` 推送后，Release workflow 会用上述密钥签名再上传安装包。

## 4. 签完之后

- 把 README 里「未签名 / 仍要运行」改成「已签名」（证书到手、发过一版再改）
- OV 证书：前几天仍可能偶发 SmartScreen，属正常；下载量上来后会好
- **证书与密码绝对不要发到聊天、Issue、公开仓库**

## 5. 证书到手后跟我说

把 `.pfx` **只放在你本机**（或配好 GitHub Secrets），回一句「证书好了」。  
我帮你：跑一次签名打包 → 发 `v0.2.1`（或下一版）Release → 更新 README 提示文案。
