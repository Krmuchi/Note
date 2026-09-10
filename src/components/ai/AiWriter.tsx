import { useState, useCallback, useRef, useEffect } from 'react';

interface AiWriterProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (title: string, content: string) => void;
}

type WritingStyle = 'formal' | 'casual' | 'technical' | 'creative' | 'academic';
type WritingLength = 'short' | 'medium' | 'long';

interface WritingConfig {
  topic: string;
  style: WritingStyle;
  length: WritingLength;
  includeOutline: boolean;
  includeExamples: boolean;
}

const STYLE_OPTIONS: { value: WritingStyle; label: string; icon: string; description: string }[] = [
  { value: 'formal', label: '正式', icon: '📄', description: '适合商务、工作场景' },
  { value: 'casual', label: '轻松', icon: '😊', description: '适合日常、随笔记录' },
  { value: 'technical', label: '技术', icon: '💻', description: '适合技术文档、教程' },
  { value: 'creative', label: '创意', icon: '🎨', description: '适合创意写作、故事' },
  { value: 'academic', label: '学术', icon: '🎓', description: '适合论文、研究报告' },
];

const LENGTH_OPTIONS: { value: WritingLength; label: string; description: string }[] = [
  { value: 'short', label: '简短', description: '约 200-400 字' },
  { value: 'medium', label: '中等', description: '约 500-800 字' },
  { value: 'long', label: '详细', description: '约 1000-1500 字' },
];

/**
 * AI 写作助手内容生成器
 * 根据用户输入的主题、风格和长度生成结构化的文档内容
 */
function generateContent(config: WritingConfig): { title: string; content: string } {
  const { topic, style, length, includeOutline, includeExamples } = config;

  // 根据风格生成不同的内容模板
  const styleTemplates: Record<WritingStyle, (topic: string) => string> = {
    formal: (topic) => generateFormalContent(topic, length, includeOutline, includeExamples),
    casual: (topic) => generateCasualContent(topic, length, includeOutline, includeExamples),
    technical: (topic) => generateTechnicalContent(topic, length, includeOutline, includeExamples),
    creative: (topic) => generateCreativeContent(topic, length, includeOutline, includeExamples),
    academic: (topic) => generateAcademicContent(topic, length, includeOutline, includeExamples),
  };

  const content = styleTemplates[style](topic);
  const title = `${topic} - ${STYLE_OPTIONS.find(s => s.value === style)?.label || ''}文档`;

  return { title, content };
}

/**
 * 生成正式风格内容
 */
function generateFormalContent(topic: string, length: WritingLength, includeOutline: boolean, includeExamples: boolean): string {
  const sectionCount = length === 'short' ? 3 : length === 'medium' ? 5 : 7;
  const paragraphsPerSection = length === 'short' ? 1 : length === 'medium' ? 2 : 3;

  let content = `# ${topic}\n\n`;
  content += `**文档类型**: 正式文档\n`;
  content += `**创建时间**: ${new Date().toLocaleDateString('zh-CN')}\n\n`;

  if (includeOutline) {
    content += `## 📋 文档大纲\n\n`;
    for (let i = 1; i <= sectionCount; i++) {
      content += `${i}. 第${i}节内容\n`;
    }
    content += `\n---\n\n`;
  }

  content += `## 引言\n\n`;
  content += `${topic}是一个重要的主题，本文将从多个角度进行分析和探讨。`;
  content += `通过对相关资料的研究和整理，我们希望能够为读者提供全面、准确的信息。\n\n`;

  for (let i = 1; i <= sectionCount; i++) {
    content += `## 第${i}节\n\n`;
    for (let j = 0; j < paragraphsPerSection; j++) {
      content += `本节将详细讨论${topic}的相关内容。通过对现有资料的分析和研究，`;
      content += `我们可以更好地理解这一主题的核心要点和实践方法。\n\n`;
    }

    if (includeExamples && i <= 2) {
      content += `### 示例\n\n`;
      content += `| 示例项 | 说明 |\n|--------|------|\n`;
      content += `| 示例一 | 这是一个具体的例子 |\n`;
      content += `| 示例二 | 这是另一个例子 |\n\n`;
    }
  }

  content += `## 总结\n\n`;
  content += `综上所述，${topic}是一个值得深入研究的领域。`;
  content += `通过本文的分析，我们可以得出以下结论：\n\n`;
  content += `1. 第一个结论\n`;
  content += `2. 第二个结论\n`;
  content += `3. 第三个结论\n\n`;
  content += `希望本文能够为读者提供有价值的参考和启示。\n`;

  return content;
}

