// Electron 启动器：清除父进程环境中可能存在的 ELECTRON_RUN_AS_NODE，
// 避免 Electron 被当作纯 Node.js 运行（该变量由某些终端/IDE 环境注入，
// 存在即生效，与取值无关，cross-env 无法置空，只能删除）。
delete process.env.ELECTRON_RUN_AS_NODE;

const path = require("node:path");
const { spawn } = require("node:child_process");
const electronPath = require("electron");

/*
 * dev 模式下项目路径含非 ASCII 字符时，Vite 8 的依赖预构建（rolldown 原生绑定）
 * 会卡死、dev server 不响应任何请求，最终表现为窗口白屏且没有任何报错。
 * 这里提前拦下来并说清原因 —— 让开发者看到原因，比对着白屏猜半小时好得多。
 * 只拦 dev；打包版加载本地文件，不受影响。
 */
const projectRoot = path.resolve(__dirname, "..");

if (process.env.VITE_DEV_SERVER_URL && /[^\x20-\x7E]/.test(projectRoot)) {
  console.error(
    [
      "",
      "[dev] 项目路径包含非 ASCII 字符，Vite 8 的依赖预构建无法处理这种路径。",
      "      当前路径：" + projectRoot,
      "      表现：dev server 卡在 bundling dependencies，窗口白屏且无报错。",
      "      解决：把项目移到纯 ASCII 路径（例如 D:\\notes），再运行 npm run dev。",
      "      注意：npm run build / dist / 单元测试不受此影响。",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
// 与 main.cjs 中的 NOTES_ENABLE_GPU 逻辑保持一致：
// 默认禁用 GPU，规避受限环境下 GPU 进程崩溃导致的白屏/闪退
if (process.env.NOTES_ENABLE_GPU !== "1" && !extraArgs.includes("--disable-gpu")) {
  extraArgs.push("--disable-gpu");
}
// 当前环境下 Chromium 沙箱会导致 GPU 进程无法初始化（即使 --disable-gpu），
// 应用仅加载本地内容，关闭 Chromium 沙箱换取启动稳定性。
// 如需恢复沙箱，设置 NOTES_CHROMIUM_SANDBOX=1。
if (process.env.NOTES_CHROMIUM_SANDBOX !== "1" && !extraArgs.includes("--no-sandbox")) {
  extraArgs.push("--no-sandbox");
}

const child = spawn(electronPath, [".", ...extraArgs], {
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => process.exit(code ?? 0));
