// .md 文件关联（P5）的纯逻辑：命令行解析、注册表项构造。
//
// 安全边界：**只写 HKCU**（当前用户），不需要管理员权限，且关闭开关时能恢复原关联。
// 绝不写 HKLM / 不改系统级默认——那才是真正的"劫持"。

const path = require("node:path");

const IMPORTABLE_EXTENSIONS = [".md", ".markdown", ".txt", ".markdn"];
/** 关联到本应用时使用的 ProgID（固定值，卸载/关闭时按它清理） */
const PROG_ID = "Notes.Markdown";
const ASSOCIATION_DESCRIPTION = "Markdown 文档（笔记）";

/** 从 argv 取 --open-file=<path>；也支持被系统直接拖到 exe 上的裸路径 */
function extractOpenFilePath(argv) {
  const list = Array.isArray(argv) ? argv : [];
  for (const arg of list) {
    if (typeof arg !== "string") continue;
    if (arg.startsWith("--open-file=")) {
      const value = arg.slice("--open-file=".length).trim();
      if (value) return value;
    }
  }
  return null;
}

/**
 * 从一组 argv 里挑出"看起来是文档路径"的参数。
 * Windows 上双击关联文件时，系统会直接把路径作为参数传进来（不带开关）。
 */
function pickDocumentPath(argv, options) {
  const list = Array.isArray(argv) ? argv : [];
  const existsSync = options && typeof options.existsSync === "function" ? options.existsSync : () => true;
  const exePath = options && options.exePath ? options.exePath : "";

  for (const arg of list) {
    if (typeof arg !== "string" || !arg) continue;
    if (arg.startsWith("-")) continue;
    if (exePath && arg === exePath) continue;
    const ext = path.extname(arg).toLowerCase();
    if (!IMPORTABLE_EXTENSIONS.includes(ext)) continue;
    if (!existsSync(arg)) continue;
    return arg;
  }
  return null;
}

/** 关联使用的 ProgID 键路径（HKCU 下） */
function buildRegistryPlan(exePath) {
  if (!exePath) return null;
  const command = '"' + exePath + '" --open-file="%1"';
  return {
    /** .md 的默认值指向我们的 ProgID */
    extensionKey: "HKCU\\Software\\Classes\\.md",
    /** ProgID 本体：描述 + 打开命令 */
    progIdKey: "HKCU\\Software\\Classes\\" + PROG_ID,
    progId: PROG_ID,
    command,
    description: ASSOCIATION_DESCRIPTION,
  };
}

/** 生成 reg.exe 需要的参数数组（避免拼接字符串带来的转义问题） */
function buildRegistryCommands(plan, previousAssociation) {
  if (!plan) return { enable: [], disable: [] };

  const enable = [
    ["add", plan.progIdKey, "/ve", "/d", plan.description, "/f"],
    ["add", plan.progIdKey + "\\DefaultIcon", "/ve", "/d", plan.command.split('"')[1] + ",0", "/f"],
    ["add", plan.progIdKey + "\\shell\\open\\command", "/ve", "/d", plan.command, "/f"],
    ["add", plan.extensionKey, "/ve", "/d", plan.progId, "/f"],
  ];

  // 关闭时恢复原值；原先没有关联（或原本就是空）则删除该值
  const restoreValue = typeof previousAssociation === "string" ? previousAssociation.trim() : "";
  const disable = restoreValue
    ? [
        ["add", plan.extensionKey, "/ve", "/d", restoreValue, "/f"],
        ["delete", plan.progIdKey, "/f"],
      ]
    : [
        ["delete", plan.extensionKey, "/ve", "/f"],
        ["delete", plan.progIdKey, "/f"],
      ];

  return { enable, disable };
}

module.exports = {
  IMPORTABLE_EXTENSIONS,
  PROG_ID,
  ASSOCIATION_DESCRIPTION,
  extractOpenFilePath,
  pickDocumentPath,
  buildRegistryPlan,
  buildRegistryCommands,
};
