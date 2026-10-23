import { describe, it, expect } from 'vitest'
import {
  compareVersions,
  evaluateUpdate,
  parseReleaseManifest,
  parseVersion,
} from '../../electron/update-check.cjs'

/** 更新检查（D3）：宁可漏报，不可错报 —— 解析失败一律按"没有新版本"处理。 */

describe('parseVersion', () => {
  it('接受 v 前缀与预发布后缀', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3])
  })

  it('无法解析时返回 null', () => {
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('')).toBeNull()
    expect(parseVersion(undefined)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('按主次修订号比较', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.2.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('解析失败视为相等（不提示错的更新）', () => {
    expect(compareVersions('broken', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', 'broken')).toBe(0)
  })
})

describe('parseReleaseManifest', () => {
  it('解析手写清单（version + url + notes）', () => {
    const manifest = parseReleaseManifest(
      JSON.stringify({ version: '0.2.0', url: 'https://example.com/notes-0.2.0.exe', notes: '修了一堆问题' }),
    )
    expect(manifest?.version).toBe('0.2.0')
    expect(manifest?.url).toContain('0.2.0')
    expect(manifest?.notes).toBe('修了一堆问题')
  })

  it('解析 electron-builder 的 latest.yml 形状', () => {
    const manifest = parseReleaseManifest({ version: '0.2.0', path: 'notes-0.2.0-setup.exe', pub_date: '2026-10-01' })
    expect(manifest?.url).toBe('notes-0.2.0-setup.exe')
    expect(manifest?.publishedAt).toBe('2026-10-01')
  })

  it('解析 GitHub Releases API 形状（tag_name / html_url / body）', () => {
    const manifest = parseReleaseManifest({
      tag_name: 'v0.2.0',
      html_url: 'https://github.com/Krmuchi/Note/releases/tag/v0.2.0',
      body: '- 修了导出',
      published_at: '2026-10-01T00:00:00Z',
    })
    expect(manifest?.version).toBe('0.2.0')
    expect(manifest?.url).toContain('github.com')
    expect(manifest?.notes).toBe('- 修了导出')
    expect(evaluateUpdate('0.1.0', manifest).hasUpdate).toBe(true)
  })

  it('GitHub 形状但 tag 不是版本号时返回 null', () => {
    expect(parseReleaseManifest({ tag_name: 'nightly', html_url: 'x' })).toBeNull()
  })

  it('缺少或非法版本号时返回 null', () => {
    expect(parseReleaseManifest('{}')).toBeNull()
    expect(parseReleaseManifest(JSON.stringify({ version: 'abc' }))).toBeNull()
    expect(parseReleaseManifest('not json')).toBeNull()
    expect(parseReleaseManifest(null)).toBeNull()
  })

  it('notes 超长会被截断', () => {
    const manifest = parseReleaseManifest({ version: '1.0.0', notes: 'x'.repeat(5000) })
    expect(manifest!.notes.length).toBeLessThan(2100)
  })
})

describe('evaluateUpdate', () => {
  const manifest = parseReleaseManifest({ version: '0.2.0', url: 'https://example.com/a.exe', notes: '新版本' })

  it('远端更高时提示有新版本', () => {
    const result = evaluateUpdate('0.1.0', manifest)
    expect(result.hasUpdate).toBe(true)
    expect(result.latest).toBe('0.2.0')
    expect(result.url).toContain('example.com')
  })

  it('相同或更低时不提示', () => {
    expect(evaluateUpdate('0.2.0', manifest).hasUpdate).toBe(false)
    expect(evaluateUpdate('0.3.0', manifest).hasUpdate).toBe(false)
  })

  it('清单缺失时不提示且不抛错', () => {
    expect(evaluateUpdate('0.1.0', null).hasUpdate).toBe(false)
    expect(evaluateUpdate('0.1.0', null).current).toBe('0.1.0')
  })
})
