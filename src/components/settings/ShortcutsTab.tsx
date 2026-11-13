import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useNotesStore } from '@/store';
import { modKey } from '@/utils/platform';
import { eventToKeys, formatKeyLabel, matchesKeys } from '@/utils/shortcuts';
import { confirmAction } from '@/hooks/useConfirmAction';
import { toast } from '@/services/toast';
import type { KeyboardShortcut } from '@/store/slices/keyboardSlice';

/**
 * 快捷键设置：查看 + 录制自定义 + 恢复默认。
 *
 * 背景：keyboardSlice 早就提供了 updateShortcut/resetShortcuts 与 localStorage 持久化，
 * 但设置页只渲染只读列表 —— 「可自定义快捷键」这条能力在 UI 上完全不可达。
 *
 * 两个刻意的约束：
 * 1. **固定键位不提供录制入口**（shortcut.fixed）：find/replace 与行编辑类在编辑器里
 *    是硬编码分支，不读注册表；让用户改它们只会得到「改了没反应」的死设置。
 * 2. **录制期间用 capture 阶段拦截按键**：否则 Ctrl+K 之类会先被全局 useKeyboard
 *    执行（打开搜索面板），用户根本录不进去。Esc 只取消录制，不关设置面板。
 */

/** 键位展示：默认表用 'Ctrl'，录制产出用 'ctrl'，统一小写后再判断平台修饰键 */
function renderKeys(keys: string[]): JSX.Element {
  return (
    <span className="settings-shortcut-keys">
      {keys.map((key, i) => (
        <span key={`${key}-${i}`}>
          <kbd>{key.toLowerCase() === 'ctrl' ? modKey : formatKeyLabel(key)}</kbd>
          {i < keys.length - 1 && <span>+</span>}
        </span>
      ))}
    </span>
  );
}

export default function ShortcutsTab(): JSX.Element {
  const shortcuts = useNotesStore((s) => s.shortcuts);
  const customShortcuts = useNotesStore((s) => s.customShortcuts);
  const updateShortcut = useNotesStore((s) => s.updateShortcut);
  const resetShortcut = useNotesStore((s) => s.resetShortcut);
  const resetShortcuts = useNotesStore((s) => s.resetShortcuts);

  /** 正在录制的动作 id；null 表示未录制 */
  const [recordingId, setRecordingId] = useState<string | null>(null);
  /** 冲突/无效提示（录制失败时留在界面上，而不是静默丢弃） */
  const [hint, setHint] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, KeyboardShortcut[]>();
    shortcuts.forEach((s) => {
      map.set(s.category, [...(map.get(s.category) ?? []), s]);
    });
    return [...map.entries()].map(([category, items]) => ({ category, items }));
  }, [shortcuts]);

  const customCount = Object.keys(customShortcuts).length;

  const stopRecording = useCallback((): void => {
    setRecordingId(null);
  }, []);

  const startRecording = useCallback((id: string): void => {
    setHint(null);
    setRecordingId(id);
  }, []);

  // 录制监听：capture 阶段抢在全局快捷键之前，录完/取消即卸载
  useEffect(() => {
    if (!recordingId) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // 先占住这次按键：全局 useKeyboard 在 bubble 阶段，不能被它先执行
      e.preventDefault();
      e.stopImmediatePropagation();

      if (e.key === 'Escape') {
        setRecordingId(null);
        setHint(null);
        return;
      }

      const combo = eventToKeys(e);
      // 只按了修饰键：继续等待主键，不结束录制
      if (combo.length === 0) return;

      const state = useNotesStore.getState();
      const conflict = state.shortcuts.find(
        (s) => s.id !== recordingId && matchesKeys(combo, s.keys),
      );
      if (conflict) {
        setHint(`该组合已被「${conflict.name}」占用，请换一个（Esc 取消）`);
        return;
      }

      updateShortcut(recordingId, combo);
      setRecordingId(null);
      setHint(null);
      toast.success('快捷键已更新');
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingId, updateShortcut]);

  // 面板卸载/切页签时不留悬挂的录制态
  useEffect(() => () => setRecordingId(null), []);

  const handleResetAll = useCallback((): void => {
    confirmAction({
      title: '恢复全部默认快捷键',
      message: `将清除 ${customCount} 项自定义键位，恢复为出厂设置。是否继续？`,
      confirmText: '恢复默认',
      onConfirm: () => {
        resetShortcuts();
        setHint(null);
        toast.success('已恢复默认快捷键');
      },
    });
  }, [customCount, resetShortcuts]);

  return (
    <div className="settings-section">
      <div className="settings-shortcuts-header">
        <h3 className="settings-section-title">快捷键</h3>
        <button
          type="button"
          className="settings-shortcut-reset-all"
          onClick={handleResetAll}
          disabled={customCount === 0}
          title={customCount === 0 ? '当前没有自定义键位' : '清除全部自定义键位'}
        >
          全部恢复默认
        </button>
      </div>
      <p className="settings-section-desc">
        点「录制」后按下新的组合键即可修改；Esc 取消。标注「固定」的键位由编辑器内置处理，暂不支持修改。
      </p>
      {hint && (
        <p className="settings-shortcut-hint" role="alert">{hint}</p>
      )}
      <div className="settings-shortcuts-list">
        {groups.map((group) => (
          <div key={group.category} className="settings-shortcut-group">
            <h4 className="settings-shortcut-group-title">{group.category}</h4>
            {group.items.map((item) => {
              const isCustom = customShortcuts[item.id] !== undefined;
              const isRecording = recordingId === item.id;
              return (
                <div key={item.id} className="settings-shortcut-item">
                  <span className="settings-shortcut-desc">
                    {item.name}
                    {isCustom && <em className="settings-shortcut-badge">已自定义</em>}
                  </span>
                  <span className="settings-shortcut-controls">
                    {isRecording ? (
                      <span className="settings-shortcut-recording" role="status">
                        请按下新组合键…（Esc 取消）
                      </span>
                    ) : (
                      renderKeys(item.keys)
                    )}
                    {item.fixed ? (
                      <span
                        className="settings-shortcut-fixed"
                        title="该键位由编辑器内置处理，暂不支持自定义"
                      >
                        固定
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="settings-shortcut-btn"
                          onClick={() => (isRecording ? stopRecording() : startRecording(item.id))}
                          aria-label={`录制「${item.name}」的快捷键`}
                        >
                          {isRecording ? '取消' : '录制'}
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            className="settings-shortcut-btn"
                            onClick={() => {
                              resetShortcut(item.id);
                              setHint(null);
                            }}
                            aria-label={`恢复「${item.name}」的默认快捷键`}
                          >
                            恢复
                          </button>
                        )}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}