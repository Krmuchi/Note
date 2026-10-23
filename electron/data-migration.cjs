// 数据目录迁移的纯逻辑（O5）：只做"能不能迁、迁什么"的判断，不碰文件系统。
//
// 迁移是少数会动到用户全部数据的操作，所以判断必须保守：
// 拿不准就拒绝，让用户换一个目录，而不是冒险覆盖。

const path = require("node:path");

const DATA_FILE_NAME = "notes-data.json";
const BACKUP_DIR_NAME = "backups";

/** Windows 上路径大小写不敏感，比较前统一规范化 */
function normalizeForCompare(dir) {
  const resolved = path.resolve(String(dir || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSameDir(a, b) {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

/** b 是否在 a 里面（含相等） */
function isInside(a, b) {
  const base = normalizeForCompare(a);
  const target = normalizeForCompare(b);
  if (base === target) return true;
  return target.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}

/**
 * 校验迁移目标。
 * @returns {{ok: true} | {ok: false, error: string}}
 */
function validateMigration(from, to) {
  const source = typeof from === "string" ? from.trim() : "";
  const target = typeof to === "string" ? to.trim() : "";

  if (!target) return { ok: false, error: "没有选择目标目录" };
  if (!path.isAbsolute(target)) return { ok: false, error: "目标目录必须是绝对路径" };
  if (!source) return { ok: false, error: "当前数据目录未知，无法迁移" };

  if (isSameDir(source, target)) {
    return { ok: false, error: "目标目录与当前数据目录相同" };
  }
  // 迁到自己里面：复制过程中会不断产生新文件，且原目录会被当成"旧数据"删掉
  if (isInside(source, target)) {
    return { ok: false, error: "目标目录在当前数据目录里面，请换一个位置" };
  }
  // 反向：把数据迁到自己的上级目录同样是混乱的来源
  if (isInside(target, source)) {
    return { ok: false, error: "当前数据目录在目标目录里面，请换一个位置" };
  }

  return { ok: true };
}

/**
 * 迁移计划：要复制哪些东西。
 * data 文件为空时仍然允许迁移（用户可能只有备份），但会明确告知。
 */
function planMigrationEntries(sourceDir, targetDir, options) {
  const hasDataFile = !options || options.hasDataFile !== false;
  const backupCount = options && typeof options.backupCount === "number" ? options.backupCount : 0;

  const entries = [];
  if (hasDataFile) {
    entries.push({
      kind: "data",
      from: path.join(sourceDir, DATA_FILE_NAME),
      to: path.join(targetDir, DATA_FILE_NAME),
      required: true,
    });
  }
  if (backupCount > 0) {
    entries.push({
      kind: "backups",
      from: path.join(sourceDir, BACKUP_DIR_NAME),
      to: path.join(targetDir, BACKUP_DIR_NAME),
      required: false,
    });
  }

  return entries;
}

module.exports = {
  DATA_FILE_NAME,
  BACKUP_DIR_NAME,
  isSameDir,
  isInside,
  normalizeForCompare,
  validateMigration,
  planMigrationEntries,
};