/**
 * 生成轻松风格内容
 */
function generateCasualContent(topic: string, length: WritingLength, includeOutline: boolean, includeExamples: boolean): string {
  const sectionCount = length === 'short' ? 2 : length === 'medium' ? 4 : 6;

  let content = `# ${topic} 🎉\n\n`;
  content += `> 一篇轻松的随笔，聊聊${topic}那些事儿\n\n`;

  if (includeOutline) {
    content += `## 🗺️ 今天聊什么\n\n`;
    for (let i = 1; i <= sectionCount; i++) {
      content += `- ${['开场白', '核心观点', '有趣发现', '个人感受', '小贴士', '总结'][i - 1] || `第${i}部分`}\n`;
    }
    content += `\n---\n\n`;
  }

  content += `## 开场白\n\n`;
  content += `嘿！今天想和大家聊聊${topic}这个话题。\n`;
  content += `说实话，这个话题挺有意思的，让我们一起来看看吧！ 😄\n\n`;

  const sections = ['核心观点', '有趣发现', '个人感受', '小贴士', '深入探讨', '未来展望'];
  for (let i = 0; i < Math.min(sectionCount, sections.length); i++) {
    content += `## ${sections[i]}\n\n`;
    content += `说到${topic}，我觉得最有趣的一点是...\n\n`;
    content += `其实很多时候，我们对${topic}的理解可能和实际情况有些出入。\n`;
    content += `让我分享一下我的看法：\n\n`;
    content += `- 观点一：这是我的第一个想法\n`;
    content += `- 观点二：这是我的第二个想法\n`;
    content += `- 观点三：这是我的第三个想法\n\n`;

    if (includeExamples && i === 0) {
      content += `举个例子来说，就像我们平时遇到的...\n\n`;
    }
  }

  content += `## 总结\n\n`;
  content += `好啦，关于${topic}就聊到这里！\n`;
  content += `希望这篇文章对你有所帮助，如果有什么想法，欢迎一起讨论~ 😊\n`;

  return content;
}

/**
 * 生成技术风格内容
 */
function generateTechnicalContent(topic: string, length: WritingLength, includeOutline: boolean, includeExamples: boolean): string {
  const sectionCount = length === 'short' ? 3 : length === 'medium' ? 5 : 7;

  let content = `# ${topic} 技术文档\n\n`;
  content += `**版本**: 1.0.0  \n`;
  content += `**更新时间**: ${new Date().toLocaleDateString('zh-CN')}  \n`;
  content += `**状态**: 活跃\n\n`;

  if (includeOutline) {
    content += `## 📑 目录\n\n`;
    for (let i = 1; i <= sectionCount; i++) {
      content += `${i}. [第${i}节](#section-${i})\n`;
    }
    content += `\n---\n\n`;
  }

  content += `## 概述\n\n`;
  content += `本文档详细介绍${topic}的技术实现方案和最佳实践。\n\n`;
  content += `### 前置条件\n\n`;
  content += `- 基础知识要求\n`;
  content += `- 环境配置要求\n`;
  content += `- 相关工具准备\n\n`;

  const techSections = ['架构设计', '核心组件', '数据模型', '接口设计', '实现细节', '性能优化', '部署指南'];
  for (let i = 0; i < Math.min(sectionCount, techSections.length); i++) {
    content += `## ${techSections[i]}\n\n`;
    content += `### 核心概念\n\n`;
    content += `${topic}的${techSections[i]}主要包括以下几个方面：\n\n`;

    content += `#### 设计原则\n\n`;
    content += `1. **可扩展性**: 系统应该易于扩展和维护\n`;
    content += `2. **可测试性**: 代码应该易于测试\n`;
    content += `3. **可读性**: 代码应该清晰易懂\n\n`;

    if (includeExamples && i < 3) {
      content += `#### 代码示例\n\n`;
      content += `\`\`\`javascript\n`;
      content += `// ${techSections[i]}示例代码\n`;
      content += `const example = {\n`;
      content += `  // 配置项\n`;
      content += `  enabled: true,\n`;
      content += `  // 参数\n`;
      content += `  options: {\n`;
      content += `    timeout: 5000,\n`;
      content += `    retries: 3\n`;
      content += `  }\n`;
      content += `};\n`;
      content += `\`\`\`\n\n`;
    }
  }

  content += `## 最佳实践\n\n`;
  content += `### 性能优化\n\n`;
  content += `- 使用缓存减少重复计算\n`;
  content += `- 异步处理耗时操作\n`;
  content += `- 合理使用资源池\n\n`;

  content += `### 安全考虑\n\n`;
  content += `- 输入验证和过滤\n`;
  content += `- 权限控制\n`;
  content += `- 日志记录\n\n`;

  content += `## 总结\n\n`;
  content += `本文档涵盖了${topic}的主要技术要点。\n`;
  content += `如有疑问，请参考相关文档或联系技术支持。\n`;

  return content;
}

