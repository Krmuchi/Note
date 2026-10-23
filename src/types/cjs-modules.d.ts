/**
 * electron/ 下的主进程模块是 CommonJS（.cjs），不参与 TS 编译，因此没有类型声明。
 * 消费方有两类：
 *  1) 单元/渲染侧直接 import 这些纯函数模块做断言或复用（如 services/storage.ts 复用导出 HTML 模板）；
 *  2) 测试文件导入 AI 纯函数模块。
 * 这里统一声明为 any，避免 TS7016（隐式 any）。
 *
 * 注意：这些模块的正确性由 tests/unit/*.test.ts 的运行时断言保证，
 * 不要在此处手写类型，否则会与实现漂移。
 */
declare module '*.cjs'