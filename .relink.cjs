// 一次性修复脚本：补齐 node_modules 顶层缺失的包链接。
// 起因：中断的 pnpm add 把顶层软链清掉了一部分，而 pnpm install 认为状态已最新不会重建。
// 仅创建指向 node_modules/.pnpm 的目录链接，不改动任何包内容；后续正常执行 pnpm install 会自然覆盖。
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const nm = path.join(root, 'node_modules')
const pnpmDir = path.join(nm, '.pnpm')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const names = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]

/** @scope/name -> @scope+name（pnpm 的目录编码） */
const encode = (name) => name.replace('/', '+')

/** 从包自身的 package.json 读取真实版本，避免依赖 .pnpm 目录名的命名差异 */
function readVersion(dir, name) {
  try {
    const pj = path.join(pnpmDir, dir, 'node_modules', name, 'package.json')
    return JSON.parse(fs.readFileSync(pj, 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function findCandidate(name) {
  const encoded = encode(name)
  // pnpm 目录名两种情况：name@version_peers（常规）与 name_hash（版本被折叠进 hash）
  const dirs = fs
    .readdirSync(pnpmDir)
    .filter((d) => d.startsWith(`${encoded}@`) || d.startsWith(`${encoded}_`))
    .filter((d) => fs.existsSync(path.join(pnpmDir, d, 'node_modules', name)))
  if (dirs.length === 0) return null
  // 同名多版本（peer 变体）时取版本号最大者；各变体自带自己的 node_modules，内部依赖均可正确解析
  dirs.sort((a, b) => readVersion(a, name).localeCompare(readVersion(b, name), undefined, { numeric: true }))
  const picked = dirs[dirs.length - 1]
  return { target: path.join(pnpmDir, picked, 'node_modules', name), dir: picked }
}

let created = 0
const failures = []

for (const name of names) {
  const linkPath = path.join(nm, name)
  if (fs.existsSync(linkPath)) continue

  const candidate = findCandidate(name)
  if (!candidate) {
    failures.push(`${name}: 在 .pnpm 中找不到可用副本`)
    continue
  }

  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  try {
    fs.symlinkSync(candidate.target, linkPath, 'junction')
    created++
  } catch (err) {
    failures.push(`${name}: ${err.code || err.message}`)
  }
}

console.log(`[relink] 已补齐 ${created} 个链接，失败 ${failures.length} 个`)
if (failures.length > 0) console.log(failures.join('\n'))

for (const probe of ['vite', 'vitest', 'eslint', 'jsdom', 'typescript-eslint', '@vitejs/plugin-react', '@eslint/js']) {
  console.log(`[relink] ${probe} => ${fs.existsSync(path.join(nm, probe)) ? 'OK' : 'MISSING'}`)
}
