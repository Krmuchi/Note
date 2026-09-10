/**
 * 快捷键匹配工具：全局快捷键与编辑器内快捷键共用同一套解析/匹配逻辑，
 * 避免 key 归一化与修饰键顺序在多处实现产生漂移。
 */

/** 键盘事件的最小结构（兼容原生 KeyboardEvent 与 React 合成事件） */
export interface KeyComboSource {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta']);

const normalize = (key: string): string => key.trim().toLowerCase();

/** 将键盘事件转换为规范化的按键组合（如 ['ctrl', 'shift', 'n']）；单独按下修饰键返回空 */
export function eventToKeys(e: KeyComboSource): string[] {
  const key = e.key.toLowerCase();
  if (MODIFIER_KEYS.has(key)) return [];

  const keys: string[] = [];
  if (e.ctrlKey || e.metaKey) keys.push('ctrl');
  if (e.shiftKey) keys.push('shift');
  if (e.altKey) keys.push('alt');
  keys.push(normalize(key));
  return keys;
}

/** 判断事件按键组合是否与快捷键配置完全匹配（顺序无关） */
export function matchesKeys(eventKeys: string[], shortcutKeys: string[]): boolean {
  if (!Array.isArray(shortcutKeys) || shortcutKeys.length === 0) return false;
  return [...eventKeys].sort().join('+') === [...shortcutKeys.map(normalize)].sort().join('+');
}

/** 在快捷键表中查找命中的动作 id，未命中返回 null */
export function findShortcutId(
  shortcuts: readonly { id: string; keys: string[] }[],
  eventKeys: string[],
): string | null {
  for (const shortcut of shortcuts) {
    if (matchesKeys(eventKeys, shortcut.keys)) return shortcut.id;
  }
  return null;
}
