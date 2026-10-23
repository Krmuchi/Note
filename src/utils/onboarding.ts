/**
 * 首次启动引导：状态判定与"重看引导"的全局触发。
 *
 * "全新安装"必须同时满足三个条件，否则老用户升级后会被弹窗打扰：
 * 1. 没有做过引导（localStorage 标记）；
 * 2. 数据仍是初始种子（唯一的默认知识库 nb-default + 唯一的欢迎文档 doc-welcome）；
 * 3. 没有任何"最近浏览"记录。
 */

const ONBOARDING_DONE_KEY = 'notes-onboarding-done'
const SEED_NOTEBOOK_ID = 'nb-default'
const SEED_DOC_ID = 'doc-welcome'

/** 「最近浏览」的存储键（App 与引导判定共用同一份，避免两处字面量漂移） */
export const RECENT_VIEWS_KEY = 'notes-recent-views'

function readRecentViewsCount(): number {
  try {
    const raw = localStorage.getItem(RECENT_VIEWS_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

/** 存储不可用时返回 true（宁可少弹一次，也不要每次启动都弹） */
export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'
  } catch {
    return true
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, '1')
  } catch {
    /* storage unavailable */
  }
}

export interface OnboardingProbe {
  notebooks: { id: string; docs: { id: string }[] }[]
  /** 默认从 localStorage 的「最近浏览」读取；显式传入便于测试 */
  recentViewsCount?: number
}

export function shouldShowOnboarding({ notebooks, recentViewsCount }: OnboardingProbe): boolean {
  if (isOnboardingDone()) return false
  if ((recentViewsCount ?? readRecentViewsCount()) > 0) return false
  if (notebooks.length !== 1) return false

  const notebook = notebooks[0]
  if (notebook.id !== SEED_NOTEBOOK_ID) return false
  if (notebook.docs.length !== 1) return false
  return notebook.docs[0].id === SEED_DOC_ID
}

/* ---------------- "重看新手引导"的全局触发 ----------------
   与 toast / confirmAction 同款模式：设置面板等任意模块都能唤起，
   App 订阅后负责渲染，避免为此层层透传 props。 */

const listeners = new Set<() => void>()

export function subscribeOnboardingRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function requestOnboarding(): void {
  listeners.forEach((listener) => listener())
}