/**
 * 生成创意风格内容
 */
function generateCreativeContent(topic: string, length: WritingLength, includeOutline: boolean, includeExamples: boolean): string {
  const sectionCount = length === 'short' ? 2 : length === 'medium' ? 4 : 6;

  let content = `# ${topic} ✨\n\n`;
  content += `*一场关于${topic}的思维冒险*\n\n`;

  if (includeOutline) {
    content += `## 🌟 灵感地图\n\n`;
    for (let i = 1; i <= sectionCount; i++) {
      content += `${'🌟'.repeat(i)} ${['灵感闪现', '创意萌芽', '思维碰撞', '灵感绽放', '创意升华', '灵感永恒'][i - 1] || `第${i}章`}\n`;
    }
    content += `\n---\n\n`;
  }

  content += `## 💫 序章：灵感的种子\n\n`;
  content += `在某个平凡的瞬间，一个关于${topic}的想法悄然萌芽。\n`;
  content += `就像夜空中突然划过的流星，虽然短暂，却照亮了整个思维的天空。\n\n`;

  const creativeSections = ['第一章：探索', '第二章：发现', '第三章：创造', '第四章：蜕变', '第五章：升华', '第六章：永恒'];
  for (let i = 0; i < Math.min(sectionCount, creativeSections.length); i++) {
    content += `## ${creativeSections[i]}\n\n`;
    content += `### 🎭 情境\n\n`;
    content += `当思维的触角伸向${topic}的深处，我们发现了一个全新的世界。\n`;
    content += `那里充满了无限的可能性，等待着我们去探索和发现。\n\n`;

    content += `### 💡 启示\n\n`;
    content += `在这个过程中，我们领悟到：\n\n`;
    content += `- 🌈 每一个想法都有其独特的价值\n`;
    content += `- 🔮 创造力是连接现实与梦想的桥梁\n`;
    content += `- ✨ 真正的创新来自于对细节的关注\n\n`;

    if (includeExamples && i === 0) {
      content += `### 🎨 想象练习\n\n`;
      content += `试着闭上眼睛，想象${topic}的无限可能...\n`;
      content += `你会看到什么？感受到什么？\n\n`;
    }
  }

  content += `## 🌟 终章：创造的喜悦\n\n`;
  content += `当所有灵感汇聚成河，我们终于完成了这次思维的冒险。\n`;
  content += `${topic}不再只是一个概念，而是我们创造的一部分。\n\n`;
  content += `> "创造力不是天赋，而是一种可以培养的能力。"\n`;
  content += `> —— 佚名\n\n`;
  content += `愿每一个读者都能在${topic}中找到属于自己的灵感之光。 ✨\n`;

  return content;
}

/**
 * 生成学术风格内容
 */
