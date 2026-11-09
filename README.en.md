# dsh-qq-vision-fix

[中文](README.md) · [Upstream project metadata](https://api.github.com/repositories/1431211359) · [Upstream issue #10](https://api.github.com/repositories/1431211359/issues/10)

An independent MIT-licensed patch distribution for dsh-qq-onebot **1.3.0**, pinned to **`224ad59603b176580241b45d3f1b3ec53a5d7eeb`**. Thanks to the upstream authors, contributors and issue reporter. The original copyright notice is preserved in [LICENSE](LICENSE).

The bridge downloaded images but sent the agent a cache path and instructions to call `read_image`. The affected session did not register that tool. Joining private messages into strings also lost image positions. The patch stores validated bytes using DSH's `saveImages()`, preserves the order of OneBot segments, admits the content with `admitPromptContent()`, and passes the resulting image references to the agent. Private batches and overnight queues retain those references. Image admission failures produce an explicit QQ reply.

## Apply

From **this patch repository's root**, use PowerShell, Git and Node.js (verified with Node.js 26.13.0). Start with a new sibling directory. Run each step only after the preceding one succeeds.

```powershell
$url = (Invoke-RestMethod 'https://api.github.com/repositories/1431211359').clone_url
git clone --config core.autocrlf=false --no-checkout $url ../dsh-qq-work
git -C ../dsh-qq-work switch --detach 224ad59603b176580241b45d3f1b3ec53a5d7eeb
node ./apply.mjs ../dsh-qq-work
```

The helper checks the commit, clean working tree and patch digest, preflights the zero-context patch and verifies the SHA-256 of all six resulting source files. It adds one regression test file to the upstream checkout. The pinned commit supplies all 38 original test files.

## Verify

Use a separate development checkout with matching DSH dependencies available to Node. Local tests used the desktop 0.2.2 libraries: `@deepseek-ai/dsh-agent`, `@deepseek-ai/dsh-session`, `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-attachment-local` and `@deepseek-ai/dsh-llm-deepseek` at 0.2.2-rc.1, plus `@deepseek-ai/cordis` 4.1.0, `@deepseek-ai/schemastery` 3.19.0, `ws` 8.22.1, `sharp` 0.35.5 and their dependencies. The older host dependencies in the upstream lockfile alone are insufficient for the vision test.

```powershell
Set-Location ../dsh-qq-work
node test/run-all.mjs
node test/vision-native.test.mjs
```

**Local:** all 39 test files passed. The eight cases in the new file cover private batching, mixed content order, group delivery, overnight replay, rejected sources and oversized images, plain text, and decoding the image block from the real Flash adapter's intercepted request. **Live:** the user confirmed basic image recognition in a Windows 11 / DSH Desktop 0.2.2 / NapCat / OneBot 11 / vision-capable DeepSeek Flash session. Other versions have not been verified.

## Install and roll back

Download **Code → Download ZIP** from this repository, extract it and follow **Apply** to prepare the sibling checkout. End users can skip the development tests. Fully exit DSH, open PowerShell in the **patch package root**, and enter the installed plugin directory containing its `package.json` (without surrounding quotes).

```powershell
$plugin = Read-Host 'dsh-qq-onebot plugin directory'
$backup = Join-Path (Split-Path (Get-Location).Path -Parent) 'dsh-qq-backup-original'
node ./install.mjs install "$plugin" "$backup" ../dsh-qq-work
```

Use a new backup directory. After six files are verified, restart DSH and send a test image. This uses native attachments and requires neither ModLens nor screen capture. For rollback, exit DSH and run the following in the same shell (or set the same variables again):

```powershell
node ./install.mjs rollback "$plugin" "$backup"
```

For manual deployment:

1. Confirm the installed plugin is 1.3.0. Exit DSH, including its tray process. Back up the installed `src` directory outside the plugin. Compare the five existing files with the pristine pinned checkout before applying the patch; reconcile any local changes.
2. Copy only `src/index.js`, `src/inbound.js`, `src/onebot/segment.js`, `src/prompts.js`, `src/sleep.js` and the new `src/native-images.js` from the patched checkout to their corresponding locations. Start DSH with the existing profile. In an authorized private chat, send an image with a random word and ask the bot to read it.
3. To roll back, exit DSH, restore the five existing files from backup, remove the newly added `src/native-images.js` and restart DSH.
