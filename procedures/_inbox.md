# procedures inbox

（2026-11-13 收尾整理：本轮 14 条经验已按 `_模板.md` 归档为正式卡，文件名即索引——
工具-CRLF多行edit匹配失败 / 工具-大文件切片与回滚连坐 / 测试-jsdom断言常见坑 /
流程-子代理过夜静默中断 / 数据-小记启动合并覆盖丢失 / 编辑器-富文本静默失效家族 /
AI-流式超时取消与草稿表单 / 验证-脚本跑旧产物与Electron入口。
旧卡中 PowerShell 引号正则一条已并入「工具-CRLF多行edit匹配失败」的反面清单精神：带引号的源码模式一律用 grep 工具，别在 pwsh 里拼引号正则。）

- [2026-10-23] `npm run dev` 后台任务报 `exit code 1` 但并非崩溃：日志为 `[dev:electron] [main] process exit 0` → `Sending SIGTERM to other processes..` → `[dev:web] npm run dev:web exited with code 1`，即关窗后 Electron 正常退出、concurrently `-k` 连带杀掉 Vite。解法：先看 `dev:electron` 的退出码，`exit 0` 就是正常关窗（`closeToTray` 默认 false，点 X 即退出，见 `electron/app-settings.cjs`）；要它继续跑就重新 `npm run dev`。（小意外，留 inbox）- [2026-11-14] run_code 的 read 工具 limit 上限 2000（超限直接报错，分段读）；grep 的 pattern 含未转义 ``{`` 会被 ripgrep 当量词拒绝——先转义或拆词。（工具栏审查子代理待记）
- [2026-11-18] 自写正则扫 CSS 属性重复时，``[a-zA-Z-]+`` 会把 ``--radius-xl: 16px`` 截断成属性名 ``xl``，与 ``--font-size-xl`` 等撞成「重复定义」误报，白查一轮。解法：CSS 变量名正则必须含 ``-`` 开头全量匹配（``--?[a-zA-Z0-9-]+``），或直接认领误报模式（``--*-xl``/``--*-2xl`` 命名族）。（小意外，留 inbox）
- [2026-11-17] grep 的 pattern 含未转义 `(`（如 `notify(`、`Notification()`）会被 ripgrep 判为 "unclosed group" 直接拒绝 → 先用纯字面词（`notify`、`Notification`）搜出全部命中再本地过滤；pwsh 调用必须带 description 字段，缺失即报错。（三路体验审计子代理待记）
- [2026-11-17] pwsh 里 `Get-ChildItem a,b | ForEach-Object` 会把数组塞进 -Filter 报类型转换错 → 用 `-Path @('a','b')` 或逐个列举；另：给 grep 传不存在的文件路径会以 rg 的 IO error 中断整个 run_code，先用 glob 确认路径再查。（导航审计子代理待记）
- [2026-11-17] 中文文案里带未转义 `(` `[` `{` 的 grep pattern 会被 ripgrep 拒绝（与 11-14 `{` 条同族）——搜中文句子时把括号换成「」或拆词再收窄。（shell 分区修复代理待记）
- [2026-11-18] PowerShell 清场命令按 CommandLine 关键词过滤时匹配到了**执行该命令的 pwsh 自身**（关键词写在命令文本里），job runner 以 exit 1 崩掉 → 过滤必须 `ProcessId -ne $PID`。与 rg 括号转义同族：**命令/模式里含自身内容时先排他**。（lead 亲踩，已并入 工具-实机脚本失败进程吊死 卡反面清单）

- [2026-11-19] run_code 里给 `write`/`edit` 传含正则字面量的文件内容时，**反斜杠会被吃一层**：写进文件的 `/\/\*[\s\S]*?\*\//g` 变成 `//*[sS]*?*//g`，测试直接 PARSE_ERROR。解法：先按原样写入，再用 `read` 回读**逐行确认**转义；或干脆用 `new RegExp('...', 'g')` 字符串形式写正则。（lead 亲踩，本轮 2 次）
- [2026-11-19] 改了 CSS 变量/主题色后**不能只看构建通过**：必须用 Playwright 读 `getComputedStyle` 拿真实 rgb 值 + 截图目视。本轮暗色主题"侧栏选中项"缺陷（`--primary-50` 在暗色下是饱和深蓝 `rgb(0,44,140)`），静态审查看不出来，A/B 注入候选色后一眼就定了。（lead 亲踩）
- [2026-11-19] 审「Electron 里的响应式断点是否可达」要交叉比对**三处**：`src/utils/breakpoints.ts` 的常量、`src/hooks/useResizableLayout.ts` 的判定、`electron/window-state.cjs` 的 `MIN_BOUNDS`。本轮发现 minWidth 980 > 断点 992/768，整段移动布局是死代码。单看任何一处都发现不了。
- [2026-11-19] 流式 top-K 的比较器符号约定必须与 keep() 的二分/丢弃条件自洽：沿用 Array.sort 的「负数=在前」比较器却配「正数=更优」的插入逻辑，会**静默反转整个结果序**，而且 top-K 与全量对拍也发现不了（同一错误两边一致）——只有独立推算期望序的断言能拦住。（perf-search 待记）
- [2026-11-19] 样式表→组件使用点分析：类名裸词匹配误报极多（active/tag/done 等英文词命中全仓）；应先按「仅此表定义的独有类」过滤 + 剔通用词，可疑点直接 grep 组件确认；eager/lazy 可达性以 main.tsx+App.tsx 做静态闭包（App 自身是 lazy 入口，别漏）。（css-polish 待记）
- [2026-11-19] updateDoc 对任何修改无条件 bump updatedAt（含正文击键）→ 想让正文变化不触发订阅重渲染时，树/列表投影的 updatedAt 必须按显示粒度（分钟桶）比较，严格相等等于没优化。（perf-tree 待记）
- [2026-11-19] vitest 用例间状态泄漏两坑：vi.mock 工厂里的 vi.fn(impl)/mockResolvedValue 不被 afterEach 的 mockRestore 复位（下个用例吃到上个用例的 mock 数据）；useNotesStore 这类模块单例 setState 也跨用例残留，beforeEach 只复位部分字段等于没复位（activeDocId 泄漏直接改变断言结果）。关键字段显式复位、mock 数据逐用例显式给。（ux-feedback 待记）
- [2026-11-19] 给自绘菜单补 role=menu/menuitem 后，既有测试的 getByRole('button', …) 全部失配（显式 role 覆盖隐式 button 角色）——语义升级类改动要同步 grep 测试里的角色查询。（ux-feedback 待记）
- [2026-11-19] 固定种子的测试「全量跑挂、单跑过」不是随机偶发，先怀疑**默认 5s 超时被并发负载顶穿**（本轮 fuzz 200 组 DOM 往返：单跑 336ms、全量挂）。判别法：单跑 3 次全过 + 输入确定（固定 seed）→ 放宽 it 的显式 timeout，别当 flaky 忽略（会掩蔽真回归）。（lead 亲踩）
- [2026-11-19] 手算测试边界名次时把「rank 150+k = w_{299-k}」的 k 按 50 算（得 w249），实际第 200 名（0 起）是 w250；生成式期望序对拍先过、手写断言后挂。教训：手算期望值与生成式期望分开写时，手算那两行要按公式逐一代入，别凭直觉。（perf-search 待记）
- [2026-11-19] 用 read 行范围拼 old_string 做 edit 时，若替换块从中间截断，会**静默吞掉相邻断言**（测试更弱但仍绿）——收尾必须用 ESLint no-unused-vars 复核改过的测试文件；现象：测试全绿、但有 const x 未被使用。（ux-polish 待记）
- [2026-11-20] 测试里调用会 fire-and-forget 写盘的 handler（如 notes:save 触发的备份副本）后，afterEach 删临时目录会与其竞态：慢负载下写入落到 rm 之后 → fs.rm 报 ENOTEMPTY（挂在 afterEach 而不是测试体，极易误判为逻辑回归）。修法双保险：测试内等写入落地（waitForBackup 轮询）+ rm 加 maxRetries/retryDelay。（lead 亲踩）