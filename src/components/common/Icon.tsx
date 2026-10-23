/**
 * 单色线性图标库（语雀风格）。
 *
 * 为什么不用 emoji：emoji 在不同系统/字体下渲染不一致、颜色无法跟随主题、
 * 无法做 hover/active 的状态变化，是界面"毛坯房感"的最大来源。
 *
 * 统一约定（保持一致，是图标体系的关键）：
 * - 24×24 视口，stroke-width 1.5，`stroke: currentColor` 随主题/状态变色
 * - 只用 stroke，不填色，圆角端点（round）让线条更柔和
 * - 所有路径坐标落在 2–22 的安全区内，避免贴边裁切
 */
import type { JSX, ReactNode, SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  /** 图标边长（px），默认 20 */
  size?: number
  /** 描边宽度，默认 1.5 */
  strokeWidth?: number
}

function Icon({
  size = 20,
  strokeWidth = 1.5,
  children,
  ...rest
}: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/* ---------- 基础 UI ---------- */
export const IconPlus = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
)

export const IconSearch = (p: IconProps): JSX.Element => (
  <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
)

export const IconClose = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
)

export const IconCheck = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Icon>
)

export const IconChevronDown = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M6 9.5l6 6 6-6" /></Icon>
)

export const IconChevronRight = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M9.5 6l6 6-6 6" /></Icon>
)

export const IconChevronLeft = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M14.5 6l-6 6 6 6" /></Icon>
)

export const IconMoreHorizontal = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconMenu = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>
)

export const IconSettings = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.36 5.64l-1.56 1.56M7.2 16.8l-1.56 1.56M18.36 18.36L16.8 16.8M7.2 7.2L5.64 5.64" />
  </Icon>
)

export const IconTrash = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.5 7l.8 12a1.2 1.2 0 0 0 1.2 1.1h7a1.2 1.2 0 0 0 1.2-1.1L17.5 7" />
    <path d="M10.5 11v6M13.5 11v6" />
  </Icon>
)

export const IconEdit = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
    <path d="M14.5 6.5l3 3" />
  </Icon>
)

export const IconCopy = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
  </Icon>
)

/* ---------- 内容与导航 ---------- */
export const IconDocument = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Icon>
)

export const IconBook = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5A1.5 1.5 0 0 0 20 18.5z" />
    <path d="M12 4v16" />
  </Icon>
)

export const IconFolder = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2.4h8.8A1.5 1.5 0 0 1 21 9.9V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
  </Icon>
)

export const IconStar = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1.99 5.79L12 16.9l-5.19 2.73.99-5.79-4.2-4.1 5.8-.85z" />
  </Icon>
)

export const IconStarFilled = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path
      d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1.99 5.79L12 16.9l-5.19 2.73.99-5.79-4.2-4.1 5.8-.85z"
      fill="currentColor"
    />
  </Icon>
)

export const IconClock = (p: IconProps): JSX.Element => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>
)

export const IconTag = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M3.5 11.2V5a1.5 1.5 0 0 1 1.5-1.5h6.2a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-6.2 6.2a1.5 1.5 0 0 1-2.12 0l-7.3-7.3a1.5 1.5 0 0 1-.44-1.06z" />
    <circle cx="8" cy="8" r="1.4" />
  </Icon>
)

export const IconLightbulb = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M9.2 17.5a6 6 0 1 1 5.6 0" />
    <path d="M9.5 17.5v2h5v-2" />
    <path d="M10 21h4" />
  </Icon>
)

export const IconChart = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 20h16" />
    <path d="M7 20V11M12 20V5M17 20v-6" />
  </Icon>
)

export const IconLink = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.54 3.54 0 0 0-5-5l-1.5 1.5" />
    <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.54 3.54 0 0 0 5 5l1.5-1.5" />
  </Icon>
)

export const IconDownload = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 4v10M8 10.5l4 4 4-4" />
    <path d="M4.5 17.5v1A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </Icon>
)

export const IconUpload = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 16V6M8 9.5l4-4 4 4" />
    <path d="M4.5 17.5v1A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-1" />
  </Icon>
)

export const IconHome = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" />
    <path d="M9.5 20.5v-6h5v6" />
  </Icon>
)

export const IconLayers = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
    <path d="M3.5 12.5L12 17l8.5-4.5" />
    <path d="M3.5 16.5L12 21l8.5-4.5" />
  </Icon>
)

export const IconComment = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M20 12.5A7.5 7.5 0 0 1 12.5 20H5.5L3 22V12.5A7.5 7.5 0 0 1 12.5 5h0A7.5 7.5 0 0 1 20 12.5z" />
  </Icon>
)

export const IconSun = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </Icon>
)

export const IconMoon = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5z" />
  </Icon>
)

export const IconUndo = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H9" />
    <path d="M7.5 5.5L4 9l3.5 3.5" />
  </Icon>
)

export const IconRedo = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M20 9h-9.5a5.5 5.5 0 0 0 0 11H15" />
    <path d="M16.5 5.5L20 9l-3.5 3.5" />
  </Icon>
)

export const IconTemplate = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M3.5 9h17M9 9v11.5" />
  </Icon>
)

export const IconSparkle = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L5.5 10l4.8-1.7z" />
    <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Icon>
)

export const IconUser = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Icon>
)

export const IconFilter = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z" />
  </Icon>
)

export const IconImage = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="8.75" cy="9.5" r="1.75" />
    <path d="M4 17l4.75-4.5 3.5 3.25L16 12l4 4.5" />
  </Icon>
)

export const IconInfo = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.75v.5" />
  </Icon>
)

export const IconWarning = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M12 4.2L21 19.5H3z" />
    <path d="M12 10v4M12 16.75v.5" />
  </Icon>
)

export const IconHistory = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
    <path d="M12 8v4.5l3 1.8" />
  </Icon>
)

export const IconPlay = (p: IconProps): JSX.Element => (
  <Icon {...p}><path d="M7 4.8v14.4l11.5-7.2z" /></Icon>
)

export const IconGlobe = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17" />
  </Icon>
)

export const IconPrinter = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M7 8.5V4h10v4.5" />
    <rect x="3.5" y="8.5" width="17" height="8" rx="1.5" />
    <path d="M7 14h10v5.5H7z" />
  </Icon>
)

export const IconArchive = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1" />
    <path d="M5 8.5v10A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-10" />
    <path d="M10 12h4" />
  </Icon>
)

export const IconMaximize = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Icon>
)

export const IconMinimize = (p: IconProps): JSX.Element => (
  <Icon {...p}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Icon>
)
