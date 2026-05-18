// 导入 React 核心模块和 hooks
import React, { useState, useCallback } from "react";

/**
 * 可折叠面板属性接口
 */
export interface CollapsibleProps {
  title: string;              // 标题文本
  defaultExpanded?: boolean;  // 默认是否展开（默认 false）
  children: React.ReactNode;  // 子内容
  className?: string;         // 自定义样式类名
  icon?: string;              // 自定义图标
}

/**
 * 可折叠面板组件
 */
export function Collapsible({ title, defaultExpanded = false, children, className, icon }: CollapsibleProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded); // 展开状态

  // 切换展开/折叠状态
  const toggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  return (
    <div className={`collapsible-container ${className || ""}`}>
      <button
        className={`collapsible-header ${isExpanded ? "expanded" : ""}`}
        onClick={toggle}
      >
        <span className="collapsible-icon">
          {isExpanded ? "▼" : "▶"}
        </span>
        {icon && <span className="collapsible-custom-icon">{icon}</span>}
        <span className="collapsible-title">{title}</span>
      </button>
      <div className={`collapsible-content ${isExpanded ? "expanded" : "collapsed"}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * 手风琴单项属性接口
 */
export interface AccordionItemProps {
  title: string;             // 标题文本
  children: React.ReactNode; // 子内容
  icon?: string;             // 自定义图标
}

/**
 * 手风琴组件属性接口
 */
export interface AccordionProps {
  items: AccordionItemProps[]; // 手风琴项列表
  defaultOpenIndex?: number;   // 默认打开的索引（默认 -1，即都关闭）
  allowMultipleOpen?: boolean; // 是否允许多项同时打开（默认 false）
}

/**
 * 手风琴组件
 */
export function Accordion({ items, defaultOpenIndex = -1, allowMultipleOpen = false }: AccordionProps) {
  const [openIndices, setOpenIndices] = useState<number[]>(
    defaultOpenIndex >= 0 ? [defaultOpenIndex] : []
  );

  // 切换指定项的展开状态
  const toggleItem = useCallback((index: number) => {
    setOpenIndices((prev) => {
      if (allowMultipleOpen) {
        // 允许多开模式：切换当前项状态
        if (prev.includes(index)) {
          return prev.filter((i) => i !== index);
        }
        return [...prev, index];
      }
      // 单开模式：只保留当前项或全部关闭
      return prev.includes(index) ? [] : [index];
    });
  }, [allowMultipleOpen]);

  return (
    <div className="accordion-container">
      {items.map((item, index) => (
        <div key={index} className="accordion-item">
          <button
            className={`accordion-header ${openIndices.includes(index) ? "expanded" : ""}`}
            onClick={() => toggleItem(index)}
          >
            <span className="accordion-icon">
              {openIndices.includes(index) ? "▼" : "▶"}
            </span>
            {item.icon && <span className="accordion-custom-icon">{item.icon}</span>}
            <span className="accordion-title">{item.title}</span>
          </button>
          <div className={`accordion-content ${openIndices.includes(index) ? "expanded" : "collapsed"}`}>
            {item.children}
          </div>
        </div>
      ))}
    </div>
  );
}