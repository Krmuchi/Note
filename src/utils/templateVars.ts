import { formatIsoWeek } from '@/utils/formatters'

/**
 * 模板占位符替换（T4）。
 *
 * 内置模板里带着 {date}/{week}/{projectName} 这类占位符，插入时必须替换掉 ——
 * 否则用户拿到的是一篇写着 "{projectName}" 的文档。
 * 之前这段替换逻辑长在 StartPage 组件里，现在开始页与"文档树新建文档"共用同一份。
 */

/** 没有真实数据可填的占位符统一给一个"提示性默认值"，让用户知道该填什么 */
const FIELD_FALLBACKS: Record<string, string> = {
  meetingName: '会议名称',
  location: '会议室',
  host: '主持人',
  projectName: '项目名称',
  destination: '目的地',
  company: '公司名称',
  bookName: '书名',
  topic: '讨论主题',
  startDate: '',
  endDate: '',
}

export interface TemplateVarOptions {
  now?: Date
  /** {title} 占位符（部分模板用它做标题回填） */
  title?: string
}

export function applyTemplateVars(content: string, options: TemplateVarOptions = {}): string {
  const now = options.now ?? new Date()
  const localDate = now.toLocaleDateString('zh-CN')

  let result = content
    .replace(/{week}/g, formatIsoWeek(now))
    .replace(/{date}/g, localDate)
    .replace(/{time}/g, now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    .replace(/{weekday}/g, now.toLocaleDateString('zh-CN', { weekday: 'long' }))
    .replace(/{year}/g, String(now.getFullYear()))
    .replace(/{month}/g, String(now.getMonth() + 1))
    .replace(/{title}/g, options.title ?? '')

  for (const [key, fallback] of Object.entries(FIELD_FALLBACKS)) {
    const value = key === 'startDate' || key === 'endDate' ? localDate : fallback
    result = result.replace(new RegExp('\\{' + key + '\\}', 'g'), value)
  }

  return result
}
