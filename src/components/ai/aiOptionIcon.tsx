/**
 * AI 选项图标映射：数据层（services/ai/prompts.ts）只存图标 id，图形在这里按 id 渲染。
 *
 * 与 shared/hooks 的 ThemeIconName → SettingsPanel 的 THEME_OPTION_ICONS 同一模式：
 * services 层不许 import 组件（分层方向），所以「选哪个图形」的映射放组件层。
 */
import type { JSX } from 'react'
import type { AiIconName } from '@/services/ai/prompts'
import {
  IconArchive,
  IconBook,
  IconChart,
  IconComment,
  IconDocument,
  IconEdit,
  IconImage,
  IconSettings,
  IconSparkle,
} from '@/components/common/Icon'

const AI_OPTION_ICONS: Record<AiIconName, JSX.Element> = {
  document: <IconDocument size={14} />,
  comment: <IconComment size={14} />,
  settings: <IconSettings size={14} />,
  image: <IconImage size={14} />,
  book: <IconBook size={14} />,
  sparkle: <IconSparkle size={14} />,
  edit: <IconEdit size={14} />,
  chart: <IconChart size={14} />,
  archive: <IconArchive size={14} />,
}

export function AiOptionIcon({ name }: { name: AiIconName }): JSX.Element {
  return AI_OPTION_ICONS[name]
}