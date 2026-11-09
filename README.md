# dsh-qq-vision-fix

[English](README.en.md) · [上游项目元数据](https://api.github.com/repositories/1431211359) · [上游 Issue #10](https://api.github.com/repositories/1431211359/issues/10)

这是一个独立维护的 MIT 补丁包。适用基线为 dsh-qq-onebot **1.3.0**，上游提交 **`224ad59603b176580241b45d3f1b3ec53a5d7eeb`**。感谢 dsh-qq 原作者、贡献者及问题报告者。版权声明随 [LICENSE](LICENSE) 保留。

原插件能下载 QQ 图片，却只向模型发送缓存路径及调用 `read_image` 的文字提示。受影响的 QQ 会话没有注册这个工具，私聊连发时图片位置也被字符串拼接丢失。补丁调用 DSH 的 `saveImages()` 保存附件，保留 OneBot 段顺序，通过 `admitPromptContent()` 校验图文块后送入用户消息。私聊合并和夜间暂存都会保留图片引用。图片来源、格式、大小或附件服务校验失败时，QQ 会收到明确的失败回执。

## 应用补丁

在 Windows PowerShell 中进入**本补丁仓库根目录**。使用 Git 和 Node.js；本次验证用 Node.js 26.13.0。以下命令创建独立的上游工作副本，目标目录应尚不存在。

```powershell
$url = (Invoke-RestMethod 'https://api.github.com/repositories/1431211359').clone_url
git clone --config core.autocrlf=false --no-checkout $url ../dsh-qq-work
git -C ../dsh-qq-work switch --detach 224ad59603b176580241b45d3f1b3ec53a5d7eeb
node ./apply.mjs ../dsh-qq-work
```

每步成功后再执行下一步。脚本检查提交号、工作树洁净状态和补丁摘要，预检零上下文补丁，应用后逐一比对六个源文件的 SHA-256，并将图片专项测试复制到上游 `test` 目录。原有 38 个测试文件由指定上游提交提供。

## 验证

在上游工作副本中准备与桌面宿主匹配的开发依赖。本地复测用的是 DSH 0.2.2 提供的运行库。独立开发环境须能解析 `@deepseek-ai/dsh-agent`、`dsh-session`、`dsh-llm`、`dsh-attachment-local` 和 `dsh-llm-deepseek`（后四个同属 `@deepseek-ai`，均为 0.2.2-rc.1），以及 `@deepseek-ai/cordis` 4.1.0、`@deepseek-ai/schemastery` 3.19.0、`ws` 8.22.1、`sharp` 0.35.5 及其依赖。上游锁文件中的旧宿主依赖不足以运行本专项测试。

```powershell
Set-Location ../dsh-qq-work
node test/run-all.mjs
node test/vision-native.test.mjs
```

**本地结果：39/39 个测试文件通过。** 其中新增文件的 8 项检查覆盖图文顺序、私聊合并、群聊、夜间队列、异常来源和超限、纯文本，以及截获真实 Flash 适配器请求并解码图片像素。**真实 QQ 结果：使用者已在 Windows 11、DSH Desktop 0.2.2、NapCat / OneBot 11、支持视觉的 DeepSeek Flash 上验证基本识图。** 其他版本尚未验收。

## 安装与回滚

普通用户先在 GitHub 选择 **Code → Download ZIP**，解压补丁包，按上面的“应用补丁”生成工作副本。测试章节供开发者使用，日常安装可跳过。完全退出 DSH 后，在**补丁包根目录**打开 PowerShell。输入已安装的插件目录（桌面 profile 下含该插件 `package.json` 的目录），路径不带引号：

```powershell
$plugin = Read-Host 'dsh-qq-onebot plugin directory'
$backup = Join-Path (Split-Path (Get-Location).Path -Parent) 'dsh-qq-backup-original'
node ./install.mjs install "$plugin" "$backup" ../dsh-qq-work
```

选择尚不存在的备份目录。看到六个文件验证成功后再启动 DSH；在授权私聊发送图片即可。无需 ModLens、截图工具或重新填写凭据。要撤销，退出 DSH，在同一终端执行下列命令（新终端需先重新设置相同的 `$plugin` 和 `$backup`）：

```powershell
node ./install.mjs rollback "$plugin" "$backup"
```

手工部署时按以下文件清单操作：

1. 确认目标插件为 1.3.0，退出 DSH（含托盘），把已安装插件的 `src` 备份到插件之外。在应用补丁前可用干净上游副本核对五个已有源文件；如已做本地定制，先审阅差异。
2. 仅将工作副本中的 `src/index.js`、`src/inbound.js`、`src/onebot/segment.js`、`src/prompts.js`、`src/sleep.js` 和新增的 `src/native-images.js` 按相对路径复制到插件。保留现有配置。重新启动 DSH，在授权私聊中发一张含随机短词的图，请机器人读出它。
3. 回滚已安装插件时退出 DSH，恢复备份中的五个旧文件，移除本次新增的 `src/native-images.js`，再重启。临时工作副本可保留供复查。
