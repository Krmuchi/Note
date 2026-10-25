# procedures inbox

- [2026-10-25] "重排/抽取大文件的一段函数"时用 `Get-Content` + 按行号切片写回，极易连带删掉区间内的类型/常量（`RichEditor.tsx` 就误删了 `RichEditorProps` / `INPUT_RULES` / `CODE_LANGUAGES`，且 `git checkout` 把同文件里的功能修复一起回滚）。解法：一次只抽**边界明确、区间内不含其它声明**的几个函数；切完立刻 `npx tsc -b --noEmit`，并在切之前先 `git diff --stat` 记下本文件还有哪些未提交改动，避免回滚连坐。
- [2026-10-25] `node scripts/xxx.mjs` 类验证脚本前必须 `npm run build`：脚本跑的是 `dist/`，改了 `src/` 不重建就会误判"修复没生效"（本轮有过两次）。判据：日志里的 chunk 文件名（哈希）没变就是跑的旧产物。
- [2026-10-25] `npx electron .` 会以纯 Node 跑（`ELECTRON_RUN_AS_NODE` 被环境注入），报 `app.requestSingleInstanceLock is not a function` 之类。改用项目自带入口 `node electron/launch.cjs`（它 `delete process.env.ELECTRON_RUN_AS_NODE`）。
- [2026-10-25] 实机验收脚本要断言"鼠标移入/悬停"类行为时，**不能**靠 `dispatchEvent(new MouseEvent('mousemove', {clientX,...}))`：`document.elementFromPoint` 走的是真实指针命中，合成事件永远定位不到元素。用 `page.mouse.move(x, y)`。判据：合成事件失败但 `page.mouse` 成功 ⇒ 是测试方式问题，不是功能缺陷。
- [2026-10-25] PowerShell 里 `Select-String -Pattern "from ['\"]@/store"` 会报 `ParserError: 表达式或语句中缺少 )`：外层双引号里的 `\"` 不算转义，被当成字符串结束。解法——查询带引号的源码模式一律改用 `grep` 工具，别在 pwsh 里拼引号正则。
- [2026-10-23] `npm run dev` 后台任务报 `exit code 1` 但并非崩溃：日志为 `[dev:electron] [main] process exit 0` → `Sending SIGTERM to other processes..` → `[dev:web] npm run dev:web exited with code 1`，即关窗后 Electron 正常退出、concurrently `-k` 连带杀掉 Vite。解法：先看 `dev:electron` 的退出码，`exit 0` 就是正常关窗（`closeToTray` 默认 false，点 X 即退出，见 `electron/app-settings.cjs`）；要它继续跑就重新 `npm run dev`。
