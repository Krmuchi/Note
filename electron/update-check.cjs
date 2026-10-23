// 更新检查（D3）：解析发布清单、比较版本。
//
// 为什么不是 electron-updater 那种"静默下载安装"：
// 那需要代码签名 + 已发布的更新源，当前仓库还没有发布通道（也没有签名证书）。
// 强行接上只会得到一个"看起来有自动更新、实际永远失败"的功能。
// 这里做的是**可验证的那一半**：检查 → 提示有新版本 → 打开下载页，由用户决定。
//
// 纯逻辑（不 require electron），便于 vitest 直接测试。

const MAX_NOTES_LENGTH = 2000;

function truncateNotes(value) {
  return typeof value === 'string' ? value.slice(0, MAX_NOTES_LENGTH) : '';
}

/** 解析 semver 主体：返回 [major, minor, patch]，带 -beta 之类的预发布号只取数字部分 */
function parseVersion(version) {
  const raw = String(version || "").trim().replace(/^v/i, "");
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * 比较版本：a > b 返回 1，a < b 返回 -1，相等返回 0。
 * 无法解析的一律视为相等（宁可不提示更新，也不能提示错的）。
 */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  for (let i = 0; i < 3; i += 1) {
    if (left[i] > right[i]) return 1;
    if (left[i] < right[i]) return -1;
  }
  return 0;
}

/**
 * 解析发布清单。同时接受两种形状：
 * - electron-builder 生成的 `latest.yml` 里的字段（version + path）
 * - 手写的 `update.json`（version + url + notes）
 */
function parseReleaseManifest(raw) {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;

  // GitHub Releases API 形状（tag_name / html_url / body）：默认更新源就是它，
  // 不需要额外自建托管就能用
  if (typeof data.tag_name === "string" && !data.version) {
    const githubVersion = data.tag_name.replace(/^v/i, "").trim();
    if (parseVersion(githubVersion)) {
      return {
        version: githubVersion,
        url: typeof data.html_url === "string" ? data.html_url : "",
        notes: truncateNotes(data.body),
        publishedAt: typeof data.published_at === "string" ? data.published_at : "",
      };
    }
    return null;
  }

  const version = typeof data.version === "string" ? data.version.trim() : "";
  if (!parseVersion(version)) return null;

  const url =
    typeof data.url === "string" && data.url
      ? data.url
      : typeof data.path === "string" && data.path
        ? data.path
        : "";

  return {
    version,
    url,
    notes: typeof data.notes === "string" ? truncateNotes(data.notes) : truncateNotes(data.releaseNotes),
    publishedAt: typeof data.pub_date === "string" ? data.pub_date : typeof data.publishedAt === "string" ? data.publishedAt : "",
  };
}

/**
 * 判断是否有新版本。
 * @returns {{hasUpdate: boolean, current: string, latest?: string, url?: string, notes?: string}}
 */
function evaluateUpdate(currentVersion, manifest) {
  const base = { hasUpdate: false, current: String(currentVersion || "") };
  if (!manifest || typeof manifest.version !== "string") return base;

  const newer = compareVersions(manifest.version, currentVersion) > 0;
  if (!newer) return base;

  return {
    hasUpdate: true,
    current: String(currentVersion || ""),
    latest: manifest.version,
    url: manifest.url || "",
    notes: manifest.notes || "",
  };
}

module.exports = {
  parseVersion,
  compareVersions,
  parseReleaseManifest,
  evaluateUpdate,
  truncateNotes,
};