function generateAcademicContent(topic: string, length: WritingLength, includeOutline: boolean, includeExamples: boolean): string {
  const sectionCount = length === 'short' ? 3 : length === 'medium' ? 5 : 7;

  let content = `# ${topic}：研究与分析\n\n`;
  content += `**摘要**: 本文对${topic}进行了系统性的研究和分析，探讨了其核心概念、发展现状及未来趋势。\n\n`;
  content += `**关键词**: ${topic}；研究分析；学术探讨\n\n`;

  if (includeOutline) {
    content += `## 📑 目录\n\n`;
    for (let i = 1; i <= sectionCount; i++) {
      content += `${i}. ${['引言', '文献综述', '研究方法', '研究结果', '讨论', '结论', '参考文献'][i - 1] || `第${i}节`}\n`;
    }
    content += `\n---\n\n`;
  }

  content += `## 1. 引言\n\n`;
  content += `${topic}作为当前研究领域的热点问题，引起了学术界的广泛关注。\n`;
  content += `本文旨在通过对现有研究的梳理和分析，探讨${topic}的核心问题和发展方向。\n\n`;

  content += `### 1.1 研究背景\n\n`;
  content += `随着社会的发展和科技的进步，${topic}的重要性日益凸显。\n`;
  content += `相关研究表明，${topic}在多个领域都具有重要的应用价值。\n\n`;

  content += `### 1.2 研究目的\n\n`;
  content += `本研究的主要目的是：\n\n`;
  content += `1. 梳理${topic}的相关理论和研究现状\n`;
  content += `2. 分析${topic}的核心问题和挑战\n`;
  content += `3. 探讨${topic}的未来发展趋势\n\n`;

  const academicSections = ['文献综述', '研究方法', '研究结果', '讨论与分析', '结论与建议', '研究局限', '未来展望'];
  for (let i = 0; i < Math.min(sectionCount - 2, academicSections.length); i++) {
    content += `## ${i + 2}. ${academicSections[i]}\n\n`;
    content += `${academicSections[i]}是本研究的重要组成部分。\n\n`;

    content += `### ${i + 2}.1 主要发现\n\n`;
    content += `通过对相关数据的分析，我们发现：\n\n`;
    content += `- 发现一：这一发现对${topic}的理解具有重要意义\n`;
    content += `- 发现二：这一发现揭示了${topic}的内在规律\n`;
    content += `- 发现三：这一发现为${topic}的实践提供了指导\n\n`;

    if (includeExamples && i < 2) {
      content += `### ${i + 2}.2 实证分析\n\n`;
      content += `表 ${i + 1}: ${academicSections[i]}数据分析\n\n`;
      content += `| 指标 | 数值 | 变化趋势 |\n|------|------|----------|\n`;
      content += `| 指标A | 85.6% | ↑ |\n`;
      content += `| 指标B | 72.3% | → |\n`;
      content += `| 指标C | 91.2% | ↑ |\n\n`;
    }
  }

  content += `## 结论\n\n`;
  content += `本研究通过对${topic}的系统分析，得出以下主要结论：\n\n`;
  content += `1. ${topic}在当前社会中具有重要的理论和实践价值\n`;
  content += `2. ${topic}的发展面临一些挑战，但也蕴含着巨大的机遇\n`;
  content += `3. 未来的研究应该关注${topic}的创新应用和可持续发展\n\n`;

  content += `## 参考文献\n\n`;
  content += `1. 张三. (2023). ${topic}研究综述. 学术期刊, 12(3), 45-67.\n`;
  content += `2. 李四. (2022). ${topic}的理论与实践. 出版社.\n`;
  content += `3. Wang, L. (2023). Analysis of ${topic}. Journal of Research, 15(2), 123-145.\n`;

  return content;
}

/**
 * AI 写作助手组件
 */
