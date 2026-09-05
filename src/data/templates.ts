import type { Template, TemplateCategory } from '@/types/templates';

export const templates: Template[] = [
  // ========== 工作办公 ==========
  {
    id: 'weekly-report',
    name: '周报模板',
    description: '记录一周工作进展和下周计划',
    category: 'work',
    icon: '📊',
    content: `# 周报 - {week}

## 📋 本周完成
- [ ] 任务一
- [ ] 任务二
- [ ] 任务三

## 🎯 下周计划
- [ ] 计划一
- [ ] 计划二

## ⚠️ 风险与问题
- 问题一
- 问题二

## 💡 心得与建议
`,
    tags: ['工作', '周报'],
    usageCount: 156,
    createdAt: '2024-01-15',
  },
  {
    id: 'okr-template',
    name: 'OKR 目标管理',
    description: '设定和追踪目标与关键结果',
    category: 'work',
    icon: '🎯',
    content: `# OKR - {date}

## 🎯 O1: 目标一

### KR1: 关键结果一
- **当前进度**: 0%
- **目标值**: 
- **行动计划**:
  - [ ] 行动一
  - [ ] 行动二

### KR2: 关键结果二
- **当前进度**: 0%
- **目标值**: 
- **行动计划**:
  - [ ] 行动一
  - [ ] 行动二

## 🎯 O2: 目标二

### KR1: 关键结果一
- **当前进度**: 0%
- **目标值**: 

## 📊 本周进展
| 目标 | 进展 | 备注 |
|------|------|------|
| O1-KR1 | | |
| O1-KR2 | | |
| O2-KR1 | | |

## 💡 反思与调整
`,
    tags: ['OKR', '目标管理'],
    usageCount: 98,
    createdAt: '2024-02-01',
  },
  {
    id: 'daily-report',
    name: '日报模板',
    description: '简洁记录每日工作内容',
    category: 'work',
    icon: '📋',
    content: `# 工作日报 - {date}

## ✅ 今日完成
1. 
2. 
3. 

## 🔄 进行中
1. 
2. 

## 📅 明日计划
1. 
2. 

## 💬 备注
`,
    tags: ['工作', '日报'],
    usageCount: 203,
    createdAt: '2024-01-20',
  },
  {
    id: 'product-prd',
    name: '产品需求文档',
    description: '撰写产品需求和功能规格',
    category: 'work',
    icon: '📱',
    content: `# PRD: {projectName}

## 📋 基本信息
| 项目 | 内容 |
|------|------|
| 产品名称 | |
| 版本号 | v1.0.0 |
| 负责人 | |
| 创建日期 | {date} |
| 状态 | 草稿 |

## 🎯 背景与目标
### 业务背景
### 产品目标
### 核心指标

## 👥 目标用户
### 用户画像
### 使用场景

## 📝 功能需求
### 功能一: 
**优先级**: P0
**描述**: 
**用户故事**: 作为...，我希望...，以便...
**验收标准**:
- [ ] 标准一
- [ ] 标准二

### 功能二: 
**优先级**: P1
**描述**: 

## 🎨 交互设计
### 页面流程
### 原型链接

## ⚙️ 技术方案
### 架构设计
### 接口定义

## 📅 里程碑
| 阶段 | 时间 | 交付物 |
|------|------|--------|
| 需求评审 | | PRD文档 |
| 设计评审 | | 设计稿 |
| 开发完成 | | 功能上线 |

## ⚠️ 风险与依赖
`,
    tags: ['产品', '需求文档', 'PRD'],
    usageCount: 72,
    createdAt: '2024-02-05',
  },

  // ========== 会议协作 ==========
  {
    id: 'meeting-minutes',
    name: '会议纪要',
    description: '记录会议内容和决议事项',
    category: 'meeting',
    icon: '📝',
    content: `# {meetingName} 会议纪要

**时间**: {date}
**地点**: {location}
**主持人**: {host}
**参会人员**: 

## 📋 会议议程

### 1. 议题一
- 讨论内容
- 决议事项

### 2. 议题二
- 讨论内容
- 决议事项

## 🎯 行动项
| 任务 | 负责人 | 截止日期 | 状态 |
|------|--------|----------|------|
| 任务一 | 张三 | YYYY-MM-DD | 未开始 |

## 📌 下次会议
**时间**: 
**地点**: 
`,
    tags: ['会议', '记录'],
    usageCount: 89,
    createdAt: '2024-01-10',
  },
  {
    id: 'standup-meeting',
    name: '站会记录',
    description: '每日站会快速记录',
    category: 'meeting',
    icon: '🏃',
    content: `# 站会记录 - {date}

## 👥 参与人员

## 📊 各成员汇报

### 成员一
- **昨日完成**: 
- **今日计划**: 
- **遇到阻碍**: 无

### 成员二
- **昨日完成**: 
- **今日计划**: 
- **遇到阻碍**: 无

## ⚠️ 需要协调的事项
- 

## 📌 备注
`,
    tags: ['站会', '敏捷'],
    usageCount: 134,
    createdAt: '2024-01-12',
  },
  {
    id: 'retrospective',
    name: '复盘会议',
    description: '项目或迭代复盘总结',
    category: 'meeting',
    icon: '🔍',
    content: `# 复盘会议 - {date}

## 📋 复盘主题
**复盘周期**: 
**参与人员**: 

## ✅ 做得好的地方 (Keep)
1. 
2. 
3. 

## ❌ 需要改进的地方 (Problem)
1. 
2. 
3. 

## 💡 改进建议 (Try)
1. 
2. 
3. 

## 🎯 行动计划
| 改进项 | 负责人 | 截止日期 | 预期效果 |
|--------|--------|----------|----------|
| | | | |

## 📊 关键数据
| 指标 | 目标 | 实际 | 差异 |
|------|------|------|------|
| | | | |

## 💭 总结与感悟
`,
    tags: ['复盘', '改进'],
    usageCount: 67,
    createdAt: '2024-01-18',
  },

  // ========== 项目管理 ==========
  {
    id: 'project-plan',
    name: '项目计划',
    description: '规划项目目标、里程碑和资源',
    category: 'project',
    icon: '🎯',
    content: `# {projectName} 项目计划

## 📋 项目概述
**项目目标**: 
**背景说明**: 

## 🎯 核心目标
- 目标一
- 目标二

## 📅 里程碑
| 阶段 | 时间节点 | 交付物 | 负责人 |
|------|----------|--------|--------|
| 阶段一 | YYYY-MM-DD | 需求文档 | 张三 |
| 阶段二 | YYYY-MM-DD | 设计稿 | 李四 |
| 阶段三 | YYYY-MM-DD | 开发完成 | 王五 |

## 📊 资源需求
- 人力: 
- 预算: 
- 工具: 

## ⚠️ 风险评估
| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
`,
    tags: ['项目', '计划'],
    usageCount: 67,
    createdAt: '2024-01-08',
  },
  {
    id: 'brainstorm',
    name: '头脑风暴',
    description: '收集创意和想法',
    category: 'project',
    icon: '💡',
    content: `# {topic} 头脑风暴

## 🎯 目标
本次头脑风暴的目标是...

## 💡 创意收集
- [ ] 想法一
- [ ] 想法二
- [ ] 想法三
- [ ] 想法四

## 🔝 最佳方案
经过讨论，最佳方案是...

## 📋 下一步行动
- [ ] 行动一
- [ ] 行动二
`,
    tags: ['创意', '协作'],
    usageCount: 78,
    createdAt: '2024-01-02',
  },
  {
    id: 'tech-design',
    name: '技术方案设计',
    description: '撰写技术架构和实现方案',
    category: 'project',
    icon: '⚙️',
    content: `# 技术方案: {projectName}

## 📋 基本信息
| 项目 | 内容 |
|------|------|
| 需求来源 | |
| 技术负责人 | |
| 评审状态 | 待评审 |

## 🎯 背景与目标
### 业务背景
### 技术目标
### 性能指标

## 🏗️ 架构设计
### 整体架构
### 模块划分
### 数据流

## 📊 数据库设计
### 表结构
### 索引设计

## 🔌 接口设计
### API 列表
| 接口 | 方法 | 描述 |
|------|------|------|
| /api/xxx | GET | |

## ⚡ 性能优化
### 缓存策略
### 异步处理

## 🧪 测试方案
### 单元测试
### 集成测试

## 📅 开发计划
| 阶段 | 时间 | 内容 |
|------|------|------|
| | | |

## ⚠️ 风险与依赖
`,
    tags: ['技术', '架构'],
    usageCount: 45,
    createdAt: '2024-02-10',
  },

  // ========== 个人生活 ==========
  {
    id: 'daily-note',
    name: '每日笔记',
    description: '记录每日思考和待办事项',
    category: 'personal',
    icon: '📒',
    content: `# {date} 每日笔记

## 🌅 今日心情
- [ ] 开心 😊
- [ ] 平静 😐
- [ ] 疲惫 😩

## ✅ 今日完成
- [ ] 完成事项一
- [ ] 完成事项二

## 📝 待办清单
- [ ] 待办事项一
- [ ] 待办事项二

## 💭 今日思考
- 想法一
- 想法二

## 📚 学习收获
- 学习内容一
- 学习内容二
`,
    tags: ['个人', '日记'],
    usageCount: 234,
    createdAt: '2024-01-05',
  },
  {
    id: 'travel-plan',
    name: '旅行计划',
    description: '规划旅行行程和预算',
    category: 'personal',
    icon: '✈️',
    content: `# {destination} 旅行计划

**旅行时间**: {startDate} - {endDate}
**同行人员**: 

## 📅 行程安排

### Day 1
- 上午: 
- 下午: 
- 晚上: 

### Day 2
- 上午: 
- 下午: 
- 晚上: 

## 🏨 住宿安排
| 日期 | 酒店 | 地址 | 价格 |
|------|------|------|------|

## 💰 预算预估
| 项目 | 金额 |
|------|------|
| 交通 | |
| 住宿 | |
| 餐饮 | |
| 门票 | |
| **总计** | |

## 📝 注意事项
- 注意事项一
- 注意事项二
`,
    tags: ['旅行', '计划'],
    usageCount: 56,
    createdAt: '2024-01-01',
  },
  {
    id: 'habit-tracker',
    name: '习惯打卡',
    description: '追踪每日习惯养成',
    category: 'personal',
    icon: '✅',
    content: `# 习惯打卡 - {date}

## 🎯 本月目标
养成以下习惯，坚持打卡！

## 📊 打卡记录

| 习惯 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 完成率 |
|------|---|---|---|---|---|---|---|--------|
| 早起 | | | | | | | | |
| 运动 | | | | | | | | |
| 阅读 | | | | | | | | |
| 冥想 | | | | | | | | |

## 💪 本周总结
### 做得好
- 

### 需改进
- 

## 🏆 成就解锁
- [ ] 连续7天打卡
- [ ] 连续21天打卡
- [ ] 连续30天打卡

## 💭 心得体会
`,
    tags: ['习惯', '打卡', '自律'],
    usageCount: 89,
    createdAt: '2024-02-08',
  },

  // ========== 学习教育 ==========
  {
    id: 'book-summary',
    name: '读书笔记',
    description: '记录阅读收获和心得',
    category: 'education',
    icon: '📚',
    content: `# 《{bookName}》读书笔记

**作者**: 
**出版社**: 
**阅读时间**: 

## 📖 内容概要
本书主要讲述了...

## 💡 核心观点
1. 观点一
2. 观点二
3. 观点三

## 📝 精彩摘录
> 精彩语句摘录...

## 🔍 我的思考
- 思考一
- 思考二

## 🎯 行动清单
- [ ] 行动一
- [ ] 行动二
`,
    tags: ['阅读', '学习'],
    usageCount: 145,
    createdAt: '2024-01-03',
  },
  {
    id: 'interview-prep',
    name: '面试准备',
    description: '整理面试问题和答案',
    category: 'education',
    icon: '💼',
    content: `# {company} 面试准备

**面试岗位**: 
**面试时间**: 
**面试地点**: 

## 📋 公司背景
- 公司简介
- 业务范围
- 企业文化

## ❓ 常见问题
| 问题 | 答案要点 |
|------|----------|
| 自我介绍 | 核心技能、项目经验、职业规划 |
| 职业规划 | 短期目标、长期愿景 |
| 优缺点 | 优点具体事例、改进措施 |

## 📝 准备提问
- 问题一
- 问题二
- 问题三

## 🔗 参考资料
- [资料链接一]()
- [资料链接二]()
`,
    tags: ['面试', '职业'],
    usageCount: 92,
    createdAt: '2023-12-28',
  },
  {
    id: 'learning-notes',
    name: '学习笔记',
    description: '系统记录学习内容和心得',
    category: 'education',
    icon: '🎓',
    content: `# 学习笔记: {topic}

## 📋 学习目标
- 目标一
- 目标二

## 📚 学习资源
- [课程/书籍名称]()
- [参考文档]()

## 📝 知识要点

### 第一章: 
**核心概念**:
- 

**关键代码/公式**:
\`\`\`
\`\`\`

**我的理解**:
- 

### 第二章: 
**核心概念**:
- 

## 💡 重点难点
| 难点 | 理解程度 | 备注 |
|------|----------|------|
| | ⭐⭐⭐ | |

## 🔗 知识图谱
\`\`\`
概念A → 概念B → 概念C
         ↓
       概念D
\`\`\`

## ✅ 练习题
- [ ] 题目一
- [ ] 题目二

## 📅 学习计划
| 日期 | 内容 | 状态 |
|------|------|------|
| | | |

## 💭 总结与反思
`,
    tags: ['学习', '笔记'],
    usageCount: 112,
    createdAt: '2024-02-12',
  },
];

export const templateCategories: TemplateCategory[] = [
  {
    id: 'work',
    name: '工作办公',
    icon: '💼',
    templates: templates.filter(t => t.category === 'work'),
  },
  {
    id: 'meeting',
    name: '会议协作',
    icon: '🤝',
    templates: templates.filter(t => t.category === 'meeting'),
  },
  {
    id: 'project',
    name: '项目管理',
    icon: '📁',
    templates: templates.filter(t => t.category === 'project'),
  },
  {
    id: 'personal',
    name: '个人生活',
    icon: '👤',
    templates: templates.filter(t => t.category === 'personal'),
  },
  {
    id: 'education',
    name: '学习教育',
    icon: '📚',
    templates: templates.filter(t => t.category === 'education'),
  },
];

export const getTemplatesByCategory = (categoryId: string): Template[] => {
  return templates.filter(t => t.category === categoryId);
};

export const searchTemplates = (query: string): Template[] => {
  const lowerQuery = query.toLowerCase();
  return templates.filter(
    t => t.name.toLowerCase().includes(lowerQuery) || 
         t.description.toLowerCase().includes(lowerQuery) ||
         t.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
};

export const getTemplateById = (id: string): Template | undefined => {
  return templates.find(t => t.id === id);
};
