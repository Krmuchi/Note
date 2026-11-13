# 测试-jsdom断言常见坑

## 触发条件
给本仓库写 vitest + jsdom 测试时断言"莫名失败"：弹窗渲染不出、capture 监听没触发、偏移差一两个字、store 闸门静默跳过夹具。

## 首选姿势
- **capture 键盘监听**：从 `document.body` 派发（`fireEvent.keyDown(document.body, …)`），不要 `fireEvent.keyDown(window, …)`——后者不走 document 路径，window capture 与真实传播顺序都测不到。
- **模块级单例发射器**（confirmAction/toast 等）：调用包在 `act(() => …)` 里，否则宿主组件不同步重渲染、`getByRole` 查不到；async handler 的 toast 断言用 `await waitFor(…)`。
- **中文/换行偏移断言**：先逐字符数索引（`\n` 占 1），别心算。失败 diff 里内容"差一两个字" ⇒ 先复核测试数据再怀疑实现（本轮 4+3 个失败全是期望值算错，实现是对的）。
- **store「已加载」闸门**（lastSavedAt===null 跳过）：既有 setState 夹具默认 lastSavedAt=null 会被静默跳过，断言清理行为的用例必须显式设非 null。
- **虚拟化列表**：querySelector+scrollIntoView 对窗口外目标静默失效，用命令式 scrollToIndex；jsdom 不派发 scroll 事件需显式 setScrollTop；clientHeight 恒 0，容器高度走代码回退值。
- jsdom 缺 `Range.getBoundingClientRect`：在**本测试文件** beforeAll 补零矩形桩，别改共享 tests/setup.ts（并发所有权风险）。

## 反面清单
- 靠整体 tsc exit code 判断"我的改动干净"（多代理并行时错误集每次不同，看错误行归属）。
- 3 元素边界用例测"删除后找位置"类函数（巧合区间测不出恒 -1 的 bug，用 ≥4 元素关中间项）。

## 验证方式
新测试先单独跑一遍确认失败原因分类（实现 bug vs 测试写法），修完与相邻既有测试合并跑防跨文件污染。