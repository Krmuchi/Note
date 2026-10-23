import { useState, useRef, useEffect, type RefObject } from 'react';
import type { ColorTab } from '@/components/editor/EditorHeaderColorPicker';

/**
 * EditorHeader 各下拉菜单的开关状态、对应 ref 与「点击外部关闭」逻辑。
 * 从 EditorHeader.tsx 纯拆分而来：原有的单一 document mousedown 监听被完整保留，
 * 因此菜单关闭顺序（尤其颜色选择器触发按钮的特例）与拆分前逐行一致。
 * colorTriggerRefs 由调用方（EditorHeader）创建并传入，仅在此处读取。
 */
export const useEditorHeaderMenus = (
  colorTriggerRefs: RefObject<(HTMLButtonElement | null)[]>,
): {
  showHeadingMenu: boolean;
  setShowHeadingMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showFontSizeMenu: boolean;
  setShowFontSizeMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showAlignMenu: boolean;
  setShowAlignMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showListMenu: boolean;
  setShowListMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showColorPicker: ColorTab | null;
  setShowColorPicker: React.Dispatch<React.SetStateAction<ColorTab | null>>;
  showMoreMenu: boolean;
  setShowMoreMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showAddMenu: boolean;
  setShowAddMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showTableMenu: boolean;
  setShowTableMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showCodeLangMenu: boolean;
  setShowCodeLangMenu: React.Dispatch<React.SetStateAction<boolean>>;
  moreMenuRef: React.RefObject<HTMLDivElement | null>;
  headingMenuRef: React.RefObject<HTMLDivElement | null>;
  fontSizeMenuRef: React.RefObject<HTMLDivElement | null>;
  alignMenuRef: React.RefObject<HTMLDivElement | null>;
  listMenuRef: React.RefObject<HTMLDivElement | null>;
  colorPickerRef: React.RefObject<HTMLDivElement | null>;
  addMenuRef: React.RefObject<HTMLDivElement | null>;
  tableMenuRef: React.RefObject<HTMLDivElement | null>;
  codeLangMenuRef: React.RefObject<HTMLDivElement | null>;
} => {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showListMenu, setShowListMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState<ColorTab | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [showCodeLangMenu, setShowCodeLangMenu] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const fontSizeMenuRef = useRef<HTMLDivElement>(null);
  const alignMenuRef = useRef<HTMLDivElement>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const tableMenuRef = useRef<HTMLDivElement>(null);
  const codeLangMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node;
      const insideColorTrigger = colorTriggerRefs.current.some(el => el && el.contains(target));
      if (headingMenuRef.current && !headingMenuRef.current.contains(target)) setShowHeadingMenu(false);
      if (fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(target)) setShowFontSizeMenu(false);
      if (alignMenuRef.current && !alignMenuRef.current.contains(target)) setShowAlignMenu(false);
      if (listMenuRef.current && !listMenuRef.current.contains(target)) setShowListMenu(false);
      if (colorPickerRef.current && !colorPickerRef.current.contains(target) && !insideColorTrigger) setShowColorPicker(null);
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) setShowMoreMenu(false);
      if (addMenuRef.current && !addMenuRef.current.contains(target)) setShowAddMenu(false);
      if (tableMenuRef.current && !tableMenuRef.current.contains(target)) setShowTableMenu(false);
      if (codeLangMenuRef.current && !codeLangMenuRef.current.contains(target)) setShowCodeLangMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // colorTriggerRefs 由父级 useRef 创建，引用终身稳定，等价于原先的空依赖
  }, [colorTriggerRefs]);

  return {
    showHeadingMenu,
    setShowHeadingMenu,
    showFontSizeMenu,
    setShowFontSizeMenu,
    showAlignMenu,
    setShowAlignMenu,
    showListMenu,
    setShowListMenu,
    showColorPicker,
    setShowColorPicker,
    showMoreMenu,
    setShowMoreMenu,
    showAddMenu,
    setShowAddMenu,
    showTableMenu,
    setShowTableMenu,
    showCodeLangMenu,
    setShowCodeLangMenu,
    moreMenuRef,
    headingMenuRef,
    fontSizeMenuRef,
    alignMenuRef,
    listMenuRef,
    colorPickerRef,
    addMenuRef,
    tableMenuRef,
    codeLangMenuRef,
  };
};