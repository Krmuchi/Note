// Electron 启动器：清除父进程环境中可能存在的 ELECTRON_RUN_AS_NODE，
// 避免 Electron 被当作纯 Node.js 运行（该变量由某些终端/IDE 环境注入，
// 存在即生效，与取值无关，cross-env 无法置空，只能删除）。
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require("node:child_process");
const electronPath = require("electron");

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