export default function AiWriter({ isOpen, onClose, onInsert }: AiWriterProps): import('react').ReactElement | null {
  const [config, setConfig] = useState<WritingConfig>({
    topic: '',
    style: 'formal',
    length: 'medium',
    includeOutline: true,
    includeExamples: true,
  });
  const [generatedContent, setGeneratedContent] = useState<{ title: string; content: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generateTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleGenerate = useCallback(() => {
    if (!config.topic.trim()) return;

    setIsGenerating(true);
    // 模拟 AI 生成延迟（记录定时器 id，组件卸载后不再 setState）
    generateTimerRef.current = window.setTimeout(() => {
      const result = generateContent(config);
      setGeneratedContent(result);
      setShowResult(true);
      setIsGenerating(false);
      generateTimerRef.current = null;
    }, 1500);
  }, [config]);

  // 卸载时清理生成定时器
  useEffect(() => {
    return () => {
      if (generateTimerRef.current) {
        clearTimeout(generateTimerRef.current);
        generateTimerRef.current = null;
      }
    };
  }, []);

  const handleInsert = useCallback(() => {
    if (generatedContent) {
      onInsert(generatedContent.title, generatedContent.content);
      onClose();
    }
  }, [generatedContent, onInsert, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleReset = useCallback(() => {
    setConfig({
      topic: '',
      style: 'formal',
      length: 'medium',
      includeOutline: true,
      includeExamples: true,
    });
    setGeneratedContent(null);
    setShowResult(false);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="ai-writer-overlay" onClick={onClose}>
      <div className="ai-writer-panel" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* 头部 */}
        <div className="ai-writer-header">
          <div className="ai-writer-title">
            <span className="ai-icon">🤖</span>
            <h2>AI 帮你写</h2>
          </div>
          <button className="ai-writer-close" onClick={onClose}>✕</button>
        </div>

        {/* 主体内容 */}
        <div className="ai-writer-body">
          {!showResult ? (
            /* 配置面板 */
            <div className="ai-writer-config">
              {/* 主题输入 */}
              <div className="config-section">
                <label className="config-label">📝 写作主题</label>
                <textarea
                  ref={textareaRef}
                  className="topic-input"
                  value={config.topic}
                  onChange={(e) => setConfig(prev => ({ ...prev, topic: e.target.value }))}
                  placeholder="请输入你想写的主题，例如：&#10;- 如何提高工作效率&#10;- 产品需求文档&#10;- 旅行计划"
                  rows={4}
                />
              </div>

              {/* 写作风格 */}
              <div className="config-section">
                <label className="config-label">🎨 写作风格</label>
                <div className="style-options">
                  {STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`style-option ${config.style === option.value ? 'active' : ''}`}
                      onClick={() => setConfig(prev => ({ ...prev, style: option.value }))}
                    >
                      <span className="style-icon">{option.icon}</span>
                      <span className="style-label">{option.label}</span>
                      <span className="style-desc">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 内容长度 */}
              <div className="config-section">
                <label className="config-label">📏 内容长度</label>
                <div className="length-options">
                  {LENGTH_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`length-option ${config.length === option.value ? 'active' : ''}`}
                      onClick={() => setConfig(prev => ({ ...prev, length: option.value }))}
                    >
                      <span className="length-label">{option.label}</span>
                      <span className="length-desc">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 附加选项 */}
              <div className="config-section">
                <label className="config-label">⚙️ 附加选项</label>
                <div className="extra-options">
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={config.includeOutline}
                      onChange={(e) => setConfig(prev => ({ ...prev, includeOutline: e.target.checked }))}
                    />
                    <span>包含文档大纲</span>
                  </label>
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={config.includeExamples}
                      onChange={(e) => setConfig(prev => ({ ...prev, includeExamples: e.target.checked }))}
                    />
                    <span>包含示例内容</span>
                  </label>
                </div>
              </div>

              {/* 生成按钮 */}
              <button
                className={`generate-btn ${!config.topic.trim() ? 'disabled' : ''}`}
                onClick={handleGenerate}
                disabled={!config.topic.trim() || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span className="generating-spinner" />
                    正在生成...
                  </>
                ) : (
                  <>
                    ✨ 开始生成
                  </>
                )}
              </button>
            </div>
          ) : (
            /* 生成结果预览 */
            <div className="ai-writer-result">
              <div className="result-header">
                <h3>📄 生成结果</h3>
                <button className="back-btn" onClick={() => setShowResult(false)}>
                  ← 返回编辑
                </button>
              </div>

              <div className="result-preview">
                <div className="result-title">{generatedContent?.title}</div>
                <div className="result-content">
                  <pre className="result-text">{generatedContent?.content}</pre>
                </div>
              </div>

              <div className="result-actions">
                <button className="action-btn secondary" onClick={handleReset}>
                  重新生成
                </button>
                <button className="action-btn primary" onClick={handleInsert}>
                  📥 插入到文档
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
