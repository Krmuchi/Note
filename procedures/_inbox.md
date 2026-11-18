# procedures inbox

（2026-11-13 收尾整理：本轮 14 条经验已按 `_模板.md` 归档为正式卡，文件名即索引——
工具-CRLF多行edit匹配失败 / 工具-大文件切片与回滚连坐 / 测试-jsdom断言常见坑 /
流程-子代理过夜静默中断 / 数据-小记启动合并覆盖丢失 / 编辑器-富文本静默失效家族 /
AI-流式超时取消与草稿表单 / 验证-脚本跑旧产物与Electron入口。
旧卡中 PowerShell 引号正则一条已并入「工具-CRLF多行edit匹配失败」的反面清单精神：带引号的源码模式一律用 grep 工具，别在 pwsh 里拼引号正则。）

- [2026-10-23] `npm run dev` 后台任务报 `exit code 1` 但并非崩溃：日志为 `[dev:electron] [main] process exit 0` → `Sending SIGTERM to other processes..` → `[dev:web] npm run dev:web exited with code 1`，即关窗后 Electron 正常退出、concurrently `-k` 连带杀掉 Vite。解法：先看 `dev:electron` 的退出码，`exit 0` 就是正常关窗（`closeToTray` 默认 false，点 X 即退出，见 `electron/app-settings.cjs`）；要它继续跑就重新 `npm run dev`。（小意外，留 inbox）- [2026-11-14] run_code 的 read 工具 limit 上限 2000（超限直接报错，分段读）；grep 的 pattern 含未转义 ``{`` 会被 ripgrep 当量词拒绝——先转义或拆词。（工具栏审查子代理待记）
- [2026-11-17] grep 的 pattern 含未转义 `(`（如 `notify(`、`Notification()`）会被 ripgrep 判为 "unclosed group" 直接拒绝 → 先用纯字面词（`notify`、`Notification`）搜出全部命中再本地过滤；pwsh 调用必须带 description 字段，缺失即报错。（三路体验审计子代理待记）
- [2026-11-17] pwsh 里 `Get-ChildItem a,b | ForEach-Object` 会把数组塞进 -Filter 报类型转换错 → 用 `-Path @('a','b')` 或逐个列举；另：给 grep 传不存在的文件路径会以 rg 的 IO error 中断整个 run_code，先用 glob 确认路径再查。（导航审计子代理待记）
- [2026-11-17] 中文文案里带未转义 `(` `[` `{` 的 grep pattern 会被 ripgrep 拒绝（与 11-14 `{` 条同族）——搜中文句子时把括号换成「」或拆词再收窄。（shell 分区修复代理待记）
- [2026-11-18] PowerShell 清场命令按 CommandLine 关键词过滤时匹配到了**执行该命令的 pwsh 自身**（关键词写在命令文本里），job runner 以 exit 1 崩掉 → 过滤必须 `ProcessId -ne $PID`。与 rg 括号转义同族：**命令/模式里含自身内容时先排他**。（lead 亲踩，已并入 工具-实机脚本失败进程吊死 卡反面清单）
